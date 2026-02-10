var sabL, sabR, sabIndices, audioCoreRatio = 1.0;
var resampledPtrL = 0, resampledPtrR = 0;
var totalSamplesSent = 0, audioStartTime = 0;
// ===== audio_cb =====
const audio_cb = () => {};
// ===== audio_batch_cb =====
function audio_batch_cb(ptr, f) {
    if (!isRunning || !Module._emux_audio_process) return f;
    const count = Module._emux_audio_process(ptr, f, resampledPtrL, resampledPtrR, audioCoreRatio);
    if (count > 0) {
        const l = new Float32Array(Module.HEAPU8.buffer, resampledPtrL, count),
              r = new Float32Array(Module.HEAPU8.buffer, resampledPtrR, count),
              vL = new Float32Array(sabL), vR = new Float32Array(sabR),
              idx = new Uint32Array(sabIndices), b = vL.length;
        let w = Atomics.load(idx, 0), space = b - w;
        if (count <= space) { vL.set(l, w); vR.set(r, w); }
        else {
            vL.set(l.subarray(0, space), w); vL.set(l.subarray(space), 0);
            vR.set(r.subarray(0, space), w); vR.set(r.subarray(space), 0);
        }
        Atomics.store(idx, 0, (w + count) & (b - 1));
        totalSamplesSent += count;
    }
    return f;
}
// ===== getAudioBacklog =====
function getAudioBacklog() {
    if (!sabIndices) return 0;
    const timeView = new Float64Array(sabIndices);
    const currentTime = timeView[1]; // Written by AudioWorklet
    if (currentTime === 0) return 0; // Audio not started yet
    if (audioStartTime === 0) audioStartTime = currentTime;
    const bl = totalSamplesSent - (currentTime - audioStartTime) * 48000;
    return Math.max(-5000, Math.min(5000, bl));
}
// ===== resetAudioSync =====
function resetAudioSync() {
    totalSamplesSent = 0;
    audioStartTime = 0;
}
