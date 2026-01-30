let value = 5, startY = 0, swiping = false, lastTap = 0, number = 1, active = null, tap = 0;
const activePointers = new Map();
function handleButton(press, element) {
    const parts = element?.getAttribute('data')?.split('-').slice(1) || [];
    parts.forEach(part => press ? buttonPress(part) : buttonUnpress(part));
}
function setState(pointerId, element) {
    const current = activePointers.get(pointerId);
    if (element === current) return;
    
    current && handleButton(false, current);
    
    if (element) {
        activePointers.set(pointerId, element);
        handleButton(true, element);
    } else {
        activePointers.delete(pointerId);
    }
}
document.addEventListener("DOMContentLoaded", function() {
    document.onpointerdown = e => {
        setState(e.pointerId, e.target.closest('[data]'));
    };
    document.onpointermove = e => {
        const active = activePointers.get(e.pointerId);
        if (!active) return;
        const element = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data]');
        if (element && element !== active &&
            active.getAttribute('data').split('-')[0] === element.getAttribute('data').split('-')[0]) {
            setState(e.pointerId, element);
        }
    };
    canvas.onpointerdown = e => {
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (Date.now() - lastTap < 300) {
            x < r.width / 2 ? (y < r.height / 2 ? loadState(3) : loadState(2)) : (y < r.height / 2 ? saveState(3) : saveState(2));
        }
        lastTap = Date.now(), startY = e.clientY, swiping = e.clientX > (r.right - 40);
    };
    canvas.onpointermove = e => {
        if (!swiping) return;
        if (Math.abs(startY - e.clientY) >= 20) {
            value = startY - e.clientY > 0 ? Math.min(10, value + 1) : Math.max(0, value - 1);
            gamepad.style.opacity = value / 10;
            message(`Brightness_${value}0.nit`);
            startY = e.clientY;
        }
    };
    canvasB.onpointerdown = canvasB.onpointermove = e => {
        if (!Module.isNDS) return;
        const r = canvasB.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        window._pD = (e.type !== 'pointerup' && e.type !== 'pointercancel') ? 1 : 0;
        window._pX = Math.floor(x / r.width * 65535 - 32768);
        window._pY = Math.floor(y / r.height * 32767);
        e.preventDefault();
    };
    canvasB.onpointerup = canvasB.onpointercancel = () => { window._pD = 0; swiping = false; };
    state.onpointerdown = () => {
        tap++;
        setTimeout(() => {
            if (tap === 2) {
                isRunning = false;
                setTimeout(() => { 
                    const input = prompt("Format [shaderxx-data]");
                    input && local(...((() => { const [name, ...dataParts] = input.split('-'); return [name, dataParts.join('-')]; })()));
                    isRunning = true;
                }, 150);
            } else if (tap === 1) {
                number = number % 5 + 1;
                local("shader", number);
                const shader = local(`shader0${number}`) || "0.0.0.1.0.0.1.0.0.1.0.0.1.0.0.0";
                screen.style.setProperty("--shader", svgGen(window.devicePixelRatio, integer, shader)); 
                message(`[0${number}] Matrix!`);
            }
            tap = 0;
        }, 300);
    };
    ['pointerup', 'pointercancel'].forEach(type => addEventListener(type, e => { setState(e.pointerId, null); swiping = false; joy.style.opacity = "0"}));
    joy.onpointerdown = () => {joy.style.opacity = "1"};
    // visibility
    invis.onpointermove  = () => {notifi(" pa","use.",""," double tap to resume."), pauseGame()};
    page00.onpointerdown = () => {
        if (Date.now() - lastTap < 300) {
            page00.hidden = true; 
            resumeGame();
        }
        lastTap = Date.now();
    };
});