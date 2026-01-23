// ===== LibEnvironment =====
function env_cb(cmd, data) {
    if (cmd === 10) return 1;
    if (cmd === 3 && data) { Module.HEAP8[data] = 1; return 1; }
    if (cmd === 31 || cmd === 37) {
        const w = Module.HEAP32[data >> 2], h = Module.HEAP32[(data >> 2) + 1];
        const canvas = document.getElementById("canvas");
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
            canvas.width = w; canvas.height = h;
        }
        return 1;
    }
    if (cmd === 15) {
        const key = Module.UTF8ToString(Module.HEAP32[data >> 2]);
        if (key === "fbneo-sample-rate") {
            if (!Module._sampleRatePtr) {
                Module._sampleRatePtr = Module._malloc(8);
                Module.stringToUTF8("44100", Module._sampleRatePtr, 8);
            }
            Module.HEAP32[(data >> 2) + 1] = Module._sampleRatePtr;
            return 1;
        }
    }
    if (cmd === 9 || cmd === 33) {
        if (!Module._sysPath) {
            Module._sysPath = Module._malloc(2);
            Module.stringToUTF8("/", Module._sysPath, 2);
        }
        Module.HEAP32[data >> 2] = Module._sysPath;
        return 1;
    }
    return 0;
}
// ===== Core =====
const CORE_CONFIG = {
    gba:    { ratio: 65536  / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.zip' },
    gbc:    { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.zip' },
    snes:   { ratio: 32040  / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.zip' },
    nes:    { ratio: 44100  / 48000, width: 256, height: 240, ext: '.nes', script: './src/core/quicknes.zip' },
    neogeo: { ratio: 48000  / 48000, width: 320, height: 224, ext: '.zip', script: './src/core/fbneo.zip' },
};
var isRunning = false;
// ===== Unzip ====
async function unzip(binaryData, nameFilter) {
    return new Promise((resolve, reject) => {
        fflate.unzip(binaryData, (err, unzippedFiles) => {
            if (err) return resolve({});
            const result = {};
            for (let entryName in unzippedFiles) {
                if (entryName.endsWith('/') || unzippedFiles[entryName].length === 0 || entryName.includes('__MACOSX/')) continue;
                if (!nameFilter || nameFilter.test(entryName)) {
                    result[entryName] = unzippedFiles[entryName];
                }
            }
            resolve(result);
        });
    });
}
// ===== initCore ====
async function initCore(romFile) {
    const lowName = romFile.name.toLowerCase();
    const isZip = lowName.endsWith('.zip');
    const romBuffer = await romFile.arrayBuffer();
    const binaryData = new Uint8Array(romBuffer);
    let finalRomName = romFile.name, finalRomData = binaryData;
    const consoleExts = /\.(gba|gbc|gb|smc|sfc|nes)$/i;
    if (isZip) {
        const extracted = await unzip(binaryData, consoleExts);
        const consoleRomName = Object.keys(extracted)[0];
        if (consoleRomName) {
            finalRomName = consoleRomName;
            finalRomData = extracted[consoleRomName];
        }
    }
    const finalLowName = finalRomName.toLowerCase();
    const coreConfig = Object.values(CORE_CONFIG).find(cfg => 
        cfg.ext.split(',').map(e => e.trim().toLowerCase()).filter(e => e).some(ext => 
            finalLowName.endsWith(ext) || finalLowName === ext.replace('.', '')
        )
    ); 
    if (!coreConfig) return;
    let scriptSource = coreConfig.script;
    const isFBNeo = scriptSource.includes('fbneo');
    if (scriptSource.endsWith('.zip')) {
        const response = await fetch(scriptSource);
        if (!response.ok) return;
        const bundleBuffer = await response.arrayBuffer();
        const coreFiles = await unzip(new Uint8Array(bundleBuffer), /\.(js|wasm)$/i);
        const jsName = Object.keys(coreFiles).find(n => n.endsWith('.js'));
        const wasmName = Object.keys(coreFiles).find(n => n.endsWith('.wasm'));
        if (!jsName || !wasmName) return;
        let jsBin = coreFiles[jsName], jsLen = jsBin.length;
        while (jsLen > 0 && jsBin[jsLen - 1] === 0) jsLen--;
        scriptSource = URL.createObjectURL(new Blob([jsBin.slice(0, jsLen)], { type: 'application/javascript' }));
        window.wasmUrl = URL.createObjectURL(new Blob([coreFiles[wasmName]], { type: 'application/wasm' }));
    }
    return new Promise((resolve) => {
        const canvas = document.getElementById("canvas");
        Object.assign(canvas, { width: coreConfig.width, height: coreConfig.height });
        gameView(romFile.name, coreConfig); initAudio(coreConfig);
        window.Module = {
            isFBNeo, canvas,
            locateFile: (path) => path.endsWith('.wasm') ? (window.wasmUrl || path) : path,
            async onRuntimeInitialized() {
                const romPointer = Module._malloc(finalRomData.length), infoPointer = Module._malloc(16);
                [[Module._retro_set_environment, env_cb, "iii"], 
                 [Module._retro_set_video_refresh, video_cb, "viiii"], 
                 [Module._retro_set_audio_sample, audio_cb, "vii"], 
                 [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"], 
                 [Module._retro_set_input_poll, input_poll_cb, "v"], 
                 [Module._retro_set_input_state, input_state_cb, "iiiii"]
                ].forEach(([retroFunction, callback, signature]) => retroFunction(Module.addFunction(callback, signature)));
                Module._retro_init();
                if (isFBNeo) {
                    const biosRes = await fetch('./src/core/neogeo.zip');
                    if (biosRes.ok) {
                        const biosData = new Uint8Array(await biosRes.arrayBuffer());
                        Module.FS.writeFile('/neogeo.zip', biosData);
                    }
                    const romPath = '/' + finalRomName;
                    Module.FS.writeFile(romPath, finalRomData);
                    const pathPtr = Module._malloc(256);
                    Module.stringToUTF8(romPath, pathPtr, 256);
                    Module.HEAP32[infoPointer >> 2] = pathPtr;
                    Module.HEAP32[(infoPointer >> 2) + 1] = Module.HEAP32[(infoPointer >> 2) + 2] = Module.HEAP32[(infoPointer >> 2) + 3] = 0;
                    Module._retro_load_game(infoPointer);
                } else {
                    Module.HEAPU8.set(finalRomData, romPointer); 
                    Module.HEAPU32.set([0, romPointer, finalRomData.length, 0], infoPointer >> 2); 
                    Module._retro_load_game(infoPointer);
                }
                (function mainLoop() { Module._retro_run(), requestAnimationFrame(mainLoop) })();
                isRunning = true; 
                resolve();
            }
        };
        const scriptElement = document.createElement('script'); scriptElement.src = scriptSource; document.body.appendChild(scriptElement);
    });
}