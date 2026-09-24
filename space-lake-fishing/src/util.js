export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Small, fast seeded PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered dither: true when (x, y) should take the "upper" colour for coverage t in [0, 1]. */
export const dither = (x, y, t) => t * 16 > BAYER4[((y & 3) << 2) | (x & 3)] + 0.5;

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Smooth 2D value noise with a seeded lattice, in [0, 1]. */
export function makeNoise(seed) {
  const rng = mulberry32(seed);
  const perm = new Float32Array(256 * 256);
  for (let i = 0; i < perm.length; i++) perm[i] = rng();
  const at = (x, y) => perm[(y & 255) * 256 + (x & 255)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = lerp(at(xi, yi), at(xi + 1, yi), xf);
    const b = lerp(at(xi, yi + 1), at(xi + 1, yi + 1), xf);
    return lerp(a, b, yf);
  };
  return (x, y, octaves = 3) => {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
