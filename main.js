// ===== Core Config =====
const CORE_CONFIG = {
  gba:  { ratio: 65760 / 48000, width: 240, height: 160, ext: '.gba', script: './mgba.js' },
  snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './snes9x.js' }
};

// ===== Audio =====
let audioCtx, processor, isRunning = false, fifoHead = 0, RATIO =0, fifoCnt = 0, fifoL = new Int16Array(8192), fifoR = new Int16Array(8192);
function initAudio() {
  if (audioCtx) return audioCtx.resume();
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  processor = audioCtx.createScriptProcessor(1024, 0, 2);
  processor.onaudioprocess = e => {
    const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
    if (!isRunning) return L.fill(0), R.fill(0);
    while (fifoCnt < 1024 * RATIO) Module._retro_run();
    for (let i = 0; i < 1024; i++) {
      const pos = i * RATIO, idx = (fifoHead + (pos | 0)) % 8192, frac = pos % 1;
      L[i] = (fifoL[idx] * (1 - frac) + fifoL[(idx + 1) % 8192] * frac) / 32768;
      R[i] = (fifoR[idx] * (1 - frac) + fifoR[(idx + 1) % 8192] * frac) / 32768;
    }
    fifoHead = (fifoHead + (1024 * RATIO | 0)) % 8192;
    fifoCnt -= 1024 * RATIO | 0;
  };
  processor.connect(audioCtx.destination);
  audioCtx.resume();
}
function writeAudio(ptr, frames) {
  if (!audioCtx || fifoCnt + frames >= 8192) return frames;
  const data = new Int16Array(Module.HEAPU8.buffer, ptr, frames * 2);
  for (let i = 0, tail = (fifoHead + fifoCnt) % 8192; i < frames; i++, tail = (tail + 1) % 8192) {
    fifoL[tail] = data[i * 2];
    fifoR[tail] = data[i * 2 + 1];
  }
  fifoCnt += frames;
  return frames;
}
// ===== libretro =====
function audio_cb() {}
function audio_batch_cb(ptr, frames) { return writeAudio(ptr, frames); }
function input_poll_cb() {}

// Virtual pad state
const padState = {
  up: false, down: false, left: false, right: false,
  a: false, b: false, x: false, y: false,
  l: false, r: false, start: false, select: false
};

// Libretro button mapping (GBA/SNES)
// 0: B, 1: Y, 2: Select, 3: Start, 4: Up, 5: Down, 6: Left, 7: Right, 8: A, 9: X, 10: L, 11: R
const btnMap = {
  up: 4, down: 5, left: 6, right: 7,
  a: 8, b: 0, x: 9, y: 1,
  l: 10, r: 11, start: 3, select: 2
};

function input_state_cb(port, device, index, id) {
  // Only support port 0, device 1 (joypad)
  if (port !== 0 || device !== 1) return 0;
  for (const key in btnMap) {
    if (btnMap[key] === id) return padState[key] ? 1 : 0;
  }
  return 0;
}
function env_cb() { return 0 }
function video_cb(ptr, w, h, pitch) {
  const ctx = Module.canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, w, h);
  const imageData = img.data;
  const pixelData = new Uint16Array(Module.HEAPU8.buffer, ptr, (pitch / 2) * h);
  const gameStride = pitch / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIndex = y * gameStride + x;
      const destIndex = (y * w + x) * 4;
      const color = pixelData[srcIndex];
      const r = (color >> 11) & 0x1F;
      const g = (color >> 5) & 0x3F;
      const b = color & 0x1F;
      imageData[destIndex] = (r << 3) | (r >> 2);
      imageData[destIndex + 1] = (g << 2) | (g >> 4);
      imageData[destIndex + 2] = (b << 3) | (b >> 2);
      imageData[destIndex + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
// ===== Core Loader =====
function loadCore(core) {
  return new Promise((resolve, reject) => {
    const cfg = CORE_CONFIG[core];
    const canvas = document.getElementById("screen");
    canvas.width = cfg.width;
    canvas.height = cfg.height;
    RATIO = cfg.ratio;
    window.Module = {
      canvas: canvas,
      onRuntimeInitialized() {
        const envPtr    = Module.addFunction(env_cb, "iii");
        const videoPtr  = Module.addFunction(video_cb, "viiii");
        const audioPtr  = Module.addFunction(audio_cb, "vii");
        const audioBPtr = Module.addFunction(audio_batch_cb, "iii");
        const pollPtr   = Module.addFunction(input_poll_cb, "v");
        const statePtr  = Module.addFunction(input_state_cb, "iiiii");
        Module._retro_set_environment(envPtr);
        Module._retro_set_video_refresh(videoPtr);
        Module._retro_set_audio_sample(audioPtr);
        Module._retro_set_audio_sample_batch(audioBPtr);
        Module._retro_set_input_poll(pollPtr);
        Module._retro_set_input_state(statePtr);
        Module._retro_init();
        resolve();
      }
    };
    const script = document.createElement('script');
    script.src = cfg.script;
    script.onload = () => {};
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
async function loadRomFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const core = Object.entries(CORE_CONFIG).find(([_, cfg]) => cfg.ext.split(',').some(e => e.replace('.', '') === ext))?.[0];
    const rom = new Uint8Array(await file.arrayBuffer());
    await initAudio();
    await loadCore(core);
    const romPtr = Module._malloc(rom.length);
    const info = Module._malloc(16);
    Module.HEAPU8.set(rom, romPtr);
    Module.HEAPU32[(info >> 2) + 0] = 0;
    Module.HEAPU32[(info >> 2) + 1] = romPtr;
    Module.HEAPU32[(info >> 2) + 2] = rom.length;
    Module.HEAPU32[(info >> 2) + 3] = 0;
    Module._retro_load_game(info);
    isRunning = true;
    setTimeout(() => { audioCtx.resume() }, 2000);
};
document.addEventListener("DOMContentLoaded", () => {
// ===== ROM Loader =====
  document.getElementById("resume").onclick = () => { if (audioCtx) audioCtx.resume() };
  document.getElementById("rom").onchange = async (e) => {
    loadRomFile(e.target.files[0]);
  };

  // Virtual gamepad event listeners
  document.querySelectorAll('.btn-control').forEach(btn => {
    const key = btn.getAttribute('data-btn');
    // Mouse/touch start
    btn.addEventListener('mousedown', () => { padState[key] = true; });
    btn.addEventListener('touchstart', e => { padState[key] = true; e.preventDefault(); });
    // Mouse/touch end
    btn.addEventListener('mouseup', () => { padState[key] = false; });
    btn.addEventListener('mouseleave', () => { padState[key] = false; });
    btn.addEventListener('touchend', e => { padState[key] = false; e.preventDefault(); });
    btn.addEventListener('touchcancel', e => { padState[key] = false; e.preventDefault(); });
  });
});