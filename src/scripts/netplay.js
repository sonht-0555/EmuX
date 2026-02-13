/**
 * EmuX Netplay - Networking & Connectivity
 */

// Global State
let idString = "?";
var peer = null;
var connection = null;
var isHost = false;
window.currentFrame = 0;
window.isNetplaying = false;

// Shared Buffers
const localInputBuffer = new Map();
const remoteInputBuffer = new Map();
const remoteInputs = {0: 0, 1: 0};

// Statistics
let stats = {
  sent: 0, received: 0, stalls: 0, ping: 0,
  lastPingTime: 0, jitter: 0, lastRecvTime: 0,
  pps_sent: 0, pps_recv: 0, lastPPSReset: performance.now(),
  remoteFrameHead: 0
};

function debug(msg, color = "#00ff00") {
  console.log(`%c[Netplay] ${msg}`, `color: ${color}; font-weight: bold`);
}

// Networking Logic
function sendInput(frame, mask) {
  if (!connection?.open) return;
  const buf = new Uint8Array(6);
  const view = new DataView(buf.buffer);
  view.setUint32(0, frame);
  view.setUint16(4, mask);
  connection.send(buf);
  stats.sent++; stats.pps_sent++;
}

function handleInputPacket(buf) {
  const now = performance.now();
  stats.lastRecvTime = now;
  const view = new DataView(buf);
  if (view.byteLength === 6) {
    const remoteFrame = view.getUint32(0);
    remoteInputBuffer.set(remoteFrame, view.getUint16(4));
    stats.remoteFrameHead = Math.max(stats.remoteFrameHead, remoteFrame);
    stats.received++; stats.pps_recv++;
  } else {
    if (!window._romChunks) window._romChunks = [];
    window._romChunks.push(buf);
    window._recd = (window._recd || 0) + 1;
    if (window._recd === window._totalChunks) processRomChunks();
  }
}

async function handleData(data) {
  const isBinary = (data instanceof Uint8Array || data instanceof ArrayBuffer);
  if (isBinary) {
    handleInputPacket(data instanceof Uint8Array ? data.buffer : data);
  } else {
    if (data.type === 'ping') connection.send({type: 'pong', t: data.t});
    else if (data.type === 'pong') stats.ping = Math.round(performance.now() - data.t);
    else if (data.type === 'cal-ping') connection.send({type: 'cal-pong', t: data.t});
    else if (data.type === 'cal-pong' && window._calHandler) window._calHandler(data);
    else if (data.type === 'delay-sync') {
      window.INPUT_DELAY = Math.max(window.INPUT_DELAY, data.delay);
      debug(`📡 Peer delay sync: ${window.INPUT_DELAY}`);
    }
    else if (data.type === 'request-rom') streamRom();
    else if (data.type === 'client-ready') {
      connection.send({type: 'sync-state', state: getCoreState()});
      setTimeout(startNetplayLoop, 500);
    }
    else if (data.type === 'rom-info') {
      if (await emuxDB(data.romName)) {
        await window.loadGame(data.romName);
        connection.send({type: 'client-ready'});
      } else connection.send({type: 'request-rom'});
    }
    else if (data.type === 'rom-start') {
      window._totalChunks = data.totalChunks; window._romChunks = [];
      window._recd = 0; window.pendingRomName = data.romName;
    }
    else if (data.type === 'sync-state') {
      setCoreState(data.state);
      setTimeout(startNetplayLoop, 200);
    }
    else if (data.type === 'request-sync') {
      if (isHost) connection.send({type: 'sync-state', state: getCoreState()});
    }
  }
}

function calibrateDelay() {
  return new Promise((resolve) => {
    const pings = [];
    let count = 0;
    const maxSamples = 5;
    window._calHandler = (data) => {
      if (data.type === 'cal-pong') {
        pings.push(performance.now() - data.t);
        if (++count >= maxSamples) {
          const avgPing = pings.reduce((a, b) => a + b) / pings.length;
          const newDelay = Math.max(3, Math.min(8, Math.round(avgPing / 18) + 1));
          resolve(newDelay);
        }
      }
    };
    for (let i = 0; i < maxSamples; i++) {
      setTimeout(() => {if (connection?.open) connection.send({type: 'cal-ping', t: performance.now()});}, i * 150);
    }
    setTimeout(() => {if (count < maxSamples) resolve(4);}, 2500);
  });
}

// PeerJS Configuration
const iceConfig = {
  'iceServers': [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'turn:openrelayproject.org:3478', username: 'openrelayproject', credential: 'openrelayproject'},
    {urls: 'turn:turn.anyfirewall.com:443?transport=tcp', username: 'webrtc', credential: 'webrtc'}
  ]
};

async function startNetplayHost() {
  if (typeof Peer === 'undefined') return;
  const shortId = Math.random().toString(36).substring(2, 6).toUpperCase();
  peer = new Peer(shortId, {config: iceConfig, debug: 1});
  isHost = true;
  peer.on('open', id => {
    idString = id;
    if (window.title1) title1.textContent = `[${id}]_${window.gameName || 'Room'}`;
  });
  peer.on('connection', setupConnection);
}

async function startNetplayClient() {
  const hostId = prompt("Enter 4-Character Host ID:");
  if (!hostId) return;
  peer = new Peer({config: iceConfig, debug: 1});
  isHost = false;
  peer.on('open', () => setupConnection(peer.connect(hostId.toUpperCase(), {reliable: true})));
}

function setupConnection(conn) {
  if (connection) connection.close();
  connection = conn;
  conn.on('open', () => {
    window.isNetplaying = true;
    window.currentFrame = 0;
    localInputBuffer.clear(); remoteInputBuffer.clear();
    if (isHost && window.currentRomFile) {
      connection.send({type: 'rom-info', romName: window.currentRomFile.name});
    }
  });
  conn.on('data', handleData);
  conn.on('close', () => {window.isNetplaying = false; message("Disconnected");});
}

// Helpers
async function processRomChunks() {
  const b = await new Blob(window._romChunks).arrayBuffer();
  const f = new File([b], window.pendingRomName || "game.bin");
  await emuxDB(b, f.name); await window.initCore(f);
  connection.send({type: 'client-ready'});
  window._romChunks = [];
}

function streamRom() {
  emuxDB(window.currentRomFile.name).then(romData => {
    const chunkSize = 65536, total = Math.ceil(romData.byteLength / chunkSize);
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
  const data = new Uint8Array(state.buffer || state), ptr = core._malloc(data.length);
  core.HEAPU8.set(data, ptr);
  core._retro_unserialize(ptr, data.length);
  core._free(ptr);
}

window.getNetplayInput = (port) => remoteInputs[port] || 0;
document.addEventListener('click', e => {if (e.target.id === 'joinHost') startNetplayClient();});