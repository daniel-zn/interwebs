import { P } from './palette.js';
import { makeCanvas } from './util.js';

// Seated astronaut, facing right. Rows 0-8 are the helmet (it nods separately).
const ASTRONAUT = [
  '....oooooo......',
  '...owwwwwwo.....',
  '..owwwwwvvvo....',
  '..owwwwvvggvo...',
  '.owwwwwvvgvvVo..',
  '.owwwwwvvvvVVo..',
  '.oswwwwwvVVVo...',
  '..osswwwwwwo....',
  '.oddosssssso....',
  '.oddowwwwwwoo...',
  '.oddowwrwwwwwso.',
  '.oddowwwwwsssswo',
  '.oddoswwwwooooo.',
  '..ooosswwwo.....',
  '....owwwwwwwwwo.',
  '....osssssssso..',
  '.....ooooooooo..',
];
export const HEAD_ROWS = 9;

const BUCKET = [
  'ooooooo',
  'odddddo',
  '.osssso',
  '.osssso',
  '.osssso',
  '..oooo.',
];

function fromRows(rows, map) {
  const c = makeCanvas(rows[0].length, rows.length);
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (!map[ch]) return;
      ctx.fillStyle = map[ch];
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c;
}

let cache = null;
export function sprites() {
  if (cache) return cache;
  cache = {
    astronaut: fromRows(ASTRONAUT, {
      o: P.outline, w: P.suit, s: P.suitShade, d: P.suitDark,
      v: P.visor, V: P.visorShade, g: P.visorGlint, r: P.orange,
    }),
    bucket: fromRows(BUCKET, { o: P.outline, s: P.suitDark, d: P.suitShade }),
  };
  return cache;
}
