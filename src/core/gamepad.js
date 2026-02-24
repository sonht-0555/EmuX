// ===== LibInput =====
var gamepadMask = 0, touchMask = 0, padMask = 0, keyMask = 0, hasGamepad = false;
var buttonMap = {up: 4, down: 5, left: 6, right: 7, 1: 8, 2: 9, 3: 0, 4: 1, l: 10, r: 11, start: 3, select: 2};
var PHYS = [0, 1, 8, 9, 10, 11, -1, -1, 2, 3, -1, -1, 4, 5, 6, 7];
var KEYS = {ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, w: 4, s: 5, a: 6, d: 7, x: 8, z: 9, c: 0, v: 1, q: 10, e: 11, Enter: 3, Shift: 2};
window._pX = window._pY = window._pD = 0;
window.addEventListener('gamepadconnected', function () {hasGamepad = true;});
window.addEventListener('gamepaddisconnected', function () {hasGamepad = false; padMask = 0;});
// ===== Keyboard =====
window.onkeydown = function (e) {
    var id = KEYS[e.key];
    if (id !== undefined) {keyMask |= (1 << id); e.preventDefault();}
    if (audioContext?.state !== 'running') {audioContext?.resume(); window.resetAudioSync?.();}
};
window.onkeyup = function (e) {
    var id = KEYS[e.key];
    if (id !== undefined) keyMask &= ~(1 << id);
};
// ===== input_poll_cb =====
function input_poll_cb() {
    if (hasGamepad) {
        var pad = navigator.getGamepads()[0], mask = 0;
        if (pad) for (var i = 0; i < 16; i++) if (PHYS[i] !== -1 && pad.buttons[i]?.pressed) mask |= (1 << PHYS[i]);
        padMask = mask;
    }
    gamepadMask = touchMask | padMask | keyMask;
}
// ===== buttonPress =====
function buttonPress(button) {
    var id = buttonMap[button];
    if (id !== undefined) touchMask |= (1 << id);
    if (audioContext?.state !== 'running') {audioContext?.resume(); window.resetAudioSync?.();}
}
// ===== buttonUnpress =====
function buttonUnpress(button) {
    var id = buttonMap[button];
    if (id !== undefined) touchMask &= ~(1 << id);
}
// ===== input_state_cb =====
function input_state_cb(port, device, index, id) {
    if (port) return 0;
    if (device === 1) return id === 256 ? gamepadMask : (gamepadMask >> id) & 1;
    if (device === 6) return id === 0 ? window._pX : id === 1 ? window._pY : id === 2 ? window._pD : 0;
    return 0;
}
// ===== updateButtons =====
function updateButtons(config) {
    if (!config) return;
    ['btn-1', 'btn-2', 'btn-3', 'btn-4', 'btn-l', 'btn-r', 'btn-select', 'btn-start'].forEach(function (tag) {
        var element = document.querySelector(tag), settings = config[tag];
        if (!element) return;
        if (settings) {
            element.innerText = settings[0];
            if (settings[1] !== undefined) buttonMap[tag.replace('btn-', '')] = settings[1];
        } else element.style.display = 'none';
    });
    ['sec-12', 'sec-34'].forEach(function (tag) {
        var element = document.querySelector(tag);
        if (element && Array.from(element.children).every(function (child) {return child.style.display === 'none';})) element.style.display = 'none';
    });
}