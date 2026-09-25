// Tiny proportional 5x7 bitmap font. Each glyph is 7 rows of 5-bit ints
// (bit 4 = leftmost column). Rendered text is cached as small canvases.

const RAW = {
  A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  a: [0, 0, 14, 1, 15, 17, 15], b: [16, 16, 22, 25, 17, 17, 30], c: [0, 0, 14, 16, 16, 17, 14],
  d: [1, 1, 13, 19, 17, 17, 15], e: [0, 0, 14, 17, 31, 16, 14], f: [6, 9, 8, 28, 8, 8, 8],
  g: [0, 15, 17, 17, 15, 1, 14], h: [16, 16, 22, 25, 17, 17, 17], i: [4, 0, 12, 4, 4, 4, 14],
  j: [2, 0, 6, 2, 2, 18, 12], k: [16, 16, 18, 20, 24, 20, 18], l: [12, 4, 4, 4, 4, 4, 14],
  m: [0, 0, 26, 21, 21, 17, 17], n: [0, 0, 22, 25, 17, 17, 17], o: [0, 0, 14, 17, 17, 17, 14],
  p: [0, 0, 30, 17, 30, 16, 16], q: [0, 0, 13, 19, 15, 1, 1], r: [0, 0, 22, 25, 16, 16, 16],
  s: [0, 0, 14, 16, 14, 1, 30], t: [8, 8, 28, 8, 8, 9, 6], u: [0, 0, 17, 17, 17, 19, 13],
  v: [0, 0, 17, 17, 17, 10, 4], w: [0, 0, 17, 17, 21, 21, 10], x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 0, 17, 17, 15, 1, 14], z: [0, 0, 31, 2, 4, 8, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 2, 4, 0, 4], "'": [12, 4, 8, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0],
  ':': [0, 12, 12, 0, 12, 12, 0], '/': [0, 1, 2, 4, 8, 16, 0], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '+': [0, 4, 4, 31, 4, 4, 0], '%': [24, 25, 2, 4, 8, 19, 3],
  '*': [0, 4, 21, 14, 21, 4, 0], '·': [0, 0, 0, 4, 0, 0, 0], '&': [12, 18, 20, 8, 21, 18, 13],
  '#': [10, 10, 31, 10, 31, 10, 10], '"': [10, 10, 0, 0, 0, 0, 0],
};

export const FONT_H = 7;
export const LINE_H = 10;
const SPACE_W = 3;

const glyphs = new Map();
for (const [ch, rows] of Object.entries(RAW)) {
  let l = 5, r = -1;
  for (const row of rows) for (let c = 0; c < 5; c++) if (row & (16 >> c)) { l = Math.min(l, c); r = Math.max(r, c); }
  const px = [];
  rows.forEach((row, y) => { for (let c = l; c <= r; c++) if (row & (16 >> c)) px.push(c - l, y); });
  glyphs.set(ch, { w: r - l + 1, px });
}

export function measure(text) {
  let w = 0;
  for (const ch of text) {
    const g = glyphs.get(ch);
    w += (g ? g.w : SPACE_W) + 1;
  }
  return Math.max(0, w - 1);
}

/** Greedy word wrap to a pixel width. */
export function wrap(text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (measure(next) > maxW && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const cache = new Map();

function render(text, color, shadow) {
  const key = text + '\u0000' + color + '\u0000' + (shadow || '');
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 400) cache.clear();
  const w = measure(text) + 1, h = FONT_H + 1;
  c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = h;
  const g = c.getContext('2d');
  const pass = (col, ox, oy) => {
    g.fillStyle = col;
    let x = 0;
    for (const ch of text) {
      const gl = glyphs.get(ch);
      if (!gl) { x += SPACE_W + 1; continue; }
      for (let i = 0; i < gl.px.length; i += 2) g.fillRect(x + gl.px[i] + ox, gl.px[i + 1] + oy, 1, 1);
      x += gl.w + 1;
    }
  };
  if (shadow) pass(shadow, 1, 1);
  pass(color, 0, 0);
  cache.set(key, c);
  return c;
}

/**
 * Draw pixel text. align: 'left' | 'center' | 'right'. scale: integer.
 */
export function drawText(ctx, text, x, y, color, { shadow = '#0b0a1f', align = 'left', scale = 1 } = {}) {
  const img = render(text, color, shadow);
  const w = (img.width - 1) * scale;
  let dx = x;
  if (align === 'center') dx = x - Math.floor(w / 2);
  else if (align === 'right') dx = x - w;
  ctx.drawImage(img, Math.round(dx), Math.round(y), img.width * scale, img.height * scale);
  return w;
}
