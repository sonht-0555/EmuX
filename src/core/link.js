// ===== Link System =====
// Mỗi bộ truyện là một file .link tự khai báo cách cào web đó. File này nạp module,
// cào ảnh qua proxy, rồi gộp vào MỘT file .cbz duy nhất cho cả bộ.
//
// Bố cục trong .cbz:
//   C001/0001.jpg ... C001/0030.jpg      mỗi chương một thư mục
//   C002/0001.jpg ...
//   manga.link                            chính file .link, đi kèm luôn trong cbz
//
// Tên file là <title>'<chương cao nhất>.cbz. Tải thêm chương thì cbz cũ được ghi lại
// thành tên mới rồi xoá bản cũ, nên trong thư viện luôn chỉ có một file cho một bộ.
//
// .link nằm trong cbz chính là thứ cho trình đọc biết "bộ này do Link tải" - không phải
// đoán từ tên file, và không cần localStorage nào cả.

// ===== 0. Constants =====
const PROXY_DEFAULT = 'https://emux-cors.hoangtuanson91.workers.dev/proxy?url=';
const PARALLEL = 5;
const RETRY = 2;
const MIN_BYTES = 1024;
const FETCH_TIMEOUT = 30000;        // fetch KHÔNG tự timeout: thiếu mốc này thì một request treo là treo cả chương
const STALL_MS = 20000;             // 20s không thêm được trang nào -> hỏi người dùng
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
const EXT_OF_MIME = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'};
const LINK_ENTRY = 'manga.link';
const HASH_ENTRY = 'manga.hash';
const HASH_W = 9, HASH_H = 8;       // dHash: 8 hàng x 8 phép so = 64 bit

// ===== 1. Network =====
const linkProxy = () => local('link_proxy') || PROXY_DEFAULT;
function wrap(target, referer) {
    if (/^(data|blob):/i.test(target)) return target;
    try {if (new URL(target, location.href).origin === location.origin) return target;} catch (err) { }
    const prefix = linkProxy();
    const url = prefix + encodeURIComponent(target);
    return referer && prefix.includes('?') ? `${url}&ref=${encodeURIComponent(referer)}` : url;
}

// signal cho caller huỷ giữa đường. Đồng hồ riêng chỉ canh tới lúc CÓ response;
// đọc body xong hay không thì để watchdog theo tiến triển ở grabPages lo, vì một
// ảnh lớn trên mạng chậm có thể đọc lâu hơn FETCH_TIMEOUT một cách hợp lệ.
async function fetchVia(target, referer, signal) {
    let lastError;
    for (let attempt = 0; attempt <= RETRY; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        const relay = () => controller.abort();
        signal?.addEventListener('abort', relay, {once: true});
        try {
            const response = await fetch(wrap(target, referer), {signal: controller.signal});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } catch (err) {
            lastError = err;
            if (signal?.aborted) throw new Error('cancelled');
            if (attempt < RETRY) await delay(400 * (attempt + 1));
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', relay);
        }
    }
    throw new Error(`Cannot fetch ${target}: ${lastError.message}`);
}

function assertHtml(html, response) {
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (type.includes('html') || /<html|<!doctype|<body|<div|<a\s/i.test(html)) return;
    const head = html.trim().slice(0, 120) || '(empty)';
    throw new Error(`Proxy did not return HTML (${type || 'unknown type'}): "${head}". Is the /proxy route deployed?`);
}

// ===== 2. Context =====
function createContext(deep = false, referer = '') {
    return {
        deep,
        async dom(url) {
            const response = await fetchVia(url, referer);
            const html = await response.text();
            assertHtml(html, response);
            return new DOMParser().parseFromString(html, 'text/html');
        },
        async json(url) {
            return (await fetchVia(url, referer)).json();
        },
        async text(url) {
            return (await fetchVia(url, referer)).text();
        },
        abs(href, base) {
            try {return new URL(href, base || undefined).href;} catch (err) {return href;}
        },
        log(text) {
            console.log(`[link] ${text}`);
        }
    };
}

// ===== 3. Loading =====
async function loadLink(source) {
    const code = typeof source === 'string' ? source : await source.text();
    const blobUrl = URL.createObjectURL(new Blob([code], {type: 'application/javascript'}));
    let module;
    try {
        module = await import(blobUrl);
    } catch (err) {
        throw new Error(`Not a valid ES module: ${err.message}`);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
    return validateLink(module.default);
}

function validateLink(manga) {
    if (!manga || typeof manga !== 'object') throw new Error('A .link file must `export default` an object.');
    for (const field of ['title', 'home']) {
        if (typeof manga[field] !== 'string' || !manga[field].trim()) throw new Error(`Missing required field: ${field}`);
    }
    for (const method of ['chapters', 'pages']) {
        if (typeof manga[method] !== 'function') throw new Error(`Missing required function: ${method}()`);
    }
    // Sai chính tả ở đây mà bỏ qua thì nó im lặng tải sai đầu danh sách - kiểu lỗi vẫn
    // sinh ra file .cbz hợp lệ nên rất khó lần ra.
    if (manga.chap !== undefined && manga.chap !== 'start' && manga.chap !== 'new') {
        if (manga.chap === '' || manga.chap === null || !Number.isFinite(Number(manga.chap))) {
            throw new Error(`chap must be "start", "new", or a chapter number, got "${manga.chap}"`);
        }
    }
    return manga;
}

// ===== 4. Normalizing =====
function normalizeChapters(raw, manga) {
    if (!Array.isArray(raw)) throw new Error('chapters() must return an array.');
    const seen = new Map();
    for (const item of raw) {
        const num = Number(item?.num);
        if (!Number.isFinite(num) || !item?.url) continue;
        if (!seen.has(num)) seen.set(num, {num, url: String(item.url), title: String(item.title || `Chapter ${num}`).trim()});
    }
    if (!seen.size) throw new Error(`chapters() returned no valid chapter for "${manga.title}". The selector may have changed.`);
    return [...seen.values()].sort((a, b) => a.num - b.num);
}

function normalizePages(raw, chapter) {
    if (!Array.isArray(raw)) throw new Error('pages() must return an array of URLs.');
    const seen = new Set();
    const pages = [];
    for (const item of raw) {
        const page = typeof item === 'string' ? {url: item} : item;
        const url = typeof page?.url === 'string' ? page.url.trim() : '';
        if (!url || seen.has(url)) continue;
        seen.add(url);
        pages.push({...page, url});
    }
    if (!pages.length) throw new Error(`pages() returned no image for chapter ${chapter.num}. The selector may have changed.`);
    return pages;
}

// ===== 5. Naming =====
// Số chương luôn 3 chữ số: 1 -> 001. Chương lẻ dùng "~" làm dấu thập phân: 150.5 -> 150~5.
//
// "~" chứ không phải "-" hay "_" là vì Intl.Collator (thứ sắp trang trong cbz/zip.js)
// coi dấu câu là ký tự bỏ qua, nên "C150-5" bị so như "1505" và sắp TRƯỚC "C150" -
// chương 150.5 đọc trước chương 150. "~" xếp sau "/" nên thứ tự mới đúng.
const padNum = num => {
    const [whole, fraction] = String(num).split('.');
    return whole.padStart(3, '0') + (fraction ? '~' + fraction : '');
};
const sanitizeName = str => str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');

// chap -> điểm bắt đầu tải.
//   null       : "new" (mặc định) - chỉ lấy chương mới nhất, không có sàn
//   -Infinity  : "start" - từ chương đầu tiên site có
//   một số     : từ chương đó trở đi
const chapFrom = manga => {
    if (manga.chap === undefined || manga.chap === 'new') return null;
    if (manga.chap === 'start') return -Infinity;
    return Number(manga.chap);
};

const chapterDir = num => `C${padNum(num)}`;
const mangaKey = (title, maxNum) => `${sanitizeName(title)}'${padNum(maxNum)}.cbz`;

// Đọc số chương ngược ra từ tên thư mục trong cbz, và từ tên file cbz.
const parseNum = (whole, fraction) => parseFloat(fraction ? `${whole}.${fraction}` : whole);
const dirNum = name => {
    // [/] chứ không phải \// : bộ minify build ra docs/ quét "//" để xoá comment mà
    // không theo dõi regex literal, nên "\//" làm nó ăn mất phần còn lại của dòng.
    const found = String(name).match(/^C(\d+)(?:~(\d+))?[/]/);
    return found ? parseNum(found[1], found[2]) : NaN;
};
const keyNum = key => {
    const found = String(key).match(/'(\d+)(?:~(\d+))?\.cbz$/i);
    return found ? parseNum(found[1], found[2]) : NaN;
};

// Zero-pad để Intl.Collator trong cbz/zip.js sắp đúng thứ tự.
function pageName(index, url, contentType) {
    const fromUrl = url.match(IMG_EXT);
    const ext = fromUrl ? fromUrl[1].toLowerCase().replace('jpeg', 'jpg') : (EXT_OF_MIME[(contentType || '').split(';')[0].trim().toLowerCase()] || 'jpg');
    return `${String(index + 1).padStart(4, '0')}.${ext}`;
}

// ===== 6. Tầng .cbz =====
// link.js là classic script nên không import tĩnh được. Giải path theo URL của chính
// script này, không theo location - chạy đúng cả khi app nằm trong thư mục con.
const SELF_URL = document.currentScript?.src || new URL('src/core/link.js', location.href).href;
let zipLibPromise = null;
const zipLib = () => (zipLibPromise ??= import(new URL('./cbz/zip.js', SELF_URL).href));

const asBytes = async raw => {
    if (raw instanceof Uint8Array) return raw;
    if (raw instanceof Blob) return new Uint8Array(await raw.arrayBuffer());
    return new Uint8Array(raw);
};

// Tìm file .cbz đang giữ bộ này. Bình thường chỉ có một; nếu vì lý do gì mà có nhiều
// thì lấy bản có chương cao nhất.
async function findCbz(title) {
    const prefix = sanitizeName(title) + "'";
    const keys = (await listStore('games')).filter(key => key.startsWith(prefix) && key.toLowerCase().endsWith('.cbz'));
    if (!keys.length) return null;
    return keys.reduce((best, key) => (keyNum(key) || 0) > (keyNum(best) || 0) ? key : best);
}

// Mở cbz hiện có ĐÚNG MỘT LẦN: vừa để biết đã có chương nào, vừa để lát nữa copy
// entry sang cbz mới. Đọc hai lần là nhân đôi bộ nhớ của cả bộ truyện.
async function openExisting(title) {
    const key = await findCbz(title);
    if (!key) return {key: null, zip: null, have: new Set(), max: 0};

    const {openZip} = await zipLib();
    const zip = openZip(await asBytes(await emuxDB(key)));
    const have = new Set();
    let max = 0;
    for (const entry of zip.files) {
        const num = dirNum(entry.name);
        if (!Number.isFinite(num)) continue;
        have.add(num);
        if (num > max) max = num;
    }
    return {key, zip, have, max};
}

// Ghi cbz mới = entry của cbz cũ + các chương vừa tải + manga.link, rồi xoá cbz cũ.
// Entry cũ đi bằng bytesOf() nên với entry stored nó là view thẳng vào buffer cũ,
// không giải nén và không copy.
// ===== Xoá trang credit lặp lại xuyên chương =====
// Cùng logic với run_find_duplicates trong workflow_menu.py: hash từng trang, nhóm theo
// hash, nhóm nào trùng thì bỏ. Khác một chỗ: chỉ tính là credit khi trùng ở TỪ HAI CHƯƠNG
// KHÁC NHAU - trùng trong cùng một chương là nội dung thật tình cờ giống nhau.
//
// Phải là perceptual hash, KHÔNG phải hash bytes. Đo trên Chainsaw_Man: cùng một trang
// credit ở chương 53/54/55 cho ba file khác nhau trên server, mỗi trang một drm_data
// riêng, rồi processImage còn nén lại - bytes khác nhau hoàn toàn (kể cả khác kích thước
// file). Chỉ pixel là giống, nên chỉ hash trên pixel mới bắt được.
//
// dHash chứ không phash: phash cần DCT, phash và dHash đo ra đều khớp tuyệt đối cho
// trường hợp này, mà dHash chỉ cần resize + so pixel liền kề nên ít chỗ viết sai hơn.
let hashCanvas = null;
const hashOf = async bytes => {
    try {
        const bitmap = await createImageBitmap(new Blob([bytes]));
        hashCanvas ??= document.createElement('canvas');
        hashCanvas.width = HASH_W;
        hashCanvas.height = HASH_H;
        const ctx = hashCanvas.getContext('2d', {willReadFrequently: true});
        ctx.drawImage(bitmap, 0, 0, HASH_W, HASH_H);
        bitmap.close();

        const {data} = ctx.getImageData(0, 0, HASH_W, HASH_H);
        const grey = at => data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
        let bits = '';
        for (let y = 0; y < HASH_H; y++) {
            for (let x = 0; x < HASH_W - 1; x++) {
                const at = (y * HASH_W + x) * 4;
                bits += grey(at) > grey(at + 4) ? '1' : '0';
            }
        }
        return bits.match(/.{4}/g).map(nibble => parseInt(nibble, 2).toString(16)).join('');
    } catch (err) {
        // Không giải mã được thì trả null: trang đó không tham gia xét trùng, nên không
        // bao giờ bị xoá oan.
        console.error('hash failed:', err.message);
        return null;
    }
};

// Bảng có hai loại dòng:
//   <tên trang>\t<hash>   trang đang còn trong cbz
//   *\t<hash>             hash của trang credit ĐÃ BỊ XOÁ - phải nhớ lại, xem dedupItems
const CREDIT_MARK = '*';

const parseIndex = bytes => {
    const index = new Map(), credits = [];
    if (!bytes?.length) return {index, credits};
    for (const line of new TextDecoder().decode(bytes).split('\n')) {
        const tab = line.lastIndexOf('\t');
        if (tab <= 0) continue;
        const name = line.slice(0, tab), hash = line.slice(tab + 1);
        if (name === CREDIT_MARK) credits.push(hash);
        else index.set(name, hash);
    }
    return {index, credits};
};

const serializeIndex = (index, credits) => new TextEncoder().encode([
    ...[...index].map(([name, hash]) => `${name}\t${hash}`),
    ...credits.map(hash => `${CREDIT_MARK}\t${hash}`)
].join('\n'));

// So bằng khoảng cách Hamming, KHÔNG bằng khớp chuỗi. Canvas nội suy khi thu nhỏ nên
// cùng một ảnh qua hai lần nén khác nhau có thể lệch vài bit. Đo trên Chainsaw_Man:
// cùng một trang credit lệch 0-1 bit, còn hai trang nội dung khác nhau lệch 26-37 bit.
// Khoảng trống rộng nên ngưỡng 8 vừa bắt hết credit vừa không với tới nội dung thật.
const HAMMING_MAX = 8;

const hashBits = hex => [parseInt(hex.slice(0, 8), 16) >>> 0, parseInt(hex.slice(8, 16), 16) >>> 0];
const popcount = n => {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
};
const hashDistance = (a, b) => popcount(a[0] ^ b[0]) + popcount(a[1] ^ b[1]);

// Trả {drop, index, credits}: drop = tên trang cần xoá, index = bảng hash trang còn lại,
// credits = hash của mọi trang credit đã từng thấy.
async function dedupItems(items, oldIndex, knownCredits) {
    const index = new Map();
    for (const item of items) {
        if (!Number.isFinite(dirNum(item.name))) continue;
        // Chỗ tiết kiệm: trang đã có hash từ lần trước thì dùng lại, không giải mã lại ảnh.
        const hash = oldIndex.get(item.name) ?? await hashOf(item.data);
        if (hash) index.set(item.name, hash);
    }

    const creditBits = knownCredits.map(hashBits);
    const drop = new Set();
    const rest = new Map();

    // Trang khớp credit ĐÃ BIẾT thì bỏ ngay, không cần đợi đủ hai chương. Thiếu bước này
    // thì sau khi credit bị xoá khỏi file, chương sau không còn gì để so nữa -> credit
    // lại lọt vào, và nó luân phiên một chương sạch một chương bẩn.
    for (const [name, hex] of index) {
        const bits = hashBits(hex);
        if (creditBits.some(credit => hashDistance(credit, bits) <= HAMMING_MAX)) drop.add(name);
        else rest.set(name, hex);
    }

    // Phần còn lại gom nhóm: trùng ở >=2 chương là credit mới, ghi nhận để lần sau bỏ ngay.
    const credits = [...knownCredits];
    const groups = [];
    for (const [name, hex] of rest) {
        const bits = hashBits(hex);
        const near = groups.find(group => hashDistance(group.bits, bits) <= HAMMING_MAX);
        if (near) {
            near.names.push(name);
            near.chapters.add(dirNum(name));
        } else {
            groups.push({bits, hex, names: [name], chapters: new Set([dirNum(name)])});
        }
    }
    for (const group of groups) {
        if (group.chapters.size < 2) continue;   // chỉ ở một chương -> nội dung thật
        for (const name of group.names) drop.add(name);
        credits.push(group.hex);
    }

    for (const name of drop) index.delete(name);
    return {drop, index, credits};
}

// dedup = true thì xoá trang credit lặp xuyên chương. Lọc chạy TRƯỚC khi build: lọc sau
// khi đã ghi nghĩa là ghi cả bộ truyện hai lần cho một lần thêm chương.
async function writeCbz({existing, additions, linkCode, title, onStatus, dedup = false}) {
    const {buildZip} = await zipLib();
    let items = [];

    if (existing.zip) {
        for (const entry of existing.zip.files) items.push({name: entry.name, data: existing.zip.bytesOf(entry)});
    }
    for (const {num, files} of additions) {
        for (const [name, data] of Object.entries(files)) items.push({name: `${chapterDir(num)}/${name}`, data});
    }

    // Bảng hash cũ đi kèm trong cbz. openZip tách .hash ra khỏi files nên nó không lọt
    // vào items - phải tự đọc lại rồi tự ghi lại, không thì mỗi lần ghi là mất bảng.
    let {index, credits} = parseIndex(existing.zip?.hash ? existing.zip.bytesOf(existing.zip.hash) : null);
    let removed = 0;
    if (dedup) {
        onStatus?.('Checking.');
        const result = await dedupItems(items, index, credits);
        index = result.index;
        credits = result.credits;
        if (result.drop.size) {
            items = items.filter(item => !result.drop.has(item.name));
            removed = result.drop.size;
        }
    }

    // max tính từ items CÒN LẠI, không phải existing.max + additions: về lý thuyết lọc
    // có thể xoá sạch một chương, lúc đó chương đó không còn tồn tại trong bộ nữa.
    let max = 0;
    for (const item of items) {
        const num = dirNum(item.name);
        if (Number.isFinite(num) && num > max) max = num;
    }

    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
    items.sort((a, b) => collator.compare(a.name, b.name));
    // .link đi cuối và luôn là bản mới nhất - bản cũ trong existing.zip đã bị openZip
    // tách ra khỏi files nên không lọt vào items.
    items.push({name: LINK_ENTRY, data: new TextEncoder().encode(linkCode)});
    if (index.size || credits.length) items.push({name: HASH_ENTRY, data: serializeIndex(index, credits)});

    onStatus?.('Saving.');
    const blob = await buildZip(items);
    const key = mangaKey(title, max);
    await emuxDB(blob, key);
    if (existing.key && existing.key !== key) await deleteFromStore(existing.key);

    return {key, items, removed};
}

// Trang đầu của một chương, tính theo chỉ số trong danh sách ảnh - đúng thứ tự mà
// trình đọc sẽ thấy. Dùng để mở chương mới ngay ở trang 1 thay vì vị trí cũ.
function firstPageOf(items, num) {
    const dir = chapterDir(num) + '/';
    // Chỉ ảnh mới được đếm: openZip tách .link và .hash ra khỏi files, nên nếu tính
    // chúng vào đây thì chỉ số trang sẽ lệch so với thứ tự trình đọc thấy.
    const pages = items.filter(item => item.name !== LINK_ENTRY && item.name !== HASH_ENTRY);
    return Math.max(0, pages.findIndex(item => item.name.startsWith(dir)));
}

// ===== 7. Hỏi lại khi lỗi =====
const askUser = question => confirm(question);

// Cho các bước một-lần (danh sách chương, danh sách trang): lỗi mạng ở đó làm hỏng cả
// chương, nên thử lại tới khi được hoặc người dùng bỏ. Điều kiện "không tìm thấy" cũng
// throw vào đây được, nhờ vậy chương không tồn tại và chương lỗi mạng dùng chung một lối.
async function retryAsk(task, describe, ask = askUser) {
    for (; ;) {
        try {
            return await task();
        } catch (err) {
            console.error(`${describe} failed:`, err.message);
            if (!ask(`${describe}\n\n${err.message}\n\nTry again?`)) throw err;
        }
    }
}

// ===== 8. grabPages: tải ảnh của một chương, KHÔNG nhận thiếu =====
// Vòng lặp chỉ thoát khi mọi trang đã có, hoặc người dùng chủ động bỏ trang lỗi.
// onProgress đếm số trang ĐÃ LẤY ĐƯỢC (không phải số lần thử), nên "23.27" nghĩa là
// 23 trang nằm trong tay - đứng số tức là đang thật sự tắc.
//
// Hai lối rơi vào câu hỏi:
//   - chạy hết một lượt mà vẫn thiếu (404, ảnh hỏng, hết lượt retry)
//   - STALL_MS không thêm được trang nào, dù lượt chưa xong (request treo)
async function grabPages({manga, chapter, context, onProgress, ask = askUser}) {
    const pages = await retryAsk(
        async () => normalizePages(await manga.pages(chapter.url, context), chapter),
        `Chapter ${chapter.num}: page list`, ask);

    const total = pages.length;
    const files = {}, got = new Set(), skipped = new Set(), inflight = new Set();
    let lastProgress = Date.now();

    const remaining = () => [...pages.keys()].filter(index => !got.has(index) && !skipped.has(index));

    const fetchOne = async (index, signal) => {
        inflight.add(index);
        try {
            const page = pages[index];
            const response = await fetchVia(page.url, manga.home, signal);
            let blob = new Blob([await response.arrayBuffer()], {type: response.headers.get('content-type') || ''});
            if (blob.size < MIN_BYTES) throw new Error(`only ${blob.size} bytes`);
            // Móc tuỳ chọn: site nào khoá ảnh thì tự dựng lại trong .link của nó.
            if (manga.processImage) blob = await manga.processImage(blob, page);
            files[pageName(index, page.url, blob.type)] = new Uint8Array(await blob.arrayBuffer());
            got.add(index);
            lastProgress = Date.now();
            onProgress?.(got.size, total);
        } finally {
            inflight.delete(index);
        }
    };

    // Theo lô: 200 ảnh bắn cùng lúc là cách nhanh nhất để bị site chặn.
    const runPass = (indices, signal) => (async () => {
        for (let start = 0; start < indices.length; start += PARALLEL) {
            if (signal.aborted) return;
            const batch = indices.slice(start, start + PARALLEL);
            await Promise.all(batch.map(index => fetchOne(index, signal).catch(err => {
                console.error(`Page ${index + 1} failed:`, err.message);
            })));
        }
    })();

    while (remaining().length) {
        const abort = new AbortController();
        const pass = runPass(remaining(), abort.signal);
        let cancelled = false;

        // Soi 1s một lần thay vì đặt hẹn giờ: mốc đứng-im dựng lại được sau mỗi lần
        // người dùng bấm tiếp, mà không phải dựng lại promise.
        for (; ;) {
            const state = await Promise.race([pass.then(() => 'done'), delay(1000).then(() => 'poll')]);
            if (state === 'done') break;
            if (Date.now() - lastProgress < STALL_MS) continue;

            const stuck = [...inflight].filter(index => !got.has(index));
            if (ask(`Chapter ${chapter.num}: stuck at ${got.size}/${total}.\n\nKeep trying? (Cancel skips ${stuck.length} page(s) and moves on)`)) {
                lastProgress = Date.now();          // cho thêm STALL_MS nữa
                continue;
            }
            abort.abort();
            await pass.catch(() => { });
            stuck.forEach(index => skipped.add(index));
            cancelled = true;
            break;
        }

        onProgress?.(got.size, total);
        if (cancelled) continue;                    // trang chưa thử thì lượt sau tải tiếp

        const still = remaining();
        if (!still.length) break;
        if (ask(`Chapter ${chapter.num}: ${still.length} of ${total} page(s) failed.\n\nRetry them? (Cancel skips them)`)) {
            await delay(1000);                      // lỗi nhanh thì đừng nện server ngay
        } else {
            still.forEach(index => skipped.add(index));
        }
    }

    if (!Object.keys(files).length) throw new Error(`No page could be fetched for chapter ${chapter.num}.`);
    return {files, skipped: skipped.size, total};
}

// ===== 9. syncManga: tải các chương còn thiếu vào cbz của bộ =====
// newest = lấy bao nhiêu chương (0 = tất cả). chap "start" lấy từ đầu danh sách còn
// thiếu, "new" lấy từ cuối. Vì danh sách đã bỏ chương đã có, "start" tự tiếp ở chỗ
// đang đọc dở chứ không quay về chương 1.
async function syncManga(manga, linkCode, {newest = 1, force = false, ask = askUser} = {}) {
    const context = createContext(newest === 0, manga.home);
    await showNotification(" li", "nk.", "", `Scanning.|${manga.title}|`);

    const listed = await retryAsk(
        async () => normalizeChapters(await manga.chapters(context), manga),
        `${manga.title}: chapter list`, ask);
    const existing = await openExisting(manga.title);

    // "new" lấy từ CUỐI danh sách; "start" và số chương lấy từ ĐẦU. Vì danh sách đã bỏ
    // chương đã có, hai dạng sau tự tiếp ở chỗ đang đọc dở chứ không quay lại điểm đầu.
    const from = chapFrom(manga);
    const all = from === null ? listed : listed.filter(chapter => chapter.num >= from);
    if (!all.length) throw new Error(`"${manga.title}" has no chapter at or after ${from}. Check chap.`);

    let queue = force ? all : all.filter(chapter => !existing.have.has(chapter.num));
    if (newest > 0) queue = from === null ? queue.slice(-newest) : queue.slice(0, newest);

    if (!queue.length) {
        page00.hidden = true;
        alert('Already up to date');
        return {key: existing.key, saved: 0};
    }

    const additions = [];
    let holes = 0;
    for (const [position, chapter] of queue.entries()) {
        const head = `${position + 1}.${queue.length}`;
        try {
            const {files, skipped} = await grabPages({
                manga, chapter, context, ask,
                onProgress: (done, total) => showNotification(" li", "nk.", "", `${head}|Chapter_${chapter.num}.|${done}.${total}|`)
            });
            additions.push({num: chapter.num, files});
            holes += skipped;
        } catch (err) {
            console.error(`Chapter ${chapter.num} failed:`, err.message);
        }
    }

    if (!additions.length) {
        page00.hidden = true;
        await message('#nothing_saved');
        return {key: existing.key, saved: 0};
    }

    const {key, items} = await writeCbz({existing, additions, linkCode, title: manga.title});
    // Mở ngay ở chương sớm nhất vừa tải, không phải vị trí đọc cũ.
    local(`page_${key}`, firstPageOf(items, additions[0].num));

    page00.hidden = true;
    if (typeof listGame === 'function') listGame();
    // Trang bị bỏ là do người dùng chủ động chọn, nhưng vẫn phải nói ra - không thì nó
    // lại thành chương thiếu âm thầm như trước.
    await message(holes ? `${additions.length} chapter saved, ${holes} page(s) skipped` : `${additions.length} chapter saved`);
    return {key, saved: additions.length, holes};
}

// ===== 10. continueFrom: trình đọc hết chương, tải chương sau =====
// Nhận luôn zip mà trình đọc đang mở, nên không đọc lại cả bộ truyện từ IndexedDB.
// Trả về {key, page} để trình đọc mở đúng trang đầu chương mới.
async function continueFrom({zip, onStatus, ask = askUser}) {
    if (!zip?.link) throw new Error('This .cbz was not created by Link.');

    onStatus?.('Waiting.');
    const linkCode = new TextDecoder().decode(zip.bytesOf(zip.link));
    const manga = await loadLink(linkCode);

    const have = new Set();
    let max = 0;
    for (const entry of zip.files) {
        const num = dirNum(entry.name);
        if (!Number.isFinite(num)) continue;
        have.add(num);
        if (num > max) max = num;
    }

    const context = createContext(false, manga.home);
    // Vẫn áp sàn của chap: nếu cbz mới có chương 1-5 mà .link nhúng đã đổi sang chap:50
    // thì chương sau phải là 50, không phải 6.
    const from = chapFrom(manga);
    const floor = from === null ? -Infinity : from;
    // Trình đọc đang ở cuối chương cao nhất, nên chương sau là chương nhỏ nhất lớn hơn
    // nó. Lỗ hổng ở giữa để dành cho .link với chap:"start" lấp.
    //
    // "Không lấy được danh sách" và "không có chương nào sau đây" đi chung một lối hỏi:
    // cái thứ hai cũng throw, nên người dùng thử lại được cả hai bằng một câu confirm.
    const chapter = await retryAsk(async () => {
        const all = normalizeChapters(await manga.chapters(context), manga);
        const found = all.find(item => item.num > max && item.num >= floor && !have.has(item.num));
        if (!found) throw new Error(`No chapter after ${max}`);
        return found;
    }, `${manga.title}: next chapter after ${max}`, ask);

    const {files} = await grabPages({
        manga, chapter, context, ask,
        onProgress: (done, total) => onStatus?.(`Loading.|${done}.${total}|`)
    });

    const existing = {key: await findCbz(manga.title), zip, have, max};
    const {key, items, removed} = await writeCbz({
        existing, linkCode, title: manga.title,
        additions: [{num: chapter.num, files}],
        onStatus,
        dedup: true
    });
    if (removed) console.log(`[link] removed ${removed} repeated page(s)`);

    if (typeof listGame === 'function') listGame();
    return {key, page: firstPageOf(items, chapter.num)};
}

// ===== 11. Cửa vào =====
async function openLinkFile(file) {
    try {
        const code = await file.text();
        const manga = await loadLink(code);
        const {key} = await syncManga(manga, code);
        // Mở luôn bộ vừa tải - trước đây phải tự bấm trong thư viện.
        if (key && typeof loadGame === 'function') await loadGame(key);
    } catch (err) {
        page00.hidden = true;
        console.error('.link error:', err.message);
        await message(err.message, 4000);
    }
}

async function checkProxy() {
    try {
        const response = await fetch(wrap('https://example.com/'));
        const html = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        assertHtml(html, response);
        console.log(`[✓] Proxy alive: ${linkProxy()}`);
        await message('#proxy_ok');
        return true;
    } catch (err) {
        console.error(`[✗] Proxy error: ${err.message}`);
        await message(err.message, 5000);
        return false;
    }
}

window.Link = {openLinkFile, checkProxy, continueFrom};
