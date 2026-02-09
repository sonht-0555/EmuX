// ===== audio_batch_cb =====
const audio_batch_cb = (ptr, f) => writeAudio(ptr, f);
// ===== audio_cb =====
const audio_cb = () => {};
// ===== Audio State =====
var audioContext, audioWorkletNode, audioGainNode;
var totalSamplesSent = 0, audioStartTime = 0, audioCoreRatio = 1.0;
var currentModule = null, resampledPtrL = 0, resampledPtrR = 0;

// ===== initAudio =====
async function initAudio(ratio) {
    if (audioContext) return audioContext.resume();
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'interactive' });
    await audioContext.audioWorklet.addModule('./src/backend/audio-processor.js');
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.value = 1;
    audioCoreRatio = ratio;
    
    // Đảm bảo con trỏ luôn thuộc về Module hiện tại
    if (currentModule !== Module) {
        currentModule = Module;
        resampledPtrL = Module._malloc(4096 * 4);
        resampledPtrR = Module._malloc(4096 * 4);
    }
    if (Module._audio_reset) Module._audio_reset();

    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    audioStartTime = audioContext.currentTime;
    totalSamplesSent = 0;
    return audioContext.resume();
}
// ===== writeAudio =====
function writeAudio(ptr, f) {
    if (!audioWorkletNode || !isRunning || !Module._retro_audio_process) return f;
    
    // Thực hiện Resampling cực nhanh trong WASM
    const count = Module._retro_audio_process(ptr, f, resampledPtrL, resampledPtrR, audioCoreRatio);
    
    if (count > 0) {
        // Gửi dữ liệu đã resample sang Worklet
        audioWorkletNode.port.postMessage({ 
            l: new Float32Array(Module.HEAPU8.buffer, resampledPtrL, count).slice(), 
            r: new Float32Array(Module.HEAPU8.buffer, resampledPtrR, count).slice() 
        });
        totalSamplesSent += count;
    }
    return f;
}
window.getAudioBacklog = () => {
    if (!audioContext || audioContext.state !== 'running') return 0;
    const playedSamples = (audioContext.currentTime - audioStartTime) * 48000;
    return totalSamplesSent - playedSamples;
};
window.resetAudioSync = () => {
    totalSamplesSent = 0;
    if (audioContext) audioStartTime = audioContext.currentTime;
    if (Module._audio_reset) Module._audio_reset();
};
