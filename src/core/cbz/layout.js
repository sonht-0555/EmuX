// ===== Bản đồ vị trí các trang =====
// Giữ mảng cộng dồn: offsets[i] = toạ độ đỉnh của trang i tính từ đầu truyện.
// Nhờ nó biết ngay trang nào nằm ở toạ độ nào mà không phải đọc DOM lần nào.
// Thuần, không đụng DOM - xem test/cbz-layout.test.mjs.

// heights: chiều cao từng trang (px). gap: khoảng cách giữa hai trang.
export function createLayout(heights, gap = 0) {
    const n = heights.length;
    const offsets = new Float64Array(n + 1);

    // Dựng lại phần đuôi từ trang `from` trở đi. Sửa chiều cao một trang chỉ
    // ảnh hưởng các trang phía sau nó, phía trước giữ nguyên.
    const rebuild = from => {
        for (let i = from; i < n; i++) offsets[i + 1] = offsets[i] + heights[i] + gap;
    };
    rebuild(0);

    return {
        get count() {return n;},
        get total() {return offsets[n];},          // tổng chiều cao cả truyện
        top: p => offsets[Math.max(0, Math.min(n, p))],
        height: p => heights[p],

        // Trang nằm tại toạ độ y. Tìm nhị phân: trang cuối cùng có đỉnh <= y.
        pageAt(y) {
            if (!(y > 0)) return 0;
            if (y >= offsets[n]) return n - 1;
            let lo = 0, hi = n - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
            }
            return lo;
        },

        // Trả về độ lệch mà mọi trang từ `p+1` trở đi bị đẩy đi, để bên gọi bù scroll.
        setHeight(p, h) {
            if (!(h > 0) || heights[p] === h) return 0;
            const before = offsets[n];
            heights[p] = h;
            rebuild(p);
            return offsets[n] - before;
        }
    };
}
