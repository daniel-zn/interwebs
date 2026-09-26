import { SoundEngine } from './audio.js';
import { CHARM_BY_ID, COLS, DAYS, PATTERNS, ROWS, SYMBOLS, SYMBOL_BY_ID, VOID, debtFor } from './data.js';
import { COLORS as C, CELL, LINE_COLORS, RX, RY, Renderer, fmt } from './render.js';
import {
  buy, choosePackage, createRun, finishDay, goEndless, payDebt, pickOffer, reroll, sell, snapshot, spin,
} from './sim.js';
import { loadStore } from './storage.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SPEED = params.has('fast') ? 3 : 1;
let seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Date.now() ^ (Math.random() * 1e9)) >>> 0;

const store = loadStore();
if (store.settings.reducedMotion === null) {
  store.settings.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const hint = document.getElementById('hint');
const srAlert = document.getElementById('sr-alert');
const audio = new SoundEngine();
audio.setMuted(store.settings.muted);
audio.setMusic(store.settings.music);
const renderer = new Renderer();
const touchFirst = matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- state
let mode = 'title'; // 'title' | 'run'
let run = null;
let clock = 0;
let regions = [];
let forcedGrid = null; // tests can pick the next grid
const perf = { frames: 0, worst: 0 };

const randomSym = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id;
const v = {
  time: 0, run: null, reels: [], led: 0, ledHot: false, bulbs: 'idle', hot: null, hotRows: null, hotLine: null,
  hotColor: null, banner: null, popups: [], particles: [], flash: 0, flashColor: '#fff', shake: 0, lever: 0,
  canSpin: false, buttonDown: 0, shownCoins: 0, shownTickets: 0, shownSpins: null, panel: null, panelT0: 0,
  focus: null, hover: null, sellArm: -1, swallow: 0, hunger: 1, voidPulse: false, best: store.best, newBest: false,
  nextDebt: 0, reducedMotion: false, charmPulse: {},
  // Win heat: 0 calm .. ~1.4 jackpot. Drives the jiggle, rays, strobe and music.
  heat: 0,
  // The machine's springy wobble: tilt (a), hop (y), sway (x), squash (s) and their velocities.
  jig: { a: 0, y: 0, x: 0, s: 0, va: 0, vy: 0, vx: 0, vs: 0 },
  shooters: [],
};
for (let c = 0; c < COLS; c++) v.reels.push({ strip: [randomSym(), randomSym(), randomSym()], pos: 0, stopped: true, bounce: 0, speed: 0 });

const fast = () => store.settings.fast;
const D = (s) => s * (fast() ? 0.5 : 1);

// ---------------------------------------------------------------- sequencing
// Timed steps for the reveal and transitions. Skipping runs `settle` at once.
let tasks = [];
let settle = null;
const later = (delay, fn) => tasks.push({ at: clock + delay, fn });
function runTasks() {
  tasks.sort((a, b) => a.at - b.at);
  while (tasks.length && tasks[0].at <= clock) tasks.shift().fn();
}
function skipAll() {
  tasks = [];
  const s = settle;
  settle = null;
  if (s) s();
}

// ---------------------------------------------------------------- sizing
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = Math.round(window.innerWidth * dpr), vh = Math.round(window.innerHeight * dpr);
  const fit = (w, h) => Math.floor(Math.min(vw / w, vh / h));
  // Landscape fits a 400 x 226 layout; portrait only needs the machine's width,
  // so phones get the biggest machine that fits edge to edge.
  scale = Math.max(1, fit(400, 226), fit(192, 360));
  const W = Math.ceil(vw / scale), H = Math.ceil(vh / scale);
  if (W === canvas.width && H === canvas.height && renderer.W) return;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${(W * scale) / dpr}px`;
  canvas.style.height = `${(H * scale) / dpr}px`;
  ctx.imageSmoothingEnabled = false;
  renderer.resize(W, H);
}
let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    resize();
  });
});
resize();

// ---------------------------------------------------------------- ui helpers
function setHint(text, cls = '') {
  hint.textContent = text;
  hint.className = `hint ${text ? cls : 'empty'}`;
}
function alertSr(text) {
  srAlert.textContent = '';
  setTimeout(() => {
    srAlert.textContent = text;
  }, 30);
}
function applyMotion() {
  v.reducedMotion = !!store.settings.reducedMotion;
  document.documentElement.classList.toggle('reduced-motion', v.reducedMotion);
}
applyMotion();
const soundBtn = document.getElementById('btn-sound');
function syncSound() {
  soundBtn.dataset.on = String(!store.settings.muted);
  soundBtn.setAttribute('aria-pressed', String(!store.settings.muted));
}
syncSound();

function banner(text, opts = {}) {
  v.banner = { text, t0: clock, ...opts };
  if (opts.hold !== false) {
    const b = v.banner;
    later(opts.dur || D(1.1), () => {
      if (v.banner === b) v.banner = null;
    });
  }
}
function popup(text, x, y, color = C.gold, scale = 1) {
  const p = { text, x, y, t0: clock, color, scale };
  v.popups.push(p);
}
function flash(amount, color = '#fff') {
  if (v.reducedMotion) return;
  v.flash = amount;
  v.flashColor = color;
}
function shake(n) {
  if (!v.reducedMotion) v.shake = Math.max(v.shake, n);
}
/** Kicks the machine: it tilts, hops and squashes, more the harder you hit it. */
function kick(power, sound = true) {
  if (v.reducedMotion) return;
  const j = v.jig;
  const dir = Math.random() < 0.5 ? -1 : 1;
  j.va += dir * power * 1.1;
  j.vy -= power * 80;
  j.vx += dir * power * 25;
  j.vs += power * 1.2;
  if (sound) audio.play('kick', Math.min(1, power));
}
function heatTo(h) {
  v.heat = Math.max(v.heat, h);
}
/** Springs pull the machine back upright; heat keeps it dancing. */
function updateJig(dt) {
  const j = v.jig;
  if (v.reducedMotion) {
    Object.assign(j, { a: 0, y: 0, x: 0, s: 0, va: 0, vy: 0, vx: 0, vs: 0 });
    return;
  }
  const h = v.heat;
  const t = clock;
  // A continuous boogie that grows with heat.
  const aim = {
    a: h * 0.05 * Math.sin(t * (7 + h * 9)),
    y: -Math.abs(Math.sin(t * (4.5 + h * 5))) * h * 7,
    x: h * 3 * Math.sin(t * (3.5 + h * 6) + 1),
    s: h * 0.035 * Math.sin(t * (9 + h * 9) + 2),
  };
  // Teasing: the machine trembles.
  if (v.bulbs === 'tease') {
    aim.x += (Math.random() - 0.5) * 2;
    aim.a += (Math.random() - 0.5) * 0.02;
  }
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const d = dt / n;
  for (let i = 0; i < n; i++) {
    for (const [k, stiff, damp] of [['a', 260, 9], ['y', 320, 11], ['x', 200, 10], ['s', 420, 10]]) {
      const vk = `v${k}`;
      j[vk] += (-(j[k] - aim[k]) * stiff - j[vk] * damp) * d;
      j[k] += j[vk] * d;
    }
  }
  j.a = Math.max(-0.2, Math.min(0.2, j.a));
  j.x = Math.max(-6, Math.min(6, j.x));
  j.y = Math.max(-18, Math.min(8, j.y));
  j.s = Math.max(-0.25, Math.min(0.25, j.s));
}
function save() {
  if (mode !== 'run' || !run) return;
  store.run = run.phase === 'over' ? null : run;
  store.save();
}

function titleHint() {
  const cont = !!store.run;
  if (touchFirst) setHint(cont ? 'Tap the machine to continue your run' : 'Tap the machine to play', 'title');
  else setHint(cont ? 'Press Enter to continue your run' : 'Press Enter or pull the lever to play', 'title');
}
function spinHint() {
  if (run && run.stats.spins < 2) setHint(touchFirst ? 'Tap the machine to spin' : 'Space or the lever spins');
  else setHint('');
}

// Screen positions of things on the machine.
const machineAt = () => renderer.mOff || { x: renderer.L.mx, y: renderer.L.my };
function cellCenter(c, r) {
  const m = machineAt();
  return { x: m.x + RX + c * (CELL + 2) + CELL / 2, y: m.y + RY + r * CELL + CELL / 2 };
}
const trayAt = () => {
  const m = machineAt();
  return { x: m.x + 100, y: m.y + 178 };
};

// ---------------------------------------------------------------- particles
function coinTo(from, to, delay, onArrive) {
  const mid = { x: (from.x + to.x) / 2 + (Math.random() - 0.5) * 60, y: Math.min(from.y, to.y) - 30 - Math.random() * 40 };
  v.particles.push({ kind: 'coin', path: [from, mid, to], t0: clock + delay, dur: 0.55 + Math.random() * 0.25, x: from.x, y: from.y, seed: Math.random(), life: 0, onArrive, hidden: true });
}
function spray(x, y, n, kinds = ['spark'], colors = [C.gold, '#fff', C.pink, C.cyan]) {
  if (v.reducedMotion) n = Math.ceil(n / 4);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 110;
    v.particles.push({
      kind: kinds[i % kinds.length], x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 160, life: 0,
      max: 0.7 + Math.random() * 0.9, color: colors[i % colors.length], size: Math.random() < 0.3 ? 2 : 1, seed: Math.random(),
    });
  }
}
function fireworks(n) {
  const { W, H } = renderer;
  for (let i = 0; i < n; i++) {
    later(i * 0.25, () => {
      const x = 20 + Math.random() * (W - 40), y = 20 + Math.random() * (H * 0.5);
      const hue = Math.floor(Math.random() * 360);
      spray(x, y, 26, ['star', 'spark'], [`hsl(${hue} 100% 65%)`, '#fff', `hsl(${hue + 40} 100% 70%)`]);
      audio.play('firework');
    });
  }
}
/** Coins pour down from the top of the screen. */
function coinRain(n) {
  if (v.reducedMotion) n = Math.ceil(n / 5);
  const { W } = renderer;
  for (let i = 0; i < n; i++) {
    v.particles.push({
      kind: 'coin', x: Math.random() * W, y: -10 - Math.random() * 120, vx: (Math.random() - 0.5) * 30, vy: 40 + Math.random() * 60,
      g: 140, life: 0, max: 2.6, seed: Math.random(),
    });
  }
}
function updateShooters() {
  v.shooters = v.shooters.filter((s) => clock - s.t0 < s.dur);
  if (v.reducedMotion) return;
  const rate = 0.12 + v.heat * 1.5;
  if (Math.random() < rate / 60) {
    const { W, H } = renderer;
    const len = 60 + Math.random() * 80;
    const ang = Math.PI * (0.15 + Math.random() * 0.2) * (Math.random() < 0.5 ? 1 : -1);
    const x = Math.random() * W, y = Math.random() * H * 0.5;
    const dx = Math.cos(ang) * len * (ang < 0 ? -1 : 1), dy = Math.abs(Math.sin(ang)) * len;
    v.shooters.push({ x, y, dx, dy, len, t0: clock, dur: 0.5 + Math.random() * 0.4 });
    if (mode === 'run') audio.play('shoot');
  }
}

function updateParticles(dt) {
  for (const p of v.particles) {
    if (p.path) {
      const k = (clock - p.t0) / p.dur;
      p.hidden = k < 0;
      if (k < 0) continue;
      const t = Math.min(1, k);
      const [a, b, c] = p.path;
      const u = 1 - t;
      p.x = u * u * a.x + 2 * u * t * b.x + t * t * c.x;
      p.y = u * u * a.y + 2 * u * t * b.y + t * t * c.y;
      p.life = t;
      if (k >= 1) {
        p.dead = true;
        if (p.onArrive) p.onArrive();
      }
    } else {
      p.life += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life > p.max) p.dead = true;
    }
  }
  v.particles = v.particles.filter((p) => !p.dead);
  v.popups = v.popups.filter((p) => clock - p.t0 < 1.1);
}

// ---------------------------------------------------------------- flow
function startRun(resume = false) {
  audio.unlock();
  mode = 'run';
  if (resume && store.run) {
    run = store.run;
  } else {
    run = createRun({ seed: seed++ });
    store.run = run;
    store.save();
  }
  v.run = run;
  v.shownCoins = run.coins;
  v.shownTickets = run.tickets;
  v.shownSpins = null;
  v.newBest = false;
  v.swallow = 0;
  v.led = 0;
  tasks = [];
  settle = null;
  clearHot();
  v.banner = null;
  audio.play('lever');
  pullLever();
  alertSr(resume ? `Run resumed. Round ${run.round}, day ${run.day}.` : `New run. The black hole wants ${run.debt} coins in ${DAYS} days.`);
  resumePhase();
}

/** Puts the screen in the right state for the run's phase. */
function resumePhase() {
  switch (run.phase) {
    case 'shop':
      openPanel('shop');
      break;
    case 'spin':
      closePanel();
      spinHint();
      break;
    case 'dayEnd':
      endDay();
      break;
    case 'deadline':
      openPanel('deadline');
      break;
    case 'transmit':
      openPanel('transmit');
      break;
    case 'won':
      openPanel('won');
      break;
    default:
      toTitle();
  }
}

function toTitle() {
  mode = 'title';
  run = null;
  v.run = null;
  v.panel = null;
  v.swallow = 0;
  v.banner = null;
  v.led = 0;
  tasks = [];
  settle = null;
  clearHot();
  titleHint();
}

const PANEL_FOCUS = { shop: 'shop:0', deadline: 'pay', transmit: 'offer:0', over: 'newrun', won: 'endless' };
function openPanel(name) {
  if (name !== 'transmit') audio.play('open');
  v.panel = name;
  v.panelT0 = clock;
  v.focus = PANEL_FOCUS[name];
  v.hover = null;
  v.sellArm = -1;
  if (name === 'transmit') v.nextDebt = debtFor(run.round + 1);
  if (name === 'shop') {
    setHint(run.round === 1 && run.day === 1 ? (touchFirst ? 'Tap a charm to buy it, then pick a deal' : 'Arrows + Enter to buy charms, then pick a deal') : '');
    alertSr(`Pit stop, day ${run.day} of ${DAYS}. You have ${run.tickets} tickets and ${run.coins} coins. Debt ${run.debt}. For sale: ${run.shop.filter(Boolean).map((id) => `${CHARM_BY_ID[id].name}, ${CHARM_BY_ID[id].price} tickets`).join('; ')}.`);
  } else setHint('');
  if (name === 'transmit') {
    audio.play('transmit');
    alertSr(`Transmission. Choose a gift: ${run.offers.map((o, i) => `${i + 1}: ${o.text}`).join('. ')}.`);
  }
  if (name === 'deadline') alertSr(`Deadline. The hole wants ${run.debt} coins. You have ${run.coins}.`);
}
function closePanel() {
  v.panel = null;
  v.focus = null;
  v.sellArm = -1;
}

function clearHot() {
  v.hot = null;
  v.hotRows = null;
  v.hotLine = null;
  v.hotColor = null;
  v.ledHot = false;
  v.voidPulse = false;
}

function pullLever() {
  const t0 = clock;
  v.leverAnim = t0;
}

// ---------------------------------------------------------------- spinning
let spinning = false;
let lastTick = 0;
let lastHeart = 0;

function canSpinNow() {
  return mode === 'run' && run && run.phase === 'spin' && !v.panel && !spinning && !settle;
}

function doSpin() {
  if (mode !== 'run' || !run || v.panel) return;
  if (settle && !spinning) skipAll();
  if (!canSpinNow()) return;
  audio.unlock();
  const result = spin(run, forcedGrid);
  forcedGrid = null;
  save();
  spinning = true;
  clearHot();
  v.banner = null;
  v.led = 0;
  v.shownSpins = run.spinsLeft - (result.free ? 1 : 0);
  v.bulbs = 'spin';
  v.buttonDown = 0.15;
  pullLever();
  audio.play('lever');
  audio.play('button');
  later(0.1, () => audio.play('spinStart'));
  kick(0.15, false);
  setHint('');

  // Tease: slow the last reels down when something big might land.
  const g = result.grid;
  let teaseFrom = 99, teaseColor = C.gold;
  for (const c of [3, 4]) {
    const shown = g.slice(0, c);
    const flat = shown.flat();
    const sevens = flat.filter((s) => s === 'seven').length;
    const voids = flat.filter((s) => s === VOID).length;
    const rowHot = [0, 1, 2].some((r) => shown.every((col) => col[r] === shown[0][r] && col[r] !== VOID));
    if (voids >= 2) {
      teaseFrom = c;
      teaseColor = C.red;
      break;
    }
    if (rowHot || sevens >= 3) {
      teaseFrom = c;
      break;
    }
  }
  if (v.reducedMotion) teaseFrom = Math.min(teaseFrom, 99);
  v.teaseColor = teaseColor;
  let extra = 0;
  for (let c = 0; c < COLS; c++) {
    const reel = v.reels[c];
    const tease = c >= teaseFrom;
    if (tease) extra += D(0.75);
    const dur = D(0.55 + c * 0.2) + extra;
    const fill = Math.round(dur * 16) + 4;
    const old = reel.strip.slice(Math.floor(reel.pos), Math.floor(reel.pos) + 3);
    const fillers = [];
    for (let i = 0; i < fill; i++) fillers.push(Math.random() < 0.06 ? VOID : randomSym());
    reel.strip = [...g[c], ...fillers, ...old];
    reel.n = 3 + fill;
    reel.pos = reel.n;
    reel.t0 = clock;
    reel.dur = dur;
    reel.stopped = false;
    reel.tease = tease;
  }
  v.pending = result;
}

function updateReels(dt) {
  let moving = 0;
  let anyTease = false;
  let teaseK = 0;
  for (let c = 0; c < COLS; c++) {
    const reel = v.reels[c];
    const bt = clock - (reel.stopT ?? -9);
    reel.bounce = bt < 0.45 && !v.reducedMotion ? 3 * Math.exp(-bt * 9) * Math.cos(bt * 32) : 0;
    if (reel.stopped) {
      reel.speed = 0;
      continue;
    }
    const k = (clock - reel.t0) / reel.dur;
    if (k >= 1) {
      reel.pos = 0;
      reel.stopped = true;
      reel.speed = 0;
      reel.stopT = clock;
      if (mode !== 'run' || !v.pending) continue;
      if (reel.tease) {
        audio.play('bigstop');
        kick(0.35, false);
        shake(2);
      } else {
        audio.play('stop', c);
        kick(0.05 + c * 0.02, false);
      }
      const voids = v.pending.grid[c].filter((s) => s === VOID).length;
      if (voids) {
        audio.play('voidland');
        v.voidPulse = true;
        later(0.3, () => {
          if (!settle) v.voidPulse = false;
        });
      }
      continue;
    }
    moving++;
    const e = (1 - k) ** 3;
    const prev = reel.pos;
    reel.pos = reel.n * e;
    reel.speed = (3 * reel.n * (1 - k) ** 2) / reel.dur;
    if (mode === 'run' && Math.floor(prev) !== Math.floor(reel.pos) && clock - lastTick > 0.045) {
      lastTick = clock;
      audio.play('tick');
    }
    if (reel.tease) {
      const allBefore = v.reels.slice(0, c).every((r) => r.stopped);
      if (allBefore) {
        anyTease = true;
        teaseK = Math.max(teaseK, k);
      }
    }
  }
  audio.setTease(anyTease, teaseK);
  const speedSum = v.reels.reduce((a, r) => a + (r.stopped ? 0 : Math.min(1, (r.speed || 0) / 30)), 0);
  audio.setMotor(mode === 'run' ? speedSum / COLS : 0);
  if (anyTease && clock - lastHeart > 0.5 - teaseK * 0.25) {
    lastHeart = clock;
    audio.play('heart');
  }
  if (anyTease) v.bulbs = 'tease';
  if (spinning && moving === 0) {
    spinning = false;
    audio.setTease(false);
    reveal(v.pending);
  }
}

// ---------------------------------------------------------------- reveal
function reveal(res) {
  const lines = [...res.lines].sort((a, b) => a.pay - b.pay);
  const debt = run.debt;
  let at = 0.05;
  const finalCoins = run.coins;
  const finalTickets = run.tickets;
  const finalSpins = run.spinsLeft;

  settle = () => {
    clearHot();
    v.led = res.voided ? 0 : res.total;
    v.shownCoins = finalCoins;
    v.shownTickets = finalTickets;
    v.shownSpins = finalSpins;
    v.bulbs = 'idle';
    v.particles = v.particles.filter((p) => !p.path);
    settle = null;
    afterSpin();
  };

  if (res.voided) {
    const cells = [];
    res.grid.forEach((col, c) => col.forEach((s, r) => s === VOID && cells.push(`${c},${r}`)));
    v.hot = new Set(cells);
    v.hotColor = C.red;
    v.bulbs = 'void';
    v.voidPulse = true;
    audio.play('void');
    shake(5);
    kick(0.9, false);
    heatTo(0.1);
    flash(0.6, '#ff3b4e');
    banner('THE VOID FEEDS', { color: C.red, sub: res.bite ? `-${fmt(res.bite)} COINS` : 'BUT YOU HAD NOTHING', subColor: C.red, dur: D(1.8), scale: 2 });
    v.hunger = 1.35;
    const from = renderer.coinTarget();
    const bh = renderer.L.bh;
    const n = Math.min(20, Math.ceil(Math.log2(res.bite + 1) * 2));
    for (let i = 0; i < n; i++) coinTo(from, bh, i * 0.05, null);
    later(0.2, () => (v.shownCoins = finalCoins));
    alertSr(`Three Void Eyes! The void eats ${res.bite} coins. You have ${finalCoins}.`);
    later(D(2.0), () => settle && settle());
    return;
  }

  const step = D(Math.max(0.14, 0.55 - lines.length * 0.04));
  let running = 0;
  lines.forEach((l, i) => {
    later(at, () => {
      v.hot = new Set(l.cells.map(([c, r]) => `${c},${r}`));
      v.hotRows = new Set(l.kind.startsWith('row') ? [l.row] : []);
      v.hotLine = l;
      v.hotColor = LINE_COLORS[l.kind];
      v.bulbs = l.kind === 'jackpot' ? 'jackpot' : 'win';
      running += l.pay;
      v.led = running;
      v.ledHot = true;
      audio.play('line', i);
      audio.play('sym', l.sym);
      // Every line heats things up; bigger totals (against the debt) heat faster.
      const share = (running * Math.max(1, res.mult)) / Math.max(20, debt);
      heatTo(Math.min(1.25, 0.12 + i * 0.07 + share * 0.6));
      kick(0.18 + v.heat * 0.5, i % 2 === 0);
      if (i >= 3) shake(Math.min(4, 1 + i * 0.3));
      const mid = l.cells[Math.floor(l.cells.length / 2)];
      const p = cellCenter(mid[0], mid[1]);
      popup(`${l.value}X${l.mult}`, p.x, p.y - 14, LINE_COLORS[l.kind]);
      if (l.kind === 'jackpot') {
        banner('JACKPOT', { rainbow: true, scale: 4, dur: D(2.4) });
        audio.play('jackpot');
        audio.play('siren', 6);
        flash(0.65);
        shake(8);
        heatTo(1.45);
        kick(1.4);
        fireworks(14);
        coinRain(90);
      }
      for (const [c, r] of l.cells) {
        const q = cellCenter(c, r);
        spray(q.x, q.y, 3, ['spark'], [LINE_COLORS[l.kind], '#fff']);
      }
    });
    at += step;
  });

  if (lines.length || res.horizon || res.total > 0) {
    // Multipliers and extras.
    const tags = [...res.tags];
    if (Math.abs(res.mult - 1) > 1e-9 && res.base > 0) tags.unshift(`X${+res.mult.toFixed(2)}`);
    tags.forEach((tag) => {
      later(at, () => {
        banner(tag, { color: tag === 'EVENT HORIZON' ? C.pink : C.orange, scale: 2, dur: step * 1.8 });
        audio.play('mult');
        if (!tag.startsWith('X')) audio.play('charm');
        heatTo(v.heat + 0.15);
        kick(0.3 + v.heat * 0.4);
        v.led = tag === 'TIP JAR' || tag === 'EVENT HORIZON' ? res.total : Math.round(res.base * res.mult);
        v.ledHot = true;
      });
      at += Math.max(step, D(0.4));
    });
    later(at, () => {
      clearHot();
      v.led = res.total;
      v.ledHot = true;
      const big = res.total >= Math.max(40, debt * 0.5);
      const mega = res.total >= Math.max(150, debt * 1.5);
      v.bulbs = res.jackpot ? 'jackpot' : 'win';
      if (res.jackpot) {
        // Already celebrated.
      } else if (mega) {
        banner('MEGA WIN', { rainbow: true, scale: 3, dur: D(1.8), sub: `+${fmt(res.total)}` });
        audio.play('megawin');
        audio.play('siren', 4);
        flash(0.7);
        shake(6);
        heatTo(1.15);
        kick(1.1);
        fireworks(8);
        coinRain(50);
      } else if (big) {
        banner('BIG WIN', { color: C.gold, scale: 3, dur: D(1.4), sub: `+${fmt(res.total)}` });
        audio.play('bigwin');
        audio.play('siren', 2);
        flash(0.35);
        shake(3);
        heatTo(0.8);
        kick(0.8);
        coinRain(18);
      } else {
        kick(0.25 + v.heat * 0.3);
      }
      audio.play('shower', mega || res.jackpot ? 2 : big ? 1 : 0);
      // Coins fly from the tray to the counter.
      const n = Math.min(res.jackpot ? 60 : 36, Math.max(1, Math.ceil(Math.log2(res.total + 1) * 2.4)));
      const from = trayAt();
      const to = renderer.coinTarget();
      const start = v.shownCoins;
      let got = 0;
      for (let i = 0; i < n; i++) {
        coinTo({ x: from.x + (Math.random() - 0.5) * 60, y: from.y }, to, i * 0.035, () => {
          got++;
          v.shownCoins = Math.round(start + ((finalCoins - start) * got) / n);
          if (got % 2 === 1) audio.play('coin');
          else audio.play('count', got);
        });
      }
      if (big || mega || res.jackpot) spray(from.x, from.y - 10, big && !mega ? 30 : 70, ['coin', 'spark'], [C.gold]);
      alertSr(`${res.lines.map((l) => `${PATTERNS[l.kind].name} of ${SYMBOL_BY_ID[l.sym].name}s`).join(', ')}${res.lines.length ? '. ' : ''}${res.tags.join(', ')}${res.tags.length ? '. ' : ''}Won ${res.total}. ${finalCoins} coins.`);
    });
    at += D(0.9) + (res.total >= Math.max(40, debt * 0.5) ? D(0.8) : 0) + (res.jackpot ? D(1.5) : 0);
  } else {
    later(0.05, () => audio.play('lose'));
    alertSr(`No match.${run.spinsLeft ? ` ${run.spinsLeft} spins left.` : ''}`);
    at += D(0.25);
  }
  if (res.free) {
    later(at, () => {
      banner('FREE SPIN', { color: '#b35cff', scale: 2, sub: 'WORMHOLE', dur: D(1) });
      audio.play('free');
      kick(0.4);
      v.shownSpins = finalSpins;
    });
    at += D(0.7);
  }
  later(at, () => settle && settle());
}

function afterSpin() {
  save();
  if (run.phase === 'dayEnd') {
    later(D(0.5), endDay);
  } else {
    spinHint();
  }
}

function endDay() {
  const out = finishDay(run);
  save();
  if (!out) return;
  const b = { text: run.phase === 'deadline' ? 'LAST DAY OVER' : `DAY ${run.day - 1} DONE`, color: C.cyan, scale: 2, sub: out.interest ? `+${fmt(out.interest)} INTEREST` : null, subColor: C.gold };
  banner(b.text, { ...b, dur: D(1.3) });
  audio.play('day');
  v.shownCoins = run.coins;
  v.shownTickets = run.tickets;
  later(D(1.1), () => {
    if (run.phase === 'deadline') {
      audio.play('deadline');
      openPanel('deadline');
    } else openPanel('shop');
  });
}

// ---------------------------------------------------------------- panel actions
function nope(reason) {
  audio.play('nope');
  if (reason) {
    const r = regions.find((q) => q.id === v.focus) || { x: renderer.W / 2, y: renderer.H / 2, w: 0 };
    popup(reason, r.x + r.w / 2, r.y, C.red);
    alertSr(reason);
  }
}

function activate(id) {
  if (!id) return;
  audio.unlock();
  const reg = regions.find((q) => q.id === id);
  if (reg && reg.disabled) {
    nope();
    return;
  }
  const [kind, arg] = id.split(':');
  const i = Number(arg);
  if (kind !== 'own') v.sellArm = -1;
  switch (kind) {
    case 'lever':
    case 'machine':
      if (mode === 'title') startRun(!!store.run);
      else doSpin();
      break;
    case 'charm':
      v.focus = v.focus === id ? null : id;
      break;
    case 'shop': {
      const r = buy(run, i);
      if (!r.ok) return nope(r.reason);
      audio.play('buy');
      v.shownTickets = run.tickets;
      v.charmPulse[r.id] = clock + 0.6;
      const reg2 = regions.find((q) => q.id === id);
      if (reg2) spray(reg2.x + reg2.w / 2, reg2.y + 14, 16, ['star', 'spark'], [C.gold, C.pink, '#fff']);
      alertSr(`Bought ${CHARM_BY_ID[r.id].name}. ${run.tickets} tickets left.`);
      save();
      break;
    }
    case 'own':
      if (v.sellArm === i) {
        const r = sell(run, i);
        if (r.ok) {
          audio.play('sell');
          v.shownTickets = run.tickets;
          alertSr(`Sold ${CHARM_BY_ID[r.id].name}. ${run.tickets} tickets.`);
          save();
        }
        v.sellArm = -1;
      } else {
        v.sellArm = i;
        audio.play('arm');
      }
      break;
    case 'reroll': {
      const r = reroll(run);
      if (!r.ok) return nope(r.reason);
      audio.play('reroll');
      v.shownTickets = run.tickets;
      save();
      break;
    }
    case 'early':
      payNow(true);
      break;
    case 'pay':
      payNow(false);
      break;
    case 'pkg':
      if (!choosePackage(run, i)) return;
      audio.play('day');
      audio.play('ticket');
      closePanel();
      v.shownTickets = run.tickets;
      v.shownSpins = run.spinsLeft;
      kick(0.3);
      banner(`DAY ${run.day}`, { color: C.cyan, scale: 3, sub: `${run.spinsLeft} SPINS`, dur: D(1) });
      alertSr(`Day ${run.day}. ${run.spinsLeft} spins. Press space to spin.`);
      spinHint();
      save();
      break;
    case 'offer':
      if (!pickOffer(run, i)) return;
      audio.play('bless');
      kick(0.5);
      heatTo(0.3);
      closePanel();
      v.shownTickets = run.tickets;
      v.shownCoins = run.coins;
      banner(`ROUND ${run.round}`, { color: C.gold, scale: 3, sub: `DEBT ${fmt(run.debt)}`, subColor: C.red, dur: D(1.4) });
      save();
      later(D(1.3), () => openPanel('shop'));
      break;
    case 'newrun':
      startRun(false);
      break;
    case 'endless':
      goEndless(run);
      save();
      openPanel('transmit');
      break;
    case 'cashout':
      store.record(run, true);
      v.best = store.best;
      toTitle();
      break;
    default:
  }
}

function payNow(early) {
  const before = run.coins;
  const r = payDebt(run, early);
  if (!r) return;
  closePanel();
  if (!r.paid) {
    swallowed();
    return;
  }
  audio.play('pay');
  save();
  // Coins stream into the hole.
  const from = renderer.coinTarget();
  const n = Math.min(40, Math.ceil(Math.log2(r.amount + 1) * 3));
  for (let i = 0; i < n; i++) coinTo(from, renderer.L.bh, i * 0.03, null);
  let k = 0;
  const step = () => {
    k++;
    v.shownCoins = Math.round(before - (r.amount * k) / 10);
    if (k < 10) later(0.06, step);
    else v.shownCoins = run.coins;
  };
  step();
  v.hunger = 0.8;
  flash(0.3, '#8fffc0');
  kick(0.7);
  heatTo(0.5);
  banner('DEBT PAID', { color: C.green, scale: 3, sub: r.bonus ? `+${r.bonus} TICKETS FOR PAYING EARLY` : null, dur: D(1.6) });
  alertSr(`Debt of ${r.amount} paid. ${run.coins} coins left.${r.bonus ? ` ${r.bonus} bonus tickets.` : ''}`);
  v.shownTickets = run.tickets;
  later(D(1.7), () => {
    if (run.phase === 'won') {
      audio.play('won');
      audio.play('siren', 4);
      heatTo(1.4);
      coinRain(80);
      fireworks(18);
      const best = store.best;
      v.newBest = !best.escaped;
      openPanel('won');
      alertSr('You escaped the black hole! Keep going in endless mode, or cash out.');
    } else openPanel('transmit');
  });
}

function swallowed() {
  audio.play('swallow');
  store.run = null;
  const isBest = store.record(run, false);
  v.best = store.best;
  v.newBest = isBest;
  const t0 = clock;
  v.swallowT0 = t0;
  v.swallow = 0.0001;
  shake(3);
  alertSr(`You couldn't pay. The black hole swallows the machine. You reached round ${run.round}.`);
  later(2.8, () => {
    audio.play('sad');
    openPanel('over');
  });
}

// ---------------------------------------------------------------- input
const openDialogs = () => document.querySelector('dialog[open]') !== null;
const isControl = (el) => el && el !== canvas && el.closest && el.closest('button, input, a, dialog, select, textarea');

function navRegions() {
  return regions.filter((r) => r.nav);
}
function moveFocus(dx, dy) {
  const list = navRegions();
  if (!list.length) return;
  const cur = list.find((r) => r.id === v.focus);
  if (!cur) {
    v.focus = list[0].id;
    return;
  }
  const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
  let best = null, bestScore = Infinity;
  for (const r of list) {
    if (r === cur) continue;
    const rx = r.x + r.w / 2, ry = r.y + r.h / 2;
    const ddx = rx - cx, ddy = ry - cy;
    const along = dx ? ddx * dx : ddy * dy;
    if (along <= 2) continue;
    const across = dx ? Math.abs(ddy) : Math.abs(ddx);
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best) return;
  v.focus = best.id;
  v.hover = null;
  if (!best.id.startsWith('own:') || Number(best.id.split(':')[1]) !== v.sellArm) v.sellArm = v.sellArm >= 0 && best.id === `own:${v.sellArm}` ? v.sellArm : -1;
  audio.play('move');
  describeFocus();
}

function describeFocus() {
  const id = v.focus || '';
  const [kind, arg] = id.split(':');
  const i = Number(arg);
  let text = '';
  if (kind === 'shop' && run.shop[i]) {
    const c = CHARM_BY_ID[run.shop[i]];
    text = `${c.name}, ${c.rarity}, ${c.price} tickets. ${c.desc}`;
  } else if ((kind === 'own' || kind === 'charm') && run.charms[i]) {
    const c = CHARM_BY_ID[run.charms[i]];
    text = `${c.name}: ${c.desc}`;
  } else if (kind === 'pkg') text = ['First deal', 'Second deal'][i];
  else if (kind === 'offer' && run.offers[i]) text = run.offers[i].text;
  else text = id;
  srAlert.textContent = text;
}

function pressPrimary() {
  if (v.swallow && !v.panel) return;
  if (v.panel) {
    activate(v.focus);
    return;
  }
  if (mode === 'title') startRun(!!store.run);
  else doSpin();
}

window.addEventListener('keydown', (e) => {
  if (openDialogs() || e.ctrlKey || e.metaKey || e.altKey) return;
  const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (e.key in dirs && !isControl(e.target)) {
    e.preventDefault();
    audio.unlock();
    if (v.panel) moveFocus(...dirs[e.key]);
    else if (mode === 'run' && run) {
      // Browse your charms.
      const n = run.charms.length;
      if (!n) return;
      const cur = v.focus && v.focus.startsWith('charm:') ? Number(v.focus.split(':')[1]) : -1;
      const d = dirs[e.key][0] || dirs[e.key][1];
      const next = cur < 0 ? (d > 0 ? 0 : n - 1) : (cur + d + n) % n;
      v.focus = `charm:${next}`;
      describeFocus();
    }
    return;
  }
  switch (e.key) {
    case 'Enter':
    case ' ':
      if (isControl(e.target)) return;
      e.preventDefault();
      if (e.repeat && v.panel) return;
      pressPrimary();
      break;
    case 'Escape':
      if (!v.panel && v.focus) v.focus = null;
      v.sellArm = -1;
      break;
    case 'm': case 'M':
      toggleSound();
      break;
    case 'h': case 'H':
      openHelp();
      break;
    default:
  }
});

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
}
function regionAt(p) {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) return r;
  }
  return null;
}
let downAt = null;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  canvas.focus({ preventScroll: true });
  downAt = toCanvas(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const r = regionAt(toCanvas(e));
  const id = r && (r.nav || r.id.startsWith('charm:')) ? r.id : null;
  if (id !== v.hover) {
    v.hover = id;
    if (id && v.panel) {
      v.focus = id;
      if (!id.startsWith('own:')) v.sellArm = -1;
    }
  }
  canvas.style.cursor = r ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => {
  v.hover = null;
});
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const p = toCanvas(e);
  downAt = null;
  if (v.swallow && !v.panel) return;
  const r = regionAt(p);
  if (v.panel) {
    if (r && r.nav) {
      if (e.pointerType !== 'mouse' && r.id.startsWith('shop:') && v.focus !== r.id) {
        // On touch, the first tap on a charm shows what it does; the second buys it.
        v.focus = r.id;
        audio.play('move');
        return;
      }
      v.focus = r.id;
      activate(r.id);
    }
    return;
  }
  if (r) activate(r.id);
  else if (mode === 'run' && v.focus && v.focus.startsWith('charm:')) v.focus = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let padPrev = {};
let padRepeat = 0;
function pollPad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad || openDialogs()) return;
  const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
  const now = { a: b(0) || b(9), up: b(12) || pad.axes[1] < -0.5, down: b(13) || pad.axes[1] > 0.5, left: b(14) || pad.axes[0] < -0.5, right: b(15) || pad.axes[0] > 0.5 };
  if (now.a && !padPrev.a) pressPrimary();
  padRepeat -= dt;
  const dirs = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  for (const [k, dx, dy] of dirs) {
    if (now[k] && (!padPrev[k] || padRepeat <= 0)) {
      if (v.panel) moveFocus(dx, dy);
      padRepeat = padPrev[k] ? 0.12 : 0.35;
    }
  }
  padPrev = now;
}

// ---------------------------------------------------------------- menus
const helpDlg = document.getElementById('help');
function toggleSound() {
  store.settings.muted = !store.settings.muted;
  store.save();
  audio.unlock();
  audio.setMuted(store.settings.muted);
  syncSound();
  document.getElementById('opt-sound').checked = !store.settings.muted;
}
soundBtn.addEventListener('click', toggleSound);
function openHelp() {
  if (helpDlg.open) return;
  document.getElementById('opt-sound').checked = !store.settings.muted;
  document.getElementById('opt-fast').checked = !!store.settings.fast;
  document.getElementById('opt-music').checked = !!store.settings.music;
  document.getElementById('opt-motion').checked = !!store.settings.reducedMotion;
  document.getElementById('btn-abandon').hidden = !(mode === 'run' && run && run.phase !== 'over' && !v.swallow);
  helpDlg.showModal();
}
helpDlg.addEventListener('close', () => {
  if (helpDlg.returnValue === 'abandon' && mode === 'run' && run && !v.swallow) {
    skipAll();
    store.run = null;
    store.record(run, false);
    v.best = store.best;
    toTitle();
  }
  helpDlg.returnValue = '';
  canvas.focus({ preventScroll: true });
});
document.getElementById('btn-help').addEventListener('click', openHelp);
document.getElementById('opt-sound').addEventListener('change', (e) => {
  if (e.target.checked === store.settings.muted) toggleSound();
});
document.getElementById('opt-music').addEventListener('change', (e) => {
  store.settings.music = e.target.checked;
  store.save();
  audio.setMusic(store.settings.music);
});
document.getElementById('opt-fast').addEventListener('change', (e) => {
  store.settings.fast = e.target.checked;
  store.save();
});
document.getElementById('opt-motion').addEventListener('change', (e) => {
  store.settings.reducedMotion = e.target.checked;
  store.save();
  applyMotion();
});

// ---------------------------------------------------------------- title attract
let demoNext = 1.2;
function demoSpin() {
  const g = [];
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = 0; r < ROWS; r++) col.push(Math.random() < 0.04 ? VOID : randomSym());
    g.push(col);
  }
  // Show off now and then.
  if (Math.random() < 0.35) {
    const s = randomSym();
    const r = Math.floor(Math.random() * 3);
    for (let c = 0; c < 3 + Math.floor(Math.random() * 3); c++) g[c][r] = s;
  }
  for (let c = 0; c < COLS; c++) {
    const reel = v.reels[c];
    const dur = 0.6 + c * 0.2;
    const fill = Math.round(dur * 14) + 4;
    const old = reel.strip.slice(0, 3);
    const fillers = [];
    for (let i = 0; i < fill; i++) fillers.push(randomSym());
    reel.strip = [...g[c], ...fillers, ...old];
    reel.n = 3 + fill;
    reel.pos = reel.n;
    reel.t0 = clock;
    reel.dur = dur;
    reel.stopped = false;
    reel.tease = false;
  }
  pullLever();
  v.bulbs = 'spin';
  v.demoGrid = g;
}
function updateDemo(dt) {
  const moving = v.reels.some((r) => !r.stopped);
  if (!moving && v.demoGrid) {
    // Light up any row the demo landed.
    const g = v.demoGrid;
    v.demoGrid = null;
    v.bulbs = 'idle';
    for (let r = 0; r < ROWS; r++) {
      let n = 1;
      while (n < COLS && g[n][r] === g[0][r] && g[0][r] !== VOID) n++;
      if (n >= 3) {
        v.hot = new Set(Array.from({ length: n }, (_, c) => `${c},${r}`));
        v.hotRows = new Set([r]);
        v.hotColor = C.gold;
        v.bulbs = 'win';
        later(1.4, () => {
          if (mode === 'title') {
            clearHot();
            v.bulbs = 'idle';
          }
        });
      }
    }
  }
  demoNext -= dt;
  if (demoNext <= 0) {
    demoNext = 3.4;
    if (!document.hidden) demoSpin();
  }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const dt = rdt * SPEED;
  clock += dt;
  v.time = clock;
  v.mode = mode;
  const t0 = performance.now();
  pollPad(rdt);
  runTasks();
  if (mode === 'title') updateDemo(dt);
  updateReels(dt);
  updateParticles(dt);
  updateShooters();
  // Heat cools off once the win has been counted.
  v.heat = Math.max(0, v.heat - dt * (settle ? 0.05 : 0.45));
  updateJig(dt);
  audio.setHeat(v.heat);
  audio.update();
  v.flash = Math.max(0, v.flash - dt * 2.5);
  v.shake = Math.max(0, v.shake - dt * 12);
  v.buttonDown = Math.max(0, v.buttonDown - dt);
  const la = v.leverAnim != null ? clock - v.leverAnim : 9;
  v.lever = la < 0.12 ? la / 0.12 : la < 0.4 ? 1 - (la - 0.12) / 0.28 : 0;
  v.canSpin = mode === 'title' || canSpinNow();
  if (v.swallow) v.swallow = Math.min(1.2, (clock - v.swallowT0) / 2.4);
  // The hole grows hungrier through the round.
  let hungerGoal = 1;
  if (run) hungerGoal = 1 + (run.day - 1) * 0.1 + (run.phase === 'deadline' ? 0.15 : 0) + (v.swallow ? 0.5 : 0);
  v.hunger += (hungerGoal - v.hunger) * Math.min(1, dt * 1.5);
  audio.setHum(run ? (run.day - 1) / 2 : 0.2);
  if (v.focus && !regions.some((r) => r.id === v.focus) && !v.panel) {
    if (!v.focus.startsWith('charm:') || !run || !run.charms[Number(v.focus.split(':')[1])]) v.focus = null;
  }
  regions = renderer.draw(ctx, v);
  if (v.panel && v.focus && !regions.some((r) => r.id === v.focus && r.nav)) {
    const list = navRegions();
    const firstEnabled = list.find((r) => !r.disabled) || list[0];
    if (firstEnabled) v.focus = firstEnabled.id;
  }
  perf.frames++;
  perf.worst = Math.max(perf.worst, performance.now() - t0);
}

titleHint();
requestAnimationFrame(frame);

if (TEST) {
  window.__slots = {
    perf,
    store,
    snapshot: () => ({ ...(run ? snapshot(run) : {}), mode, panel: v.panel, focus: v.focus, busy: spinning || !!settle || tasks.length > 0, scale, shownCoins: v.shownCoins, swallow: v.swallow }),
    run: () => run,
    view: () => v,
    regions: () => regions,
    act: (id) => activate(id),
    force: (grid) => {
      forcedGrid = grid;
    },
  };
}
