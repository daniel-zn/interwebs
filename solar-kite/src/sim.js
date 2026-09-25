// All the rules: the kite, the solar wind, tricks, combos and scoring. No DOM,
// so everything here runs in Node too.
//
// World units: x runs downwind (away from the sun) and y is height above the
// asteroid's surface. The astronaut's hands are at ANCHOR. The kite flies in
// the "wind window": the upper half of an ellipse standing on the ground. Its
// middle, low and downwind, is the power zone, where the kite is fastest. At
// the edge the kite runs out of power and slides back in.
import { mulberry32 } from './rng.js';

export const SESSION = 150; // seconds until the sun sets behind the asteroid
export const ANCHOR = { x: 26, y: 7 };
export const WIN = { cx: 94, rx: 80, ry: 88 };
export const SKIM_Y = 7;
export const COMBO_TIME = 2.6;
export const TURN = 3.9; // rad/s at full stick
export const ORBIT_PAD = 16; // how far out from an object an orbit still counts
const CRASH_Y = 1;
const S_MIN = 13, S_MAX = 50;
const TAU = Math.PI * 2;

export const OBJECTS = {
  rock: { name: 'MOONLET', say: 'a moonlet', r: 3.5, pts: 250 },
  sat: { name: 'SATELLITE', say: 'a satellite', r: 4, pts: 350 },
  ice: { name: 'COMET CHUNK', say: 'a comet chunk', r: 3, pts: 450 },
};

// Radio requests from the kite club back at base. Each matches a trick tag.
export const CALLS = {
  loop: { text: 'LOOP', say: 'a loop' },
  double: { text: 'DOUBLE LOOP', say: 'a double loop' },
  fig8: { text: 'FIGURE 8', say: 'a figure 8' },
  tight: { text: 'TIGHT LOOP', say: 'a tight loop' },
  huge: { text: 'HUGE LOOP', say: 'a huge loop' },
  orbit: { text: 'ORBIT SOMETHING', say: 'an orbit around something' },
  ring: { text: 'THREAD A RING', say: 'a pass through a flux ring' },
  skim: { text: 'SKIM THE GROUND', say: 'a ground skim' },
};
export const CALL_BONUS = 500;

// Final ranks by score. Gentle mode asks for a little more.
const RANKS = [['S', 55000], ['A', 34000], ['B', 18000], ['C', 7000], ['D', 0]];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a) => {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
};

/** Where the kite sits in the wind window: q is 0 in the middle, 1 on the edge. */
export function powerAt(x, y) {
  const dx = (x - WIN.cx) / WIN.rx, dy = Math.max(0, y) / WIN.ry;
  const q = Math.sqrt(dx * dx + dy * dy);
  return { q, power: clamp(1 - q, 0, 1) };
}

export function createRun({ seed = 1, gentle = false, session = SESSION } = {}) {
  const rng = mulberry32(seed);
  const run = {
    seed, rng, gentle, session, t: 0, phase: 'fly',
    k: { x: ANCHOR.x + 38, y: 4, th: Math.PI / 2 + 0.25, s: 20, vx: 0, vy: 0, state: 'fly', stateT: 0, grace: 0.8, tug: 0, tugCool: 0, spinDir: 1 },
    wind: 1, windMul: 1, weather: null, nextWeather: 16 + rng() * 6, flareMul: 1,
    spin: 0, calm: 0, loopPath: 0, box: null, lastLoop: null, loopChain: 0, fig8Chain: 0,
    twist: 0, twistPeak: 0,
    objects: [], nextObj: 4, rings: [], nextRings: 9 + rng() * 4, ringSet: 0,
    skim: 0,
    combo: newCombo(), score: 0,
    call: null, nextCall: 7, lastCall: null,
    stats: { loops: 0, fig8: 0, orbits: 0, rings: 0, skims: 0, crashes: 0, bonks: 0, calls: 0, tricks: 0, bestCombo: 0, bestComboTricks: 0 },
    result: null,
    events: [],
  };
  resetSpin(run);
  // Two things to play around from the start.
  spawnObject(run, 'rock', 70 + rng() * 20, 40 + rng() * 14);
  spawnObject(run, 'sat', 118 + rng() * 14, 26 + rng() * 16);
  return run;
}

function newCombo() {
  return { pts: 0, count: 0, timer: 0, kinds: {}, names: [] };
}

function resetSpin(run) {
  run.spin = 0;
  run.loopPath = 0;
  run.box = { x0: run.k.x, x1: run.k.x, y0: run.k.y, y1: run.k.y };
}

/** Each different trick adds 1 to the multiplier; repeats add 1 per 4. Capped at x10. */
export function comboMult(combo) {
  const kinds = Object.keys(combo.kinds).length || Math.min(1, combo.count);
  return Math.min(10, kinds + Math.floor((combo.count - kinds) / 4));
}

export function spawnObject(run, kind, x, y) {
  const rng = run.rng;
  run.objects.push({
    kind, x, y, baseY: y, vx: kind === 'ice' ? 5 + rng() * 2 : 2 + rng() * 2.5, kx: 0, ky: 0,
    bob: 1 + rng() * 2, bobF: 0.4 + rng() * 0.5, ph: rng() * TAU, r: OBJECTS[kind].r,
    wa: null, wind: 0, orbits: 0, spin: rng() * TAU, hitT: 0,
  });
}

function spawnRings(run) {
  const rng = run.rng;
  for (let tries = 0; tries < 20; tries++) {
    const n = 4;
    let x = 50 + rng() * 80, y = 16 + rng() * 44;
    let a = rng() * TAU;
    const bend = (rng() - 0.5) * 0.9;
    const rings = [];
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (i) {
        a += bend;
        x += Math.cos(a) * 13;
        y += Math.sin(a) * 13;
      }
      if (y < 13 || powerAt(x, y).q > 0.82 || x < 40) {
        ok = false;
        break;
      }
      rings.push({ x, y, hit: false });
    }
    if (!ok) continue;
    run.rings.push({ id: ++run.ringSet, rings, ttl: 13, total: n, got: 0 });
    run.events.push({ type: 'rings', n });
    return;
  }
}

// ------------------------------------------------------------------ tricks & combos
function trick(run, kind, name, base, tags, x = run.k.x, y = run.k.y) {
  const c = run.combo;
  const repeat = c.kinds[kind] || 0;
  const pts = Math.max(10, Math.round((base * Math.pow(0.6, repeat) * run.flareMul) / 10) * 10);
  c.kinds[kind] = repeat + 1;
  c.pts += pts;
  c.count++;
  c.timer = COMBO_TIME;
  c.names.push(name);
  if (c.names.length > 4) c.names.shift();
  run.stats.tricks++;
  run.events.push({ type: 'trick', kind, name, pts, count: c.count, x, y, flare: run.flareMul > 1 });
  if (run.call && tags.includes(run.call.kind)) {
    const bonus = CALL_BONUS * run.flareMul;
    run.score += bonus;
    run.stats.calls++;
    run.events.push({ type: 'callDone', kind: run.call.kind, pts: bonus });
    run.lastCall = run.call.kind;
    run.call = null;
    run.nextCall = run.t + 6 + run.rng() * 4;
  }
}

function bankCombo(run) {
  const c = run.combo;
  if (!c.count) return;
  const mult = comboMult(c);
  const total = c.pts * mult;
  run.score += total;
  if (total > run.stats.bestCombo) {
    run.stats.bestCombo = total;
    run.stats.bestComboTricks = c.count;
  }
  run.events.push({ type: 'bank', pts: c.pts, mult, total, count: c.count });
  run.combo = newCombo();
}

function dropCombo(run, why) {
  const c = run.combo;
  if (c.count) run.events.push({ type: 'drop', pts: c.pts * comboMult(c), why });
  run.combo = newCombo();
  run.skim = 0;
  run.lastLoop = null;
  run.loopChain = 0;
  run.fig8Chain = 0;
}

function loopDone(run, dir) {
  const k = run.k, b = run.box, prev = run.lastLoop;
  run.spin -= dir * TAU;
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const path = run.loopPath;
  run.loopPath = 0;
  run.box = { x0: k.x, x1: k.x, y0: k.y, y1: k.y };
  const recent = prev && run.t - prev.t < 2.6;
  if (recent && prev.dir === dir) {
    run.loopChain++;
    run.fig8Chain = 0;
  } else if (recent) {
    run.fig8Chain++;
    run.loopChain = 1;
  } else {
    run.loopChain = 1;
    run.fig8Chain = 0;
  }
  run.lastLoop = { dir, t: run.t };
  let kind, name, base;
  const tags = ['loop'];
  if (run.fig8Chain > 0) {
    kind = 'fig8';
    name = run.fig8Chain > 1 ? `FIGURE 8 X${run.fig8Chain}` : 'FIGURE 8';
    base = Math.min(700, 300 + 100 * (run.fig8Chain - 1));
    tags.push('fig8');
    run.stats.fig8++;
  } else {
    const n = run.loopChain;
    kind = 'loop';
    name = ['LOOP', 'DOUBLE LOOP', 'TRIPLE LOOP'][n - 1] || `LOOP X${n}`;
    base = Math.min(600, 100 * n);
    if (n >= 2) tags.push('double');
  }
  if (path < 40) {
    name = `TIGHT ${name}`;
    base += 80;
    tags.push('tight');
  } else if (size > 46) {
    name = `HUGE ${name}`;
    base += 120;
    tags.push('huge');
  }
  run.stats.loops++;
  trick(run, kind, name, base, tags);
}

// ------------------------------------------------------------------ the kite
function crash(run) {
  const k = run.k;
  if (run.gentle) {
    // Gentle mode: the kite bounces off the dust. It still costs the combo.
    k.y = CRASH_Y + 0.5;
    k.th = Math.abs(wrapAngle(k.th));
    if (k.th < 0.5) k.th = 0.5;
    if (k.th > Math.PI - 0.5) k.th = Math.PI - 0.5;
    k.s = Math.max(k.s * 0.6, 14);
    k.grace = 0.5;
    dropCombo(run, 'scrape');
    run.events.push({ type: 'scrape', x: k.x, y: k.y });
    return;
  }
  k.state = 'crashed';
  k.stateT = 2;
  k.y = 0.5;
  k.s = 0;
  run.stats.crashes++;
  dropCombo(run, 'crash');
  const nearChair = Math.abs(k.x - ANCHOR.x) < 14;
  run.events.push({ type: 'crash', x: k.x, y: k.y, nearChair });
}

function bonk(run, o) {
  const k = run.k;
  k.state = 'tumble';
  k.stateT = 0.8;
  k.spinDir = run.rng() < 0.5 ? -1 : 1;
  o.kx += Math.cos(k.th) * 10;
  o.ky += Math.sin(k.th) * 6;
  o.hitT = 0.5;
  o.wa = null;
  o.wind = 0;
  run.stats.bonks++;
  dropCombo(run, 'bonk');
  run.events.push({ type: 'bonk', x: k.x, y: k.y, kind: o.kind });
}

function flyKite(run, dt, input) {
  const k = run.k;
  k.tugCool = Math.max(0, k.tugCool - dt);
  k.tug = Math.max(0, k.tug - dt);
  k.grace = Math.max(0, k.grace - dt);

  if (k.state === 'crashed') {
    k.stateT -= dt;
    if (k.stateT <= 0) {
      // The astronaut gives the lines a yank and the kite pops back up.
      k.state = 'fly';
      k.y = 3;
      k.th = Math.PI / 2 + (k.x > ANCHOR.x + 20 ? 0.15 : -0.3);
      k.s = 22;
      k.grace = 0.7;
      resetSpin(run);
      run.events.push({ type: 'relaunch', x: k.x, y: k.y });
    }
    return;
  }

  let dth = 0;
  if (k.state === 'tumble') {
    dth = k.spinDir * 11 * dt;
    k.stateT -= dt;
    if (k.stateT <= 0) {
      k.state = 'fly';
      resetSpin(run);
    }
  } else {
    const turn = clamp(input.turn || 0, -1, 1);
    const twistK = 1 - 0.05 * clamp(Math.abs(run.twist) - 2, 0, 6);
    dth = turn * TURN * twistK * dt;
    if (input.tug && k.tugCool <= 0) {
      k.tug = 0.45;
      k.tugCool = 1.1;
      run.events.push({ type: 'tug' });
    }
  }
  k.th = wrapAngle(k.th + dth);
  run.twist += dth / TAU;
  const at = Math.abs(run.twist);
  if (at > run.twistPeak) run.twistPeak = at;
  if (at < 0.35) {
    if (run.twistPeak >= 3 && k.state === 'fly') trick(run, 'untwist', 'UNTWIST', 250, ['untwist']);
    run.twistPeak = 0;
  }

  // Speed: the power zone drives the kite, climbing costs a little, diving gains.
  const { q, power } = powerAt(k.x, k.y);
  let target = run.wind * (S_MIN + (S_MAX - S_MIN) * Math.pow(power, 0.8)) - 7 * Math.sin(k.th);
  if (k.tug > 0) target += 22;
  if (k.state === 'tumble') target *= 0.4;
  k.s += (target - k.s) * (1 - Math.exp(-2.4 * dt));
  if (k.s < 3) k.s = 3;
  let vx = Math.cos(k.th) * k.s, vy = Math.sin(k.th) * k.s;
  vy -= Math.max(0, 12 - k.s) * 1.2; // not enough wind: it sags
  if (k.state === 'tumble') vy -= 8;
  if (q > 0.93) {
    // Out at the edge the lines pull the kite back towards the middle.
    const nx = WIN.cx - k.x, ny = 18 - k.y, nl = Math.hypot(nx, ny) || 1;
    const f = (q - 0.93) * 300;
    vx += (nx / nl) * f;
    vy += (ny / nl) * f;
  }
  k.vx = vx;
  k.vy = vy;
  k.x += vx * dt;
  k.y += vy * dt;
  const after = powerAt(k.x, k.y).q;
  if (after > 1.06) {
    const f = 1.06 / after;
    k.x = WIN.cx + (k.x - WIN.cx) * f;
    k.y *= f;
  }
  if (k.y < CRASH_Y && k.grace <= 0) {
    crash(run);
    return;
  }
  if (k.y < CRASH_Y) k.y = CRASH_Y;

  if (k.state !== 'fly') return;

  // Loops: count how far the nose has turned. Flying straight for a moment resets it.
  const rate = Math.abs(dth) / dt;
  if (rate < 1.1) {
    run.calm += dt;
    if (run.calm > 0.45) resetSpin(run);
  } else run.calm = 0;
  run.spin += dth;
  run.loopPath += k.s * dt;
  const b = run.box;
  if (k.x < b.x0) b.x0 = k.x;
  if (k.x > b.x1) b.x1 = k.x;
  if (k.y < b.y0) b.y0 = k.y;
  if (k.y > b.y1) b.y1 = k.y;
  if (Math.abs(run.spin) >= TAU) loopDone(run, Math.sign(run.spin));

  // Skimming low over the regolith.
  if (k.y < SKIM_Y) run.skim += dt;
  else {
    if (run.skim >= 0.5) {
      const pts = Math.round(run.skim * 180);
      run.stats.skims++;
      trick(run, 'skim', 'REGOLITH SKIM', pts, ['skim']);
    }
    run.skim = 0;
  }
}

function updateObjects(run, dt) {
  const k = run.k;
  for (const o of run.objects) {
    o.x += (o.vx + o.kx) * dt;
    o.baseY += o.ky * dt;
    o.kx *= Math.exp(-1.5 * dt);
    o.ky *= Math.exp(-1.5 * dt);
    o.baseY = clamp(o.baseY, 14, 78);
    o.y = o.baseY + Math.sin(run.t * o.bobF + o.ph) * o.bob;
    o.spin += dt * (o.kind === 'sat' ? 0.3 : 0.8);
    o.hitT = Math.max(0, o.hitT - dt);
    if (k.state !== 'fly') continue;
    const dx = k.x - o.x, dy = k.y - o.y, d = Math.hypot(dx, dy);
    if (d < o.r + 2 && o.hitT <= 0) {
      bonk(run, o);
      continue;
    }
    if (d < o.r + ORBIT_PAD) {
      const a = Math.atan2(dy, dx);
      if (o.wa !== null) o.wind += wrapAngle(a - o.wa);
      o.wa = a;
      if (Math.abs(o.wind) >= TAU) {
        o.wind -= Math.sign(o.wind) * TAU;
        o.orbits++;
        const def = OBJECTS[o.kind];
        const name = o.orbits > 1 ? `ORBIT ${def.name} X${o.orbits}` : `ORBIT ${def.name}`;
        run.stats.orbits++;
        trick(run, `orbit-${o.kind}`, name, def.pts * (o.orbits > 1 ? 1.5 : 1), ['orbit'], o.x, o.y + o.r + 4);
      }
    } else {
      o.wa = null;
      o.wind = 0;
      o.orbits = 0;
    }
  }
  run.objects = run.objects.filter((o) => o.x < 190);
  const want = run.t > 60 ? 3 : 2;
  if (run.t >= run.nextObj && run.objects.length < want) {
    const r = run.rng();
    const kind = r < 0.45 ? 'rock' : r < 0.8 ? 'sat' : 'ice';
    spawnObject(run, kind, -10, 22 + run.rng() * 50);
    run.nextObj = run.t + 4 + run.rng() * 5;
  }
}

function updateRings(run, dt) {
  const k = run.k;
  for (const set of run.rings) {
    set.ttl -= dt;
    for (const r of set.rings) {
      r.x += 2 * dt;
      if (r.hit || k.state !== 'fly') continue;
      if (Math.hypot(k.x - r.x, k.y - r.y) < 4.6) {
        r.hit = true;
        set.got++;
        run.stats.rings++;
        trick(run, 'ring', `RING ${set.got}/${set.total}`, 120, ['ring'], r.x, r.y);
        if (set.got === set.total) {
          trick(run, 'chain', 'RING CHAIN', 400, ['ring'], r.x, r.y);
          set.ttl = Math.min(set.ttl, 0.4);
        }
      }
    }
  }
  run.rings = run.rings.filter((s) => s.ttl > 0);
  if (run.t >= run.nextRings && run.t < run.session - 8) {
    if (!run.rings.length) spawnRings(run);
    run.nextRings = run.t + 15 + run.rng() * 6;
  }
}

function updateWeather(run, dt) {
  const w = run.weather;
  if (!w && run.t >= run.nextWeather && run.t < run.session - 14) {
    const kind = run.rng() < 0.6 ? 'flare' : 'lull';
    run.weather = { kind, phase: 'warn', t: 3 };
    run.events.push({ type: 'incoming', kind });
  } else if (w) {
    w.t -= dt;
    if (w.t <= 0 && w.phase === 'warn') {
      w.phase = 'on';
      w.t = w.kind === 'flare' ? 7 : 6;
      run.events.push({ type: 'weather', kind: w.kind });
    } else if (w.t <= 0) {
      run.weather = null;
      run.nextWeather = run.t + 16 + run.rng() * 10;
      run.events.push({ type: 'weatherEnd', kind: w.kind });
    }
  }
  const on = run.weather && run.weather.phase === 'on' ? run.weather.kind : null;
  const target = on === 'flare' ? 1.4 : on === 'lull' ? (run.gentle ? 0.75 : 0.55) : 1;
  run.windMul += (target - run.windMul) * (1 - Math.exp(-1.8 * dt));
  run.wind = (1 + 0.08 * Math.sin(run.t * 0.37) + 0.05 * Math.sin(run.t * 1.3 + 1)) * run.windMul;
  run.flareMul = on === 'flare' ? 2 : 1;
}

function updateCalls(run, dt) {
  if (run.call) {
    run.call.t -= dt;
    if (run.call.t <= 0) {
      run.events.push({ type: 'callMiss', kind: run.call.kind });
      run.lastCall = run.call.kind;
      run.call = null;
      run.nextCall = run.t + 4 + run.rng() * 3;
    }
    return;
  }
  if (run.t < run.nextCall || run.t > run.session - 10) return;
  const pool = Object.keys(CALLS).filter((c) => c !== run.lastCall
    && (c !== 'ring' || run.rings.some((s) => s.ttl > 8))
    && (c !== 'orbit' || run.objects.some((o) => o.x > 30 && o.x < 150)));
  const kind = pool[Math.floor(run.rng() * pool.length)];
  run.call = { kind, t: 12, max: 12 };
  run.events.push({ type: 'call', kind });
}

/** Advances the run by dt seconds. input: { turn: -1..1 (+ is anticlockwise), tug: bool }. */
export function step(run, dt, input = {}) {
  run.t += dt;
  if (run.phase !== 'fly') {
    // After sunset the kite drifts down to the dust.
    const k = run.k;
    if (k.state !== 'crashed') {
      k.y = Math.max(0.5, k.y - 9 * dt);
      k.x += 3 * dt;
      k.th = wrapAngle(k.th + wrapAngle(Math.PI / 2 - k.th) * (1 - Math.exp(-3 * dt)));
      k.s = Math.max(0, k.s - 20 * dt);
    }
    return;
  }
  updateWeather(run, dt);
  flyKite(run, dt, input);
  updateObjects(run, dt);
  updateRings(run, dt);
  updateCalls(run, dt);
  const c = run.combo;
  if (c.count) {
    c.timer -= dt;
    if (c.timer <= 0) bankCombo(run);
  }
  if (run.t >= run.session) finish(run);
}

function finish(run) {
  bankCombo(run);
  run.call = null;
  run.phase = 'done';
  const bar = run.gentle ? 1.2 : 1;
  const rating = RANKS.find(([, min]) => run.score >= min * bar)[0];
  run.result = { score: run.score, rating, time: run.t, stats: { ...run.stats } };
  run.events.push({ type: 'end', rating });
}

/** Turn input that steers the kite's nose towards a point (pointer and stick aiming). */
export function steerToward(run, tx, ty) {
  const k = run.k;
  if (Math.hypot(tx - k.x, ty - k.y) < 2) return 0;
  const want = Math.atan2(ty - k.y, tx - k.x);
  return clamp(wrapAngle(want - k.th) * 2.2, -1, 1);
}

/**
 * The title-screen pilot: chases a point running round a figure 8 in the power
 * zone, and pulls up if the ground gets close.
 */
export function demoPilot(run, mem) {
  const k = run.k;
  // Look ahead: pull up if the current heading would reach the dust soon.
  if (k.y + Math.sin(k.th) * k.s * 0.45 < 10 && Math.sin(k.th) < 0.5) {
    const up = wrapAngle(Math.PI / 2 - k.th);
    return clamp(up * 3, -1, 1);
  }
  const t = run.t * (mem.speed || 0.55);
  const tx = 96 + Math.sin(t) * 34, ty = 40 + Math.sin(2 * t) * 16;
  return steerToward(run, tx, ty);
}

export function snapshot(run) {
  const k = run.k;
  return {
    t: +run.t.toFixed(2), phase: run.phase, x: +k.x.toFixed(2), y: +k.y.toFixed(2), th: +k.th.toFixed(3),
    s: +k.s.toFixed(2), kite: k.state, score: run.score, combo: { ...run.combo, kinds: undefined },
    twist: +run.twist.toFixed(2), wind: +run.wind.toFixed(2), weather: run.weather && { ...run.weather },
    call: run.call && { ...run.call },
    objects: run.objects.map((o) => ({ kind: o.kind, x: +o.x.toFixed(1), y: +o.y.toFixed(1), r: o.r, wind: +o.wind.toFixed(2) })),
    rings: run.rings.map((s) => s.rings.filter((r) => !r.hit).map((r) => ({ x: +r.x.toFixed(1), y: +r.y.toFixed(1) }))).flat(),
    stats: { ...run.stats },
  };
}
