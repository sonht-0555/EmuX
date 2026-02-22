// ===== Page02 Logic =====
let brightnessValue = 5, swipeStartY = 0, isSwiping = false;
const activePointers = new Map();
// ===== handleButton =====
const handleButton = (pressed, element) => (element?.getAttribute('data')?.split('-').slice(1) || []).forEach(part => pressed ? buttonPress(part) : buttonUnpress(part));
// ===== setPointerState =====
function setPointerState(pointerId, element) {
    const current = activePointers.get(pointerId);
    if (element === current) return;
    if (current) handleButton(false, current);
    if (element) {activePointers.set(pointerId, element); handleButton(true, element);}
    else activePointers.delete(pointerId);
}
// ===== Event Listeners =====
document.addEventListener("DOMContentLoaded", () => {
    document.onpointerdown = event => setPointerState(event.pointerId, event.target.closest('[data]'));
    let lastMove = 0;
    document.onpointermove = event => {
        const now = performance.now();
        if (now - lastMove < 16) return;
        lastMove = now;
        const current = activePointers.get(event.pointerId);
        if (!current) return;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data]');
        if (target && target !== current && current.getAttribute('data').split('-')[0] === target.getAttribute('data').split('-')[0]) setPointerState(event.pointerId, target);
    };
    let rect;
    canvas.onpointerdown = event => {
        rect = canvas.getBoundingClientRect();
        const touchX = event.clientX - rect.left, touchY = event.clientY - rect.top;
        if (doubleTap(event, canvas, 1)) {
            if (touchX < rect.width / 2) touchY < rect.height / 2 ? loadState(3) : loadState(2);
            else touchY < rect.height / 2 ? saveState(3) : saveState(2);
        }
        swipeStartY = event.clientY;
        isSwiping = event.clientX > (rect.right - 40);
    };
    canvas.onpointermove = event => {
        if (!isSwiping || !rect) return;
        const distance = Math.abs(swipeStartY - event.clientY);
        if (distance >= 20) {
            brightnessValue = Math.max(0, Math.min(10, brightnessValue + (swipeStartY - event.clientY > 0 ? 1 : -1)));
            gamepad.style.opacity = brightnessValue / 10;
            message(`Brightness_${brightnessValue}0.nit`);
            swipeStartY = event.clientY;
        }
    };
    let bottomRect;
    canvasBottom.onpointerdown = canvasBottom.onpointermove = event => {
        if (!Module.isNDS) return;
        if (event.type === "pointerdown" || !bottomRect) bottomRect = canvasBottom.getBoundingClientRect();
        window._pD = 1;
        window._pX = Math.floor((event.clientX - bottomRect.left) / bottomRect.width * 65535 - 32768);
        window._pY = Math.floor((event.clientY - bottomRect.top) / bottomRect.height * 32767);
        event.preventDefault();
    };
    canvasBottom.onpointerup = canvasBottom.onpointercancel = () => {window._pD = 0; isSwiping = false;};
    switch0.onpointerdown = switchRenderer;
    ['pointerup', 'pointercancel'].forEach(type => addEventListener(type, event => {setPointerState(event.pointerId, null); isSwiping = false; joy.style.opacity = "0";}));
    joy.onpointerdown = () => joy.style.opacity = "1";
    invis.onpointermove = () => {page00.hidden = false; showNotification(" pa", "use.", "", " double tap to resume."); pauseGame();};
    page00.onpointerdown = event => {if (doubleTap(event, page00)) {page00.hidden = true; resumeGame();} };
});