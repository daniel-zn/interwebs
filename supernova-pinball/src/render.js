// Draws the table (a pre-rendered neon playfield per sector plus everything
// that moves or lights up), the dot-matrix display, the side panels and the
// in-canvas menus. Returns clickable regions each frame.
import { FINAL_SECTOR, MULTS, UNLOCKS, UPGRADE_BY_ID, sectorFor } from './data.js';
import { drawText, measureText, wrap } from './font.js';
import { buildSprites } from './sprites.js';
import { ARC, BALL_R, CX, LANE_X, PLUNGER, TH, TW } from './table.js';

export const DMD_W = 88, DMD_H = 16; // dots
const DMD_PX = 2; // logical pixels per dot
const DMD_HEIGHT = DMD_H * DMD_PX + 4;

const C = {
  ink: '#05030f', panel: '#10132e', panel2: '#181c42', line: '#eef1f6', muted: '#aeb8e2', dim: '#5d6690',
  gold: '#ffd23f', pink: '#ff5ad1', cyan: '#7ff4ff', red: '#ff3b4e', green: '#8fffc0', orange: '#ff9b2f', dmd: '#ff9b2f',
};
export { C as COLORS };

export const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const hsl = (h, s = 100, l = 60) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function line(g, x0, y0, x1, y1, color, w = 1) {
  g.fillStyle = color;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const o = Math.floor(w / 2);
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n) - o, Math.round(y0 + ((y1 - y0) * i) / n) - o, w, w);
}
function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let y = -Math.floor(r); y <= r; y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
    g.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1);
  }
}
function ring(g, cx, cy, r, color, n = 0) {
  g.fillStyle = color;
  const k = n || Math.max(8, Math.round(r * 6.3));
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}
function sText(g, text, x, y, color, scale = 1) {
  drawText(g, text, x + scale, y + scale, C.ink, scale);
  drawText(g, text, x, y, color, scale);
}
function oText(g, text, x, y, color, scale = 1) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) drawText(g, text, x + dx * scale, y + dy * scale, C.ink, scale);
  drawText(g, text, x, y, color, scale);
}
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

export class Renderer {
  constructor() {
    this.S = buildSprites();
    this.art = {};
    this.dmd = mk(DMD_W, DMD_H);
    // The table is drawn into its own canvas, then a blurred copy is added on
    // top for a neon bloom.
    this.tc = mk(TW, TH);
    this.tg = this.tc.getContext('2d');
    this.bc = mk(TW / 4, TH / 4);
    this.bg = this.bc.getContext('2d');
    this.bc2 = mk(TW / 8, TH / 8);
    this.bg2 = this.bc2.getContext('2d');
    this.dg = this.dmd.getContext('2d');
    let s = 11;
    this.rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.W = 0;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    const L = (this.L = {});
    const total = DMD_HEIGHT + 4 + TH;
    L.side = W >= TW + 2 * 112;
    L.tx = Math.floor((W - TW) / 2);
    const spare = H - total;
    L.bottom = !L.side && spare >= 30;
    L.dy = Math.max(0, Math.floor(spare / (L.bottom ? 3 : 2)));
    L.ty = L.dy + DMD_HEIGHT + 4;
    L.dmdX = L.tx + Math.floor((TW - DMD_W * DMD_PX) / 2);
    this.stars = mk(W, H);
    const g = this.stars.getContext('2d');
    g.fillStyle = C.ink;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < (W * H) / 150; i++) {
      const b = this.rand();
      g.fillStyle = b > 0.97 ? '#fff' : b > 0.85 ? '#aeb8e2' : b > 0.6 ? '#5d6690' : '#23264a';
      g.fillRect(Math.floor(this.rand() * W), Math.floor(this.rand() * H), 1, 1);
    }
  }

  // ---------------------------------------------------------------- playfield art
  tableArt(g) {
    const key = g.sector;
    if (this.art[key]) return this.art[key];
    const pal = sectorFor(key).pal;
    const c = mk(TW, TH);
    const a = c.getContext('2d');
    // Deep space with a dithered nebula in the sector's colours.
    a.fillStyle = pal.bg;
    a.fillRect(0, 0, TW, TH);
    let s = key * 97 + 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // Dithered nebula, written straight into pixels (fast enough to build on a warp).
    const blobs = [[40, 80, 50], [130, 200, 60], [70, 250, 40]];
    const img = a.getImageData(0, 0, TW, TH);
    const px = img.data;
    const rgb = (col) => {
      a.fillStyle = col;
      a.fillRect(0, 0, 1, 1);
      const d = a.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const ca = rgb(pal.a), cb = rgb(pal.b);
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        let v = 0;
        for (const [bx, by, br] of blobs) v += Math.max(0, 1 - Math.hypot(x - bx, y - by) / br);
        const th = ((x * 7 + y * 13) % 16) / 16;
        if (v * 0.55 > th + 0.18) {
          const c2 = v > 0.9 ? cb : ca;
          const k = (y * TW + x) * 4;
          for (let j = 0; j < 3; j++) px[k + j] = px[k + j] * 0.86 + c2[j] * 0.14;
        }
      }
    }
    a.putImageData(img, 0, 0);
    for (let i = 0; i < 90; i++) {
      a.fillStyle = r() > 0.8 ? '#fff' : '#5d6690';
      a.fillRect(Math.floor(r() * TW), Math.floor(r() * TH), 1, 1);
    }
    // Gravity rings round the star.
    for (let k = 1; k <= 4; k++) {
      a.globalAlpha = 0.18 - k * 0.03;
      ring(a, CX, 190, 14 + k * 9, pal.a);
    }
    a.globalAlpha = 1;
    // Shooter lane.
    a.fillStyle = '#08050f';
    a.fillRect(LANE_X + 1, 120, 172 - LANE_X - 1, TH - 120);
    for (let y = 150; y < 270; y += 14) {
      a.fillStyle = pal.b;
      a.globalAlpha = 0.35;
      a.fillRect(164, y, 1, 1);
      a.fillRect(165, y - 1, 2, 1);
      a.fillRect(167, y, 1, 1);
      a.globalAlpha = 1;
    }
    // Apron.
    a.fillStyle = '#0b0716';
    a.beginPath();
    a.moveTo(4, 262);
    a.lineTo(34, 300);
    a.lineTo(130, 300);
    a.lineTo(160, 262);
    a.lineTo(160, TH);
    a.lineTo(4, TH);
    a.fill();
    // Neon walls: dark halo, colour, hot core.
    const walls = g.table.segments.filter((q) => ['wall', 'guide', 'apron', 'laneguide', 'gate'].includes(q.kind));
    for (const pass of [[C.ink, 4], [pal.a, 2], [pal.glow, 1]]) {
      for (const q of walls) {
        if (q.ay > TH + 4 && q.by > TH + 4) continue;
        line(a, q.ax, Math.min(q.ay, TH - 1), q.bx, Math.min(q.by, TH - 1), pass[0], q.kind === 'gate' ? 1 : pass[1]);
      }
    }
    // Lane letters.
    ['S', 'T', 'A', 'R'].forEach((ch, i) => {
      drawText(a, ch, 55 + i * 18 - 2, 54, '#2a2440');
    });
    // Apron title.
    a.globalAlpha = 0.6;
    const t1 = 'SUPERNOVA';
    drawText(a, t1, Math.round(CX - measureText(t1) / 2), 292, pal.a);
    a.globalAlpha = 1;
    this.art[key] = c;
    return c;
  }

  // ---------------------------------------------------------------- frame
  draw(ctx, g, v) {
    const { L, W, H } = this;
    const regions = [];
    ctx.drawImage(this.stars, 0, 0);
    const pal = sectorFor(g.sector).pal;

    // Screen shake and nudge offset.
    const sx = v.shake ? Math.round((Math.random() - 0.5) * v.shake * 2) : 0;
    const sy = v.shake ? Math.round((Math.random() - 0.5) * v.shake * 2) : 0;
    const nx = Math.round(v.nudgeX || 0);
    const ox = L.tx + sx + nx, oy = L.ty + sy;

    this.drawBackdrop(ctx, g, v, pal);
    this.drawDmd(ctx, v, L.dmdX + sx, L.dy + 2 + sy);

    this.drawTable(this.tg, g, v, pal);
    ctx.drawImage(this.tc, ox, oy);
    this.bloom(ctx, g, v, ox, oy);
    // Cabinet rails either side of the playfield.
    this.drawRails(ctx, g, v, pal, ox, oy);

    if (L.side) this.drawSides(ctx, g, v, pal);
    else if (L.bottom) this.drawBottom(ctx, g, v, pal);

    if (v.flash > 0) {
      ctx.globalAlpha = Math.min(1, v.flash);
      ctx.fillStyle = v.flashColor || '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (v.panel) this.drawPanel(ctx, g, v, regions, pal);
    return regions;
  }

  drawBackdrop(ctx, g, v, pal) {
    // A slow light show behind the table, wilder in supernova and multiball.
    const { W, H, L } = this;
    const t = v.time;
    const wild = g.supernovaT > 0 || g.multiball || v.lightShow > 0;
    const n = wild ? 18 : 8;
    const cx = L.tx + TW / 2, cy = L.ty + 190;
    if (v.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * (wild ? 0.9 : 0.15);
      ctx.globalAlpha = wild ? 0.12 : 0.05;
      ctx.fillStyle = wild ? hsl(i * 40 + t * 120) : i % 2 ? pal.a : pal.b;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - 0.08) * W, cy + Math.sin(a - 0.08) * W);
      ctx.lineTo(cx + Math.cos(a + 0.08) * W, cy + Math.sin(a + 0.08) * W);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    void H;
  }

  /** Neon bloom: a small blurry copy of the table, added back on top. */
  bloom(ctx, g, v, ox, oy) {
    const k = g.supernovaT > 0 ? 0.75 : g.multiball || v.lightShow > 0 ? 0.6 : 0.42;
    for (const [c, cg, w, h, a] of [[this.bc, this.bg, TW / 4, TH / 4, k], [this.bc2, this.bg2, TW / 8, TH / 8, k * 0.7]]) {
      cg.imageSmoothingEnabled = true;
      cg.clearRect(0, 0, w, h);
      cg.drawImage(this.tc, 0, 0, w, h);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.drawImage(c, ox - 2, oy - 2, TW + 4, TH + 4);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = false;
  }

  drawRails(ctx, g, v, pal, ox, oy) {
    const t = v.time;
    // Side rails with chasing lights.
    for (const x of [ox - 5, ox + TW + 1]) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(x, oy - 2, 4, TH + 2);
      ctx.fillStyle = '#2a2440';
      ctx.fillRect(x + 1, oy - 2, 2, TH + 2);
      const speed = g.supernovaT > 0 || g.multiball ? 30 : 8;
      for (let y = 0; y < TH; y += 8) {
        const on = (Math.floor(y / 8) + Math.floor(t * speed)) % 4 === 0;
        if (!on || v.reducedMotion) continue;
        ctx.fillStyle = g.supernovaT > 0 ? hsl(y * 3 + t * 400) : pal.a;
        ctx.fillRect(x + 1, oy + y, 2, 3);
      }
    }
  }

  drawTable(ctx, g, v, pal) {
    const t = v.time;
    const tb = g.table;
    ctx.drawImage(this.tableArt(g), 0, 0);
    this.drawLamps(ctx, g, v, pal);

    // Wormhole: a swirl of dots.
    const w = tb.wormhole;
    const held = g.balls.some((b) => b.held === 'wormhole');
    for (let k = 0; k < 18; k++) {
      const a = t * (held ? 12 : 4) + k * 0.7;
      const rr = 3 + (k % 6);
      ctx.fillStyle = k % 3 === 0 ? '#fff' : pal.b;
      ctx.globalAlpha = held ? 1 : 0.7;
      ctx.fillRect(Math.round(w.x + Math.cos(a) * rr), Math.round(w.y + Math.sin(a) * rr), 1, 1);
    }
    ctx.globalAlpha = 1;
    disc(ctx, w.x, w.y, 2.5, '#000');

    // Black hole.
    if (tb.hole) {
      const h = tb.hole;
      for (let k = 0; k < 24; k++) {
        const a = t * 3 + k * 0.26;
        const rr = 6 + (k % 3) * 2;
        ctx.fillStyle = k % 2 ? '#ff9b2f' : '#ffd23f';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(Math.round(h.x + Math.cos(a) * rr), Math.round(h.y + Math.sin(a) * rr * 0.45), 1, 1);
      }
      ctx.globalAlpha = 1;
      disc(ctx, h.x, h.y, 4, '#000');
      ring(ctx, h.x, h.y, 5, '#fff3a8', 16);
    }

    // Drop targets.
    for (const d of tb.drops) {
      if (d.up) {
        ctx.fillStyle = C.ink;
        ctx.fillRect(d.ax - 2, d.ay - 1, 4, d.by - d.ay + 2);
        ctx.fillStyle = pal.b;
        ctx.fillRect(d.ax - 1, d.ay, 2, d.by - d.ay);
        ctx.fillStyle = '#fff';
        ctx.fillRect(d.ax - 1, d.ay, 1, d.by - d.ay);
      } else {
        ctx.fillStyle = '#2a2440';
        ctx.fillRect(d.ax - 1, d.ay + 2, 2, d.by - d.ay - 4);
      }
    }

    // Slingshots.
    for (const q of tb.segments) {
      if (q.kind !== 'sling' && q.kind !== 'rubber') continue;
      const hot = q.kind === 'sling' && q.flash > 0;
      line(ctx, q.ax, q.ay, q.bx, q.by, hot ? '#fff' : q.kind === 'sling' ? pal.glow : '#c9d3ff', hot ? 2 : 1);
    }
    // Posts.
    for (const c of tb.circles) {
      if (c.kind === 'post' || c.kind === 'centerpost') {
        disc(ctx, c.x, c.y, c.r, c.kind === 'centerpost' ? pal.a : '#c9d3ff');
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 1, 1);
      }
    }

    // Spinner.
    const spin = tb.spinnerSpin || 0;
    const ph = Math.abs(Math.sin(t * 40 * Math.min(1, spin)));
    ctx.fillStyle = C.ink;
    ctx.fillRect(4, 95, 16, 3);
    ctx.fillStyle = spin > 0 ? (Math.floor(t * 30) % 2 ? '#fff' : pal.a) : '#c9d3ff';
    ctx.fillRect(5, 96 - Math.round(ph), 14, 1 + Math.round(ph * 2));

    // Bumpers.
    tb.bumpers.forEach((b, i) => {
      const f = b.flash > 0;
      const grow = f && !v.reducedMotion ? 1 : 0;
      disc(ctx, b.x, b.y + 1, b.r + 1 + grow, C.ink);
      ring(ctx, b.x, b.y, b.r + grow, f ? '#fff' : pal.a);
      ctx.drawImage(f ? this.S.flashPlanet : this.S.planets[i], Math.round(b.x - 9), Math.round(b.y - 9 - grow));
      if (f && !v.reducedMotion) ring(ctx, b.x, b.y, b.r + 3 + (0.18 - b.flash) * 40, pal.glow);
    });

    // The star.
    this.drawStar(ctx, g, v, pal);

    // Comet.
    if (tb.cometCircle && !tb.cometCircle.off) {
      const c = tb.cometCircle;
      const sp = Math.hypot(c.vx || 0, c.vy || 0) || 1;
      for (let i = 1; i < 12; i++) {
        ctx.globalAlpha = 1 - i / 12;
        ctx.fillStyle = i < 4 ? '#fff' : i < 8 ? C.cyan : '#3fa9ff';
        ctx.fillRect(Math.round(c.x - ((c.vx || 0) / sp) * i * 1.5), Math.round(c.y - ((c.vy || 0) / sp) * i * 1.5), 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(this.S.comet, Math.round(c.x - 4.5), Math.round(c.y - 4.5));
    }

    // Mothership.
    if (tb.ship && !tb.ship.dead) {
      const s = tb.ship;
      const sc = tb.shipCircle || s;
      const flick = s.hitT > 0 && Math.floor(t * 30) % 2;
      if (!flick) ctx.drawImage(this.S.ship, Math.round(sc.x - 12), Math.round(sc.y - 5));
      // Tractor beam lights.
      if (Math.floor(t * 6) % 2 === 0) {
        ctx.fillStyle = C.pink;
        ctx.fillRect(Math.round(sc.x - 5), Math.round(sc.y + 5), 1, 1);
        ctx.fillRect(Math.round(sc.x + 4), Math.round(sc.y + 5), 1, 1);
      }
      // HP bar.
      const bw = 20;
      ctx.fillStyle = C.ink;
      ctx.fillRect(Math.round(sc.x - bw / 2) - 1, Math.round(sc.y - 10), bw + 2, 3);
      ctx.fillStyle = C.red;
      ctx.fillRect(Math.round(sc.x - bw / 2), Math.round(sc.y - 9), Math.round((bw * s.hp) / s.maxHp), 1);
    }

    // Plunger.
    const py = PLUNGER.y + BALL_R + 2 + Math.round(g.plunger * 9);
    ctx.fillStyle = '#c9d3ff';
    ctx.fillRect(164, py, 5, 2);
    for (let y = py + 3; y < TH; y += 2) {
      ctx.fillStyle = (y - py) % 4 === 1 ? '#8a93b8' : '#4a4f7a';
      ctx.fillRect(163, y, 7, 1);
    }

    // Flippers.
    for (const f of tb.flippers) this.drawFlipper(ctx, f, pal, g.tilted);

    // Balls with trails.
    for (const b of g.balls) {
      if (b.held === 'warp') continue;
      const trail = v.trails && v.trails[b.id];
      if (trail && !v.reducedMotion) {
        trail.forEach((p, i) => {
          ctx.globalAlpha = (i / trail.length) * 0.45;
          ctx.fillStyle = g.supernovaT > 0 ? hsl(i * 30 + t * 300) : pal.glow;
          ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
        });
        ctx.globalAlpha = 1;
      }
      if (b.held === 'wormhole' || b.held === 'hole') ctx.globalAlpha = 0.4;
      ctx.drawImage(g.supernovaT > 0 ? this.S.hotBall : this.S.ball, Math.round(b.x - 4), Math.round(b.y - 4));
      ctx.globalAlpha = 1;
    }

    // Particles and score pops, in table space.
    for (const p of v.particles) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.kind === 'ring') {
        const k = p.life / p.max;
        ctx.globalAlpha = 1 - k;
        ring(ctx, p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - (1 - k) ** 2), p.color);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'bolt') {
        ctx.globalAlpha = 1 - p.life / p.max;
        let lx = p.x, ly = p.y;
        for (let i = 1; i <= 5; i++) {
          const k = i / 5;
          const nx2 = i === 5 ? p.x2 : p.x + (p.x2 - p.x) * k + (Math.random() - 0.5) * 8;
          const ny2 = i === 5 ? p.y2 : p.y + (p.y2 - p.y) * k + (Math.random() - 0.5) * 8;
          line(ctx, lx, ly, nx2, ny2, Math.random() < 0.5 ? '#fff' : C.cyan);
          lx = nx2;
          ly = ny2;
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, p.size || 1, p.size || 1);
        ctx.globalAlpha = 1;
      }
    }
    for (const p of v.popups) {
      const age = v.time - p.t0;
      const y = Math.round(p.y - age * 16);
      const text = p.text;
      const w = measureText(text, p.scale || 1);
      ctx.globalAlpha = Math.min(1, 2.2 - age * 2);
      oText(ctx, text, Math.round(p.x - w / 2), y, p.color || C.gold, p.scale || 1);
      ctx.globalAlpha = 1;
    }

    // Tilt: the playfield dims.
    if (g.tilted) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, TW, TH);
      if (Math.floor(t * 3) % 2) cText(ctx, 'TILT', CX, 150, C.red, 4, oText);
    }
  }

  drawFlipper(ctx, f, pal, dead) {
    const tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
    const x0 = Math.floor(Math.min(f.px, tx) - 6), x1 = Math.ceil(Math.max(f.px, tx) + 6);
    const y0 = Math.floor(Math.min(f.py, ty) - 6), y1 = Math.ceil(Math.max(f.py, ty) + 6);
    const dx = tx - f.px, dy = ty - f.py;
    const L2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        let u = ((px - f.px) * dx + (py - f.py) * dy) / L2;
        u = Math.max(0, Math.min(1, u));
        const cx = f.px + dx * u, cy = f.py + dy * u;
        const r = f.r0 + (f.r1 - f.r0) * u;
        const d = Math.hypot(px - cx, py - cy);
        if (d > r + 0.6) continue;
        // Outline, rubber band, white body, a coloured stripe.
        let col;
        if (d > r - 0.4) col = C.ink;
        else if (d > r - 1.4) col = dead ? '#4a4f7a' : pal.a;
        else col = Math.abs((py - cy) + (px - cx) * 0) < 0.8 && u > 0.2 ? pal.glow : '#eef1f6';
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    disc(ctx, f.px, f.py, 1.5, '#8a93b8');
  }

  drawStar(ctx, g, v, pal) {
    const s = g.table.star;
    const t = v.time;
    const nova = g.supernovaT > 0;
    const unstable = g.mass > 70 && !nova;
    const r = s.r + (unstable && !v.reducedMotion ? Math.sin(t * 20) * 0.8 : 0);
    // Corona rays.
    const rays = nova ? 16 : 10;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + t * (nova ? 2 : 0.6);
      const len = r + 3 + (nova ? 10 + Math.sin(t * 9 + i) * 5 : 2 + Math.sin(t * 5 + i) * 1.5);
      line(ctx, s.x + Math.cos(a) * (r + 1), s.y + Math.sin(a) * (r + 1), s.x + Math.cos(a) * len, s.y + Math.sin(a) * len, nova ? hsl(i * 22 + t * 300) : unstable ? C.red : pal.b);
    }
    // A soft corona.
    for (let k = 3; k >= 1; k--) {
      ctx.globalAlpha = (nova ? 0.25 : 0.12) / k;
      disc(ctx, s.x, s.y, r + k * (nova ? 6 : 3), nova ? '#fff3a8' : unstable ? C.red : pal.b);
    }
    ctx.globalAlpha = 1;
    const hot = s.flash > 0;
    const body = nova ? '#fff3a8' : hot ? '#fff' : g.mass > 70 ? '#ff6b4a' : g.mass > 35 ? '#ff9b2f' : '#ffd23f';
    disc(ctx, s.x, s.y, r + 1, C.ink);
    disc(ctx, s.x, s.y, r, body);
    disc(ctx, s.x - r * 0.3, s.y - r * 0.3, r * 0.45, '#fff');
    if (g.multiball && g.jackpotLit && Math.floor(t * 6) % 2) ring(ctx, s.x, s.y, r + 4, C.gold);
  }

  drawLamps(ctx, g, v, pal) {
    const t = v.time;
    const show = (g.supernovaT > 0 || v.lightShow > 0) && !v.reducedMotion;
    // Chasing lamps round the dome and down the sides.
    const perim = this.perimeter || (this.perimeter = (() => {
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        const a = Math.PI + (i / 26) * Math.PI;
        pts.push([ARC.x + Math.cos(a) * (ARC.r - 6), ARC.y + Math.sin(a) * (ARC.r - 6)]);
      }
      return pts;
    })());
    const fast = g.multiball || g.supernovaT > 0 || v.lightShow > 0;
    const speed = fast ? 26 : 7;
    perim.forEach(([x, y], i) => {
      const on = v.reducedMotion ? i % 3 === 0 : (i + Math.floor(t * speed)) % (fast ? 3 : 6) === 0;
      ctx.fillStyle = on ? (fast ? hsl(i * 18 + t * 300) : pal.glow) : '#231c36';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    });
    const lamp = (x, y, w, h, on, col = pal.glow, i = 0) => {
      const lit = show ? (i + Math.floor(t * 16)) % 3 === 0 : on;
      ctx.fillStyle = C.ink;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = lit ? (show ? hsl(i * 40 + t * 400) : col) : '#2e2446';
      ctx.fillRect(x, y, w, h);
      if (lit) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, 1, 1);
      }
    };
    // Lane arrows and S T A R.
    g.lanes.forEach((on, i) => {
      const x = 55 + i * 18;
      lamp(x - 1, 41, 3, 4, on, pal.b, i);
      if (on || show) drawText(ctx, 'STAR'[i], x - 2, 54, show ? hsl(i * 60 + t * 300) : pal.glow);
    });
    // Multipliers.
    MULTS.slice(1).forEach((m, i) => {
      const x = 58 + i * 13;
      lamp(x, 232, 10, 7, g.mult >= m, C.gold, i + 4);
      drawText(ctx, `${m}X`, x + 0, 233, g.mult >= m ? C.ink : '#3a3055');
    });
    // Mass ring round the star: how close it is to going nova.
    const n = 16;
    const lit = Math.floor((g.mass / 100) * n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = Math.round(CX + Math.cos(a) * 22), y = Math.round(190 + Math.sin(a) * 22);
      const on = i < lit || g.supernovaT > 0;
      ctx.fillStyle = on ? (g.supernovaT > 0 ? hsl(i * 22 + t * 400) : g.mass > 70 ? C.red : C.orange) : '#231c36';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    // Drop target lamps.
    g.table.drops.forEach((d, i) => lamp(30, d.ay + 3, 3, 3, !d.up, C.cyan, i + 8));
    // Lock lamps by the wormhole (from sector 2).
    if (g.sector >= 2) {
      for (let i = 0; i < 2; i++) lamp(127 + i * 6, 172, 4, 4, g.locks > i || (g.multiball && Math.floor(t * 4) % 2), C.pink, i + 11);
      if (!g.multiball && Math.floor(t * 2) % 2) drawText(ctx, 'LOCK', 124, 178, pal.b);
    }
    // Orbit arrow.
    const blink = Math.floor(t * 3) % 2;
    lamp(10, 176, 3, 3, blink, pal.a, 13);
    lamp(10, 170, 3, 3, !blink, pal.a, 14);
    // Shoot again (ball save).
    const save = g.ballSaveT > 0 && (g.ballSaveT > 2 || Math.floor(t * 8) % 2);
    lamp(CX - 12, 280, 24, 5, save, C.green, 15);
    if (save) drawText(ctx, 'SAVE', CX - 11, 280, C.ink);
    // Outlane saves.
    if (g.upgrades.includes('kickback')) lamp(7, 238, 4, 4, !g.kickbackUsed, C.green, 16);
    if (g.upgrades.includes('magna')) lamp(153, 238, 4, 4, !g.magnaUsed, C.green, 17);
    // Jackpot.
    if (g.jackpotLit && Math.floor(t * 5) % 2) cText(ctx, 'JACKPOT', CX, 207, C.gold);
    // Combo counter.
    if (g.combo >= 2) cText(ctx, `${g.combo}X COMBO`, CX, 214, C.pink);
    void ARC;
  }

  // ---------------------------------------------------------------- dot-matrix display
  drawDmd(ctx, v, x, y) {
    const d = this.dg;
    d.clearRect(0, 0, DMD_W, DMD_H);
    if (v.dmdDraw) v.dmdDraw(d, DMD_W, DMD_H);
    const img = d.getImageData(0, 0, DMD_W, DMD_H).data;
    // Bezel.
    ctx.fillStyle = C.ink;
    ctx.fillRect(x - 3, y - 2, DMD_W * DMD_PX + 5, DMD_H * DMD_PX + 3);
    ctx.fillStyle = '#1a0b04';
    ctx.fillRect(x - 2, y - 1, DMD_W * DMD_PX + 3, DMD_H * DMD_PX + 1);
    for (let j = 0; j < DMD_H; j++) {
      for (let i = 0; i < DMD_W; i++) {
        const k = (j * DMD_W + i) * 4;
        const a = img[k + 3];
        if (a > 40) {
          ctx.fillStyle = `rgb(${img[k]} ${img[k + 1]} ${img[k + 2]})`;
          ctx.fillRect(x + i * DMD_PX, y + j * DMD_PX, 1, 1);
        } else {
          ctx.fillStyle = '#2e1507';
          ctx.fillRect(x + i * DMD_PX, y + j * DMD_PX, 1, 1);
        }
      }
    }
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
      let ry = L.ty + TH - 70;
      const keys = v.touch ? [['TAP LEFT', 'LEFT FLIPPER'], ['TAP RIGHT', 'RIGHT FLIPPER'], ['HOLD', 'PULL PLUNGER'], ['SWIPE UP', 'NUDGE']] : [['Z / LEFT', 'LEFT FLIPPER'], ['/ / RIGHT', 'RIGHT FLIPPER'], ['SPACE', 'PLUNGER (HOLD)'], ['UP', 'NUDGE']];
      for (const [k, d] of keys) {
        sText(ctx, k, rx, ry, C.gold);
        sText(ctx, d, rx, ry + 8, C.dim);
        ry += 17;
      }
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
    sText(ctx, `${fmt(g.sectorScore)} / ${fmt(g.target)}`.length > 16 ? fmt(g.target) : `${fmt(g.sectorScore)}`, lx, y, C.line);
    y += 14;
    sText(ctx, 'STAR MASS', lx, y, C.muted);
    y += 9;
    this.bar(ctx, lx, y, 96, g.mass / 100, g.mass > 70 ? C.red : C.orange, g.supernovaT > 0);
    y += 14;
    sText(ctx, 'BALLS', lx, y, C.muted);
    for (let i = 0; i < Math.min(8, g.ballsLeft); i++) ctx.drawImage(this.S.ball, lx + 36 + i * 9, y - 1);
    y += 14;
    sText(ctx, `MULTIPLIER X${g.mult}`, lx, y, C.gold);
    if (g.supernovaT > 0) {
      y += 12;
      sText(ctx, `SUPERNOVA ${Math.ceil(g.supernovaT)}`, lx, y, hsl(t * 300));
    }
    // Right: upgrades and controls.
    let ry = L.ty;
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
    ry = L.ty + TH - 70;
    const keys = v.touch ? [['TAP LEFT', 'LEFT FLIPPER'], ['TAP RIGHT', 'RIGHT FLIPPER'], ['HOLD', 'PULL PLUNGER'], ['SWIPE UP', 'NUDGE']] : [['Z / LEFT', 'LEFT FLIPPER'], ['/ / RIGHT', 'RIGHT FLIPPER'], ['SPACE', 'PLUNGER (HOLD)'], ['UP', 'NUDGE']];
    for (const [k, d] of keys) {
      sText(ctx, k, rx, ry, C.gold);
      sText(ctx, d, rx, ry + 8, C.dim);
      ry += 17;
    }
  }

  drawBottom(ctx, g, v, pal) {
    const { L, W } = this;
    if (v.panel === 'title') return;
    const y = L.ty + TH + 6;
    const x = L.tx;
    sText(ctx, sectorFor(g.sector).name, x, y, pal.a);
    const bl = `BALLS ${g.ballsLeft}`;
    sText(ctx, bl, x + TW - measureText(bl), y, C.line);
    this.bar(ctx, x, y + 10, TW, g.sectorScore / g.target, pal.a, g.sectorScore >= g.target);
    sText(ctx, `TARGET ${fmt(g.target)}`, x, y + 20, C.muted);
    const m = `X${g.mult}`;
    sText(ctx, m, x + TW - measureText(m), y + 20, C.gold);
    void W;
  }

  bar(ctx, x, y, w, k, col, done) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = '#231c36';
    ctx.fillRect(x + 1, y + 1, w - 2, 4);
    ctx.fillStyle = done ? C.green : col;
    ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * Math.min(1, Math.max(0, k))), 4);
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
      const y = L.ty + 70;
      const w1 = measureText('SUPERNOVA', 3);
      for (let i = 0; i < 9; i++) {
        const wave = v.reducedMotion ? 0 : Math.round(Math.sin(t * 5 + i * 0.6) * 2);
        oText(ctx, 'SUPERNOVA'[i], Math.round(cx - w1 / 2) + i * 18, y + wave, v.reducedMotion ? C.gold : hsl(t * 120 + i * 25, 100, 65), 3);
      }
      cText(ctx, 'PINBALL', cx, y + 22, C.cyan, 2, oText);
      if (v.best) cText(ctx, `HIGH SCORE ${fmt(v.best)}`, cx, y + 44, C.gold, 1, oText);
      if (Math.floor(t * 2) % 2 === 0 || v.reducedMotion) cText(ctx, v.touch ? 'TAP TO PLAY' : 'PRESS SPACE TO PLAY', cx, y + 160, '#fff', 1, oText);
      regions.push({ id: 'start', x: 0, y: 0, w: W, h: H });
      return;
    }
    ctx.fillStyle = 'rgba(5,3,15,0.6)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(W - 8, 220);
    const px = Math.round((W - pw) / 2);
    if (v.panel === 'warp') {
      const k = Math.min(1, g.phaseT / 2.2);
      // Hyperspace.
      if (!v.reducedMotion) {
        for (let i = 0; i < 90; i++) {
          const a = i * 2.4;
          const d = ((t * 1.4 + i * 0.13) % 1) ** 2 * W;
          ctx.fillStyle = i % 3 ? pal.glow : '#fff';
          line(ctx, cx + Math.cos(a) * d, L.ty + 150 + Math.sin(a) * d, cx + Math.cos(a) * (d + 6 + d * 0.08), L.ty + 150 + Math.sin(a) * (d + 6 + d * 0.08), ctx.fillStyle);
        }
      }
      cText(ctx, 'SECTOR CLEAR', cx, L.ty + 90, C.green, 2, oText);
      const next = sectorFor(g.sector + 1);
      if (k > 0.3) cText(ctx, 'WARPING TO', cx, L.ty + 120, C.muted, 1, oText);
      if (k > 0.5) cText(ctx, next.name, cx, L.ty + 132, next.pal.a, 2, oText);
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
