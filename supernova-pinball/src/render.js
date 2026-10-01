// Draws the table (a pre-painted neon playfield per sector plus everything
// that moves or lights up), the dot-matrix display, the side panels and the
// in-canvas menus. Shapes are smooth vector paths drawn at `RS` device pixels
// per table unit; only the lettering keeps its chunky pixel font. Returns
// clickable regions each frame.
import { FINAL_SECTOR, MULTS, UNLOCKS, UPGRADE_BY_ID, sectorFor } from './data.js';
import { drawText, measureText, wrap } from './font.js';
import {
  ARC, BALL_R, BINARY, CANNON, CAPTIVE, CX, LANE_XS, LETTERS, PLUNGER, SAUCER, SHOTS, STAR, TH, TW, VORTEX, WHITE_HOLE, m, rampPoint,
} from './table.js';

export const DMD_W = 96, DMD_H = 16; // dots
const DMD_PX = 1.75; // table units per dot
export const DMD_HEIGHT = Math.ceil(DMD_H * DMD_PX + 4);

const C = {
  ink: '#05030f', panel: '#10132e', panel2: '#181c42', line: '#eef1f6', muted: '#aeb8e2', dim: '#5d6690',
  gold: '#ffd23f', pink: '#ff5ad1', cyan: '#7ff4ff', red: '#ff3b4e', green: '#8fffc0', orange: '#ff9b2f', dmd: '#ff9b2f',
};
export { C as COLORS };

export const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const hsl = (h, s = 100, l = 60) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;
const TAU = Math.PI * 2;

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// ---------------------------------------------------------------- vector helpers
function line(g, x0, y0, x1, y1, color, w = 1) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}
function poly(g, pts, color, w = 1, close = false) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
  g.stroke();
}
function disc(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, TAU);
  g.fill();
}
function ring(g, x, y, r, color, w = 0.8) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, TAU);
  g.stroke();
}
/** A glowing blob: a radial gradient from `color` to transparent. */
function glow(g, x, y, r, color, alpha = 0.6) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = alpha;
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}
/** A shaded sphere: highlight, body, shadow. */
function sphere(g, x, y, r, light, body, dark) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, light);
  gr.addColorStop(0.45, body);
  gr.addColorStop(1, dark);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}
function rrect(g, x, y, w, h, r, fill, stroke = null, lw = 1) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}
function starShape(g, x, y, r0, r1, color, rot = 0) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 ? r1 : r0;
    if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}
function arrow(g, x, y, color, s = 1) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - 3 * s);
  g.lineTo(x + 3.2 * s, y + 2.5 * s);
  g.lineTo(x - 3.2 * s, y + 2.5 * s);
  g.closePath();
  g.fill();
}
// The pixel font is one fillRect per lit pixel (nine times over for an
// outline), so lettering is drawn once into a sprite and reused. Colours that
// change every frame (fractional hues) are drawn directly instead.
let RES = 1; // device pixels per table unit, set by the renderer
const sprites = new Map();
const OUTLINE = [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
function shadowed(g, text, x, y, color, scale, outline) {
  if (outline) for (const [dx, dy] of OUTLINE) drawText(g, text, x + dx * scale, y + dy * scale, C.ink, scale);
  else drawText(g, text, x + scale, y + scale, C.ink, scale);
  drawText(g, text, x, y, color, scale);
}
function spriteText(g, text, x, y, color, scale, outline) {
  x = Math.round(x);
  y = Math.round(y);
  if (/\d\.\d/.test(color)) {
    shadowed(g, text, x, y, color, scale, outline);
    return;
  }
  const key = `${RES}|${scale}|${outline ? 1 : 0}|${color}|${text}`;
  let c = sprites.get(key);
  if (!c) {
    if (sprites.size >= 500) sprites.clear();
    c = mk((measureText(text, scale) + 2 * scale) * RES, 7 * scale * RES);
    const sg = c.getContext('2d');
    sg.setTransform(RES, 0, 0, RES, 0, 0);
    shadowed(sg, text, scale, scale, color, scale, outline);
    sprites.set(key, c);
  }
  g.drawImage(c, x - scale, y - scale, c.width / RES, c.height / RES);
}
const sText = (g, text, x, y, color, scale = 1) => spriteText(g, String(text), x, y, color, scale, false);
const oText = (g, text, x, y, color, scale = 1) => spriteText(g, String(text), x, y, color, scale, true);
const cText = (g, text, cx, y, color, scale = 1, fn = sText) => fn(g, text, Math.round(cx - measureText(String(text), scale) / 2), y, color, scale);

function box(g, x, y, w, h, fill, border) {
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(x + 4, y + 4, w, h);
  g.fillStyle = C.ink;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = border;
  g.fillRect(x, y, w, h);
  g.fillStyle = fill;
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
}

/** The two rails either side of a path, `off` units out. */
function offsetPath(path, off) {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / l) * off, p[1] + (dx / l) * off];
  });
}

const PLANETS = [
  ['#fff3a8', '#ffd23f', '#c4541b'], ['#ffffff', '#7ff4ff', '#1c5bd9'], ['#ffd0f2', '#ff5ad1', '#5a1f9e'], ['#e0ffe8', '#3de07a', '#0f5a36'],
];

export class Renderer {
  constructor() {
    this.art = {};
    this.RS = 1;
    this.dmd = mk(DMD_W, DMD_H);
    this.dg = this.dmd.getContext('2d', { willReadFrequently: true });
    this.bc = mk(TW / 4, TH / 4);
    this.bg = this.bc.getContext('2d');
    this.bc2 = mk(TW / 8, TH / 8);
    this.bg2 = this.bc2.getContext('2d');
    let s = 11;
    this.rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.W = 0;
    this.rails = {};
  }

  /** `inset`: the screen's safe area insets, in table units. */
  resize(W, H, RS = 1, inset = { top: 0, right: 0, bottom: 0, left: 0 }) {
    this.W = W;
    this.H = H;
    RES = RS;
    if (RS !== this.RS || !this.tc) {
      this.RS = RS;
      this.art = {};
      // The table is drawn into its own canvas, then a blurred copy is added
      // on top for a neon bloom.
      this.tc = mk(TW * RS, TH * RS);
      this.tg = this.tc.getContext('2d');
    }
    const L = (this.L = {});
    const total = DMD_HEIGHT + 3 + TH;
    const iw = W - inset.left - inset.right, ih = H - inset.top - inset.bottom;
    L.side = iw >= TW + 2 * 112;
    L.tx = Math.floor(inset.left + (iw - TW) / 2);
    const spare = Math.max(0, ih - total);
    L.bottom = !L.side && spare >= 30;
    L.dy = Math.floor(inset.top + spare / (L.bottom ? 3 : 2));
    L.ty = L.dy + DMD_HEIGHT + 3;
    L.dmdX = L.tx + (TW - DMD_W * DMD_PX) / 2;
    L.dmdW = DMD_W * DMD_PX;
    // A starry backdrop at full resolution.
    this.stars = mk(W * RS, H * RS);
    const g = this.stars.getContext('2d');
    g.fillStyle = C.ink;
    g.fillRect(0, 0, W * RS, H * RS);
    for (let i = 0; i < (W * H) / 90; i++) {
      const b = this.rand();
      g.fillStyle = b > 0.97 ? '#fff' : b > 0.85 ? '#aeb8e2' : b > 0.6 ? '#5d6690' : '#23264a';
      g.beginPath();
      g.arc(this.rand() * W * RS, this.rand() * H * RS, (b > 0.97 ? 0.7 : 0.45) * RS, 0, TAU);
      g.fill();
    }
  }

  // ---------------------------------------------------------------- playfield art
  tableArt(g, key = g.sector) {
    if (this.art[key]) return this.art[key];
    // Only this sector's and the next one's art are kept (each is megabytes).
    for (const k of Object.keys(this.art)) if (Number(k) !== key && Number(k) !== g.sector) delete this.art[k];
    const RS = this.RS;
    const pal = sectorFor(key).pal;
    const c = mk(TW * RS, TH * RS);
    const a = c.getContext('2d');
    a.setTransform(RS, 0, 0, RS, 0, 0);
    // Cabinet wood outside the dome, deep space inside it.
    a.fillStyle = '#0b0716';
    a.fillRect(0, 0, TW, TH);
    a.save();
    a.beginPath();
    a.moveTo(4, TH);
    a.lineTo(4, ARC.y);
    a.arc(ARC.x, ARC.y, ARC.r, Math.PI, 0);
    a.lineTo(236, TH);
    a.closePath();
    a.clip();
    a.fillStyle = pal.bg;
    a.fillRect(0, 0, TW, TH);
    // Nebulae.
    let s = key * 97 + 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const [bx, by, br, col] of [[60, 110, 90, pal.a], [180, 250, 100, pal.b], [80, 360, 70, pal.a], [170, 80, 60, pal.b]]) {
      const gr = a.createRadialGradient(bx, by, 0, bx, by, br);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      a.globalAlpha = 0.16;
      a.fillStyle = gr;
      a.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    a.globalAlpha = 1;
    for (let i = 0; i < 160; i++) {
      const b = r();
      disc(a, r() * TW, r() * TH, b > 0.9 ? 0.5 : 0.3, b > 0.8 ? '#fff' : '#5d6690');
    }
    // A faint grid, like a star chart.
    a.globalAlpha = 0.06;
    for (let x = 0; x < TW; x += 20) line(a, x, 0, x, TH, pal.glow, 0.4);
    for (let y = 0; y < TH; y += 20) line(a, 0, y, TW, y, pal.glow, 0.4);
    a.globalAlpha = 1;
    // Gravity rings round the star.
    for (let k = 1; k <= 5; k++) {
      a.globalAlpha = 0.22 - k * 0.035;
      ring(a, STAR.x, STAR.y, 16 + k * 11, pal.a, 0.6);
    }
    a.globalAlpha = 1;
    // Side lanes.
    for (const lx of [4, 223]) {
      const gr = a.createLinearGradient(lx, 0, lx + 13, 0);
      gr.addColorStop(0, '#05030a');
      gr.addColorStop(0.5, '#120c22');
      gr.addColorStop(1, '#05030a');
      a.fillStyle = gr;
      a.fillRect(lx, 150, 13, TH - 150);
      for (let y = 190; y < 450; y += 16) arrow(a, lx + 6.5, y, pal.b, 0.8);
    }
    // The vortex: a dark bowl with spiral arms.
    {
      const gr = a.createRadialGradient(VORTEX.x, VORTEX.y, 2, VORTEX.x, VORTEX.y, VORTEX.r + 2);
      gr.addColorStop(0, '#000');
      gr.addColorStop(0.7, '#0a0418');
      gr.addColorStop(1, pal.a);
      disc(a, VORTEX.x, VORTEX.y, VORTEX.r + 2, gr);
      ring(a, VORTEX.x, VORTEX.y, VORTEX.r + 2, pal.glow, 0.8);
    }
    // The loop's shadow and the captive ball's chamber.
    rrect(a, CAPTIVE.x - 5.5, 236, 11, 64, 4, '#07040f');
    // The mystery saucer's collar.
    disc(a, SAUCER.x, SAUCER.y, 8, '#07040f');
    ring(a, SAUCER.x, SAUCER.y, 8, pal.b, 0.8);
    // Apron.
    {
      const gr = a.createLinearGradient(0, 420, 0, TH);
      gr.addColorStop(0, '#1a1030');
      gr.addColorStop(1, '#07040f');
      a.fillStyle = gr;
      a.beginPath();
      a.moveTo(17, 420);
      a.lineTo(66, 476);
      a.lineTo(174, 476);
      a.lineTo(223, 420);
      a.lineTo(223, TH);
      a.lineTo(17, TH);
      a.fill();
    }
    // Slingshot plastics.
    for (const side of [1, -1]) {
      const X = (x) => (side === 1 ? x : m(x));
      a.fillStyle = pal.a;
      a.globalAlpha = 0.28;
      a.beginPath();
      a.moveTo(X(46), 368);
      a.lineTo(X(46), 402);
      a.lineTo(X(72), 422);
      a.closePath();
      a.fill();
      a.globalAlpha = 1;
    }
    // Neon walls: halo, colour, hot core. The dome is one smooth arc.
    const walls = g.table.segments.filter((q) => ['wall', 'guide', 'apron', 'laneguide', 'gate'].includes(q.kind));
    for (const [col, w, alpha] of [[pal.a, 5, 0.25], [pal.a, 2.2, 1], [pal.glow, 0.8, 1]]) {
      a.globalAlpha = alpha;
      a.strokeStyle = col;
      a.lineWidth = w;
      a.beginPath();
      a.arc(ARC.x, ARC.y, ARC.r, Math.PI, 0);
      a.stroke();
      for (const q of walls) line(a, q.ax, Math.min(q.ay, TH + 2), q.bx, Math.min(q.by, TH + 2), col, q.kind === 'gate' ? w * 0.5 : q.kind === 'laneguide' ? w * 0.8 : w);
    }
    a.globalAlpha = 1;
    a.restore();
    // Dome trim.
    a.strokeStyle = '#2a2440';
    a.lineWidth = 2;
    a.beginPath();
    a.arc(ARC.x, ARC.y, ARC.r + 3, Math.PI, 0);
    a.stroke();
    // Lettering.
    ['S', 'T', 'A', 'R'].forEach((ch, i) => drawText(a, ch, LANE_XS[i] + 6, 66, '#3a3055'));
    a.globalAlpha = 0.6;
    drawText(a, 'ION', 110, 164, pal.b);
    drawText(a, '?', SAUCER.x - 2, SAUCER.y + 11, pal.b);
    a.globalAlpha = 0.7;
    const t1 = 'SUPERNOVA';
    drawText(a, t1, Math.round(CX - measureText(t1) / 2), TH - 12, pal.a);
    a.globalAlpha = 1;
    this.art[key] = c;
    return c;
  }

  // ---------------------------------------------------------------- frame
  draw(ctx, g, v) {
    const { L, W, H, RS } = this;
    const regions = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.stars, 0, 0);
    ctx.setTransform(RS, 0, 0, RS, 0, 0);
    const pal = sectorFor(g.sector).pal;

    // Screen shake and nudge offset.
    const sx = v.shake ? (Math.random() - 0.5) * v.shake * 2 : 0;
    const sy = v.shake ? (Math.random() - 0.5) * v.shake * 2 : 0;
    const nx = v.nudgeX || 0;
    const ox = L.tx + sx + nx, oy = L.ty + sy;

    this.drawBackdrop(ctx, g, v, pal);
    this.drawCabinet(ctx, g, v, pal, ox, oy);
    this.drawDmd(ctx, v, L.dmdX + sx, L.dy + 2 + sy);

    const tg = this.tg;
    tg.setTransform(RS, 0, 0, RS, 0, 0);
    this.drawTable(tg, g, v, pal);
    ctx.drawImage(this.tc, ox, oy, TW, TH);
    this.bloom(ctx, g, v, ox, oy);

    if (L.side) this.drawSides(ctx, g, v, pal);
    else if (L.bottom) this.drawBottom(ctx, g, v, pal);

    if (v.flash > 0) {
      ctx.globalAlpha = Math.min(1, v.flash);
      ctx.fillStyle = v.flashColor || '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (v.panel) this.drawPanel(ctx, g, v, regions, pal);
    // Paint the next sector's table while the warp screen is up.
    if (v.panel === 'warp' && g.phaseT > 0.5 && !this.art[g.sector + 1]) this.tableArt(g, g.sector + 1);
    return regions;
  }

  drawBackdrop(ctx, g, v, pal) {
    // A slow light show behind the table, wilder in supernova and multiball.
    const { W, L } = this;
    const t = v.time;
    const wild = g.supernovaT > 0 || g.multiball || v.lightShow > 0;
    const n = wild ? 18 : 8;
    const cx = L.tx + TW / 2, cy = L.ty + 240;
    if (v.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * (wild ? 0.9 : 0.15);
      ctx.globalAlpha = wild ? 0.12 : 0.05;
      ctx.fillStyle = wild ? hsl(i * 40 + t * 120) : i % 2 ? pal.a : pal.b;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - 0.08) * W, cy + Math.sin(a - 0.08) * W);
      ctx.lineTo(cx + Math.cos(a + 0.08) * W, cy + Math.sin(a + 0.08) * W);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The cabinet: side rails with chasing lights round the playfield. */
  drawCabinet(ctx, g, v, pal, ox, oy) {
    const t = v.time;
    const fast = g.supernovaT > 0 || g.multiball;
    for (const x of [ox - 5, ox + TW + 1]) {
      const gr = ctx.createLinearGradient(x, 0, x + 4, 0);
      gr.addColorStop(0, '#1a1430');
      gr.addColorStop(0.5, '#4a4f7a');
      gr.addColorStop(1, '#1a1430');
      rrect(ctx, x, oy - 2, 4, TH + 2, 2, gr);
      if (v.reducedMotion) continue;
      for (let y = 4; y < TH; y += 10) {
        const on = (Math.floor(y / 10) + Math.floor(t * (fast ? 30 : 8))) % 4 === 0;
        if (on) disc(ctx, x + 2, oy + y, 1.1, g.supernovaT > 0 ? hsl(y * 3 + t * 400) : pal.a);
      }
    }
  }

  /** Neon bloom: a small blurry copy of the table, added back on top. */
  bloom(ctx, g, v, ox, oy) {
    const k = g.supernovaT > 0 ? 0.7 : g.multiball || v.lightShow > 0 ? 0.55 : 0.38;
    for (const [c, cg, a] of [[this.bc, this.bg, k], [this.bc2, this.bg2, k * 0.7]]) {
      cg.imageSmoothingEnabled = true;
      cg.clearRect(0, 0, c.width, c.height);
      cg.drawImage(this.tc, 0, 0, c.width, c.height);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.drawImage(c, ox - 2, oy - 2, TW + 4, TH + 4);
      ctx.restore();
    }
  }

  drawTable(ctx, g, v, pal) {
    const t = v.time;
    const tb = g.table;
    ctx.drawImage(this.tableArt(g), 0, 0, TW, TH);
    this.drawLamps(ctx, g, v, pal);

    // The vortex: spiral arms turning inwards, faster when it has a ball.
    const busy = g.balls.some((b) => b.held === 'wormhole');
    ctx.save();
    ctx.translate(VORTEX.x, VORTEX.y);
    ctx.rotate(t * (busy ? 7 : 1.6));
    for (let k = 0; k < 3; k++) {
      ctx.rotate(TAU / 3);
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const rr = 2 + (i / 24) * (VORTEX.r - 1);
        const an = i * 0.16;
        if (i) ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
        else ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
      }
      ctx.strokeStyle = k ? pal.b : '#fff';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    disc(ctx, VORTEX.x, VORTEX.y, 4.5, '#000');
    ring(ctx, VORTEX.x, VORTEX.y, 4.5, busy ? '#fff' : pal.glow, 0.8);

    // The white hole, where the wormhole comes out.
    {
      const wh = WHITE_HOLE;
      const pulse = busy ? 1 : 0.55 + Math.sin(t * 3) * 0.2;
      glow(ctx, wh.x, wh.y, 9 + Math.sin(t * 5), '#fff', pulse * 0.7);
      ring(ctx, wh.x, wh.y, 5 + Math.sin(t * 6) * 0.6, pal.b, 1);
      disc(ctx, wh.x, wh.y, 1.8, '#fff');
    }

    // The mystery saucer: a hole ringed with chasing lights.
    {
      const held = g.balls.some((b) => b.held === 'saucer');
      disc(ctx, SAUCER.x, SAUCER.y, 5, '#000');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const on = (i + Math.floor(t * (held ? 30 : 6))) % 5 === 0;
        disc(ctx, SAUCER.x + Math.cos(a) * 6.8, SAUCER.y + Math.sin(a) * 6.8, 0.9, on ? (held ? hsl(i * 36 + t * 600) : C.gold) : '#3a3055');
      }
    }

    // SUPERNOVA letters over the star, and the inlane rollover stars.
    tb.letters.forEach((q, i) => {
      const on = q.lit || ((g.supernovaT > 0 || v.lightShow > 0) && (i + Math.floor(t * 12)) % 3 === 0);
      if (on) glow(ctx, q.x, q.y, 7, pal.glow, 0.5);
      rrect(ctx, q.x - 3.5, q.y - 3.5, 7, 7, 1.5, on ? pal.glow : '#241c38', '#05030f', 0.6);
      drawText(ctx, LETTERS[i], Math.round(q.x) - 2, Math.round(q.y) - 2, on ? C.ink : '#6a5a8a');
    });
    for (const r of tb.rollovers) starShape(ctx, r.x, r.y, 3.2, 1.3, r.flash > 0 ? '#fff' : pal.a, t * 0.5);

    // Black hole.
    if (tb.hole) {
      const h = tb.hole;
      ctx.save();
      ctx.translate(h.x, h.y);
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = ['#ff9b2f', '#ffd23f', '#fff3a8'][k];
        ctx.globalAlpha = 0.8 - k * 0.2;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9 + k * 2.5, 3.2 + k, Math.sin(t * 0.5) * 0.3, t * 3 + k, t * 3 + k + 4.5);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      disc(ctx, h.x, h.y, 4.2, '#000');
      ring(ctx, h.x, h.y, 4.8, '#fff3a8', 0.7);
    }

    // Drop targets.
    for (const d of tb.drops) {
      if (d.up) {
        const gr = ctx.createLinearGradient(d.ax - 2, 0, d.ax + 2, 0);
        gr.addColorStop(0, '#fff');
        gr.addColorStop(0.4, pal.b);
        gr.addColorStop(1, '#1a1030');
        rrect(ctx, d.ax - 2, d.ay, 4, d.by - d.ay, 1, gr, C.ink, 0.5);
      } else rrect(ctx, d.ax - 1, d.ay + 1, 2, d.by - d.ay - 2, 1, '#2a2440');
    }
    // I O N standups.
    for (const q of tb.standups) {
      const hot = q.flash > 0;
      line(ctx, q.ax, q.ay, q.bx, q.by, C.ink, 4.2);
      line(ctx, q.ax, q.ay, q.bx, q.by, hot ? '#fff' : q.lit ? C.green : '#2f5a4a', 3);
      if (q.lit || hot) line(ctx, q.ax + 1, q.ay - 0.6, q.bx - 1, q.by - 0.6, '#fff', 0.8);
    }
    // The captive ball, the target at the top of its chamber and hit pips.
    {
      const cb = tb.captive;
      const hot = cb.flash > 0;
      rrect(ctx, CAPTIVE.x - 4.5, 241, 9, 3, 1, hot ? '#fff' : C.orange);
      for (let i = 0; i < 5; i++) disc(ctx, CAPTIVE.x + 10, 252 + i * 9, 1.4, i < cb.hits % 6 ? C.orange : '#2e2446');
      sphere(ctx, cb.x, cb.y, BALL_R, '#fff', '#ffd23f', '#c4541b');
    }

    // Slingshot rubbers.
    for (const q of tb.segments) {
      if (q.kind !== 'sling' && q.kind !== 'rubber') continue;
      const hot = q.kind === 'sling' && q.flash > 0;
      line(ctx, q.ax, q.ay, q.bx, q.by, C.ink, 3);
      line(ctx, q.ax, q.ay, q.bx, q.by, hot ? '#fff' : q.kind === 'sling' ? pal.glow : '#c9d3ff', hot ? 2.2 : 1.6);
    }
    // Posts.
    for (const c of tb.circles) {
      if (c.kind === 'post' || c.kind === 'centerpost') {
        disc(ctx, c.x, c.y, c.r + 0.6, C.ink);
        sphere(ctx, c.x, c.y, c.r, '#fff', c.kind === 'centerpost' ? pal.a : '#c9d3ff', '#4a4f7a');
      }
    }

    // Spinner (left orbit) and hyperspace gate (right orbit).
    for (const sp of tb.spinners) {
      const spin = sp.spin || 0;
      const w = sp.x1 - sp.x0 - 3;
      if (sp.gate) {
        const lift = spin > 0.6 ? 2.5 : 0;
        rrect(ctx, sp.x0 + 1.5, sp.y - 0.8 - lift, w, 1.6, 0.8, spin > 0 ? '#fff' : C.cyan);
        continue;
      }
      const ph = Math.abs(Math.cos(t * 40 * Math.min(1, spin)));
      const h = spin > 0 ? 0.6 + ph * 2.4 : 1.4;
      const gr = ctx.createLinearGradient(0, sp.y - h, 0, sp.y + h);
      gr.addColorStop(0, '#fff');
      gr.addColorStop(1, spin > 0 && Math.floor(t * 30) % 2 ? pal.a : '#8a93b8');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(sp.x0 + 1.5 + w / 2, sp.y, w / 2, h, 0, 0, TAU);
      ctx.fill();
      line(ctx, sp.x0 + 1, sp.y, sp.x1 - 1, sp.y, '#c9d3ff', 0.6);
    }

    // The pulsar rotor.
    for (const r of tb.rotors) {
      const over = g.overdriveT > 0;
      if (over || r.flash > 0) glow(ctx, r.x, r.y, r.len + 6, over ? hsl(t * 500) : '#fff', 0.35);
      for (const a of [r.a, r.a + Math.PI]) {
        const tx = r.x + Math.cos(a) * r.len, ty = r.y + Math.sin(a) * r.len;
        line(ctx, r.x, r.y, tx, ty, C.ink, r.r * 2 + 1);
        line(ctx, r.x, r.y, tx, ty, over ? hsl(t * 400 + a * 50) : pal.b, r.r * 2);
        line(ctx, r.x, r.y, tx, ty, '#fff', 0.8);
      }
      sphere(ctx, r.x, r.y, 3.2, '#fff', r.flash > 0 ? '#fff' : pal.glow, '#4a4f7a');
    }

    // The moons.
    for (const mo of tb.moons) {
      disc(ctx, mo.x, mo.y, mo.r + 0.7, C.ink);
      sphere(ctx, mo.x, mo.y, mo.r, '#fff', mo.flash > 0 ? '#fff' : '#c9d3ff', '#4a4f7a');
      disc(ctx, mo.x + 1, mo.y + 0.8, 0.9, 'rgba(74,79,122,0.8)');
      disc(ctx, mo.x - 1.2, mo.y + 1.5, 0.5, 'rgba(74,79,122,0.8)');
    }
    // Asteroids: lumpy tumbling rocks.
    for (const a of tb.asteroids) {
      if (a.off) continue;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(t * (1 + a.id * 0.4) + a.id);
      const grad = ctx.createRadialGradient(-1, -1, 0.5, 0, 0, a.r + 1);
      grad.addColorStop(0, '#c9d3ff');
      grad.addColorStop(1, '#3a3f66');
      ctx.fillStyle = grad;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * TAU;
        const rr = a.r * (0.8 + ((i * 7 + a.id * 3) % 5) * 0.08);
        if (i) ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
        else ctx.moveTo(rr, 0);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      disc(ctx, 0.8, 0.6, 0.8, 'rgba(20,16,40,0.7)');
      ctx.restore();
    }

    // Binary stars: two small suns tied by a glowing orbit.
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(BINARY.x, BINARY.y, BINARY.r, BINARY.r * 0.8, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    tb.binaries.forEach((bs, i) => {
      const f = bs.flash > 0;
      glow(ctx, bs.x, bs.y, 9, i ? '#ff6b4a' : C.cyan, f ? 0.8 : 0.45);
      disc(ctx, bs.x, bs.y, bs.r + 0.7, C.ink);
      sphere(ctx, bs.x, bs.y, bs.r, '#fff', f ? '#fff' : i ? '#ff9b2f' : C.cyan, i ? '#a3122f' : '#1c5bd9');
    });
    // Meteors: crystals that crack, then vanish.
    for (const q of tb.meteors) {
      if (q.off) continue;
      const f = q.flash > 0;
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.id * 0.7 + t * 0.3);
      ctx.fillStyle = f ? '#fff' : q.hits ? '#ff9b2f' : '#b35cff';
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const r = q.r + 0.6 + (i % 2) * 0.5;
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.moveTo(r, 0);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (q.hits) line(ctx, -q.r, -0.5, q.r * 0.8, 1.2, '#fff', 0.5);
      disc(ctx, -0.8, -0.9, 0.7, 'rgba(255,255,255,0.8)');
      ctx.restore();
    }
    // The gas giant: striped, and it wobbles like jelly when hit.
    {
      const gi = tb.giant;
      const wob = v.reducedMotion ? 0 : gi.wobble * Math.sin(t * 40) * 0.12;
      ctx.save();
      ctx.translate(gi.x, gi.y);
      ctx.scale(1 + wob, 1 - wob);
      disc(ctx, 0, 0, gi.r + 0.8, C.ink);
      sphere(ctx, 0, 0, gi.r, '#fff3e0', gi.wobble > 0.7 ? '#fff' : '#ff9b6a', '#8a3a1a');
      ctx.globalAlpha = 0.45;
      for (const [yy, w] of [[-4, 1.2], [-1, 1.8], [2.5, 1.3], [5, 0.9]]) {
        const hw = Math.sqrt(Math.max(0, gi.r * gi.r - yy * yy));
        line(ctx, -hw + 1, yy, hw - 1, yy + 0.4, '#c4541b', w);
      }
      ctx.globalAlpha = 1;
      disc(ctx, 3, 2.5, 1.4, '#a3122f');
      ctx.restore();
    }
    // The quasar: a pulsing core with jets out of both poles.
    {
      const q = tb.quasar;
      const p = 0.7 + Math.sin(t * 8) * 0.3;
      glow(ctx, q.x, q.y, 10, C.pink, 0.5 * p);
      line(ctx, q.x, q.y - 9 * p, q.x, q.y + 9 * p, 'rgba(255,90,209,0.7)', 1.2);
      line(ctx, q.x, q.y - 12 * p, q.x, q.y + 12 * p, 'rgba(255,255,255,0.5)', 0.5);
      disc(ctx, q.x, q.y, q.r + 0.7, C.ink);
      sphere(ctx, q.x, q.y, q.r, '#fff', C.pink, '#5a1f9e');
      if (q.value > 1) drawText(ctx, `${q.value}`, Math.round(q.x + 4), Math.round(q.y - 9), C.gold);
      // A countdown ring before it blinks away.
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r + 2, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - q.t / 7));
      ctx.stroke();
    }
    // The gravity bob: a rod and a heavy chrome ball.
    {
      const pb = tb.pendulum;
      const bx = pb.x + Math.sin(pb.a) * pb.len, by = pb.y + Math.cos(pb.a) * pb.len;
      line(ctx, pb.x, pb.y, bx, by, '#8a93b8', 1.2);
      sphere(ctx, pb.x, pb.y, 2, '#fff', '#8a93b8', '#2a2440');
      if (pb.flash > 0) glow(ctx, bx, by, 10, pal.glow, 0.7);
      disc(ctx, bx, by, pb.r + 0.7, C.ink);
      sphere(ctx, bx, by, pb.r, '#fff', pb.flash > 0 ? '#fff' : pal.b, '#2a2440');
    }

    // Bumpers: a skirt ring, then a planet cap.
    tb.bumpers.forEach((b, i) => {
      const f = b.flash > 0;
      const grow = f && !v.reducedMotion ? 1 : 0;
      const [l, body, dark] = PLANETS[i % PLANETS.length];
      disc(ctx, b.x + 1, b.y + 1.5, b.r + 1.5, 'rgba(0,0,0,0.5)');
      disc(ctx, b.x, b.y, b.r + 1 + grow, C.ink);
      ring(ctx, b.x, b.y, b.r + 0.4 + grow, f ? '#fff' : g.superJetT > 0 ? hsl(t * 500 + i * 90) : pal.a, 1.6);
      if (f) sphere(ctx, b.x, b.y, b.r - 1.5 + grow, '#fff', '#fff', l);
      else sphere(ctx, b.x, b.y, b.r - 1.5, l, body, dark);
      if (i === 1) {
        // A ringed planet.
        ctx.strokeStyle = f ? '#fff' : l;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r + 1.5, 2.2, -0.35, 0, TAU);
        ctx.stroke();
      }
      if (f && !v.reducedMotion) ring(ctx, b.x, b.y, b.r + 3 + (0.18 - b.flash) * 40, pal.glow, 0.8);
    });

    // The star.
    this.drawStar(ctx, g, v, pal);

    // Comet.
    if (tb.cometCircle && !tb.cometCircle.off) {
      const c = tb.cometCircle;
      const sp = Math.hypot(c.vx || 0, c.vy || 0) || 1;
      const tx = c.x - ((c.vx || 0) / sp) * 20, ty = c.y - ((c.vy || 0) / sp) * 20;
      const gr = ctx.createLinearGradient(c.x, c.y, tx, ty);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(0.4, 'rgba(127,244,255,0.5)');
      gr.addColorStop(1, 'rgba(63,169,255,0)');
      line(ctx, c.x, c.y, tx, ty, gr, 5);
      glow(ctx, c.x, c.y, 8, C.cyan, 0.6);
      sphere(ctx, c.x, c.y, c.r, '#fff', C.cyan, '#1c5bd9');
    }

    // Mothership.
    if (tb.ship && !tb.ship.dead) {
      const s = tb.ship;
      const sc = tb.shipCircle || s;
      const flick = s.hitT > 0 && !v.reducedMotion && Math.floor(t * 30) % 2;
      if (!flick) {
        glow(ctx, sc.x, sc.y + 7, 10, C.pink, 0.3);
        sphere(ctx, sc.x, sc.y - 2, 5, '#fff', C.cyan, '#1c5bd9');
        const gr = ctx.createLinearGradient(0, sc.y - 3, 0, sc.y + 4);
        gr.addColorStop(0, '#eef1f6');
        gr.addColorStop(1, '#4a4f7a');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.ellipse(sc.x, sc.y + 1, 12, 4, 0, 0, TAU);
        ctx.fill();
        for (let i = 0; i < 6; i++) disc(ctx, sc.x - 9 + i * 3.6, sc.y + 1.5, 0.8, (i + Math.floor(t * 8)) % 3 ? C.gold : C.red);
      }
      const bw = 22;
      rrect(ctx, sc.x - bw / 2 - 0.5, sc.y - 11, bw + 1, 2.4, 1, C.ink);
      rrect(ctx, sc.x - bw / 2, sc.y - 10.6, (bw * s.hp) / s.maxHp, 1.6, 0.8, C.red);
    }

    // The plasma cannon: a turret that swings round while it's loaded.
    {
      const c = g.cannon;
      const a = c ? c.a : -Math.PI / 2 + Math.sin(t * 0.8) * 0.4;
      if (c && !v.reducedMotion) {
        // The aim: a dotted line to where it'll fire.
        for (let i = 2; i < 18; i++) {
          const k = i * 8 + ((t * 60) % 8);
          disc(ctx, CANNON.x + Math.cos(a) * k, CANNON.y + Math.sin(a) * k, 0.9, i % 2 ? C.pink : '#fff');
        }
      }
      ctx.save();
      ctx.translate(CANNON.x, CANNON.y);
      ctx.rotate(a);
      rrect(ctx, 0, -2.6, 13, 5.2, 1.5, '#4a4f7a', C.ink, 0.6);
      rrect(ctx, 9, -3.2, 4, 6.4, 1, c ? C.pink : pal.b);
      ctx.restore();
      disc(ctx, CANNON.x, CANNON.y, CANNON.r + 0.6, C.ink);
      sphere(ctx, CANNON.x, CANNON.y, CANNON.r, '#eef1f6', '#8a93b8', '#2a2440');
      disc(ctx, CANNON.x, CANNON.y, 2, c ? C.pink : pal.a);
    }

    // Plungers: the shooter on the right, the auto-launcher on the left.
    for (const [lx, pull] of [[PLUNGER.x, g.plunger], [m(PLUNGER.x), 0]]) {
      const py = PLUNGER.y + BALL_R + 1 + pull * 6;
      rrect(ctx, lx - 4, py, 8, 2.2, 1, '#eef1f6');
      for (let y = py + 3; y < TH; y += 2.2) line(ctx, lx - 3.5, y, lx + 3.5, y + 1, '#8a93b8', 0.8);
    }

    // Flippers.
    for (const f of tb.flippers) this.drawFlipper(ctx, f, pal, g.tilted);

    // Balls with trails.
    for (const b of g.balls) {
      if (b.held === 'warp' || b.held === 'ramp' || b.held === 'cannon') continue;
      const trail = v.trails && v.trails[b.id];
      if (trail && !v.reducedMotion) {
        trail.forEach((p, i) => {
          ctx.globalAlpha = (i / trail.length) * 0.4;
          disc(ctx, p.x, p.y, BALL_R * (0.4 + (i / trail.length) * 0.5), g.supernovaT > 0 ? hsl(i * 30 + t * 300) : pal.glow);
        });
        ctx.globalAlpha = 1;
      }
      if (b.held === 'wormhole' || b.held === 'hole' || b.held === 'saucer') ctx.globalAlpha = 0.45;
      this.drawBall(ctx, g, b.x, b.y, BALL_R);
      ctx.globalAlpha = 1;
    }

    this.drawRamps(ctx, g, v, pal);

    // Particles and score pops, in table space.
    for (const p of v.particles) {
      if (p.kind === 'ring') {
        const k = p.life / p.max;
        ctx.globalAlpha = 1 - k;
        ring(ctx, p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - (1 - k) ** 2), p.color, 1.2);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'bolt') {
        ctx.globalAlpha = 1 - p.life / p.max;
        const pts = [[p.x, p.y]];
        for (let i = 1; i < 5; i++) {
          const k = i / 5;
          pts.push([p.x + (p.x2 - p.x) * k + (Math.random() - 0.5) * 8, p.y + (p.y2 - p.y) * k + (Math.random() - 0.5) * 8]);
        }
        pts.push([p.x2, p.y2]);
        poly(ctx, pts, C.cyan, 1.6);
        poly(ctx, pts, '#fff', 0.6);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        disc(ctx, p.x, p.y, (p.size || 1) * 0.6, p.color);
        ctx.globalAlpha = 1;
      }
    }
    for (const p of v.popups) {
      const age = v.time - p.t0;
      const y = Math.round(p.y - age * 16);
      const w = measureText(p.text, p.scale || 1);
      ctx.globalAlpha = Math.min(1, 2.2 - age * 2);
      oText(ctx, p.text, Math.round(p.x - w / 2), y, p.color || C.gold, p.scale || 1);
      ctx.globalAlpha = 1;
    }

    // Tilt: the playfield dims.
    if (g.tilted) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, TW, TH);
      if (Math.floor(t * 3) % 2) cText(ctx, 'TILT', CX, 190, C.red, 4, oText);
    }
  }

  drawBall(ctx, g, x, y, r) {
    if (g.supernovaT > 0) sphere(ctx, x, y, r, '#fff', '#ffd23f', '#c4541b');
    else sphere(ctx, x, y, r, '#ffffff', '#b8c0dd', '#3a3f66');
    disc(ctx, x - r * 0.35, y - r * 0.4, r * 0.25, '#fff');
  }

  /** See-through ramps with rails, struts and chasing lights, and the rail. */
  drawRamps(ctx, g, v, pal) {
    const t = v.time;
    for (const r of g.table.ramps) {
      const pts = r.path;
      const rails = this.rails[r.id] || (this.rails[r.id] = [offsetPath(pts, -4), offsetPath(pts, 4)]);
      {
        // Shadow, a tinted plastic body, then chrome rails and struts.
        ctx.globalAlpha = 0.3;
        poly(ctx, pts.map(([x, y]) => [x + 2.5, y + 4]), '#000', 9);
        ctx.globalAlpha = 0.22;
        poly(ctx, pts, pal.b, 8);
        ctx.globalAlpha = 0.18;
        poly(ctx, pts, '#fff', 3);
        ctx.globalAlpha = 1;
        for (let i = 4; i < pts.length - 2; i += 7) line(ctx, rails[0][i][0], rails[0][i][1], rails[1][i][0], rails[1][i][1], 'rgba(201,211,255,0.35)', 0.6);
        poly(ctx, rails[0], C.ink, 2);
        poly(ctx, rails[1], C.ink, 2);
        poly(ctx, rails[0], pal.glow, 1);
        poly(ctx, rails[1], pal.glow, 1);
        // Chasing lights.
        const n = Math.round(r.len / 14);
        // Hot while a ramp combo can still go on (5 s), or when a mission wants the ramp.
        const hot = (g.rampRun > 1 && g.t - g.lastRampT < 5) || (g.mission && g.mission.lit.has(r.id ? 'rramp' : 'lramp'));
        for (let i = 0; i < n; i++) {
          const k = (i / n + t * (hot ? 0.5 : 0.15)) % 1;
          const p = rampPoint(r, k);
          disc(ctx, p.x, p.y, 0.9, i % 2 ? (hot ? C.pink : pal.a) : '#fff');
        }
      }
    }
    // Balls on the ramps ride high: bigger, with a shadow on the playfield.
    for (const b of g.balls) {
      if (b.held !== 'ramp' && b.held !== 'cannon') continue;
      const lift = b.held === 'cannon' ? 0.2 : Math.sin(Math.min(1, b.rampK) * Math.PI);
      ctx.globalAlpha = 0.35;
      disc(ctx, b.x + 2 + lift * 3, b.y + 3 + lift * 4, 3.2, '#000');
      ctx.globalAlpha = 1;
      this.drawBall(ctx, g, b.x, b.y, BALL_R + lift * 1.4);
    }
  }

  drawFlipper(ctx, f, pal, dead) {
    const tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
    const a = f.angle;
    const n0x = -Math.sin(a), n0y = Math.cos(a);
    const shape = (grow) => {
      const r0 = f.r0 + grow, r1 = f.r1 + grow;
      ctx.beginPath();
      ctx.arc(f.px, f.py, r0, a + Math.PI / 2, a + (Math.PI * 3) / 2);
      ctx.lineTo(tx - n0x * r1, ty - n0y * r1);
      ctx.arc(tx, ty, r1, a - Math.PI / 2, a + Math.PI / 2);
      ctx.lineTo(f.px + n0x * r0, f.py + n0y * r0);
      ctx.closePath();
    };
    ctx.globalAlpha = 0.4;
    ctx.save();
    ctx.translate(1.5, 2.5);
    shape(0);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    shape(0.7);
    ctx.fillStyle = C.ink;
    ctx.fill();
    shape(0);
    ctx.fillStyle = dead ? '#4a4f7a' : pal.a;
    ctx.fill();
    shape(-1.1);
    const gr = ctx.createLinearGradient(f.px + n0x * -f.r0, f.py + n0y * -f.r0, f.px + n0x * f.r0, f.py + n0y * f.r0);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#aeb8e2');
    ctx.fillStyle = gr;
    ctx.fill();
    line(ctx, f.px + Math.cos(a) * 3, f.py + Math.sin(a) * 3, tx - Math.cos(a) * 2, ty - Math.sin(a) * 2, dead ? '#4a4f7a' : pal.glow, 0.9);
    sphere(ctx, f.px, f.py, 1.6, '#fff', '#8a93b8', '#2a2440');
  }

  drawStar(ctx, g, v, pal) {
    const s = g.table.star;
    const t = v.time;
    const nova = g.supernovaT > 0;
    const unstable = g.mass > 70 && !nova;
    const r = s.r + (unstable && !v.reducedMotion ? Math.sin(t * 20) * 0.8 : 0);
    const col = nova ? '#fff3a8' : unstable ? C.red : pal.b;
    glow(ctx, s.x, s.y, r * (nova ? 5 : 3), col, nova ? 0.7 : 0.45);
    // Corona rays.
    const rays = nova ? 18 : 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + t * (nova ? 2 : 0.6);
      const len = r + 3 + (nova ? 10 + Math.sin(t * 9 + i) * 5 : 2.5 + Math.sin(t * 5 + i) * 1.5);
      line(ctx, s.x + Math.cos(a) * (r + 1), s.y + Math.sin(a) * (r + 1), s.x + Math.cos(a) * len, s.y + Math.sin(a) * len, nova ? hsl(i * 22 + t * 300) : col, 0.9);
    }
    const hot = s.flash > 0;
    const body = nova ? '#fff3a8' : hot ? '#fff' : g.mass > 70 ? '#ff6b4a' : g.mass > 35 ? '#ff9b2f' : '#ffd23f';
    disc(ctx, s.x, s.y, r + 0.8, C.ink);
    sphere(ctx, s.x, s.y, r, '#fff', body, nova ? '#ff9b2f' : '#c4541b');
    if (g.multiball && g.jackpotLit && Math.floor(t * 6) % 2) ring(ctx, s.x, s.y, r + 5, C.gold, 1.2);
  }

  drawLamps(ctx, g, v, pal) {
    const t = v.time;
    const show = (g.supernovaT > 0 || v.lightShow > 0) && !v.reducedMotion;
    // Chasing lamps round the dome.
    const fast = g.multiball || g.supernovaT > 0 || v.lightShow > 0;
    const speed = fast ? 26 : 7;
    for (let i = 0; i <= 34; i++) {
      const a = Math.PI + (i / 34) * Math.PI;
      const x = ARC.x + Math.cos(a) * (ARC.r - 7), y = ARC.y + Math.sin(a) * (ARC.r - 7);
      const on = v.reducedMotion ? i % 3 === 0 : (i + Math.floor(t * speed)) % (fast ? 3 : 6) === 0;
      const col = on ? (fast ? hsl(i * 18 + t * 300) : pal.glow) : '#231c36';
      if (on) glow(ctx, x, y, 4, col, 0.5);
      disc(ctx, x, y, 1.2, col);
    }
    /** An insert: a rounded lamp that glows when lit. */
    const lamp = (x, y, w, h, on, col = pal.glow, i = 0) => {
      const lit = show ? (i + Math.floor(t * 16)) % 3 === 0 : on;
      const c = lit ? (show ? hsl(i * 40 + t * 400) : col) : '#2e2446';
      if (lit) glow(ctx, x + w / 2, y + h / 2, Math.max(w, h) + 3, c, 0.45);
      rrect(ctx, x, y, w, h, Math.min(w, h) / 2.5, c, C.ink, 0.6);
      if (lit) disc(ctx, x + w * 0.3, y + h * 0.3, Math.min(w, h) * 0.18, '#fff');
    };
    // Lane lamps, and the skill shot lane flashing after a plunge.
    const skill = (g.phase === 'launch' || g.skillT > 0) && Math.floor(t * 8) % 2;
    g.lanes.forEach((on, i) => {
      const x = LANE_XS[i] + 8;
      lamp(x - 2, 45, 4, 5, on || (skill && i === g.skillLane), i === g.skillLane && skill ? '#fff' : pal.b, i);
      if (on || show) drawText(ctx, 'STAR'[i], x - 2, 66, show ? hsl(i * 60 + t * 300) : pal.glow);
    });
    // Multipliers.
    MULTS.slice(1).forEach((mm, i) => {
      const x = CX - 20 + i * 14;
      lamp(x, 398, 11, 8, g.mult >= mm, C.gold, i + 4);
      drawText(ctx, `${mm}X`, x + 0.5, 399.5, g.mult >= mm ? C.ink : '#3a3055');
    });
    // Mass ring round the star: how close it is to going nova.
    const n = 20;
    const lit = Math.floor((g.mass / 100) * n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2;
      const on = i < lit || g.supernovaT > 0;
      disc(ctx, STAR.x + Math.cos(a) * 17, STAR.y + Math.sin(a) * 17, 1.1, on ? (g.supernovaT > 0 ? hsl(i * 18 + t * 400) : g.mass > 70 ? C.red : C.orange) : '#231c36');
    }
    // Drop target lamps.
    g.table.drops.forEach((d, i) => lamp(d.ax + 5, d.ay + 3, 3, 4, !d.up, C.cyan, i + 8));
    // Lock lamps by the wormhole (from sector 2), mission and extra ball.
    const w = g.table.wormholes[0];
    if (g.sector >= 2) {
      for (let i = 0; i < 2; i++) lamp(w.x + 24, w.y - 6 + i * 7, 4, 5, g.locks > i || (g.multiball && Math.floor(t * 4) % 2), C.pink, i + 11);
    }
    const blink = Math.floor(t * 4) % 2;
    if (g.missionLit && !g.mission) cText(ctx, 'MISSION', w.x, 34, blink ? C.pink : '#6a2a5a');
    if (g.extraBallLit) cText(ctx, 'EXTRA BALL', w.x, 42, blink ? C.green : '#2a6a4a');
    // Shot arrows: lit ones blink for the running mission, the rest chase softly.
    const ms = g.mission;
    SHOTS.forEach((q, i) => {
      const lit2 = ms && ms.lit.has(q.id);
      const on = lit2 ? blink : show ? (i + Math.floor(t * 16)) % 3 === 0 : (Math.floor(t * 3) + i) % 9 === 0;
      const col = lit2 ? (blink ? '#fff' : C.pink) : show ? hsl(i * 50 + t * 300) : pal.a;
      if (on) glow(ctx, q.x, q.y, 7, col, 0.5);
      arrow(ctx, q.x, q.y, C.ink, 1.25);
      arrow(ctx, q.x, q.y, on ? col : '#2e2446', 1);
    });
    // Ramp mouths chase too.
    for (const r of g.table.ramps) {
      if (!r.mouth) continue;
      const x = (r.mouth.x0 + r.mouth.x1) / 2;
      lamp(x - 2, r.mouth.y - 6, 4, 2.5, (Math.floor(t * 5) + r.id) % 2 === 0, C.cyan, 18 + r.id);
    }
    // Shoot again (ball save).
    const save = g.ballSaveT > 0 && (g.ballSaveT > 2 || Math.floor(t * 8) % 2);
    lamp(CX - 13, 412, 26, 7, save, C.green, 15);
    if (save) drawText(ctx, 'SAVE', CX - 11, 413, C.ink);
    // Outlane saves.
    if (g.upgrades.includes('kickback')) lamp(21, 392, 4, 5, !g.kickbackUsed, C.green, 16);
    if (g.upgrades.includes('magna')) lamp(m(25), 392, 4, 5, !g.magnaUsed, C.green, 17);
    // Super modes.
    if (g.superJetT > 0) cText(ctx, 'SUPER JETS', 150, 146, blink ? C.gold : C.pink);
    if (g.superSpinT > 0) drawText(ctx, 'X10', 19, 190, blink ? C.gold : C.pink);
    // Jackpot.
    if (g.jackpotLit && Math.floor(t * 5) % 2) cText(ctx, 'JACKPOT', CX, STAR.y + 24, C.gold);
    // Combo counter.
    if (g.combo >= 2) cText(ctx, `${g.combo}X COMBO`, CX, STAR.y + 42, C.pink);
  }

  // ---------------------------------------------------------------- dot-matrix display
  drawDmd(ctx, v, x, y) {
    const d = this.dg;
    d.clearRect(0, 0, DMD_W, DMD_H);
    if (v.dmdDraw) v.dmdDraw(d, DMD_W, DMD_H);
    const img = d.getImageData(0, 0, DMD_W, DMD_H).data;
    // The bezel and dots are painted into a sprite, again only when the picture changes.
    const M = 4; // margin round the dots, in table units
    const w = DMD_W * DMD_PX + 2 * M, h = DMD_H * DMD_PX + 2 * M;
    const last = this.dmdLast;
    let same = last && last.length === img.length && this.dmdRS === this.RS;
    for (let k = 0; same && k < img.length; k++) same = img[k] === last[k];
    if (!same) {
      this.dmdLast = img;
      this.dmdRS = this.RS;
      if (!this.dmdC || this.dmdC.width !== Math.round(w * this.RS)) this.dmdC = mk(w * this.RS, h * this.RS);
      const g = this.dmdC.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.dmdC.width, this.dmdC.height);
      g.setTransform(this.RS, 0, 0, this.RS, M * this.RS, M * this.RS);
      rrect(g, -3, -2.5, DMD_W * DMD_PX + 5, DMD_H * DMD_PX + 4, 2, '#1a0b04', C.ink, 1);
      g.fillStyle = '#2e1507';
      const dot = DMD_PX * 0.72;
      for (let j = 0; j < DMD_H; j++) {
        for (let i = 0; i < DMD_W; i++) {
          if (img[(j * DMD_W + i) * 4 + 3] <= 40) g.fillRect(i * DMD_PX, j * DMD_PX, dot, dot);
        }
      }
      for (let j = 0; j < DMD_H; j++) {
        for (let i = 0; i < DMD_W; i++) {
          const k = (j * DMD_W + i) * 4;
          if (img[k + 3] <= 40) continue;
          g.fillStyle = `rgb(${img[k]} ${img[k + 1]} ${img[k + 2]})`;
          g.fillRect(i * DMD_PX, j * DMD_PX, dot, dot);
        }
      }
    }
    ctx.drawImage(this.dmdC, x - M, y - M, w, h);
  }

  // ---------------------------------------------------------------- side and bottom panels
  drawSides(ctx, g, v, pal) {
    const { L } = this;
    const lx = L.tx - 108, rx = L.tx + TW + 12;
    let y = L.ty;
    const t = v.time;
    if (v.panel === 'title') {
      // The attract mode: a pitch instead of the demo's numbers.
      const lines = [['FEED THE STAR.', C.gold], ['WATCH IT BLOW.', C.gold], ['', C.muted], ['CLEAR EACH STAR', C.muted], ['SYSTEM TO WARP', C.muted], ['ON. PICK AN', C.muted], ['UPGRADE EVERY', C.muted], ['SECTOR.', C.muted], ['', C.muted], ['HIGH SCORE', C.muted], [fmt(v.best || 0), C.gold]];
      for (const [text, col] of lines) {
        sText(ctx, text, lx, y, col);
        y += 10;
      }
      this.drawKeys(ctx, v, rx, L.ty + TH - 70);
      return;
    }
    const sec = sectorFor(g.sector);
    sText(ctx, `SECTOR ${g.sector}`, lx, y, C.muted);
    y += 10;
    sText(ctx, sec.name, lx, y, pal.a, 1);
    y += 16;
    sText(ctx, 'SCORE', lx, y, C.muted);
    y += 9;
    sText(ctx, fmt(g.score), lx, y, C.gold, fmt(g.score).length > 8 ? 1 : 2);
    y += 18;
    sText(ctx, 'TARGET', lx, y, C.muted);
    y += 9;
    this.bar(ctx, lx, y, 96, g.sectorScore / g.target, pal.a, g.sectorScore >= g.target);
    y += 9;
    const progress = `${fmt(g.sectorScore)} / ${fmt(g.target)}`;
    sText(ctx, progress.length <= 16 ? progress : `NEED ${fmt(Math.max(0, g.target - g.sectorScore))}`, lx, y, C.line);
    y += 14;
    sText(ctx, 'STAR MASS', lx, y, C.muted);
    y += 9;
    this.bar(ctx, lx, y, 96, g.mass / 100, g.mass > 70 ? C.red : C.orange, g.supernovaT > 0);
    y += 14;
    sText(ctx, 'BALLS', lx, y, C.muted);
    for (let i = 0; i < Math.min(8, g.ballsLeft); i++) this.drawBall(ctx, g, lx + 40 + i * 9, y + 2, 3.2);
    y += 14;
    sText(ctx, `MULTIPLIER X${g.mult}`, lx, y, C.gold);
    y += 14;
    if (g.mission) {
      sText(ctx, g.mission.def.name, lx, y, Math.floor(t * 4) % 2 ? C.pink : '#fff');
      y += 9;
      this.bar(ctx, lx, y, 96, g.mission.t / g.mission.def.time, C.pink, false);
      y += 9;
      sText(ctx, g.mission.def.id === 'bigbang' ? `${g.mission.n} HITS` : `${g.mission.n} / ${g.mission.def.need}`, lx, y, C.muted);
    } else sText(ctx, g.missionLit ? 'MISSION LIT' : `MISSIONS ${g.missionsDone}`, lx, y, g.missionLit ? C.pink : C.muted);
    y += 14;
    for (const [on, label] of [[g.supernovaT > 0, `SUPERNOVA ${Math.ceil(g.supernovaT)}`], [g.superJetT > 0, `SUPER JETS ${Math.ceil(g.superJetT)}`], [g.superSpinT > 0, `SUPER SPIN ${Math.ceil(g.superSpinT)}`], [g.overdriveT > 0, `OVERDRIVE ${Math.ceil(g.overdriveT)}`], [g.extraBallLit, 'EXTRA BALL LIT']]) {
      if (!on) continue;
      sText(ctx, label, lx, y, hsl(t * 300 + y));
      y += 10;
    }
    // Right: upgrades and controls (below the menu buttons, if they're in the way).
    let ry = L.hud && rx + 100 > L.hud.x ? Math.max(L.ty, Math.ceil(L.hud.bottom) + 4) : L.ty;
    sText(ctx, 'UPGRADES', rx, ry, C.muted);
    ry += 11;
    if (!g.upgrades.length) {
      sText(ctx, 'CLEAR A SECTOR', rx, ry, C.dim);
      sText(ctx, 'TO PICK ONE', rx, ry + 9, C.dim);
      ry += 22;
    }
    const counts = {};
    for (const u of g.upgrades) counts[u] = (counts[u] || 0) + 1;
    for (const [id, n] of Object.entries(counts)) {
      sText(ctx, `${UPGRADE_BY_ID[id].name}${n > 1 ? ` X${n}` : ''}`, rx, ry, C.cyan);
      ry += 9;
      if (ry > L.ty + TH - 90) break;
    }
    this.drawKeys(ctx, v, rx, L.ty + TH - 70);
  }

  drawKeys(ctx, v, x, y) {
    const keys = v.touch ? [['TAP LEFT', 'LEFT FLIPPER'], ['TAP RIGHT', 'RIGHT FLIPPER'], ['HOLD', 'PULL PLUNGER'], ['SWIPE UP', 'NUDGE']] : [['Z / LEFT', 'LEFT FLIPPER'], ['/ / RIGHT', 'RIGHT FLIPPER'], ['SPACE', 'PLUNGER (HOLD)'], ['UP', 'NUDGE']];
    for (const [k, d] of keys) {
      sText(ctx, k, x, y, C.gold);
      sText(ctx, d, x, y + 8, C.dim);
      y += 17;
    }
  }

  drawBottom(ctx, g, v, pal) {
    const { L } = this;
    if (v.panel === 'title') return;
    const y = L.ty + TH + 6;
    const x = L.tx;
    sText(ctx, sectorFor(g.sector).name, x, y, pal.a);
    const bl = `BALLS ${g.ballsLeft}`;
    sText(ctx, bl, x + TW - measureText(bl), y, C.line);
    this.bar(ctx, x, y + 10, TW, g.sectorScore / g.target, pal.a, g.sectorScore >= g.target);
    sText(ctx, `TARGET ${fmt(g.target)}`, x, y + 20, C.muted);
    const mx = `X${g.mult}`;
    sText(ctx, mx, x + TW - measureText(mx), y + 20, C.gold);
  }

  bar(ctx, x, y, w, k, col, done) {
    rrect(ctx, x, y, w, 6, 2, C.ink);
    rrect(ctx, x + 1, y + 1, w - 2, 4, 1.5, '#231c36');
    const f = (w - 2) * Math.min(1, Math.max(0, k));
    if (f > 0.5) rrect(ctx, x + 1, y + 1, f, 4, 1.5, done ? C.green : col);
  }

  // ---------------------------------------------------------------- panels
  button(ctx, regions, v, id, x, y, w, h, label, col = C.gold, sub = null) {
    const focus = v.focus === id || v.hover === id;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 3);
    ctx.fillStyle = focus ? '#fff' : col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = focus ? col : C.panel2;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    const ty = sub ? y + 6 : y + Math.round(h / 2) - 2;
    cText(ctx, label, x + w / 2, ty, focus ? C.ink : col, 1, (g2, t2, xx, yy, cc) => drawText(g2, t2, xx, yy, cc));
    if (sub) wrap(sub, Math.floor((w - 8) / 6)).slice(0, 4).forEach((l, i) => cText(ctx, l, x + w / 2, ty + 9 + i * 8, focus ? C.ink : C.muted, 1, (g2, t2, xx, yy, cc) => drawText(g2, t2, xx, yy, cc)));
    regions.push({ id, x, y, w, h, nav: true });
  }

  drawPanel(ctx, g, v, regions, pal) {
    const { W, H, L } = this;
    const t = v.time;
    const cx = L.tx + TW / 2;
    if (v.panel === 'title') {
      // Big logo over the attract mode.
      const y = L.ty + 84;
      const w1 = measureText('SUPERNOVA', 4);
      for (let i = 0; i < 9; i++) {
        const wave = v.reducedMotion ? 0 : Math.round(Math.sin(t * 5 + i * 0.6) * 2);
        oText(ctx, 'SUPERNOVA'[i], Math.round(cx - w1 / 2) + i * 24, y + wave, v.reducedMotion ? C.gold : hsl(t * 120 + i * 25, 100, 65), 4);
      }
      cText(ctx, 'PINBALL', cx, y + 28, C.cyan, 3, oText);
      if (v.best) cText(ctx, `HIGH SCORE ${fmt(v.best)}`, cx, y + 54, C.gold, 1, oText);
      if (Math.floor(t * 2) % 2 === 0 || v.reducedMotion) cText(ctx, v.touch ? 'TAP TO PLAY' : 'PRESS SPACE TO PLAY', cx, y + 200, '#fff', 1, oText);
      regions.push({ id: 'start', x: 0, y: 0, w: W, h: H });
      return;
    }
    ctx.fillStyle = 'rgba(5,3,15,0.6)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(W - 8, 230);
    const px = Math.round((W - pw) / 2);
    if (v.panel === 'warp') {
      const k = Math.min(1, g.phaseT / 2.2);
      // Hyperspace.
      if (!v.reducedMotion) {
        for (let i = 0; i < 90; i++) {
          const a = i * 2.4;
          const d = ((t * 1.4 + i * 0.13) % 1) ** 2 * W;
          line(ctx, cx + Math.cos(a) * d, L.ty + 180 + Math.sin(a) * d, cx + Math.cos(a) * (d + 6 + d * 0.08), L.ty + 180 + Math.sin(a) * (d + 6 + d * 0.08), i % 3 ? pal.glow : '#fff', 1);
        }
      }
      cText(ctx, 'SECTOR CLEAR', cx, L.ty + 110, C.green, 2, oText);
      const next = sectorFor(g.sector + 1);
      if (k > 0.3) cText(ctx, 'WARPING TO', cx, L.ty + 140, C.muted, 1, oText);
      if (k > 0.5) cText(ctx, next.name, cx, L.ty + 152, next.pal.a, 2, oText);
      return;
    }
    if (v.panel === 'upgrade') {
      const next = sectorFor(g.sector + 1);
      const unlock = next.unlock && UNLOCKS[next.unlock];
      const cols = Math.floor((pw - 24) / 6);
      const cardH = g.offers.map((id) => 20 + wrap(UPGRADE_BY_ID[id].desc.toUpperCase(), cols).length * 8);
      const unlockLines = unlock ? wrap(unlock.desc.toUpperCase(), Math.floor((pw - 12) / 6)).length : 0;
      const h = 44 + cardH.reduce((a, b) => a + b + 4, 0) + (unlock ? 16 + unlockLines * 8 : 0);
      const py = Math.max(4, Math.round(L.ty + TH / 2 - h / 2));
      box(ctx, px, py, pw, h, C.panel, next.pal.a);
      cText(ctx, 'CHOOSE AN UPGRADE', cx, py + 8, C.gold);
      cText(ctx, `NEXT: ${next.name}`, cx, py + 18, next.pal.a);
      cText(ctx, `TARGET ${fmt(next.target)}`, cx, py + 27, C.muted);
      let cy = py + 40;
      g.offers.forEach((id, i) => {
        const u = UPGRADE_BY_ID[id];
        this.button(ctx, regions, v, `up:${i}`, px + 8, cy, pw - 16, cardH[i], u.name, [C.cyan, C.pink, C.green][i], u.desc.toUpperCase());
        cy += cardH[i] + 4;
      });
      if (unlock) {
        const uy = cy + 4;
        cText(ctx, `NEW: ${unlock.name}`, cx, uy, Math.floor(t * 3) % 2 ? C.pink : C.gold);
        wrap(unlock.desc.toUpperCase(), Math.floor((pw - 12) / 6)).forEach((l, i) => cText(ctx, l, cx, uy + 10 + i * 8, C.line));
      }
      return;
    }
    if (v.panel === 'over') {
      const h = 120;
      const py = Math.round(L.ty + TH / 2 - h / 2);
      box(ctx, px, py, pw, h, C.panel, C.red);
      cText(ctx, 'GAME OVER', cx, py + 10, C.red, 2, oText);
      cText(ctx, fmt(g.score), cx, py + 32, C.gold, 2, oText);
      cText(ctx, `REACHED ${sectorFor(g.sector).name}`, cx, py + 52, C.line);
      if (g.sector > FINAL_SECTOR) cText(ctx, 'BEYOND THE SUPERNOVA', cx, py + 62, C.pink);
      if (v.newBest) cText(ctx, 'NEW HIGH SCORE!', cx, py + 70, Math.floor(t * 4) % 2 ? C.gold : C.pink);
      this.button(ctx, regions, v, 'again', px + 30, py + h - 32, pw - 60, 22, 'PLAY AGAIN', C.gold);
    }
  }
}
