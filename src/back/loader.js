// ===== LibEnvironment =====
function env_cb (cmd, data) {
    if (cmd === 1 || cmd === 10) return 1;
    if (cmd === 3) { if (data) Module.HEAP8[data] = 1; return 1; }
    return 0;
}

// ===== Core =====
const CORE_CONFIG = {
    gba: { ratio: 65536 / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.zip' },
    gbc: { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.zip' },
    snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.zip' },
    nes: { ratio: 44100 / 48000, width: 256, height: 240, ext: '.nes', script: './src/core/quicknes.zip' },
};
var isRunning = false;

async function unzip(src, filter) {
    const isUrl = typeof src === 'string', name = isUrl ? src : src.name, b = new Uint8Array(await (isUrl ? await fetch(src) : src).arrayBuffer());
    if (!name.endsWith('.zip')) return { [name.toLowerCase()]: b };
    const files = fflate.unzipSync(b), res = {};
    for (let n in files) if (files[n].length > 0 && (!filter || filter.test(n))) res[n.split('/').pop().toLowerCase()] = files[n];
    return res;
}

async function initCore(file) {
    const roms = await unzip(file, /\.(gba|gbc|gb|smc|sfc|nes|gen|smd|bin|md)$/i);
    const romKey = Object.keys(roms)[0];
    const cfg = Object.values(CORE_CONFIG).find(c => c.ext.split(',').some(ex => romKey.endsWith(ex.toLowerCase()) || romKey === ex.replace('.', '').toLowerCase()));
    if (!cfg) return;

    let rom = roms[romKey], script = cfg.script;
    if (script.endsWith('.zip')) {
        const core = await unzip(script, /\.(js|wasm)$/i);
        const jsKey = Object.keys(core).find(k => k.endsWith('.js')), wasmKey = Object.keys(core).find(k => k.endsWith('.wasm'));
        let jsData = core[jsKey], last = jsData.length;
        while (last > 0 && jsData[last - 1] === 0) last--;
        script = URL.createObjectURL(new Blob([jsData.slice(0, last)], { type: 'application/javascript' }));
        window.wasmUrl = URL.createObjectURL(new Blob([core[wasmKey]], { type: 'application/wasm' }));
    }

    return new Promise((res) => {
        const canvas = document.getElementById("canvas");
        Object.assign(canvas, { width: cfg.width, height: cfg.height });
        gameView(file.name, cfg); initAudio(cfg);
        window.Module = {
            canvas, locateFile: (p) => p.endsWith('.wasm') ? (window.wasmUrl || p) : p,
            onRuntimeInitialized() {
                const rPtr = Module._malloc(rom.length), iPtr = Module._malloc(16);
                [[Module._retro_set_environment, env_cb, "iii"], [Module._retro_set_video_refresh, video_cb, "viiii"], [Module._retro_set_audio_sample, audio_cb, "vii"], [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"], [Module._retro_set_input_poll, input_poll_cb, "v"], [Module._retro_set_input_state, input_state_cb, "iiiii"]].forEach(([f, c, s]) => f(Module.addFunction(c, s)));
                Module._retro_init(); Module.HEAPU8.set(rom, rPtr); Module.HEAPU32.set([0, rPtr, rom.length, 0], iPtr >> 2); Module._retro_load_game(iPtr);
                (function loop() { Module._retro_run(), requestAnimationFrame(loop) })();
                isRunning = true; res();
            }
        };
        const s = document.createElement('script'); s.src = script; document.body.appendChild(s);
    });
}