import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { repoPath } from "../scripts/repo-path.mjs";
import worker, { decodeImgxV4 } from "../src/index.js";
import { requestReaderPages, toBase64Url, fromBase64Url } from "../src/reader-access.js";

import { enc, random, imageId, storageKey, image, encryptImage } from "./helpers.js";

async function withFetch(fetcher, run) {
    const original = globalThis.fetch;
    globalThis.fetch = fetcher;
    try { return await run(); } finally { globalThis.fetch = original; }
}

test("p01 uses the full authenticated envelope for payload AAD and restores exact WebP bytes", async () => {
    const { key, binary } = await encryptImage();
    assert.deepEqual(await decodeImgxV4(binary, key, storageKey, imageId), image);
    const damaged = binary.slice(); damaged[damaged.length - 1] ^= 1;
    await assert.rejects(() => decodeImgxV4(damaged, key, storageKey, imageId));
    await assert.rejects(() => decodeImgxV4(binary, key, "wrong/storage.js", imageId));
    await assert.rejects(() => decodeImgxV4(binary, random(32), storageKey, imageId));
});

test("unknown profiles are rejected after envelope authentication", async () => {
    const { key, binary } = await encryptImage(11);
    await assert.rejects(() => decodeImgxV4(binary, key, storageKey, imageId), { code: "imgx_invalid_metadata" });
});

test("/api/image returns decrypted WebP; failed decryption never returns an image", async () => {
    const { key, binary } = await encryptImage();
    const url = new URL("https://worker.test/api/image");
    url.search = new URLSearchParams({ url: "https://i.truyen.moe/test.js", k: toBase64Url(key), storageKey, imageId });
    await withFetch(async () => new Response(binary), async () => {
        const good = await worker.fetch(new Request(url), {}, {});
        assert.equal(good.status, 200);
        assert.equal(good.headers.get("content-type"), "image/webp");
        assert.deepEqual(new Uint8Array(await good.arrayBuffer()), image);
        url.searchParams.set("k", toBase64Url(random(32)));
        const bad = await worker.fetch(new Request(url), {}, {});
        assert.equal(bad.status, 502);
        assert.equal((await bad.json()).code, "image_decryption_failed");
    });
});

test("empty document bootstrap stops before page-access rather than issuing fake proof", async () => {
    let posts = 0;
    const fetcher = async (url, options = {}) => {
        if (options.method === "POST") posts++;
        return new Response('bootstrapUrl: "", requestPath: "/page-access"');
    };
    await assert.rejects(() => requestReaderPages(986, [0], fetcher, { documentUrl: "https://truyen.moe/manga/45-test/chapters/1" }), { code: "reader_capability_unavailable" });
    assert.equal(posts, 0);
});

test("/api/pages rejects invalid chapter and page windows before any upstream call", async () => {
    await withFetch(() => { throw Error("unexpected upstream call"); }, async () => {
        const invalid = await worker.fetch(new Request("https://worker.test/api/pages?chapterId=NaN"), {}, {});
        assert.equal(invalid.status, 400);
        const tooMany = await worker.fetch(new Request("https://worker.test/api/pages?chapterId=986", {
            method: "POST", body: JSON.stringify({ pageIndexes: Array.from({ length: 101 }, (_, i) => i) })
        }), {}, {});
        assert.equal(tooMany.status, 400);
        for (const indexes of ["", "0,0", "-1", "0,abc", "1e2"]) {
            const badQuery = await worker.fetch(new Request(`https://worker.test/api/pages?chapterId=986&pageIndexes=${indexes}`), {}, {});
            assert.equal(badQuery.status, 400);
        }
    });
});

for (const count of [1, 12]) {
test(`anonymous reader session opens ${count} pages with sequenced proofs and V4 channel keys`, async () => {
    const indexes = Array.from({ length: count }, (_, i) => i);
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const serverPub = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    const secret = random(32), readerInstanceId = "a".repeat(48), wrappedV4Key = toBase64Url(random(32));
    const path = "/manga/45-test/chapters/1/page-access", bootstrap = "/reader/bootstrap/capability";
    let clientPub, posted = 0;
    async function derive(proof, info) {
        const clientKey = await crypto.subtle.importKey("raw", fromBase64Url(clientPub),
            { name: "ECDH", namedCurve: "P-256" }, false, []);
        const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, pair.privateKey, 256);
        const hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
        return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode(proof), info: enc.encode(info) },
            hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    }
    async function seal(value, proof) {
        const iv = random(12);
        const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
            additionalData: enc.encode(JSON.stringify(["imgx-reader-channel-v1", clientPub, serverPub, proof]))
        }, await derive(proof, "imgx-reader-channel-v1"), enc.encode(JSON.stringify(value)));
        return { version: "imgx-reader-channel-v1", publicKey: serverPub, iv: toBase64Url(iv),
            ciphertext: toBase64Url(new Uint8Array(ciphertext)) };
    }
    const fetcher = async (url, options = {}) => {
        if (!options.method) {
            const headers = new Headers(options.headers);
            assert.equal(headers.get("Sec-Fetch-Dest"), "document");
            assert.equal(headers.get("Sec-Fetch-Mode"), "navigate");
            assert.equal(headers.get("Sec-Fetch-User"), "?1");
            assert(headers.get("Accept").includes("application/xhtml+xml"));
            return new Response(`requestPath: "${path}", bootstrapUrl: "${bootstrap}", initialIndexes: [58]`, {
                headers: { "Set-Cookie": "reader.sid=test; Path=/; HttpOnly" }
            });
        }
        assert.equal(new Headers(options.headers).get("cookie"), "reader.sid=test");
        const body = JSON.parse(options.body); posted++;
        clientPub = body.readerPublicKey;
        if (url.endsWith(bootstrap)) {
            assert.deepEqual(body.initialPageIndexes, [58]);
            return Response.json({ ok: true, readerInstanceId, serverTime: 123456,
                sealedCapability: await seal([{ chapterId: 986, readerInstanceId, secret: toBase64Url(secret) }], body.bootstrapProof),
                sealedInitialPages: await seal([], body.bootstrapProof) });
        }
        assert(url.endsWith(path));
        const proof = body.pageAccessProof;
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", fromBase64Url(clientPub)))]
            .map(byte => byte.toString(16).padStart(2, "0")).join("");
        const payload = JSON.stringify([proof.version, readerInstanceId, 986, path, "", body.pageIndexes, proof.issuedAt, posted - 1, hash]);
        const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
        assert(await crypto.subtle.verify("HMAC", key, fromBase64Url(proof.proof), enc.encode(payload)));
        assert(body.pageIndexes.length <= 10);
        assert.equal(proof.sequence, posted - 1);
        const batch = [];
        for (const pageIndex of body.pageIndexes) {
            const grant = { imageId, issuedAt: 123456, expiresAt: 234567, nonce: "n", signature: "s" };
            const page = { pageIndex, storageKey, downloadUrl: "https://i.truyen.moe/test.js", grant };
            const iv = random(12);
            const aad = enc.encode(JSON.stringify(["IMGX-READER-PAGE-KEY-v1", [clientPub, serverPub, proof.proof],
                pageIndex, storageKey, imageId, grant.issuedAt, grant.expiresAt, grant.nonce, grant.signature]));
            const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad },
                await derive(proof.proof, "IMGX-READER-PAGE-KEY-v1"), enc.encode(JSON.stringify({ wrappedV4Key })));
            grant.channelKeys = { version: "IMGX-READER-PAGE-KEY-v1", iv: toBase64Url(iv),
                ciphertext: toBase64Url(new Uint8Array(encrypted)) };
            batch.push(page);
        }
        return Response.json({ ok: true, sealedPages: await seal(batch, proof.proof) });
    };
    const pages = await requestReaderPages(986, indexes, fetcher, { documentUrl: "https://truyen.moe/manga/45-test/chapters/1" });
    assert.deepEqual(pages.map(page => page.pageIndex), indexes);
    for (const page of pages) {
        assert.equal(page.grant.wrappedV4Key, wrappedV4Key);
        assert.equal(page.grant.channelKeys, undefined);
    }
    assert.equal(posted, 1 + Math.ceil(count / 10));
});
}

test(".link validates decoded Worker images through the original processImage hook", async () => {
    const source = await readFile(repoPath("station/links/moetruyen.link"), "utf8");
    const { default: link } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
    const blob = new Blob([image], { type: "image/webp" });
    assert.equal(await link.processImage(blob, { workerImage: true }), blob);
    await assert.rejects(() => link.processImage(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]),
        { workerImage: true }), /chưa trả ảnh truyện/);
});

test(".link shows nested Worker errors and reject malformed responses", async () => {
    for (const path of ["station/links/moetruyen.link"]) {
        const source = await readFile(repoPath(path), "utf8");
        const { default: link } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
        const context = { abs: value => value, json: async () => ({ data: { pageUrls: ["https://i.truyen.moe/page.js"] } }) };
        for (const status of [200, 502]) {
            await withFetch(async () => Response.json({ success: false, error: {
                code: "reader_capability_unavailable", message: "Bootstrap unavailable"
            } }, { status }), async () => {
                await assert.rejects(() => link.pages("/api/v1/manga/45/chapters/1/pages", context), error => {
                    assert.match(error.message, new RegExp(`Worker HTTP ${status}`));
                    assert.match(error.message, /reader_capability_unavailable: Bootstrap unavailable/);
                    assert.doesNotMatch(error.message, /\[object Object\]/);
                    return true;
                });
            });
        }
        await withFetch(async () => new Response("upstream failed", { status: 502 }), async () => {
            await assert.rejects(() => link.pages("/api/v1/manga/45/chapters/1/pages", context), /Worker HTTP 502: Phản hồi không phải JSON hợp lệ/);
        });
        let calls = 0;
        await withFetch(async () => {
            calls++;
            return Response.json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } });
        }, async () => {
            await assert.rejects(() => link.pages("/api/v1/manga/45/chapters/1/pages", context), error => {
                assert.equal(error.code, "RATE_LIMITED");
                assert.equal(error.retryable, false);
                assert.match(error.message, /Hủy lượt tải/);
                return true;
            });
        });
        assert.equal(calls, 1);
    }
});
