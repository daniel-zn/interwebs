// The rules of the game, with no DOM. One call to step() advances 1/60 s.
//
// Positions are in tiles: the centre of tile (tx, ty) is (tx + 0.5, ty + 0.5).
// Things only turn at tile centres. Pac-Man can reverse at any moment; ghosts
// only reverse when the mode changes or they get frightened.
import { COLS, DOOR, DOT, START_DOTS, TUNNEL_ROW, cellAt, isPath, wrapX } from './maze.js';
import { mulberry32 } from './rng.js';

export const DT = 1 / 60;
/** 100% speed in the arcade: 75.76 pixels a second, 8 pixels a tile. */
export const BASE_SPEED = 75.75757625 / 8;

// Directions, in the arcade's tie-break order.
export const UP = 0, LEFT = 1, DOWN = 2, RIGHT = 3, NONE = -1;
export const DX = [0, -1, 0, 1];
export const DY = [-1, 0, 1, 0];
export const opposite = (d) => (d < 0 ? d : (d + 2) % 4);

export const PAC_START = { x: 14, y: 23.5 };
export const FRUIT_POS = { x: 14, y: 17.5 };
const DOOR_X = 14, DOOR_Y = 11.5, HOUSE_Y = 14.5;
const DOTS_TOTAL = START_DOTS.reduce((n, d) => n + (d ? 1 : 0), 0);
export const EXTRA_LIFE_AT = 10000;
export const START_LIVES = 3;

export const GHOSTS = [
  { name: 'blinky', label: 'Shadow', start: { x: DOOR_X, y: DOOR_Y }, home: { x: 14, y: HOUSE_Y }, scatter: { x: 25, y: -3 }, dir: LEFT },
  { name: 'pinky', label: 'Speedy', start: { x: 14, y: HOUSE_Y }, home: { x: 14, y: HOUSE_Y }, scatter: { x: 2, y: -3 }, dir: DOWN },
  { name: 'inky', label: 'Bashful', start: { x: 12, y: HOUSE_Y }, home: { x: 12, y: HOUSE_Y }, scatter: { x: 27, y: 34 }, dir: UP },
  { name: 'clyde', label: 'Pokey', start: { x: 16, y: HOUSE_Y }, home: { x: 16, y: HOUSE_Y }, scatter: { x: 0, y: 34 }, dir: UP },
];

export const FRUITS = [
  { kind: 'cherry', points: 100 }, { kind: 'strawberry', points: 300 }, { kind: 'orange', points: 500 },
  { kind: 'apple', points: 700 }, { kind: 'melon', points: 1000 }, { kind: 'galaxian', points: 2000 },
  { kind: 'bell', points: 3000 }, { kind: 'key', points: 5000 },
];
const FRUIT_BY_LEVEL = [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
export const fruitFor = (level) => FRUITS[level <= 12 ? FRUIT_BY_LEVEL[level - 1] : 7];

// Per-level tables from the arcade game (level 1 first).
const FRIGHT_TIME = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
const FRIGHT_FLASHES = [5, 5, 5, 5, 5, 5, 5, 5, 3, 5, 5, 3, 3, 5, 3, 3, 0, 3];
const ELROY_DOTS = [20, 30, 40, 40, 40, 50, 50, 50, 60, 60, 60, 80, 80, 80, 100, 100, 100, 100, 120];
const at = (table, level, fallback) => (level <= table.length ? table[level - 1] : fallback);

export const frightTime = (level) => at(FRIGHT_TIME, level, 0);
export const frightFlashes = (level) => at(FRIGHT_FLASHES, level, 0);

/** Scatter/chase durations in seconds. Odd entries are chase; the last one lasts forever. */
export function modeSchedule(level) {
  if (level === 1) return [7, 20, 7, 20, 5, 20, 5];
  if (level <= 4) return [7, 20, 7, 20, 5, 1033, 1 / 60];
  return [5, 20, 5, 20, 5, 1037, 1 / 60];
}

/** Fractions of BASE_SPEED. */
export function speeds(level) {
  if (level === 1) return { pac: 0.8, pacFright: 0.9, ghost: 0.75, tunnel: 0.4, fright: 0.5, elroy1: 0.8, elroy2: 0.85 };
  if (level <= 4) return { pac: 0.9, pacFright: 0.95, ghost: 0.85, tunnel: 0.45, fright: 0.55, elroy1: 0.9, elroy2: 0.95 };
  if (level <= 20) return { pac: 1, pacFright: 1, ghost: 0.95, tunnel: 0.5, fright: 0.6, elroy1: 1, elroy2: 1.05 };
  return { pac: 0.9, pacFright: 0.9, ghost: 0.95, tunnel: 0.5, fright: 0.6, elroy1: 1, elroy2: 1.05 };
}

/** Dots a ghost waits for in the house at the start of a level (Pinky, Inky, Clyde). */
function dotLimit(level, i) {
  if (i === 1) return 0;
  if (level === 1) return i === 2 ? 30 : 60;
  if (level === 2) return i === 2 ? 0 : 50;
  return 0;
}

// Ghosts may not turn up into these tiles' upward exits while scattering or chasing.
const RED_ZONES = new Set(['12,11', '15,11', '12,23', '15,23']);

// ------------------------------------------------------------------ setup

export function createGame({ seed = 1, level = 1, lives = START_LIVES, relaxed = false } = {}) {
  const g = {
    rng: mulberry32(seed),
    speedScale: relaxed ? 0.8 : 1,
    relaxed,
    level,
    score: 0,
    lives,
    extraAwarded: false,
    dots: null,
    dotsLeft: 0,
    dotsEaten: 0,
    phase: 'ready',
    phaseT: 0,
    t: 0,
    pac: null,
    ghosts: [],
    mode: 'scatter',
    modeIndex: 0,
    modeT: 0,
    frightT: 0,
    frightTotal: 0,
    ghostCombo: 0,
    freezeT: 0,
    eaten: null, // the ghost points shown during the freeze after eating one
    popups: [],
    fruit: null,
    fruitsShown: 0,
    globalCounter: null,
    noDotT: 0,
    elroyHold: false,
    deaths: 0,
    ghostsEaten: 0,
    events: [],
  };
  startLevel(g, level);
  g.phaseT = 4.2; // the first READY! waits for the intro tune
  g.events.push('intro');
  return g;
}

function startLevel(g, level) {
  g.level = level;
  g.dots = START_DOTS.slice();
  g.dotsLeft = DOTS_TOTAL;
  g.dotsEaten = 0;
  g.fruitsShown = 0;
  g.globalCounter = null;
  g.elroyHold = false;
  resetActors(g);
  for (const gh of g.ghosts) gh.dotCounter = 0;
}

function resetActors(g) {
  g.pac = { x: PAC_START.x, y: PAC_START.y, dir: LEFT, want: NONE, moving: true, stall: 0, chomp: 0 };
  g.ghosts = GHOSTS.map((def, i) => ({
    i,
    name: def.name,
    x: def.start.x,
    y: def.start.y,
    dir: def.dir,
    state: i === 0 ? 'active' : 'house',
    fright: false,
    dotCounter: g.ghosts[i] ? g.ghosts[i].dotCounter : 0,
    anim: 0,
  }));
  g.mode = 'scatter';
  g.modeIndex = 0;
  g.modeT = 0;
  g.frightT = 0;
  g.ghostCombo = 0;
  g.freezeT = 0;
  g.eaten = null;
  g.fruit = null;
  g.noDotT = 0;
  g.phase = 'ready';
  g.phaseT = 2;
}

// ------------------------------------------------------------------ movement

/** The next tile centre along the axis coordinate p, moving with sign s (p itself if it is one). */
function nextCenter(p, s) {
  return s > 0 ? Math.ceil(p - 0.5 - 1e-9) + 0.5 : Math.floor(p - 0.5 + 1e-9) + 0.5;
}

/** The tile whose centre an actor will reach next (its current tile if it is on a centre). */
export function aheadTile(a) {
  const d = a.dir < 0 ? LEFT : a.dir;
  const tx = DX[d] ? nextCenter(a.x, DX[d]) - 0.5 : Math.floor(a.x);
  const ty = DY[d] ? nextCenter(a.y, DY[d]) - 0.5 : Math.floor(a.y);
  return { tx: wrapX(Math.round(tx)), ty: Math.round(ty) };
}

/**
 * Moves an actor dist tiles along its direction. At every tile centre it
 * reaches, decide(tx, ty) returns the direction to leave by (NONE stops it).
 * Returns the distance actually travelled.
 */
function advance(a, dist, decide) {
  let moved = 0;
  a.stopped = false;
  for (let guard = 0; dist > 1e-9 && guard < 8; guard++) {
    const horiz = DX[a.dir] !== 0;
    const p = horiz ? a.x : a.y;
    const c = nextCenter(p, horiz ? DX[a.dir] : DY[a.dir]);
    const gap = Math.abs(c - p);
    if (gap > 1e-9) {
      const d = Math.min(gap, dist);
      nudge(a, d);
      dist -= d;
      moved += d;
      if (dist <= 1e-9) break;
    }
    // On a tile centre: snap to it, then choose the way out.
    const tx = wrapX(Math.round(a.x - 0.5)), ty = Math.round(a.y - 0.5);
    a.x = tx + 0.5;
    a.y = ty + 0.5;
    const next = decide(tx, ty);
    if (next < 0) {
      a.stopped = true;
      break;
    }
    a.dir = next;
    const d = Math.min(dist, 1);
    nudge(a, d);
    dist -= d;
    moved += d;
  }
  return moved;
}

function nudge(a, d) {
  if (DX[a.dir]) a.x = wrapX(a.x + DX[a.dir] * d);
  else a.y += DY[a.dir] * d;
}

/** Moves a ghost in a straight line towards (x, y); returns true once it is there. */
function glide(gh, x, y, dist) {
  const dx = x - gh.x, dy = y - gh.y;
  const len = Math.abs(dx) + Math.abs(dy);
  if (len <= dist) {
    gh.x = x;
    gh.y = y;
    return true;
  }
  if (Math.abs(dx) > 1e-9) {
    gh.dir = dx > 0 ? RIGHT : LEFT;
    gh.x += Math.sign(dx) * Math.min(dist, Math.abs(dx));
  } else {
    gh.dir = dy > 0 ? DOWN : UP;
    gh.y += Math.sign(dy) * dist;
  }
  return false;
}

// ------------------------------------------------------------------ ghosts

const pacTile = (g) => ({ tx: wrapX(Math.floor(g.pac.x)), ty: Math.floor(g.pac.y) });

/** Where a ghost is heading, as a tile. */
export function ghostTarget(g, gh) {
  const def = GHOSTS[gh.i];
  if (gh.state === 'eyes') return { x: 13, y: 11 };
  const elroy = gh.i === 0 && elroyLevel(g) > 0;
  if (g.mode === 'scatter' && !elroy) return def.scatter;
  const { tx, ty } = pacTile(g);
  const d = g.pac.dir < 0 ? LEFT : g.pac.dir;
  // Facing up also shifts left: a quirk of the arcade code everyone keeps.
  const ahead = (n) => ({ x: tx + DX[d] * n - (d === UP ? n : 0), y: ty + DY[d] * n });
  switch (gh.name) {
    case 'blinky':
      return { x: tx, y: ty };
    case 'pinky':
      return ahead(4);
    case 'inky': {
      const pivot = ahead(2);
      const b = g.ghosts[0];
      return { x: pivot.x * 2 - Math.floor(b.x), y: pivot.y * 2 - Math.floor(b.y) };
    }
    default: {
      const dx = Math.floor(gh.x) - tx, dy = Math.floor(gh.y) - ty;
      return dx * dx + dy * dy > 64 ? { x: tx, y: ty } : def.scatter;
    }
  }
}

function ghostDecide(g, gh, tx, ty) {
  const back = opposite(gh.dir);
  const scared = gh.fright && gh.state === 'active';
  const options = [];
  for (let d = 0; d < 4; d++) {
    if (d === back) continue;
    const nx = tx + DX[d], ny = ty + DY[d];
    if (!isPath(nx, ny)) continue;
    if (d === UP && !scared && gh.state === 'active' && RED_ZONES.has(`${tx},${ty}`)) continue;
    options.push(d);
  }
  if (!options.length) return back;
  if (scared) return options[Math.floor(g.rng() * options.length)];
  const target = ghostTarget(g, gh);
  let best = options[0], bestD = Infinity;
  for (const d of options) {
    const dx = tx + DX[d] - target.x, dy = ty + DY[d] - target.y;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

/** 0, 1 or 2: how much Blinky has sped up because few dots are left. */
export function elroyLevel(g) {
  if (g.elroyHold) return 0;
  const n = at(ELROY_DOTS, g.level, 120);
  return g.dotsLeft <= n / 2 ? 2 : g.dotsLeft <= n ? 1 : 0;
}

function ghostSpeed(g, gh) {
  const sp = speeds(g.level);
  let f;
  if (gh.state === 'eyes') f = 1.9;
  else if (gh.state !== 'active') f = sp.ghost * 0.6;
  else if (Math.floor(gh.y) === TUNNEL_ROW && (gh.x < 6 || gh.x >= 22)) f = sp.tunnel;
  else if (gh.fright) f = sp.fright;
  else if (gh.i === 0 && elroyLevel(g)) f = elroyLevel(g) === 2 ? sp.elroy2 : sp.elroy1;
  else f = sp.ghost;
  return f * BASE_SPEED * DT * g.speedScale;
}

function moveGhost(g, gh) {
  const dist = ghostSpeed(g, gh);
  gh.anim += dist;
  const home = GHOSTS[gh.i].home;
  switch (gh.state) {
    case 'house': {
      // Bob up and down until it's this ghost's turn to leave.
      gh.dir = gh.dir === DOWN ? DOWN : UP;
      gh.y += DY[gh.dir] * dist;
      if (gh.y <= HOUSE_Y - 0.5) {
        gh.y = HOUSE_Y - 0.5;
        gh.dir = DOWN;
      } else if (gh.y >= HOUSE_Y + 0.5) {
        gh.y = HOUSE_Y + 0.5;
        gh.dir = UP;
      }
      break;
    }
    case 'leaving': {
      // Line up under the door, then float up and out.
      if (Math.abs(gh.x - DOOR_X) > 1e-9) glide(gh, Math.abs(gh.y - HOUSE_Y) > 1e-9 ? gh.x : DOOR_X, HOUSE_Y, dist);
      else if (glide(gh, DOOR_X, DOOR_Y, dist)) {
        gh.state = 'active';
        gh.dir = LEFT;
      }
      break;
    }
    case 'entering': {
      if (gh.y < HOUSE_Y - 1e-9) glide(gh, DOOR_X, Math.abs(gh.x - DOOR_X) > 1e-9 ? gh.y : HOUSE_Y, dist);
      else if (glide(gh, home.x, HOUSE_Y, dist)) {
        gh.state = 'leaving';
        gh.fright = false;
        g.events.push('home');
      }
      break;
    }
    default: {
      advance(gh, dist, (tx, ty) => {
        if (gh.state === 'eyes' && ty === 11 && (tx === 13 || tx === 14)) {
          gh.state = 'entering';
          return NONE;
        }
        return ghostDecide(g, gh, tx, ty);
      });
    }
  }
}

function reverseGhosts(g) {
  for (const gh of g.ghosts) if (gh.state === 'active') gh.dir = opposite(gh.dir);
}

function releaseGhost(g, gh) {
  gh.state = 'leaving';
  gh.dir = UP;
}

// ------------------------------------------------------------------ scoring

function addScore(g, n) {
  g.score += n;
  if (!g.extraAwarded && g.score >= EXTRA_LIFE_AT) {
    g.extraAwarded = true;
    g.lives++;
    g.events.push('extra');
  }
}

function eatAt(g, tx, ty) {
  const k = ty * COLS + tx;
  const d = g.dots[k];
  if (!d) return;
  g.dots[k] = 0;
  g.dotsLeft--;
  g.dotsEaten++;
  g.noDotT = 0;
  if (d === DOT) {
    addScore(g, 10);
    g.pac.stall = DT;
    g.events.push('dot');
  } else {
    addScore(g, 50);
    g.pac.stall = 3 * DT;
    g.events.push('power');
    frighten(g);
  }
  // The house: the waiting ghost counts dots, or everyone shares a counter after a death.
  const waiting = g.ghosts.find((gh) => gh.state === 'house');
  if (g.globalCounter !== null) {
    g.globalCounter++;
    const clyde = g.ghosts[3];
    if (g.globalCounter === 7 && g.ghosts[1].state === 'house') releaseGhost(g, g.ghosts[1]);
    else if (g.globalCounter === 17 && g.ghosts[2].state === 'house') releaseGhost(g, g.ghosts[2]);
    else if (g.globalCounter >= 32 && clyde.state === 'house') {
      releaseGhost(g, clyde);
      g.globalCounter = null;
    }
  } else if (waiting) {
    waiting.dotCounter++;
  }
  if (g.dotsEaten === 70 || g.dotsEaten === 170) {
    const f = fruitFor(g.level);
    g.fruit = { ...f, t: 9 + g.rng() };
    g.fruitsShown++;
    g.events.push('fruit-show');
  }
}

function frighten(g) {
  const time = frightTime(g.level) / Math.max(0.5, g.speedScale);
  g.ghostCombo = 0;
  reverseGhosts(g);
  if (time <= 0) return;
  g.frightT = time;
  g.frightTotal = time;
  for (const gh of g.ghosts) if (gh.state !== 'eyes' && gh.state !== 'entering') gh.fright = true;
}

function collide(g) {
  const p = g.pac;
  for (const gh of g.ghosts) {
    if (gh.state !== 'active') continue;
    let dx = Math.abs(gh.x - p.x);
    if (dx > COLS / 2) dx = COLS - dx;
    if (dx + Math.abs(gh.y - p.y) > 0.55) continue;
    if (gh.fright) {
      const points = 200 << g.ghostCombo;
      g.ghostCombo = Math.min(g.ghostCombo + 1, 3);
      addScore(g, points);
      gh.fright = false;
      gh.state = 'eyes';
      g.ghostsEaten++;
      g.freezeT = 1;
      g.eaten = { ghost: gh.i, x: gh.x, y: gh.y, points };
      g.events.push('ghost');
    } else {
      g.phase = 'dying';
      g.phaseT = 0;
      g.deaths++;
      g.events.push('caught');
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ step

export const DEATH_PAUSE = 1;
export const DEATH_ANIM = 1.6;
export const CLEAR_TIME = 3;

/** Advances the game 1/60 s. want is the direction the player is pushing (or NONE). */
export function step(g, want = NONE) {
  g.events.length = 0;
  g.t += DT;
  for (const pop of g.popups) pop.t -= DT;
  g.popups = g.popups.filter((pop) => pop.t > 0);
  if (want >= 0) g.pac.want = want;

  switch (g.phase) {
    case 'ready':
      g.phaseT -= DT;
      if (g.phaseT <= 0) {
        g.phase = 'play';
        g.events.push('go');
      }
      return;
    case 'dying':
      g.phaseT += DT;
      if (g.phaseT - DT < DEATH_PAUSE && g.phaseT >= DEATH_PAUSE) g.events.push('death');
      if (g.phaseT >= DEATH_PAUSE + DEATH_ANIM + 0.5) {
        g.lives--;
        if (g.lives <= 0) {
          g.phase = 'over';
          g.phaseT = 0;
          g.events.push('over');
        } else {
          resetActors(g);
          g.globalCounter = 0;
          g.elroyHold = true;
        }
      }
      return;
    case 'clear':
      g.phaseT += DT;
      if (g.phaseT >= CLEAR_TIME) {
        startLevel(g, g.level + 1);
        g.events.push('level');
      }
      return;
    case 'over':
      g.phaseT += DT;
      return;
    default:
      playStep(g);
  }
}

function playStep(g) {
  if (g.freezeT > 0) {
    g.freezeT -= DT;
    if (g.freezeT <= 0) g.eaten = null;
    // Eyes keep hurrying home while everything else waits.
    for (const gh of g.ghosts) if (gh.state === 'eyes' || gh.state === 'entering') moveGhost(g, gh);
    return;
  }

  // Scatter/chase timer, which stops while the ghosts are frightened.
  if (g.frightT > 0) {
    g.frightT -= DT;
    if (g.frightT <= 0) {
      g.frightT = 0;
      for (const gh of g.ghosts) gh.fright = false;
    }
  } else {
    const sched = modeSchedule(g.level);
    if (g.modeIndex < sched.length) {
      g.modeT += DT;
      if (g.modeT >= sched[g.modeIndex]) {
        g.modeT = 0;
        g.modeIndex++;
        g.mode = g.modeIndex % 2 ? 'chase' : 'scatter';
        reverseGhosts(g);
      }
    }
  }

  // Pac-Man.
  const p = g.pac;
  const sp = speeds(g.level);
  if (p.want >= 0 && p.want === opposite(p.dir)) p.dir = p.want;
  if (p.stall > 0) {
    p.stall -= DT;
  } else {
    const dist = (g.frightT > 0 ? sp.pacFright : sp.pac) * BASE_SPEED * DT * g.speedScale;
    const moved = advance(p, dist, (tx, ty) => {
      if (p.want >= 0 && isPath(tx + DX[p.want], ty + DY[p.want])) return p.want;
      return isPath(tx + DX[p.dir], ty + DY[p.dir]) ? p.dir : NONE;
    });
    p.moving = moved > 0;
    p.chomp += moved;
    // Dots are eaten on entering their tile.
    eatAt(g, wrapX(Math.floor(p.x)), Math.floor(p.y));
  }

  if (collide(g)) return;

  // Ghosts in the house: leave when their dot count is reached, or when Pac-Man stops eating.
  if (g.globalCounter === null) {
    const waiting = g.ghosts.find((gh) => gh.state === 'house');
    if (waiting && waiting.dotCounter >= dotLimit(g.level, waiting.i)) releaseGhost(g, waiting);
  }
  g.noDotT += DT;
  if (g.noDotT >= (g.level < 5 ? 4 : 3)) {
    g.noDotT = 0;
    const waiting = g.ghosts.find((gh) => gh.state === 'house');
    if (waiting) releaseGhost(g, waiting);
  }
  if (g.elroyHold && g.ghosts[3].state === 'active') g.elroyHold = false;

  for (const gh of g.ghosts) moveGhost(g, gh);
  if (collide(g)) return;

  if (g.fruit) {
    g.fruit.t -= DT;
    let dx = Math.abs(p.x - FRUIT_POS.x);
    if (dx > COLS / 2) dx = COLS - dx;
    if (dx < 0.6 && Math.abs(p.y - FRUIT_POS.y) < 0.6) {
      addScore(g, g.fruit.points);
      g.popups.push({ x: FRUIT_POS.x, y: FRUIT_POS.y, text: String(g.fruit.points), t: 2, kind: 'fruit' });
      g.events.push('fruit');
      g.fruit = null;
    } else if (g.fruit.t <= 0) {
      g.fruit = null;
    }
  }

  if (g.dotsLeft === 0) {
    g.phase = 'clear';
    g.phaseT = 0;
    g.frightT = 0;
    g.events.push('clear');
  }
}

// ------------------------------------------------------------------ helpers

/** True while frightened ghosts should flash white. */
export function flashing(g) {
  const n = frightFlashes(g.level);
  return g.frightT > 0 && g.frightT < n * 0.4 && Math.floor(g.frightT / 0.2) % 2 === 0;
}

/** A plain summary for tests and debugging. */
export function snapshot(g) {
  return {
    phase: g.phase,
    level: g.level,
    score: g.score,
    lives: g.lives,
    dotsLeft: g.dotsLeft,
    mode: g.mode,
    frightT: +g.frightT.toFixed(2),
    pac: { x: +g.pac.x.toFixed(3), y: +g.pac.y.toFixed(3), dir: g.pac.dir },
    ghosts: g.ghosts.map((gh) => ({ name: gh.name, x: +gh.x.toFixed(3), y: +gh.y.toFixed(3), state: gh.state, fright: gh.fright })),
    fruit: g.fruit ? g.fruit.kind : null,
    t: +g.t.toFixed(2),
  };
}

// ------------------------------------------------------------------ demo

/**
 * A simple autopilot for the attract screen and tests: head for the nearest
 * dot along paths that keep clear of hunting ghosts, chase blue ghosts when
 * there is time, and run when cornered.
 */
export function demoPilot(g) {
  const p = g.pac;
  const { tx, ty } = aheadTile(p);
  const N = COLS * 31;
  const danger = new Uint8Array(N);
  const threats = g.ghosts.filter((gh) => (gh.state === 'active' && !gh.fright) || gh.state === 'leaving');
  for (const gh of threats) {
    const gx = Math.floor(gh.x), gy = Math.floor(gh.y);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const y = gy + dy;
        if (y >= 0 && y < 31) danger[y * COLS + wrapX(gx + dx)] = 1;
      }
    }
  }
  const hunt = g.frightT > 1.5
    ? new Set(g.ghosts.filter((gh) => gh.fright && gh.state === 'active').map((gh) => Math.floor(gh.y) * COLS + wrapX(Math.floor(gh.x))))
    : null;

  const first = new Int8Array(N).fill(-1);
  const seen = new Uint8Array(N);
  const start = ty * COLS + tx;
  seen[start] = 1;
  let queue = [start];
  let depth = 0;
  while (queue.length && depth < 60) {
    const next = [];
    for (const k of queue) {
      const x = k % COLS, y = (k / COLS) | 0;
      if (k !== start && (g.dots[k] || (hunt && hunt.has(k) && depth < 10))) return first[k];
      for (let d = 0; d < 4; d++) {
        const nx = wrapX(x + DX[d]), ny = y + DY[d];
        if (!isPath(nx, ny) || cellAt(nx, ny) === DOOR) continue;
        const nk = ny * COLS + nx;
        if (seen[nk] || danger[nk]) continue;
        seen[nk] = 1;
        first[nk] = k === start ? d : first[k];
        next.push(nk);
      }
    }
    queue = next;
    depth++;
  }
  // Cornered: step to the open neighbour furthest from the nearest threat.
  let best = p.dir, bestD = -1;
  for (let d = 0; d < 4; d++) {
    const nx = tx + DX[d], ny = ty + DY[d];
    if (!isPath(nx, ny)) continue;
    let near = Infinity;
    for (const gh of threats) near = Math.min(near, Math.abs(gh.x - nx - 0.5) + Math.abs(gh.y - ny - 0.5));
    if (near > bestD) {
      bestD = near;
      best = d;
    }
  }
  return best;
}
