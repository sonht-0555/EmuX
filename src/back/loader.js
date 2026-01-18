function env_cb(cmd, data) {
  switch (cmd) {
    case 1: case 10: // SET_PIXEL_FORMAT
      if (data) Module.pixelFormat = Module.HEAP32[data >> 2];
      return 1;
    case 11:         // SET_INPUT_DESCRIPTORS
    case 16:         // GET_INPUT_BITMASKS
      return 1;
    case 17:         // GET_VARIABLE_UPDATE
      return 0;
    case 65587: case 65583: // GET_AUDIO_VIDEO_ENABLE
      if (data) Module.HEAP32[data >> 2] = 0x7;
      return 1;
    case 9: case 14:
      if (data) {
        if (!env_cb.p) env_cb.p = Module._malloc(2), Module.HEAPU8.set([46, 0], env_cb.p);
        Module.HEAPU32[data >> 2] = env_cb.p;
        return 1;
      }
    default: return 0;
  }
}
// ===== Core =====
const CORE_CONFIG = {
  gba: { ratio: 65536 / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.js' },
  gbc: { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.js' },
  snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.js' },
  nes: { ratio: 44100 / 48000, width: 256, height: 240, ext: '.nes', script: './src/core/nes.js' },
  genesis: { ratio: 48000 / 48000, width: 320, height: 224, ext: '.md,.gen', script: './src/core/genesis.js' },
  neogeo: { ratio: 44100 / 48000, width: 160, height: 152, ext: '.ngc,.ngp', script: './src/core/neogeo.js' },
  fbneo: { ratio: 44100 / 48000, width: 320, height: 224, ext: '.zip,.neo', script: './src/core/fbneo.js' },
  mame2003: { ratio: 44100 / 48000, width: 320, height: 240, ext: '.zip', script: './src/core/mame2003_libretro.js' }
};
var isRunning = false;
async function initCore(file) {
  let ext = file.name.split('.').pop().toLowerCase(), rom, cfg;

  // Decide core first to handle arcade ZIPs correctly
  cfg = Object.values(CORE_CONFIG).find(c => c.ext.includes(ext));
  if (!cfg) return;

  if (ext === 'zip' && !['mame2003', 'fbneo'].includes(cfg.script.split('/').pop().split('.')[0])) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const n = Object.keys(zip.files).find(n => /\.(gba|gbc|gb|smc|sfc|nes|gen|md)$/i.test(n));
    if (!n) return;
    ext = n.split('.').pop().toLowerCase();
    rom = await zip.files[n].async('uint8array');
    // Re-check config based on the internal extension
    cfg = Object.values(CORE_CONFIG).find(c => c.ext.includes(ext));
  } else {
    rom = new Uint8Array(await file.arrayBuffer());
  }

  if (!cfg) return;
  return new Promise((resolve, reject) => {
    const canvas = document.getElementById("canvas");
    canvas.width = cfg.width; canvas.height = cfg.height;
    gameView(file.name, cfg); initAudio(cfg);
    window.Module = {
      canvas, onRuntimeInitialized() {
        const b = new TextEncoder().encode(file.name + '\0');
        const pp = Module._malloc(b.length); Module.HEAPU8.set(b, pp);
        const rp = Module._malloc(rom.length); Module.HEAPU8.set(rom, rp);
        const info = Module._malloc(16);
        const callbacks = [
          ['retro_set_environment', env_cb, "iii"],
          ['retro_set_video_refresh', video_cb, "viiii"],
          ['retro_set_audio_sample', audio_cb, "vii"],
          ['retro_set_audio_sample_batch', audio_batch_cb, "iii"],
          ['retro_set_input_poll', input_poll_cb, "v"],
          ['retro_set_input_state', input_state_cb, "iiiii"]
        ];
        callbacks.forEach(([name, cb, sig]) => {
          const fn = Module['_' + name];
          if (fn) fn(Module.addFunction(cb, sig));
        });
        Module._retro_init();
        Module.HEAPU32.set([pp, rp, rom.length, 0], info >> 2);
        Module._retro_load_game(info);
        (function loop() { Module._retro_run(), requestAnimationFrame(loop) })();
        rom = null; isRunning = true; resolve();
      }
    };
    const script = document.createElement('script');
    script.src = cfg.script; document.body.appendChild(script);
  });
}