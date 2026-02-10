// ===== Audio System (Main Thread - AudioContext only) =====
// writeAudio đã chuyển sang Worker, main thread chỉ giữ AudioContext & AudioWorklet
var audioContext, audioWorkletNode, audioGainNode, sabL, sabR, sabIndices;

async function initAudio(ratio) {
    if (audioContext) { audioContext.resume(); return; }
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    await audioContext.audioWorklet.addModule('./src/backend/system/audio/audio-processor.js');
    const bufSize = 16384;
    sabL = new SharedArrayBuffer(bufSize * 4);
    sabR = new SharedArrayBuffer(bufSize * 4);
    sabIndices = new SharedArrayBuffer(8);
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor', { processorOptions: { sabL, sabR, sabIndices, bufSize } });
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.value = 1;
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    audioContext.resume();
}

window.resetAudioSync = () => {
    if (audioContext) audioContext.resume();
};