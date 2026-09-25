// The rules of the ride. Pure logic: no DOM, no canvas, so it runs (and is
// tested) in Node too. Units are made up: altitude and downrange distance are
// "units" (3 screen pixels each), speed v is km/s-ish, time is seconds.
//
// The corridor is a band of air that sits on top of the "hot line". Below the
// hot line you heat up; above the band's top (the "thin line") you start to
// skip off. Both lines ripple with the layers of air (the wave you ride) and
// sink as you slow down, until you're slow enough to pop the chute.

import { mulberry32 } from './rng.js';

export const V0 = 7.8;       // entry speed
export const V_END = 1.0;    // chute speed: the run is won here
export const WIDTH = 16;     // corridor thickness (units)
export const SPAWN_AHEAD = 230;

const G_MIN = 0.55, G_MAX = 3.4;  // effective gravity: tiny near orbital speed, stronger as you slow
const LIFT = 9;
const DIVE_ANGLE = -0.55, RIDE_ANGLE = 0.7, PULL_ANGLE = 1;
const DRAG0 = 0.028, DRAG1 = 0.085;
const HEAT_K = 0.085, COOL = 0.1;
const SKIP_K = 0.14, SKIP_DRAIN = 0.3;
const FLOW_EVERY = 5, FLOW_MAX = 5;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);

/** 0 at chute speed, 1 at entry speed. */
export const speedN = (v) => clamp01((v - V_END) / (V0 - V_END));
/** Hot-line altitude for a given speed, before the air's ripples. */
export const hotBase = (v) => 18 + 44 * Math.pow(speedN(v), 1.15);
/** Downrange speed in units per second. */
export const groundSpeed = (v) => 16 + 5 * v;

export function createRun({ seed = 1, gentle = false } = {}) {
  const rng = mulberry32(seed);
  const run = {
    seed, gentle, rng,
    t: 0, x: 0, v: V0, vy: -1.2, a: 0, input: 0,
    phase: 'ride', endT: 0,
    heat: 0, skip: 0, plasma: 0, depth: 8,
    score: 0, flow: 1, flowT: 0, edge: '', edgeT: 0,
    // Gentle mode widens the corridor downwards: the heat starts deeper, but
    // the air (and so the skip-off line) is where it always is.
    shift: gentle ? 4 : 0,
    width: WIDTH + (gentle ? 4 : 0),
    wave: [0, 1, 2].map(() => rng() * Math.PI * 2),
    storms: [], objects: [], events: [],
    nextEvent: 4.5, eventCount: 0, lastKind: '',
    warnHeat: false, warnSkip: false,
    stats: { hits: 0, nearMiss: 0, pickups: 0, edgeTime: 0, jetTime: 0, storms: 0, maxFlow: 1 },
    result: null,
  };
  run.alt = hotAt(run, 0) + run.width * 0.6;
  return run;
}

/** Ripple of the air layers at downrange x (units), including storm bumps. */
export function waveAt(run, x) {
  const [p0, p1, p2] = run.wave;
  let w = 3.4 * Math.sin(x * 0.0105 + p0) + 2.1 * Math.sin(x * 0.0253 + p1) + 0.9 * Math.sin(x * 0.061 + p2);
  for (const s of run.storms) {
    const u = (x - s.x) / s.half;
    if (u > -1 && u < 1) w += s.amp * 0.5 * (1 + Math.cos(u * Math.PI));
  }
  return w;
}
export const hotAt = (run, x) => hotBase(run.v) + waveAt(run, x) - run.shift;
export const thinAt = (run, x) => hotAt(run, x) + run.width;

function emit(run, type, extra) {
  run.events.push({ type, ...extra });
}

function addScore(run, pts) {
  run.score += pts;
}

// ------------------------------------------------------------------ director
const KINDS = {
  debris: { from: 0.42, to: 1.01, weight: 3 },
  updraft: { from: 0.3, to: 0.97, weight: 2 },
  storm: { from: 0, to: 0.72, weight: 2.5 },
  jet: { from: 0, to: 0.85, weight: 2.5 },
  coolant: { from: 0.05, to: 1.01, weight: 1.4 },
};

function pickKind(run) {
  const n = speedN(run.v);
  const options = Object.entries(KINDS).filter(([k, d]) => n >= d.from && n < d.to && k !== run.lastKind);
  let total = 0;
  for (const [, d] of options) total += d.weight;
  let r = run.rng() * total;
  for (const [k, d] of options) {
    r -= d.weight;
    if (r <= 0) return k;
  }
  return options[0][0];
}

export function spawn(run, kind, ahead = SPAWN_AHEAD) {
  const rng = run.rng;
  const cx = run.x + ahead;
  const hot = hotAt(run, cx);
  const W = run.width;
  const obj = { kind, x: cx, announced: false };
  if (kind === 'debris') {
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      run.objects.push({
        kind: 'debris', x: cx + i * (26 + rng() * 22), alt: hot + 2 + rng() * (W - 4),
        vy: (rng() - 0.5) * 2.4, r: 1.6, sprite: Math.floor(rng() * 3), spin: rng() * 6,
        announced: i > 0, quiet: i > 0, hit: false, passed: false,
      });
    }
    return;
  }
  if (kind === 'updraft') Object.assign(obj, { half: 15, power: 9.5, top: hot + W + 26 });
  else if (kind === 'storm') {
    const storm = { x: cx + 75, half: 70 + rng() * 25, amp: 7 + rng() * 3 };
    run.storms.push(storm);
    Object.assign(obj, { x: storm.x, half: storm.half, amp: storm.amp, rode: false, bolt: 0 });
  } else if (kind === 'jet') Object.assign(obj, { len: 240 + rng() * 80, off: 0.35 + rng() * 0.3, ph: rng() * 6, riding: false, bonusT: 0 });
  else if (kind === 'coolant') Object.assign(obj, { alt: hot + 3 + rng() * (W - 6), r: 3.2, taken: false });
  run.objects.push(obj);
}

/** Altitude of a jet-stream ribbon at downrange x. */
export function jetAlt(run, o, x) {
  return hotAt(run, x) + run.width * o.off + 2.2 * Math.sin((x - o.x) * 0.03 + o.ph);
}

function objectFront(o) {
  return o.kind === 'storm' || o.kind === 'updraft' ? o.x - o.half : o.x;
}
function objectEnd(o) {
  if (o.kind === 'storm' || o.kind === 'updraft') return o.x + o.half;
  if (o.kind === 'jet') return o.x + o.len;
  return o.x + 4;
}

// ------------------------------------------------------------------ step
/**
 * Advance the run. `input` is -1 (dive), 0 (ride / let go) or 1 (pull up);
 * an analogue value in between also works (gamepad stick).
 */
export function step(run, dt, input = 0) {
  run.t += dt;
  if (run.phase === 'ride') ride(run, dt, input);
  else afterglow(run, dt);
}

function ride(run, dt, input) {
  const rng = run.rng;
  run.input = input;
  const target = input < 0 ? RIDE_ANGLE + (DIVE_ANGLE - RIDE_ANGLE) * -input : RIDE_ANGLE + (PULL_ANGLE - RIDE_ANGLE) * input;
  const da = target - run.a;
  run.a += clamp(da, -4 * dt, 4 * dt);

  const n = speedN(run.v);
  const hot = hotAt(run, run.x);
  const d = run.alt - hot;
  run.depth = d;
  const rhoF = clamp(Math.exp(-(d - run.shift) / 8), 0.04, 3);

  // ---- forces
  const g = G_MIN + (G_MAX - G_MIN) * (1 - n * n);
  let ay = -g + LIFT * run.a * rhoF * (run.a < 0 ? 0.8 : 1);
  ay -= run.vy * (0.45 + 1.1 * Math.min(rhoF, 1.5));

  // ---- hazards & helpers acting this frame
  for (const o of run.objects) {
    if (o.kind === 'updraft' && Math.abs(run.x - o.x) < o.half && run.alt < o.top) {
      ay += o.power * (1 - Math.abs(run.x - o.x) / o.half * 0.5);
      if (!o.felt) {
        o.felt = true;
        emit(run, 'updraft');
      }
    }
  }
  run.vy += ay * dt;
  run.alt += run.vy * dt;

  let drag = DRAG0 + DRAG1 * rhoF;
  let jetting = false;
  for (const o of run.objects) {
    if (o.kind !== 'jet' || run.x < o.x || run.x > o.x + o.len) continue;
    const ja = jetAlt(run, o, run.x);
    if (Math.abs(run.alt - ja) < 2.6) {
      jetting = true;
      if (!o.riding) emit(run, 'boost');
      o.riding = true;
      o.bonusT += dt;
      run.stats.jetTime += dt;
      // Ride the ribbon: it pulls you gently onto its line and gives speed back.
      run.vy += (ja - run.alt) * 3 * dt - run.vy * 1.5 * dt;
      drag = 0.004;
      run.heat = Math.max(0, run.heat - 0.12 * dt);
      addScore(run, 60 * run.flow * dt);
    } else o.riding = false;
  }
  run.jetting = jetting;
  run.v = clamp(run.v - drag * dt, 0, V0);
  run.x += groundSpeed(run.v) * dt;

  // ---- heat and skip
  const gentleK = run.gentle ? 0.55 : 1;
  const heatPower = 0.35 + 0.65 * n;
  if (d < 0) run.heat += dt * HEAT_K * Math.pow(-d, 1.15) * heatPower * gentleK;
  else run.heat -= dt * COOL * (1 + Math.min(d, 20) / 12);
  run.plasma = clamp01(Math.exp(-(d - run.shift) / 9) * (0.35 + 0.65 * n) * 0.8 + (d < 0 ? Math.min(0.3, -d * 0.06) : 0));
  const over = run.alt - (hot + run.width);
  if (over > 0) run.skip += dt * SKIP_K * (over * 0.14 + Math.max(run.vy, 0) * 0.22 + 0.2) * (0.25 + 0.75 * n) * (run.gentle ? 0.8 : 1);
  else run.skip -= dt * SKIP_DRAIN;
  run.heat = Math.max(0, run.heat);
  run.skip = Math.max(0, run.skip);

  // ---- objects: collisions, pickups, passing
  for (const o of run.objects) {
    const ahead = objectFront(o) - run.x;
    if (!o.announced && ahead < groundSpeed(run.v) * 2.4) {
      o.announced = true;
      emit(run, 'incoming', { kind: o.kind });
    }
    if (o.kind === 'debris') {
      o.alt += o.vy * dt;
      o.spin += dt * 3;
      const dist = Math.hypot(o.x - run.x, o.alt - run.alt);
      if (!o.hit && dist < o.r + 2) {
        o.hit = true;
        run.heat += run.gentle ? 0.14 : 0.24;
        run.vy -= 3.5;
        run.stats.hits++;
        loseFlow(run, true);
        emit(run, 'hit', { x: o.x, alt: o.alt });
      } else if (!o.hit && !o.passed && o.x < run.x - 2) {
        o.passed = true;
        if (dist < 8) {
          run.stats.nearMiss++;
          addScore(run, 50 * run.flow);
          emit(run, 'popup', { text: 'CLOSE CALL', pts: 50 * run.flow });
        }
      }
    } else if (o.kind === 'coolant' && !o.taken) {
      if (Math.hypot(o.x - run.x, o.alt - run.alt) < o.r + 2) {
        o.taken = true;
        run.heat = Math.max(0, run.heat - 0.4);
        run.skip = Math.max(0, run.skip - 0.3);
        run.stats.pickups++;
        addScore(run, 100 * run.flow);
        emit(run, 'coolant', { pts: 100 * run.flow });
      }
    } else if (o.kind === 'storm') {
      if (Math.abs(run.x - o.x) < 6 && !o.rode) {
        o.rode = true;
        if (d >= -1.5 && d <= run.width) {
          run.stats.storms++;
          addScore(run, 150 * run.flow);
          emit(run, 'popup', { text: 'CREST RIDER', pts: 150 * run.flow });
        }
      }
      o.bolt -= dt;
      if (o.bolt <= 0) {
        o.bolt = 0.6 + rng() * 1.6;
        o.boltX = o.x + (rng() - 0.5) * o.half * 1.4;
        o.boltT = 0.25;
      }
      o.boltT = Math.max(0, (o.boltT || 0) - dt);
    } else if (o.kind === 'jet' && run.x > o.x + o.len && !o.done) {
      o.done = true;
      if (o.bonusT > 1.2) {
        const pts = Math.round(o.bonusT * 40) * run.flow;
        addScore(run, pts);
        emit(run, 'popup', { text: 'JET RIDE', pts });
      }
    }
  }
  run.objects = run.objects.filter((o) => objectEnd(o) > run.x - 160);
  run.storms = run.storms.filter((s) => s.x + s.half > run.x - 400);

  // ---- style
  const inBand = d >= 0 && d <= run.width;
  run.edge = '';
  if (d >= 0 && d < 2.5) run.edge = 'hot';
  else if (d > run.width - 2.5 && d <= run.width) run.edge = 'skim';
  if (run.edge) {
    run.stats.edgeTime += dt;
    addScore(run, 30 * run.flow * dt);
  }
  run.edgeT = run.edge ? run.edgeT + dt : 0;
  if (inBand && run.heat < 0.9 && run.skip < 0.9) {
    run.flowT += dt;
    if (run.flowT >= FLOW_EVERY && run.flow < FLOW_MAX) {
      run.flow++;
      run.flowT = 0;
      run.stats.maxFlow = Math.max(run.stats.maxFlow, run.flow);
      emit(run, 'flow', { flow: run.flow });
    }
  }
  if ((run.heat > 0.92 || run.skip > 0.92) && !run.redline) {
    run.redline = true;
    loseFlow(run, false);
  } else if (run.heat < 0.6 && run.skip < 0.6) run.redline = false;
  addScore(run, 10 * run.flow * dt);

  // ---- warnings (with hysteresis so they don't chatter)
  const wh = run.heat > 0.62 || (run.warnHeat && run.heat > 0.5);
  const ws = run.skip > 0.5 || (run.warnSkip && run.skip > 0.38);
  if (wh && !run.warnHeat) emit(run, 'warn', { kind: 'heat' });
  if (ws && !run.warnSkip) emit(run, 'warn', { kind: 'skip' });
  run.warnHeat = wh;
  run.warnSkip = ws;

  // ---- director
  if (run.t >= run.nextEvent && speedN(run.v) > 0.03) {
    const kind = pickKind(run);
    spawn(run, kind);
    run.lastKind = kind;
    run.eventCount++;
    const extra = kind === 'coolant' ? 0.5 : 0;
    run.nextEvent = run.t + (3.8 + rng() * 2.2 + extra) * (run.gentle ? 1.2 : 1);
  }

  // ---- outcomes
  if (run.heat >= 1) end(run, 'burned');
  else if (run.skip >= 1) {
    run.vy = Math.max(run.vy, 6) + 8;
    end(run, 'skipped');
  } else if (run.v <= V_END) {
    run.chuteAlt = run.alt;
    run.objects = [];
    run.storms = [];
    end(run, 'landed');
  }
}

function loseFlow(run, all) {
  const before = run.flow;
  run.flow = all ? 1 : Math.max(1, run.flow - 1);
  run.flowT = 0;
  if (run.flow < before) emit(run, 'flowlost', { flow: run.flow });
}

function end(run, outcome) {
  run.phase = outcome;
  run.endT = run.t;
  run.warnHeat = run.warnSkip = false;
  const stats = run.stats;
  let bonus = 0;
  if (outcome === 'landed') {
    bonus = 500 + Math.round((1 - clamp01(run.heat)) * 400) + stats.maxFlow * 60;
    addScore(run, bonus);
  }
  const score = Math.round(run.score);
  run.result = {
    outcome, score, bonus, time: run.t,
    rating: outcome === 'landed' ? rate(score, run.gentle) : null,
    stats: { ...stats, edgeTime: Math.round(stats.edgeTime), jetTime: Math.round(stats.jetTime) },
  };
  emit(run, 'end', { outcome });
}

export const RATINGS = [['S', 26000], ['A', 19000], ['B', 13000], ['C', 8000], ['D', 0]];
export function rate(score, gentle = false) {
  const s = gentle ? score * 0.85 : score;
  return RATINGS.find(([, min]) => s >= min)[0];
}

/** After the ride: the chute and splashdown, the burn-up, or the skip-off. */
function afterglow(run, dt) {
  const t = run.t - run.endT;
  if (run.phase === 'landed') {
    // Chute: bleed the last of the speed and sink to the sea.
    run.v = Math.max(0.15, run.v - dt * 0.6);
    run.x += groundSpeed(run.v) * 0.4 * dt;
    const k = clamp01(t / 5);
    run.alt = run.chuteAlt * (1 - k * k * (3 - 2 * k));
    run.vy = 0;
    run.heat = Math.max(0, run.heat - dt * 0.3);
    run.plasma = Math.max(0, run.plasma - dt);
    if (t >= 5 && !run.splashed) {
      run.splashed = true;
      emit(run, 'splash');
    }
  } else if (run.phase === 'skipped') {
    run.vy -= 0.4 * dt;
    run.alt += run.vy * dt;
    run.x += groundSpeed(run.v) * dt;
    run.plasma = Math.max(0, run.plasma - dt * 1.5);
    run.skip = 1;
  } else if (run.phase === 'burned') {
    run.x += groundSpeed(run.v) * dt * Math.max(0, 1 - t);
    run.alt += run.vy * dt;
    run.vy *= 1 - dt;
    run.plasma = Math.min(1, run.plasma + dt);
    run.heat = 1;
  }
}

/** A copy of the fields tests and the page care about. */
export function snapshot(run) {
  return {
    phase: run.phase, t: run.t, x: run.x, alt: run.alt, vy: run.vy, v: run.v, a: run.a,
    heat: run.heat, skip: run.skip, depth: run.depth, score: Math.round(run.score), flow: run.flow,
    hot: hotAt(run, run.x), thin: thinAt(run, run.x), width: run.width, plasma: run.plasma,
    objects: run.objects.map((o) => ({ kind: o.kind, dx: o.x - run.x })),
    warnHeat: run.warnHeat, warnSkip: run.warnSkip,
    result: run.result, stats: { ...run.stats },
  };
}
