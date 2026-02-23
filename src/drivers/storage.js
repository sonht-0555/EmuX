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
    return (ext && getAllStoreNames().find(storeName => STORES[storeName].includes(ext))) || 'games';
}
// ===== getDB =====
async function getDB() {
    if (databaseCache && databaseCache.readyState !== 'closing') return databaseCache;
    const openDB = version => new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, version);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            getAllStoreNames().forEach(s => !db.objectStoreNames.contains(s) && db.createObjectStore(s));
        };
        request.onsuccess = event => {
            const db = event.target.result;
            db.onversionchange = () => {db.close(); databaseCache = null;};
            resolve(db);
        };
        request.onerror = reject;
    });
    try {
        const db = await openDB();
        if (getAllStoreNames().some(s => !db.objectStoreNames.contains(s))) {
            db.close();
            return databaseCache = await openDB(db.version + 1);
        }
        return databaseCache = db;
    } catch (e) {
        databaseCache = null;
        throw e;
    }
}
// ===== emuxDB =====
async function emuxDB(dataOrKey, name) {
    const db = await getDB(), key = name || dataOrKey, store = storeForFilename(String(key));
    const transaction = db.transaction(store, name ? 'readwrite' : 'readonly'), objectStore = transaction.objectStore(store);
    return new Promise((resolve, reject) => {
        if (name) {
            objectStore.put(dataOrKey instanceof ArrayBuffer ? new Uint8Array(dataOrKey) : dataOrKey, name);
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = event => reject(event);
        } else {
            const request = objectStore.get(dataOrKey);
            request.onsuccess = () => resolve(request.result);
            request.onerror = event => reject(event);
        }
    });
}
// ===== listStore =====
async function listStore(storeName) {
    const db = await getDB();
    const getKeys = store => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(store)) return resolve([]);
        const request = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
        request.onsuccess = () => resolve(request.result.map(String));
        request.onerror = reject;
    });
    if (!storeName) {
        const names = getAllStoreNames(), keys = await Promise.all(names.map(getKeys));
        return names.reduce((accumulator, name, index) => ({...accumulator, [name]: keys[index]}), {});
    }
    return getKeys(storeName);
}
// ===== deleteFromStore =====
async function deleteFromStore(key) {
    const db = await getDB(), store = storeForFilename(String(key));
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(store, 'readwrite'), objectStore = transaction.objectStore(store);
        objectStore.delete(key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = event => reject(event);
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