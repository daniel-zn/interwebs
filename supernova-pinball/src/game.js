// The rules of a run: scoring, lanes, targets, the wormhole, multiball,
// supernova, sectors and upgrades, plus an autopilot for the attract mode and
// tests. Stepped at a fixed 60 Hz with physics substeps. No DOM.
import {
  BALL_SAVE, FINAL_SECTOR, GRAVITY, MAX_BALLS, MULTS, POINTS, START_BALLS, UPGRADES, sectorFor,
} from './data.js';
import { SUBSTEPS, collideBalls, makeBall, stepBall, stepCaptive, stepFlippers } from './physics.js';
import {
  BALL_R, CX, DRAIN_Y, LANE_X, LEFT_PLUNGER, PLUNGER, SHOTS, STAR, WHITE_HOLE, buildTable, rampPoint,
} from './table.js';

// Missions: started at the wormhole once the I O N targets light one.
export const MISSIONS = [
  { id: 'chase', name: 'COMET CHASE', desc: 'HIT THE LIT SHOT', time: 40, need: 4 },
  { id: 'orbits', name: 'ORBIT RUN', desc: 'SHOOT THE ORBITS', time: 40, need: 4, shots: ['lorbit', 'rorbit'] },
  { id: 'hyper', name: 'HYPERDRIVE', desc: 'SHOOT THE RAMPS', time: 40, need: 4, shots: ['lramp', 'rramp'] },
  { id: 'forge', name: 'STAR FORGE', desc: 'HIT THE STAR', time: 30, need: 8, shots: ['star'] },
  { id: 'sweep', name: 'SOLAR SWEEP', desc: 'HIT EVERY SHOT', time: 60, need: 7, shots: SHOTS.map((q) => q.id) },
];

export const DT = 1 / 60;

// ---------------------------------------------------------------- rng
function rand(g) {
  g.rs = (g.rs + 0x6d2b79f5) >>> 0;
  let t = g.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- setup
export function createGame({ seed = 1, sector = 1, demo = false, relaxed = false } = {}) {
  const g = {
    rs: seed >>> 0, demo, relaxed,
    t: 0, phase: 'launch', phaseT: 0,
    sector: 0, target: 0, sectorScore: 0, score: 0,
    ballsLeft: START_BALLS, ballNo: 0,
    balls: [], nextBallId: 1,
    table: null,
    upgrades: [],
    mult: 1, lanes: [false, false, false, false],
    mass: 0, supernovaT: 0, novaCount: 0,
    locks: 0, multiball: false, jackpotLit: false, relight: 0,
    ballSaveT: 0, ballSaveArmed: false, ghostUsed: false, kickbackUsed: false, magnaUsed: false,
    tilt: 0, tilted: false,
    combo: 0, comboT: 0, assistT: 0,
    orbit: { t: -9 },
    mission: null, missionLit: true, missionsDone: 0, missionNext: 0, extraBallLit: false,
    skillLane: -1, skillT: 0,
    plunger: 0, launchHeld: false,
    bonus: { bumpers: 0, drops: 0, lanes: 0, stars: 0, spins: 0, missions: 0 },
    bonusCount: null,
    offers: [],
    events: [],
    stats: { jackpots: 0, supernovas: 0, multiballs: 0, bestCombo: 0, ships: 0, comets: 0 },
    ap: { holdL: 0, holdR: 0, cradle: 0, charge: 0 },
    unlock: null, // the newest sector unlock, shown on the warp screen
  };
  startSector(g, sector, true);
  return g;
}

function emit(g, type, data = {}) {
  g.events.push({ type, ...data });
}

export const has = (g, id) => g.upgrades.includes(id);

function startSector(g, n, first = false) {
  g.sector = n;
  const s = sectorFor(n);
  g.target = s.target;
  g.sectorScore = 0;
  g.table = buildTable();
  applyUpgradesToTable(g);
  g.lanes = [false, false, false, false];
  g.locks = 0;
  g.multiball = false;
  g.jackpotLit = false;
  g.ghostUsed = false;
  g.unlock = first ? null : s.unlock || null;
  // Moving targets.
  if (n >= 3) g.table.comet = { a: 0, x: CX, y: 60, r: 4, cool: 3, vx: 0, vy: 0 };
  if (n >= 4) g.table.hole = { x: CX, y: 186, a: 0, catchT: 0 };
  g.mission = null;
  g.missionLit = true;
  if (n >= 5) spawnShip(g);
  g.balls = [];
  serveBall(g);
}

function applyUpgradesToTable(g) {
  const t = g.table;
  if (has(g, 'long_flippers')) for (const f of t.flippers) f.len = f.baseLen * 1.15;
  t.bumperPower = has(g, 'mega_bumpers') ? 1.2 : 1;
}

function spawnShip(g) {
  const hp = 6 + g.sector * 2;
  g.table.ship = { x: CX, y: 172, r: 10, hp, maxHp: hp, dir: 1, hitT: 0, dead: 0 };
}

/** Puts a fresh ball on the plunger. */
function serveBall(g) {
  const b = makeBall(PLUNGER.x, PLUNGER.y, g.nextBallId++);
  g.balls.push(b);
  g.phase = 'launch';
  g.phaseT = 0;
  g.plunger = 0;
  g.ballNo++;
  g.tilt = 0;
  g.tilted = false;
  g.kickbackUsed = false;
  g.magnaUsed = false;
  g.ballSaveArmed = true;
  g.mult = has(g, 'start_x2') ? 2 : 1;
  g.bonus = { bumpers: 0, drops: 0, lanes: 0, stars: 0, spins: 0, missions: 0 };
  g.skillLane = Math.floor(rand(g) * 4);
  g.skillT = 0;
  g.postT = has(g, 'center_post') ? 30 : 0;
  emit(g, 'serve');
}

/** Adds a ball launched straight from the plunger (multiball). */
function addBall(g) {
  g.sideLaunch = !g.sideLaunch;
  const p = g.sideLaunch ? LEFT_PLUNGER : PLUNGER;
  const b = makeBall(p.x, p.y - 6, g.nextBallId++);
  b.vy = -900 - rand(g) * 60;
  g.balls.push(b);
  emit(g, 'launch', { power: 1, auto: true });
}

// ---------------------------------------------------------------- scoring
export function scoreMult(g) {
  let m = g.mult;
  if (g.supernovaT > 0) m *= 2;
  if (g.assistT > 0) m *= 2;
  for (const u of g.upgrades) if (u === 'score_x') m *= 1.25;
  return m;
}

function award(g, base, x, y, label = null) {
  if (g.tilted) return 0;
  const pts = Math.round(base * scoreMult(g) / 10) * 10;
  g.score += pts;
  g.sectorScore += pts;
  emit(g, 'score', { pts, x, y, label, src: g.src });
  return pts;
}

/** Major shots build combos and count for missions. */
function shot(g, name, x, y) {
  missionShot(g, name, x, y);
  addMass(g, 4);
  const window = has(g, 'combo_king') ? 3.5 : 2.5;
  if (g.comboT > 0) g.combo++;
  else g.combo = 1;
  g.comboT = window;
  if (g.combo >= 2) {
    const pts = award(g, POINTS.combo * g.combo * (has(g, 'combo_king') ? 2 : 1), x, y - 10, `${g.combo}X COMBO`);
    emit(g, 'combo', { n: g.combo, pts, x, y });
    g.stats.bestCombo = Math.max(g.stats.bestCombo, g.combo);
  }
}

// ---------------------------------------------------------------- missions
function startMission(g) {
  const def = MISSIONS[g.missionNext % MISSIONS.length];
  g.missionNext++;
  g.missionLit = false;
  const lit = new Set(def.shots || [SHOTS[Math.floor(rand(g) * SHOTS.length)].id]);
  g.mission = { def, t: def.time, n: 0, lit };
  emit(g, 'missionStart', { name: def.name, desc: def.desc, time: def.time });
}

/** A named shot was made: does the running mission want it? */
function missionShot(g, id, x, y) {
  const ms = g.mission;
  if (!ms || !ms.lit.has(id)) return;
  ms.n++;
  const f = g.sector;
  const pts = award(g, 20000 * f * ms.n, x, y - 16, `${ms.def.name.split(' ')[0]} ${ms.n}/${ms.def.need}`);
  emit(g, 'missionHit', { n: ms.n, need: ms.def.need, pts, x, y });
  if (ms.def.id === 'chase') {
    // The comet moves on to another shot.
    const others = SHOTS.filter((q) => q.id !== id);
    ms.lit = new Set([others[Math.floor(rand(g) * others.length)].id]);
  } else if (ms.def.id === 'sweep') ms.lit.delete(id);
  if (ms.n >= ms.def.need) {
    g.missionsDone++;
    g.bonus.missions++;
    const bonus = award(g, 150000 * f * g.missionsDone, CX, 130, 'MISSION COMPLETE');
    addMass(g, 20);
    g.mission = null;
    if (g.missionsDone % 3 === 0) g.extraBallLit = true;
    emit(g, 'missionDone', { name: ms.def.name, pts: bonus, extra: g.missionsDone % 3 === 0 });
  }
}

function stepMission(g) {
  const ms = g.mission;
  if (!ms || g.phase !== 'play') return;
  ms.t -= DT;
  if (ms.t <= 0) {
    g.mission = null;
    emit(g, 'missionFail', { name: ms.def.name });
  }
}

function addMass(g, m) {
  if (g.supernovaT > 0) return;
  g.mass = Math.min(100, g.mass + m * 0.3 * (has(g, 'heavy_star') ? 2 : 1));
  g.table.star.r = 6 + (g.mass / 100) * 5;
  if (g.mass >= 100) supernova(g);
}

function supernova(g) {
  award(g, POINTS.supernova, g.table.star.x, g.table.star.y, 'SUPERNOVA');
  g.supernovaT = 20 + (has(g, 'long_nova') ? 10 : 0);
  g.novaCount++;
  g.stats.supernovas++;
  emit(g, 'supernova');
  const extra = 2 + (has(g, 'multi_plus') ? 1 : 0);
  for (let i = 0; i < extra; i++) addBall(g);
  g.ballSaveT = Math.max(g.ballSaveT, 8);
}

// ---------------------------------------------------------------- contacts
function onHit(g, kind, obj, strength, ball) {
  const t = g.table;
  g.src = kind;
  switch (kind) {
    case 'bumper': {
      const mega = has(g, 'mega_bumpers') ? 3 : 1;
      award(g, POINTS.bumper * mega, obj.x, obj.y - 12);
      obj.flash = 0.18;
      g.bonus.bumpers++;
      addMass(g, 0.5);
      // During multiball, bumpers relight the jackpot.
      if (g.multiball && !g.jackpotLit && --g.relight <= 0) {
        g.jackpotLit = true;
        emit(g, 'relight');
      }
      emit(g, 'bumper', { id: obj.id, x: obj.x, y: obj.y });
      if (has(g, 'chain')) {
        for (const o of t.bumpers) {
          if (o === obj) continue;
          o.flash = 0.18;
          award(g, 500, o.x, o.y - 12);
        }
        emit(g, 'chain', { from: obj.id });
      }
      break;
    }
    case 'sling':
      award(g, POINTS.sling * (has(g, 'hot_slings') ? 20 : 1), ball.x, ball.y - 8);
      obj.flash = 0.12;
      if (has(g, 'hot_slings')) addMass(g, 0.5);
      emit(g, 'sling', { side: obj.side, x: ball.x, y: ball.y });
      break;
    case 'drop':
      if (!obj.up) break;
      obj.up = false;
      award(g, POINTS.drop, obj.ax + 8, (obj.ay + obj.by) / 2);
      g.bonus.drops++;
      addMass(g, 2);
      emit(g, 'drop', { id: obj.id, x: obj.ax, y: (obj.ay + obj.by) / 2 });
      if (t.drops.every((d) => !d.up)) {
        g.dropBanks = (g.dropBanks || 0) + 1;
        const pts = award(g, POINTS.dropsAll * g.dropBanks, obj.ax + 20, 170, 'NOVA BANK');
        shot(g, 'drops', obj.ax + 20, 180);
        g.kickbackUsed = false;
        g.magnaUsed = false;
        // Every bank relights the extra ball's kickback and adds a lock light.
        emit(g, 'dropsAll', { n: g.dropBanks, pts });
        t.dropReset = 1.2;
      }
      break;
    case 'standup': {
      award(g, obj.lit ? 500 : 3000, (obj.ax + obj.bx) / 2, obj.ay - 6);
      obj.flash = 0.2;
      missionShot(g, 'ion', (obj.ax + obj.bx) / 2, obj.ay);
      emit(g, 'standup', { id: obj.id, x: (obj.ax + obj.bx) / 2, y: obj.ay });
      if (obj.lit) break;
      obj.lit = true;
      if (t.standups.every((q) => q.lit)) {
        for (const q of t.standups) q.lit = false;
        award(g, 25000, CX, 128, 'I O N');
        addMass(g, 4);
        if (g.mission) {
          g.mission.t += 10;
          emit(g, 'ion', { lit: 'time' });
        } else {
          g.missionLit = true;
          emit(g, 'ion', { lit: 'mission' });
        }
      }
      break;
    }
    case 'captive': {
      const cb = obj;
      cb.flash = 0.2;
      award(g, 500, cb.x, cb.y + 12);
      missionShot(g, 'captive', cb.x, cb.y + 12);
      emit(g, 'captive', { x: cb.x, y: cb.y, strength });
      break;
    }
    case 'captiveTop': {
      const cb = obj;
      cb.hits++;
      cb.flash = 0.5;
      const pts = award(g, 40000 * cb.hits, cb.x, cb.y - 10, 'PLANET CRACKED');
      addMass(g, 5);
      shot(g, 'planet', cb.x, cb.y);
      emit(g, 'planet', { x: cb.x, y: cb.y, n: cb.hits, pts });
      // Cracking the planet also starts a lit mission.
      if (g.missionLit && !g.mission && !g.multiball) startMission(g);
      break;
    }
    case 'lane': {
      const i = obj.id;
      if (g.skillT > 0) {
        g.skillT = 0;
        if (i === g.skillLane) {
          const pts = award(g, 30000 * g.sector, (obj.x0 + obj.x1) / 2, obj.y + 16, 'SKILL SHOT');
          addMass(g, 5);
          emit(g, 'skill', { pts });
        }
      }
      if (!g.lanes[i]) {
        g.lanes[i] = true;
        award(g, POINTS.lane, (obj.x0 + obj.x1) / 2, obj.y + 8);
        g.bonus.lanes++;
        emit(g, 'lane', { id: i, x: (obj.x0 + obj.x1) / 2 });
        if (g.lanes.every(Boolean)) {
          const k = MULTS.indexOf(g.mult);
          g.mult = MULTS[Math.min(MULTS.length - 1, k + 1)];
          award(g, POINTS.lanesAll, CX, 50, `MULTIPLIER X${g.mult}`);
          shot(g, 'lanes', CX, 60);
          emit(g, 'lanesAll', { mult: g.mult });
          g.lanes = [false, false, false, false];
        }
      } else {
        award(g, 500, (obj.x0 + obj.x1) / 2, obj.y + 8);
      }
      break;
    }
    case 'spinner': {
      if (obj.gate) {
        // The right orbit's hyperspace gate.
        if (ball.vy < 0) {
          award(g, 2500, obj.x0 + 9, obj.y - 8);
          g.orbit = { t: g.t, id: ball.id, side: 1 };
          obj.spin = 1;
          emit(g, 'gate');
        }
        break;
      }
      const spins = Math.max(1, Math.round(strength / 90));
      award(g, POINTS.spin * spins * (has(g, 'gold_spinner') ? 8 : 1), (obj.x0 + obj.x1) / 2, obj.y - 8);
      g.bonus.spins += spins;
      obj.spin = Math.min(3, (obj.spin || 0) + spins * 0.25);
      emit(g, 'spinner', { spins, id: obj.id });
      if (ball.vy < 0) g.orbit = { t: g.t, id: ball.id, side: 0 };
      break;
    }
    case 'star': {
      if (g.multiball && g.jackpotLit) {
        const pts = award(g, POINTS.jackpot * (has(g, 'jackpot_x2') ? 2 : 1), obj.x, obj.y - 14, 'JACKPOT');
        g.stats.jackpots++;
        g.jackpotLit = false;
        g.relight = 6;
        emit(g, 'jackpot', { pts, x: obj.x, y: obj.y });
      } else {
        award(g, POINTS.star * (g.mission && g.mission.def.id === 'forge' ? 5 : 1), obj.x, obj.y - 14);
      }
      missionShot(g, 'star', obj.x, obj.y);
      obj.flash = 0.25;
      g.bonus.stars++;
      addMass(g, 3);
      emit(g, 'star', { x: obj.x, y: obj.y });
      break;
    }
    case 'ramp': {
      if (strength < 180 || ball.held) break;
      ball.held = 'ramp';
      ball.ramp = obj.id;
      ball.rampK = 0;
      emit(g, 'rampIn', { id: obj.id });
      break;
    }
    case 'letter': {
      if (obj.lit) {
        award(g, 200, obj.x, obj.y - 6);
        break;
      }
      obj.lit = true;
      award(g, 1000, obj.x, obj.y - 6);
      addMass(g, 1);
      emit(g, 'letter', { id: obj.id, x: obj.x, y: obj.y });
      if (t.letters.every((q) => q.lit)) {
        award(g, 75000, STAR.x, STAR.y - 40, 'S U P E R N O V A');
        shot(g, 'letters', STAR.x, STAR.y);
        emit(g, 'letters');
        for (const q of t.letters) q.lit = false;
        addMass(g, 15);
      }
      break;
    }
    case 'asteroid': {
      if (obj.off) break;
      obj.off = true;
      award(g, 2500, obj.x, obj.y - 8);
      addMass(g, 1);
      emit(g, 'asteroid', { x: obj.x, y: obj.y });
      if (t.asteroids.every((q) => q.off)) {
        const pts = award(g, 15000 * g.sector, CX, 262, 'BELT CLEARED');
        shot(g, 'belt', CX, 272);
        g.beltT = 6;
        emit(g, 'belt', { pts });
      }
      break;
    }
    case 'moon':
      award(g, 5000, obj.x, obj.y - 8);
      obj.flash = 0.2;
      addMass(g, 3);
      emit(g, 'moon', { x: obj.x, y: obj.y });
      break;
    case 'rollover':
      award(g, 1500, obj.x, obj.y - 8);
      obj.flash = 0.3;
      emit(g, 'rollover', { id: obj.id });
      break;
    case 'comet': {
      award(g, POINTS.comet, obj.x, obj.y - 10, 'COMET!');
      g.stats.comets++;
      shot(g, 'comet', obj.x, obj.y);
      emit(g, 'comet', { x: obj.x, y: obj.y });
      t.comet.cool = 4 + rand(g) * 3;
      obj.off = true;
      break;
    }
    case 'ship': {
      const s = t.ship;
      if (!s || s.dead) break;
      s.hp--;
      s.hitT = 0.3;
      award(g, POINTS.ship, s.x, s.y - 14);
      emit(g, 'shipHit', { x: s.x, y: s.y, hp: s.hp });
      if (s.hp <= 0) {
        s.dead = 3;
        obj.off = true;
        award(g, POINTS.shipKill, s.x, s.y, 'MOTHERSHIP DOWN');
        g.stats.ships++;
        shot(g, 'ship', s.x, s.y);
        emit(g, 'shipKill', { x: s.x, y: s.y });
      }
      break;
    }
    case 'flipper':
      emit(g, 'flipHit', { strength });
      break;
    case 'post':
    case 'rubber':
      if (strength > 80) emit(g, 'rubber', { strength });
      break;
    case 'wall':
    case 'guide':
    case 'apron':
    case 'laneguide':
      if (strength > 250) emit(g, 'thud', { strength });
      break;
    default:
  }
}

// ---------------------------------------------------------------- moving targets
function updateMovers(g) {
  const t = g.table;
  const c = t.comet;
  if (c) {
    if (!t.cometCircle) {
      t.cometCircle = { x: c.x, y: c.y, r: c.r, kind: 'comet', e: 0.5, off: false };
      t.circles.push(t.cometCircle);
    }
    const cc = t.cometCircle;
    if (cc.off) {
      c.cool -= DT;
      if (c.cool <= 0) cc.off = false;
    }
    c.a += DT * 0.9;
    const nx = CX + Math.cos(c.a) * 52, ny = 150 + Math.sin(c.a * 2) * 10;
    cc.vx = (nx - cc.x) / DT;
    cc.vy = (ny - cc.y) / DT;
    cc.x = c.x = nx;
    cc.y = c.y = ny;
  }
  const s = t.ship;
  if (s) {
    if (!t.shipCircle) {
      t.shipCircle = { x: s.x, y: s.y, r: s.r, kind: 'ship', e: 0.6, off: false };
      t.circles.push(t.shipCircle);
    }
    if (s.dead) {
      s.dead -= DT;
      if (s.dead <= 0) {
        const hp = 6 + g.sector * 2 + g.stats.ships * 2;
        Object.assign(s, { hp, maxHp: hp, dead: 0 });
        t.shipCircle.off = false;
      }
    } else {
      s.x += s.dir * 22 * DT;
      if (s.x > 136) s.dir = -1;
      if (s.x < 64) s.dir = 1;
      t.shipCircle.x = s.x;
      t.shipCircle.y = s.y + Math.sin(g.t * 2) * 2;
      t.shipCircle.vx = s.dir * 22;
    }
    s.hitT = Math.max(0, s.hitT - DT);
  }
  const h = t.hole;
  if (h) {
    h.a += DT * 0.35;
    h.x = CX + Math.cos(h.a) * 36;
    h.y = 188 + Math.sin(h.a * 1.7) * 8;
  }
  if (t.dropReset > 0) {
    t.dropReset -= DT;
    if (t.dropReset <= 0) {
      for (const d of t.drops) d.up = true;
      emit(g, 'dropReset');
    }
  }
  t.captive.flash = Math.max(0, t.captive.flash - DT);
  for (const sp of t.spinners) sp.spin = Math.max(0, (sp.spin || 0) - DT);
  for (const r of t.rollovers) r.flash = Math.max(0, (r.flash || 0) - DT);
  // The asteroids drift; a cleared belt comes back after a while.
  for (const a of t.asteroids) {
    const nx = CX + Math.sin(g.t * 0.5 + a.id * 2.1) * 40, ny = 274 + Math.sin(g.t * 1.3 + a.id * 1.7) * 6;
    a.vx = (nx - a.x) / DT;
    a.vy = (ny - a.y) / DT;
    a.x = nx;
    a.y = ny;
  }
  if (g.beltT > 0) {
    g.beltT -= DT;
    if (g.beltT <= 0) for (const a of t.asteroids) a.off = false;
  }
  // The moons orbit the star.
  for (const mo of t.moons) {
    mo.a += DT * 1.1;
    const nx = STAR.x + Math.cos(mo.a) * 22, ny = STAR.y + Math.sin(mo.a) * 17;
    mo.vx = (nx - mo.x) / DT;
    mo.vy = (ny - mo.y) / DT;
    mo.x = nx;
    mo.y = ny;
    mo.flash = Math.max(0, (mo.flash || 0) - DT);
  }
  for (const b of t.bumpers) b.flash = Math.max(0, (b.flash || 0) - DT);
  t.star.flash = Math.max(0, (t.star.flash || 0) - DT);
  for (const s2 of t.segments) if (s2.flash) s2.flash = Math.max(0, s2.flash - DT);
  // The center post comes and goes.
  const post = t.circles.find((q) => q.kind === 'centerpost');
  if (g.postT > 0) {
    if (!post) t.circles.push({ x: CX, y: 380, r: 2.5, kind: 'centerpost', e: 0.5 });
  } else if (post) t.circles.splice(t.circles.indexOf(post), 1);
}

// ---------------------------------------------------------------- the step
/**
 * input: { left, right, launch (held), nudge (pressed this step) }.
 * Events for sound and effects collect in g.events (cleared by the caller).
 */
export function step(g, input) {
  g.t += DT;
  g.phaseT += DT;
  const t = g.table;

  if (g.phase === 'over' || g.phase === 'upgrade') return;
  if (g.phase === 'warp') {
    if (g.phaseT > 2.2) {
      g.phase = 'upgrade';
      g.offers = makeOffers(g);
      emit(g, 'offers');
    }
    return;
  }
  if (g.phase === 'bonus') {
    stepBonus(g);
    return;
  }

  // Flippers (dead while tilted).
  const L = !!input.left && !g.tilted, R = !!input.right && !g.tilted;
  if (L && !t.flippers[0].held) {
    emit(g, 'flip', { side: 'left' });
    g.lanes.push(g.lanes.shift()); // lane change
    if (g.skillT > 0 || g.phase === 'launch') g.skillLane = (g.skillLane + 3) % 4;
  }
  if (R && !t.flippers[1].held) {
    emit(g, 'flip', { side: 'right' });
    g.lanes.unshift(g.lanes.pop());
    if (g.skillT > 0 || g.phase === 'launch') g.skillLane = (g.skillLane + 1) % 4;
  }
  for (const f of t.flippers) f.held = f.side === 1 ? L : R;

  // Plunger.
  const onPlunger = g.balls.find((b) => b.x > LANE_X && b.y > PLUNGER.y - 8 && Math.abs(b.vy) < 30);
  if (onPlunger && input.launch) {
    g.plunger = Math.min(1, g.plunger + DT * 1.4);
    g.launchHeld = true;
  } else if (g.launchHeld && !input.launch) {
    g.launchHeld = false;
    if (onPlunger) {
      const p = Math.max(0.15, g.plunger);
      onPlunger.vy = -(280 + p * 700);
      emit(g, 'launch', { power: p });
      if (g.phase === 'launch') {
        g.phase = 'play';
        g.phaseT = 0;
        g.skillT = 5;
      }
      if (g.ballSaveArmed) {
        g.ballSaveT = BALL_SAVE + (has(g, 'ball_saver') ? 8 : 0);
        g.ballSaveArmed = false;
      }
    }
    g.plunger = 0;
  } else if (!input.launch) g.launchHeld = false;

  // A ball resting in the left lane is fired straight back out.
  for (const b of g.balls) {
    if (b.x < 16 && b.y > LEFT_PLUNGER.y - 8 && Math.abs(b.vy) < 30 && !b.held) {
      b.vy = -900;
      emit(g, 'launch', { power: 1, auto: true });
    }
  }

  // Nudge.
  if (input.nudge && !g.tilted) {
    g.tilt += has(g, 'steady') ? 0.2 : 0.4;
    for (const b of g.balls) {
      if (b.held) continue;
      b.vx += (rand(g) - 0.5) * 120;
      b.vy -= 90;
    }
    emit(g, 'nudge', { tilt: g.tilt });
    if (g.tilt >= 1) {
      g.tilted = true;
      t.flippers.forEach((f) => (f.held = false));
      emit(g, 'tilt');
    } else if (g.tilt > 0.55) emit(g, 'warning');
  }
  g.tilt = Math.max(0, g.tilt - DT * 0.35);

  updateMovers(g);

  // Physics.
  const gravity = GRAVITY * (has(g, 'low_gravity') ? 0.85 : 1) * (g.relaxed ? 0.8 : 1);
  const hit = (kind, obj, strength, ball) => onHit(g, kind, obj, strength, ball);
  const dt = DT / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    stepFlippers(t.flippers, dt);
    for (const b of g.balls) stepBall(b, t, dt, gravity, hit);
    stepCaptive(t.captive, dt, gravity, hit);
    if (g.balls.length > 1) collideBalls(g.balls);
  }
  for (const b of g.balls) b.age += DT;

  // Ball search: a ball that has stopped dead somewhere gets kicked loose.
  for (const b of g.balls) {
    const onPlunger = (b.x > LANE_X || b.x < 16) && b.y > PLUNGER.y - 8;
    if (b.held || onPlunger || Math.hypot(b.vx, b.vy) > 8) {
      b.still = 0;
      continue;
    }
    b.still = (b.still || 0) + DT;
    if (b.still > 3) {
      b.still = 0;
      b.vx = (rand(g) - 0.5) * 300;
      b.vy = -250;
      emit(g, 'ballSearch');
    }
  }
  checkCaptures(g);
  g.balls = g.balls.filter((b) => !b.gone);
  checkOrbit(g);
  checkOutlanes(g);

  // Timers.
  if (g.phase === 'play') g.ballSaveT = Math.max(0, g.ballSaveT - DT);
  g.postT = Math.max(0, (g.postT || 0) - DT);
  g.comboT = Math.max(0, g.comboT - DT);
  g.skillT = Math.max(0, g.skillT - DT);
  stepMission(g);
  if (g.comboT === 0) g.combo = 0;
  g.assistT = Math.max(0, g.assistT - DT);
  if (g.supernovaT > 0) {
    g.supernovaT -= DT;
    if (g.supernovaT <= 0) {
      g.supernovaT = 0;
      g.mass = 0;
      t.star.r = 6;
      emit(g, 'novaEnd');
    }
  }

  // Drains.
  const drained = g.balls.filter((b) => !b.held && b.y > DRAIN_Y);
  if (drained.length) {
    g.balls = g.balls.filter((b) => !drained.includes(b));
    for (const b of drained) onDrain(g, b);
  }
  if (g.multiball && g.balls.length <= 1) {
    g.multiball = false;
    g.jackpotLit = false;
    emit(g, 'multiballEnd');
  }

  // Sector cleared?
  if (g.sectorScore >= g.target && g.phase === 'play') {
    g.phase = 'warp';
    g.phaseT = 0;
    g.ballsLeft = Math.min(MAX_BALLS, g.ballsLeft + 1);
    for (const b of g.balls) b.held = 'warp';
    g.supernovaT = 0;
    emit(g, 'sectorClear', { sector: g.sector });
  }
}

function onDrain(g, b) {
  void b;
  if (g.balls.length > 0) {
    // Multiball (or supernova) ball save sends every lost ball back.
    if (g.ballSaveT > 0 && !g.tilted) {
      addBall(g);
      emit(g, 'ballSaved');
      return;
    }
    emit(g, 'drainOne');
    return;
  }
  if (g.ballSaveT > 0 && !g.tilted) {
    g.balls.push(Object.assign(makeBall(PLUNGER.x, PLUNGER.y - 6, g.nextBallId++), { vy: -880 }));
    emit(g, 'ballSaved');
    emit(g, 'launch', { power: 1, auto: true });
    g.ballSaveT = 0;
    return;
  }
  if (has(g, 'ghost_ball') && !g.ghostUsed) {
    g.ghostUsed = true;
    g.balls.push(Object.assign(makeBall(PLUNGER.x, PLUNGER.y - 6, g.nextBallId++), { vy: -880 }));
    emit(g, 'ghost');
    emit(g, 'launch', { power: 1, auto: true });
    return;
  }
  // The last ball is gone: count the bonus.
  if (g.mission) {
    emit(g, 'missionFail', { name: g.mission.def.name });
    g.mission = null;
    g.missionLit = true;
  }
  g.supernovaT = 0;
  g.mass = Math.max(0, g.mass - 20);
  g.table.star.r = 6 + (g.mass / 100) * 5;
  g.multiball = false;
  g.phase = 'bonus';
  g.phaseT = 0;
  const bb = g.bonus;
  const items = [
    ['BUMPERS', bb.bumpers, 300], ['TARGETS', bb.drops, 2000], ['LANES', bb.lanes, 3000], ['STAR HITS', bb.stars, 5000], ['SPINS', bb.spins, 100], ['MISSIONS', bb.missions, 50000],
  ].filter(([, n]) => n > 0);
  g.bonusCount = { items, i: 0, t: 0, total: 0, tilted: g.tilted, x: g.mult };
  emit(g, 'drain');
}

function stepBonus(g) {
  const bc = g.bonusCount;
  bc.t += DT;
  if (bc.i < bc.items.length) {
    if (bc.t > 0.45) {
      const [, n, each] = bc.items[bc.i];
      if (!bc.tilted) bc.total += n * each;
      emit(g, 'bonusTick', { i: bc.i });
      bc.i++;
      bc.t = 0;
    }
    return;
  }
  if (bc.t > 0.5 && !bc.done) {
    bc.done = true;
    const pts = bc.tilted ? 0 : bc.total * bc.x;
    g.score += pts;
    g.sectorScore += pts;
    emit(g, 'bonusTotal', { pts });
  }
  if (bc.t > 1.4) {
    g.bonusCount = null;
    g.ballsLeft--;
    if (g.sectorScore >= g.target) {
      // The bonus finished the sector.
      g.ballsLeft = Math.min(MAX_BALLS, g.ballsLeft + 2);
      g.phase = 'warp';
      g.phaseT = 0;
      emit(g, 'sectorClear', { sector: g.sector });
      return;
    }
    if (g.ballsLeft <= 0) {
      g.phase = 'over';
      g.phaseT = 0;
      emit(g, 'over');
      return;
    }
    serveBall(g);
  }
}

// The wormhole saucer and the black hole grab slow balls.
function checkCaptures(g) {
  const t = g.table;
  for (const b of g.balls) {
    if (b.held === 'ramp') {
      // Riding a ramp over the playfield.
      const r = t.ramps[b.ramp];
      b.rampK += (DT * 430) / r.len;
      const p = rampPoint(r, b.rampK);
      b.x = p.x;
      b.y = p.y;
      if (b.rampK >= 1) {
        b.held = null;
        b.vx = 0;
        b.vy = 160;
        g.rampRun = g.t - (g.lastRampT || -9) < 5 ? (g.rampRun || 0) + 1 : 1;
        g.lastRampT = g.t;
        const pts = award(g, POINTS.ramp * g.rampRun, b.x, b.y - 20, g.rampRun > 1 ? `RAMP X${g.rampRun}` : 'RAMP');
        shot(g, r.id ? 'rramp' : 'lramp', b.x, b.y);
        addMass(g, 4);
        emit(g, 'ramp', { id: r.id, n: g.rampRun, pts, x: b.x, y: b.y });
      }
      continue;
    }
    if (b.held) {
      b.holdT -= DT;
      if (b.held === 'wormhole' && b.holdT <= 0) {
        // Out of the white hole on the other side of the table.
        b.held = null;
        b.x = WHITE_HOLE.x;
        b.y = WHITE_HOLE.y;
        b.vx = -100 - rand(g) * 60;
        b.vy = 150 + rand(g) * 50;
        emit(g, 'kickout', { x: b.x, y: b.y });
      }
      if (b.held === 'hole' && b.holdT <= 0) {
        b.held = null;
        b.vx = (rand(g) - 0.5) * 160;
        b.vy = -560;
        emit(g, 'holeOut', { x: b.x, y: b.y });
      }
      continue;
    }
    // Wormholes.
    const w = t.wormholes.find((q) => (b.x - q.x) ** 2 + (b.y - q.y) ** 2 < 36);
    if (w && Math.hypot(b.vx, b.vy) < 420) {
      b.hole = w.id;
      b.held = 'wormhole';
      b.holdT = 1.2;
      b.x = w.x;
      b.y = w.y;
      b.vx = b.vy = 0;
      award(g, POINTS.wormhole, w.x, w.y - 12, 'WORMHOLE');
      shot(g, 'worm', w.x, w.y);
      emit(g, 'wormhole', { x: w.x, y: w.y });
      if (g.extraBallLit) {
        g.extraBallLit = false;
        g.ballsLeft++;
        emit(g, 'extraBall');
      } else if (g.missionLit && !g.mission && !g.multiball) {
        startMission(g);
        b.holdT = 2;
      } else if (g.sector >= 2 && !g.multiball) {
        g.locks++;
        if (g.locks >= 2) {
          startMultiball(g);
        } else {
          // Locked: the ball vanishes into the wormhole and a new one is served.
          b.gone = true;
          emit(g, 'lock', { n: g.locks });
          g.balls.push(makeBall(PLUNGER.x, PLUNGER.y, g.nextBallId++));
          g.phase = 'launch';
          g.lockHole = w.id;
        }
      }
    }
    // Black hole.
    const h = t.hole;
    if (h) {
      const hx = b.x - h.x, hy = b.y - h.y;
      if (hx * hx + hy * hy < 16) {
        b.held = 'hole';
        b.holdT = 0.9;
        b.x = h.x;
        b.y = h.y;
        b.vx = b.vy = 0;
        g.assistT = 6;
        award(g, POINTS.hole, h.x, h.y - 12, 'GRAVITY ASSIST');
        shot(g, 'hole', h.x, h.y);
        emit(g, 'hole', { x: h.x, y: h.y });
      }
    }
  }
}

function startMultiball(g) {
  g.multiball = true;
  g.jackpotLit = true;
  g.stats.multiballs++;
  // The ball in the wormhole comes back out, and so do the ones locked earlier.
  for (let i = 0; i < g.locks - 1; i++) {
    const w = g.table.wormholes[(g.lockHole || 0) % 2];
    const b = makeBall(w.x, w.y, g.nextBallId++);
    b.hole = w.id;
    b.held = 'wormhole';
    b.holdT = 0.4 + i * 0.5;
    g.balls.push(b);
  }
  g.locks = 0;
  const extra = 1 + (has(g, 'multi_plus') ? 1 : 0);
  for (let i = 0; i < extra; i++) addBall(g);
  g.ballSaveT = Math.max(g.ballSaveT, 10);
  emit(g, 'multiball');
}

function checkOrbit(g) {
  if (g.t - g.orbit.t > 2.5) return;
  for (const b of g.balls) {
    const far = g.orbit.side === 0 ? b.x > 150 : b.x < 50;
    if (b.id === g.orbit.id && far && b.y < 80 && !b.held) {
      award(g, POINTS.orbit, b.x, 60, 'ORBIT');
      shot(g, g.orbit.side ? 'rorbit' : 'lorbit', b.x, 60);
      emit(g, 'orbit');
      g.orbit = { t: -9 };
    }
  }
}

// Kickback and magna-save in the outlanes.
function checkOutlanes(g) {
  for (const b of g.balls) {
    if (b.held || b.y < 330 || b.y > 372) continue;
    if (b.x > 16 && b.x < 28.5 && has(g, 'kickback') && !g.kickbackUsed && b.vy > 0) {
      g.kickbackUsed = true;
      b.vy = -760;
      b.vx = 20;
      emit(g, 'kickback');
    }
    if (b.x > 171.5 && b.x < LANE_X && has(g, 'magna') && !g.magnaUsed && b.vy > 0) {
      g.magnaUsed = true;
      b.vy = -700;
      b.vx = -120;
      emit(g, 'magna');
    }
  }
}

// ---------------------------------------------------------------- sectors and upgrades
export function makeOffers(g) {
  const pool = UPGRADES.filter((u) => u.repeat || !has(g, u.id));
  const out = [];
  while (out.length < 3 && pool.length) {
    const i = Math.floor(rand(g) * pool.length);
    out.push(pool.splice(i, 1)[0].id);
  }
  return out;
}

/** Applies an upgrade and starts the next sector. Returns false if nothing was offered. */
export function pickUpgrade(g, i) {
  if (g.phase !== 'upgrade') return false;
  const id = g.offers[i];
  if (!id) return false;
  g.upgrades.push(id);
  if (id === 'extra_ball') g.ballsLeft = Math.min(MAX_BALLS + 2, g.ballsLeft + 2);
  g.offers = [];
  emit(g, 'upgrade', { id });
  startSector(g, g.sector + 1);
  g.ballNo--; // the warp isn't a new ball
  return true;
}

export const isFinal = (g) => g.sector >= FINAL_SECTOR;

// ---------------------------------------------------------------- autopilot
/** Plays by itself: good enough for the attract mode and for tuning. */
export function autopilot(g, skill = 1) {
  const ap = g.ap;
  ap.rs = ap.rs || (g.rs % 2147483646) + 1;
  const roll = () => {
    ap.rs = (ap.rs * 16807) % 2147483647;
    return ap.rs / 2147483647;
  };
  const input = { left: false, right: false, launch: false, nudge: false };
  if (g.phase === 'launch' || g.balls.some((b) => b.x > LANE_X && b.y > PLUNGER.y - 8)) {
    ap.charge += DT;
    input.launch = ap.charge < 0.5 + (g.ballNo % 3) * 0.12;
    if (!input.launch) ap.charge = 0;
  }
  const t = g.table;
  t.flippers.forEach((f, i) => {
    let want = false;
    for (const b of g.balls) {
      if (b.held) continue;
      const tx = f.px + Math.cos(f.rest) * f.len, ty = f.py + Math.sin(f.rest) * f.len;
      const dx = tx - f.px, dy = ty - f.py;
      const L2 = dx * dx + dy * dy;
      const u = ((b.x - f.px) * dx + (b.y - f.py) * dy) / L2;
      const dist = Math.abs((b.x - f.px) * dy - (b.y - f.py) * dx) / Math.sqrt(L2);
      const above = b.y < f.py + Math.sin(f.rest) * f.len * u;
      if (b.vy > 20 && u > 0.25 && u < 1.1 && dist < 14 + BALL_R && above) want = true;
    }
    // A human misses now and then: decide once per approach.
    const key = `dec${i}`;
    if (want && ap[key] === undefined) ap[key] = roll() < skill;
    if (!want) ap[key] = undefined;
    if (want && ap[key]) {
      if (f.side === 1) ap.holdL = 0.2;
      else ap.holdR = 0.2;
    }
  });
  ap.holdL -= DT;
  ap.holdR -= DT;
  input.left = ap.holdL > 0;
  input.right = ap.holdR > 0;
  return input;
}

export function snapshot(g) {
  return {
    phase: g.phase, sector: g.sector, score: g.score, sectorScore: g.sectorScore, target: g.target, ballsLeft: g.ballsLeft,
    balls: g.balls.map((b) => ({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), held: b.held })), mult: g.mult, mass: +g.mass.toFixed(1),
    supernova: g.supernovaT > 0, multiball: g.multiball, locks: g.locks, upgrades: [...g.upgrades], offers: [...g.offers],
    tilted: g.tilted, lanes: [...g.lanes], drops: g.table.drops.map((d) => d.up),
    mission: g.mission ? g.mission.def.id : null, missionsDone: g.missionsDone,
  };
}
