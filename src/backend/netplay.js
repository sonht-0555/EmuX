// ===== Netplay System =====
var peer = null;
var connection = null;
var isHost = false;
var remoteInputs = {};
// ===== initNetplay =====
function initNetplay() {
    if (typeof Peer === 'undefined') return alert("PeerJS not loaded!"), false;
    if (!window.Module) return alert("Please load a game first!"), false;
    window.isNetplaying = true;
    window.isRunning = true;
    return true;
}
// ===== getCoreState =====
function getCoreState() {
    const size = window.Module._retro_serialize_size();
    const buffer = window.Module._malloc(size);
    window.Module._retro_serialize(buffer, size);
    const state = new Uint8Array(window.Module.HEAPU8.buffer, buffer, size).slice();
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
    for (let i = 0; i < 3; i++) window.Module._retro_run();
}
// ===== startNetplayHost =====
async function startNetplayHost() {
    if (!initNetplay()) return;
    peer = new Peer();
    isHost = true;
    updateNetplayStatus("Creating Host...");
    peer.on('open', (id) => {
        const idStr = id.toString();
        console.log('[Host] ID:', idStr);
        prompt("NETPLAY HOST ACTIVE\nGive this ID to Client:", idStr);
        updateNetplayStatus(`Hosting: ${idStr}`);
    });
    peer.on('connection', (conn) => {
        connection = conn;
        showToast('Friend Connected!');
        updateNetplayStatus("CONNECTED (HOST)");
        setTimeout(() => {
            connection.send({type: 'sync-state', state: getCoreState()});
        }, 1500);
        connection.on('data', (data) => {
            if (data.type === 'input') remoteInputs[1] = data.mask;
            else if (data.type === 'request-sync') connection.send({type: 'sync-state', state: getCoreState()});
        });
        const loop = setInterval(() => {
            if (connection && connection.open) {
                connection.send({type: 'host-update', hMask: gamepadMask, cMask: remoteInputs[1] || 0});
            } else clearInterval(loop);
        }, 16);
    });
}
// ===== startNetplayClient =====
async function startNetplayClient() {
    if (!initNetplay()) return;
    const hostId = prompt('Enter Host ID:');
    if (!hostId) return;
    peer = new Peer();
    isHost = false;
    updateNetplayStatus("Connecting...");
    peer.on('open', () => {
        connection = peer.connect(hostId, {reliable: true});
        connection.on('open', () => {
            showToast('Connected to Host!');
            updateNetplayStatus("CONNECTED (CLIENT)");
            connection.on('data', (data) => {
                if (data.type === 'host-update') {
                    remoteInputs[0] = data.hMask;
                } else if (data.type === 'sync-state') {
                    setCoreState(data.state);
                    if (window.startLoop) window.startLoop();
                }
            });
            const loop = setInterval(() => {
                if (connection && connection.open) {
                    connection.send({type: 'input', mask: gamepadMask});
                } else clearInterval(loop);
            }, 16);
        });
    });
}
// ===== toggleNetplayMenu =====
window.toggleNetplayMenu = () => {
    const m = document.getElementById('np-menu');
    m.style.display = m.style.display === 'block' ? 'none' : 'block';
};
// ===== updateNetplayStatus =====
function updateNetplayStatus(text) {
    const dot = document.getElementById('np-dot');
    const status = document.getElementById('np-status');
    if (status) status.innerText = text;
    if (dot) dot.style.background = text.includes("CONN") ? "#00ff88" : "#ffcc00";
}
// ===== showToast =====
function showToast(msg) {
    const t = document.getElementById('np-toast');
    if (!t) return;
    t.innerText = msg;
    t.style.opacity = 1;
    setTimeout(() => t.style.opacity = 0, 3000);
}
// ===== getNetplayInput =====
function getNetplayInput(port) {
    if (!window.isNetplaying) return null;
    return isHost ? (port === 0 ? gamepadMask : (remoteInputs[1] || 0)) : (port === 0 ? (remoteInputs[0] || 0) : gamepadMask);
}
// ===== netplaySync =====
window.netplaySync = () => {
    if (isHost && connection) connection.send({type: 'sync-state', state: getCoreState()});
    else if (connection) connection.send({type: 'request-sync'});
    showToast('Syncing state...');
};
// ===== injectNetplayUI =====
function injectNetplayUI() {
    if (document.getElementById('netplay-ui')) return;
    const style = document.createElement('style');
    style.innerHTML = `
        #netplay-ui { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: 'Inter', sans-serif; }
        .np-btn { background: rgba(30, 30, 30, 0.8); backdrop-filter: blur(10px); color: white; border: 1px solid rgba(255, 255, 255, 0.1); padding: 10px 18px; border-radius: 50px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: all 0.2s; }
        .np-btn:hover { background: rgba(50, 50, 50, 0.9); transform: translateY(-2px); }
        .np-menu { display: none; position: absolute; bottom: 50px; right: 0; background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 8px; width: 180px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
        .np-menu button { width: 100%; background: transparent; color: #ccc; border: none; padding: 10px; text-align: left; border-radius: 6px; cursor: pointer; transition: 0.2s; }
        .np-menu button:hover { background: #333; color: white; }
        .np-status { font-size: 10px; color: #666; margin-top: 5px; text-align: right; }
        .np-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #0084ff; color: white; padding: 10px 20px; border-radius: 8px; font-size: 14px; opacity: 0; transition: 0.3s; pointer-events: none; }
    `;
    document.head.appendChild(style);
    const container = document.createElement('div');
    container.id = 'netplay-ui';
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
