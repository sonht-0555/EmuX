import {openZip, isScan} from './cbz/zip.js';
import {createTrans} from './cbz/trans.js';
import {createLevel} from './cbz/level.js';
import {startReader} from './cbz/reader.js';

window.extractCBZ = extractCBZ;

// Phiên đang mở, dùng để dọn dẹp khi mở file CBZ khác
let session = null;

// ===== extractCBZ =====
// Mở file .cbz và dựng trình đọc. Chỉ ghép các mảnh lại:
//   cbz/zip.js    đọc ZIP + kích thước ảnh (thuần, test được)
//   cbz/trans.js  panel dịch
//   cbz/level.js  class manga-* trên body
//   cbz/scan.js   giữ lâu xem bản .scan
//   cbz/reader.js trạng thái cuộn, cửa sổ ảo, phân trang
async function extractCBZ(data, romName) {
    session?.dispose();
    session = null;

    await showNotification("", "##", "-", "", true);

    const zip = openZip(data);
    const entries = zip.files.filter(e => !isScan(e.name));

    let transData = null;
    if (zip.json) {
        try {transData = JSON.parse(await zip.extract(zip.json).text());}
        catch (err) {console.error('Lỗi đọc file dịch:', err);}
    }

    const level = createLevel();
    const trans = createTrans(transData);
    session = await startReader({zip, entries, romName, trans, level});
}
