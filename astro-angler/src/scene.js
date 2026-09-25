// Renders the world at a low internal resolution. Everything is drawn with
// whole pixels; static pieces (nebula, island, lake bed, planet) are baked
// once into offscreen canvases, dynamic bits are a few hundred fillRects.

import { C, sprites, ASTRO_HAND, ASTRO_SEAT } from './art.js';
import { drawText, measure, wrap, LINE_H } from './font.js';
import { S, DOCK } from './game.js';

const LAKE_RX = 62, LAKE_RY = 14;
const RIM_RX = 71, RIM_RY = 20;
const ROD_LEN = 25;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

function hash(n) {
  n = (n << 13) ^ n;
  return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824;
}
const h01 = (n) => (hash(n) + 1) / 2;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A canvas you can poke pixels into, then bake. */
function pixelCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const cache = new Map();
  return {
    c, w, h,
    set(x, y, hex) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h || !hex) return;
      let rgb = cache.get(hex);
      if (!rgb) cache.set(hex, (rgb = hexRgb(hex)));
      const i = (y * w + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    },
    get(x, y) { return img.data[((y | 0) * w + (x | 0)) * 4 + 3] > 0; },
    bake() { g.putImageData(img, 0, 0); return c; },
  };
}

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.W = 0; this.H = 0;
    this.t = 0;
    this.particles = [];
    this.ripples = [];
    this.freed = [];
    this.bonusStars = [];
    this.shooting = null;
    this.nextShooting = 8;
    this.satellite = null;
    this.nextSatellite = 40;
    this.shake = 0;
    this.rod = { a: -0.95, v: 0 };
    this.flick = 0;
    this.lastState = null;
    this.bakeStatic();
    this.shadows = [0, 1, 2].map((i) => ({
      u: -0.2 + i * 0.3, v: 0.1 * (i - 1), tu: 0, tv: 0, speed: 0.05 + i * 0.02, size: 1 + (i % 2), heading: 1,
    }));
    this.droplet = 0;
  }

  // ------------------------------------------------------------ baking
  bakeStatic() {
    this.spans = [];
    for (let dy = -LAKE_RY; dy <= LAKE_RY; dy++) {
      this.spans.push(Math.floor(LAKE_RX * Math.sqrt(Math.max(0, 1 - (dy / (LAKE_RY + 0.5)) ** 2))));
    }
    this.nebula = this.bakeNebula(256);
    this.island = this.bakeIsland();
    this.water = this.bakeWater();
    this.planet = this.bakePlanet();
    this.tent = this.bakeTent();
  }

  bakeNebula(N) {
    const p = pixelCanvas(N, N);
    const grid = (g, seed) => (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const fx = ease(x - xi), fy = ease(y - yi);
      const v = (a, b) => h01(((a % g) + g) % g * 131 + (((b % g) + g) % g) * 977 + seed);
      return lerp(lerp(v(xi, yi), v(xi + 1, yi), fx), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), fx), fy);
    };
    const o1 = grid(4, 11), o2 = grid(8, 57), o3 = grid(16, 203);
    const ramp = [null, C.neb1, C.neb2, C.neb3, C.neb4];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = (x / N), ny = (y / N);
      let n = o1(nx * 4, ny * 4) * 0.55 + o2(nx * 8, ny * 8) * 0.3 + o3(nx * 16, ny * 16) * 0.15;
      n = Math.max(0, (n - 0.54) / 0.42); // mostly empty space
      const level = n * 3.6 + dither(x, y) - 0.5;
      const idx = Math.max(0, Math.min(4, Math.floor(level)));
      if (idx > 0) p.set(x, y, ramp[idx]);
    }
    return p.bake();
  }

  bakeIsland() {
    const depthMax = 58;
    const W = RIM_RX * 2 + 3, H = RIM_RY * 2 + depthMax + 8;
    const ox = RIM_RX + 1, oy = RIM_RY + 1; // lake centre inside this canvas
    const p = pixelCanvas(W, H);
    const rimCy = oy + 1;
    const bottom = [];
    // Underside: a jagged, lit-from-the-upper-left chunk of rock.
    for (let x = -RIM_RX; x <= RIM_RX; x++) {
      const nx = x / RIM_RX;
      const topY = RIM_RY * Math.sqrt(Math.max(0, 1 - nx * nx));
      const k = Math.abs(nx + 0.12) / 1.12;
      const jag = Math.floor(h01(Math.floor((x + 200) / 3)) * 5) + (Math.floor(h01(x + 991) * 3) === 0 ? 2 : 0);
      const depth = topY + depthMax * Math.pow(Math.max(0, 1 - Math.pow(k, 1.7)), 1.2) + jag - 2;
      bottom[x + RIM_RX] = depth;
      for (let y = 0; y <= depth; y++) {
        const sy = rimCy + y;
        const fall = (y - topY) / Math.max(1, depth - topY);
        let l = 2.9 - nx * 1.3 - fall * 2.4;
        const strata = (y + Math.floor(Math.sin(x * 0.21) * 2.2)) % 9 === 0 && y > topY + 2;
        if (strata) l -= 0.7;
        const shade = Math.max(0, Math.min(4, Math.floor(l + dither(x, sy))));
        p.set(ox + x, sy, [C.rock0, C.rock1, C.rock2, C.rock3, C.rock4][shade]);
      }
    }
    // Craters + a glowing crystal vein.
    const crater = (cx, cy, r) => {
      for (let y = -r; y <= r; y++) for (let x = -r * 2; x <= r * 2; x++) {
        const d = (x / (r * 2)) ** 2 + (y / r) ** 2;
        if (d <= 1) p.set(ox + cx + x, rimCy + cy + y, d > 0.55 && y > 0 ? C.rock3 : C.rock1);
      }
    };
    crater(-34, 30, 2); crater(10, 40, 2); crater(-8, 27, 1); crater(38, 26, 1);
    const cry = [[22, 34], [23, 33], [23, 35], [24, 34], [21, 36], [25, 36], [24, 32]];
    for (const [x, y] of cry) p.set(ox + x, rimCy + y, (x + y) % 3 ? C.crystal : C.star);
    // Top surface (mossy rim) and the lake bed.
    for (let y = -RIM_RY; y <= RIM_RY; y++) for (let x = -RIM_RX; x <= RIM_RX; x++) {
      const d = (x / (RIM_RX + 0.5)) ** 2 + (y / (RIM_RY + 0.5)) ** 2;
      if (d > 1) continue;
      const sx = ox + x, sy = rimCy + y;
      const front = y > 0;
      let col;
      if (d > 0.86 && front) col = dither(sx, sy) < 0.5 ? C.moss0 : C.moss1;
      else if (d > 0.9 && !front) col = dither(sx, sy) < 0.6 ? C.moss2 : C.moss1;
      else col = dither(sx, sy) < 0.15 ? C.moss2 : C.moss1;
      if (x < -RIM_RX * 0.5 && !front && dither(sx, sy) < 0.3) col = C.moss2;
      p.set(sx, sy, col);
    }
    // Lip highlight on the front edge where grass meets cliff.
    for (let x = -RIM_RX + 2; x <= RIM_RX - 2; x++) {
      const y = Math.floor(RIM_RY * Math.sqrt(1 - (x / (RIM_RX + 0.5)) ** 2));
      p.set(ox + x, rimCy + y + 1, x < 10 ? C.rock4 : C.rock3);
    }
    for (let y = -LAKE_RY - 1; y <= LAKE_RY + 1; y++) {
      const hw = Math.floor((LAKE_RX + 1) * Math.sqrt(Math.max(0, 1 - (y / (LAKE_RY + 1.5)) ** 2)));
      for (let x = -hw; x <= hw; x++) p.set(ox + x, oy + y, y < 0 ? C.rock2 : C.moss0);
    }
    // Grass tufts on the back rim.
    for (let i = 0; i < 26; i++) {
      const a = Math.PI + (i / 26) * Math.PI;
      const x = Math.round(Math.cos(a) * (RIM_RX - 3 - h01(i) * 3));
      const y = Math.round(Math.sin(a) * (RIM_RY - 2)) + rimCy;
      p.set(ox + x, y - 1, C.moss2);
      if (i % 3 === 0) { p.set(ox + x, y - 2, C.moss3); p.set(ox + x + 1, y - 1, C.moss2); }
    }
    // Front reeds.
    for (const [x, hgt] of [[-22, 3], [-20, 4], [30, 3], [33, 5], [35, 3], [52, 2]]) {
      const y = Math.floor(RIM_RY * Math.sqrt(1 - (x / RIM_RX) ** 2)) + rimCy - 2;
      for (let k = 0; k < hgt; k++) p.set(ox + x, y - k, k === hgt - 1 ? C.moss3 : C.moss2);
    }
    this.islandOrigin = { x: ox, y: oy };
    return p.bake();
  }

  bakeWater() {
    const W = LAKE_RX * 2 + 1, H = LAKE_RY * 2 + 1;
    const p = pixelCanvas(W, H);
    for (let dy = -LAKE_RY; dy <= LAKE_RY; dy++) {
      const hw = this.spans[dy + LAKE_RY];
      const v = dy / LAKE_RY;
      for (let dx = -hw; dx <= hw; dx++) {
        const x = dx + LAKE_RX, y = dy + LAKE_RY;
        const edge = Math.abs(dx) / (hw + 1);
        // Far side reflects the sky glow, near side falls into shadow under the lip.
        let l = 2.2 - v * 1.1 - edge * edge * 0.8;
        if (v < -0.75) l += 0.9;
        if (v > 0.8) l -= 0.8;
        const shade = Math.max(0, Math.min(3, Math.floor(l + dither(x, y) - 0.2)));
        p.set(x, y, [C.water0, C.water1, C.water2, C.water3][shade]);
        if (Math.abs(dx) === hw && v < 0.2) p.set(x, y, C.water3);
      }
    }
    return p.bake();
  }

  bakePlanet() {
    const R = 11, S = 52;
    const p = pixelCanvas(S, S);
    const c = S / 2;
    const ring = (front) => {
      for (let a = 0; a < 720; a++) {
        const t = (a / 720) * Math.PI * 2;
        const isFront = Math.sin(t) > 0;
        if (isFront !== front) continue;
        for (const [rr, col] of [[23, C.starY], [21, '#d9b98a'], [19, '#a88d6a']]) {
          const x = c + Math.cos(t) * rr, y = c + Math.sin(t) * rr * 0.26 + Math.cos(t) * 3;
          p.set(x, y, col);
        }
      }
    };
    ring(false);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y);
      if (d > R + 0.3) continue;
      const light = 1.5 - (x + y) / (R * 1.3) - d / R * 0.5;
      const band = Math.floor((y + 12 + Math.sin(x * 0.4)) / 3) % 2;
      const pal = band ? ['#4a2a3a', '#8a4450', '#d77a5c', '#f2b27c'] : ['#3d2536', '#7a3a4c', '#c46a52', '#e8a06c'];
      const idx = Math.max(0, Math.min(3, Math.floor(light + dither(x + 40, y + 40))));
      p.set(c + x, c + y, pal[idx]);
    }
    ring(true);
    return p.bake();
  }

  bakeTent() {
    const rows = ['.....a.....', '....aab....', '...aaabb...', '..aaakbbb..', '.aaaakkbbb.', 'aaaaakkbbbb'];
    const p = pixelCanvas(13, 8);
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === 'a') p.set(x + 1, y + 1, C.orange);
      else if (ch === 'b') p.set(x + 1, y + 1, '#c9672b');
      else if (ch === 'k') p.set(x + 1, y + 1, C.ink);
    }));
    // outline
    const base = pixelCanvas(13, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 13; x++) {
      if (p.get(x, y)) continue;
      if (p.get(x - 1, y) || p.get(x + 1, y) || p.get(x, y - 1) || p.get(x, y + 1)) base.set(x, y, C.ink);
    }
    const c = base.bake();
    c.getContext('2d').drawImage(p.bake(), 0, 0);
    return c;
  }

  // ------------------------------------------------------------ layout
  resize(W, H) {
    this.W = W; this.H = H;
    this.hintY = H - 13;
    this.hudY = this.hintY - 29;
    this.baseIy = Math.min(Math.floor(H * 0.5), this.hudY - 66);
    this.ix = Math.floor(W / 2) + 6;
    const n = Math.round((W * H) / 190);
    this.stars = [];
    for (let i = 0; i < n; i++) {
      const layer = h01(i * 3 + 1) < 0.62 ? 0 : h01(i * 7 + 2) < 0.75 ? 1 : 2;
      this.stars.push({
        x: h01(i * 13 + 5) * W, y: h01(i * 17 + 9) * H, layer,
        phase: h01(i * 5) * 6.28, speed: 0.6 + h01(i * 11) * 2.2,
        col: [C.starD, C.starB, C.starY][Math.floor(h01(i * 19) * 3)],
      });
    }
  }

  lakeX(u) { return Math.round(this.ix + u * LAKE_RX); }
  lakeY(v) { return Math.round(this.iy + v * LAKE_RY); }
  inLake(x, y) {
    const dy = y - this.iy;
    return dy >= -LAKE_RY && dy <= LAKE_RY && Math.abs(x - this.ix) <= this.spans[dy + LAKE_RY];
  }

  // ------------------------------------------------------------ effects
  splash(u, v, big = false) {
    const x = this.lakeX(u), y = this.lakeY(v);
    this.ripples.push({ x, y, r: 0, max: big ? 10 : 6, life: 0, dur: big ? 1.6 : 1.1 });
    const n = big ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 8 + Math.random() * (big ? 24 : 14);
      this.particles.push({ x, y: y - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 6, life: 0, max: 1.4 + Math.random() * 1.6, col: Math.random() < 0.3 ? C.water5 : C.water4 });
    }
  }
  ripple(u, v, max = 4) {
    this.ripples.push({ x: this.lakeX(u), y: this.lakeY(v), r: 0, max, life: 0, dur: 0.9 });
  }
  sparkle(x, y, n = 10, cols = [C.lamp, C.starY, C.star]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 16;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, g: 0, drag: 2.2, life: 0, max: 0.8 + Math.random() * 0.9, col: cols[i % cols.length], twinkle: true });
    }
  }
  release(species) {
    this.freed.push({ id: species.id, x: this.handPos().x - 4, y: this.handPos().y - 18, t: 0, dur: 5.5, vx: 5 + Math.random() * 6 });
  }
  kick(amount) { this.shake = Math.max(this.shake, amount); }

  // ------------------------------------------------------------ update
  update(dt, game, opts) {
    this.t += dt;
    const reduced = opts.reduced;
    this.reducedCache = reduced;
    this.iy = this.baseIy + (reduced ? 0 : Math.round(Math.sin(this.t * 0.55) * 1.2));
    this.shake = Math.max(0, this.shake - dt * 6);

    // Stars drift: the island is gliding through space.
    const drift = reduced ? 0.25 : 1;
    for (const s of this.stars) {
      s.x -= [1.2, 2.6, 5][s.layer] * dt * drift;
      if (s.x < -2) s.x += this.W + 4;
    }
    for (const b of this.bonusStars) {
      b.x -= 5 * dt * drift;
      if (b.x < -2) b.x += this.W + 4;
    }

    if (!reduced) {
      this.nextShooting -= dt;
      if (this.nextShooting <= 0) {
        this.nextShooting = 14 + Math.random() * 26;
        this.shooting = { x: this.W * (0.35 + Math.random() * 0.6), y: 4 + Math.random() * this.baseIy * 0.4, vx: -70 - Math.random() * 40, vy: 22 + Math.random() * 14, life: 0 };
      }
    }
    if (this.shooting) {
      const s = this.shooting;
      s.x += s.vx * dt; s.y += s.vy * dt; s.life += dt;
      if (s.life > 1.4) this.shooting = null;
    }
    this.nextSatellite -= dt;
    if (this.nextSatellite <= 0) {
      this.nextSatellite = 50 + Math.random() * 60;
      this.satellite = { x: this.W + 4, y: 10 + Math.random() * this.baseIy * 0.5 };
    }
    if (this.satellite) {
      this.satellite.x -= 9 * dt;
      if (this.satellite.x < -6) this.satellite = null;
    }

    // Lake life: drifting water droplets rise off the surface in low gravity.
    this.droplet -= dt;
    if (this.droplet <= 0) {
      this.droplet = 0.9 + Math.random() * 1.6;
      const u = (Math.random() - 0.5) * 1.4, v = (Math.random() - 0.5) * 1.2;
      this.particles.push({ x: this.lakeX(u), y: this.lakeY(v), vx: (Math.random() - 0.5) * 2, vy: -3 - Math.random() * 3, g: -0.5, life: 0, max: 4 + Math.random() * 3, col: Math.random() < 0.5 ? C.water4 : C.water5, wobble: Math.random() * 6 });
      if (Math.random() < 0.3) this.ripple(u, v, 3);
    }
    for (const p of this.particles) {
      p.life += dt;
      p.vy += p.g * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      p.x += (p.vx + (p.wobble ? Math.sin(this.t * 2 + p.wobble) * 1.5 : 0)) * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const r of this.ripples) { r.life += dt; r.r = r.max * ease(Math.min(1, r.life / r.dur)); }
    this.ripples = this.ripples.filter((r) => r.life < r.dur);

    for (const f of this.freed) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y -= (10 + f.t * 3) * dt;
      if (Math.random() < dt * 10) this.particles.push({ x: f.x + 4, y: f.y + 3, vx: 0, vy: 0, g: 0, life: 0, max: 0.9, col: C.starY, twinkle: true });
      if (f.t >= f.dur) {
        this.bonusStars.push({ x: f.x + 4, y: f.y + 3, phase: Math.random() * 6 });
        if (this.bonusStars.length > 40) this.bonusStars.shift();
        this.sparkle(f.x + 4, f.y + 3, 6, [C.star, C.starY]);
      }
    }
    this.freed = this.freed.filter((f) => f.t < f.dur);

    // Wandering fish shadows.
    for (const s of this.shadows) {
      const dx = s.tu - s.u, dy = s.tv - s.v, d = Math.hypot(dx, dy);
      if (d < 0.05) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.75;
        s.tu = Math.cos(a) * r; s.tv = Math.sin(a) * r;
      } else {
        s.u += (dx / d) * s.speed * dt; s.v += (dy / d) * s.speed * dt * 0.6;
        if (Math.abs(dx) > 0.02) s.heading = Math.sign(dx);
      }
    }

    this.updateRod(dt, game);
  }

  updateRod(dt, game) {
    if (game.state !== this.lastState) {
      if (game.state === S.CAST) this.flick = 0.18;
      this.lastState = game.state;
    }
    this.flick = Math.max(0, this.flick - dt);
    let target = -0.95;
    switch (game.state) {
      case S.CHARGE: target = -0.95 - game.power * 1.25; break;
      case S.CAST: target = this.flick > 0 ? -0.25 : -0.7; break;
      case S.WAIT: target = -0.72 + game.dip * 0.12; break;
      case S.BITE: target = -0.5 + Math.sin(this.t * 30) * 0.05; break;
      case S.REEL: target = -1.05 + game.reel.tension * 0.45 + Math.sin(this.t * 40) * 0.03 * game.reel.tension; break;
      case S.LAND: target = -1.3; break;
    }
    const k = 160, damp = 18;
    this.rod.v += ((target - this.rod.a) * k - this.rod.v * damp) * dt;
    this.rod.a += this.rod.v * dt;
  }

  // ------------------------------------------------------------ positions
  astroPos() {
    const dockY = this.iy - 1;
    return { x: this.ix - 68, y: dockY - ASTRO_SEAT + 1 };
  }
  handPos() {
    const a = this.astroPos();
    return { x: a.x + ASTRO_HAND.x, y: a.y + ASTRO_HAND.y };
  }
  rodTip(game) {
    const h = this.handPos();
    let x = h.x + Math.cos(this.rod.a) * ROD_LEN, y = h.y + Math.sin(this.rod.a) * ROD_LEN;
    if (game.state === S.REEL || game.state === S.BITE) {
      const b = this.bobberPos(game, true);
      const pull = game.state === S.BITE ? 3 : 2 + game.reel.tension * 6;
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1;
      x += (dx / d) * pull; y += (dy / d) * pull;
    }
    return { x, y };
  }
  bobberPos(game, raw = false) {
    const t = game.target;
    switch (game.state) {
      case S.CAST: {
        const tip = this.rodTipRaw();
        const k = Math.min(1, game.st / game.flight);
        const e = 1 - (1 - k) ** 1.6;
        const ex = this.lakeX(t.u), ey = this.lakeY(t.v);
        const arc = (18 + game.power * 26) * 4 * e * (1 - e);
        return { x: lerp(tip.x, ex, e), y: lerp(tip.y, ey, e) - arc, air: true };
      }
      case S.WAIT: case S.BITE: {
        const bob = Math.round(Math.sin(this.t * 2.2) * 0.6);
        return { x: this.lakeX(t.u), y: this.lakeY(t.v) + (raw ? 0 : bob) + (game.dip > 0.4 ? 1 : 0), under: game.state === S.BITE };
      }
      case S.REEL:
        return { x: this.lakeX(game.fish.u), y: this.lakeY(game.fish.v), under: true };
      default: {
        if (raw) return this.rodTipRaw();
        const tip = this.rodTipRaw();
        return { x: tip.x + Math.round(Math.sin(this.t * 1.3) * 1), y: tip.y + 7, hang: true };
      }
    }
  }
  rodTipRaw() {
    const h = this.handPos();
    return { x: h.x + Math.cos(this.rod.a) * ROD_LEN, y: h.y + Math.sin(this.rod.a) * ROD_LEN };
  }

  // ------------------------------------------------------------ drawing
  draw(game, ui) {
    const g = this.ctx, W = this.W, H = this.H;
    const reduced = ui.reduced;
    g.imageSmoothingEnabled = false;
    g.save();
    if (this.shake > 0 && !reduced) g.translate(Math.round((Math.random() - 0.5) * this.shake * 2), Math.round((Math.random() - 0.5) * this.shake));

    g.fillStyle = C.void;
    g.fillRect(-4, -4, W + 8, H + 8);
    this.drawSky(g, reduced, ui);
    this.drawPebbles(g, false);
    this.drawIsland(g, game);
    this.drawWater(g, game);
    this.drawDock(g);
    this.drawLine(g, game);
    this.drawAstronaut(g, game);
    this.drawPebbles(g, true);
    this.drawParticles(g);
    this.drawFreed(g);
    if (game.state === S.LAND) this.drawLeap(g, game);
    this.drawWorldHud(g, game, ui);
    g.restore();
    this.drawHud(g, game, ui);
  }

  drawSky(g, reduced, ui) {
    const W = this.W, H = this.H;
    const nx = Math.floor((this.t * (reduced ? 0.3 : 1.1)) % 256);
    for (let y = -((this.baseIy * 0.2) | 0); y < H; y += 256) for (let x = -nx; x < W; x += 256) g.drawImage(this.nebula, x, y);

    if (ui.aurora) this.drawAurora(g);

    const tw = reduced ? 0 : this.t;
    for (const s of this.stars) {
      if (s.layer === 2) continue;
      const b = Math.sin(tw * s.speed + s.phase);
      if (s.layer === 0) { if (b > -0.6) { g.fillStyle = b > 0.7 ? s.col : C.starM; g.fillRect(s.x | 0, s.y | 0, 1, 1); } }
      else { g.fillStyle = b > -0.2 ? s.col : C.starD; g.fillRect(s.x | 0, s.y | 0, 1, 1); }
    }
    // Planet drifts very slowly across the sky.
    const pw = this.planet.width;
    const span = W + pw * 2;
    const px = ((W * 0.84 - this.t * 0.06) % span + span) % span - pw / 2;
    g.drawImage(this.planet, Math.round(px), Math.round(Math.max(2, this.baseIy * 0.2 - pw / 2)));
    // A little grey moon.
    const mx = Math.round(W * 0.16), my = Math.round(this.baseIy * 0.22);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      if (x * x + y * y > 10) continue;
      g.fillStyle = x + y < -1 ? C.rock4 : x + y < 2 ? C.rock3 : C.rock2;
      g.fillRect(mx + x, my + y, 1, 1);
    }
    for (const s of this.stars) {
      if (s.layer !== 2) continue;
      const b = Math.sin(tw * s.speed + s.phase);
      const x = s.x | 0, y = s.y | 0;
      g.fillStyle = s.col;
      g.fillRect(x, y, 1, 1);
      if (b > 0.55) {
        g.fillStyle = C.starM;
        g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1);
      }
    }
    for (const b of this.bonusStars) {
      const on = Math.sin(tw * 1.7 + b.phase) > -0.3;
      g.fillStyle = on ? C.starY : C.lamp;
      g.fillRect(b.x | 0, b.y | 0, 1, 1);
      if (on && Math.sin(tw * 0.9 + b.phase) > 0.6) {
        g.fillStyle = C.neb5;
        g.fillRect((b.x | 0) - 1, b.y | 0, 1, 1); g.fillRect((b.x | 0) + 1, b.y | 0, 1, 1);
      }
    }
    if (this.shooting) {
      const s = this.shooting;
      const cols = [C.star, C.starB, C.starB, C.starD, C.starD, C.starM, C.starM];
      for (let i = cols.length - 1; i >= 0; i--) {
        g.fillStyle = cols[i];
        g.fillRect(Math.round(s.x - (s.vx * i) / 60), Math.round(s.y - (s.vy * i) / 60), 1, 1);
      }
    }
    if (this.satellite) {
      const s = this.satellite, x = s.x | 0, y = s.y | 0;
      g.fillStyle = C.starM; g.fillRect(x - 2, y, 5, 1);
      g.fillStyle = C.rock4; g.fillRect(x, y, 1, 1);
      if (Math.sin(this.t * 6) > 0.6) { g.fillStyle = C.red; g.fillRect(x, y - 1, 1, 1); }
    }
  }

  drawAurora(g) {
    const W = this.W;
    const top = Math.max(4, Math.floor(this.baseIy * 0.1));
    for (let x = 0; x < W; x++) {
      const y0 = top + Math.sin(x * 0.045 + this.t * 0.4) * 5 + Math.sin(x * 0.11 - this.t * 0.25) * 3;
      const len = 6 + Math.sin(x * 0.07 + this.t * 0.6) * 4;
      for (let k = 0; k < len; k++) {
        if (dither(x, k) > 0.75 - k / len * 0.5) continue;
        g.fillStyle = k < 2 ? C.moss2 : k < len * 0.6 ? C.moss0 : C.neb3;
        g.fillRect(x, Math.round(y0 + k), 1, 1);
      }
    }
  }

  drawPebbles(g, front) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + this.t * (0.06 + (i % 3) * 0.015);
      const isFront = Math.sin(a) > 0;
      if (isFront !== front) continue;
      const x = Math.round(this.ix + Math.cos(a) * (88 + (i % 2) * 9));
      const y = Math.round(this.iy + 16 + Math.sin(a) * (16 + (i % 3) * 4) + Math.sin(this.t + i) * 1);
      const s = 1 + (i % 3);
      g.fillStyle = front ? C.rock2 : C.rock1;
      g.fillRect(x, y, s + 1, s);
      g.fillStyle = front ? C.rock4 : C.rock2;
      g.fillRect(x, y, 1, 1);
      if (s > 1) { g.fillStyle = C.rock0; g.fillRect(x + s, y + s - 1, 1, 1); }
    }
  }

  drawIsland(g, game) {
    const o = this.islandOrigin;
    g.drawImage(this.island, this.ix - o.x, this.iy - o.y);
    // Crystal glint.
    if (Math.sin(this.t * 1.3) > 0.85) { g.fillStyle = C.star; g.fillRect(this.ix + 23, this.iy + 1 + 33, 1, 1); }
    // Tent on the back-left rim, pine on the back-right.
    g.drawImage(this.tent, this.ix + 12, this.iy - 24);
    g.drawImage(sprites.pine, this.ix + 38, this.iy - 29);
    if (Math.sin(this.t * 2.1) > 0) { g.fillStyle = C.lampW; g.fillRect(this.ix + 44, this.iy - 28, 1, 1); }
    // Lantern glow reflected on the grass.
    this.drawGlow(g, this.ix - 69, this.iy - 13, 12, 0.18);
  }

  drawGlow(g, cx, cy, r, alpha) {
    g.save();
    g.globalAlpha = alpha * (0.85 + Math.sin(this.t * 7) * 0.05 + Math.sin(this.t * 13) * 0.05);
    g.fillStyle = C.lamp;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y) / r;
      if (d <= 1 && dither(cx + x, cy + y) > d) g.fillRect(cx + x, cy + y, 1, 1);
    }
    g.restore();
  }

  drawWater(g, game) {
    const ix = this.ix, iy = this.iy;
    g.drawImage(this.water, ix - LAKE_RX, iy - LAKE_RY);

    // Fish shadows under the surface.
    const drawShadow = (u, v, size, heading, col, alphaHide = false) => {
      const cx = this.lakeX(u), cy = this.lakeY(v);
      const rx = 2 + size * 1.5, ry = size > 1 ? 1 : 0;
      g.fillStyle = col;
      for (let y = -ry; y <= ry; y++) {
        const hw = Math.round(rx * Math.sqrt(1 - (y / (ry + 1)) ** 2));
        for (let x = -hw; x <= hw; x++) if (this.inLake(cx + x, cy + y) && !alphaHide) g.fillRect(cx + x, cy + y, 1, 1);
      }
      const tx = cx - heading * (Math.round(rx) + 1);
      const wag = Math.round(Math.sin(this.t * 8 + u * 9));
      for (let k = -1; k <= 1; k++) if (this.inLake(tx - heading, cy + k + wag)) g.fillRect(tx - heading, cy + k + wag, 1, 1);
      if (this.inLake(tx, cy)) g.fillRect(tx, cy, 1, 1);
    };
    for (const s of this.shadows) drawShadow(s.u, s.v, s.size, s.heading, C.water1);
    const f = game.fish;
    if (f && (game.state === S.WAIT || game.state === S.BITE || game.state === S.REEL || game.state === S.LOST)) {
      const fading = f.phase === 'flee' && f.fleeT > 0.8;
      if (!fading) drawShadow(f.u, f.v, f.species.shadow, f.heading, f.species.id === 'whale' ? C.water3 : C.water0);
    }

    // Shimmer streaks drifting across the surface.
    const t = this.t;
    for (let i = 0; i < 16; i++) {
      const vy = Math.round((h01(i * 7) * 2 - 1) * (LAKE_RY - 1));
      const hw = this.spans[vy + LAKE_RY];
      if (hw < 4) continue;
      const len = 2 + Math.floor(h01(i * 3) * 5);
      const x0 = ((h01(i * 5) * 2 * hw + t * (2 + i % 4)) % (2 * hw)) - hw;
      const vis = Math.sin(t * (0.8 + h01(i) * 0.9) + i * 2);
      if (vis < 0.1) continue;
      g.fillStyle = vis > 0.75 ? C.water4 : C.water3;
      for (let k = 0; k < len; k++) {
        const x = Math.round(ix + x0 + k);
        if (this.inLake(x, iy + vy)) g.fillRect(x, iy + vy, 1, 1);
      }
    }
    // Star reflections.
    for (let i = 0; i < 12; i++) {
      const x = Math.round(ix + (h01(i * 31) * 2 - 1) * LAKE_RX * 0.9);
      const y = Math.round(iy + (h01(i * 37) * 2 - 1) * LAKE_RY * 0.8);
      if (!this.inLake(x, y)) continue;
      const b = Math.sin(t * (1 + h01(i) * 2) + i);
      if (b > 0.2) { g.fillStyle = b > 0.8 ? C.water5 : C.starD; g.fillRect(x, y, 1, 1); }
    }
    // Lantern reflection: a wobbly column of warm dashes.
    const q = Math.floor(t * 8);
    for (let k = 0; k < 6; k++) {
      const y = iy - 9 + k * 2;
      const x = ix - 60 + Math.round(hash(q * 17 + k) * 1.5);
      const w = k < 2 ? 3 : 2 - (k > 4 ? 1 : 0);
      if (!this.inLake(x, y) || w <= 0) continue;
      g.fillStyle = k < 3 ? C.lamp : C.orange;
      g.fillRect(x, y, w, 1);
    }
    // Ripples.
    for (const r of this.ripples) {
      const fade = r.life / r.dur;
      g.fillStyle = fade < 0.5 ? C.water5 : C.water4;
      const steps = Math.max(12, Math.round(r.r * 8));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(r.x + Math.cos(a) * r.r * 1.6), y = Math.round(r.y + Math.sin(a) * r.r * 0.45);
        if ((i + (fade > 0.6 ? 1 : 0)) % (fade > 0.6 ? 2 : 1) === 0 && this.inLake(x, y)) g.fillRect(x, y, 1, 1);
      }
    }
  }

  drawDock(g) {
    const ix = this.ix, y = this.iy - 1;
    const x0 = ix - 78, x1 = ix - 50;
    // Posts in the water.
    g.fillStyle = C.wood0;
    for (const px of [x0 + 12, x1 - 2]) g.fillRect(px, y + 2, 2, 4);
    g.fillStyle = C.water4;
    g.fillRect(x1 - 3, y + 6, 1, 1); g.fillRect(x1, y + 6, 1, 1);
    // Planks.
    for (let x = x0; x <= x1; x++) {
      g.fillStyle = (x - x0) % 4 === 3 ? C.wood1 : C.wood3;
      g.fillRect(x, y - 1, 1, 1);
      g.fillStyle = C.wood2; g.fillRect(x, y, 1, 1);
      g.fillStyle = C.wood1; g.fillRect(x, y + 1, 1, 1);
    }
    g.fillStyle = C.ink;
    g.fillRect(x0, y + 2, x1 - x0 + 1, 1);
    g.fillRect(x1 + 1, y - 1, 1, 3);
    // Lantern post.
    const lx = ix - 72;
    g.fillStyle = C.wood1; g.fillRect(lx, y - 17, 1, 16);
    g.fillStyle = C.wood2; g.fillRect(lx, y - 17, 3, 1);
    g.fillStyle = C.ink; g.fillRect(lx + 2, y - 16, 1, 1);
    const flick = Math.sin(this.t * 9) + Math.sin(this.t * 23) > 1.2;
    g.fillStyle = C.ink; g.fillRect(lx + 1, y - 15, 3, 5);
    g.fillStyle = flick ? C.lamp : C.lampW; g.fillRect(lx + 2, y - 14, 1, 3);
    g.fillStyle = C.orange; g.fillRect(lx + 1, y - 11, 3, 1);
    this.drawGlow(g, lx + 2, y - 13, 7, 0.28);
  }

  drawAstronaut(g, game) {
    const a = this.astroPos();
    const breathe = !this.reducedCache && Math.sin(this.t * 1.6) > 0.7 && game.state !== S.REEL ? -1 : 0;
    g.drawImage(sprites.astro, a.x, a.y + breathe);
    // A glint slides across the visor now and then.
    const k = (this.t * 0.35) % 3;
    if (k < 1) {
      const gx = a.x + 7 + Math.floor(k * 6), gy = a.y + 4 + Math.floor(k * 3);
      g.fillStyle = C.star;
      g.fillRect(gx, gy + breathe, 1, 1);
    }
    // Lantern warmth on the visor.
    g.fillStyle = C.lamp;
    g.fillRect(a.x + 7, a.y + 8 + breathe, 1, 1);
    // Rod.
    const h = this.handPos();
    const tip = this.rodTip(game);
    const ctrlX = h.x + Math.cos(this.rod.a) * ROD_LEN * 0.6, ctrlY = h.y + Math.sin(this.rod.a) * ROD_LEN * 0.6;
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) * (1 - t) * h.x + 2 * (1 - t) * t * ctrlX + t * t * tip.x;
      const y = (1 - t) * (1 - t) * h.y + 2 * (1 - t) * t * ctrlY + t * t * tip.y;
      g.fillStyle = t < 0.25 ? C.wood1 : t < 0.95 ? C.wood3 : C.red;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    // Reel spins while reeling.
    const rx = Math.round(h.x + Math.cos(this.rod.a) * 4), ry = Math.round(h.y + Math.sin(this.rod.a) * 4) + 1;
    g.fillStyle = C.suitD; g.fillRect(rx, ry, 2, 2);
    const spin = game.state === S.REEL && game.held ? Math.floor(this.t * 20) % 2 : 0;
    g.fillStyle = C.star; g.fillRect(rx + spin, ry + (1 - spin), 1, 1);
    // Gloves over the rod.
    g.fillStyle = C.suitS; g.fillRect(h.x - 1, h.y - 1, 2, 2);
  }

  drawLine(g, game) {
    const tip = this.rodTip(game);
    const b = this.bobberPos(game);
    let sag = 5;
    if (b.hang) sag = 0;
    else if (game.state === S.CAST) sag = 3;
    else if (game.state === S.BITE) sag = 0;
    else if (game.state === S.REEL) sag = (1 - game.reel.tension) * 5;
    const showLine = !(game.state === S.LOST && game.lostKind === 'snap' && game.st < 1.8) && game.state !== S.LAND && game.state !== S.CAUGHT;
    if (showLine) {
      const mx = (tip.x + b.x) / 2, my = (tip.y + b.y) / 2 + sag;
      const len = Math.hypot(b.x - tip.x, b.y - tip.y);
      const n = Math.max(4, Math.ceil(len * 1.3));
      g.fillStyle = game.state === S.REEL && game.reel.tension > 0.8 && Math.sin(this.t * 30) > 0 ? C.red : C.starD;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = (1 - t) * (1 - t) * tip.x + 2 * (1 - t) * t * mx + t * t * b.x;
        const y = (1 - t) * (1 - t) * tip.y + 2 * (1 - t) * t * my + t * t * b.y;
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    } else if (game.state === S.LOST) {
      g.fillStyle = C.starD;
      for (let k = 0; k < 4; k++) g.fillRect(Math.round(tip.x + Math.sin(this.t * 6 + k) * (k / 3)), Math.round(tip.y) + k, 1, 1);
    }
    if (!showLine || game.state === S.REEL) return;
    // Bobber.
    const bx = Math.round(b.x) - 2, by = Math.round(b.y) - 4;
    if (b.under) {
      const j = Math.round(Math.sin(this.t * 40));
      g.fillStyle = C.red; g.fillRect(bx + 2 + j, by + 4, 1, 1);
      g.fillStyle = C.water5; g.fillRect(bx, by + 5, 1, 1); g.fillRect(bx + 4, by + 5, 1, 1);
    } else if (b.air || b.hang) {
      g.drawImage(sprites.bobber, bx, by);
    } else {
      g.drawImage(sprites.bobber, 0, 0, 5, 5, bx, by, 5, 5);
      g.fillStyle = C.water4; g.fillRect(bx, by + 5, 1, 1); g.fillRect(bx + 4, by + 5, 1, 1);
    }
  }

  drawLeap(g, game) {
    const c = game.lastCatch;
    const spr = sprites.fish[c.species.id];
    const k = Math.min(1, game.st / 1.1);
    const sx = this.lakeX(DOCK.u + 0.14), sy = this.lakeY(DOCK.v);
    const h = this.handPos();
    const ex = h.x - 2, ey = h.y - 26;
    const x = lerp(sx, ex, ease(k)) - spr.width / 2, y = lerp(sy, ey, k) - Math.sin(k * Math.PI) * 26 - spr.height / 2;
    g.save();
    if (k < 0.5) { g.translate(Math.round(x) + spr.width, 0); g.scale(-1, 1); g.drawImage(spr, 0, Math.round(y)); }
    else g.drawImage(spr, Math.round(x), Math.round(y));
    g.restore();
  }

  drawParticles(g) {
    for (const p of this.particles) {
      if (p.twinkle && Math.sin(p.life * 30) < -0.3) continue;
      const fade = p.life / p.max;
      g.fillStyle = fade > 0.75 ? C.starM : p.col;
      g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }

  drawFreed(g) {
    for (const f of this.freed) {
      const spr = sprites.fish[f.id];
      const k = f.t / f.dur;
      if (k > 0.7 && Math.floor(f.t * 12) % 2) continue; // blink out into a star
      g.save();
      if (k > 0.55) g.globalAlpha = 1 - (k - 0.55) / 0.45;
      g.drawImage(spr, Math.round(f.x - spr.width / 2 + Math.sin(f.t * 3) * 2), Math.round(f.y - spr.height / 2));
      g.restore();
    }
  }

  // HUD bits that live in the (shakeable) world: charge meter, bite mark.
  drawWorldHud(g, game, ui) {
    if (game.state === S.CHARGE) {
      const a = this.astroPos();
      const x = a.x - 6, y0 = a.y - 1, hgt = 20;
      g.fillStyle = C.ink; g.fillRect(x - 1, y0 - 1, 5, hgt + 2);
      g.fillStyle = C.neb2; g.fillRect(x, y0, 3, hgt);
      const f = Math.round(game.power * hgt);
      for (let i = 0; i < f; i++) {
        g.fillStyle = i > hgt * 0.85 ? C.lampW : i > hgt * 0.55 ? C.lamp : C.orange;
        g.fillRect(x, y0 + hgt - 1 - i, 3, 1);
      }
      // Landing marker preview on the water.
      const u = -0.62 + game.power * 1.42;
      const mx = this.lakeX(u), my = this.iy;
      const blink = ui.reduced || Math.sin(this.t * 12) > -0.5;
      if (blink) {
        g.fillStyle = C.lampW;
        g.fillRect(mx - 2, my, 1, 1); g.fillRect(mx + 2, my, 1, 1); g.fillRect(mx, my - 1, 1, 1); g.fillRect(mx, my + 1, 1, 1);
      }
    }
    if (game.state === S.BITE) {
      const b = this.bobberPos(game);
      const jump = ui.reduced ? 0 : Math.round(Math.abs(Math.sin(this.t * 10)) * -2);
      drawText(g, '!', b.x + 1, b.y - 20 + jump, C.lampW, { align: 'center', scale: 2, shadow: C.redD });
    }
    if (game.state === S.WAIT && game.fish && game.fish.phase === 'nibble' && game.dip > 0.3) {
      const b = this.bobberPos(game);
      drawText(g, '?', b.x, b.y - 13, C.starB, { align: 'center' });
    }
  }

  // Screen-space UI: title, hints, reel gauges, catch card, toasts.
  drawHud(g, game, ui) {
    const W = this.W;
    if (game.state === S.TITLE) this.drawTitle(g, ui);
    if (game.state === S.REEL) this.drawReelHud(g, game, ui);
    if (game.state === S.CAUGHT) this.drawCard(g, game, ui);

    if (ui.toast && ui.toast.t < ui.toast.dur) {
      const y = this.hudY + 8;
      const lines = wrap(ui.toast.text, W - 16);
      if (ui.toast.t > ui.toast.dur - 0.4) g.globalAlpha = (ui.toast.dur - ui.toast.t) / 0.4;
      lines.forEach((l, i) => drawText(g, l, W / 2, y + i * LINE_H - (lines.length - 1) * LINE_H, ui.toast.color || C.starY, { align: 'center' }));
      g.globalAlpha = 1;
    }
    if (ui.hint && game.state !== S.TITLE) {
      const lines = wrap(ui.hint, W - 12);
      const blink = ui.hintUrgent && !ui.reduced ? Math.sin(this.t * 14) > -0.4 : true;
      if (blink) lines.forEach((l, i) => drawText(g, l, W / 2, this.hintY - (lines.length - 1 - i) * LINE_H, ui.hintUrgent ? C.lampW : C.starB, { align: 'center', shadow: ui.hintUrgent ? C.redD : C.void }));
    }
  }

  drawTitle(g, ui) {
    const W = this.W;
    const y = Math.max(10, Math.floor((this.baseIy - 44) / 2) - 12);
    const scale = W >= 300 && this.H >= 220 ? 3 : 2;
    const bob = ui.reduced ? 0 : Math.round(Math.sin(this.t * 1.2));
    drawText(g, 'ASTRO ANGLER', W / 2 + scale, y + bob + scale, C.neb4, { align: 'center', scale, shadow: null });
    drawText(g, 'ASTRO ANGLER', W / 2, y + bob, C.lamp, { align: 'center', scale, shadow: C.redD });
    wrap('a small lake, adrift among the stars', W - 16).forEach((l, i) => drawText(g, l, W / 2, y + 8 * scale + 5 + i * LINE_H, C.starB, { align: 'center' }));
    const blink = ui.reduced || Math.sin(this.t * 3.2) > -0.5;
    const lines = wrap(ui.startPrompt, W - 16);
    if (blink) lines.forEach((l, i) => drawText(g, l, W / 2, this.hintY - (lines.length - 1 - i) * LINE_H, C.lampW, { align: 'center' }));
    const help = wrap(ui.titleHelp, W - 20);
    const helpY = this.hintY - lines.length * LINE_H - 6 - help.length * LINE_H;
    help.forEach((l, i) => drawText(g, l, W / 2, helpY + i * LINE_H, C.starD, { align: 'center' }));
  }

  drawReelHud(g, game, ui) {
    const W = this.W, r = game.reel;
    const bw = Math.min(110, W - 60);
    const x = Math.floor((W - bw) / 2) + 14, y = this.hudY;
    const strain = r.tension > 0.78;
    drawText(g, 'LINE', x - 5, y, strain ? C.red : C.starB, { align: 'right' });
    drawText(g, 'REEL', x - 5, y + 11, C.starB, { align: 'right' });
    // Tension: segmented bar; colour + label + pattern so it's not colour alone.
    g.fillStyle = C.ink; g.fillRect(x - 1, y - 1, bw + 2, 9);
    g.fillStyle = C.neb1; g.fillRect(x, y, bw, 7);
    const segs = Math.floor(bw / 3);
    const lit = Math.round(r.tension * segs);
    for (let i = 0; i < lit; i++) {
      const k = i / segs;
      g.fillStyle = k > 0.78 ? C.red : k > 0.5 ? C.lamp : C.moss2;
      g.fillRect(x + i * 3, y + (k > 0.78 ? 0 : 1), 2, k > 0.78 ? 7 : 5);
    }
    g.fillStyle = C.starD; g.fillRect(x + Math.round(segs * 0.78) * 3 - 1, y - 2, 1, 11);
    if (strain && (ui.reduced || Math.sin(this.t * 16) > -0.3)) drawText(g, 'EASE OFF!', x + bw / 2, y - 11, C.lampW, { align: 'center', shadow: C.redD });
    else if (r.surge > 0) drawText(g, 'IT PULLS!', x + bw / 2, y - 11, C.lamp, { align: 'center' });
    // Progress: a track with the fish creeping toward the dock.
    const py = y + 13;
    g.fillStyle = C.ink; g.fillRect(x - 1, py - 1, bw + 2, 5);
    g.fillStyle = C.water1; g.fillRect(x, py, bw, 3);
    g.fillStyle = C.water4; g.fillRect(x, py, Math.round(Math.max(0, Math.min(1, r.progress)) * bw), 3);
    const fx = x + Math.round(Math.max(0, Math.min(1, r.progress)) * bw);
    g.fillStyle = C.lampW; g.fillRect(fx - 1, py - 2, 2, 7);
  }

  drawCard(g, game, ui) {
    const W = this.W;
    const c = game.lastCatch;
    const spr = sprites.fish[c.species.id];
    const cw = Math.min(W - 12, 176);
    const blurb = wrap(c.species.blurb, cw - 14);
    const scale = spr.width * 3 <= cw - 20 && W > 220 ? 3 : 2;
    const ch = 12 + spr.height * scale + 8 + LINE_H * 2 + blurb.length * LINE_H + 9;
    const slide = ui.reduced ? 1 : ease(Math.min(1, game.st / 0.35));
    const x = Math.floor((W - cw) / 2);
    const top = Math.max(4, this.baseIy - 34 - ch);
    const y = Math.round(lerp(-ch - 4, top, slide));
    // Panel: chunky pixel frame with clipped corners.
    g.fillStyle = C.ink; g.fillRect(x + 1, y, cw - 2, ch); g.fillRect(x, y + 1, cw, ch - 2);
    g.fillStyle = C.neb2; g.fillRect(x + 2, y + 1, cw - 4, ch - 2); g.fillRect(x + 1, y + 2, cw - 2, ch - 4);
    g.fillStyle = C.neb1; g.fillRect(x + 3, y + 3, cw - 6, ch - 6);
    g.fillStyle = C.starD; g.fillRect(x + 3, y + 2, cw - 6, 1);
    // Sparkles around the fish.
    const cx = Math.floor(W / 2);
    const fy = y + 10;
    for (let i = 0; i < 6; i++) {
      const a = this.t * 0.8 + i * 1.047;
      if (Math.sin(this.t * 5 + i) > 0.2) {
        g.fillStyle = i % 2 ? C.starY : C.star;
        g.fillRect(Math.round(cx + Math.cos(a) * (spr.width * scale * 0.5 + 6)), Math.round(fy + (spr.height * scale) / 2 + Math.sin(a) * (spr.height * scale * 0.5 + 3)), 1, 1);
      }
    }
    const bob = ui.reduced ? 0 : Math.round(Math.sin(this.t * 2.5));
    g.drawImage(spr, cx - Math.floor((spr.width * scale) / 2), fy + bob, spr.width * scale, spr.height * scale);
    let ty = fy + spr.height * scale + 7;
    drawText(g, c.species.name, cx, ty, C.lamp, { align: 'center' });
    ty += LINE_H;
    const rarityCol = { Common: C.starB, Uncommon: C.moss2, Rare: C.water4, Legendary: C.pink, Oddity: C.rock4 }[c.species.rarity];
    const meta = `${c.size.toFixed(1)} cm  ·  ${c.species.rarity}`;
    drawText(g, meta, cx, ty, rarityCol, { align: 'center' });
    ty += LINE_H + 3;
    blurb.forEach((l, i) => drawText(g, l, cx, ty + i * LINE_H, C.starB, { align: 'center' }));
    if (c.isNew || c.isRecord) {
      const tag = c.isNew ? 'NEW!' : 'RECORD!';
      const tw = measure(tag);
      g.fillStyle = c.isNew ? C.red : C.orange;
      g.fillRect(x + 4, y + 4, tw + 5, 10);
      drawText(g, tag, x + 7, y + 6, C.lampW, { shadow: C.redD });
    }
    const count = ui.logCount;
    if (count) drawText(g, count, x + cw - 6, y + 6, C.starD, { align: 'right' });
  }
}
