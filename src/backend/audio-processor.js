class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 16384;
        this.leftBuffer = new Float32Array(this.bufferSize);
        this.rightBuffer = new Float32Array(this.bufferSize);
        this.writePosition = this.readPosition = 0;
        this.port.onmessage = (e) => {
            const { l, r } = e.data;
            for (let i = 0; i < l.length; i++) {
                this.leftBuffer[this.writePosition] = l[i];
                this.rightBuffer[this.writePosition] = r[i];
                this.writePosition = (this.writePosition + 1) & (this.bufferSize - 1);
            }
        };
    }
    process(_, outputs) {
        const out = outputs[0], outL = out[0], outR = out[1], outLen = outL.length;
        const b = this.bufferSize, m = b - 1, lb = this.leftBuffer, rb = this.rightBuffer;
        let p = this.readPosition, avail = (this.writePosition - p + b) & m;
        
        if (avail < outLen) {
            outL.fill(0); if (outR) outR.fill(0);
            return true;
        }

        for (let i = 0; i < outLen; i++) {
            outL[i] = lb[p];
            if (outR) outR[i] = rb[p];
            p = (p + 1) & m;
        }
        this.readPosition = p;
        return true;
    }
}
registerProcessor('audio-processor', AudioProcessor);