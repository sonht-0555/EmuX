// ===== Manga level: các class manga-* trên <body> =====
// Quyết định filter/halftone áp lên ảnh (xem @layer other trong main.css).
// Thêm bớt mức độ thì chỉ động vào file này và CSS.

export function createLevel(romName) {
    let level = '';
    // Các tập cùng 4 ký tự đầu tên file dùng chung thiết lập.
    const series = String(romName || '').split(/[\\/]/).pop().replace(/\.cbz$/i, '').slice(0, 4).toLowerCase();
    const storageKey = `manga_level_${series}`;

    const toClasses = value => String(value || '').trim().split(/\s+/).filter(Boolean)
        .map(v => v.startsWith('manga-') ? v : `manga-${v}`);

    const set = (value, save) => {
        body.classList.remove(...Array.from(body.classList).filter(v => v.startsWith('manga-')));
        body.classList.add(...toClasses(level = String(value || '').trim()));
        if (save) local(storageKey, level);
    };

    set(local(storageKey) ?? '2 S2 O8 B3');

    return {set, get value() {return level;}};
}
