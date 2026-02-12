// ===== Netplay System =====
let idString = "?";
var peer = null;
var connection = null;
var isHost = false;
var remoteInputs = {0: 0, 1: 0};
var netplayInterval = null;
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
  return state;
}
// ===== setCoreState =====
function setCoreState(state) {
  if (!state || state.length === 0 || !window.Module || !window.Module._malloc) return;
  const buffer = window.Module._malloc(state.length);
  window.Module.HEAPU8.set(state, buffer);
  window.Module._retro_unserialize(buffer, state.length);
  window.Module._free(buffer);
  for (let i = 0; i < 3; i++) window.Module._retro_run();
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
    title1.textContent = `[${idString}]_${gameName}`;
  });
  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      startNetplayHost();
    }
  });
  peer.on("connection", (conn) => {
    if (connection) connection.close();
    if (netplayInterval) clearInterval(netplayInterval);
    connection = conn;
    message("Friend Connected!");
    connection.on("open", () => {
      if (window.currentRomFile) {
        connection.send({type: "rom-info", romName: window.currentRomFile.name});
      }
      connection.on("data", async (data) => {
        if (data.type === "input") {
          remoteInputs[1] = data.mask;
        } else if (data.type === "request-sync") {
          connection.send({type: "sync-state", state: getCoreState()});
        } else if (data.type === "client-ready") {
          connection.send({type: "sync-state", state: getCoreState()});
        } else if (data.type === "request-rom") {
          const romData = await emuxDB(window.currentRomFile.name);
          const chunkSize = 65536;
          const totalChunks = Math.ceil(romData.byteLength / chunkSize);
          const dc = connection.dataChannel;
          connection.send({type: "rom-start", romName: window.currentRomFile.name, totalChunks});
          let currentChunk = 0;
          const stream = () => {
            if (currentChunk >= totalChunks) {
              return;
            }
            if (dc && dc.bufferedAmount > 512 * 1024) {
              setTimeout(stream, 20);
              return;
            }
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
          const hostInput = window.getGamepadMask();
          connection.send({
            type: "host-update",
            hMask: hostInput,
            cMask: remoteInputs[1] || 0,
          });
        } else {
          clearInterval(netplayInterval);
        }
      }, 16);
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
    connection = peer.connect(hostId, {reliable: true});
    connection.on("open", () => {
      if (netplayInterval) clearInterval(netplayInterval);
      let romChunks = [];
      let receivedChunks = 0;
      let targetChunks = 0;
      connection.on("data", async (data) => {
        if (data instanceof ArrayBuffer || (data.buffer && data.buffer instanceof ArrayBuffer)) {
          const buffer = data instanceof ArrayBuffer ? data : data.buffer;
          romChunks.push(buffer);
          receivedChunks++;

          if (receivedChunks % 5 === 0 || receivedChunks === targetChunks) {
            const progress = Math.round((receivedChunks / targetChunks) * 100);
            const elapsed = ((Date.now() - (window.downloadStartTime || Date.now())) / 1000).toFixed(1);
            console.log(`[Netplay] Download: ${progress}% (${receivedChunks}/${targetChunks}) | ${elapsed}s`);
            showNotification(" pa", "use.", "", ` download from host.|${progress}|`);
          }
          if (receivedChunks === targetChunks) {
            const finalTime = ((Date.now() - (window.downloadStartTime || Date.now())) / 1000).toFixed(2);
            console.log(`[Netplay] Download Complete in ${finalTime}s!`);
            const finalBlob = new Blob(romChunks);
            const arrayBuffer = await finalBlob.arrayBuffer();
            const romFile = new File([arrayBuffer], window.pendingRomName || "game.bin");

            console.log("[Netplay]", "Success! Starting game...");
            await emuxDB(arrayBuffer, romFile.name);
            await window.initCore(romFile);
            console.log("[Netplay] Game settled, requesting sync...");
            connection.send({type: "client-ready"});
            romChunks = []; receivedChunks = 0;
          }
          return;
        }

        if (data.type === "host-update") {
          remoteInputs[0] = data.hMask;
        } else if (data.type === "rom-info") {
          console.log("[Netplay] Host plays:", data.romName);
          const hasRom = await emuxDB(data.romName);
          if (hasRom) {
            showNotification(" pa", "use.", "", " Game found! Loading...");
            await window.loadGame(data.romName);
            console.log("[Netplay] Game loaded, requesting sync...");
            connection.send({type: "client-ready"});
          } else {
            connection.send({type: "request-rom"});
          }
        } else if (data.type === "rom-start") {
          window.pendingRomName = data.romName;
          targetChunks = data.totalChunks;
          romChunks = [];
          receivedChunks = 0;
          window.downloadStartTime = Date.now();
          console.log(`[Netplay] Starting download: ${data.romName} (${targetChunks} chunks)`);
        } else if (data.type === "sync-state") {
          console.log("[Netplay] Syncing state from host");
          setCoreState(data.state);
          if (window.startLoop) window.startLoop();
        }
      });
      netplayInterval = setInterval(() => {
        if (connection && connection.open) {
          connection.send({type: "input", mask: window.getGamepadMask()});
        } else {
          clearInterval(netplayInterval);
          console.log("[Netplay Status] DISCONNECTED");
        }
      }, 16);
    });
  });
}
// ===== window.getNetplayInput =====
window.getNetplayInput = (port) => {
  if (!window.isNetplaying) return null;
  if (isHost) {
    return port === 0 ? window.getGamepadMask() : remoteInputs[1] || 0;
  } else {
    return port === 0 ? remoteInputs[0] || 0 : window.getGamepadMask();
  }
};
// ===== Event Binding =====
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "joinHost") {
    startNetplayClient();
  }
  if (e.target && e.target.id === "canvas") {
    if (isHost && connection) connection.send({type: "sync-state", state: getCoreState()});
    else if (connection) connection.send({type: "request-sync"});
    message("Syncing state...");
  }
});