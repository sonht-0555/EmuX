"use strict";

const LEVELS = [
  "89958995644760172xx3", "89958995244360176xx7", "x99x7998765836524401", "79987998123054465xx6",
  "09915998544862376xx7", "59915990644867x837x2", "2991399065786578x44x", "2991699865783570x44x",
  "6991699285738570x44x", "6991699284458075x37x", "6991699284438570x57x", "09913992x44x65786578",
  "69916992443075587xx8", "6998699817x027x34455", "1990699867x827x34455", "69906991744875583xx2",
  "69976997445508x218x3", "8997899704431552x66x", "0993899784471552x66x", "0997199784438552x66x",
  "0992199387448755x66x", "79987998554406621xx3", "79987998244055661xx3", "89908991447755662xx3",
  "299039918x448x557766", "8990899134425566x77x", "2990399144557766x88x", "50165996299784478xx3",
  "0199449955668877xx23", "1990299354465876x87x", "55667998799804421xx3", "9944996087618732x55x",
  "3678267855014499xx99", "49984998563756270xx1", "79987998556634420xx1", "7799449955663x182x08",
  "99089918556644772xx3", "997899784401563256xx", "99779988456645320xx1", "012799679968x448x355"
];

const PIECE_NAMES = {
  "0": ["", "Bing."],
  "1": ["", "Bing."],
  "2": ["", "Bing."],
  "3": ["", "Bing."],
  "4": ["Liu", "_Bei."],
  "5": ["Zhao", "_Yun."],
  "6": ["Zhang", "_Fei."],
  "7": ["Ma_", "Chao."],
  "8": ["Guan", "_Yu."],
  "9": ["King_", "of Wei."]
};

const CELL_SIZE = 66;

const app = document.querySelector(".app");
const board = app.querySelector(".board");
const HIT_SLOP = 16;
const status = app.querySelector(".status");
const [movesText, levelText] = status.children;
const STORAGE_KEY = "klotski-game";
let level = 0, moves = 0, pieces = [], drag = null;

function saveGame() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({level, moves, pieces}));
  } catch { }
}

function restoreGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Number.isInteger(saved.level) || !Array.isArray(saved.pieces)) return false;
    if (saved.level < 0 || saved.level >= LEVELS.length || saved.pieces.length === 0) return false;
    level = saved.level;
    moves = Number.isInteger(saved.moves) ? saved.moves : 0;
    pieces = saved.pieces.map(({id, x, y, w, h}) => ({id: String(id), x, y, w, h}));
    render();
    return true;
  } catch {
    return false;
  }
}

function syncGridSize() {
  app.style.setProperty("--cell", `${CELL_SIZE}px`);
}

function loadLevel(index) {
  level = (index + LEVELS.length) % LEVELS.length;
  moves = 0;
  const cells = [...LEVELS[level]];
  pieces = [...new Set(cells.filter(value => value !== "x"))].map(id => {
    const indexes = cells.flatMap((value, i) => value === id ? [i] : []);
    const xs = indexes.map(i => i % 4), ys = indexes.map(i => Math.floor(i / 4));
    return {id, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1};
  });
  render();
  saveGame();
}

function render() {
  movesText.textContent = `${String(moves).padStart(3, "0")}.`;
  levelText.textContent = String(level + 1).padStart(3, "0");
  const pieceElements = pieces.map(piece => {
    const el = document.createElement("div");
    el.className = `piece${piece.id === "9" ? " hero" : piece.id < 4 ? " soldier" : ""}`;
    el.dataset.id = piece.id;
    el.style.gridColumn = `${piece.x + 1} / span ${piece.w}`;
    el.style.gridRow = `${piece.y + 1} / span ${piece.h}`;
    const firstName = document.createElement("span");
    const lastName = document.createElement("span");
    firstName.className = "piece-name piece-name-first";
    lastName.className = "piece-name piece-name-last";
    const [first = "", last = ""] = PIECE_NAMES[piece.id] ?? [];
    firstName.textContent = first;
    lastName.textContent = last;
    el.append(firstName, lastName);
    return el;
  });
  board.replaceChildren(...pieceElements);
}

function grid() {
  const result = Array.from({length: 5}, () => Array(4).fill(null));
  for (const p of pieces) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) result[y][x] = p.id;
  return result;
}

function canMove(piece, dx, dy) {
  const map = grid();
  for (let y = piece.y; y < piece.y + piece.h; y++) for (let x = piece.x; x < piece.x + piece.w; x++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= 4 || ny < 0 || ny >= 5 || (map[ny][nx] !== null && map[ny][nx] !== piece.id)) return false;
  }
  return true;
}

function maxDistance(piece, dx, dy) {
  let distance = 0, probe = {...piece};
  while (canMove(probe, dx, dy)) {distance++; probe.x += dx; probe.y += dy;}
  return distance;
}

function cellStride() {
  const style = getComputedStyle(board);
  return parseFloat(style.getPropertyValue("--cell")) + parseFloat(style.columnGap);
}

function startDrag(event, el) {
  event.preventDefault();
  event.stopPropagation();
  const piece = pieces.find(p => p.id === el.dataset.id);
  drag = {
    piece,
    el,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: 0,
    offsetY: 0,
    frame: 0,
    limits: {
      left: maxDistance(piece, -1, 0),
      right: maxDistance(piece, 1, 0),
      up: maxDistance(piece, 0, -1),
      down: maxDistance(piece, 0, 1)
    }
  };
  drag.el.classList.add("dragging");
  drag.el.setPointerCapture(event.pointerId);
  drag.el.onpointermove = moveDrag;
  drag.el.onpointerup = endDrag;
  drag.el.onpointercancel = endDrag;
}

board.onpointerdown = event => {
  const direct = event.target.closest(".piece");
  let el = direct;
  if (!el) {
    let nearest = Infinity;
    for (const candidate of board.children) {
      const rect = candidate.getBoundingClientRect();
      const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
      const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (dx <= HIT_SLOP && dy <= HIT_SLOP && distance < nearest) {
        nearest = distance;
        el = candidate;
      }
    }
  }
  if (el) startDrag(event, el);
};

function moveDrag(event) {
  event.stopPropagation();
  if (!drag) return;
  const events = event.getCoalescedEvents?.();
  const pointer = events?.length ? events[events.length - 1] : event;
  const rawX = pointer.clientX - drag.startX, rawY = pointer.clientY - drag.startY;
  const cell = cellStride();
  const canHorizontal = drag.limits.left || drag.limits.right;
  const canVertical = drag.limits.up || drag.limits.down;
  const useHorizontal = canHorizontal && (!canVertical || Math.abs(rawX) >= Math.abs(rawY));

  drag.offsetX = 0;
  drag.offsetY = 0;
  if (useHorizontal) {
    drag.offsetX = Math.max(-drag.limits.left * cell, Math.min(rawX, drag.limits.right * cell));
  } else if (canVertical) {
    drag.offsetY = Math.max(-drag.limits.up * cell, Math.min(rawY, drag.limits.down * cell));
  }
  if (!drag.frame) {
    const active = drag;
    active.frame = requestAnimationFrame(() => {
      active.frame = 0;
      active.el.style.transform = `translate3d(${active.offsetX}px,${active.offsetY}px,0)`;
    });
  }
}

function endDrag(event) {
  event.stopPropagation();
  if (!drag) return;
  const {piece, el, offsetX, offsetY} = drag;
  const cell = cellStride();
  const toCells = offset => Math.abs(offset) < cell * 0.08
    ? 0
    : Math.sign(offset) * Math.max(1, Math.round(Math.abs(offset) / cell));
  const dx = toCells(offsetX), dy = toCells(offsetY);
  if (drag.frame) cancelAnimationFrame(drag.frame);
  el.onpointermove = null;
  el.onpointerup = null;
  el.onpointercancel = null;
  el.onpointerdown = null;
  el.style.transform = `translate3d(${offsetX}px,${offsetY}px,0)`;
  drag = null;

  if (!dx && !dy) {render(); return;}
  const currentLevel = level;
  el.animate([
    {transform: `translate3d(${offsetX}px,${offsetY}px,0)`},
    {transform: `translate3d(${dx * cell}px,${dy * cell}px,0)`}
  ], {duration: 110, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards"}).finished
    .catch(() => { })
    .then(() => {
      if (level !== currentLevel || !el.isConnected) return;
      piece.x += dx;
      piece.y += dy;
      moves++;
      if (piece.id === "9" && piece.x === 1 && piece.y === 3) {
        loadLevel(level + 1);
      } else {
        render();
        saveGame();
      }
    });
}

status.onpointerdown = event => {
  event.preventDefault();
  event.stopPropagation();
  if (window.confirm("Do you want to reset?")) loadLevel(level);
};
document.body.onpointerdown = event => {
  event.preventDefault();
  event.stopPropagation();
};
new ResizeObserver(syncGridSize).observe(app);
syncGridSize();
if (!restoreGame()) loadLevel(0);
