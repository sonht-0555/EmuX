// ===== Cloud System (Master Gist) =====
const MASTER_TOKEN = "ZlhXdUQxQ0xSd0pNQjRLaHZjeW9lZ3JRaWlpV3BqNVloSEVOX3BoZw==";
const decodeToken = (token) => atob(token).split('').reverse().join('');
const convertToBase64 = (data) => new Promise((resolve) => {const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob([data]));});
const convertFromBase64 = (base64) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
const cloudHeaders = {'Authorization': `token ${decodeToken(MASTER_TOKEN)}`, 'Content-Type': 'application/json'};

// ===== cloudBackup =====
async function cloudBackup() {
    try {
        const backupName = prompt("Create backup code:");
        if (!backupName) return;
        showNotification(" pa", "use.", "", " uploading data...");
        const filename = `${backupName.toLowerCase()}.json`, allStores = await listStore(), backupData = {};
        for (const [storeName, keys] of Object.entries(allStores)) {
            backupData[storeName] = {};
            for (const key of keys) {
                const dataBuffer = await emuxDB(key);
                if (dataBuffer && dataBuffer.byteLength <= 20 * 1024 * 1024) backupData[storeName][key] = await convertToBase64(dataBuffer);
            }
        }
        const gists = await fetch('https://api.github.com/gists', {headers: cloudHeaders}).then(response => response.json());
        const existing = gists.find(gist => gist.files[filename]);
        const syncResponse = await fetch(existing ? `https://api.github.com/gists/${existing.id}` : 'https://api.github.com/gists', {
            method: existing ? 'PATCH' : 'POST', headers: cloudHeaders,
            body: JSON.stringify({description: `EmuX: ${backupName}`, public: false, files: {[filename]: {content: JSON.stringify(backupData)}}})
        });
        if (!syncResponse.ok) throw new Error("Sync failed.");
        page00.hidden = true;
    } catch (error) {page00.hidden = true; alert("Error: " + error.message);}
}

// ===== cloudRestore =====
async function cloudRestore() {
    try {
        const backupName = prompt("Enter backup code:");
        if (!backupName) return;
        showNotification(" pa", "use.", "", " downloading data...");
        const filename = `${backupName.toLowerCase()}.json`, gists = await fetch('https://api.github.com/gists', {headers: cloudHeaders}).then(response => response.json());
        const target = gists.find(gist => gist.files[filename]);
        if (!target) throw new Error("Backup not found.");
        const detail = await fetch(target.url, {headers: cloudHeaders}).then(response => response.json());
        let content = detail.files[filename].content;
        if (detail.files[filename].truncated) content = await fetch(detail.files[filename].raw_url).then(response => response.text());
        const parsedData = JSON.parse(content);
        for (const [storeName, files] of Object.entries(parsedData)) {
            for (const [key, base64Data] of Object.entries(files)) await emuxDB(convertFromBase64(base64Data), key);
        }
        page00.hidden = true;
    } catch (error) {page00.hidden = true; alert("Error: " + error.message);}
}