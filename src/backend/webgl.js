// ===== WebGL Variables =====
let gl, glB, program, programB, texture, textureB, frameCount = 0, skippedFrames = 0;
let lastMain, lastBottom, pixelBuffer, pixelBufferBottom, textureInitializedMain = 0, textureInitializedBottom = 0;
let pixelView, pixelViewBottom, lastView16as32, srcView32, srcView16;
let cachedWidth = 0, cachedHeight = 0, cachedPitch = 0, cachedBuffer = null, cachedPointer = 0, ndsPointer = 0, ndsWidth = 0, ndsHeight = 0;
// ===== LUT & Shaders =====
const lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
  const r = (i & 0xF800) >> 8, g = (i & 0x07E0) >> 3, b = (i & 0x001F) << 3;
  lut565[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
}
const vertexShaderSource = `attribute vec2 p;attribute vec2 t;varying vec2 v;void main(){gl_Position=vec4(p,0,1);v=t;}`;
const fragmentShaderSource = `precision mediump float;varying vec2 v;uniform sampler2D s;void main(){gl_FragColor=texture2D(s,v);}`;
// ===== WebGL Functions =====
function initGL(canvas) {
  const glContext = canvas.getContext('webgl', { alpha: false, antialias: false, desynchronized: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!glContext) return null;
  const vertexShader = glContext.createShader(glContext.VERTEX_SHADER);
  glContext.shaderSource(vertexShader, vertexShaderSource);
  glContext.compileShader(vertexShader);
  const fragmentShader = glContext.createShader(glContext.FRAGMENT_SHADER);
  glContext.shaderSource(fragmentShader, fragmentShaderSource);
  glContext.compileShader(fragmentShader);
  const glProgram = glContext.createProgram();
  glContext.attachShader(glProgram, vertexShader);
  glContext.attachShader(glProgram, fragmentShader);
  glContext.linkProgram(glProgram);
  glContext.useProgram(glProgram);
  const positionBuffer = glContext.createBuffer();
  glContext.bindBuffer(glContext.ARRAY_BUFFER, positionBuffer);
  glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), glContext.STATIC_DRAW);
  const positionLocation = glContext.getAttribLocation(glProgram, 'p');
  glContext.enableVertexAttribArray(positionLocation);
  glContext.vertexAttribPointer(positionLocation, 2, glContext.FLOAT, false, 0, 0);
  const texCoordBuffer = glContext.createBuffer();
  glContext.bindBuffer(glContext.ARRAY_BUFFER, texCoordBuffer);
  glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), glContext.STATIC_DRAW);
  const texCoordLocation = glContext.getAttribLocation(glProgram, 't');
  glContext.enableVertexAttribArray(texCoordLocation);
  glContext.vertexAttribPointer(texCoordLocation, 2, glContext.FLOAT, false, 0, 0);
  const glTexture = glContext.createTexture();
  glContext.bindTexture(glContext.TEXTURE_2D, glTexture);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.NEAREST);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.NEAREST);
  return { glContext, glProgram, glTexture };
}
function logSkip() {
  if (frameCount > 0 && (frameCount & 63) === 0 && window.skip1) {
    skip1.textContent = `${(skippedFrames * 100 / frameCount) | 0}% `;
  }
  if (frameCount > 1000) { frameCount = 0; skippedFrames = 0; }
}
// ===== Rendering =====
function render32(source, sourceOffset, last, buffer, view, context, texture, width, height, length, textureType) {
  frameCount++;
  const end = sourceOffset + length;
  for (let i = end - 1; i >= sourceOffset; i--) {
    if (source[i] !== last[i - sourceOffset]) {
      for (let j = 0, k = sourceOffset; j < length; j++, k++) {
        const color = last[j] = source[k];
        buffer[j] = 0xFF000000 | (color & 0xFF) << 16 | (color & 0xFF00) | (color >> 16) & 0xFF;
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
  skippedFrames++;
}
function render16(source16, source32, last32, buffer, view, context, texture, width, height, stride, textureType) {
  frameCount++;
  const widthWords = width >> 1;
  const strideWords = stride >> 1;
  for (let y = height - 1; y >= 0; y--) {
    const sourceIndex = y * strideWords, lastIndex = y * widthWords;
    for (let x = widthWords - 1; x >= 0; x--) {
      if (source32[sourceIndex + x] !== last32[lastIndex + x]) {
        for (let y2 = 0; y2 < height; y2++) {
          const si2 = y2 * stride, li2 = y2 * width, si32 = y2 * strideWords, li32 = y2 * widthWords;
          for (let x2 = 0; x2 < widthWords; x2++) {
            const i = x2 << 1;
            buffer[li2 + i] = lut565[source16[si2 + i]];
            buffer[li2 + i + 1] = lut565[source16[si2 + i + 1]];
            last32[li32 + x2] = source32[si32 + x2];
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
  skippedFrames++;
}
function renderNDS(pointer, width, height) {
  const halfHeight = height >> 1, length = width * halfHeight, buffer = Module.HEAPU8.buffer;
  if (Module.canvas.width !== width || Module.canvas.height !== halfHeight) {
    Module.canvas.width = canvasB.width = width; Module.canvas.height = canvasB.height = halfHeight;
    gl.viewport(0, 0, width, halfHeight); glB.viewport(0, 0, width, halfHeight);
    lastMain = new Uint32Array(length); lastBottom = new Uint32Array(length);
    pixelBuffer = new Uint32Array(length); pixelBufferBottom = new Uint32Array(length);
    pixelView = new Uint8Array(pixelBuffer.buffer); pixelViewBottom = new Uint8Array(pixelBufferBottom.buffer);
    srcView32 = null; textureInitializedMain = 0; textureInitializedBottom = 0;
    if (window.gameView) gameView(gameName);
  }
  if (!srcView32 || srcView32.buffer !== buffer || ndsPointer !== pointer || ndsWidth !== width || ndsHeight !== height) {
    ndsPointer = pointer; ndsWidth = width; ndsHeight = height; srcView32 = new Uint32Array(buffer, pointer, width * height);
  }
  render32(srcView32, 0, lastMain, pixelBuffer, pixelView, gl, texture, width, halfHeight, length, 0);
  render32(srcView32, length, lastBottom, pixelBufferBottom, pixelViewBottom, glB, textureB, width, halfHeight, length, 1);
  logSkip();
}
window.activeRenderFn = function(pointer, width, height, pitch) {
  if (!gl) {
    const result = initGL(Module.canvas); if (!result) return;
    gl = result.glContext; program = result.glProgram; texture = result.glTexture;
    if (Module.isNDS) {
      page02.style.paddingTop = "5px"; canvasB.style.display = "block"; joypad.style.justifyContent = "center"; joy.style.display = "none";
      const resultB = initGL(canvasB); glB = resultB.glContext; programB = resultB.glProgram; textureB = resultB.glTexture;
    }
  }
  if (Module.isNDS) return renderNDS(pointer, width, height);
  const length = width * height, is32 = pitch === (width << 2), buffer = Module.HEAPU8.buffer;
  if (width !== cachedWidth || height !== cachedHeight || pitch !== cachedPitch) {
    cachedWidth = width; cachedHeight = height; cachedPitch = pitch; cachedBuffer = null;
    Module.canvas.width = width; Module.canvas.height = height; gl.viewport(0, 0, width, height);
    textureInitializedMain = 0; pixelBuffer = new Uint32Array(length); pixelView = new Uint8Array(pixelBuffer.buffer);
    if (is32) lastMain = new Uint32Array(length); else lastView16as32 = new Uint32Array(length >> 1);
    if (window.gameView) gameView(gameName);
  }
  if (buffer !== cachedBuffer || pointer !== cachedPointer) {
    cachedBuffer = buffer; cachedPointer = pointer;
    if (is32) srcView32 = new Uint32Array(buffer, pointer, length);
    else {
      srcView16 = new Uint16Array(buffer, pointer, (pitch >> 1) * height);
      srcView32 = new Uint32Array(buffer, pointer, ((pitch >> 1) * height) >> 1);
    }
  }
  if (is32) render32(srcView32, 0, lastMain, pixelBuffer, pixelView, gl, texture, width, height, length, 0);
  else render16(srcView16, srcView32, lastView16as32, pixelBuffer, pixelView, gl, texture, width, height, pitch >> 1, 0);
  logSkip();
};