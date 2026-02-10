// ===== GamePad (Main Thread - ghi input vào SAB) =====
var buttonMap = { up: 4, down: 5, left: 6, right: 7, 1: 8, 3: 0, 2: 9, 4: 1, l: 10, r: 11, start: 3, select: 2 };

// ===== buttonPress =====
function buttonPress(btn) {
    const id = buttonMap[btn];
    if (id !== undefined && id !== '' && window.inputView) {
        Atomics.store(window.inputView, id, 1);
    }
    if (audioContext?.state !== 'running') { audioContext?.resume(); window.resetAudioSync?.(); }
}
// ===== buttonUnpress =====
function buttonUnpress(btn) {
    const id = buttonMap[btn];
    if (id !== undefined && id !== '' && window.inputView) {
        Atomics.store(window.inputView, id, 0);
    }
}
// ===== Touch Update (NDS bottom screen) =====
window.updateTouch = (x, y, d) => {
    if (!window.inputView) return;
    Atomics.store(window.inputView, 16, x);
    Atomics.store(window.inputView, 17, y);
    Atomics.store(window.inputView, 18, d);
};
// ===== updateButtons =====
function updateButtons(cfg) {
    if (!cfg) return;
    ['btn-1', 'btn-2', 'btn-3', 'btn-4', 'btn-l', 'btn-r', 'btn-select', 'btn-start'].forEach(tag => {
        const el = document.querySelector(tag), bCfg = cfg[tag];
        if (!el) return;
        if (bCfg) {
            el.innerText = bCfg[0];
            if (bCfg[1] !== undefined) buttonMap[tag.replace('btn-', '')] = bCfg[1];
        } else el.style.display = 'none';
    });
    ['sec-12', 'sec-34'].forEach(tag => {
        const el = document.querySelector(tag);
        if (el && Array.from(el.children).every(c => c.style.display === 'none')) el.style.display = 'none';
    });
}