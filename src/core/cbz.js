window.extractCBZ = extractCBZ;
// ===== extractCBZ =====
function extractCBZ(arrayBuffer, romName) {
    const files = fflate.unzipSync(new Uint8Array(arrayBuffer)), names = Object.keys(files).sort();
    const urls = names.map(name => URL.createObjectURL(new Blob([files[name]])));
    let page = Number(localStorage.getItem(`page_${romName}`)) || 0;
    screen.innerHTML = '';
    let imageElements = [0, 1, 2].map(i => {
        const img = document.createElement('img');
        img.src = urls[(page + i + urls.length - 1) % urls.length];
        screen.appendChild(img);
        return img;
    });
    imageElements.forEach((el, i) => el.style.opacity = i === 1 ? 1 : 0);
    screen.onpointerdown = event => {
        const direction = event.clientX < innerWidth / 2 ? -1 : 1;
        page = (page + direction + urls.length) % urls.length;
        try {localStorage.setItem(`page_${romName}`, String(page));} catch (e) { }
        let img = document.createElement('img');
        img.src = urls[(page + direction + urls.length) % urls.length];
        direction > 0
            ? (screen.removeChild(imageElements[0]), screen.appendChild(img), imageElements = [imageElements[1], imageElements[2], img])
            : (screen.removeChild(imageElements[2]), screen.insertBefore(img, imageElements[0]), imageElements = [img, imageElements[0], imageElements[1]]);
        imageElements.forEach((el, i) => el.style.opacity = i === 1 ? 1 : 0);
    };
    // Reset styles
    canvas.style.imageRendering = 'auto';
    display.style.width = screen.style.width = '100vw';
    display.style.paddingTop = '10px';
    [bpad, dpad, jpad, page00, page01, switch0].forEach((el) => (el.hidden = true));
    page02.hidden = false;
    screen.style.zIndex = 0;
}