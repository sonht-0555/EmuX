// ===== view (Navigation Manager) =====
function view(name) {
    const isHome = name === 'home';
    list.hidden = !isHome;
    list01.hidden = name !== 'details';
    list02.hidden = name !== 'settings';
    logo.setAttribute('base', isHome ? 'em' : 'ba');
    logo.innerText = isHome ? 'ux' : 'ck';
    if (isHome) listGame();
}
// ===== showFileGroups =====
async function showFileGroups(gameName) {
    const titles = ["saves", "states", "games"], results = await Promise.all(titles.map(type => listStore(type)));
    const fileGroups = titles.map((title, index) => ({title, files: results[index].filter(file => file === gameName || file.startsWith(gameName + "."))}));
    list01.innerHTML = fileGroups.map(group => group.files.length ? group.files.map(file => `<file data="${group.title}"><name>${file}</name><down></down><dele></dele></file>`).join('') + `<titl>${group.title}.</titl>` : '').join('');
    list01.querySelectorAll('down').forEach(button => button.onclick = async () => {
        const name = button.parentElement.querySelector('name').textContent;
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
    const localGames = await listStore('games');
    list.innerHTML = `
        <rom class="info" style="flex-shrink:0; padding: 17px;">
            <input id="romsearch" placeholder="find games_" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        </rom>
    `;

    const render = (searchQuery) => {
        const query = searchQuery.toLowerCase().trim();
        const maxItems = Math.floor((list.clientHeight - 80) / 40);
        const items = query ? storeList
            .filter(item => item.path.toLowerCase().includes(query))
            .sort((a, b) => {
                const pathA = a.path.toLowerCase(), pathB = b.path.toLowerCase();
                const indexA = pathA.indexOf(query), indexB = pathB.indexOf(query);
                if (indexA !== indexB) return indexA - indexB;
                return pathA.length - pathB.length;
            })
            .slice(0, maxItems) : localGames;

        const supportedExtensions = window.CORE_CONFIG?.flatMap(config => config.ext?.split(',').map(ext => ext.trim())).sort((a, b) => b.length - a.length) || [];

        while (list.children.length > 1) list.removeChild(list.lastChild);

        const html = items.map(item => {
            const isLocal = typeof item === 'string', path = isLocal ? item : item.path;
            const fileExtension = supportedExtensions.find(extension => path.toLowerCase().endsWith(extension.toLowerCase())) || ('.' + path.split('.').pop().toLowerCase());
            const fileName = path.split('/').pop();
            const displayName = fileName.toLowerCase().endsWith(fileExtension.toLowerCase()) ? fileName.slice(0, -fileExtension.length) : (fileName.lastIndexOf('.') > 0 ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName);
            const coreConfiguration = window.CORE_CONFIG?.find(config => config.ext?.split(',').map(ext => ext.trim()).includes(fileExtension));
            const gameTag = isLocal ? (local('tags_' + path) || coreConfiguration?.tag || fileExtension.slice(1)).slice(0, 4) : path.split('/')[0].slice(0, 4);
            return `<rom data-${isLocal ? 'full' : 'url'}="${isLocal ? path : rawContentBase + encodeURIComponent(path)}"><name>${displayName}</name><tag>_${gameTag}</tag><dot></dot></rom>`;
        }).join('');

        list.insertAdjacentHTML('beforeend', html);

        Array.from(list.children).slice(1).forEach(romElement => {
            const fullName = romElement.getAttribute('data-full'), url = romElement.getAttribute('data-url'), displayName = romElement.querySelector('name').textContent;
            if (fullName) {
                romElement.querySelectorAll('name, tag').forEach(element => element.onclick = () => loadGame(fullName));
                romElement.querySelector('dot').onclick = () => {showFileGroups(displayName); view('details');};
            } else romElement.onclick = async () => {
                const pathParts = decodeURIComponent(url).split('/');
                const fileName = pathParts[pathParts.length - 1];
                if (!confirm(`Download [${fileName}] and start?`)) return;
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error();
                    const data = await response.arrayBuffer();
                    await emuxDB(data, fileName);
                    loadGame(fileName);
                } catch (e) {
                    alert("Error: Cannot connect to Store!");
                }
            };
        });
    };
    const searchInput = document.getElementById('romsearch');
    searchInput.onfocus = () => list.classList.add('searching');
    searchInput.onblur = () => list.classList.remove('searching');
    searchInput.oninput = event => {
        const query = event.target.value.trim();
        if (query) {
            logo.setAttribute('base', 'ba');
            logo.innerText = 'ck';
        } else {
            logo.setAttribute('base', 'em');
            logo.innerText = 'ux';
        }
        render(event.target.value);
    };
    render("");
}
// ===== verticalSetting =====
async function verticalSetting(values) {
    const list = Array.isArray(values) ? values : [80, 160, 0];
    if (current >= list.length) current = 0;
    page02.style.paddingTop = `calc(env(safe-area-inset-top) + ${list[current]}px)`;
    list.forEach((value, index) => {
        const el = document.getElementById(`k${value}`);
        if (el) el.style.stroke = index === current ? "var(--profile-base)" : "var(--profile-3)";
    });
    local('vertical', current);
    current = (current + 1) % list.length;
}
// ===== optionState & optionStyle =====
const optionState = {};
const clearOptionMarks = selector => {
    document.querySelectorAll(selector).forEach(el => {
        el.textContent = el.textContent.trim().replace(/_$/, '');
    });
};
const optionStyle = (selector, value, group = 'default') => {
    const next = (value || '').toLowerCase();
    const prev = optionState[group];
    document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent.trim().replace(/_$/, '');
        const key = text.toLowerCase();
        if (key !== prev && key !== next) return;
        el.textContent = key === next ? text + '_' : text;
    });
    optionState[group] = next;
};
// ===== optionClick =====
const optionClick = text => ({
    'Cloud': () => {const api = prompt("Enter API key"); local('gemini_key', api);},
    'Restore': () => cloudRestore(),
    'Backup': () => cloudBackup(),
    'Lated': () => {local('core_repo', 'lated'); optionStyle('opti', 'lated', 'repo');},
    'Stable': () => {local('core_repo', 'stable'); optionStyle('opti', 'stable', 'repo');},
    'Test': () => {local('core_repo', 'test'); optionStyle('opti', 'test', 'repo');},
    'Sync': () => {local('core_audio', 'sync'); optionStyle('opti', 'sync', 'audio');},
    'Async': () => {local('core_audio', 'async'); optionStyle('opti', 'async', 'audio');},
    'Mute': () => {setMute(); optionStyle('opti', 'mute', 'audio');},
    'Add Oklch...': () => {
        const defaultTheme = 'oklch(0.7649 0.0494 76.31)', theme = prompt("Enter Oklch", local('core_theme') || defaultTheme);
        if (theme !== null) {
            const finalTheme = theme.trim() || defaultTheme;
            local('core_theme', finalTheme);
            document.documentElement.style.setProperty('--profile-base', finalTheme);
        }
    },
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
        listGame(); verticalSetting(); initStore();
        clearOptionMarks('opti');
        optionStyle('opti', local('core_repo') || 'lated', 'repo');
        const audioMode = (local('core_audio') || 'sync');
        optionStyle('opti', audioMode.endsWith('_mute') ? 'mute' : audioMode, 'audio');
    }, 2000);
    romInput.onchange = event => inputGame(event);
    logo.onpointerdown = () => click(null,
        () => {
            window.location.href = './src/utils/wsg/klotski.html';
        },
        () => {
            window.location.href = './src/utils/wsg/wsg.html';
        });
    vertical.onpointerdown = () => verticalSetting();
    setting.onpointerdown = () => view(list02.hidden ? 'settings' : 'home');
    document.querySelectorAll('opti').forEach(element => element.onclick = () => optionClick(element.textContent.trim()));
});