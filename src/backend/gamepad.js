// ===== LibInput =====
function input_poll_cb() { };
// ===== Gamepad =====
const padState = { up: false, down: false, left: false, right: false, 1: false, 2: false, 3: false, 4: false, l: false, r: false, start: false, select: false };
const btnMap = { up: 4, down: 5, left: 6, right: 7, 1: 8, 3: 0, 2: 9, 4: 1, l: 10, r: 11, start: 3, select: 2 };
window._pX = 0, window._pY = 0, window._pD = 0;
function buttonPress(btn) { if (padState.hasOwnProperty(btn)) padState[btn] = true; if (audioCtx && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) { audioCtx.resume() } }
function buttonUnpress(btn) { if (padState.hasOwnProperty(btn)) padState[btn] = false }
function input_state_cb(port, device, index, id) {
  if (port !== 0) return 0;
  if (device === 1) {
    if (id === 256) {
      let mask = 0;
      for (const key in btnMap) {
        if (padState[key]) mask |= (1 << btnMap[key]);
      }
      return mask;
    }
    for (const key in btnMap) {
      if (btnMap[key] === id) return padState[key] ? 1 : 0;
    }
  }
  if (device === 6) { // POINTER
    if (id === 0) return window._pX;
    if (id === 1) return window._pY;
    if (id === 2) return window._pD;
  }
  return 0;
}