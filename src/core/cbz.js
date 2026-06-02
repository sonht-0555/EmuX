window.extractCBZ = extractCBZ;
// ===== extractCBZ =====
async function extractCBZ(arrayBuffer, romName) {
    const imgExts = /\.(jpe?g|png|webp|gif|avif)$/i;
    await showNotification("", "##", "-", "", true);
    const files = fflate.unzipSync(new Uint8Array(arrayBuffer));
    const names = Object.keys(files).filter(n => imgExts.test(n) && files[n].length > 0).sort();
    const urls = names.map(name => URL.createObjectURL(new Blob([files[name]])));
    const level = (romName.replace(/\.[^.]+$/, '')[2] || '').toLowerCase();
    let page = Number(localStorage.getItem(`page_${romName}`)) || 0, isInitialScroll = true;
    screen.innerHTML = ''; body.classList.add(`manga-${level}`);
    const manga = document.createElement('manga');
    manga.innerHTML = urls.map(u => `<img src="${u}" loading="lazy">`).join('');
    const one = document.createElement('one'), two = document.createElement('two'), num = document.createElement('num');
    screen.append(num, one, two, manga);
    const restoreScroll = () => {if (page > 0 && manga.scrollHeight > manga.clientHeight) manga.scrollTop = page * (manga.scrollHeight - manga.clientHeight);};
    page02.hidden = false;
    await showNotification("", "###", "", "", true);
    manga.querySelectorAll('img').forEach(img => img.onload = restoreScroll);
    setTimeout(() => {
        restoreScroll();
        body.classList.add('cbz-open'); isInitialScroll = false;
        [bpad, dpad, jpad, page00, page01, switch0].forEach((el) => (el.hidden = true));
    }, 200);
    manga.onscroll = () => {
        if (isInitialScroll) return;
        const total = manga.scrollHeight - manga.clientHeight;
        setTimeout(() => {num.innerHTML = `${Math.round((manga.scrollTop / total) * (urls.length - 1)) + 1}|${urls.length}`;}, 2000);
    };
    manga.ontouchstart = manga.ontouchmove = e => e.stopPropagation();
}