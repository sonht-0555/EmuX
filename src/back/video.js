let gl, glProgram, glTexture, glBuffer, glLocations = {}, rgbaBuffer;
const r5to8 = new Uint8Array(32), g6to8 = new Uint8Array(64), b5to8 = new Uint8Array(32);
for (let i = 0; i < 32; i++) r5to8[i] = b5to8[i] = (i << 3) | (i >> 2);
for (let i = 0; i < 64; i++) g6to8[i] = (i << 2) | (i >> 4);
function initWebGL(width, height) {
  const canvas = Module.canvas, compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  glProgram = gl.createProgram();
  gl.attachShader(glProgram, compile(gl.VERTEX_SHADER, 'attribute vec2 a;varying vec2 v;void main(){gl_Position=vec4(a,0,1);v=(a+1.0)/2.0;v.y=1.0-v.y;}'));
  gl.attachShader(glProgram, compile(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}'));
  gl.linkProgram(glProgram); gl.useProgram(glProgram);
  glBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  glLocations = { attribute: gl.getAttribLocation(glProgram, 'a'), texture: gl.getUniformLocation(glProgram, 't') };
  gl.enableVertexAttribArray(glLocations.attribute);
  gl.vertexAttribPointer(glLocations.attribute, 2, gl.FLOAT, false, 0, 0);
  glTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  canvas.width = width; canvas.height = height;
  gl.viewport(0, 0, width, height);
  rgbaBuffer = new Uint8Array(width * height * 4);
}
function video_cb(pointer, width, height, pitch) {
  if (!gl) initWebGL(width, height);
  // New fix
  const targetSize = width * height * 4;
  if (!rgbaBuffer || rgbaBuffer.length < targetSize) {
    rgbaBuffer = new Uint8Array(targetSize);
    canvas.width = width; canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  // New fix
  const src = new Uint16Array(Module.HEAPU8.buffer, pointer, (pitch / 2) * height);
  const stride = pitch / 2;
  let di = 0;
  for (let y = 0; y < height; y++) {
    let si = y * stride;
    for (let x = 0; x < width; x++, si++) {
      const c = src[si];
      rgbaBuffer[di++] = r5to8[c >> 11];
      rgbaBuffer[di++] = g6to8[(c >> 5) & 0x3F];
      rgbaBuffer[di++] = b5to8[c & 0x1F];
      rgbaBuffer[di++] = 255;
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaBuffer);
  gl.uniform1i(glLocations.texture, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}