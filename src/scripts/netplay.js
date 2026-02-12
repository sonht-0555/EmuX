// ===== Netplay System =====
let idString = "?";
var peer = null;
var connection = null;
var isHost = false;
var remoteInputs = {0: 0, 1: 0};
var netplayInterval = null;
var stats = {receivedPackets: 0};
var statsInterval = null;

// ===== generateShortId =====
function generateShortId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ===== initNetplay =====
function initNetplay(isClient = false) {
  if (typeof Peer === "undefined") return console.warn("[Netplay] PeerJS missing"), false;
  if (!isClient && !window.Module) return false;
  window.isNetplaying = true;
  window.isRunning = true;
  return true;
}

// ===== getCoreState =====
function getCoreState() {
  const size = window.Module._retro_serialize_size();
  const buffer = window.Module._malloc(size);
  window.Module._retro_serialize(buffer, size);
  const state = new Uint8Array(
    window.Module.HEAPU8.buffer,
    buffer,
    size,
  ).slice();
  window.Module._free(buffer);
  console.log("[Netplay] Capturing state:", size, "bytes");
  return state;
}

// ===== setCoreState =====
function setCoreState(state) {
  if (!state || !window.Module || !window.Module._malloc) return;

  let data;
  if (state instanceof Uint8Array) data = state;
  else if (state instanceof ArrayBuffer) data = new Uint8Array(state);
  else if (state.buffer && state.buffer instanceof ArrayBuffer) data = new Uint8Array(state.buffer, state.byteOffset, state.length || state.byteLength);
  else data = new Uint8Array(state);

  console.log("[Netplay] Applying state:", data.length, "bytes");
  const buffer = window.Module._malloc(data.length);
  window.Module.HEAPU8.set(data, buffer);
  const result = window.Module._retro_unserialize(buffer, data.length);
  window.Module._free(buffer);

  console.log("[Netplay] Sync result:", result ? "OK ✅" : "FAILED ❌");
  if (result && window.startLoop) window.startLoop();
}

// ===== Packet Types =====
const PKT_INPUT = 1;
const PKT_HOST_UPDATE = 2;

let lastSentMask = -1;

// ===== sendInputImmediate =====
function sendInputImmediate() {
  if (!connection || !connection.open) return;
  const mask = window.getGamepadMask();
  if (mask === lastSentMask) return;

  if (isHost) {
    const hMask = mask;
    const cMask = remoteInputs[1] || 0;
    const buf = new Uint8Array(5);
    buf[0] = PKT_HOST_UPDATE;
    buf[1] = (hMask >> 8) & 0xFF; buf[2] = hMask & 0xFF;
    buf[3] = (cMask >> 8) & 0xFF; buf[4] = cMask & 0xFF;
    connection.send(buf);
    stats.sentPackets++;
  } else {
    const buf = new Uint8Array(3);
    buf[0] = PKT_INPUT;
    buf[1] = (mask >> 8) & 0xFF; buf[2] = mask & 0xFF;
    connection.send(buf);
    stats.sentPackets++;
  }
  lastSentMask = mask;
}

// ===== startNetplayHost =====
async function startNetplayHost() {
  if (!initNetplay()) return;
  const shortId = generateShortId();
  peer = new Peer(shortId);
  isHost = true;

  peer.on("open", (id) => {
    idString = id.toString().toUpperCase();
    console.log("[Netplay] Room ID:", idString);
    if (window.title1) title1.textContent = `[${idString}]_${gameName}`;
  });

  peer.on("connection", (conn) => {
    if (connection) connection.close();
    if (netplayInterval) clearInterval(netplayInterval);
    connection = conn;
    message("Friend Connected!");

    connection.on("open", () => {
      lastSentMask = -1;
      stats.sentPackets = 0;
      stats.receivedPackets = 0;
      if (statsInterval) clearInterval(statsInterval);
      statsInterval = setInterval(() => {
        console.log(`[Netplay Stats] Sent: ${stats.sentPackets} | Received: ${stats.receivedPackets}`);
      }, 5000);

      if (window.currentRomFile) {
        connection.send({type: "rom-info", romName: window.currentRomFile.name});
      }

      connection.on("data", async (data) => {
        if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
          const view = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
          if (view[0] === PKT_INPUT) {
            remoteInputs[1] = (view[1] << 8) | view[2];
            stats.receivedPackets++;
          }
          return;
        }

        if (data.type === "request-sync") {
          connection.send({type: "sync-state", state: getCoreState()});
        } else if (data.type === "client-ready") {
          connection.send({type: "sync-state", state: getCoreState()});
        } else if (data.type === "request-rom") {
          const romData = await emuxDB(window.currentRomFile.name);
          const chunkSize = 65536;
          const totalChunks = Math.ceil(romData.byteLength / chunkSize);
          connection.send({type: "rom-start", romName: window.currentRomFile.name, totalChunks});

          let currentChunk = 0;
          const stream = () => {
            if (currentChunk >= totalChunks) return;
            const start = currentChunk * chunkSize;
            const end = Math.min(start + chunkSize, romData.byteLength);
            connection.send(romData.slice(start, end));
            currentChunk++;
            setTimeout(stream, 5);
          };
          stream();
        }
      });

      netplayInterval = setInterval(() => {
        if (connection && connection.open) {
          const hMask = window.getGamepadMask();
          const cMask = remoteInputs[1] || 0;
          const buf = new Uint8Array(5);
          buf[0] = PKT_HOST_UPDATE;
          buf[1] = (hMask >> 8) & 0xFF; buf[2] = hMask & 0xFF;
          buf[3] = (cMask >> 8) & 0xFF; buf[4] = cMask & 0xFF;
          connection.send(buf);
          stats.sentPackets++;
          lastSentMask = hMask;
        } else {
          clearInterval(netplayInterval);
        }
      }, 33);
    });
  });
}

// ===== startNetplayClient =====
async function startNetplayClient() {
  if (!initNetplay(true)) return;
  const hostId = prompt("Enter Host ID:");
  if (!hostId) return;

  peer = new Peer();
  isHost = false;

  peer.on("open", () => {
    // Quay lại reliable: true
    connection = peer.connect(hostId, {reliable: true});

    connection.on("open", () => {
      lastSentMask = -1;
      stats.sentPackets = 0;
      stats.receivedPackets = 0;
      if (statsInterval) clearInterval(statsInterval);
      statsInterval = setInterval(() => {
        console.log(`[Netplay Stats] Sent: ${stats.sentPackets} | Received: ${stats.receivedPackets}`);
      }, 5000);

      if (netplayInterval) clearInterval(netplayInterval);
      let romChunks = [];
      let receivedChunks = 0;
      let targetChunks = 0;

      connection.on("data", async (data) => {
        if (data instanceof Uint8Array || data instanceof ArrayBuffer || (data.buffer && data.buffer instanceof ArrayBuffer)) {
          const raw = data.buffer || data;
          const view = new Uint8Array(raw);

          if (view[0] === PKT_HOST_UPDATE && view.length === 5) {
            remoteInputs[0] = (view[1] << 8) | view[2];
            stats.receivedPackets++;
            return;
          }

          romChunks.push(raw);
          receivedChunks++;
          if (receivedChunks % 10 === 0 || receivedChunks === targetChunks) {
            const progress = Math.round((receivedChunks / targetChunks) * 100);
            showNotification(" pa", "use.", "", ` download: ${progress}%`);
          }
          if (receivedChunks === targetChunks) {
            const finalBlob = new Blob(romChunks);
            const arrayBuffer = await finalBlob.arrayBuffer();
            const romFile = new File([arrayBuffer], window.pendingRomName || "game.bin");
            await emuxDB(arrayBuffer, romFile.name);
            await window.initCore(romFile);
            connection.send({type: "client-ready"});
            romChunks = [];
          }
          return;
        }

        if (data.type === "rom-info") {
          const hasRom = await emuxDB(data.romName);
          if (hasRom) {
            await window.loadGame(data.romName);
            connection.send({type: "client-ready"});
          } else {
            connection.send({type: "request-rom"});
          }
        } else if (data.type === "rom-start") {
          window.pendingRomName = data.romName;
          targetChunks = data.totalChunks;
          romChunks = []; receivedChunks = 0;
        } else if (data.type === "sync-state") {
          setCoreState(data.state);
        }
      });

      netplayInterval = setInterval(() => {
        if (connection && connection.open) {
          const mask = window.getGamepadMask();
          const buf = new Uint8Array(3);
          buf[0] = PKT_INPUT;
          buf[1] = (mask >> 8) & 0xFF;
          buf[2] = mask & 0xFF;
          connection.send(buf);
          stats.sentPackets++;
          lastSentMask = mask;
        } else {
          clearInterval(netplayInterval);
        }
      }, 33);
    });
  });
}

// ===== window.triggerInputSync =====
window.triggerInputSync = () => {
  if (window.isNetplaying) sendInputImmediate();
};

// ===== window.getNetplayInput =====
window.getNetplayInput = (port) => {
  if (!window.isNetplaying) return null;
  return isHost ? (port === 0 ? window.getGamepadMask() : remoteInputs[1] || 0)
    : (port === 0 ? remoteInputs[0] || 0 : window.getGamepadMask());
};

// ===== Event Binding =====
document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menu");
  if (menuBtn) {
    menuBtn.onpointerdown = (e) => {
      if (connection && connection.open) {
        if (isHost) connection.send({type: "sync-state", state: getCoreState()});
        else connection.send({type: "request-sync"});
        message("Syncing state...");
      }
    };
  }
});

document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "joinHost") startNetplayClient();
});