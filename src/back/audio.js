// ===== LibAudio =====
const audio_batch_cb = (ptr, frames) => writeAudio(ptr, frames);
const audio_cb = () => {};
// ===== Audio =====
var audioCtx, audioNode;
async function initAudio(ratio) {
  if (audioCtx) return audioCtx.resume();
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'interactive' });
  try {
    await audioCtx.audioWorklet.addModule('./src/back/audio-processor.js');
    audioNode = new AudioWorkletNode(audioCtx, 'audio-processor');
    audioNode.port.postMessage({ ratio });
    audioNode.connect(audioCtx.destination);
  } catch (e) { console.error("Worklet Error:", e) }
  return audioCtx.resume();
}
function writeAudio(ptr, frames) {
  if (!audioNode || !isRunning) return frames;
  const data = new Int16Array(Module.HEAPU8.buffer, ptr, frames * 2);
  const l = new Float32Array(frames), r = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    l[i] = data[i * 2] / 32768;
    r[i] = data[i * 2 + 1] / 32768;
  }
  audioNode.port.postMessage({ l, r });
  return frames;
}
