// Pixel art: the reel symbols, charm icons, coins and tickets. Some sprites
// are strings of palette letters, the round ones are painted from maths
// (shaded spheres, rings, tails) and outlined automatically. Everything is
// rendered once into small canvases.

export const PAL = {
  k: '#1a0f2e', w: '#ffffff', l: '#c9d3ff', g: '#8a93b8', d: '#4a4f7a', r: '#ff3b4e', o: '#a3122f',
  y: '#ffd23f', Y: '#fff3a8', n: '#ff9b2f', N: '#c4541b', b: '#3fa9ff', B: '#1c5bd9', c: '#7ff4ff',
  e: '#3de07a', E: '#178a4a', f: '#b6ffc4', p: '#b35cff', P: '#5a1f9e', m: '#ff5ad1', M: '#a0237f',
  u: '#0a0514', t: '#8a4b2a', s: '#ffb3c7',
};

const STR = {
  seven: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kYYYYYYYYYYYYk.',
    '.kyrrrrrrrrrrok.',
    '.kyrrrrrrrrrrok.',
    '.kkkkkkkkyrrrok.',
    '........kyrrok..',
    '.......kyrrrok..',
    '.......kyrrok...',
    '......kyrrrok...',
    '......kyrrok....',
    '.....kyrrrok....',
    '.....kyrrrok....',
    '.....kyrrrok....',
    '.....kkkkkkk....',
    '................',
  ],
  rocket: [
    '.......kk.......',
    '......kwlk......',
    '.....kwwwlk.....',
    '.....kwwwlk.....',
    '....kwwwwwlk....',
    '....kwwkkwlk....',
    '....kwkcbklk....',
    '....kwkbBklk....',
    '....kwwkkwlk....',
    '...kkwwwwwlkk...',
    '..krkwwwwwlkrk..',
    '..krrkggggkrrk..',
    '..kkkkkkkkkkkk..',
    '......kYnk......',
    '.......yn.......',
    '.......n........',
  ],
  alien: [
    '................',
    '.....kkkkkk.....',
    '...kkeeeeeekk...',
    '..keeeeeeeffek..',
    '.keeeeeeeeeefek.',
    '.keeeeeeeeeeeek.',
    '.keuuueeeeuuuek.',
    '.kuuuuueeuuuuuk.',
    '.kuwuuueeuuuwuk.',
    '.keuuuueeuuuuek.',
    '..keuuueeuuuek..',
    '..keeeeeeeeeek..',
    '...keeeEEeeek...',
    '....keeeeeek....',
    '.....kkkkkk.....',
    '................',
  ],
  gem: [
    '................',
    '................',
    '....kkkkkkkk....',
    '...kcwwcccwck...',
    '..kcwwccccbwck..',
    '.kbbbbbbbbbbbbk.',
    '.kcwcccbbbccBck.',
    '..kcwccbbbcBck..',
    '...kcwcbbbBck...',
    '....kcwbbBck....',
    '.....kcbBck.....',
    '......kcBk......',
    '.......kk.......',
    '................',
    '................',
    '................',
  ],
};

// 12 x 12 charm icons.
const ICONS = {
  tip_jar: [
    '...kkkkkk...',
    '...kggggk...',
    '..kkkkkkkk..',
    '.kcwccccccK.',
    '.kcwcyyyccK.',
    '.kcwyYyyyck.',
    '.kcwyyyyyck.',
    '.kcccyyyccck',
    '.kccccccccck',
    '.kbccccccbck',
    '..kkkkkkkk..',
    '............',
  ],
  horseshoe: [
    '............',
    '..kkk..kkk..',
    '.krrk..krrk.',
    '.krrk..krrk.',
    '.kwwk..kwwk.',
    '.krrk..krrk.',
    '.krrkkkkrrk.',
    '.krrrrrrrrk.',
    '..krrrrrrk..',
    '...kkkkkk...',
    '............',
    '............',
  ],
  printer: [
    '............',
    '..kkkkkkkk..',
    '..kmmmmmmk..',
    '..kmskkmmk..',
    '..kmmmmmmk..',
    'kkkkkkkkkkkk',
    'kggggggggyyk',
    'kgddddddddgk',
    'kggggggggggk',
    'kkkkkkkkkkkk',
    '............',
    '............',
  ],
  void_ward: [
    '.kkkkkkkkkk.',
    '.kccccccwck.',
    '.kcbbbbbbck.',
    '.kcbmmmmbck.',
    '.kcbmuumbck.',
    '.kcbmuumbck.',
    '.kcbbmmbbck.',
    '..kcbbbbck..',
    '..kcbbbbck..',
    '...kcbbck...',
    '....kcck....',
    '.....kk.....',
  ],
  spare_slot: [
    '............',
    '.kkkkkkkkkk.',
    '.kggggggggk.',
    '.kgkkkkkkgk.',
    '.kgggggggek.',
    '.kddddddeeek',
    '.kdddddddedk',
    '.kkkkkkkkekk',
    '..kyyyk.....',
    '.kyYyyyk....',
    '.kyyyyyk....',
    '..kkkkk.....',
  ],
  echo: [
    '............',
    '...k...k....',
    '..kc..kc..c.',
    '.kc..kc..c..',
    '.kc.kcc.c...',
    '.kc.kcc.c...',
    '.kc.kcc.c...',
    '.kc..kc..c..',
    '..kc..kc..c.',
    '...k...k....',
    '............',
    '............',
  ],
  wormhole: [
    '...pppppp...',
    '..p......p..',
    '.p..mmmm..p.',
    'p..m....m..p',
    'p.m..cc..m.p',
    'p.m.cwwc.m.p',
    'p.m.cw.c.m.p',
    'p.m..c..m..p',
    '.p..m..mm.p.',
    '..p..mm..p..',
    '...p....p...',
    '....pppp....',
  ],
  finale: [
    '.....y......',
    '..y..y..y...',
    '...y.y.y....',
    '....yYy.....',
    'yyyyYwYyyyy.',
    '....yYy.....',
    '...y.y.y....',
    '..y..y..y.m.',
    '.....y...mwm',
    '..c.......m.',
    '.cwc........',
    '..c.........',
  ],
  piggy: [
    '............',
    '...ks..sk...',
    '..kssssssk..',
    '.ksskssksssk',
    '.kssssssssmk',
    'kssssssssmmk',
    'kssssssssssk',
    '.kssssssssk.',
    '.kssssssssk.',
    '..ksk..ksk..',
    '..kkk..kkk..',
    '............',
  ],
  streak: [
    '.....r......',
    '....rr......',
    '....rnr.....',
    '...rnnr..r..',
    '..rnnynr.rr.',
    '..rnyYynrnr.',
    '.rnyYYYynnr.',
    '.rnyYwYynnr.',
    '.rnyYYYyynr.',
    '..rnyyyyynr.',
    '...rnnnnnr..',
    '....rrrrr...',
  ],
  dark_matter: [
    '..m.......p.',
    '....kkkk....',
    '..kkPPPPkk..',
    '.kPPPpPPPPk.',
    '.kPPpmpPPPk.',
    'kPPPPpPPPPPk',
    'kPPPPPPPPPPk',
    '.kPPPPPPpPk.',
    '.kuPPPPPPuk.',
    'm.kkuuuukk..',
    '....kkkk..p.',
    '.p..........',
  ],
  supernova: [
    '.....w......',
    '..n..w..n...',
    '...n.y.n....',
    '....yYy.....',
    '.n.yYwYy.n..',
    'wwyYwwwYyww.',
    '.n.yYwYy.n..',
    '....yYy.....',
    '...n.y.n....',
    '..n..w..n...',
    '.....w......',
    '............',
  ],
  event_horizon: [
    '............',
    '....nnnn....',
    '..nnyyyynn..',
    '.nyyuuuuyyn.',
    'nyYuuuuuuYyn',
    'nyuuuuuuuuyn',
    'nyuuuuuuuuyn',
    'nyYuuuuuuYyn',
    '.nyyuuuuyyn.',
    '..nnyyyynn..',
    '....nnnn....',
    '............',
  ],
  double_down: [
    '............',
    '............',
    '.....kkkkkk.',
    'kk.kkkyyyyk.',
    'kykykkkkkyk.',
    '.kyk.kyyyyk.',
    'kykykkykkkk.',
    'kk.kkkyyyyk.',
    '.....kkkkkk.',
    '............',
    '............',
    '............',
  ],
  collector: [
    '....kkkk....',
    '...kttttk...',
    '..kkkkkkkk..',
    '.kgtdtggtdk.',
    '.ktttttttttk',
    'kttttyytttk.',
    'kttttyytttk.',
    'ktttttttttk.',
    'ktttttttttk.',
    '.ktttttttk..',
    '..kkkkkkk...',
    '............',
  ],
};

// Mini 5 x 3 grids for the pattern charms.
const GRID_ICONS = {
  horizon: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
  elevator: [[2, 0], [2, 1], [2, 2]],
  lens: [[1, 0], [2, 1], [3, 2]],
  geometry: [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]],
};
// Charms that show a reel symbol with a badge.
const SYMBOL_CHARMS = {
  comet_tail: ['comet', 'X2'], moon_boots: ['moon', 'X2'], ring_polish: ['planet', 'X2'],
  booster: ['rocket', 'X2'], star_chart: ['seven', 'X2'], wild_alien: ['alien', 'W'],
};

// ---------------------------------------------------------------- painting
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function fromStrings(rows) {
  const h = rows.length, w = rows[0].length;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      g.fillStyle = PAL[ch === 'K' ? 'k' : ch] || '#f0f';
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** Paints fn(x, y) -> palette letter or null into a grid, adds an outline. */
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
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => px[y + dy] && px[y + dy][x + dx] && px[y + dy][x + dx] !== outline);
        if (n) out[y][x] = outline;
      }
    }
    return fromStrings(out.map((r) => r.map((ch) => ch || '.').join('')));
  }
  return fromStrings(px.map((r) => r.map((ch) => ch || '.').join('')));
}

const dither = (x, y) => ((Math.floor(x) + Math.floor(y)) & 1) === 0;

function moon() {
  const craters = [[5.5, 6, 1.8], [10, 9.5, 1.5], [6.5, 11, 1.1], [10, 5, 0.9]];
  return painted(16, 16, (x, y) => {
    const dx = x - 8, dy = y - 8;
    if (dx * dx + dy * dy > 6.4 * 6.4) return null;
    const lit = (-dx - dy) / 9;
    for (const [cx, cy, r] of craters) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r) return d < r - 0.7 || y > cy ? 'g' : 'd';
    }
    if (lit > 0.45) return 'w';
    if (lit > -0.1) return 'l';
    if (lit > -0.35) return dither(x, y) ? 'l' : 'g';
    return 'g';
  });
}

function planet() {
  return painted(16, 16, (x, y) => {
    const dx = x - 8, dy = y - 8;
    // Tilted ring.
    const rx = dx * 0.95 + dy * 0.3, ry = -dx * 0.3 + dy * 0.95;
    const e = (rx / 7.6) ** 2 + (ry / 2.3) ** 2;
    const ring = e > 0.62 && e < 1;
    const inBall = dx * dx + dy * dy < 5.2 * 5.2;
    if (ring && (ry > 0 || !inBall)) return e > 0.8 ? 'y' : 'n';
    if (inBall) {
      const lit = (-dx - dy) / 7;
      const band = Math.floor((ry + 8) / 2) % 2;
      if (lit > 0.45) return 'Y';
      if (lit < -0.35) return 'N';
      return band ? 'n' : 'y';
    }
    return null;
  });
}

function comet() {
  const hx = 10.5, hy = 10.5;
  return painted(16, 16, (x, y) => {
    const dx = x - hx, dy = y - hy;
    const d = Math.hypot(dx, dy);
    if (d < 3.7) {
      const lit = (-dx - dy) / 4;
      return lit > 0.3 ? 'w' : lit > -0.3 ? 'c' : 'b';
    }
    // Tail streams up and to the left.
    const along = -(dx + dy) / Math.SQRT2;
    const across = Math.abs(dx - dy) / Math.SQRT2;
    if (along > 0 && along < 12.5) {
      const width = 3.6 - along * 0.24;
      if (across < width) {
        const t = along / 12.5;
        if (t > 0.55 && !dither(x, y)) return null;
        if (across > width - 1) return t < 0.5 ? 'b' : 'B';
        return t < 0.35 ? 'c' : t < 0.7 ? 'b' : 'B';
      }
    }
    return null;
  }, null);
}

function voidEye() {
  return painted(16, 16, (x, y) => {
    const dx = x - 8, dy = y - 8;
    const lid = 5.4 * (1 - (dx / 7.6) ** 2);
    if (Math.abs(dy) > lid) return null;
    const d = Math.hypot(dx, dy);
    if (d < 1.1 && dx > -0.5 && dx < 0.8 && dy < -1) return 'w';
    if (Math.abs(dx) < 0.9 && Math.abs(dy) < 3.4) return 'u';
    if (d < 4.2) return d > 3.3 ? 'M' : 'm';
    if (Math.abs(dy) > lid - 1.1) return 'p';
    return 'P';
  }, 'u');
}

function badge(g, text, x, y, bg) {
  const w = text.length * 4 + 1;
  g.fillStyle = PAL.k;
  g.fillRect(x - 1, y - 1, w + 1, 7);
  // 3 x 5 digits and letters.
  const F = { X: '101 101 010 101 101', 2: '111 001 111 100 111', W: '101 101 101 111 101', '+': '000 010 111 010 000' };
  g.fillStyle = bg;
  for (let i = 0; i < text.length; i++) {
    const rows = F[text[i]].split(' ');
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (rows[r][c] === '1') g.fillRect(x + 1 + i * 4 + c, y + r, 1, 1);
  }
}

// ---------------------------------------------------------------- the atlas
export const SPR = {};

export function buildSprites() {
  if (SPR.ready) return SPR;
  SPR.sym = {
    comet: comet(), moon: moon(), planet: planet(), void: voidEye(),
    rocket: fromStrings(STR.rocket), alien: fromStrings(STR.alien), gem: fromStrings(STR.gem), seven: fromStrings(STR.seven),
  };
  // A white silhouette of each symbol, for flashes.
  SPR.flash = {};
  for (const [id, c] of Object.entries(SPR.sym)) {
    const f = canvas(16, 16);
    const g = f.getContext('2d');
    g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 16, 16);
    SPR.flash[id] = f;
  }
  SPR.charm = {};
  for (const [id, rows] of Object.entries(ICONS)) {
    const c = canvas(16, 16);
    c.getContext('2d').drawImage(fromStrings(rows), 2, 2);
    SPR.charm[id] = c;
  }
  for (const [id, cells] of Object.entries(GRID_ICONS)) {
    const c = canvas(16, 16);
    const g = c.getContext('2d');
    g.fillStyle = PAL.k;
    g.fillRect(0, 3, 16, 11);
    for (let r = 0; r < 3; r++) {
      for (let col = 0; col < 5; col++) {
        const lit = cells.some(([a, b]) => a === col && b === r);
        g.fillStyle = lit ? PAL.y : PAL.d;
        g.fillRect(1 + col * 3, 4 + r * 3, 2, 2);
      }
    }
    SPR.charm[id] = c;
  }
  for (const [id, [sym, text]] of Object.entries(SYMBOL_CHARMS)) {
    const c = canvas(16, 16);
    const g = c.getContext('2d');
    g.drawImage(SPR.sym[sym], 0, 0);
    badge(g, text, 15 - text.length * 4, 10, text === 'W' ? PAL.e : PAL.y);
    SPR.charm[id] = c;
  }
  // Coins: 4 frames of a spinning coin, 7 px tall.
  SPR.coin = [7, 5, 3, 5].map((w, i) => {
    const c = canvas(7, 7);
    const g = c.getContext('2d');
    const x0 = (7 - w) >> 1;
    g.fillStyle = PAL.N;
    g.fillRect(x0, 1, w, 5);
    g.fillRect(x0 + 1, 0, Math.max(1, w - 2), 7);
    g.fillStyle = i === 2 ? PAL.n : PAL.y;
    if (w > 2) {
      g.fillRect(x0 + 1, 1, w - 2, 5);
      g.fillStyle = PAL.Y;
      g.fillRect(x0 + 1, 1, 1, 2);
    }
    return c;
  });
  SPR.ticket = fromStrings([
    'kkkkkkkkk',
    'kmmmsmmmk',
    'kmskmmmmk',
    '.mmmmmmm.',
    'kmmmmkmmk',
    'kmmmsmmmk',
    'kkkkkkkkk',
  ]);
  SPR.ready = true;
  return SPR;
}
