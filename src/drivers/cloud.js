const cloudDecode = (value) => atob(value).split('').reverse().join('');
const CLOUD_CONFIG = {ACCESS_KEY_ID: cloudDecode("NDJiODI1YWIwNDBlYzgxOTUwMzNlYjNjOGYxYmFiY2E="), SECRET_ACCESS_KEY: cloudDecode("NGM5NjRmN2IyZjI0ZDVhMzMxYTg5MTRhMTRiOWYzNTlhZWE3NjliNmQ2MzA3MGU2ZTllNjdhOGIxZTk4YTk5YQ=="), ENDPOINT: cloudDecode("bW9jLmVnYXJvdHNlcmFsZmR1b2xjLjJyLjcwNDk1ZTI3OTA0ZjhkNjFhMWI1MGNkMDI0YWI3OGJlLy86c3B0dGg="), BUCKET: cloudDecode("eHVtZQ=="), REGION: "auto", PARALLEL: 5};
const cloudCache = (key, value) => {if (value !== undefined) return localStorage.setItem(key, JSON.stringify(value)); return JSON.parse(localStorage.getItem(key) || "null");};
const getS3 = () => new S3mini({accessKeyId: CLOUD_CONFIG.ACCESS_KEY_ID, secretAccessKey: CLOUD_CONFIG.SECRET_ACCESS_KEY, endpoint: `${CLOUD_CONFIG.ENDPOINT}/${CLOUD_CONFIG.BUCKET}`, region: CLOUD_CONFIG.REGION});
// ===== quickHash =====
function quickHash(buffer) {
    let hash = 2166136261;
    const bytes = new Uint8Array(buffer), step = bytes.length > 65536 ? Math.floor(bytes.length / 1024) : 1;
    for (let index = 0; index < bytes.length; index += step) hash = Math.imul(hash ^ bytes[index], 16777619);
    return (hash >>> 0).toString(36) + '_' + bytes.length;
}
// ===== cloudBackup =====
async function cloudBackup() {
    const startTime = Date.now(), backupName = prompt("Enter backup code");
    if (!backupName) return;
    showNotification(" pa", "use.", "", "Connecting to R2...");
    const s3 = getS3(), prefix = `${backupName}/`;
    const databaseStores = await listStore(), fileList = [];
    for (const [storeName, keys] of Object.entries(databaseStores)) {
        keys.forEach(key => fileList.push({store: storeName, key: key}));
    }
    const oldHashes = cloudCache('cloud_hash_' + backupName) || {}, newHashes = {};
    let uploadedFiles = 0, skippedFiles = 0;
    for (let index = 0; index < fileList.length; index += CLOUD_CONFIG.PARALLEL) {
        const batch = fileList.slice(index, index + CLOUD_CONFIG.PARALLEL);
        await Promise.all(batch.map(async (item, batchIndex) => {
            const buffer = await emuxDB(item.key);
            if (!buffer) return;
            const fileKey = `${item.store}__${item.key}`, fileHash = quickHash(buffer);
            newHashes[fileKey] = fileHash;
            if (oldHashes[fileKey] === fileHash) {
                console.log(`Skipped: ${item.key}`);
                skippedFiles++;
                return;
            }
            const currentFileIndex = index + batchIndex + 1;
            showNotification(" pa", "use.", "", `Uploading...|${currentFileIndex}/${fileList.length}|`);
            await s3.putAnyObject(`${prefix}${fileKey}`, buffer, "application/octet-stream");
            uploadedFiles++;
            console.log(`Uploaded: ${item.key}`);
        }));
    }
    const cloudObjects = await s3.listObjects('/', prefix);
    const zombieFiles = cloudObjects.filter(object => {
        if (!object.Key || !object.Key.includes('__')) return false;
        const fileName = object.Key.split('/').pop();
        return !newHashes[fileName];
    });
    if (zombieFiles.length > 0) {
        for (let index = 0; index < zombieFiles.length; index += CLOUD_CONFIG.PARALLEL) {
            const batch = zombieFiles.slice(index, index + CLOUD_CONFIG.PARALLEL);
            await Promise.all(batch.map(object => {
                console.log(`Deleting: ${object.Key.split('/').pop()}`);
                return s3.deleteObject(object.Key);
            }));
        }
    }
    cloudCache('cloud_hash_' + backupName, newHashes);
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Done: ${elapsedTime}s (${uploadedFiles} uploaded, ${skippedFiles} skipped, ${zombieFiles.length} cleaned)`);
    page00.hidden = true;
}
// ===== cloudRestore =====
async function cloudRestore() {
    const startTime = Date.now(), backupName = prompt("Enter restore code");
    if (!backupName) return;
    showNotification(" pa", "use.", "", "Scanning R2 storage...");
    const s3 = getS3(), prefix = `${backupName}/`, objects = await s3.listObjects('/', prefix);
    if (!objects || objects.length === 0) {
        page00.hidden = true;
        return;
    }
    const validFiles = objects.filter(object => object.Key && object.Key.includes('__'));
    for (let index = 0; index < validFiles.length; index += CLOUD_CONFIG.PARALLEL) {
        const batch = validFiles.slice(index, index + CLOUD_CONFIG.PARALLEL);
        await Promise.all(batch.map(async (object, batchIndex) => {
            const objectKey = object.Key, fileName = objectKey.split('/').pop(), realKey = fileName.split('__')[1];
            const currentFileIndex = index + batchIndex + 1;
            showNotification(" pa", "use.", "", `Restoring...|${currentFileIndex}/${validFiles.length}|`);
            const data = await s3.getObjectArrayBuffer(objectKey);
            if (data) {
                await emuxDB(new Uint8Array(data), realKey);
                console.log(`Restored: ${realKey}`);
            }
        }));
    }
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Done: ${elapsedTime}s (${validFiles.length} restored)`);
    page00.hidden = true;
}