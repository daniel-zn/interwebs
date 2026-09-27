// Tiny top-down people, 16x16, drawn from a "look" palette. Sheet layout:
// columns = frames (stand, step A, step B), rows = directions (down, up, left, right).
import { makeCanvas, mix } from '../util.js';

export const LOOKS = {
  player: { skin: '#f2c29a', hair: '#1c1a3a', top: '#2fd3e8', bottom: '#2a2a5a', acc: '#ff4fd8', style: 'spiky', visor: true },
  rival: { skin: '#d99a74', hair: '#ff4fd8', top: '#3a2a6a', bottom: '#1c1a2e', acc: '#ffe23d', style: 'long' },
  vance: { skin: '#c98a64', hair: '#e8e8f0', top: '#eef1f6', bottom: '#3a3a5a', acc: '#6dff7a', style: 'bun', coat: true },
  aunt: { skin: '#f0b890', hair: '#6a2a3a', top: '#ff6b3d', bottom: '#2a2a4a', acc: '#ffe23d', style: 'bun' },
  medic: { skin: '#f2c29a', hair: '#3ff7ff', top: '#e8fff6', bottom: '#2a8a7a', acc: '#6dff7a', style: 'short', coat: true },
  clerk: { skin: '#b87a54', hair: '#2a1a1a', top: '#ffe23d', bottom: '#2a2a4a', acc: '#ff6b3d', style: 'short', visor: true },
  grunt: { skin: '#e0b090', hair: '#111122', top: '#1a1a24', bottom: '#111118', acc: '#ffd23a', style: 'hood', visor: true },
  volta: { skin: '#8a5a3a', hair: '#ffe23d', top: '#2a2a6a', bottom: '#1a1a3a', acc: '#ffe23d', style: 'spiky', coat: true },
  ferra: { skin: '#f0c0a0', hair: '#ff6b3d', top: '#6a7896', bottom: '#3a3a4a', acc: '#ff6b3d', style: 'short', visor: true },
  nyx: { skin: '#d8b8e8', hair: '#1a0a3a', top: '#2e1f78', bottom: '#140c3a', acc: '#b9a8ff', style: 'long', coat: true },
  kade: { skin: '#e8c8a8', hair: '#c9c9d8', top: '#0e0e16', bottom: '#0e0e16', acc: '#ffd23a', style: 'short', coat: true, visor: true },
  runner: { skin: '#c98a64', hair: '#ff6b3d', top: '#ff4fd8', bottom: '#1a1a3a', acc: '#3ff7ff', style: 'spiky' },
  botanist: { skin: '#f2c29a', hair: '#6a4a2a', top: '#5fd46a', bottom: '#3a5a2a', acc: '#fff36b', style: 'bun' },
  worker: { skin: '#a86a44', hair: '#2a2a2a', top: '#ff9a3a', bottom: '#3a3a5a', acc: '#ffe23d', style: 'hood' },
  kid: { skin: '#f0c0a0', hair: '#ffe23d', top: '#6dff7a', bottom: '#2a4a8a', acc: '#ff4fd8', style: 'short', small: true },
  elder: { skin: '#d8a888', hair: '#f0f0f0', top: '#7a4a8a', bottom: '#3a2a4a', acc: '#ffe23d', style: 'bald', coat: true },
  hacker: { skin: '#e8c0a0', hair: '#6dff7a', top: '#1c1a2e', bottom: '#2a2a3a', acc: '#6dff7a', style: 'hood', visor: true },
  trader: { skin: '#9a6a4a', hair: '#ffffff', top: '#ff6b3d', bottom: '#3a2a2a', acc: '#3ff7ff', style: 'long' },
  pilot: { skin: '#f2c29a', hair: '#3a2a1a', top: '#8ee6d0', bottom: '#2a4a5a', acc: '#ffe23d', style: 'short', visor: true },
  mystic: { skin: '#c8a8d8', hair: '#9b6bff', top: '#1c1450', bottom: '#140c3a', acc: '#7ff4ff', style: 'long', coat: true },
};

const OUT = '#0a0620';

function paint(look, dir, frame) {
  const g = Array.from({ length: 16 }, () => Array(16).fill(null));
  const r = (x, y, w, h, c) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < 16 && j < 16) g[j][i] = c;
  };
  const side = dir === 2 || dir === 3;
  const top = 1 + (look.small ? 2 : 0);
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  const shadowTop = look.coat ? mix(look.top, '#000', 0.25) : look.top;
  // legs
  if (side) {
    r(6 + step, 11, 2, 3, look.bottom);
    r(8 - step, 11, 2, 3, mix(look.bottom, '#000', 0.3));
    r(6 + step, 14, 2, 1, '#111');
    r(8 - step, 14, 2, 1, '#111');
  } else {
    r(5, 11 + (step > 0 ? -1 : 0), 2, 3, look.bottom);
    r(9, 11 + (step < 0 ? -1 : 0), 2, 3, look.bottom);
    r(5, 14 + (step > 0 ? -1 : 0), 2, 1, '#111');
    r(9, 14 + (step < 0 ? -1 : 0), 2, 1, '#111');
  }
  // body
  if (side) {
    r(5, 7, 6, 5, look.top);
    r(5, 11, 6, 1, shadowTop);
    r(7 - step, 8, 2, 3, look.skin);
    r(7 - step, 8, 2, 1, look.top);
    if (look.coat) r(5, 11, 6, 2, look.top);
  } else {
    r(4, 7, 8, 5, look.top);
    r(3, 8, 1, 3 - Math.abs(step), look.top);
    r(12, 8, 1, 3 - Math.abs(step), look.top);
    r(3, 10 - Math.abs(step), 1, 1, look.skin);
    r(12, 10 - Math.abs(step), 1, 1, look.skin);
    r(7, 8, 2, 1, look.acc);
    if (look.coat) {
      r(4, 11, 8, 2, look.top);
      r(7, 8, 2, 5, dir === 0 ? look.bottom : look.top);
    }
  }
  // head
  const hx = side ? 4 : 4;
  r(hx, top, 8, 7 - (look.small ? 1 : 0), look.skin);
  const H = look.hair;
  if (dir === 1) {
    r(4, top, 8, 6, H);
  } else if (side) {
    r(4, top, 8, 2, H);
    const back = dir === 2 ? 9 : 4;
    r(back, top, 3, 5, H);
    const ex = dir === 2 ? 5 : 10;
    r(ex, top + 4, 1, 1, OUT);
    if (look.visor) r(dir === 2 ? 4 : 8, top + 3, 4, 1, look.acc);
  } else {
    r(4, top, 8, 2, H);
    r(4, top + 2, 1, 2, H);
    r(11, top + 2, 1, 2, H);
    r(6, top + 4, 1, 1, OUT);
    r(9, top + 4, 1, 1, OUT);
    if (look.visor) r(5, top + 3, 6, 1, look.acc);
  }
  switch (look.style) {
    case 'spiky':
      r(4, top - 1, 1, 1, H);
      r(7, top - 1, 2, 1, H);
      r(11, top - 1, 1, 1, H);
      break;
    case 'long':
      if (dir !== 0) r(side ? (dir === 2 ? 9 : 4) : 4, top + 4, side ? 3 : 8, 4, H);
      else {
        r(3, top + 1, 1, 6, H);
        r(12, top + 1, 1, 6, H);
      }
      break;
    case 'bun':
      r(6, top - 2, 4, 2, H);
      break;
    case 'hood':
      r(3, top, 1, 6, look.top);
      r(12, top, 1, 6, look.top);
      r(4, top - 1, 8, 2, look.top);
      if (dir === 1) r(4, top, 8, 6, look.top);
      break;
    case 'bald':
      if (dir !== 1) r(4, top, 8, 1, look.skin);
      break;
  }
  return g;
}

const cache = new Map();

export function personSheet(lookId) {
  if (cache.has(lookId)) return cache.get(lookId);
  const look = LOOKS[lookId];
  const [c, ctx] = makeCanvas(48, 64);
  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < 3; f++) {
      const g = paint(look, dir, f);
      const ox = f * 16, oy = dir * 16;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(ox + 4, oy + 14, 8, 2);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (g[y][x]) continue;
          const n = (g[y - 1]?.[x]) || (g[y + 1]?.[x]) || g[y][x - 1] || g[y][x + 1];
          if (n) {
            ctx.fillStyle = OUT;
            ctx.fillRect(ox + x, oy + y, 1, 1);
          }
        }
      }
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (!g[y][x]) continue;
          ctx.fillStyle = g[y][x];
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    }
  }
  cache.set(lookId, c);
  return c;
}

export const DIRS = { down: 0, up: 1, left: 2, right: 3 };
