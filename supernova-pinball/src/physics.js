// Ball physics: gravity, walls, bumpers, flippers and ball-on-ball, stepped
// in small fixed substeps so a fast ball never skips through a wall. No DOM.
import { BALL_R, CAPTIVE, FLIP } from './table.js';

export const SUBSTEPS = 10;
export const MAX_SPEED = 1000;

export function makeBall(x, y, id = 0) {
  return { id, x, y, vx: 0, vy: 0, held: null, holdT: 0, lastHit: null, age: 0, onLane: false };
}

function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + dx * t, y: ay + dy * t, t };
}

/** Reflects the ball's velocity off a surface with normal n (moving with velocity sv). */
function bounce(b, nx, ny, e, svx = 0, svy = 0, friction = 0.02) {
  const rvx = b.vx - svx, rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  let tx = rvx - vn * nx, ty = rvy - vn * ny;
  tx *= 1 - friction;
  ty *= 1 - friction;
  b.vx = tx - vn * e * nx + svx;
  b.vy = ty - vn * e * ny + svy;
  return -vn;
}

/**
 * A tapered capsule from (px, py) at angle `a`, turning at `omega`: pushes the
 * ball out and bounces it off the moving surface. Returns the impact speed.
 */
function capsule(b, px, py, a, len, r0, r1, omega, e) {
  const tx = px + Math.cos(a) * len, ty = py + Math.sin(a) * len;
  const q = closestOnSeg(b.x, b.y, px, py, tx, ty);
  const rr = BALL_R + r0 + (r1 - r0) * q.t;
  const dx = b.x - q.x, dy = b.y - q.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return 0;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = dx / d, ny = dy / d;
  b.x = q.x + nx * rr;
  b.y = q.y + ny * rr;
  // The surface moves: omega x r.
  const rx = q.x - px, ry = q.y - py;
  return bounce(b, nx, ny, e, -omega * ry, omega * rx, 0.01);
}

/** Moves flippers towards held/rest. Returns nothing; sets omega for the collisions. */
export function stepFlippers(flippers, dt, speed = FLIP.speed) {
  for (const f of flippers) {
    const target = f.held ? f.upAngle : f.rest;
    const d = target - f.angle;
    const max = speed * dt * (f.held ? 1 : 0.7);
    const move = Math.abs(d) <= max ? d : Math.sign(d) * max;
    f.omega = move / dt;
    f.angle += move;
  }
}

/**
 * Advances one ball by dt. `hit(kind, obj, strength, ball)` is called for
 * every contact so the rules can score it. Returns false if the ball is held.
 */
export function stepBall(b, table, dt, gravity, hit) {
  if (b.held) return false;
  b.vy += gravity * dt;
  // Black hole (a later stage): a soft pull towards it.
  const hole = table.hole;
  if (hole) {
    const dx = hole.x - b.x, dy = hole.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 40 * 40) {
      const d = Math.sqrt(d2) || 1;
      const f = Math.min(450, 26000 / (d2 + 150));
      b.vx += (dx / d) * f * dt;
      b.vy += (dy / d) * f * dt;
    }
  }
  // The vortex round the wormhole swirls the ball and draws it in.
  const vo = table.vortex;
  if (vo) {
    const dx = vo.x - b.x, dy = vo.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < vo.r * vo.r) {
      const d = Math.sqrt(d2) || 1;
      const k = 1 - d / vo.r;
      const pull = 620 * Math.sqrt(k), swirl = 380 * k * vo.spin;
      b.vx += ((-dy / d) * swirl + (dx / d) * pull) * dt;
      b.vy += ((dx / d) * swirl + (dy / d) * pull) * dt;
    }
  }
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_SPEED) {
    b.vx *= MAX_SPEED / sp;
    b.vy *= MAX_SPEED / sp;
  }
  const py = b.y;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  // Walls and friends.
  for (const s of table.segments) {
    if (s.kind === 'drop' && !s.up) continue;
    const q = closestOnSeg(b.x, b.y, s.ax, s.ay, s.bx, s.by);
    const dx = b.x - q.x, dy = b.y - q.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= BALL_R * BALL_R) continue;
    const d = Math.sqrt(d2) || 1e-6;
    let nx = dx / d, ny = dy / d;
    if (s.oneway) {
      // Only blocks from its upper side (the playfield); balls from the lane pass.
      const sx = s.bx - s.ax, sy = s.by - s.ay;
      let gx = sy, gy = -sx;
      if (gy > 0) {
        gx = -gx;
        gy = -gy;
      }
      if ((b.x - s.ax) * gx + (b.y - s.ay) * gy < 0) continue;
      const gl = Math.hypot(gx, gy);
      nx = gx / gl;
      ny = gy / gl;
    }
    b.x = q.x + nx * BALL_R;
    b.y = q.y + ny * BALL_R;
    const vIn = bounce(b, nx, ny, s.e);
    if (s.kind === 'sling' && vIn > 40) {
      // Slingshots kick back hard along their face's normal.
      const kick = table.slingKick || 330;
      b.vx += nx * kick;
      b.vy += ny * kick;
    }
    if (vIn > 15 || s.kind === 'drop') hit(s.kind, s, vIn, b);
  }

  // Bumpers, posts, the star and moving targets.
  for (const c of table.circles) {
    if (c.off) continue;
    const dx = b.x - c.x, dy = b.y - c.y;
    const rr = BALL_R + c.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    b.x = c.x + nx * rr;
    b.y = c.y + ny * rr;
    const vIn = bounce(b, nx, ny, c.e, c.vx || 0, c.vy || 0);
    if (c.kick) {
      // Pop bumpers fire the ball away however softly it touched them.
      const vn = b.vx * nx + b.vy * ny;
      const want = c.kick * (table.bumperPower || 1);
      if (vn < want) {
        b.vx += nx * (want - vn);
        b.vy += ny * (want - vn);
      }
    }
    if (vIn > 10 || c.kick) hit(c.kind, c, vIn, b);
  }

  // The captive ball: slides up and down its chamber, knocked by the real one.
  const cb = table.captive;
  if (cb) {
    const dx = b.x - cb.x, dy = b.y - cb.y;
    const rr = BALL_R * 2;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, ny = dy / d;
      b.x = cb.x + nx * rr;
      b.y = cb.y + ny * rr;
      // Equal masses, but the captive ball can only move up and down.
      const vn = b.vx * nx + (b.vy - cb.vy) * ny;
      if (vn < 0) {
        const j = (-(1 + 0.8) * vn) / (1 + ny * ny);
        b.vx += j * nx;
        b.vy += j * ny;
        cb.vy -= j * ny;
        if (-vn > 40) hit('captive', cb, -vn, b);
      }
    }
  }

  // Flippers.
  for (const f of table.flippers) {
    const vIn = capsule(b, f.px, f.py, f.angle, f.len, f.r0, f.r1, f.omega, FLIP.e);
    if (vIn > 60) hit('flipper', f, vIn, b);
  }
  // The pulsar: a bar spinning round its middle, both arms bat the ball.
  for (const r of table.rotors) {
    for (const a of [r.a, r.a + Math.PI]) {
      const vIn = capsule(b, r.x, r.y, a, r.len, r.r, r.r, r.omega, 0.6);
      if (vIn > 20) hit('rotor', r, vIn, b);
    }
  }

  // Sensors: lines the ball crosses, and rollover buttons.
  for (const sp2 of table.spinners) {
    if ((py - sp2.y) * (b.y - sp2.y) <= 0 && py !== b.y && b.x > sp2.x0 && b.x < sp2.x1) hit('spinner', sp2, Math.abs(b.vy), b);
  }
  for (const l of table.lanes) {
    if (py > l.y && b.y <= l.y && b.x > l.x0 && b.x < l.x1) hit('lane', l, Math.abs(b.vy), b);
  }
  for (const r of table.ramps) {
    const mo = r.mouth;
    if (!mo) continue;
    if (py > mo.y && b.y <= mo.y && b.x > mo.x0 && b.x < mo.x1) hit('ramp', r, -b.vy, b);
  }
  for (const q of table.letters) {
    const inside = Math.abs(b.x - q.x) < 3.5 && Math.abs(b.y - q.y) < 3.5;
    if (inside && b.letter !== q.id) {
      b.letter = q.id;
      hit('letter', q, 0, b);
    } else if (!inside && b.letter === q.id) b.letter = null;
  }
  for (const r of table.rollovers) {
    const inside = Math.hypot(b.x - r.x, b.y - r.y) < 4;
    if (inside && b.rollover !== r.id) {
      b.rollover = r.id;
      hit('rollover', r, 0, b);
    } else if (!inside && b.rollover === r.id) b.rollover = null;
  }
  return true;
}

/** The captive ball rolls back down its chamber; reaching the top scores. */
export function stepCaptive(cb, dt, gravity, hit) {
  cb.vy += gravity * 0.6 * dt;
  cb.y += cb.vy * dt;
  if (cb.y < CAPTIVE.top) {
    cb.y = CAPTIVE.top;
    if (cb.vy < -60) hit('captiveTop', cb, -cb.vy, null);
    cb.vy = -cb.vy * 0.3;
  }
  if (cb.y > CAPTIVE.rest) {
    cb.y = CAPTIVE.rest;
    cb.vy = cb.vy > 30 ? -cb.vy * 0.2 : 0;
  }
}

/** Balls bounce off each other (multiball). */
export function collideBalls(balls) {
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      if (a.held || b.held) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const rr = BALL_R * 2;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const push = (rr - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = -rel * 0.95;
        a.vx -= nx * imp;
        a.vy -= ny * imp;
        b.vx += nx * imp;
        b.vy += ny * imp;
      }
    }
  }
}
