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
    gba:  { ratio: 65536  / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.zip' },
    gbc:  { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.zip' },
    snes: { ratio: 32040  / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.zip' },
    nes:  { ratio: 44100  / 48000, width: 256, height: 240, ext: '.nes', script: './src/core/quicknes.zip' },
    neogeo: { ratio: 1, width: 320, height: 224, ext: '.zip', script: './src/core/fbneo.zip' },
};
var isRunning = false;
// ===== Unzip ====
async function unzip(source, nameFilter) {
    const isUrl = typeof source === 'string';
    const fileName = isUrl ? source : source.name;
    const arrayBuffer = await (isUrl ? await fetch(source) : source).arrayBuffer();
    const binaryData = new Uint8Array(arrayBuffer);
    if (!fileName.endsWith('.zip')) return { [fileName.toLowerCase()]: binaryData };
    const unzippedFiles = fflate.unzipSync(binaryData), result = {};
    for (let entryName in unzippedFiles) {
        const pathParts = entryName.split('/');
        const fileName = pathParts.pop();
        if (fileName.startsWith('.') || pathParts.some(part => part.startsWith('.') || part.startsWith('__')) || unzippedFiles[entryName].length === 0) continue;
        if (!nameFilter || nameFilter.test(entryName)) {
            result[fileName.toLowerCase()] = unzippedFiles[entryName];
        }
    }
    return result;
}
// ===== initCore ====
async function initCore(romFile) {
    const extractedRoms = await unzip(romFile, /\.(gba|gbc|gb|smc|sfc|nes)$/i);
    const romFileName = Object.keys(extractedRoms)[0];
    let finalRomName, finalRomData;
    if (romFileName) {
        finalRomName = romFileName;
        finalRomData = extractedRoms[romFileName];
    } else if (romFile.name.toLowerCase().endsWith('.zip')) {
        finalRomName = romFile.name.toLowerCase();
        finalRomData = new Uint8Array(await romFile.arrayBuffer());
    } else {
        finalRomName = romFile.name.toLowerCase();
        finalRomData = new Uint8Array(await romFile.arrayBuffer());
    } 
    const coreConfig = Object.values(CORE_CONFIG).find(config => 
        config.ext.split(',').map(ext => ext.trim()).filter(ext => ext).some(extension => 
            finalRomName.endsWith(extension.toLowerCase()) || finalRomName === extension.replace('.', '').toLowerCase()
        )
    );
    if (!coreConfig) {
        console.error("No core found for:", finalRomName);
        return;
    }
    let scriptSource = coreConfig.script;
    const isFBNeo = scriptSource.includes('fbneo');
    if (scriptSource.endsWith('.zip')) {
        const coreFiles = await unzip(scriptSource, /\.(js|wasm)$/i);
        const jsFileName = Object.keys(coreFiles).find(name => name.endsWith('.js'));
        const wasmFileName = Object.keys(coreFiles).find(name => name.endsWith('.wasm'));
        let jsBinary = coreFiles[jsFileName], jsLength = jsBinary.length;
        while (jsLength > 0 && jsBinary[jsLength - 1] === 0) jsLength--;
        scriptSource = URL.createObjectURL(new Blob([jsBinary.slice(0, jsLength)], { type: 'application/javascript' }));
        window.wasmUrl = URL.createObjectURL(new Blob([coreFiles[wasmFileName]], { type: 'application/wasm' }));
    }
    return new Promise((resolve) => {
        const canvas = document.getElementById("canvas");
        Object.assign(canvas, { width: coreConfig.width, height: coreConfig.height });
        gameView(romFile.name, coreConfig); initAudio(coreConfig);
        window.Module = {
            isFBNeo: isFBNeo, 
            canvas, locateFile: (path) => path.endsWith('.wasm') ? (window.wasmUrl || path) : path,
            onRuntimeInitialized() {
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