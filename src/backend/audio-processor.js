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
    // 1. Bitwise
    const i = p | 0;
    const f = p - i;
    const m = this.s - 1;
    const p0 = b[(i - 1) & m];
    const p1 = b[i & m];
    const p2 = b[(i + 1) & m];
    const p3 = b[(i + 2) & m];
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));

    // 2. Linear Interpolation
    // return b[i & m] + f * (b[(i + 1) & m] - b[i & m]);

    // 3. Nearest Neighbor
    // return b[i & m];
  }
  process(_, [out]) {
    const [oL, oR] = out, len = oL.length, L = this.L, R = this.R, s = this.s;
    let r = this.r, avail = (this.w - (r | 0) + s) & (s - 1);
    const d = this.ratio * (avail > s * 0.7 ? 1.01 : avail < 400 ? 0.99 : 1);

    if (oR) for (let i = 0; i < len; i++) {
      if (avail > 8) {
        oL[i] = this.interp(L, r); oR[i] = this.interp(R, r);
        if ((r += d) >= s) r -= s; avail -= d;
      } else oL[i] = oR[i] = 0;
    } else for (let i = 0; i < len; i++) {
        if (avail > 8) {
        oL[i] = this.interp(L, r);
        if ((r += d) >= s) r -= s; avail -= d;
      } else oL[i] = 0;
    }
    this.r = r; return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
