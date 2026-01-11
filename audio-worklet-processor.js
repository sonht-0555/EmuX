class EmuxAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fifoL = new Int16Array(8192);
    this.fifoR = new Int16Array(8192);
    this.fifoHead = 0;
    this.fifoCnt = 0;
    this.ratio = 1;
    this.isRunning = false;
    this.port.onmessage = (event) => {
      if (event.data.type === 'setState') {
        this.isRunning = event.data.isRunning;
        this.ratio = event.data.ratio;
      } else if (event.data.type === 'push') {
        // event.data.left, event.data.right: ArrayBuffer
        let frames = event.data.frames;
        let left = new Int16Array(event.data.left);
        let right = new Int16Array(event.data.right);
        let tail = (this.fifoHead + this.fifoCnt) % 8192;
        for (let i = 0; i < frames; i++) {
          this.fifoL[tail] = left[i];
          this.fifoR[tail] = right[i];
          tail = (tail + 1) % 8192;
        }
        this.fifoCnt += frames;
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    const L = output[0], R = output[1];
    if (!this.isRunning) {
      L.fill(0); R.fill(0); return true;
    }
    let r = this.ratio;
    let need = Math.ceil(1024 * r);
    if (this.fifoCnt < need) {
      // Notify main thread to run emu and push more audio
      this.port.postMessage({ type: 'needMoreAudio', fifoCnt: this.fifoCnt });
      // Fill zeros to avoid noise
      L.fill(0); R.fill(0);
      // Debug: log underrun
      // console.warn('AudioWorklet: buffer underrun', this.fifoCnt, 'need', need);
      return true;
    }
    for (let i = 0; i < 1024; i++) {
      let pos = i * r;
      let idx = (this.fifoHead + Math.floor(pos)) % 8192;
      let nextIdx = (idx + 1) % 8192;
      let frac = pos - Math.floor(pos);
      // Clamp sample to [-1, 1]
      let l = (this.fifoL[idx] * (1 - frac) + this.fifoL[nextIdx] * frac) / 32768;
      let r_ = (this.fifoR[idx] * (1 - frac) + this.fifoR[nextIdx] * frac) / 32768;
      L[i] = Math.max(-1, Math.min(1, l));
      R[i] = Math.max(-1, Math.min(1, r_));
    }
    this.fifoHead = (this.fifoHead + (1024 * r | 0)) % 8192;
    this.fifoCnt -= (1024 * r | 0);
    if (this.fifoCnt < 0) this.fifoCnt = 0;
    return true;
  }
}
registerProcessor('emux-audio-processor', EmuxAudioProcessor);
