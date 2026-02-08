// ===== showFileGroups =====
async function showFileGroups(gameName) {
    const titles = ["saves", "states", "games"], results = await Promise.all(titles.map(t => listStore(t)));
    const fileGroups = titles.map((title, i) => ({ title, files: results[i].filter(f => f.startsWith(gameName)) }));
    list01.innerHTML = fileGroups.map(g => g.files.length ? g.files.map(f => `<file data="${g.title}"><name>${f}</name><dele></dele></file>`).join('') + `<titl>${g.title}.</titl>` : '').join('');
    list01.querySelectorAll('name').forEach(btn => btn.onclick = async () => {
        const name = btn.textContent;
        if (confirm(`Download this file? ${name}`)) { await downloadFromStore(name); showFileGroups(gameName); }
    });
    list01.querySelectorAll('dele').forEach(btn => btn.onclick = async () => {
        const name = btn.parentElement.querySelector('name').textContent;
        if (confirm(`Delete this file? ${name}`)) { await deleteFromStore(name); showFileGroups(gameName); }
    });
}
// ===== listGame =====
async function listGame() {
    const games = await listStore('games');
    list.innerHTML = games.map(g => `<rom><name>${g}</name><more></more></rom>`).join('');
    list.querySelectorAll('name').forEach(el => el.onclick = () => loadGame(el.textContent));
    list.querySelectorAll('more').forEach(btn => btn.onclick = () => {
        const name = btn.parentElement.querySelector('name').textContent;
        showFileGroups(name.slice(0, -4));
        list.hidden = true; list01.hidden = false;
    });
}
// ===== verSetting =====
async function verSetting(vals = [80, 160, 5]) {
    page02.style.paddingTop = `${vals[current]}px`;
    vals.forEach((v, i) => document.getElementById(`k${v}`).style.stroke = i === current ? "var(--profile-1)" : "var(--profile-4)");
    local('vertical', current);
    current = (current + 1) % vals.length;
}
// ===== optionClick =====
const optionClick = txt => ({ 'Cloud': () => {}, 'Restore': () => {}, 'Backup': () => {} }[txt]?.());
// ===== DOMContentLoaded =====
document.addEventListener("DOMContentLoaded", () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(reg => reg.active && !navigator.serviceWorker.controller && location.reload()));
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data.msg === "Updating...") {
                let c = 0, itv = setInterval(() => {
                    notifi(" Up", "date.", "", ` Please wait in...|${++c}|`);
                    if (c === 10) { clearInterval(itv); location.reload(); }
                }, 1000);
            }
        });
    }
    ver.textContent = gameVer;
    switch0.textContent = local('render') || 'WGPU';
    setTimeout(() => { listGame(); verSetting(); }, 2000);
    romInput.onchange = e => inputGame(e);
    vertical.onclick = verSetting;
    logo.onclick = () => { list.hidden = false; list01.hidden = list02.hidden = true; listGame(); };
    document.querySelectorAll('opti').forEach(el => el.onclick = () => optionClick(el.textContent.trim()));
});