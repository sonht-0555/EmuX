// ===== LibAudio =====
const audio_batch_cb = (ptr, frames) => writeAudio(ptr, frames);
const audio_cb = () => {};
// ===== Audio =====
var audioCtx, audioNode, gainNode;
async function initAudio(ratio) {
  if (audioCtx) return audioCtx.resume();
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'interactive' });
  try {
    await audioCtx.audioWorklet.addModule('./src/backend/audio-processor.js');
    audioNode = new AudioWorkletNode(audioCtx, 'audio-processor');
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;
    audioNode.port.postMessage({ ratio });
    audioNode.connect(gainNode).connect(audioCtx.destination);
  } catch (e) { console.error("Worklet Error:", e) }
  const res = audioCtx.resume();
  fadeAudioIn();
  return res;
}
function fadeAudioIn(duration = 2) {
  if (!gainNode || !audioCtx) return;
  const now = audioCtx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(1, now + duration);
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
