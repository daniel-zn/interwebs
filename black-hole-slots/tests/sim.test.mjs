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
