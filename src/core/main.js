// ===== logHook =====
var logMessages = [];
const originalLog = console.log, originalError = console.error;
const logToScreen = (msg) => {
    const render = () => window.log && (log.textContent = logMessages.join('\n--\n'));
    logMessages.unshift(msg);
    if (logMessages.length > 5) logMessages.pop();
    render();
    setTimeout(() => {const i = logMessages.lastIndexOf(msg); if (i > -1) {logMessages.splice(i, 1); render();} }, 60000);
};
console.log = (...args) => {originalLog(...args); logToScreen(args.join(' '));};
console.error = (...args) => {originalError(...args); logToScreen('🍖 | ' + args.join(' '));};
// ===== findCore =====
function findCore(name, data) {
    const nameLower = name.toLowerCase(), getExtension = fileName => fileName.endsWith('.p8.png') ? '.p8.png' : '.' + fileName.split('.').pop().toLowerCase();
    const tryMatch = (core, ext, fileName, list) => (core.ext && core.ext.split(',').includes(ext) && (core.match ? core.match(data, fileName, list) : true));
    if (!nameLower.endsWith('.zip')) {
        const extension = getExtension(nameLower), config = CORE_CONFIG.find(core => tryMatch(core, extension, nameLower));
        return {config, data, name};
    }
    const filenames = [];
    fflate.unzipSync(data, {filter: (file) => {filenames.push(file.name); return false;}});
    for (const fileName of filenames) {
        const extension = getExtension(fileName), consoleCore = CORE_CONFIG.find(core => core.ext !== '.zip' && tryMatch(core, extension, fileName, filenames));
        if (consoleCore) {
            if (extension === '.bin' && filenames.length > 5) continue;
            if (!['.bin', '.iso', '.img', '.pbp', '.chd', '.cue'].includes(extension)) {
                const unzipped = fflate.unzipSync(data, {filter: (file) => file.name === fileName});
                return {config: consoleCore, data: unzipped[fileName], name: fileName};
            }
            return {config: consoleCore, data, name};
        }
    }
    const id = local(name) === 'mame' ? 'mame' : 'fbneo';
    return {config: CORE_CONFIG.find(c => c.id === id), data, name};
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
    if (!isRunning || isConfig.id === 'pico8') return;
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
    if (!isRunning || isConfig.id === 'pico8') return;
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
            const rendered = frameCount - skippedFrames;
            time1Element.textContent = `W${rendered.toString().padStart(2, '0')}_${hours ? hours + '.' : ''}${minutes.toString().padStart(2, '0')}.${(seconds % 60).toString().padStart(2, '0')}`;
            window._runCount = 0; frameCount = skippedFrames = 0;
            if (++count1 === 60) {saveState(); count1 = 0;}
        }, 1000);
    } else if (!isStart && timerId) {
        clearInterval(timerId); timerId = null;
    }
}
// ===== resumeGame =====
async function resumeGame() {
    if (isConfig.id === 'pico8') return buttonClick('start');
    if (audioContext && audioContext.state !== 'running') await audioContext.resume(), window.resetAudioSync?.();
    window.gameLoop?.(true);
    timer(true); message("[_] Resumed!");
}
// ===== pauseGame =====
async function pauseGame() {
    if (isConfig.id === 'pico8') return buttonClick('start');
    window.gameLoop?.(false);
    if (audioContext && audioContext.state === 'running') await audioContext.suspend();
    timer(false); message("[_] Paused!");
}
// ===== rebootGame =====
async function rebootGame() {location.reload();}
// ===== Pico8 =====
async function pico8(config, romName, raw) {
    const proto = XMLHttpRequest.prototype, _open = proto.open;
    proto.open = function (method, url) {
        this._url = url.includes('/bbs/') ? "https://emux-cors.hoangtuanson91.workers.dev/https://www.lexaloffle.com" + url.substring(url.indexOf('/bbs/')) : url;
        return _open.call(this, method, this._url, true);
    };
    Object.assign(window, {pico8_buttons: [0, 0, 0, 0, 0, 0, 0, 0], pico8_gpio: new Uint8Array(128)});
    Object.assign(window, {Module: {canvas: document.getElementById("canvas"), arguments: [URL.createObjectURL(new Blob([raw]))], print: () => { }, printErr: () => { }}});
    document.body.appendChild(Object.assign(document.createElement('script'), {src: config.script}));
    updateButtons(config.btns); await delay(200); await gameView(romName); await timer(true);
    return (gameName = romName);
}