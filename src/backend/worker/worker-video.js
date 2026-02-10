// ===== Worker Video Module =====
var rendererReady = false, renderFunction = null, frameCount = 0, skippedFrames = 0, scriptName = '';
var cachedWidth = 0, cachedHeight = 0, cachedPitch = 0, cachedBuffer = null, cachedPointer = 0, ndsPointer = 0;
var canvasB = null, pixelFormat = 0;

var lookupTable565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
    lookupTable565[i] = 0xFF000000 | (((i & 0x001F) << 3) << 16) | (((i & 0x07E0) >> 3) << 8) | ((i & 0xF800) >> 8);
}

var _runCount = 0;
function logSkip() {
    _runCount++;
    if (_runCount >= 60) {
        const renderPct = (frameCount > 0) ? ((frameCount - skippedFrames) * 100 / frameCount) | 0 : 0;
        self.postMessage({ type: 'PERF', data: { label: scriptName.toUpperCase(), pct: renderPct } });
        _runCount = 0; frameCount = skippedFrames = 0;
    }
    if (frameCount > 1000) frameCount = skippedFrames = 0;
}

function video_cb(pointer, width, height, pitch) {
    if (renderFunction) return renderFunction(pointer, width, height, pitch);
    if (rendererReady) return;
    rendererReady = true;
    scriptName = self.rendererName || 'wgl';
    try {
        // Renderers are now in the render/ directory
        importScripts('../render/' + scriptName + '.js');
        renderFunction = self.activeRenderFn;
        if (renderFunction) renderFunction(pointer, width, height, pitch);
    } catch (e) { console.error('Renderer load error:', e); }
}
