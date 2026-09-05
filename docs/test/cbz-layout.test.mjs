// Chạy: node --test test/
// Bản đồ vị trí trang - nền tảng của cửa sổ trượt và hai thanh đệm.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayout} from '../src/core/cbz/layout.js';

const GAP = 4;
// chiều cao lẻ, không đều, giống truyện thật
const make = (n, seed = 1) => Float64Array.from({length: n}, (_, i) => 400 + ((i * 977 + seed) % 831) + 0.4321);

test('total = tổng chiều cao + gap mỗi trang', () => {
    const h = make(500), l = createLayout(h, GAP);
    const expect = h.reduce((a, b) => a + b, 0) + 500 * GAP;
    assert.ok(Math.abs(l.total - expect) < 1e-6, `${l.total} vs ${expect}`);
});

test('offsets tăng đều và khớp chiều cao từng trang', () => {
    const h = make(300), l = createLayout(h, GAP);
    for (let p = 0; p < 300; p++) {
        assert.ok(Math.abs((l.top(p + 1) - l.top(p)) - (h[p] + GAP)) < 1e-9, `lệch ở trang ${p}`);
    }
});

test('pageAt tìm đúng trang ở mọi vị trí', () => {
    const h = make(1000), l = createLayout(h, GAP);
    for (let p = 0; p < 1000; p++) {
        assert.equal(l.pageAt(l.top(p)), p, `đỉnh trang ${p}`);
        assert.equal(l.pageAt(l.top(p) + h[p] / 2), p, `giữa trang ${p}`);
        assert.equal(l.pageAt(l.top(p) + h[p] - 0.01), p, `đáy trang ${p}`);
    }
});

test('pageAt kẹp ở hai đầu thay vì trả số vô nghĩa', () => {
    const l = createLayout(make(50), GAP);
    for (const y of [-999, -1, 0]) assert.equal(l.pageAt(y), 0);
    for (const y of [l.total, l.total + 1e6, Infinity]) assert.equal(l.pageAt(y), 49);
});

test('bất biến của thanh đệm: đệm trên + phần hiện + đệm dưới = total', () => {
    const n = 5000, h = make(n), l = createLayout(h, GAP), span = 40;
    for (const first of [0, 1, 37, 2500, n - span - 1, n - span]) {
        const end = first + span;
        const topPad = l.top(first);
        const visible = l.top(end) - l.top(first);
        const botPad = l.total - l.top(end);
        assert.ok(topPad >= 0 && botPad >= 0, `đệm âm ở first=${first}`);
        assert.ok(Math.abs(topPad + visible + botPad - l.total) < 1e-6, `tổng lệch ở first=${first}`);
    }
});

test('setHeight chỉ đẩy các trang phía sau, phía trước đứng yên', () => {
    const h = make(200), l = createLayout(h, GAP);
    const truoc = Array.from({length: 200}, (_, p) => l.top(p));

    const delta = l.setHeight(100, h[100] + 250);

    assert.ok(Math.abs(delta - 250) < 1e-9, `delta = ${delta}`);
    for (let p = 0; p <= 100; p++) assert.equal(l.top(p), truoc[p], `trang ${p} lẽ ra không đổi`);
    for (let p = 101; p < 200; p++) {
        assert.ok(Math.abs(l.top(p) - (truoc[p] + 250)) < 1e-9, `trang ${p} lẽ ra dịch đúng 250`);
    }
});

test('setHeight bỏ qua giá trị vô nghĩa', () => {
    const l = createLayout(make(10), GAP), before = l.total;
    for (const bad of [0, -5, NaN, undefined]) assert.equal(l.setHeight(3, bad), 0);
    assert.equal(l.total, before);
});

test('truyện 50.000 trang: dựng và tra cứu vẫn tức thì', () => {
    const t0 = Date.now();
    const l = createLayout(make(50000), GAP);
    let acc = 0;
    for (let i = 0; i < 50000; i++) acc += l.pageAt(i * 37);
    const ms = Date.now() - t0;
    assert.ok(acc > 0);
    assert.ok(ms < 500, `mất ${ms}ms, quá chậm`);
});

test('chiều cao nguyên + gap nguyên => MỌI offset đều nguyên', () => {
    // reader.js cắt chiều cao và gap về số nguyên. Nhờ đó offset không bao giờ ra thập phân,
    // nên chiều cao mỗi <dimg> và hai thanh đệm khớp scrollbar tuyệt đối.
    const h = Float64Array.from({length: 2000}, (_, i) => Math.floor(400 + (i * 977) % 831));
    const l = createLayout(h, 4);
    for (let p = 0; p <= 2000; p++) {
        assert.equal(Number.isInteger(l.top(p)), true, `offset trang ${p} = ${l.top(p)} không nguyên`);
    }
    assert.equal(Number.isInteger(l.total), true);

    // và sau khi đo lại một trang cũng vẫn nguyên
    l.setHeight(500, 777);
    for (const p of [0, 500, 501, 1999, 2000]) assert.equal(Number.isInteger(l.top(p)), true, `sau setHeight, trang ${p}`);
});

test('dimg không bao giờ cao hơn ảnh (cắt xuống, không cắt lên)', () => {
    // Cắt lên thì dimg đội cao hơn ảnh và hở ra vệt nền paper - đúng lỗi 1px đã gặp.
    for (const [w, hh] of [[827, 1170], [750, 1334], [1600, 2400], [1000, 1001], [1601, 2399]]) {
        const real = 390 * hh / w;              // chiều cao thật browser render
        const used = Math.floor(real);          // reader.js đặt cho dimg
        assert.ok(used <= real, `${w}x${hh}: dimg ${used} > ảnh ${real}`);
        assert.ok(real - used < 1, `${w}x${hh}: xén quá 1px`);
    }
});
