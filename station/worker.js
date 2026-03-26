const SCALE = 3;
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;
const WIDTH = BASE_WIDTH * SCALE;
const HEIGHT = BASE_HEIGHT * SCALE;

const SIZE = 3 * SCALE;
const CHAR_GAP = 3 * SCALE;

const MAP = {
  'A': [
    [0, 1, 0],
    [1, 1, 1],
    [1, 0, 1]
  ],
  'B': [
    [1, 1, 0],
    [1, 1, 1],
    [1, 1, 1]
  ],
  'C': [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1]
  ],
  'D': [
    [1, 1, 0],
    [1, 0, 1],
    [1, 1, 0]
  ],
  'E': [
    [1, 1, 1],
    [1, 1, 0],
    [1, 1, 1]
  ],
  'F': [
    [1, 1, 1],
    [1, 1, 0],
    [1, 0, 0]
  ],
  'G': [
    [1, 1, 0],
    [1, 0, 1],
    [1, 1, 1]
  ],
  'H': [
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1]
  ],
  'I': [
    [1, 1, 1],
    [0, 1, 0],
    [1, 1, 1]
  ],
  'J': [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  'K': [
    [1, 0, 1],
    [1, 1, 0],
    [1, 0, 1]
  ],
  'L': [
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1]
  ],
  'M': [
    [1, 1, 1],
    [1, 1, 1],
    [1, 0, 1]
  ],
  'N': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1]
  ],
  'O': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  'P': [
    [1, 1, 1],
    [1, 1, 1],
    [1, 0, 0]
  ],
  'Q': [
    [1, 1, 1],
    [1, 1, 1],
    [0, 0, 1]
  ],
  'R': [
    [1, 1, 1],
    [1, 0, 0],
    [1, 0, 0]
  ],
  'S': [
    [0, 1, 1],
    [0, 1, 0],
    [1, 1, 0]
  ],
  'T': [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0]
  ],
  'U': [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  'V': [
    [1, 0, 1],
    [1, 0, 1],
    [0, 1, 0]
  ],
  'W': [
    [1, 0, 1],
    [1, 1, 1],
    [1, 1, 1]
  ],
  'X': [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1]
  ],
  'Y': [
    [1, 0, 1],
    [0, 1, 0],
    [0, 1, 0]
  ],
  'Z': [
    [1, 1, 1],
    [0, 1, 0],
    [1, 1, 1]
  ],
  '0': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  '1': [
    [1, 1, 0],
    [0, 1, 0],
    [1, 1, 1]
  ],
  '2': [
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 1]
  ],
  '3': [
    [1, 1, 1],
    [0, 1, 1],
    [1, 1, 1]
  ],
  '4': [
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1]
  ],
  '5': [
    [0, 1, 1],
    [0, 1, 0],
    [1, 1, 0]
  ],
  '6': [
    [1, 0, 0],
    [1, 1, 1],
    [1, 1, 1]
  ],
  '7': [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1]
  ],
  '8': [
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 1]
  ],
  '9': [
    [1, 1, 1],
    [1, 1, 1],
    [0, 0, 1]
  ],
  '.': [
    [0, 0, 0],
    [0, 0, 0],
    [1, 0, 0]
  ],
  ':': [
    [1, 0, 0],
    [0, 0, 0],
    [1, 0, 0]
  ],
  '-': [
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  '_': [
    [0, 0, 0],
    [0, 0, 0],
    [1, 1, 1]
  ],
  '=': [
    [1, 1, 1],
    [0, 0, 0],
    [1, 1, 1]
  ],
  "'": [
    [1, 0, 0],
    [1, 0, 0],
    [0, 0, 0]
  ],
  ' ': [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]
};

Object.keys(MAP).forEach(k => {if (k !== k.toLowerCase()) MAP[k.toLowerCase()] = MAP[k];});

function drawRect(buffer, x, y, w, h, color) {
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      if (y + i < HEIGHT && x + j < WIDTH) {
        buffer[(y + i) * WIDTH + (x + j)] = color;
      }
    }
  }
}

// Hàm tính chiều rộng của một chuỗi chữ
function getTextWidth(text) {
  let totalWidth = 0;
  for (let char of text) {
    const map = MAP[char] || MAP[' '];
    totalWidth += map[0].length * SIZE + CHAR_GAP;
  }
  return totalWidth - CHAR_GAP;
}

// Sửa lại hàm render hỗ trợ truyền startX từ bên ngoài
function renderText(buffer, text, yCenter, forcedStartX) {
  let currentX = forcedStartX;
  const yStart = Math.floor(yCenter * SCALE);

  for (let char of text) {
    const map = MAP[char] || MAP[' '];
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        if (map[r][c] === 1) {
          drawRect(buffer, currentX + c * SIZE, yStart + r * SIZE, SIZE, SIZE, 1);
        }
      }
    }
    currentX += map[0].length * SIZE + CHAR_GAP;
  }
}

function createBMP(width, height, pixels) {
  const rowSize = Math.floor((width + 31) / 32) * 4;
  const fileSize = 62 + (rowSize * height);
  const file = new Uint8Array(fileSize);
  file[0] = 0x42; file[1] = 0x4D; // BM
  file[2] = fileSize & 255; file[3] = (fileSize >> 8) & 255; file[4] = (fileSize >> 16) & 255; file[5] = (fileSize >> 24) & 255;
  file[10] = 62;
  file[14] = 40;
  file[18] = width & 255; file[19] = (width >> 8) & 255; file[20] = (width >> 16) & 255; file[21] = (width >> 24) & 255;
  file[22] = height & 255; file[23] = (height >> 8) & 255; file[24] = (height >> 16) & 255; file[25] = (height >> 24) & 255;
  file[26] = 1; file[28] = 1;
  file[34] = rowSize * height;
  file[54] = 0; file[55] = 0; file[56] = 0; file[57] = 0;
  file[58] = 144; file[59] = 175; file[60] = 197; file[61] = 0;
  for (let y = 0; y < height; y++) {
    let rowPos = 62 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] === 1) file[rowPos + (x >> 3)] |= (0x80 >> (x & 7));
    }
  }
  return file;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathMatch = url.pathname.match(/^\/weather\/([\d\.-]+)\/([\d\.-]+)(\/8x|\.png|\.bmp)?$/);
    if (!pathMatch) return new Response('V41 BMP Engine Active.');

    const lat = pathMatch[1], lon = pathMatch[2];
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&current=relative_humidity_2m,weather_code&timezone=auto`)).json();

    const l1 = `=UN ${Math.round(w.daily.temperature_2m_max[0])}'NIG ${Math.round(w.daily.temperature_2m_min[0])}'`;
    const l2 = `HUM ${Math.round(w.current.relative_humidity_2m)}'${w.current.weather_code >= 51 ? "RAINY_" : (w.current.weather_code >= 1 && w.current.weather_code <= 3 ? "CLOUDY_" : "SUNNY_")}`;

    const maxW_1x = Math.max(getTextWidth(l1), getTextWidth(l2)) / SCALE;
    const startX_1x = Math.ceil((390 - maxW_1x) / 2);
    const startX = startX_1x * SCALE;

    const buffer = new Uint8Array(WIDTH * HEIGHT);

    renderText(buffer, l1, 390, startX);
    renderText(buffer, l2, 408, startX);

    const bmp = createBMP(WIDTH, HEIGHT, buffer);
    return new Response(bmp, {headers: {"Content-Type": "image/bmp", "Cache-Control": "public, max-age=3600"}});
  }
};
