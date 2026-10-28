import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { decodeImgxV3, extractImx4 } from "../src/imgx-v3.js";
import { toBase64Url } from "../src/reader-access.js";
import { encryptImageV3, encryptImage, webpWithChunks, image, imageId, storageKey, random } from "./helpers.js";

test("V3 restores OpenSSL WebP and authenticates key, context, dimensions, nonce and ciphertext", async () => {
    const { key, binary } = encryptImageV3();
    assert.deepEqual(await decodeImgxV3(binary, key, storageKey, imageId), image);
    await assert.rejects(() => decodeImgxV3(binary, random(32), storageKey, imageId));
    await assert.rejects(() => decodeImgxV3(binary, key, "wrong.js", imageId));
    await assert.rejects(() => decodeImgxV3(binary, key, storageKey, "f".repeat(32)));
    for (const offset of [8, 12, 13, 25, binary.length - 1]) {
        const damaged = binary.slice(); damaged[offset] ^= 1;
        await assert.rejects(() => decodeImgxV3(damaged, key, storageKey, imageId));
    }
    for (const length of [0, 25, 41, binary.length - 1]) {
        await assert.rejects(() => decodeImgxV3(binary.subarray(0, length), key, storageKey, imageId));
    }
});

test("V3 opens nested V4 only with its separate V4 key", async () => {
    const nested = await encryptImage();
    const { key, binary } = encryptImageV3(webpWithChunks(["JUNK", new Uint8Array([1])], ["IMX4", nested.binary]));
    assert.deepEqual(await decodeImgxV3(binary, key, storageKey, imageId, nested.key), image);
    await assert.rejects(() => decodeImgxV3(binary, key, storageKey, imageId), { code: "v4_key_missing" });
    await assert.rejects(() => decodeImgxV3(binary, key, storageKey, imageId, key));
    const damaged = nested.binary.slice(); damaged[damaged.length - 1] ^= 1;
    const wrapped = encryptImageV3(webpWithChunks(["IMX4", damaged]));
    await assert.rejects(() => decodeImgxV3(wrapped.binary, wrapped.key, storageKey, imageId, nested.key));
});

test("V3 rejects malformed, duplicate, truncated and unknown protected WebP chunks", async () => {
    const { binary } = await encryptImage();
    const valid = webpWithChunks(["IMX4", binary]);
    const size = valid.slice(); size[4] ^= 1;
    const truncated = valid.slice(); new DataView(truncated.buffer).setUint32(16, 0xffffffff, true);
    const wrong = binary.slice(); wrong[4] = 5;
    for (const bytes of [size, truncated, webpWithChunks(["IMX4", binary], ["IMX4", binary]),
        webpWithChunks(["IMX4", wrong]), webpWithChunks(["IMX4", binary.subarray(0, 78)])]) {
        assert.throws(() => extractImx4(bytes), { code: "imgx_invalid_container" });
        const wrapped = encryptImageV3(bytes);
        await assert.rejects(() => decodeImgxV3(wrapped.binary, wrapped.key, storageKey, imageId), { code: "imgx_invalid_container" });
    }
});

test("image endpoint dispatches V3, requires k3 and rejects non-image plaintext", async () => {
    const original = globalThis.fetch;
    const url = new URL("https://worker.test/api/image");
    const { key, binary } = encryptImageV3();
    url.search = new URLSearchParams({ url: "https://i.truyen.moe/test.js", k3: toBase64Url(key), storageKey, imageId });
    try {
        globalThis.fetch = async () => new Response(binary);
        const response = await worker.fetch(new Request(url), {}, {});
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("content-type"), "image/webp");
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
        url.searchParams.delete("k3"); url.searchParams.set("k", toBase64Url(key));
        const missing = await worker.fetch(new Request(url), {}, {});
        assert.equal((await missing.json()).code, "v3_key_missing");
        const invalid = encryptImageV3(new Uint8Array([1, 2, 3]));
        url.searchParams.set("k3", toBase64Url(invalid.key));
        globalThis.fetch = async () => new Response(invalid.binary);
        const bad = await worker.fetch(new Request(url), {}, {});
        assert.equal(bad.status, 502);
        assert.equal((await bad.json()).code, "imgx_output_invalid");
    } finally { globalThis.fetch = original; }
});
