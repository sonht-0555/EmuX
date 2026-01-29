let ctx, imgData, data32;
const lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
    lut565[i] = 0xFF000000 | ((i & 0x001F) << 19) | ((i & 0x07E0) << 5) | ((i & 0xF800) >> 8);
}
function video_cb(pointer, width, height, pitch) {
  if (!ctx) {
    ctx = Module.canvas.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
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
        data32[i] = 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16) & 0xFF;
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