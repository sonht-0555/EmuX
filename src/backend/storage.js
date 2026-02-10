// ===== Storage System =====
let databaseCache = null;
const DATABASE_NAME = 'EmuxDB', STORES = {
    games: ['nes', 'sfc', 'smc', 'gba', 'gb', 'gbc', 'bin', 'rom', 'md', 'gen', 'ngp', 'ngc', 'nds', 'iso', 'img', 'cue', 'pbp', 'zip', 'pce'],
    saves: ['sav', 'srm', 'sram'],
    states: ['ss1', 'ss2', 'ss3', 'ss4', 'ss5', 'ss6', 'ss7', 'ss8', 'ss9', 'ss0']
};
// ===== getAllStoreNames =====
const getAllStoreNames = () => Object.keys(STORES);
// ===== storeForFilename =====
function storeForFilename(filename) {
    if (!filename || typeof filename !== 'string') return 'games';
    const ext = filename.split('.').pop()?.toLowerCase();
    return (ext && getAllStoreNames().find(s => STORES[s].includes(ext))) || 'games';
}
// ===== getDB =====
async function getDB() {
    if (databaseCache) return databaseCache;
    const openDB = version => new Promise((resolve, reject) => {
        const req = indexedDB.open(DATABASE_NAME, version);
        if (version) req.onupgradeneeded = e => {
            const db = e.target.result;
            getAllStoreNames().forEach(s => !db.objectStoreNames.contains(s) && db.createObjectStore(s));
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = reject;
    });
    const db = await openDB();
    if (getAllStoreNames().some(s => !db.objectStoreNames.contains(s))) {
        db.close();
        return databaseCache = await openDB(db.version + 1);
    }
    return databaseCache = db;
}
// ===== emuxDB =====
async function emuxDB(dataOrKey, name) {
    const db = await getDB(), key = name || dataOrKey, store = storeForFilename(String(key));
    const tx = db.transaction(store, name ? 'readwrite' : 'readonly'), os = tx.objectStore(store);
    return new Promise((resolve, reject) => {
        if (name) {
            os.put(dataOrKey instanceof ArrayBuffer ? new Uint8Array(dataOrKey) : dataOrKey, name);
            tx.oncomplete = () => resolve(true);
            tx.onerror = e => reject(e);
        } else {
            const req = os.get(dataOrKey);
            req.onsuccess = () => resolve(req.result);
            req.onerror = e => reject(e);
        }
    });
}
// ===== listStore =====
async function listStore(storeName) {
    const db = await getDB();
    const getKeys = store => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(store)) return resolve([]);
        const req = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
        req.onsuccess = () => resolve(req.result.map(String));
        req.onerror = reject;
    });
    if (!storeName) {
        const names = getAllStoreNames(), keys = await Promise.all(names.map(getKeys));
        return names.reduce((acc, name, i) => ({...acc, [name]: keys[i]}), {});
    }
    return getKeys(storeName);
}
// ===== deleteFromStore =====
async function deleteFromStore(key) {
    const db = await getDB(), store = storeForFilename(String(key));
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite'), os = tx.objectStore(store);
        os.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = e => reject(e);
    });
}
// ===== downloadFromStore =====
async function downloadFromStore(name) {
    const data = await emuxDB(name);
    if (!data) return message("File not found!");
    const url = URL.createObjectURL(new Blob([data])), link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    URL.revokeObjectURL(url);
    message(`[#]_Exported!`);
}