// Ball physics: gravity, walls, bumpers, flippers and ball-on-ball, stepped
// in small fixed substeps so a fast ball never skips through a wall. No DOM.
import { BALL_R, FLIP } from './table.js';

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
      // Only blocks from its upper-left side.
      const sx = s.bx - s.ax, sy = s.by - s.ay;
      let gx = sy, gy = -sx;
      if (gx > 0) {
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

  // Flippers.
  for (const f of table.flippers) {
    const tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
    const q = closestOnSeg(b.x, b.y, f.px, f.py, tx, ty);
    const rad = f.r0 + (f.r1 - f.r0) * q.t;
    const rr = BALL_R + rad;
    const dx = b.x - q.x, dy = b.y - q.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    b.x = q.x + nx * rr;
    b.y = q.y + ny * rr;
    // The flipper's surface moves: omega x r.
    const rx = q.x - f.px, ry = q.y - f.py;
    const svx = -f.omega * ry, svy = f.omega * rx;
    const vIn = bounce(b, nx, ny, FLIP.e, svx, svy, 0.01);
    if (vIn > 60) hit('flipper', f, vIn, b);
  }

  // Sensors: lines the ball crosses.
  const sp2 = table.spinner;
  if ((py - sp2.y) * (b.y - sp2.y) <= 0 && py !== b.y && b.x > sp2.x0 && b.x < sp2.x1) hit('spinner', sp2, Math.abs(b.vy), b);
  for (const l of table.lanes) {
    if (py > l.y && b.y <= l.y && b.x > l.x0 && b.x < l.x1) hit('lane', l, Math.abs(b.vy), b);
  }
  return true;
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
