// ===== Audio System =====
const audio_batch_cb = (pointer, frames) => writeAudio(pointer, frames), audio_cb = () => { };
var audioContext, audioWorkletNode, audioGainNode, totalSamplesSent = 0, audioStartTime = 0, gameFps = 60, lastRafTime = 0, acc = 0, sDrift = 1, lastLogTime = 0, sabL, sabR, sabIndices, sabViewLeft, sabViewRight, sabViewIndices, wasmOutL = 0, wasmOutR = 0, sabBufSize = 0, sabMask = 0, activeSession = null, audioBurstLimit = 10000, audioMaxWrite = 4000, audioTargetLimit = 3000, skip_frame = 0, time = 0, drift = 1.0, backlog = 0, runs = 1;
// ===== initAudio =====
async function initAudio(avInfoPointer) {
    const p = Number(avInfoPointer);
    gameFps = Module.HEAPF64[(p + 24) >> 3] || 60;
    const coreRate = Module.HEAPF64[(p + 32) >> 3] || 48000;
    audioBurstLimit = (48000 / gameFps) * 10.0;
    audioMaxWrite = (48000 / gameFps) * 8.0;
    audioTargetLimit = (48000 / gameFps) * 6.0;
    // console.log(`${gameFps.toFixed(2)} | ${audioBurstLimit.toFixed(0)} | ${audioMaxWrite.toFixed(0)} | ${audioTargetLimit.toFixed(0)}`);
    if (audioContext) return audioContext.resume();
    audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 48000});
    const code = `class P extends AudioWorkletProcessor{constructor(o){super();const{sabL,sabR,sabIndices,bufSize}=o.processorOptions;this.L=new Float32Array(sabL);this.R=new Float32Array(sabR);this.I=new Uint32Array(sabIndices);this.S=bufSize;this.M=bufSize-1}process(_,o){const u=o[0],l=u[0],r=u[1],n=l.length,w=Atomics.load(this.I,0),i=Atomics.load(this.I,1);if(((w-i+this.S)&this.M)<n){l.fill(0);if(r)r.fill(0);return true}const s=this.S-i;if(n<=s){l.set(this.L.subarray(i,i+n));if(r)r.set(this.R.subarray(i,i+n))}else{l.set(this.L.subarray(i,i+s));l.set(this.L.subarray(0,n-s),s);if(r){r.set(this.R.subarray(i,i+s));r.set(this.R.subarray(0,n-s),s)}}Atomics.store(this.I,1,(i+n)&this.M);return true}}registerProcessor('p',P)`;
    const blob = new Blob([code], {type: 'application/javascript'});
    await audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
    sabBufSize = 16384;
    sabMask = sabBufSize - 1;
    sabL = new SharedArrayBuffer(sabBufSize * 4);
    sabR = new SharedArrayBuffer(sabBufSize * 4);
    sabIndices = new SharedArrayBuffer(8);
    sabViewLeft = new Float32Array(sabL);
    sabViewRight = new Float32Array(sabR);
    sabViewIndices = new Uint32Array(sabIndices);
    audioWorkletNode = new AudioWorkletNode(audioContext, 'p', {processorOptions: {sabL, sabR, sabIndices, bufSize: sabBufSize}});
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.value = 1;
    wasmOutL = Module._emux_audio_get_buffer_l();
    wasmOutR = Module._emux_audio_get_buffer_r();
    Module._emux_audio_set_core_rate(coreRate);
    if (Module._emux_audio_reset) Module._emux_audio_reset();
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    audioStartTime = audioContext.currentTime;
    totalSamplesSent = 0;
}
// ===== writeAudio =====
function writeAudio(pointer, frames) {
    if (!audioWorkletNode || !isRunning || !Module._emux_audio_process) return frames;
    const count = Module._emux_audio_process(pointer, frames);
    if (count > audioMaxWrite) return frames;
    if (count > 0) {
        const writeIndex = Atomics.load(sabViewIndices, 0);
        const readIndex = Atomics.load(sabViewIndices, 1);
        const used = (writeIndex - readIndex + sabBufSize) & sabMask;
        const free = sabBufSize - used - 1;
        if (count > free) return frames;
        const left = new Float32Array(Module.HEAPU8.buffer, wasmOutL, count);
        const right = new Float32Array(Module.HEAPU8.buffer, wasmOutR, count);
        const space = sabBufSize - writeIndex;
        if (count <= space) {
            sabViewLeft.set(left, writeIndex);
            sabViewRight.set(right, writeIndex);
        } else {
            sabViewLeft.set(left.subarray(0, space), writeIndex);
            sabViewLeft.set(left.subarray(space), 0);
            sabViewRight.set(right.subarray(0, space), writeIndex);
            sabViewRight.set(right.subarray(space), 0);
        }
        Atomics.store(sabViewIndices, 0, (writeIndex + count) & sabMask);
        totalSamplesSent += count;
        const isGating = (totalSamplesSent < audioBurstLimit) || (window._turbo > 1.0);
        audioGainNode.gain.setTargetAtTime(isGating ? 0 : 1, audioContext.currentTime, isGating ? 0.001 : 0.01);
    }
    return frames;
}
// ===== getAudioSync =====
window.getAudioSync = () => {
    const now = performance.now();
    const delta = now - lastRafTime; lastRafTime = now;
    if (skip_frame > 0) skip_frame--;
    if (audioContext && audioContext.state === 'running' && gameFps && delta > 0 && delta < 100 && skip_frame === 0) {
        backlog = totalSamplesSent - (audioContext.currentTime - audioStartTime) * audioContext.sampleRate;
        if (window._turbo > 1.0 || Math.abs(backlog) > audioBurstLimit) {
            audioStartTime = audioContext.currentTime - (totalSamplesSent - audioTargetLimit) / audioContext.sampleRate;
            backlog = audioTargetLimit;
        }
        drift = 1.0 + (audioTargetLimit - backlog) / 200000;
    }
    let fairDelta = (delta <= 0 || delta > 100) ? (1000 / gameFps) : delta;
    acc += (gameFps * fairDelta / 1000) * (sDrift = sDrift * 0.9 + drift * 0.1) * (window._turbo || 1.0);
    runs = Math.floor(acc);
    acc -= runs;
    return Math.max(0, Math.min(4, runs));
};
// ===== resetAudioSync =====
window.resetAudioSync = () => {
    totalSamplesSent = 0;
    if (audioContext) audioStartTime = audioContext.currentTime;
    if (window.Module && window.Module._emux_audio_reset) window.Module._emux_audio_reset();
    if (sabViewIndices) {
        Atomics.store(sabViewIndices, 0, 0);
        Atomics.store(sabViewIndices, 1, 0);
    }
    lastRafTime = acc = time = 0; sDrift = 1; skip_frame = 40;
};
// ===== gameLoop =====
window.gameLoop = (isLooping) => {
    if (isLooping === false) return isRunning = false;
    if (isLooping === true) {isRunning = true; activeSession = window.currentSessionId; if (window.mainRafId) cancelAnimationFrame(window.mainRafId);}
    if (!isRunning || window.currentSessionId !== activeSession) return window.mainRafId = 0;
    window.mainRafId = requestAnimationFrame(window.gameLoop);
    const targetRuns = window.getAudioSync?.() ?? 1;
    for (let index = 0; index < targetRuns; index++) {
        window.skipRender = (index < targetRuns - 1);
        if (window.Module && Module._retro_run) Module._retro_run();
        window._runCount = (window._runCount || 0) + 1;
    }
    window.skipRender = false;
};
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && audioContext && isRunning) syncGame();
});