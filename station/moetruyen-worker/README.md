# MoeTruyen Worker

Worker lấy tên truyện, danh sách chương và phiên đọc trực tiếp từ Mòe, giải mã IMGX V3/V4 rồi trả WebP cho Emux. File client: `station/links/moetruyen.link`.

Mã nguồn nằm tại `station/moetruyen-worker` trong repo Emux.

## Nội dung trong Git

- `src/`: API, adapter nguồn, cấp khóa V3/V4 và decoder V4 `p01–p10`; hỗ trợ V3 bọc V4 trong chunk WebP `IMX4`.
- `test/`: 50 kiểm thử; fixture độc lập, dữ liệu crypto lớn, browser worker và tương thích API v1/v2.
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

Bản production hiện tại ngày 2026-10-28: `2026-10-28-imgx-client-v1`, version `acf87f8d-acf8-494a-ae8c-bd69f7e9a5d6`, đã chuyển 100% traffic. Có API v2 cho PWA và giữ API v1, cùng tối ưu AEGIS/AES-SIV của bản trước `715f15d7-bc40-428b-9601-227c31b3c81e`. Giữ nguyên gói Cloudflare và compatibility date.

## Giải mã trên PWA

API v2 đã bật tại `https://moetruyen-worker.hoangtuanson91.workers.dev`. Người dùng đã publish PWA lên `https://emux.io.vn`; decoder, `.link` và service worker live khớp bản build trong Git.

- `GET /api/v2/manga/{id}/chapters/{number}/pages`: trả URL binary nguồn và `drm: {type: "emux-imgx-v1", storageKey, imageId, k?, k3?}`; `private, no-store`. Khóa chỉ dùng trong bộ nhớ, không ghi vào CBZ, log hoặc storage.
- `.link` mới nạp `src/utils/imgx/client.js`, khởi tạo dedicated Web Worker, tải binary qua proxy chung rồi gọi decoder bằng hook `processImage()` cũ. API v1 tiếp tục trả ảnh thật cho `.link` cũ; app thiếu decoder hoặc server chưa có API v2 sẽ dùng v1.
- Decoder dùng lại source crypto server; `src/browser/worker-entry.js` được bundle thành `src/utils/imgx/worker.js`. Không sửa bundle bằng tay. Worker giải mã tuần tự, chuyển buffer qua `postMessage`, có timeout và tự dừng sau 30 giây nhàn rỗi.
- Chrome thật + core/proxy: bản thử đã tải đủ chương 1 (35 ảnh) và chương 2 (14 ảnh), không gọi `/api/image`; ảnh 25 khớp hash bản server. Adapter v1 lấy từ Git HEAD vẫn tải/đọc ảnh qua preview. Chưa thử trên Safari/iPhone hoặc một CBZ cũ thực tế.
- Sau triển khai: API v2 production trả 35 trang chương 1; client worker giải mã đủ 35/35 ảnh tải qua proxy, 0 lần gọi `/api/image`, ảnh 25 khớp hash. API v1 production vẫn trả ảnh 25 Sand Land và ảnh đầu manga 45 đúng hash cũ.

Tạo lại bundle sau khi sửa decoder, từ môi trường ngoài:

```sh
npm test                          # đồng bộ source/scripts và kiểm tra bundle hiện có
node scripts/build-browser.mjs    # tạo lại bundle ở repoRoot trong workspace.json
node scripts/build-browser.mjs --check
```

Nếu `npm test` báo bundle cũ, nó đã đồng bộ source/scripts trước khi thất bại; chạy lệnh build rồi test lại. Sau đó chạy `bash build.sh` trong repo Emux để đồng bộ `docs`, `.link`, assets và tăng revision cache PWA. Bản PWA đã publish ở revision `EmuX_9.50`. Với các thay đổi giao thức về sau, deploy API tương thích trước hoặc cùng lúc khi publish client.
