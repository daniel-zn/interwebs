// Charmander, the player's sprite: 14 x 14 pixel art drawn from strings.
// Side view (mirrored for left), front view (down) and back view (up), each
// with two leg frames, a mouth that opens to chomp, and a flickering tail flame.
import { DOWN, LEFT, UP } from './sim.js';

const PALETTE = {
  o: '#f08030', // body
  d: '#b84a10', // shading and closed mouth
  c: '#ffd880', // belly
  k: '#181010', // eye
  w: '#ffffff', // eye glint
  m: '#801810', // open mouth
  y: '#ffe040', // flame core
  r: '#ff3818', // flame edge
};

// Body rows 0-11; legs rows 12-13 come from LEGS. The flame is drawn over the top.
const SIDE = [
  '.......oooo...',
  '......oooooo..',
  '......oooowko.',
  '......ooookko.',
  '......oooooooo',
  '......oooooood',
  '.o.....oooooo.',
  '.o....occoo...',
  '.oo..occcooo..',
  '..oooocccco...',
  '...ooocccco...',
  '....oocccoo...',
];
const SIDE_OPEN = { 4: '......ooooooo.', 5: '......oooommm.', 6: '.o.....ooooo..' };
const SIDE_LEGS = [
  ['....oo...oo...', '...ooo..ooo...'],
  ['.....oo.oo....', '.....oo.ooo...'],
];
const SIDE_FLAME = [[1, 2, 'y'], [0, 3, 'y'], [1, 3, 'r'], [2, 3, 'y'], [0, 4, 'r'], [1, 4, 'y'], [2, 4, 'r'], [1, 5, 'r']];

const FRONT = [
  '....oooooo....',
  '...oooooooo...',
  '..oowkoowkoo..',
  '..ookkookkoo..',
  '..oooooooooo..',
  '...oooddooo...',
  '....oooooo....',
  '...ooccccoo...',
  '.oo.occcco.oo.',
  '....occcco....',
  '....occcco....',
  '....oooooo.o..',
];
const FRONT_OPEN = { 5: '...oommmmoo...' };
const FRONT_SLEEP = { 2: '..oooooooooo..', 3: '..ooddooddoo..' };
const FRONT_LEGS = [
  ['....oo..oo.o..', '...ooo..ooo...'],
  ['....oo..oo.o..', '....oo..ooo...'],
];
const FRONT_FLAME = [[12, 9, 'y'], [11, 10, 'y'], [12, 10, 'r'], [13, 10, 'y'], [11, 11, 'r'], [12, 11, 'y'], [13, 11, 'r'], [12, 12, 'r']];

const BACK = [
  '....oooooo....',
  '...oooooooo...',
  '..oooooooooo..',
  '..oooooooooo..',
  '..oooooooooo..',
  '...oooooooo...',
  '....dddddd....',
  '...oooooooo...',
  '.oo.oooooo.oo.',
  '....oooooo....',
  '....oooooo....',
  '.o..oooooo....',
];
const BACK_LEGS = [
  ['.o..oo..oo....', '..oooo..ooo...'],
  ['.o...oo.oo....', '..ooo.o.oo....'],
];
const BACK_FLAME = [[1, 7, 'y'], [0, 8, 'y'], [1, 8, 'r'], [2, 8, 'y'], [0, 9, 'r'], [1, 9, 'y'], [2, 9, 'r'], [1, 10, 'r']];

const VIEWS = {
  side: { body: SIDE, open: SIDE_OPEN, legs: SIDE_LEGS, flame: SIDE_FLAME },
  front: { body: FRONT, open: FRONT_OPEN, legs: FRONT_LEGS, flame: FRONT_FLAME },
  back: { body: BACK, open: {}, legs: BACK_LEGS, flame: BACK_FLAME },
};

/** Every row of every view is 14 pixels wide (checked by the tests). */
export const ALL_ROWS = Object.values(VIEWS).flatMap((v) => [
  ...v.body, ...Object.values(v.open), ...v.legs.flat(),
]).concat(Object.values(FRONT_SLEEP));

/**
 * The pixel rows for one pose.
 * flame: 0 or 1 swaps the flame's colours so it flickers, 2 draws it small, 3 puts it out.
 */
export function pose(dir, { walk = 0, open = false, flame = 0, asleep = false } = {}) {
  const view = dir === UP ? VIEWS.back : dir === DOWN ? VIEWS.front : VIEWS.side;
  const rows = view.body.map((r, i) => (open && view.open[i]) || (asleep && view === VIEWS.front && FRONT_SLEEP[i]) || r);
  rows.push(...view.legs[walk]);
  const grid = rows.map((r) => [...r]);
  if (flame < 3) {
    view.flame.forEach(([x, y, c], i) => {
      if (flame === 2 && i !== 0 && i !== 5 && i !== 7) return;
      grid[y][x] = flame === 1 ? (c === 'y' ? 'r' : 'y') : c;
    });
  }
  if (dir === LEFT) grid.forEach((r) => r.reverse());
  return grid;
}

/** Paints a pose into a new 14 x 14 canvas. */
export function charmanderSprite(dir, opts) {
  const c = document.createElement('canvas');
  c.width = 14;
  c.height = 14;
  const ctx = c.getContext('2d');
  pose(dir, opts).forEach((row, y) => row.forEach((ch, x) => {
    if (!PALETTE[ch]) return;
    ctx.fillStyle = PALETTE[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return c;
}
