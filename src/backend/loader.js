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
// ===== initCore ====
async function initCore(romFile) {
    // Step 1: Identify core and prepare data
    const rawData = new Uint8Array(await romFile.arrayBuffer());
    const { config, data: finalRomData, name: finalRomName } = findCore(romFile.name, rawData);
    if (!config) return;
    // Step 2: Setup UI and state
    await notifi("", "", "---", "", true);
    isRunning = true;
    switch0.hidden = false;
    activeVars = config.vars || {};
    updateButtons(config.btns);
    const isArcade = config.script.includes('arcade');
    const isNDS = config.script.includes('nds');
    let scriptSource = config.script;
    // Step 3: Load core assets (handle ZIP)
    await notifi("", "#", "--", "", true);
    if (scriptSource.endsWith('.zip')) {
        const response = await fetch(scriptSource);
        if (!response.ok) return;
        const coreFiles = await unzip(new Uint8Array(await response.arrayBuffer()), /\.(js|wasm)$/i);
        const jsFile = Object.keys(coreFiles).find(n => n.endsWith('.js'));
        const wasmFile = Object.keys(coreFiles).find(n => n.endsWith('.wasm'));
        if (!jsFile || !wasmFile) return;
        scriptSource = URL.createObjectURL(new Blob([coreFiles[jsFile]], { type: 'application/javascript' }));
        window.wasmUrl = URL.createObjectURL(new Blob([coreFiles[wasmFile]], { type: 'application/wasm' }));
    }
    // Step 4: Initialize emulator module
    await notifi("", "##", "-", "", true);
    return new Promise(async (resolve) => {
        window.Module = {
            isArcade, isNDS,
            canvas: document.getElementById("canvas"),
            print: () => {}, printErr: () => {},
            locateFile: p => p.endsWith('.wasm') ? (window.wasmUrl || p) : p,
            async onRuntimeInitialized() {
                // Step 5: Core engine setup
                const romPointer = Module._malloc(finalRomData.length);
                const infoPointer = Module._malloc(16);
                const callbacks = [
                    [Module._retro_set_environment, env_cb, "iii"],
                    [Module._retro_set_video_refresh, video_cb, "viiii"],
                    [Module._retro_set_audio_sample, audio_cb, "vii"],
                    [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"],
                    [Module._retro_set_input_poll, input_poll_cb, "v"],
                    [Module._retro_set_input_state, input_state_cb, "iiiii"]
                ];
                callbacks.forEach(([fn, cb, sig]) => fn(Module.addFunction(cb, sig)));
                Module._retro_init();
                // Step 6: BIOS management
                await notifi("", "###", "", "", true);
                if (config.bios) {
                    await Promise.all(config.bios.map(async url => {
                        const res = await fetch(url).catch(() => null);
                        if (res?.ok) {
                            Module.FS.writeFile('/' + url.split('/').pop(), new Uint8Array(await res.arrayBuffer()));
                        }
                    }));
                }
                if (isNDS && Module._retro_set_controller_port_device) {
                    Module._retro_set_controller_port_device(0, 6);
                }
                // Step 7: ROM mapping and game load
                let romPath = isArcade ? `/${finalRomName}` : (isNDS ? '/game.nds' : `/game.${finalRomName.toLowerCase().split('.').pop()}`);
                Module.FS.writeFile(romPath, finalRomData);
                const loadInfo = [getPointer(romPath), 0, 0, 0];
                if (!isArcade) {
                    Module.HEAPU8.set(finalRomData, romPointer);
                    loadInfo[1] = romPointer;
                    loadInfo[2] = finalRomData.length;
                }
                Module.HEAPU32.set(loadInfo, Number(infoPointer) >> 2);
                Module._retro_load_game(infoPointer);
                // Step 8: Audio & render loop start
                const avPtr = Module._malloc(120);
                Module._retro_get_system_av_info(avPtr);
                initAudio(Module.HEAPF64[(Number(avPtr) + 32) >> 3] / 48000);
                audioContext.resume();
                Module._free(avPtr);
                let rafId;
                function mainLoop() {
                    if (isRunning) {
                        Module._retro_run();
                        rafId = requestAnimationFrame(mainLoop);
                    }
                }
                window.startLoop = () => { if (!rafId) rafId = requestAnimationFrame(mainLoop); };
                window.stopLoop = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } };
                startLoop();
                await loadState();
                await timer(true);
                resolve();
            }
        };
        // Step 9: Inject script to start engine
        const script = document.createElement('script');
        script.src = scriptSource;
        document.body.appendChild(script);
        gameName = romFile.name;
    });
}