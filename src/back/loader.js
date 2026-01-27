// ===== LibEnvironment =====
function env_cb(cmd, data) {
    if (cmd === 10) return 1;
}
// ===== Core =====
const CORE_CONFIG = {
    gba:     { ratio: 65536  / 48000, ext: '.gba', script: './src/core/gba.zip' },
    gbc:     { ratio: 131072 / 48000, ext: '.gb,.gbc', script: './src/core/gba.zip' },
    snes:    { ratio: 32000  / 48000, ext: '.smc,.sfc', script: './src/core/snes2010.zip' },
    nes:     { ratio: 44100  / 48000, ext: '.nes', script: './src/core/nes.zip' },
    arcade:  { ratio: 48000  / 48000, ext: '.zip', script: './src/core/arcade.zip' },
    genesis: { ratio: 48000  / 48000, ext: '.md,.bin,.gen', script: './src/core/genesis.zip' },
    ngp:     { ratio: 44100  / 48000, ext: '.ngp,.ngc', script: './src/core/ngp.zip' },
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
    notifi("",".",".......","")
    const lowName = romFile.name.toLowerCase();
    const isZip = lowName.endsWith('.zip');
    const romBuffer = await romFile.arrayBuffer();
    const binaryData = new Uint8Array(romBuffer);
    let finalRomName = romFile.name, finalRomData = binaryData;
    const consoleExts = /\.(gba|gbc|gb|smc|sfc|nes|md|gen|ngp|ngc)$/i;
    if (isZip) {
        notifi("","..","......","")
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
    const isFBNeo = scriptSource.includes('arcade');
    const isGenesis = scriptSource.includes('genesis') || scriptSource.includes('ngp');
    if (scriptSource.endsWith('.zip')) {
        notifi("","...",".....","")
        const response = await fetch(scriptSource);
        if (!response.ok) return;
        const bundleBuffer = await response.arrayBuffer();
        notifi("","....","....","")
        const coreFiles = await unzip(new Uint8Array(bundleBuffer), /\.(js|wasm)$/i);
        const jsName = Object.keys(coreFiles).find(n => n.endsWith('.js'));
        const wasmName = Object.keys(coreFiles).find(n => n.endsWith('.wasm'));
        if (!jsName || !wasmName) return;
        let jsBin = coreFiles[jsName], jsLen = jsBin.length;
        while (jsLen > 0 && jsBin[jsLen - 1] === 0) jsLen--;
        scriptSource = URL.createObjectURL(new Blob([jsBin.slice(0, jsLen)], { type: 'application/javascript' }));
        window.wasmUrl = URL.createObjectURL(new Blob([coreFiles[wasmName]], { type: 'application/wasm' }));
    }
    notifi("",".....","...","")
    return new Promise((resolve) => {
        const canvas = document.getElementById("canvas");
        initAudio(coreConfig);
        window.Module = {
            isFBNeo, canvas,
            locateFile: (path) => path.endsWith('.wasm') ? (window.wasmUrl || path) : path,
            async onRuntimeInitialized() {
                notifi("","......","..","")
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
                    notifi("",".......",".","")
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
                } else if (isGenesis) {
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
                (function mainLoop() { Module._retro_run(), requestAnimationFrame(mainLoop) })();
                isRunning = true; 
                notifi("","........","","")
                resolve();
            }
        };
        const scriptElement = document.createElement('script'); scriptElement.src = scriptSource; document.body.appendChild(scriptElement);
        gameName = romFile.name;
    });
}