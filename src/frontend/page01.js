// ===== showFileGroups =====
async function showFileGroups(gameName) {
    const fileGroups = [
        {
            title: "saves",
            files: (await listStore("saves")).filter(file => file.startsWith(gameName))
        },
        {
            title: "states",
            files: (await listStore("states")).filter(file => file.startsWith(gameName))
        },
        {
            title: "games",
            files: (await listStore("games")).filter(file => file.startsWith(gameName))
        }
    ];
    list01.innerHTML = fileGroups.map(group => {
        if (group.files.length === 0) {
            return '';
        }
        const fileElements = group.files.map(fileName => {
            return `<file data="${group.title}"><name>${fileName}</name><dele></dele></file>`;
        }).join('');
        return `${fileElements}<titl>${group.title}.</titl>`;
    }).join('');
    // Setup download handlers
    list01.querySelectorAll('name').forEach(nameButton => {
        nameButton.onclick = async () => {
            const fileName = nameButton.parentElement.querySelector('name').textContent;
            if (window.confirm(`Download this file?  ${fileName}`)) {
                await downloadFromStore(fileName);
                await showFileGroups(gameName);
            }
        };
    });
    // Setup delete handlers
    list01.querySelectorAll('dele').forEach(deleteButton => {
        deleteButton.onclick = async () => {
            const fileName = deleteButton.parentElement.querySelector('name').textContent;
            if (window.confirm(`Delete this file?  ${fileName}`)) {
                await deleteFromStore(fileName);
                await showFileGroups(gameName);
            }
        };
    });
}
// ===== listGame =====
async function listGame() {
    const gameList = await listStore('games');
    list.innerHTML = gameList.map(gameFileName => {
        return `<rom><name>${gameFileName}</name><more></more></rom>`;
    }).join('');
    list.querySelectorAll('name').forEach(gameNameElement => {
        gameNameElement.onclick = () => {
            loadGame(gameNameElement.textContent);
        };
    });
    list.querySelectorAll('more').forEach(moreButton => {
        moreButton.onclick = () => {
            const gameFileName = moreButton.parentElement.querySelector('name').textContent;
            const gameBaseName = gameFileName.slice(0, -4);
            showFileGroups(gameBaseName);
            list.hidden = true;
            list01.hidden = false;
        };
    });
}
// ===== verSetting =====
async function verSetting(values = [80, 160, 5]) {
    page02.style.paddingTop = `${values[current]}px`;
    values.forEach((value, index) => {
        const elementId = `k${value}`;
        const element = document.getElementById(elementId);
        const strokeColor = index === current ? "var(--profile-1)" : "var(--profile-4)";
        element.style.stroke = strokeColor;
    });
    local('vertical', current);
    current = (current + 1) % values.length;
}
// ===== optionClick =====
function optionClick(optionText) {
    const actions = {
        'Cloud': () => console.log('Cloud'),
        'Restore': () => console.log('Restore'),
        'Backup': () => console.log('Backup')
    };
    if (actions[optionText]) {
        actions[optionText]();
    }
}
// ===== DOMContentLoaded =====
document.addEventListener("DOMContentLoaded", function() {
    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(registration => {
                if (registration.active && !navigator.serviceWorker.controller) {
                    window.location.reload();
                }
            });
        });
        navigator.serviceWorker.addEventListener('message', function(event) {
            if (event.data.msg === "Updating...") {
                let updateCounter = 0;
                const updateInterval = setInterval(() => {
                    updateCounter++;
                    notifi(" Up", "date.", "", ` Please wait in...|${updateCounter}|`);
                    if (updateCounter === 10) {
                        clearInterval(updateInterval);
                        location.reload();
                    }
                }, 1000);
            }
        });
    }
    ver.textContent = gameVer;
    switch0.textContent = local('render') || 'WGPU';
    setTimeout(() => {
        listGame();
        verSetting();
    }, 2000);
    romInput.addEventListener("change", function(event) {
        inputGame(event);
    });
    vertical.addEventListener("click", function() {
        verSetting();
    });
    logo.addEventListener("click", function() {
        list.hidden = false;
        list01.hidden = true;
        list02.hidden = true;
        listGame();
    });
    document.querySelectorAll('opti').forEach(function(optionElement) {
        optionElement.addEventListener('click', function() {
            optionClick(optionElement.textContent.trim());
        });
    });
});