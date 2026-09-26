// Draws the game at the arcade's native resolution: 8-pixel tiles, a 224 x 248
// maze, and 16-pixel sprites. main.js scales the canvas by whole pixels.
import { drawText, measureText } from './font.js';
import { CELLS, COLS, DOOR, POWER, ROWS, WALL } from './maze.js';
import { DEATH_ANIM, DEATH_PAUSE, DX, DY, FRUIT_POS, LEFT, UP, fruitFor, flashing } from './sim.js';

export const MW = COLS * 8;
export const MH = ROWS * 8;

const C = {
  bg: '#000000',
  wall: '#2121de',
  door: '#ffb8de',
  dot: '#ffb897',
  pac: '#ffff00',
  white: '#dedeff',
  text: '#dedeff',
  red: '#ff0000',
  cyan: '#00ffff',
  scared: '#2121de',
  scaredFace: '#ffb897',
};
export const GHOST_COLORS = { blinky: '#ff0000', pinky: '#ffb8ff', inky: '#00ffff', clyde: '#ffb851' };

const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// ------------------------------------------------------------------ maze art

/**
 * The walls are drawn as thin outlines set 4 pixels into the wall tiles. Each
 * wall pixel's distance to the nearest open pixel decides whether it is on
 * the line, which also rounds the corners the way the arcade maze does.
 */
function mazeArt(color) {
  const c = makeCanvas(MW, MH);
  const ctx = c.getContext('2d');
  const open = (px, py) => {
    if (px < 0 || py < 0 || px >= MW || py >= MH) return false;
    return CELLS[(py >> 3) * COLS + (px >> 3)] !== WALL;
  };
  ctx.fillStyle = color;
  const R = 5;
  for (let py = 0; py < MH; py++) {
    for (let px = 0; px < MW; px++) {
      if (open(px, py)) continue;
      let best = Infinity;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = dx * dx + dy * dy;
          if (d < best && open(px + dx, py + dy)) best = d;
        }
      }
      const d = Math.sqrt(best);
      if (d > 3.5 && d <= 4.5) ctx.fillRect(px, py, 1, 1);
    }
  }
  // The ghost house door.
  for (let x = 0; x < COLS; x++) {
    if (CELLS[12 * COLS + x] === DOOR) {
      ctx.fillStyle = C.door;
      ctx.fillRect(x * 8, 12 * 8 + 6, 8, 2);
    }
  }
  return c;
}

// ------------------------------------------------------------------ sprites

function paint(w, h, fn) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  fn((x, y, color, pw = 1, ph = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, pw, ph);
  });
  return c;
}

/** Pac-Man is a 13-pixel disc with a wedge cut out, facing dir. */
function pacSprite(dir, half) {
  const fx = DX[dir], fy = DY[dir];
  return paint(13, 13, (px) => {
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 13; x++) {
        const dx = x - 6, dy = y - 6;
        if (dx * dx + dy * dy > 42.5) continue;
        if (half > 0 && (dx || dy)) {
          const cos = (dx * fx + dy * fy) / Math.hypot(dx, dy);
          if (Math.acos(Math.max(-1, Math.min(1, cos))) < half) continue;
        }
        px(x, y, C.pac);
      }
    }
  });
}

const GHOST_BODY = [
  '.....####.....',
  '...########...',
  '..##########..',
  '.############.',
  '.############.',
  '.############.',
  '##############',
  '##############',
  '##############',
  '##############',
  '##############',
  '##############',
];
const SKIRTS = [
  ['##.###..###.##', '#...##..##...#'],
  ['####.####.####', '.##...##...##.'],
];
const EYE_WHITE = ['.##.', '####', '####', '####', '.##.'];

function ghostSprite(body, frame, dir, scared) {
  return paint(14, 14, (px) => {
    [...GHOST_BODY, ...SKIRTS[frame]].forEach((row, y) => {
      for (let x = 0; x < 14; x++) if (row[x] === '#') px(x, y, body);
    });
    if (scared) {
      for (const x of [4, 8]) px(x, 5, scared, 2, 2);
      for (const x of [2, 3, 6, 7, 10, 11]) px(x, 9, scared);
      for (const x of [1, 4, 5, 8, 9, 12]) px(x, 10, scared);
      return;
    }
    eyes(px, dir);
  });
}

function eyes(px, dir) {
  const ex = dir >= 0 ? DX[dir] : 0, ey = dir >= 0 ? DY[dir] : 0;
  for (const bx of [2, 8]) {
    const wx = bx + ex, wy = 3 + ey;
    EYE_WHITE.forEach((row, y) => {
      for (let x = 0; x < 4; x++) if (row[x] === '#') px(wx + x, wy + y, C.white);
    });
    px(wx + 1 + ex, wy + 2 + ey, C.scared, 2, 2);
  }
}

/** Small pixel-art fruit, 12 x 12. */
function fruitSprite(kind) {
  const disc = (px, cx, cy, r, color) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(x, y, color);
      }
    }
  };
  return paint(12, 12, (px) => {
    switch (kind) {
      case 'cherry':
        px(9, 0, '#de9751', 2, 1); px(8, 1, '#de9751'); px(7, 2, '#de9751'); px(6, 3, '#de9751');
        px(9, 1, '#de9751'); px(9, 2, '#de9751', 1, 3);
        px(5, 4, '#de9751'); px(4, 5, '#de9751');
        disc(px, 3, 8, 2.6, '#ff0000');
        disc(px, 8.5, 8.5, 2.6, '#ff0000');
        px(2, 7, C.white); px(7, 7, C.white);
        break;
      case 'strawberry':
        for (let y = 2; y < 11; y++) {
          const w = y < 5 ? 5 + (y - 2) * 1.5 : 10 - (y - 5) * 1.6;
          const x0 = Math.round(6 - w / 2);
          px(x0, y, '#ff0000', Math.max(1, Math.round(w)), 1);
        }
        for (const [x, y] of [[3, 4], [6, 4], [8, 5], [4, 6], [7, 7], [5, 8], [6, 9]]) px(x, y, C.white);
        px(3, 1, '#00de00', 6, 1); px(5, 0, '#00de00', 2, 1);
        break;
      case 'orange':
        disc(px, 5.5, 6.5, 4.6, '#ffb851');
        px(6, 0, '#de9751', 1, 2); px(7, 1, '#00de00', 3, 1); px(8, 0, '#00de00', 2, 1);
        break;
      case 'apple':
        disc(px, 5.5, 6.5, 4.6, '#ff0000');
        px(5, 1, '#de9751', 1, 2); px(6, 0, '#00de00', 3, 1);
        px(3, 4, C.white, 1, 2);
        break;
      case 'melon':
        disc(px, 5.5, 6, 5, '#00de00');
        for (const [x, y] of [[3, 3], [7, 3], [5, 5], [2, 7], [8, 7], [4, 9], [7, 9]]) px(x, y, '#006100', 1, 1);
        px(5, 0, '#de9751', 2, 1);
        break;
      case 'galaxian':
        px(5, 0, '#ff0000', 2, 3);
        px(4, 3, '#ffff00', 4, 4);
        px(1, 3, '#2121de', 2, 5); px(9, 3, '#2121de', 2, 5);
        px(3, 5, '#2121de', 1, 3); px(8, 5, '#2121de', 1, 3);
        px(5, 7, '#ffff00', 2, 3);
        break;
      case 'bell':
        disc(px, 5.5, 4.5, 3.6, '#ffff00');
        px(2, 5, '#ffff00', 8, 4); px(1, 8, '#ffff00', 10, 1);
        px(5, 9, '#00ffff', 2, 2);
        px(3, 3, C.white, 1, 3);
        break;
      default: // key
        px(3, 0, '#00ffff', 6, 1); px(2, 1, '#00ffff', 1, 3); px(9, 1, '#00ffff', 1, 3); px(3, 4, '#00ffff', 6, 1);
        px(4, 2, '#00ffff', 4, 1);
        px(5, 5, C.white, 2, 7); px(7, 7, C.white, 2, 1); px(7, 10, C.white, 2, 1);
    }
  });
}

// ------------------------------------------------------------------ renderer

export class Renderer {
  constructor() {
    this.W = 0;
    this.H = 0;
    this.walls = mazeArt(C.wall);
    this.wallsWhite = mazeArt(C.white);
    this.pac = [0, 1, 2, 3].map((d) => [0, 0.5, 0.95].map((a) => pacSprite(d, a)));
    this.dying = Array.from({ length: 12 }, (_, i) => pacSprite(UP, 0.2 + (i / 11) * (Math.PI - 0.2)));
    this.ghosts = {};
    for (const [name, color] of Object.entries(GHOST_COLORS)) {
      this.ghosts[name] = [0, 1].map((f) => [0, 1, 2, 3].map((d) => ghostSprite(color, f, d, null)));
    }
    this.scared = [0, 1].map((f) => ghostSprite(C.scared, f, -1, C.scaredFace));
    this.flash = [0, 1].map((f) => ghostSprite(C.white, f, -1, C.red));
    this.eyes = [0, 1, 2, 3].map((d) => paint(14, 14, (px) => eyes(px, d)));
    this.fruits = {};
    for (const kind of ['cherry', 'strawberry', 'orange', 'apple', 'melon', 'galaxian', 'bell', 'key']) this.fruits[kind] = fruitSprite(kind);
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    // Landscape screens put the scores beside the maze; portrait ones above and below it.
    this.wide = W >= MW + 136 && W / H >= 1.2;
    if (this.wide) {
      this.ox = Math.floor((W - MW) / 2);
      this.oy = Math.max(0, Math.floor((H - MH) / 2));
    } else {
      this.ox = Math.floor((W - MW) / 2);
      this.oy = Math.max(24, Math.floor((H - MH - 40) / 2) + 24);
    }
  }

  /** Canvas pixel for a position in tiles. */
  toPx(x, y) {
    return { x: this.ox + Math.round(x * 8), y: this.oy + Math.round(y * 8) };
  }

  sprite(ctx, img, x, y) {
    const p = this.toPx(x, y);
    const w = img.width, h = img.height;
    const sx = p.x - (w >> 1), sy = p.y - (h >> 1);
    ctx.drawImage(img, sx, sy);
    // Things half way through the tunnel show on both sides.
    if (x < 1.5) ctx.drawImage(img, sx + MW, sy);
    else if (x > COLS - 1.5) ctx.drawImage(img, sx - MW, sy);
  }

  /**
   * view: { mode: 'title' | 'play', high, reducedMotion, time }
   */
  draw(ctx, g, view) {
    const { W, H, ox, oy } = this;
    const time = view.time;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Walls, flashing white at the end of a level.
    let walls = this.walls;
    if (g.phase === 'clear' && g.phaseT > 1 && !view.reducedMotion) walls = Math.floor((g.phaseT - 1) / 0.22) % 2 ? this.walls : this.wallsWhite;
    ctx.drawImage(walls, ox, oy);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, MW, MH);
    ctx.clip();

    // Dots and energizers.
    const blinkOn = view.reducedMotion || g.phase !== 'play' || Math.floor(time / 0.2) % 2 === 0;
    ctx.fillStyle = C.dot;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const d = g.dots[ty * COLS + tx];
        if (!d) continue;
        const x = ox + tx * 8, y = oy + ty * 8;
        if (d === POWER) {
          if (!blinkOn) continue;
          ctx.fillRect(x + 1, y + 2, 6, 4);
          ctx.fillRect(x + 2, y + 1, 4, 6);
        } else {
          ctx.fillRect(x + 3, y + 3, 2, 2);
        }
      }
    }

    if (g.fruit && g.phase === 'play') this.sprite(ctx, this.fruits[g.fruit.kind], FRUIT_POS.x, FRUIT_POS.y);

    this.drawActors(ctx, g, view);

    for (const pop of g.popups) this.label(ctx, pop.text, pop.x, pop.y, C.door);
    if (g.eaten) this.label(ctx, String(g.eaten.points), g.eaten.x, g.eaten.y, C.cyan);

    if (view.mode === 'title') {
      if (Math.floor(time / 0.6) % 2 === 0 || view.reducedMotion) this.label(ctx, 'PRESS START', 14, 17.5, C.pac);
    } else if (g.phase === 'ready') {
      this.label(ctx, 'READY!', 14, 17.5, C.pac);
    } else if (g.phase === 'over') {
      this.label(ctx, 'GAME  OVER', 14, 17.5, C.red);
    }
    ctx.restore();

    this.drawHud(ctx, g, view);
  }

  drawActors(ctx, g, view) {
    const hideGhosts = (g.phase === 'dying' && g.phaseT >= DEATH_PAUSE) || g.phase === 'clear' || g.phase === 'over';
    // Pac-Man.
    const p = g.pac;
    if (g.phase === 'dying' && g.phaseT >= DEATH_PAUSE) {
      const k = (g.phaseT - DEATH_PAUSE) / DEATH_ANIM;
      if (k < 1) this.sprite(ctx, this.dying[Math.min(11, Math.floor(k * 12))], p.x, p.y);
      else if (k < 1.25) this.pop(ctx, p.x, p.y, (k - 1) / 0.25);
    } else if (g.phase !== 'over' && !g.eaten) {
      let frame = [0, 1, 2, 1][Math.floor(p.chomp * 4) % 4];
      if (g.phase === 'ready' || g.phase === 'clear') frame = 0;
      else if (!p.moving && frame === 0) frame = 1;
      this.sprite(ctx, this.pac[p.dir < 0 ? LEFT : p.dir][frame], p.x, p.y);
    }
    if (hideGhosts) return;
    const flash = flashing(g);
    for (const gh of g.ghosts) {
      if (g.eaten && g.eaten.ghost === gh.i) continue;
      const frame = Math.floor(gh.anim * 2.5) % 2;
      let img;
      if (gh.state === 'eyes' || gh.state === 'entering') img = this.eyes[gh.dir < 0 ? UP : gh.dir];
      else if (gh.fright) img = flash ? this.flash[frame] : this.scared[frame];
      else img = this.ghosts[gh.name][frame][gh.dir < 0 ? LEFT : gh.dir];
      this.sprite(ctx, img, gh.x, gh.y);
    }
  }

  /** The little burst at the end of the death animation. */
  pop(ctx, x, y, k) {
    const c = this.toPx(x, y);
    ctx.fillStyle = C.pac;
    const r = 2 + Math.round(k * 4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.fillRect(c.x + Math.round(Math.cos(a) * r), c.y + Math.round(Math.sin(a) * r), 1, 2);
    }
  }

  label(ctx, text, x, y, color) {
    const p = this.toPx(x, y);
    drawText(ctx, text, p.x - (measureText(text) >> 1), p.y - 2, color);
  }

  drawHud(ctx, g, view) {
    const { ox, oy } = this;
    const score = String(g.score).padStart(2, '0');
    // The attract demo's score never counts towards the high score.
    const high = String(view.mode === 'title' ? view.high : Math.max(view.high, g.score)).padStart(2, '0');
    const oneUp = view.mode === 'title' || Math.floor(view.time / 0.27) % 2 === 0 || view.reducedMotion;
    const lives = view.mode === 'title' ? 0 : Math.max(0, g.lives - (g.phase === 'dying' || g.phase === 'over' ? 0 : 1));
    const fruits = [];
    for (let l = Math.max(1, g.level - 6); l <= g.level; l++) fruits.push(fruitFor(l).kind);

    if (this.wide) {
      const lx = Math.max(4, ox - 8 - 84);
      let y = oy + 8;
      if (view.mode === 'title') {
        drawText(ctx, 'PAC-MAN', lx, y, C.pac, 2);
        y += 22;
      }
      if (oneUp) drawText(ctx, '1UP', lx, y, C.text);
      drawText(ctx, score, lx, y + 9, C.text);
      drawText(ctx, 'HIGH SCORE', lx, y + 26, C.text);
      drawText(ctx, high, lx, y + 35, C.text);
      if (view.mode !== 'title') drawText(ctx, `LEVEL ${g.level}`, lx, y + 52, C.text);
      const rx = ox + MW + 10;
      for (let i = 0; i < Math.min(lives, 5); i++) ctx.drawImage(this.pac[LEFT][1], rx + i * 16, oy + 8);
      fruits.forEach((kind, i) => ctx.drawImage(this.fruits[kind], rx + (i % 4) * 16, oy + MH - 16 - Math.floor(i / 4) * 16));
      return;
    }

    const ty = oy - 22;
    if (view.mode === 'title') {
      drawText(ctx, 'PAC-MAN', ox + 8, ty + 2, C.pac, 2);
      drawText(ctx, 'HIGH SCORE', ox + MW - 8 - measureText('HIGH SCORE'), ty, C.text);
      drawText(ctx, high, ox + MW - 8 - measureText(high), ty + 9, C.text);
    } else {
      if (oneUp) drawText(ctx, '1UP', ox + 24, ty, C.text);
      drawText(ctx, score, ox + 42 - measureText(score), ty + 9, C.text);
      drawText(ctx, 'HIGH SCORE', ox + (MW >> 1) - (measureText('HIGH SCORE') >> 1), ty, C.text);
      drawText(ctx, high, ox + (MW >> 1) + 16 - measureText(high), ty + 9, C.text);
    }
    const by = oy + MH + 2;
    for (let i = 0; i < Math.min(lives, 5); i++) ctx.drawImage(this.pac[LEFT][1], ox + 16 + i * 16, by);
    fruits.forEach((kind, i) => ctx.drawImage(this.fruits[kind], ox + MW - 28 - i * 16, by));
  }
}
