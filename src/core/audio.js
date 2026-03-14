// ===== Audio System =====
const audio_batch_cb = (pointer, frames) => writeAudio(pointer, frames), audio_cb = () => { };
var audioContext, audioWorkletNode, audioGainNode, totalSamplesSent = 0, audioStartTime = 0, sabL, sabR, sabIndices, sabViewLeft, sabViewRight, sabViewIndices, wasmOutL = 0, wasmOutR = 0, sabBufSize = 0, sabMask = 0;
// ===== initAudio =====
async function initAudio(coreRate) {
    if (audioContext) return audioContext.resume();
    audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate: 48000});
    const code = `class P extends AudioWorkletProcessor{constructor(o){super();const{sabL,sabR,sabIndices,bufSize}=o.processorOptions;this.L=new Float32Array(sabL);this.R=new Float32Array(sabR);this.I=new Uint32Array(sabIndices);this.S=bufSize;this.M=bufSize-1}process(_,o){const u=o[0],l=u[0],r=u[1],n=l.length,w=Atomics.load(this.I,0),i=Atomics.load(this.I,1);if(((w-i+this.S)&this.M)<n){l.fill(0);if(r)r.fill(0);return true}const s=this.S-i;if(n<=s){l.set(this.L.subarray(i,i+n));if(r)r.set(this.R.subarray(i,i+n))}else{l.set(this.L.subarray(i,i+s));l.set(this.L.subarray(0,n-s),s);if(r){r.set(this.R.subarray(i,i+s));r.set(this.R.subarray(0,n-s),s)}}Atomics.store(this.I,1,(i+n)&this.M);return true}}registerProcessor('p',P)`;
    const blob = new Blob([code], {type: 'application/javascript'});
    await audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
    sabBufSize = 8192;
    sabMask = sabBufSize - 1;
    sabL = new SharedArrayBuffer(sabBufSize * 4);
    sabR = new SharedArrayBuffer(sabBufSize * 4);
    sabIndices = new SharedArrayBuffer(8);
    sabViewLeft = new Float32Array(sabL);
    sabViewRight = new Float32Array(sabR);
    sabViewIndices = new Uint32Array(sabIndices);
    audioWorkletNode = new AudioWorkletNode(audioContext, 'p', {processorOptions: {sabL, sabR, sabIndices, bufSize: sabBufSize}});
    audioGainNode = audioContext.createGain();
    audioGainNode.gain.value = 1;
    wasmOutL = Module._emux_audio_get_buffer_l();
    wasmOutR = Module._emux_audio_get_buffer_r();
    Module._emux_audio_set_core_rate(coreRate);
    if (Module._emux_audio_reset) Module._emux_audio_reset();
    audioWorkletNode.connect(audioGainNode).connect(audioContext.destination);
    audioStartTime = audioContext.currentTime;
    totalSamplesSent = 0;
}
// ===== writeAudio =====
function writeAudio(pointer, frames) {
    if (!audioWorkletNode || !isRunning || !Module._emux_audio_process) return frames;
    const count = Module._emux_audio_process(pointer, frames);
    if (count > 0) {
        const writeIndex = Atomics.load(sabViewIndices, 0);
        const readIndex = Atomics.load(sabViewIndices, 1);
        const used = (writeIndex - readIndex + sabBufSize) & sabMask;
        const free = sabBufSize - used - 1;
        if (count > free) return frames;
        const left = new Float32Array(Module.HEAPU8.buffer, wasmOutL, count);
        const right = new Float32Array(Module.HEAPU8.buffer, wasmOutR, count);
        const space = sabBufSize - writeIndex;
        if (count <= space) {
            sabViewLeft.set(left, writeIndex);
            sabViewRight.set(right, writeIndex);
        } else {
            sabViewLeft.set(left.subarray(0, space), writeIndex);
            sabViewLeft.set(left.subarray(space), 0);
            sabViewRight.set(right.subarray(0, space), writeIndex);
            sabViewRight.set(right.subarray(space), 0);
        }
        Atomics.store(sabViewIndices, 0, (writeIndex + count) & sabMask);
        totalSamplesSent += count;
    }
    return frames;
}
// ===== getAudioSync =====
window.getAudioSync = () => {
    if (!audioContext || audioContext.state !== 'running') return 1;
    let backlog = totalSamplesSent - (audioContext.currentTime - audioStartTime) * audioContext.sampleRate;
    if (Math.abs(backlog) > 4000) {
        audioStartTime = audioContext.currentTime - (totalSamplesSent / audioContext.sampleRate);
        backlog = 0;
    }
    const base = window._base || 1;
    const runs = backlog > 3000 ? base - 1 : (backlog < 1000 ? base + 1 : base);
    window._tick = (window._tick || 0) + 1; window._total = (window._total || 0) + runs;
    if (window._tick === 60) {
        window._base = Math.round(window._total / 60) || 1;
        console.log(`B.${backlog.toFixed(0)} R.${runs}/${window._base} C.${Math.round(window._total / window._base)}`);
        window._tick = window._total = 0;
    }
    return runs;
};
// ===== resetAudioSync =====
window.resetAudioSync = () => {
    totalSamplesSent = 0;
    if (audioContext) audioStartTime = audioContext.currentTime;
    if (window.Module && window.Module._emux_audio_reset) window.Module._emux_audio_reset();
    if (sabViewIndices) {
        Atomics.store(sabViewIndices, 0, 0);
        Atomics.store(sabViewIndices, 1, 0);
    }
};