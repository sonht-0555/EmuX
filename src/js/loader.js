// ===== LibEnvironment =====
function env_cb() { return 0 }
// ===== Core =====
const CORE_CONFIG = {
  gba:  { ratio: 65536 / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.js' },
  gbc: { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.js' },
  snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.js' }
};
var isRunning = false;
async function initCore(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const core = Object.entries(CORE_CONFIG).find(([_, cfg]) => cfg.ext.split(',').some(e => e.replace('.', '') === ext))?.[0];
  if (!core) return;
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
async function initGame(file) {
    const rom = new Uint8Array(await file.arrayBuffer());
    const romPtr = Module._malloc(rom.length);
    const info = Module._malloc(16);
    Module.HEAPU8.set(rom, romPtr);
    Module.HEAPU32[(info >> 2) + 0] = 0;
    Module.HEAPU32[(info >> 2) + 1] = romPtr;
    Module.HEAPU32[(info >> 2) + 2] = rom.length;
    Module.HEAPU32[(info >> 2) + 3] = 0;
    Module._retro_load_game(info);
    isRunning = true;
    await mainLoop();
}
async function mainLoop() { 
    Module._retro_run(); 
    requestAnimationFrame(mainLoop);
}