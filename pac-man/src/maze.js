// The arcade maze, 28 x 31 tiles. # wall, - ghost house door, . dot,
// o energizer, space empty path. Row 14 is the wrap-around tunnel.
export const MAZE = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

export const COLS = 28;
export const ROWS = 31;
export const TUNNEL_ROW = 14;

export const WALL = 1;
export const DOOR = 2;
export const DOT = 1;
export const POWER = 2;

/** Cell kinds: 0 path, WALL or DOOR. */
export const CELLS = new Uint8Array(COLS * ROWS);
/** The dots a fresh level starts with: 0, DOT or POWER. */
export const START_DOTS = new Uint8Array(COLS * ROWS);
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const ch = MAZE[y][x];
    CELLS[y * COLS + x] = ch === '#' ? WALL : ch === '-' ? DOOR : 0;
    START_DOTS[y * COLS + x] = ch === '.' ? DOT : ch === 'o' ? POWER : 0;
  }
}

export const wrapX = (x) => ((x % COLS) + COLS) % COLS;

/** The cell at a tile. Columns wrap (only the tunnel row reaches the edge); rows outside are wall. */
export function cellAt(tx, ty) {
  if (ty < 0 || ty >= ROWS) return WALL;
  return CELLS[ty * COLS + wrapX(tx)];
}

export const isPath = (tx, ty) => cellAt(tx, ty) === 0;
