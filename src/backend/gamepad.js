// ===== LibInput =====
function input_poll_cb() {
    // Empty callback - required by Libretro API
}
// ===== GamePad State =====
var gamepadState = new Uint8Array(16);
var gamepadMask = 0;
var buttonMap = {
    up: 4,
    down: 5,
    left: 6,
    right: 7,
    1: 8,
    3: 0,
    2: 9,
    4: 1,
    l: 10,
    r: 11,
    start: 3,
    select: 2
};
// Touch/Pointer state for NDS
window._pX = 0;
window._pY = 0;
window._pD = 0;
// ===== buttonPress =====
function buttonPress(button) {
    const buttonId = buttonMap[button];
    if (buttonId !== undefined && buttonId !== '') {
        gamepadState[buttonId] = 1;
        gamepadMask |= (1 << buttonId);
    }
    // Resume audio context on first interaction
    if (audioContext && audioContext.state !== 'running') {
        audioContext.resume();
    }
}
// ===== buttonUnpress =====
function buttonUnpress(button) {
    const buttonId = buttonMap[button];
    if (buttonId !== undefined && buttonId !== '') {
        gamepadState[buttonId] = 0;
        gamepadMask &= ~(1 << buttonId);
    }
}
// ===== input_state_cb =====
function input_state_cb(port, device, index, id) {
    // Only handle port 0
    if (port) {
        return 0;
    }
    // Device 1: Standard gamepad
    if (device === 1) {
        if (id === 256) {
            return gamepadMask;
        }
        return gamepadState[id];
    }
    // Device 6: Touch/Pointer (for NDS)
    if (device === 6) {
        if (id === 0) {
            return window._pX;
        }
        if (id === 1) {
            return window._pY;
        }
        if (id === 2) {
            return window._pD;
        }
    }
    return 0;
}
// ===== updateButtons =====
function updateButtons(configuration) {
    if (!configuration) {
        return;
    }
    // Update individual buttons
    const buttonTagList = ['btn-1', 'btn-2', 'btn-3', 'btn-4', 'btn-l', 'btn-r', 'btn-select', 'btn-start'];
    buttonTagList.forEach(tag => {
        const element = document.querySelector(tag);
        if (!element) {
            return;
        }
        const buttonConfiguration = configuration[tag];
        if (buttonConfiguration) {
            element.style.display = 'grid';
            element.innerText = buttonConfiguration[0];
            if (buttonConfiguration[1] !== undefined) {
                const buttonKey = tag.replace('btn-', '');
                buttonMap[buttonKey] = buttonConfiguration[1];
            }
        } else {
            element.style.display = 'none';
        }
    });
    // Update button sections visibility
    const sectionTagList = ['sec-12', 'sec-34'];
    sectionTagList.forEach(tag => {
        const element = document.querySelector(tag);
        if (!element) {
            return;
        }
        const children = Array.from(element.children);
        const hasVisibleButtons = children.some(child => child.style.display !== 'none');
        if (hasVisibleButtons) {
            element.style.display = 'grid';
        } else {
            element.style.display = 'none';
        }
    });
}