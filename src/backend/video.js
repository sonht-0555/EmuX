// ===== video.js (Smart Proxy & Shared Logic) =====
var rendererReady = false, renderFn = null, frameCount = 0, skippedFrames = 0;
var cachedWidth = 0, cachedHeight = 0, cachedPitch = 0, cachedBuffer = null, cachedPointer = 0, ndsPointer = 0;
var lut565 = new Uint32Array(65536);
for (let i = 0; i < 65536; i++) {
  const r = (i & 0xF800) >> 8, g = (i & 0x07E0) >> 3, b = (i & 0x001F) << 3;
  lut565[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
}
function logSkip() {
  if (frameCount > 0 && (frameCount & 63) === 0 && window.skip1) skip1.textContent = `${(skippedFrames * 100 / frameCount) | 0}% `;
  if (frameCount > 1000) { frameCount = 0; skippedFrames = 0; }
}
function video_cb(pointer, width, height, pitch) {
  if (renderFn) return renderFn(pointer, width, height, pitch);
  if (rendererReady) return; rendererReady = true;
  const maxInt = Math.floor((window.innerWidth * window.devicePixelRatio) / width);
  const integer = (maxInt > 6) ? maxInt - (maxInt % 2) : maxInt;
  const scriptName = ((integer / window.devicePixelRatio) % 1 === 0) ? 'web2d.js' : 'webgpu.js';
  console.log(`[EmuX] Res: ${width}x${height}, Scale: ${integer / window.devicePixelRatio}x. Loading ${scriptName}...`);
  const script = document.createElement('script');
  script.src = `./src/backend/${scriptName}`;
  script.onload = () => { renderFn = window.activeRenderFn; if (renderFn) renderFn(pointer, width, height, pitch); };
  document.body.appendChild(script);
}