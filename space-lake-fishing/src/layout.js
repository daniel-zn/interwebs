// Island-local coordinates (origin = centre of the lake's surface ellipse).
export const RIM = { rx: 84, ry: 22 };
export const WATER = { x: 0, y: -1, rx: 72, ry: 16 };
export const ASTRO = { x: -70, y: -16 };
export const HAND = { x: -55, y: -6 };
export const ROD_LEN = 26;
export const BUCKET = { x: -81, y: -8 };
export const REEL_END = { x: -47, y: 3 };
export const CAST_MIN_X = -38;
export const CAST_MAX_X = 62;
export const BUBBLE = { x: 0, y: -5, rx: 116, ry: 90 };
// Vertical extent of everything drawn around the island, used for layout.
export const SCENE_TOP = -96;
export const SCENE_BOTTOM = 86;

export function inWater(x, y, margin = 0) {
  const dx = (x - WATER.x) / (WATER.rx - margin);
  const dy = (y - WATER.y) / (WATER.ry - margin);
  return dx * dx + dy * dy <= 1;
}

/** Half of the water's vertical extent at a given x. */
export function waterHalfHeight(x, margin = 0) {
  const u = (x - WATER.x) / (WATER.rx - margin);
  return u >= 1 || u <= -1 ? 0 : (WATER.ry - margin) * Math.sqrt(1 - u * u);
}
