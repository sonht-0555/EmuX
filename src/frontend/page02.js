// ===== Page02 State Variables =====
let brightnessValue = 5;
let swipeStartY = 0;
let isSwiping = false;
let shaderNumber = 1;
let activeElement = null;
const activePointers = new Map();
// ===== handleButton =====
function handleButton(isPressed, element) {
    const dataParts = element?.getAttribute('data')?.split('-').slice(1) || [];
    dataParts.forEach(part => {
        if (isPressed) {
            buttonPress(part);
        } else {
            buttonUnpress(part);
        }
    });
}
// ===== setPointerState =====
function setPointerState(pointerId, element) {
    const currentElement = activePointers.get(pointerId);
    if (element === currentElement) {
        return;
    }
    if (currentElement) {
        handleButton(false, currentElement);
    }
    if (element) {
        activePointers.set(pointerId, element);
        handleButton(true, element);
    } else {
        activePointers.delete(pointerId);
    }
}
// ===== DOMContentLoaded =====
document.addEventListener("DOMContentLoaded", function() {
    // Document Pointer Down
    document.onpointerdown = (event) => {
        setPointerState(event.pointerId, event.target.closest('[data]'));
    };
    // Document Pointer Move
    document.onpointermove = (event) => {
        const activeElement = activePointers.get(event.pointerId);
        if (!activeElement) {
            return;
        }
        const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data]');
        if (targetElement && targetElement !== activeElement) {
            const activeDataType = activeElement.getAttribute('data').split('-')[0];
            const targetDataType = targetElement.getAttribute('data').split('-')[0];
            if (activeDataType === targetDataType) {
                setPointerState(event.pointerId, targetElement);
            }
        }
    };
    // Canvas Pointer Down
    canvas.onpointerdown = (event) => {
        const canvasRect = canvas.getBoundingClientRect();
        const touchX = event.clientX - canvasRect.left;
        const touchY = event.clientY - canvasRect.top;
        if (doubleTap(event, canvas, 1)) {
            if (touchX < canvasRect.width / 2) {
                if (touchY < canvasRect.height / 2) {
                    loadState(3);
                } else {
                    loadState(2);
                }
            } else {
                if (touchY < canvasRect.height / 2) {
                    saveState(3);
                } else {
                    saveState(2);
                }
            }
        }
        swipeStartY = event.clientY;
        isSwiping = event.clientX > (canvasRect.right - 40);
    };
    // Canvas Pointer Move
    canvas.onpointermove = (event) => {
        if (!isSwiping) {
            return;
        }
        const swipeDistance = Math.abs(swipeStartY - event.clientY);
        if (swipeDistance >= 20) {
            if (swipeStartY - event.clientY > 0) {
                brightnessValue = Math.min(10, brightnessValue + 1);
            } else {
                brightnessValue = Math.max(0, brightnessValue - 1);
            }
            gamepad.style.opacity = brightnessValue / 10;
            message(`Brightness_${brightnessValue}0.nit`);
            swipeStartY = event.clientY;
        }
    };
    // Bottom Canvas (NDS Touch Screen)
    canvasB.onpointerdown = canvasB.onpointermove = (event) => {
        if (!Module.isNDS) {
            return;
        }
        const canvasRect = canvasB.getBoundingClientRect();
        const touchX = event.clientX - canvasRect.left;
        const touchY = event.clientY - canvasRect.top;
        const isPointerDown = event.type !== 'pointerup' && event.type !== 'pointercancel';
        window._pD = isPointerDown ? 1 : 0;
        window._pX = Math.floor(touchX / canvasRect.width * 65535 - 32768);
        window._pY = Math.floor(touchY / canvasRect.height * 32767);
        event.preventDefault();
    };
    canvasB.onpointerup = canvasB.onpointercancel = () => {
        window._pD = 0;
        isSwiping = false;
    };
    // Shader State Button
    state.onpointerdown = (event) => {
        if (doubleTap(event, state)) {
            isRunning = false;
            setTimeout(() => {
                const userInput = prompt("Format [shaderxx-data]");
                if (userInput) {
                    local(...(userInput.split('-')));
                }
                isRunning = true;
            }, 150);
        } else {
            shaderNumber = shaderNumber % 5 + 1;
            local("shader", shaderNumber);
            const shaderData = local(`shader0${shaderNumber}`) || "0.0.0.1.0.0.1.0.0.1.0.0.1.0.0.0";
            screen.style.setProperty("--shader", svgGen(window.devicePixelRatio, integer, shaderData));
            message(`[0${shaderNumber}] Matrix!`);
        }
    };
    // Renderer Switch Button
    switch0.onpointerdown = () => {
        switchRenderer();
    };
    // Pointer Up/Cancel Handler
    ['pointerup', 'pointercancel'].forEach(eventType => {
        addEventListener(eventType, (event) => {
            setPointerState(event.pointerId, null);
            isSwiping = false;
            joy.style.opacity = "0";
        });
    });
    // Joy Button
    joy.onpointerdown = () => {
        joy.style.opacity = "1";
    };
    // Visibility Handler
    invis.onpointermove = () => {
        page00.hidden = false;
        notifi(" pa", "use.", "", " double tap to resume.");
        pauseGame();
    };
    page00.onpointerdown = (event) => {
        if (doubleTap(event, page00)) {
            page00.hidden = true;
            resumeGame();
        }
    };
});