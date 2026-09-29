// The table's layout, in playfield pixels (0..TW across, 0..TH down). The
// lower half is a classic symmetric pair of flippers, slingshots and lanes;
// the upper half is deliberately lopsided: a spiral warp ramp round the
// wormhole vortex on the left, a hairpin comet ramp and a mini flipper on the
// right, the pop bumper nest and S T A R lanes off to the right, a five-bank
// of drop targets on the left and a captive ball chamber on the right.
// Everything the ball can touch is a segment, a circle or a flipper.

export const TW = 200;
export const TH = 392;
export const CX = 100; // centre line
export const BALL_R = 3.5;
export const DRAIN_Y = TH + 6;

export const LANE_X = 184; // inner wall of the (right) shooter lane
export const PLUNGER = { x: 190, y: 380 };
export const LEFT_PLUNGER = { x: 10, y: 380 };
export const STAR = { x: CX, y: 232 };
export const VORTEX = { x: 62, y: 90, r: 17 };
export const WHITE_HOLE = { x: 118, y: 178 };
export const CAPTIVE = { x: 150, top: 207, rest: 238 };

export const m = (x) => 2 * CX - x;

function seg(ax, ay, bx, by, extra = {}) {
  return { ax, ay, bx, by, e: 0.45, kind: 'wall', ...extra };
}
function chain(points, extra = {}) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) out.push(seg(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], extra));
  return out;
}

export const ARC = { x: CX, y: 104, r: 96 };

// Ramps: the ball is carried along a path over the playfield. The warp ramp
// spirals round the vortex and drops into the left orbit; the comet ramp
// hairpins over the bumpers and drops into the right orbit.
export const RAMPS = [
  {
    id: 0, name: 'WARP', mouth: { x0: 38, x1: 54, y: 152 },
    path: [[46, 152], [44, 122], [44, 92], [52, 70], [68, 62], [82, 72], [84, 92], [74, 106], [56, 112], [36, 112], [25, 124], [25, 146]],
  },
  {
    id: 1, name: 'COMET', mouth: { x0: 118, x1: 134, y: 150 },
    path: [[126, 150], [128, 128], [140, 112], [158, 104], [172, 110], [175, 126], [175, 146]],
  },
];
for (const r of RAMPS) {
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
  let i = 1;
  while (i < r.lens.length - 1 && r.lens[i] < d) i++;
  const a = r.path[i - 1], b = r.path[i];
  const u = (d - r.lens[i - 1]) / (r.lens[i] - r.lens[i - 1] || 1);
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u };
}

export const LETTERS = 'SUPERNOVA';
export const LANE_XS = [82, 98, 114, 130, 146];

// The shots missions light up, with the spot their arrow lamp sits.
export const SHOTS = [
  { id: 'lorbit', name: 'LEFT ORBIT', x: 42, y: 256 },
  { id: 'lramp', name: 'WARP RAMP', x: 46, y: 162 },
  { id: 'worm', name: 'WORMHOLE', x: 62, y: 116 },
  { id: 'ion', name: 'ION TARGETS', x: 99, y: 158 },
  { id: 'rramp', name: 'COMET RAMP', x: 126, y: 160 },
  { id: 'captive', name: 'PLANET', x: 150, y: 254 },
  { id: 'rorbit', name: 'RIGHT ORBIT', x: 160, y: 270 },
];

/** Builds a fresh table. Things that change during play live on it. */
export function buildTable() {
  const segments = [];
  const circles = [];

  // Outer walls and the domed top.
  segments.push(seg(4, TH + 20, 4, ARC.y));
  const arcPts = [];
  for (let i = 0; i <= 40; i++) {
    const t = Math.PI + (i / 40) * Math.PI;
    arcPts.push([ARC.x + Math.cos(t) * ARC.r, ARC.y + Math.sin(t) * ARC.r]);
  }
  segments.push(...chain(arcPts));
  segments.push(seg(196, ARC.y, 196, TH + 20));

  for (const side of [1, -1]) {
    const X = (x) => (side === 1 ? x : m(x));
    // The side lane: inner wall, stopper, one-way gate out to the orbit.
    segments.push(seg(X(16), TH + 20, X(16), 144));
    segments.push(seg(X(4), 384, X(16), 384, { kind: 'stopper', e: 0.1 }));
    segments.push(seg(X(16), 144, X(4), 128, { kind: 'gate', oneway: true, side }));
    // Orbit guide, with a steer at its foot into the inlane.
    segments.push(seg(X(34), 116, X(34), 262, { kind: 'guide' }));
    circles.push({ x: X(34), y: 116, r: 2, kind: 'post', e: 0.4 });
    segments.push(seg(X(16), 258, X(26), 272, { kind: 'guide' }));
    // Inlane guide and outlane post.
    segments.push(...chain([[X(28.5), 282], [X(28.5), 330], [X(65.5), 353.2]], { kind: 'guide' }));
    circles.push({ x: X(28.5), y: 282, r: 2.4, kind: 'post', e: 0.5 });
    // Slingshot.
    const A = [X(42), 294], B = [X(42), 324], C = [X(59), 339];
    segments.push(seg(A[0], A[1], C[0], C[1], { kind: 'sling', side, e: 0.6 }));
    segments.push(seg(A[0], A[1], B[0], B[1], { kind: 'rubber', e: 0.5 }));
    segments.push(seg(B[0], B[1], C[0], C[1], { kind: 'rubber', e: 0.5 }));
    // Apron.
    segments.push(seg(X(16), 344, X(50), 388, { kind: 'apron' }));
  }

  // Top lanes (S T A R), off to the right over the bumper nest.
  for (const x of LANE_XS) {
    segments.push(seg(x, 38, x, 56, { kind: 'laneguide', e: 0.3 }));
    circles.push({ x, y: 38, r: 1.6, kind: 'post', e: 0.3 });
  }

  // Pop bumpers.
  const bumpers = [
    { x: 104, y: 84, r: 9, kind: 'bumper', id: 0, e: 0.6, kick: 360 },
    { x: 136, y: 80, r: 9, kind: 'bumper', id: 1, e: 0.6, kick: 360 },
    { x: 121, y: 108, r: 9, kind: 'bumper', id: 2, e: 0.6, kick: 360 },
  ];
  circles.push(...bumpers);

  // A five-bank of drop targets on the left, facing the middle.
  const drops = [178, 190, 202, 214, 226].map((y, i) => ({ ...seg(40, y - 5, 40, y + 5, { kind: 'drop', id: i, bank: 0, e: 0.35 }), up: true, row: i }));
  segments.push(...drops);

  // I O N standup targets under the bumpers.
  // Each one is tilted so a ball can't come to rest on top.
  const standups = [[78, 145, 86, 140], [95, 142, 103, 139], [112, 140, 120, 145]].map(([ax, ay, bx, by], i) => seg(ax, ay, bx, by, { kind: 'standup', id: i, e: 0.5, lit: false }));
  segments.push(...standups);

  // The captive ball chamber: open at the bottom, a target at the top.
  segments.push(seg(CAPTIVE.x - 6, 200, CAPTIVE.x - 6, 246, { kind: 'guide' }));
  segments.push(seg(CAPTIVE.x + 6, 200, CAPTIVE.x + 6, 246, { kind: 'guide' }));
  segments.push(...chain([[CAPTIVE.x - 6, 200], [CAPTIVE.x, 195], [CAPTIVE.x + 6, 200]], { kind: 'guide' }));
  circles.push({ x: CAPTIVE.x - 6, y: 246, r: 1.6, kind: 'post', e: 0.4 }, { x: CAPTIVE.x + 6, y: 246, r: 1.6, kind: 'post', e: 0.4 });
  const captive = { x: CAPTIVE.x, y: CAPTIVE.rest, vy: 0, r: BALL_R, hits: 0, flash: 0 };

  // SUPERNOVA: nine rollover inserts arching over the star.
  const letters = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + 0.35 + (i / 8) * (Math.PI - 0.7);
    letters.push({ x: STAR.x + Math.cos(a) * 38, y: STAR.y + Math.sin(a) * 30, id: i, lit: false });
  }

  // The dying star, and two moons orbiting it.
  const star = { x: STAR.x, y: STAR.y, r: 6, kind: 'star', e: 0.55, kick: 160 };
  circles.push(star);
  const moons = [0, Math.PI].map((a, i) => ({ x: STAR.x, y: STAR.y, r: 3.4, kind: 'moon', id: i, e: 0.6, a }));
  circles.push(...moons);

  // An asteroid belt drifting across below the star.
  const asteroids = [0, 1, 2].map((i) => ({ x: CX, y: 272, r: 3.2, kind: 'asteroid', id: i, e: 0.7, off: false }));
  circles.push(...asteroids);

  // The main flippers and one mini flipper on the right orbit guide.
  const flippers = [
    makeFlipper(66, 358, 1), makeFlipper(m(66), 358, -1),
    makeFlipper(163, 166, -1, 20, 3.4, 2.2),
  ];

  const wormholes = [{ x: VORTEX.x, y: VORTEX.y, r: 6, id: 0 }];
  const lanes = [0, 1, 2, 3].map((i) => ({ x0: LANE_XS[i], x1: LANE_XS[i + 1], y: 48, id: i }));
  // The left orbit has a spinner; the right one a hyperspace gate.
  const spinners = [{ x0: 16, x1: 34, y: 170, id: 0 }, { x0: m(34), x1: m(16), y: 200, id: 1, gate: true }];
  // Rollover stars in the inlanes.
  const rollovers = [{ x: 35, y: 312, id: 0 }, { x: m(35), y: 312, id: 1 }];

  return {
    segments, circles, bumpers, drops, standups, asteroids, letters, star, moons, wormholes, lanes, spinners, rollovers, flippers, captive,
    vortex: { ...VORTEX, spin: 1 },
    ramps: RAMPS,
    comet: null, ship: null, hole: null,
  };
}

// Flippers: a tapered capsule from pivot to tip. `side` is 1 for left, -1 for right.
export const FLIP = { len: 31, r0: 4.8, r1: 2.6, rest: 0.52, up: -0.46, speed: 30, e: 0.25 };

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
