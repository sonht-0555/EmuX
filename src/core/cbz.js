window.extractCBZ = extractCBZ;
// ===== extractCBZ =====
async function extractCBZ(arrayBuffer, romName) {
    const imgExts = /\.(jpe?g|png|webp|gif|avif)$/i;
    await showNotification("", "##", "-", "", true);
    const files = fflate.unzipSync(new Uint8Array(arrayBuffer));
    const allNames = Object.keys(files).filter(n => (imgExts.test(n) || n.endsWith('.scan') || n.includes('.scan.')) && files[n].length > 0).sort(), displayNames = [], nameToUrl = {};
    allNames.forEach(n => {nameToUrl[n] = URL.createObjectURL(new Blob([files[n]], {type: 'image/jpeg'})); if (!n.endsWith('.scan') && !n.includes('.scan.')) displayNames.push(n);});
    const urls = displayNames.map(n => nameToUrl[n]);
    let page = Number(local(`page_${romName}`)) || 0, isInit = true, level = local('manga_level') || '', loadedCount = 0;
    if (page > 0 && page <= 1) page = Math.round(page * (urls.length - 1));
    const mangaClasses = value => String(value || '').trim().split(/\s+/).filter(Boolean).map(value => value.startsWith('manga-') ? value : `manga-${value}`);
    const setMangaLevel = (value, save) => {
        body.classList.remove(...Array.from(body.classList).filter(value => value.startsWith('manga-')));
        level = String(value || '').trim();
        body.classList.add(...mangaClasses(level));
        if (save) local('manga_level', level);
    };
    screen.innerHTML = ''; setMangaLevel(level);
    const manga = document.createElement('manga'), one = document.createElement('one'), two = document.createElement('two'), num = document.createElement('num');
    screen.append(num, one, two, manga);
    const loadNext = amount => {let html = ''; for (let end = Math.min(loadedCount + amount, urls.length); loadedCount < end; loadedCount++) html += `<img style="pointer-events:none" src="${urls[loadedCount]}" loading="lazy" data-index="${loadedCount}">`; manga.insertAdjacentHTML('beforeend', html);};
    loadNext(Math.max(10, page + 2));
    const restoreScroll = () => {let target = manga.children[page]; if (target) manga.scrollTop += target.getBoundingClientRect().top - manga.getBoundingClientRect().top;};
    manga.querySelectorAll('img').forEach(img => img.onload = restoreScroll); restoreScroll();
    setTimeout(() => {body.classList.add('cbz-open'); isInit = false;[bpad, dpad, jpad, page00, page01, switch0].forEach(element => element.hidden = true);}, 200);
    num.innerHTML = `${page + 1}|${urls.length}`; page02.hidden = false;
    num.onclick = e => {e.stopPropagation(); let p = prompt("Page:", page + 1) - 1; if (p >= 0 && p < urls.length) {if (p >= loadedCount) loadNext(p - loadedCount + 2); let t = manga.children[p]; if (t) manga.scrollTop += t.getBoundingClientRect().top - manga.getBoundingClientRect().top; local(`page_${romName}`, page = p); num.innerHTML = `${page + 1}|${urls.length}`;} };
    await showNotification("", "###", "", "", true);
    manga.onscroll = () => !isInit && manga.scrollTop + manga.clientHeight >= manga.scrollHeight - 2000 && loadNext(10);
    manga.ontouchstart = manga.ontouchmove = event => event.stopPropagation();
    num.ontouchstart = num.ontouchmove = event => event.stopPropagation();
    manga.oncontextmenu = event => event.preventDefault();
    let pTmr, pImg;
    const clr = () => {clearTimeout(pTmr); if (pImg) {let i = pImg.getAttribute('data-index'); if (i != null && pImg.src !== urls[i]) {pImg.onload = null; pImg.src = urls[i];} pImg = null;} };
    ['pointerup', 'pointercancel', 'touchend'].forEach(e => window.addEventListener(e, clr));
    manga.addEventListener('scroll', clr);
    manga.onpointerdown = event => {
        clr(); let cx = event.clientX, cy = event.clientY, r = manga.getBoundingClientRect(), mx = cx - r.left + manga.scrollLeft, my = cy - r.top + manga.scrollTop;
        let t = Array.from(manga.children).find(m => my >= m.offsetTop && my <= m.offsetTop + m.offsetHeight && mx >= m.offsetLeft && mx <= m.offsetLeft + m.offsetWidth);
        if (t) {
            pImg = t; let i = t.getAttribute('data-index'), n = displayNames[i];
            pTmr = setTimeout(() => {if (n) {let prefix = n.includes('.raws.') ? n.split('.raws.')[0] : n.substring(0, n.lastIndexOf('.')); let s = Object.keys(nameToUrl).find(k => k === prefix + '.scan' || k.startsWith(prefix + '.scan.')); if (s && nameToUrl[s]) {t.onload = null; t.src = nameToUrl[s];}}}, 600);
        }
        click(() => {if (t) {let i = t.getAttribute('data-index'); if (i != null) local(`page_${romName}`, page = Number(i)), num.innerHTML = `${page + 1}|${urls.length}`;} }, toggle2P, () => {let newLevel = prompt("Level:", level); if (newLevel != null) setMangaLevel(newLevel, true);});
    };
}
window.toggle2P = () => {
    let manga = document.querySelector('manga');
    if (!manga) return;
    manga.classList.toggle('double');
    let num = document.querySelector('num');
    if (num) {
        let p = parseInt(num.innerHTML) - 1;
        let target = manga.children[p];
        if (target) manga.scrollTop += target.getBoundingClientRect().top - manga.getBoundingClientRect().top;
    }
};
