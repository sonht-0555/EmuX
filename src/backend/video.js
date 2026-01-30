let ctx, imgData, data32, fT = 0, fS = 0;
let ctxB, imgDataB, data32B, lastMain, lastMain16, lastBottom;
const lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) lut565[i] = 0xFF000000 | ((i & 0x001F) << 19) | ((i & 0x07E0) << 5) | ((i & 0xF800) >> 8);
const swizzle = c => 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16) & 0xFF;
// logSkip
function logSkip() {
    if (fT > 0 && fT % 60 === 0 && window.skip1) skip1.textContent = `${Math.floor((fS / fT) * 100)}% `;
    if (fT > 1000) { fT = 0; fS = 0; }
}
// render32
function render32(src, last, target, context, img, len, offset = 0) {
    fT++;
    for (let i = 0; i < len; i++) if (src[i + offset] !== last[i]) {
        for (let j = 0; j < len; j++) target[j] = swizzle(last[j] = src[j + offset]);
        context.putImageData(img, 0, 0);
        return;
    }
    fS++;
}
// render16
function render16(src, last, target, img, width, height, stride) {
    fT++;
    for (let y = 0; y < height; y++) {
        for (let x = 0, si = y * stride, li = y * width; x < width; x++) if (src[si + x] !== last[li + x]) {
            for (let y2 = 0; y2 < height; y2++) for (let x2 = 0, si2 = y2 * stride, di = y2 * width; x2 < width; x2++) target[di + x2] = lut565[last[di + x2] = src[si2 + x2]];
            ctx.putImageData(img, 0, 0);
            return;
        }
    }
    fS++;
}
// renderNDS
function renderNDS(src, w, h) {
    const hh = h >> 1, len = w * hh;
    if (Module.canvas.width !== w || Module.canvas.height !== hh) {
        Module.canvas.width = canvasB.width = w;
        Module.canvas.height = canvasB.height = hh;
        imgData = ctx.createImageData(w, hh);
        imgDataB = ctxB.createImageData(w, hh);
        data32 = new Uint32Array(imgData.data.buffer);
        data32B = new Uint32Array(imgDataB.data.buffer);
        lastMain = new Uint32Array(len);
        lastBottom = new Uint32Array(len);
        if (window.gameView) gameView(gameName);
    }
    render32(src, lastMain, data32, ctx, imgData, len, 0);
    render32(src, lastBottom, data32B, ctxB, imgDataB, len, len);
    logSkip();
}
// video_cb
function video_cb(ptr, w, h, pitch) {
    if (!ctx) {
        ctx = Module.canvas.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
        if (Module.isNDS) {
            page02.style.paddingTop = "5px";
            canvasB.style.display = "block";
            joypad.style.justifyContent = "center";
            joy.style.display = "none";
            ctxB = canvasB.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
        }
    }

    if (Module.isNDS) return renderNDS(new Uint32Array(Module.HEAPU8.buffer, ptr, w * h), w, h);

    const len = w * h, is32 = (pitch / w) === 4;
    if (Module.canvas.width !== w || Module.canvas.height !== h) {
        Module.canvas.width = w;
        Module.canvas.height = h;
        imgData = ctx.createImageData(w, h);
        data32 = new Uint32Array(imgData.data.buffer);
        if (is32) lastMain = new Uint32Array(len);
        else lastMain16 = new Uint16Array(len);
        if (window.gameView) gameView(gameName);
    }

    if (is32) render32(new Uint32Array(Module.HEAPU8.buffer, ptr, len), lastMain, data32, ctx, imgData, len);
    else render16(new Uint16Array(Module.HEAPU8.buffer, ptr, (pitch >> 1) * h), lastMain16, data32, imgData, w, h, pitch >> 1);
    logSkip();
}