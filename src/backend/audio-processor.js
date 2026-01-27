class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.s = 16384; this.L = new Float32Array(this.s); this.R = new Float32Array(this.s);
    this.w = 0; this.r = 0.0; this.ratio = 1.0;
    this.port.onmessage = e => {
      if (e.data.ratio) return this.ratio = e.data.ratio;
      const { l, r } = e.data;
      for (let i = 0; i < l.length; i++, this.w = (this.w + 1) % this.s) {
        this.L[this.w] = l[i]; this.R[this.w] = r[i];
      }
    };
  }
  interp(b, p) {
    let i = Math.floor(p), f = p - i, s = this.s;
    let p0 = b[(i - 1 + s) % s], p1 = b[i % s], p2 = b[(i + 1) % s], p3 = b[(i + 2) % s];
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  }
  process(_, [out]) {
    const [oL, oR] = out, len = oL.length;
    let avail = (this.w - Math.floor(this.r) + this.s) % this.s;
    let dRatio = this.ratio * (avail > this.s * 0.7 ? 1.01 : avail < 400 ? 0.99 : 1);
    for (let i = 0; i < len; i++) {
      if (avail > 8) {
        oL[i] = this.interp(this.L, this.r); if (oR) oR[i] = this.interp(this.R, this.r);
        this.r = (this.r + dRatio) % this.s; avail -= dRatio;
      } else oL[i] = oR ? oR[i] = 0 : 0;
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
