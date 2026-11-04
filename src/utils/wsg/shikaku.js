"use strict";

// Shikaku: chia lưới thành các hình chữ nhật, mỗi hình chứa đúng một số và số đó bằng diện tích hình.
// Màn chơi sinh từ số thứ tự màn (cùng màn luôn ra cùng đề), bộ giải kiểm tra đề chỉ có một lời giải.

const BOARD_WIDTH = 312;            // rộng hơn Klotski (276) cho ô lưới 9x9 còn 32px
const STORAGE_KEY = "shikaku-game-v1";
const COLORS = 3;                   // số màu tô (.rect.c0..c2), lấy đúng bảng màu Klotski
const LIGHT_FILL = 2;               // màu sáng nhất, số trên nó phải dùng chữ tối
const SOLVER_LIMIT = 200000;        // quá số bước này coi như đề không chắc duy nhất
const ATTEMPTS = 40;

const app = document.querySelector(".app");
const board = app.querySelector(".board");
const status = app.querySelector(".status");
const undoButton = status.querySelector(".undo");
const levelText = status.querySelector(".level");
let level = 0, moves = 0, size = 5, clues = [], rects = [], moveHistory = [], drag = null, solving = false;

// ===== Sinh đề =====
function levelSize(index) {
  return index < 10 ? 5 : index < 25 ? 6 : index < 45 ? 7 : index < 70 ? 8 : 9;
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cắt lưới thành các hình chữ nhật ngẫu nhiên: lấy ô trống đầu tiên làm góc trên trái,
// chọn một kích thước còn vừa chỗ trống. Hình 1 ô ít khi được chọn cho đề đỡ vụn.
function partition(n, random) {
  const maxArea = n <= 5 ? 6 : n <= 6 ? 8 : n <= 7 ? 10 : 12;
  const used = new Uint8Array(n * n), result = [];
  for (let start = 0; start < n * n; start++) {
    if (used[start]) continue;
    const x0 = start % n, y0 = Math.floor(start / n);
    const options = [];
    for (let h = 1; y0 + h <= n; h++) {
      for (let w = 1; x0 + w <= n && w * h <= maxArea; w++) {
        let free = true;
        for (let y = y0; y < y0 + h && free; y++) for (let x = x0; x < x0 + w; x++) if (used[y * n + x]) {free = false; break;}
        if (!free) break;
        options.push({w, h, weight: w * h === 1 ? 0.15 : 1});
      }
    }
    let pick = random() * options.reduce((sum, o) => sum + o.weight, 0), chosen = options[0];
    for (const option of options) {
      pick -= option.weight;
      if (pick <= 0) {chosen = option; break;}
    }
    for (let y = y0; y < y0 + chosen.h; y++) for (let x = x0; x < x0 + chosen.w; x++) used[y * n + x] = 1;
    result.push({x: x0, y: y0, w: chosen.w, h: chosen.h});
  }
  return result;
}

// Đếm lời giải, dừng ở 2. Luôn lấp ô trống đầu tiên theo hàng: mọi ô trước nó đã kín,
// nên hình phủ nó bắt buộc nhận nó làm góc trên trái - cắt nhánh rất mạnh.
function countSolutions(n, clueList) {
  const clueAt = new Int16Array(n * n).fill(-1);
  clueList.forEach((clue, k) => {clueAt[clue.y * n + clue.x] = k;});
  const starts = Array.from({length: n * n}, () => []);
  clueList.forEach((clue, k) => {
    for (let h = 1; h <= clue.value; h++) {
      if (clue.value % h) continue;
      const w = clue.value / h;
      for (let y0 = Math.max(0, clue.y - h + 1); y0 <= clue.y && y0 + h <= n; y0++) {
        for (let x0 = Math.max(0, clue.x - w + 1); x0 <= clue.x && x0 + w <= n; x0++) {
          const cells = [];
          let ok = true;
          for (let y = y0; y < y0 + h && ok; y++) for (let x = x0; x < x0 + w; x++) {
            const at = clueAt[y * n + x];
            if (at >= 0 && at !== k) {ok = false; break;}
            cells.push(y * n + x);
          }
          if (ok) starts[y0 * n + x0].push({k, cells});
        }
      }
    }
  });
  const occupied = new Uint8Array(n * n), placed = new Uint8Array(clueList.length);
  let count = 0, nodes = 0;
  const search = from => {
    let cell = from;
    while (cell < n * n && occupied[cell]) cell++;
    if (cell === n * n) {count++; return;}
    for (const option of starts[cell]) {
      if (placed[option.k] || option.cells.some(i => occupied[i])) continue;
      if (++nodes > SOLVER_LIMIT) {count = 2; return;}
      placed[option.k] = 1;
      option.cells.forEach(i => {occupied[i] = 1;});
      search(cell + 1);
      placed[option.k] = 0;
      option.cells.forEach(i => {occupied[i] = 0;});
      if (count >= 2) return;
    }
  };
  search(0);
  return count;
}

function generate(index) {
  const n = levelSize(index);
  let fallback = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const random = mulberry32((index + 1) * 7919 + attempt * 104729);
    const clueList = partition(n, random).map(r => ({
      x: r.x + Math.floor(random() * r.w),
      y: r.y + Math.floor(random() * r.h),
      value: r.w * r.h
    }));
    fallback ??= clueList;
    if (countSolutions(n, clueList) === 1) return {n, clueList};
  }
  // hiếm khi tới đây; đề vẫn giải được, chỉ là có thể nhiều cách - luật chấm vẫn đúng
  return {n, clueList: fallback};
}

// ===== Trạng thái =====
function saveGame() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({level, moves, rects, moveHistory}));
  } catch { }
}

const cleanRects = list => Array.isArray(list)
  ? list.filter(r => r && [r.x, r.y, r.w, r.h, r.c].every(Number.isInteger)).map(({x, y, w, h, c}) => ({x, y, w, h, c: Math.abs(c) % COLORS}))
  : [];

function restoreGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Number.isInteger(saved.level) || saved.level < 0) return false;
    setLevel(saved.level);
    moves = Number.isInteger(saved.moves) ? saved.moves : 0;
    // chỉ còn giữ hình đúng luật; ván lưu từ bản cũ có thể còn hình sai thì bỏ đi
    const keep = list => cleanRects(list).filter(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= size && r.y + r.h <= size && isValid(r));
    rects = keep(saved.rects);
    moveHistory = Array.isArray(saved.moveHistory)
      ? saved.moveHistory.map(s => ({moves: Number.isInteger(s?.moves) ? s.moves : 0, rects: keep(s?.rects)}))
      : [];
    render();
    return true;
  } catch {
    return false;
  }
}

function setLevel(index) {
  const puzzle = generate(index);
  level = index;
  size = puzzle.n;
  clues = puzzle.clueList;
  syncGridSize();
  buildBoard();
}

function loadLevel(index) {
  setLevel(Math.max(0, index));
  moves = 0;
  rects = [];
  moveHistory = [];
  render();
  saveGame();
}

function syncGridSize() {
  // một số chung cho khe giữa ô, đệm trong viền, viền bàn cờ và viền khung kéo
  const gap = 2;
  app.style.setProperty("--size", size);
  app.style.setProperty("--gap", `${gap}px`);
  app.style.setProperty("--line", `${gap}px`);
  app.style.setProperty("--cell", `${Math.floor((BOARD_WIDTH - gap * (size - 1)) / size)}px`);
  // chữ số về 8px từ màn 20
  app.style.setProperty("--clue-font", level >= 19 ? "8px" : "12px");
}

// ===== Luật =====
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function isValid(rect) {
  const inside = clues.filter(clue => contains(rect, clue.x, clue.y));
  return inside.length === 1 && inside[0].value === rect.w * rect.h;
}

function isSolved() {
  return rects.length === clues.length && rects.every(isValid);
}

// Màu mới khác màu các hình đang kề bên, để hai hình sát nhau không lẫn vào nhau.
function pickColor(rect) {
  const grown = {x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2};
  const taken = new Set(rects.filter(r => overlaps(grown, r)).map(r => r.c));
  const free = [...Array(COLORS).keys()].filter(c => !taken.has(c));
  return free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * COLORS);
}

// ===== Vẽ =====
function place(el, r) {
  el.style.gridColumn = `${r.x + 1} / span ${r.w}`;
  el.style.gridRow = `${r.y + 1} / span ${r.h}`;
  return el;
}

// Ô nền, số và khung kéo dựng một lần mỗi màn; mỗi lần vẽ chỉ thêm/gỡ đúng các hình thay đổi,
// không dựng lại cả bàn theo từng nhịp kéo.
let clueEls = [], preview = null;
const rectEls = new Map();          // "x,y,w,h,c" -> <div>
const rectKey = r => `${r.x},${r.y},${r.w},${r.h},${r.c}`;

function buildBoard() {
  rectEls.clear();
  const tiles = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tiles.push(place(tile, {x, y, w: 1, h: 1}));
  }
  clueEls = clues.map(clue => {
    const el = document.createElement("div");
    el.className = "clue";
    el.textContent = clue.value;
    return place(el, {x: clue.x, y: clue.y, w: 1, h: 1});
  });
  preview = document.createElement("div");
  preview.className = "rect preview";
  preview.hidden = true;
  board.replaceChildren(...tiles, ...clueEls, preview);
}

function render() {
  undoButton.textContent = `${String(moves).padStart(4, "0")}_`;
  levelText.textContent = `M${String(level + 1).padStart(2, "0")}`;
  const alive = new Set();
  for (const r of rects) {
    const key = rectKey(r);
    alive.add(key);
    if (rectEls.has(key)) continue;
    const el = document.createElement("div");
    el.className = `rect c${r.c}`;
    board.insertBefore(place(el, r), preview);
    rectEls.set(key, el);
  }
  for (const [key, el] of rectEls) {
    if (!alive.has(key)) {el.remove(); rectEls.delete(key);}
  }
  clueEls.forEach((el, i) => {
    const owner = rects.find(r => contains(r, clues[i].x, clues[i].y));
    el.classList.toggle("dark", owner?.c === LIGHT_FILL);
  });
  // chạm vào hình đã tô là để xoá, không hiện khung kéo
  preview.hidden = !drag || drag.onFilled;
  if (!preview.hidden) place(preview, dragRect());
}

// ===== Thao tác: kéo để vẽ hình, chạm vào hình để xoá =====
function cellAt(event) {
  const box = board.getBoundingClientRect();
  const stride = box.width / size;
  const clamp = v => Math.max(0, Math.min(size - 1, Math.floor(v / stride)));
  return {x: clamp(event.clientX - box.left), y: clamp(event.clientY - box.top)};
}

function dragRect() {
  const {start, end} = drag;
  return {
    x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    w: Math.abs(start.x - end.x) + 1, h: Math.abs(start.y - end.y) + 1
  };
}

function commit(next) {
  moveHistory.push({moves, rects: rects.map(r => ({...r}))});
  rects = next;
  moves++;
  if (isSolved()) {
    // dừng 2 giây cho thấy bàn đã kín rồi mới sang màn
    solving = true;
    render();
    saveGame();
    setTimeout(() => {
      solving = false;
      loadLevel(level + 1);
    }, 2000);
    return;
  }
  render();
  saveGame();
}

board.onpointerdown = event => {
  event.preventDefault();
  event.stopPropagation();
  if (solving || drag) return;
  const cell = cellAt(event);
  // chạm vào hình đã tô là để xoá (khung không mở rộng được từ đó), nên không hiện khung kéo
  const onFilled = rects.some(r => contains(r, cell.x, cell.y));
  drag = {start: cell, end: cell, pointerId: event.pointerId, onFilled};
  board.setPointerCapture(event.pointerId);
  render();
};

board.onpointermove = event => {
  event.stopPropagation();
  if (!drag || event.pointerId !== drag.pointerId) return;
  const cell = cellAt(event), {start, end} = drag;
  if (cell.x === end.x && cell.y === end.y) return;
  // khung không được lấn vào hình đã tô: thử đúng ô dưới ngón tay, không được thì chỉ
  // đi theo một chiều, để kéo chéo vào mép hình đã tô vẫn trượt được dọc theo nó
  const free = target => !rects.some(existing => overlaps(existing, {
    x: Math.min(start.x, target.x), y: Math.min(start.y, target.y),
    w: Math.abs(start.x - target.x) + 1, h: Math.abs(start.y - target.y) + 1
  }));
  const next = [cell, {x: cell.x, y: end.y}, {x: end.x, y: cell.y}].find(free);
  if (!next || (next.x === end.x && next.y === end.y)) return;
  drag.end = next;
  render();
};

const endDrag = event => {
  event.stopPropagation();
  if (!drag || event.pointerId !== drag.pointerId) return;
  const r = dragRect(), single = r.w * r.h === 1;
  drag = null;
  if (event.type === "pointercancel") {render(); return;}
  const hit = single ? rects.find(existing => contains(existing, r.x, r.y)) : null;
  if (hit) {
    commit(rects.filter(existing => existing !== hit));
    return;
  }
  // chỉ giữ hình đúng luật và không đè lên hình đã tô; sai thì bỏ, các hình đang có giữ nguyên
  if (!isValid(r) || rects.some(existing => overlaps(existing, r))) {render(); return;}
  commit([...rects, {...r, c: pickColor(r)}]);
};
board.onpointerup = endDrag;
board.onpointercancel = endDrag;

levelText.onpointerdown = event => {
  event.preventDefault();
  event.stopPropagation();
  if (window.confirm("Do you want to reset?")) loadLevel(level);
};

undoButton.onpointerdown = event => {
  event.preventDefault();
  event.stopPropagation();
  if (drag || solving || moveHistory.length === 0) return;
  const snapshot = moveHistory.pop();
  moves = snapshot.moves;
  rects = snapshot.rects.map(r => ({...r}));
  render();
  saveGame();
};

document.body.onpointerdown = event => {
  event.preventDefault();
  event.stopPropagation();
};

// shikaku.html?level=71 mở thẳng màn 71 để thử độ khó (ghi đè tiến trình đang lưu)
const askedLevel = Number(new URLSearchParams(location.search).get("level"));
if (Number.isInteger(askedLevel) && askedLevel >= 1) loadLevel(askedLevel - 1);
else if (!restoreGame()) loadLevel(0);
