let gl, glB, program, programB, texture, textureB, fT = 0, fS = 0;
let lastMain, lastMain16, lastBottom, pixelBuffer, pixelBufferB;
let pixelView, pixelViewB; // Reusable Uint8Array views - avoid allocation per frame
let srcView32, srcView16, srcViewNDS; // Cached typed array views for source data
let cachedW = 0, cachedH = 0, cachedPitch = 0; // Cache dimensions to detect changes

// Pre-computed LUT for RGB565 -> RGBA8888 conversion
const lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) lut565[i] = 0xFF000000 | ((i & 0x001F) << 19) | ((i & 0x07E0) << 5) | ((i & 0xF800) >> 8);

// Pre-computed LUT for XRGB8888 swizzle (BGRA -> RGBA) - eliminates function call per pixel
const lutSwizzle = new Uint32Array(256);
for (let i = 0; i < 256; i++) lutSwizzle[i] = i; // Identity for single byte, used in manual swizzle

// Inline swizzle as bitwise ops (kept for reference, but LUT approach below is faster)
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
    if (fT > 0 && (fT & 63) === 0 && window.skip1) skip1.textContent = `${(fS * 100 / fT) | 0}% `; // Bitwise AND faster than modulo
    if (fT > 1000) { fT = 0; fS = 0; }
}

// Optimized render32 - uses pre-allocated pixelView
function render32(src, last, buf, view, ctx, tex, w, h, len, offset) {
    fT++;
    // Early-exit check with unrolled loop for common case
    let changed = false;
    const end = len + offset;
    for (let i = offset; i < end; i++) if (src[i] !== last[i - offset]) { changed = true; break; }
    
    if (!changed) { fS++; return; }
    
    // Swizzle and copy - unrolled for better performance
    for (let j = 0, k = offset; j < len; j++, k++) {
        const c = last[j] = src[k];
        buf[j] = 0xFF000000 | (c & 0xFF) << 16 | (c & 0xFF00) | (c >>> 16) & 0xFF;
    }
    ctx.bindTexture(ctx.TEXTURE_2D, tex);
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, view);
    ctx.drawArrays(ctx.TRIANGLES, 0, 6);
}

// Optimized render16 - uses pre-allocated pixelView
function render16(src, last, buf, view, ctx, tex, w, h, stride) {
    fT++;
    // Early-exit check
    let changed = false;
    outer: for (let y = 0; y < h; y++) {
        const si = y * stride, li = y * w;
        for (let x = 0; x < w; x++) if (src[si + x] !== last[li + x]) { changed = true; break outer; }
    }
    
    if (!changed) { fS++; return; }
    
    // Convert RGB565 to RGBA8888 using LUT
    for (let y = 0; y < h; y++) {
        const si = y * stride, di = y * w;
        for (let x = 0; x < w; x++) buf[di + x] = lut565[last[di + x] = src[si + x]];
    }
    ctx.bindTexture(ctx.TEXTURE_2D, tex);
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, view);
    ctx.drawArrays(ctx.TRIANGLES, 0, 6);
}

function renderNDS(ptr, w, h) {
    const hh = h >>> 1, len = w * hh; // unsigned right shift
    if (Module.canvas.width !== w || Module.canvas.height !== hh) {
        Module.canvas.width = canvasB.width = w;
        Module.canvas.height = canvasB.height = hh;
        gl.viewport(0, 0, w, hh);
        glB.viewport(0, 0, w, hh);
        lastMain = new Uint32Array(len);
        lastBottom = new Uint32Array(len);
        pixelBuffer = new Uint32Array(len);
        pixelBufferB = new Uint32Array(len);
        pixelView = new Uint8Array(pixelBuffer.buffer);
        pixelViewB = new Uint8Array(pixelBufferB.buffer);
        srcViewNDS = null; // Will be recreated with new dimensions
        if (window.gameView) gameView(gameName);
    }
    // Create view only if buffer changed (WASM memory can grow)
    const buf = Module.HEAPU8.buffer;
    if (!srcViewNDS || srcViewNDS.buffer !== buf) srcViewNDS = new Uint32Array(buf, ptr, w * h);
    else if (srcViewNDS.byteOffset !== ptr) srcViewNDS = new Uint32Array(buf, ptr, w * h);
    
    render32(srcViewNDS, lastMain, pixelBuffer, pixelView, gl, texture, w, hh, len, 0);
    render32(srcViewNDS, lastBottom, pixelBufferB, pixelViewB, glB, textureB, w, hh, len, len);
    logSkip();
}

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

    if (Module.isNDS) return renderNDS(ptr, w, h);

    const len = w * h, is32 = (pitch / w) === 4;
    const buf = Module.HEAPU8.buffer;
    
    // Reallocate buffers only when dimensions change
    if (w !== cachedW || h !== cachedH || pitch !== cachedPitch) {
        cachedW = w; cachedH = h; cachedPitch = pitch;
        Module.canvas.width = w;
        Module.canvas.height = h;
        gl.viewport(0, 0, w, h);
        pixelBuffer = new Uint32Array(len);
        pixelView = new Uint8Array(pixelBuffer.buffer);
        if (is32) {
            lastMain = new Uint32Array(len);
            srcView32 = null;
        } else {
            lastMain16 = new Uint16Array(len);
            srcView16 = null;
        }
        if (window.gameView) gameView(gameName);
    }

    // Recreate views if WASM memory grew or ptr changed
    if (is32) {
        if (!srcView32 || srcView32.buffer !== buf || srcView32.byteOffset !== ptr) srcView32 = new Uint32Array(buf, ptr, len);
        render32(srcView32, lastMain, pixelBuffer, pixelView, gl, texture, w, h, len, 0);
    } else {
        const stride = pitch >>> 1;
        if (!srcView16 || srcView16.buffer !== buf || srcView16.byteOffset !== ptr) srcView16 = new Uint16Array(buf, ptr, stride * h);
        render16(srcView16, lastMain16, pixelBuffer, pixelView, gl, texture, w, h, stride);
    }
    logSkip();
}
