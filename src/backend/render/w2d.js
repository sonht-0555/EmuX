let context2d, context2dBottom, imageData, imageDataBottom;
let lastMainFramePtr = 0, lastBottomFramePtr = 0;
let sourceView32, cachedRender32Fn, cachedRender16Fn;
let visualBufferPtr = 0, visualBufferBottomPtr = 0, lutPtr = 0;
// ===== render32 =====
function render32(source, sourceOffset, lastFramePtr, context, imageDataObject, length, vBufPtr) {
    frameCount++;
    const renderFn = cachedRender32Fn || (cachedRender32Fn = Module._emux_render32 || Module.asm?._emux_render32 || Module.instance?.exports?._emux_render32);
    if (renderFn && lastFramePtr && renderFn(source.byteOffset + (sourceOffset << 2), lastFramePtr, vBufPtr, length)) {
        context.putImageData(imageDataObject, 0, 0);
    } else { skippedFrames++; }
}
// ===== render16 =====
function render16(source32, last32Ptr, context, imageDataObject, width, height, stride) {
    frameCount++;
    const renderFn = cachedRender16Fn || (cachedRender16Fn = Module._emux_render16 || Module.asm?._emux_render16 || Module.instance?.exports?._emux_render16);
    if (!lutPtr && (typeof lookupTable565 !== 'undefined')) {
        lutPtr = Module._malloc(lookupTable565.length << 2);
        new Uint32Array(Module.HEAPU8.buffer, lutPtr, lookupTable565.length).set(lookupTable565);
    }
    if (renderFn && last32Ptr && renderFn(source32.byteOffset, last32Ptr, visualBufferPtr, width, height, stride, lutPtr)) {
        context.putImageData(imageDataObject, 0, 0);
    } else { skippedFrames++; }
}
// ===== renderNDS =====
function renderNDS(pointer, width, height) {
    const heap = Module.HEAPU8; if (!heap) return;
    const halfHeight = height >> 1; const pixelCount = width * halfHeight;
    if (cachedWidth !== width || cachedHeight !== halfHeight || !visualBufferPtr) {
        cachedWidth = width; cachedHeight = halfHeight;
        Module.canvas.width = canvasB.width = width; Module.canvas.height = canvasB.height = halfHeight;
        if (visualBufferPtr) Module._free(visualBufferPtr); if (visualBufferBottomPtr) Module._free(visualBufferBottomPtr);
        visualBufferPtr = Module._malloc(pixelCount << 2); visualBufferBottomPtr = Module._malloc(pixelCount << 2);
        imageData = new ImageData(new Uint8ClampedArray(heap.buffer, visualBufferPtr, pixelCount << 2), width, halfHeight);
        imageDataBottom = new ImageData(new Uint8ClampedArray(heap.buffer, visualBufferBottomPtr, pixelCount << 2), width, halfHeight);
        if (lastMainFramePtr) Module._free(lastMainFramePtr); if (lastBottomFramePtr) Module._free(lastBottomFramePtr);
        lastMainFramePtr = Module._malloc(pixelCount << 2); lastBottomFramePtr = Module._malloc(pixelCount << 2);
        sourceView32 = null; if (typeof gameView !== 'undefined') gameView(gameName);
    }
    if (!sourceView32 || sourceView32.buffer !== heap.buffer || ndsPointer !== pointer) {
        ndsPointer = pointer; sourceView32 = new Uint32Array(heap.buffer, pointer, width * height);
    }
    render32(sourceView32, 0, lastMainFramePtr, context2d, imageData, pixelCount, visualBufferPtr);
    render32(sourceView32, pixelCount, lastBottomFramePtr, context2dBottom, imageDataBottom, pixelCount, visualBufferBottomPtr);
    logSkip();
}
// ===== activeRenderFn =====
self.activeRenderFn = function(pointer, width, height, pitch) {
    if (!context2d) {
        context2d = Module.canvas.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
        if (Module.isNDS && canvasB) {
            context2dBottom = canvasB.getContext('2d', { alpha: false, desynchronized: true, willReadFrequently: false });
            self.postMessage({ type: 'NDS_LAYOUT' });
        }
    }
    if (Module.isNDS) return renderNDS(pointer, width, height);
    const pixelCount = width * height; const is32 = pitch === (width << 2); const heap = Module.HEAPU8;
    if (width !== cachedWidth || height !== cachedHeight || pitch !== cachedPitch || !visualBufferPtr) {
        cachedWidth = width; cachedHeight = height; cachedPitch = pitch; cachedBuffer = null;
        Module.canvas.width = width; Module.canvas.height = height;
        if (visualBufferPtr) Module._free(visualBufferPtr);
        visualBufferPtr = Module._malloc(pixelCount << 2);
        imageData = new ImageData(new Uint8ClampedArray(heap.buffer, visualBufferPtr, pixelCount << 2), width, height);
        if (lastMainFramePtr) Module._free(lastMainFramePtr);
        lastMainFramePtr = Module._malloc(pitch * height);
        if (typeof gameView !== 'undefined') gameView(gameName);
    }
    if (heap.buffer !== cachedBuffer || pointer !== cachedPointer) {
        cachedBuffer = heap.buffer; cachedPointer = pointer;
        sourceView32 = new Uint32Array(heap.buffer, pointer, is32 ? pixelCount : ((pitch >> 1) * height) >> 1);
    }
    if (is32) render32(sourceView32, 0, lastMainFramePtr, context2d, imageData, pixelCount, visualBufferPtr);
    else render16(sourceView32, lastMainFramePtr, context2d, imageData, width, height, pitch >> 1);
    logSkip();
};