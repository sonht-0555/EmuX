// ===== Cloud System (Master Gist) =====
const MASTER_TOKEN = "ZlhXdUQxQ0xSd0pNQjRLaHZjeW9lZ3JRaWlpV3BqNVloSEVOX3BoZw==", decode = s => atob(s).split('').reverse().join('');
const toB64 = data => new Promise(res => {const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(new Blob([data]));});
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const headers = {'Authorization': `token ${decode(MASTER_TOKEN)}`, 'Content-Type': 'application/json'};
// ===== cloudBackup =====
async function cloudBackup() {
    try {
        const name = prompt("Create backup code:");
        if (!name) return;
        showNotification(" pa", "use.", "", " Uploading data...");
        const file = `${name.toLowerCase()}.json`, stores = await listStore(), data = {};
        for (const [s, keys] of Object.entries(stores)) {
            data[s] = {};
            for (const k of keys) {
                const b = await emuxDB(k);
                if (b && b.byteLength <= 20 * 1024 * 1024) data[s][k] = await toB64(b);
            }
        }
        const gists = await fetch('https://api.github.com/gists', {headers}).then(r => r.json());
        const exist = gists.find(g => g.files[file]);
        const res = await fetch(exist ? `https://api.github.com/gists/${exist.id}` : 'https://api.github.com/gists', {
            method: exist ? 'PATCH' : 'POST', headers,
            body: JSON.stringify({description: `EmuX: ${name}`, public: false, files: {[file]: {content: JSON.stringify(data)}}})
        });
        if (!res.ok) throw new Error("Sync failed.");
        page00.hidden = true;
    } catch (e) {page00.hidden = true; alert("Error: " + e.message);}
}
// ===== cloudRestore =====
async function cloudRestore() {
    try {
        const name = prompt("Enter backup code:");
        if (!name) return;
        showNotification(" pa", "use.", "", " Downloading data...");
        const file = `${name.toLowerCase()}.json`;
        const gists = await fetch('https://api.github.com/gists', {headers}).then(r => r.json());
        const target = gists.find(g => g.files[file]);
        if (!target) throw new Error("Not found.");
        const full = await fetch(target.url, {headers}).then(r => r.json());
        let content = full.files[file].content;
        if (full.files[file].truncated) content = await fetch(full.files[file].raw_url).then(r => r.text());
        const data = JSON.parse(content);
        for (const [s, files] of Object.entries(data)) {
            for (const [n, b] of Object.entries(files)) await emuxDB(fromB64(b), n);
        }
        page00.hidden = true;
    } catch (e) {page00.hidden = true; alert("Error: " + e.message);}
}