// ===== Netplay System =====
var peer = null;
var connection = null;
var isHost = false;
var remoteInputs = { 0: 0, 1: 0 };
var netplayInterval = null;
// ===== generateShortId =====
function generateShortId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}
// ===== initNetplay =====
function initNetplay() {
  if (typeof Peer === "undefined") return (alert("PeerJS not loaded!"), false);
  if (!window.Module) return (alert("Please load a game first!"), false);
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
  if (!state || state.length === 0) return;
  const buffer = window.Module._malloc(state.length);
  window.Module.HEAPU8.set(state, buffer);
  window.Module._retro_unserialize(buffer, state.length);
  window.Module._free(buffer);
  // Fast-forward to sync audio/video
  for (let i = 0; i < 3; i++) window.Module._retro_run();
}
// ===== startNetplayHost =====
async function startNetplayHost() {
  if (!initNetplay()) return;
  const shortId = generateShortId();
  peer = new Peer(shortId);
  isHost = true;
  updateNetplayStatus("Creating Host...");

  peer.on("open", (id) => {
    const idString = id.toString().toUpperCase();
    console.log("[Netplay] Room ID:", idString);
    prompt("NETPLAY HOST ACTIVE\nGive this Code to Friend:", idString);
    updateNetplayStatus(`Room: ${idString}`);
  });

  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      console.warn("[Netplay] ID taken, retrying...");
      startNetplayHost();
    }
  });

  peer.on("connection", (conn) => {
    if (connection) connection.close();
    if (netplayInterval) clearInterval(netplayInterval);

    connection = conn;
    showToast("Friend Connected!");
    updateNetplayStatus("CONNECTED (HOST)");

    connection.on("open", () => {
      setTimeout(() => {
        console.log("[Netplay] Sending initial state to client");
        connection.send({ type: "sync-state", state: getCoreState() });
      }, 1000);

      connection.on("data", (data) => {
        if (data.type === "input") {
          remoteInputs[1] = data.mask;
        } else if (data.type === "request-sync") {
          connection.send({ type: "sync-state", state: getCoreState() });
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
          updateNetplayStatus("DISCONNECTED");
        }
      }, 16);
    });
  });
}
// ===== startNetplayClient =====
async function startNetplayClient() {
  if (!initNetplay()) return;
  const hostId = prompt("Enter Host ID:");
  if (!hostId) return;

  peer = new Peer();
  isHost = false;
  updateNetplayStatus("Connecting...");

  peer.on("open", () => {
    connection = peer.connect(hostId, { reliable: true });

    connection.on("open", () => {
      if (netplayInterval) clearInterval(netplayInterval);
      showToast("Connected to Host!");
      updateNetplayStatus("CONNECTED (CLIENT)");

      connection.on("data", (data) => {
        if (data.type === "host-update") {
          remoteInputs[0] = data.hMask;
        } else if (data.type === "sync-state") {
          console.log("[Netplay] Received state from host");
          setCoreState(data.state);
          if (window.startLoop) window.startLoop();
        }
      });

      netplayInterval = setInterval(() => {
        if (connection && connection.open) {
          connection.send({ type: "input", mask: window.getGamepadMask() });
        } else {
          clearInterval(netplayInterval);
          updateNetplayStatus("DISCONNECTED");
        }
      }, 16);
    });
  });
}
// ===== window.getNetplayInput =====
window.getNetplayInput = (port) => {
  if (!window.isNetplaying) return null;
  // Host: Port 0 = Local, Port 1 = Client
  // Client: Port 0 = Host, Port 1 = Local
  if (isHost) {
    return port === 0 ? window.getGamepadMask() : remoteInputs[1] || 0;
  } else {
    return port === 0 ? remoteInputs[0] || 0 : window.getGamepadMask();
  }
};
// ===== UI Support =====
window.toggleNetplayMenu = () => {
  const menu = document.getElementById("np-menu");
  menu.style.display = menu.style.display === "block" ? "none" : "block";
};
function updateNetplayStatus(text) {
  const dot = document.getElementById("np-dot");
  const status = document.getElementById("np-status");
  if (status) status.innerText = text;
  if (dot) dot.style.background = text.includes("CONN") ? "#00ff88" : "#ff4d4d";
}
function showToast(msg) {
  const toast = document.getElementById("np-toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 3000);
}
window.netplaySync = () => {
  if (isHost && connection)
    connection.send({ type: "sync-state", state: getCoreState() });
  else if (connection) connection.send({ type: "request-sync" });
  showToast("Syncing state...");
};
// ===== injectNetplayUI =====
function injectNetplayUI() {
  if (document.getElementById("netplay-ui")) return;
  const style = document.createElement("style");
  style.innerHTML = `
        #netplay-ui { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: 'Inter', sans-serif; }
        .np-btn { background: rgba(30,30,30,0.8); backdrop-filter: blur(10px); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 10px 18px; border-radius: 50px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: all 0.2s; }
        .np-btn:hover { background: rgba(50,50,50,0.9); transform: translateY(-2px); }
        .np-menu { display: none; position: absolute; bottom: 50px; right: 0; background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 8px; width: 180px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
        .np-menu button { width: 100%; background: transparent; color: #ccc; border: none; padding: 10px; text-align: left; border-radius: 6px; cursor: pointer; transition: 0.2s; }
        .np-menu button:hover { background: #333; color: white; }
        .np-status { font-size: 10px; color: #666; margin-top: 5px; text-align: right; }
        .np-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #0084ff; color: white; padding: 10px 20px; border-radius: 8px; font-size: 14px; opacity: 0; transition: 0.3s; pointer-events: none; }
    `;
  document.head.appendChild(style);
  const container = document.createElement("div");
  container.id = "netplay-ui";
  container.innerHTML = `
        <div id="np-toast" class="np-toast">Message</div>
        <div id="np-menu" class="np-menu">
            <button onclick="startNetplayHost()">Create Room (Host)</button>
            <button onclick="startNetplayClient()">Join Room (Client)</button>
            <button onclick="window.netplaySync()" style="color: #0084ff">Force Sync</button>
            <button onclick="location.reload()" style="color: #ff4d4d">Disconnect</button>
        </div>
        <button class="np-btn" onclick="toggleNetplayMenu()">
            <span id="np-dot" style="width: 8px; height: 8px; background: #ff4d4d; border-radius: 50%"></span>
            NETPLAY
        </button>
        <div id="np-status" class="np-status">Off</div>
    `;
  document.body.appendChild(container);
}
injectNetplayUI();
