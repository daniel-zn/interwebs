// Palette + pixel-art sprites. Sprites are character grids; '.' is transparent.
// Every sprite gets an automatic 1px dark outline so fills can be drawn loosely.

export const C = {
  void: '#0b0a1f', ink: '#1a1430',
  neb1: '#131131', neb2: '#1c1945', neb3: '#29225c', neb4: '#3f2a70', neb5: '#5b3580',
  star: '#ffffff', starB: '#cfe3ff', starY: '#ffe7a8', starD: '#7d86c9', starM: '#4a4f8f',
  rock0: '#231f33', rock1: '#3a3450', rock2: '#57506e', rock3: '#7c7394', rock4: '#a39cb8',
  moss0: '#24574f', moss1: '#3f8a6c', moss2: '#79c98f', moss3: '#c3f0a4',
  water0: '#0a2240', water1: '#103a5e', water2: '#185681', water3: '#2780a9', water4: '#5cc2d6', water5: '#bff4f0',
  wood0: '#3d2621', wood1: '#6b4430', wood2: '#8f5d3c', wood3: '#b9814f',
  suit: '#eef1f6', suitS: '#b4bccb', suitD: '#7c8499', visor: '#1b2240', visorL: '#6fd3ff',
  orange: '#ff9f43', lamp: '#ffd27a', lampW: '#fff4c9', red: '#e8495a', redD: '#a3263f',
  pink: '#ff8fb8', purple: '#a45cd6', teal: '#4fe0c0', crystal: '#8ff6ff',
};

function build(rows, pal, { outline = C.ink } = {}) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const W = w + 2, H = h + 2;
  const cells = new Array(W * H).fill(null);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== '.' && ch !== ' ') cells[(y + 1) * W + x + 1] = ch === 'k' ? C.ink : pal[ch] || '#f0f';
    }
  });
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (outline) {
    g.fillStyle = outline;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (cells[y * W + x]) continue;
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && cells[yy * W + xx];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) g.fillRect(x, y, 1, 1);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const col = cells[y * W + x];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return c;
}

/** Solid-colour copy of a sprite (used for silhouettes of unknown catches). */
export function silhouette(src, color) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---------------------------------------------------------------- astronaut
const ASTRO_PAL = { w: C.suit, s: C.suitS, d: C.suitD, v: C.visor, r: C.visorL, o: C.orange, p: C.suitD, g: C.suitS, b: C.rock2 };
const ASTRO = [
  '....wwwww......',
  '..wwwwwwwww....',
  '.wwwwwwwwwww...',
  '.swwwwvvvvvvw..',
  'psswwvvrrvvvvw.',
  'psswwvvvrvvvvw.',
  'psswwvvvvvvvvw.',
  'pssswwvvvvvvw..',
  'psssswwwwwww...',
  'pp.ssssssss....',
  'ppswwwowwww....',
  'ppswwwwwwwws...',
  'ppswwwwwssww...',
  'ppsswwwskwwwwgg',
  'pppssssssssssgg',
  '..swwwwwwwwwwww',
  '..ssssssssssssw',
  '...........sws.',
  '...........sws.',
  '..........bbbbb',
  '..........bbbbb',
];
// Rod hand position inside the (outlined) sprite.
export const ASTRO_HAND = { x: 14, y: 14 };
export const ASTRO_SEAT = 17; // row (outlined coords) that rests on the dock

// ---------------------------------------------------------------- fish
const FISH = {
  minnow: {
    pal: { a: C.starY, c: '#fff8dc', t: '#e0b060', w: C.star },
    rows: [
      '....aaaa..',
      't.aawaaaa.',
      'ttaaaaaaka',
      't.ccccccc.',
      '....ccc...',
    ],
  },
  perch: {
    pal: { a: '#9fa6d6', b: '#6f75ad', c: '#dfe3ff', d: '#5a5f96', t: '#6f75ad' },
    rows: [
      '.....aaaa...',
      '..t.aaadaaa.',
      'ttaaadaaaaaa',
      'ttaaaaaaaaka',
      'ttbaaaadaaaa',
      '..t.cccccca.',
      '.....cccc...',
    ],
  },
  guppy: {
    pal: { a: '#ffb3e0', c: '#fff0fa', t: C.purple, u: C.pink },
    rows: [
      'tt.........',
      'uut...aaa..',
      'tttu.aaaaa.',
      'uuutaaaaaka',
      'tttu.acccc.',
      'uut...ccc..',
      'tt.........',
    ],
  },
  koi: {
    pal: { a: '#fffaf0', o: C.orange, c: '#ffe6cf', z: C.lamp, y: C.lampW },
    rows: [
      '.........aaaaa..',
      'zy...aaoooaaaaa.',
      'yyzzaaaaaaoaaaka',
      'zy...acccccccca.',
      '.........cccc...',
    ],
  },
  jelly: {
    pal: { a: '#d9c8ff', b: '#a996e8', c: C.star, t: '#bca9f5' },
    rows: [
      '..aaaaa..',
      '.acaaaaa.',
      'aacaaaaaa',
      'aaaaaaaaa',
      'bbbbbbbbb',
      '.t.t.t.t.',
      '.t..t..t.',
      't..t..t..',
      '.t..t..t.',
      '..t....t.',
    ],
  },
  trout: {
    pal: { a: '#63d6a8', b: '#2f9a86', c: '#d8fff0', p: C.pink, d: '#1f6e62', t: '#2f9a86' },
    rows: [
      '.......aaaaa...',
      't...aadaaadaaa.',
      'tt.ppppppppppka',
      'ttaaaadaaadaaaa',
      't...cccccccccc.',
      '.......cccc....',
    ],
  },
  sunfish: {
    pal: { a: '#ffb65c', b: '#e07a3a', c: '#ffe2a8', r: '#e8dcb8', t: '#e07a3a' },
    rows: [
      '.....aaaa....',
      '...aaaaaaaa..',
      't.aaaaaaaaaa.',
      'ttaaaaaaaakaa',
      'rrraaaaaaaaaa',
      'tarrrrraaaaaa',
      't.bbbbbrrrrrr',
      '...bcccccc...',
      '.....ccc.....',
    ],
  },
  eel: {
    pal: { a: '#4a3d8f', g: C.crystal, c: '#7a6bd0', t: '#3a2f75' },
    wave: true,
    rows: [
      't...aaaaaaaaaaaaaa...',
      'ttaaagaaaagaaaagaakaa',
      't...cccccccccccccc...',
    ],
  },
  whale: {
    pal: { a: '#4b6fd6', b: '#34509f', c: '#c8d8ff', e: '#8fa8ef', w: C.water5, t: '#34509f' },
    rows: [
      '..............w.w...',
      '...............w....',
      '........aaaaaaaa....',
      'tt...aaaaaaaaaaaaa..',
      'ttt.aaaaaaaaaaaakaa.',
      '.ttaaaaaaaaaaaaaaaaa',
      '..tbbccccccccccccba.',
      '....ceceeceeceecc...',
      '.......cccccccc.....',
    ],
  },
  glove: {
    pal: { w: C.suit, s: C.suitS, o: C.orange },
    rows: [
      '..w.w.w...',
      '.ww.w.w...',
      '.wwwwwww..',
      '.wwwwwwwww',
      '.wwwwwwsw.',
      '.swwwwss..',
      '.ooooooo..',
      '.ooooooo..',
    ],
  },
};

function waveRows(rows) {
  const h = rows.length + 2, w = rows[0].length;
  const out = Array.from({ length: h }, () => new Array(w).fill('.'));
  for (let x = 0; x < w; x++) {
    const off = Math.round(Math.sin(x * 0.35)) + 1;
    rows.forEach((row, y) => { out[y + off][x] = row[x] || '.'; });
  }
  return out.map((r) => r.join(''));
}

// ---------------------------------------------------------------- props
const PINE = {
  pal: { g: C.moss1, G: C.moss2, d: C.moss0, b: C.wood1, y: C.lamp },
  rows: [
    '.....y.....',
    '....ggg....',
    '....Ggd....',
    '...Gggdd...',
    '..Gggggdd..',
    '....ggd....',
    '...Gggdd...',
    '..Ggggggdd.',
    '.Gggggggddd',
    '....ggd....',
    '...Gggggd..',
    '..Gggggggdd',
    '.Gggggggggd',
    'Gggggggdddd',
    '.....b.....',
    '.....b.....',
  ],
};

const BOBBER = { pal: { r: C.red, w: C.suit, d: C.redD }, rows: ['.r.', 'rrd', 'www', '.w.'] };

export const sprites = {};
export function initArt() {
  sprites.astro = build(ASTRO, ASTRO_PAL);
  sprites.pine = build(PINE.rows, PINE.pal);
  sprites.bobber = build(BOBBER.rows, BOBBER.pal);
  sprites.fish = {};
  for (const [id, def] of Object.entries(FISH)) {
    sprites.fish[id] = build(def.wave ? waveRows(def.rows) : def.rows, def.pal);
  }
  sprites.fishSil = {};
  for (const [id, s] of Object.entries(sprites.fish)) sprites.fishSil[id] = silhouette(s, C.rock1);
  return sprites;
}
