// Species data and pure selection helpers (no DOM; unit tested in Node).
//
// depth: the cast distance (0 = at the dock, 1 = the far shore) where a
// species is most at home. spread: how far from that it wanders.
// strength: how hard it fights (0..1). shadow: silhouette size class 1..3.

export const SPECIES = [
  { id: 'minnow', name: 'Star Minnow', rarity: 'Common', weight: 10, depth: 0.15, spread: 0.35, size: [4, 9], strength: 0.12, shadow: 1,
    blurb: 'Swallowed a constellation once and never quite got over it.' },
  { id: 'perch', name: 'Moon Perch', rarity: 'Common', weight: 9, depth: 0.35, spread: 0.35, size: [10, 24], strength: 0.3, shadow: 2,
    blurb: 'Pockmarked and patient. Sulks in the shallows.' },
  { id: 'glove', name: 'Lost Glove', rarity: 'Oddity', weight: 1.4, depth: 0.05, spread: 0.25, size: [22, 26], strength: 0.05, shadow: 1,
    blurb: "Size L, left hand. Somebody fished here before you." },
  { id: 'guppy', name: 'Nebula Guppy', rarity: 'Uncommon', weight: 5, depth: 0.55, spread: 0.3, size: [5, 12], strength: 0.25, shadow: 1,
    blurb: 'Its tail is mostly gas, and mostly pink.' },
  { id: 'jelly', name: 'Moon Jelly', rarity: 'Uncommon', weight: 4, depth: 0.45, spread: 0.3, size: [8, 20], strength: 0.2, shadow: 2,
    blurb: 'Drifts up out of the lake on quiet nights. Harmless. Probably.' },
  { id: 'koi', name: 'Comet Koi', rarity: 'Uncommon', weight: 3.5, depth: 0.7, spread: 0.25, size: [25, 60], strength: 0.55, shadow: 3,
    blurb: 'Comes around once every orbit. Make a wish.' },
  { id: 'sunfish', name: 'Ringed Sunfish', rarity: 'Rare', weight: 2, depth: 0.6, spread: 0.2, size: [15, 30], strength: 0.5, shadow: 2,
    blurb: 'Wears its ring with quiet dignity.' },
  { id: 'trout', name: 'Aurora Trout', rarity: 'Rare', weight: 2, depth: 0.8, spread: 0.2, size: [20, 45], strength: 0.7, shadow: 3,
    blurb: "Shimmers green when it's happy. Currently: annoyed." },
  { id: 'eel', name: 'Void Eel', rarity: 'Rare', weight: 1.6, depth: 0.95, spread: 0.15, size: [40, 120], strength: 0.85, shadow: 3,
    blurb: 'Longer than it looks. Darker than it should be.' },
  { id: 'whale', name: 'Pocket Whale', rarity: 'Legendary', weight: 0.5, depth: 1.0, spread: 0.1, size: [80, 150], strength: 1, shadow: 3,
    blurb: 'A whole whale, only smaller. It hums, very softly.' },
];

export const BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export function speciesWeights(distance) {
  return SPECIES.map((s) => s.weight * Math.exp(-((distance - s.depth) ** 2) / (2 * s.spread ** 2)));
}

export function pickSpecies(rng, distance) {
  const w = speciesWeights(distance);
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return SPECIES[i];
  }
  return SPECIES[SPECIES.length - 1];
}

export function rollSize(rng, s) {
  const t = rng() ** 1.6; // big ones are rarer
  return Math.round((s.size[0] + (s.size[1] - s.size[0]) * t) * 10) / 10;
}

/** Small deterministic PRNG so a ?seed=N run is reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Record a catch in a plain log object. Returns { isNew, isRecord }. */
export function recordCatch(log, id, size) {
  const entry = log[id] || (log[id] = { count: 0, best: 0 });
  const isNew = entry.count === 0;
  const isRecord = !isNew && size > entry.best;
  entry.count += 1;
  entry.best = Math.max(entry.best, size);
  return { isNew, isRecord };
}
