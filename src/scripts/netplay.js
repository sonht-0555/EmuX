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
  lastPingTime: 0,
  jitter: 0,
  lastRecvTime: 0,
  pps_sent: 0,
  pps_recv: 0,
  lastPPSReset: performance.now(),
  remoteFrameHead: 0
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
    // Log every 30 stalls to avoid flooding, but show precise frame info
    if (stats.stalls % 30 === 0) {
      console.warn(`[Netplay] 🛑 STALL @ Frame ${fId} | Waiting for Remote | Buffer: ${remoteInputBuffer.size} | Ping: ${stats.ping}ms`);
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
/**
 * Main fixed-timestep loop with Drift Correction for Netplay.
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

  // Drift Correction: Dynamically adjust simulation speed
  // Target buffer size is INPUT_DELAY. If we have more, we can run faster.
  const drift = remoteInputBuffer.size - INPUT_DELAY;
  let timeScale = 1.0;

  if (drift > 2) timeScale = 1.05; // Run 5% faster to catch up
  else if (drift < -1) timeScale = 0.95; // Slow down 5% to wait for packets

  accumulator += (delta * timeScale);
  if (accumulator > 100) accumulator = 100;

  while (accumulator >= FRAME_TIME) {
    accumulator -= FRAME_TIME;

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

  // Performance Monitor (v5.02 High-Fidelity Dashboard)
  const monitor = setInterval(() => {
    if (connection?.open) {
      stats.lastPingTime = performance.now();
      connection.send({type: 'ping', t: stats.lastPingTime});

      const now = performance.now();
      const dt = (now - stats.lastPPSReset) / 1000;
      const sent_rate = Math.round(stats.pps_sent / dt);
      const recv_rate = Math.round(stats.pps_recv / dt);
      stats.pps_sent = 0; stats.pps_recv = 0; stats.lastPPSReset = now;

      const bufferStatus = remoteInputBuffer.size > INPUT_DELAY ? "HEALTHY" : "CRITICAL";
      const bufferColor = bufferStatus === "HEALTHY" ? "#00ff00" : "#ff4444";
      const frameLead = stats.remoteFrameHead - window.currentFrame;

      console.log(
        `%c[Telemetry] Ping: ${stats.ping}ms | Jitter: ${stats.jitter.toFixed(2)}ms | Buffer: ${remoteInputBuffer.size} [${bufferStatus}] | Drift: ${frameLead}f\n` +
        `%c[Traffic] PPS Sent: ${sent_rate} | PPS Recv: ${recv_rate} | Stalls: ${stats.stalls} | LocalFrame: ${window.currentFrame}`,
        `color: ${bufferColor}; font-weight: bold`,
        `color: #aaaaaa; font-size: 10px;`
      );
    } else {
      clearInterval(monitor);
    }
  }, 1000);
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
  stats.pps_sent++;
}

function handleInputPacket(buf) {
  const now = performance.now();
  if (stats.lastRecvTime > 0) {
    const currentJitter = Math.abs((now - stats.lastRecvTime) - FRAME_TIME);
    stats.jitter = stats.jitter * 0.9 + currentJitter * 0.1; // Smooth jitter
  }
  stats.lastRecvTime = now;

  const view = new DataView(buf);
  if (view.byteLength === 6) {
    const remoteFrame = view.getUint32(0);
    remoteInputBuffer.set(remoteFrame, view.getUint16(4));
    stats.remoteFrameHead = Math.max(stats.remoteFrameHead, remoteFrame);
    stats.received++;
    stats.pps_recv++;
  }
}

// Global Interfaces
window.getNetplayInput = (port) => remoteInputs[port] || 0;
window.triggerInputSync = () => { }; // Replaced by high-frequency heartbeat loop

// --- Network Configuration (THE GOLD STACK) ---
const iceConfig = {
  'iceServers': [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'turn:openrelayproject.org:3478', username: 'openrelayproject', credential: 'openrelayproject'},
    {urls: 'turn:turn.anyfirewall.com:443?transport=tcp', username: 'webrtc', credential: 'webrtc'}
  ]
};

// --- Host Logic ---
async function startNetplayHost() {
  if (typeof Peer === 'undefined') return;
  const shortId = Math.random().toString(36).substring(2, 6).toUpperCase();
  peer = new Peer(shortId, {config: iceConfig, debug: 1});
  isHost = true;

  peer.on('open', id => {
    idString = id;
    debug(`ROOM CREATED: ${id}`, "#00ffff");
    if (window.title1) title1.textContent = `[${id}]_${window.gameName || 'Room'}`;
  });

  peer.on('connection', setupConnection);
  peer.on('error', err => debug(`Peer Error: ${err.type}`, "#ff4444"));
}

// --- Client Logic ---
async function startNetplayClient() {
  const hostId = prompt("Enter 4-Character Host ID:");
  if (!hostId) return;
  peer = new Peer({config: iceConfig, debug: 1});
  isHost = false;

  peer.on('open', () => {
    const conn = peer.connect(hostId.toUpperCase(), {reliable: true});
    setupConnection(conn);
  });

  peer.on('error', err => debug(`Peer Error: ${err.type}`, "#ff4444"));
}

function setupConnection(conn) {
  if (connection) connection.close();
  connection = conn;
  debug(`>>> Connecting with: ${conn.peer}...`, "#ffa500");

  const checkPC = setInterval(() => {
    if (conn.peerConnection) {
      clearInterval(checkPC);
      const pc = conn.peerConnection;
      pc.oniceconnectionstatechange = () => {
        debug(`ICE: ${pc.iceConnectionState}`, "#ffff00");
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) debug(`📍 Found Candidate: ${e.candidate.type}`, "#888");
      };
    }
  }, 100);

  conn.on('open', () => {
    window.isNetplaying = true;
    message(isHost ? "Friend Joined!" : "Linked to Host!");
    window.currentFrame = 0;
    localInputBuffer.clear(); remoteInputBuffer.clear();

    if (isHost && window.currentRomFile) {
      connection.send({type: 'rom-info', romName: window.currentRomFile.name});
    }
  });

  conn.on('data', handleData);
  conn.on('close', () => {
    window.isNetplaying = false;
    message("Disconnected");
  });
  conn.on('error', err => debug(`Connection Error: ${err}`, "#ff4444"));
}

async function handleData(data) {
  const isBinary = (data instanceof Uint8Array || data instanceof ArrayBuffer);
  if (isBinary) {
    handleInputPacket(data instanceof Uint8Array ? data.buffer : data);
  } else {
    // Handling non-input packets
    if (data.type === 'ping') connection.send({type: 'pong', t: data.t});
    else if (data.type === 'pong') stats.ping = Math.round(performance.now() - data.t);
    else if (data.type === 'request-rom') streamRom();
    else if (data.type === 'client-ready') {
      debug("Syncing...", "#ffaaff");
      connection.send({type: 'sync-state', state: getCoreState()});
      setTimeout(startNetplayLoop, 500);
    } else if (data.type === 'rom-info') {
      if (await emuxDB(data.romName)) {
        await window.loadGame(data.romName);
        connection.send({type: 'client-ready'});
      } else connection.send({type: 'request-rom'});
    } else if (data.type === 'rom-start') {
      window._totalChunks = data.totalChunks; window._romChunks = []; window._recd = 0;
      window.pendingRomName = data.romName;
    } else if (data.type === 'sync-state') {
      setCoreState(data.state);
      setTimeout(startNetplayLoop, 200);
    } else if (data.type === 'request-sync') {
      if (isHost) connection.send({type: 'sync-state', state: getCoreState()});
    }
  }
}

// Update binary rom reception
function handleInputPacket(buf) {
  const now = performance.now();
  if (stats.lastRecvTime > 0) {
    const currentJitter = Math.abs((now - stats.lastRecvTime) - FRAME_TIME);
    stats.jitter = stats.jitter * 0.9 + currentJitter * 0.1;
  }
  stats.lastRecvTime = now;

  const view = new DataView(buf);
  if (view.byteLength === 6) {
    const remoteFrame = view.getUint32(0);
    remoteInputBuffer.set(remoteFrame, view.getUint16(4));
    stats.remoteFrameHead = Math.max(stats.remoteFrameHead, remoteFrame);
    stats.received++;
    stats.pps_recv++;
  } else {
    // It's a ROM chunk
    if (!window._romChunks) window._romChunks = [];
    window._romChunks.push(buf);
    window._recd = (window._recd || 0) + 1;
    if (window._recd === window._totalChunks) {
      processRomChunks();
    }
  }
}

async function processRomChunks() {
  debug("ROM Received. Booting...");
  const b = await new Blob(window._romChunks).arrayBuffer();
  const f = new File([b], window.pendingRomName || "game.bin");
  await emuxDB(b, f.name); await window.initCore(f);
  connection.send({type: 'client-ready'});
  window._romChunks = [];
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