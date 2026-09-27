// Paints a map into a static canvas once (ground, cliffs, buildings) and
// remembers which tiles animate so each frame only redraws those.
import { T } from '../world/tiles.js';
import { hash, makeCanvas, mix, mulberry32 } from '../util.js';
import { drawText, textWidth } from './font.js';

export const TS = 16;

const THEMES = {
  home: { floor: '#3a2f52', floor2: '#43375e', wall: '#231c3a', trim: '#ff4fd8' },
  lab: { floor: '#dfe6f0', floor2: '#cdd6e4', wall: '#2a3a5a', trim: '#6dff7a' },
  clinic: { floor: '#d6efe8', floor2: '#c2e2da', wall: '#1a3a3a', trim: '#6dff7a' },
  mart: { floor: '#3a3450', floor2: '#443d5c', wall: '#2a2030', trim: '#ffe23d' },
  kiosk: { floor: '#2e2446', floor2: '#382c54', wall: '#1e1430', trim: '#3ff7ff' },
  house: { floor: '#4a3446', floor2: '#553c50', wall: '#2a1a2e', trim: '#ff6b3d' },
  dojo: { floor: '#4a4020', floor2: '#55492a', wall: '#2a2410', trim: '#ffe23d' },
  foundry: { floor: '#3a3a44', floor2: '#44444f', wall: '#22222a', trim: '#ff6b3d' },
  observatory: { floor: '#1e1848', floor2: '#262054', wall: '#100a2a', trim: '#b9a8ff' },
  spire: { floor: '#12141e', floor2: '#181b28', wall: '#08080e', trim: '#7ff4ff' },
};

const LAND = (t) => t !== T.VOID;

export function paintMap(map) {
  const { w, h, tiles } = map;
  const [c, ctx] = makeCanvas(w * TS, h * TS + 32);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.VOID : tiles[y * w + x]);
  const rng = mulberry32(hash(map.id));
  const r = (x, y, ww, hh, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, ww, hh);
  };
  const theme = THEMES[map.theme] ?? THEMES.home;
  const anim = [];
  const nightZone = (x, y) => map.zones.find((z) => z.night && x >= z.rect[0] && x <= z.rect[2] && y >= z.rect[1] && y <= z.rect[3]);
  const zoneTint = (x, y) => map.zones.find((z) => x >= z.rect[0] && x <= z.rect[2] && y >= z.rect[1] && y <= z.rect[3]);

  // Cliffs below the island's rim.
  if (!map.indoor) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!LAND(at(x, y)) || LAND(at(x, y + 1))) continue;
        const px = x * TS, py = (y + 1) * TS;
        const depth = 14 + ((hash(`${x},${y}`) >> 3) % 14);
        for (let i = 0; i < TS; i++) {
          const d = depth - ((hash(`${x}.${i}`) >> 2) % 5);
          const grad = ctx.createLinearGradient(0, py, 0, py + d);
          grad.addColorStop(0, '#4a3a6a');
          grad.addColorStop(1, '#1a1030');
          ctx.fillStyle = grad;
          ctx.fillRect(px + i, py, 1, d);
        }
        r(px, py, TS, 2, '#2a2046');
        r(px, py + 5, TS, 1, '#3a2c5a');
        // Hanging cables and roots with glowing tips.
        if (rng() < 0.5) {
          const cx = px + 2 + Math.floor(rng() * 12), len = 8 + Math.floor(rng() * 20);
          r(cx, py + 2, 1, len, '#141024');
          r(cx, py + 2 + len, 1, 2, rng() < 0.5 ? '#3ff7ff' : '#ff4fd8');
        }
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = at(x, y), px = x * TS, py = y * TS;
      const v = hash(`${map.id}${x},${y}`);
      const z = zoneTint(x, y);
      const night = !!nightZone(x, y);
      switch (t) {
        case T.VOID:
          break;
        case T.DECK:
        case T.LAMP:
        case T.SIGN:
        case T.CRATE:
        case T.DOOR:
          deck(r, px, py, v, night, z?.smoke);
          break;
        case T.PATH:
          r(px, py, TS, TS, night ? '#16122e' : '#1e1a36');
          r(px + ((v >> 4) % 12), py + ((v >> 8) % 12), 2, 1, '#2a2548');
          if (at(x - 1, y) !== T.PATH && at(x - 1, y) !== T.BRIDGE) r(px, py, 1, TS, '#3ff7ff');
          if (at(x + 1, y) !== T.PATH && at(x + 1, y) !== T.BRIDGE) r(px + TS - 1, py, 1, TS, '#3ff7ff');
          if (at(x, y - 1) !== T.PATH && at(x, y - 1) !== T.BRIDGE && at(x, y - 1) !== T.DOOR) r(px, py, TS, 1, '#ff4fd8');
          if (at(x, y + 1) !== T.PATH && at(x, y + 1) !== T.BRIDGE) r(px, py + TS - 1, TS, 1, '#ff4fd8');
          break;
        case T.GRASS:
        case T.MOSS:
        case T.TREE:
        case T.FLOWER:
        case T.TURBINE:
        case T.FENCE:
          moss(r, px, py, v, night, z?.rain);
          if (t === T.GRASS) {
            const base = night ? '#1c2a5a' : z?.smoke ? '#3a3a3a' : '#0f5a5a';
            r(px, py, TS, TS, base);
            for (let k = 0; k < 7; k++) {
              const gx = px + ((v >> (k * 3)) % 14) + 1, gy = py + 3 + ((k * 5 + (v >> k)) % 11);
              r(gx, gy - 3, 1, 4, night ? '#3a4a9a' : z?.smoke ? '#6a6a5a' : '#1f8a7a');
            }
            anim.push({ t, x, y, v, night, smoke: z?.smoke });
          }
          if (t === T.FLOWER) {
            const cols = ['#ff4fd8', '#3ff7ff', '#ffe23d', '#b9a8ff'];
            for (let k = 0; k < 3; k++) {
              const fx = px + 2 + ((v >> (k * 4)) % 11), fy = py + 3 + ((v >> (k * 5 + 2)) % 10);
              r(fx, fy + 1, 1, 2, '#1f6a4a');
              r(fx - 1, fy, 3, 1, cols[(v >> (k + 7)) % 4]);
              r(fx, fy - 1, 1, 1, cols[(v >> (k + 7)) % 4]);
            }
          }
          if (t === T.TURBINE) anim.push({ t, x, y });
          break;
        case T.WATER:
          r(px, py, TS, TS, '#0b3a5a');
          r(px, py, TS, 2, at(x, y - 1) !== T.WATER ? '#2a2046' : '#0b3a5a');
          anim.push({ t, x, y, v });
          break;
        case T.BRIDGE: {
          if (at(x, y) === T.BRIDGE && (at(x, y - 1) === T.WATER || at(x, y + 1) === T.WATER)) r(px, py, TS, TS, '#0b3a5a');
          const vertical = LAND(at(x, y - 1)) && LAND(at(x, y + 1)) && at(x, y - 1) !== T.WATER;
          r(px, py, TS, TS, '#2a2238');
          for (let k = 0; k < TS; k += 4) (vertical ? r(px, py + k, TS, 1, '#3a3052') : r(px + k, py, 1, TS, '#3a3052'));
          if (vertical) {
            if (at(x - 1, y) !== T.BRIDGE) r(px, py, 2, TS, '#ff4fd8');
            if (at(x + 1, y) !== T.BRIDGE) r(px + TS - 2, py, 2, TS, '#ff4fd8');
          } else {
            if (at(x, y - 1) !== T.BRIDGE) r(px, py, TS, 2, '#3ff7ff');
            if (at(x, y + 1) !== T.BRIDGE) r(px, py + TS - 2, TS, 2, '#3ff7ff');
          }
          break;
        }
        case T.PIPE:
          deck(r, px, py, v, night, true);
          r(px + 3, py, 10, TS, '#4a4a5a');
          r(px + 4, py, 2, TS, '#6a6a7a');
          r(px + 11, py, 2, TS, '#2a2a36');
          r(px + 3, py + 6, 10, 2, '#ff6b3d');
          break;
        case T.BLDG:
          break;
        // --- interiors
        case T.FLOOR:
        case T.EXIT:
        case T.RUG:
        case T.ARENA:
          r(px, py, TS, TS, (x + y) % 2 ? theme.floor : theme.floor2);
          r(px, py, TS, 1, mix(theme.floor, '#000', 0.12));
          r(px, py, 1, TS, mix(theme.floor, '#000', 0.12));
          if (t === T.EXIT) {
            r(px + 2, py + 4, 12, 10, '#1a1030');
            r(px + 3, py + 5, 10, 1, theme.trim);
            r(px + 6, py + 8, 4, 1, theme.trim);
            r(px + 7, py + 9, 2, 2, theme.trim);
          }
          if (t === T.RUG) r(px + 1, py + 1, 14, 14, mix(theme.trim, '#000', 0.55));
          if (t === T.ARENA) {
            r(px, py, TS, TS, mix(theme.floor, theme.trim, 0.18));
            if (at(x - 1, y) !== T.ARENA) r(px, py, 1, TS, theme.trim);
            if (at(x + 1, y) !== T.ARENA) r(px + TS - 1, py, 1, TS, theme.trim);
            if (at(x, y - 1) !== T.ARENA) r(px, py, TS, 1, theme.trim);
            if (at(x, y + 1) !== T.ARENA) r(px, py + TS - 1, TS, 1, theme.trim);
          }
          break;
        case T.IWALL:
        case T.SCREEN:
          r(px, py, TS, TS, theme.wall);
          r(px, py + 12, TS, 4, mix(theme.wall, '#000', 0.35));
          r(px, py + 11, TS, 1, theme.trim);
          if (t === T.SCREEN) {
            r(px + 2, py + 2, 12, 8, '#0a0620');
            anim.push({ t, x, y, v, trim: theme.trim });
          }
          break;
        default:
          r(px, py, TS, TS, (x + y) % 2 ? theme.floor : theme.floor2);
      }
      // Objects that sit on the ground.
      switch (t) {
        case T.LAMP:
          r(px + 7, py + 1, 2, 14, '#2a2a3a');
          r(px + 5, py + 13, 6, 2, '#1a1a2a');
          anim.push({ t, x, y, v });
          break;
        case T.SIGN:
          r(px + 7, py + 8, 2, 7, '#2a2a3a');
          r(px + 2, py + 2, 12, 8, '#1a1030');
          r(px + 2, py + 2, 12, 1, '#3ff7ff');
          r(px + 4, py + 5, 8, 1, '#8ab8ff');
          r(px + 4, py + 7, 6, 1, '#8ab8ff');
          break;
        case T.CRATE: {
          const cc = ['#6a4a8a', '#8a5a2a', '#2a6a7a'][v % 3];
          r(px + 1, py + 2, 14, 13, mix(cc, '#000', 0.3));
          r(px + 1, py + 2, 14, 4, cc);
          r(px + 1, py + 8, 14, 1, mix(cc, '#000', 0.5));
          r(px + 3, py + 10, 3, 2, '#ffe23d');
          break;
        }
        case T.TURBINE:
          r(px + 6, py - 6, 4, 21, '#b9c6e0');
          r(px + 9, py - 6, 1, 21, '#8a93b0');
          r(px + 4, py + 13, 8, 2, '#4a4a5a');
          break;
        case T.FENCE:
          r(px, py + 6, TS, 2, '#3ff7ff');
          r(px + 1, py + 4, 2, 10, '#3a3a4a');
          r(px + 13, py + 4, 2, 10, '#3a3a4a');
          break;
        case T.COUNTER:
          r(px, py + 2, TS, 14, mix(theme.wall, '#fff', 0.2));
          r(px, py + 2, TS, 4, mix(theme.wall, '#fff', 0.35));
          r(px, py + 14, TS, 2, theme.trim);
          break;
        case T.TABLE:
          r(px + 1, py + 3, 14, 9, '#6a5a7a');
          r(px + 1, py + 3, 14, 2, '#8a7a9a');
          r(px + 2, py + 12, 2, 3, '#3a2a4a');
          r(px + 12, py + 12, 2, 3, '#3a2a4a');
          break;
        case T.MACHINE:
          r(px + 1, py, 14, 16, '#1c1a2e');
          r(px + 2, py + 1, 12, 14, '#2a2840');
          for (let k = 0; k < 4; k++) r(px + 3, py + 3 + k * 3, 10, 1, '#141224');
          anim.push({ t, x, y, v });
          break;
        case T.PLANT:
          r(px + 4, py + 10, 8, 5, '#6a4a3a');
          r(px + 2, py + 2, 12, 9, '#2e8a55');
          r(px + 4, py + 1, 3, 3, '#5fd46a');
          r(px + 9, py + 3, 3, 3, '#ff7af0');
          break;
        case T.BED:
          r(px + 1, py + 1, 14, 15, '#2a2a4a');
          r(px + 2, py + 2, 12, 4, '#eef1f6');
          r(px + 2, py + 6, 12, 9, '#ff4fd8');
          break;
        case T.POD:
          r(px, py + 2, TS, 14, mix(theme.wall, '#fff', 0.2));
          r(px + 3, py - 2, 10, 12, '#9ff0ff');
          r(px + 4, py - 1, 8, 10, '#dff8ff');
          r(px + 5, py + 1, 6, 6, '#7ad8ff');
          r(px + 3, py + 9, 10, 2, '#4a5a7a');
          break;
        case T.TERMINAL:
          r(px + 2, py + 1, 12, 14, '#1c1a2e');
          r(px + 3, py + 2, 10, 7, '#0a3a4a');
          anim.push({ t, x, y, v });
          break;
        case T.HEART:
          r(px, py, TS, TS, '#0a0a14');
          anim.push({ t, x, y });
          break;
      }
    }
  }

  // Trees last so their canopies overlap the row above.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) !== T.TREE) continue;
      const px = x * TS, py = y * TS, v = hash(`t${x},${y}`);
      const night = !!nightZone(x, y);
      const leaf = night ? '#2a1f6a' : ['#0f6a6a', '#1a5a7a', '#3a2a7a'][v % 3];
      r(px + 6, py + 8, 4, 8, '#2a1a2e');
      ctx.fillStyle = mix(leaf, '#000', 0.35);
      circle(ctx, px + 8, py + 5, 8);
      ctx.fillStyle = leaf;
      circle(ctx, px + 7, py + 3, 7);
      ctx.fillStyle = mix(leaf, '#fff', 0.2);
      circle(ctx, px + 5, py + 1, 3);
      const fruit = ['#ff4fd8', '#3ff7ff', '#ffe23d'][(v >> 4) % 3];
      for (let k = 0; k < 3; k++) r(px + 2 + ((v >> (k * 3)) % 10), py - 2 + ((v >> (k * 4 + 1)) % 9), 1, 1, fruit);
    }
  }

  for (const b of map.buildings ?? []) paintBuilding(ctx, b, rng);
  return { canvas: c, anim };
}

function circle(ctx, cx, cy, rad) {
  for (let y = -rad; y <= rad; y++) {
    const half = Math.floor(Math.sqrt(rad * rad - y * y));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

function deck(r, px, py, v, night, dirty) {
  const base = dirty ? '#34323e' : night ? '#1e1a3e' : '#2b2a4a';
  r(px, py, TS, TS, base);
  r(px, py, TS, 1, mix(base, '#fff', 0.12));
  r(px, py, 1, TS, mix(base, '#fff', 0.08));
  r(px, py + TS - 1, TS, 1, mix(base, '#000', 0.3));
  if (v % 5 === 0) r(px + 3, py + 3, 1, 1, '#4a4870');
  if (v % 7 === 0) r(px + 12, py + 12, 1, 1, '#4a4870');
  if (v % 11 === 0) r(px + 4, py + 9, 7, 1, mix(base, '#000', 0.2));
}

function moss(r, px, py, v, night, wet) {
  const base = night ? '#18163a' : wet ? '#12353e' : '#153a3a';
  r(px, py, TS, TS, base);
  for (let k = 0; k < 4; k++) r(px + ((v >> (k * 4)) % 15), py + ((v >> (k * 4 + 2)) % 15), 1, 1, night ? '#2a2a5a' : '#1f5a4a');
}

function paintBuilding(ctx, b, rng) {
  const px = b.x * TS, py = b.y * TS, pw = b.w * TS, ph = b.h * TS;
  const r = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const facadeH = b.style === 'spire' ? 3 * TS : TS + 8;
  const roofH = ph - facadeH;
  // Roof
  r(px, py, pw, roofH, b.roof);
  r(px, py, pw, 2, mix(b.roof, '#fff', 0.25));
  for (let x = px + 6; x < px + pw - 4; x += 10) r(x, py + 4, 1, roofH - 8, mix(b.roof, '#000', 0.25));
  r(px, py + roofH - 3, pw, 3, mix(b.roof, '#000', 0.45));
  // Rooftop gear
  if (b.w >= 5) {
    r(px + 4, py + 5, 8, 6, '#4a4a5a');
    r(px + 5, py + 6, 6, 1, '#6a6a7a');
  }
  if (b.style === 'observatory') {
    ctx.fillStyle = '#5a48b8';
    circle(ctx, px + pw / 2, py + roofH / 2, Math.min(roofH, pw) / 2 - 3);
    r(px + pw / 2 - 1, py + 3, 3, roofH / 2, '#b9a8ff');
  }
  if (b.style === 'foundry') for (const sx of [px + pw - 14, px + pw - 26]) r(sx, py - 10, 6, 14, '#3a3a44');
  if (b.style === 'spire') {
    r(px + pw / 2 - 10, py - 30, 20, 34, '#0e0e16');
    r(px + pw / 2 - 2, py - 44, 4, 16, '#2a2a3a');
    r(px + pw / 2 - 10, py - 30, 20, 2, b.neon);
  }
  // Facade
  const fy = py + roofH;
  r(px, fy, pw, facadeH, b.wall);
  r(px, fy, pw, 1, mix(b.wall, '#fff', 0.2));
  for (let x = px + 3; x < px + pw - 6; x += 9) {
    if (b.door && x + 6 > b.door[0] * TS && x < b.door[0] * TS + TS) continue;
    const lit = rng() < 0.7;
    r(x, fy + 4, 6, 6, lit ? ['#ffe9a8', '#7ff4ff', '#ff9ae8'][Math.floor(rng() * 3)] : '#141024');
    r(x, fy + 4, 6, 1, '#0a0620');
  }
  r(px, fy + facadeH - 2, pw, 2, mix(b.wall, '#000', 0.4));
  // Neon edge strips
  r(px, py + 2, 1, ph - 2, b.neon);
  r(px + pw - 1, py + 2, 1, ph - 2, b.neon);
  if (b.door) {
    const dx = b.door[0] * TS, dy = b.door[1] * TS;
    r(dx + 2, dy + 2, 12, 14, '#0a0620');
    r(dx + 2, dy + 2, 12, 1, b.neon);
    r(dx + 2, dy + 2, 1, 14, b.neon);
    r(dx + 13, dy + 2, 1, 14, b.neon);
    r(dx + 7, dy + 3, 2, 13, '#1a1440');
  }
  if (b.sign) {
    const tw = textWidth(b.sign) + 6;
    const sx = Math.round(px + pw / 2 - tw / 2), sy = fy - 10;
    r(sx, sy, tw, 9, '#0a0620');
    r(sx, sy, tw, 1, mix(b.neon, '#000', 0.4));
    r(sx, sy + 8, tw, 1, mix(b.neon, '#000', 0.4));
    drawText(ctx, b.sign, sx + 3, sy + 2, b.neon);
  }
}

/** Per-frame animated bits for the tiles in view. */
export function drawAnim(ctx, items, t, camX, camY, vw, vh, reduced) {
  const r = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const slow = reduced ? 0 : t;
  for (const a of items) {
    const px = a.x * TS - camX, py = a.y * TS - camY;
    if (px < -32 || py < -48 || px > vw + 16 || py > vh + 16) continue;
    switch (a.t) {
      case T.GRASS: {
        for (let k = 0; k < 5; k++) {
          const gx = px + ((a.v >> (k * 3)) % 14) + 1, gy = py + 3 + ((k * 5 + (a.v >> k)) % 11);
          const sway = Math.round(Math.sin(slow * 2 + a.x * 0.7 + k) * 1);
          const glow = (Math.sin(slow * 3 + a.v + k) + 1) / 2;
          r(gx + sway, gy - 4, 1, 1, a.night ? (glow > 0.5 ? '#b9a8ff' : '#6a5ad8') : a.smoke ? (glow > 0.5 ? '#ffb13a' : '#aa7a3a') : glow > 0.5 ? '#7ff4ff' : '#3ac9b8');
          r(gx + sway, gy - 3, 1, 1, a.night ? '#3a4a9a' : a.smoke ? '#6a6a5a' : '#1f8a7a');
        }
        break;
      }
      case T.WATER: {
        const o = Math.floor(slow * 8 + a.x * 3) % TS;
        r(px + o, py + 5, 4, 1, '#2a8ab8');
        r(px + ((o + 8) % TS), py + 11, 3, 1, '#1a6a9a');
        break;
      }
      case T.LAMP: {
        const flick = (a.v % 13 === 0 && Math.sin(slow * 23) > 0.7) ? 0.3 : 1;
        ctx.globalAlpha = 0.18 * flick;
        ctx.fillStyle = a.v % 2 ? '#3ff7ff' : '#ff4fd8';
        ctx.beginPath();
        ctx.arc(px + 8, py + 2, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = flick;
        r(px + 5, py, 6, 3, a.v % 2 ? '#bffcff' : '#ffc9f2');
        ctx.globalAlpha = 1;
        break;
      }
      case T.TURBINE: {
        const ang = slow * 2.2 + a.x;
        ctx.strokeStyle = '#eef1f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const q = ang + (k * Math.PI * 2) / 3;
          ctx.moveTo(px + 8, py - 6);
          ctx.lineTo(px + 8 + Math.cos(q) * 12, py - 6 + Math.sin(q) * 12);
        }
        ctx.stroke();
        r(px + 7, py - 7, 3, 3, '#ff4fd8');
        break;
      }
      case T.MACHINE:
        for (let k = 0; k < 4; k++) r(px + 4 + ((a.v >> k) % 7), py + 3 + k * 3, 1, 1, Math.sin(slow * 5 + k + a.v) > 0 ? '#6dff7a' : '#ff4fd8');
        break;
      case T.TERMINAL:
        r(px + 4, py + 4, 8, 1, '#3ff7ff');
        r(px + 4, py + 6, Math.floor(4 + Math.sin(slow * 3) * 3), 1, '#3ff7ff');
        break;
      case T.SCREEN:
        r(px + 3, py + 3 + Math.floor(slow * 4) % 6, 10, 1, a.trim);
        break;
      case T.HEART: {
        const beat = Math.max(0, Math.sin(slow * 1.6)) ** 6;
        ctx.globalAlpha = 0.35 + beat * 0.6;
        r(px + 1, py + 1, 14, 14, '#7ff4ff');
        ctx.globalAlpha = 1;
        break;
      }
    }
  }
}
