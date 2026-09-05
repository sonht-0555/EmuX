import {HEADER_BYTES, imageSize, shortName} from './zip.js';
import {createLayout} from './layout.js';
import {attachScan} from './scan.js';

// ===== Tham số cửa sổ =====
// Số <dimg> sống trong DOM. KHÔNG phụ thuộc độ dài truyện: 60 trang hay 50.000 trang
// đều đúng chừng này thẻ. Phần chiều cao còn lại do hai thanh đệm gánh.
const WINDOW = 40;
const AHEAD = 28, BEHIND = 12;      // chia cửa sổ theo hướng đang lướt (28 + 12 = WINDOW)
const MOUNT_PER_FRAME = 2;          // số ảnh được giải nén mỗi frame

// Chiều cao trang luôn là SỐ NGUYÊN, và luôn cắt XUỐNG. Cắt lên thì dimg cao hơn ảnh
// và hở ra một vệt nền paper; cắt xuống thì phần thừa dưới 1px bị overflow:hidden xén đi,
// không nhìn thấy được. Nhờ vậy mọi offset trong layout cũng là số nguyên -> scrollbar khớp tuyệt đối.
const px = v => `${Math.floor(v)}px`;

// ===== startReader =====
export async function startReader({zip, entries, romName, trans, level}) {
    const totalPages = entries.length;

    let globalPage = Number(local(`page_${romName}`)) || 0;
    if (globalPage > 0 && globalPage <= 1) globalPage = Math.round(globalPage * (totalPages - 1)); // giá trị cũ lưu dạng tỉ lệ
    globalPage = Math.max(0, Math.min(totalPages - 1, globalPage));

    const savePage = () => local(`page_${romName}`, globalPage);

    // ===== DOM =====
    screen.innerHTML = '';

    const manga = document.createElement('manga');
    const num = document.createElement('num'), numText = document.createElement('span'), numOverlay = document.createElement('div');
    numText.className = 'num-text';
    numOverlay.className = 'num-overlay';
    num.append(numText, numOverlay);
    screen.append(num, manga);
    if (trans) screen.append(trans.el);

    // Khoảng cách giữa hai trang: CSS đang để row-gap trên <manga>. Nhưng gap chỉ sinh ra
    // GIỮA các flex item, nên khi phần lớn trang được thay bằng thanh đệm thì số gap không
    // còn khớp số trang -> phép cộng dồn sai. Chuyển sang margin-bottom trên từng <dimg>:
    // lúc đó mỗi trang luôn chiếm đúng (chiều cao + gap), không phụ thuộc hàng xóm.
    const GAP = Math.floor(parseFloat(getComputedStyle(manga).rowGap)) || 0;
    manga.style.rowGap = '0px';

    // ===== Chiều cao mọi trang, đọc từ header ảnh ngay lúc mở file =====
    // img luôn rộng đúng 100vw và height:auto nên chiều cao suy ra là chính xác.
    // Có bản đồ này thì mới thay được 4960 thẻ rỗng bằng hai thanh đệm.
    const pageWidth = window.innerWidth;
    const heights = new Float64Array(totalPages);
    let heightSum = 0, heightSamples = 0;
    const known = new Uint8Array(totalPages);       // 1 = đọc được header, khỏi đo lại

    for (let i = 0; i < totalPages; i++) {
        const size = imageSize(zip.prefix(entries[i], HEADER_BYTES));
        if (!size || !(size.w > 0) || !(size.h > 0)) continue;
        const h = Math.floor(pageWidth * size.h / size.w);
        if (h <= 0) continue;
        heights[i] = h; known[i] = 1;
        heightSum += h; heightSamples++;
    }
    // trang không đọc nổi header thì tạm dùng trung bình, đo lại khi ảnh tải xong
    const estimate = Math.floor(heightSamples ? heightSum / heightSamples : window.innerHeight);
    for (let i = 0; i < totalPages; i++) if (!known[i]) heights[i] = estimate;

    const layout = createLayout(heights, GAP);

    // ===== Thanh đệm + các ô tái sử dụng =====
    const pad = () => {
        const el = document.createElement('div');
        el.style.cssText = 'flex:0 0 auto;width:100%;';
        return el;
    };
    const topPad = pad(), botPad = pad();
    manga.append(topPad, botPad);

    const slots = new Map();        // số trang -> <dimg> đang giữ trang đó
    const pool = [];                // <dimg> rảnh, chờ tái sử dụng
    const blobUrls = new Map();     // số trang -> blob URL đang mount
    let winFirst = -1, winEnd = -1;

    const span = Math.min(WINDOW, totalPages);
    let isInit = true, scrollTmr, lastScrollTop = 0, scrollDir = 1;

    const updateNum = () => {numText.textContent = `${globalPage + 1}|${totalPages}`;};
    const updateTrans = p => {if (trans && entries[p]) trans.update(shortName(entries[p].name));};

    // ===== Ảnh: giải nén rải theo frame, không bao giờ dồn một tick =====
    const mountQueue = [];
    let mountRaf = 0;

    const mountImage = p => {
        const item = slots.get(p);
        if (!item || item.firstElementChild) return false;

        let url = blobUrls.get(p);
        if (!url) {
            try {
                url = URL.createObjectURL(zip.extract(entries[p]));
                blobUrls.set(p, url);
            } catch (err) {console.error(`Lỗi trang ${p}:`, err); return false;}
        }

        const img = document.createElement('img');
        img.style.pointerEvents = 'none';
        img.decoding = 'async';
        // lazy hoãn cả tải LẪN GIẢI MÃ tới khi trang gần lọt vào tầm nhìn - thứ duy nhất
        // chặn được bộ nhớ bitmap, vì decode mới là phần ngốn hàng trăm MB.
        img.loading = 'lazy';
        img.dataset.index = p;
        img.setAttribute('image-name', item.getAttribute('image-name'));
        if (!known[p]) img.addEventListener('load', () => queueMeasure(p, img), {once: true});
        img.src = url;
        item.append(img);
        return true;
    };

    const unmountImage = p => {
        const item = slots.get(p);
        if (item) item.replaceChildren();
        const url = blobUrls.get(p);
        if (url) {URL.revokeObjectURL(url); blobUrls.delete(p); }
        pending.delete(p);
    };

    const pumpMounts = () => {
        mountRaf = 0;
        for (let budget = MOUNT_PER_FRAME; budget > 0 && mountQueue.length;) {
            const p = mountQueue.shift();
            if (p >= winFirst && p < winEnd && mountImage(p)) budget--;
        }
        scheduleMounts();
    };
    const scheduleMounts = () => {
        if (!mountRaf && mountQueue.length) mountRaf = requestAnimationFrame(pumpMounts);
    };

    // ===== Đo lại những trang không đọc nổi header =====
    // Sửa chiều cao một trang sẽ đẩy mọi trang sau nó, nên phải bù scroll nếu trang đó
    // nằm phía trên khung nhìn. Gom vào một frame rồi bù đúng một lần.
    const pending = new Map();      // số trang -> <img>
    let measureRaf = 0;

    const applyMeasures = () => {
        measureRaf = 0;
        if (!pending.size) return;

        const anchor = layout.pageAt(manga.scrollTop);
        const before = layout.top(anchor);
        const width = window.innerWidth;

        for (const [p, img] of pending) {
            const {naturalWidth: nw, naturalHeight: nh} = img;
            const h = nw ? width * nh / nw : img.getBoundingClientRect().height;
            if (h > 0) {layout.setHeight(p, Math.floor(h)); known[p] = 1;}
        }
        pending.clear();

        for (const [p, el] of slots) el.style.height = px(layout.height(p));
        refreshPads();

        // giữ nguyên khoảng cách từ đỉnh khung nhìn tới trang đang neo
        const shift = layout.top(anchor) - before;
        if (shift) {manga.scrollTop += shift; lastScrollTop = manga.scrollTop;}
    };

    const queueMeasure = (p, img) => {
        pending.set(p, img);
        if (!measureRaf) measureRaf = requestAnimationFrame(applyMeasures);
    };

    // ===== Cửa sổ trượt =====
    const refreshPads = () => {
        topPad.style.height = px(layout.top(winFirst));
        botPad.style.height = px(Math.max(0, layout.total - layout.top(winEnd)));
    };

    const takeSlot = p => {
        const el = pool.pop() || document.createElement('dimg');
        el.dataset.index = p;
        el.setAttribute('image-name', shortName(entries[p].name));
        // height cố định (không phải min-height) mới ra đúng số nguyên: nội dung cao hơn
        // sẽ bị overflow:hidden của dimg xén, thay vì đội chiều cao lên.
        // flex-shrink:0 vì dimg là flex item - không có nó thì flex co ô lại khi tổng vượt <manga>.
        el.style.height = px(layout.height(p));
        el.style.flexShrink = '0';
        el.style.marginBottom = px(GAP);
        return el;
    };

    const setWindow = first => {
        first = Math.max(0, Math.min(first, totalPages - span));
        const end = first + span;
        if (first === winFirst && end === winEnd && slots.size) return;

        for (const [p, el] of [...slots]) {
            if (p >= first && p < end) continue;
            unmountImage(p);
            el.remove();
            slots.delete(p);
            pool.push(el);
        }

        // đi ngược để chỗ chèn (trang p+1) luôn đã nằm sẵn trong DOM
        for (let p = end - 1; p >= first; p--) {
            if (slots.has(p)) continue;
            const el = takeSlot(p);
            manga.insertBefore(el, slots.get(p + 1) || botPad);
            slots.set(p, el);
            mountQueue.push(p);
        }

        winFirst = first;
        winEnd = end;
        refreshPads();
        // ưu tiên giải nén trang gần chỗ đang xem nhất
        const center = globalPage;
        mountQueue.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
        scheduleMounts();
    };

    const syncWindow = () => {
        const anchor = layout.pageAt(manga.scrollTop);
        setWindow(anchor - (scrollDir < 0 ? AHEAD : BEHIND));
    };

    // Safari khôi phục vị trí cuộn sau khi native modal (prompt) đóng, ghi đè lệnh scrollTop
    // vừa đặt. Nên phải tự khẳng định lại vài lần.
    const scrollToPage = page => {
        const jump = () => {
            if (globalPage !== page) return;
            clearTimeout(scrollTmr);
            const top = layout.top(page);
            if (Math.abs(manga.scrollTop - top) > 1) manga.scrollTop = top;
            lastScrollTop = manga.scrollTop;
        };
        jump();
        requestAnimationFrame(jump);
        setTimeout(jump, 80);
    };

    const goToPage = (page, scroll = true) => {
        globalPage = page;
        setWindow(page - (scroll ? BEHIND : (scrollDir < 0 ? AHEAD : BEHIND)));
        if (scroll) scrollToPage(page);
        updateNum();
        updateTrans(page);
    };

    // ===== Khởi động =====
    page02.hidden = false;
    body.classList.add('cbz-open');
    setWindow(globalPage - BEHIND);
    mountImage(globalPage);            // trang đang xem hiện ngay, phần còn lại rải theo frame
    manga.scrollTop = lastScrollTop = layout.top(globalPage);
    updateNum();
    updateTrans(globalPage);

    requestAnimationFrame(() => scrollToPage(globalPage));
    setTimeout(() => {
        scrollToPage(globalPage);
        isInit = false;
        [bpad, dpad, jpad, page00, page01, switch0].forEach(el => el.hidden = true);
    }, 200);

    // ===== Nhảy trang bằng ô số =====
    num.onclick = event => {
        event.stopPropagation();
        const input = prompt("Page:", globalPage + 1)?.trim();
        if (!input) return;
        const page = parseInt(input) - 1;
        if (!(page >= 0 && page < totalPages)) return;
        goToPage(page);
        savePage();
    };

    await showNotification("", "###", "", "", true);

    // ===== Scroll =====
    manga.onscroll = () => {
        if (isInit) return;

        const top = manga.scrollTop;
        if (top !== lastScrollTop) scrollDir = top > lastScrollTop ? 1 : -1;
        lastScrollTop = top;

        syncWindow();   // rẻ: một lần tìm nhị phân, chỉ động DOM khi cửa sổ thật sự trượt

        clearTimeout(scrollTmr);
        scrollTmr = setTimeout(() => {
            const page = layout.pageAt(top + manga.clientHeight / 3);
            if (page === globalPage) return;
            globalPage = page;
            updateNum();
            updateTrans(page);
            savePage();
        }, 60);
    };

    // ===== Chặn gesture của trình phát ở lớp dưới =====
    manga.ontouchstart = manga.ontouchmove = event => event.stopPropagation();
    num.ontouchstart = num.ontouchmove = event => event.stopPropagation();
    manga.oncontextmenu = event => event.preventDefault();

    // ===== Chạm: 1 chạm chọn trang, 3 chạm đổi level, giữ lâu xem bản scan =====
    const scan = attachScan({root: manga, zip, originalUrl: p => blobUrls.get(p)});

    manga.onpointerdown = event => {
        scan.cancel();

        // không quét DOM nữa: toạ độ -> trang bằng một lần tìm nhị phân
        const rect = manga.getBoundingClientRect();
        const page = layout.pageAt(event.clientY - rect.top + manga.scrollTop);
        const img = slots.get(page)?.querySelector('img');
        scan.press(img, entries[page]);

        click(() => {
            globalPage = page;
            updateNum();
            updateTrans(page);
            savePage();
        }, null, () => {
            const next = prompt("Level:", level.value);
            if (next != null) level.set(next, true);
        });
    };

    return {
        dispose() {
            clearTimeout(scrollTmr);
            cancelAnimationFrame(mountRaf);
            cancelAnimationFrame(measureRaf);
            mountQueue.length = 0;
            scan.dispose();
            blobUrls.forEach(url => URL.revokeObjectURL(url));
            blobUrls.clear();
            pending.clear();
        }
    };
}
