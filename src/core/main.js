// ===== logHook =====
var logMessages = [];
const originalLog = console.log, originalError = console.error;
const logToScreen = (msg) => {
    const render = () => window.log && (log.textContent = logMessages.join('\n--\n'));
    logMessages.unshift(msg);
    if (logMessages.length > 5) logMessages.pop();
    render();
    setTimeout(() => {const i = logMessages.lastIndexOf(msg); if (i > -1) {logMessages.splice(i, 1); render();} }, 5000);
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
    if (isConfig.id === 'pico8') return buttonUnpress('start');
    if (audioContext && audioContext.state !== 'running') await audioContext.resume(), window.resetAudioSync?.();
    window.gameLoop?.(true);
    timer(true); message("[_] Resumed!");
}
// ===== pauseGame =====
async function pauseGame() {
    if (isConfig.id === 'pico8') return buttonPress('start');
    window.gameLoop?.(false);
    if (audioContext && audioContext.state === 'running') await audioContext.suspend();
    timer(false); message("[_] Paused!");
}
// ===== rebootGame =====
async function rebootGame() {location.reload();}
// ===== BBS Mock =====
const localBBS = new Map();
(function initBBSMock() {
    const prototype = XMLHttpRequest.prototype, originalOpen = prototype.open, originalSend = prototype.send, defineProperty = (object, property, value) => Object.defineProperty(object, property, {value, configurable: true});
    prototype.open = function (method, url) {this._url = url; return originalOpen.apply(this, arguments);};
    prototype.send = function () {
        if (this._url?.includes('lid=')) {
            const key = this._url.split('lid=')[1].split('&')[0].toLowerCase(), foundFile = [...localBBS.keys()].find(name => name.includes(key));
            if (foundFile) {
                const isInfoRequest = this._url.includes('nfo=1'), responseData = isInfoRequest ? new TextEncoder().encode(`lid:${foundFile.split('.')[0]}`).buffer : localBBS.get(foundFile).buffer;
                defineProperty(this, 'status', 200); defineProperty(this, 'readyState', 4); defineProperty(this, 'response', responseData);
                defineProperty(this, 'responseText', isInfoRequest ? new TextDecoder().decode(responseData) : "");
                ['onload', 'onreadystatechange'].forEach(event => this[event]?.()); return;
            }
        }
        return originalSend.apply(this, arguments);
    };
})();

// ===== Pico8 =====
async function pico8(config, finalRomName, rawData) {
    window.pico8_buttons = [0, 0, 0, 0, 0, 0, 0, 0], window.pico8_gpio = new Uint8Array(128);
    updateButtons(config.btns);
    localBBS.clear();
    let bootData = rawData, bootName = finalRomName;
    if (rawData && (finalRomName.toLowerCase().endsWith('.zip') || finalRomName.toLowerCase().endsWith('.zp8') || (rawData[0] === 0x50 && rawData[1] === 0x4B))) {
        try {
            const unzipped = fflate.unzipSync(rawData);
            const zipName = finalRomName.split('.')[0].toLowerCase();
            let bestScore = -1;
            Object.keys(unzipped).forEach(name => {
                const data = unzipped[name], lowerName = name.toLowerCase();
                localBBS.set(lowerName, data);
                if (lowerName.endsWith('.p8') || lowerName.endsWith('.png')) {
                    let score = (lowerName === zipName + ".p8" || lowerName === zipName + ".p8.png" || lowerName === zipName + ".png") ? 10 : (lowerName.includes(zipName) ? 5 : 0);
                    if (score > bestScore || (score === bestScore && bootName && name.length < bootName.length)) {
                        bestScore = score; bootData = data; bootName = name;
                    }
                }
            });
            if (!bootData) {let fk = Object.keys(unzipped).find(k => k.endsWith('.p8') || k.endsWith('.png')); if (fk) {bootData = unzipped[fk]; bootName = fk;} }
        } catch (e) { }
    } else localBBS.set(finalRomName.toLowerCase(), rawData);

    const romBlobUrl = URL.createObjectURL(new Blob([bootData], {type: 'image/png'}));
    window.Module = {canvas: document.getElementById("canvas"), arguments: [romBlobUrl]};
    const script = document.createElement('script'); script.src = config.script; document.body.appendChild(script);
    await delay(200); await gameView(bootName); await timer(true);
    return (gameName = bootName);
}