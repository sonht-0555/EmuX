let gl, glB, program, programB, texture, textureB, fT = 0, fS = 0;
let lastMain, lastMain16, lastBottom, pixelBuffer, pixelBufferB;
let tIM = 0, tIB = 0;
let pixelView, pixelViewB, lastView16as32, srcView;
let cachedW = 0, cachedH = 0, cachedPitch = 0, cachedBuf = null;

const lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
    const r = (i & 0xF800) >> 8, g = (i & 0x07E0) >> 3, b = (i & 0x001F) << 3;
    lut565[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
}
const swizzle = c => 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16) & 0xFF;

const vShaderSource = `attribute vec2 p;attribute vec2 t;varying vec2 v;void main(){gl_Position=vec4(p,0,1);v=t;}`;
const fShaderSource = `precision mediump float;varying vec2 v;uniform sampler2D s;void main(){gl_FragColor=texture2D(s,v);}`;

function initGL(canvas) {
    const c = canvas.getContext('webgl', { alpha: false, antialias: false, desynchronized: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
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

function logSkip() {
    if (fT > 0 && (fT & 63) === 0 && window.skip1) skip1.textContent = `${(fS * 100 / fT) | 0}% `;
    if (fT > 1000) { fT = 0; fS = 0; }
}

function render32(src, last, buf, view, ctx, tex, w, h, len, offset, tType) {
    fT++;
    let ch = 0;
    for (let i = len + offset - 1; i >= offset; i--) if (src[i] !== last[i - offset]) { ch = 1; break; }
    if (ch) {
        for (let j = 0; j < len; j++) buf[j] = swizzle(last[j] = src[j + offset]);
        ctx.bindTexture(ctx.TEXTURE_2D, tex);
        if (tType ? tIB : tIM) ctx.texSubImage2D(ctx.TEXTURE_2D, 0, 0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, view);
        else { ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, view); if(tType) tIB=1; else tIM=1; }
        ctx.drawArrays(ctx.TRIANGLES, 0, 6);
    } else fS++;
}

function render16(src, last32, buf, view, ctx, tex, w, h, stride, tType) {
    fT++;
    let ch = 0;
    const sw = w >> 1, ss = stride >> 1;
    const src32 = new Uint32Array(src.buffer, src.byteOffset, (stride * h) >> 1);
    outer: for (let y = h - 1; y >= 0; y--) {
        const si = y * ss, li = y * sw;
        for (let x = sw - 1; x >= 0; x--) if (src32[si + x] !== last32[li + x]) { ch = 1; break outer; }
    }
    if (ch) {
        for (let y = 0; y < h; y++) {
            const si = y * stride, li = y * w;
            for (let x = 0; x < w; x++) buf[li + x] = lut565[src[si + x]];
        }
        last32.set(new Uint32Array(buf.buffer, 0, (w * h) >> 1)); // Sync last32 with new pixels
        ctx.bindTexture(ctx.TEXTURE_2D, tex);
        if (tType ? tIB : tIM) ctx.texSubImage2D(ctx.TEXTURE_2D, 0, 0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, view);
        else { ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, view); if(tType) tIB=1; else tIM=1; }
        ctx.drawArrays(ctx.TRIANGLES, 0, 6);
    } else fS++;
}

function renderNDS(ptr, w, h) {
    const hh = h >> 1, len = w * hh;
    const buf = Module.HEAPU8.buffer;
    if (Module.canvas.width !== w || Module.canvas.height !== hh) {
        Module.canvas.width = canvasB.width = w;
        Module.canvas.height = canvasB.height = hh;
        gl.viewport(0, 0, w, hh); glB.viewport(0, 0, w, hh);
        lastMain = new Uint32Array(len); lastBottom = new Uint32Array(len);
        pixelBuffer = new Uint32Array(len); pixelBufferB = new Uint32Array(len);
        pixelView = new Uint8Array(pixelBuffer.buffer); pixelViewB = new Uint8Array(pixelBufferB.buffer);
        tIM = 0; tIB = 0;
        if (window.gameView) gameView(gameName);
    }
    if (!srcView || srcView.buffer !== buf) srcView = new Uint32Array(buf);
    const src = srcView.subarray(ptr >> 2, (ptr >> 2) + (w * h));
    render32(src, lastMain, pixelBuffer, pixelView, gl, texture, w, hh, len, 0, 0);
    render32(src, lastBottom, pixelBufferB, pixelViewB, glB, textureB, w, hh, len, len, 1);
    logSkip();
}

function video_cb(ptr, w, h, pitch) {
    if (!gl) {
        const r = initGL(Module.canvas); if (!r) return;
        gl = r.c; program = r.pg; texture = r.tx;
        if (Module.isNDS) {
            canvasB.style.display = "block";
            const rB = initGL(canvasB); glB = rB.c; programB = rB.pg; textureB = rB.tx;
        }
    }
    if (Module.isNDS) return renderNDS(ptr, w, h);
    const len = w * h, is32 = (pitch / w) === 4;
    const buf = Module.HEAPU8.buffer;
    if (w !== cachedW || h !== cachedH || pitch !== cachedPitch) {
        cachedW = w; cachedH = h; cachedPitch = pitch;
        Module.canvas.width = w; Module.canvas.height = h;
        gl.viewport(0, 0, w, h); tIM = 0;
        pixelBuffer = new Uint32Array(len);
        pixelView = new Uint8Array(pixelBuffer.buffer);
        if (is32) lastMain = new Uint32Array(len); 
        else lastView16as32 = new Uint32Array(len >> 1);
        if (window.gameView) gameView(gameName);
    }
    if (is32) {
        const src = new Uint32Array(buf, ptr, len);
        render32(src, lastMain, pixelBuffer, pixelView, gl, texture, w, h, len, 0, 0);
    } else {
        const src = new Uint16Array(buf, ptr, (pitch >> 1) * h);
        render16(src, lastView16as32, pixelBuffer, pixelView, gl, texture, w, h, pitch >> 1, 0);
    }
    logSkip();
}
