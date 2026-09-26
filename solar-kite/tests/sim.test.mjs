// Unit tests for the kite's rules (src/sim.js), run with `node --test`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { COMBO_TIME, SESSION, TURN, comboMult, createRun, demoPilot, powerAt, spawnObject, step, steerToward } from '../src/sim.js';

const DT = 1 / 60;

/** Steps a run with an input function until `until` says stop; collects events. */
function fly(run, inputFn, { until = (r) => r.phase !== 'fly', max = 200 } = {}) {
  const events = [];
  const mem = {};
  const t0 = run.t;
  while (!until(run) && run.t - t0 < max) {
    step(run, DT, inputFn(run, mem));
    events.push(...run.events);
    run.events.length = 0;
  }
  return events;
}

/** A calm run: nothing floating about, no weather, no radio calls. */
function calmRun(seed = 1, opts = {}) {
  const run = createRun({ seed, ...opts });
  run.objects = [];
  run.nextObj = run.nextRings = run.nextWeather = run.nextCall = 1e9;
  return run;
}

/** Climb into the power zone first so loops don't touch the ground. */
function climb(run) {
  fly(run, (r) => ({ turn: steerToward(r, 95, 45) }), { until: (r) => Math.hypot(r.k.x - 95, r.k.y - 45) < 6, max: 10 });
}

const tricks = (events) => events.filter((e) => e.type === 'trick');

test('the power zone is fastest and the edge of the window is slowest', () => {
  assert.ok(powerAt(94, 0).power > 0.99);
  assert.ok(powerAt(94, 88).power < 0.01);
  assert.ok(powerAt(94, 20).power > powerAt(40, 60).power);
});

test('with no input the kite parks at the edge of the window and never crashes', () => {
  const run = calmRun(2);
  const events = fly(run, () => ({ turn: 0 }), { max: 30 });
  assert.equal(events.filter((e) => e.type === 'crash').length, 0);
  assert.ok(powerAt(run.k.x, run.k.y).q > 0.85, `q ${powerAt(run.k.x, run.k.y).q}`);
  assert.ok(run.k.s < 20);
});

test('diving into the ground crashes, drops the combo and relaunches', () => {
  const run = calmRun(3);
  climb(run);
  run.combo = { pts: 500, count: 2, timer: 2, kinds: { loop: 1, ring: 1 }, names: ['LOOP', 'RING 1/4'] };
  const events = fly(run, (r) => ({ turn: steerToward(r, r.k.x, -20) }), { until: (r) => r.k.state === 'crashed', max: 10 });
  assert.equal(run.k.state, 'crashed');
  assert.ok(events.some((e) => e.type === 'drop' && e.pts === 1000));
  assert.equal(run.combo.count, 0);
  assert.equal(run.stats.crashes, 1);
  const after = fly(run, () => ({ turn: 0 }), { until: (r) => r.k.state === 'fly', max: 5 });
  assert.ok(after.some((e) => e.type === 'relaunch'));
});

test('gentle mode bounces off the ground instead of crashing', () => {
  const run = calmRun(3, { gentle: true });
  climb(run);
  const events = fly(run, (r) => ({ turn: steerToward(r, r.k.x, -20) }), { until: (r) => r.stats.crashes > 0, max: 6 });
  assert.equal(run.stats.crashes, 0);
  assert.ok(events.some((e) => e.type === 'scrape'));
  assert.ok(run.k.y >= 1);
});

test('turning a full circle is a loop; carrying on chains double and triple loops', () => {
  const run = calmRun(4);
  climb(run);
  const events = fly(run, () => ({ turn: 1 }), { until: (r) => r.stats.loops >= 3, max: 8 });
  const names = tricks(events).map((e) => e.name.replace(/^(TIGHT|HUGE) /, ''));
  assert.deepEqual(names.slice(0, 3), ['LOOP', 'DOUBLE LOOP', 'TRIPLE LOOP']);
  assert.ok(run.twist > 2.5, `twist ${run.twist}`);
  // A full-lock loop takes a little under 2 seconds.
  assert.ok(run.t < 20);
});

test('a loop one way and then the other is a figure 8', () => {
  const run = calmRun(5);
  climb(run);
  const start = run.twist;
  let dir = 1;
  const events = fly(run, (r) => {
    if (dir === 1 && r.twist - start >= 1.02) dir = -1;
    return { turn: dir };
  }, { until: (r) => r.stats.fig8 >= 1, max: 8 });
  assert.ok(tricks(events).some((e) => e.kind === 'fig8'), tricks(events).map((e) => e.name).join());
});

test('twists slow the turning down, and unwinding them scores an untwist', () => {
  const run = calmRun(6);
  climb(run);
  run.twist = 5;
  run.twistPeak = 5;
  const th = run.k.th;
  step(run, 0.1, { turn: 1 });
  const slowed = run.k.th - th;
  assert.ok(slowed < TURN * 0.1 * 0.9, `turned ${slowed}`);
  run.twist = 0.4;
  run.events.length = 0;
  const events = fly(run, () => ({ turn: -1 }), { until: (r) => Math.abs(r.twist) < 0.3, max: 3 });
  assert.ok(tricks(events).some((e) => e.kind === 'untwist'));
});

test('circling a floating object orbits it; flying into it is a bonk', () => {
  const run = calmRun(7);
  climb(run);
  spawnObject(run, 'sat', 100, 45);
  const o = run.objects[0];
  o.vx = 0;
  o.bob = 0;
  const events = fly(run, (r) => {
    // Chase a point running round the satellite at a safe distance.
    const a = Math.atan2(r.k.y - o.y, r.k.x - o.x) + 0.9;
    return { turn: steerToward(r, o.x + Math.cos(a) * 12, o.y + Math.sin(a) * 12) };
  }, { until: (r) => r.stats.orbits >= 1, max: 15 });
  const orbit = tricks(events).find((e) => e.kind === 'orbit-sat');
  assert.ok(orbit, tricks(events).map((e) => e.name).join());
  assert.equal(orbit.name, 'ORBIT SATELLITE');

  run.k.x = o.x - 8;
  run.k.y = o.y;
  run.k.th = 0;
  const bonks = run.stats.bonks;
  const hit = fly(run, () => ({ turn: 0 }), { until: (r) => r.stats.bonks > bonks, max: 2 });
  assert.ok(hit.some((e) => e.type === 'bonk'));
  assert.equal(run.k.state, 'tumble');
});

test('the multiplier counts different tricks; repeats only add a little', () => {
  assert.equal(comboMult({ count: 4, kinds: { loop: 4 } }), 1);
  assert.equal(comboMult({ count: 5, kinds: { loop: 5 } }), 2);
  assert.equal(comboMult({ count: 4, kinds: { loop: 1, fig8: 1, ring: 1, skim: 1 } }), 4);
  assert.equal(comboMult({ count: 40, kinds: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 } }), 10);
});

test('combos add up, repeats score less, and they bank after a pause', () => {
  const run = calmRun(8);
  climb(run);
  const events = fly(run, () => ({ turn: 1 }), { until: (r) => r.stats.loops >= 4, max: 12 });
  const pts = tricks(events).map((e) => e.pts);
  assert.equal(run.combo.count, 4);
  assert.equal(run.combo.pts, pts.reduce((a, b) => a + b, 0));
  // The 4th loop is worth more by name (x4) but decays as a repeat.
  assert.ok(pts[3] < pts[1], pts.join());
  const before = run.score;
  const bank = fly(run, (r) => ({ turn: steerToward(r, 95, 45) * 0.1 }), { until: (r) => r.combo.count === 0, max: COMBO_TIME + 1 });
  const b = bank.find((e) => e.type === 'bank');
  assert.ok(b);
  assert.equal(b.mult, 1);
  assert.equal(run.score - before, b.total);
});

test('radio calls pay out when the requested trick lands', () => {
  const run = calmRun(9);
  climb(run);
  run.call = { kind: 'loop', t: 12, max: 12 };
  const events = fly(run, () => ({ turn: 1 }), { until: (r) => !r.call, max: 5 });
  assert.ok(events.some((e) => e.type === 'callDone' && e.pts === 500));
  assert.equal(run.stats.calls, 1);
});

test('flying through flux rings scores each ring and the whole chain', () => {
  const run = calmRun(10);
  climb(run);
  run.rings = [{ id: 1, total: 2, got: 0, ttl: 10, rings: [{ x: run.k.x + 1, y: run.k.y, hit: false }, { x: run.k.x + 2, y: run.k.y, hit: false }] }];
  step(run, DT, { turn: 0 });
  const names = run.events.filter((e) => e.type === 'trick').map((e) => e.name);
  assert.deepEqual(names, ['RING 1/2', 'RING 2/2', 'RING CHAIN']);
});

test('skimming low over the ground scores when you climb back out', () => {
  const run = calmRun(11);
  run.k.x = 90;
  run.k.y = 4;
  run.k.th = 0;
  run.k.grace = 0;
  let t = 0;
  const events = fly(run, (r) => {
    t += DT;
    if (t < 1) return { turn: steerToward(r, r.k.x + 30, 4) };
    return { turn: steerToward(r, r.k.x + 10, 30) };
  }, { until: (r) => r.stats.skims > 0 || r.stats.crashes > 0, max: 4 });
  assert.equal(run.stats.crashes, 0);
  assert.ok(tricks(events).some((e) => e.kind === 'skim' && e.pts >= 90));
});

test('weather: flares speed the wind up and double points, lulls slow it down', () => {
  const run = calmRun(12);
  run.nextWeather = 0;
  run.rng = () => 0.1; // always a flare
  fly(run, () => ({ turn: 0 }), { until: (r) => r.weather && r.weather.phase === 'on', max: 5 });
  fly(run, () => ({ turn: 0 }), { max: 3 });
  assert.ok(run.wind > 1.2, `wind ${run.wind}`);
  assert.equal(run.flareMul, 2);
  const lull = calmRun(12);
  lull.nextWeather = 0;
  lull.rng = () => 0.9;
  fly(lull, () => ({ turn: 0 }), { until: (r) => r.weather && r.weather.phase === 'on', max: 5 });
  fly(lull, () => ({ turn: 0 }), { max: 3 });
  assert.ok(lull.wind < 0.75, `wind ${lull.wind}`);
});

test('the session ends at sunset with a rank, banking any combo in progress', () => {
  const run = calmRun(13);
  run.t = SESSION - 0.5;
  run.combo = { pts: 300, count: 2, timer: 2, kinds: { loop: 1, skim: 1 }, names: ['LOOP', 'REGOLITH SKIM'] };
  const events = fly(run, () => ({ turn: 0 }), { max: 2 });
  assert.equal(run.phase, 'done');
  assert.equal(run.score, 600);
  assert.ok(events.some((e) => e.type === 'end'));
  assert.match(run.result.rating, /^[SABCD]$/);
});

test('the demo pilot flies a whole session without crashing and racks up tricks', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const run = createRun({ seed });
    fly(run, (r, m) => ({ turn: demoPilot(r, m) }), { max: SESSION + 5 });
    assert.equal(run.phase, 'done');
    assert.ok(run.stats.crashes <= 1, `seed ${seed}: ${run.stats.crashes} crashes`);
    assert.ok(run.stats.loops > 10, `seed ${seed}: ${run.stats.loops} loops`);
    assert.ok(run.score > 3000, `seed ${seed}: ${run.score}`);
  }
});

test('runs are repeatable from a seed', () => {
  const a = createRun({ seed: 42 }), b = createRun({ seed: 42 });
  fly(a, (r, m) => ({ turn: demoPilot(r, m) }), { max: 40 });
  fly(b, (r, m) => ({ turn: demoPilot(r, m) }), { max: 40 });
  assert.equal(a.score, b.score);
  assert.equal(a.k.x, b.k.x);
});
