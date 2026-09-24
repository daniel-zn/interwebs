import { drawText, measureText } from './font.js';
import {
  ASTRO, BUBBLE, BUCKET, RIM, SCENE_BOTTOM, SCENE_TOP, WATER, inWater,
} from './layout.js';
import { P } from './palette.js';
import { HEAD_ROWS, sprites } from './sprites.js';
import { clamp, dither, hexToRgb, lerp, makeCanvas, makeNoise, mulberry32 } from './util.js';

const RGB = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, hexToRgb(v)]));

// ----------------------------------------------------------------------------
// Pre-rendered layers

function buildBackground(W, H, seed) {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const noise = makeNoise(seed);
  const rng = mulberry32(seed ^ 0x51f15e);
  const sky = [RGB.space0, RGB.space1, RGB.space2, RGB.space1, RGB.space0];
  const neb = [null, RGB.neb1, RGB.neb2, RGB.neb3, RGB.pink];
  const slope = 0.35 + rng() * 0.3, off = rng() * H * 0.4;
  const span = Math.min(H, W * 1.2);
  for (let y = 0; y < H; y++) {
    const sy = (y / (H - 1)) * (sky.length - 1);
    const si = Math.min(sky.length - 2, Math.floor(sy));
    for (let x = 0; x < W; x++) {
      let c = dither(x, y, sy - si) ? sky[si + 1] : sky[si];
      // A diagonal band of nebula, broken up by noise.
      const band = Math.exp(-(((x * slope - y + off + H * 0.25) / (span * 0.22)) ** 2));
      const n = noise(x / 38, y / 38, 4);
      const v = clamp((band * n * 1.7 - 0.5) * 1.5, 0, 0.999) * (neb.length - 1);
      const vi = Math.floor(v);
      const pick = dither(x, y, v - vi) ? vi + 1 : vi;
      if (pick > 0) c = neb[Math.min(pick, neb.length - 1)];
      const i = (y * W + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const portrait = H > W * 1.2;
  drawPlanet(ctx, Math.round(W * 0.8), Math.round(portrait ? H * 0.16 : H * 0.2), portrait ? 17 : 14);
  drawMoon(ctx, Math.round(W * 0.13), Math.round(portrait ? H * 0.82 : H * 0.72), 5);
  return cv;
}

function drawPlanet(ctx, cx, cy, r) {
  const ramp = ['#241a45', '#3f2c6b', '#6b4596', '#a765b3', '#e39ad0'];
  const ring = (front) => {
    const rx = r * 1.85, ry = r * 0.42;
    for (let i = 0; i < 220; i++) {
      const a = (i / 220) * Math.PI * 2;
      const isFront = Math.sin(a) > 0;
      if (isFront !== front) continue;
      for (let k = 0; k < 3; k++) {
        if (k === 1 && i % 2) continue;
        const x = Math.round(cx + Math.cos(a) * (rx - k * 2.2)), y = Math.round(cy + Math.sin(a) * (ry - k * 0.6));
        ctx.fillStyle = k === 0 ? '#c9b8ff' : k === 1 ? '#8a7ac4' : '#b3a4ee';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };
  ring(false);
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const nz = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (r * r)));
      const l = clamp((-x * 0.55 - y * 0.45) / r + nz * 0.8, 0, 1.3);
      const band = Math.sin(y * 0.9 + Math.sin(x * 0.2) * 0.6) * 0.18;
      const v = clamp(l * 0.75 + band, 0, 0.999) * (ramp.length - 1);
      const vi = Math.floor(v);
      ctx.fillStyle = ramp[dither(cx + x, cy + y, v - vi) ? Math.min(vi + 1, ramp.length - 1) : vi];
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  ring(true);
}

function drawMoon(ctx, cx, cy, r) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const lit = (x + 2) * (x + 2) + (y + 1) * (y + 1) > r * r * 0.9;
      ctx.fillStyle = lit ? '#cfd3e8' : '#232a52';
      if (!lit && !dither(x, y, 0.5)) ctx.fillStyle = '#1b2046';
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

const ISLAND_W = 212, ISLAND_H = 134, IOX = 106, IOY = 30;

function buildIsland(seed) {
  const cv = makeCanvas(ISLAND_W, ISLAND_H);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(ISLAND_W, ISLAND_H);
  const d = img.data;
  const rng = mulberry32(seed ^ 0x1517);
  const noise = makeNoise(seed ^ 0xbeef);
  const put = (x, y, c) => {
    const px = x + IOX, py = y + IOY;
    if (px < 0 || py < 0 || px >= ISLAND_W || py >= ISLAND_H) return;
    const i = (py * ISLAND_W + px) * 4;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  };
  const rockRamp = [RGB.rockDark, RGB.rock, RGB.rockMid, RGB.rockLight];
  const bottoms = {};
  let jag = 0;
  for (let x = -RIM.rx; x <= RIM.rx; x++) {
    if ((x + RIM.rx) % 3 === 0) jag = Math.floor(rng() * 4);
    const u = x / RIM.rx;
    const rimY = RIM.ry * Math.sqrt(Math.max(0, 1 - u * u));
    const base = (1 - Math.abs(u)) ** 1.35;
    const tip = Math.max(0, 1 - Math.abs(u + 0.08) * 5) * 14;
    const depth = Math.round(5 + 60 * base * (0.85 + 0.2 * Math.sin(x * 0.19 + 1.3)) + tip + jag);
    bottoms[x] = Math.round(rimY + depth);
    for (let y = Math.floor(rimY) - 1; y <= rimY + depth; y++) {
      const dy = y - rimY;
      if (dy < 3) {
        put(x, y, dither(x, y, 0.35) ? RGB.soilDark : RGB.soil);
        continue;
      }
      const t = (dy - 3) / Math.max(1, depth - 3);
      const strata = (y + Math.round(Math.sin(x * 0.15) * 2)) % 7 === 0 ? -0.2 : 0;
      const light = 0.95 - t * 0.85 + u * 0.3 + strata + (noise(x / 6, y / 6, 2) - 0.5) * 0.35;
      const v = clamp(light, 0, 0.999) * (rockRamp.length - 1);
      const vi = Math.floor(v);
      put(x, y, rockRamp[dither(x + IOX, y + IOY, v - vi) ? Math.min(vi + 1, 3) : vi]);
    }
  }
  // Grassy top.
  for (let y = -RIM.ry; y <= RIM.ry; y++) {
    const hw = Math.floor(RIM.rx * Math.sqrt(Math.max(0, 1 - (y / RIM.ry) ** 2)));
    for (let x = -hw; x <= hw; x++) {
      const e = 1 - ((x / RIM.rx) ** 2 + (y / RIM.ry) ** 2);
      let c = noise(x / 5 + 40, y / 3, 2) > 0.58 ? RGB.grassDark : RGB.grass;
      if (e < 0.07 && y > 0) c = RGB.grassDark;
      else if (rng() < 0.07) c = RGB.grassLight;
      put(x, y, c);
    }
  }
  // Grass hanging over the soil lip.
  for (let x = -RIM.rx + 2; x <= RIM.rx - 2; x++) {
    if (rng() > 0.35) continue;
    const u = x / RIM.rx, rimY = Math.round(RIM.ry * Math.sqrt(1 - u * u));
    const len = 1 + Math.floor(rng() * 3);
    for (let k = 1; k <= len; k++) put(x, rimY + k, k === len ? RGB.grassDark : RGB.grass);
  }
  // Flowers dotted around the rim.
  const flowerColors = [RGB.pink, RGB.visor, RGB.white, RGB.starBlue];
  for (let i = 0; i < 60; i++) {
    const x = Math.round((rng() * 2 - 1) * (RIM.rx - 4));
    const y = Math.round((rng() * 2 - 1) * (RIM.ry - 3));
    const e = (x / (RIM.rx - 3)) ** 2 + (y / (RIM.ry - 2)) ** 2;
    if (e > 1 || inWater(x, y, -3) || (x < -52 && Math.abs(y) < 6)) continue;
    put(x, y, flowerColors[i % flowerColors.length]);
    put(x, y + 1, RGB.grassLight);
  }
  ctx.putImageData(img, 0, 0);

  // Crystals poking out of the rock.
  const crystals = [];
  for (let i = 0; i < 7; i++) {
    const x = Math.round((rng() * 2 - 1) * 58);
    const rimY = RIM.ry * Math.sqrt(1 - (x / RIM.rx) ** 2);
    const room = bottoms[x] - rimY;
    if (room < 18) continue;
    const y = Math.round(rimY + 7 + rng() * (room - 14));
    const shape = ['.c.', 'cCc', 'cCc', 'cCw', '.c.'];
    shape.forEach((row, ry) => [...row].forEach((ch, rx) => {
      if (ch === '.') return;
      ctx.fillStyle = ch === 'c' ? P.crystalDim : ch === 'C' ? P.crystal : P.white;
      ctx.fillRect(x + rx - 1 + IOX, y + ry - 2 + IOY, 1, 1);
    }));
    crystals.push({ x, y, ph: rng() * 6 });
  }
  const vines = [];
  for (let i = 0; i < 7; i++) {
    const x = Math.round((rng() * 2 - 1) * 62);
    vines.push({ x, y: bottoms[x] - 2, len: 5 + Math.floor(rng() * 10), ph: rng() * 6 });
  }
  return { canvas: cv, crystals, vines };
}

function buildProps() {
  const cv = makeCanvas(ISLAND_W, ISLAND_H);
  const ctx = cv.getContext('2d');
  const px = (x, y, c, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + IOX, y + IOY, w, h);
  };
  // Dock: planks across, a face, and posts in the water.
  for (let x = -96; x <= -53; x++) {
    const plank = Math.floor((x + 96) / 4);
    const seam = (x + 96) % 4 === 3;
    for (let y = -3; y <= 0; y++) {
      let c = plank % 2 ? P.wood : P.woodLight;
      if (seam) c = P.woodDark;
      else if (y === -3) c = P.woodLight;
      px(x, y, c);
    }
    px(x, 1, P.woodDark, 1, 2);
    px(x, 3, '#2e1d18');
  }
  for (const x of [-61, -69]) {
    px(x, 4, P.woodDark, 2, 2);
    px(x, 6, P.waterDeep, 2, 1);
  }
  // Lantern post.
  px(-93, -21, P.woodDark, 1, 18);
  px(-92, -21, P.wood, 1, 18);
  px(-93, -22, P.woodDark, 5, 1);
  px(-90, -21, P.outline, 4, 1);
  px(-90, -20, P.outline, 1, 5);
  px(-87, -20, P.outline, 1, 5);
  px(-89, -20, P.lamp, 2, 4);
  px(-89, -20, P.white);
  px(-90, -15, P.outline, 4, 1);
  // A little tree with star-fruit on the far rim.
  px(63, -20, P.woodDark, 1, 10);
  px(64, -20, P.wood, 1, 10);
  px(62, -11, P.woodDark, 4, 1);
  const blobs = [[64, -26, 7], [59, -23, 5], [69, -22, 5], [65, -31, 4.5]];
  const inTree = (x, y) => blobs.some(([bx, by, r]) => (x - bx) ** 2 + (y - by) ** 2 <= r * r);
  for (let y = -37; y <= -16; y++) {
    for (let x = 52; x <= 76; x++) {
      if (!inTree(x, y)) continue;
      const edge = !inTree(x - 1, y) || !inTree(x + 1, y) || !inTree(x, y - 1) || !inTree(x, y + 1);
      const l = (x - 64) * 0.08 - (y + 26) * 0.1;
      let c = l > 0.35 ? P.grassLight : l > -0.3 ? P.grass : P.grassDark;
      if (l > 0 && l <= 0.35 && dither(x, y, 0.3)) c = P.grassLight;
      if (edge) c = P.leafEdge;
      px(x, y, c);
    }
  }
  for (const [x, y] of [[60, -25], [67, -28], [70, -21], [62, -19]]) px(x, y, P.visor);
  return cv;
}

function makeStars(W, H, seed) {
  const rng = mulberry32(seed ^ 0x57a2);
  const n = Math.round((W * H) / 380);
  const stars = [];
  for (let i = 0; i < n; i++) {
    const layer = rng() < 0.6 ? 0 : rng() < 0.75 ? 1 : 2;
    stars.push({
      x: rng() * W, y: rng() * H, layer, ph: rng() * 10, sp: 0.5 + rng() * 2,
      color: layer === 2 ? (rng() < 0.3 ? P.starBlue : P.star) : layer === 1 ? P.starDim : P.neb3,
      big: layer === 2 && rng() < 0.25,
    });
  }
  return stars;
}

// ----------------------------------------------------------------------------

export class Scene {
  constructor(seed) {
    this.seed = seed;
    this.island = buildIsland(seed);
    this.props = buildProps();
    this.sprites = sprites();
    this.W = 0;
    this.H = 0;
    this.shoot = null;
    this.shootIn = 6;
    this.titleFade = 1;
    const rng = mulberry32(seed ^ 0x3a7e);
    this.dashes = Array.from({ length: 20 }, () => ({
      y: Math.round((rng() * 2 - 1) * (WATER.ry - 2)), off: rng(), len: 2 + Math.floor(rng() * 5),
      speed: 1.5 + rng() * 3, ph: rng() * 6,
    }));
    this.glints = [];
    while (this.glints.length < 8) {
      const x = Math.round((rng() * 2 - 1) * WATER.rx), y = Math.round(WATER.y + (rng() * 2 - 1) * WATER.ry);
      if (inWater(x, y, 3)) this.glints.push({ x, y, ph: rng() * 8 });
    }
    this.pads = [[24, 7, 1], [-22, -9, 0], [42, -5, 0], [8, 10, 0]];
    this.reeds = [[68, -4], [70, -2], [72, 0], [66, 4], [-42, -14], [-38, -15], [-35, -15]];
    this.rodPts = [];
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.bg = buildBackground(W, H, this.seed);
    this.stars = makeStars(W, H, this.seed);
    this.cx = Math.floor(W / 2);
    const mid = (SCENE_TOP + SCENE_BOTTOM) / 2;
    this.cy = Math.round(H / 2 - mid);
  }

  update(dt, game) {
    const reduced = game.settings.reducedMotion;
    const drift = reduced ? 0.2 : 1;
    for (const s of this.stars) {
      s.x -= (0.5 + s.layer * 1.3) * dt * drift;
      if (s.x < -2) {
        s.x += this.W + 4;
      }
    }
    if (game.state !== 'title') this.titleFade = Math.max(0, this.titleFade - dt * 1.5);
    if (this.shoot) {
      this.shoot.t += dt;
      if (this.shoot.t > this.shoot.life) this.shoot = null;
    } else if (!reduced) {
      this.shootIn -= dt;
      if (this.shootIn <= 0) {
        this.shootIn = 10 + Math.random() * 18;
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.shoot = {
          x: dir > 0 ? Math.random() * this.W * 0.5 : this.W * (0.5 + Math.random() * 0.5),
          y: Math.random() * this.H * 0.35, vx: dir * (90 + Math.random() * 60), vy: 30 + Math.random() * 25,
          t: 0, life: 0.9,
        };
      }
    }
  }

  draw(ctx, game) {
    const t = game.t;
    const reduced = game.settings.reducedMotion;
    ctx.drawImage(this.bg, 0, 0);
    this.drawStars(ctx, t, reduced);
    this.drawShootingStar(ctx);

    const ox = this.cx;
    const oy = this.cy + (reduced ? 0 : Math.round(Math.sin((t * Math.PI * 2) / 7) * 2));
    this.ox = ox;
    this.oy = oy;

    this.drawBubble(ctx, ox, oy, t, reduced, false);
    this.drawVines(ctx, ox, oy, t, reduced);
    ctx.drawImage(this.island.canvas, ox - IOX, oy - IOY);
    this.drawCrystalGlow(ctx, ox, oy, t);
    this.drawWater(ctx, ox, oy, game);
    ctx.drawImage(this.props, ox - IOX, oy - IOY);
    this.drawLampGlow(ctx, ox, oy, t, reduced);
    this.drawReeds(ctx, ox, oy, t, reduced);
    this.drawBucket(ctx, ox, oy, game);
    this.drawAstronaut(ctx, ox, oy, game);
    this.drawRodAndLine(ctx, ox, oy, game);
    this.drawJumper(ctx, ox, oy, game);
    this.drawLeap(ctx, ox, oy, game);
    this.drawParticles(ctx, ox, oy, game);
    this.drawMeters(ctx, ox, oy, game);
    this.drawExclaim(ctx, ox, oy, game);
    this.drawTexts(ctx, ox, oy, game);
    this.drawBubble(ctx, ox, oy, t, reduced, true);
    if (this.titleFade > 0) this.drawTitle(ctx, ox, oy, t);
  }

  // --- sky ------------------------------------------------------------------
  drawStars(ctx, t, reduced) {
    for (const s of this.stars) {
      const x = Math.round(s.x), y = Math.round(s.y);
      let c = s.color;
      if (s.layer === 2) {
        const tw = reduced ? 0.5 : Math.sin(t * s.sp + s.ph);
        if (tw < -0.7) c = P.starDim;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
        if (s.big && tw > 0.55) {
          ctx.fillStyle = P.starDim;
          ctx.fillRect(x - 1, y, 1, 1);
          ctx.fillRect(x + 1, y, 1, 1);
          ctx.fillRect(x, y - 1, 1, 1);
          ctx.fillRect(x, y + 1, 1, 1);
        }
      } else {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  drawShootingStar(ctx) {
    const s = this.shoot;
    if (!s) return;
    const k = s.t / s.life;
    const hx = s.x + s.vx * s.t, hy = s.y + s.vy * s.t;
    const len = 14 * Math.sin(k * Math.PI);
    const n = Math.max(1, Math.round(len));
    for (let i = 0; i < n; i++) {
      const f = i / n;
      ctx.fillStyle = f < 0.15 ? P.white : f < 0.5 ? P.star : P.starDim;
      if (f > 0.5 && i % 2) continue;
      ctx.fillRect(Math.round(hx - (s.vx / 120) * i), Math.round(hy - (s.vy / 120) * i), 1, 1);
    }
  }

  drawBubble(ctx, ox, oy, t, reduced, front) {
    const { x, y, rx, ry } = BUBBLE;
    const n = 180;
    const shift = reduced ? 0 : Math.floor(t * 2);
    ctx.fillStyle = P.starBlue;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const isFront = Math.sin(a) > -0.2;
      if (isFront !== front) continue;
      const hi = a > 3.75 && a < 4.2;
      if ((i + shift) % (hi ? 2 : 5) !== 0) continue;
      ctx.globalAlpha = hi ? 0.45 : front ? 0.25 : 0.16;
      ctx.fillRect(Math.round(ox + x + Math.cos(a) * rx), Math.round(oy + y + Math.sin(a) * ry), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // --- island -----------------------------------------------------------------
  drawVines(ctx, ox, oy, t, reduced) {
    for (const v of this.island.vines) {
      for (let i = 0; i < v.len; i++) {
        const sway = reduced ? 0 : Math.sin(t * 0.8 + v.ph + i * 0.25) * (i / v.len) * 2;
        const x = Math.round(ox + v.x + sway), y = oy + v.y + i;
        ctx.fillStyle = i % 4 === 2 ? P.grass : P.grassDark;
        ctx.fillRect(x, y, 1, 1);
        if (i % 4 === 2) ctx.fillRect(x + (i % 8 === 2 ? 1 : -1), y, 1, 1);
      }
    }
  }

  drawCrystalGlow(ctx, ox, oy, t) {
    ctx.fillStyle = P.crystal;
    for (const c of this.island.crystals) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + c.ph);
      ctx.globalAlpha = 0.12 + pulse * 0.18;
      ctx.fillRect(ox + c.x - 2, oy + c.y - 1, 5, 3);
      ctx.fillRect(ox + c.x - 1, oy + c.y - 3, 3, 7);
      if (pulse > 0.97) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = P.white;
        ctx.fillRect(ox + c.x + 2, oy + c.y - 3, 1, 1);
        ctx.fillStyle = P.crystal;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawWater(ctx, ox, oy, game) {
    const { x: wx, y: wy, rx, ry } = WATER;
    const t = game.t;
    const hw = (yy) => Math.floor(rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2)));
    for (let yy = -ry; yy <= ry; yy++) {
      const w = hw(yy);
      if (w <= 0) continue;
      const k = (yy + ry) / (2 * ry);
      ctx.fillStyle = k < 0.1 ? P.waterDeep : k < 0.55 ? P.water : P.waterMid;
      ctx.fillRect(ox + wx - w, oy + wy + yy, w * 2 + 1, 1);
      if (k >= 0.1 && k < 0.2) {
        ctx.fillStyle = P.waterDeep;
        for (let x = -w; x <= w; x++) if (!dither(x, yy, 0.5)) ctx.fillRect(ox + wx + x, oy + wy + yy, 1, 1);
      }
    }
    // Fish shadows under the surface.
    ctx.fillStyle = '#10304f';
    for (const sh of game.shadows) {
      const fade = clamp(sh.fade, 0, 1);
      const sx = Math.round(sh.x), sy = Math.round(sh.y);
      for (let y = -Math.ceil(sh.ry); y <= Math.ceil(sh.ry); y++) {
        for (let x = -sh.rx - 1; x <= sh.rx + 1; x++) {
          const e = (x / (sh.rx + 0.5)) ** 2 + (y / (sh.ry + 0.5)) ** 2;
          if (e > 1 || !inWater(sx + x, sy + y, 1)) continue;
          if (fade < 1 && !dither(sx + x, sy + y, fade)) continue;
          ctx.fillRect(ox + sx + x, oy + sy + y, 1, 1);
        }
      }
      // A little tail flick.
      const tail = Math.round(Math.sin(t * 6 + sh.rx) * 0.6);
      if (inWater(sx - sh.rx - 2, sy + tail, 1) && fade > 0.5) ctx.fillRect(ox + sx - sh.rx - 2, oy + sy + tail, 1, 1);
    }
    // Lily pads.
    for (const [x, y, flower] of this.pads) {
      ctx.fillStyle = P.grassDark;
      ctx.fillRect(ox + x - 2, oy + y, 5, 1);
      ctx.fillRect(ox + x - 1, oy + y - 1, 4, 1);
      ctx.fillStyle = P.grass;
      ctx.fillRect(ox + x - 1, oy + y, 2, 1);
      ctx.fillRect(ox + x, oy + y - 1, 1, 1);
      if (flower) {
        ctx.fillStyle = P.pink;
        ctx.fillRect(ox + x + 1, oy + y - 2, 2, 1);
        ctx.fillStyle = P.white;
        ctx.fillRect(ox + x + 1, oy + y - 3, 1, 1);
      }
    }
    // Sparkling surface highlights.
    for (const d of this.dashes) {
      const w = hw(d.y) - 2;
      if (w < d.len + 2) continue;
      const span = w * 2 - d.len;
      const x = -w + Math.floor(((d.off * span + t * d.speed) % span + span) % span);
      const tw = game.settings.reducedMotion ? 0.5 : Math.sin(t * 1.3 + d.ph);
      if (tw < -0.4) continue;
      ctx.fillStyle = tw > 0.75 ? P.foam : P.waterLight;
      ctx.fillRect(ox + wx + x, oy + wy + d.y, d.len, 1);
    }
    for (const g of this.glints) {
      const tw = Math.sin(t * 2 + g.ph);
      if (tw < 0.3) continue;
      ctx.fillStyle = tw > 0.85 ? P.white : P.starDim;
      ctx.fillRect(ox + g.x, oy + g.y, 1, 1);
    }
    // Ripples.
    for (const r of game.ripples) {
      const life = 1 - r.r / r.max;
      const n = Math.max(10, Math.round(r.r * 5));
      ctx.fillStyle = life > 0.5 ? P.foam : P.waterLight;
      for (let i = 0; i < n; i++) {
        if (life < 0.35 && i % 2) continue;
        const a = (i / n) * Math.PI * 2;
        const x = Math.round(r.x + Math.cos(a) * r.r), y = Math.round(r.y + Math.sin(a) * r.r * 0.4);
        if (inWater(x, y)) ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }

  drawLampGlow(ctx, ox, oy, t, reduced) {
    const flick = reduced ? 0 : Math.sin(t * 7) * 0.02 + Math.sin(t * 13.1) * 0.015;
    ctx.fillStyle = P.lamp;
    const cx = ox - 88, cy = oy - 18;
    for (const [r, a] of [[13, 0.07], [8, 0.08], [4, 0.1]]) {
      ctx.globalAlpha = a + flick;
      for (let y = -r; y <= r; y++) {
        const w = Math.floor(r * Math.sqrt(1 - (y / r) ** 2));
        ctx.fillRect(cx - w, cy + Math.round(y * 0.8), w * 2 + 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawReeds(ctx, ox, oy, t, reduced) {
    this.reeds.forEach(([x, y], i) => {
      const h = 5 + (i % 3) * 2;
      const sway = reduced ? 0 : Math.round(Math.sin(t * 1.1 + i * 1.7) * 0.7);
      for (let k = 0; k < h; k++) {
        ctx.fillStyle = k < 2 ? P.grassDark : P.grass;
        ctx.fillRect(ox + x + (k > h * 0.6 ? sway : 0), oy + y - k, 1, 1);
      }
      ctx.fillStyle = P.wood;
      ctx.fillRect(ox + x + sway, oy + y - h - 1, 1, 2);
    });
  }

  drawBucket(ctx, ox, oy, game) {
    const bx = ox + BUCKET.x, by = oy + BUCKET.y;
    const caught = game.sessionCatches;
    // Tails poking out of the bucket.
    caught.slice(-3).forEach((sp, i) => {
      const c = sp.art ? sp.art.colors.tail || sp.art.colors.fin : sp.custom === 'eel' ? '#3d3a80' : P.suit;
      const x = bx + 2 + i * 2 - (i === 2 ? 3 : 0);
      ctx.fillStyle = c;
      ctx.fillRect(x, by - 1, 1, 1);
      ctx.fillRect(x - 1, by - 2, 1, 1);
      ctx.fillRect(x + 1, by - 2, 1, 1);
    });
    ctx.drawImage(this.sprites.bucket, bx, by);
  }

  drawAstronaut(ctx, ox, oy, game) {
    const t = game.t;
    const s = this.sprites.astronaut;
    const ax = ox + ASTRO.x, ay = oy + ASTRO.y;
    const reduced = game.settings.reducedMotion;
    // Dangling legs, gently swinging.
    for (let leg = 0; leg < 2; leg++) {
      const swing = reduced ? 0 : Math.sin(t * 1.3 + leg * 2.1);
      const kx = ax + 11 + leg * 2, ky = ay + 16;
      for (let k = 0; k < 5; k++) {
        const x = kx + Math.round(swing * (k / 4));
        ctx.fillStyle = P.outline;
        ctx.fillRect(x - 1, ky + k, 1, 1);
        ctx.fillStyle = leg ? P.suit : P.suitShade;
        ctx.fillRect(x, ky + k, 2, 1);
      }
      const fx = kx + Math.round(swing);
      ctx.fillStyle = P.suitDark;
      ctx.fillRect(fx, ky + 5, 3, 2);
      ctx.fillStyle = P.outline;
      ctx.fillRect(fx, ky + 7, 3, 1);
    }
    const nod = !reduced && Math.sin(t * 1.4) > 0.75 ? 1 : 0;
    ctx.drawImage(s, 0, HEAD_ROWS, s.width, s.height - HEAD_ROWS, ax, ay + HEAD_ROWS, s.width, s.height - HEAD_ROWS);
    ctx.drawImage(s, 0, 0, s.width, HEAD_ROWS, ax, ay + nod, s.width, HEAD_ROWS);
    // A glint sliding across the visor now and then.
    const g = (t % 6) / 0.5;
    if (g < 1 && !reduced) {
      ctx.fillStyle = P.visorGlint;
      ctx.fillRect(ax + 8 + Math.round(g * 4), ay + nod + 2 + Math.round(g * 3), 1, 1);
    }
  }

  drawRodAndLine(ctx, ox, oy, game) {
    const pts = game.rodPoints(this.rodPts);
    ctx.fillStyle = P.suitDark;
    ctx.fillRect(Math.round(ox + pts[3].x), Math.round(oy + pts[3].y) + 1, 2, 2); // reel
    for (let i = 0; i < pts.length; i++) {
      ctx.fillStyle = i < 6 ? P.woodDark : i < pts.length - 5 ? '#39406a' : P.suitShade;
      ctx.fillRect(Math.round(ox + pts[i].x), Math.round(oy + pts[i].y), 1, 1);
    }
    const tip = pts[pts.length - 1];
    const b = game.bobber;
    const st = game.state;
    // Fishing line as a sagging curve, plotted pixel by pixel.
    let sag = 3;
    if (b.inWater) sag = st === 'reeling' ? 12 * (1 - game.tension) : st === 'bite' ? 2 : 9;
    if (st === 'casting' && game.cast.launched) sag = 4;
    const x0 = tip.x, y0 = tip.y, x2 = b.x, y2 = b.y - (b.inWater ? 2 : 3);
    const mx = (x0 + x2) / 2, my = (y0 + y2) / 2 + sag;
    const n = Math.ceil(Math.hypot(x2 - x0, y2 - y0) * 1.3) + 2;
    ctx.fillStyle = P.line;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i <= n; i++) {
      const u = i / n, v = 1 - u;
      const x = v * v * x0 + 2 * v * u * mx + u * u * x2;
      const y = v * v * y0 + 2 * v * u * my + u * u * y2;
      ctx.fillRect(Math.round(ox + x), Math.round(oy + y), 1, 1);
    }
    ctx.globalAlpha = 1;
    this.drawBobber(ctx, ox, oy, game);
  }

  drawBobber(ctx, ox, oy, game) {
    const b = game.bobber;
    const x = Math.round(ox + b.x), y = Math.round(oy + b.y);
    if (b.under) {
      // Only a flicker of red shows while the fish holds it under.
      const jit = game.settings.reducedMotion ? 0 : Math.round(Math.sin(game.t * 30));
      ctx.fillStyle = P.red;
      if (game.state === 'bite') ctx.fillRect(x + jit, y - 1, 2, 1);
      return;
    }
    const dip = b.dip > 0.3 ? 1 : 0;
    const top = b.inWater ? y - 3 + dip : y - 4;
    ctx.fillStyle = P.red;
    ctx.fillRect(x, top, 1, 1);
    ctx.fillRect(x - 1, top + 1, 3, 1);
    ctx.fillStyle = P.white;
    ctx.fillRect(x - 1, top + 2, 3, 1);
    if (!b.inWater) ctx.fillRect(x, top + 3, 1, 1);
    else {
      ctx.fillStyle = P.foam;
      ctx.fillRect(x - 2, y, 1, 1);
      ctx.fillRect(x + 2, y, 1, 1);
    }
  }

  drawJumper(ctx, ox, oy, game) {
    const j = game.jumper;
    if (!j) return;
    const k = j.t / j.dur;
    const x = lerp(j.x0, j.x1, k), y = j.y - Math.sin(k * Math.PI) * 9;
    this.drawSprite(ctx, j.sprite, ox + x, oy + y, j.dir < 0);
  }

  drawLeap(ctx, ox, oy, game) {
    const L = game.leap;
    if (!L) return;
    this.drawSprite(ctx, L.sprite, ox + L.x, oy + L.y, true);
  }

  drawSprite(ctx, sprite, cx, cy, flip) {
    const x = Math.round(cx - sprite.width / 2), y = Math.round(cy - sprite.height / 2);
    if (!flip) {
      ctx.drawImage(sprite, x, y);
      return;
    }
    ctx.save();
    ctx.translate(x + sprite.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
  }

  drawParticles(ctx, ox, oy, game) {
    for (const p of game.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(ox + p.x), Math.round(oy + p.y), 1, 1);
    }
  }

  meterFrame(ctx, x, y, w, h, frame) {
    ctx.fillStyle = frame;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = P.ink;
    ctx.fillRect(x, y, w, h);
  }

  drawMeters(ctx, ox, oy, game) {
    const st = game.state;
    const mx = ox + ASTRO.x - 6, my = oy + ASTRO.y - 16, mw = 42;
    if (st === 'charging') {
      const p = game.power;
      this.meterFrame(ctx, mx, my, mw, 4, P.suit);
      const fill = Math.round(p * mw);
      ctx.fillStyle = p < 0.36 ? P.waterLight : p < 0.7 ? P.visor : P.orange;
      ctx.fillRect(mx, my, fill, 4);
      ctx.fillStyle = P.suitDark;
      ctx.fillRect(mx + Math.round(mw * 0.36), my + 4, 1, 2);
      ctx.fillRect(mx + Math.round(mw * 0.7), my + 4, 1, 2);
      // A little star at the far end: rarer fish live out there.
      ctx.fillStyle = P.visor;
      ctx.fillRect(mx + mw + 3, my + 1, 1, 3);
      ctx.fillRect(mx + mw + 2, my + 2, 3, 1);
      // Landing marker on the water.
      const tgt = game.castTarget(p);
      const blink = Math.floor(game.t * 6) % 2;
      ctx.fillStyle = blink ? P.foam : P.white;
      const tx = ox + tgt.x, ty = oy + tgt.y;
      ctx.fillRect(tx - 2, ty, 1, 1);
      ctx.fillRect(tx + 2, ty, 1, 1);
      ctx.fillRect(tx, ty - 1, 1, 1);
      ctx.fillRect(tx, ty + 1, 1, 1);
    } else if (st === 'reeling') {
      const su = game.surge.phase;
      const flash = Math.floor(game.t * 10) % 2;
      const frame = su === 'pull' ? (flash ? P.orange : P.red) : su === 'warn' ? (flash ? P.white : P.visor) : P.suit;
      this.meterFrame(ctx, mx, my, mw, 5, frame);
      // Danger zone, striped so it doesn't rely on colour alone.
      const dz = Math.round(mw * 0.8);
      for (let x = dz; x < mw; x++) {
        for (let y = 0; y < 5; y++) {
          if ((x + y) % 3 === 0) {
            ctx.fillStyle = '#5a1f2a';
            ctx.fillRect(mx + x, my + y, 1, 1);
          }
        }
      }
      const tn = game.tension;
      ctx.fillStyle = tn < 0.6 ? P.waterLight : tn < 0.8 ? P.visor : P.red;
      ctx.fillRect(mx, my + 1, Math.round(tn * mw), 3);
      ctx.fillStyle = P.white;
      ctx.fillRect(mx + Math.round(tn * (mw - 1)), my, 1, 5);
      // Progress toward the dock.
      this.meterFrame(ctx, mx, my + 8, mw, 2, P.suitDark);
      ctx.fillStyle = P.foam;
      ctx.fillRect(mx, my + 8, Math.round(game.progress * mw), 2);
      ctx.fillStyle = P.visor;
      const fx = mx + Math.round(game.progress * (mw - 1));
      ctx.fillRect(fx - 1, my + 7, 2, 1);
      ctx.fillRect(fx - 1, my + 10, 2, 1);
    }
  }

  drawExclaim(ctx, ox, oy, game) {
    if (game.exclaim <= 0) return;
    const pop = game.state === 'bite' ? Math.min(1, game.stateT * 8) : game.exclaim;
    const x = ox + ASTRO.x + 4, y = oy + ASTRO.y - 13 + Math.round((1 - pop) * 4);
    ctx.fillStyle = P.outline;
    ctx.fillRect(x - 1, y - 1, 9, 11);
    ctx.fillStyle = P.white;
    ctx.fillRect(x, y, 7, 9);
    ctx.fillRect(x + 2, y + 9, 2, 1);
    ctx.fillRect(x + 2, y + 10, 1, 1);
    ctx.fillStyle = P.red;
    ctx.fillRect(x + 3, y + 1, 1, 5);
    ctx.fillRect(x + 3, y + 7, 1, 1);
  }

  drawTexts(ctx, ox, oy, game) {
    for (const tx of game.texts) {
      const k = tx.t / tx.life;
      const y = Math.round(oy + tx.y - k * 10);
      const x = Math.round(ox + tx.x);
      if (k > 0.75 && Math.floor(tx.t * 12) % 2) continue;
      drawText(ctx, tx.text, x + 1, y + 1, P.ink);
      drawText(ctx, tx.text, x, y, tx.color);
    }
  }

  drawTitle(ctx, ox, oy, t) {
    const title = 'ORBIT POND';
    const scale = this.W >= 300 ? 3 : 2;
    const w = measureText(title, scale);
    const space = oy + SCENE_TOP;
    const y = space > 5 * scale + 30 ? Math.round(space / 2 - 12) : 6;
    const x = Math.round(this.W / 2 - w / 2);
    const fade = this.titleFade;
    if (fade < 1 && Math.floor(t * 20) % 2 && fade < 0.5) return;
    const wave = (i) => Math.round(Math.sin(t * 2 + i * 0.6) * 1.2);
    drawText(ctx, title, x + scale, y + scale, P.neb2, scale, wave);
    drawText(ctx, title, x, y, P.star, scale, wave);
    const sub = 'A QUIET LAKE ADRIFT';
    drawText(ctx, sub, Math.round(this.W / 2 - measureText(sub) / 2), y + 5 * scale + 6, P.starBlue);
  }
}
