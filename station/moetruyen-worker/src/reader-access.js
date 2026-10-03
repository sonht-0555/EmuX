const encode = new TextEncoder();
const CHANNEL = "imgx-reader-channel-v1";
const PAGE_KEY = "IMGX-READER-PAGE-KEY-v1";

import { ReaderError } from "./errors.js";
import { createSourceSession } from "./source.js";
export { ReaderError };

export const toBase64Url = bytes => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function fromBase64Url(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new ReaderError("invalid_encoding", "Reader channel encoding invalid");
    }
    return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=")), char => char.charCodeAt(0));
}

export async function createReaderChannel() {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKey = toBase64Url(raw);
    const publicKeyHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))]
        .map(byte => byte.toString(16).padStart(2, "0")).join("");
    const bindings = new WeakMap();
    return {
        publicKey, publicKeyHash,
        async open(sealed, proof) {
            if (sealed?.version !== CHANNEL || !/^[A-Za-z0-9_-]{43}$/.test(proof)) {
                throw new ReaderError("invalid_channel", "Protected reader channel required");
            }
            const serverKey = await crypto.subtle.importKey("raw", fromBase64Url(sealed.publicKey),
                { name: "ECDH", namedCurve: "P-256" }, false, []);
            const shared = new Uint8Array(await crypto.subtle.deriveBits(
                { name: "ECDH", public: serverKey }, pair.privateKey, 256));
            let hkdf;
            try { hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]); }
            finally { shared.fill(0); }
            const derive = info => crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256",
                salt: encode.encode(proof), info: encode.encode(info) }, hkdf,
                { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
            const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM",
                iv: fromBase64Url(sealed.iv), additionalData: encode.encode(JSON.stringify([
                    CHANNEL, publicKey, sealed.publicKey, proof
                ])), tagLength: 128 }, await derive(CHANNEL), fromBase64Url(sealed.ciphertext)));
            try {
                const pages = JSON.parse(new TextDecoder().decode(plaintext));
                if (!Array.isArray(pages)) throw new ReaderError("invalid_pages", "Reader pages invalid");
                if (pages.some(page => page?.grant?.channelKeys)) {
                    const key = await derive(PAGE_KEY);
                    for (const page of pages) bindings.set(page, {
                        key, binding: [publicKey, sealed.publicKey, proof]
                    });
                }
                return pages;
            } finally { plaintext.fill(0); }
        },
        async openPageGrant(page) {
            if (!page.grant?.channelKeys) return page.grant;
            const bound = bindings.get(page), sealed = page.grant.channelKeys;
            if (!bound || sealed.version !== PAGE_KEY) {
                throw new ReaderError("invalid_page_channel", "Reader page key channel required");
            }
            const grant = page.grant;
            const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM",
                iv: fromBase64Url(sealed.iv), tagLength: 128,
                additionalData: encode.encode(JSON.stringify([PAGE_KEY, bound.binding,
                    page.pageIndex, page.storageKey, grant.imageId, grant.issuedAt,
                    grant.expiresAt, grant.nonce, grant.signature]))
            }, bound.key, fromBase64Url(sealed.ciphertext)));
            try {
                const keys = JSON.parse(new TextDecoder().decode(plaintext));
                const { channelKeys, ...opened } = grant;
                for (const name of ["decodeKey", "wrappedDecodeKey", "wrappedContentKey", "wrappedV4Key"]) {
                    if (Object.hasOwn(keys, name)) opened[name] = keys[name];
                }
                return opened;
            } finally { plaintext.fill(0); }
        }
    };
}

// A new document session is scoped to one request. Cookies and keys never enter logs.
export async function requestReaderPages(chapterId, indexes, fetcher = fetch, reader = {}) {
    if (!reader.documentUrl) throw new ReaderError("reader_address_required", "Cần địa chỉ truyện/chương từ API v1; hãy mở file .link mới.", 400);
    const documentUrl = new URL(reader.documentUrl);
    const session = createSourceSession(fetcher);
    const sourceFetch = reader.sourceFetch || session.sourceFetch;
    let html = reader.html;
    if (!html) {
        for (let attempt = 0; attempt < 2; attempt++) {
            html = await session.document(documentUrl);
            if (/bootstrapUrl\s*:\s*"[^"]+"/.test(html)) break;
        }
    }
    const bootstrapMatch = /\bbootstrapUrl\s*:\s*("(?:[^"\\]|\\.)*")/.exec(html);
    const pathMatch = /\brequestPath\s*:\s*("(?:[^"\\]|\\.)*")/.exec(html);
    const bootstrapUrl = bootstrapMatch && JSON.parse(bootstrapMatch[1]);
    if (!bootstrapUrl) {
        throw new ReaderError("reader_capability_unavailable",
            "Trang nguồn không cấp bootstrap cho phiên Worker; chưa thể lấy khóa IMGX V4.");
    }
    const requestPath = pathMatch && JSON.parse(pathMatch[1]);
    if (!requestPath) throw new ReaderError("reader_path_missing", "Reader page-access path missing");
    const initialIndexesMatch = /\binitialIndexes\s*:\s*(\[[\d,\s]*\])/.exec(html);
    const initialIndexes = initialIndexesMatch ? JSON.parse(initialIndexesMatch[1]) : [];
    async function post(url, body) {
        const response = await sourceFetch(url, { method: "POST", headers: {
            Accept: "application/json", "Content-Type": "application/json",
            Origin: documentUrl.origin, Referer: documentUrl.href,
            "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin"
        }, body: JSON.stringify(body) });
        const json = await response.json();
        if (!response.ok || json.ok !== true) {
            throw new ReaderError(json.code || "reader_access_failed", `Reader access HTTP ${response.status}`, 502);
        }
        return json;
    }
    const channel = await createReaderChannel();
    const bootstrapProof = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const initial = await post(bootstrapUrl, { readerPublicKey: channel.publicKey,
        bootstrapProof, initialPageIndexes: initialIndexes });
    const [capability] = await channel.open(initial.sealedCapability, bootstrapProof);
    const pages = await channel.open(initial.sealedInitialPages, bootstrapProof);
    if (!capability || capability.chapterId !== chapterId || capability.readerInstanceId !== initial.readerInstanceId
        || !/^[a-f0-9]{48}$/.test(capability.readerInstanceId) || !Number.isFinite(initial.serverTime)) {
        throw new ReaderError("reader_capability_invalid", "Reader capability invalid");
    }
    const requested = new Map(pages.map(page => [page.pageIndex, page]));
    if (!indexes.every(index => pages.some(page => page.pageIndex === index))) {
        const secret = fromBase64Url(capability.secret);
        let signingKey;
        try { signingKey = await crypto.subtle.importKey("raw", secret,
            { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); }
        finally { secret.fill(0); capability.secret = ""; }
        const missing = indexes.filter(index => !requested.has(index));
        const started = performance.now();
        let sequence = 0;
        // One document/channel per chapter window; the source accepts ten indexes per proof.
        for (let offset = 0; offset < missing.length; offset += 10) {
            const batch = missing.slice(offset, offset + 10);
            const proof = { version: "imgx-page-access-proof-v3", readerInstanceId: capability.readerInstanceId,
                issuedAt: Math.floor(initial.serverTime + performance.now() - started), sequence: ++sequence };
            const payload = JSON.stringify([proof.version, proof.readerInstanceId, chapterId,
                requestPath, "", batch, proof.issuedAt, proof.sequence, channel.publicKeyHash]);
            proof.proof = toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, encode.encode(payload))));
            const access = await post(requestPath, { pageIndexes: batch,
                pageAccessProof: proof, readerPublicKey: channel.publicKey });
            for (const page of await channel.open(access.sealedPages, proof.proof)) requested.set(page.pageIndex, page);
        }
    }
    capability.secret = "";
    const result = [];
    for (const index of indexes) {
        const page = requested.get(index);
        if (!page) throw new ReaderError("reader_page_missing", `Reader omitted page ${index + 1}`);
        result.push({ ...page, grant: await channel.openPageGrant(page) });
    }
    return result;
}
