// ===== Cloud System (Gist) =====
const GIST_FILENAME = 'emux_backup.json';

// Utility to convert Blob/Uint8Array to Base64
const toBase64 = data => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(new Blob([data]));
});

const fromBase64 = base64 => Uint8Array.from(atob(base64), c => c.charCodeAt(0));

async function getGistHeaders() {
    const token = local('gh_token');
    if (!token) {
        const input = prompt("Please enter your GitHub Token (settings > developer > personal access tokens > gist):");
        if (input) {
            local('gh_token', input);
            return {'Authorization': `token ${input}`, 'Content-Type': 'application/json'};
        }
        throw new Error("No Token");
    }
    return {'Authorization': `token ${token}`, 'Content-Type': 'application/json'};
}

// ===== Cloud Backup =====
async function cloudBackup() {
    try {
        const headers = await getGistHeaders();
        const allStores = await listStore(); // Get all store names and keys
        const backupData = {};

        // Collect all data from saves and states
        for (const [store, keys] of Object.entries(allStores)) {
            if (store === 'games') continue; // Don't backup ROMs to Gist (too big)
            backupData[store] = {};
            for (const key of keys) {
                const data = await emuxDB(key);
                backupData[store][key] = await toBase64(data);
            }
        }

        const body = JSON.stringify({
            description: "EmuX Backup",
            public: false,
            files: {[GIST_FILENAME]: {content: JSON.stringify(backupData)}}
        });

        // Try to find existing Gist
        const gists = await fetch('https://api.github.com/gists', {headers}).then(r => r.json());
        const existingGist = gists.find(g => g.files[GIST_FILENAME]);

        let response;
        if (existingGist) {
            response = await fetch(`https://api.github.com/gists/${existingGist.id}`, {method: 'PATCH', headers, body});
        } else {
            response = await fetch('https://api.github.com/gists', {method: 'POST', headers, body});
        }

        const result = await response.json();
        const code = result.id.slice(-4).toUpperCase();
        prompt("Backup Done! Your 4-char Restore Code is:", code);
    } catch (e) {
        if (e.message !== "No Token") alert("Backup failed: " + e.message);
    }
}

// ===== Cloud Restore =====
async function cloudRestore(code) {
    try {
        if (!code) code = prompt("Enter 4-char Restore Code:");
        if (!code) return;

        const headers = await getGistHeaders();
        const gists = await fetch('https://api.github.com/gists', {headers}).then(r => r.json());
        const targetGist = gists.find(g => g.id.toUpperCase().endsWith(code.toUpperCase()));

        if (!targetGist) throw new Error("Gist not found for this code.");

        const fullGist = await fetch(targetGist.url, {headers}).then(r => r.json());
        const backupData = JSON.parse(fullGist.files[GIST_FILENAME].content);

        // Restore to IndexedDB
        for (const [store, files] of Object.entries(backupData)) {
            for (const [name, base64] of Object.entries(files)) {
                await emuxDB(fromBase64(base64), name);
            }
        }
        alert("Restore Complete! Reloading...");
        location.reload();
    } catch (e) {
        if (e.message !== "No Token") alert("Restore failed: " + e.message);
    }
}
