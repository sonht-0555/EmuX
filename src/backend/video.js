// ===== video.js (Smart Proxy & Shared Logic) =====
var rendererReady = false, renderFn = null, frameCount = 0, skippedFrames = 0, renderType = '';
var cachedWidth = 0, cachedHeight = 0, cachedPitch = 0, cachedBuffer = null, cachedPointer = 0, ndsPointer = 0;
var lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
  const r = (i & 0xF800) >> 8, g = (i & 0x07E0) >> 3, b = (i & 0x001F) << 3;
  lut565[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
}
function logSkip() {
  if (frameCount > 0 && (frameCount & 63) === 0 && window.skip1) skip1.textContent = `${renderType}.[${(100 - (skippedFrames * 100 / frameCount)) | 0}] `;
  if (frameCount > 1000) { frameCount = 0; skippedFrames = 0; }
}
function setVideoLabel(type) {
    const el = document.querySelector('video0');
    if (el) el.textContent = type === 'web2d.js' ? 'W2D' : (type === 'webgl.js' ? 'WGL' : 'WGPU');
}
function video_cb(pointer, width, height, pitch) {
  if (renderFn) return renderFn(pointer, width, height, pitch);
  if (rendererReady) return; rendererReady = true;
  let scriptName = localStorage.getItem('renderer');
  if (!scriptName) {
    const dpr = window.devicePixelRatio, max = Math.floor((window.innerWidth * dpr) / width);
    const integer = (max > 6) ? max - (max % 2) : max;
    scriptName = ((integer / dpr) % 1 === 0) ? 'web2d.js' : 'webgpu.js';
    localStorage.setItem('renderer', scriptName);
  }
  renderType = scriptName === 'web2d.js' ? 'W2D' : (scriptName === 'webgl.js' ? 'WGL' : 'WGPU');
  setVideoLabel(scriptName);
  const script = document.createElement('script'); script.src = `./src/backend/${scriptName}`;
  script.onload = () => { renderFn = window.activeRenderFn; if (renderFn) renderFn(pointer, width, height, pitch); };
  document.body.appendChild(script);
}
function switchRenderer() {
  const scripts = ['web2d.js', 'webgl.js', 'webgpu.js'];
  let current = localStorage.getItem('renderer') || (renderType === 'W2D' ? 'web2d.js' : (renderType === 'WGL' ? 'webgl.js' : 'webgpu.js'));
  const next = scripts[(scripts.indexOf(current) + 1) % 3];
  localStorage.setItem('renderer', next);
  setVideoLabel(next);
  location.reload();
}
(function initLabel() {
  const saved = localStorage.getItem('renderer');
  if (saved) setVideoLabel(saved);
})();