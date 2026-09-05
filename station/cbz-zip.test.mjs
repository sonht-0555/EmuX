// Chạy: node --test test/
// Kiểm tra tầng dữ liệu của trình đọc CBZ - đọc ZIP và lấy kích thước ảnh từ header.
// Fixture được dựng ngay trong test nên không cần file nhị phân trong repo.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
globalThis.fflate = require('../src/utils/zip.js');   // zip.js dùng fflate như biến toàn cục

const {openZip, imageSize, isScan, shortName, HEADER_BYTES} = await import('../src/core/cbz/zip.js');

// Kích thước lẻ để lộ lỗi lệch 1 đơn vị
const W = 1601, H = 2399;

const be16 = n => [n >> 8 & 255, n & 255];
const be32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const le16 = n => [n & 255, n >> 8 & 255];
const le24 = n => [n & 255, n >> 8 & 255, n >> 16 & 255];
const le32 = n => [n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24 & 255];
const ascii = s => [...s].map(c => c.charCodeAt(0));
const bytes = (...parts) => new Uint8Array(parts.flat());

const FIXTURES = {
    png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), ascii('IHDR'), be32(W), be32(H), [8, 2, 0, 0, 0]),
    gif: bytes(ascii('GIF89a'), le16(W), le16(H), [0xf0, 0, 0], new Array(6).fill(0), [0x3b]),
    // JPEG với EXIF 20KB chen trước SOF0: bắt buộc phải đi theo độ dài segment mới tìm ra
    jpg: bytes([0xFF, 0xD8], [0xFF, 0xE1], be16(2 + 20000), ascii('Exif\0\0'), new Array(19994).fill(0),
               [0xFF, 0xC0], be16(17), [8], be16(H), be16(W), [3], [1, 17, 0, 2, 17, 1, 3, 17, 1], [0xFF, 0xD9]),
    webpX: bytes(ascii('RIFF'), le32(18), ascii('WEBP'), ascii('VP8X'), le32(10), [0x10, 0, 0, 0], le24(W - 1), le24(H - 1)),
    webpL: bytes(ascii('RIFF'), le32(13), ascii('WEBP'), ascii('VP8L'), le32(5), [0x2f], le32((W - 1) | ((H - 1) << 14))),
    avif: bytes(be32(20), ascii('ftypavif'), ascii('avifmif1'), new Array(40).fill(0),
                be32(20), ascii('ispe'), be32(0), be32(W), be32(H)),
};

test('imageSize đọc đúng kích thước của mọi định dạng', () => {
    for (const [name, buf] of Object.entries(FIXTURES)) {
        assert.deepEqual(imageSize(buf), {w: W, h: H}, `sai ở ${name}`);
    }
});

test('imageSize trả null thay vì ném lỗi khi dữ liệu hỏng', () => {
    for (const bad of [null, undefined, new Uint8Array(0), new Uint8Array(4), new Uint8Array(64).fill(0x37),
                       bytes([0xFF, 0xD8, 0xFF, 0xE0], be16(16), new Array(20).fill(0))]) {
        assert.equal(imageSize(bad), null);
    }
});

test('isScan và shortName', () => {
    assert.equal(isScan('a/b.scan'), true);
    assert.equal(isScan('a/b.scan.jpg'), true);
    assert.equal(isScan('a/b.jpg'), false);
    assert.equal(shortName('pages/sub/001.jpg'), '001');
});

// Dựng một .cbz thật: cùng nội dung, nửa stored nửa deflate
const makeCbz = () => {
    const files = {
        'pages/001.jpg': [FIXTURES.jpg, {level: 0}],
        'pages/002.png': [FIXTURES.png, {level: 0}],
        'pages/003.jpg': [FIXTURES.jpg, {level: 6}],
        'pages/004.png': [FIXTURES.png, {level: 6}],
        'pages/005.webp': [FIXTURES.webpX, {level: 6}],
        'pages/010.gif': [FIXTURES.gif, {level: 0}],
        '__MACOSX/junk.jpg': [FIXTURES.jpg, {level: 0}],
        'trans.json': [new TextEncoder().encode('[{"page":"001","text":"<b>&"}]'), {level: 0}],
    };
    return fflate.zipSync(files);
};

test('openZip: lọc rác, sắp xếp tự nhiên, tách file dịch', () => {
    const zip = openZip(makeCbz());
    assert.deepEqual(zip.files.map(f => f.name),
        ['pages/001.jpg', 'pages/002.png', 'pages/003.jpg', 'pages/004.png', 'pages/005.webp', 'pages/010.gif']);
    assert.equal(zip.json.name, 'trans.json');
});

test('prefix + imageSize hoạt động với cả entry stored lẫn deflate', () => {
    const zip = openZip(makeCbz());
    for (const entry of zip.files) {
        const size = imageSize(zip.prefix(entry, HEADER_BYTES));
        assert.deepEqual(size, {w: W, h: H}, `sai ở ${entry.name} (method ${entry.method})`);
    }
    // phải có cả hai kiểu nén, không thì test này không chứng minh được gì
    assert.ok(zip.files.some(f => f.method === 0) && zip.files.some(f => f.method === 8));
});

test('prefix dừng sớm, không giải nén cả tấm ảnh', () => {
    const zip = openZip(makeCbz());
    const deflated = zip.files.find(f => f.method === 8 && f.name.endsWith('.jpg'));
    const pre = zip.prefix(deflated, 4096);
    assert.ok(pre.length <= 4096, `prefix dài ${pre.length}, lẽ ra <= 4096`);
    assert.ok(deflated.size > 20000, 'ảnh gốc phải lớn hơn nhiều so với prefix');
});

test('extract trả về đủ byte gốc và đúng MIME', async () => {
    const zip = openZip(makeCbz());
    const cases = [['pages/003.jpg', FIXTURES.jpg, 'image/jpeg'], ['pages/002.png', FIXTURES.png, 'image/png'],
                   ['pages/005.webp', FIXTURES.webpX, 'image/webp']];
    for (const [name, original, type] of cases) {
        const blob = zip.extract(zip.files.find(f => f.name === name));
        assert.equal(blob.type, type);
        assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), original, `nội dung lệch ở ${name}`);
    }
});

test('openZip báo lỗi rõ ràng khi không phải ZIP', () => {
    assert.throws(() => openZip(new Uint8Array(100).fill(7)), /chuẩn file ZIP/);
});
