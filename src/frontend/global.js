tag("html"), tag("body"), tag("page00"), tag("page01"), tag("page02"), tag("logo"), tag("page02"), tag("notification"), tag("display"), tag("list"), tag("list01"), tag("list02"), tag("name"), tag("ver"), tag("gamepad"), tag("title1"), tag("vertical"), tag("screen"), tag("invis"), tag("joypad"), tag("green0"), tag("white0"), tag("gray0"), tag("message0"), tag("skip1");
let gameName, gameType, gameWidth, gameHeight, integer, timerId, count = null, canSync = true, recCount = 1, isReload = false, swipe, canvasB, isStart = false;
const canvas = document.getElementById('canvas');
let [hours, minutes, seconds, count1] = [0, 0, 0, 0, 0];
let current = parseInt(local('vertical')) || 0;
// tag
function tag(selector) {
    const element = document.querySelector(selector)
    window[selector] = element;
    return element;
}
// local
function local(key, value) {
    return arguments.length < 2 || value === null
        ? localStorage.getItem(key)
        : localStorage.setItem(key, value);
}
// delay
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// svgGen: Tạo shader pattern dạng SVG
function svgGen(repeat, size, pattern) {
    const N = repeat * size;
    let rects = "";
    
    // Nếu pattern là số, tự động tạo Backslash diagonal
    let cells, ps;
    if (typeof pattern === 'number') {
        cells = [];
        for (let y = 0; y < pattern; y++) {
            for (let x = 0; x < pattern; x++) {
                cells.push((Math.abs(x - y) % pattern === 0) ? "1" : "0");
            }
        }
        ps = pattern;
    } else {
        cells = pattern.split('.');
        ps = Math.sqrt(cells.length);
    }
    
    // Vẽ đầy đủ N×N pixel, ánh xạ về pattern
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const r = Math.floor((i % size) * ps / size);
            const col = Math.floor((j % size) * ps / size);
            if (cells[r * ps + col] === '1') {
                rects += `<rect x="${j}" y="${i}" width="1" height="1"/>`;
            }
        }
    }
    
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${N}' height='${N}'>${rects}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// message
async function message(mess, second = 2000) {
    if (count) count.cancelled = true;
    const task = { cancelled: false };
    count = task;
    title1.textContent = mess;
    await delay(second);
    if (!task.cancelled && count === task) {
        title1.textContent = gameName;
        count = null;
    }
}
// notifi
async function notifi(green, white, gray, message) {
    page00.hidden = false;
    green0.textContent = green;
    white0.textContent = white;
    gray0.textContent = gray;
    message0.textContent = message;
}
// gameView
async function gameView(romName) {
    // global
    page02.ontouchstart = (e) => { e.preventDefault(); }
    // display
    [gameWidth, gameHeight] = [canvas.width, canvas.height];
    title1.textContent = romName;
    integer = Math.min(6, Math.floor((window.innerWidth * window.devicePixelRatio) / gameWidth));
    display.style.height = `${Math.ceil(gameHeight * (integer/window.devicePixelRatio)) + 10}px`;
    display.style.width  = `${Math.ceil(gameWidth  * (integer/window.devicePixelRatio))}px`;
    screen.style.width   = `${gameWidth  * (integer/window.devicePixelRatio)}px`;
    screen.style.setProperty("--size", `${integer/window.devicePixelRatio}px`);

    // notification
    title1.textContent = romName;
    // gamepad
    const base = Math.round((window.innerWidth - 12 - 8 - 16) / 8);
    const adjust = base % 2 === 0 ? base - 1 : base;
    gamepad.style.gridTemplateColumns = `${adjust}px 1px ${adjust}px 1px ${adjust}px 1px ${adjust}px 1px auto 1px ${adjust}px 1px ${adjust}px 1px ${adjust}px 1px ${adjust}px`;
    page02.style.gridTemplateRows  =  `auto ${window.innerWidth - (adjust * 8 + 8) - 22}px ${(adjust * 4) + 4 + 8 + 26}px ${window.innerWidth - (adjust * 8 + 8) - 12}px 1fr 20px`;
    joy.style.width = `${(adjust * 4 + 3)}px`;
    // action
    page00.hidden = true;
    page01.hidden = true;
    page02.hidden = false;
    list.hidden   = false; 
    list01.hidden = true; 
    list02.hidden = true;
    
    // Logic Shader: 3-4 lẻ dùng 1 dòng, 6 chẵn dùng 2 dòng
    const ps = (integer <= 4 || integer % 2 !== 0) ? integer : (integer / 2);
    const pattern = local(`shader0${local("shader")}`) || ps;
    
    // repeat = integer / ps để Render Size luôn bằng Integer vật lý
    const repeat = integer / ps;
    screen.style.setProperty("--shader", svgGen(repeat, ps, pattern));
}
// DOMContentLoaded
document.addEventListener("DOMContentLoaded", function(){
    body.removeAttribute('hide')
    canvasB = document.getElementById("canvas-bottom");
    body.style.setProperty("--background", svgGen(1, window.devicePixelRatio, window.devicePixelRatio));
});