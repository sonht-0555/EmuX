// ===== webgpu.js =====
let device, queue, contextMain, contextBottom, pipeline, bindGroupMain, bindGroupBottom, textureMain, textureBottom;
let lastMain, lastBottom, lastView16as32, lastMain16, srcView32, gpuInitializing = null, formatIs32 = true;
const shaderSource = `
  struct Config { is32: u32, width: f32, height: f32, pad: u32 };
  @group(0) @binding(0) var<uniform> config: Config;
  @group(0) @binding(1) var texture32: texture_2d<f32>;
  @group(0) @binding(2) var texture16: texture_2d<u32>;
  struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
  @vertex fn vs(@builtin(vertex_index) index: u32) -> VertexOutput {
    var pos = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
    var uv = array<vec2f, 6>(vec2f(0,1), vec2f(1,1), vec2f(0,0), vec2f(0,0), vec2f(1,1), vec2f(1,0));
    var out: VertexOutput; out.position = vec4f(pos[index], 0.0, 1.0); out.uv = uv[index]; return out;
  }
  @fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
    let coords = vec2i(uv * vec2f(config.width, config.height));
    if (config.is32 == 1u) {
      let color = textureLoad(texture32, coords, 0);
      return vec4f(color.b, color.g, color.r, 1.0);
    }
    let raw = textureLoad(texture16, coords, 0).r;
    return vec4f(f32((raw >> 11u) & 0x1Fu) * 0.032258, f32((raw >> 5u) & 0x3Fu) * 0.015873, f32(raw & 0x1Fu) * 0.032258, 1.0);
  }`;
async function initGPU(canvas, canvasNDS) {
  if (!navigator.gpu) return false;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return false;
  device = await adapter.requestDevice(); queue = device.queue;
  const format = navigator.gpu.getPreferredCanvasFormat();
  contextMain = canvas.getContext('webgpu'); contextMain.configure({ device, format, alphaMode: 'opaque' });
  if (canvasNDS) { contextBottom = canvasNDS.getContext('webgpu'); contextBottom.configure({ device, format, alphaMode: 'opaque' }); }
  const shaderModule = device.createShaderModule({ code: shaderSource });
  pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module: shaderModule, entryPoint: 'vs' }, fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
  return true;
}
function createTexture(width, height, is32) {
  return device.createTexture({ size: [width, height, 1], format: is32 ? 'rgba8unorm' : 'r16uint', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
}
function recordDraw(context, bindGroup, encoder) {
  const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }] });
  pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.draw(6); pass.end();
}
function render32(source, sourceOffset, last, context, texture, width, height, length, bindGroup, encoder) {
  frameCount++; const end = sourceOffset + length;
  for (let i = end - 1; i >= sourceOffset; i--) {
    if (source[i] !== last[i - sourceOffset]) {
      for (let j = 0; j < length; j++) last[j] = source[sourceOffset + j];
      queue.writeTexture({ texture: texture }, last, { bytesPerRow: width * 4 }, { width, height });
      recordDraw(context, bindGroup, encoder); return;
    }
  }
  skippedFrames++;
}
function render16(source32, last32, last16, context, texture, width, height, stride, bindGroup, encoder) {
  frameCount++; const widthWords = width >> 1, strideWords = stride >> 1;
  for (let y = height - 1; y >= 0; y--) {
    const si = y * strideWords, li = y * widthWords;
    for (let x = widthWords - 1; x >= 0; x--) {
      if (source32[si + x] !== last32[li + x]) {
        if (width === stride) last32.set(source32);
        else for (let r = 0; r < height; r++) last32.set(source32.subarray(r * strideWords, r * strideWords + widthWords), r * widthWords);
        queue.writeTexture({ texture: texture }, last16, { bytesPerRow: width * 2 }, { width, height });
        recordDraw(context, bindGroup, encoder); return;
      }
    }
  }
  skippedFrames++;
}
function renderNDS(pointer, width, height, encoder) {
  const halfHeight = height >> 1, length = width * halfHeight, buffer = Module.HEAPU8.buffer;
  if (cachedWidth !== width || cachedHeight !== halfHeight) {
    cachedWidth = width; cachedHeight = halfHeight; Module.canvas.width = canvasB.width = width; Module.canvas.height = canvasB.height = halfHeight;
    textureMain = createTexture(width, halfHeight, true); textureBottom = createTexture(width, halfHeight, true);
    const layout = pipeline.getBindGroupLayout(0), dummy = createTexture(1, 1, false);
    const createBG = (texture) => {
      const ub = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      queue.writeBuffer(ub, 0, new Uint32Array([1])); queue.writeBuffer(ub, 4, new Float32Array([width, halfHeight]));
      return device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: ub } }, { binding: 1, resource: texture.createView() }, { binding: 2, resource: dummy.createView() }] });
    };
    bindGroupMain = createBG(textureMain); bindGroupBottom = createBG(textureBottom);
    lastMain = new Uint32Array(length); lastBottom = new Uint32Array(length); srcView32 = null; if (window.gameView) gameView(gameName);
  }
  if (!srcView32 || srcView32.buffer !== buffer || ndsPointer !== pointer) { ndsPointer = pointer; srcView32 = new Uint32Array(buffer, pointer, width * height); }
  render32(srcView32, 0, lastMain, contextMain, textureMain, width, halfHeight, length, bindGroupMain, encoder);
  render32(srcView32, length, lastBottom, contextBottom, textureBottom, width, halfHeight, length, bindGroupBottom, encoder);
}
window.activeRenderFn = async function(pointer, width, height, pitch) {
  if (!device) {
    if (!gpuInitializing) gpuInitializing = initGPU(Module.canvas, Module.isNDS ? canvasB : null);
    if (!await gpuInitializing) return;
    if (Module.isNDS) { page02.style.paddingTop = "5px"; canvasB.style.display = "block"; joypad.style.justifyContent = "center"; joy.style.display = "none"; }
  }
  const encoder = device.createCommandEncoder(), is32 = pitch === (width << 2), buffer = Module.HEAPU8.buffer;
  if (Module.isNDS) renderNDS(pointer, width, height, encoder);
  else {
    if (width !== cachedWidth || height !== cachedHeight || is32 !== formatIs32) {
      cachedWidth = width; cachedHeight = height; cachedPitch = pitch; formatIs32 = is32; cachedBuffer = null; Module.canvas.width = width; Module.canvas.height = height;
      textureMain = createTexture(width, height, is32); const dummy = createTexture(1, 1, !is32);
      const ub = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      queue.writeBuffer(ub, 0, new Uint32Array([is32 ? 1 : 0])); queue.writeBuffer(ub, 4, new Float32Array([width, height]));
      bindGroupMain = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ub } }, { binding: 1, resource: (is32 ? textureMain : dummy).createView() }, { binding: 2, resource: (is32 ? dummy : textureMain).createView() }] });
      if (is32) lastMain = new Uint32Array(width * height); else { lastView16as32 = new Uint32Array((width * height) >> 1); lastMain16 = new Uint16Array(lastView16as32.buffer); }
      if (window.gameView) gameView(gameName);
    }
    if (buffer !== cachedBuffer || pointer !== cachedPointer) { cachedBuffer = buffer; cachedPointer = pointer; srcView32 = new Uint32Array(buffer, pointer, (pitch * height) >> 2); }
    if (is32) render32(srcView32, 0, lastMain, contextMain, textureMain, width, height, width * height, bindGroupMain, encoder);
    else render16(srcView32, lastView16as32, lastMain16, contextMain, textureMain, width, height, pitch >> 1, bindGroupMain, encoder);
  }
  queue.submit([encoder.finish()]); logSkip();
};