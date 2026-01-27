class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 16384; // Bộ đệm lớn hơn để chống sốc
    this.L = new Float32Array(this.size);
    this.R = new Float32Array(this.size);
    this.w = 0; // Write pointer (Integer)
    this.r = 0.0; // Read pointer (Float)
    this.ratio = 1.0;

    this.port.onmessage = e => {
      if (e.data.ratio) return this.ratio = e.data.ratio;
      const { l, r } = e.data;
      // Ghi dữ liệu vào thùng chứa
      for (let i = 0; i < l.length; i++) {
        this.L[this.w] = l[i];
        this.R[this.w] = r[i];
        this.w = (this.w + 1) % this.size;
      }
    };
  }

  // Hermite Interpolation (4-point)
  interp(buf, ptr) {
    let i = Math.floor(ptr), f = ptr - i;
    let p0 = buf[(i - 1 + this.size) % this.size];
    let p1 = buf[i % this.size];
    let p2 = buf[(i + 1) % this.size];
    let p3 = buf[(i + 2) % this.size];
    return p1 + 0.5 * f * (p2 - p0 + f * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + f * (3.0 * (p1 - p2) + p3 - p0)));
  }

  process(_, [out]) {
    const [oL, oR] = out;
    const len = oL.length;
    
    // Tính khoảng cách thực tế giữa W và R
    let readInt = Math.floor(this.r);
    let avail = (this.w - readInt + this.size) % this.size;

    // Nếu bộ đệm quá đầy (> 70%), tăng tốc đọc một chút để đuổi kịp
    // Nếu bộ đệm quá ít (< 10%), giảm tốc đọc để chờ dữ liệu
    let dynamicRatio = this.ratio;
    if (avail > this.size * 0.7) dynamicRatio *= 1.01;
    else if (avail < 400) dynamicRatio *= 0.99;

    for (let i = 0; i < len; i++) {
      if (avail > 8) { // Giữ khoảng cách an toàn 8 mẫu để nội suy bậc 3 không bị rác
        oL[i] = this.interp(this.L, this.r);
        if (oR) oR[i] = this.interp(this.R, this.r);
        
        this.r = (this.r + dynamicRatio) % this.size;
        avail -= dynamicRatio;
      } else {
        oL[i] = oR ? oR[i] = 0 : 0; // Hết dữ liệu thì im lặng
      }
    }

    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
