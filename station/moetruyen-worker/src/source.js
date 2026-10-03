import { ReaderError } from "./errors.js";

export const SOURCE_ORIGIN = "https://truyen.moe";
const navigationHeaders = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none", "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1", "Accept-Language": "en-US,en;q=0.9"
};

export function createSourceSession(fetcher = fetch) {
    const cookies = new Map();
    async function sourceFetch(url, options = {}) {
        let target = new URL(url, SOURCE_ORIGIN);
        for (let redirect = 0; redirect <= 4; redirect++) {
            if (target.origin !== SOURCE_ORIGIN) throw new ReaderError("invalid_reader_origin", "Source endpoint origin invalid");
            const headers = new Headers(options.headers);
            if (cookies.size) headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
            const response = await fetcher(target.href, { ...options, headers, redirect: "manual" });
            const setCookies = typeof response.headers.getSetCookie === "function"
                ? response.headers.getSetCookie() : response.headers.getAll("Set-Cookie");
            for (const cookie of setCookies) {
                const pair = cookie.split(";", 1)[0], separator = pair.indexOf("=");
                if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
            }
            if (![301, 302, 303, 307, 308].includes(response.status)) return response;
            if (options.method && options.method !== "GET") throw new ReaderError("source_redirect", "Unexpected redirect during reader access");
            const location = response.headers.get("Location");
            if (!location) throw new ReaderError("source_redirect", "Source redirect missing destination");
            await response.body?.cancel();
            target = new URL(location, target);
        }
        throw new ReaderError("source_redirect", "Too many source redirects");
    }
    return { sourceFetch, async document(url) {
        const response = await sourceFetch(url, { headers: navigationHeaders });
        if (response.status === 429) throw new ReaderError("RATE_LIMITED", "Nguồn Mòe đang giới hạn request; chờ rồi thử lại.", 429);
        if (!response.ok) throw new ReaderError("source_document_failed", `Source document HTTP ${response.status}`, response.status === 404 ? 404 : 502);
        return response.text();
    } };
}

export function decodeHtml(value) {
    return String(value || "").replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (match, entity) => {
        if (entity[0] !== "#") return { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" }[entity.toLowerCase()];
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

export function attributes(tag) {
    const result = {};
    for (const match of tag.matchAll(/([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4]);
    }
    return result;
}

export async function loadReader(mangaId, chapterNumber, fetcher = fetch) {
    const documentUrl = new URL(`/manga/${mangaId}/chapters/${chapterNumber}`, SOURCE_ORIGIN);
    const session = createSourceSession(fetcher);
    let html;
    for (let attempt = 0; attempt < 2; attempt++) {
        html = await session.document(documentUrl);
        if (/bootstrapUrl\s*:\s*"[^"]+"/.test(html)) break;
    }
    const chapterId = Number(/\bchapterId\s*:\s*(\d+)/.exec(html)?.[1]);
    const match = /\bmedia\s*:\s*(\[[^\r\n]*\])\s*,/.exec(html);
    let media;
    try { media = match && JSON.parse(match[1]); } catch { }
    if (!Number.isSafeInteger(chapterId) || chapterId < 1 || !Array.isArray(media)) {
        throw new ReaderError("reader_metadata_changed", "Trang đọc không trả metadata IMGX hợp lệ; cần cập nhật adapter trong Worker.");
    }
    const pages = media.filter(page => typeof page.storageKey === "string" && page.storageKey.startsWith("chapters/")
        && !page.storageKey.endsWith("/0.js"));
    if (!pages.length || pages.some(page => !Number.isSafeInteger(page.pageIndex) || page.pageIndex < 0)
        || new Set(pages.map(page => page.pageIndex)).size !== pages.length) {
        throw new ReaderError("reader_metadata_changed", "Reader page indexes invalid");
    }
    pages.sort((a, b) => a.pageIndex - b.pageIndex);
    return { chapterId, documentUrl, html, sourceFetch: session.sourceFetch, pages };
}
