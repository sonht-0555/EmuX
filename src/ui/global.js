// ===== Global System =====
const tags = ["html", "body", "page00", "page01", "page02", "notification", "display", "list", "list01", "list02", "name", "ver", "gamepad", "title1", "vertical", "screen", "invis", "message0", "skip1", "switch0", "title0", "logo", "joypad", "setting", "cta"];
tags.forEach(selector => window[selector] = document.querySelector(selector));
const local = (key, value) => (value === undefined || value === null) ? localStorage.getItem(key) : localStorage.setItem(key, value);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let gameName, gameWidth, gameHeight, integer, timerId, count = null, recCount = 1, canvasBottom, hours = 0, minutes = 0, seconds = 0, count1 = 0, current = parseInt(local('vertical')) || 0;
const canvas = document.getElementById('canvas');
// ===== doubleTap =====
function doubleTap(event, element, distance) {
    const now = Date.now(), deltaTime = now - (element._lastTime || 0), isTiming = event.isPrimary && deltaTime < 300 && deltaTime > 40;
    let isDistance = true;
    if (distance) isDistance = Math.hypot(event.clientX - element._lastX, event.clientY - element._lastY) < 30;
    const result = isTiming && isDistance;
    element._lastTime = now; element._lastX = event.clientX; element._lastY = event.clientY;
    return result;
}
// ===== generateSvgPattern =====
function generateSvgPattern(repetitions, size, pattern) {
    const total = repetitions * size, cells = typeof pattern === 'number' ? Array.from({length: pattern * pattern}, (_, index) => index % (pattern + 1) ? 0 : 1) : pattern.replace(/\s/g, '').split('.');
    const patternSize = Math.sqrt(cells.length);
    let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${total}' height='${total}'>`;
    for (let index = 0; index < total * total; index++) {
        const x = index % total, y = (index / total) | 0, cellIndex = ((y % size * patternSize / size) | 0) * patternSize + ((x % size * patternSize / size) | 0);
        if (cells[cellIndex] == 1) svg += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
    return `url("data:image/svg+xml,${encodeURIComponent(svg + "</svg>")}")`;
}
// ===== showNotification =====
async function showNotification(green, white, gray, text, wait) {
    page00.hidden = false;
    title0.setAttribute('green', green);
    title0.setAttribute('gray', gray);
    title0.textContent = white;
    message0.textContent = text;
    if (wait) {
        window._loadDelay = 400;
        while (window._loadDelay > 0) {await delay(100); window._loadDelay -= 100;}
    }
}
// ===== message =====
async function message(text, duration = 2000) {
    if (count) count.cancelled = true;
    const token = {cancelled: false};
    count = token;
    title1.textContent = text;
    await delay(duration);
    if (!token.cancelled && count === token) {title1.textContent = gameName; count = null;}
}
// ===== gameView =====
async function gameView(name) {
    page02.ontouchstart = event => event.preventDefault();
    cta.ontouchstart = event => event.preventDefault();
    gameWidth = canvas.width;
    gameHeight = canvas.height;
    title1.textContent = name;
    switch0.textContent = local('render');
    const maxInteger = Math.floor((window.innerWidth * window.devicePixelRatio) / gameWidth);
    integer = (maxInteger > 6) ? maxInteger - (maxInteger % 2) : maxInteger;
    const ratio = integer / window.devicePixelRatio, style = screen.style;
    display.style.cssText = `height:${Math.ceil(gameHeight * ratio) + 10}px;width:${Math.ceil(gameWidth * ratio)}px`;
    style.width = `${Math.ceil(gameWidth * ratio)}px`;
    style.setProperty("--size", `${integer}px`);
    style.setProperty("--width", `${gameWidth * integer}px`);
    style.setProperty("--height", `${gameHeight * integer}px`);
    style.setProperty("--scale", ratio / integer);
    const buttonWidth = (window.innerWidth - 36) / 8, size = Math.round(buttonWidth) % 2 === 0 ? Math.round(buttonWidth) - 1 : Math.round(buttonWidth);
    gamepad.style.gridTemplateColumns = `${size}px 1px ${size}px 1px ${size}px 1px ${size}px 1px auto 1px ${size}px 1px ${size}px 1px ${size}px 1px ${size}px`;
    page02.style.gridTemplateRows = `auto ${window.innerWidth - (size * 8 + 30)}px ${size * 4 + 36}px ${window.innerWidth - (size * 8 + 20)}px 1fr 20px`;
    joy.style.width = `${size * 4 + 3}px`;
    [page00, page01, list01, list02, switch0].forEach(page => page.hidden = true);
    [page02, list].forEach(page => page.hidden = false);
    const patternSize = (integer <= 4 || integer % 2 !== 0) ? integer : (integer / 2);
    style.setProperty("--shader", generateSvgPattern(integer / patternSize, patternSize, local(`shader0${local("shader")}`) || patternSize));
}
// ===== Event Listeners =====
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible' && window.resetAudioSync) window.resetAudioSync();
});
document.addEventListener("DOMContentLoaded", () => {
    body.removeAttribute('hide');
    canvasBottom = document.getElementById("canvas-bottom");
    body.style.setProperty("--background", generateSvgPattern(1, window.devicePixelRatio, window.devicePixelRatio));
});