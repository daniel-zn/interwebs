// Static checks on game data and the world map (plain Node, no browser):
// every move/species/item reference resolves, and the map is fully reachable
// in story order with the Sigil gates opening one at a time.
import { ITEMS, SHOPS } from '../src/data/items.js';
import { LEGENDS } from '../src/data/legends.js';
import { MOVES, POOLS } from '../src/data/moves.js';
import { SPECIES, SPECIES_BY_ID, learnset } from '../src/data/species.js';
import { TYPES } from '../src/data/types.js';
import { defaultMoves } from '../src/monster.js';
import { T, WALKABLE } from '../src/world/tiles.js';
import { TRADES, TRAINERS, buildWorld } from '../src/world/world.js';

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};

// ---------------------------------------------------------------- data
const badMoves = Object.values(POOLS).flat().filter((m) => !MOVES[m]);
check(!badMoves.length, 'every pool move exists', badMoves.join(','));
check(Object.values(MOVES).every((m) => TYPES.includes(m.type)), 'every move has a real current');
const badSp = SPECIES.filter((s) => s.types.some((t) => !TYPES.includes(t)) || s.stats.length !== 5 || !s.lore || s.lore.length < 120);
check(!badSp.length, `all ${SPECIES.length} species have currents, 5 stats and a legend`, badSp.map((s) => s.id).join(','));
const badEvo = SPECIES.filter((s) => s.evo && (!SPECIES_BY_ID[s.evo.to] || (s.evo.item && !ITEMS[s.evo.item])));
check(!badEvo.length, 'evolutions point at real species and items', badEvo.map((s) => s.id).join(','));
const badLearn = SPECIES.filter((s) => learnset(s).some(([, m]) => !MOVES[m]));
check(!badLearn.length, 'every learnset move exists', badLearn.map((s) => s.id).join(','));
check(SPECIES.every((s) => defaultMoves(s.id, 5).length >= 2 && defaultMoves(s.id, 50).length === 4), 'every drake knows 2+ moves at Lv5 and 4 at Lv50');
check(Object.values(SHOPS).flat().every((id) => ITEMS[id]), 'shop stock exists');
check(Object.values(TRADES).every((t) => SPECIES_BY_ID[t.want] && SPECIES_BY_ID[t.give]), 'trades use real species');
const badTeams = Object.entries(TRAINERS).filter(([, t]) => t.team.some(([sp]) => !sp.startsWith('RIVAL') && !SPECIES_BY_ID[sp]));
check(!badTeams.length, 'trainer teams use real species', badTeams.map(([id]) => id).join(','));
check(new Set(LEGENDS.map((l) => l.id)).size === LEGENDS.length, 'legend ids are unique');

// ---------------------------------------------------------------- world
const maps = buildWorld();
const world = maps.world;
const legendIds = new Set(LEGENDS.map((l) => l.id));
const badWarps = [];
for (const m of Object.values(maps)) {
  for (const o of m.objects) if (o.legend && !legendIds.has(o.legend)) check(false, `${m.id} sign legend ${o.legend} exists`);
  for (const n of m.npcs) {
    if (n.trainer && !TRAINERS[n.trainer]) check(false, `${m.id} trainer ${n.trainer} exists`);
    if (m.tiles[n.y * m.w + n.x] === undefined || !WALKABLE.has(m.tiles[n.y * m.w + n.x])) check(false, `${m.id} NPC ${n.id} stands on floor`, `${n.x},${n.y}`);
  }
  for (const w of m.warps) {
    const to = maps[w.to];
    if (!to || !WALKABLE.has(to.tiles[w.ty * to.w + w.tx])) badWarps.push(`${m.id}@${w.x},${w.y}`);
  }
}
check(!badWarps.length, 'every door lands on floor', badWarps.join(' '));

/** Tiles reachable on the outdoor map from Lowdeck, with gates for missing sigils closed. */
function reach(flags) {
  const blocked = (x, y) => {
    const t = world.tiles[y * world.w + x];
    if (!WALKABLE.has(t)) return true;
    if (world.gates.some((g) => g.x === x && g.y === y && !flags.includes(g.flag))) return true;
    if (world.objects.some((o) => o.x === x && o.y === y)) return true;
    // Trainers stand still; wanderers move, so only count non-wanderers.
    if (world.npcs.some((n) => n.x === x && n.y === y && !n.wander && !(n.hide && flags.includes(n.hide)))) return true;
    return false;
  };
  const seen = new Set(['12,93']);
  const q = [[12, 93]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h || seen.has(k) || blocked(nx, ny)) continue;
      seen.add(k);
      // Doors are walk-in only: don't walk through them.
      if (world.tiles[ny * world.w + nx] !== T.DOOR) q.push([nx, ny]);
    }
  }
  return seen;
}
const doorsIn = (set) => world.warps.filter((w) => set.has(`${w.x},${w.y}`)).map((w) => w.to);
const r0 = reach([]);
const early = doorsIn(r0);
check(['home', 'lab', 'clinic_c', 'mart_c', 'kiosk', 'dojo'].every((d) => early.includes(d)), 'Lowdeck and the Bazaar are open from the start', early.join(','));
check(!early.includes('clinic_e') && !r0.has('33,46'), 'Wind Bridge is closed without the Current Sigil');
const r1 = reach(['sigil1']);
check(doorsIn(r1).includes('arena_e') && !r1.has('44,42'), 'Current Sigil opens the Foundry but not the Rainshaft');
const r2 = reach(['sigil1', 'sigil2']);
check(doorsIn(r2).includes('arena_g') && !r2.has('18,14'), 'Alloy Sigil opens Rainshaft and Nightside but not the Summit');
const r3 = reach(['sigil1', 'sigil2', 'sigil3', 'rival3_done']);
check(doorsIn(r3).length === world.warps.length, 'all Sigils open every door on the island', `${doorsIn(r3).length}/${world.warps.length}`);
// Every item and NPC can be reached (stand next to it).
const adj = (set, x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => set.has(`${x + dx},${y + dy}`));
const lonely = [...world.objects, ...world.npcs].filter((o) => !adj(r3, o.x, o.y));
check(!lonely.length, 'every outdoor NPC, sign and item can be reached', lonely.map((o) => `${o.id ?? o.kind}@${o.x},${o.y}`).join(' '));
// Grass zones have encounters.
const grassNoEnc = [];
for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
  if (world.tiles[y * world.w + x] !== T.GRASS) continue;
  const z = world.zones.find((q) => x >= q.rect[0] && x <= q.rect[2] && y >= q.rect[1] && y <= q.rect[3]);
  if (!z?.enc) grassNoEnc.push(`${x},${y}`);
}
check(!grassNoEnc.length, 'every patch of fibre grass has wild drakes', grassNoEnc.slice(0, 5).join(' '));
// Interiors: every NPC and object reachable from the entry.
for (const m of Object.values(maps).filter((q) => q.indoor)) {
  const seen = new Set([`${m.entry[0]},${m.entry[1]}`]);
  const q = [m.entry];
  const occ = (x, y) => m.npcs.some((n) => n.x === x && n.y === y) || m.objects.some((o) => o.x === x && o.y === y);
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || !WALKABLE.has(m.tiles[ny * m.w + nx]) || occ(nx, ny)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  const counter = (x, y) => [[0, 1], [0, 2]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`));
  const bad = [...m.npcs, ...m.objects].filter((o) => !adj(seen, o.x, o.y) && !counter(o.x, o.y));
  check(!bad.length, `${m.id}: everyone can be reached`, bad.map((o) => o.id ?? o.kind).join(','));
}

console.log(failures ? `\n${failures} data check(s) failed` : '\nAll data checks passed');
process.exit(failures ? 1 : 0);
