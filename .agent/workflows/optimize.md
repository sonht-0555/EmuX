---
description: Tinh chỉnh và tối ưu code JavaScript cho hiệu năng cao nhất
---

# /optimize - Quy trình Tối ưu Code

Khi được gọi, thực hiện các bước sau để tối ưu file JavaScript đang mở hoặc được chỉ định:

## Bước 1: Phân tích cấu trúc
- Xem toàn bộ nội dung file cần tối ưu
- Xác định các hàm chính và luồng xử lý
- Tìm các điểm "nút thắt cổ chai" (bottleneck)

## Bước 2: Tối ưu cấu trúc code
- **Gộp khai báo biến**: Nhiều `var`/`let`/`const` liền nhau → gộp thành 1-2 dòng
- **Xóa dòng trống thừa**: Loại bỏ các dòng trống không cần thiết
- **Rút gọn comment**: Chỉ giữ comment tiêu đề section, xóa comment giải thích hiển nhiên
- **Early return**: Thay `if-else` lồng nhau bằng `if (!condition) return;`

## Bước 3: Tối ưu logic
- **Inline biến tạm**: Nếu biến chỉ dùng 1 lần → inline trực tiếp
- **Gộp điều kiện**: `a && b && c` thay vì nhiều `if` lồng nhau
- **Optional chaining**: `obj?.method()` thay vì `if (obj) obj.method()`
- **Nullish coalescing**: `value ?? default` thay vì `value || default` khi cần

## Bước 4: Tối ưu hiệu năng
- **Song song hóa (Parallel)**: Dùng `Promise.all()` cho các tác vụ độc lập
- **Lazy loading**: Chỉ nạp tài nguyên khi thực sự cần
- **Giải phóng bộ nhớ sớm**: `variable = null` sau khi không còn cần
- **URL.revokeObjectURL()**: Giải phóng Blob URL sau khi sử dụng
- **Dùng `filter` trong unzip**: Chỉ đọc metadata thay vì giải nén toàn bộ

## Bước 5: Tối ưu cú pháp
- **Arrow functions**: `() => {}` thay vì `function() {}`
- **Template literals**: `` `${var}` `` thay vì `'' + var`
- **Destructuring**: `const { a, b } = obj` thay vì `const a = obj.a`
- **One-liner functions**: Hàm đơn giản viết trên 1 dòng

## Bước 6: Kiểm tra và báo cáo
- Đếm số dòng trước và sau khi tối ưu
- Liệt kê các thay đổi chính đã thực hiện
- Đảm bảo logic không thay đổi

---

## Ví dụ áp dụng

**Trước:**
```javascript
var a = 1;
var b = 2;
var c = 3;

function foo(x) {
    if (x) {
        if (y) {
            doSomething();
        }
    }
}
```

**Sau:**
```javascript
var a = 1, b = 2, c = 3;
function foo(x) {
    if (x && y) doSomething();
}
```

---

## Lưu ý quan trọng
- KHÔNG tối ưu quá mức làm giảm khả năng đọc hiểu
- KHÔNG thay đổi logic hoạt động của code
- GIỮ LẠI các comment tiêu đề section (===== name =====)
- TEST lại sau khi tối ưu để đảm bảo không lỗi
