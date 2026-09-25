// Balance harness: plays many seeded runs with simple bots and prints outcomes.
//   node tools/tune.mjs
import { createRun, step, hotAt } from '../src/sim.js';

export function botInput(run, mem, skill = 1) {
  // A binary "hold to dive / let go" player with a reaction delay.
  const target = run.width * (0.5 + (mem.bias || 0));
  const hot = hotAt(run, run.x + 20);
  const d = run.alt - hot;
  const predicted = d + run.vy * 0.6 * skill;
  if (!mem.holding && predicted > target + 2) mem.holding = true;
  else if (mem.holding && predicted < target - 1.5) mem.holding = false;
  return mem.holding ? -1 : 0;
}

function play(seed, bot, { gentle = false, skill = 1, react = 0.12 } = {}) {
  const run = createRun({ seed, gentle });
  const mem = {};
  let input = 0, nextThink = 0;
  const dt = 1 / 60;
  let minD = 99, maxD = -99, maxHeat = 0, maxSkip = 0;
  while (run.phase === 'ride' && run.t < 400) {
    if (run.t >= nextThink) { input = bot(run, mem, skill); nextThink = run.t + react; }
    step(run, dt, input);
    minD = Math.min(minD, run.depth); maxD = Math.max(maxD, run.depth);
    maxHeat = Math.max(maxHeat, run.heat); maxSkip = Math.max(maxSkip, run.skip);
    run.events.length = 0;
  }
  return { seed, phase: run.phase, t: run.t.toFixed(1), score: Math.round(run.score), rating: run.result?.rating, minD: minD.toFixed(1), maxD: maxD.toFixed(1), maxHeat: maxHeat.toFixed(2), maxSkip: maxSkip.toFixed(2), stats: run.stats, events: run.eventCount };
}

const bots = {
  idle: () => 0,
  dive: () => -1,
  pull: () => 1,
  skilled: botInput,
};
const which = process.argv[2];
for (const [name, bot] of Object.entries(bots)) {
  if (which && which !== name) continue;
  for (const opts of [{}, { gentle: true }, { skill: 0.4, react: 0.25 }]) {
    const rows = [];
    for (let seed = 1; seed <= 8; seed++) rows.push(play(seed, bot, opts));
    const out = {};
    for (const r of rows) out[r.phase] = (out[r.phase] || 0) + 1;
    console.log(name, JSON.stringify(opts), JSON.stringify(out), rows.map((r) => `${r.phase[0]}${r.t}s/${r.score}${r.rating || ''} d[${r.minD},${r.maxD}] h${r.maxHeat} s${r.maxSkip} hits${r.stats.hits}`).join('  '));
  }
}
