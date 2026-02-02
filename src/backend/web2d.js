// ===== web2d.js =====
let context2d, context2dBottom, imgData, imgDataBottom, pixelBuffer, pixelBufferBottom, lastMain, lastBottom, lastView16as32, srcView32, srcView16;
function render32(source, sourceOffset, last, buffer, context, img, length) {
  frameCount++;
  const end = sourceOffset + length;
  for (let i = end - 1; i >= sourceOffset; i--) {
    if (source[i] !== last[i - sourceOffset]) {
      for (let j = 0, k = sourceOffset; j < length; j++, k++) {
        const color = last[j] = source[k];
        buffer[j] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color >> 16) & 0xFF;
      }
      context.putImageData(img, 0, 0); return;
    }
  }
  skippedFrames++;
}
function render16(source16, source32, last32, buffer, context, img, width, height, stride) {
  frameCount++;
  const widthWords = width >> 1, strideWords = stride >> 1;
  for (let y = height - 1; y >= 0; y--) {
    const sourceIndex = y * strideWords, lastIndex = y * widthWords;
    for (let x = widthWords - 1; x >= 0; x--) {
      if (source32[sourceIndex + x] !== last32[lastIndex + x]) {
        for (let y2 = 0; y2 < height; y2++) {
          const si2 = y2 * stride, li2 = y2 * width, si32 = y2 * strideWords, li32 = y2 * widthWords;
          for (let x2 = 0; x2 < widthWords; x2++) {
            const i = x2 << 1;
            buffer[li2 + i] = lut565[source16[si2 + i]];
            buffer[li2 + i + 1] = lut565[source16[si2 + i + 1]];
            last32[li32 + x2] = source32[si32 + x2];
          }
        }
        context.putImageData(img, 0, 0); return;
      }
    }
  }
  skippedFrames++;
}
function renderNDS(pointer, width, height) {
  const halfHeight = height >> 1, length = width * halfHeight, buffer = Module.HEAPU8.buffer;
  if (cachedWidth !== width || cachedHeight !== halfHeight) {
    cachedWidth = width; cachedHeight = halfHeight; Module.canvas.width = canvasB.width = width; Module.canvas.height = canvasB.height = halfHeight;
    imgData = context2d.createImageData(width, halfHeight); imgDataBottom = context2dBottom.createImageData(width, halfHeight);
    pixelBuffer = new Uint32Array(imgData.data.buffer); pixelBufferBottom = new Uint32Array(imgDataBottom.data.buffer);
    lastMain = new Uint32Array(length); lastBottom = new Uint32Array(length);
    srcView32 = null; if (window.gameView) gameView(gameName);
  }
  if (!srcView32 || srcView32.buffer !== buffer || ndsPointer !== pointer) { ndsPointer = pointer; srcView32 = new Uint32Array(buffer, pointer, width * height); }
  render32(srcView32, 0, lastMain, pixelBuffer, context2d, imgData, length);
  render32(srcView32, length, lastBottom, pixelBufferBottom, context2dBottom, imgDataBottom, length);
  logSkip();
}
window.activeRenderFn = function(pointer, width, height, pitch) {
  if (!context2d) {
    context2d = Module.canvas.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
    if (Module.isNDS) {
      page02.style.paddingTop = "5px"; canvasB.style.display = "block"; joypad.style.justifyContent = "center"; joy.style.display = "none";
      context2dBottom = canvasB.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
    }
  }
  if (Module.isNDS) return renderNDS(pointer, width, height);
  const length = width * height, is32 = pitch === (width << 2), buffer = Module.HEAPU8.buffer;
  if (width !== cachedWidth || height !== cachedHeight || pitch !== cachedPitch) {
    cachedWidth = width; cachedHeight = height; cachedPitch = pitch; cachedBuffer = null; Module.canvas.width = width; Module.canvas.height = height;
    imgData = context2d.createImageData(width, height); pixelBuffer = new Uint32Array(imgData.data.buffer);
    if (is32) lastMain = new Uint32Array(length); else lastView16as32 = new Uint32Array(length >> 1);
    if (window.gameView) gameView(gameName);
  }
  if (buffer !== cachedBuffer || pointer !== cachedPointer) {
    cachedBuffer = buffer; cachedPointer = pointer; srcView32 = new Uint32Array(buffer, pointer, is32 ? length : ((pitch >> 1) * height) >> 1);
    if (!is32) srcView16 = new Uint16Array(buffer, pointer, (pitch >> 1) * height);
  }
  if (is32) render32(srcView32, 0, lastMain, pixelBuffer, context2d, imgData, length);
  else render16(srcView16, srcView32, lastView16as32, pixelBuffer, context2d, imgData, width, height, pitch >> 1);
  logSkip();
};