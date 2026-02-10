// ===== Audio System =====
const audio_batch_cb = (pointer, frames) => writeAudio(pointer, frames), audio_cb = () => { };
var audioContext, audioWorkletNode, audioGainNode, totalSamplesSent = 0, audioStartTime = 0, audioCoreRatio = 1.0;
var currentModule = null, resampledPtrL = 0, resampledPtrR = 0, sabL, sabR, sabIndices;
// ===== initAudio =====
async function initAudio(ratio) {
    if (audioContext) return audioContext.resume();
    audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 48000});
    await audioContext.audioWorklet.addModule('./src/backend/audio-processor.js');
    const bufSize = 16384;
    sabL = new SharedArrayBuffer(bufSize * 4);
    sabR = new SharedArrayBuffer(bufSize * 4);
    sabIndices = new SharedArrayBuffer(8);
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor', {processorOptions: {sabL, sabR, sabIndices, bufSize}});
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.value = 1;
    audioCoreRatio = ratio;
    if (currentModule !== Module) {
        currentModule = Module;
        resampledPtrL = Module._malloc(4096 * 4);
        resampledPtrR = Module._malloc(4096 * 4);
    }
    if (Module._emux_audio_reset) Module._emux_audio_reset();
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    audioStartTime = audioContext.currentTime;
    totalSamplesSent = 0;
}
// ===== writeAudio =====
function writeAudio(pointer, frames) {
    if (!audioWorkletNode || !isRunning || !Module._emux_audio_process) return frames;
    const count = Module._emux_audio_process(pointer, frames, resampledPtrL, resampledPtrR, audioCoreRatio);
    if (count > 0) {
        const left = new Float32Array(Module.HEAPU8.buffer, resampledPtrL, count);
        const right = new Float32Array(Module.HEAPU8.buffer, resampledPtrR, count);
        const viewLeft = new Float32Array(sabL), viewRight = new Float32Array(sabR);
        const indices = new Uint32Array(sabIndices), bufferSize = viewLeft.length;
        let writeIndex = Atomics.load(indices, 0), space = bufferSize - writeIndex;
        if (count <= space) {viewLeft.set(left, writeIndex); viewRight.set(right, writeIndex);}
        else {
            viewLeft.set(left.subarray(0, space), writeIndex); viewLeft.set(left.subarray(space), 0);
            viewRight.set(right.subarray(0, space), writeIndex); viewRight.set(right.subarray(space), 0);
        }
        Atomics.store(indices, 0, (writeIndex + count) & (bufferSize - 1));
        totalSamplesSent += count;
    }
    if (window.Perf) window.Perf.countAudio(frames);
    return frames;
}
// ===== getAudioBacklog =====
window.getAudioBacklog = () => {
    if (!audioContext || audioContext.state !== 'running') return 0;
    const backlog = totalSamplesSent - (audioContext.currentTime - audioStartTime) * 48000;
    return Math.max(-5000, Math.min(5000, backlog));
};
// ===== resetAudioSync =====
window.resetAudioSync = () => {
    totalSamplesSent = 0;
    if (audioContext) audioStartTime = audioContext.currentTime;
    if (window.Module && window.Module._emux_audio_reset) window.Module._emux_audio_reset();
};