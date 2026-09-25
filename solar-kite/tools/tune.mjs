// Balance harness: plays many seeded sessions with simple bots and prints outcomes.
//   node tools/tune.mjs
import { SESSION, createRun, demoPilot, step, steerToward } from '../src/sim.js';

const BOTS = {
  // Chases a figure 8 round the power zone (the title-screen pilot).
  demo: (run, mem) => demoPilot(run, mem),
  // Goes looking for things to orbit, and falls back to the demo pattern.
  orbiter: (run, mem) => {
    const k = run.k;
    if (k.y + Math.sin(k.th) * k.s * 0.45 < 10 && Math.sin(k.th) < 0.5) return demoPilot(run, mem);
    const o = run.objects.find((b) => b.x > 35 && b.x < 160);
    if (!o) return demoPilot(run, mem);
    const a = Math.atan2(k.y - o.y, k.x - o.x) + 0.9;
    return steerToward(run, o.x + Math.cos(a) * 13, o.y + Math.sin(a) * 13);
  },
};

function play(seed, bot, { gentle = false, react = 0.1 } = {}) {
  const run = createRun({ seed, gentle });
  const mem = {};
  let turn = 0, nextThink = 0;
  const dt = 1 / 60;
  while (run.phase === 'fly') {
    if (run.t >= nextThink) {
      turn = bot(run, mem);
      nextThink = run.t + react;
    }
    step(run, dt, { turn });
    run.events.length = 0;
  }
  return run;
}

for (const [name, bot] of Object.entries(BOTS)) {
  for (const gentle of [false, true]) {
    const runs = [];
    for (let seed = 1; seed <= 20; seed++) runs.push(play(seed, bot, { gentle }));
    const avg = (f) => (runs.reduce((a, r) => a + f(r), 0) / runs.length).toFixed(1);
    const ranks = {};
    for (const r of runs) ranks[r.result.rating] = (ranks[r.result.rating] || 0) + 1;
    console.log(`${name.padEnd(8)} ${gentle ? 'gentle' : 'normal'}  score ${avg((r) => r.score).padStart(8)}  crashes ${avg((r) => r.stats.crashes)}  bonks ${avg((r) => r.stats.bonks)}  loops ${avg((r) => r.stats.loops)}  orbits ${avg((r) => r.stats.orbits)}  rings ${avg((r) => r.stats.rings)}  calls ${avg((r) => r.stats.calls)}  ranks ${JSON.stringify(ranks)}  (${SESSION}s)`);
  }
}
