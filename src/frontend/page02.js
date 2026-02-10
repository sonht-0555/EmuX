// ===== Page02 State Variables =====
let brightnessValue = 5, swipeStartY = 0, isSwiping = false, shaderNumber = 1, activeElement = null;
const activePointers = new Map();
// ===== handleButton =====
const handleButton = (p, el) => (el?.getAttribute('data')?.split('-').slice(1) || []).forEach(part => p ? buttonPress(part) : buttonUnpress(part));
// ===== setPointerState =====
function setPointerState(pId, el) {
    const cur = activePointers.get(pId);
    if (el === cur) return;
    if (cur) handleButton(false, cur);
    if (el) { activePointers.set(pId, el); handleButton(true, el); }
    else activePointers.delete(pId);
}
// ===== DOMContentLoaded =====
document.addEventListener("DOMContentLoaded", () => {
    document.onpointerdown = e => setPointerState(e.pointerId, e.target.closest('[data]'));
    let lastMove = 0;
    document.onpointermove = e => {
        const now = performance.now();
        if (now - lastMove < 16) return;
        lastMove = now;
        const cur = activePointers.get(e.pointerId);
        if (!cur) return;
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data]');
        if (target && target !== cur && cur.getAttribute('data').split('-')[0] === target.getAttribute('data').split('-')[0]) setPointerState(e.pointerId, target);
    };
    let rect;
    canvas.onpointerdown = e => {
        rect = canvas.getBoundingClientRect();
        const tx = e.clientX - rect.left, ty = e.clientY - rect.top;
        if (doubleTap(e, canvas, 1)) {
            if (tx < rect.width / 2) ty < rect.height / 2 ? loadState(3) : loadState(2);
            else ty < rect.height / 2 ? saveState(3) : saveState(2);
        }
        swipeStartY = e.clientY;
        isSwiping = e.clientX > (rect.right - 40);
    };
    canvas.onpointermove = e => {
        if (!isSwiping || !rect) return;
        const dist = Math.abs(swipeStartY - e.clientY);
        if (dist >= 20) {
            brightnessValue = Math.max(0, Math.min(10, brightnessValue + (swipeStartY - e.clientY > 0 ? 1 : -1)));
            gamepad.style.opacity = brightnessValue / 10;
            message(`Brightness_${brightnessValue}0.nit`);
            swipeStartY = e.clientY;
        }
    };
    let bRect;
    canvasB.onpointerdown = canvasB.onpointermove = e => {
        if (e.type === "pointerdown" || !bRect) bRect = canvasB.getBoundingClientRect();
        const tx = Math.floor((e.clientX - bRect.left) / bRect.width * 65535 - 32768);
        const ty = Math.floor((e.clientY - bRect.top) / bRect.height * 32767);
        if (window.updateTouch) window.updateTouch(tx, ty, 1);
        e.preventDefault();
    };
    canvasB.onpointerup = canvasB.onpointercancel = () => { if (window.updateTouch) window.updateTouch(0, 0, 0); isSwiping = false; };
    switch0.onpointerdown = switchRenderer;
    ['pointerup', 'pointercancel'].forEach(t => addEventListener(t, e => { setPointerState(e.pointerId, null); isSwiping = false; joy.style.opacity = "0"; }));
    joy.onpointerdown = () => joy.style.opacity = "1";
    invis.onpointermove = () => { page00.hidden = false; notifi(" pa", "use.", "", " double tap to resume."); pauseGame(); };
    page00.onpointerdown = e => { if (doubleTap(e, page00)) { page00.hidden = true; resumeGame(); } };
});