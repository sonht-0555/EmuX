// ===== video.js (Smart Proxy) =====
let rendererReady = false, renderFn = null;
function video_cb(ptr, width, height, pitch) {
  if (renderFn) return renderFn(ptr, width, height, pitch);
  if (rendererReady) return; rendererReady = true;
  const maxInt = Math.floor((window.innerWidth * window.devicePixelRatio) / width);
  integer = (maxInt > 6) ? maxInt - (maxInt % 2) : maxInt;
  const scriptName = ((integer / window.devicePixelRatio) % 1 === 0) ? 'web2d.js' : 'webgl.js';
  console.log(`[EmuX] Res: ${width}x${height}, Scale: ${integer / window.devicePixelRatio}x. Loading ${scriptName}...`);
  const script = document.createElement('script');
  script.src = `./src/backend/${scriptName}`;
  script.onload = () => {
    renderFn = window.activeRenderFn;
    if (renderFn) renderFn(ptr, width, height, pitch);
  };
  document.body.appendChild(script);
}