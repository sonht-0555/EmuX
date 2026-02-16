/**
 * EmuX Netplay Engine (v6.17) - Simulation Loop & Drift Correction
 */

window.INPUT_DELAY = 4;
window.lastTime = performance.now();
window.accumulator = 0;
window.loopActive = false;

const FRAME_TIME = 1000 / 60;

function tryRunFrame() {
    const core = window.Module;
    if (!core?._retro_run) return false;

    const fId = window.currentFrame;

    if (!localInputBuffer.has(fId) || !remoteInputBuffer.has(fId)) {
        stats.stalls++;
        if (stats.stalls % 120 === 0) {
            console.warn(`[Netplay] 🛑 Stall @ ${fId} | Buf: ${remoteInputBuffer.size} | Ping: ${stats.ping}ms`);
        }
        return false;
    }

    const myMask = localInputBuffer.get(fId);
    const rMask = remoteInputBuffer.get(fId);
    remoteInputs[0] = isHost ? myMask : rMask;
    remoteInputs[1] = isHost ? rMask : myMask;

    try {
        core._retro_run();
    } catch (e) {
        console.error("[Netplay] WASM Core Panic:", e);
    }

    localInputBuffer.delete(fId);
    remoteInputBuffer.delete(fId);
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

    if (drift > 0) timeScale = 1.01;
    else if (drift < 0) timeScale = 0.99;

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
            if (stats.stalls % 120 === 0 && window.resetAudioSync) {
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

    stats.sent = 0;
    stats.received = 0;
    stats.stalls = 0;
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
            stats.pps_sent = 0;
            stats.pps_recv = 0;
            stats.lastPPSReset = now;

            const bufSize = remoteInputBuffer.size;
            const target = window.INPUT_DELAY;
            const bufferStatus = bufSize >= target ? "HEALTHY" : (bufSize >= target - 1 ? "STABLE" : "CRITICAL");
            const bufferColor = bufferStatus === "HEALTHY" ? "#00ff00" : (bufferStatus === "STABLE" ? "#ffff00" : "#ff4444");
            const frameLead = stats.remoteFrameHead - window.currentFrame;

            console.log(
                `%c[Netplay] Ping: ${stats.ping}ms | Buf: ${bufSize}/${target} [${bufferStatus}] | Drift: ${frameLead}f | Traffic: ${sent_rate}↑ ${recv_rate}↓ | Stalls: ${stats.stalls}`,
                `color: ${bufferColor}; font-weight: bold`
            );
        } else {
            clearInterval(window._monitorId);
        }
    }, 2000);
}
