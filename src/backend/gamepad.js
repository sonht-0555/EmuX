// ===== LibInput =====
function input_poll_cb() { };
// ===== GamePad =====
var padState = new Uint8Array(16), padMask = 0;
var btnMap = { up: 4, down: 5, left: 6, right: 7, 1: 8, 3: 0, 2: 9, 4: 1, l: 10, r: 11, start: 3, select: 2 };
window._pX = 0, window._pY = 0, window._pD = 0;
function buttonPress(btn) { 
  const id = btnMap[btn];
  if (id !== undefined && id !== '') { padState[id] = 1; padMask |= (1 << id); }
  if (audioCtx && audioCtx.state !== 'running') audioCtx.resume(); 
}
function buttonUnpress(btn) { 
  const id = btnMap[btn];
  if (id !== undefined && id !== '') {
    padState[id] = 0; padMask = 0;
    for (let i = 0; i < 16; i++) if (padState[i]) padMask |= (1 << i);
  }
}
function input_state_cb(port, device, index, id) {
  if (port) return 0;
  if (device === 1) return id === 256 ? padMask : padState[id];
  return device === 6 ? [window._pX, window._pY, window._pD][id] : 0;
}
function updateButtons(cfg) {
  if (!cfg) return;
  ['btn-1', 'btn-2', 'btn-3', 'btn-4', 'btn-l', 'btn-r', 'btn-select', 'btn-start'].forEach(tag => {
    const el = document.querySelector(tag); if (!el) return;
    const config = cfg[tag]; el.style.display = config ? 'grid' : 'none';
    if (config) { 
      el.innerText = config[0]; 
      if (config[1] !== undefined) btnMap[tag.replace('btn-', '')] = config[1]; 
    }
  });
  ['sec-12', 'sec-34'].forEach(tag => {
    const sec = document.querySelector(tag);
    if (sec) sec.style.display = Array.from(sec.children).some(el => el.style.display !== 'none') ? 'grid' : 'none';
  });
}