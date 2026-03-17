// ===== Audio System =====
const audio_batch_cb = (pointer, frames) => writeAudio(pointer, frames), audio_cb = () => { };
var audioContext, audioWorkletNode, audioGainNode, totalSamplesSent = 0, audioStartTime = 0, gameFps = 60, rafFps = 60, lastRafTime = 0, acc = 0, smoothedBacklog = 3000, sabL, sabR, sabIndices, sabViewLeft, sabViewRight, sabViewIndices, wasmOutL = 0, wasmOutR = 0, sabBufSize = 0, sabMask = 0;
// ===== initAudio =====
async function initAudio(coreRate, fps) {
    gameFps = fps || 60;
    if (audioContext) return audioContext.resume();
    audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 48000});
    const code = `class P extends AudioWorkletProcessor{constructor(o){super();const{sabL,sabR,sabIndices,bufSize}=o.processorOptions;this.L=new Float32Array(sabL);this.R=new Float32Array(sabR);this.I=new Uint32Array(sabIndices);this.S=bufSize;this.M=bufSize-1}process(_,o){const u=o[0],l=u[0],r=u[1],n=l.length,w=Atomics.load(this.I,0),i=Atomics.load(this.I,1);if(((w-i+this.S)&this.M)<n){l.fill(0);if(r)r.fill(0);return true}const s=this.S-i;if(n<=s){l.set(this.L.subarray(i,i+n));if(r)r.set(this.R.subarray(i,i+n))}else{l.set(this.L.subarray(i,i+s));l.set(this.L.subarray(0,n-s),s);if(r){r.set(this.R.subarray(i,i+s));r.set(this.R.subarray(0,n-s),s)}}Atomics.store(this.I,1,(i+n)&this.M);return true}}registerProcessor('p',P)`;
    const blob = new Blob([code], {type: 'application/javascript'});
    await audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
    sabBufSize = 8192;
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
    if (count > 2000) return frames;
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
    }
    return frames;
}
// ===== getAudioSync =====
window.getAudioSync = () => {
    const now = performance.now();
    const delta = now - lastRafTime;
    lastRafTime = now;
    if (!audioContext || audioContext.state !== 'running' || !gameFps || delta <= 0 || delta > 100) return 1;

    let backlog = totalSamplesSent - (audioContext.currentTime - audioStartTime) * audioContext.sampleRate;
    if (Math.abs(backlog) > 5000) {
        audioContext.suspend();
        console.log(`Burst Fixed...[${backlog.toFixed(0)}]`);
        audioStartTime = audioContext.currentTime - (totalSamplesSent / audioContext.sampleRate);
        backlog = 0;
    }
    smoothedBacklog = 0.98 * smoothedBacklog + 0.02 * backlog;
    let drift = 1.0 + (3000 - smoothedBacklog) / 40000;
    drift = Math.max(0.8, Math.min(1.2, drift));
    acc += (gameFps * delta / 1000) * drift;
    let runs = Math.floor(acc);
    acc -= runs;
    const finalRuns = Math.max(0, Math.min(4, runs));
    window._tick = (window._tick || 0) + 1;
    if (window._tick >= 120) {
        console.log(`Core: ${gameFps} | B: ${backlog.toFixed(0)} | D: ${drift.toFixed(3)} | R: ${finalRuns}`);
        window._tick = 0;
    }
    if (finalRuns === 0 && (backlog < -5000 || delta > (1000 / gameFps) * 1.1)) return 1;
    return finalRuns;
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
    lastRafTime = acc = 0;
    smoothedBacklog = 3000;
};