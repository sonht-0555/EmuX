// ===== Core Config =====
const CORE_CONFIG = {
  gba:  { ratio: 65760 / 48000, width: 240, height: 160, ext: '.gba', script: './mgba.js' },
  snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './snes9x.js' }
};

// ===== Audio =====
let audioCtx, processor;
let isRunning = false;

// FIFO
let fifoHead = 0, fifoCnt = 0;
const FIFO_SIZE = 8192;
const fifoL = new Int16Array(FIFO_SIZE);
const fifoR = new Int16Array(FIFO_SIZE);

// ===== Video buffer =====
let frameBuf = null;
let frameW = 0, frameH = 0, framePitch = 0;
let pendingFrame = false;
let imgData = null;

// ===== Init Audio =====
function initAudio() {
  if (audioCtx) return audioCtx.resume();

  audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 48000
  });

  processor = audioCtx.createScriptProcessor(1024, 0, 2);
  processor.onaudioprocess = audioProcess;
  processor.connect(audioCtx.destination);

  return audioCtx.resume();
}

// ===== Audio callback =====
// ⚠️ TUYỆT ĐỐI KHÔNG render, KHÔNG đụng canvas ở đây
function audioProcess(e) {
  const L = e.outputBuffer.getChannelData(0);
  const R = e.outputBuffer.getChannelData(1);

  // Drive core bằng audio (đúng iOS)
  if (isRunning) {
    Module._retro_run();
  }

  for (let i = 0; i < L.length; i++) {
    if (fifoCnt > 0) {
      L[i] = fifoL[fifoHead] / 32768;
      R[i] = fifoR[fifoHead] / 32768;
      fifoHead = (fifoHead + 1) & (FIFO_SIZE - 1);
      fifoCnt--;
    } else {
      L[i] = R[i] = 0;
    }
  }

  // Nếu có frame mới → xin render 1 lần
  if (pendingFrame) {
    requestAnimationFrame(presentFrame);
  }
}

// ===== libretro audio =====
function audio_cb() {}

function audio_batch_cb(ptr, frames) {
  if (fifoCnt + frames >= FIFO_SIZE) return frames;

  const src = new Int16Array(Module.HEAPU8.buffer, ptr, frames * 2);
  let tail = (fifoHead + fifoCnt) & (FIFO_SIZE - 1);

  for (let i = 0; i < frames; i++) {
    fifoL[tail] = src[i * 2];
    fifoR[tail] = src[i * 2 + 1];
    tail = (tail + 1) & (FIFO_SIZE - 1);
  }

  fifoCnt += frames;
  return frames;
}

// ===== Input =====
function input_poll_cb() {}

const padState = {
  up: false, down: false, left: false, right: false,
  a: false, b: false, x: false, y: false,
  l: false, r: false, start: false, select: false
};

const btnMap = {
  up: 4, down: 5, left: 6, right: 7,
  a: 8, b: 0, x: 9, y: 1,
  l: 10, r: 11, start: 3, select: 2
};

function input_state_cb(port, device, index, id) {
  if (port !== 0 || device !== 1) return 0;
  for (const k in btnMap) {
    if (btnMap[k] === id) return padState[k] ? 1 : 0;
  }
  return 0;
}

// ===== Env =====
function env_cb() { return 0; }

// ===== Video callback =====
// ⚠️ CHỈ COPY FRAME – KHÔNG VẼ
function video_cb(ptr, w, h, pitch) {
  frameW = w;
  frameH = h;
  framePitch = pitch >> 1;

  if (!frameBuf || frameBuf.length !== framePitch * h) {
    frameBuf = new Uint16Array(framePitch * h);
  }

  frameBuf.set(
    new Uint16Array(Module.HEAPU8.buffer, ptr, framePitch * h)
  );

  pendingFrame = true;
}

// ===== Render (main thread, 1-shot) =====
function presentFrame() {
  if (!pendingFrame) return;
  pendingFrame = false;

  const ctx = Module.canvas.getContext("2d");

  if (!imgData) {
    imgData = ctx.createImageData(frameW, frameH);
  }

  const dst = imgData.data;
  let di = 0;

  for (let y = 0; y < frameH; y++) {
    let si = y * framePitch;
    for (let x = 0; x < frameW; x++) {
      const c = frameBuf[si++];
      dst[di++] = (c >> 8) & 0xF8;
      dst[di++] = (c >> 3) & 0xFC;
      dst[di++] = (c << 3) & 0xF8;
      dst[di++] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// ===== Core Loader =====
function loadCore(core) {
  return new Promise((resolve, reject) => {
    const cfg = CORE_CONFIG[core];
    const canvas = document.getElementById("screen");
    canvas.width = cfg.width;
    canvas.height = cfg.height;

    window.Module = {
      canvas,
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
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

// ===== Load ROM =====
async function loadRomFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const core = Object.entries(CORE_CONFIG)
    .find(([_, cfg]) => cfg.ext.split(',').some(e => e.replace('.', '') === ext))?.[0];

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
}

// ===== DOM =====
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("rom").onchange = e => {
    loadRomFile(e.target.files[0]);
  };

  document.querySelectorAll('.btn-control').forEach(btn => {
    const key = btn.dataset.btn;

    const press = e => {
      padState[key] = true;
      e.preventDefault();
      if (pendingFrame) requestAnimationFrame(presentFrame);
    };

    const release = e => {
      padState[key] = false;
      e.preventDefault();
    };

    btn.addEventListener('mousedown', press);
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
  });
});
