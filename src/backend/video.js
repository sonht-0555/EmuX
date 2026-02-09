// ===== video.js (Smart Proxy & Shared Logic) =====
var rendererReady = false, renderFunction = null, frameCount = 0, skippedFrames = 0, scriptName = '';
var cachedWidth = 0, cachedHeight = 0, cachedPitch = 0, cachedBuffer = null, cachedPointer = 0, ndsPointer = 0;
// RGB565 to RGBA8888 lookup table
var lookupTable565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
    lookupTable565[i] = 0xFF000000 | (((i & 0x001F) << 3) << 16) | (((i & 0x07E0) >> 3) << 8) | ((i & 0xF800) >> 8);
}
// ===== logSkip =====
function logSkip() {
    if (window._runCount >= 60 && window.skip1) {
        const renderPct = (frameCount > 0) ? ((frameCount - skippedFrames) * 100 / frameCount) | 0 : 0;
        window.skip1.textContent = `${scriptName.toUpperCase()}.[${renderPct}] `;
        if (window.Perf) {
            window.Perf.video.frames = frameCount;
            window.Perf.video.skipped = skippedFrames;
            window.Perf.report(scriptName, window._runCount);
        }
        window._runCount = 0;
        frameCount = skippedFrames = 0;
    }
    if (frameCount > 1000) frameCount = skippedFrames = 0;
}
// ===== video_cb =====
function video_cb(pointer, width, height, pitch) {
    if (renderFunction) {
        if (window.Perf) window.Perf.beginGpu();
        const res = renderFunction(pointer, width, height, pitch);
        if (window.Perf) window.Perf.endGpu();
        return res;
    }
    if (rendererReady) return;
    rendererReady = true;
    scriptName = local('render') || 'wgpu';
    const script = document.createElement('script');
    script.src = `./src/backend/${scriptName}.js`;
    script.onload = () => { renderFunction = window.activeRenderFn; renderFunction?.(pointer, width, height, pitch); };
    document.body.appendChild(script);
}
// ===== switchRenderer =====
function switchRenderer() {
    const list = ['w2d', 'wgl', 'wgpu'], next = list[(list.indexOf(local('render')) + 1) % 3];
    local('render', next);
    switch0.textContent = next;
    window._loadDelay = (window._loadDelay || 0) + 1000;
}