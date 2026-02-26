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
    const data32 = Number(data) >> 2;
    if (command === 1) Module.pixelFormat = Module.HEAP32[data32];
    if (command === 15) {
        const key = Module.UTF8ToString(Module.HEAP32[data32]);
        if (activeVars[key]) {
            Module.HEAP32[data32 + 1] = getPointer(activeVars[key]);
            return true;
        }
    }
    if (command === 9) {
        Module.HEAP32[data32] = getPointer('.');
        return true;
    }
    return command === 10;
}
// ===== CORE_CONFIG =====
const CORE_BASE = 'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/';
const CORE_CONFIG = [
    {ext: '.nes', script: CORE_BASE + 'nes.zip', btns: {'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}},
    {ext: '.ngp,.ngc', script: CORE_BASE + 'ngp.zip', btns: {'btn-1': ['A', 0], 'btn-3': ['B', 8], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}},
    {ext: '.gb,.gbc', script: CORE_BASE + 'gba.zip', btns: {'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}},
    {ext: '.gba', script: CORE_BASE + 'gba.zip', btns: {'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}},
    {ext: '.pce,.sgx,.chd', script: CORE_BASE + 'pce.zip', btns: {'btn-1': [' I', 0], 'btn-3': [' II', 8], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}, bios: ['./src/utils/bios/syscard3.pce']},
    {ext: '.md,.gen', script: CORE_BASE + 'genesis.zip', btns: {'btn-1': ['A', 1], 'btn-3': ['B', 0], 'btn-4': ['C', 8], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}},
    {ext: '.smc,.sfc', script: CORE_BASE + 'snes2010.zip', btns: {'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}},
    {ext: '.zip', script: CORE_BASE + 'arcade.zip', btns: {'btn-1': ['A', 0], 'btn-3': ['B', 8], 'btn-2': ['C', 1], 'btn-4': ['D', 9], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' cn.', 2], 'btn-start': [' st.', 3]}, bios: ['./src/utils/bios/neogeo.zip'], vars: {'fbneo-allow-depth-32': 'Disabled', 'fbneo-sample-interpolation': '4-point', 'fbneo-fm-interpolation': 'linear', 'fbneo-lowpass-filter': 'Disabled', 'fbneo-samplerate': '44100', 'fbneo-cpu-speed-adjust': '100', 'fbneo-diagnostic-input': 'Disabled'}},
    {ext: '.nds', script: CORE_BASE + 'nds2021.zip', btns: {'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}, bios: ['./src/utils/bios/bios7.bin', './src/utils/bios/bios9.bin', './src/utils/bios/firmware.bin'], vars: {melonds_console_mode: 'DS', melonds_boot_directly: 'Enabled', melonds_screen_layout: 'Top/Bottom', melonds_screen_gap: '0', melonds_hybrid_small_screen: 'Disabled', melonds_swapscreen_mode: 'Disabled', melonds_randomize_mac_address: 'Disabled', melonds_touch_mode: 'Touch', melonds_dsi_sdcard: 'Disabled', melonds_mic_input: 'None', melonds_audio_bitrate: 'Low', melonds_audio_interpolation: 'None', melonds_use_fw_settings: 'Disabled', melonds_language: 'English'}},
    {ext: '.bin,.iso,.img,.pbp,.chd', script: CORE_BASE + 'ps1.zip', btns: {'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3]}, bios: ['./src/utils/bios/scph5501.bin']},
];
var isRunning = false;
// ===== initCore ====
async function initCore(romFile) {
    // Step 1: Identify core and start parallel loading
    isRunning = true, switch0.hidden = false;
    await showNotification("", "", "---", "", true);
    let rawData = new Uint8Array(await romFile.arrayBuffer());
    const {config, data: finalRomData, name: finalRomName} = findCore(romFile.name, rawData);
    if (!config) return;
    rawData = null;
    const coreFetch = fetch(config.script).then(response => response.ok ? response.arrayBuffer() : null);
    const biosFetches = config.bios ? config.bios.map(url => fetch(url).then(response => response.ok ? response.arrayBuffer() : null).catch(() => null)) : [];
    // Step 2: Setup State
    activeVars = config.vars || {};
    updateButtons(config.btns);
    const isArcade = config.script.includes('arcade'), isNDS = config.script.includes('nds');
    let scriptSource = config.script;
    // Step 3: Prepare Core Engine
    await showNotification("", "#", "--", "", true);
    if (scriptSource.endsWith('.zip')) {
        const coreBuffer = await coreFetch;
        if (!coreBuffer) return;
        const coreFiles = fflate.unzipSync(new Uint8Array(coreBuffer));
        let jsFile, wasmFile;
        for (const name of Object.keys(coreFiles)) {if (name.endsWith('.js')) jsFile = name; if (name.endsWith('.wasm')) wasmFile = name;}
        if (!jsFile || !wasmFile) return;
        scriptSource = URL.createObjectURL(new Blob([coreFiles[jsFile]], {type: 'application/javascript'}));
        window.wasmUrl = URL.createObjectURL(new Blob([coreFiles[wasmFile]], {type: 'application/wasm'}));
    }
    // Step 4: Initialize emulator module
    return new Promise(async (resolve) => {
        await showNotification("", "##", "-", "", true);
        window.Module = {
            isArcade, isNDS, canvas: document.getElementById("canvas"),
            print: () => { }, printErr: () => { },
            locateFile: path => path.endsWith('.wasm') ? (window.wasmUrl || path) : path,
            async onRuntimeInitialized() {
                // Step 5: Core engine setup
                const romPointer = Module._malloc(finalRomData.length), infoPointer = Module._malloc(16);
                const callbacks = [[Module._retro_set_environment, env_cb, "iii"], [Module._retro_set_video_refresh, video_cb, "viiii"], [Module._retro_set_audio_sample, audio_cb, "vii"], [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"], [Module._retro_set_input_poll, input_poll_cb, "v"], [Module._retro_set_input_state, input_state_cb, "iiiii"]];
                callbacks.forEach(([functionPointer, callback, signature]) => functionPointer(Module.addFunction(callback, signature)));
                Module._retro_init();
                // Step 6: BIOS management
                if (biosFetches.length > 0) {
                    const biosBuffers = await Promise.all(biosFetches);
                    config.bios.forEach((url, index) => biosBuffers[index] && Module.FS.writeFile('/' + url.split('/').pop(), new Uint8Array(biosBuffers[index])));
                }
                if (isNDS && Module._retro_set_controller_port_device) Module._retro_set_controller_port_device(0, 6);
                // Step 7: ROM mapping and game load
                await showNotification("", "###", "", "", true);
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
                const audioVideoPointer = Module._malloc(120);
                Module._retro_get_system_av_info(audioVideoPointer);
                initAudio(Module.HEAPF64[(Number(audioVideoPointer) + 32) >> 3]);
                audioContext.resume();
                Module._free(audioVideoPointer);
                if (window.resetAudioSync) window.resetAudioSync();
                const session = Math.random();
                window.currentSessionId = session;
                function mainLoop() {
                    if (!isRunning || window.currentSessionId !== session) return window.mainRafId = 0;
                    window.mainRafId = requestAnimationFrame(mainLoop);
                    var backlog = window.getAudioBacklog();
                    var targetRuns = backlog > 4000 ? 0 : backlog < 1000 ? 2 : 1;
                    for (var index = 0; index < targetRuns; index++) {
                        Module._retro_run();
                        window._runCount = (window._runCount || 0) + 1;
                    }
                }
                window.startLoop = () => {if (window.mainRafId) cancelAnimationFrame(window.mainRafId); mainLoop();};
                window.stopLoop = () => {isRunning = false;};
                startLoop();
                await loadState();
                await timer(true);
                if (window.wasmUrl && window.wasmUrl.startsWith('blob:')) URL.revokeObjectURL(window.wasmUrl);
                resolve();
            }
        };
        // Step 9: Inject script to start engine
        const script = document.createElement('script');
        script.src = scriptSource;
        script.onload = () => {if (scriptSource.startsWith('blob:')) URL.revokeObjectURL(scriptSource);};
        document.body.appendChild(script);
        gameName = romFile.name.charAt(0).toUpperCase() + romFile.name.slice(1);
    });
}