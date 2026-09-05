window.extractCBZ = extractCBZ;
// ===== extractCBZ =====
async function extractCBZ(data, romName) {
    const imgExts = /\.(jpe?g|png|webp|gif|avif)$/i;
    await showNotification("", "##", "-", "", true);
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data), {buffer, byteOffset, length: len} = u8, view = new DataView(buffer, byteOffset, len);

    let eocdOffset = -1;
    const maxSearch = Math.min(len, 65558);
    for (let i = len - 22; i >= len - maxSearch; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {eocdOffset = i; break;}
    }
    if (eocdOffset === -1) throw new Error("Không đúng chuẩn file ZIP!");

    const cdSize = view.getUint32(eocdOffset + 12, true), cdOffset = view.getUint32(eocdOffset + 16, true), fileEntries = [], decoder = new TextDecoder('utf-8');
    let jsonEntry = null, p = cdOffset;

    while (p < cdOffset + cdSize) {
        if (view.getUint32(p, true) !== 0x02014b50) break;
        const method = view.getUint16(p + 10, true), csize = view.getUint32(p + 20, true), size = view.getUint32(p + 24, true),
            nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true),
            localHeaderOffset = view.getUint32(p + 42, true), name = decoder.decode(u8.subarray(p + 46, p + 46 + nameLen));

        if (!name.startsWith('__MACOSX') && !name.endsWith('/')) {
            const entry = {name, method, csize, size, localHeaderOffset};
            if (name.endsWith('.json') && !jsonEntry) jsonEntry = entry;
            else if (imgExts.test(name) || name.endsWith('.scan') || name.includes('.scan.')) fileEntries.push(entry);
        }
        p += 46 + nameLen + extraLen + commentLen;
    }

    const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
    fileEntries.sort((a, b) => collator.compare(a.name, b.name));

    const extractSingleEntry = entry => {
        const lp = entry.localHeaderOffset;
        if (view.getUint32(lp, true) !== 0x04034b50) throw new Error("Lỗi Local Header Offset: " + entry.name);
        const dataOffset = lp + 30 + view.getUint16(lp + 26, true) + view.getUint16(lp + 28, true),
            compressed = u8.subarray(dataOffset, dataOffset + entry.csize);
        if (entry.method === 0) return new Blob([compressed], {type: 'image/jpeg'});
        if (entry.method === 8) return new Blob([fflate.inflateSync(compressed)], {type: 'image/jpeg'});
        throw new Error("Chưa hỗ trợ compression method: " + entry.method);
    };

    let transData = null;
    if (jsonEntry) {
        try {transData = JSON.parse(await extractSingleEntry(jsonEntry).text());} catch (e) { }
    }

    const displayEntries = fileEntries.filter(e => !e.name.endsWith('.scan') && !e.name.includes('.scan.')),
        totalPages = displayEntries.length, PART_SIZE = 1000, OVERLAP = 2, totalParts = Math.ceil(totalPages / PART_SIZE), CHUNK_SIZE = 8;

    let globalPage = Number(local(`page_${romName}`)) || 0;
    if (globalPage > 0 && globalPage <= 1) globalPage = Math.round(globalPage * (totalPages - 1));
    globalPage = Math.max(0, Math.min(totalPages - 1, globalPage));

    let currentPart = Math.floor(globalPage / PART_SIZE), level = local('manga_level') || '', curTransPage = null,
        partStart = 0, partEnd = 0, partLength = 0, pageHeights = new Float32Array(0), avgHeight = window.innerHeight, isInit = true, scrollTmr, lastScrollTop = 0;
    const blobUrlMap = new Map(), knownHeights = new Map();
    const mangaClasses = value => String(value || '').trim().split(/\s+/).filter(Boolean).map(v => v.startsWith('manga-') ? v : `manga-${v}`);
    const setMangaLevel = (value, save) => {
        body.classList.remove(...Array.from(body.classList).filter(v => v.startsWith('manga-')));
        body.classList.add(...mangaClasses(level = String(value || '').trim()));
        if (save) local('manga_level', level);
    };
    screen.innerHTML = ''; setMangaLevel(level);

    const manga = document.createElement('manga'), num = document.createElement('num'), numText = document.createElement('span'),
        numOverlay = document.createElement('div'), transWrap = document.createElement('div'), trans = document.createElement('trans'),
        tHeader = document.createElement('div'), tHeaderOverlay = document.createElement('div'), tFooter = document.createElement('div');
    numText.className = 'num-text'; numOverlay.className = 'num-overlay'; num.append(numText, numOverlay);
    transWrap.className = 'trans-wrap'; tHeader.className = 't-header'; tHeaderOverlay.className = 't-header-overlay'; tHeader.append(tHeaderOverlay); tFooter.className = 't-footer'; transWrap.hidden = true;
    transWrap.append(tHeader, trans, tFooter); transData ? screen.append(num, manga, transWrap) : screen.append(num, manga);

    const updateTrans = p => {
        if (!transData || !displayEntries[p]) return;
        const pName = displayEntries[p].name.split('/').pop().replace(/\.[^/.]+$/, "");
        if (curTransPage === pName) return; curTransPage = pName;
        const pd = transData.filter(i => i.page === pName);
        if (!pd.length) return transWrap.hidden = true;
        transWrap.hidden = false;
        let html = '', lBox = null;
        pd.forEach(i => {
            if (lBox !== null && lBox !== i.box) html += '<line></line>';
            lBox = i.box;
            const s = i.speaker || '..', pf = s === '..' ? '..' : `${String(i.box).padStart(2, '0')}.${s.split(' ')[0].substring(0, 6)}.`;
            html += `<div class="t-row"><span class="t-name">${pf}</span><span class="t-text">${i.text}</span></div>`;
        });
        trans.innerHTML = html; trans.scrollTop = 0;
    };

    const updateNum = () => {numText.textContent = `${globalPage + 1}|${totalPages}`;};

    function renderWindow(centerGlobalPage) {
        const localCenter = centerGlobalPage - partStart, curChunk = Math.floor(localCenter / CHUNK_SIZE),
            startLocal = Math.max(0, (curChunk - 2) * CHUNK_SIZE), endLocal = Math.min(partLength, (curChunk + 3) * CHUNK_SIZE);

        for (let i = 0; i < partLength; i++) {
            const item = manga.children[i];
            if (!item) continue;
            const gIdx = partStart + i;

            if (i >= startLocal && i < endLocal) {
                if (!item.firstElementChild) {
                    let url = blobUrlMap.get(gIdx);
                    if (!url) {
                        try {
                            url = URL.createObjectURL(extractSingleEntry(displayEntries[gIdx]));
                            blobUrlMap.set(gIdx, url);
                        } catch (err) {console.error(`Lỗi trang ${gIdx}:`, err);}
                    }
                    if (url) {
                        const img = document.createElement('img');
                        img.style.pointerEvents = 'none';
                        img.loading = 'lazy';
                        img.setAttribute('data-index', gIdx);
                        img.setAttribute('image-name', item.getAttribute('image-name'));
                        img.onload = () => {
                            const newH = img.offsetHeight;
                            if (newH > 0) {
                                const oldH = pageHeights[i] || newH, diff = newH - oldH;
                                pageHeights[i] = newH;
                                knownHeights.set(gIdx, newH);
                                item.style.minHeight = `${newH}px`;
                                if (diff !== 0 && item.offsetTop < manga.scrollTop) {
                                    manga.scrollTop += diff;
                                    lastScrollTop += diff;
                                }
                            }
                        };
                        img.src = url;
                        item.appendChild(img);
                    }
                }
            } else {
                if (item.firstElementChild) {
                    const h = item.offsetHeight || pageHeights[i];
                    if (h > 0) {pageHeights[i] = h; knownHeights.set(gIdx, h); item.style.minHeight = `${h}px`;}
                    item.innerHTML = '';
                    if (blobUrlMap.has(gIdx)) {
                        URL.revokeObjectURL(blobUrlMap.get(gIdx));
                        blobUrlMap.delete(gIdx);
                    }
                } else if (!item.style.minHeight) {
                    item.style.minHeight = `${knownHeights.get(gIdx) || pageHeights[i] || avgHeight}px`;
                }
            }
        }
    }

    function loadPart(partIndex, targetGlobalPage = null) {
        currentPart = Math.max(0, Math.min(totalParts - 1, partIndex));
        partStart = Math.max(0, currentPart * PART_SIZE - (currentPart > 0 ? OVERLAP : 0));
        partEnd = Math.min(totalPages, (currentPart + 1) * PART_SIZE);
        partLength = partEnd - partStart;

        blobUrlMap.forEach(url => URL.revokeObjectURL(url));
        blobUrlMap.clear();

        pageHeights = new Float32Array(partLength);
        let mangaHtml = '';
        for (let i = partStart; i < partEnd; i++) {
            const shortName = displayEntries[i].name.split('/').pop().replace(/\.[^/.]+$/, ""),
                  h = knownHeights.get(i) || avgHeight;
            pageHeights[i - partStart] = h;
            mangaHtml += `<dimg data-index="${i}" image-name="${shortName}" style="min-height:${h}px;"></dimg>`;
        }
        manga.innerHTML = mangaHtml;

        if (targetGlobalPage != null) {
            globalPage = Math.max(partStart, Math.min(partEnd - 1, targetGlobalPage));
        } else if (globalPage < partStart || globalPage >= partEnd) {
            globalPage = partStart;
        }

        renderWindow(globalPage);
        const targetEl = manga.children[globalPage - partStart];
        manga.scrollTop = lastScrollTop = targetEl ? targetEl.offsetTop : 0;
        updateNum();
        updateTrans(globalPage);
    }

    page02.hidden = false;
    body.classList.add('cbz-open');
    loadPart(currentPart, globalPage);

    const restoreScroll = () => {
        const targetEl = manga.children[globalPage - partStart];
        if (targetEl) manga.scrollTop = targetEl.offsetTop;
    };
    requestAnimationFrame(restoreScroll);
    setTimeout(() => {
        restoreScroll();
        isInit = false;
        [bpad, dpad, jpad, page00, page01, switch0].forEach(el => el.hidden = true);
    }, 200);

    num.onclick = e => {
        e.stopPropagation();
        const input = prompt("Page:", globalPage + 1)?.trim();
        if (!input) return;
        const p = parseInt(input) - 1;
        if (p >= 0 && p < totalPages) {
            const neededPart = Math.floor(p / PART_SIZE);
            if (neededPart !== currentPart) {
                loadPart(neededPart, p);
            } else {
                globalPage = p;
                renderWindow(globalPage);
                const t = manga.children[globalPage - partStart];
                if (t) manga.scrollTop = t.offsetTop;
                updateNum();
                updateTrans(globalPage);
            }
            local(`page_${romName}`, globalPage);
        }
    };

    await showNotification("", "###", "", "", true);

    manga.onscroll = () => {
        if (isInit) return;

        const st = manga.scrollTop, isDown = st > lastScrollTop;
        lastScrollTop = st;

        if (!window._partTransitioning) {
            if (isDown && st + manga.clientHeight >= manga.scrollHeight - 30 && currentPart < totalParts - 1) {
                window._partTransitioning = true;
                clearTimeout(scrollTmr);
                if (confirm(`Go to page ${currentPart + 2}? (${(currentPart + 1) * PART_SIZE + 1 - OVERLAP}-${Math.min(totalPages, (currentPart + 2) * PART_SIZE)})`)) {
                    loadPart(currentPart + 1, (currentPart + 1) * PART_SIZE - OVERLAP);
                    local(`page_${romName}`, globalPage);
                } else {
                    manga.scrollTop = manga.scrollHeight - manga.clientHeight - 80;
                }
                setTimeout(() => {window._partTransitioning = false;}, 600);
                return;
            }
            if (!isDown && st <= 10 && currentPart > 0 && !(globalPage - partStart)) {
                window._partTransitioning = true;
                clearTimeout(scrollTmr);
                if (confirm(`Go back to page ${currentPart}? (${Math.max(1, (currentPart - 1) * PART_SIZE + 1 - (currentPart > 1 ? OVERLAP : 0))}-${currentPart * PART_SIZE})`)) {
                    loadPart(currentPart - 1, currentPart * PART_SIZE - 1);
                    const lastTarget = manga.children[partLength - 1];
                    if (lastTarget) manga.scrollTop = Math.max(0, lastTarget.offsetTop - 80);
                    local(`page_${romName}`, globalPage);
                } else {
                    manga.scrollTop = 80;
                }
                setTimeout(() => {window._partTransitioning = false;}, 600);
                return;
            }
        }

        clearTimeout(scrollTmr);
        scrollTmr = setTimeout(() => {
            const r = manga.getBoundingClientRect(), my = r.top + r.height / 3;
            const cur = Array.from(manga.children).find(m => {
                const rect = m.getBoundingClientRect();
                return rect.top <= my && rect.bottom >= my;
            });
            if (cur) {
                const i = Number(cur.getAttribute('data-index'));
                if (i !== globalPage && !isNaN(i)) {
                    globalPage = i;
                    local(`page_${romName}`, globalPage);
                    updateNum();
                    updateTrans(globalPage);
                    renderWindow(globalPage);
                }
            }
        }, 60);
    };

    manga.ontouchstart = manga.ontouchmove = event => event.stopPropagation();
    num.ontouchstart = num.ontouchmove = event => event.stopPropagation();
    trans.ontouchstart = trans.ontouchmove = event => event.stopPropagation();
    manga.oncontextmenu = event => event.preventDefault();

    let pTmr, pImg;
    const clr = () => {
        clearTimeout(pTmr);
        if (pImg) {
            const i = pImg.getAttribute('data-index');
            if (i != null && blobUrlMap.has(Number(i))) {
                const origUrl = blobUrlMap.get(Number(i));
                if (pImg.src !== origUrl) {
                    pImg.onload = null;
                    pImg.src = origUrl;
                }
            }
            pImg = null;
        }
    };
    ['pointerup', 'pointercancel', 'touchend'].forEach(e => window.addEventListener(e, clr));
    manga.addEventListener('scroll', clr);

    manga.onpointerdown = event => {
        clr();
        const cx = event.clientX, cy = event.clientY, r = manga.getBoundingClientRect(),
            mx = cx - r.left + manga.scrollLeft, my = cy - r.top + manga.scrollTop,
            t = Array.from(manga.children).find(m => my >= m.offsetTop && my <= m.offsetTop + m.offsetHeight && mx >= m.offsetLeft && mx <= m.offsetLeft + m.offsetWidth);
        if (t) {
            const img = t.querySelector('img');
            pImg = img;
            const i = img?.getAttribute('data-index') ?? t.getAttribute('data-index'), entry = displayEntries[i];
            pTmr = setTimeout(() => {
                if (entry && img) {
                    const prefix = entry.name.includes('.raws.') ? entry.name.split('.raws.')[0] : entry.name.substring(0, entry.name.lastIndexOf('.')),
                        sEntry = fileEntries.find(k => k.name === prefix + '.scan' || k.name.startsWith(prefix + '.scan.'));
                    if (sEntry) {
                        try {
                            const scanUrl = URL.createObjectURL(extractSingleEntry(sEntry));
                            img.onload = () => URL.revokeObjectURL(scanUrl);
                            img.src = scanUrl;
                        } catch (e) { }
                    }
                }
            }, 600);
        }
        click(() => {
            if (t) {
                const i = t.getAttribute('data-index') ?? t.querySelector('img')?.getAttribute('data-index');
                if (i != null) {
                    local(`page_${romName}`, globalPage = Number(i));
                    updateNum();
                    updateTrans(globalPage);
                    renderWindow(globalPage);
                }
            }
        }, null, () => {
            const newLevel = prompt("Level:", level);
            if (newLevel != null) setMangaLevel(newLevel, true);
        });
    };
}

