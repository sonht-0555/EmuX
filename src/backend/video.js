// ===== video.js (Smart Proxy & Shared Logic) =====
var rendererReady = false, renderFn = null, frameCount = 0, skippedFrames = 0, scriptName = '';
var cachedWidth = 0, cachedHeight = 0, cachedPitch = 0, cachedBuffer = null, cachedPointer = 0, ndsPointer = 0;
var lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
  const r = (i & 0xF800) >> 8, g = (i & 0x07E0) >> 3, b = (i & 0x001F) << 3;
  lut565[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
}
function logSkip() {
  if (frameCount > 0 && (frameCount & 63) === 0 && window.skip1) skip1.textContent = `${scriptName.toUpperCase()}.[${(100 - (skippedFrames * 100 / frameCount)) | 0}] `;
  if (frameCount > 1000) { frameCount = 0; skippedFrames = 0; }
}
function video_cb(pointer, width, height, pitch) {
  if (renderFn) return renderFn(pointer, width, height, pitch);
  if (rendererReady) return; rendererReady = true;
  scriptName = local('render') || 'wgpu';
  const script = document.createElement('script'); 
  script.src = `./src/backend/${scriptName}.js`;
  script.onload = () => { renderFn = window.activeRenderFn; if (renderFn) renderFn(pointer, width, height, pitch); };
  document.body.appendChild(script);
}
function switchRenderer() {
  const list = ['w2d', 'wgl', 'wgpu'];
  const data = list[(list.indexOf(local('render')) + 1) % 3];
  local('render', data);
  switch0.textContent = data;
  window._loadDelay = (window._loadDelay || 0) + 1000;
}