// ===== LibEnvironment =====
window.env_cb = function (cmd, data) {
    console.log('env_cb called with cmd:', cmd, 'data:', data);
    switch (cmd) {
        case 1:  // RETRO_ENVIRONMENT_SET_ROTATION
        case 10: // RETRO_ENVIRONMENT_SET_PIXEL_FORMAT
            if (data) Module.pixelFormat = Module.HEAP32[data >> 2];
            return 1;

        case 3:  // RETRO_ENVIRONMENT_GET_CAN_DUPE
            if (data) Module.HEAP8[data] = 1;
            return 1;

        case 8:  // RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL
            return 1;

        case 9:  // RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO (deprecated)
        case 14: // RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY
        case 31: // RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY
            if (data) {
                if (!env_cb.sysDir) {
                    env_cb.sysDir = Module._malloc(2);
                    Module.stringToUTF8("/", env_cb.sysDir, 2);
                }
                Module.HEAP32[data >> 2] = env_cb.sysDir;
            }
            return 1;

        case 11: // RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS
        case 16: // RETRO_ENVIRONMENT_GET_INPUT_BITMASKS
        case 17: // RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE
            return 1;

        case 13: // RETRO_ENVIRONMENT_GET_RUMBLE_INTERFACE
            return 0; // No rumble support

        case 15: // RETRO_ENVIRONMENT_GET_VARIABLE
            if (data) {
                const keyPtr = Module.HEAP32[data >> 2];
                const key = Module.UTF8ToString(keyPtr);
                console.log('Variable requested:', key);
                // Return null for all variables (use defaults)
                Module.HEAP32[(data >> 2) + 1] = 0;
            }
            return 0;

        case 27: // RETRO_ENVIRONMENT_GET_LOG_INTERFACE
            return 0;

        case 35: // RETRO_ENVIRONMENT_SET_GEOMETRY
            return 1;

        case 44: // RETRO_ENVIRONMENT_GET_FASTFORWARDING
            if (data) Module.HEAP8[data] = 0; // Not fast forwarding
            return 1;

        case 52: // RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME
            return 1;

        case 57: // RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION
            if (data) Module.HEAP32[data >> 2] = 1; // Version 1
            return 1;

        case 58: // RETRO_ENVIRONMENT_SET_CORE_OPTIONS
            return 1;

        case 65: // RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2_INTL
            return 1;

        case 66: // RETRO_ENVIRONMENT_GET_VFS_INTERFACE
            // Return 0 to indicate no VFS interface (use standard file I/O)
            return 0;

        case 65587: // RETRO_ENVIRONMENT_GET_AUDIO_VIDEO_ENABLE
        case 65583:
            if (data) Module.HEAP32[data >> 2] = 0x3; // Both audio and video enabled
            return 1;

        case 65581: // RETRO_ENVIRONMENT_GET_PREFERRED_HW_RENDER
            return 0; // No hardware rendering

        case 65582: // RETRO_ENVIRONMENT_GET_HW_RENDER_CONTEXT_NEGOTIATION_INTERFACE_SUPPORT
            return 0;

        default:
            console.warn('Unhandled env command:', cmd);
            return 0;
    }
}

// ===== Core =====
const CORE_CONFIG = {
    gba: { ratio: 65536 / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.js' },
    gbc: { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.js' },
    snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.js' },
    nes: { ratio: 29780 / 48000, width: 256, height: 240, ext: '.nes', script: './src/core/nes.js' },
    gen: { ratio: 147456 / 48000, width: 320, height: 224, ext: '.gen,.smd,.bin,.md', script: './src/core/genesis.js' },
};
var isRunning = false;
async function initCore(file) {
    let ext = file.name.split('.').pop().toLowerCase(), rom, cfg;
    if (ext === 'zip') {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const n = Object.keys(zip.files).find(n => /\.(gba|gbc|gb|smc|sfc|gen|smd|bin|md)$/i.test(n));
        if (!n) return;
        ext = n.split('.').pop().toLowerCase();
        rom = await zip.files[n].async('uint8array');
    } else {
        rom = new Uint8Array(await file.arrayBuffer());
    }
    cfg = Object.values(CORE_CONFIG).find(c => c.ext.includes(ext));
    if (!cfg) return;
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById("canvas");
        canvas.width = cfg.width;
        canvas.height = cfg.height;
        gameView(file.name, cfg)
        initAudio(cfg);

        // Define polyfill functions globally before loading WASM
        window._strcasestr_retro__ = function (haystackPtr, needlePtr) {
            try {
                const haystack = Module.UTF8ToString(haystackPtr).toLowerCase();
                const needle = Module.UTF8ToString(needlePtr).toLowerCase();
                const index = haystack.indexOf(needle);
                return index === -1 ? 0 : haystackPtr + index;
            } catch (e) {
                console.error('strcasestr error:', e);
                return 0;
            }
        };

        window._strlcpy_retro__ = function (dstPtr, srcPtr, size) {
            try {
                const src = Module.UTF8ToString(srcPtr);
                const len = Math.min(src.length, size - 1);
                Module.stringToUTF8(src.substring(0, len), dstPtr, size);
                return src.length;
            } catch (e) {
                console.error('strlcpy error:', e);
                return 0;
            }
        };

        window._strlcat_retro__ = function (dstPtr, srcPtr, size) {
            try {
                const dst = Module.UTF8ToString(dstPtr);
                const src = Module.UTF8ToString(srcPtr);
                const result = dst + src;
                const len = Math.min(result.length, size - 1);
                Module.stringToUTF8(result.substring(0, len), dstPtr, size);
                return result.length;
            } catch (e) {
                console.error('strlcat error:', e);
                return 0;
            }
        };

        window.Module = {
            canvas,
            onRuntimeInitialized() {
                try {
                    // Write ROM to filesystem for cores that need VFS
                    const romPath = '/game.' + ext;
                    Module.FS.writeFile(romPath, rom);

                    const pathBytes = new TextEncoder().encode(romPath + '\0');
                    const pathPtr = Module._malloc(pathBytes.length);
                    Module.HEAPU8.set(pathBytes, pathPtr);

                    const info = Module._malloc(16);

                    // Register callbacks with proper wrapping
                    const callbacks = [
                        [Module._retro_set_environment, env_cb, "iii"],
                        [Module._retro_set_video_refresh, video_cb, "viiii"],
                        [Module._retro_set_audio_sample, audio_cb, "vii"],
                        [Module._retro_set_audio_sample_batch, audio_batch_cb, "iii"],
                        [Module._retro_set_input_poll, input_poll_cb, "v"],
                        [Module._retro_set_input_state, input_state_cb, "iiiii"]
                    ];

                    callbacks.forEach(([fn, cb, sig]) => {
                        if (fn && typeof fn === 'function') {
                            fn(Module.addFunction(cb, sig));
                        }
                    });

                    Module._retro_init();

                    // Set up retro_game_info structure
                    Module.HEAP32[info >> 2] = pathPtr;  // path
                    Module.HEAP32[(info >> 2) + 1] = 0;  // data (null, will read from file)
                    Module.HEAP32[(info >> 2) + 2] = 0;  // size (0, will read from file)
                    Module.HEAP32[(info >> 2) + 3] = 0;  // meta

                    if (!Module._retro_load_game(info)) {
                        console.error('Failed to load game');
                        reject(new Error('Failed to load game'));
                        return;
                    }

                    // Start game loop with error handling
                    function loop() {
                        try {
                            Module._retro_run();
                            requestAnimationFrame(loop);
                        } catch (e) {
                            console.error('Runtime error:', e);
                            isRunning = false;
                        }
                    }
                    requestAnimationFrame(loop);

                    rom = null;
                    isRunning = true;
                    resolve();
                } catch (e) {
                    console.error('Initialization error:', e);
                    reject(e);
                }
            }
        };
        const script = document.createElement('script');
        script.src = cfg.script;
        script.onload = () => { };
        script.onerror = reject;
        document.body.appendChild(script);
    });
}