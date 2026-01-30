async function inputGame(e) {
  const file = e.target.files[0];
  await emuxDB(await file.arrayBuffer(), file.name);
  await initCore(file);
  //listGame();
}
async function loadGame(name) {
  await initCore(new File([await emuxDB(name)], name));
}
async function saveState(slot = 1) {
  if (!isRunning) return;
  const size = Module._retro_serialize_size();
  const ptr = Module._malloc(size);
  if (Module._retro_serialize(ptr, size)) {
    await emuxDB(new Uint8Array(Module.HEAPU8.buffer, ptr, size).slice(), `${gameName}.ss${slot}`);
    await message(`[ss${slot}]_Recorded!`, 1000);
  }
  Module._free(ptr);
}
async function loadState(slot = 1) {
  if (!isRunning) return;
  const data = await emuxDB(`${gameName}.ss${slot}`);
  if (data) {
    const ptr = Module._malloc(data.length);
    Module.HEAPU8.set(data, ptr);
    Module._retro_unserialize(ptr, data.length);
    Module._free(ptr);
    await message(`[ss${slot}]_Loaded!`, 1000);
  }
}
async function timer(isStart) {
    if (isStart) {
        if (timerId) return;
        timerId = setInterval(() => {
            if (++seconds === 60) [seconds, minutes] = [0, ++minutes];
            if (minutes === 60) [minutes, hours] = [0, ++hours];
            document.querySelector("time1").textContent = `${hours}h${minutes.toString().padStart(2, '0')}.${(seconds % 60).toString().padStart(2, '0')}`;
            if (++count1 === 60) { autoSave(); count1 = 0; }
        }, 1000);
    } else if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
}
async function autoSave() {
    await saveState();
    await message(`[${recCount}]_Recorded!`);
    recCount++;
}
async function resumeGame() {
  timer(true);
  isRunning = true;
  if (audioCtx && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) { audioCtx.resume() }
  message("[_] Resumed!");
}
async function pauseGame() {
  timer(false);
  isRunning = false;
  message("[_] Paused!");
}