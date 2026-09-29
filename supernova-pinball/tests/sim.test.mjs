// Physics and rules tests: no DOM.
//   node --test tests/sim.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECTORS, UPGRADES } from '../src/data.js';
import { DT, autopilot, createGame, pickUpgrade, step } from '../src/game.js';
import { SUBSTEPS, makeBall, stepBall, stepFlippers } from '../src/physics.js';
import { BALL_R, CX, DRAIN_Y, LANE_X, PLUNGER, STAR, TH, TW, buildTable, m } from '../src/table.js';

const NONE = { left: false, right: false, launch: false, nudge: false };
const run = (g, frames, input = NONE) => {
  const events = [];
  for (let i = 0; i < frames; i++) {
    step(g, typeof input === 'function' ? input(g, i) : input);
    events.push(...g.events);
    g.events.length = 0;
  }
  return events;
};
const types = (events) => events.map((e) => e.type);
/** A game with its ball already in play at (x, y). */
function inPlay(x, y, vx = 0, vy = 0, opts = {}) {
  const g = createGame({ seed: 7, ...opts });
  g.phase = 'play';
  Object.assign(g.balls[0], { x, y, vx, vy });
  g.ballSaveArmed = false;
  if (!opts.keepTarget) g.target = Infinity;
  return g;
}

test('a ball on the plunger stays put, and holding then releasing launches it', () => {
  const g = createGame({ seed: 1 });
  run(g, 60);
  assert.equal(g.phase, 'launch');
  assert.ok(Math.abs(g.balls[0].y - PLUNGER.y) < 2);
  run(g, 50, { ...NONE, launch: true });
  assert.ok(g.plunger > 0.9, 'the plunger pulls back');
  const ev = run(g, 30);
  assert.ok(types(ev).includes('launch'));
  assert.equal(g.phase, 'play');
  assert.ok(g.balls[0].y < 150, `the ball flies up the lane (y ${g.balls[0].y.toFixed(0)})`);
});

test('a ball dropped down the middle drains, and the bonus is counted', () => {
  const g = inPlay(CX, 250, 0, 50);
  const ev = run(g, 60 * 6);
  assert.ok(types(ev).includes('drain'));
  assert.ok(types(ev).includes('bonusTotal'));
  assert.equal(g.ballsLeft, 2);
  assert.equal(g.phase, 'launch', 'the next ball is served');
});

test('a flipper sends the ball back up the table', () => {
  // A ball falling onto the left flipper's middle, flipped as it arrives.
  const g = inPlay(68, 298, 0, 120);
  let minY = 999;
  run(g, 60, (gg, i) => {
    minY = Math.min(minY, gg.balls[0] ? gg.balls[0].y : 999);
    return { ...NONE, left: i > 2 && i < 20 };
  });
  assert.ok(minY < 240, `the ball goes up the table (min y ${minY.toFixed(0)})`);
});

test('fast balls never tunnel out of the table', () => {
  const t = buildTable();
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 40; k++) {
    const b = makeBall(20 + r() * 130, 60 + r() * 150);
    const a = r() * Math.PI * 2;
    b.vx = Math.cos(a) * 1000;
    b.vy = Math.sin(a) * 1000;
    for (let i = 0; i < 60 * 3 * SUBSTEPS; i++) {
      stepFlippers(t.flippers, DT / SUBSTEPS);
      stepBall(b, t, DT / SUBSTEPS, 520, () => {});
      if (b.y > DRAIN_Y) break;
      assert.ok(b.x > 4 - BALL_R && b.x < 172 + BALL_R && b.y > 8 - BALL_R, `ball ${k} escaped at ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
    }
  }
});

test('the shooter lane gate is one way', () => {
  const t = buildTable();
  const up = makeBall(167, 200);
  up.vy = -700;
  for (let i = 0; i < 60 * SUBSTEPS; i++) stepBall(up, t, DT / SUBSTEPS, 520, () => {});
  assert.ok(up.x < LANE_X, 'a launched ball comes out into the playfield');
  const down = makeBall(150, 100);
  down.vx = 200;
  down.vy = 200;
  for (let i = 0; i < 30 * SUBSTEPS; i++) stepBall(down, t, DT / SUBSTEPS, 520, () => {});
  assert.ok(!(down.x > LANE_X && down.y > 140), 'a ball from the playfield cannot drop back into the lane');
});

test('pop bumpers fire the ball away and score', () => {
  const g = inPlay(70, 78, 0, 30);
  const ev = run(g, 20);
  assert.ok(types(ev).includes('bumper'));
  assert.ok(g.score >= 1000);
});

test('all three drop targets: a bonus, then they reset', () => {
  const g = inPlay(46, 168, -300, 0);
  for (const d of g.table.drops) if (d.bank === 0) d.up = false;
  g.table.drops[0].up = true;
  const ev = run(g, 30);
  assert.ok(types(ev).includes('dropsAll'));
  run(g, 90);
  assert.ok(g.table.drops.every((d) => d.up), 'the bank resets');
});

test('four lit lanes raise the playfield multiplier; flippers move the lit lanes', () => {
  const g = inPlay(100, 150);
  g.lanes = [true, true, true, false];
  run(g, 1, { ...NONE, left: true });
  assert.deepEqual(g.lanes, [true, true, false, true], 'lane change');
  run(g, 5);
  g.lanes = [true, true, true, false];
  Object.assign(g.balls[0], { x: 115, y: 50, vx: 0, vy: -200 });
  const ev = run(g, 10);
  assert.ok(types(ev).includes('lanesAll'));
  assert.equal(g.mult, 2);
});

test('a full star goes supernova: extra balls and double scoring', () => {
  const g = inPlay(STAR.x, 192, 0, 200);
  g.mass = 99.9;
  const ev = run(g, 30);
  assert.ok(types(ev).includes('supernova'));
  assert.ok(g.supernovaT > 0);
  assert.ok(g.balls.length >= 3, `balls: ${g.balls.length}`);
});

test('from sector 2, two wormhole locks start multiball', () => {
  const g = inPlay(124, 140, 0, 60, { sector: 2 });
  let ev = run(g, 30);
  assert.ok(types(ev).includes('lock'));
  assert.equal(g.locks, 1);
  assert.equal(g.phase, 'launch', 'a new ball is served');
  // Launch, then sink the new ball too.
  run(g, 40, { ...NONE, launch: true });
  run(g, 5);
  const b = g.balls.find((x) => !x.held);
  Object.assign(b, { x: 124, y: 140, vx: 0, vy: 60 });
  ev = run(g, 30);
  assert.ok(types(ev).includes('multiball'));
  run(g, 120);
  assert.ok(g.balls.length >= 3, `balls in play: ${g.balls.length}`);
  assert.ok(g.multiball);
  assert.ok(g.jackpotLit || g.stats.jackpots > 0, 'the jackpot is lit (or already collected)');
});

test('in sector 1 the wormhole just holds the ball and kicks it out', () => {
  const g = inPlay(124, 140, 0, 60);
  const ev = run(g, 120);
  assert.ok(types(ev).includes('wormhole'));
  assert.ok(types(ev).includes('kickout'));
  assert.equal(g.locks, 0);
});

test('nudging too much tilts the table', () => {
  const g = inPlay(82, 120);
  let tilted = false;
  for (let i = 0; i < 4 && !tilted; i++) {
    const ev = run(g, 1, { ...NONE, nudge: true });
    tilted = types(ev).includes('tilt');
  }
  assert.ok(tilted);
  run(g, 1, { ...NONE, left: true });
  assert.equal(g.table.flippers[0].held, false, 'dead flippers');
});

test('ball save relaunches a ball lost straight after launch', () => {
  const g = createGame({ seed: 2 });
  run(g, 30, { ...NONE, launch: true });
  run(g, 2);
  Object.assign(g.balls[0], { x: CX, y: 320, vx: 0, vy: 200 });
  const ev = run(g, 30);
  assert.ok(types(ev).includes('ballSaved'));
  assert.equal(g.ballsLeft, 3);
});

test('reaching the target warps to the next sector with an upgrade and a ball back', () => {
  const g = inPlay(82, 120, 0, 0, { keepTarget: true });
  const before = g.ballsLeft;
  g.sectorScore = g.target;
  let ev = run(g, 2);
  assert.ok(types(ev).includes('sectorClear'));
  ev = run(g, 60 * 3);
  assert.equal(g.phase, 'upgrade');
  assert.equal(g.offers.length, 3);
  assert.equal(new Set(g.offers).size, 3);
  assert.ok(pickUpgrade(g, 0));
  assert.equal(g.sector, 2);
  assert.equal(g.target, SECTORS[1].target);
  assert.equal(g.sectorScore, 0);
  assert.ok(g.ballsLeft >= before + 1);
  assert.equal(g.phase, 'launch');
});

test('sectors unlock comets, the black hole and the mothership', () => {
  assert.equal(createGame({ sector: 2 }).table.comet, null);
  assert.ok(createGame({ sector: 3 }).table.comet);
  assert.ok(createGame({ sector: 4 }).table.hole);
  const g = createGame({ sector: 5 });
  assert.ok(g.table.ship && g.table.ship.hp > 0);
});

test('every upgrade can be picked without breaking the next sector', () => {
  for (const u of UPGRADES) {
    const g = inPlay(82, 120);
    g.phase = 'upgrade';
    g.offers = [u.id];
    assert.ok(pickUpgrade(g, 0), u.id);
    run(g, 60 * 3, (gg) => autopilot(gg));
    assert.equal(g.sector, 2, u.id);
  }
});

test('the autopilot plays a whole game, and games are repeatable from a seed', () => {
  const play = (seed) => {
    const g = createGame({ seed });
    let f = 0;
    while (g.phase !== 'over' && f < 60 * 60 * 6) {
      if (g.phase === 'upgrade') pickUpgrade(g, 0);
      step(g, autopilot(g, 0.6));
      g.events.length = 0;
      f++;
    }
    return { score: g.score, sector: g.sector, over: g.phase === 'over', f };
  };
  const a = play(11), b = play(11);
  assert.deepEqual(a, b);
  assert.ok(a.score > 0);
  assert.ok(a.f > 60 * 20, 'it lasts a while');
});

test('the table fits the playfield', () => {
  const t = buildTable();
  for (const s of t.segments) {
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) assert.ok(x >= 0 && x <= TW && y >= 0 && y <= TH + 20, `${s.kind} at ${x},${y}`);
  }
});

test('the table is mirror-symmetric', () => {
  const t = buildTable();
  const key = (x, y) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const segs = new Set(t.segments.map((q) => [key(q.ax, q.ay), key(q.bx, q.by)].sort().join('|')));
  for (const q of t.segments) {
    const mirror = [key(m(q.ax), q.ay), key(m(q.bx), q.by)].sort().join('|');
    assert.ok(segs.has(mirror), `${q.kind} at ${q.ax},${q.ay} has a mirror`);
  }
  const circles = new Set(t.circles.map((c) => `${c.kind}:${key(c.x, c.y)}`));
  for (const c of t.circles) if (c.kind !== 'moon') assert.ok(circles.has(`${c.kind}:${key(m(c.x), c.y)}`), `${c.kind} at ${c.x},${c.y}`);
});

test('a ball shot up a ramp rides it and drops into the far orbit', () => {
  const g = inPlay(40, 124, 0, -500);
  let ev = run(g, 10);
  assert.ok(types(ev).includes('rampIn'));
  assert.equal(g.balls[0].held, 'ramp');
  ev = run(g, 40);
  const done = ev.find((e) => e.type === 'ramp');
  assert.ok(done, 'the ride finishes');
  assert.ok(done.x > CX, 'the left ramp ends on the right');
  assert.ok(g.score >= 25000);
});

test('rolling over all nine letters spells SUPERNOVA', () => {
  const g = inPlay(CX, 150);
  for (const q of g.table.letters.slice(0, 8)) q.lit = true;
  const last = g.table.letters[8];
  Object.assign(g.balls[0], { x: last.x, y: last.y - 6, vx: 0, vy: 120 });
  const ev = run(g, 10);
  assert.ok(types(ev).includes('letters'));
  assert.ok(g.table.letters.every((q) => !q.lit), 'the letters reset');
});

test('multiball balls launch themselves from the left lane', () => {
  const g = inPlay(CX, 150);
  const b = makeBall(8, 300);
  g.balls.push(b);
  run(g, 60);
  assert.ok(b.y < 200 || b.x > 14, 'the left lane ball is fired back out');
});
