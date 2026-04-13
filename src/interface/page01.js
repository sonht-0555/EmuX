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
    const fileGroups = titles.map((title, index) => ({title, files: results[index].filter(file => file === gameName || file.startsWith(gameName + "."))}));
    list01.innerHTML = fileGroups.map(group => group.files.length ? group.files.map(file => `<file data="${group.title}"><name>${file}</name><down></down><dele></dele></file>`).join('') + `<titl>${group.title}.</titl>` : '').join('');
    list01.querySelectorAll('down').forEach(button => button.onclick = async () => {
        const name = button.textContent;
        if (confirm(`Download this file? ${name}`)) {await downloadFromStore(name); showFileGroups(gameName);}
    });
    list01.querySelectorAll('name').forEach(button => button.onclick = async () => {
        const oldName = button.parentElement.querySelector('name').textContent;
        const newName = prompt("Rename this file", oldName);
        if (newName && newName !== oldName && await renameFromStore(oldName, newName)) {
            showFileGroups(newName.substring(0, newName.lastIndexOf('.')) || newName);
        }
    });
    list01.querySelectorAll('dele').forEach(button => button.onclick = async () => {
        const name = button.parentElement.querySelector('name').textContent;
        if (confirm(`Delete this file? ${name}`)) {await deleteFromStore(name); showFileGroups(gameName);}
    });
}
// ===== listGame =====
async function listGame() {
    const supportedExtensions = window.CORE_CONFIG?.flatMap(config => config.ext?.split(',').map(ext => ext.trim())).sort((a, b) => b.length - a.length) || [];
    list.innerHTML = (await listStore('games')).map(gameFilename => {
        const fileExtension = supportedExtensions.find(ext => gameFilename.toLowerCase().endsWith(ext.toLowerCase())) || ('.' + gameFilename.split('.').pop().toLowerCase());
        const coreConfiguration = window.CORE_CONFIG?.find(config => config.ext?.split(',').map(e => e.trim()).includes(fileExtension));
        const displayName = gameFilename.toLowerCase().endsWith(fileExtension.toLowerCase()) ? gameFilename.slice(0, -fileExtension.length) : (gameFilename.lastIndexOf('.') > 0 ? gameFilename.substring(0, gameFilename.lastIndexOf('.')) : gameFilename);
        const gameTag = (local('tags_' + gameFilename) || coreConfiguration?.tag || fileExtension.slice(1)).slice(0, 4);
        return `<rom data-full="${gameFilename}"><name>${displayName}</name><tag>_${gameTag}</tag><dot></dot></rom>`;
    }).join('');
    list.querySelectorAll('rom').forEach(romElement => {
        const fullName = romElement.getAttribute('data-full'), displayName = romElement.querySelector('name').textContent;
        romElement.querySelectorAll('name, tag').forEach(el => el.onclick = () => loadGame(fullName));
        romElement.querySelector('dot').onclick = () => {showFileGroups(displayName); view('details');};
    });
}
// ===== verticalSetting =====
async function verticalSetting(values) {
    const list = Array.isArray(values) ? values : [80, 160, 0];
    if (current >= list.length) current = 0;
    page02.style.paddingTop = `${list[current]}px`;
    list.forEach((value, index) => {
        const el = document.getElementById(`k${value}`);
        if (el) el.style.stroke = index === current ? "var(--profile-base)" : "var(--profile-3)";
    });
    local('vertical', current);
    current = (current + 1) % list.length;
}
const optionStyle = (selector, value) => {
    document.querySelectorAll(selector).forEach(el => {
        let text = el.textContent.trim().replace(/_$/, '');
        el.textContent = text.toLowerCase() === (value || '').toLowerCase() ? text + '_' : text;
    });
};
// ===== optionClick =====
const optionClick = text => ({
    'Cloud': () => {const api = prompt("Enter API key"); local('gemini_key', api);},
    'Restore': () => cloudRestore(),
    'Backup': () => cloudBackup(),
    'Lated': () => {local('core_repo', 'lated'); optionStyle('opti', 'lated');},
    'Stable': () => {local('core_repo', 'stable'); optionStyle('opti', 'stable');},
    'Test': () => {local('core_repo', 'test'); optionStyle('opti', 'test');},
}[text]?.());
// ===== Event Listeners =====
document.addEventListener("DOMContentLoaded", () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(registration => registration.active && !navigator.serviceWorker.controller && location.reload()));
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.msg === "progress") {
                showNotification(" Up", "date.", "", ` Please wait in...|${event.data.current}.${event.data.total}|`);
            } else if (event.data.msg === "done") {
                setTimeout(() => location.reload(), 2000);
            }
        });
    }
    fetch('./sw.js').then(r => r.text()).then(t => ver.textContent = t.match(/revision = '(.*?)'/)[1]);
    switch0.textContent = local('render') || 'WGPU';
    setTimeout(() => {
        listGame(); verticalSetting();
        optionStyle('opti', local('core_repo') || 'lated');
    }, 2000);
    romInput.onchange = event => inputGame(event);
    logo.onpointerdown = () => view('home');
    vertical.onpointerdown = () => verticalSetting();
    setting.onpointerdown = () => view(list02.hidden ? 'settings' : 'home');
    document.querySelectorAll('opti').forEach(element => element.onclick = () => optionClick(element.textContent.trim()));
});