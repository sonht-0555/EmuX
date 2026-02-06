// ===== wgpu.js =====
let gpuDevice;
let gpuQueue;
let contextMain;
let contextBottom;
let renderPipeline;
let bindGroupMain;
let bindGroupBottom;
let textureMain;
let textureBottom;
let lastMainFramePtr = 0;
let lastBottomFramePtr = 0;
let lastMainFrame;
let lastBottomFrame;
let lastView16as32;
let lastMain16;
let sourceView32;
let gpuInitializing = null;
let formatIs32 = true;
let cachedIsDirtyFn;
const shaderSource = `
    struct Config { is32: u32, width: f32, height: f32, pad: u32 };
    @group(0) @binding(0) var<uniform> config: Config;
    @group(0) @binding(1) var texture32: texture_2d<f32>;
    @group(0) @binding(2) var texture16: texture_2d<u32>;
    struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
    @vertex fn vs(@builtin(vertex_index) index: u32) -> VertexOutput {
        var pos = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
        var uv = array<vec2f, 6>(vec2f(0,1), vec2f(1,1), vec2f(0,0), vec2f(0,0), vec2f(1,1), vec2f(1,0));
        var out: VertexOutput;
        out.position = vec4f(pos[index], 0.0, 1.0);
        out.uv = uv[index];
        return out;
    }
    @fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
        let coords = vec2i(uv * vec2f(config.width, config.height));
        if (config.is32 == 1u) {
            let color = textureLoad(texture32, coords, 0);
            return vec4f(color.b, color.g, color.r, 1.0);
        }
        let raw = textureLoad(texture16, coords, 0).r;
        return vec4f(f32((raw >> 11u) & 0x1Fu) * 0.032258, f32((raw >> 5u) & 0x3Fu) * 0.015873, f32(raw & 0x1Fu) * 0.032258, 1.0);
    }
`;
// ===== initGPU =====
async function initGPU(canvas, canvasNDS) {
    if (!navigator.gpu) {
        return false;
    }
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
    });
    if (!adapter) {
        return false;
    }
    gpuDevice = await adapter.requestDevice();
    gpuQueue = gpuDevice.queue;
    const format = navigator.gpu.getPreferredCanvasFormat();
    contextMain = canvas.getContext('webgpu');
    contextMain.configure({
        device: gpuDevice,
        format: format,
        alphaMode: 'opaque'
    });
    if (canvasNDS) {
        contextBottom = canvasNDS.getContext('webgpu');
        contextBottom.configure({
            device: gpuDevice,
            format: format,
            alphaMode: 'opaque'
        });
    }
    const shaderModule = gpuDevice.createShaderModule({
        code: shaderSource
    });
    renderPipeline = gpuDevice.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'vs'
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs',
            targets: [{ format }]
        },
        primitive: {
            topology: 'triangle-list'
        }
    });
    return true;
}
// ===== createTexture =====
function createTexture(width, height, is32BitFormat) {
    return gpuDevice.createTexture({
        size: [width, height, 1],
        format: is32BitFormat ? 'rgba8unorm' : 'r16uint',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
}
// ===== recordDraw =====
function recordDraw(context, bindGroup, encoder) {
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store'
        }]
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();
}
// ===== render32 =====
let source64_wgpu_top, last64_wgpu_top, source64_wgpu_bottom, last64_wgpu_bottom;
function render32(source, sourceOffset, lastFrame, lastFramePtr, context, texture, width, height, length, bindGroup, encoder, screenType) {
    frameCount++;
    const isDirtyFn = cachedIsDirtyFn || (cachedIsDirtyFn = Module._retro_is_dirty || Module.asm?._retro_is_dirty || Module.instance?.exports?._retro_is_dirty || Module.instance?.exports?.retro_is_dirty);
    if (isDirtyFn && lastFramePtr) {
        if (isDirtyFn(source.byteOffset + (sourceOffset << 2), lastFramePtr, length << 2)) {
            lastFrame.set(source.subarray(sourceOffset, sourceOffset + length));
            gpuQueue.writeTexture({ texture: texture }, lastFrame, { bytesPerRow: width * 4 }, { width, height });
            recordDraw(context, bindGroup, encoder);
            return;
        }
    } else {
        let source64 = screenType ? source64_wgpu_bottom : source64_wgpu_top;
        let last64 = screenType ? last64_wgpu_bottom : last64_wgpu_top;
        if (!source64 || source64.buffer !== source.buffer || source64.byteOffset !== source.byteOffset + (sourceOffset << 2) || source64.length !== length >> 1) {
            source64 = new BigUint64Array(source.buffer, source.byteOffset + (sourceOffset << 2), length >> 1);
            last64 = new BigUint64Array(lastFrame.buffer, 0, length >> 1);
            if (screenType) {
                source64_wgpu_bottom = source64;
                last64_wgpu_bottom = last64;
            } else {
                source64_wgpu_top = source64;
                last64_wgpu_top = last64;
            }
        }
        for (let index = source64.length - 1; index >= 0; index--) {
            if (source64[index] !== last64[index]) {
                lastFrame.set(source.subarray(sourceOffset, sourceOffset + length));
                gpuQueue.writeTexture({ texture: texture }, lastFrame, { bytesPerRow: width * 4 }, { width, height });
                recordDraw(context, bindGroup, encoder);
                return;
            }
        }
    }
    skippedFrames++;
}
// ===== render16 =====
function render16(source32, last32, last16, last32Ptr, context, texture, width, height, stride, bindGroup, encoder) {
    frameCount++;
    const widthWords = width >> 1;
    const strideWords = stride >> 1;
    const isDirtyFn = cachedIsDirtyFn || (cachedIsDirtyFn = Module._retro_is_dirty || Module.asm?._retro_is_dirty || Module.instance?.exports?._retro_is_dirty || Module.instance?.exports?.retro_is_dirty);
    if (isDirtyFn && last32Ptr) {
        if (isDirtyFn(source32.byteOffset, last32Ptr, (width * height) << 1)) {
            if (width === stride) {
                last32.set(source32);
            } else {
                for (let copyRowIndex = 0; copyRowIndex < height; copyRowIndex++) {
                    last32.set(source32.subarray(copyRowIndex * strideWords, copyRowIndex * strideWords + widthWords), copyRowIndex * widthWords);
                }
            }
            gpuQueue.writeTexture({ texture: texture }, last16, { bytesPerRow: width * 2 }, { width, height });
            recordDraw(context, bindGroup, encoder);
            return;
        }
    } else {
        for (let rowIndex = height - 1; rowIndex >= 0; rowIndex--) {
            const sourceRowIndex = rowIndex * strideWords;
            const lastRowIndex = rowIndex * widthWords;
            for (let columnIndex = widthWords - 1; columnIndex >= 0; columnIndex--) {
                if (source32[sourceRowIndex + columnIndex] !== last32[lastRowIndex + columnIndex]) {
                    if (width === stride) {
                        last32.set(source32);
                    } else {
                        for (let copyRowIndex = 0; copyRowIndex < height; copyRowIndex++) {
                            last32.set(source32.subarray(copyRowIndex * strideWords, copyRowIndex * strideWords + widthWords), copyRowIndex * widthWords);
                        }
                    }
                    gpuQueue.writeTexture({ texture: texture }, last16, { bytesPerRow: width * 2 }, { width, height });
                    recordDraw(context, bindGroup, encoder);
                    return;
                }
            }
        }
    }
    skippedFrames++;
}
// ===== renderNDS =====
function renderNDS(pointer, width, height, encoder) {
    const heap = Module.HEAPU8;
    if (!heap) return;
    const buffer = heap.buffer;
    const halfHeight = height >> 1;
    const pixelCount = width * halfHeight;
    if (cachedWidth !== width || cachedHeight !== halfHeight || !textureMain) {
        cachedWidth = width;
        cachedHeight = halfHeight;
        Module.canvas.width = canvasB.width = width;
        Module.canvas.height = canvasB.height = halfHeight;
        textureMain = createTexture(width, halfHeight, true);
        textureBottom = createTexture(width, halfHeight, true);
        const bindGroupLayout = renderPipeline.getBindGroupLayout(0);
        const dummyTexture = createTexture(1, 1, false);
        const createBindGroup = (texture) => {
            const uniformBuffer = gpuDevice.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            gpuQueue.writeBuffer(uniformBuffer, 0, new Uint32Array([1]));
            gpuQueue.writeBuffer(uniformBuffer, 4, new Float32Array([width, halfHeight]));
            return gpuDevice.createBindGroup({
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: texture.createView() },
                    { binding: 2, resource: dummyTexture.createView() }
                ]
            });
        };
        bindGroupMain = createBindGroup(textureMain);
        bindGroupBottom = createBindGroup(textureBottom);
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
    render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, contextMain, textureMain, width, halfHeight, pixelCount, bindGroupMain, encoder, 0);
    render32(sourceView32, pixelCount, lastBottomFrame, lastBottomFramePtr, contextBottom, textureBottom, width, halfHeight, pixelCount, bindGroupBottom, encoder, 1);
}
// ===== activeRenderFn =====
window.activeRenderFn = async function(pointer, width, height, pitch) {
    if (!gpuDevice) {
        if (!gpuInitializing) {
            gpuInitializing = initGPU(Module.canvas, Module.isNDS ? canvasB : null);
        }
        if (!await gpuInitializing) {
            return;
        }
        if (Module.isNDS) {
            page02.style.paddingTop = "5px";
            canvasB.style.display = "block";
            joypad.style.justifyContent = "center";
            joy.style.display = "none";
        }
    }
    const encoder = gpuDevice.createCommandEncoder();
    const is32BitFormat = pitch === (width << 2);
    const buffer = Module.HEAPU8.buffer;
    if (Module.isNDS) {
        renderNDS(pointer, width, height, encoder);
    } else {
        if (width !== cachedWidth || height !== cachedHeight || is32BitFormat !== formatIs32 || !textureMain) {
            cachedWidth = width;
            cachedHeight = height;
            cachedPitch = pitch;
            formatIs32 = is32BitFormat;
            cachedBuffer = null;
            Module.canvas.width = width;
            Module.canvas.height = height;
            textureMain = createTexture(width, height, is32BitFormat);
            const dummyTexture = createTexture(1, 1, !is32BitFormat);
            const uniformBuffer = gpuDevice.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            gpuQueue.writeBuffer(uniformBuffer, 0, new Uint32Array([is32BitFormat ? 1 : 0]));
            gpuQueue.writeBuffer(uniformBuffer, 4, new Float32Array([width, height]));
            bindGroupMain = gpuDevice.createBindGroup({
                layout: renderPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: (is32BitFormat ? textureMain : dummyTexture).createView() },
                    { binding: 2, resource: (is32BitFormat ? dummyTexture : textureMain).createView() }
                ]
            });
            const pixelCount = width * height;
            if (lastMainFramePtr) Module._free(lastMainFramePtr);
            if (is32BitFormat) {
                lastMainFramePtr = Module._malloc(pixelCount << 2);
                lastMainFrame = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, pixelCount);
            } else {
                lastMainFramePtr = Module._malloc(pixelCount << 1);
                lastView16as32 = new Uint32Array(Module.HEAPU8.buffer, lastMainFramePtr, pixelCount >> 1);
                lastMain16 = new Uint16Array(Module.HEAPU8.buffer, lastMainFramePtr, pixelCount);
            }
            if (window.gameView) {
                gameView(gameName);
            }
        }
        if (buffer !== cachedBuffer || pointer !== cachedPointer) {
            cachedBuffer = buffer;
            cachedPointer = pointer;
            sourceView32 = new Uint32Array(buffer, pointer, (pitch * height) >> 2);
        }
        if (is32BitFormat) {
            render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, contextMain, textureMain, width, height, width * height, bindGroupMain, encoder, 0);
        } else {
            render16(sourceView32, lastView16as32, lastMain16, lastMainFramePtr, contextMain, textureMain, width, height, pitch >> 1, bindGroupMain, encoder);
        }
    }
    gpuQueue.submit([encoder.finish()]);
    logSkip();
};
console.log("wgpu.js loaded");