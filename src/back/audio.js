// ===== LibAudio =====
const audio_batch_cb = (ptr, frames) => writeAudio(ptr, frames);
const audio_cb = () => {};

// ===== Audio =====
var audioCtx, audioNode;
var bufL = new Float32Array(2048), bufR = new Float32Array(2048); // Reusable buffers

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
  
  // Kiểm tra kích thước buffer hiện tại
  if (bufL.length < frames) {
    bufL = new Float32Array(frames);
    bufR = new Float32Array(frames);
  }

  // Copy và Convert đồng thời
  for (let i = 0; i < frames; i++) {
    bufL[i] = data[i * 2] / 32768;
    bufR[i] = data[i * 2 + 1] / 32768;
  }

  // Gửi bản copy của dữ liệu (dùng slice(0, frames) để đảm bảo độ dài chuẩn)
  audioNode.port.postMessage({ 
    l: bufL.slice(0, frames), 
    r: bufR.slice(0, frames) 
  });
  
  return frames;
}
