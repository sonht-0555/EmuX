// ===== w2d.js =====
let context2d;
let context2dBottom;
let imageData;
let imageDataBottom;
let pixelBuffer;
let pixelBufferBottom;
let lastMainFrame;
let lastBottomFrame;
let lastView16as32;
let sourceView32;
let sourceView16;
// ===== render32 =====
function render32(source, sourceOffset, lastFrame, buffer, context, imageDataObject, length) {
    frameCount++;
    if (Module._retro_is_dirty) {
        if (Module._retro_is_dirty(source.byteOffset + (sourceOffset << 2), lastFrame.byteOffset, length << 2)) {
            for (let pixelIndex = 0, sourceIndex = sourceOffset; pixelIndex < length; pixelIndex++, sourceIndex++) {
                const color = lastFrame[pixelIndex] = source[sourceIndex];
                buffer[pixelIndex] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color >> 16) & 0xFF;
            }
            context.putImageData(imageDataObject, 0, 0);
            return;
        }
    } else {
        const source64 = new BigUint64Array(source.buffer, source.byteOffset + (sourceOffset << 2), length >> 1);
        const last64 = new BigUint64Array(lastFrame.buffer, 0, length >> 1);
        for (let index = source64.length - 1; index >= 0; index--) {
            if (source64[index] !== last64[index]) {
                for (let pixelIndex = 0, sourceIndex = sourceOffset; pixelIndex < length; pixelIndex++, sourceIndex++) {
                    const color = lastFrame[pixelIndex] = source[sourceIndex];
                    buffer[pixelIndex] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color >> 16) & 0xFF;
                }
                context.putImageData(imageDataObject, 0, 0);
                return;
            }
        }
    }
    skippedFrames++;
}
// ===== render16 =====
function render16(source16, source32, last32, buffer, context, imageDataObject, width, height, stride) {
    frameCount++;
    if (Module._retro_is_dirty) {
        if (Module._retro_is_dirty(source32.byteOffset, last32.byteOffset, (width * height) << 1)) {
            for (let copyRowIndex = 0; copyRowIndex < height; copyRowIndex++) {
                const sourceIndex = copyRowIndex * stride;
                const lastIndex = copyRowIndex * width;
                const source32Index = copyRowIndex * strideWords;
                const last32Index = copyRowIndex * widthWords;
                for (let copyColumnIndex = 0; copyColumnIndex < widthWords; copyColumnIndex++) {
                    const pixelOffset = copyColumnIndex << 1;
                    buffer[lastIndex + pixelOffset] = lookupTable565[source16[sourceIndex + pixelOffset]];
                    buffer[lastIndex + pixelOffset + 1] = lookupTable565[source16[sourceIndex + pixelOffset + 1]];
                    last32[last32Index + copyColumnIndex] = source32[source32Index + copyColumnIndex];
                }
            }
            context.putImageData(imageDataObject, 0, 0);
            return;
        }
    } else {
        for (let rowIndex = height - 1; rowIndex >= 0; rowIndex--) {
            const sourceRowIndex = rowIndex * strideWords;
            const lastRowIndex = rowIndex * widthWords;
            for (let columnIndex = widthWords - 1; columnIndex >= 0; columnIndex--) {
                if (source32[sourceRowIndex + columnIndex] !== last32[lastRowIndex + columnIndex]) {
                    for (let copyRowIndex = 0; copyRowIndex < height; copyRowIndex++) {
                        const sourceIndex = copyRowIndex * stride;
                        const lastIndex = copyRowIndex * width;
                        const source32Index = copyRowIndex * strideWords;
                        const last32Index = copyRowIndex * widthWords;
                        for (let copyColumnIndex = 0; copyColumnIndex < widthWords; copyColumnIndex++) {
                            const pixelOffset = copyColumnIndex << 1;
                            buffer[lastIndex + pixelOffset] = lookupTable565[source16[sourceIndex + pixelOffset]];
                            buffer[lastIndex + pixelOffset + 1] = lookupTable565[source16[sourceIndex + pixelOffset + 1]];
                            last32[last32Index + copyColumnIndex] = source32[source32Index + copyColumnIndex];
                        }
                    }
                    context.putImageData(imageDataObject, 0, 0);
                    return;
                }
            }
        }
    }
    skippedFrames++;
}
// ===== renderNDS =====
function renderNDS(pointer, width, height) {
    const halfHeight = height >> 1;
    const pixelCount = width * halfHeight;
    const buffer = Module.HEAPU8.buffer;
    if (cachedWidth !== width || cachedHeight !== halfHeight) {
        cachedWidth = width;
        cachedHeight = halfHeight;
        Module.canvas.width = canvasB.width = width;
        Module.canvas.height = canvasB.height = halfHeight;
        imageData = context2d.createImageData(width, halfHeight);
        imageDataBottom = context2dBottom.createImageData(width, halfHeight);
        pixelBuffer = new Uint32Array(imageData.data.buffer);
        pixelBufferBottom = new Uint32Array(imageDataBottom.data.buffer);
        lastMainFrame = new Uint32Array(pixelCount);
        lastBottomFrame = new Uint32Array(pixelCount);
        sourceView32 = null;
        if (window.gameView) {
            gameView(gameName);
        }
    }
    if (!sourceView32 || sourceView32.buffer !== buffer || ndsPointer !== pointer) {
        ndsPointer = pointer;
        sourceView32 = new Uint32Array(buffer, pointer, width * height);
    }
    render32(sourceView32, 0, lastMainFrame, pixelBuffer, context2d, imageData, pixelCount);
    render32(sourceView32, pixelCount, lastBottomFrame, pixelBufferBottom, context2dBottom, imageDataBottom, pixelCount);
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
    if (width !== cachedWidth || height !== cachedHeight || pitch !== cachedPitch) {
        cachedWidth = width;
        cachedHeight = height;
        cachedPitch = pitch;
        cachedBuffer = null;
        Module.canvas.width = width;
        Module.canvas.height = height;
        imageData = context2d.createImageData(width, height);
        pixelBuffer = new Uint32Array(imageData.data.buffer);
        if (is32BitFormat) {
            lastMainFrame = new Uint32Array(pixelCount);
        } else {
            lastView16as32 = new Uint32Array(pixelCount >> 1);
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
        render32(sourceView32, 0, lastMainFrame, pixelBuffer, context2d, imageData, pixelCount);
    } else {
        render16(sourceView16, sourceView32, lastView16as32, pixelBuffer, context2d, imageData, width, height, pitch >> 1);
    }
    logSkip();
};
console.log("w2d.js loaded");