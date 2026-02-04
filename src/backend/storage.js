let dbCache = null
const DB_NAME = 'EmuxDB', allStoreNames = () => Object.keys(STORES), STORES = {
  games: ['nes','sfc','smc','gba','gb','gbc','bin','rom','md','gen','ngp','ngc','nds','iso','img','cue','pbp','zip','pce'],
  saves: ['sav','srm','sram'],
  states: ['ss1','ss2','ss3','ss4','ss5','ss6','ss7','ss8','ss9','ss0']
}

const storeForFilename = fn => {
  if (!fn || typeof fn !== 'string') return 'games';
  const ext = fn.split('.').pop()?.toLowerCase();
  return ext ? (allStoreNames().find(s => STORES[s].includes(ext)) || 'games') : 'games';
}

async function getDB() {
  if (dbCache) return dbCache;
  const open = v => new Promise((r, j) => {
    const rq = indexedDB.open(DB_NAME, v);
    if (v) rq.onupgradeneeded = e => allStoreNames().forEach(s => { if (!e.target.result.objectStoreNames.contains(s)) e.target.result.createObjectStore(s); });
    rq.onsuccess = e => r(e.target.result);
    rq.onerror = j;
  });
  const db = await open();
  const miss = allStoreNames().filter(s => !db.objectStoreNames.contains(s));
  if (miss.length) { db.close(); dbCache = await open(db.version + 1); }
  else dbCache = db;
  return dbCache;
}

async function emuxDB(dataOrKey, name) {
  const db = await getDB();
  const key = name || dataOrKey;
  const storeName = storeForFilename(String(key));
  const tx = db.transaction(storeName, name ? 'readwrite' : 'readonly');
  const store = tx.objectStore(storeName);
  return new Promise((res, rej) => {
    if (name) {
      let dataToSave = dataOrKey;
      if (dataToSave instanceof ArrayBuffer) dataToSave = new Uint8Array(dataToSave);
      store.put(dataToSave, name);
      tx.oncomplete = () => res(true);
      tx.onerror = e => rej(e);
    } else {
      const rq = store.get(dataOrKey);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = e => rej(e);
    }
  });
}

async function listStore(storeName) {
  const db = await getDB();
  const getKeys = s => new Promise((r, j) => {
    if (!db.objectStoreNames.contains(s)) return r([]);
    const rq = db.transaction(s, 'readonly').objectStore(s).getAllKeys();
    rq.onsuccess = () => r(rq.result.map(k => String(k)));
    rq.onerror = j;
  });
  if (!storeName) {
    const out = {};
    for (const s of allStoreNames()) out[s] = await getKeys(s);
    return out;
  }
  return getKeys(storeName);
}

async function deleteFromStore(key) {
  const db = await getDB();
  const storeName = storeForFilename(String(key));
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => res(true);
    tx.onerror = e => rej(e);
  });
}

async function downloadFromStore(name) {
  const data = await emuxDB(name);
  if (!data) return message("File not found!");
  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  message(`[#]_Exported!`);
}