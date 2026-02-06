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
    audioGainNode.gain.value = 1;
    audioWorkletNode.port.postMessage({ ratio });
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    return audioContext.resume();
}
// ===== writeAudio =====
let audioBufferL, audioBufferR, maxFrames = 0;
let audioDataView, audioDataBuffer, audioDataPointer;
function writeAudio(pointer, frames) {
    if (!audioWorkletNode || !isRunning) {
        return frames;
    }
    if (frames > maxFrames) {
        maxFrames = frames;
        audioBufferL = new Float32Array(maxFrames);
        audioBufferR = new Float32Array(maxFrames);
    }
    const buffer = Module.HEAPU8.buffer;
    if (!audioDataView || audioDataBuffer !== buffer || audioDataPointer !== pointer || audioDataView.length < frames * 2) {
        audioDataBuffer = buffer;
        audioDataPointer = pointer;
        audioDataView = new Int16Array(buffer, pointer, Math.max(frames * 2, maxFrames * 2));
    }
    for (let index = 0; index < frames; index++) {
        audioBufferL[index] = audioDataView[index * 2] / 32768;
        audioBufferR[index] = audioDataView[index * 2 + 1] / 32768;
    }
    audioWorkletNode.port.postMessage({
        l: audioBufferL.subarray(0, frames),
        r: audioBufferR.subarray(0, frames)
    });
    return frames;
}
