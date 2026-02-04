tag("html"), tag("body"), tag("page00"), tag("page01"), tag("page02"), tag("logo"), tag("page02"), tag("notification"), tag("display"), tag("list"), tag("list01"), tag("list02"), tag("name"), tag("ver"), tag("gamepad"), tag("title1"), tag("vertical"), tag("screen"), tag("invis"), tag("joypad"), tag("green0"), tag("white0"), tag("gray0"), tag("message0"), tag("skip1"), tag("switch0");
let gameName, gameType, gameWidth, gameHeight, integer, timerId, count = null, canSync = true, recCount = 1, isReload = false, swipe, canvasB, isStart = false;
let [hours, minutes, seconds, count1] = [0, 0, 0, 0, 0], current = parseInt(local('vertical')) || 0;
const canvas = document.getElementById('canvas');
function tag(selector) { return window[selector] = document.querySelector(selector) }
function local(key, value) { return arguments.length < 2 || value === null ? localStorage.getItem(key) : localStorage.setItem(key, value) }
function doubleTap(event, element, checkDistance) {
  const isDouble = event.isPrimary && Date.now() - (element._lastTapTime || 0) < 300 && Date.now() - (element._lastTapTime || 0) > 40 && (!checkDistance || Math.hypot(event.clientX - element._lastTapX, event.clientY - element._lastTapY) < 30);
  element._lastTapTime = Date.now();
  element._lastTapX = event.clientX;
  element._lastTapY = event.clientY;
  return isDouble;
}
function svgGen(repeat, size, pattern) {
    const N = repeat * size, cells = typeof pattern == 'number' ? Array.from({length: pattern * pattern}, (_, i) => i % (pattern + 1) ? 0 : 1) : pattern.replace(/\s/g,'').split('.'), ps = Math.sqrt(cells.length);
    let res = `<svg xmlns='http://www.w3.org/2000/svg' width='${N}' height='${N}'>`;
    for (let i = 0; i < N * N; i++) if (cells[(i / N % size * ps / size | 0) * ps + (i % N % size * ps / size | 0)] == 1) res += `<rect x="${i % N}" y="${i / N | 0}" width="1" height="1"/>`;
    return `url("data:image/svg+xml,${encodeURIComponent(res + "</svg>")}")`;
}
async function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
async function notifi(green, white, gray, message, shouldWait) {
    [page00.hidden, green0.textContent, white0.textContent, gray0.textContent, message0.textContent] = [false, green, white, gray, message];
    if (shouldWait) { window._loadDelay = 1000; while (window._loadDelay > 0) { await delay(100); window._loadDelay -= 100; } }
}
async function message(mess, second = 2000) {
    if (count) count.cancelled = true;
    const task = { cancelled: false };
    [count, title1.textContent] = [task, mess];
    await delay(second);
    if (!task.cancelled && count === task) [title1.textContent, count] = [gameName, null];
}
async function gameView(romName) {
    page02.ontouchstart = (e) => e.preventDefault();
    [gameWidth, gameHeight, title1.textContent, switch0.textContent] = [canvas.width, canvas.height, romName, local('render')];
    const maxInt = Math.floor((window.innerWidth * window.devicePixelRatio) / gameWidth);
    integer = (maxInt > 6) ? maxInt - (maxInt % 2) : maxInt;
    const ratio = integer / window.devicePixelRatio;
    display.style.height = `${Math.ceil(gameHeight * ratio) + 10}px`;
    display.style.width = screen.style.width = `${Math.ceil(gameWidth * ratio)}px`;
    screen.style.setProperty("--size", `${integer}px`);
    screen.style.setProperty("--width", `${gameWidth * integer}px`);
    screen.style.setProperty("--height", `${gameHeight * integer}px`);
    screen.style.setProperty("--scale", ratio / integer);
    const base = Math.round((window.innerWidth - 36) / 8), adjust = base % 2 === 0 ? base - 1 : base;
    gamepad.style.gridTemplateColumns = `${adjust}px 1px ${adjust}px 1px ${adjust}px 1px ${adjust}px 1px auto 1px ${adjust}px 1px ${adjust}px 1px ${adjust}px 1px ${adjust}px`;
    page02.style.gridTemplateRows = `auto ${window.innerWidth - (adjust * 8 + 30)}px ${adjust * 4 + 38}px ${window.innerWidth - (adjust * 8 + 20)}px 1fr 20px`;
    joy.style.width = `${adjust * 4 + 3}px`;
    page00.hidden = page01.hidden = list01.hidden = list02.hidden = true;
    page02.hidden = list.hidden = false;
    const ps = (integer <= 4 || integer % 2 !== 0) ? integer : (integer / 2);
    screen.style.setProperty("--shader", svgGen(integer / ps, ps, local(`shader0${local("shader")}`) || ps));
}
document.addEventListener("DOMContentLoaded", function(){
    body.removeAttribute('hide');
    canvasB = document.getElementById("canvas-bottom");
    body.style.setProperty("--background", svgGen(1, window.devicePixelRatio, window.devicePixelRatio));
    // console.log(svgGen(3, 3, "0.1.0.1.1.1.0.1.0"));
});