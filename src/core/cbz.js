window.extractCBZ = extractCBZ;
// ===== extractCBZ =====
function extractCBZ(arrayBuffer, romName) {
    const files = fflate.unzipSync(new Uint8Array(arrayBuffer)), names = Object.keys(files).sort();
    const urls = names.map(name => URL.createObjectURL(new Blob([files[name]])));
    let page = Number(localStorage.getItem(`page_${romName}`)) || 0;
    screen.innerHTML = '';
    const manga = document.createElement('manga');
    manga.innerHTML = urls.map(u => `<img src="${u}" loading="lazy">`).join('');
    screen.appendChild(manga);
    manga.style.transform = `translateX(calc(-${page} * (100% + 4px)))`;
    screen.onpointerdown = e => {
        page = (page + (e.clientX < innerWidth / 2 ? -1 : 1) + urls.length) % urls.length;
        manga.style.transform = `translateX(calc(-${page} * (100% + 4px)))`;
        localStorage.setItem(`page_${romName}`, page);
    };
    // Reset styles
    canvas.style.imageRendering = 'auto';
    screen.style.filter = 'url(#manga-sharpen) contrast(120%) saturate(80%) sepia(20%)';
    display.style.width = screen.style.width = '100vw';
    display.style.paddingTop = '10px';
    [bpad, dpad, jpad, page00, page01, switch0].forEach((el) => (el.hidden = true));
    page02.hidden = false;
    screen.style.zIndex = 0;
}