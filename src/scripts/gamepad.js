// ===== Input System =====
const buttonMapping = {up: 4, down: 5, left: 6, right: 7, 1: 8, 3: 0, 2: 9, 4: 1, l: 10, r: 11, start: 3, select: 2};
const keyboardMapping = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    z: '1', x: '3', a: '2', s: '4', q: 'l', w: 'r', Enter: 'start', Shift: 'select'
};
let touchInputMask = 0;
let keyboardInputMask = 0;
let physicalInputMask = 0;
// ===== updateTouchInput =====
const updateTouchInput = (buttonName, isPressed) => {
    const buttonId = buttonMapping[buttonName];
    if (buttonId === undefined || buttonId === '') return;
    if (isPressed) {
        touchInputMask |= (1 << buttonId);
        if (audioContext?.state !== 'running') {
            audioContext?.resume();
            window.resetAudioSync?.();
        }
    } else {
        touchInputMask &= ~(1 << buttonId);
    }
};
window.buttonPress = (buttonName) => updateTouchInput(buttonName, true);
window.buttonUnpress = (buttonName) => updateTouchInput(buttonName, false);
// ===== input_poll_cb =====
window.input_poll_cb = () => {
    physicalInputMask = 0;
    const connectedGamepads = navigator.getGamepads();
    for (let gamepadIndex = 0; gamepadIndex < connectedGamepads.length; gamepadIndex++) {
        const gamepad = connectedGamepads[gamepadIndex];
        if (!gamepad) continue;

        const standardButtonMapping = [1, 0, 9, 8, 10, 11, 10, 11, 2, 3, 10, 11, 4, 5, 6, 7];
        for (let buttonIndex = 0; buttonIndex < gamepad.buttons.length; buttonIndex++) {
            if (gamepad.buttons[buttonIndex].pressed) {
                const targetBitId = standardButtonMapping[buttonIndex];
                if (targetBitId !== undefined) physicalInputMask |= (1 << targetBitId);
            }
        }

        // Hỗ trợ D-pad từ cần Analog (Axes)
        if (gamepad.axes[0] < -0.5) physicalInputMask |= (1 << 6); // Left
        if (gamepad.axes[0] > 0.5) physicalInputMask |= (1 << 7); // Right
        if (gamepad.axes[1] < -0.5) physicalInputMask |= (1 << 4); // Up
        if (gamepad.axes[1] > 0.5) physicalInputMask |= (1 << 5); // Down
    }
};
// ===== getGamepadMask =====
window.getGamepadMask = () => touchInputMask | keyboardInputMask | physicalInputMask;

// ===== input_state_cb =====
window.input_state_cb = (port, device, index, id) => {
    if (device === 1) { // Joypad
        if (window.isNetplaying) {
            const netplayInput = typeof getNetplayInput === 'function' ? getNetplayInput(port) : null;
            if (netplayInput !== null) return id === 256 ? netplayInput : (netplayInput >> id) & 1;
        }
        if (port > 0) return 0;
        const combinedInputMask = touchInputMask | keyboardInputMask | physicalInputMask;
        return id === 256 ? combinedInputMask : (combinedInputMask >> id) & 1;
    }
    return device === 6 ? [window._pX, window._pY, window._pD][id] ?? 0 : 0;
};
// ===== updateButtons =====
window.updateButtons = (config) => {
    if (!config) return;
    const controlTags = ['btn-1', 'btn-2', 'btn-3', 'btn-4', 'btn-l', 'btn-r', 'btn-select', 'btn-start'];
    controlTags.forEach(tag => {
        const element = document.querySelector(tag);
        const buttonConfig = config[tag];
        if (!element) return;
        if (buttonConfig) {
            element.innerText = buttonConfig[0];
            element.style.display = '';
            if (buttonConfig[1] !== undefined) {
                const keyName = tag.replace('btn-', '');
                buttonMapping[keyName] = buttonConfig[1];
            }
        } else {
            element.style.display = 'none';
        }
    });
    ['sec-12', 'sec-34'].forEach(sectionTag => {
        const sectionElement = document.querySelector(sectionTag);
        if (sectionElement) {
            const allChildrenHidden = Array.from(sectionElement.children).every(child => child.style.display === 'none');
            sectionElement.style.display = allChildrenHidden ? 'none' : '';
        }
    });
};
// ===== Keyboard Listeners =====
window.addEventListener('keydown', (event) => {
    const mappedButton = keyboardMapping[event.key] || keyboardMapping[event.code];
    if (mappedButton) {
        const buttonId = buttonMapping[mappedButton];
        if (buttonId !== undefined) {
            event.preventDefault();
            keyboardInputMask |= (1 << buttonId);
            if (audioContext?.state !== 'running') {
                audioContext?.resume();
                window.resetAudioSync?.();
            }
        }
    }
});
window.addEventListener('keyup', (event) => {
    const mappedButton = keyboardMapping[event.key] || keyboardMapping[event.code];
    if (mappedButton) {
        const buttonId = buttonMapping[mappedButton];
        if (buttonId !== undefined) keyboardInputMask &= ~(1 << buttonId);
    }
});