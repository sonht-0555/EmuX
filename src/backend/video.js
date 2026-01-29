let ctx, imgData, data32;
let ctxB, imgDataB, data32B, canvasB;
const lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
    lut565[i] = 0xFF000000 | ((i & 0x001F) << 19) | ((i & 0x07E0) << 5) | ((i & 0xF800) >> 8);
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
  if (Module.isNDS) {
    const halfHeight = height >> 1;
    if (Module.canvas.width !== width || Module.canvas.height !== halfHeight) {
      Module.canvas.width = canvasB.width = width;
      Module.canvas.height = canvasB.height = halfHeight;
      imgData = ctx.createImageData(width, halfHeight);
      imgDataB = ctxB.createImageData(width, halfHeight);
      data32 = new Uint32Array(imgData.data.buffer);
      data32B = new Uint32Array(imgDataB.data.buffer);
    }
    const src = new Uint32Array(Module.HEAPU8.buffer, pointer, width * height);
    const len = width * halfHeight;
    for (let i = 0; i < len; i++) {
        const p1 = src[i], p2 = src[i + len];
        data32[i]  = 0xFF000000 | (p1 & 0xFF) << 16 | (p1 & 0xFF00) | (p1 >> 16) & 0xFF;
        data32B[i] = 0xFF000000 | (p2 & 0xFF) << 16 | (p2 & 0xFF00) | (p2 >> 16) & 0xFF;
    }
    ctx.putImageData(imgData, 0, 0);
    ctxB.putImageData(imgDataB, 0, 0);
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
    const src = new Uint32Array(Module.HEAPU8.buffer, pointer, width * height);
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        data32[i] = 0xFF000000 | (c & 0x0000FF) << 16 | (c & 0x00FF00) | (c & 0xFF0000) >> 16;
    }
  } else { 
    const src = new Uint16Array(Module.HEAPU8.buffer, pointer, (pitch >> 1) * height);
    const stride = pitch >> 1;
    for (let y = 0; y < height; y++) {
      let si = y * stride, di = y * width;
      for (let x = 0; x < width; x++) {
        data32[di + x] = lut565[src[si + x]];
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}