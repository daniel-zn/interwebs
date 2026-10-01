// Rules tests: paylines, charms, the shop, days, debts, transmissions.
//   node --test tests/sim.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHARMS, DAYS, FINAL_ROUND, LINES, MAX_CHARMS, PACKAGES, VOID, debtFor } from '../src/data.js';
import {
  buy, canPayEarly, choosePackage, createRun, earlyBonus, findLines, finishDay, goEndless, payDebt, pickOffer,
  reroll, sell, spin, spinsFor, symbolWeights,
} from '../src/sim.js';

/** Builds a grid (grid[col][row]) from three row strings of symbol letters. */
const L = { c: 'comet', m: 'moon', p: 'planet', r: 'rocket', a: 'alien', g: 'gem', s: 'seven', v: VOID };
function grid(...rows) {
  const g = [];
  for (let c = 0; c < 5; c++) g.push(rows.map((row) => L[row[c]]));
  return g;
}
const kinds = (lines) => lines.map((l) => l.kind).sort();
function spinRun(extra = {}) {
  const run = createRun({ seed: 42 });
  Object.assign(run, extra);
  choosePackage(run, 0);
  return run;
}

test('there are 34 line templates', () => {
  assert.equal(LINES.length, 9 + 6 + 3 + 5 + 6 + 2 + 3 + 1);
});

test('a lone row of three pays once', () => {
  const run = createRun();
  const lines = findLines(run, grid('sssmp', 'mpcra', 'crmpg'));
  assert.deepEqual(kinds(lines), ['row3']);
  assert.equal(lines[0].sym, 'seven');
});

test('a full row pays as one long line, not as its shorter parts', () => {
  const run = createRun();
  assert.deepEqual(kinds(findLines(run, grid('ggggg', 'mpcra', 'crmpg'))), ['row5']);
  assert.deepEqual(kinds(findLines(run, grid('ggggm', 'mpcra', 'crmpg'))), ['row4']);
});

test('columns, diagonals, zig and zag', () => {
  const run = createRun();
  assert.deepEqual(kinds(findLines(run, grid('cmpra', 'cgsmp', 'crgap'))), ['column']);
  assert.deepEqual(kinds(findLines(run, grid('arpcm', 'gasmp', 'crarp'))), ['diag']);
  assert.deepEqual(kinds(findLines(run, grid('rgpcr', 'crgrm', 'mpraa'))).includes('zig'), true);
  assert.deepEqual(kinds(findLines(run, grid('mpraa', 'crgrm', 'rgpcr'))).includes('zag'), true);
});

test('orbit: eight matching cells round a different middle', () => {
  const run = createRun();
  const lines = findLines(run, grid('pmmmg', 'rmamc', 'cmmms'));
  assert.ok(kinds(lines).includes('orbit'));
});

test('a full screen of one symbol is a jackpot and pays everything else too', () => {
  const run = createRun();
  const lines = findLines(run, grid('sssss', 'sssss', 'sssss'));
  const k = kinds(lines);
  assert.ok(k.includes('jackpot'));
  assert.equal(k.filter((x) => x === 'row5').length, 3);
  assert.equal(k.filter((x) => x === 'column').length, 5);
  assert.equal(k.filter((x) => x === 'row3').length, 0);
});

test('void eyes never match, and wild aliens do', () => {
  const run = createRun();
  assert.equal(findLines(run, grid('vvvmp', 'mpcra', 'crmpg')).length, 0);
  assert.equal(findLines(run, grid('sasmp', 'mpcrg', 'crmpg')).length, 0);
  run.charms.push('wild_alien');
  const lines = findLines(run, grid('sasmp', 'mpcrg', 'crmpg'));
  assert.deepEqual(kinds(lines), ['row3']);
  assert.equal(lines[0].sym, 'seven');
  // Aliens can't complete a line of void eyes.
  assert.equal(findLines(run, grid('vavmp', 'mpcrg', 'crmpg')).length, 0);
});

test('a spin pays value x pattern mult, and the run keeps the coins', () => {
  const run = spinRun();
  const res = spin(run, grid('sssmp', 'mpcra', 'crmpg'));
  assert.equal(res.total, 7);
  assert.equal(run.coins, 7);
  assert.equal(run.spinsLeft, PACKAGES[0].spins - 1);
  const res2 = spin(run, grid('ggggg', 'mpcra', 'crmpg'));
  assert.equal(res2.total, 5 * 3);
});

test('three void eyes anywhere eat a quarter of your coins and cancel the win', () => {
  const run = spinRun({ coins: 100 });
  const res = spin(run, grid('sssvp', 'mvcra', 'crmpv'));
  assert.equal(res.voided, true);
  assert.equal(res.total, 0);
  assert.equal(res.bite, 25);
  assert.equal(run.coins, 75);
  // Event Horizon turns it into a payout instead.
  const run2 = spinRun({ coins: 100 });
  run2.charms.push('event_horizon');
  const r2 = spin(run2, grid('mpcvp', 'mvcra', 'crmpv'));
  assert.equal(r2.voided, false);
  assert.equal(r2.total, 66);
  assert.equal(run2.coins, 166);
});

test('void eyes get more common each round, and charms change that', () => {
  const run = createRun();
  const w1 = symbolWeights(run).void;
  run.round = 6;
  const w6 = symbolWeights(run).void;
  assert.ok(w6 > w1 * 2);
  run.charms.push('void_ward');
  assert.ok(Math.abs(symbolWeights(run).void - w6 * 0.25) < 1e-9);
});

test('Horseshoe Magnet adds 2 luck while you hold it', async () => {
  const { luckOf } = await import('../src/sim.js');
  const run = createRun();
  run.charms.push('horseshoe');
  const lucky = createRun();
  lucky.luck = 2;
  assert.equal(luckOf(run), 2);
  assert.deepEqual(symbolWeights(run), symbolWeights(lucky));
  run.charms = [];
  assert.equal(luckOf(run), 0);
});

test('charms: doublers, pattern boosts, echo, finale, double down, tip jar', () => {
  let run = spinRun();
  run.charms.push('comet_tail', 'horizon');
  // Comet worth 4 (doubled), row3 mult 1 + 1.
  assert.equal(spin(run, grid('cccmp', 'mpgra', 'grmpg')).total, 8);

  run = createRun({ seed: 1 });
  run.charms.push('echo');
  choosePackage(run, 0);
  assert.equal(spin(run, grid('sssmp', 'mpcra', 'crmpg')).total, 14);
  assert.equal(spin(run, grid('sssmp', 'mpcra', 'crmpg')).total, 7);

  run = createRun({ seed: 1 });
  run.charms.push('finale');
  choosePackage(run, 0);
  run.spinsLeft = 1;
  assert.equal(spin(run, grid('sssmp', 'mpcra', 'crmpg')).total, 21);

  run = createRun({ seed: 1 });
  run.charms.push('double_down');
  assert.equal(spinsFor(run, 0), PACKAGES[0].spins - 2);
  choosePackage(run, 0);
  assert.equal(spin(run, grid('sssmp', 'mpcra', 'crmpg')).total, 14);

  run = spinRun({ round: 3 });
  run.charms.push('tip_jar');
  assert.equal(spin(run, grid('mpcra', 'crmpg', 'mpcra')).total, 9);
});

test('scaling charms grow with wins and reset or keep as described', () => {
  const run = spinRun();
  run.charms.push('streak', 'dark_matter');
  const win = grid('sssmp', 'mpcra', 'crmpg');
  const lose = grid('mpcra', 'crmpg', 'mpcra');
  assert.equal(spin(run, win).total, 7); // mult 1 before this win counts
  assert.equal(run.streak, 1);
  assert.equal(spin(run, win).total, Math.round(7 * (1 + 1 + 0.25)));
  spin(run, lose);
  assert.equal(run.streak, 0);
  assert.equal(run.darkMatter, 2);
});

test('a paying Event Horizon is a win: the streak goes on and Wormhole never frees it', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const run = createRun({ seed });
    run.charms.push('event_horizon', 'wormhole', 'streak');
    choosePackage(run, 0);
    run.streak = 4;
    const res = spin(run, grid('mpcvp', 'mvcra', 'crmpv'));
    assert.equal(res.total, 66);
    assert.equal(res.free, false);
    assert.equal(run.streak, 5);
  }
});

test('the shop: buying, selling, rerolling, full slots', () => {
  const run = createRun({ seed: 9 });
  assert.equal(run.shop.length, 4);
  assert.equal(new Set(run.shop).size, 4);
  run.tickets = 100;
  const id = run.shop[0];
  assert.equal(buy(run, 0).ok, true);
  assert.deepEqual(run.charms, [id]);
  assert.equal(run.shop[0], null);
  assert.equal(buy(run, 0).ok, false);
  const before = run.tickets;
  assert.equal(reroll(run).ok, true);
  assert.equal(run.tickets, before - 1);
  assert.ok(!run.shop.includes(id), 'owned charms are not offered again');
  assert.equal(reroll(run).ok, true);
  assert.equal(run.tickets, before - 1 - 2, 'rerolls cost more each time');
  // Fill every slot.
  while (run.charms.length < MAX_CHARMS) {
    const i = run.shop.findIndex(Boolean);
    if (i < 0) reroll(run);
    else buy(run, i);
  }
  run.rerolls = 0;
  reroll(run);
  assert.equal(buy(run, 0).reason, 'CHARM SLOTS FULL');
  const t = run.tickets;
  assert.equal(sell(run, 0).ok, true);
  assert.equal(run.charms.length, MAX_CHARMS - 1);
  assert.ok(run.tickets > t);
});

test('a round: three days, a deadline, a transmission, then the next round', () => {
  const run = createRun({ seed: 3 });
  for (let d = 1; d <= DAYS; d++) {
    assert.equal(run.phase, 'shop');
    assert.equal(run.day, d);
    choosePackage(run, 0);
    while (run.phase === 'spin') spin(run, grid('mpcra', 'crmpg', 'mpcra'));
    assert.equal(run.phase, 'dayEnd');
    finishDay(run);
  }
  assert.equal(run.phase, 'deadline');
  run.coins = run.debt + 5;
  const paid = payDebt(run);
  assert.equal(paid.paid, true);
  assert.equal(run.coins, 5);
  assert.equal(run.phase, 'transmit');
  assert.equal(run.offers.length, 3);
  assert.equal(new Set(run.offers.map((o) => o.key)).size, 3);
  pickOffer(run, 0);
  assert.equal(run.round, 2);
  assert.equal(run.day, 1);
  assert.equal(run.debt, debtFor(2));
  assert.equal(run.phase, 'shop');
});

test('not paying the debt ends the run', () => {
  const run = createRun();
  run.phase = 'deadline';
  run.coins = run.debt - 1;
  assert.equal(payDebt(run).paid, false);
  assert.equal(run.phase, 'over');
});

test('paying early skips the rest of the round for bonus tickets', () => {
  const run = createRun();
  assert.equal(canPayEarly(run), false, 'not on the first day');
  run.day = 2;
  run.coins = run.debt;
  assert.equal(canPayEarly(run), true);
  const t = run.tickets;
  const bonus = earlyBonus(run);
  assert.equal(payDebt(run, true).bonus, bonus);
  assert.equal(run.tickets, t + bonus);
  assert.equal(run.phase, 'transmit');
});

test('paying the last debt escapes; endless mode keeps going', () => {
  const run = createRun();
  run.round = FINAL_ROUND;
  run.debt = debtFor(FINAL_ROUND);
  run.phase = 'deadline';
  run.coins = run.debt;
  payDebt(run);
  assert.equal(run.phase, 'won');
  goEndless(run);
  assert.equal(run.phase, 'transmit');
  pickOffer(run, 0);
  assert.equal(run.round, FINAL_ROUND + 1);
  assert.ok(run.debt > debtFor(FINAL_ROUND));
});

test('an escape is recorded even if endless mode swallows you later', async () => {
  const { loadStore } = await import('../src/storage.js');
  const store = loadStore();
  const run = createRun();
  run.round = FINAL_ROUND;
  run.debt = debtFor(FINAL_ROUND);
  run.phase = 'deadline';
  run.coins = run.debt;
  payDebt(run);
  goEndless(run);
  pickOffer(run, 0);
  run.phase = 'deadline';
  run.coins = 0;
  payDebt(run);
  store.record(run);
  assert.equal(store.best.escaped, 1);
  assert.equal(store.best.round, FINAL_ROUND + 1);
});

test('debts rise every round', () => {
  for (let r = 1; r < 14; r++) assert.ok(debtFor(r + 1) > debtFor(r), `round ${r}`);
});

test('every charm has a name and a description', () => {
  for (const c of CHARMS) {
    assert.ok(c.name && c.desc, c.id);
    assert.ok(c.name.length <= 16, `${c.id} name fits`);
  }
});

test('runs are repeatable from a seed and survive a JSON round trip', () => {
  const play = (run, n) => {
    choosePackage(run, 0);
    const out = [];
    for (let i = 0; i < n; i++) out.push(spin(run).total);
    return out;
  };
  const a = createRun({ seed: 77 });
  const b = createRun({ seed: 77 });
  assert.deepEqual(play(a, 5), play(b, 5));
  const c = JSON.parse(JSON.stringify(a));
  a.phase = c.phase = 'spin';
  a.spinsLeft = c.spinsLeft = 3;
  assert.deepEqual([spin(a).total, spin(a).total], [spin(c).total, spin(c).total]);
});

// ---------------------------------------------------------------- unlocking mechanics
test('mechanics unlock round by round, each with one card', async () => {
  const { pendingUnlocks, markSeen } = await import('../src/sim.js');
  const run = createRun();
  assert.deepEqual(pendingUnlocks(run).map((u) => u.id), []);
  run.round = 3;
  assert.deepEqual(pendingUnlocks(run).map((u) => u.id), ['overdrive', 'gold']);
  markSeen(run, 'overdrive');
  markSeen(run, 'gold');
  run.round = 5;
  assert.deepEqual(pendingUnlocks(run).map((u) => u.id), ['pulsar', 'events']);
});

test('overdrive: winning spins charge it, then three spins pay x3', () => {
  const run = spinRun({ round: 2 });
  run.spinsLeft = 20;
  const win = grid('sssmp', 'mpcra', 'crmpg');
  let started = null;
  for (let i = 0; i < 10 && !started; i++) {
    const r = spin(run, win);
    if (r.overdriveStart) started = i;
  }
  assert.ok(started !== null, 'the meter fills');
  assert.equal(run.overdrive, 3);
  assert.equal(run.charge, 0);
  const boosted = spin(run, win);
  assert.equal(boosted.overdrive, true);
  assert.equal(boosted.total, 21);
  spin(run, win);
  spin(run, win);
  assert.equal(run.overdrive, 0);
  assert.equal(spin(run, win).total, 7);
  // No overdrive in round 1.
  const r1 = spinRun();
  r1.spinsLeft = 20;
  for (let i = 0; i < 10; i++) spin(r1, win);
  assert.equal(r1.charge, 0);
});

test('golden symbols double their line for each gold cell, up to x8', () => {
  const run = spinRun({ round: 3 });
  const res = spin(run, grid('sssmp', 'mpcra', 'crmpg'), ['0,0', '2,0']);
  assert.equal(res.lines[0].gold, 2);
  assert.equal(res.total, 7 * 4);
  const all = spin(run, grid('ggggg', 'mpcra', 'crmpg'), ['0,0', '1,0', '2,0', '3,0', '4,0']);
  assert.equal(all.total, 5 * 3 * 8);
});

test('three pulsars spin the bonus wheel, and pulsars never make lines', () => {
  const run = spinRun({ round: 4, debt: 180 });
  const before = { coins: run.coins, tickets: run.tickets, spins: run.spinsLeft, luck: run.luck };
  const res = spin(run, [['pulsar', 'moon', 'pulsar'], ['pulsar', 'moon', 'gem'], ['comet', 'planet', 'rocket'], ['gem', 'rocket', 'alien'], ['seven', 'rocket', 'comet']]);
  assert.ok(res.wheel, 'the wheel spins');
  assert.equal(res.lines.length, 0, 'pulsars pay nothing on their own');
  const w = res.wheel;
  if (w.kind === 'coins') assert.equal(run.coins, before.coins + w.amount);
  if (w.kind === 'tickets') assert.equal(run.tickets, before.tickets + w.amount);
  if (w.kind === 'spins') assert.equal(run.spinsLeft, before.spins - 1 + w.amount);
  if (w.kind === 'luck') assert.equal(run.luck, before.luck + 1);
  if (w.kind === 'overdrive') assert.equal(run.overdrive, 3);
  assert.equal(findLines(run, grid('mmmcr', 'rcagp', 'gprac').map((col, c) => (c === 1 ? ['pulsar', col[1], col[2]] : col))).length, 0);
});

test('Grand Finale pays once a day, even when the wheel adds spins to the last one', () => {
  const win = grid('sssmp', 'mpcra', 'crmpg');
  const wheel = grid('sssmp', 'mpcra', 'crmpg');
  wheel[3] = ['pulsar', 'pulsar', 'pulsar'];
  for (let seed = 1; seed < 200; seed++) {
    const run = createRun({ seed });
    run.round = 4;
    run.charms.push('finale');
    choosePackage(run, 0);
    run.spinsLeft = 1;
    const res = spin(run, wheel);
    if (!res.wheel || res.wheel.kind !== 'spins') continue;
    assert.equal(res.last, false);
    assert.equal(res.total, 7, 'not the last spin after all');
    let finales = 0;
    while (run.phase === 'spin') if (spin(run, win).tags.includes('FINALE X3')) finales++;
    assert.equal(finales, 1);
    return;
  }
  assert.fail('no wheel landed on +3 spins');
});

test('every wheel slice pays what it says', async () => {
  const { applyWheel } = await import('../src/sim.js');
  const { WHEEL } = await import('../src/data.js');
  WHEEL.forEach((slice, i) => {
    const run = spinRun({ round: 4, debt: 200 });
    const res = { total: 0 };
    const out = applyWheel(run, i, res);
    assert.equal(out.kind, slice.kind);
    if (slice.kind === 'coins') assert.equal(res.total, Math.round(200 * slice.k));
  });
});

test('cosmic events arrive from round 5 and bend the rules', async () => {
  const run = createRun({ seed: 5 });
  run.round = 5;
  run.phase = 'dayEnd';
  run.day = 1;
  finishDay(run);
  assert.ok(run.event, 'day 2 of round 5 has an event');
  run.event = 'meteors';
  choosePackage(run, 0);
  assert.equal(spin(run, grid('cccmp', 'mpgra', 'grmpg')).total, 6);
  run.event = 'quiet';
  assert.equal(symbolWeights(run).void, 0);
  run.event = 'alignment';
  assert.equal(spin(run, grid('cmpra', 'cgsmp', 'crgap')).total, 4);
  const early = createRun({ seed: 5 });
  early.phase = 'dayEnd';
  finishDay(early);
  assert.equal(early.event, null, 'no events before round 5');
});

test('old saved runs are upgraded', async () => {
  const { upgradeRun } = await import('../src/sim.js');
  const old = createRun();
  for (const k of ['charge', 'overdrive', 'event', 'seen', 'seenInit']) delete old[k];
  delete old.stats.wheels;
  old.round = 4;
  upgradeRun(old);
  assert.equal(old.charge, 0);
  assert.deepEqual(old.seen, ['overdrive', 'gold'], 'cards for rounds already played are skipped');
});
