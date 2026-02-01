let gl, glB, program, programB, texture, textureB, fT = 0, fS = 0;
let lastMain, lastMain16, lastBottom, pixelBuffer, pixelBufferB;
const lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) lut565[i] = 0xFF000000 | ((i & 0x001F) << 19) | ((i & 0x07E0) << 5) | ((i & 0xF800) >> 8);
const swizzle = c => 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16) & 0xFF;

const vShaderSource = `attribute vec2 p;attribute vec2 t;varying vec2 v;void main(){gl_Position=vec4(p,0,1);v=t;}`;
const fShaderSource = `precision mediump float;varying vec2 v;uniform sampler2D s;void main(){gl_FragColor=texture2D(s,v);}`;

function initGL(canvas) {
    const c = canvas.getContext('webgl', { alpha: false, antialias: false, desynchronized: true });
    if (!c) return null;
    const vs = c.createShader(c.VERTEX_SHADER); c.shaderSource(vs, vShaderSource); c.compileShader(vs);
    const fs = c.createShader(c.FRAGMENT_SHADER); c.shaderSource(fs, fShaderSource); c.compileShader(fs);
    const pg = c.createProgram(); c.attachShader(pg, vs); c.attachShader(pg, fs); c.linkProgram(pg); c.useProgram(pg);
    const pb = c.createBuffer(); c.bindBuffer(c.ARRAY_BUFFER, pb);
    c.bufferData(c.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), c.STATIC_DRAW);
    const pl = c.getAttribLocation(pg, 'p'); c.enableVertexAttribArray(pl); c.vertexAttribPointer(pl, 2, c.FLOAT, false, 0, 0);
    const tb = c.createBuffer(); c.bindBuffer(c.ARRAY_BUFFER, tb);
    c.bufferData(c.ARRAY_BUFFER, new Float32Array([0,1,1,1,0,0,0,0,1,1,1,0]), c.STATIC_DRAW);
    const tl = c.getAttribLocation(pg, 't'); c.enableVertexAttribArray(tl); c.vertexAttribPointer(tl, 2, c.FLOAT, false, 0, 0);
    const tx = c.createTexture(); c.bindTexture(c.TEXTURE_2D, tx);
    c.texParameteri(c.TEXTURE_2D, c.TEXTURE_WRAP_S, c.CLAMP_TO_EDGE);
    c.texParameteri(c.TEXTURE_2D, c.TEXTURE_WRAP_T, c.CLAMP_TO_EDGE);
    c.texParameteri(c.TEXTURE_2D, c.TEXTURE_MIN_FILTER, c.NEAREST);
    c.texParameteri(c.TEXTURE_2D, c.TEXTURE_MAG_FILTER, c.NEAREST);
    return { c, pg, tx };
}
// logSkip
function logSkip() {
    if (fT > 0 && fT % 60 === 0 && window.skip1) skip1.textContent = `${Math.floor((fS / fT) * 100)}% `;
    if (fT > 1000) { fT = 0; fS = 0; }
}
// render32
function render32(src, last, buf, ctx, tex, w, h, len, offset = 0) {
    fT++;
    for (let i = 0; i < len; i++) if (src[i + offset] !== last[i]) {
        for (let j = 0; j < len; j++) buf[j] = swizzle(last[j] = src[j + offset]);
        ctx.bindTexture(ctx.TEXTURE_2D, tex);
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(buf.buffer));
        ctx.drawArrays(ctx.TRIANGLES, 0, 6);
        return;
    }
    fS++;
}
// render16
function render16(src, last, buf, ctx, tex, w, h, stride) {
    fT++;
    for (let y = 0; y < h; y++) {
        for (let x = 0, si = y * stride, li = y * w; x < w; x++) if (src[si + x] !== last[li + x]) {
            for (let y2 = 0; y2 < h; y2++) for (let x2 = 0, si2 = y2 * stride, di = y2 * w; x2 < w; x2++) buf[di + x2] = lut565[last[di + x2] = src[si2 + x2]];
            ctx.bindTexture(ctx.TEXTURE_2D, tex);
            ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(buf.buffer));
            ctx.drawArrays(ctx.TRIANGLES, 0, 6);
            return;
        }
    }
    fS++;
}
// renderNDS
function renderNDS(src, w, h) {
    const hh = h >> 1, len = w * hh;
    if (Module.canvas.width !== w || Module.canvas.height !== hh) {
        Module.canvas.width = canvasB.width = w;
        Module.canvas.height = canvasB.height = hh;
        gl.viewport(0, 0, w, hh);
        glB.viewport(0, 0, w, hh);
        lastMain = new Uint32Array(len);
        lastBottom = new Uint32Array(len);
        pixelBuffer = new Uint32Array(len);
        pixelBufferB = new Uint32Array(len);
        if (window.gameView) gameView(gameName);
    }
    render32(src, lastMain, pixelBuffer, gl, texture, w, hh, len, 0);
    render32(src, lastBottom, pixelBufferB, glB, textureB, w, hh, len, len);
    logSkip();
}
// video_cb
function video_cb(ptr, w, h, pitch) {
    if (!gl) {
        const r = initGL(Module.canvas);
        if (!r) return;
        gl = r.c; program = r.pg; texture = r.tx;
        if (Module.isNDS) {
            page02.style.paddingTop = "5px";
            canvasB.style.display = "block";
            joypad.style.justifyContent = "center";
            joy.style.display = "none";
            const rB = initGL(canvasB);
            glB = rB.c; programB = rB.pg; textureB = rB.tx;
        }
    }

    if (Module.isNDS) return renderNDS(new Uint32Array(Module.HEAPU8.buffer, ptr, w * h), w, h);

    const len = w * h, is32 = (pitch / w) === 4;
    if (Module.canvas.width !== w || Module.canvas.height !== h) {
        Module.canvas.width = w;
        Module.canvas.height = h;
        gl.viewport(0, 0, w, h);
        if (is32) lastMain = new Uint32Array(len);
        else lastMain16 = new Uint16Array(len);
        pixelBuffer = new Uint32Array(len);
        if (window.gameView) gameView(gameName);
    }

    if (is32) render32(new Uint32Array(Module.HEAPU8.buffer, ptr, len), lastMain, pixelBuffer, gl, texture, w, h, len);
    else render16(new Uint16Array(Module.HEAPU8.buffer, ptr, (pitch >> 1) * h), lastMain16, pixelBuffer, gl, texture, w, h, pitch >> 1);
    logSkip();
}
