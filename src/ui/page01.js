// ===== view (Navigation Manager) =====
function view(name) {
    const isHome = name === 'home';
    list.hidden = !isHome;
    list01.hidden = name !== 'details';
    list02.hidden = name !== 'settings';
    logo.setAttribute('green', isHome ? 'em' : 'ba');
    logo.innerText = isHome ? 'ux' : 'ck';
    if (isHome) listGame();
}
// ===== showFileGroups =====
async function showFileGroups(gameName) {
    const titles = ["saves", "states", "games"], results = await Promise.all(titles.map(type => listStore(type)));
    const fileGroups = titles.map((title, index) => ({title, files: results[index].filter(file => file.startsWith(gameName))}));
    list01.innerHTML = fileGroups.map(group => group.files.length ? group.files.map(file => `<file data="${group.title}"><name>${file}</name><dele></dele></file>`).join('') + `<titl>${group.title}.</titl>` : '').join('');
    list01.querySelectorAll('name').forEach(button => button.onclick = async () => {
        const name = button.textContent;
        if (confirm(`Download this file? ${name}`)) {await downloadFromStore(name); showFileGroups(gameName);}
    });
    list01.querySelectorAll('dele').forEach(button => button.onclick = async () => {
        const name = button.parentElement.querySelector('name').textContent;
        if (confirm(`Delete this file? ${name}`)) {await deleteFromStore(name); showFileGroups(gameName);}
    });
}
// ===== listGame =====
async function listGame() {
    const games = await listStore('games');
    list.innerHTML = games.map(game => `<rom><name>${game}</name><more></more></rom>`).join('');
    list.querySelectorAll('name').forEach(element => element.onclick = () => loadGame(element.textContent));
    list.querySelectorAll('more').forEach(button => button.onclick = () => {
        const name = button.parentElement.querySelector('name').textContent;
        showFileGroups(name.slice(0, -4));
        view('details');
    });
}
// ===== verticalSetting =====
async function verticalSetting(values) {
    const list = Array.isArray(values) ? values : [80, 160, 5];
    if (current >= list.length) current = 0;
    page02.style.paddingTop = `${list[current]}px`;
    list.forEach((value, index) => {
        const el = document.getElementById(`k${value}`);
        if (el) el.style.stroke = index === current ? "var(--profile-1)" : "var(--profile-4)";
    });
    local('vertical', current);
    current = (current + 1) % list.length;
}
// ===== optionClick =====
const optionClick = text => ({
    'Cloud': () => {const t = prompt("GitHub Token:"); if (t) local('gh_token', t);},
    'Restore': () => cloudRestore(),
    'Backup': () => cloudBackup()
}[text]?.());
// ===== Event Listeners =====
document.addEventListener("DOMContentLoaded", () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(registration => registration.active && !navigator.serviceWorker.controller && location.reload()));
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.msg === "Updating...") {
                let counter = 0, interval = setInterval(() => {
                    showNotification(" Up", "date.", "", ` Please wait in...|${++counter}|`);
                    if (counter === 10) {clearInterval(interval); location.reload();}
                }, 1000);
            }
        });
    }
    ver.textContent = gameVer;
    switch0.textContent = local('render') || 'WGPU';
    setTimeout(() => {listGame(); verticalSetting();}, 2000);
    romInput.onchange = event => inputGame(event);
    logo.onpointerdown = () => view('home');
    vertical.onpointerdown = () => verticalSetting();
    setting.onpointerdown = () => view(list02.hidden ? 'settings' : 'home');
    document.querySelectorAll('opti').forEach(element => element.onclick = () => optionClick(element.textContent.trim()));
});