let gl, glB, pg, pgB, tx, txB, fT = 0, fS = 0, lM, lB, pB, pBB, tM = 0, tB = 0, pV, pVB, l16, s32, s16, cW = 0, cH = 0, cP = 0, cB = null, cPr = 0, nP = 0, nW = 0, nH = 0;
const lut = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
    const r = (i & 0xF800) >> 8, g = (i & 0x07E0) >> 3, b = (i & 0x001F) << 3;
    lut[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
}
const vsS = `attribute vec2 p;attribute vec2 t;varying vec2 v;void main(){gl_Position=vec4(p,0,1);v=t;}`;
const fsS = `precision mediump float;varying vec2 v;uniform sampler2D s;void main(){gl_FragColor=texture2D(s,v);}`;
function initGL(can) {
    const c = can.getContext('webgl', { alpha: false, antialias: false, desynchronized: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!c) return null;
    const vs = c.createShader(c.VERTEX_SHADER); c.shaderSource(vs, vsS); c.compileShader(vs);
    const fs = c.createShader(c.FRAGMENT_SHADER); c.shaderSource(fs, fsS); c.compileShader(fs);
    const p = c.createProgram(); c.attachShader(p, vs); c.attachShader(p, fs); c.linkProgram(p); c.useProgram(p);
    const pb = c.createBuffer(); c.bindBuffer(c.ARRAY_BUFFER, pb);
    c.bufferData(c.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), c.STATIC_DRAW);
    const pl = c.getAttribLocation(p, 'p'); c.enableVertexAttribArray(pl); c.vertexAttribPointer(pl, 2, c.FLOAT, false, 0, 0);
    const tb = c.createBuffer(); c.bindBuffer(c.ARRAY_BUFFER, tb);
    c.bufferData(c.ARRAY_BUFFER, new Float32Array([0,1,1,1,0,0,0,0,1,1,1,0]), c.STATIC_DRAW);
    const tl = c.getAttribLocation(p, 't'); c.enableVertexAttribArray(tl); c.vertexAttribPointer(tl, 2, c.FLOAT, false, 0, 0);
    const t = c.createTexture(); c.bindTexture(c.TEXTURE_2D, t);
    c.texParameteri(c.TEXTURE_2D, c.TEXTURE_WRAP_S, c.CLAMP_TO_EDGE);
    c.texParameteri(c.TEXTURE_2D, c.TEXTURE_WRAP_T, c.CLAMP_TO_EDGE);
    c.texParameteri(c.TEXTURE_2D, c.TEXTURE_MIN_FILTER, c.NEAREST);
    c.texParameteri(c.TEXTURE_2D, c.TEXTURE_MAG_FILTER, c.NEAREST);
    return { c, p, t };
}
function logSkip() {
    if (fT > 0 && (fT & 63) === 0 && window.skip1) skip1.textContent = `${(fS * 100 / fT) | 0}% `;
    if (fT > 1000) { fT = 0; fS = 0; }
}
function r32(src, sO, last, buf, view, ctx, tex, w, h, len, ty) {
    fT++;
    const end = sO + len;
    for (let i = end - 1; i >= sO; i--) if (src[i] !== last[i - sO]) {
        for (let j = 0, k = sO; j < len; j++, k++) {
            const c = last[j] = src[k];
            buf[j] = 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >> 16) & 0xFF;
        }
        ctx.bindTexture(ctx.TEXTURE_2D, tex);
        if (ty ? tB : tM) ctx.texSubImage2D(ctx.TEXTURE_2D, 0, 0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, view);
        else { ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, view); if(ty) tB=1; else tM=1; }
        ctx.drawArrays(ctx.TRIANGLES, 0, 6); return;
    }
    fS++;
}
function r16(s16, s32, l32, buf, view, ctx, tex, w, h, st, ty) {
    fT++;
    const sw = w >> 1, ss = st >> 1;
    for (let y = h - 1; y >= 0; y--) {
        const si = y * ss, li = y * sw;
        for (let x = sw - 1; x >= 0; x--) if (s32[si + x] !== l32[li + x]) {
            for (let y2 = 0; y2 < h; y2++) {
                const si2 = y2 * st, li2 = y2 * w, si32 = y2 * ss, li32 = y2 * sw;
                for (let x2 = 0; x2 < sw; x2++) {
                    const i = x2 << 1;
                    buf[li2 + i] = lut[s16[si2 + i]];
                    buf[li2 + i + 1] = lut[s16[si2 + i + 1]];
                    l32[li32 + x2] = s32[si32 + x2];
                }
            }
            ctx.bindTexture(ctx.TEXTURE_2D, tex);
            if (ty ? tB : tM) ctx.texSubImage2D(ctx.TEXTURE_2D, 0, 0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, view);
            else { ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, view); if(ty) tB=1; else tM=1; }
            ctx.drawArrays(ctx.TRIANGLES, 0, 6); return;
        }
    }
    fS++;
}
function renderNDS(ptr, w, h) {
    const hh = h >> 1, len = w * hh, b = Module.HEAPU8.buffer;
    if (Module.canvas.width !== w || Module.canvas.height !== hh) {
        Module.canvas.width = canvasB.width = w; Module.canvas.height = canvasB.height = hh;
        gl.viewport(0, 0, w, hh); glB.viewport(0, 0, w, hh);
        lM = new Uint32Array(len); lB = new Uint32Array(len);
        pB = new Uint32Array(len); pBB = new Uint32Array(len);
        pV = new Uint8Array(pB.buffer); pVB = new Uint8Array(pBB.buffer);
        s32 = null; tM = 0; tB = 0;
        if (window.gameView) gameView(gameName);
    }
    if (!s32 || s32.buffer !== b || nP !== ptr || nW !== w || nH !== h) { nP = ptr; nW = w; nH = h; s32 = new Uint32Array(b, ptr, w * h); }
    r32(s32, 0, lM, pB, pV, gl, texture, w, hh, len, 0);
    r32(s32, len, lB, pBB, pVB, glB, textureB, w, hh, len, 1);
    logSkip();
}
function video_cb(ptr, w, h, pitch) {
    if (!gl) {
        const r = initGL(Module.canvas); if (!r) return;
        gl = r.c; pg = r.p; texture = r.t;
        if (Module.isNDS) { canvasB.style.display = "block"; const rB = initGL(canvasB); glB = rB.c; pgB = rB.p; textureB = rB.t; }
    }
    if (Module.isNDS) return renderNDS(ptr, w, h);
    const len = w * h, is32 = pitch === (w << 2), b = Module.HEAPU8.buffer;
    if (w !== cW || h !== cH || pitch !== cP) {
        cW = w; cH = h; cP = pitch; cB = null;
        Module.canvas.width = w; Module.canvas.height = h;
        gl.viewport(0, 0, w, h); tM = 0;
        pB = new Uint32Array(len); pV = new Uint8Array(pB.buffer);
        if (is32) lM = new Uint32Array(len); else l16 = new Uint32Array(len >> 1);
        if (window.gameView) gameView(gameName);
    }
    if (b !== cB || ptr !== cPr) {
        cB = b; cPr = ptr;
        if (is32) s32 = new Uint32Array(b, ptr, len);
        else { s16 = new Uint16Array(b, ptr, (pitch >> 1) * h); s32 = new Uint32Array(b, ptr, ((pitch >> 1) * h) >> 1); }
    }
    if (is32) r32(s32, 0, lM, pB, pV, gl, texture, w, h, len, 0);
    else r16(s16, s32, l16, pB, pV, gl, texture, w, h, pitch >> 1, 0);
    logSkip();
}
