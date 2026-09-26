// Rules tests: node --test tests/sim.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_ROWS, pose } from '../src/charmander.js';
import { COLS, MAZE, POWER, ROWS, START_DOTS, isPath } from '../src/maze.js';
import {
  DOWN, DT, EXTRA_LIFE_AT, LEFT, NONE, RIGHT, UP,
  createGame, demoPilot, fruitFor, ghostTarget, modeSchedule, step,
} from '../src/sim.js';

const run = (g, seconds, want = NONE) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(g, typeof want === 'function' ? want(g) : want);
};
/** A game past READY!, in play. */
function playing(opts = {}) {
  const g = createGame({ seed: 1, ...opts });
  g.phaseT = 0;
  step(g);
  assert.equal(g.phase, 'play');
  return g;
}
/** Parks the ghosts in the house, out of the way. */
function parkGhosts(g) {
  for (const gh of g.ghosts) {
    gh.state = 'house';
    gh.x = 14;
    gh.y = 14.5;
  }
  g.noDotT = -1e9;
  g.ghosts.forEach((gh) => (gh.dotCounter = -1e9));
}

test('the maze is 28 x 31 with 240 dots and 4 energizers', () => {
  assert.equal(MAZE.length, ROWS);
  for (const row of MAZE) assert.equal(row.length, COLS);
  const dots = START_DOTS.filter((d) => d === 1).length;
  const power = START_DOTS.filter((d) => d === POWER).length;
  assert.equal(dots, 240);
  assert.equal(power, 4);
});

test('the maze is left-right symmetric', () => {
  for (const row of MAZE) assert.equal(row, [...row].reverse().join(''));
});

test('every dot is reachable from the start', () => {
  const seen = new Set(['13,23']);
  const queue = [[13, 23]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = (x + dx + COLS) % COLS, ny = y + dy;
      if (isPath(nx, ny) && !seen.has(`${nx},${ny}`)) {
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
  }
  START_DOTS.forEach((d, k) => {
    if (d) assert.ok(seen.has(`${k % COLS},${Math.floor(k / COLS)}`), `dot ${k % COLS},${Math.floor(k / COLS)}`);
  });
});

test('READY! then play; Pac-Man sets off to the left and eats dots', () => {
  const g = createGame({ seed: 1 });
  assert.equal(g.phase, 'ready');
  run(g, 4.3);
  assert.equal(g.phase, 'play');
  const x0 = g.pac.x;
  run(g, 1);
  assert.ok(g.pac.x < x0 - 5, `moved left from ${x0} to ${g.pac.x}`);
  assert.ok(g.score >= 50, `score ${g.score}`);
  assert.equal(g.score % 10, 0);
});

test('Pac-Man stops at walls and turns at the next gap', () => {
  const g = playing();
  parkGhosts(g);
  // From the start, up is a wall; the buffered turn happens at the next gap (x = 12.5, going up to row 20).
  run(g, 0.05, UP);
  assert.equal(g.pac.y, 23.5);
  run(g, 1.2);
  assert.equal(g.pac.x, 12.5);
  assert.ok(g.pac.y < 23.5, 'turned up');
  // Keep going up until the wall at row 20's top stops it.
  run(g, 2);
  assert.equal(g.pac.y, 20.5);
  assert.equal(g.pac.moving, false);
});

test('Pac-Man can reverse at any time', () => {
  const g = playing();
  parkGhosts(g);
  run(g, 0.3);
  const x = g.pac.x;
  run(g, 0.3, RIGHT);
  assert.equal(g.pac.dir, RIGHT);
  assert.ok(g.pac.x > x);
});

test('the tunnel wraps round', () => {
  const g = playing();
  parkGhosts(g);
  g.pac.x = 2.5;
  g.pac.y = 14.5;
  g.pac.dir = LEFT;
  run(g, 0.5);
  assert.ok(g.pac.x > 25, `wrapped to ${g.pac.x}`);
});

test('energizers frighten and reverse ghosts; eating them scores 200, 400, 800, 1600', () => {
  const g = playing();
  run(g, 0.5);
  const dirs = g.ghosts.map((gh) => gh.dir);
  const blinky = g.ghosts[0];
  // Put Pac-Man next to the bottom-left energizer.
  g.pac.x = 2.5;
  g.pac.y = 23.5;
  g.pac.dir = LEFT;
  run(g, 0.2);
  assert.equal(g.dots[23 * COLS + 1], 0);
  assert.ok(g.frightT > 5);
  assert.ok(blinky.fright);
  assert.equal(blinky.dir, (dirs[0] + 2) % 4, 'Blinky reversed');
  const before = g.score;
  for (let i = 0; i < 4; i++) {
    const gh = g.ghosts[i];
    gh.state = 'active';
    gh.fright = true;
    gh.x = g.pac.x;
    gh.y = g.pac.y;
    step(g);
    assert.equal(gh.state, 'eyes');
    run(g, 1.05); // the freeze
  }
  assert.equal(g.score - before, 200 + 400 + 800 + 1600);
});

test('eaten ghosts go home as eyes and come back out', () => {
  const g = playing();
  const blinky = g.ghosts[0];
  blinky.state = 'eyes';
  blinky.x = 1.5;
  blinky.y = 1.5;
  blinky.dir = RIGHT;
  for (const gh of g.ghosts.slice(1)) Object.assign(gh, { state: 'house', x: 16, y: 14.5, dotCounter: -1e9 });
  g.noDotT = -1e9;
  g.pac.x = 1.5;
  g.pac.y = 29.5;
  let wentHome = false;
  for (let i = 0; i < 60 * 12 && blinky.state !== 'active'; i++) {
    step(g, NONE);
    if (blinky.state === 'leaving') wentHome = true;
  }
  assert.ok(wentHome, 'reached the house');
  assert.equal(blinky.state, 'active');
  assert.equal(blinky.y, 11.5);
});

test('touching a ghost costs a life, then the level resumes', () => {
  const g = playing();
  const blinky = g.ghosts[0];
  blinky.x = g.pac.x - 0.2;
  blinky.y = g.pac.y;
  step(g);
  assert.equal(g.phase, 'dying');
  run(g, 3.2);
  assert.equal(g.phase, 'ready');
  assert.equal(g.lives, 2);
  assert.equal(g.pac.x, 14);
  assert.equal(g.globalCounter, 0);
});

test('losing the last life ends the game', () => {
  const g = playing({ lives: 1 });
  g.ghosts[0].x = g.pac.x;
  g.ghosts[0].y = g.pac.y;
  step(g);
  run(g, 3.2);
  assert.equal(g.phase, 'over');
});

test('extra life at 10,000 points, once', () => {
  const g = playing();
  parkGhosts(g);
  g.score = EXTRA_LIFE_AT - 10;
  run(g, 0.5);
  assert.equal(g.lives, 4);
  g.score = EXTRA_LIFE_AT * 2 - 10;
  run(g, 0.5);
  assert.equal(g.lives, 4);
});

test('clearing the maze moves on to the next level', () => {
  const g = playing();
  parkGhosts(g);
  g.dots.fill(0);
  g.dots[23 * COLS + 12] = 1;
  g.dotsLeft = 1;
  run(g, 0.5);
  assert.equal(g.phase, 'clear');
  run(g, 3.1);
  assert.equal(g.level, 2);
  assert.equal(g.dotsLeft, 244);
  assert.equal(g.phase, 'ready');
});

test('fruit appears after 70 dots and pays by level', () => {
  const g = playing();
  parkGhosts(g);
  assert.equal(fruitFor(1).points, 100);
  assert.equal(fruitFor(3).kind, 'orange');
  assert.equal(fruitFor(40).kind, 'key');
  g.dotsEaten = 69;
  run(g, 0.3);
  assert.equal(g.fruit.kind, 'cherry');
  g.pac.x = 16.5;
  g.pac.y = 17.5;
  g.pac.dir = LEFT;
  const s = g.score;
  run(g, 0.4);
  assert.equal(g.fruit, null);
  assert.ok(g.score - s >= 100);
});

test('ghost targets follow their personalities', () => {
  const g = playing();
  g.mode = 'chase';
  const [blinky, pinky, inky, clyde] = g.ghosts;
  g.pac.x = 14.5;
  g.pac.y = 23.5;
  g.pac.dir = LEFT;
  assert.deepEqual(ghostTarget(g, blinky), { x: 14, y: 23 });
  assert.deepEqual(ghostTarget(g, pinky), { x: 10, y: 23 });
  g.pac.dir = UP;
  assert.deepEqual(ghostTarget(g, pinky), { x: 10, y: 19 }, 'the up-left overflow quirk');
  blinky.x = 14.5;
  blinky.y = 11.5;
  g.pac.dir = RIGHT;
  // Pivot two ahead of Pac-Man (16, 23), doubled away from Blinky (14, 11).
  assert.deepEqual(ghostTarget(g, inky), { x: 18, y: 35 });
  clyde.x = 1.5;
  clyde.y = 1.5;
  assert.deepEqual(ghostTarget(g, clyde), { x: 14, y: 23 });
  clyde.x = 15.5;
  clyde.y = 21.5;
  assert.deepEqual(ghostTarget(g, clyde), { x: 0, y: 34 }, 'too close: back to his corner');
  g.mode = 'scatter';
  assert.deepEqual(ghostTarget(g, blinky), { x: 25, y: -3 });
});

test('scatter and chase alternate on schedule, and ghosts reverse', () => {
  const g = playing();
  assert.deepEqual(modeSchedule(1).slice(0, 2), [7, 20]);
  assert.equal(g.mode, 'scatter');
  const blinky = g.ghosts[0];
  while (g.modeT + 2 * DT < modeSchedule(1)[0]) step(g);
  // Mid-tile, so the reversal isn't hidden by a turn at a tile centre.
  Object.assign(blinky, { x: 20.25, y: 5.5, dir: LEFT });
  step(g);
  step(g);
  assert.equal(g.mode, 'chase');
  assert.equal(blinky.dir, RIGHT);
});

test('Pinky leaves at once, Inky after 30 dots, Clyde after 60 on level 1', () => {
  const g = playing();
  run(g, 1.5);
  assert.notEqual(g.ghosts[1].state, 'house');
  assert.equal(g.ghosts[2].state, 'house');
  // Feed dots straight to the counters.
  g.ghosts[2].dotCounter = 30;
  step(g);
  assert.equal(g.ghosts[2].state, 'leaving');
  assert.equal(g.ghosts[3].state, 'house');
});

test('a ghost leaves anyway when Pac-Man stops eating for 4 seconds', () => {
  const g = playing();
  g.pac.x = 1.5;
  g.pac.y = 29.5;
  g.dots.fill(0);
  g.dotsLeft = 99;
  run(g, 1);
  assert.equal(g.ghosts[2].state, 'house');
  run(g, 4.1);
  assert.notEqual(g.ghosts[2].state, 'house');
});

test('the same seed and inputs replay the same game', () => {
  const a = createGame({ seed: 9 }), b = createGame({ seed: 9 });
  run(a, 30, demoPilot);
  run(b, 30, demoPilot);
  assert.equal(a.score, b.score);
  assert.deepEqual(a.ghosts.map((g) => [g.x, g.y]), b.ghosts.map((g) => [g.x, g.y]));
});

test('the demo pilot plays a real game: eats most of level 1', () => {
  const g = createGame({ seed: 4 });
  let most = 0;
  for (let i = 0; i < 60 * 200 && g.phase !== 'over'; i++) {
    step(g, demoPilot(g));
    most = Math.max(most, 244 - g.dotsLeft + (g.level - 1) * 244);
  }
  assert.ok(most > 150, `ate ${most} dots`);
});

test('relaxed speed moves everything slower', () => {
  const a = playing(), b = playing({ relaxed: true });
  parkGhosts(a);
  parkGhosts(b);
  run(a, 0.5);
  run(b, 0.5);
  assert.ok(14 - b.pac.x < (14 - a.pac.x) * 0.9);
});

test('Charmander sprites are 14 x 14 in every pose, and face the way he moves', () => {
  for (const row of ALL_ROWS) assert.equal(row.length, 14, row);
  for (const dir of [UP, LEFT, DOWN, RIGHT]) {
    for (const opts of [{}, { walk: 1, open: true, flame: 1 }, { flame: 3, asleep: true }]) {
      const p = pose(dir, opts);
      assert.equal(p.length, 14);
      for (const r of p) assert.equal(r.length, 14);
    }
  }
  // Facing right the snout is on the right; facing left it is mirrored.
  const right = pose(RIGHT).map((r) => r.join(''));
  const left = pose(LEFT).map((r) => r.join(''));
  assert.equal(right[4][13], 'o');
  assert.equal(left[4][0], 'o');
  // The flame goes out when he faints.
  assert.ok(!pose(DOWN, { flame: 3, asleep: true }).flat().some((c) => c === 'y' || c === 'r'));
});
