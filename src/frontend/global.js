// ===== Global Element References =====
tag("html");
tag("body");
tag("page00");
tag("page01");
tag("page02");
tag("logo");
tag("page02");
tag("notification");
tag("display");
tag("list");
tag("list01");
tag("list02");
tag("name");
tag("ver");
tag("gamepad");
tag("title1");
tag("vertical");
tag("screen");
tag("invis");
tag("joypad");
tag("green0");
tag("white0");
tag("gray0");
tag("message0");
tag("skip1");
tag("switch0");
// ===== Global Variables =====
let gameName;
let gameType;
let gameWidth;
let gameHeight;
let integer;
let timerId;
let count = null;
let canSync = true;
let recCount = 1;
let swipe;
let canvasB;
let isStart = false;
let hours = 0;
let minutes = 0;
let seconds = 0;
let count1 = 0;
let current = parseInt(local('vertical')) || 0;
const canvas = document.getElementById('canvas');
// ===== tag =====
function tag(selector) {
    window[selector] = document.querySelector(selector);
    return window[selector];
}
// ===== local =====
function local(key, value) {
    if (arguments.length < 2 || value === null) {
        return localStorage.getItem(key);
    }
    return localStorage.setItem(key, value);
}
// ===== doubleTap =====
function doubleTap(event, element, checkDistance) {
    const currentTime = Date.now();
    const lastTapTime = element._lastTapTime || 0;
    const timeDifference = currentTime - lastTapTime;
    const isValidTiming = event.isPrimary && timeDifference < 300 && timeDifference > 40;
    let isValidDistance = true;
    if (checkDistance) {
        const distanceX = event.clientX - element._lastTapX;
        const distanceY = event.clientY - element._lastTapY;
        const distance = Math.hypot(distanceX, distanceY);
        isValidDistance = distance < 30;
    }
    const isDouble = isValidTiming && isValidDistance;
    element._lastTapTime = currentTime;
    element._lastTapX = event.clientX;
    element._lastTapY = event.clientY;
    return isDouble;
}
// ===== svgGen =====
function svgGen(repeat, size, pattern) {
    const totalSize = repeat * size;
    let cells;
    if (typeof pattern === 'number') {
        cells = Array.from({ length: pattern * pattern }, (_, index) => {
            return index % (pattern + 1) ? 0 : 1;
        });
    } else {
        cells = pattern.replace(/\s/g, '').split('.');
    }
    const patternSize = Math.sqrt(cells.length);
    let svgContent = `<svg xmlns='http://www.w3.org/2000/svg' width='${totalSize}' height='${totalSize}'>`;
    for (let pixelIndex = 0; pixelIndex < totalSize * totalSize; pixelIndex++) {
        const rowInPattern = (pixelIndex / totalSize % size * patternSize / size) | 0;
        const columnInPattern = (pixelIndex % totalSize % size * patternSize / size) | 0;
        const cellIndex = rowInPattern * patternSize + columnInPattern;
        if (cells[cellIndex] == 1) {
            const pixelX = pixelIndex % totalSize;
            const pixelY = (pixelIndex / totalSize) | 0;
            svgContent += `<rect x="${pixelX}" y="${pixelY}" width="1" height="1"/>`;
        }
    }
    return `url("data:image/svg+xml,${encodeURIComponent(svgContent + "</svg>")}")`;
}
// ===== delay =====
async function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
// ===== notifi =====
async function notifi(green, white, gray, messageText, shouldWait) {
    page00.hidden = false;
    green0.textContent = green;
    white0.textContent = white;
    gray0.textContent = gray;
    message0.textContent = messageText;
    if (shouldWait) {
        window._loadDelay = 400;
        while (window._loadDelay > 0) {
            await delay(100);
            window._loadDelay -= 100;
        }
    }
}
// ===== message =====
async function message(messageText, duration = 2000) {
    if (count) {
        count.cancelled = true;
    }
    const task = { cancelled: false };
    count = task;
    title1.textContent = messageText;
    await delay(duration);
    if (!task.cancelled && count === task) {
        title1.textContent = gameName;
        count = null;
    }
}
// ===== gameView =====
async function gameView(romName) {
    page02.ontouchstart = (event) => event.preventDefault();
    gameWidth = canvas.width;
    gameHeight = canvas.height;
    title1.textContent = romName;
    switch0.textContent = local('render');
    const maxInteger = Math.floor((window.innerWidth * window.devicePixelRatio) / gameWidth);
    integer = (maxInteger > 6) ? maxInteger - (maxInteger % 2) : maxInteger;
    const ratio = integer / window.devicePixelRatio;
    display.style.height = `${Math.ceil(gameHeight * ratio) + 10}px`;
    display.style.width = `${Math.ceil(gameWidth * ratio)}px`;
    screen.style.width = `${Math.ceil(gameWidth * ratio)}px`;
    screen.style.setProperty("--size", `${integer}px`);
    screen.style.setProperty("--width", `${gameWidth * integer}px`);
    screen.style.setProperty("--height", `${gameHeight * integer}px`);
    screen.style.setProperty("--scale", ratio / integer);
    const baseButtonSize = Math.round((window.innerWidth - 36) / 8);
    const adjustedButtonSize = baseButtonSize % 2 === 0 ? baseButtonSize - 1 : baseButtonSize;
    gamepad.style.gridTemplateColumns = `${adjustedButtonSize}px 1px ${adjustedButtonSize}px 1px ${adjustedButtonSize}px 1px ${adjustedButtonSize}px 1px auto 1px ${adjustedButtonSize}px 1px ${adjustedButtonSize}px 1px ${adjustedButtonSize}px 1px ${adjustedButtonSize}px`;
    page02.style.gridTemplateRows = `auto ${window.innerWidth - (adjustedButtonSize * 8 + 30)}px ${adjustedButtonSize * 4 + 38}px ${window.innerWidth - (adjustedButtonSize * 8 + 20)}px 1fr 20px`;
    joy.style.width = `${adjustedButtonSize * 4 + 3}px`;
    page00.hidden = true;
    page01.hidden = true;
    list01.hidden = true;
    list02.hidden = true;
    switch0.hidden = true;
    page02.hidden = false;
    list.hidden = false;
    const patternSize = (integer <= 4 || integer % 2 !== 0) ? integer : (integer / 2);
    const shaderData = local(`shader0${local("shader")}`) || patternSize;
    screen.style.setProperty("--shader", svgGen(integer / patternSize, patternSize, shaderData));
}
// ===== DOMContentLoaded =====
document.addEventListener("DOMContentLoaded", function() {
    body.removeAttribute('hide');
    canvasB = document.getElementById("canvas-bottom");
    body.style.setProperty("--background", svgGen(1, window.devicePixelRatio, window.devicePixelRatio));
});