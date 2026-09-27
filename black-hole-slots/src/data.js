// The tables that define a run: symbols, paylines, charms, debts and the
// transmissions you can pick after paying a debt. No DOM here.

export const COLS = 5;
export const ROWS = 3;
export const DAYS = 3;
/** Paying this round's debt escapes the black hole. Endless mode continues after it. */
export const FINAL_ROUND = 8;

// Symbols, cheapest and most common first. `weight` is the base chance of
// landing in a cell; luck shifts weight towards the end of the list.
export const SYMBOLS = [
  { id: 'comet', name: 'Comet', value: 2, weight: 22 },
  { id: 'moon', name: 'Moon', value: 2, weight: 22 },
  { id: 'planet', name: 'Planet', value: 3, weight: 17 },
  { id: 'rocket', name: 'Rocket', value: 3, weight: 15 },
  { id: 'alien', name: 'Alien', value: 5, weight: 10 },
  { id: 'gem', name: 'Star Gem', value: 5, weight: 8 },
  { id: 'seven', name: 'Lucky 7', value: 7, weight: 5 },
];
export const VOID = 'void';
export const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map((s, i) => [s.id, { ...s, rank: i }]));
SYMBOL_BY_ID.void = { id: 'void', name: 'Void Eye', value: 0, weight: 0, rank: 7 };
/** The scatter: three or more anywhere spin the Bonus Wheel. Never part of a line. */
export const PULSAR = 'pulsar';
SYMBOL_BY_ID.pulsar = { id: 'pulsar', name: 'Pulsar', value: 0, weight: 0, rank: 7 };

// ---------------------------------------------------------------- paylines
// Every pattern template, as lists of [col, row] cells. Rows of 3 and 4 that
// sit inside a longer matching row on the same line are not paid twice.
export const PATTERNS = {
  row3: { name: 'Row', mult: 1, group: 'rows' },
  row4: { name: 'Long row', mult: 2, group: 'rows' },
  row5: { name: 'Full row', mult: 3, group: 'rows' },
  column: { name: 'Column', mult: 1, group: 'columns' },
  diag: { name: 'Diagonal', mult: 1, group: 'diagonals' },
  zig: { name: 'Zig', mult: 4, group: 'shapes' },
  zag: { name: 'Zag', mult: 4, group: 'shapes' },
  orbit: { name: 'Orbit', mult: 7, group: 'shapes' },
  jackpot: { name: 'JACKPOT', mult: 10, group: 'jackpot' },
};
export const GROUP_NAMES = { rows: 'Rows', columns: 'Columns', diagonals: 'Diagonals', shapes: 'Zig, Zag and Orbit' };

export const LINES = (() => {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= 2; c++) out.push({ kind: 'row3', row: r, cells: [0, 1, 2].map((k) => [c + k, r]) });
    for (let c = 0; c <= 1; c++) out.push({ kind: 'row4', row: r, cells: [0, 1, 2, 3].map((k) => [c + k, r]) });
    out.push({ kind: 'row5', row: r, cells: [0, 1, 2, 3, 4].map((k) => [k, r]) });
  }
  for (let c = 0; c < COLS; c++) out.push({ kind: 'column', cells: [[c, 0], [c, 1], [c, 2]] });
  for (let c = 0; c <= 2; c++) {
    out.push({ kind: 'diag', cells: [[c, 0], [c + 1, 1], [c + 2, 2]] });
    out.push({ kind: 'diag', cells: [[c, 2], [c + 1, 1], [c + 2, 0]] });
  }
  out.push({ kind: 'zig', cells: [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]] });
  out.push({ kind: 'zag', cells: [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]] });
  for (let c = 1; c <= 3; c++) {
    out.push({ kind: 'orbit', cells: [[c - 1, 0], [c, 0], [c + 1, 0], [c + 1, 1], [c + 1, 2], [c, 2], [c - 1, 2], [c - 1, 1]] });
  }
  const all = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) all.push([c, r]);
  out.push({ kind: 'jackpot', cells: all });
  return out;
})();

// ---------------------------------------------------------------- debts
const DEBTS = [20, 55, 115, 230, 420, 750, 1250, 2000];
export function debtFor(round) {
  if (round <= DEBTS.length) return DEBTS[round - 1];
  return Math.round(DEBTS[DEBTS.length - 1] * 1.8 ** (round - DEBTS.length) / 100) * 100;
}

/** Chance weight of a Void Eye per cell. It creeps up every round. */
export const voidWeight = (round) => 1.6 + 0.55 * (round - 1);
/** Three or more Void Eyes anywhere on the screen and the void feeds. */
export const VOID_COUNT = 3;
export const VOID_BITE = 0.25;

// ---------------------------------------------------------------- day packages
export const PACKAGES = [
  { spins: 7, tickets: 1 },
  { spins: 4, tickets: 3 },
];

// ---------------------------------------------------------------- charms
export const RARITY = {
  common: { price: 2, color: '#8fffc0', weight: 10 },
  rare: { price: 4, color: '#7fb8ff', weight: 5 },
  epic: { price: 7, color: '#ff5ad1', weight: 2 },
};
export const MAX_CHARMS = 6;

export const CHARMS = [
  // common
  { id: 'comet_tail', name: 'Comet Tail', rarity: 'common', desc: 'Comets are worth double.' },
  { id: 'moon_boots', name: 'Moon Boots', rarity: 'common', desc: 'Moons are worth double.' },
  { id: 'ring_polish', name: 'Ring Polish', rarity: 'common', desc: 'Planets are worth double.' },
  { id: 'booster', name: 'Booster Stage', rarity: 'common', desc: 'Rockets are worth double.' },
  { id: 'horizon', name: 'Horizon Line', rarity: 'common', desc: 'Rows get +1 mult.' },
  { id: 'elevator', name: 'Space Elevator', rarity: 'common', desc: 'Columns get +2 mult.' },
  { id: 'lens', name: 'Gravity Lens', rarity: 'common', desc: 'Diagonals get +2 mult.' },
  { id: 'tip_jar', name: 'Tip Jar', rarity: 'common', desc: 'Losing spins pay 3 coins per round.' },
  { id: 'horseshoe', name: 'Horseshoe Magnet', rarity: 'common', desc: '+2 luck: rarer symbols land more often.' },
  { id: 'printer', name: 'Ticket Printer', rarity: 'common', desc: '+1 ticket at the start of every day.' },
  // rare
  { id: 'star_chart', name: 'Star Chart', rarity: 'rare', desc: '7s land twice as often and are worth double.' },
  { id: 'void_ward', name: 'Void Ward', rarity: 'rare', desc: 'Void Eyes land 75% less often.' },
  { id: 'spare_slot', name: 'Spare Coin Slot', rarity: 'rare', desc: '+2 spins every day.' },
  { id: 'echo', name: 'Echo Chamber', rarity: 'rare', desc: 'The first winning spin of each day pays double.' },
  { id: 'wormhole', name: 'Wormhole', rarity: 'rare', desc: 'A losing spin has a 1 in 3 chance to be free.' },
  { id: 'finale', name: 'Grand Finale', rarity: 'rare', desc: 'The last spin of each day pays x3.' },
  { id: 'piggy', name: 'Piggy Satellite', rarity: 'rare', desc: 'At the end of each day, earn 10% interest.' },
  { id: 'streak', name: 'Hot Streak', rarity: 'rare', desc: 'Each win in a row adds +1 mult. A loss resets it.' },
  { id: 'geometry', name: 'Sacred Geometry', rarity: 'rare', desc: 'Zig, Zag and Orbit get +4 mult.' },
  // epic
  { id: 'wild_alien', name: 'Wild Aliens', rarity: 'epic', desc: 'Aliens are wild: they match any symbol.' },
  { id: 'dark_matter', name: 'Dark Matter', rarity: 'epic', desc: 'Every winning spin adds +0.25 mult for good.' },
  { id: 'supernova', name: 'Supernova', rarity: 'epic', desc: 'Full rows, Orbits and Jackpots pay x5.' },
  { id: 'event_horizon', name: 'Event Horizon', rarity: 'epic', desc: 'Void Eyes land twice as often, but 3+ pay 66 per round instead of feeding.' },
  { id: 'double_down', name: 'Double Down', rarity: 'epic', desc: 'All wins x2, but 2 fewer spins every day.' },
  { id: 'collector', name: 'Junk Collector', rarity: 'epic', desc: '+0.5 mult for every other charm you hold.' },
];
export const CHARM_BY_ID = Object.fromEntries(CHARMS.map((c) => [c.id, { ...c, price: RARITY[c.rarity].price }]));

// ---------------------------------------------------------------- transmissions
// After each debt is paid, a voice from the void offers three blessings.
export const BLESSING_KINDS = ['symbol', 'symbol', 'symbol', 'group', 'group', 'luck', 'spins', 'tickets', 'mult', 'all'];

// ---------------------------------------------------------------- mechanics that unlock as you go
// Each one arrives with a card the first time you reach its round.
export const UNLOCKS = [
  { id: 'overdrive', round: 2, name: 'OVERDRIVE', desc: 'Winning spins charge the meter under the reels. When it fills, your next 3 spins pay x3.' },
  { id: 'gold', round: 3, name: 'GOLDEN SYMBOLS', desc: 'Some symbols land gold. Every gold symbol in a paying line doubles that line.' },
  { id: 'pulsar', round: 4, name: 'PULSARS', desc: 'A new scatter symbol. Land 3 or more anywhere to spin the Bonus Wheel.' },
  { id: 'events', round: 5, name: 'COSMIC EVENTS', desc: 'Every day brings space weather that bends the rules. Check the pit stop.' },
];
export const unlocked = (run, id) => run.round >= UNLOCKS.find((u) => u.id === id).round;

export const OVERDRIVE_MAX = 100;
export const OVERDRIVE_SPINS = 3;
export const OVERDRIVE_MULT = 3;
/** Charge for a winning spin. */
export const overdriveGain = (lines) => Math.min(45, 12 + lines * 6);

/** Chance that a cell lands gold. */
export const goldChance = (luck) => 0.035 + 0.004 * luck;
export const GOLD_CAP = 3; // at most x8 per line

export const pulsarWeight = 2.4;
export const PULSAR_COUNT = 3;

// The Bonus Wheel. Eight equal slices on screen; some are luckier than others.
export const WHEEL = [
  { kind: 'coins', k: 0.3, label: 'COINS', color: '#ffd23f', weight: 20 },
  { kind: 'spins', n: 3, label: '+3 SPINS', color: '#7ff4ff', weight: 14 },
  { kind: 'coins', k: 0.7, label: 'BIG COINS', color: '#ff9b2f', weight: 10 },
  { kind: 'tickets', n: 4, label: '+4 TICKETS', color: '#ff5ad1', weight: 14 },
  { kind: 'coins', k: 0.3, label: 'COINS', color: '#ffd23f', weight: 20 },
  { kind: 'luck', n: 1, label: '+1 LUCK', color: '#8fffc0', weight: 9 },
  { kind: 'overdrive', label: 'OVERDRIVE', color: '#b35cff', weight: 9 },
  { kind: 'coins', k: 1.5, label: 'MEGA', color: '#ff3b4e', weight: 4 },
];

// Cosmic events: one per day from round 5.
export const EVENTS = [
  { id: 'meteors', name: 'METEOR SHOWER', desc: 'Comets and Moons are worth x3.' },
  { id: 'flare', name: 'SOLAR FLARE', desc: 'All wins x1.5, but Void Eyes land twice as often.' },
  { id: 'gravity', name: 'GRAVITY WELL', desc: 'Gems and 7s land twice as often.' },
  { id: 'quiet', name: 'QUIET VOID', desc: 'No Void Eyes today.' },
  { id: 'storm', name: 'PULSAR STORM', desc: 'Pulsars land three times as often.' },
  { id: 'golden', name: 'GOLDEN HOUR', desc: 'Golden symbols land three times as often.' },
  { id: 'alignment', name: 'ALIGNMENT', desc: 'Columns and diagonals get x2 mult.' },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
