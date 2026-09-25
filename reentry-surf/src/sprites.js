// Hand-authored pixel grids. One character per pixel; '.' is transparent.
const PAL = {
  k: '#07081a', w: '#eef1f6', g: '#aeb8e2', v: '#f3c252', o: '#c77d2a', r: '#ff6b4a',
  d: '#3b3f6b', b: '#a8683f', B: '#5a3326', n: '#2e1a1a', c: '#3f8fe0', C: '#9fe6ff',
  m: '#6e6286', M: '#b3a6cc', s: '#d7dbe8', y: '#ffe08a',
};

const BOARD = [
  '..kkkkkkkkkkkkkk..',
  'kkbbbbbbbbbbbbbbkk',
  'kBBBBBBBBBBBBBBBBk',
  '.kknBBBBBBBBBBnkk.',
  '...kkkkkkkkkkkk...',
];

// The rider, sideways on the board and facing the direction of travel (right).
const RIDE = [
  '.......kkkk.......',
  '......kwwwwk......',
  '......kwwvvk......',
  '......kwwvok......',
  '.......kwwk.......',
  '...kk.kwwwwk.kk...',
  '..kwwkwwrwwwkwwk..',
  '...kkkwwrwwwkkk...',
  '......kwgwwk......',
  '......kwgwwk......',
  '.....kwwkkwwk.....',
  '....kwgk..kwgk....',
  '....kddk..kddk....',
];
const CROUCH = [
  '..................',
  '..................',
  '........kkkk......',
  '.......kwwwwk.....',
  '.......kwwvvk.....',
  '.......kwwvok.....',
  '....kk.kkwwk......',
  '...kwwkwwwwwk.kk..',
  '....kkwwrwwwkkwwk.',
  '......kwrwwwwkkk..',
  '....kkwwgwwkk.....',
  '...kwwgkkkkwwk....',
  '...kddk....kddk...',
];
const TUMBLE = [
  '..................',
  '..kk..........kk..',
  '.kwwk..kkkk..kwwk.',
  '..kwwkkwwwwkkwwk..',
  '...kkwwwwvvwwkk...',
  '.....kwwwvowk.....',
  '.....kwwrwwwk.....',
  '....kwwkrwkwwk....',
  '...kwgk.kk.kwgk...',
  '...kddk....kddk...',
];

export const DEBRIS = [
  [ // satellite
    'kkk.......kkk',
    'kcck..k..kcck',
    'kCck.kyk.kCck',
    'kcckkksskkcck',
    'kcckksgskkcck',
    'kCck.kkk.kCck',
    'kkk.......kkk',
  ],
  [ // rock
    '..kkkk..',
    '.kmMmmk.',
    'kmMmmmmk',
    'kmmmmMmk',
    '.kmmmmk.',
    '..kkkk..',
  ],
  [ // spent booster
    '.kkkkkkk.',
    'kgsssssgk',
    'krrrrrrrk',
    'kgsssssgk',
    '.kkkkkkk.',
  ],
];

const COOLANT = [
  '....k....',
  '...kCk...',
  '..kcCck..',
  '.kcCwCck.',
  'kcCwwwCck',
  '.kcCwCck.',
  '..kcCck..',
  '...kCk...',
  '....k....',
];

export function gridCanvas(rows, pal = PAL) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

/** Rider + board stacked into one sprite so it can be rotated as a unit. */
function riderOnBoard(body) {
  const c = document.createElement('canvas');
  c.width = 18;
  c.height = body.length + BOARD.length - 1;
  const g = c.getContext('2d');
  g.drawImage(gridCanvas(body), 0, 0);
  g.drawImage(gridCanvas(BOARD), 0, body.length - 1);
  return c;
}

export function buildSprites() {
  return {
    ride: riderOnBoard(RIDE),
    crouch: riderOnBoard(CROUCH),
    tumble: gridCanvas(TUMBLE),
    board: gridCanvas(BOARD),
    debris: DEBRIS.map((d) => gridCanvas(d)),
    coolant: gridCanvas(COOLANT),
  };
}
