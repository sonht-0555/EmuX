// ===== LibInput =====
var gamepadMask = 0, touchMask = 0, padMask = 0, keyMask = 0, hasGamepad = false;
var buttonMap = {up: 4, down: 5, left: 6, right: 7, 1: 8, 2: 9, 3: 0, 4: 1, l: 10, r: 11, start: 3, select: 2};
var PHYS = [0, 1, 8, 9, 10, 11, -1, -1, 2, 3, -1, -1, 4, 5, 6, 7];
var KEYS = {ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, w: 4, s: 5, a: 6, d: 7, x: 8, z: 9, c: 0, v: 1, q: 10, e: 11, Enter: 3, Shift: 2};
window._pX = window._pY = window._pD = 0;
const PICO_M = [16, 32, 64, 64, 4, 8, 1, 2, 16, 32];
window.addEventListener('gamepadconnected', function () {hasGamepad = true;});
window.addEventListener('gamepaddisconnected', function () {hasGamepad = false; padMask = 0;});
// ===== Keyboard =====
window.onkeydown = function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var id = KEYS[e.key];
    if (id !== undefined) {keyMask |= (1 << id); e.preventDefault();}
    if (audioContext?.state !== 'running') {audioContext?.resume();}
};
window.onkeyup = function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var id = KEYS[e.key];
    if (id !== undefined) keyMask &= ~(1 << id);
};
// ===== pollPads =====
const AXIS_DEAD = 0.5;
function pollPads() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [], mask = 0, found = false;
    for (var p = 0; p < pads.length; p++) {
        var pad = pads[p];
        if (!pad || !pad.connected) continue;
        found = true;
        var buttons = pad.buttons, count = Math.min(buttons.length, 16);
        for (var i = 0; i < count; i++) if (PHYS[i] !== -1 && buttons[i]?.pressed) mask |= (1 << PHYS[i]);
        var axes = pad.axes || [];
        if (axes[0] < -AXIS_DEAD) mask |= (1 << 6); if (axes[0] > AXIS_DEAD) mask |= (1 << 7);
        if (axes[1] < -AXIS_DEAD) mask |= (1 << 4); if (axes[1] > AXIS_DEAD) mask |= (1 << 5);
        if (pad.mapping !== 'standard' && axes.length === 10 && axes[9] >= -1.01 && axes[9] <= 1.01) {
            var hat = Math.round((axes[9] + 1) * 3.5);
            if (hat === 0 || hat === 1 || hat === 7) mask |= (1 << 4);
            if (hat >= 3 && hat <= 5) mask |= (1 << 5);
            if (hat >= 5 && hat <= 7) mask |= (1 << 6);
            if (hat >= 1 && hat <= 3) mask |= (1 << 7);
        }
    }
    hasGamepad = found;
    padMask = mask;
}
// ===== input_poll_cb =====
function input_poll_cb() {
    pollPads();
    gamepadMask = touchMask | padMask | keyMask;
}
// ===== buttonPress =====
function buttonPress(button) {
    var id = buttonMap[button];
    if (id !== undefined) touchMask |= (1 << id);
    b = PICO_M[id]; if (window.pico8_buttons && b) pico8_buttons[0] |= b; //pico8
    if (audioContext?.state !== 'running') {audioContext?.resume();}
}
// ===== buttonUnpress =====
function buttonUnpress(button) {
    var id = buttonMap[button];
    if (id !== undefined) touchMask &= ~(1 << id);
    b = PICO_M[id]; if (window.pico8_buttons && b) pico8_buttons[0] &= ~b; //pico8
}
// ===== buttonClick =====
function buttonClick(button) {
    buttonPress(button);
    setTimeout(() => buttonUnpress(button), 100);
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
            element.hidden = false;
        } else {
            element.hidden = true;
        }
    });
    ['sec-12', 'sec-34'].forEach(function (tag) {
        var element = document.querySelector(tag);
        if (element) {
            var allHidden = Array.from(element.children).every(child => child.hidden);
            element.hidden = allHidden;
        }
    });
}