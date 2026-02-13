/**
 * EmuX Netplay System (v5.7) - Production Ready Cleanup
 * Strictly following spec.md for Strict Lockstep & Binary Protocol.
 */

// Global State
let idString = "?";
var peer = null;
var connection = null;
var isHost = false;
window.currentFrame = 0;

// Synchronization Buffers
const INPUT_DELAY = 2; // Fixed delay to handle network jitter
const localInputBuffer = new Map();
const remoteInputBuffer = new Map();
const remoteInputs = {0: 0, 1: 0};

// Simulation Loop Variables
let lastTime = performance.now();
let accumulator = 0;
const FRAME_TIME = 1000 / 60;
let loopActive = false;

// Statistics & Monitoring
let stats = {
  sent: 0,
  received: 0,
  stalls: 0,
  ping: 0,
  lastPingTime: 0
};

// Utilities
function debug(msg, color = "#00ff00") {
  console.log(`%c[Netplay] ${msg}`, `color: ${color}; font-weight: bold`);
}

/**
 * Executes a single emulation frame if both local and remote inputs are available.
 */
function tryRunFrame() {
  const core = window.Module;
  if (!core?._retro_run) return;

  const fId = window.currentFrame;

  // Strict Lockstep: Stall if any input is missing
  if (!localInputBuffer.has(fId) || !remoteInputBuffer.has(fId)) {
    stats.stalls++;
    if (fId % 180 === 0) {
      console.warn(`[Netplay] STALL @ Frame ${fId} | Ping: ${stats.ping}ms | Stall Count: ${stats.stalls}`);
    }
    return;
  }

  // Prepare inputs for the core
  const myMask = localInputBuffer.get(fId);
  const rMask = remoteInputBuffer.get(fId);
  remoteInputs[0] = isHost ? myMask : rMask;
  remoteInputs[1] = isHost ? rMask : myMask;

  try {
    core._retro_run();
  } catch (e) {
    console.error("[Netplay] WASM Core Panic:", e);
  }

  // Cleanup and Advance
  localInputBuffer.delete(fId);
  remoteInputBuffer.delete(fId);
  window.currentFrame++;
  window._runCount = (window._runCount || 0) + 1;
}

/**
 * Main fixed-timestep loop for Netplay mode.
 */
function netplayLoop() {
  if (!window.isNetplaying || !connection?.open) {
    loopActive = false;
    debug("Loop Terminated (Connection closed)", "#ff4444");
    return;
  }
  requestAnimationFrame(netplayLoop);

  const now = performance.now();
  let delta = now - lastTime;
  lastTime = now;

  accumulator += delta;
  if (accumulator > 100) accumulator = 100; // Prevent death spiral

  while (accumulator >= FRAME_TIME) {
    accumulator -= FRAME_TIME;

    // Heartbeat: Automatic generation of local inputs to prevent stalls
    const targetFrame = window.currentFrame + INPUT_DELAY;
    if (!localInputBuffer.has(targetFrame)) {
      const mask = window.getGamepadMask ? window.getGamepadMask() : 0;
      localInputBuffer.set(targetFrame, mask);
      sendInput(targetFrame, mask);
    }

    tryRunFrame();
  }
}

/**
 * Initializes and starts the Netplay simulation loop.
 */
function startNetplayLoop() {
  if (loopActive) return;
  debug("🟢 NETPLAY ENGINE ACTIVATED", "#00ff00");

  stats.sent = 0; stats.received = 0; stats.stalls = 0;

  // Prime initial frames to kickstart simulation
  for (let i = 0; i <= INPUT_DELAY; i++) {
    if (!localInputBuffer.has(i)) {
      localInputBuffer.set(i, 0);
      sendInput(i, 0);
    }
  }

  lastTime = performance.now();
  accumulator = 0;
  loopActive = true;
  requestAnimationFrame(netplayLoop);

  // Performance Monitor
  setInterval(() => {
    if (connection?.open) {
      stats.lastPingTime = performance.now();
      connection.send({type: 'ping', t: stats.lastPingTime});
      console.log(`%c[Engine] Mode: NETPLAY (Sync-Lockstep) | Ping: ${stats.ping}ms | Stalls: ${stats.stalls}`, "color: #ffcc00; font-weight: bold");
    }
  }, 3000);
}

// Network Packets (Binary 6-byte)
function sendInput(frame, mask) {
  if (!connection?.open) return;
  const buf = new Uint8Array(6);
  const view = new DataView(buf.buffer);
  view.setUint32(0, frame);
  view.setUint16(4, mask);
  connection.send(buf);
  stats.sent++;
}

function handleInputPacket(buf) {
  const view = new DataView(buf);
  if (view.byteLength === 6) {
    remoteInputBuffer.set(view.getUint32(0), view.getUint16(4));
    stats.received++;
  }
}

// Global Interfaces
window.getNetplayInput = (port) => remoteInputs[port] || 0;
window.triggerInputSync = () => { }; // Replaced by high-frequency heartbeat loop

// --- Host Logic ---
async function startNetplayHost() {
  if (typeof Peer === 'undefined') return;
  const shortId = Math.random().toString(36).substring(2, 6).toUpperCase();
  peer = new Peer(shortId);
  isHost = true;

  peer.on('open', id => {
    idString = id;
    debug(`ROOM CREATED: ${id}`, "#00ffff");
    if (window.title1) title1.textContent = `[${id}]_${gameName}`;
  });

  peer.on('connection', conn => {
    if (connection) connection.close();
    connection = conn;
    debug("Incoming Connection request...", "#ffa500");

    connection.on('open', () => {
      window.isNetplaying = true;
      message("Success: Peer Connected!");
      window.currentFrame = 0;
      localInputBuffer.clear(); remoteInputBuffer.clear();
      if (window.currentRomFile) connection.send({type: 'rom-info', romName: window.currentRomFile.name});

      connection.on('data', async data => {
        if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
          handleInputPacket(data instanceof Uint8Array ? data.buffer : data);
        } else {
          if (data.type === 'ping') connection.send({type: 'pong', t: data.t});
          else if (data.type === 'pong') stats.ping = Math.round(performance.now() - data.t);
          else if (data.type === 'request-rom') streamRom();
          else if (data.type === 'client-ready') {
            debug("Syncing state...", "#ffaaff");
            connection.send({type: 'sync-state', state: getCoreState()});
            setTimeout(startNetplayLoop, 500);
          }
        }
      });
    });

    connection.on('close', () => {
      window.isNetplaying = false;
      message("Peer Disconnected");
    });
  });
}

// --- Client Logic ---
async function startNetplayClient() {
  const hostId = prompt("Enter Host ID:");
  if (!hostId) return;
  peer = new Peer();
  isHost = false;

  peer.on('open', () => {
    connection = peer.connect(hostId, {reliable: true});

    connection.on('open', () => {
      window.isNetplaying = true;
      message("Success: Linked to Host!");
      window.currentFrame = 0;
      localInputBuffer.clear(); remoteInputBuffer.clear();

      let romChunks = [], recd = 0, total = 0;
      connection.on('data', async data => {
        const isBinary = (data instanceof Uint8Array || data instanceof ArrayBuffer);
        if (isBinary) {
          const raw = data instanceof Uint8Array ? data.buffer : data;
          if (raw.byteLength === 6) {
            handleInputPacket(raw);
          } else {
            romChunks.push(raw); recd++;
            if (recd === total) {
              debug("ROM Transfer complete. Initializing Core...");
              const b = await new Blob(romChunks).arrayBuffer();
              const f = new File([b], window.pendingRomName || "game.bin");
              await emuxDB(b, f.name); await window.initCore(f);
              connection.send({type: 'client-ready'});
              romChunks = [];
            }
          }
        } else {
          if (data.type === 'ping') connection.send({type: 'pong', t: data.t});
          else if (data.type === 'pong') stats.ping = Math.round(performance.now() - data.t);
          else if (data.type === 'rom-info') {
            if (await emuxDB(data.romName)) {
              await window.loadGame(data.romName);
              connection.send({type: 'client-ready'});
            } else connection.send({type: 'request-rom'});
          } else if (data.type === 'rom-start') {
            total = data.totalChunks; romChunks = []; recd = 0;
          } else if (data.type === 'sync-state') {
            debug("Receiving game state...", "#ffaa00");
            setCoreState(data.state);
            setTimeout(startNetplayLoop, 200);
          }
        }
      });
    });

    connection.on('close', () => {
      window.isNetplaying = false;
      message("Disconnected from Host");
    });
  });
}

// --- Serialization & Streaming ---
function streamRom() {
  emuxDB(window.currentRomFile.name).then(romData => {
    const chunkSize = 65536, total = Math.ceil(romData.byteLength / chunkSize);
    debug(`Streaming ROM in ${total} chunks...`);
    connection.send({type: "rom-start", romName: window.currentRomFile.name, totalChunks: total});
    let cur = 0;
    const send = () => {
      if (cur >= total) return;
      connection.send(romData.slice(cur * chunkSize, Math.min((cur + 1) * chunkSize, romData.byteLength)));
      cur++; setTimeout(send, 5);
    };
    send();
  });
}

function getCoreState() {
  const core = window.Module;
  if (!core?._retro_serialize) return null;
  const size = core._retro_serialize_size(), ptr = core._malloc(size);
  core._retro_serialize(ptr, size);
  const s = new Uint8Array(core.HEAPU8.buffer, ptr, size).slice();
  core._free(ptr); return s;
}

function setCoreState(state) {
  const core = window.Module;
  if (!state || !core?._retro_unserialize) return;
  try {
    const data = new Uint8Array(state.buffer || state), ptr = core._malloc(data.length);
    core.HEAPU8.set(data, ptr);
    core._retro_unserialize(ptr, data.length);
    core._free(ptr);
    debug("Game State Synced.", "#00ff00");
  } catch (e) {console.error("Sync Failure:", e);}
}

// --- Event Listeners ---
document.addEventListener('click', e => {if (e.target.id === 'joinHost') startNetplayClient();});
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('menu');
  if (btn) btn.onpointerdown = () => {
    if (connection?.open) {
      if (isHost) connection.send({type: 'sync-state', state: getCoreState()});
      else connection.send({type: 'request-sync'});
    }
  };
});