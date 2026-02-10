// ===== LibInput =====
var gamepadState = new Uint8Array(16), gamepadMask = 0;
var buttonMap = {up: 4, down: 5, left: 6, right: 7, 1: 8, 3: 0, 2: 9, 4: 1, l: 10, r: 11, start: 3, select: 2};
window._pX = window._pY = window._pD = 0;
// ===== input_poll_cb =====
function input_poll_cb() { }
// ===== buttonPress =====
function buttonPress(button) {
    const id = buttonMap[button];
    if (id !== undefined && id !== '') {gamepadState[id] = 1; gamepadMask |= (1 << id);}
    if (audioContext?.state !== 'running') {audioContext?.resume(); window.resetAudioSync?.();}
}
// ===== buttonUnpress =====
function buttonUnpress(button) {
    const id = buttonMap[button];
    if (id !== undefined && id !== '') {gamepadState[id] = 0; gamepadMask &= ~(1 << id);}
}
// ===== input_state_cb =====
function input_state_cb(port, device, index, id) {
    if (device === 1) {
        if (window.isNetplaying) {
            const mask = typeof getNetplayInput === 'function' ? getNetplayInput(port) : null;
            if (mask !== null) {return id === 256 ? mask : (mask >> id) & 1;}
        }
        if (port) return 0;
        return id === 256 ? gamepadMask : gamepadState[id];
    }
    if (device === 6) return [window._pX, window._pY, window._pD][id] ?? 0;
    return 0;
}
// ===== updateButtons =====
function updateButtons(config) {
    if (!config) return;
    ['btn-1', 'btn-2', 'btn-3', 'btn-4', 'btn-l', 'btn-r', 'btn-select', 'btn-start'].forEach(tag => {
        const element = document.querySelector(tag), buttonConfig = config[tag];
        if (!element) return;
        if (buttonConfig) {
            element.innerText = buttonConfig[0];
            if (buttonConfig[1] !== undefined) buttonMap[tag.replace('btn-', '')] = buttonConfig[1];
        } else element.style.display = 'none';
    });
    ['sec-12', 'sec-34'].forEach(tag => {
        const element = document.querySelector(tag);
        if (element && Array.from(element.children).every(child => child.style.display === 'none')) element.style.display = 'none';
    });
}