// ===== Panel dịch dưới đáy màn hình =====
// Tự dựng DOM, tự giữ trạng thái trang hiện tại, tự chặn gesture. Bên ngoài chỉ cần
// gọi update(tênTrang). Sửa cách hiển thị lời thoại thì chỉ động vào file này.

export function createTrans(transData) {
    if (!transData) return null;

    const wrap = document.createElement('div'), trans = document.createElement('trans');
    const header = document.createElement('div'), headerOverlay = document.createElement('div'), footer = document.createElement('div');

    wrap.className = 'trans-wrap';
    wrap.hidden = true;
    header.className = 't-header';
    headerOverlay.className = 't-header-overlay';
    footer.className = 't-footer';
    header.append(headerOverlay);
    wrap.append(header, trans, footer);

    // đừng để trình phát ở lớp dưới ăn mất gesture cuộn của panel
    trans.ontouchstart = trans.ontouchmove = event => event.stopPropagation();

    let curPage = null;

    const update = pageName => {
        if (curPage === pageName) return;
        curPage = pageName;

        const rows = transData.filter(i => i.page === pageName);
        if (!rows.length) {wrap.hidden = true; return;}

        const frag = document.createDocumentFragment();
        let lastBox = null;
        for (const item of rows) {
            if (lastBox !== null && lastBox !== item.box) frag.append(document.createElement('line'));
            lastBox = item.box;

            const speaker = item.speaker || '..';
            const label = speaker === '..' ? '..' : `${String(item.box).padStart(2, '0')}.${speaker.split(' ')[0].substring(0, 6)}.`;
            const row = document.createElement('div'), name = document.createElement('span'), text = document.createElement('span');
            row.className = 't-row';
            name.className = 't-name'; name.textContent = label;
            text.className = 't-text'; text.textContent = item.text;
            row.append(name, text);
            frag.append(row);
        }
        trans.replaceChildren(frag);
        trans.scrollTop = 0;
        wrap.hidden = false;
    };

    return {el: wrap, update};
}
