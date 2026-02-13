/**
 * EmuX Netplay Engine (v6.20) - Panic Mode & Jitter Absorber
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

    if (!localInputBuffer.has(fId)) {
        // EMERGENCY RESCUE: Force generate local input if missing!
        // This prevents sticky stalls when delay changes cause gaps.
        const mask = window.getGamepadMask ? window.getGamepadMask() : 0;
        localInputBuffer.set(fId, mask);
        sendInput(fId, mask);
        // console.warn(`[Netplay] ⚠️ Rescued missing local input ${fId}`);
    }

    const myMask = localInputBuffer.get(fId);
    let rMask; // Input Prediction Variable

    if (!remoteInputBuffer.has(fId)) {
        if (remoteInputBuffer.size > 0) {
            // DESYNC DETECTED: Consume oldest available input to catch up.
            const oldestFrame = Math.min(...remoteInputBuffer.keys());
            rMask = remoteInputBuffer.get(oldestFrame);
            remoteInputBuffer.delete(oldestFrame);
            window.consecutivePredictions = 0; // Reset counter
        } else {
            // Buffer EMPTY: Use prediction, BUT limit consecutive frames!
            window.consecutivePredictions = (window.consecutivePredictions || 0) + 1;

            // Strict Lockstep (Limit 1) - As requested for safety
            // If screen/network sleeps, game FREEZES.
            // On wake up, we should ideally resync state.
            let maxPred = 1;

            // Wake-up Detector:
            // If game stalled for > 2 seconds (120 frames), mark for Resync
            if (stats.stalls > 120) {
                window.needsStateSync = true;
            }

            // Sync Trigger (Restores state from Host)
            if (window.needsStateSync && stats.pps_recv > 0) {
                console.log("%c[Netplay] 🌅 Wake up detected! Requesting State Sync...", "color: cyan");
                connection.send({type: 'request-sync'});
                window.needsStateSync = false;
                stats.stalls = 0; // Reset stall counter
            }

            if (window.consecutivePredictions > maxPred) {
                // Too many predictions! Stop and wait for opponent.
                stats.stalls++;
                if (stats.stalls % 60 === 0) {
                    console.warn(`[Netplay] 🛑 Waiting for P2... (PPS: ${stats.pps_recv}, Limit: ${maxPred})`);
                }
                return false; // STALL GAME
            }

            rMask = remoteInputBuffer.get(fId - 1) || 0;
            stats.predictions = (stats.predictions || 0) + 1;
        }
    } else {
        rMask = remoteInputBuffer.get(fId);
        window.consecutivePredictions = 0; // Reset counter
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

    const now = performance.now();
    let delta = now - window.lastTime;
    window.lastTime = now;

    const drift = remoteInputBuffer.size - window.INPUT_DELAY;
    let timeScale = 1.0;

    // 3. Jitter Spike Absorber logic
    // Normal: Smooth correction (+-0.5%)
    // Spike: Pause correction (Absorb)
    // Excessive Lag (>20f): Aggressive Catch-up (Force 5% speed)
    if (drift > 20) {
        timeScale = 1.05; // Force fast forward to reduce input lag!
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
            const sent_rate = Math.round(stats.pps_sent / dt);
            const recv_rate = Math.round(stats.pps_recv / dt);
            stats.pps_sent = 0; stats.pps_recv = 0; stats.lastPPSReset = now;

            // --- Advanced Features (v6.20) ---
            window.pingHistory.push(stats.ping);
            if (window.pingHistory.length > 20) window.pingHistory.shift(); // Capture more history
            const avgPing = window.pingHistory.reduce((a, b) => a + b, 0) / window.pingHistory.length;
            const jitter = Math.max(...window.pingHistory) - Math.min(...window.pingHistory);

            // 1. Panic Mode (Buffer Safety Margin Auto)
            if (stats.stalls - (window.lastStallCheck || 0) > 20) {
                if (window.INPUT_DELAY < 8) {
                    const oldDelay = window.INPUT_DELAY;
                    window.INPUT_DELAY = 8; // MAX SAFETY
                    window.lastDelayAdjust = now;
                    connection.send({type: 'delay-sync', delay: window.INPUT_DELAY});
                    console.warn(`%c[Netplay] 🚨 PANIC MODE ACTIVATED! Delay set to 8`, "color: #ff0000; font-weight: bold; background: yellow;");

                    // CRITICAL FIX: Backfill missing frames when increasing delay!
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

                    // CRITICAL FIX: Backfill missing frames when increasing delay!
                    for (let i = oldDelay + 1; i <= window.INPUT_DELAY; i++) {
                        const frame = window.currentFrame + i;
                        if (!localInputBuffer.has(frame)) {
                            const mask = window.getGamepadMask ? window.getGamepadMask() : 0;
                            localInputBuffer.set(frame, mask);
                            sendInput(frame, mask);
                        }
                    }
                } else if (avgPing < window.INPUT_DELAY * 8 && window.INPUT_DELAY > 3 && jitter < 30) {
                    window.INPUT_DELAY--;
                    window.lastDelayAdjust = now;
                    connection.send({type: 'delay-sync', delay: window.INPUT_DELAY});
                    console.log(`%c[Netplay] 🚀 Delay decreased to ${window.INPUT_DELAY}`, "color: #00ff00");
                }
            }

            // 3. Jitter Spike Absorber logic passed to netplayLoop via global flag
            window.isJitterSpike = (stats.ping > avgPing * 2.0 && stats.ping > 50);

            const bufSize = remoteInputBuffer.size;
            const target = window.INPUT_DELAY;
            const bufferStatus = bufSize >= target ? "HEALTHY" : (bufSize >= target - 1 ? "STABLE" : "CRITICAL");
            const bufferColor = bufferStatus === "HEALTHY" ? "#00ff00" : (bufferStatus === "STABLE" ? "#ffff00" : "#ff4444");
            const frameLead = stats.remoteFrameHead - window.currentFrame;
            const mode = window.isJitterSpike ? "ABSORBING" : "NORMAL";

            console.log(
                `%c[Netplay] Ping: ${stats.ping}ms | Buf: ${bufSize}/${target} [${bufferStatus}] | Drift: ${frameLead}f | Mode: ${mode} | Stalls: ${stats.stalls} | Pred: ${stats.predictions || 0}`,
                `color: ${bufferColor}; font-weight: bold`
            );
        } else {
            clearInterval(window._monitorId);
        }
    }, 2000);
}
