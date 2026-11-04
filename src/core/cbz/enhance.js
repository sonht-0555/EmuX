// ===== Làm nét ảnh truyện bằng Anime4K (WebGPU) =====
// Mức lấy từ mục W trong chuỗi level: W0 tắt, W1 nhẹ, W2 đẹp, W3 siêu nét.
// Thư viện anime4k-webgpu chỉ được tải khi bật lần đầu. Mỗi lần làm một trang,
// trang gần chỗ đang đọc làm trước. Kết quả trả về là Blob JPEG gấp đôi kích thước.

const LIB_URL = new URL('../../utils/anime4k/anime4k.js', import.meta.url).href;
const TILE = 512, PAD = 16;     // cắt trang thành dải ngang cao 512px, chồng mép 16px để không lộ đường nối
const MAX_W = 2048;             // cạnh ngang tối đa đưa vào GPU
const MAX_AREA = 16e6;          // diện tích canvas 2D tối đa của Safari, tính trên ảnh đầu ra

const CHAINS = {
    1: (A, device, tex) => [new A.CNNx2M({device, inputTexture: tex})],
    2: (A, device, tex) => [new A.CNNx2UL({device, inputTexture: tex})],
    // khử vỡ nét ở độ phân giải gốc trước rồi mới phóng, rẻ hơn nhiều so với làm sau khi phóng
    3: (A, device, tex) => {
        const restore = new A.GANUUL({device, inputTexture: tex});
        return [restore, new A.CNNx2UL({device, inputTexture: restore.getOutputTexture()})];
    },
};

const BLIT = `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: VO;
  o.pos = vec4f(p[i], 0, 1);
  o.uv = vec2f((p[i].x + 1) * 0.5, (1 - p[i].y) * 0.5);
  return o;
}
@fragment fn fs(v: VO) -> @location(0) vec4f {
  return vec4f(clamp(textureSample(tex, samp, v.uv).rgb, vec3f(0), vec3f(1)), 1);
}`;

// ===== Thư viện + GPU: dùng chung cho mọi chương =====
let libPromise = null, gpuPromise = null;

const loadLib = () => libPromise ??= new Promise((resolve, reject) => {
    if (window['anime4k-webgpu']) {resolve(window['anime4k-webgpu']); return;}
    const script = document.createElement('script');
    script.src = LIB_URL;
    script.onload = () => window['anime4k-webgpu'] ? resolve(window['anime4k-webgpu']) : reject(new Error('Anime4K load failed.'));
    script.onerror = () => {libPromise = null; script.remove(); reject(new Error('Anime4K load failed.'));};
    document.head.append(script);
});

const getGpu = () => gpuPromise ??= (async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU is not supported.');
    const device = await adapter.requestDevice();
    device.lost.then(() => {gpuPromise = null;});
    const module = device.createShaderModule({code: BLIT});
    const blit = device.createRenderPipeline({
        layout: 'auto',
        vertex: {module, entryPoint: 'vs'},
        fragment: {module, entryPoint: 'fs', targets: [{format: 'rgba8unorm'}]},
        primitive: {topology: 'triangle-list'},
    });
    const sampler = device.createSampler({magFilter: 'linear', minFilter: 'linear'});
    return {device, blit, sampler};
})();

// Một bộ pipeline gắn với đúng một kích thước dải. Truyện thường cùng khổ ngang nên
// gần như cả chương dùng lại một bộ.
// Kết quả được đọc thẳng từ GPU qua buffer (mapAsync chờ GPU làm xong), KHÔNG qua canvas
// WebGPU: Safari iOS trả khung cũ từ transferToImageBitmap làm dải trang này lẫn sang trang khác.
function buildPipe(A, gpu, level, w, h) {
    const {device, blit, sampler} = gpu;
    const input = device.createTexture({
        size: [w, h, 1], format: 'rgba16float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const chain = CHAINS[level](A, device, input);
    const output = chain.at(-1).getOutputTexture();
    const ow = output.width, oh = output.height;
    const target = device.createTexture({
        size: [ow, oh, 1], format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = Math.ceil(ow * 4 / 256) * 256;     // WebGPU bắt mỗi hàng chia hết cho 256 byte
    const readback = device.createBuffer({size: bytesPerRow * oh, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
    const bind = device.createBindGroup({
        layout: blit.getBindGroupLayout(0),
        entries: [{binding: 0, resource: sampler}, {binding: 1, resource: output.createView()}],
    });
    const destroy = () => {input.destroy(); target.destroy(); readback.destroy();};
    return {input, chain, target, readback, bytesPerRow, ow, oh, bind, destroy};
}

// ===== Làm nét một trang =====
async function upscale(blob, level, pipes) {
    const [A, gpu] = await Promise.all([loadLib(), getGpu()]).catch(err => {
        gpuPromise = null;      // lần đổi mức sau được thử lại từ đầu
        err.fatal = true;
        throw err;
    });
    const {device, blit} = gpu;

    let bitmap = await createImageBitmap(blob);
    let w = bitmap.width, h = bitmap.height;
    // ảnh vào rộng tối đa 3/4 màn hình: phóng x2 xong vẫn dư điểm ảnh so với màn hình,
    // rộng hơn nữa thì GPU làm thêm mà mắt không thấy khác
    const screenW = Math.max(640, Math.round(window.innerWidth * (window.devicePixelRatio || 1)));
    const scale = Math.min(1, screenW * 0.75 / w, MAX_W / w, Math.sqrt(MAX_AREA / (4 * w * h)));
    if (scale < 1) {
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const resized = await createImageBitmap(bitmap, {resizeWidth: w, resizeHeight: h, resizeQuality: 'high'});
        bitmap.close();
        bitmap = resized;
    }

    const readH = Math.min(h, TILE + 2 * PAD);
    const key = `${level}:${w}x${readH}`;
    let pipe = pipes.get(key);
    if (!pipe) {
        for (const [k, old] of pipes) {old.destroy(); pipes.delete(k);}
        pipe = buildPipe(A, gpu, level, w, readH);
        pipes.set(key, pipe);
    }

    const f = pipe.ow / w;          // hệ số phóng của chain (x2)
    const out = new OffscreenCanvas(pipe.ow, Math.round(h * f));
    const g = out.getContext('2d');
    try {
        for (let y0 = 0; y0 < h; y0 += TILE) {
            // dải luôn cao đúng readH (dịch vào trong ở hai đầu) để dùng lại được pipeline.
            // Cắt dải thành bitmap riêng thay vì dùng origin của copyExternalImageToTexture cho chắc trên Safari.
            const top = Math.max(0, Math.min(y0 - PAD, h - readH));
            const strip = await createImageBitmap(bitmap, 0, top, w, readH);
            device.queue.copyExternalImageToTexture({source: strip}, {texture: pipe.input}, [w, readH]);
            strip.close();

            const enc = device.createCommandEncoder();
            pipe.chain.forEach(step => step.pass(enc));
            const pass = enc.beginRenderPass({colorAttachments: [{
                view: pipe.target.createView(),
                loadOp: 'clear', storeOp: 'store', clearValue: {r: 0, g: 0, b: 0, a: 1},
            }]});
            pass.setPipeline(blit);
            pass.setBindGroup(0, pipe.bind);
            pass.draw(3);
            pass.end();
            enc.copyTextureToBuffer({texture: pipe.target}, {buffer: pipe.readback, bytesPerRow: pipe.bytesPerRow}, [pipe.ow, pipe.oh]);
            device.queue.submit([enc.finish()]);

            await pipe.readback.mapAsync(GPUMapMode.READ);
            // chỉ chép phần giữa của dải (bỏ mép chồng), bỏ luôn byte đệm cuối mỗi hàng
            const skip = Math.round((y0 - top) * f), cropH = Math.min(Math.round(Math.min(TILE, h - y0) * f), pipe.oh - skip);
            const src = new Uint8Array(pipe.readback.getMappedRange());
            const rows = new ImageData(pipe.ow, cropH), rowBytes = pipe.ow * 4;
            for (let r = 0; r < cropH; r++) {
                const at = (skip + r) * pipe.bytesPerRow;
                rows.data.set(src.subarray(at, at + rowBytes), r * rowBytes);
            }
            pipe.readback.unmap();
            g.putImageData(rows, 0, Math.round(y0 * f));
        }
    } finally {
        bitmap.close();
    }
    return out.convertToBlob({type: 'image/jpeg', quality: 0.92});
}

// ===== Hàng đợi =====
// request(p, blob) trả về Promise<Blob|null>; null khi bị huỷ, đổi mức hoặc lỗi.
export function createEnhancer({level = 0, onError} = {}) {
    let focus = 0, running = false, current = -1, disposed = false, failed = false;
    const queue = new Map();        // số trang -> {blob, resolve}
    const pipes = new Map();

    const drop = p => {queue.get(p)?.resolve(null); queue.delete(p);};
    const dropAll = () => {for (const p of [...queue.keys()]) drop(p);};
    const clearPipes = () => {for (const pipe of pipes.values()) pipe.destroy(); pipes.clear();};

    const run = async () => {
        if (running) return;
        running = true;
        while (queue.size && level && !disposed && !failed) {
            let p = -1;
            for (const k of queue.keys()) if (p < 0 || Math.abs(k - focus) < Math.abs(p - focus)) p = k;
            const job = queue.get(p);
            queue.delete(p);
            const lv = level;
            current = p;
            try {
                const out = await upscale(job.blob, lv, pipes);
                job.resolve(lv === level && !disposed ? out : null);
            } catch (err) {
                job.resolve(null);
                console.warn('Anime4K:', err.message);
                // lỗi máy (không có WebGPU, không tải được thư viện) thì dừng hẳn tới lần đổi mức sau;
                // lỗi riêng một trang thì bỏ qua trang đó, trang ấy vẫn hiện ảnh gốc
                if (err.fatal) {
                    failed = true;
                    dropAll();
                    onError?.(`Anime4K: ${err.message}`);
                }
            }
            current = -1;
        }
        running = false;
    };

    return {
        get level() {return level;},
        setLevel(next) {
            if (next === level) return false;
            level = next;
            failed = false;
            dropAll();
            clearPipes();
            return true;
        },
        focus(p) {focus = p;},
        has: p => queue.has(p) || current === p,
        request(p, blob) {
            drop(p);
            return new Promise(resolve => {
                queue.set(p, {blob, resolve});
                run();
            });
        },
        cancel: drop,
        dispose() {
            disposed = true;
            dropAll();
            clearPipes();
        },
    };
}
