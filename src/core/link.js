// ===== 0. Constants =====
const PROXY_DEFAULT = 'https://emux-cors.hoangtuanson91.workers.dev/proxy?url=';
const PARALLEL = 5;
const RETRY = 2;
const MIN_BYTES = 1024;
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
const EXT_OF_MIME = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'};

// ===== 1. Network =====
const linkProxy = () => local('link_proxy') || PROXY_DEFAULT;
function wrap(target, referer) {
    if (/^(data|blob):/i.test(target)) return target;
    try {if (new URL(target, location.href).origin === location.origin) return target;} catch (err) { }
    const prefix = linkProxy();
    const url = prefix + encodeURIComponent(target);
    return referer && prefix.includes('?') ? `${url}&ref=${encodeURIComponent(referer)}` : url;
}

async function fetchVia(target, referer) {
    let lastError;
    for (let attempt = 0; attempt <= RETRY; attempt++) {
        try {
            const response = await fetch(wrap(target, referer));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } catch (err) {
            lastError = err;
            if (attempt < RETRY) await delay(400 * (attempt + 1));
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
};

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
const padNum = num => {
    const [whole, fraction] = String(num).split('.');
    return whole.padStart(3, '0') + (fraction ? '-' + fraction : '');
};
const sanitizeName = str => str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
const chapterKey = (manga, num) => `${sanitizeName(manga.title)}'${padNum(num)}.cbz`;

function pageName(index, url, contentType) {
    const fromUrl = url.match(IMG_EXT);
    const ext = fromUrl ? fromUrl[1].toLowerCase().replace('jpeg', 'jpg') : (EXT_OF_MIME[(contentType || '').split(';')[0].trim().toLowerCase()] || 'jpg');
    return `${String(index + 1).padStart(4, '0')}.${ext}`;
}

// ===== 6. Storage =====
async function savedKeys() {
    return new Set((await listStore('games')).filter(key => key.toLowerCase().endsWith('.cbz')));
}

function packCbz(files) {
    const level = Number(local('link_zip_level')) || 0;
    return new Promise((resolve, reject) => {
        fflate.zip(files, {level}, (err, data) => err ? reject(err) : resolve(new Blob([data], {type: 'application/vnd.comicbook+zip'})));
    });
}

// ===== 7. grabChapter: one chapter -> .cbz -> EmuxDB =====
async function grabChapter({manga, chapter, context = null, force = false, onProgress}) {
    const key = chapterKey(manga, chapter.num);
    if (!force && (await savedKeys()).has(key)) return {key, skipped: true};

    const ctx = context || createContext(false, manga.home);
    const pages = normalizePages(await manga.pages(chapter.url, ctx), chapter);
    const files = {};
    let done = 0, failed = 0;

    // Batched: firing 200 images at once is the fastest way to get blocked.
    for (let start = 0; start < pages.length; start += PARALLEL) {
        const batch = pages.slice(start, start + PARALLEL);
        await Promise.all(batch.map(async (page, offset) => {
            const index = start + offset;
            try {
                const response = await fetchVia(page.url, manga.home);
                let blob = new Blob([await response.arrayBuffer()], {type: response.headers.get('content-type') || ''});
                if (blob.size < MIN_BYTES) throw new Error(`only ${blob.size} bytes`);
                // Optional hook: a site that locks its images rebuilds them in its own .link.
                if (manga.processImage) blob = await manga.processImage(blob, page);
                files[pageName(index, page.url, blob.type)] = new Uint8Array(await blob.arrayBuffer());
            } catch (err) {
                failed++;
                console.error(`Page ${index + 1} failed:`, err.message);
            }
            onProgress?.(++done, pages.length);
        }));
    }

    const count = Object.keys(files).length;
    if (!count) throw new Error(`No page could be fetched for chapter ${chapter.num}.`);

    const blob = await packCbz(files);
    await emuxDB(blob, key);
    return {key, pages: count, failed, bytes: blob.size, skipped: false};
}

// ===== 8. syncManga: grab the missing chapters =====
async function syncManga(manga, {newest = 1, force = false} = {}) {
    const context = createContext(newest === 0, manga.home);
    await showNotification(" li", "nk.", "", `Scanning...|${manga.title}|`);

    const all = normalizeChapters(await manga.chapters(context), manga);
    const saved = await savedKeys();
    let queue = force ? all : all.filter(chapter => !saved.has(chapterKey(manga, chapter.num)));
    if (newest > 0) queue = queue.slice(-newest);

    if (!queue.length) {
        page00.hidden = true;
        alert('Already up to date');
        return [];
    }

    const results = [];
    for (const [position, chapter] of queue.entries()) {
        const head = `${position + 1}.${queue.length}`;
        try {
            results.push(await grabChapter({
                manga, chapter, context, force,
                onProgress: (done, total) => showNotification(" li", "nk.", "", `Chapter_${chapter.num}...|${done}.${total}|`)
            }));
        } catch (err) {
            console.error(`Chapter ${chapter.num} failed:`, err.message);
            results.push({num: chapter.num, error: err.message});
        }
    }

    page00.hidden = true;
    const ok = results.filter(result => result.key && !result.skipped).length;
    if (typeof listGame === 'function') listGame();
    await message(ok ? `${ok} chapter saved` : '#nothing_saved');
    return results;
}

// ===== 9. Entry points =====
async function openLinkFile(file) {
    try {
        return await syncManga(await loadLink(await file.text()));
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

window.Link = {openLinkFile, checkProxy};
