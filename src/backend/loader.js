// ===== LibEnvironment =====
var activeVars = {};
var POINTER_CACHE = {};
// ===== getPointer =====
const getPointer = (string, pointer) => {
    if (POINTER_CACHE[string]) {
        return POINTER_CACHE[string];
    }
    pointer = Module._malloc(string.length + 1);
    Module.stringToUTF8(string, pointer, string.length + 1);
    POINTER_CACHE[string] = pointer;
    return pointer;
};
// ===== env_cb =====
function env_cb(command, data) {
    const d32 = Number(data) >> 2;
    if (command === 15) {
        const key = Module.UTF8ToString(Module.HEAP32[d32]);
        if (activeVars[key]) {
            Module.HEAP32[d32 + 1] = getPointer(activeVars[key]);
            return true;
        }
    }
    if (command === 9) {
        Module.HEAP32[d32] = getPointer('.');
        return true;
    }
    return command === 10;
}
// ===== CORE_CONFIG =====
const CORE_CONFIG = [
    { ext: '.nes', script: './src/core/nes.zip', btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.ngp,.ngc', script: './src/core/ngp.zip', btns: { 'btn-1': ['A', 0], 'btn-3': ['B', 8], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.gb,.gbc', script: './src/core/gba.zip', btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.gba', script: './src/core/gba.zip', btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.md,.gen', script: './src/core/genesis.zip', btns: { 'btn-1': ['A', 1], 'btn-3': ['B', 0], 'btn-4': ['C', 8], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.smc,.sfc', script: './src/core/snes2010.zip', btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.zip', script: './src/core/arcade.zip', btns: { 'btn-1': ['A', 0], 'btn-3': ['B', 8], 'btn-2': ['C', 1], 'btn-4': ['D', 9], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' cn.', 2], 'btn-start': [' st.', 3] }, bios: ['./src/core/bios/neogeo.zip'], vars: { 'fbneo-allow-depth-32': 'Disabled', 'fbneo-sample-interpolation': '4-point', 'fbneo-fm-interpolation': 'linear', 'fbneo-lowpass-filter': 'Disabled', 'fbneo-samplerate': '44100', 'fbneo-cpu-speed-adjust': '100', 'fbneo-diagnostic-input': 'Disabled' } },
    { ext: '.nds', script: './src/core/nds2021.zip', btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] }, bios: ['./src/core/bios/bios7.bin', './src/core/bios/bios9.bin', './src/core/bios/firmware.bin'], vars: { melonds_console_mode: 'DS', melonds_boot_directly: 'Enabled', melonds_screen_layout: 'Top/Bottom', melonds_screen_gap: '0', melonds_hybrid_small_screen: 'Disabled', melonds_swapscreen_mode: 'Disabled', melonds_randomize_mac_address: 'Disabled', melonds_touch_mode: 'Touch', melonds_dsi_sdcard: 'Disabled', melonds_mic_input: 'None', melonds_audio_bitrate: 'Low', melonds_audio_interpolation: 'None', melonds_use_fw_settings: 'Disabled', melonds_language: 'English' } },
    { ext: '.bin,.iso,.img,.cue,.pbp', script: './src/core/ps1.zip', btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] }, bios: ['./src/core/bios/scph5501.bin'] },
];
var isRunning = false;
// ===== unzip ====
async function unzip(binaryData, nameFilter) {
    return new Promise((resolve, reject) => {
        fflate.unzip(binaryData, (err, unzippedFiles) => {
            if (err) {
                return resolve({});
            }
            const result = {};
            for (let entryName in unzippedFiles) {
                if (entryName.endsWith('/')) {
                    continue;
                }
                if (unzippedFiles[entryName].length === 0) {
                    continue;
                }
                if (entryName.includes('__MACOSX/')) {
                    continue;
                }
                if (!nameFilter || nameFilter.test(entryName)) {
                    result[entryName] = unzippedFiles[entryName];
                }
            }
            resolve(result);
        });
    });
}
// ===== findCore ====
function findCore(name, data) {
    const nameLower = name.toLowerCase();
    const getExt = n => '.' + n.split('.').pop().toLowerCase();
    if (!nameLower.endsWith('.zip')) {
        const ext = getExt(nameLower);
        const config = CORE_CONFIG.find(c => c.ext.split(',').includes(ext));
        return { config, data, name };
    }
    const list = fflate.unzipSync(data);
    const internalFiles = Object.keys(list);
    for (const fileName of internalFiles) {
        const ext = getExt(fileName);
        const consoleCore = CORE_CONFIG.find(c => c.ext !== '.zip' && c.ext.split(',').includes(ext));
        if (consoleCore) {
            if (ext === '.bin' && internalFiles.length > 5) {
                continue;
            }
            if (consoleCore.ext === '.nes') {
                return { config: consoleCore, data: list[fileName], name: fileName };
            }
            return { config: consoleCore, data, name };
        }
    }
    const arcadeCore = CORE_CONFIG.find(c => c.ext === '.zip');
    return { config: arcadeCore, data, name };
}
// ===== initCore ====
async function initCore(romFile) {
    isRunning = true;
    switch0.hidden = false;
    await notifi("", "", "---", "", true);
    // Nhận diện Core và chuẩn bị dữ liệu ROM
    const rawData = new Uint8Array(await romFile.arrayBuffer());
    const { config, data: finalRomData, name: finalRomName } = findCore(romFile.name, rawData);
    activeVars = config.vars || {};
    updateButtons(config.btns);
    // Step 3: Load core script
    let scriptSource = config.script;
    const isArcade = scriptSource.includes('arcade');
    const isNDS = scriptSource.includes('nds');
    if (scriptSource.endsWith('.zip')) {
        await notifi("", "#", "--", "", true);
        const response = await fetch(scriptSource);
        if (!response.ok) {
            return;
        }
        const coreFiles = await unzip(new Uint8Array(await response.arrayBuffer()), /\.(js|wasm)$/i);
        const javascriptFileName = Object.keys(coreFiles).find(name => name.endsWith('.js'));
        const wasmFileName = Object.keys(coreFiles).find(name => name.endsWith('.wasm'));
        if (!javascriptFileName || !wasmFileName) {
            return;
        }
        // Trim trailing zeros from JS file
        let javascriptBinary = coreFiles[javascriptFileName];
        let javascriptLength = javascriptBinary.length;
        while (javascriptLength > 0 && javascriptBinary[javascriptLength - 1] === 0) {
            javascriptLength--;
        }
        scriptSource = URL.createObjectURL(new Blob([javascriptBinary.slice(0, javascriptLength)], { type: 'application/javascript' }));
        window.wasmUrl = URL.createObjectURL(new Blob([coreFiles[wasmFileName]], { type: 'application/wasm' }));
    }
    // Step 4: Initialize emulator module
    return new Promise(async (resolve) => {
        await notifi("", "##", "-", "", true);
        const canvas = document.getElementById("canvas");
        window.Module = {
            isArcade: isArcade,
            isNDS: isNDS,
            canvas: canvas,
            print: () => {},
            printErr: () => {},
            locateFile: (path) => {
                if (path.endsWith('.wasm')) {
                    return window.wasmUrl || path;
                }
                return path;
            },
            async onRuntimeInitialized() {
                // Allocate memory
                const romPointer = Module._malloc(finalRomData.length);
                const infoPointer = Module._malloc(16);
                // Register callbacks
                const callbacks = [
                    [Module._retro_set_environment, env_cb, "iii"],
                    [Module._retro_set_video_refresh, video_cb, "viiii"],
                    [Module._retro_set_audio_sample, audio_cb, "vii"],
                    [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"],
                    [Module._retro_set_input_poll, input_poll_cb, "v"],
                    [Module._retro_set_input_state, input_state_cb, "iiiii"]
                ];
                callbacks.forEach(([retroFunction, callback, signature]) => {
                    retroFunction(Module.addFunction(callback, signature));
                });
                Module._retro_init();
                await notifi("", "###", "", "", true);
                // Load BIOS files
                if (config.bios) {
                    await Promise.all(config.bios.map(async biosUrl => {
                        const response = await fetch(biosUrl).catch(() => null);
                        if (response?.ok) {
                            const biosData = new Uint8Array(await response.arrayBuffer());
                            const biosFileName = biosUrl.split('/').pop();
                            Module.FS.writeFile('/' + biosFileName, biosData);
                        }
                    }));
                }
                // Setup controller for NDS
                if (isNDS && Module._retro_set_controller_port_device) {
                    Module._retro_set_controller_port_device(0, 6);
                }
                // Write ROM to virtual filesystem
                let romPath;
                if (isArcade) {
                    romPath = '/' + finalRomName;
                } else if (isNDS) {
                    romPath = '/game.nds';
                } else {
                    romPath = '/game.' + finalRomName.toLowerCase().split('.').pop();
                }
                Module.FS.writeFile(romPath, finalRomData);
                // Prepare load info
                const loadInfo = [getPointer(romPath), 0, 0, 0];
                if (!isArcade) {
                    Module.HEAPU8.set(finalRomData, romPointer);
                    loadInfo[1] = romPointer;
                    loadInfo[2] = finalRomData.length;
                }
                Module.HEAPU32.set(loadInfo, Number(infoPointer) >> 2);
                // Load the game
                Module._retro_load_game(infoPointer);
                // Initialize audio
                const avInfoPointer = Module._malloc(120);
                Module._retro_get_system_av_info(avInfoPointer);
                initAudio(Module.HEAPF64[(Number(avInfoPointer) + 32) >> 3] / 48000);
                audioContext.resume();
                Module._free(avInfoPointer);
                // Start main loop
                let rafId;
                function mainLoop() {
                    if (isRunning) {
                        Module._retro_run();
                        rafId = requestAnimationFrame(mainLoop);
                    }
                }
                window.startLoop = () => {
                    if (!rafId) {
                        rafId = requestAnimationFrame(mainLoop);
                    }
                };
                window.stopLoop = () => {
                    if (rafId) {
                        cancelAnimationFrame(rafId);
                        rafId = 0;
                    }
                };
                startLoop();
                // Finalize
                await loadState();
                await timer(true);
                resolve();
            }
        };
        // Inject script to start emulator
        const scriptElement = document.createElement('script');
        scriptElement.src = scriptSource;
        document.body.appendChild(scriptElement);
        gameName = romFile.name;
    });
}