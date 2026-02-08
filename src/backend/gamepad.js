// ===== LibInput =====
function input_poll_cb() {}
// ===== GamePad State =====
var gamepadState = new Uint8Array(16), gamepadMask = 0;
var buttonMap = { up: 4, down: 5, left: 6, right: 7, 1: 8, 3: 0, 2: 9, 4: 1, l: 10, r: 11, start: 3, select: 2 };
window._pX = window._pY = window._pD = 0;
// ===== buttonPress =====
function buttonPress(btn) {
    const id = buttonMap[btn];
    if (id !== undefined && id !== '') {
        gamepadState[id] = 1;
        gamepadMask |= (1 << id);
    }
    if (audioContext?.state !== 'running') audioContext?.resume();
}
// ===== buttonUnpress =====
function buttonUnpress(btn) {
    const id = buttonMap[btn];
    if (id !== undefined && id !== '') {
        gamepadState[id] = 0;
        gamepadMask &= ~(1 << id);
    }
}
// ===== input_state_cb =====
function input_state_cb(port, device, index, id) {
    if (port) return 0;
    if (device === 1) return id === 256 ? gamepadMask : gamepadState[id];
    if (device === 6) return [window._pX, window._pY, window._pD][id] ?? 0;
    return 0;
}
// ===== updateButtons =====
function updateButtons(cfg) {
    if (!cfg) return;
    ['btn-1', 'btn-2', 'btn-3', 'btn-4', 'btn-l', 'btn-r', 'btn-select', 'btn-start'].forEach(tag => {
        const el = document.querySelector(tag), bCfg = cfg[tag];
        if (!el) return;
        if (bCfg) {
            el.innerText = bCfg[0];
            if (bCfg[1] !== undefined) buttonMap[tag.replace('btn-', '')] = bCfg[1];
        } else el.style.display = 'none';
    });
    ['sec-12', 'sec-34'].forEach(tag => {
        const el = document.querySelector(tag);
        if (el && Array.from(el.children).every(c => c.style.display === 'none')) el.style.display = 'none';
    });
}