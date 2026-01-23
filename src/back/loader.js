// ===== LibEnvironment =====
function env_cb (cmd, data) {
    if (cmd === 1 || cmd === 10) return 1;
    if (cmd === 3) { if (data) Module.HEAP8[data] = 1; return 1; }
    return 0;
}
// ===== Core =====
const CORE_CONFIG = {
    gba:  { ratio: 65536  / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.zip' },
    gbc:  { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.zip' },
    snes: { ratio: 32040  / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.zip' },
    nes:  { ratio: 44100  / 48000, width: 256, height: 240, ext: '.nes', script: './src/core/quicknes.zip' },
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
        // Skip hidden files, macOS metadata (__MACOSX), and directories
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
    const coreConfig = Object.values(CORE_CONFIG).find(config => 
        config.ext.split(',').some(extension => romFileName.endsWith(extension.toLowerCase()) || romFileName === extension.replace('.', '').toLowerCase())
    );
    if (!coreConfig) return;
    let romBinary = extractedRoms[romFileName], scriptSource = coreConfig.script;
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
            canvas, locateFile: (path) => path.endsWith('.wasm') ? (window.wasmUrl || path) : path,
            onRuntimeInitialized() {
                const romPointer = Module._malloc(romBinary.length), infoPointer = Module._malloc(16);
                [[Module._retro_set_environment, env_cb, "iii"], 
                 [Module._retro_set_video_refresh, video_cb, "viiii"], 
                 [Module._retro_set_audio_sample, audio_cb, "vii"], 
                 [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"], 
                 [Module._retro_set_input_poll, input_poll_cb, "v"], 
                 [Module._retro_set_input_state, input_state_cb, "iiiii"]
                ].forEach(([retroFunction, callback, signature]) => retroFunction(Module.addFunction(callback, signature)));
                Module._retro_init(); 
                Module.HEAPU8.set(romBinary, romPointer); 
                Module.HEAPU32.set([0, romPointer, romBinary.length, 0], infoPointer >> 2); 
                Module._retro_load_game(infoPointer);
                (function mainLoop() { Module._retro_run(), requestAnimationFrame(mainLoop) })();
                isRunning = true; 
                resolve();
            }
        };
        const scriptElement = document.createElement('script'); scriptElement.src = scriptSource; document.body.appendChild(scriptElement);
    });
}