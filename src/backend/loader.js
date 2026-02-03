// ===== LibEnvironment =====
var activeVars = {}, POINTER_CACHE = {};
const getPointer = (string, pointer) => POINTER_CACHE[string] || (POINTER_CACHE[string] = (pointer = Module._malloc(string.length + 1), Module.stringToUTF8(string, pointer, string.length + 1), pointer));
function env_cb(command, data) {
if (command === 15) {
    const key = Module.UTF8ToString(Module.HEAP32[data >> 2]);
    console.log(`[Core] ${key}`);
    if (activeVars[key]) return (Module.HEAP32[(data >> 2) + 1] = getPointer(activeVars[key]), true);
}
    if (command === 9) return (Module.HEAP32[data >> 2] = getPointer('.'), true);
    return command === 10;
}
// ===== Core =====
const CORE_CONFIG = [
    { ext: '.nes', script: './src/core/nes.zip',                     btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': ['', ''], 'btn-r': ['', ''], 'btn-select': ['', 2], 'btn-start': ['', 3] } },
    { ext: '.ngp,.ngc', script: './src/core/ngp.zip',                btns: { 'btn-1': ['A', 0], 'btn-3': ['B', 8], 'btn-l': ['', ''], 'btn-r': ['', ''], 'btn-select': ['', 2], 'btn-start': ['', 3] } },
    { ext: '.gb,.gbc', script: './src/core/gba.zip',                 btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': ['', ''], 'btn-r': ['', ''], 'btn-select': ['', 2], 'btn-start': ['', 3] } },
    { ext: '.gba', script: './src/core/gba.zip',                     btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': ['', 10], 'btn-r': ['', 11], 'btn-select': ['', 2], 'btn-start': ['', 3] } },
    { ext: '.md,.gen', script: './src/core/genesis.zip',             btns: { 'btn-3': ['A', 1], 'btn-1': ['B', 0], 'btn-2': ['C', 8], 'btn-l': ['', ''], 'btn-r': ['', ''], 'btn-select': ['', 2], 'btn-start': ['', 3] } },
    { ext: '.smc,.sfc', script: './src/core/snes2010.zip',           btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': ['', 10], 'btn-r': ['', 11], 'btn-select': ['', 2], 'btn-start': ['', 3] } },
    { ext: '.zip', script: './src/core/arcade.zip',                  btns: { 'btn-1': ['A', 0], 'btn-2': ['B', 8], 'btn-3': ['C', 1], 'btn-4': ['D', 9], 'btn-l': ['', ''], 'btn-r': ['', ''], 'btn-select': ['', 2], 'btn-start': ['', 3] }, bios: ['./src/core/bios/neogeo.zip'], vars: { 'fbneo-allow-depth-32': 'Disabled', 'fbneo-sample-interpolation': '4-point', 'fbneo-fm-interpolation': 'linear', 'fbneo-lowpass-filter': 'Disabled', 'fbneo-samplerate': '44100', 'fbneo-cpu-speed-adjust': '100', 'fbneo-diagnostic-input': 'Disabled' } },
    { ext: '.nds', script: './src/core/nds.zip',                     btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': ['', 10], 'btn-r': ['', 11], 'btn-select': ['', 2], 'btn-start': ['', 3] }, bios: ['./src/core/bios/bios7.bin', './src/core/bios/bios9.bin', './src/core/bios/firmware.bin'], vars: { melonds_console_mode: 'DS', melonds_boot_directly: 'Enabled', melonds_screen_layout: 'Top/Bottom', melonds_screen_gap: '0', melonds_hybrid_small_screen: 'Disabled', melonds_swapscreen_mode: 'Disabled', melonds_randomize_mac_address: 'Disabled', melonds_touch_mode: 'Touch', melonds_dsi_sdcard: 'Disabled', melonds_mic_input: 'None', melonds_audio_bitrate: 'Low', melonds_audio_interpolation: 'None', melonds_use_fw_settings: 'Disabled', melonds_language: 'English' } },
    { ext: '.bin,.iso,.img,.cue,.pbp', script: './src/core/ps1.zip', btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': ['', 10], 'btn-r': ['', 11], 'btn-select': ['', 2], 'btn-start': ['', 3] }, bios: ['./src/core/bios/scph5501.bin'] },
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
    activeVars = coreConfig.vars || {};
    updateButtons(coreConfig.btns);
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
            print: () => {}, printErr: () => {},
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