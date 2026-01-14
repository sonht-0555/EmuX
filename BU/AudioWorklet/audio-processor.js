// ===== audio-processor.js - AudioWorklet Processor =====

class EmulatorAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fifoL = new Int16Array(8192);
    this.fifoR = new Int16Array(8192);
    this.fifoHead = 0;
    this.fifoCnt = 0;
    this.ratio = 1.0;
    this.isRunning = false;
    
    this.port.onmessage = (e) => {
      switch(e.data.type) {
        case 'audio':
          this.writeAudio(e.data.samples);
          break;
        case 'ratio':
          this.ratio = e.data.value;
          break;
        case 'running':
          this.isRunning = e.data.value;
          break;
        case 'reset':
          this.fifoHead = 0;
          this.fifoCnt = 0;
          break;
      }
    };
  }
  
  writeAudio(samples) {
    const frames = samples.length / 2;
    if (this.fifoCnt + frames >= 8192) return;
    
    let tail = (this.fifoHead + this.fifoCnt) % 8192;
    for (let i = 0; i < frames; i++) {
      this.fifoL[tail] = samples[i * 2];
      this.fifoR[tail] = samples[i * 2 + 1];
      tail = (tail + 1) % 8192;
    }
    this.fifoCnt += frames;
  }
  
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length < 2) return true;
    
    const L = output[0];
    const R = output[1];
    const frameCount = L.length;
    
    if (!this.isRunning || this.fifoCnt < frameCount * this.ratio) {
      L.fill(0);
      R.fill(0);
      if (this.isRunning) this.port.postMessage({ type: 'needSamples' });
      return true;
    }
    
    for (let i = 0; i < frameCount; i++) {
      const pos = i * this.ratio;
      const idx = (this.fifoHead + Math.floor(pos)) % 8192;
      const frac = pos % 1;
      const nextIdx = (idx + 1) % 8192;
      
      L[i] = (this.fifoL[idx] * (1 - frac) + this.fifoL[nextIdx] * frac) / 32768;
      R[i] = (this.fifoR[idx] * (1 - frac) + this.fifoR[nextIdx] * frac) / 32768;
    }
    
    const consumed = Math.floor(frameCount * this.ratio);
    this.fifoHead = (this.fifoHead + consumed) % 8192;
    this.fifoCnt -= consumed;
    
    if (this.fifoCnt < 2048) this.port.postMessage({ type: 'needSamples' });
    
    return true;
  }
}

registerProcessor('emulator-audio-processor', EmulatorAudioProcessor);

// ===== audio-processor.js - AudioWorklet Processor =====