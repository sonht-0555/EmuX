// ===== LibEnvironment =====
function env_cb(cmd, data) {
    if (cmd === 1 || cmd === 10) return 1; // SET_PIXEL_FORMAT
    if (cmd === 3) { if (data) Module.HEAP8[data] = 1; return 1; } // GET_CAN_DUPE
    return 0;
}

// ===== Core =====
const CORE_CONFIG = {
    gba: { ratio: 65536 / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.js' },
    gbc: { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.js' },
    snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.js' },
    nes: { ratio: 29780 / 48000, width: 256, height: 240, ext: '.nes', script: './src/core/nes.js' }
};
var isRunning = false;
async function initCore(file) {
    console.log('[initCore] Starting with file:', file.name, 'Size:', file.size);
    let ext = file.name.split('.').pop().toLowerCase(), rom, cfg;

    if (ext === 'zip') {
        console.log('[initCore] ZIP file detected');

        // Check JSZip availability
        if (typeof JSZip === 'undefined') {
            console.error('[initCore] JSZip not loaded!');
            alert('Error: ZIP library not available. Please refresh the page.');
            return;
        }
        console.log('[initCore] JSZip is available');

        try {
            console.log('[initCore] Reading ZIP arrayBuffer...');
            const arrayBuffer = await file.arrayBuffer();
            console.log('[initCore] ArrayBuffer size:', arrayBuffer.byteLength);

            console.log('[initCore] Loading ZIP with JSZip...');
            const zip = await JSZip.loadAsync(arrayBuffer);
            console.log('[initCore] ZIP loaded, files:', Object.keys(zip.files));

            const n = Object.keys(zip.files).find(n => /\.(gba|gbc|gb|smc|sfc|nes)$/i.test(n));
            if (!n) {
                console.error('[initCore] No valid ROM found in ZIP');
                alert('No valid game file found in ZIP.\nSupported: .gba, .gbc, .gb, .smc, .sfc, .nes');
                return;
            }

            console.log('[initCore] Extracting ROM:', n);
            ext = n.split('.').pop().toLowerCase();
            rom = await zip.files[n].async('uint8array');
            console.log('[initCore] ROM extracted, size:', rom.length, 'Extension:', ext);
        } catch (error) {
            console.error('[initCore] ZIP extraction error:', error);
            alert('Error extracting ZIP: ' + error.message);
            return;
        }
    } else {
        console.log('[initCore] Direct ROM file');
        try {
            rom = new Uint8Array(await file.arrayBuffer());
            console.log('[initCore] ROM loaded, size:', rom.length);
        } catch (error) {
            console.error('[initCore] File read error:', error);
            alert('Error reading file: ' + error.message);
            return;
        }
    }

    cfg = Object.values(CORE_CONFIG).find(c => c.ext.includes(ext));
    if (!cfg) {
        console.error('[initCore] Unsupported extension:', ext);
        alert('Unsupported file type: .' + ext);
        return;
    }

    console.log('[initCore] Core config found:', cfg);
    return new Promise((resolve, reject) => {
        console.log('[initCore] Setting up canvas...');
        const canvas = document.getElementById("canvas");
        canvas.width = cfg.width;
        canvas.height = cfg.height;
        console.log('[initCore] Canvas configured:', canvas.width, 'x', canvas.height);
        
        console.log('[initCore] Calling gameView and initAudio...');
        gameView(file.name, cfg);
        initAudio(cfg);
        
        console.log('[initCore] Setting up Module...');
        window.Module = {
            canvas, onRuntimeInitialized() {
                console.log('[Module] Runtime initialized!');
                try {
                    const romPtr = Module._malloc(rom.length);
                    const info = Module._malloc(16);
                    console.log('[Module] Memory allocated, romPtr:', romPtr, 'info:', info);
                    
                    [[Module._retro_set_environment, env_cb, "iii"],
                    [Module._retro_set_video_refresh, video_cb, "viiii"],
                    [Module._retro_set_audio_sample, audio_cb, "vii"],
                    [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"],
                    [Module._retro_set_input_poll, input_poll_cb, "v"],
                    [Module._retro_set_input_state, input_state_cb, "iiiii"]
                    ].forEach(([fn, cb, sig]) => fn(Module.addFunction(cb, sig)));
                    console.log('[Module] Callbacks registered');
                    
                    Module._retro_init();
                    console.log('[Module] Retro initialized');
                    
                    Module.HEAPU8.set(rom, romPtr);
                    Module.HEAPU32.set([0, romPtr, rom.length, 0], info >> 2);
                    console.log('[Module] ROM data copied to memory');
                    
                    Module._retro_load_game(info);
                    console.log('[Module] Game loaded!');
                    
                    (function loop() { Module._retro_run(), requestAnimationFrame(loop) })();
                    console.log('[Module] Game loop started');
                    
                    rom = null;
                    resolve();
                    isRunning = true;
                    console.log('[Module] Initialization complete!');
                } catch (error) {
                    console.error('[Module] Error during initialization:', error);
                    reject(error);
                }
            }
        };
        
        console.log('[initCore] Loading core script:', cfg.script);
        const script = document.createElement('script');
        script.src = cfg.script;
        script.onload = () => { 
            console.log('[initCore] Core script loaded successfully');
        };
        script.onerror = (error) => {
            console.error('[initCore] Failed to load core script:', error);
            reject(error);
        };
        document.body.appendChild(script);
        console.log('[initCore] Core script tag added to DOM');
    });
}