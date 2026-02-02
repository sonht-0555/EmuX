// ===== LibEnvironment =====
const CORE_VARIABLES = { 'melonds_touch_mode': 'Touch', 'melonds_screen_layout': 'Top/Bottom', 'melonds_threaded_renderer': 'Disabled', 'melonds_jit_enable': 'Enabled', 'melonds_audio_interpolation': 'None', 'melonds_filtering': 'nearest', 'melonds_boot_directly': 'Enabled', 'mgba_skip_bios': 'Enabled', 'snes9x_skip_bios': 'Enabled', 'pcsx_rearmed_skip_bios': 'Enabled', 'genesis_plus_gx_bram': '64KB', 'fbneo-frameskip': '0' }, POINTER_CACHE = {};
const getPointer = (string, pointer) => POINTER_CACHE[string] || (POINTER_CACHE[string] = (pointer = Module._malloc(string.length + 1), Module.stringToUTF8(string, pointer, string.length + 1), pointer));
function env_cb(command, data) {
    if (command === 15) {
        const key = Module.UTF8ToString(Module.HEAP32[data >> 2]);
        if (CORE_VARIABLES[key]) return (Module.HEAP32[(data >> 2) + 1] = getPointer(CORE_VARIABLES[key]), true);
    }
    if (command === 9) return (Module.HEAP32[data >> 2] = getPointer('.'), true);
    return command === 10;
}
// ===== Core =====
const CORE_CONFIG = [
    { ext: '.gba', script: './src/core/gba.zip' },
    { ext: '.gb,.gbc', script: './src/core/gba.zip' },
    { ext: '.smc,.sfc', script: './src/core/snes2010.zip' },
    { ext: '.nes', script: './src/core/nes.zip' },
    { ext: '.zip', script: './src/core/arcade.zip', bios: ['./src/core/bios/neogeo.zip'] },
    { ext: '.md,.gen', script: './src/core/genesis.zip' },
    { ext: '.ngp,.ngc', script: './src/core/ngp.zip' },
    { ext: '.nds', script: './src/core/nds.zip', bios: ['./src/core/bios/bios7.bin', './src/core/bios/bios9.bin', './src/core/bios/firmware.bin'] },
    { ext: '.bin,.iso,.img,.cue,.pbp', script: './src/core/ps1.zip', bios: ['./src/core/bios/scph5501.bin'] },
];
var isRunning = false;
// ===== Unzip ====
async function unzip(binaryData, nameFilter) {
    return new Promise((resolve, reject) => {
        fflate.unzip(binaryData, (err, unzippedFiles) => {
            if (err) return resolve({});
            const result = {};
            for (let entryName in unzippedFiles) {
                if (entryName.endsWith('/') || unzippedFiles[entryName].length === 0 || entryName.includes('__MACOSX/')) continue;
                if (!nameFilter || nameFilter.test(entryName)) {
                    result[entryName] = unzippedFiles[entryName];
                }
            }
            resolve(result);
        });
    });
}
// ===== initCore ====
async function initCore(romFile) {
    isRunning = true;
    const lowName = romFile.name.toLowerCase();
    const isZip = lowName.endsWith('.zip');
    const romBuffer = await romFile.arrayBuffer();
    const binaryData = new Uint8Array(romBuffer);
    let finalRomName = romFile.name, finalRomData = binaryData;
    const consoleExts = /\.(gba|gbc|gb|smc|sfc|nes|md|gen|ngp|ngc|nds|img|cue|pbp)$/i;
    if (isZip) {
        notifi("","","---","")
        const extracted = await unzip(binaryData, consoleExts);
        const consoleRomName = Object.keys(extracted)[0];
        if (consoleRomName) {
            finalRomName = consoleRomName;
            finalRomData = extracted[consoleRomName];
        }
    }
    const finalLowName = finalRomName.toLowerCase();
    const coreConfig = CORE_CONFIG.find(cfg => 
        cfg.ext.split(',').map(e => e.trim().toLowerCase()).filter(e => e).some(ext => 
            finalLowName.endsWith(ext) || finalLowName === ext.replace('.', '')
        )
    ); 
    if (!coreConfig) return notifi("Error","Unknown","Core","");
    let scriptSource = coreConfig.script;
    const isArcade = scriptSource.includes('arcade');
    const isNDS = scriptSource.includes('nds');
    if (scriptSource.endsWith('.zip')) {
        notifi("","#","--","")
        const response = await fetch(scriptSource);
        if (!response.ok) return;
        const bundleBuffer = await response.arrayBuffer();
        const coreFiles = await unzip(new Uint8Array(bundleBuffer), /\.(js|wasm)$/i);
        const jsName = Object.keys(coreFiles).find(n => n.endsWith('.js'));
        const wasmName = Object.keys(coreFiles).find(n => n.endsWith('.wasm'));
        if (!jsName || !wasmName) return;
        let jsBin = coreFiles[jsName], jsLen = jsBin.length;
        while (jsLen > 0 && jsBin[jsLen - 1] === 0) jsLen--;
        scriptSource = URL.createObjectURL(new Blob([jsBin.slice(0, jsLen)], { type: 'application/javascript' }));
        window.wasmUrl = URL.createObjectURL(new Blob([coreFiles[wasmName]], { type: 'application/wasm' }));
    }
    return new Promise((resolve) => {
        notifi("","##","-","")
        const canvas = document.getElementById("canvas");
        window.Module = {
            isArcade, isNDS, canvas,
            locateFile: (path) => path.endsWith('.wasm') ? (window.wasmUrl || path) : path,
            async onRuntimeInitialized() {
                const romPointer = Module._malloc(finalRomData.length), infoPointer = Module._malloc(16);
                [[Module._retro_set_environment, env_cb, "iii"], 
                 [Module._retro_set_video_refresh, video_cb, "viiii"], 
                 [Module._retro_set_audio_sample, audio_cb, "vii"], 
                 [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"], 
                 [Module._retro_set_input_poll, input_poll_cb, "v"], 
                 [Module._retro_set_input_state, input_state_cb, "iiiii"]
                ].forEach(([retroFunction, callback, signature]) => retroFunction(Module.addFunction(callback, signature)));
                Module._retro_init();
                notifi("","###","","");
                if (coreConfig.bios) {
                    await Promise.all(coreConfig.bios.map(async url => {
                        const res = await fetch(url).catch(() => null);
                        if (res?.ok) Module.FS.writeFile('/' + url.split('/').pop(), new Uint8Array(await res.arrayBuffer()));
                    }));
                }
                if (isNDS && Module._retro_set_controller_port_device) Module._retro_set_controller_port_device(0, 6);
                const romPath = isArcade ? `/${finalRomName}` : (isNDS ? '/game.nds' : `/game.${finalLowName.split('.').pop()}`);
                Module.FS.writeFile(romPath, finalRomData);
                const loadInfo = [getPointer(romPath), 0, 0, 0];
                if (!isArcade) {
                    Module.HEAPU8.set(finalRomData, romPointer);
                    loadInfo[1] = romPointer;
                    loadInfo[2] = finalRomData.length;
                }
                Module.HEAPU32.set(loadInfo, infoPointer >> 2);
                Module._retro_load_game(infoPointer);
                const avInfo = Module._malloc(120);
                Module._retro_get_system_av_info(avInfo);
                initAudio(Module.HEAPF64[(avInfo + 32) >> 3] / 48000);
                audioCtx.resume();
                Module._free(avInfo);
                (function mainLoop() { if (isRunning) Module._retro_run(); requestAnimationFrame(mainLoop) })();
                await loadState();
                await timer(true);
                resolve();
            }
        };
        const scriptElement = document.createElement('script'); scriptElement.src = scriptSource; document.body.appendChild(scriptElement);
        gameName = romFile.name;
    });
}