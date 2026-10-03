import { decodeImgxV4, decoderProfiles } from "./imgx-v4.js";
import { ReaderError, requestReaderPages } from "./reader-access.js";
import { listChapters } from "./catalog.js";
import { loadReader } from "./source.js";

// ----------------------------------------------------------------------------
// UTILS
// ----------------------------------------------------------------------------
const textEncoder = new TextEncoder();
const b64ToBytes = (e) => {
    const bin = atob((e||'').replace(/-/g, '+').replace(/_/g, '/').padEnd((e||'').length + ((4 - ((e||'').length % 4)) % 4), '='));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const bytesToB64 = (e) => btoa(String.fromCharCode(...e)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function nextXorShift32(value) {
    let x = value >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    return x >>> 0;
}
function fnv1a32(bytes) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.byteLength; i++) { hash ^= bytes[i] ?? 0; hash = Math.imul(hash, 0x01000193) >>> 0; }
    return hash || 0x9e3779b9;
}
function unmaskKey(grant, storageKey, wrappedB64) {
    const wrapped = b64ToBytes(wrappedB64);
    const storage = (storageKey || "").trim().replace(/^\/+/, "");
    const material = ["IMGX-GRANT-WRAP-v1", grant.version, grant.algorithm, grant.imageId, grant.issuedAt, grant.expiresAt, grant.nonce, grant.keyNonce, grant.signature, storage].join(".");
    let seed = fnv1a32(textEncoder.encode(material));
    for (let i = 0; i < wrapped.byteLength; i++) {
        if (i % 4 === 0) seed = nextXorShift32((seed + i + 0x9e3779b9) & 0xFFFFFFFF);
        wrapped[i] ^= (seed >>> ((i % 4) * 8)) & 0xff;
    }
    return wrapped;
}

// ----------------------------------------------------------------------------
// WORKER ENTRY
// ----------------------------------------------------------------------------
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

        try {
            if (url.pathname === "/api/status") {
                return Response.json({ version: "2026-10-03-own-source-v1", decoderProfiles }, {
                    headers: { ...corsHeaders, "Cache-Control": "no-store" }
                });
            }
            const catalogRoute = /^\/api\/v1\/manga\/([1-9]\d*)\/chapters$/.exec(url.pathname);
            const pagesRoute = /^\/api\/v1\/manga\/([1-9]\d*)\/chapters\/(\d+(?:\.\d+)?)\/pages$/.exec(url.pathname);
            if (catalogRoute || pagesRoute) {
                if (request.method !== "GET") throw new ReaderError("method_not_allowed", "Use GET", 405);
                const mangaId = Number((catalogRoute || pagesRoute)[1]);
                if (!Number.isSafeInteger(mangaId)) throw new ReaderError("invalid_manga", "Invalid manga ID", 400);
                if (catalogRoute) {
                    const page = Number(url.searchParams.get("page") || 1);
                    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new ReaderError("invalid_page", "Invalid catalog page", 400);
                    return Response.json(await listChapters(mangaId, page, url.origin), {
                        headers: { ...corsHeaders, "Cache-Control": "no-store" }
                    });
                }
            }
            if (url.pathname === "/api/pages" || pagesRoute) {
                let chapterId = pagesRoute ? 1 : Number(url.searchParams.get("chapterId"));
                if (!Number.isSafeInteger(chapterId) || chapterId < 1) {
                    throw new ReaderError("invalid_chapter", "chapterId must be a positive integer", 400);
                }
                const body = request.method === "POST" ? await request.json().catch(() => {
                    throw new ReaderError("invalid_json", "Request body must be JSON", 400);
                }) : {};
                const queryIndexes = url.searchParams.get("pageIndexes");
                if (queryIndexes !== null && !/^\d+(,\d+)*$/.test(queryIndexes)) {
                    throw new ReaderError("invalid_indexes", "pageIndexes query must be comma-separated integers", 400);
                }
                let indexes = body.pageIndexes || (queryIndexes === null ? [0] : queryIndexes.split(",").map(Number));
                if (!Array.isArray(indexes) || indexes.length < 1 || indexes.length > 100
                    || indexes.some(index => !Number.isSafeInteger(index) || index < 0)
                    || new Set(indexes).size !== indexes.length) {
                    throw new ReaderError("invalid_indexes", "pageIndexes must contain 1–100 distinct non-negative integers", 400);
                }
                const mangaId = pagesRoute ? Number(pagesRoute[1]) : Number(url.searchParams.get("mangaId"));
                const chapterNumber = pagesRoute ? pagesRoute[2] : url.searchParams.get("chapterNumber");
                if (!Number.isSafeInteger(mangaId) || mangaId < 1 || !/^\d+(?:\.\d+)?$/.test(chapterNumber || "")) {
                    throw new ReaderError("reader_address_required", "Cần mangaId và chapterNumber; hãy mở file .link mới dùng API v1.", 400);
                }
                const reader = await loadReader(mangaId, chapterNumber);
                if (!pagesRoute && chapterId !== reader.chapterId) throw new ReaderError("chapter_mismatch", "Chapter ID differs from source", 400);
                chapterId = reader.chapterId;
                if (pagesRoute) indexes = reader.pages.map(page => page.pageIndex);
                if (indexes.length > 1000) throw new ReaderError("chapter_too_large", "Chapter exceeds 1000 pages", 400);
                if (indexes.some(index => !reader.pages.some(page => page.pageIndex === index))) throw new ReaderError("invalid_indexes", "Page index outside chapter", 400);
                const pages = await requestReaderPages(chapterId, indexes, fetch, reader);
                const result = pages.map(page => {
                    if (!page.grant?.wrappedV4Key) {
                        throw new ReaderError("v4_key_missing", "Reader chưa cấp wrappedV4Key; không dùng khóa V3 để giải mã V4.");
                    }
                    if (!page.storageKey || !page.grant.imageId) {
                        throw new ReaderError("image_context_missing", "Reader image context missing");
                    }
                    const target = new URL(page.downloadUrl);
                    if (target.protocol !== "https:" || target.hostname !== "i.truyen.moe") {
                        throw new ReaderError("image_origin_invalid", "Reader image URL invalid");
                    }
                    const imageUrl = new URL("/api/image", url.origin);
                    imageUrl.searchParams.set("url", target.href);
                    imageUrl.searchParams.set("storageKey", page.storageKey);
                    imageUrl.searchParams.set("imageId", page.grant.imageId);
                    imageUrl.searchParams.set("k", bytesToB64(unmaskKey(page.grant, page.storageKey, page.grant.wrappedV4Key)));
                    return { pageIndex: page.pageIndex, downloadUrl: imageUrl.href };
                });
                return Response.json({ success: true, data: { pages: result } }, {
                    headers: { ...corsHeaders, "Cache-Control": "no-store" }
                });
            }

            if (url.pathname === "/api/image") {
                const targetUrl = url.searchParams.get("url");
                const k = url.searchParams.get("k");
                const storageKey = url.searchParams.get("storageKey");
                const imageId = url.searchParams.get("imageId");

                let target;
                try { target = new URL(targetUrl); } catch {
                    throw new ReaderError("invalid_image_url", "Image URL invalid", 400);
                }
                if (target.protocol !== "https:" || target.hostname !== "i.truyen.moe") {
                    throw new ReaderError("invalid_image_url", "Image URL origin invalid", 400);
                }
                const imgRes = await fetch(target.href, { redirect: "manual" });
                if (!imgRes.ok) throw new ReaderError("image_fetch_failed", `Image source HTTP ${imgRes.status}`);
                const binary = new Uint8Array(await imgRes.arrayBuffer());

                if (binary.length > 5 && binary[0] === 73 && binary[1] === 77 && binary[2] === 71 && binary[3] === 88 && binary[4] === 4) {
                    if (!k) throw new Error("Missing unmasked key (k) for IMGX V4 image");
                    const contentKeyRaw = b64ToBytes(k);
                    const decrypted = await decodeImgxV4(binary, contentKeyRaw, storageKey, imageId);
                    if (new TextDecoder().decode(decrypted.subarray(0, 4)) !== "RIFF"
                        || new TextDecoder().decode(decrypted.subarray(8, 12)) !== "WEBP") {
                        throw new ReaderError("imgx_output_invalid", "IMGX decoder chưa trả ảnh WebP hợp lệ.");
                    }
                    return new Response(decrypted, { headers: { ...corsHeaders, "Content-Type": "image/webp", "Cache-Control": "private, no-store" } });
                }
                throw new ReaderError("unsupported_image_payload", "Nguồn ảnh không trả IMGX V4 binary; không chuyển PNG chứa dữ liệu mã hóa cho client.");
            }

            return url.pathname.startsWith("/api/")
                ? Response.json({ success: false, code: "route_not_found", error: "Unknown API route" }, { status: 404, headers: corsHeaders })
                : new Response("Moetruyen Worker OK", { headers: corsHeaders });
        } catch (error) {
            const code = typeof error.code === "string" ? error.code
                : url.pathname === "/api/image" ? "image_decryption_failed" : "reader_access_failed";
            console.error(JSON.stringify({ code, path: url.pathname }));
            return Response.json({ success: false, code, error: error instanceof ReaderError
                ? error.message : "Worker xử lý hoặc giải mã thất bại." }, {
                status: error.status || 502, headers: { ...corsHeaders, "Cache-Control": "no-store" }
            });
        }
    }
};

export { decodeImgxV4 };
