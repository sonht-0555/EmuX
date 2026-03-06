// ===== Cloud System =====
const API_URL = 'https://emux-cloud.hoangtuanson91.workers.dev';
const cloudCache = (key, value) => (value !== undefined) ? local(key, JSON.stringify(value)) : JSON.parse(local(key) || "null");
const api = {
    put: (code, file, data) => fetch(`${API_URL}/put/${encodeURIComponent(code)}/${encodeURIComponent(file)}`, {method: 'PUT', body: data}).then(r => r.ok || Promise.reject()),
    get: (code, file) => fetch(`${API_URL}/get/${encodeURIComponent(code)}/${encodeURIComponent(file)}`).then(r => r.ok ? r.arrayBuffer() : null),
    list: (code) => fetch(`${API_URL}/list/${encodeURIComponent(code)}`).then(r => r.ok ? r.json() : []).catch(() => []),
    del: (code, file) => fetch(`${API_URL}/delete/${encodeURIComponent(code)}/${encodeURIComponent(file)}`, {method: 'DELETE'})
};
// ===== quickHash =====
function quickHash(buffer) {
    let hash = 2166136261, bytes = new Uint8Array(buffer), step = bytes.length > 65536 ? Math.floor(bytes.length / 1024) : 1;
    for (let i = 0; i < bytes.length; i += step) hash = Math.imul(hash ^ bytes[i], 16777619);
    return (hash >>> 0).toString(36) + bytes.length;
}
// ===== cloudBackup =====
async function cloudBackup() {
    const backupCode = prompt("Enter backup code");
    if (!backupCode) return;
    showNotification(" pa", "use.", "", "Connecting...");
    try {
        const databaseStores = await listStore(), fileList = [], oldHashes = cloudCache('chash_' + backupCode) || {}, newHashes = {}, PARALLEL = 5;
        let uploadedCount = 0;
        Object.entries(databaseStores).forEach(([storeName, keys]) => keys.forEach(key => fileList.push({storeName, key})));
        for (let i = 0; i < fileList.length; i += PARALLEL) {
            const batch = fileList.slice(i, i + PARALLEL);
            await Promise.all(batch.map(async ({storeName, key}) => {
                const buffer = await emuxDB(key);
                if (!buffer) return;
                const fileKey = `${storeName}__${key}`, hash = quickHash(buffer);
                newHashes[fileKey] = hash;
                if (oldHashes[fileKey] === hash) return;
                showNotification(" pa", "use.", "", `Sync|Up: ${++uploadedCount}/${fileList.length}`);
                await api.put(backupCode, fileKey, buffer);
            }));
        }
        const cloudObjects = await api.list(backupCode);
        for (const object of cloudObjects) {
            const fileName = object.Key.split('/').pop();
            if (fileName.includes('__') && !newHashes[fileName]) await api.del(backupCode, fileName);
        }
        cloudCache('chash_' + backupCode, newHashes);
        await message(`Cloud_Sync_OK!`, 1500);
    } catch (e) {
        await message(`Error_Sync!`, 2000);
    }
    page00.hidden = true;
}
// ===== cloudRestore =====
async function cloudRestore() {
    const restoreCode = prompt("Enter restore code");
    if (!restoreCode) return;
    showNotification(" pa", "use.", "", "Scanning...");
    try {
        const cloudObjects = await api.list(restoreCode);
        if (!cloudObjects.length) return (page00.hidden = true, message("Code_Not_Found"));
        const validFiles = cloudObjects.filter(object => object.Key.includes('__')), PARALLEL = 5;
        let restoredCount = 0;
        for (let i = 0; i < validFiles.length; i += PARALLEL) {
            const batch = validFiles.slice(i, i + PARALLEL);
            await Promise.all(batch.map(async (object) => {
                const fileName = object.Key.split('/').pop(), key = fileName.split('__')[1];
                showNotification(" pa", "use.", "", `Sync|In: ${++restoredCount}/${validFiles.length}`);
                const data = await api.get(restoreCode, fileName);
                if (data) await emuxDB(new Uint8Array(data), key);
            }));
        }
        await message(`Cloud_Restore_OK!`, 1500);
    } catch (e) {
        await message(`Error_Restore!`, 2000);
    }
    page00.hidden = true;
}