// Hand-authored pixel grids. One character per pixel; '.' is transparent.
const PAL = {
  k: '#07081a', w: '#eef1f6', g: '#aeb8e2', d: '#3b3f6b', v: '#f3c252', V: '#fff6c0', o: '#c77d2a',
  r: '#ff6b4a', R: '#b8323a', s: '#d7dbe8', S: '#8890a8', G: '#4fb86a', W: '#f4f0e0', b: '#6e6286',
  m: '#8a7766', M: '#c9b49a', n: '#4a3e3a', c: '#3f6fd0', C: '#9fe6ff', y: '#ffe08a', B: '#2f8fd8',
  p: '#ff5a8a', u: '#1f5fa8',
};

// The astronaut, reclined in a webbed lawn chair and facing the kite (right).
// Arms and the beer are drawn separately so they can move.
const LOUNGER = [
  '.kkk..........................',
  'kGWGk.........................',
  'kWGWk..kkkk...................',
  'kGWGk.kwwwwk..................',
  '.kWGWkwwvvvvk.................',
  '.kGWkwwvVVvvk.................',
  '.kWGkwwvVvvvok................',
  '..kGkwwvvvvook................',
  '..kWkkwwvvoowk................',
  '..kGWkkwwwwwkk................',
  '...kGkwwwwwwwk................',
  '...kWkgwwrrwwwk...............',
  '...kGkggwwwwwwwkkkkkkk........',
  '....kkgggwwwwwwwwwwwwwk.......',
  '....ksskkkggggwwwwwwwwwk......',
  '....kGWGWGWGWGWGkkkkggwk......',
  '....ksssssssssssssssk.kwwk....',
  '.....kSk.........kSk..kwwk....',
  '.....kSk........kSk...kgwk....',
  '......kSk......kSk....kwwk....',
  '......kSk.....kSk....kkbbkkk..',
  '.......kSk...kSk.....kbbbbbbk.',
  '.......kSk..kSk......kbbbbbbk.',
  '......kkkk.kkkk......kkkkkkkk.',
];
// Where things attach, in LOUNGER pixels.
export const RIG = { w: 30, h: 24, shoulder: [11, 10], hip: [10, 13], visor: [11, 6], beerRest: [16, 10] };

const CAN = [
  'kkkk',
  'kssk',
  'krrk',
  'kwrk',
  'krrk',
  'kkkk',
];

const COOLER = [
  '..kkkkkkkk..',
  '..k......k..',
  'kkkkkkkkkkkk',
  'kwwwwwwwwwwk',
  'kBBBBBBBBBBk',
  'kBBwwBBBBBBk',
  'kBBBBBBBBBBk',
  'kuuuuuuuuuuk',
  'kkkkkkkkkkkk',
];

const RADIO = [
  '.....k',
  '.....k',
  '....k.',
  'kkkkkkk',
  'kddddrk',
  'kdSSdyk',
  'kdSSddk',
  'kkkkkkk',
];

// The parasol leans towards the sun, which is on the left.
const PARASOL = [
  '.......kkkkkkk......',
  '.....kkrrWWrrWkk....',
  '....krrWWrrWWrrWk...',
  '...krWWrrWWrrWWrrk..',
  '..krrWWrrWWrrWWrrWk.',
  '..kkkkkkkkkkkkkkkkkk',
  '...........kSk......',
  '...........kSk......',
  '............kSk.....',
  '............kSk.....',
  '............kSk.....',
  '.............kSk....',
  '.............kSk....',
  '.............kSk....',
  '..............kSk...',
  '..............kSk...',
  '..............kSk...',
  '..............kSk...',
  '...............kSk..',
  '...............kSk..',
  '...............kSk..',
  '...............kSk..',
  '...............kSk..',
  '...............kSk..',
  '...............kSk..',
  '...............kkk..',
];

export const ROCK = [
  '..kkkkk..',
  '.kMMmmmk.',
  'kMMMmmnmk',
  'kMMmmmmnk',
  'kMmmnmnnk',
  'kmmmmnnnk',
  '.kmmnnnk.',
  '..kkkkk..',
];

export const SAT = [
  '......k......',
  '......y......',
  'kkkkk.k.kkkkk',
  'kcCcCkvkcCcCk',
  'kCcCckvvkCcCk',
  'kcCcCkvkcCcCk',
  'kkkkk.k.kkkkk',
];

export const ICE = [
  '.kkkk..',
  'kwCCCk.',
  'kwwCCCk',
  'kCCCcck',
  '.kcccck',
  '..kkkk.',
];

function toCanvas(grid, pal = PAL) {
  const c = document.createElement('canvas');
  c.width = grid[0].length;
  c.height = grid.length;
  const x = c.getContext('2d');
  grid.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      x.fillStyle = pal[ch] || '#ff00ff';
      x.fillRect(i, j, 1, 1);
    }
  });
  return c;
}

/** A dark silhouette of a sprite, for ground shadows. */
function silhouette(src, color) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

// The stunt kite, pre-rasterised at KITE_STEPS headings so it stays crisp.
export const KITE_STEPS = 64;
const KITE_SIZE = 19;
function kiteFrames(left, right) {
  const frames = [];
  const h = (KITE_SIZE - 1) / 2;
  // Local shape, nose along +x: nose, wingtips, and the notch at the back.
  const N = [6.5, 0], L = [-4, -6.5], R = [-4, 6.5], T = [-1.5, 0];
  const inTri = (px, py, a, b, c) => {
    const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
    const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
    const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  for (let f = 0; f < KITE_STEPS; f++) {
    const th = (f / KITE_STEPS) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
    const grid = [];
    for (let j = 0; j < KITE_SIZE; j++) {
      const row = [];
      for (let i = 0; i < KITE_SIZE; i++) {
        const wx = i - h, wy = -(j - h);
        const lx = wx * co + wy * si, ly = -wx * si + wy * co;
        let ch = '.';
        if (Math.abs(ly) < 0.55 && lx > -2 && lx < 6.4) ch = 'k';
        else if (inTri(lx, ly, N, T, R)) ch = 'a';
        else if (inTri(lx, ly, N, L, T)) ch = 'b';
        row.push(ch);
      }
      grid.push(row);
    }
    // Outline every empty pixel that touches the sail.
    const out = grid.map((row) => row.slice());
    for (let j = 0; j < KITE_SIZE; j++) {
      for (let i = 0; i < KITE_SIZE; i++) {
        if (grid[j][i] !== '.') continue;
        const n = (a, b) => grid[b] && grid[b][a] && grid[b][a] !== '.';
        if (n(i - 1, j) || n(i + 1, j) || n(i, j - 1) || n(i, j + 1)) out[j][i] = 'k';
      }
    }
    frames.push(toCanvas(out.map((r) => r.join('')), { ...PAL, a: left, b: right }));
  }
  return frames;
}

export function buildSprites() {
  const lounger = toCanvas(LOUNGER);
  const parasol = toCanvas(PARASOL);
  const cooler = toCanvas(COOLER);
  return {
    lounger, parasol, cooler, radio: toCanvas(RADIO), can: toCanvas(CAN),
    shadows: { lounger: silhouette(lounger, '#000'), parasol: silhouette(parasol, '#000'), cooler: silhouette(cooler, '#000') },
    rock: toCanvas(ROCK), sat: toCanvas(SAT), ice: toCanvas(ICE),
    kite: kiteFrames('#ffd23f', '#ff5a8a'),
    kiteHalf: (KITE_SIZE - 1) / 2,
  };
}
