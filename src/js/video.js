let gl = null, glProgram = null, glTexture = null, glBuffer = null, glLoc = {};
function initWebGL(w, h) {
  const canvas = Module.canvas;
  gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const vsSrc = 'attribute vec2 a;varying vec2 v;void main(){gl_Position=vec4(a,0,1);v=(a+1.0)/2.0;v.y=1.0-v.y;}';
  const fsSrc = 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}';
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  glProgram = gl.createProgram();
  gl.attachShader(glProgram, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(glProgram, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(glProgram);
  gl.useProgram(glProgram);
  glBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  glLoc = { a: gl.getAttribLocation(glProgram, 'a'), t: gl.getUniformLocation(glProgram, 't') };
  gl.enableVertexAttribArray(glLoc.a);
  gl.vertexAttribPointer(glLoc.a, 2, gl.FLOAT, false, 0, 0);
  glTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.viewport(0, 0, w, h);
}
function video_cb(ptr, w, h, pitch) {
  if (!gl) initWebGL(w, h);
  const pixelData = new Uint16Array(Module.HEAPU8.buffer, ptr, (pitch / 2) * h);
  const gameStride = pitch / 2;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIndex = y * gameStride + x;
      const destIndex = (y * w + x) * 4;
      const color = pixelData[srcIndex];
      const r = (color >> 11) & 0x1F;
      const g = (color >> 5) & 0x3F;
      const b = color & 0x1F;
      rgba[destIndex] = (r << 3) | (r >> 2);
      rgba[destIndex + 1] = (g << 2) | (g >> 4);
      rgba[destIndex + 2] = (b << 3) | (b >> 2);
      rgba[destIndex + 3] = 255;
    }
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  gl.useProgram(glProgram);
  gl.uniform1i(glLoc.t, 0);
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}