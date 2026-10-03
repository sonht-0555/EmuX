import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, createFetchMock } from "miniflare";
import { build } from "esbuild";
import { encryptImage, image, imageId, storageKey } from "./helpers.js";
import { toBase64Url } from "../src/reader-access.js";

async function runtime(mock) {
    const bundle = await build({ entryPoints: ["src/index.js"],bundle: true,write: false,format: "esm",platform: "browser" });
    return new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
        compatibilityDate: "2023-12-01", fetchMock: mock });
}

test("workerd preserves session cookies and reports unavailable bootstrap", async () => {
    const mock = createFetchMock(); mock.disableNetConnect();
    const source = mock.get("https://truyen.moe");
    const document = 'chapterId: 986, media: [{"pageIndex":0,"storageKey":"chapters/test.js"}], bootstrapUrl: "", requestPath: "/page-access"';
    source.intercept({ path: "/manga/45/chapters/1" }).reply(200, document,
        { headers: { "set-cookie": "reader.sid=test; Path=/" } });
    source.intercept({ path: "/manga/45/chapters/1", headers: { cookie: "reader.sid=test" } })
        .reply(200, document);
    const mf = await runtime(mock);
    try {
        const response = await mf.dispatchFetch("https://worker.test/api/v1/manga/45/chapters/1/pages");
        assert.equal(response.status, 502);
        assert.equal((await response.json()).code, "reader_capability_unavailable");
        mock.assertNoPendingInterceptors();
    } finally { await mf.dispose(); }
});

for (let profile = 1; profile <= 10; profile++) {
test(`workerd decrypts p${String(profile).padStart(2,"0")} into exact WebP bytes`, async () => {
    const { key, binary } = await encryptImage(profile);
    const mock = createFetchMock(); mock.disableNetConnect();
    mock.get("https://i.truyen.moe").intercept({ path: "/test.js" }).reply(200, Buffer.from(binary));
    const url = new URL("https://worker.test/api/image");
    url.search = new URLSearchParams({ url: "https://i.truyen.moe/test.js", k: toBase64Url(key), imageId, storageKey });
    const mf = await runtime(mock);
    try {
        const response = await mf.dispatchFetch(url);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "image/webp");
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
    } finally { await mf.dispose(); }
});
}
