// Everything on the canvas. The canvas is small (roughly 240-640 px wide) and
// scaled up by whole device pixels, so each world unit is U crisp pixels.
import { drawText, measureText } from './font.js';
import { mulberry32 } from './rng.js';
import { groundSpeed, hotAt, jetAlt, speedN } from './sim.js';
import { buildSprites } from './sprites.js';

export const U = 3;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const SKY_TOP = ['#02030f', '#070c33', '#123a86', '#3d7fd0'].map(hex);
const SKY_LOW = ['#101546', '#4a2a78', '#d0664a', '#a8d8f0'].map(hex);
function ramp(stops, t) {
  const f = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const k = f - i;
  const a = stops[i], b = stops[i + 1];
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// Particle colours by age (0 = newborn), precomputed so nothing is allocated per frame.
const PLASMA = ['#ffffff', '#fff2b0', '#ffd36a', '#ffa14a', '#ff6b3a', '#d0402a', '#7a2a3a'];
const SPARK = ['#ffffff', '#fff6c0', '#ffe08a', '#ffb050', '#ff7a3a'];
const WATER = ['#ffffff', '#dff6ff', '#9fe6ff', '#5fb8e8'];
const COOL = ['#ffffff', '#c8f4ff', '#7fd8ff', '#3f8fe0'];
const PALETTES = [PLASMA, SPARK, WATER, COOL, ['#aeb8e2', '#6e6286', '#3b3f6b']];

const MAX_PARTICLES = 700;

export class Renderer {
  constructor(seed) {
    this.sprites = buildSprites();
    this.rng = mulberry32((seed ^ 0x51ed) >>> 0);
    this.t = 0;
    this.W = 0;
    this.H = 0;
    this.camAlt = null;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.popups = [];
    this.textCache = new Map();
    this.p = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.p.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, pal: 0, g: 0, size: 1 });
    this.pNext = 0;
    this.lines = [];
    for (let i = 0; i < 26; i++) this.lines.push({ x: this.rng(), y: this.rng(), len: 4 + this.rng() * 18, spd: 0.6 + this.rng() * 0.8 });
    this.emitAcc = 0;
    this.sparkAcc = 0;
    this.skyKey = '';
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.yHot = new Float32Array(W);
    this.px = Math.round(W * (W < H ? 0.22 : 0.3));
    const rng = mulberry32(99);
    this.stars = [];
    const n = Math.round((W * H) / 450);
    for (let i = 0; i < n; i++) this.stars.push({ x: rng() * W, y: rng() * H, b: rng(), d: 0.2 + rng() * 0.8 });
    this.sky = document.createElement('canvas');
    this.sky.width = 1;
    this.sky.height = H;
    this.skyKey = '';
    if (!this.planetTex) this.planetTex = makePlanetTexture();
    if (!this.cloudStrip) this.cloudStrip = [makeCloudStrip(7, 0.8), makeCloudStrip(11, 1)];
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

  /** Text with a 1px dark drop shadow, centred on x when align is 'c'. */
  label(ctx, s, x, y, color, scale = 1, align = 'l') {
    const w = measureText(s, scale);
    const lx = align === 'c' ? x - w / 2 : align === 'r' ? x - w : x;
    this.text(ctx, s, lx + scale, y + scale, '#07081a', scale);
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
      const a = this.rng() * Math.PI * 2, s = speed * (0.3 + this.rng() * 0.7);
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + this.rng() * 0.5), pal, g, size);
    }
  }

  worldY(alt) {
    return this.cy - (alt - this.camAlt) * U;
  }
  worldX(run, x) {
    return this.px + (x - run.x) * U;
  }

  /** Reacts to a sim event with particles, shake and pop-ups. */
  onEvent(e, run, rm) {
    const bx = this.px, by = this.worldY(run.alt);
    if (e.type === 'hit') {
      this.burst(bx + 4, by - 4, 40, 1, 90, 0.6, 140);
      this.burst(bx + 4, by - 4, 8, 4, 50, 1, 60, 2);
      this.shake = rm ? 0 : 5;
      this.flash = rm ? 0.12 : 0.3;
      this.flashColor = '#ff6b4a';
      this.popup('OUCH! -FLOW', bx, by - 26, '#ff9b6a');
    } else if (e.type === 'coolant') {
      this.burst(bx, by - 6, 30, 3, 60, 0.8, -20);
      this.popup(`+${e.pts} COOLANT`, bx, by - 26, '#9fe6ff');
    } else if (e.type === 'popup') {
      this.popup(`+${e.pts} ${e.text}`, bx, by - 26, '#f3c252');
    } else if (e.type === 'flow') {
      this.popup(`FLOW X${e.flow}`, bx, by - 34, '#8fffc0');
    } else if (e.type === 'boost') {
      this.popup('JET STREAM!', bx, by - 26, '#7ff4ff');
      if (!rm) this.shake = Math.max(this.shake, 1.5);
    } else if (e.type === 'updraft') {
      this.popup('UPDRAFT!', bx, by - 26, '#c8ff9a');
    } else if (e.type === 'end' && e.outcome === 'burned') {
      this.burst(bx, by - 5, 160, 1, 140, 1.1, 60);
      this.burst(bx, by - 5, 60, 0, 70, 1.4, 0, 2);
      this.burst(bx, by - 5, 10, 4, 60, 1.6, 50, 2);
      this.shake = rm ? 0 : 9;
      this.flash = rm ? 0.3 : 0.95;
      this.flashColor = '#ffffff';
    } else if (e.type === 'end' && e.outcome === 'skipped') {
      this.burst(bx, by - 5, 30, 3, 50, 0.8, 0);
      this.shake = rm ? 0 : 3;
    } else if (e.type === 'splash') {
      const wy = by;
      for (let i = 0; i < 80; i++) {
        this.emit(bx + (this.rng() - 0.5) * 20, wy, (this.rng() - 0.5) * 80, -40 - this.rng() * 90, 0.9 + this.rng() * 0.6, 2, 160, this.rng() < 0.3 ? 2 : 1);
      }
      this.shake = rm ? 0 : 3;
    }
  }

  popup(text, x, y, color) {
    this.popups.push({ text, x, y, color, t: 0 });
    if (this.popups.length > 6) this.popups.shift();
  }

  // ------------------------------------------------------------------ frame
  /**
   * view: { run, mode: 'title' | 'ride' | 'end', rm, pressing, best, gentle, paused, hint }
   */
  draw(ctx, dt, view) {
    const { run, rm } = view;
    const W = this.W, H = this.H;
    if (!view.paused) this.t += dt;
    this.cy = Math.round(H * (W < H ? 0.46 : 0.5));

    // ---- camera
    const hot = hotAt(run, run.x);
    const sinceEnd = run.phase === 'ride' ? 0 : run.t - run.endT;
    let target = run.alt * 0.6 + (hot + run.width / 2) * 0.4;
    if (run.phase === 'skipped') target = Math.min(target, run.alt - sinceEnd * 6);
    if (run.phase === 'landed') target = run.alt + 6;
    if (this.camAlt === null || view.snapCamera) this.camAlt = target;
    const follow = run.phase === 'landed' ? 6 : 3;
    this.camAlt += (target - this.camAlt) * Math.min(1, dt * follow);

    // Descent 0 (space) -> 1 (low sky). After a landing it keeps going to the sea.
    let k = 1 - speedN(run.v);
    const land = run.phase === 'landed' ? smooth(clamp01(sinceEnd / 5)) : 0;
    const skipK = run.phase === 'skipped' ? clamp01(sinceEnd / 2) : 0;
    k = Math.max(0, k - skipK * 0.5);

    ctx.save();
    const sh = this.shake > 0.05 && !view.paused ? this.shake : 0;
    if (sh) ctx.translate(Math.round((this.rng() - 0.5) * sh * 2), Math.round((this.rng() - 0.5) * sh * 2));
    if (!view.paused) this.shake = Math.max(0, this.shake - dt * 14);

    this.drawSky(ctx, k, land);
    this.drawStars(ctx, run, k, land);
    const horizon = this.drawPlanet(ctx, run, k, land, skipK);
    this.drawCloudDecks(ctx, run, k, horizon, land);

    if (land < 0.33) this.drawCorridor(ctx, run, view, 1 - land * 3);
    this.drawObjects(ctx, run, view);
    if (land > 0) this.drawSea(ctx, run, horizon, land);
    this.drawSpeedLines(ctx, run, dt, view, 1 - land);
    this.drawPlayer(ctx, run, dt, view, land);
    this.drawParticles(ctx, dt, view.paused);
    if (!rm && run.plasma > 0.45 && run.phase === 'ride' && !view.paused) this.shimmer(ctx, run);
    ctx.restore();

    if (this.flash > 0.01) {
      ctx.globalAlpha = Math.min(1, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      if (!view.paused) this.flash = Math.max(0, this.flash - dt * 1.6);
    }

    this.drawPopups(ctx, dt, view.paused);
    if (view.mode === 'title') this.drawTitle(ctx, view);
    else this.drawHud(ctx, run, view);
    if (view.paused) {
      ctx.fillStyle = 'rgba(7,8,26,0.55)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ------------------------------------------------------------------ backdrop
  drawSky(ctx, k, land) {
    const H = this.H;
    const kk = Math.round(clamp01(k + land * 0.1) * 48);
    if (this.skyKey !== kk) {
      this.skyKey = kk;
      const g = this.sky.getContext('2d');
      const top = ramp(SKY_TOP, kk / 48), low = ramp(SKY_LOW, kk / 48);
      // Stepped bands give the gradient a retro, posterised look.
      for (let y = 0; y < H; y += 3) {
        const f = Math.pow(y / H, 1.6);
        const q = Math.round(f * 14) / 14;
        g.fillStyle = css([lerp(top[0], low[0], q), lerp(top[1], low[1], q), lerp(top[2], low[2], q)]);
        g.fillRect(0, y, 1, 3);
      }
    }
    ctx.drawImage(this.sky, 0, 0, this.W, H);
  }

  drawStars(ctx, run, k, land) {
    const a = clamp01(1 - k * 1.5) * (1 - land);
    if (a <= 0.02) return;
    const W = this.W;
    const scroll = run.x * 0.05;
    for (const s of this.stars) {
      let x = (s.x - scroll * s.d) % W;
      if (x < 0) x += W;
      const tw = s.b > 0.85 ? 0.6 + 0.4 * Math.sin(this.t * 3 + s.x) : 1;
      ctx.globalAlpha = a * (0.35 + s.b * 0.65) * tw;
      ctx.fillStyle = s.b > 0.9 ? '#fff6d6' : s.b > 0.6 ? '#dfe6ff' : '#8e97cf';
      ctx.fillRect(x | 0, s.y | 0, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** The curve of the planet below: rises and flattens as you descend. */
  drawPlanet(ctx, run, k, land, skipK) {
    const W = this.W, H = this.H;
    let horizon = H * lerp(0.9, 0.66, Math.pow(k, 0.8));
    let R = W * lerp(0.95, 5.5, k * k);
    if (land) {
      horizon = lerp(horizon, H * 0.6, land);
      R = lerp(R, W * 60, land * land);
    }
    if (skipK) horizon += skipK * H * 0.25;
    const cx = W * 0.62, cy = horizon + R;
    // Atmosphere limb: a few soft rings above the surface.
    const limb = ramp([[80, 160, 255], [120, 200, 255], [255, 170, 120], [200, 230, 255]], k);
    for (let i = 4; i >= 1; i--) {
      ctx.fillStyle = css(limb, 0.16 * (5 - i) * (1 - land * 0.7));
      ctx.beginPath();
      ctx.arc(cx, cy, R + i * 2 + k * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0d2a5a';
    ctx.fillRect(0, horizon - 2, W, H - horizon + 2);
    // Surface texture: scrolls slowly and stretches as the view flattens.
    const tex = this.planetTex;
    const th = Math.max(8, Math.round((H - horizon) * 1.2));
    const tw = Math.round(tex.width * lerp(0.7, 2.2, k));
    let off = -((run.x * lerp(0.08, 0.5, k)) % tw);
    if (off > 0) off -= tw;
    for (let x = off; x < W; x += tw) ctx.drawImage(tex, Math.round(x), Math.round(horizon), tw, th);
    // Haze thickening towards the limb.
    ctx.fillStyle = css(limb, 0.28);
    ctx.fillRect(0, horizon - 1, W, 3);
    ctx.fillStyle = css(limb, 0.14);
    ctx.fillRect(0, horizon + 2, W, 5);
    ctx.restore();
    this.horizon = horizon;
    return horizon;
  }

  drawCloudDecks(ctx, run, k, horizon, land) {
    const a = clamp01((k - 0.35) * 2.2) + land;
    if (a <= 0.02) return;
    const W = this.W;
    [0, 1].forEach((i) => {
      const strip = this.cloudStrip[i];
      const y = Math.round(horizon - (i ? 4 : 10) + (i ? 1 : -1) * (1 - k) * 8 + land * (i ? 18 : 4));
      const par = i ? 0.35 : 0.15;
      let off = -((run.x * par * U) % strip.width);
      if (off > 0) off -= strip.width;
      ctx.globalAlpha = Math.min(1, a) * (i ? 0.95 : 0.7);
      for (let x = off; x < W; x += strip.width) ctx.drawImage(strip, Math.round(x), y);
    });
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ the wave
  drawCorridor(ctx, run, view, fade) {
    const W = this.W, H = this.H, t = this.t, yHot = this.yHot;
    for (let col = 0; col < W; col++) yHot[col] = this.worldY(hotAt(run, run.x + (col - this.px) / U));
    const warnHeat = run.warnHeat, warnSkip = run.warnSkip;
    const blink = view.rm ? 1 : (t * 4) % 1 < 0.5 ? 1 : 0.4;
    ctx.globalAlpha = fade;

    // Glow of the crest spilling up into the corridor.
    ctx.fillStyle = `rgba(255,170,100,${0.05 + run.plasma * 0.06})`;
    this.band(ctx, yHot, -5 * U, 0);
    // Danger: thick, hot air below the crest. Stacked layers make a stepped gradient.
    const hotA = warnHeat ? 0.1 + 0.05 * blink : 0.08;
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = `rgba(${j < 2 ? '255,110,60' : '220,50,70'},${hotA})`;
      this.fillBelow(ctx, yHot, j * 5 + 1, H);
    }
    // Air layers: dotted contours that ripple on their own.
    const offs = [-12, -7, -3, 4, 8.5, 12.5];
    for (const off of offs) {
      const below = off < 0;
      ctx.fillStyle = below ? 'rgba(255,150,110,0.5)' : 'rgba(210,230,255,0.28)';
      ctx.beginPath();
      const step = below ? 2 : 3;
      const ph = Math.floor(t * (below ? 18 : 10));
      for (let col = (ph % step); col < W; col += step) {
        const wx = run.x + (col - this.px) / U;
        const y = yHot[col] - (off + 1.1 * Math.sin(wx * 0.045 + off * 1.7 + t * 0.7)) * U;
        ctx.rect(col, Math.round(y), 1, 1);
      }
      ctx.fill();
    }
    // Hot line: the crest of the wave, 2px, with foam running along it.
    const crest = warnHeat && blink > 0.5 ? '#ffffff' : run.plasma > 0.6 ? '#ffd36a' : '#ff9b6a';
    ctx.fillStyle = crest;
    ctx.beginPath();
    for (let col = 0; col < W; col++) ctx.rect(col, Math.round(yHot[col]), 1, 2);
    ctx.fill();
    ctx.fillStyle = '#fff2d0';
    ctx.beginPath();
    const foam = Math.floor(t * 30);
    for (let col = 0; col < W; col++) {
      if ((col + foam) % 11 < 2) ctx.rect(col, Math.round(yHot[col]) - 1, 1, 1);
    }
    ctx.fill();
    // Thin line: dashed, with upward chevrons: above it you start to skip off.
    const thinOff = run.width * U;
    ctx.fillStyle = warnSkip ? (blink > 0.5 ? '#ffffff' : '#7ff4ff') : 'rgba(127,244,255,0.75)';
    ctx.beginPath();
    const dash = Math.floor(t * 12);
    for (let col = 0; col < W; col++) {
      if ((col + dash) % 8 < 5) ctx.rect(col, Math.round(yHot[col] - thinOff), 1, 1);
    }
    ctx.fill();
    ctx.fillStyle = warnSkip ? 'rgba(127,244,255,0.9)' : 'rgba(127,244,255,0.35)';
    const rise = view.rm ? 0 : Math.floor(t * 8) % 4;
    for (let col = 18 - (Math.floor(run.x * U) % 36 + 36) % 36; col < W; col += 36) {
      if (col < 0) continue;
      const y = Math.round(yHot[col] - thinOff) - 5 - rise;
      ctx.fillRect(col - 2, y + 2, 1, 1);
      ctx.fillRect(col - 1, y + 1, 1, 1);
      ctx.fillRect(col, y, 1, 1);
      ctx.fillRect(col + 1, y + 1, 1, 1);
      ctx.fillRect(col + 2, y + 2, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Fills from each column's y + dy down to y + dy2 (dy2 === H fills to the bottom). */
  fillBelow(ctx, ys, dy, bottom) {
    const W = this.W;
    ctx.beginPath();
    let start = 0, y0 = Math.round(ys[0] + dy);
    for (let col = 1; col <= W; col++) {
      const y = col < W ? Math.round(ys[col] + dy) : NaN;
      if (y !== y0) {
        if (y0 < bottom) ctx.rect(start, y0, col - start, bottom - y0);
        start = col;
        y0 = y;
      }
    }
    ctx.fill();
  }

  band(ctx, ys, dyTop, dyBottom) {
    const W = this.W;
    ctx.beginPath();
    for (let col = 0; col < W; col++) {
      const y = Math.round(ys[col] + dyTop);
      ctx.rect(col, y, 1, Math.round(dyBottom - dyTop));
    }
    ctx.fill();
  }

  // ------------------------------------------------------------------ hazards
  drawObjects(ctx, run, view) {
    const W = this.W, H = this.H, t = this.t;
    const blink = view.rm ? true : (t * 5) % 1 < 0.6;
    for (const o of run.objects) {
      if (o.kind === 'updraft') {
        const x0 = this.worldX(run, o.x - o.half), x1 = this.worldX(run, o.x + o.half);
        if (x1 < 0 || x0 > W + 40) continue;
        const top = this.worldY(o.top);
        const bottom = this.worldY(hotAt(run, o.x) - 6);
        ctx.fillStyle = 'rgba(200,255,160,0.08)';
        ctx.fillRect(Math.round(x0), Math.round(top), Math.round(x1 - x0), Math.round(bottom - top));
        ctx.fillStyle = 'rgba(200,255,160,0.16)';
        ctx.fillRect(Math.round(x0 + (x1 - x0) * 0.25), Math.round(top), Math.round((x1 - x0) * 0.5), Math.round(bottom - top));
        // Rising chevrons: shape and motion say "this lifts you".
        const rise = view.rm ? 0 : (t * 34) % 16;
        ctx.fillStyle = 'rgba(220,255,170,0.8)';
        for (let y = bottom - rise; y > top + 4; y -= 16) {
          for (const cx of [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7]) {
            const X = Math.round(cx), Y = Math.round(y);
            ctx.fillRect(X - 2, Y + 2, 1, 1);
            ctx.fillRect(X - 1, Y + 1, 1, 1);
            ctx.fillRect(X, Y, 1, 1);
            ctx.fillRect(X + 1, Y + 1, 1, 1);
            ctx.fillRect(X + 2, Y + 2, 1, 1);
          }
        }
      } else if (o.kind === 'storm') {
        const x0 = this.worldX(run, o.x - o.half), x1 = this.worldX(run, o.x + o.half);
        if (x1 < -20 || x0 > W + 40) continue;
        // A bank of dark, bruised cloud sitting on the raised crest.
        const r = mulberry32(Math.round(o.x));
        const puffs = [];
        for (let i = 0; i < 18; i++) {
          const u = r() * 2 - 1;
          const wx = o.x + u * o.half * 0.9;
          const lift = (1 - u * u) * (3 + r() * 5);
          puffs.push([wx, lift, Math.round(3 + (1 - Math.abs(u)) * 5 + r() * 3)]);
        }
        for (const [col, dy] of [['#1c1230', 2], ['#3a2658', 0], ['#5e4488', -2]]) {
          ctx.fillStyle = col;
          for (const [wx, lift, rad] of puffs) {
            const X = this.worldX(run, wx);
            if (X < -20 || X > W + 20) continue;
            const Y = this.worldY(hotAt(run, wx) + lift) + dy;
            pixelEllipse(ctx, X, Y, rad * 1.5 + (dy < 0 ? -2 : 0), Math.max(1, rad + (dy < 0 ? -2 : 0)));
          }
        }
        if (o.boltT > 0) {
          const X = this.worldX(run, o.boltX);
          let y = this.worldY(hotAt(run, o.boltX)) - 6;
          const end = y + 18 * U;
          const r = mulberry32(Math.round(o.boltX * 10));
          let x = X;
          ctx.fillStyle = o.boltT > 0.12 ? '#ffffff' : '#c8b0ff';
          while (y < end) {
            const nx = x + Math.round((r() - 0.5) * 6);
            ctx.fillRect(Math.min(x, nx), Math.round(y), Math.abs(nx - x) + 1, 1);
            ctx.fillRect(nx, Math.round(y), 1, 4);
            x = nx;
            y += 4;
          }
          if (!view.rm) {
            ctx.fillStyle = 'rgba(200,180,255,0.08)';
            ctx.fillRect(0, 0, W, H);
          }
        }
      } else if (o.kind === 'jet') {
        const x0 = Math.max(0, Math.floor(this.worldX(run, o.x)));
        const x1 = Math.min(W, Math.ceil(this.worldX(run, o.x + o.len)));
        if (x1 <= x0) continue;
        const flow = Math.floor(t * (o.riding ? 160 : 90));
        for (let col = x0; col < x1; col++) {
          const wx = run.x + (col - this.px) / U;
          const y = Math.round(this.worldY(jetAlt(run, o, wx)));
          const lit = (col + flow) % 14 < 7;
          ctx.fillStyle = o.riding ? 'rgba(160,250,255,0.35)' : 'rgba(127,244,255,0.18)';
          ctx.fillRect(col, y - 4, 1, 9);
          ctx.fillStyle = lit ? '#ffffff' : '#7ff4ff';
          ctx.fillRect(col, y - 1, 1, lit ? 2 : 1);
          if ((col + flow) % 23 === 0) {
            ctx.fillStyle = '#dffcff';
            ctx.fillRect(col, y - 3, 1, 1);
            ctx.fillRect(col - 3, y + 2, 1, 1);
          }
        }
      } else if (o.kind === 'debris') {
        if (o.hit) continue;
        const X = this.worldX(run, o.x), Y = this.worldY(o.alt);
        if (X < -20 || X > W + 20) continue;
        const spr = this.sprites.debris[o.sprite];
        ctx.save();
        ctx.translate(Math.round(X), Math.round(Y));
        ctx.rotate(Math.round(o.spin * 2) * (Math.PI / 4));
        ctx.drawImage(spr, -Math.floor(spr.width / 2), -Math.floor(spr.height / 2));
        ctx.restore();
        // A small hot trail: it's re-entering too.
        ctx.fillStyle = 'rgba(255,160,90,0.5)';
        ctx.fillRect(Math.round(X + spr.width / 2), Math.round(Y), 5, 1);
      } else if (o.kind === 'coolant') {
        if (o.taken) continue;
        const X = this.worldX(run, o.x), Y = this.worldY(o.alt);
        if (X < -20 || X > W + 20) continue;
        const pulse = view.rm ? 0 : Math.round(Math.sin(t * 6) * 1.5);
        ctx.strokeStyle = 'rgba(159,230,255,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(X) - 7 - pulse + 0.5, Math.round(Y) - 7 - pulse + 0.5, 14 + pulse * 2, 14 + pulse * 2);
        const spr = this.sprites.coolant;
        ctx.drawImage(spr, Math.round(X - spr.width / 2), Math.round(Y - spr.height / 2));
      }
    }
    // Telegraph what's coming from off the right edge.
    for (const o of run.objects) {
      if (!o.announced || o.quiet) continue;
      const front = o.kind === 'storm' || o.kind === 'updraft' ? o.x - o.half : o.x;
      const X = this.worldX(run, front);
      if (X < W - 4 || (o.kind === 'debris' && o.hit)) continue;
      const alt = o.alt !== undefined ? o.alt : hotAt(run, front) + (o.kind === 'storm' ? 6 : run.width / 2);
      const Y = Math.max(34, Math.min(H - 20, Math.round(this.worldY(alt))));
      const col = { debris: '#ff6b4a', updraft: '#c8ff9a', storm: '#c8a0ff', jet: '#7ff4ff', coolant: '#9fe6ff' }[o.kind];
      if (!blink && o.kind === 'debris') continue;
      ctx.fillStyle = '#07081a';
      ctx.fillRect(W - 14, Y - 6, 12, 13);
      ctx.fillStyle = col;
      // Arrow pointing right, with an icon for the kind.
      for (let i = 0; i < 5; i++) ctx.fillRect(W - 5 + (i < 3 ? i : 4 - i) - 2, Y - 2 + i, 1, 1);
      const icon = { debris: '!', updraft: '^', storm: '*', jet: '>', coolant: '+' }[o.kind];
      this.text(ctx, icon, W - 13, Y - 2, col);
    }
  }

  drawSea(ctx, run, horizon, land) {
    const W = this.W, H = this.H;
    const a = clamp01((land - 0.35) / 0.4);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const top = Math.round(horizon);
    const rows = ['#2a6fb0', '#2464a4', '#1e5896', '#194c88', '#14407a', '#10356a', '#0c2a5a'];
    const h = H - top;
    for (let i = 0; i < rows.length; i++) {
      ctx.fillStyle = rows[i];
      const y0 = top + Math.round((h * i * i) / (rows.length * rows.length));
      ctx.fillRect(0, y0, W, H - y0);
    }
    // Wave glints scrolling with the last of your speed.
    ctx.fillStyle = '#9fd8ff';
    const r = mulberry32(5);
    for (let i = 0; i < 90; i++) {
      const depth = r();
      const y = top + Math.round(depth * depth * h);
      const len = 1 + Math.round(depth * 6);
      let x = (r() * W * 2 - run.x * U * (0.2 + depth) + this.t * 3) % W;
      if (x < 0) x += W;
      ctx.fillRect(Math.round(x), y, len, 1);
    }
    ctx.globalAlpha = 1;
  }

  drawSpeedLines(ctx, run, dt, view, fade) {
    if (view.rm || run.phase !== 'ride' || view.paused) return;
    const n = speedN(run.v);
    const W = this.W, H = this.H;
    const speed = groundSpeed(run.v) * U * 2.2;
    ctx.fillStyle = run.jetting ? 'rgba(200,250,255,0.55)' : 'rgba(255,255,255,0.22)';
    const count = Math.round(this.lines.length * (0.3 + 0.7 * n) + (run.jetting ? 0 : 0));
    for (let i = 0; i < count; i++) {
      const l = this.lines[i];
      l.x -= (speed * l.spd * dt) / W;
      if (l.x < -0.1) {
        l.x += 1.2;
        l.y = this.rng();
      }
      ctx.fillRect(Math.round(l.x * W), Math.round(l.y * H), Math.round(l.len * (0.5 + n)), 1);
    }
  }

  // ------------------------------------------------------------------ rider
  drawPlayer(ctx, run, dt, view, land) {
    const t = this.t;
    const bx = this.px;
    let by = this.worldY(run.alt);
    const sinceEnd = run.t - run.endT;
    if (run.phase === 'landed') {
      const water = this.horizon + (this.H - this.horizon) * 0.3;
      by = lerp(by, water, land);
      if (run.splashed) by = water + Math.round(Math.sin(t * 2.2) * 1);
    }
    this.playerY = by;
    const paused = view.paused;

    if (run.phase === 'burned' && sinceEnd > 0.35) {
      // What's left streaks on as a meteor.
      const X = bx + sinceEnd * 30, Y = by + sinceEnd * 22;
      if (!paused && sinceEnd < 3) {
        this.emit(X, Y, -40 - this.rng() * 40, -10 - this.rng() * 10, 0.5, 0, 0, this.rng() < 0.3 ? 2 : 1);
      }
      ctx.fillStyle = '#fff6d6';
      if (sinceEnd < 3) ctx.fillRect(Math.round(X) - 1, Math.round(Y) - 1, 3, 3);
      return;
    }

    let angle = Math.max(-0.6, Math.min(0.6, -run.vy * 0.05 - (run.a - 0.3) * 0.18));
    let spr = run.input < -0.3 ? this.sprites.crouch : this.sprites.ride;
    if (run.phase === 'skipped') {
      spr = this.sprites.tumble;
      angle = -sinceEnd * 5;
    } else if (run.phase === 'landed') angle *= 1 - land;
    if (view.mode === 'title') angle = Math.sin(t * 1.3) * 0.12;
    angle = Math.round(angle / 0.1) * 0.1;
    const plasma = run.plasma;

    // Bow shock + glow wrapped around the leading underside of the shield.
    // Drawn as crisp pixel shapes (no rotation, no additive blending).
    if (plasma > 0.04 && run.phase !== 'landed' && run.phase !== 'skipped') {
      const white = run.heat > 0.8 || run.phase === 'burned';
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const rot = (x, y) => [bx + x * ca - y * sa, by + x * sa + y * ca];
      const flick = view.rm ? 1 : 0.85 + this.rng() * 0.3;
      const [gx, gy] = rot(4, 4);
      const glow = [
        [16 + 16 * plasma, 7 + 7 * plasma, '255,90,40', 0.22],
        [10 + 10 * plasma, 5 + 4 * plasma, '255,170,80', 0.3],
        [5 + 6 * plasma, 3 + 2 * plasma, white ? '255,255,255' : '255,230,150', 0.45],
      ];
      for (const [rx, ry, c, a] of glow) {
        ctx.fillStyle = `rgba(${c},${(a * plasma * flick).toFixed(3)})`;
        pixelEllipse(ctx, gx, gy, rx, ry);
      }
      if (plasma > 0.12) {
        const L = 10 + 7 * plasma, S = 6 + 4 * plasma;
        ctx.globalAlpha = Math.min(1, plasma * 1.6);
        ctx.fillStyle = white ? '#ffffff' : plasma > 0.5 ? '#fff2b0' : '#ffb070';
        for (let th = -0.7; th <= 2.2; th += 0.07) {
          const [x, y] = rot(1 + L * Math.cos(th), 3 + S * Math.sin(th));
          ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
        if (plasma > 0.5) {
          ctx.fillStyle = white ? '#fff6d6' : '#ffd36a';
          for (let th = -0.4; th <= 1.9; th += 0.09) {
            const [x, y] = rot(1 + (L - 2) * Math.cos(th), 3 + (S - 2) * Math.sin(th));
            ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // Plasma trail and sparks.
    if (!paused && run.phase === 'ride') {
      const rate = (view.rm ? 60 : 220) * plasma * plasma;
      this.emitAcc += rate * dt;
      const back = groundSpeed(run.v) * U;
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        const u = this.rng() * 2 - 1;
        const ox = 10 - 8 * u * u, oy = 3 + u * 7;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        this.emit(bx + ox * ca - oy * sa, by + ox * sa + oy * ca, -back * (0.45 + this.rng() * 0.5), (this.rng() - 0.5) * 16 - run.vy * U * 0.5, 0.25 + this.rng() * 0.45 * plasma, 0, 0, this.rng() < 0.15 ? 2 : 1);
      }
      if (run.heat > 0.6) {
        this.sparkAcc += (run.heat - 0.6) * (view.rm ? 25 : 90) * dt;
        while (this.sparkAcc >= 1) {
          this.sparkAcc -= 1;
          this.emit(bx + (this.rng() - 0.5) * 16, by + 1, -back * 0.3 + (this.rng() - 0.5) * 60, -20 - this.rng() * 50, 0.4 + this.rng() * 0.3, 1, 160);
        }
      }
    }

    // Chute above the rider after the ride.
    if (run.phase === 'landed' && !run.splashed) {
      const open = clamp01(sinceEnd / 0.5);
      drawChute(ctx, bx, by - 17, open, t);
    } else if (run.phase === 'landed' && run.splashed) {
      // Chute settles on the water behind.
      ctx.fillStyle = '#ff9b6a';
      ctx.fillRect(bx - 26, Math.round(by) - 1, 12, 2);
      ctx.fillStyle = '#eef1f6';
      ctx.fillRect(bx - 22, Math.round(by) - 1, 4, 2);
    }

    ctx.save();
    ctx.translate(Math.round(bx), Math.round(by));
    ctx.rotate(angle);
    const h = spr.height;
    ctx.drawImage(spr, -9, -h + 3);
    // The shield's hot edge glows with heat.
    if (run.phase !== 'skipped' && (run.heat > 0.05 || plasma > 0.3)) {
      const hh = Math.max(run.heat, plasma * 0.6);
      ctx.fillStyle = hh > 0.8 ? '#ffffff' : hh > 0.5 ? '#ffd36a' : '#ff8a4a';
      ctx.globalAlpha = Math.min(1, 0.3 + hh);
      ctx.fillRect(-6, 3, 12, 1);
      ctx.fillRect(-8, 2, 2, 1);
      ctx.fillRect(6, 2, 2, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (run.phase === 'burned' && sinceEnd <= 0.35) {
      // The flare: white-hot core blooming out.
      const r = 6 + sinceEnd * 70;
      ctx.fillStyle = `rgba(255,210,120,${(0.6 - sinceEnd).toFixed(3)})`;
      pixelEllipse(ctx, bx, by - 3, r * 1.3, r);
      ctx.fillStyle = `rgba(255,255,255,${(0.95 - sinceEnd * 2).toFixed(3)})`;
      pixelEllipse(ctx, bx, by - 3, r * 0.7, r * 0.55);
    }
    if (run.phase === 'landed' && run.splashed) {
      // Ripples.
      const r = ((t * 12) % 18) | 0;
      ctx.fillStyle = 'rgba(223,246,255,0.6)';
      ctx.fillRect(bx - 12 - r, Math.round(by) + 3, 4, 1);
      ctx.fillRect(bx + 10 + r, Math.round(by) + 3, 4, 1);
    }
  }

  drawParticles(ctx, dt, paused) {
    const H = this.H, W = this.W;
    for (const p of this.p) {
      if (!p.on) continue;
      if (!paused) {
        p.life += dt;
        if (p.life >= p.max) {
          p.on = false;
          continue;
        }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.x < -4 || p.x > W + 4 || p.y > H + 4) {
        p.on = false;
        continue;
      }
      const pal = PALETTES[p.pal];
      ctx.fillStyle = pal[Math.min(pal.length - 1, Math.floor((p.life / p.max) * pal.length))];
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }

  /** Heat shimmer: wobble a few rows of pixels around the rider. */
  shimmer(ctx, run) {
    const x0 = Math.max(0, this.px - 60), w = Math.min(this.W - x0, 90);
    const y0 = Math.round(this.playerY) - 26;
    const amp = (run.plasma - 0.45) * 3;
    for (let y = Math.max(0, y0); y < Math.min(this.H, y0 + 24); y += 2) {
      const off = Math.round(Math.sin(y * 0.8 + this.t * 24) * amp);
      if (off) ctx.drawImage(ctx.canvas, x0, y, w, 2, x0 + off, y, w, 2);
    }
  }

  drawPopups(ctx, dt, paused) {
    for (const p of this.popups) {
      if (!paused) p.t += dt;
      const a = 1 - clamp01((p.t - 0.8) / 0.5);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      this.label(ctx, p.text, p.x, p.y - Math.min(12, p.t * 20), p.color, 1, 'c');
      ctx.globalAlpha = 1;
    }
    this.popups = this.popups.filter((p) => p.t < 1.3);
  }

  // ------------------------------------------------------------------ HUD
  drawHud(ctx, run, view) {
    const W = this.W, t = this.t;
    const blink = view.rm ? true : (t * 4) % 1 < 0.55;
    const x = 6;
    let y = 6;
    const narrowHud = W < 300;
    ctx.fillStyle = 'rgba(7,8,26,0.5)';
    ctx.fillRect(2, 2, 104, narrowHud ? 78 : 44);
    this.gauge(ctx, x, y, 'HEAT', run.heat, run.warnHeat, blink, 'heat', view.rm);
    y += 11;
    this.gauge(ctx, x, y, 'SKIP', run.skip, run.warnSkip, blink, 'skip', view.rm);
    y += 12;
    const alt = Math.max(0, Math.round(run.alt * 1.25));
    this.label(ctx, `ALT ${alt} KM`, x, y, '#aeb8e2');
    this.label(ctx, `SPD ${run.v.toFixed(1)}`, x, y + 8, '#aeb8e2');

    // Score, flow and progress to the surface, top centre (under the gauges on narrow screens).
    const narrow = W < 300;
    const cx = narrow ? x : W / 2;
    const align = narrow ? 'l' : 'c';
    let sy = narrow ? y + 20 : 6;
    this.label(ctx, Math.round(run.score).toLocaleString('en-US'), cx, sy, '#fff6d6', 2, align);
    sy += 13;
    const fw = 5 * 6;
    const fx = narrow ? x : Math.round(cx - (fw + 18) / 2);
    this.label(ctx, `X${run.flow}`, fx, sy, run.flow >= 4 ? '#8fffc0' : '#f3c252');
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < run.flow ? (run.flow >= 4 ? '#8fffc0' : '#f3c252') : 'rgba(174,184,226,0.35)';
      ctx.fillRect(fx + 16 + i * 6, sy, 4, 5);
    }
    ctx.fillStyle = 'rgba(174,184,226,0.35)';
    ctx.fillRect(fx + 16, sy + 7, 28, 1);
    ctx.fillStyle = '#8fffc0';
    ctx.fillRect(fx + 16, sy + 7, Math.round(28 * Math.min(1, run.flowT / 5)), 1);
    sy += 12;
    // Descent progress: board icon travelling towards the surface.
    const pw = 56, pxl = narrow ? x : Math.round(cx - pw / 2);
    const prog = 1 - speedN(run.v);
    ctx.fillStyle = '#07081a';
    ctx.fillRect(pxl - 1, sy - 1, pw + 2, 5);
    ctx.fillStyle = '#3b3f6b';
    ctx.fillRect(pxl, sy, pw, 3);
    ctx.fillStyle = '#7ff4ff';
    ctx.fillRect(pxl, sy, Math.round(pw * prog), 3);
    ctx.fillStyle = '#8fcf78';
    ctx.fillRect(pxl + pw - 2, sy - 1, 3, 5);
    if (!narrow) this.label(ctx, 'SURFACE', pxl + pw + 5, sy - 1, '#8fcf78');

    // Edge call-out next to the rider.
    if (run.phase === 'ride' && run.edge && run.edgeT > 0.15) {
      const txt = run.edge === 'hot' ? 'HOT EDGE!' : 'SKIMMING!';
      const col = run.edge === 'hot' ? '#ffd36a' : '#7ff4ff';
      if (view.rm || (t * 6) % 1 < 0.7) this.label(ctx, txt, this.px + 14, Math.round(this.playerY) + 8, col);
    }

    // Big warning banners: text plus distinct shapes (flames vs. chevrons) and motion.
    if (run.phase === 'ride' && (run.warnHeat || run.warnSkip)) {
      const heat = run.warnHeat && (run.heat >= run.skip || !run.warnSkip);
      const touch = view.inputMode === 'touch';
      const msg = heat ? (touch ? 'TOO HOT! LET GO TO LIFT' : 'TOO HOT! LET GO / UP') : touch ? 'SKIPPING! HOLD TO DIVE' : 'SKIPPING! HOLD TO DIVE';
      const scale = W >= 420 ? 2 : 1;
      const tw = measureText(msg, scale);
      const bw = tw + 30, bh = 7 * scale + 8;
      const bxp = Math.round(W / 2 - bw / 2);
      const jit = heat && !view.rm ? Math.round(Math.sin(t * 40)) : 0;
      const byp = Math.round(this.H * (W < this.H ? 0.26 : 0.3)) + jit;
      const col = heat ? '#ff6b4a' : '#7ff4ff';
      ctx.fillStyle = '#07081a';
      ctx.fillRect(bxp - 2, byp - 2, bw + 4, bh + 4);
      ctx.fillStyle = blink ? col : '#07081a';
      ctx.fillRect(bxp, byp, bw, bh);
      ctx.fillStyle = '#07081a';
      ctx.fillRect(bxp + 2, byp + 2, bw - 4, bh - 4);
      this.text(ctx, msg, bxp + 15, byp + 4 + (scale === 2 ? 1 : 0), col, scale);
      // Icons at both ends.
      for (const ix of [bxp + 5, bxp + bw - 10]) {
        if (heat) drawFlame(ctx, ix, byp + bh / 2 - 3, blink);
        else drawChevrons(ctx, ix, byp + 3, view.rm ? 0 : Math.floor(t * 8) % 3);
      }
    }
  }

  gauge(ctx, x, y, name, value, warn, blink, kind, rm) {
    const bw = 56;
    const col = kind === 'heat' ? (value > 0.8 ? '#ffffff' : value > 0.5 ? '#ff6b4a' : '#ff9b6a') : value > 0.8 ? '#ffffff' : '#7ff4ff';
    const shake = warn && !rm ? Math.round(Math.sin(this.t * 50)) : 0;
    if (kind === 'heat') drawFlame(ctx, x, y, true);
    else drawChevrons(ctx, x, y, 0);
    this.label(ctx, name, x + 8, y + 1, warn && blink ? col : '#eef1f6');
    const gx = x + 34 + shake;
    ctx.fillStyle = '#07081a';
    ctx.fillRect(gx - 1, y - 1, bw + 2, 9);
    ctx.fillStyle = warn && blink ? col : '#3b3f6b';
    ctx.fillRect(gx, y, bw, 7);
    ctx.fillStyle = '#10132e';
    ctx.fillRect(gx + 1, y + 1, bw - 2, 5);
    ctx.fillStyle = col;
    ctx.fillRect(gx + 1, y + 1, Math.round((bw - 2) * Math.min(1, value)), 5);
    // Warning mark on the scale.
    const mark = kind === 'heat' ? 0.62 : 0.5;
    ctx.fillStyle = '#eef1f6';
    ctx.fillRect(gx + 1 + Math.round((bw - 2) * mark), y + 1, 1, 5);
    if (warn) this.label(ctx, '!', gx + bw + 4, y + 1, col);
  }

  drawTitle(ctx, view) {
    const W = this.W, H = this.H, t = this.t;
    const big = W >= 560 ? 4 : W >= 380 ? 3 : 2;
    const l1 = 'RE-ENTRY', l2 = 'SURF';
    const y1 = Math.round(H * (W < H ? 0.12 : 0.1));
    const w1 = measureText(l1, big);
    const s2 = big + 2;
    const w2 = measureText(l2, s2);
    const x1 = Math.round(W / 2 - w1 / 2), x2 = Math.round(W / 2 - w2 / 2);
    const y2 = y1 + 5 * big + big * 2;
    // Shadow, then a two-tone fill: cream over plasma orange.
    this.text(ctx, l1, x1 + big, y1 + big, '#3b2a78', big);
    this.text(ctx, l1, x1, y1, '#fff6d6', big);
    this.text(ctx, l2, x2 + big, y2 + big, '#3b2a78', s2);
    this.text(ctx, l2, x2, y2, '#ff9b6a', s2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y2, W, Math.round(5 * s2 * 0.5));
    ctx.clip();
    this.text(ctx, l2, x2, y2, '#ffe08a', s2);
    ctx.restore();
    // A plasma streak under the logo.
    const sy = y2 + 5 * s2 + big + 1;
    for (let i = 0; i < w2 + 24; i++) {
      const f = i / (w2 + 24);
      ctx.fillStyle = f > 0.85 ? '#ffffff' : f > 0.6 ? '#ffe08a' : f > 0.3 ? '#ff9b6a' : '#d0402a';
      if (view.rm || (i + Math.floor(t * 30)) % 9 > 1) ctx.fillRect(x2 - 12 + i, sy, 1, f > 0.6 ? 2 : 1);
    }
    let y = sy + 8;
    this.label(ctx, 'RIDE THE RE-ENTRY CORRIDOR', W / 2, y, '#aeb8e2', 1, 'c');
    y += 10;
    if (view.best) {
      this.label(ctx, `BEST ${view.best.score.toLocaleString('en-US')}  RANK ${view.best.rating}`, W / 2, y, '#f3c252', 1, 'c');
      y += 10;
    }
    if (view.gentle) this.label(ctx, 'GENTLE MODE ON', W / 2, y, '#8fffc0', 1, 'c');
  }
}

// ------------------------------------------------------------------ little shapes
function pixelDisc(ctx, cx, cy, r) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  ctx.beginPath();
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy));
    ctx.rect(cx - w, cy + dy, w * 2 + 1, 1);
  }
  ctx.fill();
}

function pixelEllipse(ctx, cx, cy, rx, ry) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  const R = Math.round(ry);
  ctx.beginPath();
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    if (w > 0) ctx.rect(cx - w, cy + dy, w * 2 + 1, 1);
  }
  ctx.fill();
}

function drawFlame(ctx, x, y, on) {
  const rows = ['..o..', '.ooo.', 'oyoyo', 'oyyyo', '.ooo.'];
  rows.forEach((r, j) => {
    for (let i = 0; i < 5; i++) {
      if (r[i] === '.') continue;
      ctx.fillStyle = r[i] === 'y' ? (on ? '#ffe08a' : '#07081a') : '#ff6b4a';
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  });
}

function drawChevrons(ctx, x, y, shift) {
  ctx.fillStyle = '#7ff4ff';
  for (let c = 0; c < 2; c++) {
    const yy = y + c * 3 - shift;
    ctx.fillRect(x + 2, yy, 1, 1);
    ctx.fillRect(x + 1, yy + 1, 1, 1);
    ctx.fillRect(x + 3, yy + 1, 1, 1);
    ctx.fillRect(x, yy + 2, 1, 1);
    ctx.fillRect(x + 4, yy + 2, 1, 1);
  }
}

function drawChute(ctx, cx, top, open, t) {
  const w = Math.round(6 + 16 * open), h = Math.round(3 + 7 * open);
  const sway = Math.round(Math.sin(t * 1.6) * 1.5);
  cx += sway;
  // Lines.
  ctx.fillStyle = 'rgba(238,241,246,0.7)';
  for (const f of [-1, -0.4, 0.4, 1]) {
    const x0 = cx + f * w, x1 = cx + f * 3 - sway;
    for (let i = 0; i <= 10; i++) ctx.fillRect(Math.round(lerp(x0, x1, i / 10)), Math.round(lerp(top - 18, top, i / 10)), 1, 1);
  }
  // Canopy: striped half-dome.
  for (let dx = -w; dx <= w; dx++) {
    const u = dx / w;
    const hh = Math.round(h * Math.sqrt(1 - u * u));
    ctx.fillStyle = Math.floor((dx + w) / 4) % 2 ? '#eef1f6' : '#ff6b4a';
    ctx.fillRect(cx + dx, top - 18 - hh, 1, hh + 1);
  }
  ctx.fillStyle = '#07081a';
  ctx.fillRect(cx - w, top - 18, w * 2 + 1, 1);
}

function makePlanetTexture() {
  const W = 256, H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rng = mulberry32(1234);
  g.fillStyle = '#123e74';
  g.fillRect(0, 0, W, H);
  // Wrapping value noise for land and cloud.
  const noise = (seed, cells) => {
    const r = mulberry32(seed);
    const grid = [];
    for (let i = 0; i < cells * cells; i++) grid.push(r());
    return (x, y) => {
      const fx = (x / W) * cells, fy = (y / H) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const v = (i, j) => grid[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)];
      return lerp(lerp(v(x0, y0), v(x0 + 1, y0), tx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty);
    };
  };
  const land = noise(7, 8), land2 = noise(8, 16), cloud = noise(9, 12), cloud2 = noise(10, 24);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const th = bayer[(y % 4) * 4 + (x % 4)] / 16 - 0.5;
      const l = land(x, y) * 0.7 + land2(x, y) * 0.3;
      const cl = cloud(x, y) * 0.8 + cloud2(x, y) * 0.2;
      let col = null;
      if (l > 0.6 + th * 0.04) col = l > 0.68 ? '#6b8a4a' : '#3f7a4a';
      else if (l > 0.56 + th * 0.04) col = '#1a5a8a';
      else if ((x + y) % 7 === 0 && rng() < 0.3) col = '#16457e';
      if (cl > 0.62 + th * 0.06) col = cl > 0.68 ? '#eef4ff' : '#b8c8e8';
      if (col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

function makeCloudStrip(seed, scale) {
  const W = 320, H = 34;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  const puffs = [];
  for (let i = 0; i < 26; i++) puffs.push([r() * W, H - 6 - r() * 10 * scale, (3 + r() * 8) * scale]);
  const pass = (color, dy, dr) => {
    g.fillStyle = color;
    for (const [x, y, rad] of puffs) {
      for (const ox of [-W, 0, W]) pixelDisc(g, x + ox, y + dy, Math.max(1, Math.round(rad + dr)));
    }
  };
  pass('#8a9ccc', 2, 0);
  pass('#dfe8f8', 0, -1);
  pass('#ffffff', -1, -3);
  g.fillStyle = '#8a9ccc';
  g.fillRect(0, H - 6, W, 6);
  return c;
}
