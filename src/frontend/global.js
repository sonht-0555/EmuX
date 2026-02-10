// ===== Global System =====
const tags = ["html", "body", "page00", "page01", "page02", "notification", "display", "list", "list01", "list02", "name", "ver", "gamepad", "title1", "vertical", "screen", "invis", "message0", "skip1", "switch0", "title0", "logo", "joypad"];
tags.forEach(s => window[s] = document.querySelector(s));
const local = (k, v) => (v === undefined || v === null) ? localStorage.getItem(k) : localStorage.setItem(k, v);
const delay = ms => new Promise(res => setTimeout(res, ms));
let gameName, gameWidth, gameHeight, integer, timerId, count = null, recCount = 1, canvasB, hours = 0, minutes = 0, seconds = 0, count1 = 0, current = parseInt(local('vertical')) || 0;
const canvas = document.getElementById('canvas');
// ===== doubleTap =====
function doubleTap(e, el, dist) {
    const now = Date.now(), dt = now - (el._lt || 0), isT = e.isPrimary && dt < 300 && dt > 40;
    let isD = true;
    if (dist) isD = Math.hypot(e.clientX - el._lx, e.clientY - el._ly) < 30;
    const res = isT && isD;
    el._lt = now; el._lx = e.clientX; el._ly = e.clientY;
    return res;
}
// ===== svgGen =====
function svgGen(rep, size, pat) {
    const total = rep * size, cells = typeof pat === 'number' ? Array.from({length: pat * pat}, (_, i) => i % (pat + 1) ? 0 : 1) : pat.replace(/\s/g, '').split('.');
    const pSize = Math.sqrt(cells.length);
    let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${total}' height='${total}'>`;
    for (let i = 0; i < total * total; i++) {
        const x = i % total, y = (i / total) | 0, cIdx = ((y % size * pSize / size) | 0) * pSize + ((x % size * pSize / size) | 0);
        if (cells[cIdx] == 1) svg += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
    return `url("data:image/svg+xml,${encodeURIComponent(svg + "</svg>")}")`;
}
// ===== notifi =====
async function notifi(g, w, gy, txt, wait) {
    page00.hidden = false;
    title0.setAttribute('green', g);
    title0.setAttribute('gray', gy);
    title0.textContent = w;
    message0.textContent = txt;
    if (wait) {
        window._loadDelay = 400;
        while (window._loadDelay > 0) {await delay(100); window._loadDelay -= 100;}
    }
}
// ===== message =====
async function message(txt, dur = 2000) {
    if (count) count.c = true;
    const t = {c: false};
    count = t;
    title1.textContent = txt;
    await delay(dur);
    if (!t.c && count === t) {title1.textContent = gameName; count = null;}
}
// ===== gameView =====
async function gameView(name) {
    page02.ontouchstart = e => e.preventDefault();
    gameWidth = canvas.width;
    gameHeight = canvas.height;
    title1.textContent = name;
    switch0.textContent = local('render');
    const maxInt = Math.floor((window.innerWidth * window.devicePixelRatio) / gameWidth);
    integer = (maxInt > 6) ? maxInt - (maxInt % 2) : maxInt;
    const r = integer / window.devicePixelRatio, s = screen.style;
    display.style.cssText = `height:${Math.ceil(gameHeight * r) + 10}px;width:${Math.ceil(gameWidth * r)}px`;
    s.width = `${Math.ceil(gameWidth * r)}px`;
    s.setProperty("--size", `${integer}px`);
    s.setProperty("--width", `${gameWidth * integer}px`);
    s.setProperty("--height", `${gameHeight * integer}px`);
    s.setProperty("--scale", r / integer);
    const bt = (window.innerWidth - 36) / 8, sz = Math.round(bt) % 2 === 0 ? Math.round(bt) - 1 : Math.round(bt);
    gamepad.style.gridTemplateColumns = `${sz}px 1px ${sz}px 1px ${sz}px 1px ${sz}px 1px auto 1px ${sz}px 1px ${sz}px 1px ${sz}px 1px ${sz}px`;
    page02.style.gridTemplateRows = `auto ${window.innerWidth - (sz * 8 + 30)}px ${sz * 4 + 36}px ${window.innerWidth - (sz * 8 + 20)}px 1fr 20px`;
    joy.style.width = `${sz * 4 + 3}px`;
    [page00, page01, list01, list02, switch0].forEach(p => p.hidden = true);
    [page02, list].forEach(p => p.hidden = false);
    const pSz = (integer <= 4 || integer % 2 !== 0) ? integer : (integer / 2);
    s.setProperty("--shader", svgGen(integer / pSz, pSz, local(`shader0${local("shader")}`) || pSz));
}
// ===== Event Listeners =====
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible' && window.resetAudioSync) window.resetAudioSync();
});
document.addEventListener("DOMContentLoaded", () => {
    body.removeAttribute('hide');
    canvasB = document.getElementById("canvas-bottom");
    body.style.setProperty("--background", svgGen(1, window.devicePixelRatio, window.devicePixelRatio));
});