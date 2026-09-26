// Draws everything: the black hole, the slot machine (into its own buffer so
// it can shake and, at the end, be swallowed), the HUD, charms and panels.
// Each frame returns the clickable regions for input and keyboard focus.
import { CHARM_BY_ID, COLS, DAYS, FINAL_ROUND, MAX_CHARMS, PACKAGES, RARITY, ROWS, SYMBOLS, SYMBOL_BY_ID } from './data.js';
import { drawText, measureText, wrap } from './font.js';
import { baseMult, canPayEarly, earlyBonus, rerollCost, sellValue, spinsFor, symbolValue } from './sim.js';
import { buildSprites } from './sprites.js';

export const CW = 162; // cabinet width
export const MW = 190; // machine buffer (cabinet + lever)
export const MH = 200;
export const CELL = 26;
const RX = 12, RY = 54, RGAP = 2;
const RW = COLS * CELL + (COLS - 1) * RGAP, RH = ROWS * CELL;
const LED_Y = 140;

const C = {
  ink: '#05030f', panel: '#10132e', panel2: '#181c42', line: '#eef1f6', muted: '#aeb8e2', dim: '#5d6690',
  gold: '#ffd23f', pink: '#ff5ad1', cyan: '#7ff4ff', red: '#ff3b4e', green: '#8fffc0', orange: '#ff9b2f',
  body: '#3a1466', body2: '#521c8c', bodyHi: '#8b45d6', bodyLo: '#220a40', chrome: '#c9d3ff', chrome2: '#8a93b8',
};
const LINE_COLORS = { row3: C.gold, row4: C.orange, row5: C.red, column: C.cyan, diag: C.green, zig: C.pink, zag: C.pink, orbit: '#b35cff', jackpot: '#ffffff' };

export const fmt = (n) => {
  n = Math.floor(n);
  if (n < 100000) return String(n);
  if (n < 10000000) return `${Math.floor(n / 1000)}K`;
  return `${(n / 1000000).toFixed(n < 1e8 ? 1 : 0)}M`;
};
const hsl = (h, s = 100, l = 60) => `hsl(${h % 360} ${s}% ${l}%)`;

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Text with a 1 px dark drop shadow. */
function sText(g, text, x, y, color, scale = 1, shadow = C.ink) {
  drawText(g, text, x + scale, y + scale, shadow, scale);
  drawText(g, text, x, y, color, scale);
}
/** Text with a full dark outline: readable on anything. */
function oText(g, text, x, y, color, scale = 1, outline = C.ink) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) drawText(g, text, x + dx * scale, y + dy * scale, outline, scale);
  drawText(g, text, x, y, color, scale);
}
const cText = (g, text, cx, y, color, scale = 1, fn = sText) => fn(g, text, Math.round(cx - measureText(String(text), scale) / 2), y, color, scale);

function box(g, x, y, w, h, fill, border = C.line, shadow = true) {
  if (shadow) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x + 4, y + 4, w, h);
  }
  g.fillStyle = C.ink;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = border;
  g.fillRect(x, y, w, h);
  g.fillStyle = fill;
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
}

function line(g, x0, y0, x1, y1, w, color) {
  g.fillStyle = color;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    g.fillRect(x - (w >> 1), y - (w >> 1), w, w);
  }
}

function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y));
    g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

export class Renderer {
  constructor() {
    this.S = buildSprites();
    this.W = 0;
    this.H = 0;
    this.mc = mkCanvas(MW, MH);
    this.mg = this.mc.getContext('2d');
    this.reelBg = this.makeReelBg();
    this.disk = [];
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) this.disk.push({ a: r() * Math.PI * 2, d: 1.1 + r() ** 1.8 * 2.2, sp: 0.5 + r() * 0.5, tw: r(), h: (r() - 0.5) * 2 });
    this.debris = [];
    for (let i = 0; i < 40; i++) this.debris.push({ a: r() * Math.PI * 2, d: r(), sp: 0.03 + r() * 0.05 });
    this.rand = r;
  }

  makeReelBg() {
    const c = mkCanvas(CELL, RH);
    const g = c.getContext('2d');
    for (let y = 0; y < RH; y++) {
      const k = Math.cos(((y + 0.5 - RH / 2) / (RH / 2)) * 1.25);
      const mix = (a, b) => Math.round(a + (b - a) * Math.max(0, k));
      g.fillStyle = `rgb(${mix(70, 250)} ${mix(58, 243)} ${mix(90, 226)})`;
      g.fillRect(0, y, CELL, 1);
    }
    return c;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.stars = mkCanvas(W, H);
    const g = this.stars.getContext('2d');
    g.fillStyle = C.ink;
    g.fillRect(0, 0, W, H);
    const n = Math.round((W * H) / 180);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(this.rand() * W), y = Math.floor(this.rand() * H);
      const b = this.rand();
      g.fillStyle = b > 0.97 ? '#ffffff' : b > 0.85 ? '#aeb8e2' : b > 0.6 ? '#5d6690' : '#2c2f55';
      g.fillRect(x, y, 1, 1);
      if (b > 0.985) {
        g.fillStyle = '#5d6690';
        g.fillRect(x - 1, y, 3, 1);
        g.fillRect(x, y - 1, 1, 3);
        g.fillStyle = '#fff';
        g.fillRect(x, y, 1, 1);
      }
    }
    this.layout();
  }

  layout() {
    const { W, H } = this;
    const L = (this.L = {});
    L.portrait = H >= W * 1.2;
    if (L.portrait) {
      const hudH = 46;
      const stripH = 28;
      const infoH = 36;
      // Centre the machine itself; the HUD sits above it and charms below.
      const spare = H - (hudH + 10 + MH + 6 + stripH + infoH);
      const top = Math.max(2, Math.floor(spare / 2));
      L.hud = { x: 4, y: top + 2, w: W - 8, h: hudH - 2 };
      L.mx = Math.max(0, Math.floor((W - MW) / 2) + 4);
      L.my = top + hudH + 10;
      L.charms = { x: Math.floor((W - (MAX_CHARMS * 22 - 2)) / 2), y: L.my + MH + 4, cols: MAX_CHARMS };
      L.info = { x: 8, y: L.charms.y + stripH, w: W - 16 };
    } else {
      L.mx = Math.floor((W - CW) / 2) - 2;
      L.my = Math.max(4, Math.floor((H - MH) / 2) + 4);
      L.hud = { x: 6, y: L.my, w: L.mx - 16, h: MH };
      const rx = L.mx + CW + 34;
      L.charms = { x: rx, y: L.my + 12, cols: 3, w: W - rx - 6 };
      L.info = { x: rx, y: L.my + 12 + 2 * 22 + 6, w: W - rx - 6 };
    }
    // The black hole sits behind the marquee.
    L.bh = { x: L.mx + CW / 2, y: L.my + 30 };
    L.coinHud = { x: L.hud.x + 8, y: L.hud.y + 40 };
  }

  /** Where coins fly to on screen. */
  coinTarget() {
    return this.coinAt || { x: 20, y: 20 };
  }

  // ---------------------------------------------------------------- frame
  draw(ctx, v) {
    const { W, H, L } = this;
    const regions = [];
    this.regions = regions;
    const t = v.time;
    ctx.drawImage(this.stars, 0, 0);
    this.drawBlackHole(ctx, v);
    this.drawRays(ctx, v);

    this.drawShooters(ctx, v);
    this.drawScreenBulbs(ctx, v);

    // Machine
    this.drawMachine(v);
    const sx = v.shake ? Math.round((Math.random() - 0.5) * v.shake * 2) : 0;
    const sy = v.shake ? Math.round((Math.random() - 0.5) * v.shake * 2) : 0;
    const bob = v.reducedMotion ? 0 : Math.round(Math.sin(t * 1.3) * 1);
    if (v.swallow) {
      this.drawSwallowed(ctx, v);
    } else {
      this.blitMachine(ctx, v, L.mx + sx, L.my + sy + bob);
      // Machine hit areas.
      regions.push({ id: 'lever', x: L.mx + CW, y: L.my + 50, w: 28, h: 90 });
      regions.push({ id: 'machine', x: L.mx, y: L.my + 44, w: CW, h: 152 });
    }
    this.mOff = { x: L.mx + sx, y: L.my + sy + bob };

    // Front half of the disk passes in front of nothing: it's all behind.
    this.drawParticles(ctx, v);

    if (v.mode === 'title') this.drawTitleSide(ctx, v);
    else if (v.run) {
      this.drawHud(ctx, v);
      this.drawCharms(ctx, v, regions);
    }
    this.drawBanner(ctx, v);
    this.drawPopups(ctx, v);

    if (v.flash > 0) {
      ctx.globalAlpha = Math.min(1, v.flash);
      ctx.fillStyle = v.flashColor || '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (v.panel) this.drawPanel(ctx, v, regions);
    return regions;
  }

  // ---------------------------------------------------------------- background
  drawBlackHole(g, v) {
    const { W, L } = this;
    const t = v.time * (v.reducedMotion ? 0.3 : 1);
    const cx = L.bh.x, cy = L.bh.y;
    const R = Math.round((Math.min(W, this.H) * 0.15 + 10) * (v.hunger || 1));
    const spread = Math.max(W * 0.42, R * 3.2);
    // A soft glow band along the disk plane.
    for (let i = 0; i < 6; i++) {
      g.globalAlpha = 0.05;
      g.fillStyle = i < 3 ? '#ff9b2f' : '#ff5ad1';
      const hw = spread * (1.2 - i * 0.12), hh = 3 + i * 3;
      g.fillRect(Math.round(cx - hw), Math.round(cy - hh / 2), Math.round(hw * 2), hh);
    }
    g.globalAlpha = 1;

    // Inflowing debris spirals in from the edges.
    for (const d of this.debris) {
      const k = (d.d + t * d.sp) % 1;
      const rr = (1 - k) * Math.max(W, this.H) * 0.7 + R;
      const a = d.a + k * 5;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.55;
      g.fillStyle = k > 0.8 ? '#ff9b2f' : '#5d6690';
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }

    // Back half of the accretion disk.
    const drawDisk = (front) => {
      for (const p of this.disk) {
        const a = p.a + t * p.sp * (1.6 / p.d);
        const s = Math.sin(a);
        if (front ? s < 0 : s >= 0) continue;
        const rr = p.d * spread * 0.5;
        const x = cx + Math.cos(a) * rr;
        const y = cy - s * rr * 0.16 + p.h * (4 - p.d);
        const heat = 1 - (p.d - 1.1) / 2.2;
        const doppler = Math.cos(a) < 0 ? 1 : 0.6;
        const b = heat * doppler + (Math.sin(t * 3 + p.tw * 20) * 0.1);
        g.fillStyle = b > 0.85 ? '#fff3a8' : b > 0.6 ? '#ffd23f' : b > 0.4 ? '#ff9b2f' : b > 0.22 ? '#c4541b' : '#6b2a1a';
        g.fillRect(Math.round(x), Math.round(y), b > 0.6 ? 2 : 1, 1);
      }
    };
    drawDisk(false);
    // Lensed glow ring and the hole itself.
    disc(g, cx, cy, R + 4, '#3a1466');
    disc(g, cx, cy, R + 2, v.voidPulse ? '#ff3b4e' : '#ff9b2f');
    disc(g, cx, cy, R + 1, '#fff3a8');
    disc(g, cx, cy, R, '#000000');
    // Photon ring flicker
    const k = Math.floor(t * 8) % 12;
    for (let i = 0; i < 12; i++) {
      if (i !== k && i !== (k + 6) % 12) continue;
      const a = (i / 12) * Math.PI * 2;
      g.fillStyle = '#fff';
      g.fillRect(Math.round(cx + Math.cos(a) * (R + 1)), Math.round(cy + Math.sin(a) * (R + 1)), 1, 1);
    }
    drawDisk(true);
  }

  /** Spotlight rays and a neon halo behind the machine; they go wild on wins. */
  drawRays(g, v) {
    const { L } = this;
    if (v.swallow) return;
    const cx = L.mx + CW / 2, cy = L.my + 96;
    const win = v.bulbs === 'win' || v.bulbs === 'jackpot';
    const t = v.time;
    const heat = v.heat || 0;
    if (heat > 0.5 && !v.reducedMotion) {
      // The whole sky throbs with colour on a hot streak.
      g.globalAlpha = Math.min(0.22, (heat - 0.5) * 0.25) * (0.6 + 0.4 * Math.sin(t * 20));
      g.fillStyle = heat > 1 ? hsl(t * 300) : C.pink;
      g.fillRect(0, 0, this.W, this.H);
      g.globalAlpha = 1;
    }
    if ((win || heat > 0.15) && !v.reducedMotion) {
      const n = 10 + Math.round(Math.min(1.4, heat) * 12);
      const reach = Math.max(this.W, this.H);
      const spinRate = 0.6 + heat * 2.4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * spinRate * (i % 2 ? 1 : -0.6);
        g.globalAlpha = Math.min(0.3, (v.bulbs === 'jackpot' ? 0.2 : 0.09) + heat * 0.1);
        g.fillStyle = v.bulbs === 'jackpot' || heat > 1 ? hsl(i * 50 + t * 200) : i % 3 === 0 ? C.cyan : i % 2 ? C.gold : C.pink;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a - 0.07) * reach, cy + Math.sin(a - 0.07) * reach);
        g.lineTo(cx + Math.cos(a + 0.07) * reach, cy + Math.sin(a + 0.07) * reach);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // Neon halo hugging the cabinet.
    const col = v.bulbs === 'void' ? C.red : win ? (v.bulbs === 'jackpot' ? hsl(t * 400) : C.gold) : v.bulbs === 'spin' || v.bulbs === 'tease' ? C.cyan : C.pink;
    const pulse = v.reducedMotion ? 0.2 : 0.16 + heat * 0.12 + 0.1 * Math.sin(t * (win ? 14 + heat * 10 : 3));
    const rings = 3 + Math.round(Math.min(1.4, heat) * 3);
    // The halo rocks with the machine.
    this.withJig(g, v, L.mx, L.my, (x, y) => {
      for (let i = rings; i >= 1; i--) {
        g.globalAlpha = pulse / i;
        g.fillStyle = col;
        g.fillRect(x - i * 2, y + 4 - i * 2, CW + i * 4, MH - 6 + i * 4);
      }
    });
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the machine
  drawMachine(v) {
    const g = this.mg;
    const t = v.time;
    g.clearRect(0, 0, MW, MH);
    this.drawCabinet(g, v);
    this.drawBulbs(g, v);
    this.drawMarquee(g, v);
    this.drawReels(g, v);
    this.drawLed(g, v);
    this.drawBase(g, v);
    this.drawLever(g, v, t);
  }

  drawCabinet(g) {
    // Marquee cap with stepped (pixel-rounded) corners.
    const steps = [6, 4, 3, 2, 1, 1];
    for (let y = 0; y < 44; y++) {
      const inset = steps[y] || 0;
      g.fillStyle = y === 0 ? C.ink : C.ink;
      g.fillRect(inset, y, CW - inset * 2, 1);
      if (y > 0) {
        const i2 = (steps[y - 1] !== undefined ? Math.max(steps[y - 1], inset) : inset) + 1;
        g.fillStyle = y < 3 ? C.chrome : C.body2;
        g.fillRect(i2, y, CW - i2 * 2, 1);
      }
    }
    // Body
    g.fillStyle = C.ink;
    g.fillRect(0, 43, CW, MH - 45);
    g.fillStyle = C.body;
    g.fillRect(1, 44, CW - 2, MH - 47);
    // Vertical metallic shading bands.
    g.fillStyle = C.bodyHi;
    g.fillRect(2, 44, 1, MH - 48);
    g.fillStyle = C.body2;
    g.fillRect(3, 44, 4, MH - 48);
    g.fillStyle = C.bodyLo;
    g.fillRect(CW - 7, 44, 5, MH - 48);
    // Chrome trim between marquee and body.
    g.fillStyle = C.chrome;
    g.fillRect(1, 43, CW - 2, 2);
    g.fillStyle = C.chrome2;
    g.fillRect(1, 45, CW - 2, 1);
    // Marquee window.
    g.fillStyle = C.ink;
    g.fillRect(8, 6, CW - 16, 34);
    g.fillStyle = '#12061f';
    g.fillRect(9, 7, CW - 18, 32);
    // Reel bezel.
    g.fillStyle = C.ink;
    g.fillRect(RX - 5, RY - 5, RW + 10, RH + 10);
    g.fillStyle = C.chrome2;
    g.fillRect(RX - 4, RY - 4, RW + 8, RH + 8);
    g.fillStyle = C.chrome;
    g.fillRect(RX - 4, RY - 4, RW + 8, 2);
    g.fillRect(RX - 4, RY - 4, 2, RH + 8);
    g.fillStyle = C.ink;
    g.fillRect(RX - 2, RY - 2, RW + 4, RH + 4);
    // Base trim.
    g.fillStyle = C.chrome;
    g.fillRect(1, 162, CW - 2, 2);
    g.fillStyle = C.chrome2;
    g.fillRect(1, 164, CW - 2, 1);
    g.fillStyle = C.ink;
    g.fillRect(0, MH - 4, CW, 4);
    g.fillStyle = C.bodyLo;
    g.fillRect(1, MH - 8, CW - 2, 4);
  }

  bulbPositions() {
    if (this._bulbs) return this._bulbs;
    const b = [];
    for (let x = 12; x <= CW - 13; x += 7) b.push([x, 2]);
    for (let y = 9; y <= 38; y += 7) b.push([CW - 5, y]);
    for (let y = 52; y <= 188; y += 8) b.push([CW - 5, y]);
    for (let y = 188; y >= 52; y -= 8) b.push([2, y]);
    for (let y = 38; y >= 9; y -= 7) b.push([2, y]);
    return (this._bulbs = b);
  }

  drawBulbs(g, v) {
    const t = v.time;
    const bulbs = this.bulbPositions();
    const mode = v.reducedMotion ? 'still' : v.bulbs || 'idle';
    for (let i = 0; i < bulbs.length; i++) {
      const [x, y] = bulbs[i];
      let on = false;
      let col = C.gold;
      switch (mode) {
        case 'still':
          on = i % 2 === 0;
          break;
        case 'idle':
          on = (i + Math.floor(t * 7)) % 5 < 2;
          col = (Math.floor(i / 5) & 1) ? C.gold : C.pink;
          break;
        case 'spin':
          on = (i + Math.floor(t * 24)) % 3 === 0;
          col = i % 2 ? C.cyan : C.pink;
          break;
        case 'tease':
          on = (i + Math.floor(t * 30)) % 2 === 0;
          col = Math.floor(t * 10) % 2 ? C.gold : C.red;
          break;
        case 'win':
          on = Math.floor(t * 10) % 2 === i % 2;
          col = C.gold;
          break;
        case 'jackpot':
          on = true;
          col = hsl(i * 25 + t * 600);
          break;
        case 'void':
          on = Math.random() < 0.5;
          col = C.red;
          break;
        default:
      }
      if (on) {
        g.globalAlpha = 0.3;
        g.fillStyle = col;
        g.fillRect(x - 2, y - 2, 7, 7);
        g.globalAlpha = 1;
        g.fillStyle = C.ink;
        g.fillRect(x - 1, y - 1, 5, 5);
        g.fillStyle = col;
        g.fillRect(x, y, 3, 3);
        g.fillStyle = '#fff';
        g.fillRect(x + 1, y + 1, 1, 1);
      } else {
        g.fillStyle = C.ink;
        g.fillRect(x - 1, y - 1, 5, 5);
        g.fillStyle = '#3b2458';
        g.fillRect(x, y, 3, 3);
      }
    }
  }

  drawMarquee(g, v) {
    const t = v.time;
    const cx = CW / 2;
    const title = 'BLACK HOLE';
    const w = measureText(title, 2);
    const x0 = Math.round(cx - w / 2);
    // Neon: glow copy offset in the tube colour, a flickering letter now and then.
    const flick = v.reducedMotion ? -1 : Math.floor(t * 1.7) % 7 === 3 && Math.sin(t * 60) > 0 ? 7 : -1;
    for (let i = 0; i < title.length; i++) {
      const ch = title[i];
      const x = x0 + i * 12;
      const lit = i !== flick;
      drawText(g, ch, x + 1, 11, lit ? C.M || '#a0237f' : '#2a0a24', 2);
      drawText(g, ch, x, 10, lit ? C.pink : '#4a1540', 2);
      if (lit) {
        g.fillStyle = '#ffd0f2';
        // A white-hot core on each letter's top-left pixel pair.
        g.fillRect(x, 10, 2, 1);
      }
    }
    const slots = 'SLOTS';
    const ws = measureText(slots, 2);
    const hue = v.bulbs === 'jackpot' ? t * 400 : null;
    for (let i = 0; i < slots.length; i++) {
      const x = Math.round(cx - ws / 2) + i * 12;
      const wave = v.reducedMotion ? 0 : Math.round(Math.sin(t * 4 + i * 0.9) * 1);
      drawText(g, slots[i], x + 1, 26 + wave, '#1c5bd9', 2);
      drawText(g, slots[i], x, 25 + wave, hue !== null ? hsl(hue + i * 40) : C.cyan, 2);
    }
    // Little spinning stars either side of SLOTS.
    for (const sx of [cx - ws / 2 - 14, cx + ws / 2 + 6]) {
      const k = Math.floor(t * 6) % 4;
      g.fillStyle = C.gold;
      g.fillRect(sx + 3, 27, 2, 6);
      g.fillRect(sx + 1, 29, 6, 2);
      g.fillStyle = k % 2 ? '#fff' : C.gold;
      g.fillRect(sx + 3, 29, 2, 2);
    }
    if (v.reducedMotion) return;
    // A shine sweeps across the marquee glass: every few seconds, constantly when hot.
    const heat = v.heat || 0;
    const period = heat > 0.3 ? 0.9 : 3.2;
    const k = (t % period) / 0.8;
    if (k < 1) {
      g.save();
      g.beginPath();
      g.rect(9, 7, CW - 18, 32);
      g.clip();
      g.globalAlpha = 0.35;
      g.fillStyle = '#fff';
      const sx = -30 + k * (CW + 60);
      for (let y = 7; y < 39; y++) g.fillRect(Math.round(sx + (39 - y) * 0.6), y, 6, 1);
      g.globalAlpha = 0.15;
      for (let y = 7; y < 39; y++) g.fillRect(Math.round(sx + 9 + (39 - y) * 0.6), y, 3, 1);
      g.restore();
      g.globalAlpha = 1;
    }
    // Glints on the chrome.
    const glints = [[20, 44], [120, 44], [40, 163], [140, 163], [RX - 4, RY + 30], [RX + RW + 3, RY + 50]];
    glints.forEach(([gx, gy], i) => {
      const ph = (t * (1.3 + heat * 3) + i * 0.37) % 2;
      if (ph > 0.25) return;
      const r = ph < 0.12 ? 2 : 1;
      g.fillStyle = '#fff';
      g.fillRect(gx - r, gy, r * 2 + 1, 1);
      g.fillRect(gx, gy - r, 1, r * 2 + 1);
    });
  }

  drawReels(g, v) {
    const { S } = this;
    const reels = v.reels;
    g.save();
    for (let c = 0; c < COLS; c++) {
      const rx = RX + c * (CELL + RGAP);
      g.drawImage(this.reelBg, rx, RY);
      const reel = reels[c];
      g.save();
      g.beginPath();
      g.rect(rx, RY, CELL, RH);
      g.clip();
      const p = reel.pos;
      const speed = reel.speed || 0;
      const base = Math.floor(p);
      const bounce = reel.bounce ? Math.round(reel.bounce) : 0;
      for (let i = base; i <= base + ROWS; i++) {
        const id = reel.strip[i];
        if (!id) continue;
        const y = Math.round(RY + (i - p) * CELL + 5) + bounce;
        const x = rx + 5;
        const row = i - base;
        let dy = 0;
        let hl = false;
        if (reel.stopped && v.hot && v.hot.has(`${c},${row}`)) {
          hl = true;
          dy = v.reducedMotion ? 0 : -Math.abs(Math.round(Math.sin(v.time * 14) * 2));
        }
        if (speed > 12) {
          g.globalAlpha = 0.35;
          g.drawImage(S.sym[id], x, y - 5);
          g.drawImage(S.sym[id], x, y + 5);
          g.globalAlpha = 1;
        }
        if (hl) {
          const fc = Math.floor(v.time * 8) % 2 ? v.hotColor || C.gold : '#fff';
          g.fillStyle = fc;
          g.fillRect(rx + 1, y - 4 + dy, CELL - 2, CELL - 2);
          g.fillStyle = v.hotColor === C.red ? '#3a0a12' : '#fff8e0';
          g.fillRect(rx + 2, y - 3 + dy, CELL - 4, CELL - 4);
        }
        g.drawImage(S.sym[id], x, y + dy);
        if (hl && Math.floor(v.time * 8) % 4 === 0 && !v.reducedMotion) {
          g.globalAlpha = 0.6;
          g.drawImage(S.flash[id], x, y + dy);
          g.globalAlpha = 1;
        }
      }
      // Tease: the reel glows while it keeps you waiting.
      if (reel.tease && !reel.stopped) {
        g.globalAlpha = 0.25 + 0.2 * Math.sin(v.time * 30);
        g.fillStyle = v.teaseColor || C.gold;
        g.fillRect(rx, RY, CELL, RH);
        g.globalAlpha = 1;
      }
      g.restore();
      // Reel separators.
      if (c < COLS - 1) {
        g.fillStyle = C.ink;
        g.fillRect(rx + CELL, RY, RGAP, RH);
      }
    }
    // Payline markers.
    for (let r = 0; r < ROWS; r++) {
      const y = RY + r * CELL + CELL / 2 - 2;
      const lit = v.hotRows && v.hotRows.has(r);
      g.fillStyle = lit ? v.hotColor || C.gold : '#5a2a8a';
      g.fillRect(RX - 9, y, 2, 5);
      g.fillRect(RX - 7, y + 1, 1, 3);
      g.fillRect(RX + RW + 7, y, 2, 5);
      g.fillRect(RX + RW + 6, y + 1, 1, 3);
    }
    // The current winning line, drawn through the cell centres.
    if (v.hotLine) {
      const pts = v.hotLine.cells.map(([c, r]) => [RX + c * (CELL + RGAP) + CELL / 2, RY + r * CELL + CELL / 2]);
      const col = v.hotColor || C.gold;
      if (v.hotLine.kind !== 'jackpot') {
        for (let i = 0; i + 1 < pts.length; i++) line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3, C.ink);
        if (v.hotLine.kind === 'orbit') line(g, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], 3, C.ink);
        for (let i = 0; i + 1 < pts.length; i++) line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1, col);
        if (v.hotLine.kind === 'orbit') line(g, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], 1, col);
      }
    }
    // Glass: a soft diagonal shine.
    g.globalAlpha = 0.1;
    g.fillStyle = '#fff';
    for (let i = 0; i < 18; i++) g.fillRect(RX + 18 + i, RY + i * 4, 10, 4);
    g.globalAlpha = 1;
    g.restore();
  }

  drawLed(g, v) {
    const y = LED_Y;
    g.fillStyle = C.ink;
    g.fillRect(RX - 2, y, RW + 4, 20);
    g.fillStyle = '#12040a';
    g.fillRect(RX - 1, y + 1, RW + 2, 18);
    drawText(g, 'WIN', RX + 2, y + 3, '#a3122f');
    drawText(g, 'SPINS', RX + RW - 30, y + 3, '#8a5a12');
    const win = Math.floor(v.led || 0);
    const digits = Math.min(99999999, win).toString().padStart(8, ' ');
    const hot = v.ledHot && Math.floor(v.time * 12) % 2 === 0;
    const rainbow = (v.heat || 0) > 0.8 && !v.reducedMotion;
    for (let i = 0; i < 8; i++) this.seg(g, RX + 22 + i * 7, y + 3, digits[i], rainbow ? hsl(v.time * 500 + i * 40, 100, 65) : hot ? '#fff3a8' : '#ff3b4e', '#3a0d16');
    const spins = v.run ? String(Math.min(99, v.shownSpins ?? v.run.spinsLeft)).padStart(2, ' ') : '  ';
    for (let i = 0; i < 2; i++) this.seg(g, RX + RW - 30 + 8 + i * 7, y + 10 - 7 + 0, spins[i], '#ffb13b', '#3a2006', true);
  }

  /** A 5 x 13 seven-segment digit (small variant is 5 x 7, drawn below the label). */
  seg(g, x, y, ch, on, off, small = false) {
    const map = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
    const lit = map[ch] ?? '';
    const h = small ? 7 : 13;
    const yy = small ? y + 7 : y;
    const half = (h - 1) / 2;
    const segs = {
      a: [x + 1, yy, 3, 1], d: [x + 1, yy + h - 1, 3, 1], g: [x + 1, yy + half, 3, 1],
      f: [x, yy + 1, 1, half - 1], b: [x + 4, yy + 1, 1, half - 1],
      e: [x, yy + half + 1, 1, half - 1], c: [x + 4, yy + half + 1, 1, half - 1],
    };
    for (const [k, r] of Object.entries(segs)) {
      g.fillStyle = lit.includes(k) ? on : off;
      g.fillRect(...r);
    }
  }

  drawBase(g, v) {
    const t = v.time;
    // Spin button: a chunky arcade button that pulses when it's ready.
    const bx = 26, by = 180;
    const ready = v.canSpin;
    const pressed = v.buttonDown > 0;
    disc(g, bx, by + 2, 10, C.ink);
    disc(g, bx, by + 1, 9, '#5a0a1a');
    const glow = ready && !v.reducedMotion ? Math.floor(t * 4) % 2 : 0;
    disc(g, bx, by - (pressed ? 0 : 1), 8, ready ? (glow ? '#ff6b7a' : C.red) : '#7a2a3a');
    disc(g, bx - 2, by - 4 - (pressed ? -1 : 0), 2, ready ? '#ffc0c8' : '#a36a74');
    drawText(g, 'SPIN', bx - 11, by + 12 - 1, ready ? C.gold : C.dim);
    // Coin tray.
    const tx = 50, ty = 170, tw = CW - 62, th = 22;
    g.fillStyle = C.ink;
    g.fillRect(tx, ty, tw, th);
    g.fillStyle = '#0c0418';
    g.fillRect(tx + 1, ty + 1, tw - 2, th - 2);
    g.fillStyle = C.chrome2;
    g.fillRect(tx, ty + th - 3, tw, 3);
    g.fillStyle = C.chrome;
    g.fillRect(tx, ty + th - 3, tw, 1);
    // A pile that grows with your coins: a mound, widest at the bottom.
    const coins = v.shownCoins || 0;
    let n = coins <= 0 ? 0 : Math.min(48, Math.ceil(Math.log2(coins + 1) * 3.2));
    const per0 = Math.floor((tw - 10) / 7);
    for (let row = 0; row < 5 && n > 0; row++) {
      const per = Math.min(n, per0 - row * 3);
      if (per <= 0) break;
      const x0 = tx + 5 + Math.floor((tw - 10 - per * 7) / 2) + (row % 2) * 3;
      for (let i = 0; i < per; i++) {
        const y = ty + th - 10 - row * 3 - ((i * 5 + row) % 3 === 0 ? 1 : 0);
        g.drawImage(this.S.coin[(i + row) % 4 === 1 ? 1 : 0], x0 + i * 7, y);
      }
      n -= per;
    }
  }

  drawLever(g, v) {
    const pull = v.lever || 0; // 0 up .. 1 fully down
    const mx = CW, my = 78;
    // Mount
    g.fillStyle = C.ink;
    g.fillRect(mx - 1, my, 10, 30);
    g.fillStyle = C.chrome2;
    g.fillRect(mx, my + 1, 8, 28);
    g.fillStyle = C.chrome;
    g.fillRect(mx, my + 1, 8, 2);
    g.fillRect(mx, my + 1, 2, 28);
    // Rod pivots at the mount centre.
    const px = mx + 6, py = my + 15;
    const ang = -Math.PI / 2 + 0.25 + pull * (Math.PI - 0.5);
    const len = 38;
    const ex = Math.round(px + Math.cos(ang) * len * 0.5 + 12 * (1 - Math.abs(Math.sin(ang)) * 0.2));
    const ey = Math.round(py + Math.sin(ang) * len);
    line(g, px, py, ex, ey, 4, C.ink);
    line(g, px, py, ex, ey, 2, C.chrome);
    // Ball
    const ready = v.canSpin && !v.reducedMotion && Math.floor(v.time * 3) % 2;
    disc(g, ex, ey, 6, C.ink);
    disc(g, ex, ey, 5, ready ? '#ff6b7a' : C.red);
    disc(g, ex - 2, ey - 2, 1, '#ffd0d6');
    g.fillStyle = '#fff';
    g.fillRect(ex - 2, ey - 3, 1, 1);
  }

  /**
   * Draws the machine buffer with its jiggle: a springy tilt, a hop and a
   * squash-and-stretch that all grow with the heat of the win.
   */
  blitMachine(ctx, v, x, y) {
    this.withJig(ctx, v, x, y, (mx, my) => ctx.drawImage(this.mc, mx, my));
  }

  /** Runs draw(x, y) in the machine's jiggled frame (pivoting on its base). */
  withJig(ctx, v, x, y, draw) {
    const j = v.jig;
    if (!j || v.reducedMotion || (Math.abs(j.a) < 0.002 && Math.abs(j.y) < 0.3 && Math.abs(j.x) < 0.3 && Math.abs(j.s) < 0.003)) {
      draw(x, y);
      return;
    }
    const px = x + CW / 2, py = y + MH - 4;
    ctx.save();
    ctx.translate(Math.round(px + j.x), Math.round(py + j.y));
    ctx.rotate(j.a);
    ctx.scale(1 + j.s, 1 - j.s);
    draw(-CW / 2, -(MH - 4));
    ctx.restore();
  }

  /** Shooting stars streak across the background now and then. */
  drawShooters(g, v) {
    for (const s of v.shooters || []) {
      const k = (v.time - s.t0) / s.dur;
      if (k < 0 || k > 1) continue;
      const x = s.x + s.dx * k, y = s.y + s.dy * k;
      const len = 14;
      for (let i = 0; i < len; i++) {
        const f = i / len;
        g.globalAlpha = (1 - f) * (k < 0.8 ? 1 : (1 - k) * 5);
        g.fillStyle = i < 2 ? '#fff' : i < 6 ? C.cyan : '#3fa9ff';
        g.fillRect(Math.round(x - (s.dx / s.len) * i), Math.round(y - (s.dy / s.len) * i), 1, 1);
      }
      g.globalAlpha = 1;
    }
  }

  /** Casino bulbs round the edge of the screen: they come alive as wins heat up. */
  drawScreenBulbs(g, v) {
    const heat = v.heat || 0;
    if (heat < 0.2 || v.reducedMotion) return;
    const { W, H } = this;
    const step = 9;
    const pts = [];
    for (let x = 3; x < W - 3; x += step) pts.push([x, 2], [W - x, H - 4]);
    for (let y = 3 + step; y < H - 3; y += step) pts.push([2, H - y], [W - 4, y]);
    const speed = 10 + heat * 30;
    const k = Math.floor(v.time * speed);
    pts.forEach(([x, y], i) => {
      const on = (i + k) % 4 < 1 + Math.min(2, Math.floor(heat * 2));
      g.globalAlpha = on ? Math.min(1, heat) : 0.25;
      g.fillStyle = heat > 1 ? hsl(i * 20 + v.time * 400) : on ? (i % 2 ? C.gold : C.pink) : '#3b2458';
      g.fillRect(x, y, 2, 2);
    });
    g.globalAlpha = 1;
  }

  drawSwallowed(ctx, v) {
    // The machine spins, shrinks and stretches into the hole.
    const { L } = this;
    const k = Math.min(1, v.swallow);
    const e = k * k;
    const cx = L.mx + CW / 2, cy = L.my + MH / 2;
    const tx = cx + (L.bh.x - cx) * e, ty = cy + (L.bh.y - cy) * e;
    const s = Math.max(0.02, 1 - e);
    ctx.save();
    ctx.translate(Math.round(tx), Math.round(ty));
    ctx.rotate(e * 6);
    ctx.scale(s * (1 - e * 0.5), s * (1 + e * 1.5));
    ctx.globalAlpha = 1 - Math.max(0, k - 0.85) / 0.15;
    ctx.drawImage(this.mc, -CW / 2, -MH / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- effects
  drawParticles(ctx, v) {
    for (const p of v.particles) {
      const x = Math.round(p.x), y = Math.round(p.y);
      switch (p.kind) {
        case 'coin':
          ctx.drawImage(this.S.coin[Math.floor(p.life * 12 + p.seed * 4) % 4], x - 3, y - 3);
          break;
        case 'spark':
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y, p.size || 1, p.size || 1);
          break;
        case 'star':
          ctx.fillStyle = p.color;
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
          break;
        case 'ticket':
          ctx.drawImage(this.S.ticket, x - 4, y - 3);
          break;
        default:
      }
    }
  }

  drawBanner(ctx, v) {
    const b = v.banner;
    if (!b) return;
    const { L } = this;
    const age = v.time - b.t0;
    const cx = L.mx + CW / 2;
    const cy = L.my + RY + RH / 2;
    const scale = b.scale || 3;
    const pop = age < 0.08 && !v.reducedMotion ? scale + 1 : scale;
    const w = measureText(b.text, pop);
    const x = Math.round(cx - w / 2), y = Math.round(cy - (5 * pop) / 2 + (b.dy || 0));
    if (b.rainbow && !v.reducedMotion) {
      for (let i = 0; i < b.text.length; i++) {
        const wave = Math.round(Math.sin(v.time * 10 + i * 0.7) * 2);
        oText(ctx, b.text[i], x + i * 6 * pop, y + wave, hsl(v.time * 500 + i * 30), pop);
      }
    } else {
      oText(ctx, b.text, x, y, b.color || C.gold, pop);
    }
    if (b.sub) {
      const sw = measureText(b.sub, 1);
      oText(ctx, b.sub, Math.round(cx - sw / 2), y + 5 * pop + 5, b.subColor || C.line, 1);
    }
  }

  drawPopups(ctx, v) {
    for (const p of v.popups) {
      const age = v.time - p.t0;
      const y = Math.round(p.y - age * 14);
      const w = measureText(p.text, p.scale || 1);
      oText(ctx, p.text, Math.round(p.x - w / 2), y, p.color || C.gold, p.scale || 1);
    }
  }

  // ---------------------------------------------------------------- HUD
  drawHud(ctx, v) {
    const run = v.run;
    const { L } = this;
    const h = L.hud;
    const t = v.time;
    const due = DAYS - run.day;
    const dueText = run.phase === 'deadline' || due === 0 ? 'DUE TODAY!' : `DUE IN ${due + 1} DAYS`;
    const covered = v.shownCoins >= run.debt;
    const blinkDue = (due === 0 || run.phase === 'deadline') && !covered && Math.floor(t * 3) % 2 === 0;
    const round = run.endless ? `ROUND ${run.round}` : `ROUND ${run.round}/${FINAL_ROUND}`;

    if (L.portrait) {
      box(ctx, h.x, h.y, h.w, h.h, 'rgba(16,19,46,0.85)', '#3b3f75', false);
      sText(ctx, round, h.x + 5, h.y + 4, C.muted);
      const dayTxt = `DAY ${run.day}/${DAYS}`;
      sText(ctx, dayTxt, h.x + h.w - 5 - measureText(dayTxt), h.y + 4, C.muted);
      // Debt on the left, coins on the right.
      sText(ctx, 'DEBT', h.x + 5, h.y + 13, C.red);
      sText(ctx, dueText, h.x + 5 + measureText('DEBT '), h.y + 13, blinkDue ? C.red : C.dim);
      sText(ctx, fmt(run.debt), h.x + 5, h.y + 21, blinkDue ? '#fff' : C.red, 2);
      const coinTxt = fmt(v.shownCoins);
      const cw = measureText(coinTxt, 2);
      const cxr = h.x + h.w - 5 - cw;
      ctx.drawImage(this.S.coin[0], cxr - 10, h.y + 22);
      sText(ctx, coinTxt, cxr, h.y + 21, C.gold, 2);
      this.coinAt = { x: cxr - 7, y: h.y + 25 };
      const tk = `${v.shownTickets}`;
      sText(ctx, tk, h.x + h.w - 5 - measureText(tk), h.y + 13, C.pink);
      ctx.drawImage(this.S.ticket, h.x + h.w - 17 - measureText(tk), h.y + 12);
      this.ticketAt = { x: h.x + h.w - 12, y: h.y + 14 };
      this.progress(ctx, h.x + 5, h.y + 35, h.w - 10, v, run);
      return;
    }

    // Landscape: a column to the left of the machine.
    let y = h.y + 2;
    const x = h.x;
    const w = h.w;
    sText(ctx, round, x, y, C.muted);
    y += 9;
    sText(ctx, `DAY ${run.day} OF ${DAYS}`, x, y, C.dim);
    y += 14;
    sText(ctx, 'DEBT', x, y, C.red);
    y += 8;
    sText(ctx, fmt(run.debt), x, y, blinkDue ? '#fff' : C.red, 2);
    y += 13;
    sText(ctx, dueText, x, y, blinkDue ? C.red : C.dim);
    y += 10;
    this.progress(ctx, x, y, Math.min(w, 96), v, run);
    y += 14;
    sText(ctx, 'COINS', x, y, C.gold);
    y += 8;
    ctx.drawImage(this.S.coin[Math.floor(t * 6) % 4], x, y + 1);
    sText(ctx, fmt(v.shownCoins), x + 10, y, C.gold, 2);
    this.coinAt = { x: x + 3, y: y + 4 };
    y += 17;
    ctx.drawImage(this.S.ticket, x, y);
    sText(ctx, `${v.shownTickets} TICKETS`, x + 12, y + 1, C.pink);
    this.ticketAt = { x: x + 4, y: y + 3 };
    y += 12;
    sText(ctx, `${v.shownSpins ?? run.spinsLeft} SPINS LEFT`, x, y, run.phase === 'spin' ? C.cyan : C.dim);
    y += 14;
    const mult = baseMult(run);
    sText(ctx, `LUCK ${run.luck}`, x, y, C.green);
    y += 9;
    sText(ctx, `MULT X${+mult.toFixed(2)}`, x, y, C.orange);
  }

  progress(ctx, x, y, w, v, run) {
    const k = Math.min(1, v.shownCoins / run.debt);
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y, w, 7);
    ctx.fillStyle = '#2a1030';
    ctx.fillRect(x + 1, y + 1, w - 2, 5);
    const fw = Math.round((w - 2) * k);
    ctx.fillStyle = k >= 1 ? C.green : C.gold;
    ctx.fillRect(x + 1, y + 1, fw, 5);
    ctx.fillStyle = k >= 1 ? '#d8ffe6' : C.Y || '#fff3a8';
    ctx.fillRect(x + 1, y + 1, fw, 1);
    if (k >= 1) sText(ctx, 'COVERED', x + w - measureText('COVERED') - 2, y + 1, C.ink, 1, 'transparent');
  }

  drawCharms(ctx, v, regions) {
    const run = v.run;
    const { L } = this;
    const ch = L.charms;
    if (!L.portrait) sText(ctx, `CHARMS ${run.charms.length}/${MAX_CHARMS}`, ch.x, ch.y - 10, C.muted);
    for (let i = 0; i < MAX_CHARMS; i++) {
      const x = ch.x + (i % ch.cols) * 22, y = ch.y + Math.floor(i / ch.cols) * 22;
      const id = run.charms[i];
      const focus = v.focus === `charm:${i}` || v.hover === `charm:${i}`;
      this.token(ctx, x, y, id, focus, v, v.charmPulse && v.charmPulse[id] > v.time);
      if (id) regions.push({ id: `charm:${i}`, x, y, w: 20, h: 20, nav: !v.panel });
    }
    // Info about the focused charm.
    const sel = [v.focus, v.hover].find((f) => f && f.startsWith('charm:'));
    const id = sel ? run.charms[Number(sel.split(':')[1])] : null;
    const info = L.info;
    const cols = Math.max(12, Math.floor(info.w / 6));
    if (id) {
      const c = CHARM_BY_ID[id];
      sText(ctx, c.name, info.x, info.y, RARITY[c.rarity].color);
      wrap(this.charmDesc(run, id), cols).slice(0, 5).forEach((l, i) => sText(ctx, l, info.x, info.y + 9 + i * 8, C.line));
    } else if (!L.portrait && run.charms.length === 0) {
      wrap('BUY CHARMS WITH TICKETS AT THE PIT STOP.', cols).forEach((l, i) => sText(ctx, l, info.x, info.y + i * 8, C.dim));
    } else if (!L.portrait) {
      wrap('POINT AT A CHARM TO READ IT.', cols).forEach((l, i) => sText(ctx, l, info.x, info.y + i * 8, C.dim));
    }
  }

  charmDesc(run, id) {
    let d = CHARM_BY_ID[id].desc;
    if (id === 'dark_matter') d += ` NOW +${(run.darkMatter * 0.25).toFixed(2)}.`;
    if (id === 'streak') d += ` NOW +${run.streak}.`;
    return d;
  }

  token(ctx, x, y, id, focus, v, pulse = false) {
    if (!id) {
      ctx.fillStyle = '#20244d';
      ctx.fillRect(x, y, 20, 20);
      ctx.fillStyle = C.ink;
      ctx.fillRect(x + 1, y + 1, 18, 18);
      return;
    }
    const c = CHARM_BY_ID[id];
    const col = RARITY[c.rarity].color;
    const lift = focus && !v.reducedMotion ? -1 : 0;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 1, y - 1 + lift, 22, 22);
    ctx.fillStyle = focus ? '#fff' : col;
    ctx.fillRect(x, y + lift, 20, 20);
    ctx.fillStyle = pulse && Math.floor(v.time * 16) % 2 ? col : C.panel2;
    ctx.fillRect(x + 1, y + 1 + lift, 18, 18);
    ctx.drawImage(this.S.charm[id], x + 2, y + 2 + lift);
  }

  // ---------------------------------------------------------------- title
  drawTitleSide(ctx, v) {
    const { L, S } = this;
    const best = v.best || {};
    const lines = [];
    if (best.runs) {
      lines.push(['BEST RUN', C.muted]);
      lines.push([best.escaped ? `ESCAPED X${best.escaped}` : `ROUND ${best.round || 1}`, C.gold]);
      lines.push(['', C.muted]);
      lines.push(['BIGGEST WIN', C.muted]);
      lines.push([fmt(best.win || 0), C.gold]);
      lines.push(['', C.muted]);
      lines.push([`${best.runs} RUNS`, C.dim]);
    }
    if (!L.portrait) {
      let y = L.hud.y + 4;
      sText(ctx, 'PAY THE DEBT', L.hud.x, y, C.red);
      y += 9;
      sText(ctx, 'OR FALL IN.', L.hud.x, y, C.red);
      y += 18;
      for (const [text, col] of lines) {
        sText(ctx, text, L.hud.x, y, col);
        y += 9;
      }
      // Paytable on the right.
      const px = L.charms.x;
      let py = L.my + 4;
      sText(ctx, 'PAYTABLE', px, py, C.muted);
      py += 10;
      for (const s of SYMBOLS) {
        ctx.drawImage(S.sym[s.id], px, py);
        sText(ctx, `${s.value}`, px + 20, py + 5, C.gold);
        py += 17;
        if (py > L.my + MH - 10) break;
      }
      ctx.drawImage(S.sym.void, px + 40, L.my + 14);
      wrap('3 VOID EYES EAT YOUR COINS', 10).forEach((l, i) => sText(ctx, l, px + 40, L.my + 34 + i * 8, C.pink));
    } else {
      const y = L.charms.y + 2;
      const gap = Math.min(30, Math.floor((this.W - 8) / SYMBOLS.length));
      let x = Math.floor((this.W - SYMBOLS.length * gap) / 2) + Math.floor((gap - 16) / 2);
      for (const s of SYMBOLS) {
        ctx.drawImage(S.sym[s.id], x, y);
        sText(ctx, `${s.value}`, x + 5, y + 18, C.gold);
        x += gap;
      }
      let ty = L.hud.y + 4;
      cText(ctx, 'PAY THE DEBT OR FALL IN.', this.W / 2, ty, C.red);
      ty += 12;
      if (best.runs) {
        cText(ctx, `BEST: ${lines[1][0]}  WIN: ${lines[4][0]}`, this.W / 2, ty, C.gold);
      }
    }
  }

  // ---------------------------------------------------------------- panels
  button(ctx, regions, v, id, x, y, w, h, label, { color = C.gold, sub = null, disabled = false, subColor = C.muted } = {}) {
    const focus = v.focus === id || v.hover === id;
    const blink = focus && Math.floor(v.time * 4) % 2 === 0 && !v.reducedMotion;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 3);
    ctx.fillStyle = disabled ? '#3b3f75' : focus ? '#fff' : color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = disabled ? C.panel2 : focus ? (blink ? color : '#fff8d0') : C.panel2;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    const tc = disabled ? C.dim : focus ? C.ink : color;
    const ty = sub ? y + Math.round(h / 2) - 7 : y + Math.round(h / 2) - 2;
    cText(ctx, label, x + w / 2, ty, tc, 1, (g, t, xx, yy, cc) => drawText(g, t, xx, yy, cc));
    if (sub) cText(ctx, sub, x + w / 2, ty + 8, focus ? C.ink : subColor, 1, (g, t, xx, yy, cc) => drawText(g, t, xx, yy, cc));
    regions.push({ id, x, y, w, h, nav: true, disabled });
  }

  drawPanel(ctx, v, regions) {
    const { W, H } = this;
    // Dim what's behind.
    ctx.fillStyle = 'rgba(5,3,15,0.55)';
    ctx.fillRect(0, 0, W, H);
    switch (v.panel) {
      case 'shop':
        this.shopPanel(ctx, v, regions);
        break;
      case 'deadline':
        this.deadlinePanel(ctx, v, regions);
        break;
      case 'transmit':
        this.transmitPanel(ctx, v, regions);
        break;
      case 'over':
        this.overPanel(ctx, v, regions);
        break;
      case 'won':
        this.wonPanel(ctx, v, regions);
        break;
      default:
    }
  }

  panelBox(ctx, w, h, border = C.line) {
    const x = Math.round((this.W - w) / 2);
    const y = Math.max(2, Math.round((this.H - h) / 2));
    box(ctx, x, y, w, h, C.panel, border);
    return { x, y };
  }

  shopPanel(ctx, v, regions) {
    const run = v.run;
    const w = Math.min(this.W - 6, 264);
    const early = canPayEarly(run);
    const h = 206;
    const { x, y } = this.panelBox(ctx, w, h);
    sText(ctx, 'PIT STOP', x + 8, y + 7, C.gold, 2);
    const day = `DAY ${run.day} OF ${DAYS}`;
    sText(ctx, day, x + w - 8 - measureText(day), y + 7, C.muted);
    const tk = `${run.tickets}`;
    ctx.drawImage(this.S.ticket, x + w - 8 - measureText(tk) - 12, y + 16);
    sText(ctx, tk, x + w - 8 - measureText(tk), y + 17, C.pink);

    // Four charms for sale.
    const cardW = Math.floor((w - 16 - 3 * 5) / 4);
    let cy = y + 28;
    run.shop.forEach((id, i) => {
      const bx = x + 8 + i * (cardW + 5);
      const rid = `shop:${i}`;
      const focus = v.focus === rid || v.hover === rid;
      ctx.fillStyle = C.ink;
      ctx.fillRect(bx - 1, cy - 1, cardW + 2, 42);
      ctx.fillStyle = focus ? '#fff' : id ? RARITY[CHARM_BY_ID[id].rarity].color : '#3b3f75';
      ctx.fillRect(bx, cy, cardW, 40);
      ctx.fillStyle = C.panel2;
      ctx.fillRect(bx + 1, cy + 1, cardW - 2, 38);
      if (id) {
        const c = CHARM_BY_ID[id];
        const bob = focus && !v.reducedMotion ? Math.round(Math.sin(v.time * 8)) : 0;
        this.token(ctx, bx + Math.floor(cardW / 2) - 10, cy + 4 + bob, id, false, v);
        const afford = run.tickets >= c.price;
        const ptxt = `${c.price}`;
        const pw = measureText(ptxt) + 11;
        ctx.drawImage(this.S.ticket, bx + Math.floor((cardW - pw) / 2), cy + 28);
        sText(ctx, ptxt, bx + Math.floor((cardW - pw) / 2) + 11, cy + 29, afford ? C.pink : C.dim);
      } else {
        cText(ctx, 'SOLD', bx + cardW / 2, cy + 17, C.dim);
      }
      regions.push({ id: rid, x: bx, y: cy, w: cardW, h: 40, nav: true, disabled: !id });
    });
    cy += 46;

    // Your charms (click one twice to sell it).
    sText(ctx, 'YOURS', x + 8, cy + 7, C.muted);
    for (let i = 0; i < MAX_CHARMS; i++) {
      const tx = x + 44 + i * 23;
      const id = run.charms[i];
      const rid = `own:${i}`;
      this.token(ctx, tx, cy, id, v.focus === rid || v.hover === rid, v, v.sellArm === i);
      if (id) regions.push({ id: rid, x: tx, y: cy, w: 20, h: 20, nav: true });
    }
    cy += 26;

    // Description of whatever is focused.
    const dh = 38;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x + 8, cy, w - 16, dh);
    const cols = Math.floor((w - 24) / 6);
    const sel = v.hover || v.focus || '';
    let lines = [];
    let head = null, headCol = C.gold;
    if (sel.startsWith('shop:') && run.shop[+sel.split(':')[1]]) {
      const id = run.shop[+sel.split(':')[1]];
      const c = CHARM_BY_ID[id];
      head = `${c.name}`;
      headCol = RARITY[c.rarity].color;
      lines = wrap(c.desc, cols);
      if (run.charms.length >= MAX_CHARMS) lines.push('SELL A CHARM TO MAKE ROOM.');
    } else if (sel.startsWith('own:') && run.charms[+sel.split(':')[1]]) {
      const id = run.charms[+sel.split(':')[1]];
      const c = CHARM_BY_ID[id];
      head = c.name;
      headCol = RARITY[c.rarity].color;
      lines = wrap(this.charmDesc(run, id), cols);
      lines.push(v.sellArm === +sel.split(':')[1] ? `AGAIN = SELL FOR +${sellValue(id)}T` : `SELECT AGAIN TO SELL (+${sellValue(id)})`);
    } else if (sel === 'reroll') {
      head = 'REROLL';
      lines = wrap('Swap the four charms for new ones. Costs more each time today.', cols);
    } else if (sel === 'early') {
      head = 'PAY EARLY';
      lines = wrap(`Pay ${run.debt} now, skip the rest of this round and get ${earlyBonus(run)} bonus tickets.`, cols);
    } else if (sel.startsWith('pkg:')) {
      head = 'START THE DAY';
      lines = wrap('Pick a deal. Tickets buy charms here at the pit stop.', cols);
    } else {
      head = `DEBT ${fmt(run.debt)} DUE IN ${DAYS - run.day + 1} DAYS`;
      headCol = C.red;
      lines = wrap('Buy charms with tickets, then pick how to play the day.', cols);
    }
    if (head) sText(ctx, head.toUpperCase(), x + 12, cy + 4, headCol);
    lines.slice(0, 3).forEach((l, i) => sText(ctx, l.toUpperCase(), x + 12, cy + 13 + i * 8, C.line));
    cy += dh + 6;

    // Reroll and pay early.
    const half = Math.floor((w - 16 - 6) / 2);
    const cost = rerollCost(run);
    this.button(ctx, regions, v, 'reroll', x + 8, cy, half, 16, `REROLL  ${cost}T`, { color: C.pink, disabled: run.tickets < cost });
    if (early) this.button(ctx, regions, v, 'early', x + 8 + half + 6, cy, half, 16, `PAY EARLY +${earlyBonus(run)}T`, { color: C.green });
    else {
      sText(ctx, 'COINS', x + 14 + half, cy + 5, C.dim);
      sText(ctx, fmt(run.coins), x + 14 + half + measureText('COINS '), cy + 5, C.gold);
    }
    cy += 22;

    // The two deals.
    PACKAGES.forEach((p, k) => {
      const n = spinsFor(run, k);
      this.button(ctx, regions, v, `pkg:${k}`, x + 8 + k * (half + 6), cy, half, 24, `${n} SPINS`, {
        color: k ? C.cyan : C.gold, sub: `+${p.tickets} TICKET${p.tickets > 1 ? 'S' : ''}`, subColor: C.pink,
      });
    });
  }

  deadlinePanel(ctx, v, regions) {
    const run = v.run;
    const w = Math.min(this.W - 6, 236);
    const { x, y } = this.panelBox(ctx, w, 104, C.red);
    const cx = x + w / 2;
    cText(ctx, 'DEADLINE', cx, y + 8, C.red, 3, oText);
    cText(ctx, `THE HOLE WANTS ${fmt(run.debt)} COINS.`, cx, y + 32, C.line);
    const enough = run.coins >= run.debt;
    cText(ctx, `YOU HAVE ${fmt(run.coins)}.`, cx, y + 42, enough ? C.green : C.red);
    this.button(ctx, regions, v, 'pay', x + 16, y + 60, w - 32, 30, enough ? `PAY ${fmt(run.debt)}` : 'FACE THE VOID', {
      color: enough ? C.green : C.red, sub: enough ? `KEEP ${fmt(run.coins - run.debt)}` : 'IT HUNGERS',
    });
  }

  transmitPanel(ctx, v, regions) {
    const run = v.run;
    const w = Math.min(this.W - 6, 250);
    const h = 150;
    const { x, y } = this.panelBox(ctx, w, h, C.cyan);
    const cx = x + w / 2;
    // Static on the screen edge.
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#1c5bd9' : '#0e2f6b';
      ctx.fillRect(x + 3 + Math.floor(Math.random() * (w - 6)), y + 3 + Math.floor(Math.random() * 12), 3, 1);
    }
    const head = 'INCOMING TRANSMISSION';
    const age = v.time - (v.panelT0 || 0);
    const shown = v.reducedMotion ? head.length : Math.min(head.length, Math.floor(age * 30));
    sText(ctx, head.slice(0, shown), cx - measureText(head) / 2, y + 7, C.cyan);
    cText(ctx, 'DEBT PAID. THE VOID IS AMUSED.', cx, y + 19, C.muted);
    cText(ctx, 'IT OFFERS YOU ONE GIFT:', cx, y + 28, C.muted);
    run.offers.forEach((o, i) => {
      const col = [C.gold, C.pink, C.green][i];
      const [l1, l2] = wrap(o.text.toUpperCase(), Math.floor((w - 28) / 6));
      this.button(ctx, regions, v, `offer:${i}`, x + 10, y + 42 + i * 26, w - 20, 22, l1, { color: col, sub: l2 || null, subColor: col });
    });
    cText(ctx, `NEXT: ${fmt(v.nextDebt)} COINS IN ${DAYS} DAYS`, cx, y + h - 14, C.red);
  }

  overPanel(ctx, v, regions) {
    const run = v.run;
    const w = Math.min(this.W - 6, 240);
    const { x, y } = this.panelBox(ctx, w, 128, C.red);
    const cx = x + w / 2;
    cText(ctx, 'SWALLOWED', cx, y + 8, C.red, 3, oText);
    cText(ctx, `YOU OWED ${fmt(run.debt)} AND HAD ${fmt(run.coins)}.`, cx, y + 30, C.muted);
    cText(ctx, `REACHED ROUND ${run.round}${run.endless ? ' (ENDLESS)' : ''}`, cx, y + 44, C.gold);
    cText(ctx, `EARNED ${fmt(run.stats.earned)}  BEST WIN ${fmt(run.stats.bestWin)}`, cx, y + 54, C.line);
    cText(ctx, `${run.stats.spins} SPINS  ${run.stats.jackpots} JACKPOTS`, cx, y + 64, C.dim);
    if (v.newBest) cText(ctx, 'NEW PERSONAL BEST!', cx, y + 76, Math.floor(v.time * 4) % 2 ? C.gold : C.pink);
    this.button(ctx, regions, v, 'newrun', x + 30, y + 92, w - 60, 24, 'NEW RUN', { color: C.gold });
  }

  wonPanel(ctx, v, regions) {
    const run = v.run;
    const w = Math.min(this.W - 6, 250);
    const { x, y } = this.panelBox(ctx, w, 132, C.gold);
    const cx = x + w / 2;
    const text = 'ESCAPED!';
    const tw = measureText(text, 3);
    for (let i = 0; i < text.length; i++) {
      const wave = v.reducedMotion ? 0 : Math.round(Math.sin(v.time * 8 + i) * 2);
      oText(ctx, text[i], Math.round(cx - tw / 2) + i * 18, y + 8 + wave, hsl(v.time * 300 + i * 40), 3);
    }
    cText(ctx, 'YOU PAID ALL EIGHT DEBTS AND', cx, y + 32, C.line);
    cText(ctx, 'BROKE FREE OF THE BLACK HOLE.', cx, y + 41, C.line);
    cText(ctx, `EARNED ${fmt(run.stats.earned)}  BEST WIN ${fmt(run.stats.bestWin)}`, cx, y + 54, C.gold);
    const half = Math.floor((w - 26) / 2);
    this.button(ctx, regions, v, 'endless', x + 10, y + 72, half, 44, 'KEEP GOING', { color: C.pink, sub: 'ENDLESS' });
    this.button(ctx, regions, v, 'cashout', x + 16 + half, y + 72, half, 44, 'CASH OUT', { color: C.gold, sub: 'NEW RUN' });
  }
}

export { C as COLORS, LINE_COLORS, RX, RY, RW, RH, SYMBOL_BY_ID, symbolValue };
