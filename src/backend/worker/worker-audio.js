// ===== Worker Audio Module =====
var sabL, sabR, sabIndices, audioCoreRatio = 1.0;
var resampledPtrL = 0, resampledPtrR = 0;

const audio_cb = () => {};

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
    }
    return f;
}

function getAudioBacklog() {
    if (!sabIndices) return 0;
    const idx = new Uint32Array(sabIndices);
    const w = Atomics.load(idx, 0), r = Atomics.load(idx, 1);
    const b = (new Float32Array(sabL)).length;
    return ((w - r + b) & (b - 1));
}
