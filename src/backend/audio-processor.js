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
                this.writePosition = (this.writePosition + 1) % this.bufferSize;
            }
        };
    }
    // ===== interpolate =====
    interpolate(buffer, position) {
        const integerPart = position | 0;
        const fractionalPart = position - integerPart;
        const mask = this.bufferSize - 1;
        const point0 = buffer[(integerPart - 1) & mask];
        const point1 = buffer[integerPart & mask];
        const point2 = buffer[(integerPart + 1) & mask];
        const point3 = buffer[(integerPart + 2) & mask];
        const interpolatedValue = point1 + 0.5 * fractionalPart * (
            point2 - point0 + fractionalPart * (
                2 * point0 - 5 * point1 + 4 * point2 - point3 + fractionalPart * (
                    3 * (point1 - point2) + point3 - point0
                )
            )
        );
        return interpolatedValue * this.volume;
    }
    // ===== process =====
    process(inputs, outputs) {
        const outputChannels = outputs[0];
        const outputLeft = outputChannels[0];
        const outputRight = outputChannels[1];
        const outputLength = outputLeft.length;
        let readPosition = this.readPosition;
        let availableSamples = (this.writePosition - (readPosition | 0) + this.bufferSize) & (this.bufferSize - 1);
        const dynamicRatio = this.ratio * (
            availableSamples > this.bufferSize * 0.7 ? 1.005 :
            availableSamples < 4800 ? 0.995 : 1
        );
        this.silenceTimer++;
        if (this.silenceTimer > 6) {
            this.volume = Math.max(0, this.volume - 0.1);
        } else if (availableSamples > 1024) {
            this.volume = Math.min(1, this.volume + 0.05);
        }
        if (outputRight) {
            for (let index = 0; index < outputLength; index++) {
                if (availableSamples > 8) {
                    outputLeft[index] = this.interpolate(this.leftBuffer, readPosition);
                    outputRight[index] = this.interpolate(this.rightBuffer, readPosition);
                    readPosition += dynamicRatio;
                    if (readPosition >= this.bufferSize) {
                        readPosition -= this.bufferSize;
                    }
                    availableSamples -= dynamicRatio;
                } else {
                    outputLeft[index] = 0;
                    outputRight[index] = 0;
                }
            }
        } else {
            for (let index = 0; index < outputLength; index++) {
                if (availableSamples > 8) {
                    outputLeft[index] = this.interpolate(this.leftBuffer, readPosition);
                    readPosition += dynamicRatio;
                    if (readPosition >= this.bufferSize) {
                        readPosition -= this.bufferSize;
                    }
                    availableSamples -= dynamicRatio;
                } else {
                    outputLeft[index] = 0;
                }
            }
        }
        this.readPosition = readPosition;
        return true;
    }
}
registerProcessor('audio-processor', AudioProcessor);
