/**
 * EmuX Netplay - Networking & Connectivity (v6.17)
 */

let idString = "?";
var peer = null;
var connection = null;
var isHost = false;

window.currentFrame = 0;
window.isNetplaying = false;

const localInputBuffer = new Map();
const remoteInputBuffer = new Map();
const remoteInputs = {0: 0, 1: 0};

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

function debug(msg, color = "#00ff00") {
  console.log(`%c[Netplay] ${msg}`, `color: ${color}; font-weight: bold`);
}

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
  stats.lastRecvTime = performance.now();
  const view = new DataView(buf);

  if (view.byteLength === 6) {
    const remoteFrame = view.getUint32(0);
    remoteInputBuffer.set(remoteFrame, view.getUint16(4));
    stats.remoteFrameHead = Math.max(stats.remoteFrameHead, remoteFrame);
    stats.received++;
    stats.pps_recv++;
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
    return;
  }

  switch (data.type) {
    case 'ping':
      connection.send({type: 'pong', t: data.t});
      break;
    case 'pong':
      stats.ping = Math.round(performance.now() - data.t);
      break;
    case 'cal-ping':
      connection.send({type: 'cal-pong', t: data.t});
      break;
    case 'cal-pong':
      if (window._calHandler) window._calHandler(data);
      break;
    case 'delay-sync':
      window.INPUT_DELAY = Math.max(window.INPUT_DELAY, data.delay);
      break;
    case 'request-rom':
      streamRom();
      break;
    case 'client-ready':
      connection.send({type: 'sync-state', state: getCoreState(), frame: window.currentFrame});
      setTimeout(startNetplayLoop, 500);
      break;
    case 'rom-info':
      if (await emuxDB(data.romName)) {
        await window.loadGame(data.romName);
        connection.send({type: 'client-ready'});
      } else {
        connection.send({type: 'request-rom'});
      }
      break;
    case 'rom-start':
      window._totalChunks = data.totalChunks;
      window._romChunks = [];
      window._recd = 0;
      window.pendingRomName = data.romName;
      break;
    case 'sync-state':
      if (data.frame) window.currentFrame = data.frame;
      setCoreState(data.state);
      remoteInputBuffer.clear(); // Clear stale inputs to prevents glitches
      console.log(`%c[Netplay] ✅ State Synced! Frame: ${window.currentFrame} (Size: ${data.state.byteLength})`, "color: #00ff00; font-weight: bold");
      setTimeout(startNetplayLoop, 200);
      break;
    case 'request-sync':
      if (isHost) connection.send({type: 'sync-state', state: getCoreState(), frame: window.currentFrame});
      break;
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
      setTimeout(() => {
        if (connection?.open) connection.send({type: 'cal-ping', t: performance.now()});
      }, i * 150);
    }

    setTimeout(() => {if (count < maxSamples) resolve(4);}, 2500);
  });
}

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

  peer.on('open', () => {
    setupConnection(peer.connect(hostId.toUpperCase(), {reliable: true}));
  });
}

function setupConnection(conn) {
  if (connection) connection.close();
  connection = conn;

  conn.on('open', () => {
    window.isNetplaying = true;
    window.currentFrame = 0;
    localInputBuffer.clear();
    remoteInputBuffer.clear();

    if (isHost && window.currentRomFile) {
      connection.send({type: 'rom-info', romName: window.currentRomFile.name});
    }
  });

  conn.on('data', handleData);
  conn.on('close', () => {
    window.isNetplaying = false;
    if (window.message) message("Disconnected");
  });
}

async function processRomChunks() {
  const b = await new Blob(window._romChunks).arrayBuffer();
  const f = new File([b], window.pendingRomName || "game.bin");

  await emuxDB(b, f.name);
  await window.loadGame(f);

  connection.send({type: 'client-ready'});
  window._romChunks = [];
}

function streamRom() {
  emuxDB(window.currentRomFile.name).then(romData => {
    const chunkSize = 65536;
    const total = Math.ceil(romData.byteLength / chunkSize);

    connection.send({
      type: "rom-start",
      romName: window.currentRomFile.name,
      totalChunks: total
    });

    let cur = 0;
    const send = () => {
      if (cur >= total) return;
      const start = cur * chunkSize;
      const end = Math.min((cur + 1) * chunkSize, romData.byteLength);
      connection.send(romData.slice(start, end));
      cur++;
      setTimeout(send, 5);
    };
    send();
  });
}

function getCoreState() {
  const core = window.Module;
  if (!core?._retro_serialize) return null;

  const size = core._retro_serialize_size();
  const ptr = core._malloc(size);
  core._retro_serialize(ptr, size);
  const s = new Uint8Array(core.HEAPU8.buffer, ptr, size).slice();
  core._free(ptr);
  return s;
}

function setCoreState(state) {
  const core = window.Module;
  if (!state || !core?._retro_unserialize) return;

  const data = new Uint8Array(state.buffer || state);
  const ptr = core._malloc(data.length);
  core.HEAPU8.set(data, ptr);
  core._retro_unserialize(ptr, data.length);
  core._free(ptr);
}

window.getNetplayInput = (port) => remoteInputs[port] || 0;
window.getCoreState = getCoreState;

document.addEventListener('click', e => {
  if (e.target.id === 'joinHost') startNetplayClient();
});