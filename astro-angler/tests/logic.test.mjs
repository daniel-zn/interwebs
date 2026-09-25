import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, S } from '../src/game.js';
import { SPECIES, BY_ID, pickSpecies, rollSize, mulberry32, recordCatch, speciesWeights } from '../src/fish.js';

const DT = 1 / 60;

function run(game, secs, each) {
  for (let t = 0; t < secs; t += DT) {
    each?.(game);
    game.update(DT);
  }
}

function until(game, pred, maxSecs = 30, each) {
  for (let t = 0; t < maxSecs; t += DT) {
    if (pred(game)) return true;
    each?.(game);
    game.update(DT);
  }
  return pred(game);
}

function castTo(game, power) {
  game.press(); // IDLE -> CHARGE
  until(game, (g) => g.power >= power, 3);
  game.release();
}

/** A sensible human-ish reeling policy: hold unless the line is straining. */
function reelPolicy(limit = 0.7) {
  let holding = true;
  return (g) => {
    if (g.state !== S.REEL) return;
    const t = g.reel.tension;
    const want = holding ? t < limit : t < limit - 0.3;
    if (want !== holding) { holding = want; want ? g.press() : g.release(); }
  };
}

test('species table is well formed', () => {
  const ids = new Set();
  for (const s of SPECIES) {
    assert.ok(!ids.has(s.id), 'unique id ' + s.id);
    ids.add(s.id);
    assert.ok(s.size[0] < s.size[1]);
    assert.ok(s.strength >= 0 && s.strength <= 1);
    assert.ok(s.blurb.length > 10 && s.blurb.length < 80);
  }
  assert.equal(SPECIES.length, 10);
});

test('short casts favour shallow species, long casts reach the rare ones', () => {
  const rng = mulberry32(7);
  const near = {}, far = {};
  for (let i = 0; i < 5000; i++) {
    const n = pickSpecies(rng, 0.05).id, f = pickSpecies(rng, 1).id;
    near[n] = (near[n] || 0) + 1;
    far[f] = (far[f] || 0) + 1;
  }
  assert.equal(near.whale, undefined, 'no whales at the dock');
  assert.ok((near.minnow || 0) > 1500);
  assert.ok((far.whale || 0) > 150, 'whales exist at full distance');
  assert.ok((far.eel || 0) > 500);
  assert.ok(speciesWeights(0.5).every((w) => w >= 0));
});

test('rolled sizes stay in range', () => {
  const rng = mulberry32(3);
  for (const s of SPECIES) for (let i = 0; i < 200; i++) {
    const v = rollSize(rng, s);
    assert.ok(v >= s.size[0] && v <= s.size[1], `${s.id} ${v}`);
  }
});

test('recordCatch tracks new species and records', () => {
  const log = {};
  assert.deepEqual(recordCatch(log, 'perch', 12), { isNew: true, isRecord: false });
  assert.deepEqual(recordCatch(log, 'perch', 10), { isNew: false, isRecord: false });
  assert.deepEqual(recordCatch(log, 'perch', 20), { isNew: false, isRecord: true });
  assert.deepEqual(log.perch, { count: 3, best: 20 });
});

test('charge meter ping-pongs and cast distance follows power', () => {
  const g = new Game({ rng: mulberry32(1) });
  g.press(); g.release(); // leave title
  g.press();
  run(g, 1.5);
  assert.ok(g.power > 0.95);
  run(g, 0.75);
  assert.ok(g.power < 0.6 && g.power > 0.4, 'meter comes back down');
  g.release();
  assert.equal(g.state, S.CAST);
  assert.ok(g.target.u > -0.1 && g.target.u < 0.3);
});

test('full loop: cast, bite, hook, reel, land, release', () => {
  const events = [];
  const g = new Game({ rng: mulberry32(42), onEvent: (e, d) => events.push([e, d]) });
  g.press(); g.release();
  assert.equal(g.state, S.IDLE);
  castTo(g, 0.5);
  assert.ok(until(g, (x) => x.state === S.WAIT, 3));
  assert.ok(until(g, (x) => x.state === S.BITE, 30), 'a fish eventually bites');
  g.press(); // hook, keep holding to reel
  assert.equal(g.state, S.REEL);
  const policy = reelPolicy();
  assert.ok(until(g, (x) => x.state === S.CAUGHT, 60, policy), 'fish landed');
  const caught = events.find(([e]) => e === 'caught');
  assert.ok(caught && caught[1].species && caught[1].size > 0);
  g.release();
  run(g, 0.5);
  g.press();
  assert.equal(g.state, S.IDLE);
  assert.ok(events.some(([e]) => e === 'release'));
  const order = events.map(([e]) => e);
  for (const e of ['start', 'charge', 'cast', 'splash', 'approach', 'bite', 'hook', 'land', 'caught', 'release']) {
    assert.ok(order.includes(e), 'event ' + e);
  }
});

test('missing the bite lets the fish go, then waiting continues', () => {
  const events = [];
  const g = new Game({ rng: mulberry32(5), onEvent: (e) => events.push(e) });
  g.press(); g.release();
  castTo(g, 0.3);
  assert.ok(until(g, (x) => x.state === S.BITE, 30));
  run(g, 1.3);
  assert.equal(g.state, S.WAIT);
  assert.ok(events.includes('miss'));
});

test('pressing during a nibble spooks the fish (but not in relaxed mode)', () => {
  for (const relaxed of [false, true]) {
    const events = [];
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const g = new Game({ rng: mulberry32(seed), relaxed, onEvent: (e) => events.push(e) });
      g.press(); g.release();
      castTo(g, 0.4);
      if (!until(g, (x) => x.fish?.phase === 'nibble' && x.fish.nibbles > 0, 30)) continue;
      found = true;
      g.press();
      assert.equal(g.state, S.WAIT);
      assert.equal(g.fish.phase, relaxed ? 'nibble' : 'flee');
    }
    assert.ok(found);
    assert.ok(events.includes(relaxed ? 'patience' : 'spook'));
  }
});

test('pressing while nothing is biting reels the line back in', () => {
  const g = new Game({ rng: mulberry32(9) });
  g.press(); g.release();
  castTo(g, 0.5);
  until(g, (x) => x.state === S.WAIT, 3);
  g.press();
  assert.equal(g.state, S.IDLE);
});

function reelOutcome(seed, speciesId, policy, relaxed = false) {
  const events = [];
  const g = new Game({ rng: mulberry32(seed), relaxed, onEvent: (e) => events.push(e) });
  g.press(); g.release();
  castTo(g, 0.5);
  until(g, (x) => x.state === S.BITE, 40);
  g.fish.species = BY_ID[speciesId];
  g.press();
  until(g, (x) => x.state === S.LAND || x.state === S.LOST, 90, policy);
  return g.state === S.LAND ? 'land' : g.lostKind;
}

test('reeling is winnable with care for every species', () => {
  for (const s of SPECIES) {
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) if (reelOutcome(seed, s.id, reelPolicy()) === 'land') wins++;
    assert.ok(wins >= 18, `${s.id}: ${wins}/20`);
  }
});

test('holding blindly snaps the line on strong fish; relaxed mode never snaps', () => {
  const hold = () => {};
  let snaps = 0;
  for (let seed = 1; seed <= 10; seed++) if (reelOutcome(seed, 'eel', hold) === 'snap') snaps++;
  assert.ok(snaps >= 8, `eel snaps ${snaps}/10`);
  for (let seed = 1; seed <= 10; seed++) assert.equal(reelOutcome(seed, 'whale', hold, true), 'land');
});
