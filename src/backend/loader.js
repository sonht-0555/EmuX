// ===== LibEnvironment =====
function env_cb(cmd, data) {
    if (cmd === 10) return 1;
}
// ===== Core =====
const CORE_CONFIG = [
    { ext: '.gba', script: './src/core/gba.zip' },
    { ext: '.gb,.gbc', script: './src/core/gba.zip' },
    { ext: '.smc,.sfc', script: './src/core/snes2010.zip' },
    { ext: '.nes', script: './src/core/nes.zip' },
    { ext: '.zip', script: './src/core/arcade.zip' },
    { ext: '.md,.bin,.gen', script: './src/core/genesis.zip' },
    { ext: '.ngp,.ngc', script: './src/core/ngp.zip' },
];
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
    isRunning = true;
    const lowName = romFile.name.toLowerCase();
    const isZip = lowName.endsWith('.zip');
    const romBuffer = await romFile.arrayBuffer();
    const binaryData = new Uint8Array(romBuffer);
    let finalRomName = romFile.name, finalRomData = binaryData;
    const consoleExts = /\.(gba|gbc|gb|smc|sfc|nes|md|gen|ngp|ngc)$/i;
    if (isZip) {
        notifi("","","---","")
        const extracted = await unzip(binaryData, consoleExts);
        const consoleRomName = Object.keys(extracted)[0];
        if (consoleRomName) {
            finalRomName = consoleRomName;
            finalRomData = extracted[consoleRomName];
        }
    }
    const finalLowName = finalRomName.toLowerCase();
    const coreConfig = CORE_CONFIG.find(cfg => 
        cfg.ext.split(',').map(e => e.trim().toLowerCase()).filter(e => e).some(ext => 
            finalLowName.endsWith(ext) || finalLowName === ext.replace('.', '')
        )
    ); 
    if (!coreConfig) return;
    let scriptSource = coreConfig.script;
    const isArcade = scriptSource.includes('arcade');
    const isSega = scriptSource.includes('genesis') || scriptSource.includes('ngp');
    if (scriptSource.endsWith('.zip')) {
        notifi("","#","--","")
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
        notifi("","##","-","")
        const canvas = document.getElementById("canvas");
        window.Module = {
            isArcade, canvas,
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
                if (isArcade) {
                    notifi("","###","","")
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
                } else if (isSega) {
                    const romPath = '/game.' + finalRomName.split('.').pop();
                    Module.FS.writeFile(romPath, finalRomData);
                    Module.HEAPU8.set(finalRomData, romPointer);
                    const pathPtr = Module._malloc(256);
                    Module.stringToUTF8(romPath, pathPtr, 256);
                    Module.HEAP32[infoPointer >> 2] = pathPtr;
                    Module.HEAP32[(infoPointer >> 2) + 1] = romPointer;
                    Module.HEAP32[(infoPointer >> 2) + 2] = finalRomData.length;
                    Module.HEAP32[(infoPointer >> 2) + 3] = 0;
                    Module._retro_load_game(infoPointer);
                } else {
                    Module.HEAPU8.set(finalRomData, romPointer); 
                    Module.HEAPU32.set([0, romPointer, finalRomData.length, 0], infoPointer >> 2); 
                    Module._retro_load_game(infoPointer);
                }
                const avInfo = Module._malloc(128);
                Module._retro_get_system_av_info(avInfo);
                initAudio(Module.HEAPF64[(avInfo + 32) >> 3] / 48000);
                audioCtx.resume();
                Module._free(avInfo);
                (function mainLoop() { if (isRunning) Module._retro_run(); requestAnimationFrame(mainLoop) })();
                resolve();
            }
        };
        const scriptElement = document.createElement('script'); scriptElement.src = scriptSource; document.body.appendChild(scriptElement);
        gameName = romFile.name;
    });
}