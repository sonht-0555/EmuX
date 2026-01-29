let ctx, imgData, data32;
let ctxB, imgDataB, data32B, canvasB, lastBottom;
const lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
    lut565[i] = 0xFF000000 | ((i & 0x001F) << 19) | ((i & 0x07E0) << 5) | ((i & 0xF800) >> 8);
}
const swizzle = (c) => 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16) & 0xFF;
function renderNDS(src, width, height) {
    const halfHeight = height >> 1, len = width * halfHeight;
    if (Module.canvas.width !== width || Module.canvas.height !== halfHeight) {
        Module.canvas.width = canvasB.width = width;
        Module.canvas.height = canvasB.height = halfHeight;
        imgData = ctx.createImageData(width, halfHeight);
        imgDataB = ctxB.createImageData(width, halfHeight);
        data32 = new Uint32Array(imgData.data.buffer);
        data32B = new Uint32Array(imgDataB.data.buffer);
        lastBottom = new Uint32Array(len);
    }
    for (let i = 0; i < len; i++) data32[i] = swizzle(src[i]);
    ctx.putImageData(imgData, 0, 0);
    let dirty = false;
    for (let i = 0; i < len; i++) {
        if (src[i + len] !== lastBottom[i]) { dirty = true; break; }
    }
    
    if (dirty) {
        for (let i = 0; i < len; i++) {
            lastBottom[i] = src[i + len];
            data32B[i] = swizzle(lastBottom[i]);
        }
        ctxB.putImageData(imgDataB, 0, 0);
    }
}
function video_cb(pointer, width, height, pitch) {
    if (!ctx) {
        ctx = Module.canvas.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
        if (Module.isNDS) {
            canvasB = document.getElementById("canvas-bottom");
            canvasB.style.display = "block";
            joypad.style.justifyContent = "center";
            ctxB = canvasB.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
        }
    }

    const src32 = new Uint32Array(Module.HEAPU8.buffer, pointer, width * height);
    if (Module.isNDS) {
        renderNDS(src32, width, height);
        if (window.gameView) gameView(gameName);
        return;
    }

    if (Module.canvas.width !== width || Module.canvas.height !== height) {
        Module.canvas.width = width;
        Module.canvas.height = height;
        imgData = ctx.createImageData(width, height);
        data32 = new Uint32Array(imgData.data.buffer);
        if (window.gameView) gameView(gameName);
    }

    const bpp = pitch / width;
    if (bpp === 4) {
        for (let i = 0; i < src32.length; i++) data32[i] = swizzle(src32[i]);
    } else {
        const src16 = new Uint16Array(Module.HEAPU8.buffer, pointer, (pitch >> 1) * height);
        const stride = pitch >> 1;
        for (let y = 0; y < height; y++) {
            let si = y * stride, di = y * width;
            for (let x = 0; x < width; x++) data32[di + x] = lut565[src16[si + x]];
        }
    }
    ctx.putImageData(imgData, 0, 0);
}