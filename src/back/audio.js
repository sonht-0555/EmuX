// ===== LibAudio =====
function audio_batch_cb(ptr, frames) { return writeAudio(ptr, frames) };
function audio_cb(l, r) { };
// ===== Audio =====
var audioCtx, processor, fifoL = new Int16Array(8192), fifoR = new Int16Array(8192), fifoHead = 0, fifoCnt = 0;
async function initAudio(sampleRate) {
  if (audioCtx) { audioCtx.resume(); return; }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'interactive' });
  processor = audioCtx.createScriptProcessor(1024, 0, 2);
  processor.onaudioprocess = function (e) {
    var L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
    if (!isRunning) { L.fill(0); R.fill(0); return; }
    var r = sampleRate;
    while (fifoCnt < 1024 * r) Module._retro_run();
    for (var i = 0; i < 1024; i++) {
      var pos = i * r, idx = (fifoHead + (pos | 0)) % 8192, frac = pos % 1;
      L[i] = (fifoL[idx] * (1 - frac) + fifoL[(idx + 1) % 8192] * frac) / 32768;
      R[i] = (fifoR[idx] * (1 - frac) + fifoR[(idx + 1) % 8192] * frac) / 32768;
    }
    fifoHead = (fifoHead + (1024 * r | 0)) % 8192;
    fifoCnt -= 1024 * r | 0;
  };
  processor.connect(audioCtx.destination);
  await audioCtx.resume();
}
function writeAudio(ptr, frames) {
  if (!audioCtx || fifoCnt + frames >= 8192) return frames;
  var data = new Int16Array(Module.HEAPU8.buffer, ptr, frames * 2);
  var tail = (fifoHead + fifoCnt) % 8192;
  for (var i = 0; i < frames; i++) {
    fifoL[tail] = data[i * 2];
    fifoR[tail] = data[i * 2 + 1];
    tail = (tail + 1) % 8192;
  }
  fifoCnt += frames;
  return frames;
}
