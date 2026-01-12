// ===== 1. CORE CONFIGURATION ===== //
const CORE_CONFIG = {
  // Config của bạn đã đúng, giữ nguyên
  gba: { width: 240, height: 160, ext: '.gba', script: './src/core/mgba.js', sampleRate: 65760 },
  snes: { width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.js', sampleRate: 32040 }
};

// ===== 2. AUDIO SYSTEM (RING BUFFER + DYNAMIC RATE CONTROL) ===== //
const audioSys = new (class RetroAudio {
  constructor() {
    this.audioCtx = null;
    this.workletNode = null;
    this.inputSampleRate = 44100;
  }

  async init(coreSampleRate) {
    this.inputSampleRate = coreSampleRate || 44100;
    if (this.audioCtx) return; // Đã init thì thôi

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'interactive', // Yêu cầu độ trễ thấp nhất
      sampleRate: 48000 // Cố định 48kHz cho chuẩn
    });

    const workletCode = `
      class RetroProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          // RING BUFFER: Bộ đệm vòng cố định 32KB (Lũy thừa của 2 để tính toán nhanh)
          this.bufferSize = 32768; 
          this.mask = this.bufferSize - 1;
          this.buffer = new Float32Array(this.bufferSize * 2); // *2 vì Stereo (L, R nằm liền nhau)
          
          this.writePtr = 0; // Con trỏ ghi (Main thread gửi vào)
          this.readPtr = 0;  // Con trỏ đọc (Loa lấy ra)
          
          // Thông số Rate Control
          this.baseRatio = 1.0; 
          this.inputSampleRate = ${this.inputSampleRate}; // Nhận giá trị từ JS main
          
          this.port.onmessage = (e) => {
            if (e.data.type === 'config') {
               this.inputSampleRate = e.data.rate;
               // Cập nhật Base Ratio (ví dụ: 65760 / 48000 = 1.37)
               this.baseRatio = this.inputSampleRate / sampleRate; 
            } else {
               // Nhận dữ liệu Audio thô (Float32) từ Main Thread
               const data = e.data;
               for (let i = 0; i < data.length; i++) {
                 this.buffer[this.writePtr] = data[i];
                 this.writePtr = (this.writePtr + 1) & ((this.bufferSize * 2) - 1);
               }
            }
          };
        }

        process(inputs, outputs) {
          const output = outputs[0];
          if (!output || !output.length) return true;
          
          const L = output[0];
          const R = output[1];
          const outLen = L.length;

          // 1. Tính toán lượng dữ liệu đang có trong kho (Distance)
          // Vì là Ring Buffer nên phải xử lý trường hợp writePtr quay vòng về 0
          let distance = (this.writePtr - this.readPtr);
          if (distance < 0) distance += (this.bufferSize * 2);
          
          // Chuyển về số khung (frames) vì 1 frame = 2 mẫu (L+R)
          const bufferedFrames = distance / 2;

          // 2. DYNAMIC RATE CONTROL (Chìa khóa chống rè)
          // Mục tiêu: Giữ buffer luôn ở mức an toàn khoảng 2048 mẫu ( ~40ms độ trễ)
          const targetBuffer = 2048; 
          let drive = 1.0; // Tốc độ co giãn (1.0 là bình thường)

          // Nếu buffer đầy quá (> 3000) -> Tua nhanh (drive > 1)
          if (bufferedFrames > 3000) {
             drive = 1.005; // Tăng tốc 0.5% (Tai người khó nhận ra pitch shift nhỏ này)
          } 
          // Nếu buffer cạn quá (< 1000) -> Tua chậm (drive < 1)
          else if (bufferedFrames < 1000) {
             drive = 0.995; // Giảm tốc 0.5%
          }

          // Ratio thực tế áp dụng cho khung hình này
          const effectiveRatio = this.baseRatio * drive;

          // 3. RESAMPLING & OUTPUT (Chạy ngay trong Worklet)
          // Dùng Linear Interpolation đọc từ Ring Buffer ra Output
          
          // Nếu không đủ dữ liệu thì im lặng (tránh lỗi)
          if (bufferedFrames < outLen * effectiveRatio) {
             for (let i=0; i<outLen; i++) { L[i]=0; R[i]=0; }
             return true;
          }

          for (let i = 0; i < outLen; i++) {
             // Đọc chỉ số thực từ Ring Buffer
             const offset = this.readPtr;
             const offsetNext = (offset + 2) & ((this.bufferSize * 2) - 1); // +2 vì nhảy qua cặp L/R

             // Lấy mẫu hiện tại
             const l0 = this.buffer[offset];
             const r0 = this.buffer[offset + 1];

             // Lấy mẫu kế tiếp (để nội suy)
             const l1 = this.buffer[offsetNext];
             const r1 = this.buffer[offsetNext + 1];

             // Ghi ra loa (chưa nội suy kỹ để tối ưu tốc độ, ở mức này nghe đã ổn)
             // Nếu muốn xịn hơn thì cần biến 'fraction', nhưng simple resampling đỡ tốn CPU worklet
             L[i] = l0; 
             R[i] = r0;

             // Di chuyển con trỏ đọc (Logic Resample nằm ở đây)
             // Thay vì +2 (1 frame), ta cộng theo tỷ lệ Ratio
             // Do RingBuffer integer, ta dùng Accumulator giả lập (đơn giản hóa ở mức cơ bản)
             
             // --- FIX ĐƠN GIẢN HÓA CHO DỄ HIỂU VÀ MƯỢT ---
             // Ở đây mình dùng Nearest Neighbor có Rate Control để đảm bảo không bị rè
             // Vì Linear Interpolation trong vòng lặp biến thiên buffer rất phức tạp
             
             // Cập nhật con trỏ đọc
             // Chúng ta "ăn" buffer nhanh hay chậm tùy vào drive
             const step = 2 * effectiveRatio; // Bước nhảy số thực
             
             // Trick: Worklet chạy vòng lặp fixed, ta cần quản lý index bằng số thực
             // Để đơn giản cho bạn, ta dùng một biến đếm global cho pha (phase)
             // Nhưng ở đây ta dùng cách đơn giản nhất: Consuming Buffer
          }
          
          // ĐOẠN TRÊN LÀ LOGIC, CÒN ĐÂY LÀ CODE CHẠY THỰC TẾ ĐỂ FIX RÈ:
          // Ta dùng thuật toán Resampler đơn giản tích hợp sẵn
          
          let readIndex = this.readPtr;
          
          for (let i = 0; i < outLen; i++) {
             const idx = Math.floor(readIndex);
             const safeIdx = idx & ((this.bufferSize * 2) - 2); // Ensure even index alignment
             
             L[i] = this.buffer[safeIdx];
             R[i] = this.buffer[safeIdx+1];
             
             readIndex += (2 * effectiveRatio); // Nhảy cóc theo tỷ lệ
          }
          
          // Cập nhật lại con trỏ chính thức
          this.readPtr = Math.floor(readIndex) & ((this.bufferSize * 2) - 1);
          // Đảm bảo alignment chẵn (Stereo L/R)
          if (this.readPtr % 2 !== 0) this.readPtr = (this.readPtr - 1) & ((this.bufferSize * 2) - 1);

          return true;
        }
      }
      registerProcessor('retro-audio', RetroProcessor);
    `;

    const blob = new Blob([workletCode], { type: 'application/javascript' });
    await this.audioCtx.audioWorklet.addModule(URL.createObjectURL(blob));
    
    this.workletNode = new AudioWorkletNode(this.audioCtx, 'retro-audio', { outputChannelCount: [2] });
    
    // Gửi SampleRate chuẩn vào Worklet
    this.workletNode.port.postMessage({ type: 'config', rate: this.inputSampleRate });
    
    this.workletNode.connect(this.audioCtx.destination);
    console.log(`[Audio Pro] Ring Buffer System Active. Core Rate: ${this.inputSampleRate}`);
  }

  resume() { if (this.audioCtx?.state === 'suspended') this.audioCtx.resume(); }

  push(heapBuffer, offset, frames) {
    if (!this.workletNode) return frames;
    
    // Main Thread chỉ làm việc nhẹ nhất: Copy và ném đi
    // Không tính toán Resample ở đây nữa (chuyển việc nặng cho Worklet)
    try {
      // 1. Lấy dữ liệu Int16
      const int16Data = new Int16Array(heapBuffer, offset, frames * 2);
      
      // 2. Convert sang Float32 (Chuẩn Web Audio)
      // Dùng vòng lặp copy nhanh
      const floatData = new Float32Array(frames * 2);
      for (let i = 0; i < frames * 2; i++) {
          floatData[i] = int16Data[i] / 32768.0;
      }
      
      // 3. Gửi sang Worklet (Transfer memory để không tốn RAM copy)
      this.workletNode.port.postMessage(floatData, [floatData.buffer]);
      
    } catch (e) { console.error(e); }
    return frames;
  }
})();
var isRunning = false;
// ===== 3. CORE INTERFACE ===== //
const libCore = (() => {
  function audio_cb(l, r) {}
  function audio_batch_cb(ptr, frames) { return audioSys.push(Module.HEAPU8.buffer, ptr, frames); }
  function input_poll_cb() {}
  function env_cb() { return 0 }
  function mainLoop() { 
    Module._retro_run();
    requestAnimationFrame(mainLoop);
  }
  return { audio_cb, audio_batch_cb, input_poll_cb, env_cb, mainLoop };
})();
// ===== Gamepad ===== //
const libPad = (() => {
  const padState = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, l: false, r: false, start: false, select: false };
  const btnMap = { up: 4, down: 5, left: 6, right: 7, a: 8, b: 0, x: 9, y: 1, l: 10, r: 11, start: 3, select: 2 };
  function press(btn)   { if (padState.hasOwnProperty(btn)) padState[btn] = true  }
  function unpress(btn) { if (padState.hasOwnProperty(btn)) padState[btn] = false }
  function input_state_cb(port, device, index, id) {
    if (port !== 0 || device !== 1) return 0;
    for (const key in btnMap) {
      if (btnMap[key] === id) return padState[key] ? 1 : 0;
    }
    return 0;
  }
  return { press, unpress,input_state_cb }
})();
// ===== WebGL ===== //
const libGL = (() => {
  let gl = null, glProgram = null, glTexture = null, glBuffer = null, glLoc = {};
  function initWebGL(w, h) {
    const canvas = Module.canvas;
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const vsSrc = 'attribute vec2 a;varying vec2 v;void main(){gl_Position=vec4(a,0,1);v=(a+1.0)/2.0;v.y=1.0-v.y;}';
    const fsSrc = 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}';
    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    glProgram = gl.createProgram();
    gl.attachShader(glProgram, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(glProgram, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(glProgram);
    gl.useProgram(glProgram);
    glBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    glLoc = { a: gl.getAttribLocation(glProgram, 'a'), t: gl.getUniformLocation(glProgram, 't') };
    gl.enableVertexAttribArray(glLoc.a);
    gl.vertexAttribPointer(glLoc.a, 2, gl.FLOAT, false, 0, 0);
    glTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.viewport(0, 0, w, h);
  }
  function video_cb(ptr, w, h, pitch) {
    if (!gl) initWebGL(w, h);
    const pixelData = new Uint16Array(Module.HEAPU8.buffer, ptr, (pitch / 2) * h);
    const gameStride = pitch / 2;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIndex = y * gameStride + x;
        const destIndex = (y * w + x) * 4;
        const color = pixelData[srcIndex];
        const r = (color >> 11) & 0x1F;
        const g = (color >> 5) & 0x3F;
        const b = color & 0x1F;
        rgba[destIndex] = (r << 3) | (r >> 2);
        rgba[destIndex + 1] = (g << 2) | (g >> 4);
        rgba[destIndex + 2] = (b << 3) | (b >> 2);
        rgba[destIndex + 3] = 255;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.useProgram(glProgram);
    gl.uniform1i(glLoc.t, 0);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return { initWebGL, video_cb }
})();
// ===== Core Loader ===== //
function loadCore(core) {
  return new Promise((resolve, reject) => {
    const cfg = CORE_CONFIG[core];
    const canvas = document.getElementById("screen");
    canvas.width = cfg.width;
    canvas.height = cfg.height;
    RATIO = cfg.ratio;
    window.Module = {
      canvas: canvas,
      onRuntimeInitialized() {
        const envPtr    = Module.addFunction(libCore.env_cb, "iii");
        const videoPtr  = Module.addFunction(libGL.video_cb, "viiii");
        const audioPtr  = Module.addFunction(libCore.audio_cb, "vii");
        const audioBPtr = Module.addFunction(libCore.audio_batch_cb, "iii");
        const pollPtr   = Module.addFunction(libCore.input_poll_cb, "v");
        const statePtr  = Module.addFunction(libPad.input_state_cb, "iiiii");
        Module._retro_set_environment(envPtr);
        Module._retro_set_video_refresh(videoPtr);
        Module._retro_set_audio_sample(audioPtr);
        Module._retro_set_audio_sample_batch(audioBPtr);
        Module._retro_set_input_poll(pollPtr);
        Module._retro_set_input_state(statePtr);
        Module._retro_init();
        resolve();
      }
    };
    const script = document.createElement('script');
    script.src = cfg.script;
    script.onload = () => {};
    script.onerror = reject;
    document.body.appendChild(script);
  });
}
async function initGame(rom) {
  const romPtr = Module._malloc(rom.length);
  const info = Module._malloc(16);
  Module.HEAPU8.set(rom, romPtr);
  Module.HEAPU32[(info >> 2) + 0] = 0;
  Module.HEAPU32[(info >> 2) + 1] = romPtr;
  Module.HEAPU32[(info >> 2) + 2] = rom.length;
  Module.HEAPU32[(info >> 2) + 3] = 0;
  Module._retro_load_game(info);
  isRunning = true;
  libCore.mainLoop();
}
async function loadRomFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const core = Object.entries(CORE_CONFIG).find(([_, cfg]) => cfg.ext.split(',').some(e => e.replace('.', '') === ext))?.[0];
  const cfg = CORE_CONFIG[core];
  const rom = new Uint8Array(await file.arrayBuffer());
  await loadCore(core);
  await audioSys.init(cfg.sampleRate);
  await initGame(rom);
}
function emuxDB(data, name) {
  const DB_NAME = 'EmuxDB';
  const STORE_NAME = 'data';
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(DB_NAME, 1);
    openReq.onupgradeneeded = () => openReq.result.createObjectStore(STORE_NAME);
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction(STORE_NAME, name ? 'readwrite' : 'readonly');
      const store = tx.objectStore(STORE_NAME);
      if (name) {
        store.put(data, name);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = reject;
      } else {
        const getReq = store.get(data);
        getReq.onsuccess = () => { db.close(); resolve(getReq.result); };
        getReq.onerror = reject;
      }
    };
    openReq.onerror = reject;
  });
}
// Ví dụ lưu dữ liệu
const testData = { foo: "bar", time: Date.now() };
emuxDB(testData, "testKey").then(ok => {
  if (ok) console.log("Đã lưu dữ liệu vào IndexedDB!");
});

// Ví dụ lấy lại dữ liệu
emuxDB("testKey").then(data => {
  console.log("Dữ liệu lấy được từ IndexedDB:", data);
});
document.addEventListener("DOMContentLoaded", () => {
// ===== ROM Loader =====
  document.getElementById("resume").onclick = () => {
    if (audioCtx) audioCtx.resume();
  }; 
  document.getElementById("rom").onchange = async (e) => { loadRomFile(e.target.files[0]) };
  document.querySelectorAll('.btn-control').forEach(btn => {
    const key = btn.getAttribute('data-btn');
    btn.addEventListener('mousedown', () => { libPad.press(key); });
    btn.addEventListener('touchstart', e => { libPad.press(key); e.preventDefault(); });
    btn.addEventListener('mouseup', () => { libPad.unpress(key); });
    btn.addEventListener('mouseleave', () => { libPad.unpress(key); });
    btn.addEventListener('touchend', e => { libPad.unpress(key); e.preventDefault(); });
    btn.addEventListener('touchcancel', e => { libPad.unpress(key); e.preventDefault(); });
  });
});
