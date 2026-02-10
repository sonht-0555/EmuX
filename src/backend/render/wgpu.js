// ===== wgpu.js =====
let gpuDevice, gpuQueue, contextMain, contextBottom, renderPipeline, bindGroupMain, bindGroupBottom, textureMain, textureBottom;
let lastMainFramePtr = 0, lastBottomFramePtr = 0;
let lastMainFrame, lastBottomFrame, lastMain16;
let sourceView32, gpuInitializing = null, formatIs32 = true, cachedIsDirtyFn;
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
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;
    gpuDevice = await adapter.requestDevice();
    gpuQueue = gpuDevice.queue;
    const format = navigator.gpu.getPreferredCanvasFormat();
    contextMain = canvas.getContext('webgpu');
    contextMain.configure({ device: gpuDevice, format, alphaMode: 'opaque' });
    if (canvasNDS) {
        contextBottom = canvasNDS.getContext('webgpu');
        contextBottom.configure({ device: gpuDevice, format, alphaMode: 'opaque' });
    }
    const shaderModule = gpuDevice.createShaderModule({ code: shaderSource });
    renderPipeline = gpuDevice.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vs' },
        fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' }
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
            loadOp: 'clear', storeOp: 'store'
        }]
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();
}
// ===== render32 =====
function render32(source, sourceOffset, lastFrame, lastFramePtr, context, texture, width, height, length, bindGroup, encoder) {
    frameCount++;
    const isDirtyFn = cachedIsDirtyFn || (cachedIsDirtyFn = Module._emux_is_dirty || Module.asm?._emux_is_dirty || Module.instance?.exports?._emux_is_dirty);
    if (isDirtyFn && lastFramePtr && isDirtyFn(source.byteOffset + (sourceOffset << 2), lastFramePtr, length << 2)) {
        gpuQueue.writeTexture({ texture }, lastFrame, { bytesPerRow: width << 2 }, { width, height });
        recordDraw(context, bindGroup, encoder);
    } else {
        skippedFrames++;
    }
}
// ===== render16 =====
function render16(source32, last16, last32Ptr, context, texture, width, height, pitch, bindGroup, encoder) {
    frameCount++;
    const isDirtyFn = cachedIsDirtyFn || (cachedIsDirtyFn = Module._emux_is_dirty || Module.asm?._emux_is_dirty || Module.instance?.exports?._emux_is_dirty);
    if (isDirtyFn && last32Ptr && isDirtyFn(source32.byteOffset, last32Ptr, pitch * height)) {
        gpuQueue.writeTexture({ texture }, last16, { bytesPerRow: pitch }, { width, height });
        recordDraw(context, bindGroup, encoder);
    } else {
        skippedFrames++;
    }
}
// ===== renderNDS =====
function renderNDS(pointer, width, height, encoder) {
    const heap = Module.HEAPU8;
    if (!heap) return;
    const halfHeight = height >> 1;
    const pixelCount = width * halfHeight;
    if (cachedWidth !== width || cachedHeight !== halfHeight || !textureMain) {
        cachedWidth = width; cachedHeight = halfHeight;
        Module.canvas.width = canvasB.width = width;
        Module.canvas.height = canvasB.height = halfHeight;
        textureMain = createTexture(width, halfHeight, true);
        textureBottom = createTexture(width, halfHeight, true);
        const bindGroupLayout = renderPipeline.getBindGroupLayout(0);
        const dummyTexture = createTexture(1, 1, false);
        const createBindGroup = (texture) => {
            const uniformBuffer = gpuDevice.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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
        if (window.gameView) gameView(gameName);
    }
    if (!sourceView32 || sourceView32.buffer !== heap.buffer || ndsPointer !== pointer) {
        ndsPointer = pointer;
        sourceView32 = new Uint32Array(heap.buffer, pointer, width * height);
    }
    render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, contextMain, textureMain, width, halfHeight, pixelCount, bindGroupMain, encoder);
    render32(sourceView32, pixelCount, lastBottomFrame, lastBottomFramePtr, contextBottom, textureBottom, width, halfHeight, pixelCount, bindGroupBottom, encoder);
}
// ===== activeRenderFn =====
self.activeRenderFn = async function(pointer, width, height, pitch) {
    if (!gpuDevice) {
        if (!gpuInitializing) gpuInitializing = initGPU(Module.canvas, Module.isNDS ? canvasB : null);
        if (!await gpuInitializing) return;
        if (Module.isNDS) self.postMessage({ type: 'NDS_LAYOUT' });
    }
    const encoder = gpuDevice.createCommandEncoder();
    const is32BitFormat = pitch === (width << 2);
    const heap = Module.HEAPU8;
    if (Module.isNDS) {
        renderNDS(pointer, width, height, encoder);
    } else {
        if (width !== cachedWidth || height !== cachedHeight || is32BitFormat !== formatIs32 || !textureMain) {
            cachedWidth = width; cachedHeight = height; cachedPitch = pitch; formatIs32 = is32BitFormat; cachedBuffer = null;
            Module.canvas.width = width; Module.canvas.height = height;
            textureMain = createTexture(width, height, is32BitFormat);
            const dummyTexture = createTexture(1, 1, !is32BitFormat);
            const uniformBuffer = gpuDevice.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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
            if (lastMainFramePtr) Module._free(lastMainFramePtr);
            const byteSize = pitch * height;
            lastMainFramePtr = Module._malloc(byteSize);
            if (is32BitFormat) {
                lastMainFrame = new Uint32Array(heap.buffer, lastMainFramePtr, byteSize >> 2);
            } else {
                lastMain16 = new Uint16Array(heap.buffer, lastMainFramePtr, byteSize >> 1);
            }
            if (typeof gameView !== 'undefined') gameView(gameName);
        }
        if (heap.buffer !== cachedBuffer || pointer !== cachedPointer) {
            cachedBuffer = heap.buffer; cachedPointer = pointer;
            sourceView32 = new Uint32Array(heap.buffer, pointer, (pitch * height) >> 2);
        }
        if (is32BitFormat) {
            render32(sourceView32, 0, lastMainFrame, lastMainFramePtr, contextMain, textureMain, width, height, width * height, bindGroupMain, encoder);
        } else {
            render16(sourceView32, lastMain16, lastMainFramePtr, contextMain, textureMain, width, height, pitch, bindGroupMain, encoder);
        }
    }
    gpuQueue.submit([encoder.finish()]);
    logSkip();
};
console.log("wgpu.js loaded");