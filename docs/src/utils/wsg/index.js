"use strict";

const LEVELS = [
  "49954995688760172xx3", "49954995088162376xx7", "x99x4995467506718823", "49954995012368876xx7",
  "09914995488562376xx7", "49904991588657x627x3", "0991299345674567x88x", "0991499546752673x88x",
  "4990499156725673x88x", "4990499158865276x37x", "4990499158825673x67x", "09912993x88x45674567",
  "49904991772358865xx6", "4995499506x126x37788", "0991499546x526x37788", "49904991577658862xx3",
  "49954995778806x126x3", "4995499506612773x88x", "0991499546652773x88x", "0994199456625773x88x",
  "0991299345664577x88x", "49954995667708812xx3", "49954995066177882xx3", "49904991556677882xx3",
  "099129934x554x667788", "4990499125536677x88x", "0991299344556677x88x", "40154995299678867xx3",
  "0199449955667788xx23", "0991299348854675x67x", "66774995499508812xx3", "9977994056415623x88x",
  "0456145677238899xx99", "49954995670867182xx3", "49954995667708812xx3", "5599669977880x142x34",
  "99049914556677882xx3", "994599458801672367xx", "99669977458845012xx3", "012499549956x776x388"
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

const THEMES = [
  {
    boardBorder: "#2f323e",
    regularPiece: "#2f323e",
    soldier: "#4d5964",
    liuBei: "#748380",
    caoCao: "#b8c7bf",
    pieceText: "#b8c7bf",
    caoCaoText: "#2f323e"
  }
];

const CELL_SIZE = 66;

const app = document.querySelector(".app");
const board = app.querySelector(".board");
const HIT_SLOP = 16;
const status = app.querySelector(".status");
const undoButton = status.querySelector(".undo");
const levelText = status.querySelector(".level");
const STORAGE_KEY = "klotski-game-v2";
let level = 0, moves = 0, pieces = [], moveHistory = [], drag = null, themeIndex = -1;

function applyTheme(index) {
  themeIndex = index;
  const theme = THEMES[index];
  for (const [name, color] of Object.entries(theme)) {
    app.style.setProperty(`--theme-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, color);
  }
}

function randomizeTheme() {
  let next = Math.floor(Math.random() * THEMES.length);
  if (THEMES.length > 1 && next === themeIndex) {
    next = (next + 1 + Math.floor(Math.random() * (THEMES.length - 1))) % THEMES.length;
  }
  applyTheme(next);
}

function saveGame() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({level, moves, pieces, moveHistory, themeIndex}));
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
    moveHistory = Array.isArray(saved.moveHistory)
      ? saved.moveHistory.map(({moves: savedMoves, pieces: savedPieces}) => ({
        moves: Number.isInteger(savedMoves) ? savedMoves : 0,
        pieces: Array.isArray(savedPieces)
          ? savedPieces.map(({id, x, y, w, h}) => ({id: String(id), x, y, w, h}))
          : []
      })).filter(snapshot => snapshot.pieces.length)
      : [];
    if (Number.isInteger(saved.themeIndex) && THEMES[saved.themeIndex]) {
      applyTheme(saved.themeIndex);
    } else {
      randomizeTheme();
    }
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
  const nextLevel = (index + LEVELS.length) % LEVELS.length;
  if (themeIndex < 0 || nextLevel !== level) randomizeTheme();
  level = nextLevel;
  moves = 0;
  moveHistory = [];
  const cells = [...LEVELS[level]];
  pieces = [...new Set(cells.filter(value => value !== "x"))].map(id => {
    const indexes = cells.flatMap((value, i) => value === id ? [i] : []);
    const xs = indexes.map(i => i % 4), ys = indexes.map(i => Math.floor(i / 4));
    return {id, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1};
  });
  const liuBei = pieces.find(piece => piece.id === "4");
  const horizontalGeneral = pieces.find(piece => piece.id >= "4" && piece.id <= "8" && piece.w === 2);
  if (liuBei && horizontalGeneral && horizontalGeneral !== liuBei) {
    [liuBei.id, horizontalGeneral.id] = [horizontalGeneral.id, liuBei.id];
  }
  render();
  saveGame();
}

function render() {
  undoButton.textContent = `${String(moves).padStart(4, "0")}_`;
  levelText.textContent = `M${String(level + 1).padStart(2, "0")}`;
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
      moveHistory.push({
        moves,
        pieces: pieces.map(currentPiece => ({...currentPiece}))
      });
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

function resetLevel(event) {
  event.preventDefault();
  event.stopPropagation();
  if (window.confirm("Do you want to reset?")) loadLevel(level);
}

levelText.onpointerdown = resetLevel;
undoButton.onpointerdown = event => {
  event.preventDefault();
  event.stopPropagation();
  if (drag || moveHistory.length === 0) return;
  const snapshot = moveHistory.pop();
  moves = snapshot.moves;
  pieces = snapshot.pieces.map(piece => ({...piece}));
  render();
  saveGame();
};
document.body.onpointerdown = event => {
  event.preventDefault();
  event.stopPropagation();
};
new ResizeObserver(syncGridSize).observe(app);
syncGridSize();
if (!restoreGame()) loadLevel(0);
