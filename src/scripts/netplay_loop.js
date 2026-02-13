/**
 * EmuX Netplay Engine (v6.12) - Simulation Loop & Drift Correction
 * Chứa logic vòng lặp cao tần và điều khiển đồng bộ.
 */

// Simulation Variables
window.INPUT_DELAY = 4;
window.lastTime = performance.now();
window.accumulator = 0;
window.loopActive = false;
const FRAME_TIME = 1000 / 60;

/**
 * Thử chạy một frame giả lập
 */
function tryRunFrame() {
    const core = window.Module;
    if (!core?._retro_run) return false;

    const fId = window.currentFrame;

    if (!localInputBuffer.has(fId) || !remoteInputBuffer.has(fId)) {
        stats.stalls++;
        if (stats.stalls % 60 === 0) {
            console.warn(`[Netplay] 🛑 STALL @ Frame ${fId} | Buffer: ${remoteInputBuffer.size} | Ping: ${stats.ping}ms`);
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

/**
 * Vòng lặp chính với Drift Correction 2%
 */
function netplayLoop() {
    if (!window.isNetplaying || !connection?.open) {
        loopActive = false;
        return;
    }
    requestAnimationFrame(netplayLoop);

    const now = performance.now();
    let delta = now - lastTime;
    lastTime = now;

    const drift = remoteInputBuffer.size - window.INPUT_DELAY;
    let timeScale = 1.0;

    if (drift > 0) timeScale = 1.01;      // Hơi dư -> nhanh hơn 1%
    else if (drift < 0) timeScale = 0.99; // Hơi thiếu -> chậm lại 1%

    accumulator += (delta * timeScale);
    if (accumulator > 100) accumulator = 100;

    let steps = 0;
    const MAX_STEPS = 2; // FIX #4: Giới hạn frame burst

    while (accumulator >= FRAME_TIME && steps < MAX_STEPS) {
        accumulator -= FRAME_TIME;
        steps++;

        const targetFrame = window.currentFrame + INPUT_DELAY;
        if (!localInputBuffer.has(targetFrame)) {
            const mask = window.getGamepadMask ? window.getGamepadMask() : 0;
            localInputBuffer.set(targetFrame, mask);
            sendInput(targetFrame, mask);
        }

        if (!tryRunFrame()) {
            accumulator += FRAME_TIME;
            // FIX #5: Stall Guard
            if (stats.stalls % 60 === 0 && window.resetAudioSync) {
                window.resetAudioSync();
            }
            break;
        }
    }
}

/**
 * Khởi động vòng lặp và đo Ping
 */
async function startNetplayLoop() {
    if (loopActive) return;

    const calibratedDelay = await calibrateDelay();
    window.INPUT_DELAY = calibratedDelay;
    window._calHandler = null;

    connection.send({type: 'delay-sync', delay: INPUT_DELAY});
    console.log(`%c[Netplay] Engine Activated (Delay: ${INPUT_DELAY})`, "color: #00ff00; font-weight: bold;");

    stats.sent = 0; stats.received = 0; stats.stalls = 0;
    if (window.resetAudioSync) window.resetAudioSync();

    for (let i = 0; i <= INPUT_DELAY; i++) {
        if (!localInputBuffer.has(i)) {
            localInputBuffer.set(i, 0);
            sendInput(i, 0);
        }
    }

    lastTime = performance.now();
    accumulator = 0;
    loopActive = true;
    requestAnimationFrame(netplayLoop);

    // DashBoard Telemetry
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

            const bufSize = remoteInputBuffer.size;
            const target = window.INPUT_DELAY;
            const bufferStatus = bufSize >= target ? "HEALTHY" : (bufSize >= target - 1 ? "STABLE" : "CRITICAL");
            const bufferColor = bufferStatus === "HEALTHY" ? "#00ff00" : (bufferStatus === "STABLE" ? "#ffff00" : "#ff4444");
            const frameLead = stats.remoteFrameHead - window.currentFrame;

            console.log(
                `%c[Telemetry] Ping: ${stats.ping}ms | Buffer: ${remoteInputBuffer.size}/${INPUT_DELAY} [${bufferStatus}] | Drift: ${frameLead}f\n` +
                `%c[Traffic] PPS: ${sent_rate}↑ ${recv_rate}↓ | Stalls: ${stats.stalls} | Frame: ${window.currentFrame}`,
                `color: ${bufferColor}; font-weight: bold`,
                `color: #aaaaaa; font-size: 10px;`
            );
        } else {
            clearInterval(window._monitorId);
        }
    }, 1000);
}
