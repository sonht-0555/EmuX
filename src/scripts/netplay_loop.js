/**
 * EmuX Netplay Engine (v6.25) - Deterministic Sync & Stability
 */

window.INPUT_DELAY = 4;
window.lastTime = performance.now();
window.accumulator = 0;
window.loopActive = false;

// Adaptive Delay State
window.pingHistory = [];
window.lastDelayAdjust = 0;

const FRAME_TIME = 1000 / 60;

function tryRunFrame() {
    const core = window.Module;
    if (!core?._retro_run) return false;

    const fId = window.currentFrame;

    // 🧹 Zombie Sweeper: Clear old frames from buffer (Essential for Jump/Sync stability)
    if (remoteInputBuffer.size > 10) { // Only sweep if buffer is getting crowded
        for (const k of remoteInputBuffer.keys()) {
            if (k < fId) remoteInputBuffer.delete(k);
        }
    }

    // 🚑 Rescue Logic (Survivor saves the Dead)
    if (stats.stalls > 120 && remoteInputBuffer.size > 0) {
        console.log("%c[Netplay] 🚑 Opponent recovered! Sending State Rescue...", "color: orange; font-weight: bold");
        const coreState = window.getCoreState ? window.getCoreState() : null;
        if (coreState) {
            connection.send({
                type: 'sync-state',
                state: coreState,
                frame: fId
            });

            // Pulse Send: Priming the peer's pipe
            const startF = fId;
            const endF = fId + window.INPUT_DELAY;
            for (let f = startF; f <= endF; f++) {
                if (localInputBuffer.has(f)) {
                    try {
                        connection.send({type: 'input', f: f, k: localInputBuffer.get(f)});
                    } catch (e) { }
                }
            }

            // Self-Alignment: Rollback survivor to match the state sent
            if (window.setCoreState) {
                window.setCoreState(coreState);
                window.accumulator = 0;
                window.lastTime = performance.now();
                window.isJustSynced = true;
            }
        }
        remoteInputBuffer.clear();
        stats.stalls = 0;
        window.needsStateSync = false;
    }

    // Local Input Backfill
    if (!localInputBuffer.has(fId)) {
        const mask = window.getGamepadMask ? window.getGamepadMask() : 0;
        localInputBuffer.set(fId, mask);
        sendInput(fId, mask);
    }

    const myMask = localInputBuffer.get(fId);
    let rMask;

    // 🎯 Input Mapping & Deterministic Prediction
    if (remoteInputBuffer.has(fId)) {
        rMask = remoteInputBuffer.get(fId);
        window.lastRemoteInput = rMask;
        window.consecutivePredictions = 0;
    } else {
        // CATCH-UP JUMP: If we are stuck but buffer has future data, JUMP forward!
        if (remoteInputBuffer.size > 0) {
            const oldestF = Math.min(...remoteInputBuffer.keys());
            if (oldestF > fId) {
                console.warn(`[Netplay] ⏩ Behind! Jumping from ${fId} to ${oldestF}`);
                window.currentFrame = oldestF;
                return false;
            }
        }

        window.consecutivePredictions = (window.consecutivePredictions || 0) + 1;
        if (window.consecutivePredictions > 1) { // Strict Lockstep
            stats.stalls++;
            if (stats.stalls % 60 === 0) {
                console.warn(`[Netplay] 🛑 Waiting for P2... (PPS: ${stats.pps_recv})`);
            }
            return false;
        }
        rMask = window.lastRemoteInput || 0;
        stats.predictions = (stats.predictions || 0) + 1;
    }
    remoteInputs[0] = isHost ? myMask : rMask;
    remoteInputs[1] = isHost ? rMask : myMask;

    try {
        core._retro_run();
    } catch (e) {
        console.error("[Netplay] WASM Core Panic:", e);
    }

    localInputBuffer.delete(fId);
    // Only delete remote header if it actually existed (not predicted)
    if (remoteInputBuffer.has(fId)) {
        remoteInputBuffer.delete(fId);
    }
    window.currentFrame++;

    return true;
}

function netplayLoop() {
    if (!window.isNetplaying || !connection?.open) {
        loopActive = false;
        return;
    }
    requestAnimationFrame(netplayLoop);

    // Sync Wait: Pause until buffer refills to target delay!
    if (window.isJustSynced) {
        // DEADLOCK FIX: Don't wait for full delay (because we can't generate future inputs while paused!)
        // Just wait for at least ONE packet to kickstart the loop.
        if (remoteInputBuffer.size === 0) {
            return; // Wait for at least 1 packet...
        }
        window.isJustSynced = false; // Buffer ready!
        window.lastTime = performance.now(); // Reset clock
        window.accumulator = 0;
        window.syncGraceFrames = 300; // Lock speed for 5s to stabilize rhythm
        console.log("%c[Netplay] 🟢 Buffer Kickstarted! Resuming game...", "color: lime");
    }

    const now = performance.now();
    let delta = now - window.lastTime;
    window.lastTime = now;

    // 🎯 Accurate Drift: High-precision frame distance calculation
    const drift = (stats.remoteFrameHead - window.currentFrame) - window.INPUT_DELAY;
    let timeScale = 1.0;

    // 3. Jitter Spike Absorber logic
    // Normal: Smooth correction (+-0.5%)
    // Spike: Pause correction (Absorb)
    // Excessive Lag (>20f): Aggressive Catch-up (Force 5% speed)
    if (window.syncGraceFrames > 0) {
        timeScale = 1.0; // Force strict 1.0x speed during grace period
        window.syncGraceFrames--;
    } else if (drift > 20) {
        timeScale = 1.02; // Heavy catch-up (limited to 2% for stability)
    } else if (drift < -10) {
        timeScale = 0.98; // Heavy slow-down to rebuild buffer
    } else if (!window.isJitterSpike) {
        if (drift > 0) timeScale = 1.005;
        else if (drift < 0) timeScale = 0.995;
    }

    window.accumulator += (delta * timeScale);
    if (window.accumulator > 100) window.accumulator = 100;

    let steps = 0;
    const MAX_STEPS = 2;

    while (window.accumulator >= FRAME_TIME && steps < MAX_STEPS) {
        window.accumulator -= FRAME_TIME;
        steps++;

        const targetFrame = window.currentFrame + window.INPUT_DELAY;
        if (!localInputBuffer.has(targetFrame)) {
            const mask = window.getGamepadMask ? window.getGamepadMask() : 0;
            localInputBuffer.set(targetFrame, mask);
            sendInput(targetFrame, mask);
        }

        if (!tryRunFrame()) {
            window.accumulator += FRAME_TIME;
            // Smart Audio Reset (only after 5s stall)
            if (stats.stalls % 300 === 0 && window.resetAudioSync) {
                window.resetAudioSync();
            }
            break;
        }
    }
}

async function startNetplayLoop() {
    if (window.loopActive) return;

    const calibratedDelay = await calibrateDelay();
    window.INPUT_DELAY = calibratedDelay;
    window._calHandler = null;

    connection.send({type: 'delay-sync', delay: window.INPUT_DELAY});
    console.log(`%c[Netplay] Engine Activated (Delay: ${window.INPUT_DELAY})`, "color: #00ff00; font-weight: bold;");

    stats.sent = 0; stats.received = 0; stats.stalls = 0; stats.predictions = 0;
    if (window.resetAudioSync) window.resetAudioSync();

    for (let i = 0; i <= window.INPUT_DELAY; i++) {
        if (!localInputBuffer.has(i)) {
            localInputBuffer.set(i, 0);
            sendInput(i, 0);
        }
    }

    window.lastTime = performance.now();
    window.accumulator = 0;
    window.loopActive = true;
    requestAnimationFrame(netplayLoop);

    if (window._monitorId) clearInterval(window._monitorId);
    window._monitorId = setInterval(() => {
        if (connection?.open) {
            stats.lastPingTime = performance.now();
            connection.send({type: 'ping', t: stats.lastPingTime});

            const now = performance.now();
            const dt = (now - stats.lastPPSReset) / 1000;
            stats.pps_sent = 0; stats.pps_recv = 0; stats.lastPPSReset = now;

            // --- Stability Engine (v6.25) ---
            window.pingHistory.push(stats.ping);
            if (window.pingHistory.length > 20) window.pingHistory.shift();
            const avgPing = window.pingHistory.reduce((a, b) => a + b, 0) / window.pingHistory.length;

            // 1. Panic Mode (Buffer Safety Margin Auto)
            if (stats.stalls - (window.lastStallCheck || 0) > 20) {
                if (window.INPUT_DELAY < 8) {
                    const oldDelay = window.INPUT_DELAY;
                    window.INPUT_DELAY = 8;
                    window.lastDelayAdjust = now;
                    connection.send({type: 'delay-sync', delay: window.INPUT_DELAY});
                    console.warn(`%c[Netplay] 🚨 PANIC MODE ACTIVATED! Delay set to 8`, "color: #ff0000; font-weight: bold; background: yellow;");

                    for (let i = oldDelay + 1; i <= window.INPUT_DELAY; i++) {
                        const frame = window.currentFrame + i;
                        if (!localInputBuffer.has(frame)) {
                            const mask = window.getGamepadMask ? window.getGamepadMask() : 0;
                            localInputBuffer.set(frame, mask);
                            sendInput(frame, mask);
                        }
                    }
                }
            }
            window.lastStallCheck = stats.stalls;

            // 2. Adaptive Delay (Normal)
            if ((now - window.lastDelayAdjust) > 5000) {
                if (avgPing > window.INPUT_DELAY * 18 && window.INPUT_DELAY < 8) {
                    const oldDelay = window.INPUT_DELAY;
                    window.INPUT_DELAY++;
                    window.lastDelayAdjust = now;
                    connection.send({type: 'delay-sync', delay: window.INPUT_DELAY});
                    console.log(`%c[Netplay] 🐌 Delay increased to ${window.INPUT_DELAY}`, "color: #ffaa00");

                    for (let i = oldDelay + 1; i <= window.INPUT_DELAY; i++) {
                        const frame = window.currentFrame + i;
                        if (!localInputBuffer.has(frame)) {
                            const mask = window.getGamepadMask ? window.getGamepadMask() : 0;
                            localInputBuffer.set(frame, mask);
                            sendInput(frame, mask);
                        }
                    }
                } else if (avgPing < window.INPUT_DELAY * 8 && window.INPUT_DELAY > 3) {
                    window.INPUT_DELAY--;
                    window.lastDelayAdjust = now;
                    connection.send({type: 'delay-sync', delay: window.INPUT_DELAY});
                    console.log(`%c[Netplay] 🚀 Delay decreased to ${window.INPUT_DELAY}`, "color: #00ff00");
                }
            }

            // 3. Jitter Spike Absorber
            window.isJitterSpike = (stats.ping > avgPing * 1.8 && stats.ping > 50);

            // 4. Accuracy Pulse: Force periodic sync (Every 40s if predictions occurred)
            if (isHost && stats.predictions > 0 && (now - (stats.lastPulseTime || 0)) > 40000) {
                console.log("%c[Netplay] 💓 Accuracy Pulse: Periodically sync-ing state...", "color: #ff00ff; font-weight: bold");
                const currentState = window.getCoreState ? window.getCoreState() : null;
                if (currentState) {
                    connection.send({
                        type: 'sync-state',
                        state: currentState,
                        frame: window.currentFrame
                    });
                    stats.predictions = 0;
                    stats.lastPulseTime = now;
                }
            }

            const bufSize = remoteInputBuffer.size;
            const target = window.INPUT_DELAY;
            const driftF = stats.remoteFrameHead - window.currentFrame; // Vital for UI
            const bufferStatus = bufSize >= target ? "HEALTHY" : (bufSize >= target - 1 ? "STABLE" : "CRITICAL");
            const bufferColor = bufferStatus === "HEALTHY" ? "#00ff00" : (bufferStatus === "STABLE" ? "#ffff00" : "#ff4444");
            const mode = window.isJitterSpike ? "ABSORBING" : "NORMAL";

            console.log(
                `%c[Netplay] Ping: ${stats.ping}ms | Buf: ${bufSize}/${target} | Dist: ${driftF}f | Mode: ${mode} | Stalls: ${stats.stalls} | Pred: ${stats.predictions || 0}`,
                `color: ${bufferColor}; font-weight: bold`
            );
        } else {
            clearInterval(window._monitorId);
        }
    }, 2000);
}