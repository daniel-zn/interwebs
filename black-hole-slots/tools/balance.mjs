// Plays thousands of runs with simple bots and prints how far they get.
//   node tools/balance.mjs [runs]
import { CHARM_BY_ID, FINAL_ROUND, MAX_CHARMS } from '../src/data.js';
import { buy, canPayEarly, choosePackage, createRun, finishDay, payDebt, pickOffer, spin } from '../src/sim.js';

const N = Number(process.argv[2]) || 2000;
const RANK = { epic: 3, rare: 2, common: 1 };
const OFFER_PREF = ['mult', 'all', 'group', 'symbol', 'luck', 'spins', 'tickets'];

function play(seed, smart) {
  const run = createRun({ seed });
  let spins = 0;
  while (spins < 5000) {
    switch (run.phase) {
      case 'shop': {
        if (smart && canPayEarly(run)) {
          payDebt(run, true);
          break;
        }
        for (;;) {
          const order = run.shop.map((id, i) => ({ id, i })).filter((x) => x.id && CHARM_BY_ID[x.id].price <= run.tickets);
          if (!order.length || run.charms.length >= MAX_CHARMS) break;
          order.sort((a, b) => (smart ? RANK[CHARM_BY_ID[b.id].rarity] - RANK[CHARM_BY_ID[a.id].rarity] : 0));
          buy(run, order[0].i);
        }
        choosePackage(run, smart && run.coins >= run.debt * 1.3 ? 1 : 0);
        break;
      }
      case 'spin':
        spin(run);
        spins++;
        break;
      case 'dayEnd':
        finishDay(run);
        break;
      case 'deadline':
        (run.earnedBy ||= {})[run.round] = run.stats.earned;
        payDebt(run);
        break;
      case 'transmit': {
        let i = 0;
        if (smart) i = run.offers.map((o) => OFFER_PREF.indexOf(o.kind)).reduce((best, v, k, a) => (v < a[best] ? k : best), 0);
        pickOffer(run, i);
        break;
      }
      case 'won':
        return { round: FINAL_ROUND + 1, won: true, run };
      case 'over':
        return { round: run.round, won: false, run };
      default:
        throw new Error(run.phase);
    }
  }
  return { round: run.round, won: false, run };
}

for (const smart of [false, true]) {
  const hist = {};
  let wins = 0, jackpots = 0, voids = 0, best = 0;
  const per = {};
  for (let s = 1; s <= N; s++) {
    const r = play(s * 7919, smart);
    hist[r.round] = (hist[r.round] || 0) + 1;
    if (r.won) wins++;
    jackpots += r.run.stats.jackpots;
    voids += r.run.stats.voids;
    best = Math.max(best, r.run.stats.bestWin);
    let prev = 0;
    for (const [k, v] of Object.entries(r.run.earnedBy || {})) {
      (per[k] ||= []).push(v - prev);
      prev = v;
    }
  }
  console.log(`\n${smart ? 'smart' : 'naive'} bot, ${N} runs: ${((wins / N) * 100).toFixed(1)}% escape, ${jackpots} jackpots, ${(voids / N).toFixed(2)} voids/run, best win ${best}`);
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  console.log('  median earned per round:', Object.entries(per).map(([k, a]) => `r${k}:${med(a)}`).join(' '));
  for (const k of Object.keys(hist).sort((a, b) => a - b)) {
    const label = Number(k) > FINAL_ROUND ? 'escaped' : `died in round ${k}`;
    console.log(`  ${label.padEnd(16)} ${'#'.repeat(Math.round((hist[k] / N) * 100))} ${((hist[k] / N) * 100).toFixed(1)}%`);
  }
}
