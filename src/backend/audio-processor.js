class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 16384;
        this.leftBuffer = new Float32Array(this.bufferSize);
        this.rightBuffer = new Float32Array(this.bufferSize);
        this.writePosition = this.silenceTimer = this.readPosition = 0;
        this.ratio = this.volume = 1.0;
        this.port.onmessage = (e) => {
            this.silenceTimer = 0;
            if (e.data.ratio) return this.ratio = e.data.ratio;
            const { l, r } = e.data;
            for (let i = 0; i < l.length; i++) {
                this.leftBuffer[this.writePosition] = l[i];
                this.rightBuffer[this.writePosition] = r[i];
                this.writePosition = (this.writePosition + 1) & (this.bufferSize - 1);
            }
        };
    }
    interpolate(b, p, m) {
        const i = p | 0, f = p - i, p0 = b[(i - 1) & m], p1 = b[i & m], p2 = b[(i + 1) & m], p3 = b[(i + 2) & m];
        return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
    }
    process(_, outputs) {
        const out = outputs[0], outL = out[0], outR = out[1], outLen = outL.length;
        const b = this.bufferSize, m = b - 1, ratio = this.ratio, lb = this.leftBuffer, rb = this.rightBuffer;
        let p = this.readPosition, avail = (this.writePosition - (p | 0) + b) & m;
        const dynRatio = ratio * (avail > b * 0.7 ? 1.005 : avail < 4800 ? 0.995 : 1);
        this.silenceTimer++;
        if (this.silenceTimer > 15 || avail < 256) this.volume = Math.max(0, this.volume - 0.1);
        else if (avail > 512) this.volume = Math.min(1, this.volume + 0.1);
        const v = this.volume, count = Math.min(outLen, Math.max(0, Math.floor((avail - 8) / dynRatio)));
        for (let i = 0; i < count; i++) {
            outL[i] = this.interpolate(lb, p, m) * v;
            if (outR) outR[i] = this.interpolate(rb, p, m) * v;
            p += dynRatio;
            if (p >= b) p -= b;
        }
        if (count < outLen) {
            outL.fill(0, count);
            if (outR) outR.fill(0, count);
        }
        this.readPosition = p;
        return true;
    }
}
registerProcessor('audio-processor', AudioProcessor);