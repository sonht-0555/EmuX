class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 16384;
    this.L = new Float32Array(this.size);
    this.R = new Float32Array(this.size);
    this.w = 0; this.r = 0; this.ratio = 1;
    this.port.onmessage = e => {
      if (e.data.ratio) return this.ratio = e.data.ratio;
      const { l, r } = e.data;
      for (let i = 0; i < l.length; i++) {
        this.L[this.w] = l[i]; this.R[this.w] = r[i];
        this.w = (this.w + 1) % this.size;
      }
    };
  }

  // Thuật toán Cubic Hermite để giữ nguyên độ trong trẻo (High-fidelity)
  interpolate(buf, ptr, f) {
    let i = Math.floor(ptr);
    let p0 = buf[(i - 1 + this.size) % this.size];
    let p1 = buf[i % this.size];
    let p2 = buf[(i + 1) % this.size];
    let p3 = buf[(i + 2) % this.size];
    return p1 + 0.5 * f * (p2 - p0 + f * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + f * (3.0 * (p1 - p2) + p3 - p0)));
  }

  process(_, [out]) {
    const [oL, oR] = out;
    let avail = (this.w - this.r + this.size) % this.size;
    
    for (let i = 0; i < oL.length; i++) {
      if (avail > this.ratio + 2) {
        let f = this.r % 1;
        oL[i] = this.interpolate(this.L, this.r, f);
        if (oR) oR[i] = this.interpolate(this.R, this.r, f);
        this.r = (this.r + this.ratio) % this.size;
        avail -= this.ratio;
      } else oL[i] = (oR ? oR[i] = 0 : 0);
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
