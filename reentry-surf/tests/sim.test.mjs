// Unit tests for the ride's rules (src/sim.js), run with `node --test`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRun, hotAt, rate, spawn, speedN, step, thinAt, V_END } from '../src/sim.js';

const DT = 1 / 60;

/** Plays a run to the end with a fixed input function; returns the run. */
function play(seed, inputFn, opts = {}) {
  const run = createRun({ seed, ...opts });
  const mem = {};
  while (run.phase === 'ride' && run.t < 400) {
    step(run, DT, inputFn(run, mem));
    run.events.length = 0;
  }
  return run;
}

/** Hold-to-dive pilot aiming for the middle of the corridor. */
function pilot(run, mem) {
  const d = run.alt - hotAt(run, run.x + 20);
  const predicted = d + run.vy * 0.6;
  const target = run.width * 0.5;
  if (!mem.holding && predicted > target + 2) mem.holding = true;
  else if (mem.holding && predicted < target - 1.5) mem.holding = false;
  return mem.holding ? -1 : 0;
}

test('holding dive the whole way burns up quickly', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const run = play(seed, () => -1);
    assert.equal(run.phase, 'burned');
    assert.ok(run.t < 15, `burned at ${run.t}`);
    assert.equal(run.result.rating, null);
  }
});

test('pulling up the whole way skips out', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const run = play(seed, () => 1);
    assert.equal(run.phase, 'skipped');
    assert.ok(run.t < 30, `skipped at ${run.t}`);
  }
});

test('a steady pilot rides the corridor to the chute in 1-3 minutes', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const run = play(seed, pilot);
    assert.equal(run.phase, 'landed', `seed ${seed}`);
    assert.ok(run.t > 60 && run.t < 180, `landed after ${run.t}s`);
    assert.ok(run.v <= V_END);
    assert.match(run.result.rating, /^[SABCD]$/);
    assert.ok(run.result.bonus >= 500);
  }
});

test('the corridor sinks as you slow down, and gentle mode widens it downwards', () => {
  const run = createRun({ seed: 3 });
  const high = hotAt(run, 0);
  run.v = 3;
  assert.ok(hotAt(run, 0) < high - 15);
  assert.ok(Math.abs(thinAt(run, 0) - hotAt(run, 0) - run.width) < 1e-9);
  const gentle = createRun({ seed: 3, gentle: true });
  assert.ok(gentle.width > run.width);
  assert.ok(hotAt(gentle, 0) < hotAt(createRun({ seed: 3 }), 0));
});

test('heat builds below the hot line and skip builds above the thin line', () => {
  const run = createRun({ seed: 2 });
  run.alt = hotAt(run, run.x) - 4;
  run.vy = 0;
  step(run, 0.1, 0);
  assert.ok(run.heat > 0);
  assert.equal(run.skip, 0);
  const high = createRun({ seed: 2 });
  high.alt = thinAt(high, high.x) + 4;
  high.vy = 0;
  step(high, 0.1, 0);
  assert.ok(high.skip > 0);
  assert.equal(high.heat, 0);
});

test('warnings fire before failures', () => {
  const run = createRun({ seed: 5 });
  const warned = [];
  while (run.phase === 'ride') {
    step(run, DT, -1);
    for (const e of run.events) if (e.type === 'warn') warned.push(e.kind);
    run.events.length = 0;
  }
  assert.equal(run.phase, 'burned');
  assert.ok(warned.includes('heat'));
});

test('debris hits add heat and reset flow; coolant vents heat', () => {
  const run = createRun({ seed: 9 });
  run.flow = 4;
  run.objects.push({ kind: 'debris', x: run.x + 0.5, alt: run.alt, vy: 0, r: 1.6, sprite: 0, spin: 0, announced: true, hit: false, passed: false });
  const heat0 = run.heat;
  step(run, DT, 0);
  assert.ok(run.heat >= heat0 + 0.2);
  assert.equal(run.flow, 1);
  assert.ok(run.events.some((e) => e.type === 'hit'));
  run.heat = 0.8;
  run.objects.push({ kind: 'coolant', x: run.x + 0.5, alt: run.alt, r: 3.2, taken: false });
  step(run, DT, 0);
  assert.ok(run.heat < 0.5);
});

test('every hazard kind can spawn and the director keeps events coming', () => {
  const run = createRun({ seed: 12 });
  for (const kind of ['debris', 'updraft', 'storm', 'jet', 'coolant']) spawn(run, kind);
  const kinds = new Set(run.objects.map((o) => o.kind));
  assert.equal(kinds.size, 5);
  assert.equal(run.storms.length, 1);
  const played = play(4, pilot);
  assert.ok(played.eventCount >= 12, `${played.eventCount} events`);
});

test('runs are repeatable from a seed', () => {
  const a = play(21, pilot), b = play(21, pilot);
  assert.equal(a.result.score, b.result.score);
  assert.equal(a.t, b.t);
});

test('ratings rise with score', () => {
  assert.equal(rate(0), 'D');
  assert.equal(rate(30000), 'S');
  assert.ok(speedN(7.8) === 1 && speedN(0.5) === 0);
});
