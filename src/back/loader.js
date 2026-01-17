// ===== LibEnvironment =====
function env_cb(cmd, data) { return 0 };
// ===== Core =====
const CORE_CONFIG = {
  gba: { ratio: 65536 / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.js' },
  gbc: { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.js' },
  snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.js' },
  nes: { ratio: 29780 / 48000, width: 256, height: 240, ext: '.nes', script: './src/core/nes.js' }
};
var isRunning = false;
async function initCore(file) {
  let ext = file.name.split('.').pop().toLowerCase(), rom, cfg;
  if (ext === 'zip') {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const n = Object.keys(zip.files).find(n => /\.(gba|gbc|gb|smc|sfc)$/i.test(n));
    if (!n) return;
    ext = n.split('.').pop().toLowerCase();
    rom = await zip.files[n].async('uint8array');
  } else {
    rom = new Uint8Array(await file.arrayBuffer());
  }
  cfg = Object.values(CORE_CONFIG).find(c => c.ext.includes(ext));
  if (!cfg) return;
  return new Promise((resolve, reject) => {
    const canvas = document.getElementById("canvas");
    canvas.width = cfg.width;
    canvas.height = cfg.height;
    gameView(file.name, cfg)
    initAudio(cfg);
    window.Module = {
      canvas, onRuntimeInitialized() {
        const romPtr = Module._malloc(rom.length);
        const info = Module._malloc(16);
        [[Module._retro_set_environment, env_cb, "iii"],
        [Module._retro_set_video_refresh, video_cb, "viiii"],
        [Module._retro_set_audio_sample, audio_cb, "vii"],
        [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"],
        [Module._retro_set_input_poll, input_poll_cb, "v"],
        [Module._retro_set_input_state, input_state_cb, "iiiii"]
        ].forEach(([fn, cb, sig]) => fn(Module.addFunction(cb, sig)));
        Module._retro_init();
        Module.HEAPU8.set(rom, romPtr);
        Module.HEAPU32.set([0, romPtr, rom.length, 0], info >> 2);
        Module._retro_load_game(info);
        (function loop() { Module._retro_run(), requestAnimationFrame(loop) })();
        rom = null;
        resolve();
        isRunning = true;
      }
    };
    const script = document.createElement('script');
    script.src = cfg.script;
    script.onload = () => { };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}