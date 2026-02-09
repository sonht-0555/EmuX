class AudioProcessor extends AudioWorkletProcessor {
    constructor(o) {
        super();
        const { sabL, sabR, sabIndices, bufSize } = o.processorOptions;
        this.lb = new Float32Array(sabL); this.rb = new Float32Array(sabR);
        this.idx = new Uint32Array(sabIndices); this.b = bufSize; this.m = bufSize - 1;
    }
    process(_, outputs) {
        const out = outputs[0], outL = out[0], outR = out[1], outLen = outL.length;
        const w = Atomics.load(this.idx, 0), r = Atomics.load(this.idx, 1);
        if (((w - r + this.b) & this.m) < outLen) {
            outL.fill(0); if (outR) outR.fill(0);
            return true;
        }
        const space = this.b - r;
        if (outLen <= space) {
            outL.set(this.lb.subarray(r, r + outLen));
            if (outR) outR.set(this.rb.subarray(r, r + outLen));
        } else {
            outL.set(this.lb.subarray(r, r + space));
            outL.set(this.lb.subarray(0, outLen - space), space);
            if (outR) {
                outR.set(this.rb.subarray(r, r + space));
                outR.set(this.rb.subarray(0, outLen - space), space);
            }
        }
        Atomics.store(this.idx, 1, (r + outLen) & this.m);
        return true;
    }
}
registerProcessor('audio-processor', AudioProcessor);