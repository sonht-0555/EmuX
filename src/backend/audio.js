// ===== audio_batch_cb =====
const audio_batch_cb = (ptr, f) => writeAudio(ptr, f);
// ===== audio_cb =====
const audio_cb = () => {};
// ===== Audio State =====
var audioContext, audioWorkletNode, audioGainNode;
var audioBufferL, audioBufferR, maxFrames = 0, audioDataView, audioDataBuffer, audioDataPointer;
var totalSamplesSent = 0, audioStartTime = 0, audioCoreRatio = 1.0;
// ===== initAudio =====
async function initAudio(ratio) {
    if (audioContext) return audioContext.resume();
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'interactive' });
    await audioContext.audioWorklet.addModule('./src/backend/audio-processor.js');
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.value = 1;
    audioCoreRatio = ratio;
    audioWorkletNode.port.postMessage({ ratio });
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    
    audioStartTime = audioContext.currentTime;
    totalSamplesSent = 0;
    return audioContext.resume();
}
// ===== writeAudio =====
function writeAudio(ptr, f) {
    if (!audioWorkletNode || !isRunning) return f;
    if (f > maxFrames) {
        maxFrames = f;
        audioBufferL = new Float32Array(f);
        audioBufferR = new Float32Array(f);
    }
    const buf = Module.HEAPU8.buffer;
    if (!audioDataView || audioDataBuffer !== buf || audioDataPointer !== ptr || audioDataView.length < f * 2) {
        audioDataBuffer = buf; audioDataPointer = ptr;
        audioDataView = new Int16Array(buf, ptr, Math.max(f * 2, maxFrames * 2));
    }
    const v = audioDataView, mul = 1 / 32768;
    for (let i = 0; i < f; i++) {
        audioBufferL[i] = v[i * 2] * mul;
        audioBufferR[i] = v[i * 2 + 1] * mul;
    }
    audioWorkletNode.port.postMessage({ l: audioBufferL.subarray(0, f), r: audioBufferR.subarray(0, f) });
    totalSamplesSent += f;
    return f;
}
window.getAudioBacklog = () => {
    if (!audioContext || audioContext.state !== 'running') return 0;
    const coreHz = 48000 * audioCoreRatio;
    const playedSamples = (audioContext.currentTime - audioStartTime) * coreHz;
    return totalSamplesSent - playedSamples;
};
window.resetAudioSync = () => {
    totalSamplesSent = 0;
    if (audioContext) audioStartTime = audioContext.currentTime;
};
