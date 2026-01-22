// ===== LibInput =====
function input_poll_cb() { };
// ===== Gamepad =====
const padState = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, l: false, r: false, start: false, select: false };
const btnMap = { up: 4, down: 5, left: 6, right: 7, a: 8, b: 0, x: 9, y: 1, l: 10, r: 11, start: 3, select: 2 };
function buttonPress(btn) { if (padState.hasOwnProperty(btn)) padState[btn] = true; if (audioCtx && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) { audioCtx.resume() } }
function buttonUnpress(btn) { if (padState.hasOwnProperty(btn)) padState[btn] = false }
function input_state_cb(port, device, index, id) {
  if (port !== 0 || device !== 1) return 0;
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
  return 0;
}