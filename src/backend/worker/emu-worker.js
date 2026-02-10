// ===== EmuWorker: Orchestrator =====
importScripts('./worker-env.js');
importScripts('./worker-audio.js');
importScripts('./worker-video.js');
importScripts('../lib/zip.js');
var isRunning = false, inputView = null;
// ===== input_poll_cb =====
function input_poll_cb() {}
// ===== input_state_cb =====
function input_state_cb(port, device, index, id) {
    if (port || !inputView) return 0;
    if (device === 1) {
        if (id === 256) {
            let mask = 0;
            for (let i = 0; i < 16; i++) if (Atomics.load(inputView, i)) mask |= (1 << i);
            return mask;
        }
        return (id >= 0 && id < 16) ? Atomics.load(inputView, id) : 0;
    }
    if (device === 6) return (id >= 0 && id <= 2) ? Atomics.load(inputView, 16 + id) : 0;
    return 0;
}
// ===== onmessage =====
self.onmessage = async (e) => {
    const { type, data } = e.data;
    if (type === 'INIT') {
        const { config, romData, romName, wasmUrl, jsUrl, isArcade, isNDS, canvas, canvasBottom, renderer, sabInput, audioSABs, biosFiles } = data;
        inputView = new Int32Array(sabInput);
        sabL = audioSABs.sabL; sabR = audioSABs.sabR; sabIndices = audioSABs.sabIndices;
        activeVars = config.vars || {}; canvasB = canvasBottom; self.rendererName = renderer;
        self.Module = {
            isArcade, isNDS, canvas: canvas,
            print: (t) => console.log('Core:', t),
            printErr: (t) => console.log('Core:', t),
            locateFile: p => p.endsWith('.wasm') ? wasmUrl : p,
            async onRuntimeInitialized() {
                const callbacks = [ [Module._retro_set_environment, env_cb, "iii"], [Module._retro_set_video_refresh, video_cb, "viiii"], [Module._retro_set_audio_sample, audio_cb, "vii"], [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"], [Module._retro_set_input_poll, input_poll_cb, "v"], [Module._retro_set_input_state, input_state_cb, "iiiii"] ];
                callbacks.forEach(([fn, cb, sig]) => fn(Module.addFunction(cb, sig)));
                Module._retro_init();
                if (biosFiles && biosFiles.length > 0) biosFiles.forEach(f => Module.FS.writeFile('/' + f.name, f.data));
                if (isNDS && Module._retro_set_controller_port_device) Module._retro_set_controller_port_device(0, 6);
                const romPath = isArcade ? `/${romName}` : (isNDS ? '/game.nds' : `/game.${romName.toLowerCase().split('.').pop()}`);
                Module.FS.writeFile(romPath, romData);
                const romPointer = Module._malloc(romData.length), infoPointer = Module._malloc(16);
                const loadInfo = [getPointer(romPath), isArcade ? 0 : romPointer, isArcade ? 0 : romData.length, 0];
                Module.HEAPU8.set(romData, romPointer);
                Module.HEAPU32.set(loadInfo, Number(infoPointer) >> 2);
                Module._retro_load_game(infoPointer);
                const avPtr = Module._malloc(120);
                Module._retro_get_system_av_info(avPtr);
                const baseW = Module.HEAPU32[avPtr >> 2], baseH = Module.HEAPU32[(avPtr + 4) >> 2];
                audioCoreRatio = Module.HEAPF64[(Number(avPtr) + 32) >> 3] / 48000;
                Module._free(avPtr);
                resampledPtrL = Module._malloc(4096 * 4); resampledPtrR = Module._malloc(4096 * 4);
                if (Module._emux_audio_reset) Module._emux_audio_reset();
                isRunning = true; mainLoop();
                self.postMessage({ type: 'READY', data: { width: baseW || canvas.width, height: baseH || canvas.height, ratio: audioCoreRatio } });
            }
        };
        importScripts(jsUrl);
    }
    if (type === 'RESUME') { isRunning = true; mainLoop(); }
    if (type === 'PAUSE') isRunning = false;
    if (type === 'CHANGE_RENDERER') {
        self.rendererName = data; renderFunction = null; rendererReady = false;
        importScripts('./worker-video.js'); scriptName = data;
    }
    if (type === 'SAVE_STATE') {
        try {
            const size = Module._retro_serialize_size(), ptr = Module._malloc(size);
            if (Module._retro_serialize(ptr, size)) self.postMessage({ type: 'STATE_DATA', data: { state: new Uint8Array(Module.HEAPU8.buffer, ptr, size).slice(), slot: data.slot } });
            Module._free(ptr);
        } catch (e) { console.log('Save state error:', e.message); }
    }
    if (type === 'LOAD_STATE') {
        try {
            const ptr = Module._malloc(data.state.length);
            Module.HEAPU8.set(data.state, ptr);
            Module._retro_unserialize(ptr, data.state.length);
            Module._free(ptr);
        } catch (e) { console.log('Load state error:', e.message); }
    }
};
// ===== mainLoop =====
function mainLoop() {
    if (!isRunning) return;
    requestAnimationFrame(mainLoop);
    let backlog = getAudioBacklog();
    let targetRuns = 1;
    if (backlog > 4000) targetRuns = 0;
    if (backlog < 1000) targetRuns = 2;
    for (let i = 0; i < targetRuns; i++) Module._retro_run();
}
