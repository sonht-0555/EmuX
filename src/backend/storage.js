let databaseCache = null;
const DATABASE_NAME = 'EmuxDB';
const STORES = {
    games: ['nes', 'sfc', 'smc', 'gba', 'gb', 'gbc', 'bin', 'rom', 'md', 'gen', 'ngp', 'ngc', 'nds', 'iso', 'img', 'cue', 'pbp', 'zip', 'pce'],
    saves: ['sav', 'srm', 'sram'],
    states: ['ss1', 'ss2', 'ss3', 'ss4', 'ss5', 'ss6', 'ss7', 'ss8', 'ss9', 'ss0']
};
// ===== getAllStoreNames =====
function getAllStoreNames() {
    return Object.keys(STORES);
}
// ===== storeForFilename =====
function storeForFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        return 'games';
    }
    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension) {
        return 'games';
    }
    const matchedStore = getAllStoreNames().find(storeName => STORES[storeName].includes(extension));
    return matchedStore || 'games';
}
// ===== getDB =====
async function getDB() {
    if (databaseCache) {
        return databaseCache;
    }
    const openDatabase = (version) => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, version);
            if (version) {
                request.onupgradeneeded = (event) => {
                    const database = event.target.result;
                    getAllStoreNames().forEach(storeName => {
                        if (!database.objectStoreNames.contains(storeName)) {
                            database.createObjectStore(storeName);
                        }
                    });
                };
            }
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = reject;
        });
    };
    const database = await openDatabase();
    const missingStores = getAllStoreNames().filter(storeName => !database.objectStoreNames.contains(storeName));
    if (missingStores.length) {
        database.close();
        databaseCache = await openDatabase(database.version + 1);
    } else {
        databaseCache = database;
    }
    return databaseCache;
}
// ===== emuxDB =====
async function emuxDB(dataOrKey, name) {
    const database = await getDB();
    const key = name || dataOrKey;
    const storeName = storeForFilename(String(key));
    const transaction = database.transaction(storeName, name ? 'readwrite' : 'readonly');
    const objectStore = transaction.objectStore(storeName);
    return new Promise((resolve, reject) => {
        if (name) {
            let dataToSave = dataOrKey;
            if (dataToSave instanceof ArrayBuffer) {
                dataToSave = new Uint8Array(dataToSave);
            }
            objectStore.put(dataToSave, name);
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = (event) => reject(event);
        } else {
            const request = objectStore.get(dataOrKey);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event);
        }
    });
}
// ===== listStore =====
async function listStore(storeName) {
    const database = await getDB();
    const getKeysFromStore = (store) => {
        return new Promise((resolve, reject) => {
            if (!database.objectStoreNames.contains(store)) {
                return resolve([]);
            }
            const transaction = database.transaction(store, 'readonly');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.getAllKeys();
            request.onsuccess = () => {
                const keys = request.result.map(key => String(key));
                resolve(keys);
            };
            request.onerror = reject;
        });
    };
    if (!storeName) {
        const result = {};
        for (const store of getAllStoreNames()) {
            result[store] = await getKeysFromStore(store);
        }
        return result;
    }
    return getKeysFromStore(storeName);
}
// ===== deleteFromStore =====
async function deleteFromStore(key) {
    const database = await getDB();
    const storeName = storeForFilename(String(key));
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const objectStore = transaction.objectStore(storeName);
        objectStore.delete(key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = (event) => reject(event);
    });
}
// ===== downloadFromStore =====
async function downloadFromStore(name) {
    const data = await emuxDB(name);
    if (!data) {
        return message("File not found!");
    }
    const blobUrl = URL.createObjectURL(new Blob([data]));
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = name;
    downloadLink.click();
    URL.revokeObjectURL(blobUrl);
    message(`[#]_Exported!`);
}