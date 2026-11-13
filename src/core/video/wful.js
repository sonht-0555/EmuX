// ===== wful.js =====
// WebGPU, vẽ ở độ phân giải thật của màn hình (lấp kín bề ngang ở màn dọc), kèm CRT một lượt.
// CRT theo crt-lottes của Timothy Lottes (public domain): vạch quét + mặt nạ phosphor kiểu "VGA kéo dãn", không cong màn hình,
// không bloom. Bề ngang lấy mép sắc: đúng phần diện tích che phủ, trộn trên ánh sáng thật (gamma 2.2).
// Màu theo máy như SkyEmu (MIT, (c) 2021 Skyler "Sky" Saleh, se_get_lcd_info): GBA và GBC có bộ chỉnh màu riêng, đọc màu 5-bit
// nhân 8 như lõi SkyEmu; NDS và Game Boy đen trắng giữ màu gốc; các máy khác dùng bộ màu GBA. Filter CSS trên canvas bị tắt.
let gpuDevice, gpuQueue, renderPipeline, canvasFormat, gpuInitializing = null, cachedIsDirtyFn;
let screens = [], resizeObserver;
const UNIFORM_SIZE = 24;
const COLOR_NONE = 0, COLOR_GBA = 1, COLOR_GBC = 2, COLOR_OTHER = 3;
const shaderSource = `
    struct Params { src: vec2f, dst: vec2f, is32: u32, profile: u32 };
    @group(0) @binding(0) var<uniform> params: Params;
    @group(0) @binding(1) var texture32: texture_2d<f32>;
    @group(0) @binding(2) var texture16: texture_2d<u32>;
    const HARD_SCAN = -8.0;
    const MASK_DARK = 0.65;
    const MASK_LIGHT = 1.5;
    @vertex fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
        var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
        return vec4f(pos[index], 0.0, 1.0);
    }
    fn correct(c: vec3f, gamma: f32, red: vec3f, green: vec3f, blue: vec3f) -> vec3f {
        let linear = pow(max(c, vec3f(0.000001)), vec3f(gamma));
        let mixed = linear.r * red + linear.g * green + linear.b * blue;
        return clamp(pow(max(mixed, vec3f(0.000001)), vec3f(1.0 / 2.2)), vec3f(0.0), vec3f(1.0));
    }
    fn texel(p: vec2i) -> vec3f {
        let q = clamp(p, vec2i(0), vec2i(params.src) - 1);
        var c: vec3f;
        if (params.is32 == 1u) {
            c = textureLoad(texture32, q, 0).bgr;
        } else {
            let raw = textureLoad(texture16, q, 0).r;
            if (params.profile == 1u || params.profile == 2u) {
                c = vec3f(f32((raw >> 11u) & 0x1Fu), f32((raw >> 6u) & 0x1Fu), f32(raw & 0x1Fu)) * (8.0 / 255.0);
            } else {
                c = vec3f(f32((raw >> 11u) & 0x1Fu) / 31.0, f32((raw >> 5u) & 0x3Fu) / 63.0, f32(raw & 0x1Fu) / 31.0);
            }
        }
        if (params.profile == 1u || params.profile == 3u) {
            return correct(c, 3.7, vec3f(1.0, 0.05, 0.0), vec3f(0.05, 1.0, 0.05), vec3f(0.0, 0.05, 1.0));
        }
        if (params.profile == 2u) {
            return correct(c, 2.2, vec3f(26.0, 0.0, 6.0) / 32.0, vec3f(4.0, 24.0, 4.0) / 32.0, vec3f(2.0, 8.0, 22.0) / 32.0);
        }
        return c;
    }
    fn gaus(pos: f32, scale: f32) -> f32 {
        return exp2(scale * pos * pos);
    }
    fn sharpRow(pos: vec2f, row: i32, sd: f32) -> vec3f {
        let ix = i32(floor(pos.x - 0.5));
        let y = i32(floor(pos.y)) + row;
        let a = clamp((fract(pos.x + 0.5) - 0.5) / sd + 0.5, 0.0, 1.0);
        return mix(pow(texel(vec2i(ix, y)), vec3f(2.2)), pow(texel(vec2i(ix + 1, y)), vec3f(2.2)), a);
    }
    fn shadowMask(frag: vec2f) -> vec3f {
        var m = vec3f(MASK_DARK);
        let x = fract((frag.x + frag.y * 3.0) / 6.0);
        if (x < 0.333) { m.r = MASK_LIGHT; } else if (x < 0.666) { m.g = MASK_LIGHT; } else { m.b = MASK_LIGHT; }
        return m;
    }
    @fragment fn fs(@builtin(position) position: vec4f) -> @location(0) vec4f {
        let pos = position.xy / params.dst * params.src;
        var sd = params.src.x / params.dst.x;
        if (fract(params.dst.x / params.src.x) * params.src.x < 0.001) { sd = 0.001; }
        let dy = 0.5 - fract(pos.y);
        var c = sharpRow(pos, -1, sd) * gaus(dy - 1.0, HARD_SCAN)
              + sharpRow(pos, 0, sd) * gaus(dy, HARD_SCAN)
              + sharpRow(pos, 1, sd) * gaus(dy + 1.0, HARD_SCAN);
        c *= shadowMask(position.xy);
        return vec4f(clamp(pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2)), vec3f(0.0), vec3f(1.0)), 1.0);
    }
`;
// ===== colorProfile =====
// Bộ màu theo cách SkyEmu chia máy; Game Boy đen trắng (.gb) chạy chung lõi gbc nhưng giữ màu gốc.
function colorProfile() {
    const tag = window.isConfig?.tag;
    if (tag === 'gba') return COLOR_GBA;
    if (tag === 'gbc') return /\.gbc$/i.test(gameName || '') ? COLOR_GBC : COLOR_NONE;
    if (tag === 'nds') return COLOR_NONE;
    return COLOR_OTHER;
}
// ===== initGPU =====
async function initGPU(canvasList) {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
    if (!adapter) return false;
    gpuDevice = await adapter.requestDevice();
    gpuQueue = gpuDevice.queue;
    canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    const shaderModule = gpuDevice.createShaderModule({code: shaderSource});
    renderPipeline = gpuDevice.createRenderPipeline({
        layout: 'auto',
        vertex: {module: shaderModule, entryPoint: 'vs'},
        fragment: {module: shaderModule, entryPoint: 'fs', targets: [{format: canvasFormat}]},
        primitive: {topology: 'triangle-list'}
    });
    // màu đã xử lý trong shader, tắt filter CSS ([fil]) để không bị áp chồng
    canvasList.forEach(element => element.style.filter = 'none');
    resizeObserver = new ResizeObserver(redrawResized);
    screens = canvasList.map(createScreen);
    return true;
}
// ===== createScreen =====
function createScreen(canvas) {
    const context = canvas.getContext('webgpu');
    context.configure({device: gpuDevice, format: canvasFormat, alphaMode: 'opaque'});
    resizeObserver.observe(canvas);
    return {
        canvas, context, texture: null, bindGroup: null, lastPtr: 0, lastView: null,
        uniform: gpuDevice.createBuffer({size: UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST}),
        srcW: 0, srcH: 0, outW: 0, outH: 0, is32: true, pitch: 0, hasFrame: false
    };
}
// ===== writeParams =====
function writeParams(screen) {
    const data = new ArrayBuffer(UNIFORM_SIZE), floats = new Float32Array(data), uints = new Uint32Array(data);
    floats[0] = screen.srcW; floats[1] = screen.srcH; floats[2] = screen.outW; floats[3] = screen.outH;
    uints[4] = screen.is32 ? 1 : 0;
    uints[5] = colorProfile();
    gpuQueue.writeBuffer(screen.uniform, 0, data);
}
// ===== fitCanvas =====
// Canvas có kích thước bằng điểm ảnh thật của chỗ nó đang hiện; chiều cao suy từ tỉ lệ game để không méo.
function fitCanvas(screen) {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(screen.canvas.getBoundingClientRect().width * ratio));
    const height = Math.max(1, Math.round(width * screen.srcH / screen.srcW));
    if (width === screen.outW && height === screen.outH) return false;
    screen.canvas.width = screen.outW = width;
    screen.canvas.height = screen.outH = height;
    writeParams(screen);
    return true;
}
// ===== setupScreen =====
function setupScreen(screen, width, height, is32BitFormat, byteSize) {
    screen.srcW = width; screen.srcH = height; screen.is32 = is32BitFormat; screen.hasFrame = false;
    screen.texture?.destroy();
    screen.texture = gpuDevice.createTexture({
        size: [width, height, 1],
        format: is32BitFormat ? 'rgba8unorm' : 'r16uint',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    const dummyTexture = gpuDevice.createTexture({size: [1, 1, 1], format: is32BitFormat ? 'r16uint' : 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING});
    screen.bindGroup = gpuDevice.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            {binding: 0, resource: {buffer: screen.uniform}},
            {binding: 1, resource: (is32BitFormat ? screen.texture : dummyTexture).createView()},
            {binding: 2, resource: (is32BitFormat ? dummyTexture : screen.texture).createView()}
        ]
    });
    if (screen.lastPtr) Module._free(screen.lastPtr);
    screen.lastPtr = Module._malloc(byteSize);
    screen.lastView = null;
    // global.js đọc kích thước game ở đây, vì canvas.width giờ là kích thước hiển thị
    screen.canvas.dataset.gw = width;
    screen.canvas.dataset.gh = height;
    screen.outW = screen.outH = 0;
    fitCanvas(screen);
}
// ===== recordDraw =====
function recordDraw(screen, encoder) {
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: screen.context.getCurrentTexture().createView(),
            loadOp: 'clear', storeOp: 'store'
        }]
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, screen.bindGroup);
    pass.draw(3);
    pass.end();
}
// ===== redrawResized =====
// Đổi kích thước canvas sẽ xoá trắng nó; game đang đứng hình thì không có khung mới, nên vẽ lại khung cuối.
function redrawResized() {
    if (!gpuDevice) return;
    const encoder = gpuDevice.createCommandEncoder();
    let drawn = false;
    for (const screen of screens) {
        if (!screen.texture || !fitCanvas(screen) || !screen.hasFrame) continue;
        recordDraw(screen, encoder);
        drawn = true;
    }
    if (drawn) gpuQueue.submit([encoder.finish()]);
}
// ===== upload =====
function upload(screen, sourcePtr, byteSize, bytesPerRow, encoder) {
    frameCount++;
    const isDirtyFn = cachedIsDirtyFn || (cachedIsDirtyFn = Module._emux_is_dirty || Module.asm?._emux_is_dirty || Module.instance?.exports?._emux_is_dirty);
    if (!isDirtyFn || !screen.lastPtr || !isDirtyFn(sourcePtr, screen.lastPtr, byteSize)) {skippedFrames++; return;}
    const heap = Module.HEAPU8;
    if (!screen.lastView || screen.lastView.buffer !== heap.buffer) screen.lastView = new Uint8Array(heap.buffer, screen.lastPtr, byteSize);
    gpuQueue.writeTexture({texture: screen.texture}, screen.lastView, {bytesPerRow}, {width: screen.srcW, height: screen.srcH});
    screen.hasFrame = true;
    recordDraw(screen, encoder);
}
// ===== activeRenderFn =====
window.activeRenderFn = async function (pointer, width, height, pitch) {
    if (!gpuDevice) {
        if (!gpuInitializing) gpuInitializing = initGPU(Module.isNDS ? [Module.canvas, canvasBottom] : [Module.canvas]);
        if (!await gpuInitializing) return;
        if (Module.isNDS) {
            page02.style.paddingTop = "5px"; canvasBottom.style.display = "block";
            jpad.style.justifyContent = "center"; joy.style.display = "none";
        }
    }
    if (!Module.HEAPU8) return;
    const encoder = gpuDevice.createCommandEncoder();
    if (Module.isNDS) {
        const halfHeight = height >> 1, byteSize = (width * halfHeight) << 2;
        const [top, bottom] = screens;
        if (top.srcW !== width || top.srcH !== halfHeight || !top.texture) {
            setupScreen(top, width, halfHeight, true, byteSize);
            setupScreen(bottom, width, halfHeight, true, byteSize);
            if (window.gameView) gameView(gameName);
        }
        upload(top, pointer, byteSize, width << 2, encoder);
        upload(bottom, pointer + byteSize, byteSize, width << 2, encoder);
    } else {
        const is32BitFormat = Module.pixelFormat === 1, [main] = screens;
        const byteSize = is32BitFormat ? (width * height) << 2 : pitch * height;
        if (main.srcW !== width || main.srcH !== height || main.is32 !== is32BitFormat || main.pitch !== pitch || !main.texture) {
            main.pitch = pitch;
            setupScreen(main, width, height, is32BitFormat, byteSize);
            if (window.gameView) gameView(gameName);
        }
        upload(main, pointer, byteSize, is32BitFormat ? width << 2 : pitch, encoder);
    }
    gpuQueue.submit([encoder.finish()]);
};
