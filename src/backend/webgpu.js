// ===== WebGPU Variables =====
let device, queue, context, contextBottom, pipeline, bindGroupMain, bindGroupBottom;
let textureMain, textureBottom, frameCount = 0, skippedFrames = 0;
let lastMain, lastBottom, lastView16as32, lastMain16, srcView32;
let cachedWidth = 0, cachedHeight = 0, cachedPitch = 0, cachedBuffer = null, cachedPointer = 0, ndsPointer = 0;
let gpuInitializing = null, currentFormatIs32 = true;
// ===== Shaders (GPU Decoding) =====
const shaderSource = `
  struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
  };
  @vertex
  fn vs(@builtin(vertex_index) idx: u32) -> VertexOutput {
    var pos = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(-1,1), vec2f(1,-1), vec2f(1,1));
    var uv = array<vec2f, 6>(vec2f(0,1), vec2f(1,1), vec2f(0,0), vec2f(0,0), vec2f(1,1), vec2f(1,0));
    var out: VertexOutput;
    out.pos = vec4f(pos[idx], 0.0, 1.0);
    out.uv = uv[idx];
    return out;
  }
  @group(0) @binding(0) var<uniform> is32Bit: u32;
  @group(0) @binding(1) var t32: texture_2d<u32>;
  @group(0) @binding(2) var t16: texture_2d<u32>;
  @fragment
  fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
    if (is32Bit == 1u) {
      let raw = textureLoad(t32, vec2i(uv * vec2f(textureDimensions(t32))), 0).r;
      return vec4f(f32((raw >> 16u) & 0xFFu) / 255.0, f32((raw >> 8u) & 0xFFu) / 255.0, f32(raw & 0xFFu) / 255.0, 1.0);
    } else {
      let raw = textureLoad(t16, vec2i(uv * vec2f(textureDimensions(t16))), 0).r;
      return vec4f(f32((raw >> 11u) & 0x1Fu) / 31.0, f32((raw >> 5u) & 0x3Fu) / 63.0, f32(raw & 0x1Fu) / 31.0, 1.0);
    }
  }
`;
// ===== WebGPU Functions =====
async function initWebGPU(canvas, canvasB) {
  if (!navigator.gpu) return false;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return false;
  device = await adapter.requestDevice();
  queue = device.queue;
  context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  if (canvasB) {
    contextBottom = canvasB.getContext('webgpu');
    contextBottom.configure({ device, format, alphaMode: 'opaque' });
  }
  const shaderModule = device.createShaderModule({ code: shaderSource });
  pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vs' },
    fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' }
  });
  return true;
}
function createRawTexture(width, height, is32) {
  return device.createTexture({
    size: [width, height, 1],
    format: is32 ? 'r32uint' : 'r16uint',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
}
function renderFrame(ctx, bindGroup) {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),
      loadOp: 'load', storeOp: 'store'
    }]
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();
  queue.submit([encoder.finish()]);
}
function logSkip() {
  if (frameCount > 0 && (frameCount & 63) === 0 && window.skip1) {
    skip1.textContent = `${(skippedFrames * 100 / frameCount) | 0}% `;
  }
  if (frameCount > 1000) { frameCount = 0; skippedFrames = 0; }
}
// ===== Rendering =====
function render32(source, sourceOffset, last, context, texture, width, height, length, isBottom) {
  frameCount++;
  const end = sourceOffset + length;
  for (let i = end - 1; i >= sourceOffset; i--) {
    if (source[i] !== last[i - sourceOffset]) {
      for (let j = 0; j < length; j++) last[j] = source[j + sourceOffset];
      queue.writeTexture({ texture }, last, { bytesPerRow: width * 4 }, { width, height });
      renderFrame(context, isBottom ? bindGroupBottom : bindGroupMain);
      return;
    }
  }
  skippedFrames++;
}
function render16(source32, last32, last16, context, texture, width, height, stride, isBottom) {
  frameCount++;
  const widthWords = width >> 1, strideWords = stride >> 1;
  for (let y = height - 1; y >= 0; y--) {
    const si = y * strideWords, li = y * widthWords;
    for (let x = widthWords - 1; x >= 0; x--) {
      if (source32[si + x] !== last32[li + x]) {
        if (width === stride) {
          last32.set(source32);
        } else {
          for (let row = 0; row < height; row++) {
            const srcStart = row * strideWords, dstStart = row * widthWords;
            for (let col = 0; col < widthWords; col++) last32[dstStart + col] = source32[srcStart + col];
          }
        }
        queue.writeTexture({ texture }, last16, { bytesPerRow: width * 2 }, { width, height });
        renderFrame(context, isBottom ? bindGroupBottom : bindGroupMain);
        return;
      }
    }
  }
  skippedFrames++;
}
function renderNDS(pointer, width, height) {
  const hh = height >> 1, len = width * hh, buffer = Module.HEAPU8.buffer;
  if (cachedWidth !== width || cachedHeight !== hh) {
    cachedWidth = width; cachedHeight = hh;
    Module.canvas.width = canvasB.width = width; Module.canvas.height = canvasB.height = hh;
    textureMain = createRawTexture(width, hh, true); 
    textureBottom = createRawTexture(width, hh, true);
    const uniformBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([1]));
    const empty16 = createRawTexture(1, 1, false);
    const layout = pipeline.getBindGroupLayout(0);
    const entries = (tex) => [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: empty16.createView() }];
    bindGroupMain = device.createBindGroup({ layout, entries: entries(textureMain) });
    bindGroupBottom = device.createBindGroup({ layout, entries: entries(textureBottom) });
    lastMain = new Uint32Array(len); lastBottom = new Uint32Array(len);
    srcView32 = null; if (window.gameView) gameView(gameName);
  }
  if (!srcView32 || srcView32.buffer !== buffer || ndsPointer !== pointer) {
    ndsPointer = pointer; srcView32 = new Uint32Array(buffer, pointer, width * height);
  }
  render32(srcView32, 0, lastMain, context, textureMain, width, hh, len, 0);
  render32(srcView32, len, lastBottom, contextBottom, textureBottom, width, hh, len, 1);
  logSkip();
}
async function video_cb(pointer, width, height, pitch) {
  if (!device) {
    if (!gpuInitializing) gpuInitializing = initWebGPU(Module.canvas, Module.isNDS ? canvasB : null);
    const success = await gpuInitializing;
    if (!success) return;
    if (Module.isNDS) {
      page02.style.paddingTop = "5px"; canvasB.style.display = "block"; joypad.style.justifyContent = "center"; joy.style.display = "none";
    }
  }
  if (Module.isNDS) return renderNDS(pointer, width, height);
  const is32 = pitch === (width << 2), buffer = Module.HEAPU8.buffer;
  if (width !== cachedWidth || height !== cachedHeight || pitch !== cachedPitch || is32 !== currentFormatIs32) {
    cachedWidth = width; cachedHeight = height; cachedPitch = pitch; cachedBuffer = null; currentFormatIs32 = is32;
    Module.canvas.width = width; Module.canvas.height = height;
    textureMain = createRawTexture(width, height, is32);
    const uniformBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([is32 ? 1 : 0]));
    const dummy = createRawTexture(1, 1, !is32);
    bindGroupMain = device.createBindGroup({ 
      layout: pipeline.getBindGroupLayout(0), 
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: (is32 ? textureMain : dummy).createView() }, { binding: 2, resource: (is32 ? dummy : textureMain).createView() }] 
    });
    if (is32) lastMain = new Uint32Array(width * height);
    else { lastView16as32 = new Uint32Array((width * height) >> 1); lastMain16 = new Uint16Array(lastView16as32.buffer); }
    if (window.gameView) gameView(gameName);
  }
  if (buffer !== cachedBuffer || pointer !== cachedPointer) {
    cachedBuffer = buffer; cachedPointer = pointer;
    srcView32 = new Uint32Array(buffer, pointer, (pitch * height) >> 2);
  }
  if (is32) render32(srcView32, 0, lastMain, context, textureMain, width, height, width * height, 0);
  else render16(srcView32, lastView16as32, lastMain16, context, textureMain, width, height, pitch >> 1, 0);
  logSkip();
}
