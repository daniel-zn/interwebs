// Procedural drake painter. Each species is built from a body plan ("kind") plus
// parts (horns, frills, caps, tail tips, circuit lines) into a 64x64 material
// buffer, then shaded and outlined like hand-made pixel art. Facing left.
import { SPECIES, SPECIES_BY_ID } from '../data/species.js';
import { hash, makeCanvas, mix, mulberry32, shade } from '../util.js';

const N = 64;
// Materials
const BODY = 1, BELLY = 2, WING = 3, ACC = 4, HORN = 5, EYE = 6, PUPIL = 7, DARK = 8, WINGFAR = 9, FAR = 10, WHITE = 11;

class Painter {
  constructor(scale, ox = 32, oy = 61) {
    this.buf = new Uint8Array(N * N);
    this.s = scale;
    this.ox = ox;
    this.oy = oy;
    this.dy = 0;
  }
  tx(x) {
    return this.ox + (x - 32) * this.s;
  }
  ty(y) {
    return this.oy + (y + this.dy - 61) * this.s;
  }
  set(x, y, m) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < N && y < N) this.buf[y * N + x] = m;
  }
  get(x, y) {
    return x < 0 || y < 0 || x >= N || y >= N ? 0 : this.buf[y * N + x];
  }
  ell(cx, cy, rx, ry, m) {
    const X = this.tx(cx), Y = this.ty(cy), RX = Math.max(0.6, rx * this.s), RY = Math.max(0.6, ry * this.s);
    for (let y = Math.floor(Y - RY); y <= Math.ceil(Y + RY); y++) {
      for (let x = Math.floor(X - RX); x <= Math.ceil(X + RX); x++) {
        const dx = (x + 0.5 - X) / RX, dy = (y + 0.5 - Y) / RY;
        if (dx * dx + dy * dy <= 1) this.set(x, y, m);
      }
    }
  }
  rect(x, y, w, h, m) {
    const X = this.tx(x), Y = this.ty(y);
    for (let j = Math.round(Y); j < Math.round(Y + h * this.s); j++) for (let i = Math.round(X); i < Math.round(X + w * this.s); i++) this.set(i, j, m);
  }
  poly(pts, m) {
    const P = pts.map(([x, y]) => [this.tx(x), this.ty(y)]);
    const ys = P.map((p) => p[1]), xs = P.map((p) => p[0]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          const [xi, yi] = P[i], [xj, yj] = P[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, m);
      }
    }
  }
  /** A tapering tube through the points (radius r0 at the start to r1 at the end). */
  tube(pts, r0, r1, m, mid = null) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segs.push(d);
      total += d;
    }
    const steps = Math.max(8, Math.ceil(total * 2));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      let d = t * total, i = 0;
      while (i < segs.length - 1 && d > segs[i]) d -= segs[i++];
      const u = segs[i] ? d / segs[i] : 0;
      // Smooth the polyline a little with a quadratic blend toward the next point.
      const a = pts[i], b = pts[i + 1];
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      const r = mid !== null ? (t < 0.5 ? r0 + (mid - r0) * t * 2 : mid + (r1 - mid) * (t - 0.5) * 2) : r0 + (r1 - r0) * t;
      this.ell(x, y, r, r, m);
    }
  }
  line(pts, m) {
    for (let i = 1; i < pts.length; i++) {
      let [x0, y0] = [Math.round(this.tx(pts[i - 1][0])), Math.round(this.ty(pts[i - 1][1]))];
      const [x1, y1] = [Math.round(this.tx(pts[i][0])), Math.round(this.ty(pts[i][1]))];
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.set(x0, y0, m);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    }
  }
  /** Draws only over pixels that are already part of the body (for markings). */
  mark(x, y, m, on = [BODY, BELLY, FAR]) {
    const X = Math.floor(this.tx(x)), Y = Math.floor(this.ty(y));
    if (on.includes(this.get(X, Y))) this.set(X, Y, m);
  }
  spike(x, y, h, lean, m) {
    this.poly([[x - 2, y + 1], [x + lean, y - h], [x + 2, y + 1]], m);
  }
}

// ------------------------------------------------------------------ parts
function tailTip(p, a, x, y, dir = 1) {
  switch (a.tail) {
    case 'flame':
      p.poly([[x - 3, y + 2], [x - 1, y - 6], [x + 1, y - 3], [x + 3 * dir, y - 9], [x + 4, y - 1], [x + 2, y + 3]], ACC);
      p.ell(x + 1, y, 1.6, 2, WHITE);
      break;
    case 'fin':
      p.poly([[x - 1, y], [x + 5 * dir, y - 7], [x + 7 * dir, y + 1], [x + 4 * dir, y + 6]], WING);
      break;
    case 'fork':
      p.poly([[x, y - 1], [x + 7 * dir, y - 5], [x + 2 * dir, y + 1]], WING);
      p.poly([[x, y], [x + 7 * dir, y + 5], [x + 2 * dir, y + 1]], WING);
      break;
    case 'bolt':
      p.poly([[x, y + 1], [x + 3, y - 5], [x + 1, y - 5], [x + 5, y - 12], [x + 8, y - 12], [x + 5, y - 7], [x + 8, y - 7], [x + 2, y + 2]], ACC);
      break;
    case 'pixel':
      for (const [dx, dy] of [[1, -2], [3, 0], [4, -4], [6, -1], [2, 2], [7, -5]]) p.rect(x + dx * dir, y + dy, 2, 2, (dx + dy) % 2 ? ACC : BODY);
      break;
    case 'plug':
      p.rect(x - 2, y - 3, 5, 6, HORN);
      p.rect(x + 3, y - 2, 3, 1, HORN);
      p.rect(x + 3, y + 1, 3, 1, HORN);
      break;
    case 'orb':
      p.ell(x + 2, y - 1, 3.5, 3.5, ACC);
      p.ell(x + 1, y - 2, 1.2, 1.2, WHITE);
      break;
    case 'leaf':
      p.poly([[x - 1, y], [x + 4, y - 6], [x + 9, y - 5], [x + 6, y + 1]], WING);
      p.line([[x, y], [x + 7, y - 4]], BELLY);
      break;
    case 'ribbon':
      p.line([[x, y], [x + 3, y + 3], [x + 6, y + 1], [x + 9, y + 4]], ACC);
      p.line([[x, y + 1], [x + 3, y + 4], [x + 6, y + 2], [x + 9, y + 5]], ACC);
      break;
    case 'comet':
      for (let k = 0; k < 7; k++) p.ell(x + k * 1.8 * dir, y + k * 0.9, Math.max(0.6, 2.2 - k * 0.3), Math.max(0.6, 2.2 - k * 0.3), k % 2 ? ACC : WHITE);
      break;
  }
}

function horns(p, a, hx, hy, big = 1) {
  const n = a.horns || 0;
  if (n >= 1) p.tube([[hx + 1, hy], [hx + 5 * big, hy - 5 * big], [hx + 9 * big, hy - 8 * big]], 2, 0.5, HORN);
  if (n >= 2) p.tube([[hx + 3, hy + 2], [hx + 8 * big, hy - 1 * big], [hx + 12 * big, hy - 2 * big]], 1.8, 0.5, HORN);
  if (n >= 3) p.tube([[hx - 6, hy + 1], [hx - 7, hy - 3 * big]], 1.4, 0.5, HORN);
  if (n >= 4) p.tube([[hx - 2, hy - 1], [hx + 1, hy - 7 * big], [hx + 4, hy - 11 * big]], 1.6, 0.5, HORN);
}

function eye(p, x, y, big = false) {
  if (big) {
    p.ell(x, y, 2.6, 3, EYE);
    p.rect(x - 2, y - 1, 2, 3, PUPIL);
    p.rect(x, y - 2, 1, 1, WHITE);
  } else {
    p.rect(x - 1, y - 1, 3, 2, EYE);
    p.rect(x - 1, y - 1, 1, 2, PUPIL);
  }
}

function frill(p, hx, hy) {
  p.poly([[hx, hy - 2], [hx + 9, hy - 7], [hx + 7, hy - 1], [hx + 11, hy + 1], [hx + 3, hy + 3]], WING);
}

function circuits(p, a, pts) {
  const n = a.circuits || 0;
  if (!n) return;
  for (let i = 0; i < Math.min(pts.length, n + 1); i++) {
    const [x, y, len] = pts[i];
    for (let k = 0; k < len; k++) p.mark(x + k, y + (k > len / 2 ? 1 : 0), ACC, [BODY, FAR, BELLY, WING]);
    p.mark(x + len, y + 1, ACC, [BODY, FAR, BELLY, WING]);
    p.mark(x + len, y, ACC, [BODY, FAR, BELLY, WING]);
  }
}

// ------------------------------------------------------------------ body plans
const PLANS = {
  hatch(p, a) {
    p.tube([[40, 52], [50, 54], [55, 46]], 4, 1.5, BODY);
    tailTip(p, a, 55, 45);
    p.poly([[38, 40], [50, 26], [52, 38]], WINGFAR);
    p.ell(40, 58, 4, 3, FAR);
    p.ell(38, 49, 11, 10, BODY);
    p.ell(35, 52, 7, 6, BELLY);
    if (a.frill) frill(p, 32, 32);
    p.ell(27, 37, 12, 11, BODY);
    p.ell(18, 41, 6, 5, BODY);
    p.ell(26, 44, 6, 3, BELLY);
    horns(p, a, 26, 27, 0.8);
    if (a.cap) {
      p.ell(29, 28, 12, 6, ACC);
      for (const [x, y] of [[24, 27], [30, 25], [35, 28]]) p.ell(x, y, 1.6, 1.3, WHITE);
    }
    p.poly([[40, 42], [53, 30], [50, 44]], WING);
    p.line([[40, 42], [53, 30]], BODY);
    p.ell(32, 59, 4, 3, BODY);
    p.ell(45, 59, 4, 3, BODY);
    eye(p, 24, 35, true);
    p.line([[13, 43], [19, 44]], DARK);
    p.set(Math.floor(p.tx(13)), Math.floor(p.ty(39)), DARK);
  },

  drake(p, a) {
    const stout = a.stout ? 1.2 : 1;
    p.tube([[34, 32], [40, 16], [52, 8]], 2, 1, FAR);
    p.poly([[34, 32], [52, 8], [58, 18], [54, 22], [57, 30], [48, 30], [44, 36]], WINGFAR);
    p.tube([[46, 44], [55, 49], [60, 38]], 5 * stout, 1.5, BODY);
    tailTip(p, a, 60, 37);
    p.tube([[26, 46], [25, 54], [24, 58]], 3.5, 3, FAR);
    p.tube([[44, 46], [46, 54], [46, 58]], 3.5, 3, FAR);
    p.ell(36, 43, 14 * stout, 9 * stout, BODY);
    p.ell(34, 48, 11 * stout, 5, BELLY);
    p.tube([[27, 40], [20, 34], [18, 26]], 5.5, 4, BODY);
    p.tube([[24, 44], [18, 37], [16, 30]], 3, 2.4, BELLY);
    if (a.frill) frill(p, 20, 20);
    p.ell(17, 22, 7, 6, BODY);
    p.ell(9, 25, 6, 3.6, BODY);
    horns(p, a, 18, 17);
    if (a.cap) {
      p.ell(38, 34, 12, 5 + a.cap, ACC);
      for (const [x, y] of [[32, 33], [39, 31], [45, 34]]) p.ell(x, y, 1.5, 1.2, WHITE);
    }
    if (a.spikes) for (const [x, y] of [[26, 33], [32, 35], [38, 34], [44, 35], [50, 38]]) p.spike(x, y, 3 + (a.spikes > 1 ? 1 : 0), 1, a.spikes > 1 ? ACC : HORN);
    p.tube([[30, 48], [30, 55], [28, 59]], 4, 3.5, BODY);
    p.tube([[46, 47], [49, 54], [48, 59]], 4, 3.5, BODY);
    for (const x of [25, 45]) p.rect(x, 59, 2, 1, HORN);
    p.tube([[36, 33], [34, 16], [40, 3]], 2.4, 1, BODY);
    p.poly([[36, 34], [40, 3], [48, 8], [46, 14], [52, 20], [46, 22], [48, 30], [42, 32]], WING);
    p.line([[40, 4], [46, 14]], BODY);
    p.line([[39, 8], [46, 22]], BODY);
    if (a.chest) {
      p.ell(28, 44, 3.2, 3.2, ACC);
      p.ell(28, 44, 1.4, 1.4, WHITE);
    }
    eye(p, 16, 20);
    p.line([[4, 27], [12, 27]], DARK);
    p.set(Math.floor(p.tx(5)), Math.floor(p.ty(23)), DARK);
    circuits(p, a, [[30, 41, 8], [40, 45, 6], [22, 34, 3]]);
  },

  wyvern(p, a) {
    p.poly([[34, 30], [44, 6], [58, 4], [62, 14], [56, 18], [60, 26], [50, 28], [50, 36]], WINGFAR);
    p.tube([[38, 46], [48, 54], [56, 56]], 4, 1.2, BODY);
    tailTip(p, a, 56, 56);
    p.tube([[36, 50], [37, 55], [37, 59]], 2.4, 2, FAR);
    p.ell(32, 40, 9, 12, BODY);
    p.ell(29, 44, 6, 8, BELLY);
    p.tube([[30, 50], [30, 55], [28, 59]], 2.6, 2.2, BODY);
    p.rect(25, 59, 3, 1, HORN);
    p.tube([[30, 30], [27, 24]], 5, 5, BODY);
    if (a.frill) frill(p, 28, 20);
    p.ell(26, 21, 7, 6, BODY);
    p.ell(18, 24, 5, 3, BODY);
    horns(p, a, 27, 16, 0.9);
    if (a.antennae) {
      p.line([[25, 16], [22, 7], [19, 4]], FAR);
      p.ell(19, 4, 1.5, 1.5, ACC);
      p.line([[28, 16], [29, 7], [33, 4]], FAR);
      p.ell(33, 4, 1.5, 1.5, ACC);
    }
    p.poly([[34, 32], [28, 12], [32, 1], [44, 4], [42, 10], [50, 14], [42, 18], [46, 26], [38, 30]], WING);
    p.line([[34, 31], [32, 2]], BODY);
    p.line([[33, 20], [44, 5]], BODY);
    eye(p, 24, 20);
    p.line([[14, 25], [20, 26]], DARK);
    circuits(p, a, [[28, 36, 5], [30, 46, 4], [36, 16, 5]]);
  },

  serpent(p, a) {
    const path = [[58, 57], [44, 60], [28, 57], [21, 49], [28, 42], [40, 38], [42, 28], [34, 20], [24, 17]];
    tailTip(p, a, 58, 56);
    p.tube(path, 2, 4.5, BODY, 6.5);
    p.tube(path.slice(1, -1).map(([x, y]) => [x - 1, y + 2]), 2, 2, BELLY, 3.5);
    if (a.frill) for (const [x, y] of [[36, 34], [44, 33], [26, 46], [35, 57]]) p.spike(x, y, 4, 2, WING);
    p.ell(21, 17, 7, 5.5, BODY);
    p.ell(12, 19, 6, 3.3, BODY);
    horns(p, a, 23, 13, 0.9);
    if (a.frill) frill(p, 25, 17);
    eye(p, 19, 16);
    p.line([[7, 21], [15, 21]], DARK);
    circuits(p, a, [[30, 40, 6], [24, 55, 8], [38, 30, 3]]);
  },

  mech(p, a) {
    p.tube([[50, 44], [58, 42], [60, 34]], 3.5, 2, FAR);
    tailTip(p, a, 60, 33);
    p.rect(24, 50, 6, 10, FAR);
    p.rect(42, 50, 6, 10, FAR);
    p.rect(20, 34, 32, 18, BODY);
    p.rect(22, 32, 28, 2, BODY);
    p.rect(24, 44, 22, 7, BELLY);
    for (let x = 28; x < 50; x += 7) p.rect(x, 35, 1, 8, DARK);
    for (const [x, y] of [[23, 37], [23, 47], [48, 37], [48, 47]]) p.rect(x, y, 1, 1, HORN);
    if (a.spikes) for (const x of [26, 33, 40, 47]) p.spike(x, 32, 3 + a.spikes, 0, a.spikes > 1 ? ACC : HORN);
    p.rect(14, 30, 10, 8, BODY);
    p.rect(4, 18, 20, 14, BODY);
    p.rect(2, 26, 8, 6, BODY);
    p.rect(3, 31, 8, 1, DARK);
    p.rect(6, 22, 12, 3, EYE);
    p.rect(6, 22, 3, 3, WHITE);
    horns(p, a, 18, 18, 0.8);
    p.rect(28, 50, 6, 10, BODY);
    p.rect(44, 50, 6, 10, BODY);
    p.rect(27, 59, 8, 1, HORN);
    p.rect(43, 59, 8, 1, HORN);
    if (a.circuits) circuits(p, a, [[26, 40, 18], [8, 28, 6], [30, 46, 10]]);
  },

  critter(p, a) {
    if (a.tail === 'bolt') tailTip(p, a, 42, 50);
    else {
      p.tube([[42, 50], [52, 48], [56, 40]], 3, 1.5, BODY);
      tailTip(p, a, 56, 39);
    }
    p.ell(30, 58, 3, 2.5, FAR);
    p.ell(44, 58, 3, 2.5, FAR);
    p.ell(36, 51, 11, 7.5, BODY);
    p.ell(34, 54, 8, 4, BELLY);
    if (a.frill) frill(p, 26, 38);
    p.ell(24, 43, 9, 8, BODY);
    p.ell(16, 46, 5, 3.5, BODY);
    if (a.ears) {
      p.poly([[21, 38], [16, 22], [27, 35]], BODY);
      p.poly([[21, 36], [18, 27], [25, 35]], ACC);
      p.poly([[27, 37], [30, 22], [33, 38]], BODY);
      p.poly([[28, 36], [30, 27], [32, 37]], ACC);
    }
    if (a.antennae) {
      p.line([[22, 36], [18, 26], [13, 23]], HORN);
      p.ell(13, 23, 1.6, 1.6, ACC);
      p.line([[26, 36], [28, 26], [33, 22]], HORN);
      p.ell(33, 22, 1.6, 1.6, ACC);
    }
    p.ell(28, 59, 3, 2.5, BODY);
    p.ell(42, 59, 3, 2.5, BODY);
    eye(p, 21, 41, true);
    p.line([[12, 48], [17, 48]], DARK);
    circuits(p, a, [[30, 49, 8], [22, 44, 3], [38, 53, 5]]);
  },

  cosmic(p, a) {
    p.dy = -3;
    if (a.halo) {
      p.ell(40, 32, 20, 20, ACC);
      p.ell(40, 32, 18.5 - a.halo * 0.5, 18.5 - a.halo * 0.5, 0);
    }
    if (a.wings) {
      p.poly([[40, 30], [48, 2], [62, 0], [63, 12], [56, 16], [62, 24], [52, 26], [52, 34]], WINGFAR);
      p.poly([[36, 32], [28, 8], [36, -2], [48, 2], [44, 8], [52, 12], [44, 18], [48, 26], [40, 30]], WING);
    }
    const path = [[58, 46], [50, 56], [36, 58], [26, 52], [28, 42], [40, 36], [46, 28], [40, 18], [28, 14]];
    tailTip(p, a, 58, 44, 1);
    p.tube(path, 2, 5, BODY, 7);
    p.tube(path.slice(2, -1).map(([x, y]) => [x - 1, y + 2]), 2, 2, BELLY, 3);
    p.ell(24, 14, 7, 5.5, BODY);
    p.ell(15, 16, 6, 3.3, BODY);
    p.ell(30, 44, 2.5, 2.5, BODY);
    horns(p, a, 26, 10, 1);
    if (!a.wings) p.poly([[42, 34], [52, 22], [54, 34]], WING);
    eye(p, 22, 13);
    p.line([[10, 18], [17, 18]], DARK);
    circuits(p, a, [[30, 52, 8], [38, 38, 5], [26, 44, 3]]);
  },
};

// ------------------------------------------------------------------ rendering
const STAGE = {};
for (const sp of SPECIES) STAGE[sp.id] ??= 1;
for (const sp of SPECIES) if (sp.evo) STAGE[sp.evo.to] = (STAGE[sp.id] ?? 1) + 1;
for (const sp of SPECIES) if (sp.evo) STAGE[sp.evo.to] = STAGE[sp.id] + 1;

function scaleFor(sp) {
  const a = sp.art;
  if (a.big) return 0.9;
  if (a.small) return 0.68;
  const st = STAGE[sp.id];
  if (a.kind === 'hatch' || a.kind === 'critter') return 0.86;
  if (st === 1) return a.kind === 'mech' ? 0.7 : 0.8;
  if (st === 2 && sp.evo) return 0.82;
  return 0.97;
}

const cache = new Map();

export function creatureCanvas(id, { silhouette = false } = {}) {
  const key = `${id}:${silhouette}`;
  if (cache.has(key)) return cache.get(key);
  const sp = SPECIES_BY_ID[id];
  const a = sp.art;
  const p = new Painter(scaleFor(sp));
  PLANS[a.kind](p, a);
  const rng = mulberry32(hash(id));
  // Star speckles inside the body (space drakes).
  if (a.stars) {
    for (let k = 0; k < 18 * a.stars; k++) {
      const x = Math.floor(rng() * N), y = Math.floor(rng() * N);
      const m = p.get(x, y);
      if (m === BODY || m === WING || m === WINGFAR) p.set(x, y, k % 3 ? WHITE : ACC);
    }
  }
  const outline = mix(a.body, '#05030f', 0.82);
  const col = {
    [BODY]: a.body, [BELLY]: a.belly, [WING]: a.wing, [ACC]: a.accent, [HORN]: a.horn, [EYE]: a.eye,
    [PUPIL]: '#0a0620', [DARK]: outline, [WINGFAR]: shade(a.wing, -0.35), [FAR]: shade(a.body, -0.38), [WHITE]: '#fffdf0',
  };
  const shaded = new Set([BODY, BELLY, WING, HORN, WINGFAR, FAR]);
  const [c, ctx] = makeCanvas(N, N);
  const img = ctx.createImageData(N, N);
  const put = (x, y, hex, alpha = 255) => {
    const n = parseInt(hex.slice(1), 16), o = (y * N + x) * 4;
    img.data[o] = (n >> 16) & 255;
    img.data[o + 1] = (n >> 8) & 255;
    img.data[o + 2] = n & 255;
    img.data[o + 3] = alpha;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const m = p.get(x, y);
      if (!m) {
        if (p.get(x - 1, y) || p.get(x + 1, y) || p.get(x, y - 1) || p.get(x, y + 1)) put(x, y, silhouette ? '#05030f' : outline);
        continue;
      }
      if (silhouette) {
        put(x, y, '#1a1440');
        continue;
      }
      let c0 = col[m];
      if (shaded.has(m)) {
        const up = p.get(x, y - 1), dn = p.get(x, y + 1), dn2 = p.get(x, y + 2);
        if (up !== m && up !== ACC) c0 = shade(c0, 0.28);
        else if (dn !== m && dn !== ACC) c0 = shade(c0, -0.32);
        else if (dn2 !== m && (x + y) % 2 === 0) c0 = shade(c0, -0.18);
      }
      put(x, y, c0);
    }
  }
  ctx.putImageData(img, 0, 0);
  // Glitch drakes smear a few rows sideways.
  if (a.glitch && !silhouette) {
    for (let k = 0; k < 3 * a.glitch; k++) {
      const y = 8 + Math.floor(rng() * 48), h = 1 + Math.floor(rng() * 3), dx = rng() < 0.5 ? -2 : 2;
      const row = ctx.getImageData(0, y, N, h);
      ctx.clearRect(0, y, N, h);
      ctx.putImageData(row, dx, y);
    }
  }
  cache.set(key, c);
  return c;
}

export const stageOf = (id) => STAGE[id];
