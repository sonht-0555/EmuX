# MoeTruyen Worker

Worker lấy tên truyện, danh sách chương và phiên đọc trực tiếp từ Mòe, giải mã IMGX V4 rồi trả WebP cho Emux. File client: `station/links/moetruyen.link`.

Mã nguồn nằm tại `station/moetruyen-worker` trong repo Emux.

## Nội dung trong Git

- `src/`: API, adapter nguồn, cấp khóa và decoder `p01–p10`.
- `test/`: 37 kiểm thử; fixture độc lập và script tạo lại fixture để phát hiện lỗi giải mã.
- `scripts/`: kiểm tra ảnh/chương và tìm đường dẫn repo khi chạy từ môi trường ngoài.
- `THIRD_PARTY_NOTICES.md`, `licenses/`: nguồn tham khảo và giấy phép bắt buộc giữ.

Không đặt dependencies, cấu hình deploy, cache Wrangler hoặc secrets trong thư mục này. `build.sh` cũng loại thư mục Worker khỏi bản web Emux.

## Môi trường local và deploy

Đã tách ra ngoài repo tại `~/Documents/Cloudflare/moetruyen-worker`.
Nơi này giữ `package.json`, lockfile, `node_modules`, `wrangler.toml`, `workspace.json` và trình chạy `run.mjs`; không thuộc Git của Emux.

```sh
cd ~/Documents/Cloudflare/moetruyen-worker
npm test
npm run dev -- --port 8797
npm run deploy -- --dry-run
npm run deploy
npm run check:chapter -- 986 https://moetruyen-worker.hoangtuanson91.workers.dev docs/src/core/link.js
```

Mỗi lệnh tự đồng bộ `src`, `test`, `scripts` từ repo sang môi trường ngoài trước khi chạy. Chỉ sửa mã nguồn trong repo; bản sao ngoài repo được tạo lại. Nếu chuyển repo sang nơi khác, đổi `repoRoot` trong `workspace.json`; `workerPath` hiện là `station/moetruyen-worker`.

Dependencies hiện dùng: `@noble/ciphers` 1.3.0; môi trường kiểm thử dùng `libsodium-wrappers-sumo` 0.7.15 và Wrangler 3.114.17. Lockfile và cấu hình đầy đủ được giữ ở môi trường ngoài để cài lại bằng `npm ci`.

## API v1

- `GET /api/v1/manga/45/chapters?page=1`: tên truyện, danh sách chương có `pagesUrl`, phân trang.
- `GET /api/v1/manga/45/chapters/1/pages?requestId=<UUID>`: danh sách URL ảnh Worker theo thứ tự.
- `/api/image`: trả WebP đã giải mã; `/api/status`: phiên bản và profile hỗ trợ.

Khi Mòe thay đổi, cập nhật adapter/decoder và giữ hợp đồng API v1. Mỗi lượt cấp khóa dùng URL GET mới để tránh cache grant cũ. Core nguyên bản tải ảnh qua proxy chung; proxy cần giữ flag `global_fetch_strictly_public`.

Đã kiểm tra Worker chính: truyện 45 có 13 chương, chương 1 tải đủ 58/58 ảnh; truyện 1 trả đủ 185 chương qua 7 trang danh sách. Ghi chép triển khai cũ nằm ở `DEPLOYMENT_NOTES.md` trong môi trường ngoài; hướng bảo trì, hợp đồng CBZ và quy trình xử lý khi nguồn đổi ở [imgx_v4_summary.md](imgx_v4_summary.md).

Quy tắc bảo trì: giữ hostname và API v1 cho `.link` đã nhúng trong CBZ; sửa nguồn/crypto trong Worker. API mới phải giữ đường tương thích v1.
