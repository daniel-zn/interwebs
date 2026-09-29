// The table's layout, in playfield pixels (0..TW across, 0..TH down). The
// playfield proper runs from x=4 to x=160; the shooter lane is x=160..172.
// Everything the ball can touch is a segment, a circle or a flipper.

export const TW = 176;
export const TH = 304;
export const CX = 82; // playfield centre line (mirror axis)
export const BALL_R = 3.5;
export const DRAIN_Y = TH + 6;

// Where a new ball waits for the plunger.
export const PLUNGER = { x: 166, y: 292 };
export const LANE_X = 160; // inner wall of the shooter lane

const mirror = (x) => 2 * CX - x;

function seg(ax, ay, bx, by, extra = {}) {
  return { ax, ay, bx, by, e: 0.45, kind: 'wall', ...extra };
}
/** A chain of segments through the given points. */
function chain(points, extra = {}) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) out.push(seg(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], extra));
  return out;
}

export const ARC = { x: 88, y: 92, r: 84 };

/** Builds a fresh table. Things that change during play (drop targets, the star) live on it. */
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

  // Shooter lane: its inner wall, the stopper under the ball, and a one-way gate.
  segments.push(seg(LANE_X, TH + 20, LANE_X, 126));
  segments.push(seg(LANE_X, PLUNGER.y + BALL_R + 0.5, 172, PLUNGER.y + BALL_R + 0.5, { kind: 'stopper', e: 0.1 }));
  segments.push(seg(LANE_X, 126, 172, 112, { kind: 'gate', oneway: true }));

  // Lower playfield, left side then mirrored: inlane guide, slingshot, apron.
  for (const side of [1, -1]) {
    const X = (x) => (side === 1 ? x : mirror(x));
    segments.push(...chain([[X(14), 206], [X(14), 250], [X(46.5), 269.2]], { kind: 'guide' }));
    // Slingshot: the long face kicks, the other two are plain rubber.
    const A = [X(26), 218], B = [X(26), 244], C = [X(41), 257];
    segments.push(seg(A[0], A[1], C[0], C[1], { kind: 'sling', side, e: 0.6 }));
    segments.push(seg(A[0], A[1], B[0], B[1], { kind: 'rubber', e: 0.5 }));
    segments.push(seg(B[0], B[1], C[0], C[1], { kind: 'rubber', e: 0.5 }));
    circles.push({ x: X(14), y: 206, r: 2.2, kind: 'post', e: 0.5 });
    // At the foot of the side channel, steer wall-huggers into the inlane.
    segments.push(seg(X(4), 186, X(11), 198, { kind: 'guide' }));
    // Apron walls below the flippers, down to the drain.
    segments.push(seg(X(4), 262, X(34), 300, { kind: 'apron' }));
  }

  // Top lanes (S T A R): three short guides make four lanes.
  for (const x of [64, 82, 100]) {
    segments.push(seg(x, 34, x, 50, { kind: 'laneguide', e: 0.3 }));
    circles.push({ x, y: 34, r: 1.6, kind: 'post', e: 0.3 });
  }

  // Pop bumpers.
  const bumpers = [
    { x: 62, y: 108, r: 9, kind: 'bumper', id: 0, e: 0.6, kick: 360 },
    { x: 102, y: 108, r: 9, kind: 'bumper', id: 1, e: 0.6, kick: 360 },
    { x: 82, y: 136, r: 9, kind: 'bumper', id: 2, e: 0.6, kick: 360 },
  ];
  circles.push(...bumpers);

  // Drop targets: a bank of three on the left, facing right.
  const drops = [150, 163, 176].map((y, i) => ({ ...seg(24, y - 5, 24, y + 5, { kind: 'drop', id: i, e: 0.35 }), up: true }));
  segments.push(...drops);
  // A backstop behind them so a dropped bank doesn't open a hole to the outlane.
  segments.push(seg(20, 142, 20, 184, { kind: 'wall' }));

  // The dying star, dead centre. Its radius grows with its mass.
  const star = { x: CX, y: 190, r: 6, kind: 'star', e: 0.55, kick: 160 };
  circles.push(star);

  // The wormhole: a saucer that catches slow balls.
  const wormhole = { x: 142, y: 160, r: 6 };
  // Lane sensors, the spinner and orbit checkpoints.
  const lanes = [[46, 64], [64, 82], [82, 100], [100, 118]].map(([a, b], i) => ({ x0: a, x1: b, y: 42, id: i }));
  const spinner = { x0: 4, x1: 20, y: 96 };
  const flippers = [makeFlipper(48, 274, 1), makeFlipper(mirror(48), 274, -1)];

  return {
    segments, circles, bumpers, drops, star, wormhole, lanes, spinner, flippers,
    // Moving targets that some stages add. Null when absent.
    comet: null, ship: null, hole: null, centerPost: false,
  };
}

// Flippers: a tapered capsule from pivot to tip. `side` is 1 for left, -1 for right.
export const FLIP = { len: 30, r0: 4.5, r1: 2.4, rest: 0.52, up: -0.46, speed: 30, e: 0.25 };

export function makeFlipper(px, py, side) {
  const rest = side === 1 ? FLIP.rest : Math.PI - FLIP.rest;
  const up = side === 1 ? FLIP.up : Math.PI - FLIP.up;
  return { px, py, side, len: FLIP.len, r0: FLIP.r0, r1: FLIP.r1, rest, upAngle: up, angle: rest, omega: 0, held: false };
}

export function flipperTip(f) {
  return { x: f.px + Math.cos(f.angle) * f.len, y: f.py + Math.sin(f.angle) * f.len };
}
