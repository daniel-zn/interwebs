// All the rules of a run, with no DOM: rolling the reels, paying lines,
// charms, the shop, days, debts and transmissions. The run is plain JSON
// (the RNG state included), so it can be saved and resumed.
import {
  BLESSING_KINDS, CHARMS, CHARM_BY_ID, COLS, DAYS, FINAL_ROUND, GROUP_NAMES, LINES, MAX_CHARMS, PACKAGES,
  PATTERNS, RARITY, ROWS, SYMBOLS, SYMBOL_BY_ID, VOID, VOID_BITE, VOID_COUNT, debtFor, voidWeight,
} from './data.js';

// ---------------------------------------------------------------- rng
/** mulberry32, with its state kept on the run. */
export function rand(run) {
  run.rs = (run.rs + 0x6d2b79f5) >>> 0;
  let t = run.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pickInt = (run, n) => Math.floor(rand(run) * n);
function pickWeighted(run, items, weightOf) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let x = rand(run) * total;
  for (const it of items) {
    x -= weightOf(it);
    if (x < 0) return it;
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------- run
export function createRun({ seed = 1 } = {}) {
  const run = {
    v: 1,
    rs: seed >>> 0,
    round: 1,
    day: 1,
    debt: debtFor(1),
    coins: 0,
    tickets: 3,
    luck: 0,
    charms: [],
    // Permanent boosts from transmissions.
    symBonus: {},
    groupBonus: {},
    multBonus: 0,
    multX: 1,
    extraSpins: 0,
    // Charm counters.
    darkMatter: 0,
    streak: 0,
    echoUsed: false,
    // Day state.
    phase: 'shop',
    spinsLeft: 0,
    spinsToday: 0,
    shop: [],
    rerolls: 0,
    offers: [],
    endless: false,
    // Stats for the end screen.
    stats: { spins: 0, earned: 0, bestWin: 0, jackpots: 0, voids: 0 },
  };
  stockShop(run);
  return run;
}

export const has = (run, id) => run.charms.includes(id);

/** Spins a package gives today, after charms and blessings. */
export function spinsFor(run, pkg) {
  let n = PACKAGES[pkg].spins + run.extraSpins;
  if (has(run, 'spare_slot')) n += 2;
  if (has(run, 'double_down')) n -= 2;
  return Math.max(1, n);
}

// ---------------------------------------------------------------- symbols
export function symbolWeights(run) {
  const w = {};
  for (const s of SYMBOLS) {
    const rank = SYMBOL_BY_ID[s.id].rank;
    let x = s.weight * (1 + run.luck * 0.07 * rank);
    if (s.id === 'seven' && has(run, 'star_chart')) x *= 2;
    w[s.id] = x;
  }
  let v = voidWeight(run.round);
  if (has(run, 'void_ward')) v *= 0.25;
  if (has(run, 'event_horizon')) v *= 2;
  w[VOID] = v;
  return w;
}

export function symbolValue(run, id) {
  if (id === VOID) return 0;
  let v = SYMBOL_BY_ID[id].value + (run.symBonus[id] || 0);
  const doubler = { comet: 'comet_tail', moon: 'moon_boots', planet: 'ring_polish', rocket: 'booster', seven: 'star_chart' }[id];
  if (doubler && has(run, doubler)) v *= 2;
  return v;
}

export function patternMult(run, kind) {
  const p = PATTERNS[kind];
  let m = p.mult + (run.groupBonus[p.group] || 0);
  if (p.group === 'rows' && has(run, 'horizon')) m += 1;
  if (p.group === 'columns' && has(run, 'elevator')) m += 2;
  if (p.group === 'diagonals' && has(run, 'lens')) m += 2;
  if (p.group === 'shapes' && has(run, 'geometry')) m += 4;
  if ((kind === 'row5' || kind === 'orbit' || kind === 'jackpot') && has(run, 'supernova')) m *= 5;
  return m;
}

/** The standing multiplier from charms and blessings (before per-spin bonuses). */
export function baseMult(run) {
  let m = 1 + run.multBonus + run.darkMatter * 0.25;
  m *= run.multX;
  if (has(run, 'collector')) m += 0.5 * (run.charms.length - 1);
  if (has(run, 'streak')) m += run.streak;
  return m;
}

export function rollGrid(run) {
  const w = symbolWeights(run);
  const ids = Object.keys(w);
  const grid = [];
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = 0; r < ROWS; r++) col.push(pickWeighted(run, ids, (id) => w[id]));
    grid.push(col);
  }
  return grid;
}

// ---------------------------------------------------------------- paying lines
/** Every paying line on a grid (grid[col][row]), before multipliers. */
export function findLines(run, grid) {
  const wild = has(run, 'wild_alien') ? 'alien' : null;
  const hits = [];
  for (const line of LINES) {
    let sym = null;
    let ok = true;
    for (const [c, r] of line.cells) {
      const s = grid[c][r];
      if (s === VOID) {
        ok = false;
        break;
      }
      if (s === wild) continue;
      if (sym === null) sym = s;
      else if (s !== sym) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    hits.push({ kind: line.kind, row: line.row, cells: line.cells, sym: sym || wild });
  }
  // Drop shorter rows that sit inside a longer matching row.
  return hits.filter((h) => {
    if (h.kind !== 'row3' && h.kind !== 'row4') return true;
    const len = h.cells.length;
    return !hits.some((o) => o !== h && o.row === h.row && o.cells.length > len && o.sym === h.sym &&
      o.cells[0][0] <= h.cells[0][0] && o.cells[o.cells.length - 1][0] >= h.cells[len - 1][0]);
  });
}

export function countVoids(grid) {
  let n = 0;
  for (const col of grid) for (const s of col) if (s === VOID) n++;
  return n;
}

/**
 * Spins the reels once. Returns everything the presentation needs; the run is
 * already updated when this returns.
 */
export function spin(run, forcedGrid = null) {
  if (run.phase !== 'spin' || run.spinsLeft <= 0) throw new Error('cannot spin now');
  run.spinsLeft--;
  run.spinsToday++;
  run.stats.spins++;
  const last = run.spinsLeft === 0;
  const grid = forcedGrid || rollGrid(run);
  const lines = findLines(run, grid);
  const voids = countVoids(grid);
  const result = { grid, lines: [], voids, voided: false, bite: 0, horizon: 0, base: 0, mult: 1, total: 0, tags: [], free: false, last };

  for (const l of lines) {
    const v = symbolValue(run, l.sym);
    const m = patternMult(run, l.kind);
    result.lines.push({ ...l, value: v, mult: m, pay: v * m });
    result.base += v * m;
  }

  if (voids >= VOID_COUNT) {
    run.stats.voids++;
    if (has(run, 'event_horizon')) {
      result.horizon = 66 * run.round;
      result.tags.push('EVENT HORIZON');
    } else {
      result.voided = true;
      result.base = 0;
    }
  }

  const won = result.base > 0;
  let mult = baseMult(run);
  if (won) {
    if (has(run, 'echo') && !run.echoUsed) {
      run.echoUsed = true;
      mult *= 2;
      result.tags.push('ECHO X2');
    }
    if (last && has(run, 'finale')) {
      mult *= 3;
      result.tags.push('FINALE X3');
    }
    if (has(run, 'double_down')) mult *= 2;
  }
  result.mult = mult;
  result.total = Math.round(result.base * mult) + result.horizon;

  if (result.voided) {
    result.bite = Math.floor(run.coins * VOID_BITE);
    run.coins -= result.bite;
  } else if (!won && !result.horizon && has(run, 'tip_jar')) {
    result.total = 3 * run.round;
    result.tags.push('TIP JAR');
  }

  if (won) {
    if (has(run, 'streak')) run.streak++;
    if (has(run, 'dark_matter')) run.darkMatter++;
  } else {
    run.streak = 0;
    if (!result.voided && has(run, 'wormhole') && rand(run) < 1 / 3) {
      run.spinsLeft++;
      result.free = true;
      result.tags.push('WORMHOLE');
    }
  }

  result.jackpot = result.lines.some((l) => l.kind === 'jackpot');
  if (result.jackpot) run.stats.jackpots++;
  run.coins += result.total;
  run.stats.earned += result.total;
  run.stats.bestWin = Math.max(run.stats.bestWin, result.total);
  if (run.spinsLeft === 0) run.phase = 'dayEnd';
  return result;
}

// ---------------------------------------------------------------- the shop
export function stockShop(run) {
  const owned = new Set(run.charms);
  const pool = CHARMS.filter((c) => !owned.has(c.id));
  const picks = [];
  while (picks.length < 4 && pool.length) {
    const c = pickWeighted(run, pool, (x) => RARITY[x.rarity].weight);
    pool.splice(pool.indexOf(c), 1);
    picks.push(c.id);
  }
  run.shop = picks;
}

export const rerollCost = (run) => 1 + run.rerolls;
export const sellValue = (id) => Math.floor(CHARM_BY_ID[id].price / 2);

export function buy(run, i) {
  const id = run.shop[i];
  if (run.phase !== 'shop' || !id) return { ok: false, reason: 'SOLD OUT' };
  const price = CHARM_BY_ID[id].price;
  if (run.charms.length >= MAX_CHARMS) return { ok: false, reason: 'CHARM SLOTS FULL' };
  if (run.tickets < price) return { ok: false, reason: 'NOT ENOUGH TICKETS' };
  run.tickets -= price;
  run.charms.push(id);
  run.shop[i] = null;
  return { ok: true, id };
}

export function sell(run, j) {
  const id = run.charms[j];
  if (run.phase !== 'shop' || !id) return { ok: false };
  run.charms.splice(j, 1);
  run.tickets += sellValue(id);
  if (id === 'streak') run.streak = 0;
  if (id === 'dark_matter') run.darkMatter = 0;
  return { ok: true, id };
}

export function reroll(run) {
  const cost = rerollCost(run);
  if (run.phase !== 'shop' || run.tickets < cost) return { ok: false, reason: 'NOT ENOUGH TICKETS' };
  run.tickets -= cost;
  run.rerolls++;
  stockShop(run);
  return { ok: true };
}

/** Ends the shop visit: the day starts with the chosen package. */
export function choosePackage(run, k) {
  if (run.phase !== 'shop') return false;
  run.spinsLeft = spinsFor(run, k);
  run.tickets += PACKAGES[k].tickets;
  run.spinsToday = 0;
  run.echoUsed = false;
  run.phase = 'spin';
  return true;
}

// ---------------------------------------------------------------- days and debts
/** Tickets for paying the debt before its last day. */
export const earlyBonus = (run) => 2 * (DAYS - run.day + 1);
export const canPayEarly = (run) => run.phase === 'shop' && run.day > 1 && run.coins >= run.debt;

/** After the last spin of a day: interest, then the next day or the deadline. */
export function finishDay(run) {
  if (run.phase !== 'dayEnd') return null;
  const out = { interest: 0 };
  if (has(run, 'piggy')) {
    out.interest = Math.floor(run.coins * 0.1);
    run.coins += out.interest;
    run.stats.earned += out.interest;
  }
  if (run.day >= DAYS) {
    run.phase = 'deadline';
  } else {
    run.day++;
    openShop(run);
  }
  return out;
}

function openShop(run) {
  run.phase = 'shop';
  run.rerolls = 0;
  if (has(run, 'printer')) run.tickets++;
  stockShop(run);
}

/** Pays the debt, or doesn't. Returns { paid, amount, bonus }. */
export function payDebt(run, early = false) {
  if (early ? !canPayEarly(run) : run.phase !== 'deadline') return null;
  const amount = run.debt;
  if (run.coins < amount) {
    run.phase = 'over';
    return { paid: false, amount };
  }
  run.coins -= amount;
  const bonus = early ? earlyBonus(run) : 0;
  run.tickets += bonus;
  if (run.round >= FINAL_ROUND && !run.endless) {
    run.phase = 'won';
  } else {
    run.phase = 'transmit';
    run.offers = makeOffers(run);
  }
  return { paid: true, amount, bonus };
}

/** After escaping: keep going into endless rounds. */
export function goEndless(run) {
  if (run.phase !== 'won') return;
  run.endless = true;
  run.phase = 'transmit';
  run.offers = makeOffers(run);
}

// ---------------------------------------------------------------- transmissions
export function makeOffers(run) {
  const offers = [];
  const seen = new Set();
  let guard = 0;
  while (offers.length < 3 && guard++ < 50) {
    const kind = BLESSING_KINDS[pickInt(run, BLESSING_KINDS.length)];
    let o;
    const r = run.round;
    switch (kind) {
      case 'symbol': {
        const s = SYMBOLS[pickInt(run, SYMBOLS.length)];
        const n = Math.max(1, Math.round(s.value * (0.5 + r * 0.35)));
        o = { kind, sym: s.id, n, key: `s:${s.id}`, text: `${s.name}s are worth +${n}` };
        break;
      }
      case 'group': {
        const g = Object.keys(GROUP_NAMES)[pickInt(run, 4)];
        const n = g === 'shapes' ? 3 : g === 'rows' ? 1 : 2;
        o = { kind, group: g, n, key: `g:${g}`, text: `${GROUP_NAMES[g]} get +${n} mult` };
        break;
      }
      case 'luck':
        o = { kind, n: 2, key: 'luck', text: '+2 luck' };
        break;
      case 'spins':
        o = { kind, n: 1, key: 'spins', text: '+1 spin every day' };
        break;
      case 'tickets':
        o = { kind, n: 4 + r, key: 'tickets', text: `+${4 + r} tickets now` };
        break;
      case 'mult':
        o = { kind, n: 1.5, key: 'mult', text: 'All wins x1.5 (stacks)' };
        break;
      case 'all': {
        const n = Math.ceil(r / 2);
        o = { kind, n, key: 'all', text: `Every symbol is worth +${n}` };
        break;
      }
      default:
    }
    if (seen.has(o.key)) continue;
    seen.add(o.key);
    offers.push(o);
  }
  return offers;
}

export function pickOffer(run, i) {
  const o = run.offers[i];
  if (run.phase !== 'transmit' || !o) return false;
  switch (o.kind) {
    case 'symbol':
      run.symBonus[o.sym] = (run.symBonus[o.sym] || 0) + o.n;
      break;
    case 'group':
      run.groupBonus[o.group] = (run.groupBonus[o.group] || 0) + o.n;
      break;
    case 'luck':
      run.luck += o.n;
      break;
    case 'spins':
      run.extraSpins += o.n;
      break;
    case 'tickets':
      run.tickets += o.n;
      break;
    case 'mult':
      run.multX *= o.n;
      break;
    case 'all':
      for (const s of SYMBOLS) run.symBonus[s.id] = (run.symBonus[s.id] || 0) + o.n;
      break;
    default:
  }
  run.offers = [];
  run.round++;
  run.day = 1;
  run.debt = debtFor(run.round);
  openShop(run);
  return true;
}

export function snapshot(run) {
  return {
    phase: run.phase, round: run.round, day: run.day, debt: run.debt, coins: run.coins, tickets: run.tickets,
    spinsLeft: run.spinsLeft, charms: [...run.charms], shop: [...run.shop], luck: run.luck, endless: run.endless,
  };
}
