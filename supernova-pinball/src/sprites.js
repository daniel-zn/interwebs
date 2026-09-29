// Pixel art painted from maths (shaded spheres, rings, tails) or strings of
// palette letters, rendered once into small canvases.

export const PAL = {
  k: '#12081f', w: '#ffffff', l: '#c9d3ff', g: '#8a93b8', d: '#4a4f7a', r: '#ff3b4e', o: '#a3122f',
  y: '#ffd23f', Y: '#fff3a8', n: '#ff9b2f', N: '#c4541b', b: '#3fa9ff', B: '#1c5bd9', c: '#7ff4ff',
  e: '#3de07a', E: '#178a4a', p: '#b35cff', P: '#5a1f9e', m: '#ff5ad1', M: '#a0237f', u: '#05030f',
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function fromRows(rows) {
  const c = canvas(rows[0].length, rows.length);
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      g.fillStyle = PAL[row[x]] || '#f0f';
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

function painted(w, h, fn, outline = 'k') {
  const px = [];
  for (let y = 0; y < h; y++) {
    px.push([]);
    for (let x = 0; x < w; x++) px[y].push(fn(x + 0.5, y + 0.5));
  }
  if (outline) {
    const out = px.map((r) => r.slice());
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[y][x]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => px[y + dy] && px[y + dy][x + dx] && px[y + dy][x + dx] !== outline)) out[y][x] = outline;
      }
    }
    return fromRows(out.map((r) => r.map((ch) => ch || '.').join('')));
  }
  return fromRows(px.map((r) => r.map((ch) => ch || '.').join('')));
}

const dither = (x, y) => ((Math.floor(x) + Math.floor(y)) & 1) === 0;

/** A shaded sphere; `cols` runs from highlight to shadow. */
function sphere(size, cols, band = null) {
  const c = size / 2;
  const r = size / 2 - 1;
  return painted(size, size, (x, y) => {
    const dx = x - c, dy = y - c;
    const d = Math.hypot(dx, dy);
    if (d > r) return null;
    if (band) {
      const b = band(dx, dy, r);
      if (b) return b;
    }
    const lit = (-dx * 0.7 - dy * 0.8) / r;
    if (lit > 0.75 && d < r * 0.5) return cols[0];
    if (lit > 0.25) return cols[1];
    if (lit > -0.25) return dither(x, y) ? cols[1] : cols[2];
    if (lit > -0.6) return cols[2];
    return cols[3];
  });
}

export const SPR = {};

export function buildSprites() {
  if (SPR.ready) return SPR;
  // The chrome ball, and a white-hot one for supernova.
  SPR.ball = sphere(8, ['w', 'l', 'g', 'd']);
  SPR.hotBall = sphere(8, ['w', 'Y', 'y', 'n']);
  // Planet caps for the three bumpers.
  SPR.planets = [
    sphere(18, ['Y', 'y', 'n', 'N'], (dx, dy) => (Math.abs(dy + dx * 0.3) < 1.2 ? 'N' : null)),
    sphere(18, ['w', 'c', 'b', 'B'], (dx, dy) => ((Math.floor((dy + 9) / 3) % 2) && Math.abs(dx) < 7 ? null : null)),
    sphere(18, ['w', 'm', 'M', 'P'], (dx, dy) => (Math.hypot(dx - 2, dy - 2) < 2.2 ? 'P' : Math.hypot(dx + 3, dy + 1) < 1.5 ? 'M' : null)),
  ];
  SPR.flashPlanet = sphere(18, ['w', 'w', 'Y', 'y']);
  SPR.comet = sphere(9, ['w', 'c', 'b', 'B']);
  SPR.ship = fromRows([
    '........kkkkkkkk........',
    '......kkcccccccckk......',
    '.....kcwcccccccccck.....',
    '...kkkkkkkkkkkkkkkkkk...',
    '.kkggllllllllllllllggkk.',
    'kgglyglllyglllyglllyglgk',
    'kddggggggggggggggggggddk',
    '.kkddddddddddddddddddkk.',
    '...kkkkmmkkkkkkmmkkkk...',
    '.......kkk....kkk.......',
  ]);
  SPR.ready = true;
  return SPR;
}
