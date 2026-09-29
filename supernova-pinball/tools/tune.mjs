// Lets the autopilot play whole games and reports how far it gets.
//   node tools/tune.mjs [games]
import { DT, autopilot, createGame, pickUpgrade, step } from '../src/game.js';

const N = Number(process.argv[2]) || 30;
const CAP = 60 * 60 * (Number(process.argv[3]) || 15); // minutes per game
const SKILL = Number(process.argv[4]) || 0.8; // chance the bot makes each flip
const reached = {};
let totalScore = 0, balls = 0, time = 0;
const events = {};
for (let s = 1; s <= N; s++) {
  const g = createGame({ seed: s * 7919 });
  let frames = 0;
  const t0 = Date.now();
  while (g.phase !== 'over' && frames < CAP) {
    if (g.phase === 'upgrade') pickUpgrade(g, 0);
    step(g, autopilot(g, SKILL));
    for (const e of g.events) events[e.type] = (events[e.type] || 0) + 1;
    g.events.length = 0;
    frames++;
  }
  reached[g.sector] = (reached[g.sector] || 0) + 1;
  console.log(`  game ${s}: sector ${g.sector}, ${g.score.toLocaleString()} pts, ${(frames / 3600).toFixed(1)} min (${((Date.now() - t0) / 1000).toFixed(1)} s)${g.phase === 'over' ? '' : ' (capped)'}`);
  totalScore += g.score;
  balls += g.ballNo;
  time += frames * DT;
}
console.log(`${N} games: avg score ${Math.round(totalScore / N).toLocaleString()}, ${(time / balls).toFixed(1)} s per ball, ${(time / N / 60).toFixed(1)} min per game`);
console.log('reached sector:', Object.entries(reached).map(([k, v]) => `${k}: ${v}`).join('  '));
console.log('events per game:', Object.fromEntries(Object.entries(events).filter(([k]) => !['score', 'flip', 'thud', 'rubber', 'flipHit'].includes(k)).map(([k, v]) => [k, +(v / N).toFixed(1)])));
