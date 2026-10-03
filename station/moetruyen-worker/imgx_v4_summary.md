# Mòe Truyện: ngữ cảnh và hướng bảo trì Worker

Cập nhật: 2026-10-03. Tài liệu dành cho lần sửa tiếp theo, gồm kết quả đã kiểm chứng, hợp đồng phải giữ và cách điều tra khi nguồn thay đổi. Số liệu triển khai bên dưới là mốc đã xác minh trong phiên làm việc, không thay thế việc kiểm tra trạng thái live ở lần sửa sau.

## 1. Mục tiêu và cam kết với CBZ

`moetruyen.link` được nhúng trong CBZ. Người dùng muốn giữ nguyên file này; xử lý các thay đổi của Mòe ở Worker để CBZ đã tạo vẫn tải thêm chương được.

Luồng hiện tại:

```text
.link trong CBZ → API v1 của Worker mình → HTML/reader của truyen.moe
                                         → grant V4 → binary ảnh → giải mã
Core Emux → proxy emux-cors → /api/image của Worker mình → WebP → lưu CBZ
```

Quy tắc cho mọi lần sửa:

1. Giữ hostname `moetruyen-worker.hoangtuanson91.workers.dev` và API v1 hiện tại. Đổi server nguồn, khóa, thuật toán và parser ở phía Worker.
2. Giữ GET, tên trường, kiểu dữ liệu và ý nghĩa của dữ liệu mà `.link` đang dùng. Có thể thêm trường nhưng không bỏ/đổi trường cũ hoặc biến thành bắt buộc.
3. Nếu cần API v2, duy trì v1 bằng adapter tương thích. Không ép CBZ cũ nâng cấp `.link`.
4. Không sửa `src/core/link.js` hoặc `sw.js` chỉ để vá riêng Mòe. Core/SW đã về logic nguyên bản; `.link` dùng hook `processImage()` có sẵn.
5. Khi kiểm tra tương thích, dùng bản `.link` đã nhúng trong một CBZ từ trước bản sửa; chỉ kiểm tra file mới trong repo là chưa đủ.

Ảnh đã tải trong CBZ vẫn đọc offline được. Phần cần Worker là tải chương mới hoặc tải lại ảnh. Mốc tương thích cần giữ là `.link` dùng API v1 hiện tại; các CBZ từ trước lần chuyển sang v1 có thể nhúng adapter cũ dùng `rinmyau`, không tự chuyển sang v1. Không tuyên bố đã hỗ trợ các bản đó nếu chưa kiểm tra riêng.

Có thể nghiên cứu và sửa nhiều thay đổi kỹ thuật, nhưng không bảo đảm xử lý được mọi trường hợp. Nếu nguồn ngừng phục vụ, thu hồi quyền truy cập hoặc chỉ cấp nội dung cho người dùng đã xác thực, khả năng sửa còn phụ thuộc quyền truy cập hợp lệ và cách nguồn cho phép tích hợp.

## 2. Vị trí mã nguồn và môi trường

| Thành phần | Vị trí / vai trò |
| --- | --- |
| Adapter nhúng CBZ | `station/links/moetruyen.link` — giữ tương thích |
| Mã nguồn Worker | `station/moetruyen-worker/src/` |
| Kiểm thử | `station/moetruyen-worker/test/` — 37 kiểm thử tại mốc hiện tại |
| Script kiểm tra thật | `station/moetruyen-worker/scripts/` |
| Môi trường ngoài Git | `~/Documents/Cloudflare/moetruyen-worker` |
| Cấu hình đường dẫn local | `workspace.json`: `repoRoot` trỏ repo Emux, `workerPath` là `station/moetruyen-worker` |
| Cấu hình deploy/dependencies | `wrangler.toml`, `package.json`, lockfile, `node_modules` ở môi trường ngoài |

`run.mjs` ở môi trường ngoài tự tạo lại các bản sao `src`, `test`, `scripts` trước mỗi lệnh npm. Chỉ sửa code trong repo; sửa bản sao ở môi trường ngoài sẽ bị ghi đè. `EMUX_ROOT` giúp test và script tìm `.link`/core ở repo thật. Không đưa dependencies, cache, tài khoản hoặc secrets lên Git. `build.sh` loại toàn bộ `station` khỏi bản web Emux.

Wrangler gộp các module và thư viện thành bundle; Cloudflare thấy một file `index.js` là bình thường. Test, fixture và script kiểm tra không nằm trong bundle production.

## 3. Trạng thái đã kiểm chứng

| Mục | Mốc đã xác minh |
| --- | --- |
| Worker chính | `https://moetruyen-worker.hoangtuanson91.workers.dev` |
| Worker version | `5f5dc6fe-e6f6-4b68-b34f-6f998d91a8b6`, đã deploy 100% |
| `/api/status` | `2026-10-03-own-source-v1`, profile `p01–p10` |
| Ca chuẩn | Manga `45`, chương `1`, ID chương nguồn `986` |
| Trang nguồn ca chuẩn | `https://truyen.moe/manga/45-cham-soc-tu-thi/chapters/1` |
| Quyền truy cập ca chuẩn | Đã đọc được không cần đăng nhập tại thời điểm kiểm tra |
| Kết quả tải | 58/58 ảnh qua core nguyên bản, cả bản `docs/src/core/link.js`; đã mở ảnh kiểm tra nội dung |
| Danh sách manga 45 | 13 chương |
| Ca phân trang | Manga `1`: 7 trang danh sách, 185 chương với URL riêng biệt; số chương cuối 183, có chương phụ |
| Kiểm thử | 37 qua; sau tách môi trường và chuyển vào `station` cũng qua, build dry-run thành công |
| Proxy chung | `https://emux-cors.hoangtuanson91.workers.dev`, version đã sửa `5829bd94-7b31-4922-a313-0827362275f6` |

Không còn phụ thuộc `moetruyen.rinmyau.workers.dev`. Worker lấy metadata và chương trực tiếp từ HTML Mòe; không có database của API bên thứ ba và không cần clone dịch vụ đó.

Runtime dùng Web Crypto + `@noble/ciphers` 1.3.0 + module JavaScript riêng. Môi trường kiểm thử dùng `libsodium-wrappers-sumo` 0.7.15 làm oracle, Wrangler đã cài là 3.114.17, compatibility date giữ `2023-12-01`. Không tự nâng version/date trong một bản vá nguồn nếu chưa kiểm tra ảnh hưởng.

## 4. Hợp đồng API phải giữ

### Danh sách chương

`GET /api/v1/manga/{mangaId}/chapters?page={page}&requestId={UUID}`

Ví dụ cấu trúc, không phải dữ liệu live đầy đủ:

```json
{
  "success": true,
  "data": {
    "manga": { "id": 45, "slug": "45-cham-soc-tu-thi", "title": "Chăm sóc tử thi" },
    "chapters": [{
      "id": 986,
      "number": 1,
      "numberText": "1",
      "title": null,
      "pagesUrl": "https://moetruyen-worker.hoangtuanson91.workers.dev/api/v1/manga/45/chapters/1/pages"
    }]
  },
  "meta": { "pagination": { "page": 1, "totalPages": 1 } }
}
```

`.link` dùng `data.manga.title`, `data.chapters`, `number`, `numberText`, `title`, `pagesUrl` và `meta.pagination.totalPages`. `pagesUrl` phải thuộc origin Worker hiện tại; `.link` từ chối URL API khác origin. Giữ chương thập phân/phụ, không đánh lại số hoặc bỏ chương vì giả định chỉ có số nguyên.

### Danh sách ảnh

`GET /api/v1/manga/{mangaId}/chapters/{chapterNumber}/pages?requestId={UUID}`

```json
{
  "success": true,
  "data": {
    "pages": [{ "pageIndex": 0, "downloadUrl": "https://moetruyen-worker.hoangtuanson91.workers.dev/api/image?..." }]
  }
}
```

Giữ thứ tự ảnh; không thêm ảnh quảng cáo vào danh sách. `.link` chuyển mỗi phần tử thành `{url, drm: null, workerImage: true}`. Mọi phiên bản mã hóa nguồn phải được Worker chuyển thành ảnh thật trước khi trả cho core.

### Ảnh, lỗi và cache

- `/api/image` hiện trả WebP (`image/webp`), có `Cache-Control: private, no-store`. Hook `.link.processImage()` chấp nhận WebP hoặc JPEG; không chấp nhận PNG. Nếu nguồn đổi đầu ra sang PNG/AVIF, chuyển sang WebP/JPEG ở server để giữ CBZ tương thích.
- Lỗi trả JSON `{ "success": false, "code": "...", "error": "..." }`, với mã HTTP phù hợp. `.link` cần `success` đúng boolean `true` khi thành công.
- Mỗi lượt xin dữ liệu dùng `requestId` mới vì SW nguyên bản có thể cache GET. Không tái sử dụng grant hết hạn hoặc đổi sang POST phía client để né cache.
- Worker có CORS cho client và proxy. Proxy chung cần giữ `global_fetch_strictly_public`; không gỡ khi deploy lại proxy.
- `/api/status` báo version/profile để phân biệt bản đang chạy với code local.
- Endpoint legacy `/api/pages` nay cần `mangaId` và `chapterNumber` bên cạnh `chapterId`; không coi nó tương thích hoàn toàn với adapter trước API v1.

## 5. Phân công module và chi tiết nguồn hiện tại

| File trong `src/` | Trách nhiệm / điểm dễ thay đổi |
| --- | --- |
| `index.js` | Định tuyến API v1, mở khóa bọc grant, tạo URL ảnh và trả lỗi; chỉ chấp nhận binary IMGX V4 hiện tại |
| `catalog.js` | Parse canonical, JSON-LD `ComicSeries`/`BookSeries`, heading `manga-detail-title`, anchor `data-chapter-id`, `data-chapter-number`, phân trang `chapterPage` |
| `source.js` | Navigation headers, cookie trong từng phiên, redirect cùng origin, metadata `chapterId`/`media`, loại ảnh quảng cáo |
| `reader-access.js` | Bootstrap, ECDH/HKDF channel, sealed capability/pages, HMAC proof và mở khóa trang |
| `imgx-v4.js` | Xác thực envelope, chọn profile và giải mã payload |
| `crypto/` | AEGIS, AES-SIV, secretstream và tiện ích bytes |
| `errors.js` | Kiểu lỗi dùng chung |

Những chi tiết đã gây lỗi thực tế:

- Trang danh sách đầu có JSON-LD nhưng trang sau có thể không có; fallback sang heading HTML đã được kiểm tra tới trang 7.
- Địa chỉ `/manga/45/chapters/1` chuyển hướng sang slug canonical. Cần giữ cookie và chỉ đi theo redirect cùng origin.
- HTML đọc chỉ có bootstrap hợp lệ khi request có navigation headers và cookie phiên phù hợp. Header hiện tại nằm trong `source.js`; không rút gọn về một `Accept: text/html` rồi kết luận nguồn không cấp khóa.
- `media` hiện được đọc bằng regex từ JSON một dòng. Nếu nguồn đổi formatting hoặc đưa config vào chỗ khác, parser có thể lỗi dù mã hóa không đổi.
- Danh sách media ca chuẩn có phần tử quảng cáo `0.js` với index 58; chương thật dùng index 0–57. Không suy số ảnh từ tổng DOM có cả quảng cáo.
- Một phiên/channel dùng chung cho chương; yêu cầu khóa chia thành lô 10, tăng sequence. Giới hạn 1000 ảnh/chương hiện là giới hạn của Worker mình, không phải kết luận về nguồn.

## 6. Reader channel và IMGX V4: kết luận đúng

1. Worker lấy document phiên mới, đọc `bootstrapUrl`, `requestPath`, `initialIndexes` và media.
2. Tạo cặp ECDH P-256; bootstrap cung cấp sealed capability và sealed initial pages. ECDH + HKDF-SHA256 dẫn xuất khóa mở AES-GCM channel.
3. Capability cấp secret cho HMAC-SHA256. Proof nằm trong body `pageAccessProof`, không phải header `x-imgx-client-proof`.
4. Payload proof hiện tại là JSON theo đúng thứ tự:

```text
["imgx-page-access-proof-v3", readerInstanceId, chapterId,
 requestPath, "", batchIndexes, issuedAt, sequence, publicKeyHashHex]
```

5. Mở `channelKeys` để lấy `wrappedV4Key`; `index.js` bỏ mask khóa theo grant/storage context rồi giải mã binary. Không lấy khóa V3 thế cho V4.
6. Binary V4 bắt đầu bằng `IMGX\x04`; envelope dùng HKDF/AES-GCM và xác thực context gồm `storageKey`, `imageId`. Profile `p01–p10` quyết định cách giải mã payload. Chỉ trả ảnh sau xác thực và kiểm tra định dạng đầu ra.

Các giả thuyết đầu cuộc điều tra về việc bắt buộc ký ECDSA, chỉ Base64 proof là đủ, hoặc bắt buộc WASM đều không đúng cho luồng đã chạy thành công. Thư viện oracle chỉ dùng trong test, không có trong bundle production. Không quay lại giải pháp trả PNG nhiễu hoặc bỏ qua authentication tag để “ra ảnh”.

## 7. Ma trận lỗi và hướng điều tra

Các dòng về V5, thuật toán mới, CAPTCHA/đăng nhập là khả năng trong tương lai, chưa phải tính năng đã triển khai hoặc thông báo của Mòe.

| Dấu hiệu | Điều cần xác định | Hướng sửa ưu tiên, giữ nguyên `.link` |
| --- | --- | --- |
| `catalog_format_changed`, thiếu chương/phân trang | HTML canonical, heading, anchor, query phân trang đã đổi? | Sửa `catalog.js`; thêm fixture trang đầu/trang sau, chương phụ; trả lỗi thay vì danh sách rỗng khi parser hỏng |
| `reader_metadata_changed` | Config `chapterId`/media đã đổi vị trí, JSON xuống dòng, index quảng cáo khác? | Sửa `source.js`; kiểm tra số ảnh, thứ tự và loại quảng cáo |
| `reader_capability_unavailable`, bootstrap rỗng | Nguồn đọc được trực tiếp không? Headers, cookie, redirect, HTML challenge? | Đối chiếu document cùng điều kiện truy cập; sửa phiên/navigation/bootstrap ở `source.js` và `reader-access.js` |
| Lỗi mở channel/capability/proof | Protocol version, salt/info, AAD, public key hash, clock, batch size, sequence | Sửa `reader-access.js` dựa trên giao thức quan sát được; tạo test riêng cho thay đổi |
| `v4_key_missing` | Nguồn đổi tên khóa, wrapper hoặc loại grant; có đang dùng nhầm khóa V3? | Sửa mở grant và bỏ mask; không tự fallback khóa sai |
| `OperationError`, `image_decryption_failed`, `imgx_invalid_*` | Lỗi ở channel, envelope hay payload; đúng key/context/bytes/phiên không? | Tách từng lớp và đối chiếu fixture; sửa đúng module, không kết luận ngay là thuật toán mới |
| IMGX V5 / profile mới | Magic, metadata, thuật toán, layout, AAD và cách cấp khóa đã đổi thế nào? | Thêm decoder riêng/dispatcher trong Worker, giữ V4 nếu còn ảnh cũ; dùng oracle độc lập và test sai khóa/context/tamper |
| 404 hoặc `image_fetch_failed` | API Worker sai route, proxy lỗi, URL nguồn đổi hay ảnh bị xóa? | So sánh gọi Worker trực tiếp với proxy rồi nguồn; sửa adapter URL/allowlist có chủ đích, giữ hostname API cũ |
| 404 qua proxy, Worker trực tiếp chạy | Có Cloudflare 1042? Proxy mất compatibility flag? | Kiểm tra `global_fetch_strictly_public` và version proxy trước khi sửa crypto |
| HTTP 200 nhưng JSON `RATE_LIMITED`, hoặc 429 | Đâu là bên giới hạn, thời gian chờ/Retry-After, tải đồng thời bao nhiêu? | Dừng retry dồn dập; nghiên cứu backoff, cache metadata, gom request phía Worker. Các cơ chế mới này cần triển khai/kiểm chứng, chưa mặc nhiên có sẵn |
| CORS / SW trả dữ liệu cũ | OPTIONS/header, requestId, grant hết hạn, bản SW/client | Giữ CORS và URL GET mới; thử phiên/cache mới để chẩn đoán, không bắt sửa `.link` nhúng |
| Ảnh mở được nhưng nhiễu | Đó có phải carrier PNG thay vì plaintext? Có đúng chương/context không? | Kiểm tra magic, MIME, nội dung và bytes; decoder phải xác thực rồi trả WebP/JPEG thật |
| Local chạy, CF fail | Version/config thực tế, runtime workerd, CPU/memory, subrequest, network IP | Kiểm tra runtime/logs/config; tối ưu hoặc tách backend xử lý nặng phía sau cùng API v1 nếu phù hợp |
| CAPTCHA / chỉ đăng nhập mới đọc được | Quyền đọc của người dùng, phiên xác thực và cách nguồn hỗ trợ | Có thể cần bước xác thực hợp lệ ngoài CBZ rồi Worker dùng phiên được cấp. Chưa có cơ chế này; không hứa giải quyết chỉ bằng sửa decoder hoặc bỏ qua yêu cầu của nguồn |
| Nguồn ngừng phục vụ / ảnh bị gỡ | Còn dữ liệu hợp lệ để truy cập không? | Không thể tái tạo ảnh đã mất chỉ từ decoder; ảnh có sẵn trong CBZ vẫn đọc offline |

## 8. Dữ liệu cần giữ cho lần sửa sau

Tạo một hồ sơ lỗi gồm:

- Ngày giờ/múi giờ, Worker `/api/status`, deployment version và đường dẫn repo/môi trường đang chạy.
- Manga ID, số chương, chapter ID nếu biết, số trang lỗi, URL trang đọc, số ảnh kỳ vọng.
- Trang gốc có đọc được không, cần đăng nhập không; local, Worker trực tiếp, proxy và CBZ cũ khác nhau ở đâu.
- Mã HTTP **và** `success/code/error` JSON; không chỉ giữ `[object Object]` hoặc mỗi dòng `OperationError`.
- HTML/config đã loại cookie/token; magic/version/profile, chiều dài và hash của binary lỗi; tên lớp giải mã bị lỗi.
- Mẫu binary/context/key dùng thử phải có nguồn truy cập hợp lệ và bảo quản ngoài Git. Ưu tiên fixture tổng hợp với khóa thử để commit regression test.

Không đưa cookie, capability secret, private key, grant hoặc URL `/api/image` chứa `k` vào log/Git/tài liệu công khai. Khi chia sẻ HAR/log, loại chúng trước. File tạm `/tmp` và ảnh trong thư mục tạm không phải kho dữ liệu bền vững; dữ liệu cần tái hiện phải được lưu có chủ đích ngoài repo.

Fixture hiện có: `test/fixtures/page.webp`, `p08.json`, `generate-p08.py`; helpers tạo dữ liệu đối chiếu các profile bằng oracle độc lập. Giữ giấy phép và `THIRD_PARTY_NOTICES.md` khi thay/thêm thư viện.

## 9. Quy trình sửa và triển khai

1. Đọc tài liệu này và code hiện tại; kiểm tra Worker live, không coi version/HTML ghi trong tài liệu là luôn mới nhất.
2. Tái hiện một chương/một ảnh trước. Dừng nếu đang rate limit; không lặp tải cả chương chỉ để xem lỗi giống nhau.
3. Xác định lớp hỏng: metadata → phiên → grant → binary → decoder → proxy/client. So sánh local/direct/proxy để tránh sửa nhầm.
4. Chỉ sửa adapter/decoder cần thiết trong repo. Giữ hợp đồng v1 và `.link`; nếu thêm backend xử lý, vẫn đi qua hostname/API cũ.
5. Thêm regression test cho lỗi thực tế. Với crypto, phải thử cả đúng/sai key, sai context, dữ liệu bị sửa và độ dài/block/chunk.
6. Test và build dry-run trong môi trường ngoài; kiểm tra local nếu cần. Local dùng port 8797; proxy CF không tải được localhost nên test core/proxy cần Worker remote.
7. Với sửa hành vi, ưu tiên upload version thử nghiệm và kiểm tra trước khi chuyển traffic chính. Đối chiếu cấu hình tài khoản/Worker hiện tại trước deploy.
8. Kiểm tra đủ ảnh, mở ít nhất ảnh đầu/cuối và ảnh từng hỏng; đọc danh sách phân trang/chương phụ. Kiểm tra thêm CBZ cũ dùng `.link` v1 cố định.
9. Chuyển traffic khi đã đạt các kiểm tra phù hợp, rồi xác nhận `/api/status` và luồng qua proxy ở URL chính.
10. Ghi kết quả và giới hạn còn lại vào mục nhật ký bên dưới. Nếu rollback, chọn version tương thích v1; version trước khi có v1 có thể làm CBZ mới ngừng tải thêm.

Lệnh môi trường hiện có:

```sh
cd ~/Documents/Cloudflare/moetruyen-worker
npm test
npm run deploy -- --dry-run
npm run dev -- --port 8797
```

Lệnh `dev` chạy lâu, dùng terminal riêng. Kiểm tra một ảnh ca chuẩn bằng local:

```sh
npm run check -- 986 http://localhost:8797
```

`check` hiện cố định nguồn thử là manga 45/chương 1; đối số 986 dùng đặt tên file, không phải cơ chế chọn chapter nguồn bất kỳ. `check:chapter` chọn manga/số chương bằng đối số 5/6 của script (theo thứ tự bên dưới); đối số chapter ID đầu dùng đặt tên thư mục output.

Kiểm tra cả chương qua core `docs` và proxy:

```sh
npm run check:chapter -- 986 https://moetruyen-worker.hoangtuanson91.workers.dev docs/src/core/link.js 45 1
```

Sau khi đồng bộ/test, các lệnh Wrangler trực tiếp ở môi trường ngoài dùng bản đã cài:

```sh
npx wrangler versions upload --message 'Mô tả bản sửa'
# Dùng Version Preview URL được trả về để kiểm tra trước.
# Chỉ khi bản thử đã đạt: thay VERSION_ID bên dưới bằng ID thật.
npx wrangler versions deploy VERSION_ID@100 --yes --message 'Kết quả xác minh'
```

`npm run deploy` cũng đồng bộ code rồi deploy trực tiếp, không tự kiểm thử hoặc tạo bước duyệt version. Không nhầm deploy trực tiếp với dry-run. Phiên viết lại tài liệu này không deploy thêm code.

## 10. Lịch sử đã chốt và tài liệu tham khảo

- Lỗi `OperationError` ban đầu liên quan việc dùng grant/khóa V2/V3 với binary V4. API trung gian không thay thế được reader channel hiện tại.
- PNG nhiễu là dữ liệu chưa giải mã; trả nó cho downloader không phải sửa thành công.
- Nút thắt lấy khóa được xử lý bằng navigation headers, cookie phiên, bootstrap/channel và proof HMAC đúng thứ tự/sequence.
- Đủ profile V4 đã chạy với oracle và runtime workerd; không bắt buộc WASM trong production.
- HTTP 404 qua `emux-cors` từng là Cloudflare 1042, đã sửa flag của proxy và giữ source proxy nguyên vẹn.
- Core/SW đã hoàn nguyên; bỏ hook mới và ngoại lệ hostname. GET + requestId + hook `processImage()` cũ đã tải đủ chương.
- Bỏ `rinmyau`, tạo API v1 tự lấy HTML. Sửa thiếu JSON-LD ở trang danh sách sau, đã đọc đủ 185 chương.
- Xóa thư mục thử nghiệm `Link`; tách môi trường deploy ngoài Git, chuyển source vào `station/moetruyen-worker` và cập nhật đường dẫn.

Nguồn tham khảo kỹ thuật đã dùng: [Keiyoushi MoeTruyen](https://github.com/keiyoushi/extensions-source/tree/main/src/vi/moetruyen/src/eu/kanade/tachiyomi/extension/vi/moetruyen), [cấu hình Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/), [Cloudflare Worker errors](https://developers.cloudflare.com/workers/observability/errors/). Mã upstream có thể thay đổi; đọc lại tại lần sửa, không coi một decoder tham khảo là bằng chứng nó tải được chương đang lỗi.

Bản ghi điều tra cũ chứa giả thuyết đã bị bác bỏ được giữ ngoài Git tại `~/Documents/Cloudflare/moetruyen-worker/IMGX_V4_HISTORY_BEFORE_RUNBOOK.md`. Hướng dẫn hiện tại nằm trong tài liệu này, không lấy kết luận ECDSA/WASM từ bản lịch sử làm đặc tả.

## 11. Mẫu nhật ký cho lần sửa tiếp

```text
Ngày / người sửa:
Manga / chương / trang lỗi:
Trang gốc và điều kiện truy cập:
Worker version / status trước sửa:
Mã lỗi / lớp hỏng / cách tái hiện:
Bằng chứng đã loại secrets:
Nguyên nhân được xác minh:
Module đã sửa:
Hợp đồng API v1 và .link/CBZ cũ có giữ nguyên không:
Test/fixture thêm và kết quả:
Local / Version URL / URL chính / proxy / CBZ cũ:
Số ảnh kỳ vọng / tải được / kết quả mở ảnh:
Version deploy và version rollback tương thích v1:
Giới hạn còn lại / việc cần làm tiếp:
```
