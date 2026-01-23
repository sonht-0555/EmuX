# Hướng dẫn Debug EmuX trên iOS

## Vấn đề
File ZIP không chạy trên iOS Safari mặc dù chạy được trên Mac.

## Các thay đổi đã thực hiện

### 1. Sửa thứ tự load script trong `index.html`
- **Vấn đề**: `zip.js` (JSZip library) được load SAU `loader.js`
- **Giải pháp**: Di chuyển `zip.js` lên TRƯỚC `loader.js`
- **Tại sao**: iOS Safari load script chậm hơn, nếu `loader.js` chạy trước khi JSZip sẵn sàng → lỗi

### 2. Thêm `accept` attribute vào file input
- **Vấn đề**: iOS Safari yêu cầu `accept` attribute để hiển thị file picker đúng
- **Giải pháp**: Thêm `accept=".gba,.gbc,.gb,.smc,.sfc,.nes,.zip"` vào input
- **Tại sao**: Không có accept → iOS có thể không hiển thị file picker hoặc không cho chọn file

### 3. Thêm comprehensive logging
- **Mục đích**: Debug chính xác bước nào bị lỗi
- **Vị trí**: 
  - `src/back/main.js` - inputGame function
  - `src/back/loader.js` - initCore function và Module initialization

## Cách debug trên iOS

### Bước 1: Bật Safari Developer Console
1. Trên iPhone/iPad: **Settings → Safari → Advanced → Web Inspector** (bật)
2. Trên Mac: Mở Safari → **Develop → [Tên iPhone] → [Tab website]**

### Bước 2: Test và xem logs
1. Mở EmuX trên iOS Safari
2. Chọn file ZIP
3. Xem console logs trên Mac để biết chính xác bước nào bị lỗi:

**Flow logs mong đợi:**
```
[inputGame] Event triggered: ...
[inputGame] File selected: game.zip Size: 12345 Type: application/zip
[inputGame] Saving to database...
[inputGame] Database save complete
[inputGame] Initializing core...
[initCore] Starting with file: game.zip Size: 12345
[initCore] ZIP file detected
[initCore] JSZip is available
[initCore] Reading ZIP arrayBuffer...
[initCore] ArrayBuffer size: 12345
[initCore] Loading ZIP with JSZip...
[initCore] ZIP loaded, files: ["game.gba"]
[initCore] Extracting ROM: game.gba
[initCore] ROM extracted, size: 67890 Extension: gba
[initCore] Core config found: {ratio: ..., width: 240, height: 160, ...}
[initCore] Setting up canvas...
[initCore] Canvas configured: 240 x 160
[initCore] Calling gameView and initAudio...
[initCore] Setting up Module...
[initCore] Loading core script: ./src/core/mgba.js
[initCore] Core script tag added to DOM
[initCore] Core script loaded successfully
[Module] Runtime initialized!
[Module] Memory allocated, romPtr: ... info: ...
[Module] Callbacks registered
[Module] Retro initialized
[Module] ROM data copied to memory
[Module] Game loaded!
[Module] Game loop started
[Module] Initialization complete!
[inputGame] Core initialized successfully
```

### Bước 3: Xác định lỗi
Nếu logs dừng ở đâu đó, đó là nơi xảy ra lỗi:

- **Dừng ở "JSZip is available"**: JSZip không load được
- **Dừng ở "Loading ZIP with JSZip"**: File arrayBuffer có vấn đề
- **Dừng ở "ZIP loaded"**: ZIP file bị corrupt hoặc format không đúng
- **Dừng ở "Extracting ROM"**: Không tìm thấy ROM trong ZIP
- **Dừng ở "Loading core script"**: Script core không load được
- **Dừng ở "Runtime initialized"**: WebAssembly module không khởi tạo được

## Các vấn đề iOS phổ biến

### 1. JSZip không load
- **Nguyên nhân**: Script order sai
- **Giải pháp**: Đảm bảo `zip.js` load trước `loader.js`

### 2. File picker không hiện
- **Nguyên nhân**: Thiếu `accept` attribute
- **Giải pháp**: Đã thêm accept attribute

### 3. WebAssembly không chạy
- **Nguyên nhân**: iOS Safari có giới hạn memory
- **Giải pháp**: Kiểm tra ROM size, có thể cần giảm kích thước

### 4. Audio không hoạt động
- **Nguyên nhân**: iOS yêu cầu user gesture để play audio
- **Giải pháp**: Đã có trong initAudio

## Test checklist

- [ ] File ZIP nhỏ (< 1MB) có chạy không?
- [ ] File ROM trực tiếp (.gba, .smc) có chạy không?
- [ ] Console có hiển thị logs không?
- [ ] Có error nào trong console không?
- [ ] File picker có hiện khi bấm chọn file không?
- [ ] Sau khi chọn file, có thấy log "[inputGame] Event triggered" không?

## Ghi chú
- iOS Safari có memory limit thấp hơn desktop
- WebAssembly trên iOS có thể chậm hơn
- Một số ROM lớn có thể không chạy được trên iOS
