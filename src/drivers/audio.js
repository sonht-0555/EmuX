// ===== Audio System =====
const audio_batch_cb = (pointer, frames) => writeAudio(pointer, frames), audio_cb = () => { };
var audioContext, audioWorkletNode, audioGainNode, totalSamplesSent = 0, audioStartTime = 0, audioCoreRatio = 1.0, currentModule = null, resampledPtrL = 0, resampledPtrR = 0, sabL, sabR, sabIndices, sabViewLeft, sabViewRight, sabViewIndices;
// ===== initAudio =====
async function initAudio(ratio) {
    if (audioContext) return audioContext.resume();
    audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 48000});
    const code = `class P extends AudioWorkletProcessor{constructor(o){super();const{sabL,sabR,sabIndices,bufSize}=o.processorOptions;this.L=new Float32Array(sabL);this.R=new Float32Array(sabR);this.I=new Uint32Array(sabIndices);this.S=bufSize;this.M=bufSize-1}process(_,o){const u=o[0],l=u[0],r=u[1],n=l.length,w=Atomics.load(this.I,0),i=Atomics.load(this.I,1);if(((w-i+this.S)&this.M)<n){l.fill(0);if(r)r.fill(0);return true}const s=this.S-i;if(n<=s){l.set(this.L.subarray(i,i+n));if(r)r.set(this.R.subarray(i,i+n))}else{l.set(this.L.subarray(i,i+s));l.set(this.L.subarray(0,n-s),s);if(r){r.set(this.R.subarray(i,i+s));r.set(this.R.subarray(0,n-s),s)}}Atomics.store(this.I,1,(i+n)&this.M);return true}}registerProcessor('p',P)`;
    const blob = new Blob([code], {type: 'application/javascript'});
    await audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
    const bufSize = 16384;
    sabL = new SharedArrayBuffer(bufSize * 4);
    sabR = new SharedArrayBuffer(bufSize * 4);
    sabIndices = new SharedArrayBuffer(8);
    sabViewLeft = new Float32Array(sabL);
    sabViewRight = new Float32Array(sabR);
    sabViewIndices = new Uint32Array(sabIndices);
    audioWorkletNode = new AudioWorkletNode(audioContext, 'p', {processorOptions: {sabL, sabR, sabIndices, bufSize}});
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.value = 1;
    audioCoreRatio = ratio;
    if (currentModule !== Module) {
        currentModule = Module;
        resampledPtrL = Module._malloc(4096 * 4);
        resampledPtrR = Module._malloc(4096 * 4);
    }
    if (Module._emux_audio_reset) Module._emux_audio_reset();
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    audioStartTime = audioContext.currentTime;
    totalSamplesSent = 0;
}
// ===== writeAudio =====
function writeAudio(pointer, frames) {
    if (!audioWorkletNode || !isRunning || !Module._emux_audio_process) return frames;
    const count = Module._emux_audio_process(pointer, frames, resampledPtrL, resampledPtrR, audioCoreRatio);
    if (count > 0) {
        const left = new Float32Array(Module.HEAPU8.buffer, resampledPtrL, count);
        const right = new Float32Array(Module.HEAPU8.buffer, resampledPtrR, count);
        const bufferSize = sabViewLeft.length;
        let writeIndex = Atomics.load(sabViewIndices, 0), space = bufferSize - writeIndex;
        if (count <= space) {
            sabViewLeft.set(left, writeIndex);
            sabViewRight.set(right, writeIndex);
        } else {
            sabViewLeft.set(left.subarray(0, space), writeIndex);
            sabViewLeft.set(left.subarray(space), 0);
            sabViewRight.set(right.subarray(0, space), writeIndex);
            sabViewRight.set(right.subarray(space), 0);
        }
        Atomics.store(sabViewIndices, 0, (writeIndex + count) & (bufferSize - 1));
        totalSamplesSent += count;
    }
    if (window.Perf) window.Perf.countAudio(frames);
    return frames;
}
// ===== getAudioBacklog =====
window.getAudioBacklog = () => {
    if (!audioContext || audioContext.state !== 'running') return 0;
    const backlog = totalSamplesSent - (audioContext.currentTime - audioStartTime) * 48000;
    return Math.max(-5000, Math.min(5000, backlog));
};
// ===== resetAudioSync =====
window.resetAudioSync = () => {
    totalSamplesSent = 0;
    if (audioContext) audioStartTime = audioContext.currentTime;
    if (window.Module && window.Module._emux_audio_reset) window.Module._emux_audio_reset();
};