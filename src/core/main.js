// ===== findCore =====
function findCore(name, data) {
    const nameLower = name.toLowerCase(), getExtension = fileName => '.' + fileName.split('.').pop().toLowerCase();
    if (!nameLower.endsWith('.zip')) {
        const extension = getExtension(nameLower), config = CORE_CONFIG.find(core => core.ext.split(',').includes(extension));
        return {config, data, name};
    }
    const filenames = [];
    fflate.unzipSync(data, {filter: (file) => {filenames.push(file.name); return false;}});
    for (const fileName of filenames) {
        const extension = getExtension(fileName), consoleCore = CORE_CONFIG.find(core => core.ext !== '.zip' && core.ext.split(',').includes(extension));
        if (consoleCore) {
            if (extension === '.bin' && filenames.length > 5) continue;
            if (['.nes', '.fds', '.unif', '.gba', '.gbc', '.gb', '.sgb', '.md', '.gen', '.smd', '.sms', '.gg', '.a26', '.ws', '.wsc', '.smc', '.sfc', '.fig', '.swc', '.ngp', '.ngc', '.nds', '.pce', '.sgx', '.chd', '.cue'].includes(extension)) {
                const unzipped = fflate.unzipSync(data, {filter: (file) => file.name === fileName});
                return {config: consoleCore, data: unzipped[fileName], name: fileName};
            }
            return {config: consoleCore, data, name};
        }
    }
    return {config: CORE_CONFIG.find(core => core.ext === '.zip'), data, name};
}
// ===== inputGame =====
async function inputGame(event) {
    const file = event.target.files[0], storeName = storeForFilename(file.name);
    await emuxDB(await file.arrayBuffer(), file.name);
    if (storeName === 'games') await initCore(file);
}
// ===== loadGame =====
async function loadGame(name) {
    const gameData = await emuxDB(name), gameFile = new File([gameData], name);
    await initCore(gameFile);
}
// ===== saveState =====
async function saveState(slot = 1) {
    if (!isRunning) return;
    const stateSize = Module._retro_serialize_size(), statePointer = Module._malloc(stateSize);
    if (Module._retro_serialize(statePointer, stateSize)) {
        const stateData = new Uint8Array(Module.HEAPU8.buffer, statePointer, stateSize).slice();
        await emuxDB(stateData, `${gameName}.ss${slot}`);
        await message(`[ss${slot}]_Recorded!`, 1000);
    }
    Module._free(statePointer);
}
// ===== loadState =====
async function loadState(slot = 1) {
    if (!isRunning) return;
    const stateData = await emuxDB(`${gameName}.ss${slot}`);
    if (stateData) {
        const statePointer = Module._malloc(stateData.length);
        Module.HEAPU8.set(stateData, statePointer);
        Module._retro_unserialize(statePointer, stateData.length);
        Module._free(statePointer);
        await message(`[ss${slot}]_Loaded!`, 1000);
    }
}
// ===== timer =====
async function timer(isStart) {
    if (isStart && !timerId) {
        if (!time1Element) time1Element = document.querySelector("time1");
        timerId = setInterval(() => {
            seconds++;
            if (seconds === 60) {seconds = 0; minutes++;}
            if (minutes === 60) {minutes = 0; hours++;}
            const renderPct = (frameCount > 0) ? ((frameCount - skippedFrames) * 100 / frameCount) | 0 : 0;
            time1Element.textContent = `W${renderPct.toString().padStart(2, '0')}_${hours ? hours + '.' : ''}${minutes.toString().padStart(2, '0')}.${(seconds % 60).toString().padStart(2, '0')}`;
            window._runCount = 0; frameCount = skippedFrames = 0;
            if (++count1 === 60) {saveState(); count1 = 0;}
        }, 1000);
    } else if (!isStart && timerId) {
        clearInterval(timerId); timerId = null;
    }
}
// ===== resumeGame =====
async function resumeGame() {
    isRunning = true;
    if (window.startLoop) window.startLoop();
    if (audioContext) {await audioContext.resume(); if (window.resetAudioSync) window.resetAudioSync();}
    timer(true);
    message("[_] Resumed!");
}
// ===== pauseGame =====
async function pauseGame() {
    isRunning = false;
    if (window.stopLoop) window.stopLoop();
    if (audioContext && audioContext.state === 'running') await audioContext.suspend();
    timer(false);
    message("[_] Paused!");
}
// ===== rebootGame =====
async function rebootGame() {location.reload();}