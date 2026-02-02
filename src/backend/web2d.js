// ===== canvas2d.js (Cực nhẹ, Integer Scale) =====
var ctx2d, ctx2dBottom, imgData2d, imgData2dB, pix2d, pix2dB, lastM2d, lastB2d, last16as32_2d, src32_2d, src16_2d;
var fC = 0, fS = 0, cW = 0, cH = 0, cPi = 0, cBu = null, cPo = 0, nPo = 0;
const lut5 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
  const r = (i & 0xF800) >> 8, g = (i & 0x07E0) >> 3, b = (i & 0x001F) << 3;
  lut5[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
}
function logS() {
  if (fC > 0 && (fC & 63) === 0 && window.skip1) skip1.textContent = `${(fS * 100 / fC) | 0}% `;
  if (fC > 1000) { fC = 0; fS = 0; }
}
function r32_2d(source, sO, last, target, ctx, img, length) {
  fC++; const end = sO + length;
  for (let i = end - 1; i >= sO; i--) {
    if (source[i] !== last[i - sO]) {
      for (let j = 0, k = sO; j < length; j++, k++) {
        const c = last[j] = source[k];
        target[j] = 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16) & 0xFF;
      }
      ctx.putImageData(img, 0, 0); return;
    }
  }
  fS++;
}
function r16_2d(source16, source32, last32, target, ctx, img, w, h, stride) {
  fC++; const wW = w >> 1, sW = stride >> 1;
  for (let y = h - 1; y >= 0; y--) {
    const si = y * sW, li = y * wW;
    for (let x = wW - 1; x >= 0; x--) {
      if (source32[si + x] !== last32[li + x]) {
        for (let y2 = 0; y2 < h; y2++) {
          const si2 = y2 * stride, li2 = y2 * w, si32 = y2 * sW, li32 = y2 * wW;
          for (let x2 = 0; x2 < wW; x2++) {
            const i = x2 << 1;
            target[li2 + i] = lut5[source16[si2 + i]];
            target[li2 + i + 1] = lut5[source16[si2 + i + 1]];
            last32[li32 + x2] = source32[si32 + x2];
          }
        }
        ctx.putImageData(img, 0, 0); return;
      }
    }
  }
  fS++;
}
window.activeRenderFn = function(ptr, w, h, pitch) {
  if (!ctx2d) {
    ctx2d = Module.canvas.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
    if (Module.isNDS) {
      page02.style.paddingTop = "5px"; canvasB.style.display = "block"; joypad.style.justifyContent = "center"; joy.style.display = "none";
      ctx2dBottom = canvasB.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
    }
  }
  if (Module.isNDS) {
    const hh = h >> 1, len = w * hh, b = Module.HEAPU8.buffer;
    if (cW !== w || cH !== hh) {
      cW = w; cH = hh; Module.canvas.width = canvasB.width = w; Module.canvas.height = canvasB.height = hh;
      imgData2d = ctx2d.createImageData(w, hh); imgData2dB = ctx2dBottom.createImageData(w, hh);
      pix2d = new Uint32Array(imgData2d.data.buffer); pix2dB = new Uint32Array(imgData2dB.data.buffer);
      lastM2d = new Uint32Array(len); lastB2d = new Uint32Array(len);
      src32_2d = null; if (window.gameView) gameView(gameName);
    }
    if (!src32_2d || src32_2d.buffer !== b || nPo !== ptr) { nPo = ptr; src32_2d = new Uint32Array(b, ptr, w * h); }
    r32_2d(src32_2d, 0, lastM2d, pix2d, ctx2d, imgData2d, len);
    r32_2d(src32_2d, len, lastB2d, pix2dB, ctx2dBottom, imgData2dB, len);
    logS(); return;
  }
  const len = w * h, is32 = pitch === (w << 2), b = Module.HEAPU8.buffer;
  if (w !== cW || h !== cH || pitch !== cPi) {
    cW = w; cH = h; cPi = pitch; cBu = null; Module.canvas.width = w; Module.canvas.height = h;
    imgData2d = ctx2d.createImageData(w, h); pix2d = new Uint32Array(imgData2d.data.buffer);
    if (is32) lastM2d = new Uint32Array(len); else last16as32_2d = new Uint32Array(len >> 1);
    if (window.gameView) gameView(gameName);
  }
  if (b !== cBu || ptr !== cPo) {
    cBu = b; cPo = ptr; src32_2d = new Uint32Array(b, ptr, is32 ? len : ((pitch >> 1) * h) >> 1);
    if (!is32) src16_2d = new Uint16Array(b, ptr, (pitch >> 1) * h);
  }
  if (is32) r32_2d(src32_2d, 0, lastM2d, pix2d, ctx2d, imgData2d, len);
  else r16_2d(src16_2d, src32_2d, last16as32_2d, pix2d, ctx2d, imgData2d, w, h, pitch >> 1);
  logS();
};
