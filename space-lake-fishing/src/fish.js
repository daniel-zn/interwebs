import { hashString, makeCanvas, mulberry32 } from './util.js';

const OUT = '#1b1d3a';

/**
 * Species of the lake. `weights` are relative chances for [near, mid, far] casts.
 * `strength` (0-1) shapes how hard the fish fights on the line.
 */
export const SPECIES = [
  {
    id: 'minnow', name: 'Comet Minnow', rarity: 'Common', weights: [10, 6, 3], size: [6, 12], strength: 0.35,
    shadow: [3, 1], hint: 'Darts about everywhere.',
    desc: 'Leaves a faint tail of stardust wherever it darts. Rarely sits still for a portrait.',
    art: { len: 8, ht: 4, tail: 'fork', tailLen: 4, tailH: 2, finH: 1,
      colors: { body: '#9fd8ff', back: '#5b8fd6', belly: '#e8f6ff', fin: '#cfeaff', tail: '#ffe39a', accent: '#fff6d6' },
      pattern: 'none' },
  },
  {
    id: 'perch', name: 'Moon Perch', rarity: 'Common', weights: [8, 7, 3], size: [14, 26], strength: 0.5,
    shadow: [4, 1.5], hint: 'Likes the shallows near the dock.',
    desc: 'Pale, pocked and patient. Some say it is a chip off the old moon.',
    art: { len: 11, ht: 6, tail: 'fan', tailLen: 4, tailH: 3, finH: 2,
      colors: { body: '#c9cbe0', back: '#8e90b0', belly: '#f1f1f8', fin: '#a3a6c6', tail: '#a3a6c6', accent: '#8a8cab' },
      pattern: 'spots', spots: 6 },
  },
  {
    id: 'guppy', name: 'Nebula Guppy', rarity: 'Common', weights: [4, 5, 4], size: [4, 9], strength: 0.3,
    shadow: [3, 1], hint: 'Tiny and everywhere.',
    desc: 'Its fins billow like distant gas clouds. Tiny, but very proud of it.',
    art: { len: 7, ht: 4, tail: 'fan', tailLen: 6, tailH: 4, finH: 1,
      colors: { body: '#e99ad0', back: '#a96fc0', belly: '#ffd6f0', fin: '#8f7bff', tail: '#8f7bff', accent: '#7ff4ff' },
      pattern: 'tailSpeckle' },
  },
  {
    id: 'glove', name: 'Lost Glove', rarity: 'Junk', weights: [3, 2, 1], size: null, strength: 0.15,
    shadow: [3, 2], hint: 'Not every bite is a fish.',
    desc: 'Size L, left hand. Somebody on some station is still looking for this.',
    custom: 'glove',
  },
  {
    id: 'sunfish', name: 'Ringed Sunfish', rarity: 'Uncommon', weights: [1, 4, 4], size: [16, 30], strength: 0.6,
    shadow: [4, 2], hint: 'Circles the middle of the lake.',
    desc: 'Wears a ring it refuses to explain.',
    art: { len: 10, ht: 9, tail: 'round', tailLen: 3, tailH: 3, finH: 2, padX: 3,
      colors: { body: '#f3c252', back: '#d88a3a', belly: '#ffe9a8', fin: '#ec7c3c', tail: '#ec7c3c', accent: '#e7a640', ring: '#c7e6ff', ringBack: '#6f86b8' },
      pattern: 'stripes', stripeEvery: 3, ring: true },
  },
  {
    id: 'eel', name: 'Void Eel', rarity: 'Uncommon', weights: [1, 3, 5], size: [40, 95], strength: 0.85,
    shadow: [7, 1], hint: 'Lurks where the lake is deepest.',
    desc: 'A ribbon of pure midnight. Its eyes are the only way to find it.',
    custom: 'eel',
  },
  {
    id: 'puffer', name: 'Pulsar Puffer', rarity: 'Rare', weights: [0.5, 2, 3], size: [10, 20], strength: 0.6,
    shadow: [3, 2], hint: 'Pulses somewhere past the middle.',
    desc: 'Puffs up at perfectly regular intervals. Navigators set their clocks by it.',
    art: { len: 9, ht: 8, tail: 'fan', tailLen: 3, tailH: 2, finH: 1,
      colors: { body: '#7fe3c4', back: '#3fb09a', belly: '#e2fff4', fin: '#3fb09a', tail: '#3fb09a', accent: '#2a7d74', spike: '#e2fff4' },
      pattern: 'spots', spots: 5, spikes: true },
  },
  {
    id: 'carp', name: 'Stardust Carp', rarity: 'Rare', weights: [0.3, 1.5, 3], size: [30, 55], strength: 0.75,
    shadow: [5, 2], hint: 'Glitters out on the far side.',
    desc: 'Scales flecked with a gold that was never mined anywhere.',
    art: { len: 14, ht: 7, tail: 'fork', tailLen: 5, tailH: 4, finH: 2,
      colors: { body: '#e8b54a', back: '#b8742e', belly: '#fff0b8', fin: '#f4d27a', tail: '#f4d27a', accent: '#fffbe0' },
      pattern: 'speckle', density: 0.16 },
  },
  {
    id: 'koi', name: 'Aurora Koi', rarity: 'Rare', weights: [0.2, 0.8, 2], size: [35, 60], strength: 0.7,
    shadow: [5, 2], hint: 'Only seen far from the dock.',
    desc: 'Its colours shift every time you blink. Nobody agrees on what it looks like.',
    shimmer: true,
    art: { len: 14, ht: 6, tail: 'fan', tailLen: 6, tailH: 4, finH: 2,
      colors: { body: '#f4f1ea', back: '#e3ddd2', belly: '#ffffff', fin: '#ffb3a0', tail: '#ffb3a0', accent: '#ef6b3a', accent2: '#2a2742' },
      pattern: 'patches' },
  },
  {
    id: 'leviathan', name: 'The Old Leviathan', rarity: 'Legendary', weights: [0, 0.05, 1], size: [180, 320], strength: 1,
    shadow: [14, 4], hint: 'Something vast circles the far edge…',
    desc: 'Older than the lake. Possibly older than the stars. It let you win.',
    art: { len: 30, ht: 13, tail: 'fork', tailLen: 9, tailH: 7, finH: 3, padX: 3, padTop: 5,
      colors: { body: '#3b4a7a', back: '#232c52', belly: '#6f86a8', fin: '#2b3a66', tail: '#2b3a66', accent: '#9ff7ff', stalk: '#6f86a8', glow: '#fff3a0', tooth: '#e8ecf2' },
      pattern: 'lights', lure: true },
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export const zoneFor = (power) => (power < 0.36 ? 0 : power < 0.7 ? 1 : 2);

/** Pick a species for a cast; undiscovered species get a small nudge. */
export function pickSpecies(power, rng, journal = {}) {
  const zone = zoneFor(power);
  const weights = SPECIES.map((s) => s.weights[zone] * (journal[s.id] ? 1 : 1.35));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SPECIES.length; i++) {
    r -= weights[i];
    if (r <= 0) return SPECIES[i];
  }
  return SPECIES[0];
}

export function rollSize(sp, rng) {
  if (!sp.size) return 0;
  const [a, b] = sp.size;
  return Math.round(a + (b - a) * rng() ** 1.7);
}

export function formatSize(sp, size) {
  if (!sp.size) return 'One size fits all';
  return size >= 100 ? `${(size / 100).toFixed(2)} m` : `${size} cm`;
}

// ---------------------------------------------------------------------------
// Procedural pixel sprites

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.c = new Array(w * h).fill(0);
  }
  get(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.c[y * this.w + x];
  }
  set(x, y, k) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y * this.w + x] = k;
  }
  outline(key = 'outline') {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, key);
  }
  toCanvas(colors) {
    const cv = makeCanvas(this.w, this.h);
    const ctx = cv.getContext('2d');
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const k = this.c[y * this.w + x];
        if (!k) continue;
        ctx.fillStyle = colors[k] || colors.body || '#f0f';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }
}

const isBody = (k) => k === 'body' || k === 'back' || k === 'belly';

function paintFish(art, rng) {
  const L = art.len, HT = art.ht;
  const tl = art.tailLen, th = art.tailH, finH = art.finH;
  const padX = 1 + (art.padX || 0), padTop = 1 + (art.padTop || 0), padBot = 2;
  const inner = Math.max(HT + finH * 2, th * 2 + 1);
  const w = padX * 2 + tl + L;
  const h = padTop + padBot + inner;
  const g = new Grid(w, h);
  const cy = padTop + (inner - 1) / 2;
  const x0 = padX + tl;
  const a = L / 2, b = HT / 2;
  const cx = x0 + a - 0.5;

  // Body.
  for (let y = 0; y < h; y++) {
    for (let x = x0; x < x0 + L; x++) {
      const dx = (x - cx) / a, dy = (y - cy) / b;
      if (dx * dx + dy * dy <= 1.02) g.set(x, y, dy < -0.35 ? 'back' : dy > 0.4 ? 'belly' : 'body');
    }
  }
  const topOf = (x) => {
    for (let y = 0; y < h; y++) if (isBody(g.get(x, y))) return y;
    return -1;
  };
  const bottomOf = (x) => {
    for (let y = h - 1; y >= 0; y--) if (isBody(g.get(x, y))) return y;
    return -1;
  };

  // Patterns.
  const bodyCells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isBody(g.get(x, y))) bodyCells.push([x, y]);
  if (art.pattern === 'stripes') {
    for (const [x, y] of bodyCells) if ((x - x0) % art.stripeEvery === 1 && g.get(x, y) !== 'belly') g.set(x, y, 'accent');
  } else if (art.pattern === 'spots') {
    for (let i = 0; i < art.spots; i++) {
      const [x, y] = bodyCells[Math.floor(rng() * bodyCells.length)];
      if (x < cx + a * 0.4) g.set(x, y, 'accent');
    }
  } else if (art.pattern === 'speckle') {
    for (const [x, y] of bodyCells) if (rng() < art.density) g.set(x, y, 'accent');
  } else if (art.pattern === 'patches') {
    for (let i = 0; i < 3; i++) {
      const px = x0 + 2 + rng() * (L - 5), py = cy - b * 0.6 + rng() * b * 0.9, r = 1.3 + rng() * 1.4;
      for (const [x, y] of bodyCells) if ((x - px) ** 2 + ((y - py) * 1.3) ** 2 <= r * r) g.set(x, y, i === 2 ? 'accent2' : 'accent');
    }
  } else if (art.pattern === 'lights') {
    const ly = Math.round(cy + b * 0.15);
    for (let x = x0 + 2; x < x0 + L - 4; x += 3) if (isBody(g.get(x, ly))) g.set(x, ly, 'accent');
    for (const [x, y] of bodyCells) if (rng() < 0.03) g.set(x, y, 'accent');
  }

  // Dorsal fin: tallest at the back, sloping toward the head.
  const fs = Math.round(cx - a * 0.5), fe = Math.round(cx + a * 0.2);
  for (let x = fs; x <= fe; x++) {
    const hh = Math.max(1, Math.round(finH * (1 - (x - fs) / (fe - fs + 1))));
    const top = topOf(x);
    for (let k = 1; k <= hh; k++) g.set(x, top - k, 'fin');
  }
  // Pelvic fin.
  const pfx = Math.round(cx - a * 0.05);
  g.set(pfx, bottomOf(pfx) + 1, 'fin');
  if (HT >= 6) g.set(pfx - 1, bottomOf(pfx) + 1, 'fin');

  // Tail.
  for (let d = 0; d < tl; d++) {
    const x = x0 - 1 - d;
    const frac = (d + 1) / tl;
    const hh = art.tail === 'round' ? 0.5 + th * Math.sin(frac * Math.PI * 0.6) : 0.5 + frac * th;
    for (let y = 0; y < h; y++) {
      const dy = Math.abs(y - cy);
      if (dy > hh) continue;
      if (art.tail === 'fork' && d >= tl * 0.55 && dy < hh * 0.45) continue;
      g.set(x, y, 'tail');
    }
  }
  if (art.pattern === 'tailSpeckle') {
    for (let y = 0; y < h; y++) for (let x = 0; x < x0; x++) if (g.get(x, y) === 'tail' && rng() < 0.25) g.set(x, y, 'accent');
  }

  // Eye and mouth.
  const ex = Math.round(cx + a * 0.55), ey = Math.round(cy - b * 0.3);
  g.set(ex, ey, 'eye');
  if (HT >= 7) g.set(ex - 1, ey, 'eyeW');
  if (HT >= 6) {
    const my = Math.round(cy + b * 0.25);
    let mx = x0 + L - 1;
    while (mx > x0 && !isBody(g.get(mx, my))) mx--;
    g.set(mx, my, 'mouth');
    if (art.lure) for (let i = 1; i <= 3; i++) g.set(mx - i * 2, my - 1, 'tooth');
  }

  g.outline();

  if (art.ring) {
    const rcx = cx, rcy = cy + 1, rx = a + 3.2, ry = 1.6;
    for (let i = 0; i < 64; i++) {
      const ang = (i / 64) * Math.PI * 2;
      const x = Math.round(rcx + Math.cos(ang) * rx), y = Math.round(rcy + Math.sin(ang) * ry);
      if (Math.sin(ang) > 0) g.set(x, y, 'ring');
      else if (!g.get(x, y)) g.set(x, y, 'ringBack');
    }
  }
  if (art.spikes) {
    const r = a + 1.6, rb = b + 1.6;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + 0.3;
      const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * rb);
      if (!g.get(x, y)) g.set(x, y, 'spike');
    }
  }
  if (art.lure) {
    const sx = Math.round(cx + a * 0.45);
    let y = topOf(sx) - 2;
    for (let k = 0; k < 4; k++) g.set(sx, y--, 'stalk');
    for (let k = 1; k <= 3; k++) g.set(sx + k, y, 'stalk');
    g.set(sx + 4, y + 1, 'glow');
    g.set(sx + 5, y + 1, 'glow');
    g.set(sx + 4, y + 2, 'glow');
    g.set(sx + 5, y + 2, 'glow');
  }
  return g;
}

function paintEel(rng) {
  const w = 30, h = 10, cy = 4.5;
  const g = new Grid(w, h);
  const yc = (x) => cy + Math.sin(x * 0.42) * 1.3;
  for (let x = 2; x < 27; x++) {
    const t = (x - 2) / 24; // 0 at tail, 1 at head
    let hw = 0.45 + 1.25 * Math.min(1, t * 1.8);
    if (x >= 25) hw -= (x - 24) * 0.45;
    for (let y = 0; y < h; y++) {
      const dy = y - yc(x);
      if (Math.abs(dy) <= hw) g.set(x, y, dy < -0.6 ? 'back' : dy > 0.6 ? 'belly' : 'body');
    }
    if (x > 6 && x < 22) {
      let top = 0;
      while (top < h && !g.get(x, top)) top++;
      if (x % 2 === 0) g.set(x, top - 1, 'fin');
    }
  }
  for (let x = 6; x < 23; x += 4) {
    let y = 0;
    while (y < h && !g.get(x, y)) y++;
    if (rng() < 0.8) g.set(x, y + 1, 'accent');
  }
  const hx = 25;
  let hy = 0;
  while (hy < h && !g.get(hx, hy)) hy++;
  g.set(hx, hy, 'eye');
  g.outline();
  return g;
}

const GLOVE = [
  '....oooo...',
  '...owwwwo..',
  '..owwwwwwo.',
  'ooowwwwwwwo',
  'owwowwwwwwo',
  'owwwwwwwwso',
  '.owwwwwwsso',
  '..osssssso.',
  '..orrrrrro.',
  '..ooooooo..',
];

function paintGlove() {
  const g = new Grid(GLOVE[0].length, GLOVE.length);
  const map = { o: 'outline', w: 'body', s: 'back', r: 'accent' };
  GLOVE.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && g.set(x, y, map[ch])));
  return g;
}

const spriteCache = new Map();

/** Returns a cached canvas with the species' pixel sprite, facing right. */
export function fishSprite(sp) {
  if (spriteCache.has(sp.id)) return spriteCache.get(sp.id);
  const rng = mulberry32(hashString(sp.id));
  let g, colors;
  if (sp.custom === 'eel') {
    g = paintEel(rng);
    colors = { body: '#2b2a55', back: '#17163a', belly: '#4a3f86', fin: '#3d3a80', accent: '#7ff4ff', eye: '#7ff4ff' };
  } else if (sp.custom === 'glove') {
    g = paintGlove();
    colors = { body: '#eef1f6', back: '#b3bbcf', accent: '#ec7c3c' };
  } else {
    g = paintFish(sp.art, rng);
    colors = { ...sp.art.colors };
  }
  colors.outline ||= OUT;
  colors.eye ||= '#0a0a18';
  colors.eyeW ||= '#ffffff';
  colors.mouth ||= OUT;
  colors.tail ||= colors.fin;
  const canvas = g.toCanvas(colors);
  spriteCache.set(sp.id, canvas);
  return canvas;
}

/** A flat-coloured silhouette of a sprite (for undiscovered journal entries). */
export function silhouette(canvas, color) {
  const c = makeCanvas(canvas.width, canvas.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}
