// ===== audio_batch_cb =====
const audio_batch_cb = (pointer, frames) => {
    return writeAudio(pointer, frames);
};
// ===== audio_cb =====
const audio_cb = () => {
    // Empty callback - required by Libretro API
};
// ===== Audio =====
var audioContext;
var audioWorkletNode;
var audioGainNode;
// ===== initAudio =====
async function initAudio(ratio) {
    if (audioContext) {
        return audioContext.resume();
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
    });
    await audioContext.audioWorklet.addModule('./src/backend/audio-processor.js');
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.value = 0;
    audioWorkletNode.port.postMessage({ ratio });
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    const result = audioContext.resume();
    fadeAudioIn();
    return result;
}
// ===== fadeAudioIn =====
function fadeAudioIn(duration = 2) {
    if (!audioGainNode || !audioContext) {
        return;
    }
    const currentTime = audioContext.currentTime;
    audioGainNode.gain.cancelScheduledValues(currentTime);
    audioGainNode.gain.setValueAtTime(audioGainNode.gain.value, currentTime);
    audioGainNode.gain.linearRampToValueAtTime(1, currentTime + duration);
}
// ===== writeAudio =====
let audioBufferL, audioBufferR, maxFrames = 0;
function writeAudio(pointer, frames) {
    if (!audioWorkletNode || !isRunning) {
        return frames;
    }
    if (frames > maxFrames) {
        maxFrames = frames;
        audioBufferL = new Float32Array(maxFrames);
        audioBufferR = new Float32Array(maxFrames);
    }
    const audioData = new Int16Array(Module.HEAPU8.buffer, pointer, frames * 2);
    for (let index = 0; index < frames; index++) {
        audioBufferL[index] = audioData[index * 2] / 32768;
        audioBufferR[index] = audioData[index * 2 + 1] / 32768;
    }
    audioWorkletNode.port.postMessage({
        l: audioBufferL.subarray(0, frames),
        r: audioBufferR.subarray(0, frames)
    });
    return frames;
}
