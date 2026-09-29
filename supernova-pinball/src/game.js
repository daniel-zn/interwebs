// The rules of a run: scoring, lanes, targets, the wormhole, multiball,
// supernova, sectors and upgrades, plus an autopilot for the attract mode and
// tests. Stepped at a fixed 60 Hz with physics substeps. No DOM.
import {
  BALL_SAVE, FINAL_SECTOR, GRAVITY, MAX_BALLS, MULTS, POINTS, START_BALLS, UPGRADES, sectorFor,
} from './data.js';
import { SUBSTEPS, collideBalls, makeBall, stepBall, stepFlippers } from './physics.js';
import { BALL_R, CX, DRAIN_Y, LANE_X, LEFT_PLUNGER, PLUNGER, STAR, buildTable, rampPoint } from './table.js';

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
    plunger: 0, launchHeld: false,
    bonus: { bumpers: 0, drops: 0, lanes: 0, stars: 0, spins: 0 },
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
  if (n >= 4) g.table.hole = { x: CX, y: 176, a: 0, catchT: 0 };
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
  g.table.ship = { x: CX, y: 70, r: 10, hp, maxHp: hp, dir: 1, hitT: 0, dead: 0 };
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
  g.bonus = { bumpers: 0, drops: 0, lanes: 0, stars: 0, spins: 0 };
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

/** Major shots build combos. */
function shot(g, name, x, y) {
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
  void name;
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
      award(g, POINTS.drop, obj.ax + (obj.bank ? -8 : 8), (obj.ay + obj.by) / 2);
      g.bonus.drops++;
      addMass(g, 2);
      emit(g, 'drop', { id: obj.id, x: obj.ax, y: (obj.ay + obj.by) / 2 });
      const bank = t.drops.filter((d) => d.bank === obj.bank);
      if (bank.every((d) => !d.up)) {
        const both = t.drops.every((d) => !d.up);
        award(g, POINTS.dropsAll * (both ? 3 : 1), obj.ax, 160, both ? 'DOUBLE BANK' : 'TARGETS!');
        shot(g, 'drops', obj.ax, 170);
        g.kickbackUsed = false;
        g.magnaUsed = false;
        emit(g, 'dropsAll', { bank: obj.bank, both });
        (t.dropReset ||= [0, 0])[obj.bank] = 1.2;
      }
      break;
    case 'lane': {
      const i = obj.id;
      if (!g.lanes[i]) {
        g.lanes[i] = true;
        award(g, POINTS.lane, (obj.x0 + obj.x1) / 2, obj.y + 8);
        g.bonus.lanes++;
        emit(g, 'lane', { id: i });
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
      const spins = Math.max(1, Math.round(strength / 90));
      award(g, POINTS.spin * spins * (has(g, 'gold_spinner') ? 8 : 1), (obj.x0 + obj.x1) / 2, obj.y - 8);
      g.bonus.spins += spins;
      obj.spin = Math.min(3, (obj.spin || 0) + spins * 0.25);
      emit(g, 'spinner', { spins, id: obj.id });
      if (ball.vy < 0) g.orbit = { t: g.t, id: ball.id, side: obj.id };
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
        award(g, POINTS.star, obj.x, obj.y - 14);
      }
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
    const nx = CX + Math.cos(c.a) * 50, ny = 62 + Math.sin(c.a * 2) * 14;
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
      if (s.x > 122) s.dir = -1;
      if (s.x < 54) s.dir = 1;
      t.shipCircle.x = s.x;
      t.shipCircle.y = s.y + Math.sin(g.t * 2) * 2;
      t.shipCircle.vx = s.dir * 22;
    }
    s.hitT = Math.max(0, s.hitT - DT);
  }
  const h = t.hole;
  if (h) {
    h.a += DT * 0.35;
    h.x = CX + Math.cos(h.a) * 30;
    h.y = 172 + Math.sin(h.a * 1.7) * 10;
  }
  if (t.dropReset) {
    t.dropReset.forEach((r, bank) => {
      if (r <= 0) return;
      t.dropReset[bank] = r - DT;
      if (t.dropReset[bank] <= 0) {
        for (const d of t.drops) if (d.bank === bank) d.up = true;
        emit(g, 'dropReset');
      }
    });
  }
  for (const sp of t.spinners) sp.spin = Math.max(0, (sp.spin || 0) - DT);
  for (const r of t.rollovers) r.flash = Math.max(0, (r.flash || 0) - DT);
  // The moons orbit the star.
  for (const mo of t.moons) {
    mo.a += DT * 1.1;
    const nx = STAR.x + Math.cos(mo.a) * 21, ny = STAR.y + Math.sin(mo.a) * 17;
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
    if (!post) t.circles.push({ x: CX, y: 333, r: 2.5, kind: 'centerpost', e: 0.5 });
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
  }
  if (R && !t.flippers[1].held) {
    emit(g, 'flip', { side: 'right' });
    g.lanes.unshift(g.lanes.pop());
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
    if (b.x < 14 && b.y > LEFT_PLUNGER.y - 8 && Math.abs(b.vy) < 30 && !b.held) {
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
    if (g.balls.length > 1) collideBalls(g.balls);
  }
  for (const b of g.balls) b.age += DT;

  // Ball search: a ball that has stopped dead somewhere gets kicked loose.
  for (const b of g.balls) {
    const onPlunger = (b.x > LANE_X || b.x < 14) && b.y > PLUNGER.y - 8;
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
  g.supernovaT = 0;
  g.mass = Math.max(0, g.mass - 20);
  g.table.star.r = 6 + (g.mass / 100) * 5;
  g.multiball = false;
  g.phase = 'bonus';
  g.phaseT = 0;
  const bb = g.bonus;
  const items = [
    ['BUMPERS', bb.bumpers, 300], ['TARGETS', bb.drops, 2000], ['LANES', bb.lanes, 3000], ['STAR HITS', bb.stars, 5000], ['SPINS', bb.spins, 100],
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
        shot(g, 'ramp', b.x, b.y);
        addMass(g, 4);
        emit(g, 'ramp', { id: r.id, n: g.rampRun, pts, x: b.x, y: b.y });
      }
      continue;
    }
    if (b.held) {
      b.holdT -= DT;
      if (b.held === 'wormhole' && b.holdT <= 0) {
        const w = t.wormholes[b.hole || 0];
        const dir = w.x < CX ? 1 : -1;
        b.held = null;
        b.vx = dir * (200 + rand(g) * 60);
        b.vy = 150 + rand(g) * 60;
        b.x = w.x + dir * 7;
        b.y = w.y + 4;
        emit(g, 'kickout');
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
    const w = t.wormholes.find((q) => (b.x - q.x) ** 2 + (b.y - q.y) ** 2 < 20);
    if (w && Math.hypot(b.vx, b.vy) < 420) {
      b.hole = w.id;
      b.held = 'wormhole';
      b.holdT = 1.2;
      b.x = w.x;
      b.y = w.y;
      b.vx = b.vy = 0;
      award(g, POINTS.wormhole, w.x, w.y - 12, 'WORMHOLE');
      shot(g, 'wormhole', w.x, w.y);
      emit(g, 'wormhole', { x: w.x, y: w.y });
      if (g.sector >= 2 && !g.multiball) {
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
    const far = g.orbit.side === 0 ? b.x > 132 : b.x < 44;
    if (b.id === g.orbit.id && far && b.y < 70 && !b.held) {
      award(g, POINTS.orbit, b.x, 60, 'ORBIT');
      shot(g, 'orbit', b.x, 60);
      emit(g, 'orbit');
      g.orbit = { t: -9 };
    }
  }
}

// Kickback and magna-save in the outlanes.
function checkOutlanes(g) {
  for (const b of g.balls) {
    if (b.held || b.y < 290 || b.y > 326) continue;
    if (b.x > 14 && b.x < 25 && has(g, 'kickback') && !g.kickbackUsed && b.vy > 0) {
      g.kickbackUsed = true;
      b.vy = -760;
      b.vx = 20;
      emit(g, 'kickback');
    }
    if (b.x > 151 && b.x < LANE_X && has(g, 'magna') && !g.magnaUsed && b.vy > 0) {
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
  ap.rs = ap.rs || 12345;
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
  };
}
