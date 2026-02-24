// ===== Cloud System =====
const CLOUD_CONFIG = {
    TOKEN: atob("NnZCSmthb1E0N0ZHSTVPRmpPTVZTOFBEOUxqVXEwYjFjUDRKdWJOOW00NDNTblhueDJ6aENYczVsclRfdUYxN1Z6c3h4VVN4MFFaTldLR0ExMV90YXBfYnVodGln").split('').reverse().join(''),
    GIST_PREFIX: "EmuX: ", CHUNK_SIZE: 8 * 1024 * 1024, RESTORE_BATCH: 5
};
const getHeaders = () => ({'Authorization': `Bearer ${CLOUD_CONFIG.TOKEN}`, 'Content-Type': 'application/json'});
const cloudCache = (key, value) => {
    if (value !== undefined) return localStorage.setItem(key, JSON.stringify(value));
    try {return JSON.parse(localStorage.getItem(key));} catch (error) {return null;}
};
function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.byteLength; index += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 8192));
    return btoa(binary);
}
function splitChunks(data, size) {
    if (data.length <= size) return [data];
    const chunks = [];
    for (let index = 0; index < data.length; index += size) chunks.push(data.substring(index, index + size));
    return chunks;
}
function quickHash(buffer) {
    let hash = 2166136261;
    const bytes = new Uint8Array(buffer), step = bytes.length > 65536 ? Math.floor(bytes.length / 1024) : 1;
    for (let index = 0; index < bytes.length; index += step) hash = Math.imul(hash ^ bytes[index], 16777619);
    return (hash >>> 0).toString(36) + '_' + bytes.length;
}
// ===== cloudBackup =====
async function cloudBackup() {
    const startTime = Date.now();
    const backupName = prompt("Enter Backup Code:");
    if (!backupName) return;
    showNotification(" pa", "use.", "", "Establishing secure link...");
    const headers = getHeaders(), gistTitle = CLOUD_CONFIG.GIST_PREFIX + backupName;
    let gistId = cloudCache('cloud_gist_' + backupName);
    if (!gistId) {
        const gists = await fetch('https://api.github.com/gists', {headers}).then(response => response.json());
        let targetGist = gists.find(gist => gist.description === gistTitle);
        if (!targetGist) {
            targetGist = await fetch('https://api.github.com/gists', {
                method: 'POST', headers, body: JSON.stringify({description: gistTitle, public: false, files: {"manifest.txt": {content: "EmuX Verified"}}})
            }).then(response => response.json());
        }
        gistId = targetGist.id;
        cloudCache('cloud_gist_' + backupName, gistId);
    }
    const databaseStores = await listStore(), fileList = [];
    for (const [store, keys] of Object.entries(databaseStores)) keys.forEach(key => fileList.push({store, key}));
    const oldHashes = cloudCache('cloud_hash_' + backupName) || {}, newHashes = {};
    let skippedFiles = 0, uploadedFiles = 0;
    console.log(`>>> BACKUP: [${backupName}]`);
    for (let index = 0; index < fileList.length; index++) {
        const {store, key} = fileList[index], buffer = await emuxDB(key);
        if (!buffer) continue;
        const fileKey = `${store}__${key}`, fileHash = quickHash(buffer);
        newHashes[fileKey] = fileHash;
        if (oldHashes[fileKey] === fileHash) {console.log(`   Skipped: ${key}`); skippedFiles++; continue;}
        showNotification(" pa", "use.", "", `Uploading |${index + 1}/${fileList.length}|...`);
        const dataChunks = splitChunks(bytesToBase64(new Uint8Array(buffer)), CLOUD_CONFIG.CHUNK_SIZE), uploadPayload = {};
        for (let chunkIndex = 0; chunkIndex < dataChunks.length; chunkIndex++) {
            uploadPayload[`${fileKey}${dataChunks.length > 1 ? `.p${chunkIndex + 1}` : ""}.bin`] = {content: dataChunks[chunkIndex]};
        }
        await fetch(`https://api.github.com/gists/${gistId}`, {method: 'PATCH', headers, body: JSON.stringify({files: uploadPayload})});
        uploadedFiles++;
        console.log(`   Uploaded: ${key}`);
    }
    cloudCache('cloud_hash_' + backupName, newHashes);
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    showNotification(" pa", "use.", "", `Backup successful! (${elapsedTime}s)`);
    console.log(`>>> DONE: ${elapsedTime}s (${uploadedFiles} uploaded, ${skippedFiles} skipped)`);
    page00.hidden = true;
    fetch('https://api.github.com/gists', {headers}).then(response => response.json()).then(allGists => {
        allGists.filter(gist => gist.description === gistTitle && gist.id !== gistId).forEach(oldGist => fetch(`https://api.github.com/gists/${oldGist.id}`, {method: 'DELETE', headers}));
    });
}
// ===== cloudRestore =====
async function cloudRestore() {
    const startTime = Date.now();
    const backupName = prompt("Enter Restore Code:");
    if (!backupName) return;
    showNotification(" pa", "use.", "", "Accessing storage...");
    const headers = getHeaders(), gistTitle = CLOUD_CONFIG.GIST_PREFIX + backupName;
    let gistId = cloudCache('cloud_gist_' + backupName), gistDetail;
    if (gistId) {
        gistDetail = await fetch(`https://api.github.com/gists/${gistId}`, {headers}).then(response => response.json());
    }
    if (!gistId || !gistDetail || !gistDetail.files) {
        const gists = await fetch('https://api.github.com/gists', {headers}).then(response => response.json());
        const targetGist = gists.find(gist => gist.description === gistTitle);
        gistId = targetGist.id;
        cloudCache('cloud_gist_' + backupName, gistId);
        gistDetail = await fetch(targetGist.url, {headers}).then(response => response.json());
    }
    const fileGroups = {};
    Object.entries(gistDetail.files).forEach(([fileName, fileData]) => {
        if (!fileName.includes('__')) return;
        const baseName = fileName.split('.p')[0].replace('.bin', '');
        if (!fileGroups[baseName]) fileGroups[baseName] = [];
        fileGroups[baseName].push({name: fileName, file: fileData});
    });
    const truncatedFiles = [];
    Object.values(fileGroups).flat().forEach(item => {
        if (item.file.truncated) truncatedFiles.push((async () => {item.file.content = await fetch(item.file.raw_url).then(response => response.text());})());
    });
    if (truncatedFiles.length > 0) {
        showNotification(" pa", "use.", "", `Downloading ${truncatedFiles.length} large files...`);
        await Promise.all(truncatedFiles);
    }
    const groupItems = Object.entries(fileGroups);
    for (let batchIndex = 0; batchIndex < groupItems.length; batchIndex += CLOUD_CONFIG.RESTORE_BATCH) {
        const currentBatch = groupItems.slice(batchIndex, batchIndex + CLOUD_CONFIG.RESTORE_BATCH);
        await Promise.all(currentBatch.map(async ([baseName, chunks], index) => {
            const realKey = baseName.split('__')[1];
            showNotification(" pa", "use.", "", `Restoring |${batchIndex + index + 1}/${groupItems.length}|...`);
            chunks.sort((first, second) => first.name.localeCompare(second.name, undefined, {numeric: true}));
            const combinedBase64 = chunks.map(chunkItem => chunkItem.file.content).join('');
            await emuxDB(Uint8Array.from(atob(combinedBase64), character => character.charCodeAt(0)), realKey);
            console.log(`   Restored: ${realKey}`);
        }));
    }
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    showNotification(" pa", "use.", "", `Restore completed! (${elapsedTime}s)`);
    page00.hidden = true;
}