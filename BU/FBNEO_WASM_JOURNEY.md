# FBNeo WASM Technical Checklist & Notes

### 1. Lưu ý về Mã nguồn C (`retro_glue.c`)
- **Bộ đệm avInfo**: Cấu trúc `retro_system_av_info` phải được cấp ít nhất 128 bytes (hoặc dùng malloc đủ rộng) để tránh lỗi tràn bộ nhớ (Heap Overflow) khi Core nạp dữ liệu.
- **Header Emscripten**: Phải bọc `#include <emscripten.h>` trong `#ifdef __EMSCRIPTEN__` để tránh báo lỗi đỏ trong IDE khi không biên dịch bằng emcc.
- **Log Cleanup**: Xóa hoặc comment toàn bộ `printf` trong các hàm VFS/File I/O để tránh làm chậm hệ thống và spam Console trình duyệt.
- **Function Signature**: Các hàm callbacks giữa C và JS phải khớp tuyệt đối:
    - `env_cb`: `iii` (int trả về, 2 tham số int).
    - `video_refresh_cb`: `viiii` (void trả về, 4 tham số int).
    - `input_state_cb`: `iiiii` (int trả về, 4 tham số int).

### 2. Lưu ý về Build Workflow (YAML)
- **Quyền truy cập**: Không dùng `git clone` thủ công cho các repo con của Libretro, hãy dùng `actions/checkout` với `repository` và `path` để tự động hóa Auth.
- **Đường dẫn Makefile**: FBNeo Makefile nằm tại `src/burner/libretro/Makefile`. Phải `cd` đúng thư mục này mới build được.
- **Nhận diện file Core**: Sau khi nạp, core có thể là `fbneo_libretro_emscripten.a` hoặc `.bc`. Dùng lệnh `ls` và `grep` để gán vào biến `CORE_FILE` thay vì ghi cứng tên file.
- **Cờ biên dịch quan trọng**:
    - `-Oz`: Nén dung lượng file ở mức tối đa.
    - `-flto`: Tối ưu hóa toàn bộ project lúc Link (giảm đáng kể dung lượng).
    - `-s FORCE_FILESYSTEM=1`: Bắt buộc phải có để giữ lại API `FS.writeFile`.
    - `-s INITIAL_MEMORY=268435456`: Cấp sẵn 256MB RAM ảo (FBNeo cần nhiều RAM để chạy driver game nặng).
    - `-s EXPORTED_RUNTIME_METHODS`: Phải khai báo `["FS", "addFunction", "stringToUTF8", "ccall"]` để JS gọi được.

### 3. Lưu ý về Frontend (JavaScript)
- **Nạp Core từ ZIP**:
    - Phải gán đúng MIME type: `new Blob([buffer], { type: 'application/wasm' })`. Nếu không sẽ bị lỗi "Incorrect response MIME type".
    - Dùng `locateFile` trong đối tượng `Module` để trỏ vào Blob URL của WASM.
- **Xử lý Video & Rotation**:
    - Lắng nghe `env_cb` lệnh 31 (`SET_SYSTEM_AV_INFO`) và 37 (`SET_GEOMETRY`) để thay đổi kích thước `canvas` ngay lập tức.
    - Ép biến `fbneo-vertical-mode` thành `Enabled` để lấy đúng buffer dọc từ Core.
    - Tính toán lại `canvas.style.margin` khi dùng CSS `rotate` để bù đắp khoảng trống màn hình.
- **Input & Tránh lỗi Coin**:
    - Tránh dùng phím `Shift` cho nút Coin vì dễ bị dính phím hệ thống. Khuyên dùng phím thường (`C`, `Enter`).
    - Dùng `e.preventDefault()` cho các phím mũi tên để trang web không bị trôi khi chơi.
- **Bộ nhớ ảo (VFS)**: FBNeo đọc file `.zip` cực tốt. Chỉ cần dùng `FS.writeFile` đẩy cả file ZIP vào `/` là xong, không cần giải nén ROM thủ công.

### 4. Quy trình đóng gói (Packaging)
- Nén cả `fbneo_libretro.js` và `fbneo_libretro.wasm` vào file `fbneo.zip`.
- Đặt tại đường dẫn cố định (ví dụ `src/core/fbneo.zip`) để Code JS dễ dàng fetch.
