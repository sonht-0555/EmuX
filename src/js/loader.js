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
  const rom = new Uint8Array(await file.arrayBuffer());
  if (!core) return;
  return new Promise((resolve, reject) => {
    const cfg = CORE_CONFIG[core];
    const canvas = document.getElementById("screen");
    canvas.width = cfg.width;
    canvas.height = cfg.height;
    RATIO = cfg.ratio;
    initAudio();
    window.Module = {
      canvas: canvas,
      onRuntimeInitialized() {   
        isRunning = true;     
        const romPtr    = Module._malloc(rom.length);
        const info      = Module._malloc(16);
        Module._retro_set_environment(Module.addFunction(env_cb, "iii"));
        Module._retro_set_video_refresh(Module.addFunction(video_cb, "viiii"));
        Module._retro_set_audio_sample(Module.addFunction(audio_cb, "vii"));
        Module._retro_set_audio_sample_batch(Module.addFunction(audio_batch_cb, "iii"));
        Module._retro_set_input_poll(Module.addFunction(input_poll_cb, "v"));
        Module._retro_set_input_state(Module.addFunction(input_state_cb, "iiiii"));
        Module._retro_init();
        Module.HEAPU8.set(rom, romPtr);
        Module.HEAPU32[(info >> 2) + 0] = 0;
        Module.HEAPU32[(info >> 2) + 1] = romPtr;
        Module.HEAPU32[(info >> 2) + 2] = rom.length;
        Module.HEAPU32[(info >> 2) + 3] = 0;
        Module._retro_load_game(info);
        mainLoop();
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
function mainLoop() { 
  Module._retro_run(); 
  requestAnimationFrame(mainLoop);
}