// ===== video.js (Smart Proxy & Shared Logic) =====
var rendererReady = false;
var renderFunction = null;
var frameCount = 0;
var skippedFrames = 0;
var scriptName = '';
var cachedWidth = 0;
var cachedHeight = 0;
var cachedPitch = 0;
var cachedBuffer = null;
var cachedPointer = 0;
var ndsPointer = 0;
// RGB565 to RGBA8888 lookup table
var lookupTable565 = new Uint32Array(65536);
for (let index = 0; index < 65536; index++) {
    const red = (index & 0xF800) >> 8;
    const green = (index & 0x07E0) >> 3;
    const blue = (index & 0x001F) << 3;
    lookupTable565[index] = 0xFF000000 | (blue << 16) | (green << 8) | red;
}
// ===== logSkip =====
function logSkip() {
    if (frameCount > 0 && (frameCount & 63) === 0 && window.skip1) {
        const renderPercentage = (100 - (skippedFrames * 100 / frameCount)) | 0;
        skip1.textContent = `${scriptName.toUpperCase()}.[${renderPercentage}] `;
    }
    if (frameCount > 1000) {
        frameCount = 0;
        skippedFrames = 0;
    }
}
// ===== video_cb =====
function video_cb(pointer, width, height, pitch) {
    if (renderFunction) {
        return renderFunction(pointer, width, height, pitch);
    }
    if (rendererReady) {
        return;
    }
    rendererReady = true;
    scriptName = local('render') || 'wgpu';
    const script = document.createElement('script');
    script.src = `./src/backend/${scriptName}.js`;
    script.onload = () => {
        renderFunction = window.activeRenderFn;
        if (renderFunction) {
            renderFunction(pointer, width, height, pitch);
        }
    };
    document.body.appendChild(script);
}
// ===== switchRenderer =====
function switchRenderer() {
    const rendererList = ['w2d', 'wgl', 'wgpu'];
    const currentIndex = rendererList.indexOf(local('render'));
    const nextRenderer = rendererList[(currentIndex + 1) % 3];
    local('render', nextRenderer);
    switch0.textContent = nextRenderer;
    window._loadDelay = (window._loadDelay || 0) + 1000;
}