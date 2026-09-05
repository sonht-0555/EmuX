// ===== Manga level: các class manga-* trên <body> =====
// Quyết định filter/halftone áp lên ảnh (xem @layer other trong main.css).
// Thêm bớt mức độ thì chỉ động vào file này và CSS.

export function createLevel() {
    let level = '';

    const toClasses = value => String(value || '').trim().split(/\s+/).filter(Boolean)
        .map(v => v.startsWith('manga-') ? v : `manga-${v}`);

    const set = (value, save) => {
        body.classList.remove(...Array.from(body.classList).filter(v => v.startsWith('manga-')));
        body.classList.add(...toClasses(level = String(value || '').trim()));
        if (save) local('manga_level', level);
    };

    set(local('manga_level') || '');

    return {set, get value() {return level;}};
}
