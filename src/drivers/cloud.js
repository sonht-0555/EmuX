// ===== Cloud System =====
const CLOUD_CONFIG = {
    TOKEN: atob("NnZCSmthb1E0N0ZHSTVPRmpPTVZTOFBEOUxqVXEwYjFjUDRKdWJOOW00NDNTblhueDJ6aENYczVsclRfdUYxN1Z6c3h4VVN4MFFaTldLR0ExMV90YXBfYnVodGln").split('').reverse().join(''),
    GIST_DESC: "EmuX: ",
    CHUNK_SIZE: 8 * 1024 * 1024,
    BATCH_UP: 9 * 1024 * 1024,
    BATCH_DOWN: 5
};
const getHeaders = () => ({'Authorization': `Bearer ${CLOUD_CONFIG.TOKEN}`, 'Content-Type': 'application/json'});
function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(binary);
}
function splitChunks(data, size) {
    if (data.length <= size) return [data];
    const result = [];
    for (let i = 0; i < data.length; i += size) result.push(data.substring(i, i + size));
    return result;
}
// Simple hash to detect file changes (FNV-1a 32-bit)
function quickHash(buffer) {
    let hash = 2166136261;
    const bytes = new Uint8Array(buffer);
    // Sample every 1024th byte for speed on large files
    const step = bytes.length > 65536 ? Math.floor(bytes.length / 1024) : 1;
    for (let i = 0; i < bytes.length; i += step) hash = Math.imul(hash ^ bytes[i], 16777619);
    return (hash >>> 0).toString(36) + '_' + bytes.length;
}
// Cache: Get/Set Gist ID for a backup code
function getCachedGist(backupName) {
    try {return JSON.parse(localStorage.getItem('cloud_gist_' + backupName));} catch {return null;}
}
function setCachedGist(backupName, gistId) {
    localStorage.setItem('cloud_gist_' + backupName, JSON.stringify(gistId));
}
// Cache: Get/Set file hashes for incremental backup
function getHashCache(backupName) {
    try {return JSON.parse(localStorage.getItem('cloud_hash_' + backupName)) || {};} catch {return {};}
}
function setHashCache(backupName, hashes) {
    localStorage.setItem('cloud_hash_' + backupName, JSON.stringify(hashes));
}
// ===== cloudBackup =====
async function cloudBackup() {
    const startTime = Date.now();
    try {
        const backupName = prompt("Enter Backup Code:");
        if (!backupName) return;
        showNotification(" pa", "use.", "", "Establishing secure link...");
        const headers = getHeaders(), gistDesc = CLOUD_CONFIG.GIST_DESC + backupName;
        // Step 1: Find Gist (cache-first, no verify) or create new
        let gistId = getCachedGist(backupName);
        if (!gistId) {
            const gists = await fetch('https://api.github.com/gists', {headers}).then(r => r.json());
            let gist = Array.isArray(gists) ? gists.find(g => g.description === gistDesc) : null;
            if (!gist) {
                gist = await fetch('https://api.github.com/gists', {
                    method: 'POST', headers,
                    body: JSON.stringify({description: gistDesc, public: false, files: {"manifest.txt": {content: "EmuX Verified"}}})
                }).then(r => r.json());
            }
            gistId = gist.id;
            setCachedGist(backupName, gistId);
        }
        // Step 2: Collect files, skip unchanged (incremental)
        const all = await listStore();
        let files = [];
        for (const [store, keys] of Object.entries(all)) keys.forEach(key => files.push({store, key}));
        const oldHashes = getHashCache(backupName);
        const newHashes = {};
        console.log(`>>> BACKUP: [${backupName}]`);
        const batches = [];
        let currentBatch = {}, currentSize = 0, skipped = 0;
        for (const {store, key} of files) {
            const buffer = await emuxDB(key);
            if (!buffer) continue;
            const hash = quickHash(buffer);
            newHashes[`${store}__${key}`] = hash;
            // Skip if file hasn't changed since last backup
            if (oldHashes[`${store}__${key}`] === hash) {
                console.log(`   Skipped (unchanged): ${key}`);
                skipped++;
                continue;
            }
            const chunks = splitChunks(bytesToBase64(new Uint8Array(buffer)), CLOUD_CONFIG.CHUNK_SIZE);
            for (let i = 0; i < chunks.length; i++) {
                const fileName = `${store}__${key}${chunks.length > 1 ? `.p${i + 1}` : ""}.bin`;
                if (currentSize + chunks[i].length > CLOUD_CONFIG.BATCH_UP && Object.keys(currentBatch).length) {
                    batches.push(currentBatch); currentBatch = {}; currentSize = 0;
                }
                currentBatch[fileName] = {content: chunks[i]}; currentSize += chunks[i].length;
            }
            console.log(`   Queued: ${key}`);
        }
        if (Object.keys(currentBatch).length) batches.push(currentBatch);
        // Step 3: Ship batches sequentially (with cache-miss recovery)
        if (batches.length > 0) {
            for (let i = 0; i < batches.length; i++) {
                showNotification(" pa", "use.", "", `Sending packet ${i + 1}/${batches.length}...`);
                let res = await fetch(`https://api.github.com/gists/${gistId}`, {method: 'PATCH', headers, body: JSON.stringify({files: batches[i]})});
                if (res.status === 404) {
                    // Cached ID expired, re-lookup and retry
                    localStorage.removeItem('cloud_gist_' + backupName);
                    const gists = await fetch('https://api.github.com/gists', {headers}).then(r => r.json());
                    let gist = Array.isArray(gists) ? gists.find(g => g.description === gistDesc) : null;
                    if (!gist) throw new Error("Gist lost! Create a new backup.");
                    gistId = gist.id;
                    setCachedGist(backupName, gistId);
                    res = await fetch(`https://api.github.com/gists/${gistId}`, {method: 'PATCH', headers, body: JSON.stringify({files: batches[i]})});
                }
            }
        } else {
            console.log("   All files unchanged, nothing to upload!");
        }
        // Save new hashes after successful upload
        setHashCache(backupName, newHashes);
        const time = ((Date.now() - startTime) / 1000).toFixed(2);
        showNotification(" pa", "use.", "", `Backup done! (${time}s, ${skipped} skipped)`);
        console.log(`>>> DONE: ${time}s (${skipped} files skipped)`);
        page00.hidden = true;
        // Step 4: Background cleanup of duplicate Gists
        fetch('https://api.github.com/gists', {headers}).then(r => r.json()).then(all => {
            if (Array.isArray(all)) all.filter(g => g.description === gistDesc && g.id !== gistId).forEach(old => fetch(`https://api.github.com/gists/${old.id}`, {method: 'DELETE', headers}));
        }).catch(() => { });
    } catch (e) {page00.hidden = true; alert("Error: " + e.message);}
}
// ===== cloudRestore =====
async function cloudRestore() {
    const startTime = Date.now();
    try {
        const backupName = prompt("Enter Restore Code:");
        if (!backupName) return;
        showNotification(" pa", "use.", "", "Accessing storage...");
        const headers = getHeaders(), gistDesc = CLOUD_CONFIG.GIST_DESC + backupName;
        // Step 1: Find Gist (cache-first) and group files
        let gistId = getCachedGist(backupName);
        let detail;
        if (gistId) {
            const res = await fetch(`https://api.github.com/gists/${gistId}`, {headers});
            if (res.ok) {
                detail = await res.json();
            } else {
                gistId = null;
            }
        }
        if (!gistId) {
            const gists = await fetch('https://api.github.com/gists', {headers}).then(r => r.json());
            const target = Array.isArray(gists) ? gists.find(g => g.description === gistDesc) : null;
            if (!target) throw new Error("Backup not found!");
            gistId = target.id;
            setCachedGist(backupName, gistId);
            detail = await fetch(target.url, {headers}).then(r => r.json());
        }
        const groups = {};
        Object.entries(detail.files).forEach(([name, file]) => {
            if (!name.includes('__')) return;
            const baseName = name.split('.p')[0].replace('.bin', '');
            if (!groups[baseName]) groups[baseName] = [];
            groups[baseName].push({name, file});
        });
        // Step 2: Parallel-fetch all truncated chunks
        const truncated = [];
        Object.values(groups).flat().forEach(item => {
            if (item.file.truncated) truncated.push((async () => item.file.content = await fetch(item.file.raw_url).then(r => r.text()))());
        });
        if (truncated.length) {
            showNotification(" pa", "use.", "", `Fetching ${truncated.length} large files...`);
            await Promise.all(truncated);
        }
        // Step 3: Reassemble and write to DB in batches
        const items = Object.entries(groups);
        for (let i = 0; i < items.length; i += CLOUD_CONFIG.BATCH_DOWN) {
            const batch = items.slice(i, i + CLOUD_CONFIG.BATCH_DOWN);
            await Promise.all(batch.map(async ([baseName, chunks], index) => {
                const realKey = baseName.split('__')[1];
                if (!index) showNotification(" pa", "use.", "", `Restoring: ${realKey}...`);
                chunks.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
                await emuxDB(Uint8Array.from(atob(chunks.map(c => c.file.content).join('')), c => c.charCodeAt(0)), realKey);
                console.log(`   Restored: ${realKey}`);
            }));
        }
        const time = ((Date.now() - startTime) / 1000).toFixed(2);
        showNotification(" pa", "use.", "", `Restore finished in ${time}s!`);
        page00.hidden = true;
    } catch (e) {page00.hidden = true; alert("Error: " + e.message);}
}