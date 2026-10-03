import { ReaderError } from "./errors.js";
import { SOURCE_ORIGIN, attributes, createSourceSession, decodeHtml } from "./source.js";

export function parseCatalog(html, mangaId, page, workerOrigin) {
    let canonical, series;
    for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
        const attrs = attributes(match[1]);
        if (attrs.rel === "canonical") { try { canonical = new URL(attrs.href, SOURCE_ORIGIN); } catch {} }
    }
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (attributes(match[1]).type !== "application/ld+json") continue;
        try {
            const value = JSON.parse(match[2]);
            const entries = Array.isArray(value) ? value : value["@graph"] || [value];
            series ||= entries.find(entry => ["ComicSeries", "BookSeries"].includes(entry["@type"]));
        } catch { }
    }
    // Paginated documents omit JSON-LD but retain the visible series heading.
    if (!series?.name) {
        for (const match of html.matchAll(/<h1\b([^>]*)>([^<]*)<\/h1\s*>/gi)) {
            if (!(attributes(match[1]).class || "").split(/\s+/).includes("manga-detail-title")) continue;
            const name = decodeHtml(match[2]).trim();
            if (name && !name.includes("${")) series = { name };
        }
    }
    if (!canonical || canonical.origin !== SOURCE_ORIGIN || !canonical.pathname.startsWith(`/manga/${mangaId}-`)
        || !series?.name) throw new ReaderError("catalog_format_changed", "Nguồn không trả thông tin truyện hợp lệ; cần cập nhật adapter Worker.");
    const chapters = new Map();
    let totalPages = page;
    for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
        const attrs = attributes(match[1]);
        if (!attrs.href) continue;
        let target;
        try { target = new URL(attrs.href, SOURCE_ORIGIN); } catch { continue; }
        if (target.origin !== SOURCE_ORIGIN) continue;
        if (target.pathname === canonical.pathname) {
            const next = Number(target.searchParams.get("chapterPage"));
            if (Number.isSafeInteger(next) && next > totalPages) totalPages = next;
        }
        const id = Number(attrs["data-chapter-id"]), numberText = attrs["data-chapter-number"];
        if (!Number.isSafeInteger(id) || id < 1 || !/^\d+(?:\.\d+)?$/.test(numberText || "")) continue;
        if (target.pathname !== `${canonical.pathname}/chapters/${numberText}`) continue;
        chapters.set(id, { id, number: Number(numberText), numberText, title: null,
            pagesUrl: new URL(`/api/v1/manga/${mangaId}/chapters/${numberText}/pages`, workerOrigin).href });
    }
    if (!chapters.size && Number(series.numberOfItems) !== 0) {
        throw new ReaderError("catalog_format_changed", "Nguồn có chương nhưng Worker không đọc được danh sách chương.");
    }
    return { success: true, data: { manga: { id: mangaId, slug: canonical.pathname.slice(7), title: series.name },
        chapters: [...chapters.values()].sort((a, b) => b.number - a.number) },
        meta: { pagination: { page, totalPages } } };
}

export async function listChapters(mangaId, page, workerOrigin, fetcher = fetch) {
    const url = new URL(`/manga/${mangaId}`, SOURCE_ORIGIN);
    if (page > 1) url.searchParams.set("chapterPage", String(page));
    return parseCatalog(await createSourceSession(fetcher).document(url), mangaId, page, workerOrigin);
}
