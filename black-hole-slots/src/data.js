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
const DEBTS = [20, 50, 100, 180, 320, 550, 900, 1400];
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
