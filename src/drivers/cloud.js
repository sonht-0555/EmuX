// ===== Cloud System (Master Gist) =====
async function cloudBackup() {
    try {
        const backupName = prompt("Create backup code:");
        if (!backupName) return;
        const authHeaders = {
            'Authorization': `token ${atob("ZlhXdUQxQ0xSd0pNQjRLaHZjeW9lZ3JRaWlpV3BqNVloSEVOX3BoZw==").split('').map((c, i, a) => a[a.length - 1 - i]).join('')}`,
            'Content-Type': 'application/json'
        };
        const convertToBase64 = (data) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(new Blob([data]));
        });
        showNotification(" pa", "use.", "", " uploading data...");
        const filename = `${backupName.toLowerCase()}.json`, allStores = await listStore(), backupData = {};
        for (const [storeName, keys] of Object.entries(allStores)) {
            backupData[storeName] = {};
            for (const key of keys) {
                const buffer = await emuxDB(key);
                if (buffer && buffer.byteLength <= 20 * 1024 * 1024) backupData[storeName][key] = await convertToBase64(buffer);
            }
        }
        const gists = await fetch('https://api.github.com/gists', {headers: authHeaders}).then(r => r.json());
        const existing = gists.find(gist => gist.files[filename]);
        const response = await fetch(existing ? `https://api.github.com/gists/${existing.id}` : 'https://api.github.com/gists', {
            method: existing ? 'PATCH' : 'POST', headers: authHeaders,
            body: JSON.stringify({description: `EmuX: ${backupName}`, public: false, files: {[filename]: {content: JSON.stringify(backupData)}}})
        });
        if (!response.ok) throw new Error("Sync failed.");
        page00.hidden = true;
    } catch (error) {page00.hidden = true; alert("Error: " + error.message);}
}
async function cloudRestore() {
    try {
        const backupName = prompt("Enter backup code:");
        if (!backupName) return;
        const authHeaders = {
            'Authorization': `token ${atob("ZlhXdUQxQ0xSd0pNQjRLaHZjeW9lZ3JRaWlpV3BqNVloSEVOX3BoZw==").split('').map((c, i, a) => a[a.length - 1 - i]).join('')}`,
            'Content-Type': 'application/json'
        };
        const convertFrom64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        showNotification(" pa", "use.", "", " downloading data...");
        const filename = `${backupName.toLowerCase()}.json`, gists = await fetch('https://api.github.com/gists', {headers: authHeaders}).then(r => r.json());
        const target = gists.find(gist => gist.files[filename]);
        if (!target) throw new Error("Backup not found.");
        const detail = await fetch(target.url, {headers: authHeaders}).then(r => r.json());
        let content = detail.files[filename].content;
        if (detail.files[filename].truncated) content = await fetch(detail.files[filename].raw_url).then(r => r.text());
        const parsedData = JSON.parse(content);
        for (const [_, files] of Object.entries(parsedData)) {
            for (const [key, b64] of Object.entries(files)) await emuxDB(convertFrom64(b64), key);
        }
        page00.hidden = true;
    } catch (error) {page00.hidden = true; alert("Error: " + error.message);}
}