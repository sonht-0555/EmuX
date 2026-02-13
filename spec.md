Ok 👌 dưới đây là spec gạch đầu dòng rõ ràng, đủ chi tiết để đưa cho AI code, dành cho hệ thống của bạn:

WASM = libretro core

AudioWorklet đang dùng

Single player = audio-driven

Netplay = JS-driven

Delay-based (không rollback)

Ping mục tiêu < 20ms

🎯 1️⃣ Tổng Quan Kiến Trúc
Phải có 2 mode:
🟢 MODE_SINGLE

AudioWorklet là master clock

Audio thiếu sample → gọi retro_run()

Không có frame sync network

Không dùng input frame tagging

🔵 MODE_NETPLAY

JS fixed timestep là master clock

AudioWorklet KHÔNG được gọi retro_run()

Netplay sync input theo frame

Chỉ chạy frame khi đủ input

🎯 2️⃣ State Machine

Biến toàn cục:

let mode = "single" | "netplay"
let currentFrame = 0
let INPUT_DELAY = 1 // hoặc 2

🎯 3️⃣ AudioWorklet Requirements

Trong cả hai mode:

Có ring buffer (SharedArrayBuffer hoặc circular buffer)

AudioWorklet chỉ đọc sample từ buffer

Không giữ reference đến frame number

Không biết đến network

Khi mode === "single"

Nếu buffer < threshold → postMessage main thread yêu cầu generate thêm frame

Khi mode === "netplay"

Tuyệt đối không trigger generate frame

Chỉ consume buffer

Nếu thiếu sample → silence (KHÔNG tự generate)

🎯 4️⃣ JS Frame Loop (Netplay Mode)

Phải có fixed timestep loop:

const FRAME_TIME = 1000 / 60
let accumulator = 0
let lastTime = performance.now()

Loop logic:

requestAnimationFrame(loop)

accumulator += deltaTime

while accumulator >= FRAME_TIME:

tryRunFrame()

accumulator -= FRAME_TIME

🎯 5️⃣ Input System (Netplay)
Mỗi input phải có:
{
frame: number,
mask: uint16
}

Khi local player nhấn phím:

targetFrame = currentFrame + INPUT_DELAY

Lưu vào localInputBuffer[targetFrame]

Gửi packet (frame, mask)

🎯 6️⃣ Network Packet Format (Binary)

Mỗi packet:

uint32 frame
uint16 inputMask

Tổng: 6 bytes

Không JSON.
Không string.

🎯 7️⃣ Remote Input Handling

Khi nhận packet:

Parse frame

Lưu remoteInputBuffer[frame] = mask

Không xử lý ngay.
Không chạy frame ngay.

🎯 8️⃣ tryRunFrame() Logic

Pseudo logic:

function tryRunFrame() {
let frame = currentFrame

if (!localInputBuffer[frame]) return
if (!remoteInputBuffer[frame]) return

let inputP1 = ...
let inputP2 = ...

setInputsToCore(inputP1, inputP2)

retro_run()

currentFrame++

cleanupOldBuffers()
}

Quan trọng:

Không chạy nếu thiếu 1 bên input

Không auto dùng last input

Không đoán input

🎯 9️⃣ Core Requirements

Deterministic 100%

Không dùng Date.now()

Không random không seed

Không phụ thuộc system time

Cùng ROM hash 2 bên

🎯 10️⃣ Audio Pipeline (Netplay)

Sau mỗi retro_run():

Core sinh ra audio samples

Push samples vào ring buffer

AudioWorklet đọc và phát

Audio buffer nên >= 100ms

🎯 11️⃣ Ping Policy

Trước khi start match:

Ping test 10 lần

Nếu avg > 35ms → reject

Nếu < 15ms → INPUT_DELAY = 1

Nếu 15–35ms → INPUT_DELAY = 2

Delay cố định suốt trận.

🎯 12️⃣ Desync Detection

Mỗi 120 frame:

Serialize state

Tính hash (CRC32 hoặc FNV1a)

Gửi hash

So sánh

Nếu mismatch → terminate match

🎯 13️⃣ Cleanup Policy

Xóa input buffer cũ hơn currentFrame - 300

Không để object grow vô hạn

Không new object mỗi frame nếu tránh được

🎯 14️⃣ Mode Switch Logic

Khi bật netplay:

mode = "netplay"

Stop audio-driven generation

Reset currentFrame = 0

Clear input buffers

Clear audio buffer

Delay 2 frame trước khi start

Khi tắt netplay:

mode = "single"

Stop JS frame loop

AudioWorklet resume generate mode

🎯 15️⃣ Tuyệt Đối Không Làm

❌ Không để AudioWorklet gọi retro_run() trong netplay
❌ Không chạy frame thiếu input
❌ Không tự fill input khi thiếu
❌ Không skip frame âm thầm
❌ Không dùng setInterval cho timing

🎯 16️⃣ Tổng Sơ Đồ Chuẩn

Netplay mode:

JS Fixed Loop (60fps)
↓
Check Input Buffers
↓
retro_run()
↓
Push audio samples
↓
AudioWorklet consume

Single mode:

AudioWorklet thiếu sample
↓
retro_run()

🎯 Đây là bản triển khai “chuẩn delay-based, không rollback”

Ping <20ms

Trải nghiệm gần local

Không rewind

Không glitch

Không phức tạp như GGPO
