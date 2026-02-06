class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 16384;
        this.leftBuffer = new Float32Array(this.bufferSize);
        this.rightBuffer = new Float32Array(this.bufferSize);
        this.writePosition = 0;
        this.readPosition = 0.0;
        this.ratio = 1.0;
        this.volume = 1.0;
        this.silenceTimer = 0;
        this.port.onmessage = (event) => {
            // Reset timer when new data arrives
            this.silenceTimer = 0;
            if (event.data.ratio) {
                this.ratio = event.data.ratio;
                return;
            }
            const { l, r } = event.data;
            for (let index = 0; index < l.length; index++) {
                this.leftBuffer[this.writePosition] = l[index];
                this.rightBuffer[this.writePosition] = r[index];
                this.writePosition = (this.writePosition + 1) & (this.bufferSize - 1);
            }
        };
    }
    interpolate(buffer, position, mask) {
        const integer = position | 0;
        const f = position - integer;
        const p0 = buffer[(integer - 1) & mask];
        const p1 = buffer[integer & mask];
        const p2 = buffer[(integer + 1) & mask];
        const p3 = buffer[(integer + 2) & mask];
        return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
    }
    // ===== process =====
    process(inputs, outputs) {
        const outputChannels = outputs[0];
        const outputLeft = outputChannels[0];
        const outputRight = outputChannels[1];
        const outputLength = outputLeft.length;
        const bufferSize = this.bufferSize;
        const mask = bufferSize - 1;
        const ratio = this.ratio;
        const leftBuffer = this.leftBuffer;
        const rightBuffer = this.rightBuffer;
        let readPosition = this.readPosition;
        let availableSamples = (this.writePosition - (readPosition | 0) + bufferSize) & mask;
        const dynamicRatio = ratio * (
            availableSamples > bufferSize * 0.7 ? 1.005 :
            availableSamples < 4800 ? 0.995 : 1
        );
        this.silenceTimer++;
        if (this.silenceTimer > 15 || availableSamples < 256) {
            this.volume = Math.max(0, this.volume - 0.1);
        } else if (availableSamples > 512) {
            this.volume = Math.min(1, this.volume + 0.1);
        }
        const volume = this.volume;
        const processableCount = Math.min(outputLength, Math.max(0, Math.floor((availableSamples - 8) / dynamicRatio)));
        if (outputRight) {
            for (let i = 0; i < processableCount; i++) {
                outputLeft[i] = this.interpolate(leftBuffer, readPosition, mask) * volume;
                outputRight[i] = this.interpolate(rightBuffer, readPosition, mask) * volume;
                readPosition += dynamicRatio;
                if (readPosition >= bufferSize) readPosition -= bufferSize;
            }
            if (processableCount < outputLength) {
                outputLeft.fill(0, processableCount);
                outputRight.fill(0, processableCount);
            }
        } else {
            for (let i = 0; i < processableCount; i++) {
                outputLeft[i] = this.interpolate(leftBuffer, readPosition, mask) * volume;
                readPosition += dynamicRatio;
                if (readPosition >= bufferSize) readPosition -= bufferSize;
            }
            if (processableCount < outputLength) {
                outputLeft.fill(0, processableCount);
            }
        }
        this.readPosition = readPosition;
        return true;
    }
}
registerProcessor('audio-processor', AudioProcessor);
