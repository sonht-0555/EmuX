// ===== inputGame =====
async function inputGame(event) {
    const file = event.target.files[0];
    const storeName = storeForFilename(file.name);
    await emuxDB(await file.arrayBuffer(), file.name);
    if (storeName === 'games') {
        await initCore(file);
    }
}
// ===== loadGame =====
async function loadGame(name) {
    const gameData = await emuxDB(name);
    const gameFile = new File([gameData], name);
    await initCore(gameFile);
}
// ===== saveState =====
async function saveState(slot = 1) {
    if (!isRunning) {
        return;
    }
    const stateSize = Module._retro_serialize_size();
    const statePointer = Module._malloc(stateSize);
    if (Module._retro_serialize(statePointer, stateSize)) {
        const stateData = new Uint8Array(Module.HEAPU8.buffer, statePointer, stateSize).slice();
        await emuxDB(stateData, `${gameName}.ss${slot}`);
        await message(`[ss${slot}]_Recorded!`, 1000);
    }
    Module._free(statePointer);
}
// ===== loadState =====
async function loadState(slot = 1) {
    if (!isRunning) {
        return;
    }
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
let time1Element;
async function timer(isStart) {
    if (isStart) {
        if (timerId) {
            return;
        }
        if (!time1Element) {
            time1Element = document.querySelector("time1");
        }
        timerId = setInterval(() => {
            seconds++;
            if (seconds === 60) {
                seconds = 0;
                minutes++;
            }
            if (minutes === 60) {
                minutes = 0;
                hours++;
            }
            const formattedMinutes = minutes.toString().padStart(2, '0');
            const formattedSeconds = (seconds % 60).toString().padStart(2, '0');
            time1Element.textContent = `${hours}h${formattedMinutes}.${formattedSeconds}`;
            count1++;
            if (count1 === 60) {
                autoSave();
                count1 = 0;
            }
        }, 1000);
    } else if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
}
// ===== autoSave =====
async function autoSave() {
    await saveState();
    await message(`[${recCount}]_Recorded!`);
    recCount++;
}
// ===== resumeGame =====
async function resumeGame() {
    timer(true);
    isRunning = true;
    if (window.startLoop) startLoop();
    if (audioContext && (audioContext.state === 'suspended' || audioContext.state === 'interrupted')) {
        audioContext.resume();
    }
    message("[_] Resumed!");
}
// ===== pauseGame =====
async function pauseGame() {
    timer(false);
    isRunning = false;
    if (window.stopLoop) stopLoop();
    message("[_] Paused!");
}
// ===== rebootGame =====
async function rebootGame() {
    location.reload();
}