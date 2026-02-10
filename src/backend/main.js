// ===== EmuX Main Manager (Core + UI Proxy) =====

// ===== CORE_CONFIG =====
const CORE_BASE = 'https://raw.githubusercontent.com/sonht-0555/EmuX/builds/';
const CORE_CONFIG = [
    { ext: '.nes', script: CORE_BASE + 'nes.zip', btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.ngp,.ngc', script: CORE_BASE + 'ngp.zip', btns: { 'btn-1': ['A', 0], 'btn-3': ['B', 8], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.gb,.gbc', script: CORE_BASE + 'gbc.zip', btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.gba', script: CORE_BASE + 'gba.zip', btns: { 'btn-1': ['A', 8], 'btn-3': ['B', 0], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.md,.gen', script: CORE_BASE + 'genesis.zip', btns: { 'btn-1': ['A', 1], 'btn-3': ['B', 0], 'btn-4': ['C', 8], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.smc,.sfc', script: CORE_BASE + 'snes2010.zip', btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] } },
    { ext: '.zip', script: CORE_BASE + 'arcade.zip', btns: { 'btn-1': ['A', 0], 'btn-3': ['B', 8], 'btn-2': ['C', 1], 'btn-4': ['D', 9], 'btn-l': [' bl.', ''], 'btn-r': [' br.', ''], 'btn-select': [' cn.', 2], 'btn-start': [' st.', 3] }, bios: ['./src/core/bios/neogeo.zip'], vars: { 'fbneo-allow-depth-32': 'Disabled', 'fbneo-sample-interpolation': '4-point', 'fbneo-fm-interpolation': 'linear', 'fbneo-lowpass-filter': 'Disabled', 'fbneo-samplerate': '44100', 'fbneo-cpu-speed-adjust': '100', 'fbneo-diagnostic-input': 'Disabled' } },
    { ext: '.nds', script: CORE_BASE + 'nds2021.zip', btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] }, bios: ['./src/core/bios/bios7.bin', './src/core/bios/bios9.bin', './src/core/bios/firmware.bin'], vars: { melonds_console_mode: 'DS', melonds_boot_directly: 'Enabled', melonds_screen_layout: 'Top/Bottom', melonds_screen_gap: '0', melonds_hybrid_small_screen: 'Disabled', melonds_swapscreen_mode: 'Disabled', melonds_randomize_mac_address: 'Disabled', melonds_touch_mode: 'Touch', melonds_dsi_sdcard: 'Disabled', melonds_mic_input: 'None', melonds_audio_bitrate: 'Low', melonds_audio_interpolation: 'None', melonds_use_fw_settings: 'Disabled', melonds_language: 'English' } },
    { ext: '.bin,.iso,.img,.cue,.pbp', script: CORE_BASE + 'ps1.zip', btns: { 'btn-1': ['A', 8], 'btn-2': ['X', 9], 'btn-3': ['B', 0], 'btn-4': ['Y', 1], 'btn-l': [' bl.', 10], 'btn-r': [' br.', 11], 'btn-select': [' sc.', 2], 'btn-start': [' st.', 3] }, bios: ['./src/core/bios/scph5501.bin'] },
];

var isRunning = false, emuWorker = null;
window.inputSAB = new SharedArrayBuffer(128);
window.inputView = new Int32Array(window.inputSAB);

// ===== findCore ====
function findCore(name, data) {
    const nameLower = name.toLowerCase();
    const getExt = n => '.' + n.split('.').pop().toLowerCase();
    if (!nameLower.endsWith('.zip')) {
        const ext = getExt(nameLower);
        const config = CORE_CONFIG.find(c => c.ext.split(',').includes(ext));
        return { config, data, name };
    }
    const filenames = [];
    fflate.unzipSync(data, { filter: (file) => { filenames.push(file.name); return false; } });
    for (const fileName of filenames) {
        const ext = getExt(fileName);
        const consoleCore = CORE_CONFIG.find(c => c.ext !== '.zip' && c.ext.split(',').includes(ext));
        if (consoleCore) {
            if (ext === '.bin' && filenames.length > 5) continue;
            const autoUnzipExts = ['.nes', '.gb', '.gbc'];
            if (autoUnzipExts.includes(ext)) {
                const unzipped = fflate.unzipSync(data, { filter: (f) => f.name === fileName });
                return { config: consoleCore, data: unzipped[fileName], name: fileName };
            }
            return { config: consoleCore, data, name };
        }
    }
    return { config: CORE_CONFIG.find(c => c.ext === '.zip'), data, name };
}

// ===== initCore ====
async function initCore(romFile) {
    gameName = romFile.name;
    switch0.hidden = false;
    await notifi("", "", "---", "", true);
    let rawData = new Uint8Array(await romFile.arrayBuffer());
    const { config, data: finalRomData, name: finalRomName } = findCore(romFile.name, rawData);
    if (!config) return;
    rawData = null;

    const coreFetch = fetch(config.script).then(r => r.ok ? r.arrayBuffer() : null);
    const biosFetches = config.bios ? config.bios.map(url => fetch(url).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)) : [];
    updateButtons(config.btns);
    await notifi("", "#", "--", "", true);
    const coreBuf = await coreFetch;
    if (!coreBuf) return;
    const coreFiles = fflate.unzipSync(new Uint8Array(coreBuf));
    const jsFile = Object.keys(coreFiles).find(n => n.endsWith('.js')), wasmFile = Object.keys(coreFiles).find(n => n.endsWith('.wasm'));
    if (!jsFile || !wasmFile) return;
    const jsUrl = URL.createObjectURL(new Blob([coreFiles[jsFile]], { type: 'application/javascript' }));
    const wasmUrl = URL.createObjectURL(new Blob([coreFiles[wasmFile]], { type: 'application/wasm' }));

    await initAudio(1.0);
    await notifi("", "##", "-", "", true);
    if (!window.offMain) {
        window.offMain = canvas.transferControlToOffscreen();
        window.offBottom = canvasB.transferControlToOffscreen();
    }
    const offMain = window.offMain, offBottom = window.offBottom;

    if (emuWorker) emuWorker.terminate();
    emuWorker = new Worker('./src/backend/worker/emu-worker.js');
    emuWorker.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'READY') {
            window.gameWidth = data.width; window.gameHeight = data.height;
            isRunning = true; gameView(gameName, data.width, data.height); loadState(); timer(true);
        }
        if (type === 'STATE_DATA') { emuxDB(data.state, `${gameName}.ss${data.slot}`); message(`[ss${data.slot}]_Recorded!`, 1000); }
        if (type === 'PERF' && window.skip1) window.skip1.textContent = `${data.label}.[${data.pct}] `;
        if (type === 'NDS_LAYOUT') {
            page02.style.paddingTop = "5px"; canvasB.style.display = "block";
            joypad.style.justifyContent = "center"; joy.style.display = "none";
        }
    };
    const biosBuffers = await Promise.all(biosFetches);
    const biosFiles = config.bios ? config.bios.map((url, i) => biosBuffers[i] ? { name: url.split('/').pop(), data: new Uint8Array(biosBuffers[i]) } : null).filter(Boolean) : [];
    emuWorker.postMessage({
        type: 'INIT', data: {
            config: { vars: config.vars || {} }, romData: finalRomData, romName: finalRomName,
            jsUrl, wasmUrl, isArcade: config.script.includes('arcade'), isNDS: config.script.includes('nds'),
            canvas: offMain, canvasBottom: offBottom, renderer: local('render') || 'wgl',
            sabInput: window.inputSAB, audioSABs: { sabL, sabR, sabIndices }, biosFiles
        }
    }, [offMain, offBottom].filter(Boolean));
    await notifi("", "###", "", "", true);
}

// ===== Input/UI Actions =====
window.inputGame = async (e) => {
    const file = e.target.files[0];
    await emuxDB(await file.arrayBuffer(), file.name);
    if (storeForFilename(file.name) === 'games') await initCore(file);
};
window.loadGame = async (name) => {
    const data = await emuxDB(name);
    await initCore(new File([data], name));
};
window.switchRenderer = () => {
    const list = ['w2d', 'wgl', 'wgpu'], next = list[(list.indexOf(local('render')) + 1) % 3];
    local('render', next); switch0.textContent = next;
    emuWorker?.postMessage({ type: 'CHANGE_RENDERER', data: next });
};

// ===== State & Control =====
window.saveState = (slot = 1) => { if (isRunning && emuWorker) emuWorker.postMessage({ type: 'SAVE_STATE', data: { slot } }); };
window.loadState = (slot = 1) => {
    if (!isRunning || !emuWorker) return;
    emuxDB(`${gameName}.ss${slot}`).then(s => s && emuWorker.postMessage({ type: 'LOAD_STATE', data: { state: s, slot } }));
};
window.startLoop = () => { isRunning = true; emuWorker?.postMessage({ type: 'RESUME' }); };
window.stopLoop = () => { isRunning = false; emuWorker?.postMessage({ type: 'PAUSE' }); };
window.resumeGame = async () => {
    isRunning = true; startLoop();
    if (audioContext) { await audioContext.resume(); window.resetAudioSync?.(); }
    timer(true); message("[_] Resumed!");
};
window.pauseGame = async () => {
    isRunning = false; stopLoop();
    if (audioContext?.state === 'running') await audioContext.suspend();
    timer(false); message("[_] Paused!");
};
window.rebootGame = () => location.reload();

// ===== Timer & AutoSave =====
var timerId, seconds = 0, minutes = 0, hours = 0, count1 = 0, recCount = 1;
async function timer(isStart) {
    if (isStart && !timerId) {
        timerId = setInterval(() => {
            if (++seconds === 60) { seconds = 0; minutes++; }
            if (minutes === 60) { minutes = 0; hours++; }
            document.querySelector("time1").textContent = `${hours}h${minutes.toString().padStart(2,'0')}.${(seconds%60).toString().padStart(2,'0')}`;
            if (++count1 === 60) { saveState(); message(`[${recCount++}]_Recorded!`); count1 = 0; }
        }, 1000);
    } else if (!isStart && timerId) { clearInterval(timerId); timerId = null; }
}