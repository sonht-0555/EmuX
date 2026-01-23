// ===== Main Audio System =====

const CORE_CONFIG = {
  gba:  { ratio: 65536 / 48000, width: 240, height: 160, ext: '.gba', script: './src/core/mgba.js' },
  gbc:  { ratio: 131072 / 48000, width: 160, height: 144, ext: '.gb,.gbc', script: './src/core/mgba.js' },
  snes: { ratio: 32040 / 48000, width: 256, height: 224, ext: '.smc,.sfc', script: './src/core/snes9x.js' }
};

var isRunning = false;
var RATIO = 1.0;
var audioCtx, audioWorklet;

// ===== Audio Manager =====
async function initAudio() {
  if (audioCtx) {
    await audioCtx.resume();
    return;
  }
  
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ 
    sampleRate: 48000,
    latencyHint: 'interactive'
  });
  
  await audioCtx.audioWorklet.addModule('./src/js/audio-processor.js');
  
  audioWorklet = new AudioWorkletNode(audioCtx, 'emulator-audio-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });
  
  audioWorklet.connect(audioCtx.destination);
  
  audioWorklet.port.onmessage = (e) => {
    if (e.data.type === 'needSamples' && isRunning && Module?._retro_run) {
      for (let i = 0; i < 4; i++) Module._retro_run();
    }
  };
  
  if (RATIO) audioWorklet.port.postMessage({ type: 'ratio', value: RATIO });
  if (isRunning) audioWorklet.port.postMessage({ type: 'running', value: true });
  
  await audioCtx.resume();
}

function setRunning(running) {
  isRunning = running;
  audioWorklet?.port.postMessage({ type: 'running', value: running });
}

function setRatio(ratio) {
  RATIO = ratio;
  audioWorklet?.port.postMessage({ type: 'ratio', value: ratio });
}

function resetAudio() {
  audioWorklet?.port.postMessage({ type: 'reset' });
}

function destroyAudio() {
  audioWorklet?.disconnect();
  audioWorklet = null;
  audioCtx?.close();
  audioCtx = null;
}

function writeAudio(ptr, frames) {
  if (!audioWorklet) return frames;
  
  const data = new Int16Array(Module.HEAPU8.buffer, ptr, frames * 2);
  const buffer = new ArrayBuffer(data.byteLength);
  const copy = new Int16Array(buffer);
  copy.set(data);
  
  audioWorklet.port.postMessage({ type: 'audio', samples: copy }, [buffer]);
  return frames;
}

function audio_batch_cb(ptr, frames) {
  return writeAudio(ptr, frames);
}



//await initAudio();  // Init audio
//setRunning(true);   // Start audio
//setRunning(false);  // Pause audio
//setRatio(1.365);    // GBA ratio
//resetAudio();       // Clear buffer
//destroyAudio();     // Cleanup