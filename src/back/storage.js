function emuxDB(data, name) {
  const DB_NAME = 'EmuxDB';
  const STORE_NAME = 'data';
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(DB_NAME, 1);
    openReq.onupgradeneeded = () => openReq.result.createObjectStore(STORE_NAME);
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction(STORE_NAME, name ? 'readwrite' : 'readonly');
      const store = tx.objectStore(STORE_NAME);
      if (name) {
        store.put(data, name);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = reject;
      } else {
        const getReq = store.get(data);
        getReq.onsuccess = () => { db.close(); resolve(getReq.result); };
        getReq.onerror = reject;
      }
    };
    openReq.onerror = reject;
  });
}
async function getRomFileNames(extensions) {
  if (typeof extensions === 'string') extensions = extensions.split(',').map(e => e.trim().toLowerCase());
  const DB_NAME = 'EmuxDB';
  const STORE_NAME = 'data';
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(DB_NAME, 1);
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const names = [];
      const req = store.openKeyCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          const key = cursor.key;
          if (extensions.some(ext => key.toLowerCase().endsWith('.' + ext))) names.push(key);
          cursor.continue();
        } else {
          db.close();
          resolve(names);
        }
      };
      req.onerror = reject;
    };
    openReq.onerror = reject;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
//const names = await getRomFileNames("gba, gbc, zip, smc, sfc");
//console.log(names);
});