// ===== webgl.js =====
let gl, glBottom, program, programBottom, texture, textureBottom, lastMain, lastBottom, pixelBuffer, pixelBufferBottom, pixelView, pixelViewBottom;
let lastView16as32, srcView32, srcView16, textureInitializedMain = 0, textureInitializedBottom = 0;
const vertexShaderSource = `attribute vec2 p;attribute vec2 t;varying vec2 v;void main(){gl_Position=vec4(p,0,1);v=t;}`;
const fragmentShaderSource = `precision mediump float;varying vec2 v;uniform sampler2D s;void main(){gl_FragColor=texture2D(s,v);}`;
function initGL(canvas) {
  const context = canvas.getContext('webgl', { alpha: false, antialias: false, desynchronized: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!context) return null;
  const vs = context.createShader(context.VERTEX_SHADER); context.shaderSource(vs, vertexShaderSource); context.compileShader(vs);
  const fs = context.createShader(context.FRAGMENT_SHADER); context.shaderSource(fs, fragmentShaderSource); context.compileShader(fs);
  const prog = context.createProgram(); context.attachShader(prog, vs); context.attachShader(prog, fs); context.linkProgram(prog); context.useProgram(prog);
  const posBuffer = context.createBuffer(); context.bindBuffer(context.ARRAY_BUFFER, posBuffer); context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), context.STATIC_DRAW);
  const posLoc = context.getAttribLocation(prog, 'p'); context.enableVertexAttribArray(posLoc); context.vertexAttribPointer(posLoc, 2, context.FLOAT, false, 0, 0);
  const texBuffer = context.createBuffer(); context.bindBuffer(context.ARRAY_BUFFER, texBuffer); context.bufferData(context.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), context.STATIC_DRAW);
  const texLoc = context.getAttribLocation(prog, 't'); context.enableVertexAttribArray(texLoc); context.vertexAttribPointer(texLoc, 2, context.FLOAT, false, 0, 0);
  const tex = context.createTexture(); context.bindTexture(context.TEXTURE_2D, tex);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE); context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST); context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST);
  return { context, prog, tex };
}
function render32(source, sourceOffset, last, buffer, view, context, tex, width, height, length, type) {
  frameCount++;
  const end = sourceOffset + length;
  for (let i = end - 1; i >= sourceOffset; i--) {
    if (source[i] !== last[i - sourceOffset]) {
      for (let j = 0, k = sourceOffset; j < length; j++, k++) {
        const color = last[j] = source[k];
        buffer[j] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color >> 16) & 0xFF;
      }
      context.bindTexture(context.TEXTURE_2D, tex);
      if (type ? textureInitializedBottom : textureInitializedMain) context.texSubImage2D(context.TEXTURE_2D, 0, 0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, view);
      else { context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, view); if (type) textureInitializedBottom = 1; else textureInitializedMain = 1; }
      context.drawArrays(context.TRIANGLES, 0, 6); return;
    }
  }
  skippedFrames++;
}
function render16(source16, source32, last32, buffer, view, context, tex, width, height, stride, type) {
  frameCount++;
  const widthWords = width >> 1, strideWords = stride >> 1;
  for (let y = height - 1; y >= 0; y--) {
    const si = y * strideWords, li = y * widthWords;
    for (let x = widthWords - 1; x >= 0; x--) {
      if (source32[si + x] !== last32[li + x]) {
        for (let y2 = 0; y2 < height; y2++) {
          const si2 = y2 * stride, li2 = y2 * width, si32 = y2 * strideWords, li32 = y2 * widthWords;
          for (let x2 = 0; x2 < widthWords; x2++) {
            const i = x2 << 1;
            buffer[li2 + i] = lut565[source16[si2 + i]];
            buffer[li2 + i + 1] = lut565[source16[si2 + i + 1]];
            last32[li32 + x2] = source32[si32 + x2];
          }
        }
        context.bindTexture(context.TEXTURE_2D, tex);
        if (type ? textureInitializedBottom : textureInitializedMain) context.texSubImage2D(context.TEXTURE_2D, 0, 0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, view);
        else { context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, view); if (type) textureInitializedBottom = 1; else textureInitializedMain = 1; }
        context.drawArrays(context.TRIANGLES, 0, 6); return;
      }
    }
  }
  skippedFrames++;
}
function renderNDS(pointer, width, height) {
  const halfHeight = height >> 1, length = width * halfHeight, buffer = Module.HEAPU8.buffer;
  if (cachedWidth !== width || cachedHeight !== halfHeight) {
    cachedWidth = width; cachedHeight = halfHeight; Module.canvas.width = canvasB.width = width; Module.canvas.height = canvasB.height = halfHeight;
    gl.viewport(0, 0, width, halfHeight); glBottom.viewport(0, 0, width, halfHeight);
    pixelBuffer = new Uint32Array(length); pixelBufferBottom = new Uint32Array(length);
    pixelView = new Uint8Array(pixelBuffer.buffer); pixelViewBottom = new Uint8Array(pixelBufferBottom.buffer);
    lastMain = new Uint32Array(length); lastBottom = new Uint32Array(length);
    srcView32 = null; textureInitializedMain = textureInitializedBottom = 0; if (window.gameView) gameView(gameName);
  }
  if (!srcView32 || srcView32.buffer !== buffer || ndsPointer !== pointer) { ndsPointer = pointer; srcView32 = new Uint32Array(buffer, pointer, width * height); }
  render32(srcView32, 0, lastMain, pixelBuffer, pixelView, gl, texture, width, halfHeight, length, 0);
  render32(srcView32, length, lastBottom, pixelBufferBottom, pixelViewBottom, glBottom, textureBottom, width, halfHeight, length, 1);
  logSkip();
}
window.activeRenderFn = function(pointer, width, height, pitch) {
  if (!gl) {
    const m = initGL(Module.canvas); if (!m) return;
    gl = m.context; program = m.prog; texture = m.tex;
    if (Module.isNDS) {
      page02.style.paddingTop = "5px"; canvasB.style.display = "block"; joypad.style.justifyContent = "center"; joy.style.display = "none";
      const b = initGL(canvasB); glBottom = b.context; programBottom = b.prog; textureBottom = b.tex;
    }
  }
  if (Module.isNDS) return renderNDS(pointer, width, height);
  const length = width * height, is32 = pitch === (width << 2), buffer = Module.HEAPU8.buffer;
  if (width !== cachedWidth || height !== cachedHeight || pitch !== cachedPitch) {
    cachedWidth = width; cachedHeight = height; cachedPitch = pitch; cachedBuffer = null;
    Module.canvas.width = width; Module.canvas.height = height; gl.viewport(0, 0, width, height);
    pixelBuffer = new Uint32Array(length); pixelView = new Uint8Array(pixelBuffer.buffer);
    if (is32) lastMain = new Uint32Array(length); else lastView16as32 = new Uint32Array(length >> 1);
    textureInitializedMain = 0; if (window.gameView) gameView(gameName);
  }
  if (buffer !== cachedBuffer || pointer !== cachedPointer) {
    cachedBuffer = buffer; cachedPointer = pointer; srcView32 = new Uint32Array(buffer, pointer, is32 ? length : ((pitch >> 1) * height) >> 1);
    if (!is32) srcView16 = new Uint16Array(buffer, pointer, (pitch >> 1) * height);
  }
  if (is32) render32(srcView32, 0, lastMain, pixelBuffer, pixelView, gl, texture, width, height, length, 0);
  else render16(srcView16, srcView32, lastView16as32, pixelBuffer, pixelView, gl, texture, width, height, pitch >> 1, 0);
  logSkip();
};