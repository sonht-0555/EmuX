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
let cachedIsDirtyFn, cachedRender32Fn, cachedRender16Fn;
let visualBufferPtr = 0;
let visualBufferBottomPtr = 0;
let lutPtr = 0;

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
    if (!context) return null;
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
    return { context, prog: program, tex: texture };
}

// ===== render32 =====
function render32(source, sourceOffset, lastFrame, lastFramePtr, vBufPtr, view, context, texture, width, height, length, textureType) {
    frameCount++;
    const renderFn = cachedRender32Fn || (cachedRender32Fn = Module._retro_render32 || Module.asm?._retro_render32 || Module.instance?.exports?._retro_render32 || Module.instance?.exports?.retro_render32);
    if (renderFn && lastFramePtr && renderFn(source.byteOffset + (sourceOffset << 2), lastFramePtr, vBufPtr, length)) {
        context.bindTexture(context.TEXTURE_2D, texture);
        if (textureType ? textureInitializedBottom : textureInitializedMain) context.texSubImage2D(context.TEXTURE_2D, 0, 0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, view);
        else { context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, view); if (textureType) textureInitializedBottom = 1; else textureInitializedMain = 1; }
        context.drawArrays(context.TRIANGLES, 0, 6);
    } else {
        skippedFrames++;
    }
}

// ===== render16 =====
function render16(source32, last32, last32Ptr, vBufPtr, view, context, texture, width, height, stride, textureType) {
    frameCount++;
    const renderFn = cachedRender16Fn || (cachedRender16Fn = Module._retro_render16 || Module.asm?._retro_render16 || Module.instance?.exports?._retro_render16 || Module.instance?.exports?.retro_render16);
    if (!lutPtr && window.lookupTable565) {
        lutPtr = Module._malloc(lookupTable565.length << 2);
        new Uint32Array(Module.HEAPU8.buffer, lutPtr, lookupTable565.length).set(lookupTable565);
    }
    if (renderFn && last32Ptr && renderFn(source32.byteOffset, last32Ptr, vBufPtr, width, height, stride, lutPtr)) {
        context.bindTexture(context.TEXTURE_2D, texture);
        if (textureType ? textureInitializedBottom : textureInitializedMain) context.texSubImage2D(context.TEXTURE_2D, 0, 0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, view);
        else { context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, view); if (textureType) textureInitializedBottom = 1; else textureInitializedMain = 1; }
        context.drawArrays(context.TRIANGLES, 0, 6);
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
        glContext.viewport(0, 0, width, halfHeight);
        glContextBottom.viewport(0, 0, width, halfHeight);
        
        if (visualBufferPtr) Module._free(visualBufferPtr);
        if (visualBufferBottomPtr) Module._free(visualBufferBottomPtr);
        visualBufferPtr = Module._malloc(pixelCount << 2);
        visualBufferBottomPtr = Module._malloc(pixelCount << 2);
        
        pixelView = new Uint8Array(Module.HEAPU8.buffer, visualBufferPtr, pixelCount << 2);
        pixelViewBottom = new Uint8Array(Module.HEAPU8.buffer, visualBufferBottomPtr, pixelCount << 2);
        
        if (lastMainFramePtr) Module._free(lastMainFramePtr);
        if (lastBottomFramePtr) Module._free(lastBottomFramePtr);
        lastMainFramePtr = Module._malloc(pixelCount << 2);
        lastBottomFramePtr = Module._malloc(pixelCount << 2);
        lastMainFrame = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, pixelCount);
        lastBottomFrame = new Uint32Array(Module.HEAPU8.buffer, lastBottomFramePtr, pixelCount);
        sourceView32 = null;
        textureInitializedMain = textureInitializedBottom = 0;
        if (window.gameView) gameView(gameName);
    }
    if (!sourceView32 || sourceView32.buffer !== buffer || ndsPointer !== pointer) {
        ndsPointer = pointer;
        sourceView32 = new Uint32Array(buffer, pointer, width * height);
    }
    render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, visualBufferPtr, pixelView, glContext, glTexture, width, halfHeight, pixelCount, 0);
    render32(sourceView32, pixelCount, lastBottomFrame, lastBottomFramePtr, visualBufferBottomPtr, pixelViewBottom, glContextBottom, glTextureBottom, width, halfHeight, pixelCount, 1);
    logSkip();
}

// ===== activeRenderFn =====
window.activeRenderFn = function(pointer, width, height, pitch) {
    if (!glContext) {
        const mainContext = initGL(Module.canvas);
        if (!mainContext) return;
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
    if (Module.isNDS) return renderNDS(pointer, width, height);
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
        glContext.viewport(0, 0, width, height);
        
        if (visualBufferPtr) Module._free(visualBufferPtr);
        visualBufferPtr = Module._malloc(pixelCount << 2);
        pixelView = new Uint8Array(Module.HEAPU8.buffer, visualBufferPtr, pixelCount << 2);
        
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
        textureInitializedMain = 0;
        if (window.gameView) gameView(gameName);
    }
    if (buffer !== cachedBuffer || pointer !== cachedPointer) {
        cachedBuffer = buffer;
        cachedPointer = pointer;
        sourceView32 = new Uint32Array(buffer, pointer, is32BitFormat ? pixelCount : ((pitch >> 1) * height) >> 1);
        if (!is32BitFormat) sourceView16 = new Uint16Array(buffer, pointer, (pitch >> 1) * height);
    }
    if (is32BitFormat) {
        render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, visualBufferPtr, pixelView, glContext, glTexture, width, height, pixelCount, 0);
    } else {
        render16(sourceView32, lastView16as32, lastMainFramePtr, visualBufferPtr, pixelView, glContext, glTexture, width, height, pitch >> 1, 0);
    }
    logSkip();
};
console.log("wgl.js loaded");