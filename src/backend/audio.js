// ===== Audio System =====
const audio_batch_cb = (ptr, f) => writeAudio(ptr, f), audio_cb = () => {};
var audioContext, audioWorkletNode, audioGainNode, totalSamplesSent = 0, audioStartTime = 0, audioCoreRatio = 1.0;
var currentModule = null, resampledPtrL = 0, resampledPtrR = 0, sabL, sabR, sabIndices;
async function initAudio(ratio) {
    if (audioContext) return audioContext.resume();
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    await audioContext.audioWorklet.addModule('./src/backend/audio-processor.js');
    const bufSize = 16384;
    sabL = new SharedArrayBuffer(bufSize * 4); sabR = new SharedArrayBuffer(bufSize * 4);
    sabIndices = new SharedArrayBuffer(8);
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor', { processorOptions: { sabL, sabR, sabIndices, bufSize } });
    audioGainNode = audioContext.createGain(); audioGainNode.gain.value = 1; audioCoreRatio = ratio;
    if (currentModule !== Module) {
        currentModule = Module;
        resampledPtrL = Module._malloc(4096 * 4); resampledPtrR = Module._malloc(4096 * 4);
    }
    if (Module._emux_audio_reset) Module._emux_audio_reset();
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    audioStartTime = audioContext.currentTime; totalSamplesSent = 0;
}
function writeAudio(ptr, f) {
    if (!audioWorkletNode || !isRunning || !Module._emux_audio_process) return f;
    const count = Module._emux_audio_process(ptr, f, resampledPtrL, resampledPtrR, audioCoreRatio);
    if (count > 0) {
        const l = new Float32Array(Module.HEAPU8.buffer, resampledPtrL, count),
              r = new Float32Array(Module.HEAPU8.buffer, resampledPtrR, count),
              vL = new Float32Array(sabL), vR = new Float32Array(sabR),
              idx = new Uint32Array(sabIndices), b = vL.length;
        let w = Atomics.load(idx, 0), space = b - w;
        if (count <= space) {
            vL.set(l, w); vR.set(r, w);
        } else {
            vL.set(l.subarray(0, space), w); vL.set(l.subarray(space), 0);
            vR.set(r.subarray(0, space), w); vR.set(r.subarray(space), 0);
        }
        Atomics.store(idx, 0, (w + count) & (b - 1));
        totalSamplesSent += count;
    }
    if (window.Perf) window.Perf.countAudio(f);
    return f;
}
window.getAudioBacklog = () => {
    if (!audioContext || audioContext.state !== 'running') return 0;
    const bl = totalSamplesSent - (audioContext.currentTime - audioStartTime) * 48000;
    return Math.max(-5000, Math.min(5000, bl));
};
window.resetAudioSync = () => {
    totalSamplesSent = 0; 
    if (audioContext) audioStartTime = audioContext.currentTime;
    if (window.Module && window.Module._emux_audio_reset) window.Module._emux_audio_reset();
};