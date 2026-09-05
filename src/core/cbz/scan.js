// ===== Giữ lâu để xem bản .scan của trang =====
// Tự giữ timer, tự lắng nghe sự kiện thả tay trên window, tự trả ảnh về bản gốc.
// Reader chỉ cần gọi press() khi ngón tay chạm xuống và cancel() khi cần huỷ.

const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'touchend'];
const HOLD_MS = 600;

// root       : phần tử <manga>, để huỷ khi cuộn
// zip        : {files, extract} - tìm và giải nén entry .scan
// originalUrl: gIdx -> blob URL của ảnh gốc, dùng để trả về khi thả tay
export function attachScan({root, zip, originalUrl}) {
    let timer, held = null;

    const cancel = () => {
        clearTimeout(timer);
        if (!held) return;
        const url = originalUrl(Number(held.dataset.index));
        if (url && held.src !== url) held.src = url;
        held = null;
    };

    const show = (img, entry) => {
        if (!entry) return;
        const prefix = entry.name.includes('.raws.')
            ? entry.name.split('.raws.')[0]
            : entry.name.substring(0, entry.name.lastIndexOf('.'));
        const scan = zip.files.find(k => k.name === prefix + '.scan' || k.name.startsWith(prefix + '.scan.'));
        if (!scan) return;
        try {
            const url = URL.createObjectURL(zip.extract(scan));
            img.addEventListener('load', () => URL.revokeObjectURL(url), {once: true});
            img.src = url;
        } catch (err) {console.error('Lỗi mở bản scan:', err);}
    };

    const press = (img, entry) => {
        held = img;
        if (img) timer = setTimeout(() => show(img, entry), HOLD_MS);
    };

    RELEASE_EVENTS.forEach(e => window.addEventListener(e, cancel));
    root.addEventListener('scroll', cancel);

    return {
        press,
        cancel,
        dispose() {
            clearTimeout(timer);
            RELEASE_EVENTS.forEach(e => window.removeEventListener(e, cancel));
            root.removeEventListener('scroll', cancel);
        }
    };
}
