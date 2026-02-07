// ===== w2d.js =====
let context2d;
let context2dBottom;
let imageData;
let imageDataBottom;
let pixelBuffer;
let pixelBufferBottom;
let lastMainFramePtr = 0;
let lastBottomFramePtr = 0;
let lastMainFrame;
let lastBottomFrame;
let lastView16as32;
let sourceView32;
let sourceView16;
let cachedIsDirtyFn;
// ===== render32 =====
// ===== render32 =====
function render32(source, sourceOffset, lastFrame, lastFramePtr, buffer, context, imageDataObject, length, screenType) {
    frameCount++;
    const isDirtyFn = cachedIsDirtyFn || (cachedIsDirtyFn = Module._retro_is_dirty || Module.asm?._retro_is_dirty || Module.instance?.exports?._retro_is_dirty || Module.instance?.exports?.retro_is_dirty);
    if (isDirtyFn && lastFramePtr && isDirtyFn(source.byteOffset + (sourceOffset << 2), lastFramePtr, length << 2)) {
        for (let pixelIndex = 0, sourceIndex = sourceOffset; pixelIndex < length; pixelIndex++, sourceIndex++) {
            const color = source[sourceIndex];
            buffer[pixelIndex] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color >> 16) & 0xFF;
        }
        context.putImageData(imageDataObject, 0, 0);
    } else {
        skippedFrames++;
    }
}
// ===== render16 =====
function render16(source16, source32, last32, last32Ptr, buffer, context, imageDataObject, width, height, stride) {
    frameCount++;
    const lut = lookupTable565;
    const isDirtyFn = cachedIsDirtyFn || (cachedIsDirtyFn = Module._retro_is_dirty || Module.asm?._retro_is_dirty || Module.instance?.exports?._retro_is_dirty || Module.instance?.exports?.retro_is_dirty);
    const byteSize = (stride << 1) * height;
    if (isDirtyFn && last32Ptr && isDirtyFn(source32.byteOffset, last32Ptr, byteSize)) {
        for (let row = 0, srcIdx = 0, dstIdx = 0; row < height; row++, srcIdx += stride, dstIdx += width) {
            for (let col = 0; col < width; col++) {
                buffer[dstIdx + col] = lut[source16[srcIdx + col]];
            }
        }
        context.putImageData(imageDataObject, 0, 0);
    } else {
        skippedFrames++;
    }
}
// ===== renderNDS =====
function renderNDS(pointer, width, height) {
    const heap = Module.HEAPU8;
    if (!heap) return;
    const buffer = heap.buffer;
    const halfHeight = height >> 1;
    const pixelCount = width * halfHeight;
    if (cachedWidth !== width || cachedHeight !== halfHeight || !pixelBuffer) {
        cachedWidth = width;
        cachedHeight = halfHeight;
        Module.canvas.width = canvasB.width = width;
        Module.canvas.height = canvasB.height = halfHeight;
        imageData = context2d.createImageData(width, halfHeight);
        imageDataBottom = context2dBottom.createImageData(width, halfHeight);
        pixelBuffer = new Uint32Array(imageData.data.buffer);
        pixelBufferBottom = new Uint32Array(imageDataBottom.data.buffer);
        if (lastMainFramePtr) Module._free(lastMainFramePtr);
        if (lastBottomFramePtr) Module._free(lastBottomFramePtr);
        lastMainFramePtr = Module._malloc(pixelCount << 2);
        lastBottomFramePtr = Module._malloc(pixelCount << 2);
        lastMainFrame = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, pixelCount);
        lastBottomFrame = new Uint32Array(Module.HEAPU8.buffer, lastBottomFramePtr, pixelCount);
        sourceView32 = null;
        if (window.gameView) {
            gameView(gameName);
        }
    }
    if (!sourceView32 || sourceView32.buffer !== buffer || ndsPointer !== pointer) {
        ndsPointer = pointer;
        sourceView32 = new Uint32Array(buffer, pointer, width * height);
    }
    if (!pixelBuffer) return;
    render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, pixelBuffer, context2d, imageData, pixelCount);
    render32(sourceView32, pixelCount, lastBottomFrame, lastBottomFramePtr, pixelBufferBottom, context2dBottom, imageDataBottom, pixelCount);
    logSkip();
}
// ===== activeRenderFn =====
window.activeRenderFn = function(pointer, width, height, pitch) {
    if (!context2d) {
        context2d = Module.canvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
            willReadFrequently: false
        });
        if (Module.isNDS) {
            page02.style.paddingTop = "5px";
            canvasB.style.display = "block";
            joypad.style.justifyContent = "center";
            joy.style.display = "none";
            context2dBottom = canvasB.getContext('2d', {
                alpha: false,
                desynchronized: true,
                willReadFrequently: false
            });
        }
    }
    if (Module.isNDS) {
        return renderNDS(pointer, width, height);
    }
    const pixelCount = width * height;
    const is32BitFormat = pitch === (width << 2);
    const buffer = Module.HEAPU8.buffer;
    if (width !== cachedWidth || height !== cachedHeight || pitch !== cachedPitch || !pixelBuffer) {
        cachedWidth = width;
        cachedHeight = height;
        cachedPitch = pitch;
        cachedBuffer = null;
        Module.canvas.width = width;
        Module.canvas.height = height;
        imageData = context2d.createImageData(width, height);
        pixelBuffer = new Uint32Array(imageData.data.buffer);
        const byteSize = pitch * height;
        if (is32BitFormat) {
            if (lastMainFramePtr) Module._free(lastMainFramePtr);
            lastMainFramePtr = Module._malloc(byteSize);
            lastMainFrame = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, byteSize >> 2);
        } else {
            if (lastMainFramePtr) Module._free(lastMainFramePtr);
            lastMainFramePtr = Module._malloc(byteSize);
            lastView16as32 = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, byteSize >> 2);
        }
        if (window.gameView) {
            gameView(gameName);
        }
    }
    if (buffer !== cachedBuffer || pointer !== cachedPointer) {
        cachedBuffer = buffer;
        cachedPointer = pointer;
        sourceView32 = new Uint32Array(buffer, pointer, is32BitFormat ? pixelCount : ((pitch >> 1) * height) >> 1);
        if (!is32BitFormat) {
            sourceView16 = new Uint16Array(buffer, pointer, (pitch >> 1) * height);
        }
    }
    if (is32BitFormat) {
        render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, pixelBuffer, context2d, imageData, pixelCount, 0);
    } else {
        render16(sourceView16, sourceView32, lastView16as32, lastMainFramePtr, pixelBuffer, context2d, imageData, width, height, pitch >> 1);
    }
    logSkip();
};
console.log("w2d.js loaded");