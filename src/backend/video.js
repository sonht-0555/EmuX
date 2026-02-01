let mainContext, imageData, bufferCanvas, bufferContext;

function video_cb(pointer, width, height, pitch) {
  const canvas = Module.canvas;
  if (!mainContext || mainContext.canvas !== canvas) {
    mainContext = canvas.getContext('2d', { alpha: false });
  }
  if (!bufferCanvas || bufferCanvas.width !== width || bufferCanvas.height !== height) {
    bufferCanvas = new OffscreenCanvas(width, height);
    bufferContext = bufferCanvas.getContext('2d', { alpha: false, desynchronized: true });
    imageData = bufferContext.createImageData(width, height);
    canvas.width = width;
    canvas.height = height;
  }
  const bytesPerPixel = pitch / width;
  const pixelView = new Uint32Array(imageData.data.buffer);
  if (bytesPerPixel === 4) {
    const rawBuffer = new Uint32Array(Module.HEAPU8.buffer, pointer, width * height);
    for (let i = 0; i < rawBuffer.length; i++) {
      const color = rawBuffer[i];
      pixelView[i] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color & 0xFF0000) >> 16;
    }
  } else {
    const rawBuffer = new Uint16Array(Module.HEAPU8.buffer, pointer, (pitch >> 1) * height);
    const stride = pitch >> 1;
    for (let y = 0; y < height; y++) {
      const sourceIndex = y * stride;
      const destinationIndex = y * width;
      for (let x = 0; x < width; x++) {
        const color = rawBuffer[sourceIndex + x];
        pixelView[destinationIndex + x] = 0xFF000000 | ((color & 0x001F) << 19) | ((color & 0x07E0) << 5) | ((color & 0xF800) >> 8);
      }
    }
  }
  bufferContext.putImageData(imageData, 0, 0);
  mainContext.drawImage(bufferCanvas, 0, 0);
}