// The table's layout, in playfield pixels (0..TW across, 0..TH down). It is
// mirror-symmetric about x = CX: a lane on each side (the right one is the
// shooter lane, the left one launches extra balls), orbits with spinners,
// crossing ramps, mini flippers, twin wormholes and drop target banks, the
// SUPERNOVA letters arching over the star and two moons orbiting it.
// Everything the ball can touch is a segment, a circle or a flipper.

export const TW = 176;
export const TH = 344;
export const CX = 88; // mirror axis
export const BALL_R = 3.5;
export const DRAIN_Y = TH + 6;

export const LANE_X = 162; // inner wall of the (right) shooter lane
export const PLUNGER = { x: 168, y: 332 };
export const LEFT_PLUNGER = { x: 8, y: 332 };
export const STAR = { x: CX, y: 214 };

export const m = (x) => 2 * CX - x;

function seg(ax, ay, bx, by, extra = {}) {
  return { ax, ay, bx, by, e: 0.45, kind: 'wall', ...extra };
}
function chain(points, extra = {}) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) out.push(seg(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], extra));
  return out;
}

export const ARC = { x: CX, y: 92, r: 84 };

// The ramps: a bridge the ball rides over the bumpers. The left mouth
// carries it across and drops it into the right orbit (which feeds the right
// inlane), and the mirror image.
const RAMP_L = [[39, 112], [40, 86], [52, 68], [88, 58], [124, 68], [142, 86], [154, 104]];
export const RAMPS = [
  { id: 0, mouth: { x0: 32, x1: 47, y: 114 }, path: RAMP_L },
  { id: 1, mouth: { x0: m(47), x1: m(32), y: 114 }, path: RAMP_L.map(([x, y]) => [m(x), y]) },
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

/** Builds a fresh table. Things that change during play live on it. */
export function buildTable() {
  const segments = [];
  const circles = [];

  // Outer walls and the domed top.
  segments.push(seg(4, TH + 20, 4, ARC.y));
  const arcPts = [];
  for (let i = 0; i <= 36; i++) {
    const t = Math.PI + (i / 36) * Math.PI;
    arcPts.push([ARC.x + Math.cos(t) * ARC.r, ARC.y + Math.sin(t) * ARC.r]);
  }
  segments.push(...chain(arcPts));
  segments.push(seg(172, ARC.y, 172, TH + 20));

  for (const side of [1, -1]) {
    const X = (x) => (side === 1 ? x : m(x));
    // The side lane: inner wall, stopper, one-way gate out to the orbit.
    segments.push(seg(X(14), TH + 20, X(14), 126));
    segments.push(seg(X(4), 336, X(14), 336, { kind: 'stopper', e: 0.1 }));
    segments.push(seg(X(14), 126, X(4), 112, { kind: 'gate', oneway: true, side }));
    // Orbit guide, with a steer at its foot into the inlane.
    segments.push(seg(X(30), 102, X(30), 230, { kind: 'guide' }));
    circles.push({ x: X(30), y: 102, r: 2, kind: 'post', e: 0.4 });
    segments.push(seg(X(14), 228, X(22), 240, { kind: 'guide' }));
    // Inlane guide and outlane post.
    segments.push(...chain([[X(25), 246], [X(25), 290], [X(57.5), 309.2]], { kind: 'guide' }));
    circles.push({ x: X(25), y: 246, r: 2.2, kind: 'post', e: 0.5 });
    // Slingshot.
    const A = [X(37), 258], B = [X(37), 284], C = [X(52), 297];
    segments.push(seg(A[0], A[1], C[0], C[1], { kind: 'sling', side, e: 0.6 }));
    segments.push(seg(A[0], A[1], B[0], B[1], { kind: 'rubber', e: 0.5 }));
    segments.push(seg(B[0], B[1], C[0], C[1], { kind: 'rubber', e: 0.5 }));
    // Apron.
    segments.push(seg(X(14), 302, X(44), 340, { kind: 'apron' }));
  }

  // Top lanes (S T A R).
  for (const x of [70, 88, 106]) {
    segments.push(seg(x, 34, x, 50, { kind: 'laneguide', e: 0.3 }));
    circles.push({ x, y: 34, r: 1.6, kind: 'post', e: 0.3 });
  }

  // Pop bumpers.
  const bumpers = [
    { x: 70, y: 94, r: 9, kind: 'bumper', id: 0, e: 0.6, kick: 360 },
    { x: 106, y: 94, r: 9, kind: 'bumper', id: 1, e: 0.6, kick: 360 },
    { x: 88, y: 120, r: 9, kind: 'bumper', id: 2, e: 0.6, kick: 360 },
  ];
  circles.push(...bumpers);

  // Two drop target banks facing the middle.
  const drops = [];
  for (const side of [1, -1]) {
    [168, 181, 194].forEach((y, i) => {
      const x = side === 1 ? 36 : m(36);
      drops.push({ ...seg(x, y - 5, x, y + 5, { kind: 'drop', id: drops.length, bank: side === 1 ? 0 : 1, e: 0.35 }), up: true, row: i });
    });
  }
  segments.push(...drops);

  // SUPERNOVA: nine rollover inserts arching over the star. Roll over them to light them.
  const letters = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + 0.35 + (i / 8) * (Math.PI - 0.7);
    letters.push({ x: STAR.x + Math.cos(a) * 36, y: STAR.y + Math.sin(a) * 30, id: i, lit: false });
  }

  // The dying star, and two moons orbiting it.
  const star = { x: STAR.x, y: STAR.y, r: 6, kind: 'star', e: 0.55, kick: 160 };
  circles.push(star);
  const moons = [0, Math.PI].map((a, i) => ({ x: STAR.x, y: STAR.y, r: 3.4, kind: 'moon', id: i, e: 0.6, a }));
  circles.push(...moons);

  // Mini flippers up top and the main flippers.
  const flippers = [
    makeFlipper(58, 314, 1), makeFlipper(m(58), 314, -1),
    makeFlipper(34, 64, 1, 17, 3.2, 2), makeFlipper(m(34), 64, -1, 17, 3.2, 2),
  ];

  const wormholes = [{ x: 52, y: 146, r: 6, id: 0 }, { x: m(52), y: 146, r: 6, id: 1 }];
  const lanes = [[52, 70], [70, 88], [88, 106], [106, 124]].map(([a, b], i) => ({ x0: a, x1: b, y: 42, id: i }));
  const spinners = [{ x0: 14, x1: 30, y: 140, id: 0 }, { x0: m(30), x1: m(14), y: 140, id: 1 }];
  // Rollover stars in the inlanes.
  const rollovers = [{ x: 31, y: 272, id: 0 }, { x: m(31), y: 272, id: 1 }];

  return {
    segments, circles, bumpers, drops, letters, star, moons, wormholes, lanes, spinners, rollovers, flippers,
    ramps: RAMPS,
    comet: null, ship: null, hole: null,
  };
}

// Flippers: a tapered capsule from pivot to tip. `side` is 1 for left, -1 for right.
export const FLIP = { len: 27, r0: 4.5, r1: 2.4, rest: 0.52, up: -0.46, speed: 30, e: 0.25 };

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
