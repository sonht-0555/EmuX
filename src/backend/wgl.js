// ===== wgl.js =====
let glContext;
let glContextBottom;
let shaderProgram;
let shaderProgramBottom;
let glTexture;
let glTextureBottom;
let lastMainFramePtr = 0;
let lastBottomFramePtr = 0;
let lastMainFrame;
let lastBottomFrame;
let pixelBuffer;
let pixelBufferBottom;
let pixelView;
let pixelViewBottom;
let lastView16as32;
let sourceView32;
let sourceView16;
let textureInitializedMain = 0;
let textureInitializedBottom = 0;
const vertexShaderSource = `attribute vec2 p;attribute vec2 t;varying vec2 v;void main(){gl_Position=vec4(p,0,1);v=t;}`;
const fragmentShaderSource = `precision mediump float;varying vec2 v;uniform sampler2D s;void main(){gl_FragColor=texture2D(s,v);}`;
// ===== initGL =====
function initGL(canvas) {
    const context = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        desynchronized: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
    });
    if (!context) {
        return null;
    }
    const vertexShader = context.createShader(context.VERTEX_SHADER);
    context.shaderSource(vertexShader, vertexShaderSource);
    context.compileShader(vertexShader);
    const fragmentShader = context.createShader(context.FRAGMENT_SHADER);
    context.shaderSource(fragmentShader, fragmentShaderSource);
    context.compileShader(fragmentShader);
    const program = context.createProgram();
    context.attachShader(program, vertexShader);
    context.attachShader(program, fragmentShader);
    context.linkProgram(program);
    context.useProgram(program);
    const positionBuffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
    context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), context.STATIC_DRAW);
    const positionLocation = context.getAttribLocation(program, 'p');
    context.enableVertexAttribArray(positionLocation);
    context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0);
    const textureCoordBuffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, textureCoordBuffer);
    context.bufferData(context.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), context.STATIC_DRAW);
    const textureCoordLocation = context.getAttribLocation(program, 't');
    context.enableVertexAttribArray(textureCoordLocation);
    context.vertexAttribPointer(textureCoordLocation, 2, context.FLOAT, false, 0, 0);
    const texture = context.createTexture();
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST);
    return {
        context: context,
        prog: program,
        tex: texture
    };
}
// ===== render32 =====
let source64_wgl_top, last64_wgl_top, source64_wgl_bottom, last64_wgl_bottom;
function render32(source, sourceOffset, lastFrame, lastFramePtr, buffer, view, context, texture, width, height, length, textureType) {
    frameCount++;
    const isDirtyFn = Module._retro_is_dirty || (Module.asm && Module.asm._retro_is_dirty) || (Module.instance && Module.instance.exports && Module.instance.exports._retro_is_dirty) || (Module.instance && Module.instance.exports && Module.instance.exports.retro_is_dirty);
    if (isDirtyFn && lastFramePtr) {
        if (isDirtyFn(source.byteOffset + (sourceOffset << 2), lastFramePtr, length << 2)) {
            for (let pixelIndex = 0, sourceIndex = sourceOffset; pixelIndex < length; pixelIndex++, sourceIndex++) {
                const color = lastFrame[pixelIndex] = source[sourceIndex];
                buffer[pixelIndex] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color >> 16) & 0xFF;
            }
            context.bindTexture(context.TEXTURE_2D, texture);
            if (textureType ? textureInitializedBottom : textureInitializedMain) {
                context.texSubImage2D(context.TEXTURE_2D, 0, 0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, view);
            } else {
                context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, view);
                if (textureType) textureInitializedBottom = 1; else textureInitializedMain = 1;
            }
            context.drawArrays(context.TRIANGLES, 0, 6);
            return;
        }
    } else {
        let source64 = textureType ? source64_wgl_bottom : source64_wgl_top;
        let last64 = textureType ? last64_wgl_bottom : last64_wgl_top;
        if (!source64 || source64.buffer !== source.buffer || source64.byteOffset !== source.byteOffset + (sourceOffset << 2) || source64.length !== length >> 1) {
            source64 = new BigUint64Array(source.buffer, source.byteOffset + (sourceOffset << 2), length >> 1);
            last64 = new BigUint64Array(lastFrame.buffer, 0, length >> 1);
            if (textureType) {
                source64_wgl_bottom = source64;
                last64_wgl_bottom = last64;
            } else {
                source64_wgl_top = source64;
                last64_wgl_top = last64;
            }
        }
        for (let index = source64.length - 1; index >= 0; index--) {
            if (source64[index] !== last64[index]) {
                for (let pixelIndex = 0, sourceIndex = sourceOffset; pixelIndex < length; pixelIndex++, sourceIndex++) {
                    const color = lastFrame[pixelIndex] = source[sourceIndex];
                    buffer[pixelIndex] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color >> 16) & 0xFF;
                }
                context.bindTexture(context.TEXTURE_2D, texture);
                if (textureType ? textureInitializedBottom : textureInitializedMain) {
                    context.texSubImage2D(context.TEXTURE_2D, 0, 0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, view);
                } else {
                    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, view);
                    if (textureType) textureInitializedBottom = 1; else textureInitializedMain = 1;
                }
                context.drawArrays(context.TRIANGLES, 0, 6);
                return;
            }
        }
    }
    skippedFrames++;
}
// ===== render16 =====
function render16(source16, source32, last32, last32Ptr, buffer, view, context, texture, width, height, stride, textureType) {
    frameCount++;
    const widthWords = width >> 1;
    const strideWords = stride >> 1;
    const isDirtyFn = Module._retro_is_dirty || (Module.asm && Module.asm._retro_is_dirty) || (Module.instance && Module.instance.exports && Module.instance.exports._retro_is_dirty) || (Module.instance && Module.instance.exports && Module.instance.exports.retro_is_dirty);
    if (isDirtyFn && last32Ptr) {
        if (isDirtyFn(source32.byteOffset, last32Ptr, (width * height) << 1)) {
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
            context.bindTexture(context.TEXTURE_2D, texture);
            if (textureType ? textureInitializedBottom : textureInitializedMain) {
                context.texSubImage2D(context.TEXTURE_2D, 0, 0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, view);
            } else {
                context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, view);
                if (textureType) textureInitializedBottom = 1; else textureInitializedMain = 1;
            }
            context.drawArrays(context.TRIANGLES, 0, 6);
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
                    context.bindTexture(context.TEXTURE_2D, texture);
                    if (textureType ? textureInitializedBottom : textureInitializedMain) {
                        context.texSubImage2D(context.TEXTURE_2D, 0, 0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, view);
                    } else {
                        context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, view);
                        if (textureType) textureInitializedBottom = 1; else textureInitializedMain = 1;
                    }
                    context.drawArrays(context.TRIANGLES, 0, 6);
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
        glContext.viewport(0, 0, width, halfHeight);
        glContextBottom.viewport(0, 0, width, halfHeight);
        pixelBuffer = new Uint32Array(pixelCount);
        pixelBufferBottom = new Uint32Array(pixelCount);
        pixelView = new Uint8Array(pixelBuffer.buffer);
        pixelViewBottom = new Uint8Array(pixelBufferBottom.buffer);
        if (lastMainFramePtr) Module._free(lastMainFramePtr);
        if (lastBottomFramePtr) Module._free(lastBottomFramePtr);
        lastMainFramePtr = Module._malloc(pixelCount << 2);
        lastBottomFramePtr = Module._malloc(pixelCount << 2);
        lastMainFrame = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, pixelCount);
        lastBottomFrame = new Uint32Array(Module.HEAPU8.buffer, lastBottomFramePtr, pixelCount);
        sourceView32 = null;
        textureInitializedMain = textureInitializedBottom = 0;
        if (window.gameView) {
            gameView(gameName);
        }
    }
    if (!sourceView32 || sourceView32.buffer !== buffer || ndsPointer !== pointer) {
        ndsPointer = pointer;
        sourceView32 = new Uint32Array(buffer, pointer, width * height);
    }
    render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, pixelBuffer, pixelView, glContext, glTexture, width, halfHeight, pixelCount, 0);
    render32(sourceView32, pixelCount, lastBottomFrame, lastBottomFramePtr, pixelBufferBottom, pixelViewBottom, glContextBottom, glTextureBottom, width, halfHeight, pixelCount, 1);
    logSkip();
}
// ===== activeRenderFn =====
window.activeRenderFn = function(pointer, width, height, pitch) {
    if (!glContext) {
        const mainContext = initGL(Module.canvas);
        if (!mainContext) {
            return;
        }
        glContext = mainContext.context;
        shaderProgram = mainContext.prog;
        glTexture = mainContext.tex;
        if (Module.isNDS) {
            page02.style.paddingTop = "5px";
            canvasB.style.display = "block";
            joypad.style.justifyContent = "center";
            joy.style.display = "none";
            const bottomContext = initGL(canvasB);
            glContextBottom = bottomContext.context;
            shaderProgramBottom = bottomContext.prog;
            glTextureBottom = bottomContext.tex;
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
        glContext.viewport(0, 0, width, height);
        pixelBuffer = new Uint32Array(pixelCount);
        pixelView = new Uint8Array(pixelBuffer.buffer);
        if (is32BitFormat) {
            if (lastMainFramePtr) Module._free(lastMainFramePtr);
            lastMainFramePtr = Module._malloc(pixelCount << 2);
            lastMainFrame = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, pixelCount);
        } else {
            if (lastMainFramePtr) Module._free(lastMainFramePtr);
            lastMainFramePtr = Module._malloc(pixelCount << 1);
            lastView16as32 = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, pixelCount >> 1);
        }
        textureInitializedMain = 0;
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
        render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, pixelBuffer, pixelView, glContext, glTexture, width, height, pixelCount, 0);
    } else {
        render16(sourceView16, sourceView32, lastView16as32, lastMainFramePtr, pixelBuffer, pixelView, glContext, glTexture, width, height, pitch >> 1, 0);
    }
    logSkip();
};
console.log("wgl.js loaded");