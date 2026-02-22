// ===== Audio Processor =====
class AudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const {sabL, sabR, sabIndices, bufSize} = options.processorOptions;
        this.leftBuffer = new Float32Array(sabL);
        this.rightBuffer = new Float32Array(sabR);
        this.indices = new Uint32Array(sabIndices);
        this.bufferSize = bufSize;
        this.mask = bufSize - 1;
    }
    // ===== process =====
    process(_, outputs) {
        const output = outputs[0], outputLeft = output[0], outputRight = output[1], outputLength = outputLeft.length;
        const writeIndex = Atomics.load(this.indices, 0), readIndex = Atomics.load(this.indices, 1);
        if (((writeIndex - readIndex + this.bufferSize) & this.mask) < outputLength) {
            outputLeft.fill(0);
            if (outputRight) outputRight.fill(0);
            return true;
        }
        const space = this.bufferSize - readIndex;
        if (outputLength <= space) {
            outputLeft.set(this.leftBuffer.subarray(readIndex, readIndex + outputLength));
            if (outputRight) outputRight.set(this.rightBuffer.subarray(readIndex, readIndex + outputLength));
        } else {
            outputLeft.set(this.leftBuffer.subarray(readIndex, readIndex + space));
            outputLeft.set(this.leftBuffer.subarray(0, outputLength - space), space);
            if (outputRight) {
                outputRight.set(this.rightBuffer.subarray(readIndex, readIndex + space));
                outputRight.set(this.rightBuffer.subarray(0, outputLength - space), space);
            }
        }
        Atomics.store(this.indices, 1, (readIndex + outputLength) & this.mask);
        return true;
    }
}
registerProcessor('audio-processor', AudioProcessor);