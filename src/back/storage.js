const DB_NAME = 'EmuxDB';
const STORES = {
  games: ['nes','sfc','smc','gba','gb','gbc','bin','rom'],
  saves: ['sav','srm','sram'],
  states: ['ss1','ss2','ss3','ss4','ss5','ss6','ss7','ss8','ss9','ss0']
};

const allStoreNames = () => Object.keys(STORES);
const storeForFilename = (fn) => {
  if (!fn || typeof fn !== 'string') return 'games';
  const p = fn.split('.'); if (p.length < 2) return 'games';
  const ext = p.pop().toLowerCase();
  return allStoreNames().find(s => STORES[s].includes(ext)) || 'games';
};

async function openDBWithStore() {
  const open = () => new Promise((r,j)=>{ const rq = indexedDB.open(DB_NAME); rq.onsuccess = e => r(e.target.result); rq.onerror = j; });
  const db = await open();
  const miss = allStoreNames().filter(s => !db.objectStoreNames.contains(s));
  if (!miss.length) return db;
  const v = db.version + 1; db.close();
  return new Promise((r,j)=> {
    const rq = indexedDB.open(DB_NAME, v);
    rq.onupgradeneeded = e => { const d = e.target.result; miss.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
    rq.onsuccess = e => r(e.target.result);
    rq.onerror = j;
  });
}

async function emuxDB(dataOrKey, name) {
  const db = await openDBWithStore();
  const key = name || dataOrKey;
  const storeName = storeForFilename(String(key));
  const tx = db.transaction(storeName, name ? 'readwrite' : 'readonly');
  const store = tx.objectStore(storeName);
  return new Promise((res, rej) => {
    if (name) {
      store.put(dataOrKey, name);
      tx.oncomplete = () => { db.close(); res(true); };
      tx.onerror = e => { db.close(); rej(e); };
    } else {
      const rq = store.get(dataOrKey);
      rq.onsuccess = () => { db.close(); res(rq.result); };
      rq.onerror = e => { db.close(); rej(e); };
    }
  });
}

async function listStore(storeName) {
  const db = await openDBWithStore();
  const getKeys = s => new Promise((r,j) => {
    if (!db.objectStoreNames.contains(s)) return r([]);
    const rq = db.transaction(s, 'readonly').objectStore(s).getAllKeys();
    rq.onsuccess = () => r(rq.result.map(k => String(k)));
    rq.onerror = j;
  });
  if (!storeName) {
    const out = {};
    for (const s of allStoreNames()) out[s] = await getKeys(s);
    db.close();
    return out;
  } else {
    const keys = await getKeys(storeName);
    db.close();
    return keys;
  }
}