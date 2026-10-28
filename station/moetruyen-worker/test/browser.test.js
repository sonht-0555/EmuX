import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as Thread } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { repoPath } from '../scripts/repo-path.mjs';
import { browserBundle } from '../scripts/build-browser.mjs';
import { encryptImage, encryptImageV3, webpWithChunks, image, imageId, storageKey } from './helpers.js';
import { toBase64Url } from '../src/reader-access.js';
const source = await readFile(repoPath('src/utils/imgx/client.js'), 'utf8');
const { createDecoder } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class BrowserThread {
    constructor(entry) {
        this.thread = new Thread(new URL('./browser-bridge.mjs', import.meta.url), { workerData: { entry: entry.href } });
        this.thread.on('message', data => this.onmessage?.({ data }));
        this.thread.on('error', () => this.onerror?.({}));
    }
    postMessage(data, transfer) { this.thread.postMessage(data, transfer); }
    terminate() { this.thread.terminate(); }
}
const workerUrl = pathToFileURL(repoPath('src/utils/imgx/worker.js'));
const drm = (k, k3) => ({ type: 'emux-imgx-v1', imageId, storageKey,
    ...(k ? { k: toBase64Url(k) } : {}), ...(k3 ? { k3: toBase64Url(k3) } : {}) });

test('checked-in browser worker matches canonical decoder and includes licenses', async () => {
    assert.equal(await readFile(repoPath('src/utils/imgx/worker.js'), 'utf8'), await browserBundle());
    for (const file of ['NOTICE.txt', 'Apache-2.0.txt', 'Noble-MIT.txt']) {
        assert((await readFile(repoPath(`src/utils/imgx/${file}`), 'utf8')).length > 100);
    }
});

test('dedicated browser worker restores all V4 profiles and V3, authenticates failures and survives them', async () => {
    const decoder = createDecoder({ workerUrl, WorkerClass: BrowserThread });
    try {
        await decoder.ready();
        const tasks = [];
        for (let profile = 1; profile <= 10; profile++) {
            const { key, binary } = await encryptImage(profile);
            tasks.push(decoder.decode(new Blob([binary]), drm(key)).then(async blob => {
                assert.equal(blob.type, 'image/webp');
                assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), image);
            }));
        }
        await Promise.all(tasks);
        const nested = await encryptImage(10);
        for (const plaintext of [image, webpWithChunks(['IMX4', nested.binary])]) {
            const { key, binary } = encryptImageV3(plaintext);
            const context = drm(nested.key, key);
            const blob = await decoder.decode(new Blob([binary]), context);
            assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), image);
            // Browser postMessage must not consume or mutate retry context.
            assert.equal(context.k3, toBase64Url(key));
            const damaged = binary.slice(); damaged[damaged.length - 1] ^= 1;
            await assert.rejects(() => decoder.decode(new Blob([damaged]), context), /xác thực/);
            assert.deepEqual(new Uint8Array(await (await decoder.decode(new Blob([binary]), context)).arrayBuffer()), image);
        }
    } finally { decoder.dispose(); }
});

test('worker startup, crashes and timeouts reject pending work and allow recreation', async () => {
    class Fails { constructor() { throw Error('unavailable'); } }
    const bad = createDecoder({ workerUrl, WorkerClass: Fails });
    await assert.rejects(() => bad.ready(), /khởi tạo/);
    let instance;
    class Hangs {
        constructor() { instance = this; queueMicrotask(() => this.onmessage({ data: { ready: 'emux-imgx-v1' } })); }
        postMessage() {}
        terminate() { this.stopped = true; }
    }
    const decoder = createDecoder({ workerUrl, WorkerClass: Hangs, timeoutMs: 15 });
    const pending = decoder.decode(new Blob([image]), drm());
    await assert.rejects(() => pending, /quá thời gian/);
    assert(instance.stopped);
    await decoder.ready();
    const stopped = decoder.decode(new Blob([image]), drm());
    // Allow decode() to register the task before triggering the worker's error event.
    await new Promise(resolve => setTimeout(resolve, 0));
    instance.onerror({});
    await assert.rejects(() => stopped, /gặp lỗi/);
    await decoder.ready(); decoder.dispose();
});
