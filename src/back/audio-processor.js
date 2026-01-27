class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 8192;
    this.L = new Float32Array(this.size);
    this.R = new Float32Array(this.size);
    this.head = 0; this.cnt = 0; this.ratio = 1;
    this.port.onmessage = e => {
      if (e.data.ratio) return this.ratio = e.data.ratio;
      const { l, r } = e.data;
      for (let i = 0; i < l.length && this.cnt < this.size; i++) {
        let w = (this.head + this.cnt) % this.size;
        this.L[w] = l[i]; this.R[w] = r[i];
        this.cnt++;
      }
    };
  }
  process(_, [out]) {
    const [oL, oR] = out, len = oL.length;
    for (let i = 0; i < len; i++) {
      let pos = i * this.ratio, idx = (this.head + (pos | 0)) % this.size, frac = pos % 1;
      let next = (idx + 1) % this.size;
      if (this.cnt > (pos | 0) + 1) {
        oL[i] = this.L[idx] * (1 - frac) + this.L[next] * frac;
        if (oR) oR[i] = this.R[idx] * (1 - frac) + this.R[next] * frac;
      } else oL[i] = (oR ? oR[i] = 0 : 0);
    }
    this.head = (this.head + (len * this.ratio | 0)) % this.size;
    this.cnt -= (len * this.ratio | 0);
    if (this.cnt < 0) this.cnt = 0;
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
