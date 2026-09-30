// The table's layout, in playfield units (0..TW across, 0..TH down). The
// lower half is a classic symmetric pair of flippers, slingshots and lanes;
// the upper half is deliberately lopsided and packed: a spiral warp ramp round
// the wormhole vortex, a loop-the-loop ramp that loads a plasma cannon, a
// hairpin comet ramp, a rail from the mystery saucer to the top lanes, a
// spinning pulsar, four pop bumpers, two mini flippers, a five-bank of drop
// targets, I O N standups, a captive ball and an asteroid belt round the star.
// Everything the ball can touch is a segment, a circle or a capsule.

export const TW = 240;
export const TH = 480;
export const CX = 120; // centre line
export const BALL_R = 3.5;
export const DRAIN_Y = TH + 6;

export const LANE_X = 223; // inner wall of the (right) shooter lane
export const PLUNGER = { x: 229.5, y: 468 };
export const LEFT_PLUNGER = { x: 10.5, y: 468 };
export const STAR = { x: CX, y: 282 };
export const VORTEX = { x: 64, y: 106, r: 18 };
export const WHITE_HOLE = { x: 156, y: 214 };
export const CAPTIVE = { x: 184, top: 247, rest: 292 };
export const CANNON = { x: 70, y: 338, r: 6 };
export const SAUCER = { x: 166, y: 334 };
export const PULSAR = { x: CX, y: 216, len: 13 };
export const LOOP = { x: 96, y: 56, r: 13 };

export const m = (x) => 2 * CX - x;

function seg(ax, ay, bx, by, extra = {}) {
  return { ax, ay, bx, by, e: 0.45, kind: 'wall', ...extra };
}
function chain(points, extra = {}) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) out.push(seg(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], extra));
  return out;
}

export const ARC = { x: CX, y: 120, r: 116 };

/** A smooth Catmull-Rom curve through the points, sampled every ~2 units. */
export function smooth(points, step = 2) {
  const out = [points[0]];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

// The loop-the-loop: up from its mouth, one and a half turns round, and down
// the other side into the plasma cannon.
function loopPath() {
  const pts = [[84, 188], [90, 160], [104, 124], [109, 90], [LOOP.x + LOOP.r, LOOP.y + 8]];
  for (let i = 0; i <= 30; i++) {
    const a = -(i / 30) * Math.PI * 3;
    pts.push([LOOP.x + Math.cos(a) * LOOP.r, LOOP.y + Math.sin(a) * LOOP.r]);
  }
  pts.push([LOOP.x - LOOP.r + 3, LOOP.y + 16], [96, 98], [98, 126], [82, 154], [66, 184], [61, 230], [62, 290], [CANNON.x - 2, CANNON.y - 9]);
  return pts;
}

// Ramps: the ball is carried along a path over the playfield.
export const RAMPS = [
  {
    id: 0, name: 'WARP', kind: 'ramp', mouth: { x0: 42, x1: 58, y: 188 }, speed: 430,
    control: [[50, 188], [47, 150], [42, 120], [40, 100], [50, 86], [66, 82], [82, 90], [88, 108], [82, 124], [66, 132], [48, 132], [34, 140], [27, 152], [26.5, 166]],
  },
  {
    id: 1, name: 'COMET', kind: 'ramp', mouth: { x0: 150, x1: 166, y: 188 }, speed: 430,
    control: [[158, 188], [160, 160], [168, 140], [184, 124], [202, 118], [213, 130], [214, 150], [213.5, 172]],
  },
  { id: 2, name: 'LOOP', kind: 'loop', mouth: { x0: 76, x1: 92, y: 188 }, speed: 470, control: loopPath() },
  {
    id: 3, name: 'RAIL', kind: 'rail', mouth: null, speed: 620,
    control: [[SAUCER.x, SAUCER.y], [178, 322], [196, 300], [197, 250], [196, 180], [197, 120], [192, 70], [178, 40], [160, 28], [150, 30]],
  },
];
for (const r of RAMPS) {
  r.path = smooth(r.control);
  let len = 0;
  r.lens = [0];
  for (let i = 1; i < r.path.length; i++) {
    len += Math.hypot(r.path[i][0] - r.path[i - 1][0], r.path[i][1] - r.path[i - 1][1]);
    r.lens.push(len);
  }
  r.len = len;
}
/** A point along a ramp, 0..1. */
export function rampPoint(r, k) {
  const d = Math.max(0, Math.min(1, k)) * r.len;
  let lo = 1, hi = r.lens.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r.lens[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const a = r.path[lo - 1], b = r.path[lo];
  const u = (d - r.lens[lo - 1]) / (r.lens[lo] - r.lens[lo - 1] || 1);
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u };
}

export const LETTERS = 'SUPERNOVA';
export const LANE_XS = [110, 126, 142, 158, 174];

// The shots missions light up, with the spot their arrow lamp sits.
export const SHOTS = [
  { id: 'lorbit', name: 'LEFT ORBIT', x: 48, y: 346 },
  { id: 'lramp', name: 'WARP RAMP', x: 50, y: 200 },
  { id: 'loop', name: 'HYPERLOOP', x: 84, y: 200 },
  { id: 'worm', name: 'WORMHOLE', x: 64, y: 146 },
  { id: 'ion', name: 'ION TARGETS', x: 118, y: 170 },
  { id: 'rramp', name: 'COMET RAMP', x: 158, y: 200 },
  { id: 'captive', name: 'PLANET', x: 184, y: 312 },
  { id: 'saucer', name: 'MYSTERY', x: 166, y: 348 },
  { id: 'rorbit', name: 'RIGHT ORBIT', x: 196, y: 346 },
];

/** Builds a fresh table. Things that change during play live on it. */
export function buildTable() {
  const segments = [];
  const circles = [];

  // Outer walls and the domed top.
  segments.push(seg(4, TH + 20, 4, ARC.y));
  const arcPts = [];
  for (let i = 0; i <= 48; i++) {
    const t = Math.PI + (i / 48) * Math.PI;
    arcPts.push([ARC.x + Math.cos(t) * ARC.r, ARC.y + Math.sin(t) * ARC.r]);
  }
  segments.push(...chain(arcPts, { kind: 'dome' }));
  segments.push(seg(236, ARC.y, 236, TH + 20));

  for (const side of [1, -1]) {
    const X = (x) => (side === 1 ? x : m(x));
    // The side lane: inner wall, stopper, one-way gate out to the orbit.
    segments.push(seg(X(17), TH + 20, X(17), 164));
    segments.push(seg(X(4), 472, X(17), 472, { kind: 'stopper', e: 0.1 }));
    segments.push(seg(X(17), 164, X(4), 146, { kind: 'gate', oneway: true, side }));
    // Orbit guide, with a steer at its foot into the inlane.
    segments.push(seg(X(36), 140, X(36), 328, { kind: 'guide' }));
    circles.push({ x: X(36), y: 140, r: 2, kind: 'post', e: 0.4 });
    segments.push(seg(X(17), 324, X(27), 338, { kind: 'guide' }));
    // Inlane guide and outlane post.
    segments.push(...chain([[X(30.5), 348], [X(30.5), 410], [X(83), 445]], { kind: 'guide' }));
    circles.push({ x: X(30.5), y: 348, r: 2.4, kind: 'post', e: 0.5 });
    // Slingshot.
    const A = [X(46), 368], B = [X(46), 402], C = [X(72), 422];
    segments.push(seg(A[0], A[1], C[0], C[1], { kind: 'sling', side, e: 0.6 }));
    segments.push(seg(A[0], A[1], B[0], B[1], { kind: 'rubber', e: 0.5 }));
    segments.push(seg(B[0], B[1], C[0], C[1], { kind: 'rubber', e: 0.5 }));
    // Apron.
    segments.push(seg(X(17), 420, X(66), 476, { kind: 'apron' }));
  }

  // Top lanes (S T A R), off to the right over the bumper nest.
  for (const x of LANE_XS) {
    segments.push(seg(x, 40, x, 60, { kind: 'laneguide', e: 0.3 }));
    circles.push({ x, y: 40, r: 1.8, kind: 'post', e: 0.3 });
  }

  // Four pop bumpers.
  const bumpers = [[128, 98], [162, 94], [145, 124], [180, 126]].map(([x, y], id) => ({ x, y, r: 9, kind: 'bumper', id, e: 0.6, kick: 360 }));
  circles.push(...bumpers);

  // A five-bank of drop targets on the left, facing the middle.
  const drops = [206, 218, 230, 242, 254].map((y, i) => ({ ...seg(42, y - 5, 42, y + 5, { kind: 'drop', id: i, bank: 0, e: 0.35 }), up: true, row: i }));
  segments.push(...drops);

  // I O N standups under the bumpers, tilted so nothing rests on them.
  const standups = [[96, 160, 104, 155], [114, 157, 122, 154], [132, 155, 140, 160]].map(([ax, ay, bx, by], i) => seg(ax, ay, bx, by, { kind: 'standup', id: i, e: 0.5, lit: false }));
  segments.push(...standups);

  // The captive ball chamber: open at the bottom, a target at the top.
  segments.push(seg(CAPTIVE.x - 6, 240, CAPTIVE.x - 6, 300, { kind: 'guide' }));
  segments.push(seg(CAPTIVE.x + 6, 240, CAPTIVE.x + 6, 300, { kind: 'guide' }));
  segments.push(...chain([[CAPTIVE.x - 6, 240], [CAPTIVE.x, 234], [CAPTIVE.x + 6, 240]], { kind: 'guide' }));
  circles.push({ x: CAPTIVE.x - 6, y: 300, r: 1.8, kind: 'post', e: 0.4 }, { x: CAPTIVE.x + 6, y: 300, r: 1.8, kind: 'post', e: 0.4 });
  const captive = { x: CAPTIVE.x, y: CAPTIVE.rest, vy: 0, r: BALL_R, hits: 0, flash: 0 };

  // The plasma cannon's turret base.
  circles.push({ x: CANNON.x, y: CANNON.y, r: CANNON.r, kind: 'cannon', e: 0.5 });

  // SUPERNOVA: nine rollover inserts arching over the star.
  const letters = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + 0.35 + (i / 8) * (Math.PI - 0.7);
    letters.push({ x: STAR.x + Math.cos(a) * 44, y: STAR.y + Math.sin(a) * 34, id: i, lit: false });
  }

  // The dying star, and two moons orbiting it.
  const star = { x: STAR.x, y: STAR.y, r: 6, kind: 'star', e: 0.55, kick: 160 };
  circles.push(star);
  const moons = [0, Math.PI].map((a, i) => ({ x: STAR.x, y: STAR.y, r: 3.6, kind: 'moon', id: i, e: 0.6, a }));
  circles.push(...moons);

  // An asteroid belt drifting across below the star.
  const asteroids = [0, 1, 2].map((i) => ({ x: CX, y: 334, r: 3.4, kind: 'asteroid', id: i, e: 0.7, off: false }));
  circles.push(...asteroids);

  // The main flippers and two mini flippers on the orbit guides.
  const flippers = [
    makeFlipper(83.5, 450, 1), makeFlipper(m(83.5), 450, -1),
    makeFlipper(39.5, 300, 1, 22, 3.4, 2.2), makeFlipper(m(39.5), 206, -1, 22, 3.4, 2.2),
  ];

  // The pulsar: a bar spinning round its middle.
  const rotors = [{ ...PULSAR, a: 0, omega: 3, r: 2.4, hits: 0, flash: 0 }];

  const wormholes = [{ x: VORTEX.x, y: VORTEX.y, r: 6, id: 0 }];
  const lanes = [0, 1, 2, 3].map((i) => ({ x0: LANE_XS[i], x1: LANE_XS[i + 1], y: 50, id: i }));
  // The left orbit has a spinner; the right one a hyperspace gate.
  const spinners = [{ x0: 17, x1: 36, y: 200, id: 0 }, { x0: m(36), x1: m(17), y: 240, id: 1, gate: true }];
  // Rollover stars in the inlanes.
  const rollovers = [{ x: 38, y: 385, id: 0 }, { x: m(38), y: 385, id: 1 }];

  return {
    segments, circles, bumpers, drops, standups, asteroids, letters, star, moons, wormholes, lanes, spinners, rollovers, flippers, rotors, captive,
    vortex: { ...VORTEX, spin: 1 },
    saucer: { ...SAUCER },
    ramps: RAMPS,
    comet: null, ship: null, hole: null,
  };
}

// Flippers: a tapered capsule from pivot to tip. `side` is 1 for left, -1 for right.
export const FLIP = { len: 34, r0: 5, r1: 2.7, rest: 0.52, up: -0.46, speed: 30, e: 0.25 };

export function makeFlipper(px, py, side, len = FLIP.len, r0 = FLIP.r0, r1 = FLIP.r1) {
  const mini = len < FLIP.len;
  const restA = mini ? 0.62 : FLIP.rest, upA = mini ? -0.3 : FLIP.up;
  const rest = side === 1 ? restA : Math.PI - restA;
  const up = side === 1 ? upA : Math.PI - upA;
  return { px, py, side, len, baseLen: len, mini, r0, r1, rest, upAngle: up, angle: rest, omega: 0, held: false };
}

export function flipperTip(f) {
  return { x: f.px + Math.cos(f.angle) * f.len, y: f.py + Math.sin(f.angle) * f.len };
}
