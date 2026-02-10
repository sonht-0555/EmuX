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
        list.hidden = true;
        list01.hidden = false;
    });
}
// ===== verticalSetting =====
async function verticalSetting(values = [80, 160, 5]) {
    page02.style.paddingTop = `${values[current]}px`;
    values.forEach((value, index) => document.getElementById(`k${value}`).style.stroke = index === current ? "var(--profile-1)" : "var(--profile-4)");
    local('vertical', current);
    current = (current + 1) % values.length;
}
// ===== optionClick =====
const optionClick = text => ({'Cloud': () => { }, 'Restore': () => { }, 'Backup': () => { }}[text]?.());
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
    vertical.onclick = verticalSetting;
    logo.onclick = () => {list.hidden = false; list01.hidden = list02.hidden = true; listGame();};
    document.querySelectorAll('opti').forEach(element => element.onclick = () => optionClick(element.textContent.trim()));
});