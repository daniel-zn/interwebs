// Everything on the canvas. The canvas is small (roughly 220-640 px wide) and
// scaled up by whole device pixels, so every game pixel is a crisp square.
import { drawText, measureText } from './font.js';
import { mulberry32 } from './rng.js';
import { ANCHOR, CALLS, COMBO_TIME, ORBIT_PAD, SKIM_Y, WIN, comboMult } from './sim.js';
import { KITE_STEPS, RIG, buildSprites } from './sprites.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Particle colours by age (0 = newborn), picked from fixed lists so nothing is allocated per frame.
const SPARK = ['#ffffff', '#fff6c0', '#ffe08a', '#ffb050', '#ff7a3a'];
const DUST = ['#e6d4bc', '#c9b49a', '#8a7766', '#5a4a44'];
const AURORA = ['#ffffff', '#c8fff0', '#7ff4ff', '#b08aff', '#6a4ad0'];
const CONFETTI = ['#ff5a8a', '#ffd23f', '#8fffc0', '#7ff4ff', '#b08aff'];
const PALETTES = [SPARK, DUST, AURORA, CONFETTI];
const TRAIL = ['#fff6c0', '#ffe08a', '#ffc05a', '#ff9b4a', '#e0703a', '#a04a3a', '#5a3040'];
const RAINBOW = ['#ff5a8a', '#ffd23f', '#8fffc0', '#7ff4ff', '#b08aff'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

const MAX_PARTICLES = 500;
const TRAIL_LEN = 170;

/** Crisp 1px line (Bresenham). The fill colour must already be set. */
function pxLine(ctx, x0, y0, x1, y1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 2000; n++) {
    ctx.fillRect(x0, y0, 1, 1);
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

/** A line drawn with a square brush, for the astronaut's arms. */
function brushLine(ctx, x0, y0, x1, y1, size, color) {
  ctx.fillStyle = color;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const o = Math.floor(size / 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(Math.round(lerp(x0, x1, t)) - o, Math.round(lerp(y0, y1, t)) - o, size, size);
  }
}

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, cell, s) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = x / cell - gx, fy = y / cell - gy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, s), b = hash(gx + 1, gy, s), c = hash(gx, gy + 1, s), d = hash(gx + 1, gy + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

const SUN_RAMP = [
  [0.95, '#fffbe8'], [0.86, '#fff0b0'], [0.76, '#ffd870'], [0.64, '#ffb040'], [0.52, '#ff8a2a'], [-1, '#e0561e'],
];
function sunColor(i) {
  for (const [min, c] of SUN_RAMP) if (i >= min) return c;
  return '#e0561e';
}

/** The sun's disc: limb darkening, granulation and a few spots, dithered. */
function makeSunTexture(R) {
  const size = R * 2 + 1;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const x = c.getContext('2d');
  const rng = mulberry32(7);
  const spots = [];
  for (let i = 0; i < 5; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * 0.8;
    spots.push([Math.cos(a) * d * R, Math.sin(a) * d * R, (0.02 + rng() * 0.035) * R]);
  }
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i - R, dy = j - R, r = Math.hypot(dx, dy) / R;
      if (r > 1) continue;
      let I = 1 - 0.55 * (1 - Math.sqrt(1 - r * r));
      I += (valueNoise(i, j, 3, 1) - 0.5) * 0.12 + (valueNoise(i, j, 11, 2) - 0.5) * 0.08;
      for (const [sx, sy, sr] of spots) {
        const d = Math.hypot(dx - sx, dy - sy);
        if (d < sr) I -= 0.35;
        else if (d < sr * 1.8) I -= 0.12;
      }
      I += BAYER[(j & 3) * 4 + (i & 3)] * 0.08;
      x.fillStyle = sunColor(I);
      x.fillRect(i, j, 1, 1);
    }
  }
  return c;
}

/** The glow around the sun, in dithered bands so it stays pixelly. */
function makeGlow(R) {
  const G = Math.round(R * 2), size = G * 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const x = c.getContext('2d');
  const bands = [[1.06, '#ffb040', 0.55], [1.16, '#ff8a3a', 0.4], [1.32, '#e0603a', 0.28], [1.55, '#b03a48', 0.18], [1.8, '#6a2050', 0.12], [2, '#2a1030', 0.08]];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const r = Math.hypot(i - G, j - G) / R;
      if (r < 0.98 || r > 2) continue;
      let k = 0;
      while (k < bands.length - 1 && r > bands[k][0]) k++;
      // Dither the boundary into the next band.
      const prev = k > 0 ? bands[k - 1][0] : 0.98;
      const f = (r - prev) / (bands[k][0] - prev);
      if (k < bands.length - 1 && f + BAYER[(j & 3) * 4 + (i & 3)] > 0.85) k++;
      x.globalAlpha = bands[k][2];
      x.fillStyle = bands[k][1];
      x.fillRect(i, j, 1, 1);
    }
  }
  return c;
}

export class Renderer {
  constructor(seed) {
    this.sprites = buildSprites();
    this.rng = mulberry32((seed ^ 0x51ed) >>> 0);
    this.t = 0;
    this.W = 0;
    this.H = 0;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.popups = [];
    this.textCache = new Map();
    this.p = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.p.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, pal: 0, g: 0, size: 1 });
    this.pNext = 0;
    this.trail = [];
    for (let i = 0; i < TRAIL_LEN; i++) this.trail.push({ x: 0, y: 0, on: false });
    this.trailHead = 0;
    this.streaks = [];
    for (let i = 0; i < 90; i++) this.streaks.push({ x: this.rng(), y: this.rng(), len: 0.3 + this.rng() * 0.7, spd: 0.6 + this.rng() * 0.8, c: (this.rng() * 4) | 0 });
    // The astronaut: pose is 'rest', 'sip' or 'cheer'; the beer hand eases towards it.
    this.pose = 'rest';
    this.poseT = 0;
    this.nextSip = 4;
    this.beer = { x: RIG.beerRest[0], y: RIG.beerRest[1] };
    this.yank = 0;
    this.comboShown = null;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    // Fit the flying field (world 0..178 wide, 0..100 tall) above a strip of ground.
    const k = Math.min(W / 178, (H - 26) / 100);
    this.k = k;
    this.gy = Math.round(H - Math.max(26, (H - 100 * k) * 0.2));
    // The astronaut's corner is the hero shot: draw it at 2x when there's room.
    this.ps = H >= 150 && W >= 300 ? 2 : 1;
    this.narrow = W < 290;
    // Centre the field, but keep the parasol and cooler on screen.
    this.ox = Math.round(Math.max((W - 178 * k) / 2, 29 * this.ps + 2 - ANCHOR.x * k));
    this.yh = this.gy - Math.round(3 + k * 2);
    this.R = Math.round(Math.max(W, H) * 0.42);
    const rng = mulberry32(99);
    this.stars = [];
    const n = Math.round((W * H) / 380);
    for (let i = 0; i < n; i++) this.stars.push({ x: (rng() * W) | 0, y: (rng() * this.yh) | 0, b: rng() });
    this.sunTex = makeSunTexture(this.R);
    this.glow = makeGlow(this.R);
    this.ground = this.makeGround();
  }

  sx(x) {
    return this.ox + x * this.k;
  }
  sy(y) {
    return this.gy - y * this.k;
  }
  /** Canvas pixel -> world units, for pointer steering. */
  toWorld(px, py) {
    return { x: (px - this.ox) / this.k, y: (this.gy - py) / this.k };
  }

  makeGround() {
    const { W, H, yh, gy } = this;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H - yh + 2;
    const x = c.getContext('2d');
    const rng = mulberry32(31);
    // The far plain, lighter towards the horizon, then the near regolith.
    for (let j = 0; j < c.height; j++) {
      const y = yh + j;
      for (let i = 0; i < W; i++) {
        const d = BAYER[(j & 3) * 4 + (i & 3)];
        let col;
        if (y < gy) col = (y - yh) / (gy - yh) + d * 0.6 < 0.5 ? '#7a6658' : '#66554c';
        else {
          const depth = (y - gy) / Math.max(1, H - gy);
          const n = valueNoise(i, j, 5, 3) - 0.5 + d * 0.5;
          col = n > 0.25 ? '#6e5c52' : n < -0.3 ? '#3e322f' : depth + d * 0.3 > 0.55 ? '#4a3c38' : '#584842';
        }
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    }
    // Sunlit rim along the horizon and the near edge.
    x.fillStyle = '#c9b49a';
    x.fillRect(0, 0, W, 1);
    x.fillStyle = '#9a8472';
    x.fillRect(0, gy - yh, W, 1);
    // Distant boulders on the horizon, lit from the left.
    for (let i = 0; i < W / 14; i++) {
      const bx = (rng() * W) | 0, bw = 2 + ((rng() * 6) | 0), bh = 1 + ((rng() * 3) | 0);
      x.fillStyle = '#4a3c38';
      x.fillRect(bx, -bh + 1, bw, bh);
      x.fillStyle = '#c9b49a';
      x.fillRect(bx, -bh + 1, 1, bh);
    }
    // Craters and pebbles on the near ground, with long shadows (the sun is low, on the left).
    const nearTop = gy - yh + 3;
    const nearH = c.height - nearTop;
    if (nearH > 4) {
      for (let i = 0; i < W / 40; i++) {
        const cx = rng() * W, cy = nearTop + 2 + rng() * (nearH - 4), rw = 6 + rng() * 14, rh = Math.max(2, rw * 0.25);
        for (let j = -rh; j <= rh; j++) {
          for (let ii = -rw; ii <= rw; ii++) {
            const r = (ii / rw) ** 2 + (j / rh) ** 2;
            if (r > 1) continue;
            x.fillStyle = r > 0.6 ? (ii < 0 ? '#2e2624' : '#8a7766') : ii < -rw * 0.2 ? '#3e322f' : '#584842';
            x.fillRect((cx + ii) | 0, (cy + j) | 0, 1, 1);
          }
        }
      }
      for (let i = 0; i < W / 5; i++) {
        const px = (rng() * W) | 0, py = (nearTop + rng() * nearH) | 0, s = 1 + ((rng() * 2) | 0);
        x.fillStyle = '#2e2624';
        x.fillRect(px + s, py + s - 1, 2 + ((rng() * 7) | 0), 1);
        x.fillStyle = '#9a8472';
        x.fillRect(px, py, s, s);
      }
    }
    return c;
  }

  // ------------------------------------------------------------------ helpers
  text(ctx, s, x, y, color, scale = 1) {
    const key = `${s}|${color}|${scale}`;
    let c = this.textCache.get(key);
    if (!c) {
      if (this.textCache.size > 300) this.textCache.clear();
      c = document.createElement('canvas');
      c.width = Math.max(1, measureText(s, scale));
      c.height = 5 * scale;
      drawText(c.getContext('2d'), s, 0, 0, color, scale);
      this.textCache.set(key, c);
    }
    ctx.drawImage(c, Math.round(x), Math.round(y));
    return c.width;
  }

  /** Text with a 1px dark drop shadow; align 'l', 'c' or 'r'. */
  label(ctx, s, x, y, color, scale = 1, align = 'l') {
    const w = measureText(s, scale);
    const lx = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x;
    this.text(ctx, s, lx + scale, y + scale, '#07081a', scale);
    this.text(ctx, s, lx, y, color, scale);
    return w;
  }

  /** A label on a dark plate, readable against the sun. */
  plate(ctx, s, x, y, color, scale = 1, align = 'l') {
    const w = measureText(s, scale);
    const lx = Math.round(align === 'c' ? x - w / 2 : align === 'r' ? x - w : x);
    ctx.fillStyle = 'rgba(7,8,26,0.72)';
    ctx.fillRect(lx - 2, Math.round(y) - 2, w + 4, 5 * scale + 4);
    this.text(ctx, s, lx, y, color, scale);
    return w;
  }

  emit(x, y, vx, vy, life, pal, g = 0, size = 1) {
    const p = this.p[this.pNext];
    this.pNext = (this.pNext + 1) % MAX_PARTICLES;
    p.on = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = 0;
    p.max = life;
    p.pal = pal;
    p.g = g;
    p.size = size;
  }

  burst(x, y, n, pal, speed, life, g = 0, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU, s = speed * (0.3 + this.rng() * 0.7);
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + this.rng() * 0.5), pal, g, size);
    }
  }

  popup(text, x, y, color, big = false) {
    this.popups.push({ text, x, y, color, t: 0, big });
    if (this.popups.length > 8) this.popups.shift();
  }

  setPose(pose, time) {
    this.pose = pose;
    this.poseT = time;
  }

  clearTrail() {
    for (const p of this.trail) p.on = false;
  }

  /** Reacts to a sim event with particles, shake, pop-ups and the astronaut. */
  onEvent(e, run, rm) {
    const kx = this.sx(run.k.x), ky = this.sy(run.k.y);
    const n = rm ? 0.4 : 1;
    switch (e.type) {
      case 'trick': {
        const x = this.sx(e.x), y = this.sy(e.y);
        this.burst(x, y, Math.round(16 * n), e.kind === 'ring' || e.kind === 'chain' ? 2 : 3, 50, 0.7);
        this.popup(`+${e.pts} ${e.name}`, x, y - 12, e.flare ? '#ff9bf0' : '#ffe08a');
        break;
      }
      case 'bank':
        if (e.total >= 1500) this.setPose('cheer', 1.6);
        this.popup(`${e.total} BANKED`, this.W / 2, this.narrow ? 100 : 44, '#8fffc0', true);
        break;
      case 'callDone':
        this.setPose('cheer', 1.8);
        this.popup(`RADIO +${e.pts}`, kx, ky - 22, '#7ff4ff');
        break;
      case 'drop':
        if (e.pts) this.popup('COMBO LOST', this.W / 2, this.narrow ? 100 : 44, '#ff6b4a', true);
        break;
      case 'crash':
        this.burst(kx, ky, Math.round(40 * n), 1, 50, 1.1, 60, 2);
        this.shake = rm ? 0 : 4;
        this.popup(e.nearChair ? 'WATCH THE BEER!' : 'CRASH!', kx, ky - 16, '#ff6b4a');
        this.setPose('sip', 2.2);
        break;
      case 'scrape':
        this.burst(kx, ky, Math.round(20 * n), 1, 40, 0.8, 60);
        this.popup('SCRAPE!', kx, ky - 16, '#ff9b6a');
        break;
      case 'bonk':
        this.burst(kx, ky, Math.round(24 * n), 0, 60, 0.6);
        this.shake = rm ? 0 : 3;
        this.popup('BONK!', kx, ky - 14, '#ff6b4a');
        break;
      case 'relaunch':
        this.yank = 0.35;
        this.burst(kx, ky, Math.round(14 * n), 1, 30, 0.8, 30);
        break;
      case 'tug':
        this.yank = 0.3;
        break;
      case 'weather':
        if (e.kind === 'flare') {
          this.flash = rm ? 0.1 : 0.35;
          this.flashColor = '#fff0d0';
        }
        break;
      case 'end':
        this.setPose('cheer', 3);
        break;
    }
  }

  // ------------------------------------------------------------------ frame
  draw(ctx, dt, o) {
    const { run, rm } = o;
    this.t += dt;
    const { W, H } = this;
    const title = o.mode === 'title';
    const p = title ? 0.08 : clamp01(run.t / run.session);

    ctx.save();
    if (this.shake > 0 && !rm) {
      ctx.translate(Math.round((this.rng() - 0.5) * this.shake * 2), Math.round((this.rng() - 0.5) * this.shake * 2));
      this.shake = Math.max(0, this.shake - dt * 20);
    }
    this.drawSky(ctx, run, p, rm);
    this.drawStreaks(ctx, dt, run, rm);
    ctx.drawImage(this.ground, 0, this.yh);
    // The sun sets: the ground loses its light.
    if (p > 0.55) {
      ctx.fillStyle = `rgba(7,8,26,${((p - 0.55) / 0.45) * 0.6})`;
      ctx.fillRect(0, this.yh, W, H - this.yh);
    }
    this.drawWindow(ctx);
    this.drawRings(ctx, run);
    this.drawObjects(ctx, run, dt);
    this.drawProps(ctx, p);
    this.updateTrail(run);
    this.drawTrail(ctx, run);
    this.drawAstronautAndLines(ctx, dt, run, p);
    this.drawKite(ctx, run);
    this.drawParticles(ctx, dt);
    this.drawPopups(ctx, dt);
    if (this.flash > 0) {
      ctx.globalAlpha = clamp01(this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - dt * 1.5);
    }
    ctx.restore();
    if (title) this.drawTitle(ctx, o);
    else this.drawHud(ctx, run, o);
  }

  drawSky(ctx, run, p, rm) {
    const { W, yh, R } = this;
    ctx.fillStyle = '#05030f';
    ctx.fillRect(0, 0, W, this.H);
    const cx = Math.round(this.sx(-4) - R * 0.5);
    const cy = Math.round(yh - R * 0.3 + R * 1.4 * Math.pow(p, 1.5));
    this.sun = { x: cx, y: cy };
    const g2 = R * R * 4;
    ctx.fillStyle = '#aeb8e2';
    for (const s of this.stars) {
      if ((s.x - cx) ** 2 + (s.y - cy) ** 2 < g2) continue;
      const tw = rm ? 1 : 0.6 + 0.4 * Math.sin(this.t * 2 + s.b * 40);
      if (s.b * tw < 0.35) continue;
      ctx.globalAlpha = s.b > 0.85 ? 1 : 0.5;
      ctx.fillRect(s.x, s.y, 1, 1);
    }
    ctx.globalAlpha = 1;
    const G = this.glow.width / 2;
    // Clip everything sunny to above the horizon; the ground is drawn over it anyway.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, yh + 1);
    ctx.clip();
    ctx.drawImage(this.glow, cx - G, cy - G);
    // Prominences dancing on the limb.
    const w = run.weather;
    for (let i = 0; i < 6; i++) {
      const base = -1.35 + i * 0.42, h = R * (0.06 + 0.05 * Math.sin(this.t * (rm ? 0.2 : 0.7) + i * 1.7)), wd = 0.1 + (i % 3) * 0.04;
      ctx.fillStyle = i % 2 ? '#ff6b3a' : '#ffb050';
      for (let s = 0; s <= 24; s++) {
        const f = s / 24, a = base + (f - 0.5) * wd, r = R + h * Math.sin(Math.PI * f);
        ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 2);
      }
    }
    ctx.drawImage(this.sunTex, cx - R, cy - R);
    // Boiling granules.
    const boil = rm ? 10 : 50;
    for (let i = 0; i < boil; i++) {
      const a = this.rng() * TAU, r = Math.sqrt(this.rng()) * R * 0.92;
      ctx.fillStyle = this.rng() < 0.5 ? '#fffbe8' : '#ffd870';
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 1);
    }
    // A flare building on the limb, then the eruption.
    if (w && w.kind === 'flare') {
      const a = -0.35, fx = cx + Math.cos(a) * R, fy = cy + Math.sin(a) * R;
      const grow = w.phase === 'warn' ? 1 - w.t / 3 : 1;
      const blink = w.phase === 'warn' && Math.floor(this.t * 6) % 2 === 0;
      const r = 3 + grow * 7;
      ctx.fillStyle = blink ? '#ffffff' : '#ff9bf0';
      ctx.beginPath();
      ctx.arc(Math.round(fx), Math.round(fy), r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(fx - r / 2), Math.round(fy - r / 2), Math.round(r), Math.round(r));
    }
    ctx.restore();
  }

  drawStreaks(ctx, dt, run, rm) {
    const { W, yh } = this;
    const w = run.weather, on = w && w.phase === 'on' ? w.kind : null;
    const wind = run.wind;
    const count = on === 'lull' ? 30 : on === 'flare' ? 90 : 60;
    const cols = on === 'flare' ? ['#ffffff', '#ff9bf0', '#fff0b0', '#ffc8f0'] : ['#fff0b0', '#ffc05a', '#ffe08a', '#ff9b4a'];
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      s.x += (s.spd * wind * (rm ? 0.5 : 1) * dt * 150) / W;
      if (s.x > 1.1) {
        s.x = -0.1 - this.rng() * 0.2;
        s.y = this.rng();
      }
      if (i >= count) continue;
      const len = Math.round(s.len * (rm ? 4 : 6 + wind * 10));
      const x = Math.round(s.x * W), y = Math.round(s.y * (yh - 2));
      ctx.globalAlpha = 0.35 + s.spd * 0.35;
      ctx.fillStyle = cols[s.c];
      ctx.fillRect(x, y, len, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** The edge of the wind window, as a faint dotted arc. */
  drawWindow(ctx) {
    ctx.fillStyle = 'rgba(255,224,138,0.28)';
    const steps = Math.round((WIN.rx + WIN.ry) * this.k * 0.55);
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      const x = this.sx(WIN.cx + Math.cos(a) * WIN.rx), y = this.sy(Math.sin(a) * WIN.ry);
      if (y < this.yh - 2) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  drawRings(ctx, run) {
    const k = this.k;
    for (const set of run.rings) {
      const fading = set.ttl < 3 && Math.floor(this.t * 8) % 2 === 0;
      if (fading) continue;
      for (const r of set.rings) {
        if (r.hit) continue;
        const x = Math.round(this.sx(r.x)), y = Math.round(this.sy(r.y)), rad = Math.max(4, Math.round(4.6 * k));
        const steps = Math.round(rad * 7);
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * TAU;
          ctx.fillStyle = AURORA[(i + Math.floor(this.t * 12)) % 4 === 0 ? 0 : 2 + ((i >> 2) % 2)];
          ctx.fillRect(Math.round(x + Math.cos(a) * rad), Math.round(y + Math.sin(a) * rad * 1.25), 1, 1);
        }
      }
    }
  }

  drawObjects(ctx, run, dt) {
    const k = this.k, sp = this.sprites;
    const kite = run.k;
    for (const o of run.objects) {
      const x = Math.round(this.sx(o.x)), y = Math.round(this.sy(o.y));
      const img = sp[o.kind];
      if (o.kind === 'ice') {
        // A little comet tail, pointing away from the sun.
        for (let i = 1; i < 12; i++) {
          ctx.fillStyle = i < 4 ? '#c8fff0' : i < 8 ? '#7ff4ff' : '#3f6fd0';
          ctx.globalAlpha = 1 - i / 12;
          ctx.fillRect(x + 2 + i * 2, y - 1 + Math.round(Math.sin(this.t * 6 + i) * 0.6), 2, 1 + (i < 6 ? 1 : 0));
        }
        ctx.globalAlpha = 1;
      }
      if (o.hitT > 0 && Math.floor(this.t * 20) % 2 === 0) ctx.globalAlpha = 0.4;
      ctx.drawImage(img, x - (img.width >> 1), y - (img.height >> 1));
      ctx.globalAlpha = 1;
      if (o.kind === 'sat' && Math.floor(this.t * 2 + o.ph) % 2 === 0) {
        ctx.fillStyle = '#ff6b4a';
        ctx.fillRect(x, y - 4, 1, 1);
      }
      // The orbit ring: dotted while the kite is in range, lit up as it goes round.
      const dist = Math.hypot(kite.x - o.x, kite.y - o.y);
      if (dist < o.r + ORBIT_PAD && kite.state === 'fly') {
        const rad = (o.r + ORBIT_PAD) * k;
        const steps = Math.round(rad * 2.2);
        const a0 = Math.atan2(-(kite.y - o.y), kite.x - o.x);
        const frac = Math.min(1, Math.abs(o.wind) / TAU);
        const dir = o.wind < 0 ? 1 : -1;
        for (let i = 0; i < steps; i++) {
          const f = i / steps;
          const lit = f <= frac;
          if (!lit && i % 3) continue;
          const a = a0 + dir * f * TAU;
          ctx.fillStyle = lit ? '#8fffc0' : 'rgba(143,255,192,0.35)';
          ctx.fillRect(Math.round(x + Math.cos(a) * rad), Math.round(y + Math.sin(a) * rad), lit ? 2 : 1, lit ? 2 : 1);
        }
      }
    }
  }

  /** The parasol, cooler and radio, with long shadows. */
  drawProps(ctx, p) {
    const sp = this.sprites, gy = this.gy, ps = this.ps;
    const ax = Math.round(this.sx(ANCHOR.x));
    this.chairX = ax - 12 * ps;
    this.chairY = gy - (RIG.h - 1) * ps;
    const shadowLen = 1.4 + p * 5;
    const shadow = (img, x) => {
      const h = img.height * ps;
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.setTransform(ps, 0, -shadowLen * 0.28 * ps, 0.28 * ps, x + h * shadowLen * 0.28, gy - h * 0.28 + 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    const put = (img, x, y) => ctx.drawImage(img, x, y, img.width * ps, img.height * ps);
    const parX = this.chairX - 17 * ps, parY = gy - (sp.parasol.height - 1) * ps;
    const coolX = this.chairX - 15 * ps, coolY = gy - (sp.cooler.height - 1) * ps;
    shadow(sp.shadows.parasol, parX);
    shadow(sp.shadows.lounger, this.chairX);
    shadow(sp.shadows.cooler, coolX);
    put(sp.parasol, parX, parY);
    put(sp.cooler, coolX, coolY);
    const radioY = coolY - (sp.radio.height - 1) * ps;
    this.propsTop = parY;
    put(sp.radio, coolX + 2 * ps, radioY);
    this.radioAt = { x: coolX + 7 * ps, y: radioY - 2 };
  }

  updateTrail(run) {
    const k = run.k;
    const tr = this.trail[this.trailHead];
    tr.x = k.x;
    tr.y = k.y;
    tr.on = k.state !== 'crashed';
    this.trailHead = (this.trailHead + 1) % TRAIL_LEN;
  }

  drawTrail(ctx, run) {
    const combo = run.combo.count;
    for (let i = 1; i < TRAIL_LEN; i++) {
      const a = this.trail[(this.trailHead + i - 1) % TRAIL_LEN];
      const b = this.trail[(this.trailHead + i) % TRAIL_LEN];
      if (!a.on || !b.on) continue;
      const age = 1 - i / TRAIL_LEN;
      if (combo) ctx.fillStyle = RAINBOW[(Math.floor(i / 6) + Math.floor(this.t * 10)) % RAINBOW.length];
      else ctx.fillStyle = TRAIL[Math.min(TRAIL.length - 1, Math.floor(age * TRAIL.length))];
      ctx.globalAlpha = combo ? 0.35 + 0.65 * (1 - age) : 0.25 + 0.6 * (1 - age);
      pxLine(ctx, this.sx(a.x), this.sy(a.y), this.sx(b.x), this.sy(b.y));
    }
    ctx.globalAlpha = 1;
  }

  drawAstronautAndLines(ctx, dt, run, p) {
    const sp = this.sprites, k = run.k;
    const cx = this.chairX, cy = this.chairY;
    // Pose timing: a sip every so often, cheers when things go well.
    if (this.poseT > 0) {
      this.poseT -= dt;
      if (this.poseT <= 0) this.pose = 'rest';
    } else {
      this.nextSip -= dt;
      if (this.nextSip <= 0) {
        this.setPose('sip', 1.5);
        this.nextSip = 7 + this.rng() * 6;
      }
    }
    const targets = { rest: RIG.beerRest, sip: [14, 5], cheer: [14, -3] };
    const tgt = targets[this.pose];
    const e = 1 - Math.exp(-dt * 9);
    this.beer.x += (tgt[0] - this.beer.x) * e;
    this.beer.y += (tgt[1] - this.beer.y) * e;
    this.yank = Math.max(0, this.yank - dt);

    const ps = this.ps;
    ctx.drawImage(sp.lounger, cx, cy, sp.lounger.width * ps, sp.lounger.height * ps);
    const shx = cx + RIG.shoulder[0] * ps, shy = cy + RIG.shoulder[1] * ps;
    // Kite arm: reaches towards the kite, snaps back on a tug.
    const kx = this.sx(k.x), ky = this.sy(k.y);
    let a = Math.atan2(ky - shy, kx - shx);
    a = Math.max(-1.35, Math.min(0.2, a));
    const reach = (this.yank > 0 ? 4 : 7) * ps;
    const hx = Math.round(shx + Math.cos(a) * reach), hy = Math.round(shy + Math.sin(a) * reach);
    brushLine(ctx, shx, shy, hx, hy, 4 * ps, '#07081a');
    brushLine(ctx, shx, shy, hx, hy, 2 * ps, '#eef1f6');
    // The control handle, across the lines.
    const px = -Math.sin(a), py = Math.cos(a);
    const b1 = { x: hx + px * 2.5 * ps, y: hy + py * 2.5 * ps }, b2 = { x: hx - px * 2.5 * ps, y: hy - py * 2.5 * ps };
    brushLine(ctx, b1.x, b1.y, b2.x, b2.y, ps, '#07081a');
    ctx.fillStyle = '#ff5a8a';
    ctx.fillRect(Math.round(b1.x), Math.round(b1.y), ps, ps);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(Math.round(b2.x), Math.round(b2.y), ps, ps);
    this.drawLines(ctx, b1, b2, kx, ky, run);

    // Beer arm, can and (when sipping) the straw into the helmet.
    const bx = Math.round(cx + this.beer.x * ps), by = Math.round(cy + this.beer.y * ps);
    brushLine(ctx, shx - ps, shy + ps, bx - ps, by + 2 * ps, 4 * ps, '#07081a');
    brushLine(ctx, shx - ps, shy + ps, bx - ps, by + 2 * ps, 2 * ps, '#dfe4f0');
    ctx.drawImage(sp.can, bx - ps, by - 2 * ps, sp.can.width * ps, sp.can.height * ps);
    if (this.pose === 'sip' && Math.abs(this.beer.y - 5) < 1.5) {
      brushLine(ctx, bx + ps, by - 3 * ps, cx + (RIG.visor[0] + 1) * ps, cy + RIG.visor[1] * ps, ps, '#ffe08a');
    }
    if (Math.abs(run.twist) >= 1.5) {
      const tw = Math.round(Math.abs(run.twist));
      this.plate(ctx, `TWIST X${tw}`, cx + 6 * ps, cy - 10, tw >= 4 ? '#ff6b4a' : '#ffe08a', 1);
    }
  }

  /** The two kite lines, braided by any twists and sagging when the wind is weak. */
  drawLines(ctx, b1, b2, kx, ky, run) {
    const k = run.k;
    const len = Math.hypot(kx - b1.x, ky - b1.y);
    const n = Math.max(2, Math.ceil(len));
    const nx = -(ky - b1.y) / len, ny = (kx - b1.x) / len;
    const sag = k.state === 'crashed' ? 3 : (1 - clamp01(k.s / 30)) * 7;
    const tw = Math.abs(run.twist);
    const cols = ['#e8ecf6', '#9aa6c8'];
    for (let line = 0; line < 2; line++) {
      ctx.fillStyle = cols[line];
      ctx.globalAlpha = 0.85;
      const side = line ? -1 : 1;
      const start = line ? b2 : b1;
      let lx = -1, ly = -1;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const braid = Math.cos(Math.PI * tw * Math.min(1, u / 0.45));
        const off = side * lerp(0, 1.2, Math.min(1, u * 6)) * braid;
        const x = Math.round(lerp(start.x, kx, u) + nx * off);
        const y = Math.round(lerp(start.y, ky, u) + ny * off + sag * Math.sin(Math.PI * u));
        if (x !== lx || y !== ly) ctx.fillRect(x, y, 1, 1);
        lx = x;
        ly = y;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawKite(ctx, run) {
    const k = run.k, sp = this.sprites;
    const x = Math.round(this.sx(k.x)), y = Math.round(this.sy(k.y));
    // Streamer tail, following the path the kite just flew.
    for (let i = 1; i <= 9; i++) {
      const t = this.trail[(this.trailHead - 1 - i * 2 + TRAIL_LEN * 2) % TRAIL_LEN];
      if (!t.on) break;
      ctx.fillStyle = i % 2 ? '#ff5a8a' : '#ffd23f';
      ctx.fillRect(Math.round(this.sx(t.x)) - 1, Math.round(this.sy(t.y)) - 1, i < 5 ? 2 : 1, i < 5 ? 2 : 1);
    }
    let th = k.th;
    if (k.state === 'crashed') th = Math.PI * 0.08; // lying in the dust
    const f = ((Math.round((th / TAU) * KITE_STEPS) % KITE_STEPS) + KITE_STEPS) % KITE_STEPS;
    const h = sp.kiteHalf;
    ctx.drawImage(sp.kite[f], x - h, y - h);
    // Skimming: kick up a dust plume.
    if (k.state === 'fly' && k.y < SKIM_Y && this.rng() < 0.7) {
      this.emit(x - 2, this.gy - 1, -10 - this.rng() * 20, -8 - this.rng() * 20, 0.8, 1, 30, this.rng() < 0.3 ? 2 : 1);
    }
  }

  drawParticles(ctx, dt) {
    for (const p of this.p) {
      if (!p.on) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.on = false;
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const pal = PALETTES[p.pal];
      ctx.fillStyle = pal[Math.min(pal.length - 1, Math.floor((p.life / p.max) * pal.length))];
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }

  drawPopups(ctx, dt) {
    for (const p of this.popups) {
      p.t += dt;
      const rise = p.big ? 0 : p.t * 14;
      if (p.t > 1.3) continue;
      if (p.t > 1 && Math.floor(p.t * 16) % 2) continue;
      const half = measureText(p.text) / 2 + 2;
      const x = Math.max(half, Math.min(this.W - half, p.x));
      this.label(ctx, p.text, x, p.y - rise, p.color, 1, 'c');
    }
    this.popups = this.popups.filter((p) => p.t <= 1.3);
  }

  // ------------------------------------------------------------------ HUD
  drawHud(ctx, run, o) {
    const { W } = this;
    const pad = 4;
    // Score.
    this.plate(ctx, 'SCORE', pad + 2, pad + 2, '#aeb8e2', 1);
    this.plate(ctx, String(run.score), pad + 2, pad + 10, '#ffffff', 2);
    // Wind gauge.
    const wy = pad + 24;
    ctx.fillStyle = 'rgba(7,8,26,0.72)';
    ctx.fillRect(pad, wy - 2, 58, 9);
    this.text(ctx, 'WIND', pad + 2, wy, '#aeb8e2');
    const w = run.weather, on = w && w.phase === 'on' ? w.kind : null;
    const segs = 8, filled = Math.round(clamp01(run.wind / 1.5) * segs);
    for (let i = 0; i < segs; i++) {
      ctx.fillStyle = i < filled ? (on === 'flare' ? '#ff9bf0' : on === 'lull' ? '#8890a8' : '#ffd23f') : '#2a2d55';
      ctx.fillRect(pad + 28 + i * 3, wy, 2, 5);
    }
    let ly = wy + 10;
    if (w) {
      const blink = Math.floor(this.t * 4) % 2 === 0;
      let s = '', col = '#ff9bf0';
      if (w.phase === 'warn') {
        s = w.kind === 'flare' ? `FLARE IN ${Math.ceil(w.t)}` : `LULL IN ${Math.ceil(w.t)}`;
        col = w.kind === 'flare' ? '#ff9bf0' : '#aeb8e2';
        if (!blink && !o.rm) s = '';
      } else s = w.kind === 'flare' ? 'SOLAR FLARE! TRICKS X2' : 'LULL: FLY LOW AND CENTRAL';
      if (w.kind === 'lull') col = '#aeb8e2';
      if (s) this.plate(ctx, s, pad + 2, ly, col, 1);
      ly += 10;
    }
    // Radio request from the kite club.
    if (run.call) {
      const c = run.call;
      const text = `RADIO: ${CALLS[c.kind].text}!`;
      const tw = measureText(text) + 4;
      // Wide screens: the call hangs over the radio, clear of the combo readout.
      if (!this.narrow && this.propsTop) ly = this.propsTop - 16;
      ctx.fillStyle = 'rgba(7,8,26,0.8)';
      ctx.fillRect(pad, ly - 2, tw + 2, 12);
      this.text(ctx, text, pad + 2, ly, '#7ff4ff');
      ctx.fillStyle = '#2a2d55';
      ctx.fillRect(pad + 2, ly + 7, tw - 2, 1);
      ctx.fillStyle = c.t < 3 ? '#ff6b4a' : '#7ff4ff';
      ctx.fillRect(pad + 2, ly + 7, Math.round((tw - 2) * (c.t / c.max)), 1);
      if (this.radioAt && Math.floor(this.t * 3) % 2 === 0) {
        ctx.fillStyle = '#7ff4ff';
        ctx.fillRect(this.radioAt.x, this.radioAt.y - 2, 1, 1);
        ctx.fillRect(this.radioAt.x + 2, this.radioAt.y - 4, 1, 1);
      }
    }
    // Sunset clock, top middle.
    const left = Math.max(0, run.session - run.t);
    const m = Math.floor(left / 60), s = Math.floor(left % 60);
    const clock = `${m}:${String(s).padStart(2, '0')}`;
    const low = left < 10 && run.phase === 'fly';
    const cxm = Math.round(W / 2);
    const clockCol = low && Math.floor(this.t * 4) % 2 ? '#ff6b4a' : '#ffd23f';
    if (this.narrow) {
      // Phones: the menu buttons own the top right, so the clock sits beside the score.
      this.plate(ctx, 'SUNSET', pad + 66, pad + 2, '#aeb8e2', 1);
      this.plate(ctx, clock, pad + 66, pad + 10, clockCol, 2);
    } else {
      this.plate(ctx, 'SUNSET IN', cxm, pad + 2, '#aeb8e2', 1, 'c');
      this.plate(ctx, clock, cxm, pad + 10, clockCol, 2, 'c');
    }
    // Current combo.
    const c = run.combo;
    if (c.count) {
      const names = c.names.slice(this.narrow ? -2 : -3).join(' + ');
      const y = this.narrow ? ly + 14 : pad + 26;
      this.plate(ctx, names, cxm, y, '#ffe08a', 1, 'c');
      this.plate(ctx, `${c.pts} X${comboMult(c)}`, cxm, y + 10, '#ffffff', 2, 'c');
      const bw = 50;
      ctx.fillStyle = '#2a2d55';
      ctx.fillRect(cxm - bw / 2, y + 23, bw, 2);
      ctx.fillStyle = '#8fffc0';
      ctx.fillRect(cxm - bw / 2, y + 23, Math.round(bw * clamp01(c.timer / COMBO_TIME)), 2);
    }
    if (o.paused) {
      ctx.fillStyle = 'rgba(7,8,26,0.4)';
      ctx.fillRect(0, 0, W, this.H);
    }
  }

  drawTitle(ctx, o) {
    const { W } = this;
    const scale = W >= 300 ? 4 : 3;
    const title = 'SOLAR KITE';
    const cx = Math.round(W / 2);
    const y = Math.round(this.W < this.H ? 44 : Math.min(this.H * 0.16, 30));
    const wv = (i) => Math.round(Math.sin(this.t * 3 + i * 0.6) * 2);
    const w = measureText(title, scale);
    const x0 = cx - w / 2;
    for (let i = 0; i < title.length; i++) {
      const ch = title[i];
      this.text(ctx, ch, x0 + i * 6 * scale + scale, y + wv(i) + scale, '#07081a', scale);
      this.text(ctx, ch, x0 + i * 6 * scale, y + wv(i), i < 5 ? '#ffd23f' : '#ff5a8a', scale);
    }
    const sub = W >= 260 ? 'KITE CLUB, 0.02 AU FROM THE SUN' : 'KITE CLUB, 0.02 AU';
    this.plate(ctx, sub, cx, y + 5 * scale + 8, '#fff0b0', 1, 'c');
    const best = o.best ? `BEST ${o.best.score} (${o.best.rating})` : 'LOOPS, FIGURE 8S AND ORBITS';
    this.plate(ctx, best, cx, y + 5 * scale + 20, '#aeb8e2', 1, 'c');
  }
}
