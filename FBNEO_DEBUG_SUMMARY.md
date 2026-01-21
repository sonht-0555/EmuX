# FBNeo WASM Debugging Summary

## 📌 Status: FIXED & STABLE

Completed debugging for FBNeo WebAssembly core integration with correct arcade rotation and clean logging.

### 1. Key Fixes

#### 🎥 Video & Rotation (TATE)
- **Problem**: Vertical arcade games (like 1941) were displayed sideways or distorted.
- **Solution**: 
    - Set `fbneo-vertical-mode` to `Enabled` in `env_cb` to get native vertical buffers.
    - Implemented a manual CSS rotation mechanism (`transform: rotate(-deg)`) with a UI button for final user control.
    - Corrected canvas margin adjustments when rotated 90/270 degrees.

#### 🛠️ Memory & Stability
- **Heap Overflow**: Increased `avInfo` buffer size to 128 bytes in `retro_get_system_av_info` to prevent heap corruption.
- **Bounds Check**: Fixed `video_refresh_cb` to correctly calculate `subarray` ranges in `HEAPU16/32` based on pitch and height.

#### 🧩 Signature Mismatch
- **Issue**: WebAssembly crashes when function signatures don't match between C and JS.
- **Fixed Signatures**:
    - `env_cb`: `iii` (returning int, taking 2 ints)
    - `video_refresh_cb`: `viiii` (returning void, taking 4 ints)
    - `audio_batch_cb`: `iii`
    - `input_state_cb`: `iiiii`

#### 🧹 Cleaner Console
- **Glue Logs**: Commented out `printf` in `retro_glue.c` to stop file system spam.
- **Env Logs**: Filtered out common spammy commands (cmd 17, 65583) in JavaScript.
- **IDE Support**: Added `#ifndef EMSCRIPTEN_KEEPALIVE` fallbacks in `retro_glue.c` to remove red squiggly lines in the editor.

### 2. Variable Configurations
To ensure best compatibility with FBNeo, the following variables are forced in `env_cb`:
- `fbneo-vertical-mode`: `Enabled`
- `fbneo-fixed-orientation`: `Vertical`
- `fbneo-sample-rate`: `44100`

### 3. Future Improvements (Size Optimization)
Current WASM size (~40MB) can be reduced by:
- Using `-Oz` optimization flag in Emscripten.
- Running `wasm-opt -O4` on the final binary.
- Stripping debug symbols (`-s STRIP_SYMBOLS=1`).
- Enabling Gzip/Brotli compression on the web server.
