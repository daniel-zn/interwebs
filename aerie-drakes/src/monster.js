import { MOVES } from './data/moves.js';
import { SPECIES_BY_ID, learnset } from './data/species.js';

export const MAX_LEVEL = 60;
const STAT_KEYS = ['hp', 'atk', 'def', 'spc', 'spd'];

/** Total XP needed to reach a level. */
export const xpFor = (lv) => (lv <= 1 ? 0 : Math.floor(0.8 * lv ** 3));

export function calcStats(mon) {
  const sp = SPECIES_BY_ID[mon.sp];
  const out = {};
  STAT_KEYS.forEach((k, i) => {
    const core = Math.floor(((sp.stats[i] * 2 + mon.iv[i]) * mon.lv) / 100);
    out[k] = k === 'hp' ? core + mon.lv + 10 : core + 5;
  });
  return out;
}

export function refresh(mon) {
  const old = mon.stats?.hp ?? 0;
  mon.stats = calcStats(mon);
  if (mon.hp === undefined) mon.hp = mon.stats.hp;
  else if (mon.hp > 0) mon.hp = Math.min(mon.stats.hp, mon.hp + Math.max(0, mon.stats.hp - old));
  return mon;
}

/** The four moves a drake of this level would know: newest first, signatures always kept. */
export function defaultMoves(spId, lv) {
  const sp = SPECIES_BY_ID[spId];
  const known = learnset(sp).filter(([l]) => l <= lv).map(([, m]) => m);
  const uniq = [...new Set(known)];
  const sig = sp.extra.filter(([l]) => l <= lv).map(([, m]) => m);
  let picked = uniq.slice(-4);
  for (const s of sig) if (!picked.includes(s)) picked = [s, ...picked.filter((m) => m !== s)].slice(0, 4);
  return picked;
}

export function makeMon(spId, lv, rng = Math.random, opts = {}) {
  const mon = {
    sp: spId,
    lv,
    xp: xpFor(lv),
    iv: opts.iv ?? Array.from({ length: 5 }, () => Math.floor(rng() * 16)),
    nick: opts.nick ?? null,
    ot: opts.ot ?? null,
    status: null,
    moves: (opts.moves ?? defaultMoves(spId, lv)).map((id) => ({ id, pp: MOVES[id].pp })),
  };
  return refresh(mon);
}

export const monName = (mon) => mon.nick || SPECIES_BY_ID[mon.sp].name;
export const species = (mon) => SPECIES_BY_ID[mon.sp];

export function healMon(mon) {
  mon.hp = mon.stats.hp;
  mon.status = null;
  for (const m of mon.moves) m.pp = MOVES[m.id].pp;
}

/** Moves a species learns at exactly this level. */
export function movesAt(spId, lv) {
  return learnset(SPECIES_BY_ID[spId]).filter(([l]) => l === lv).map(([, m]) => m);
}

/** What this drake evolves into on reaching its current level, if anything. */
export function levelEvolution(mon) {
  const evo = SPECIES_BY_ID[mon.sp].evo;
  return evo && evo.lv && mon.lv >= evo.lv ? evo.to : null;
}

export function evolve(mon, to) {
  mon.sp = to;
  refresh(mon);
  // Final forms teach their signature move at once.
  const learned = [];
  for (const [, m] of SPECIES_BY_ID[to].extra) learned.push(m);
  return learned;
}
