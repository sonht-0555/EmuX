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
let cachedIsDirtyFn, cachedRender32Fn, cachedRender16Fn;
let visualBufferPtr = 0;
let visualBufferBottomPtr = 0;
let lutPtr = 0;

// ===== render32 =====
function render32(source, sourceOffset, lastFrame, lastFramePtr, context, imageDataObject, length, vBufPtr) {
    frameCount++;
    const renderFn = cachedRender32Fn || (cachedRender32Fn = Module._retro_render32 || Module.asm?._retro_render32 || Module.instance?.exports?._retro_render32 || Module.instance?.exports?.retro_render32);
    if (renderFn && lastFramePtr && renderFn(source.byteOffset + (sourceOffset << 2), lastFramePtr, vBufPtr, length)) {
        context.putImageData(imageDataObject, 0, 0);
    } else {
        skippedFrames++;
    }
}

// ===== render16 =====
function render16(source16, source32, last32, last32Ptr, context, imageDataObject, width, height, stride) {
    frameCount++;
    const renderFn = cachedRender16Fn || (cachedRender16Fn = Module._retro_render16 || Module.asm?._retro_render16 || Module.instance?.exports?._retro_render16 || Module.instance?.exports?.retro_render16);
    if (!lutPtr && window.lookupTable565) {
        lutPtr = Module._malloc(lookupTable565.length << 2);
        new Uint32Array(Module.HEAPU8.buffer, lutPtr, lookupTable565.length).set(lookupTable565);
    }
    if (renderFn && last32Ptr && renderFn(source32.byteOffset, last32Ptr, visualBufferPtr, width, height, stride, lutPtr)) {
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
    if (cachedWidth !== width || cachedHeight !== halfHeight || !visualBufferPtr) {
        cachedWidth = width;
        cachedHeight = halfHeight;
        Module.canvas.width = canvasB.width = width;
        Module.canvas.height = canvasB.height = halfHeight;
        
        if (visualBufferPtr) Module._free(visualBufferPtr);
        if (visualBufferBottomPtr) Module._free(visualBufferBottomPtr);
        visualBufferPtr = Module._malloc(pixelCount << 2);
        visualBufferBottomPtr = Module._malloc(pixelCount << 2);
        
        imageData = new ImageData(new Uint8ClampedArray(Module.HEAPU8.buffer, visualBufferPtr, pixelCount << 2), width, halfHeight);
        imageDataBottom = new ImageData(new Uint8ClampedArray(Module.HEAPU8.buffer, visualBufferBottomPtr, pixelCount << 2), width, halfHeight);
        
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
    render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, context2d, imageData, pixelCount, visualBufferPtr);
    render32(sourceView32, pixelCount, lastBottomFrame, lastBottomFramePtr, context2dBottom, imageDataBottom, pixelCount, visualBufferBottomPtr);
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
    if (width !== cachedWidth || height !== cachedHeight || pitch !== cachedPitch || !visualBufferPtr) {
        cachedWidth = width;
        cachedHeight = height;
        cachedPitch = pitch;
        cachedBuffer = null;
        Module.canvas.width = width;
        Module.canvas.height = height;
        
        if (visualBufferPtr) Module._free(visualBufferPtr);
        visualBufferPtr = Module._malloc(pixelCount << 2);
        imageData = new ImageData(new Uint8ClampedArray(Module.HEAPU8.buffer, visualBufferPtr, pixelCount << 2), width, height);
        
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
        render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, context2d, imageData, pixelCount, visualBufferPtr);
    } else {
        render16(sourceView16, sourceView32, lastView16as32, lastMainFramePtr, context2d, imageData, width, height, pitch >> 1);
    }
    logSkip();
};
console.log("w2d.js loaded");