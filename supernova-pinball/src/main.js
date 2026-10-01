import { SoundEngine } from './audio.js';
import { bleed } from './bleed.js';
import { UNLOCKS, UPGRADE_BY_ID, sectorFor } from './data.js';
import { drawText, measureText } from './font.js';
import { DT, MYSTERY, autopilot, createGame, pickUpgrade, snapshot, step } from './game.js';
import { COLORS as C, DMD_HEIGHT, Renderer, fmt } from './render.js';
import { loadStore } from './storage.js';
import { LANE_X, PLUNGER, TH, TW } from './table.js';

// iOS ignores user-scalable=no, so block pinch-zoom here (double-tap zoom is
// handled by touch-action in the stylesheet).
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const AUTO = params.has('auto'); // the autopilot plays real games too (for tests)
const SPEED = params.has('fast') ? 3 : 1;
const START_SECTOR = Math.max(1, Math.floor(Number(params.get('sector'))) || 1);
let seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Date.now() ^ (Math.random() * 1e9)) >>> 0;

const store = loadStore();
// Reduced motion follows the system setting until the player picks one in help.
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

// The game is laid out in table units; the canvas holds `RS` device pixels
// per unit (a whole number, near the real scale) so shapes are drawn sharp,
// and the browser stretches it the last little bit to fill the window.
const canvas = document.getElementById('game');
bleed(canvas);
const ctx = canvas.getContext('2d', { alpha: false });
const hud = document.querySelector('.hud');
const hint = document.getElementById('hint');
const srAlert = document.getElementById('sr-alert');
const audio = new SoundEngine();
audio.setMuted(store.settings.muted);
audio.setMusic(store.settings.music);
const renderer = new Renderer();
const touchFirst = matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- state
let mode = 'title'; // 'title' (the autopilot plays behind the logo) | 'play'
let game = demoGame();
let paused = false;
let clock = 0;
let regions = [];
const perf = { frames: 0, steps: 0, worst: 0 };
const v = {
  time: 0, panel: 'title', focus: null, hover: null, shake: 0, flash: 0, flashColor: '#fff', particles: [], popups: [],
  trails: {}, lightShow: 0, nudgeX: 0, reducedMotion: false, best: store.high, newBest: false, touch: touchFirst,
  dmdDraw: null,
};
let slowmo = 0; // seconds of slow motion left
let dmdQueue = [];

function demoGame() {
  const g = createGame({ seed: seed++, sector: 1 + Math.floor(Math.random() * 5) });
  g.target = Infinity;
  g.ballsLeft = 99;
  return g;
}

// ---------------------------------------------------------------- sizing
// The screen's safe area, in CSS pixels: the notch and home indicator, or the
// status bar when the game runs as a home-screen app.
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.append(safeProbe);
function safeArea() {
  const cs = getComputedStyle(safeProbe);
  return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
}

let scale = 1, RS = 1, W = 0, H = 0, insetKey = '';
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = Math.round(window.innerWidth * dpr), vh = Math.round(window.innerHeight * dpr);
  const sa = safeArea();
  const aw = vw - (sa.left + sa.right) * dpr, ah = vh - (sa.top + sa.bottom) * dpr;
  // The table (with its display on top) fills the height, or on a phone the
  // width; wide screens get side panels either side. All inside the safe
  // area; the backdrop still fills the whole screen.
  const tall = DMD_HEIGHT + 3 + TH + 2;
  const side = Math.min(aw / (TW + 224), ah / tall);
  const narrow = Math.min(aw / (TW + 10), ah / tall);
  scale = Math.max(0.5, side >= narrow * 0.93 ? side : narrow);
  const nW = Math.ceil(vw / scale), nH = Math.ceil(vh / scale);
  const nRS = Math.max(1, Math.min(4, Math.ceil(scale - 0.05)));
  const k = dpr / scale; // table units per CSS pixel
  const inset = { top: sa.top * k, right: sa.right * k, bottom: sa.bottom * k, left: sa.left * k };
  const key = JSON.stringify(sa);
  // The CSS size (and the buttons by the display) follow the zoom level even
  // when the pixel size doesn't change.
  canvas.style.width = `${vw / dpr}px`;
  canvas.style.height = `${vh / dpr}px`;
  if (nW === W && nH === H && nRS === RS && key === insetKey && renderer.W) {
    placeHud(scale / dpr, sa);
    return;
  }
  W = nW;
  H = nH;
  RS = nRS;
  insetKey = key;
  canvas.width = W * RS;
  canvas.height = H * RS;
  renderer.resize(W, H, RS, inset);
  placeHud(scale / dpr, sa);
}

/**
 * On a phone the menu buttons sit either side of the display (on screen, and
 * clear of its bezel where there's room). With side panels they sit in the
 * corner, and the right-hand panel starts below them.
 */
function placeHud(unit, sa) {
  const L = renderer.L;
  hud.classList.toggle('flank', !L.side);
  const half = 21 / unit, pad = 2 / unit; // the flanking buttons are 42 px
  const btns = {
    'btn-pause': Math.max(sa.left / unit + half + pad, Math.min(L.tx + 18, L.dmdX - 3 - half - pad)),
    'btn-help': Math.min(W - sa.right / unit - half - pad, Math.max(L.tx + TW - 18, L.dmdX + L.dmdW + 2 + half + pad)),
  };
  for (const b of hud.querySelectorAll('.icon-btn')) {
    if (L.side || !(b.id in btns)) {
      b.style.left = b.style.top = '';
      continue;
    }
    b.style.left = `${btns[b.id] * unit}px`;
    b.style.top = `${Math.max(sa.top + 23, (L.dy + 2 + DMD_HEIGHT / 2 - 2) * unit)}px`;
  }
  const r = hud.querySelector('.buttons').getBoundingClientRect();
  L.hud = L.side ? { x: r.left / unit, bottom: r.bottom / unit } : null;
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

// ---------------------------------------------------------------- helpers
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
  v.reducedMotion = store.settings.reducedMotion ?? motionQuery.matches;
  document.documentElement.classList.toggle('reduced-motion', v.reducedMotion);
}
applyMotion();
motionQuery.addEventListener('change', applyMotion);
const soundBtn = document.getElementById('btn-sound');
function syncSound() {
  soundBtn.dataset.on = String(!store.settings.muted);
  soundBtn.setAttribute('aria-pressed', String(!store.settings.muted));
}
syncSound();
function titleHint() {
  setHint(touchFirst ? 'Tap to play' : 'Press Space to play', 'title');
}

function shake(n) {
  if (!v.reducedMotion) v.shake = Math.max(v.shake, n);
}
function flash(n, color = '#fff') {
  if (v.reducedMotion) return;
  v.flash = Math.max(v.flash, n);
  v.flashColor = color;
}
function lightShow(sec) {
  v.lightShow = Math.max(v.lightShow, sec);
}
function slow(sec) {
  if (!v.reducedMotion) slowmo = Math.max(slowmo, sec);
}
function sparks(x, y, n, colors = ['#fff', C.gold, C.cyan], speed = 90) {
  if (v.reducedMotion) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
    v.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 120, life: 0, max: 0.3 + Math.random() * 0.5, color: colors[i % colors.length], size: Math.random() < 0.3 ? 2 : 1 });
  }
}
function shock(x, y, color = '#fff', r1 = 30, max = 0.4) {
  if (v.reducedMotion) return;
  v.particles.push({ kind: 'ring', x, y, r0: 2, r1, life: 0, max, color, vx: 0, vy: 0, g: 0 });
}
function fireworks(n) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const x = 20 + Math.random() * (TW - 40), y = 20 + Math.random() * 200;
      const hue = Math.floor(Math.random() * 360);
      sparks(x, y, 22, [`hsl(${hue} 100% 65%)`, '#fff', `hsl(${hue + 50} 100% 70%)`], 120);
      shock(x, y, `hsl(${hue} 100% 70%)`, 20, 0.5);
    }, i * 180);
  }
}
function popup(text, x, y, color = C.gold, scale2 = 1) {
  v.popups.push({ text, x, y, t0: clock, color, scale: scale2 });
  if (v.popups.length > 14) v.popups.shift();
}

// ---------------------------------------------------------------- the dot-matrix display
const DMD_ON = '#ff9b2f', DMD_HI = '#ffd9a0';
/** Queues a DMD animation: { text, sub, dur, big, flash, burst, scroll }. */
function dmd(msg) {
  const m = { t0: null, dur: 1.4, ...msg };
  if (m.urgent) dmdQueue = [m, ...dmdQueue.filter((q) => !q.urgent)];
  else if (dmdQueue.length < 4) dmdQueue.push(m);
}
function dmdText(d, text, y, color = DMD_ON, scale2 = 1, W = 96) {
  const w = measureText(text, scale2);
  drawText(d, text, Math.round((W - w) / 2), y, color, scale2);
}
function drawDmd(d, W, H) {
  const t = clock;
  const g = game;
  let m = dmdQueue[0];
  if (m && m.t0 === null) m.t0 = t;
  if (m && t - m.t0 > m.dur) {
    dmdQueue.shift();
    m = dmdQueue[0];
    if (m) m.t0 = t;
  }
  if (m) {
    const age = t - m.t0;
    if (m.burst && !v.reducedMotion) {
      const r = (age * 60) % 60;
      d.fillStyle = '#7a3a10';
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        d.fillRect(Math.round(W / 2 + Math.cos(a) * r), Math.round(H / 2 + Math.sin(a) * r * 0.5), 1, 1);
      }
    }
    if (m.roll && age < m.dur - 0.9) {
      // The mystery award spins like a slot machine reel.
      const k = Math.floor(age * (18 - age * 5));
      dmdText(d, 'MYSTERY', 0, DMD_HI, 1, W);
      dmdText(d, m.roll[k % m.roll.length], 9, DMD_ON, 1, W);
      return;
    }
    if (m.flash && Math.floor(age * 8) % 2 && !v.reducedMotion) return;
    const col = m.hi && Math.floor(age * 6) % 2 ? DMD_HI : DMD_ON;
    if (m.big) {
      const w = measureText(m.text, 2);
      if (w > W) {
        const x = Math.round(W - ((age / m.dur) * (w + W)));
        drawText(d, m.text, x, 3, col, 2);
      } else dmdText(d, m.text, m.sub ? 0 : 3, col, 2, W);
      if (m.sub && w <= W) dmdText(d, m.sub, 11, DMD_ON, 1, W);
    } else {
      dmdText(d, m.text, m.sub ? 1 : 5, col, 1, W);
      if (m.sub) dmdText(d, m.sub, 9, DMD_ON, 1, W);
    }
    return;
  }
  // Idle screens.
  if (mode === 'title') {
    // SUPERNOVA is too wide for the display in the big letters.
    const pages = [['SUPERNOVA', 'PINBALL'], ['PINBALL'], [`HIGH ${fmt(store.high)}`], [touchFirst ? 'TAP TO PLAY' : 'PRESS SPACE']];
    const i = Math.floor(t / 2) % pages.length;
    const [top, sub] = pages[i];
    if (sub) {
      dmdText(d, top, 1, DMD_HI, 1, W);
      dmdText(d, sub, 9, DMD_ON, 1, W);
    } else dmdText(d, top, i === 1 ? 3 : 5, DMD_ON, i === 1 ? 2 : 1, W);
    return;
  }
  dmdText(d, fmt(g.score), 1, DMD_HI, 1, W);
  let info;
  if (g.supernovaT > 0) info = `SUPERNOVA ${Math.ceil(g.supernovaT)}`;
  else if (g.mission) info = Math.floor(t * 0.7) % 2 ? `${g.mission.def.name} ${Math.ceil(g.mission.t)}` : `${g.mission.def.desc}`;
  else if (g.cannon) info = touchFirst ? 'TAP TO FIRE' : 'FLIP TO FIRE';
  else if (g.multiball) info = g.jackpotLit ? 'SHOOT THE STAR' : `RELIGHT ${Math.max(0, g.relight)}`;
  else if (g.phase === 'launch') info = Math.floor(t) % 2 ? 'SKILL SHOT LIT' : `BALL ${g.ballNo}  ${touchFirst ? 'HOLD' : 'SPACE'}`;
  else {
    const pages = [`BALL ${g.ballNo}  X${g.mult}`, `NEED ${fmt(Math.max(0, g.target - g.sectorScore))}`, sectorFor(g.sector).name];
    info = pages[Math.floor(t / 2.5) % pages.length];
  }
  dmdText(d, info, 9, DMD_ON, 1, W);
}
v.dmdDraw = drawDmd;

// ---------------------------------------------------------------- flow
function startGame() {
  audio.unlock();
  mode = 'play';
  game = createGame({ seed: seed++, sector: START_SECTOR, relaxed: !!store.settings.relaxed });
  v.panel = null;
  v.particles = [];
  v.popups = [];
  v.newBest = false;
  dmdQueue = [];
  dmd({ text: sectorFor(game.sector).name, sub: `TARGET ${fmt(game.target)}`, dur: 2.2 });
  audio.play('start');
  setHint(touchFirst ? 'Hold to pull the plunger · tap left / right to flip' : 'Hold Space to launch · Z and / (or arrows) flip');
  setTimeout(() => mode === 'play' && game.phase !== 'launch' && setHint(''), 9000);
  alertSr(`New game. Sector ${game.sector}, ${sectorFor(game.sector).name}. Reach ${game.target} points to warp. Hold space to pull the plunger.`);
  canvas.focus({ preventScroll: true });
}

function toTitle() {
  mode = 'title';
  game = demoGame();
  v.panel = 'title';
  dmdQueue = [];
  titleHint();
}

// Event hooks: sounds, particles, the DMD and screen reader.
function onEvents(g) {
  const real = mode === 'play';
  for (const e of g.events) {
    if (real || ['bumper', 'sling', 'flip', 'star'].includes(e.type)) {
      if (e.type === 'score') {
        if (real && e.pts >= 1000) popup(e.label || fmt(e.pts), e.x, e.y, e.label ? C.pink : C.gold);
        continue;
      }
    }
    if (!real) {
      // The attract mode keeps quiet but still flashes.
      if (e.type === 'bumper') shock(e.x, e.y, '#fff', 16, 0.3);
      continue;
    }
    switch (e.type) {
      case 'flip':
        audio.play('flip');
        break;
      case 'flipHit':
        audio.play('flipHit', e.strength);
        break;
      case 'bumper':
        audio.play('bumper', e.id);
        shock(e.x, e.y, '#fff', 18, 0.3);
        sparks(e.x, e.y, 6);
        shake(1);
        break;
      case 'chain': {
        audio.play('chain');
        const from = g.table.bumpers[e.from];
        for (const b of g.table.bumpers) if (b !== from) v.particles.push({ kind: 'bolt', x: from.x, y: from.y, x2: b.x, y2: b.y, life: 0, max: 0.2, vx: 0, vy: 0, g: 0 });
        break;
      }
      case 'sling':
        audio.play('sling');
        sparks(e.x, e.y, 5, ['#fff', C.pink]);
        break;
      case 'drop':
        audio.play('drop', e.id);
        sparks(e.x, e.y, 6, [C.cyan, '#fff']);
        break;
      case 'dropsAll':
        audio.play('targets');
        lightShow(1.2);
        flash(0.2, C.cyan);
        dmd({ text: 'NOVA BANK', sub: fmt(e.pts), big: true, hi: true });
        break;
      case 'standup':
        audio.play('standup', e.id);
        sparks(e.x, e.y, 4, [C.green, '#fff']);
        break;
      case 'ion':
        audio.play('ion');
        lightShow(0.8);
        dmd({ text: 'I O N', sub: e.lit === 'time' ? 'MISSION +10 SEC' : 'MISSION IS LIT', big: true, hi: true });
        break;
      case 'captive':
        audio.play('captive');
        sparks(e.x, e.y + 4, 4, ['#fff', C.orange]);
        break;
      case 'planet':
        audio.play('planet', e.n);
        shake(4);
        flash(0.3, C.orange);
        for (let k = 0; k < 3; k++) setTimeout(() => sparks(e.x, e.y, 18, [C.orange, C.gold, '#fff', C.red], 140), k * 90);
        shock(e.x, e.y, C.orange, 40, 0.5);
        dmd({ text: 'PLANET CRACKED', sub: fmt(e.pts), big: true, burst: true, hi: true, urgent: true, dur: 1.8 });
        alertSr('Planet cracked!');
        break;
      case 'skill':
        audio.play('skill');
        flash(0.4, C.gold);
        lightShow(1.5);
        fireworks(3);
        dmd({ text: 'SKILL SHOT', sub: fmt(e.pts), big: true, burst: true, hi: true, urgent: true, dur: 2 });
        alertSr('Skill shot!');
        break;
      case 'gate':
        audio.play('gate');
        break;
      case 'missionStart':
        audio.play('missionStart');
        flash(0.3, C.pink);
        lightShow(1.5);
        dmd({ text: e.name, sub: e.desc, big: true, burst: true, hi: true, urgent: true, dur: 2.4 });
        alertSr(`Mission: ${e.name}. ${e.desc.toLowerCase()} within ${e.time} seconds.`);
        break;
      case 'missionHit':
        audio.play('missionHit', e.n);
        sparks(e.x, e.y, 14, [C.pink, '#fff', C.gold], 120);
        shock(e.x, e.y, C.pink, 26, 0.4);
        // (Big Bang hits have no total to count towards.)
        dmd({ text: e.need ? `${e.n} OF ${e.need}` : `HIT ${e.n}`, sub: fmt(e.pts), big: true, urgent: true, dur: 1.1 });
        break;
      case 'missionDone':
        audio.play('missionDone');
        flash(0.6, C.pink);
        shake(5);
        slow(0.4);
        lightShow(3);
        fireworks(8);
        dmd({ text: 'MISSION COMPLETE', sub: fmt(e.pts), big: true, burst: true, flash: true, urgent: true, dur: 2.6 });
        if (e.extra) dmd({ text: 'EXTRA BALL', sub: 'AT THE WORMHOLE', big: true, hi: true, dur: 2 });
        alertSr(`Mission complete: ${e.name}.${e.extra ? ' Extra ball is lit at the wormhole.' : ''}`);
        break;
      case 'missionFail':
        audio.play('missionFail');
        dmd({ text: 'MISSION OVER', sub: e.name, dur: 1.6, urgent: true });
        break;
      case 'extraBall':
        audio.play('extraBall');
        flash(0.6, C.green);
        fireworks(5);
        dmd({ text: 'EXTRA BALL', big: true, burst: true, flash: true, urgent: true, dur: 2.4 });
        alertSr('Extra ball!');
        break;
      case 'rampIn':
        audio.play('rampIn');
        break;
      case 'ramp':
        audio.play('ramp', e.n);
        sparks(e.x, e.y, 16, [C.cyan, '#fff', C.gold], 120);
        shock(e.x, e.y, C.cyan, 30, 0.4);
        if (e.n > 1) lightShow(0.8);
        dmd({ text: e.n > 1 ? `RAMP X${e.n}` : 'RAMP', sub: fmt(e.pts), big: true, hi: e.n > 1, urgent: e.n > 2 });
        break;
      case 'letter':
        audio.play('letter', e.id);
        sparks(e.x, e.y, 4, [C.gold, '#fff']);
        break;
      case 'letters':
        audio.play('letters');
        lightShow(2);
        flash(0.4, C.gold);
        shake(3);
        dmd({ text: 'SUPERNOVA', sub: 'SPELLED! 75,000', burst: true, hi: true, urgent: true, dur: 2 });
        alertSr('You spelled SUPERNOVA!');
        break;
      case 'asteroid':
        audio.play('asteroid');
        sparks(e.x, e.y, 10, ['#8a93b8', '#c9d3ff', C.orange], 110);
        shock(e.x, e.y, '#c9d3ff', 12, 0.25);
        break;
      case 'belt':
        audio.play('belt');
        flash(0.25, '#c9d3ff');
        lightShow(1);
        dmd({ text: 'BELT CLEARED', sub: fmt(e.pts), big: true, hi: true, urgent: true });
        break;
      case 'rotor':
        audio.play('rotor');
        sparks(e.x, e.y, 5, ['#fff', C.cyan]);
        break;
      case 'overdrive':
        audio.play('overdrive');
        lightShow(1.5);
        flash(0.3, C.cyan);
        dmd({ text: 'PULSAR', sub: 'OVERDRIVE X5', big: true, burst: true, hi: true, urgent: true, dur: 2 });
        break;
      case 'overdriveEnd':
        dmd({ text: 'OVERDRIVE OVER', dur: 1 });
        break;
      case 'cannonLoad':
        audio.play('cannonLoad');
        dmd({ text: 'CANNON LOADED', sub: touchFirst ? 'TAP TO FIRE' : 'FLIP TO FIRE', hi: true, urgent: true, dur: 1.6 });
        alertSr('Plasma cannon loaded. Flip to fire.');
        break;
      case 'cannonFire':
        audio.play('cannonFire');
        shake(3);
        flash(0.2, C.pink);
        for (let i = 0; i < 16; i++) {
          const a = e.a + (Math.random() - 0.5) * 0.8, sp = 60 + Math.random() * 160;
          v.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, life: 0, max: 0.4, color: i % 2 ? C.pink : '#fff', size: 2 });
        }
        shock(e.x, e.y, C.pink, 18, 0.3);
        break;
      case 'snipe':
        audio.play('snipe');
        flash(0.3, C.gold);
        fireworks(2);
        dmd({ text: 'CANNON SNIPE', sub: fmt(e.pts), big: true, burst: true, hi: true, urgent: true });
        break;
      case 'mystery':
        audio.play('mystery');
        lightShow(2.4);
        dmd({ text: e.pick, roll: MYSTERY.map(([n]) => n), sub: 'MYSTERY', big: true, hi: true, urgent: true, dur: 3 });
        break;
      case 'mysteryAward':
        audio.play('mysteryAward');
        flash(0.25, C.gold);
        alertSr(`Mystery award: ${e.name.toLowerCase()}.`);
        break;
      case 'bigBang':
        audio.play('bigBang');
        flash(1, '#fff');
        shake(9);
        slow(0.9);
        lightShow(40);
        fireworks(14);
        dmd({ text: 'BIG BANG', big: true, burst: true, flash: true, urgent: true, dur: 3 });
        dmd({ text: 'EVERYTHING LIT', sub: '250,000 A SHOT', dur: 2.2 });
        alertSr('Big Bang! Every shot is lit for 40 seconds.');
        break;
      case 'bigBangEnd':
        audio.play('novaEnd');
        v.lightShow = 0;
        dmd({ text: 'BIG BANG OVER', sub: `${e.n} SHOTS`, dur: 2, urgent: true });
        break;
      case 'binary':
        audio.play('binary', e.id);
        shock(e.x, e.y, e.id ? C.orange : C.cyan, 12, 0.25);
        sparks(e.x, e.y, 5, [e.id ? C.orange : C.cyan, '#fff']);
        break;
      case 'eclipse':
        audio.play('eclipse');
        flash(0.3, C.gold);
        shock(e.x, e.y, C.gold, 40, 0.5);
        dmd({ text: 'ECLIPSE', sub: fmt(e.pts), big: true, hi: true, urgent: true });
        break;
      case 'crack':
        audio.play('crack');
        sparks(e.x, e.y, 5, ['#b35cff', '#fff']);
        break;
      case 'shatter':
        audio.play('shatter');
        sparks(e.x, e.y, 16, ['#b35cff', '#fff', C.orange], 130);
        shake(1);
        break;
      case 'shower':
        audio.play('shower');
        lightShow(1.5);
        flash(0.3, '#b35cff');
        for (let k = 0; k < 12; k++) setTimeout(() => sparks(40 + Math.random() * 160, 10, 6, ['#b35cff', '#fff', C.orange], 60), k * 60);
        dmd({ text: 'METEOR SHOWER', sub: fmt(e.pts), big: true, burst: true, hi: true, urgent: true });
        break;
      case 'meteorsBack':
        audio.play('dropReset');
        break;
      case 'giant':
        audio.play('giant', e.strength);
        shock(e.x, e.y, '#ff9b6a', 16, 0.3);
        break;
      case 'quasar':
        audio.play('quasar', e.n);
        sparks(e.x, e.y, 18, [C.pink, '#fff', '#b35cff'], 140);
        shock(e.x, e.y, C.pink, 26, 0.4);
        dmd({ text: e.n > 1 ? `QUASAR X${e.n}` : 'QUASAR', sub: fmt(e.pts), big: true, hi: true });
        break;
      case 'quasarMove':
        audio.play('blink');
        shock(e.x, e.y, C.pink, 12, 0.3);
        break;
      case 'bob':
        audio.play('bob', e.strength);
        break;
      case 'fullSwing':
        audio.play('fullSwing');
        flash(0.25, C.cyan);
        dmd({ text: 'FULL SWING', sub: fmt(e.pts), big: true, hi: true, urgent: true });
        break;
      case 'moon':
        audio.play('moon');
        shock(e.x, e.y, '#c9d3ff', 14, 0.3);
        sparks(e.x, e.y, 5, ['#fff', '#c9d3ff']);
        break;
      case 'rollover':
        audio.play('rollover');
        break;
      case 'ballSearch':
        dmd({ text: 'BALL SEARCH', dur: 0.8 });
        break;
      case 'dropReset':
        audio.play('dropReset');
        break;
      case 'lane':
        audio.play('lane', e.id);
        sparks(e.x, 50, 5, [C.gold, '#fff']);
        break;
      case 'lanesAll':
        audio.play('multiplier');
        lightShow(1.2);
        dmd({ text: `${e.mult}X`, sub: 'MULTIPLIER', big: true, burst: true, hi: true, urgent: true });
        alertSr(`Playfield multiplier ${e.mult}x.`);
        break;
      case 'spinner':
        audio.play('spin', e.spins);
        break;
      case 'star':
        audio.play('star');
        shock(e.x, e.y, C.gold, 24, 0.35);
        sparks(e.x, e.y, 8, [C.gold, C.orange, '#fff']);
        shake(1.5);
        break;
      case 'combo':
        audio.play('combo', e.n);
        dmd({ text: `${e.n}X COMBO`, sub: `+${fmt(e.pts)}`, dur: 1, urgent: e.n >= 4 });
        break;
      case 'wormhole':
        audio.play('wormhole');
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          v.particles.push({ x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40, g: 0, life: 0, max: 0.4, color: C.cyan });
        }
        dmd({ text: 'WORMHOLE', sub: '30,000', big: true });
        break;
      case 'kickout':
        audio.play('kickout');
        shock(e.x, e.y, '#fff', 22, 0.35);
        sparks(e.x, e.y, 10, ['#fff', C.cyan, C.pink], 100);
        shake(1);
        break;
      case 'lock':
        audio.play('lock');
        flash(0.3, C.cyan);
        dmd({ text: `LOCK ${e.n}`, sub: 'ONE MORE FOR MULTIBALL', big: true, hi: true, urgent: true, dur: 2 });
        alertSr('Ball locked. One more for multiball.');
        break;
      case 'multiball':
        audio.play('multiball');
        flash(0.6, C.pink);
        shake(5);
        lightShow(3);
        slow(0.5);
        dmd({ text: 'MULTIBALL', big: true, burst: true, hi: true, urgent: true, dur: 2.4 });
        dmd({ text: 'SHOOT THE STAR', sub: 'FOR JACKPOTS', dur: 1.8 });
        alertSr('Multiball! Hit the star for jackpots.');
        break;
      case 'jackpot':
        audio.play('jackpot');
        flash(0.8, C.gold);
        shake(6);
        slow(0.45);
        lightShow(2);
        fireworks(6);
        sparks(e.x, e.y, 40, [C.gold, '#fff', C.pink], 160);
        shock(e.x, e.y, C.gold, 80, 0.6);
        dmd({ text: 'JACKPOT', sub: fmt(e.pts), big: true, burst: true, flash: true, urgent: true, dur: 2.2 });
        alertSr(`Jackpot! ${e.pts} points.`);
        break;
      case 'relight':
        audio.play('relight');
        dmd({ text: 'JACKPOT LIT', dur: 1 });
        break;
      case 'supernova':
        audio.play('supernova');
        flash(1, '#fff');
        shake(9);
        slow(1.1);
        lightShow(20);
        fireworks(12);
        for (let k = 0; k < 4; k++) setTimeout(() => shock(g.table.star.x, g.table.star.y, ['#fff', C.gold, C.orange, C.red][k], 160, 1), k * 150);
        sparks(g.table.star.x, g.table.star.y, 80, ['#fff', C.gold, C.orange, C.red], 220);
        dmd({ text: 'SUPERNOVA', big: true, burst: true, hi: true, urgent: true, dur: 3 });
        dmd({ text: 'ALL SCORES X2', sub: 'EXTRA BALLS!', dur: 2 });
        alertSr('Supernova! Extra balls and double scoring.');
        break;
      case 'novaEnd':
        audio.play('novaEnd');
        v.lightShow = 0;
        dmd({ text: 'STAR REBORN', dur: 1.4 });
        break;
      case 'multiballEnd':
        audio.play('novaEnd');
        dmd({ text: 'MULTIBALL OVER', dur: 1.4 });
        alertSr('Multiball over.');
        break;
      case 'plunger':
        audio.play('plunger', e.power);
        break;
      case 'launch':
        audio.play('launch', e.power);
        if (!e.auto && hint.textContent && !hint.classList.contains('title')) setTimeout(() => mode === 'play' && setHint(''), 1500);
        break;
      case 'serve':
        audio.play('serve');
        if (g.ballNo > 1) dmd({ text: `BALL ${g.ballNo}`, sub: `${g.ballsLeft} LEFT`, dur: 1.4 });
        break;
      case 'drainOne':
        audio.play('drainOne');
        break;
      case 'ballSaved':
      case 'ghost':
        audio.play('save');
        dmd({ text: e.type === 'ghost' ? 'GHOST BALL' : 'BALL SAVED', big: true, urgent: true, dur: 1.4 });
        alertSr('Ball saved.');
        break;
      case 'drain':
        audio.play('drain');
        v.lightShow = 0;
        shake(2);
        dmd({ text: g.tilted ? 'TILT' : 'BONUS', big: true, dur: 0.8, urgent: true });
        alertSr('Ball lost.');
        break;
      case 'bonusTick': {
        audio.play('bonusTick', e.i);
        const [name, n, each] = g.bonusCount.items[e.i];
        dmd({ text: `${name} ${n}`, sub: `X ${fmt(each)}`, dur: 0.45, urgent: true });
        break;
      }
      case 'bonusTotal':
        audio.play('bonusTotal');
        dmd({ text: fmt(e.pts), sub: `BONUS X${g.bonusCount ? g.bonusCount.x : 1}`, dur: 0.9, urgent: true });
        break;
      case 'orbit':
        audio.play('orbit');
        dmd({ text: 'ORBIT', sub: '20,000', big: true });
        break;
      case 'comet':
        audio.play('comet');
        sparks(e.x, e.y, 30, ['#fff', C.cyan, '#3fa9ff'], 140);
        shock(e.x, e.y, C.cyan, 40, 0.5);
        flash(0.25, C.cyan);
        dmd({ text: 'COMET', sub: '50,000', big: true, hi: true, urgent: true });
        break;
      case 'shipHit':
        audio.play('shipHit');
        sparks(e.x, e.y, 12, [C.red, '#fff', C.pink]);
        shake(2);
        dmd({ text: `SHIP ${e.hp} HP`, dur: 0.7 });
        break;
      case 'shipKill':
        audio.play('shipKill');
        flash(0.8, C.red);
        shake(8);
        slow(0.6);
        for (let k = 0; k < 5; k++) setTimeout(() => {
          sparks(e.x + (Math.random() - 0.5) * 20, e.y + (Math.random() - 0.5) * 10, 25, ['#fff', C.orange, C.red, C.gold], 150);
          shock(e.x, e.y, C.orange, 50, 0.5);
        }, k * 120);
        dmd({ text: 'MOTHERSHIP DOWN', sub: '500,000', big: true, burst: true, urgent: true, dur: 2.5 });
        alertSr('Mothership destroyed!');
        break;
      case 'hole':
        audio.play('hole');
        shock(e.x, e.y, '#000', 20, 0.5);
        dmd({ text: 'GRAVITY', sub: 'ASSIST X2', big: true, urgent: true });
        break;
      case 'holeOut':
        audio.play('holeOut');
        shock(e.x, e.y, C.gold, 30, 0.4);
        break;
      case 'nudge':
        audio.play('nudge');
        if (!v.reducedMotion) v.nudgeX = (Math.random() < 0.5 ? -1 : 1) * 3;
        break;
      case 'warning':
        audio.play('warning');
        dmd({ text: 'DANGER', big: true, flash: true, urgent: true, dur: 1 });
        break;
      case 'tilt':
        audio.play('tilt');
        dmd({ text: 'TILT', big: true, flash: true, urgent: true, dur: 3 });
        alertSr('Tilt! Flippers are dead until the ball drains.');
        break;
      case 'kickback':
      case 'magna':
        audio.play('kickback');
        flash(0.2, C.green);
        dmd({ text: e.type === 'kickback' ? 'KICKBACK' : 'MAGNA SAVE', big: false, urgent: true, dur: 1 });
        break;
      case 'sectorClear':
        audio.play('clear');
        flash(0.7, '#fff');
        shake(4);
        fireworks(10);
        dmd({ text: 'SECTOR CLEAR', big: true, burst: true, hi: true, urgent: true, dur: 2.2 });
        alertSr(`Sector cleared! Warping to ${sectorFor(g.sector + 1).name}.`);
        v.panel = 'warp';
        break;
      case 'offers':
        v.panel = 'upgrade';
        v.focus = 'up:0';
        alertSr(`Choose an upgrade: ${g.offers.map((id, i) => `${i + 1}: ${UPGRADE_BY_ID[id].name}, ${UPGRADE_BY_ID[id].desc}`).join('. ')}`);
        break;
      case 'upgrade': {
        audio.play('upgrade');
        v.panel = null;
        const s = sectorFor(g.sector);
        dmd({ text: s.name, sub: `TARGET ${fmt(g.target)}`, dur: 2.2, urgent: true });
        if (g.unlock) {
          dmd({ text: 'NEW', sub: UNLOCKS[g.unlock].name, big: true, hi: true, dur: 2 });
          alertSr(`New: ${UNLOCKS[g.unlock].name}. ${UNLOCKS[g.unlock].desc}`);
        }
        break;
      }
      case 'over': {
        audio.play('over');
        const best = store.record(g.score, g.sector);
        v.best = store.high;
        v.newBest = best;
        v.panel = 'over';
        v.focus = 'again';
        dmd({ text: 'GAME OVER', big: true, dur: 3, urgent: true });
        alertSr(`Game over. ${g.score} points, sector ${g.sector}.${best ? ' New high score!' : ''}`);
        break;
      }
      case 'thud':
        audio.play('thud', e.strength);
        break;
      case 'rubber':
        audio.play('rubber');
        break;
      default:
    }
  }
  g.events.length = 0;
}

// ---------------------------------------------------------------- input
const held = { left: false, right: false, launch: false };
let nudgeQueued = false;
const KEYS_LEFT = new Set(['KeyZ', 'ArrowLeft', 'ShiftLeft', 'KeyA']);
const KEYS_RIGHT = new Set(['Slash', 'ArrowRight', 'ShiftRight', 'KeyL', 'KeyD']);
const KEYS_LAUNCH = new Set(['Space', 'Enter', 'ArrowDown', 'KeyS']);
const KEYS_NUDGE = new Set(['ArrowUp', 'KeyW', 'KeyN']);
const openDialogs = () => document.querySelector('dialog[open]') !== null;

function pressStart() {
  if (mode === 'title') startGame();
  else if (v.panel === 'over') activate('again');
}

window.addEventListener('keydown', (e) => {
  if (openDialogs() || e.ctrlKey || e.metaKey || e.altKey) return;
  const c = e.code;
  if (v.panel === 'upgrade') {
    // Picking takes a fresh press, not a key held down since before the cards came up.
    if (['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(c)) moveFocus(-1);
    else if (['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD'].includes(c)) moveFocus(1);
    else if (['Enter', 'Space'].includes(c) && !e.repeat) activate(v.focus);
    else if (['Digit1', 'Digit2', 'Digit3'].includes(c) && !e.repeat) activate(`up:${Number(c.slice(-1)) - 1}`);
    e.preventDefault();
    return;
  }
  if (mode === 'title' || v.panel === 'over') {
    if (['Space', 'Enter'].includes(c)) {
      e.preventDefault();
      if (!e.repeat) pressStart();
    }
    if (c === 'KeyM') toggleSound();
    if (c === 'KeyH') openHelp();
    return;
  }
  if (KEYS_LEFT.has(c)) held.left = true;
  else if (KEYS_RIGHT.has(c)) held.right = true;
  else if (KEYS_LAUNCH.has(c)) {
    // A key still held from the menus (auto-repeating) isn't a pull on the plunger.
    if (!e.repeat) held.launch = true;
  } else if (KEYS_NUDGE.has(c)) {
    if (!e.repeat) nudgeQueued = true;
  } else if (c === 'KeyP' || c === 'Escape') pause();
  else if (c === 'KeyM') toggleSound();
  else if (c === 'KeyH') openHelp();
  else return;
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const c = e.code;
  if (KEYS_LEFT.has(c)) held.left = false;
  if (KEYS_RIGHT.has(c)) held.right = false;
  if (KEYS_LAUNCH.has(c)) held.launch = false;
});

// Touch and mouse: left half flips left, right half flips right. Holding
// anywhere pulls the plunger when a ball is waiting (a quick tap, say to move
// the skill shot lane, only flips). A quick swipe up nudges.
const pointers = new Map();
// Real time, not the game clock, which only moves on a frame (and slow frames would turn taps into holds).
const HOLD = 150; // ms before a touch counts as holding
let tapped = false; // a touch let go before it counted as a hold
const pointerLaunch = () => [...pointers.values()].some((p) => !p.panel && performance.now() - p.down > HOLD);
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
function regionAt(p) {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) return r;
  }
  return null;
}
function syncPointers() {
  held.left = held.right = false;
  for (const p of pointers.values()) {
    if (p.side === 'left') held.left = true;
    else if (p.side === 'right') held.right = true;
  }
}
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  canvas.focus({ preventScroll: true });
  const p = toCanvas(e);
  if (mode === 'title' || v.panel) {
    // Remember which screen it went down on: a touch that began on the warp
    // screen mustn't pick whichever upgrade card appears under it.
    pointers.set(e.pointerId, { panel: v.panel || 'title', ...p });
    return;
  }
  const mid = renderer.L.tx + TW / 2;
  pointers.set(e.pointerId, { side: p.x < mid ? 'left' : 'right', x: p.x, y: p.y, t: clock, down: e.timeStamp });
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic pointers can't be captured.
  }
  syncPointers();
});
canvas.addEventListener('pointermove', (e) => {
  const p = toCanvas(e);
  if (e.pointerType === 'mouse') {
    const r = regionAt(p);
    v.hover = r && r.nav ? r.id : null;
    if (v.hover && v.panel === 'upgrade') v.focus = v.hover;
  }
  const q = pointers.get(e.pointerId);
  if (q && !q.panel && q.y - p.y > 25 && clock - q.t < 0.3) {
    nudgeQueued = true;
    q.t = -9;
  }
});
const endPointer = (e) => {
  const q = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  syncPointers();
  // Judged by the touch's own times: on a slow frame a tap can look like a hold
  // before its release arrives, and then it mustn't fire the plunger.
  if (q && q.side && e.timeStamp - q.down < HOLD) tapped = true;
  if (q && q.panel && q.panel === v.panel && e.type === 'pointerup') {
    const r = regionAt(toCanvas(e));
    if (r) activate(r.id);
  }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let padPrev = {};
// An A press that started the game, picked an upgrade or pressed a menu
// button isn't a pull on the plunger: it has to be let go first.
let padHoldA = false;
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) {
    // Unplugged (maybe mid-press): nothing is held any more.
    padPrev = {};
    return null;
  }
  const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
  const now = { left: b(4) || b(6) || b(14), right: b(5) || b(7) || b(15), a: b(0), b: b(1), start: b(9), nudge: b(3) || b(12), up: b(12), down: b(13) };
  const pressed = (k) => now[k] && !padPrev[k];
  if (!now.a) padHoldA = false;
  if (pressed('a') && (openDialogs() || mode === 'title' || v.panel)) padHoldA = true;
  if (openDialogs()) padMenu(pressed);
  else if (v.panel === 'upgrade') {
    if (pressed('up')) moveFocus(-1);
    if (pressed('down')) moveFocus(1);
    if (pressed('a')) activate(v.focus);
  } else if (mode === 'title' || v.panel === 'over') {
    if (pressed('a') || pressed('start')) pressStart();
  } else {
    if (pressed('nudge')) nudgeQueued = true;
    if (pressed('start')) pause();
  }
  padPrev = now;
  return now;
}

/** The pause and help menus on a gamepad: the D-pad moves, A presses, B or Start closes. */
function padMenu(pressed) {
  const dlg = document.querySelector('dialog[open]');
  if (pressed('b') || pressed('start')) {
    dlg.close(dlg === pauseDlg ? 'resume' : 'close');
    return;
  }
  const items = [...dlg.querySelectorAll('button, input')];
  const i = items.indexOf(document.activeElement);
  const go = (k) => items[(k + items.length) % items.length].focus({ focusVisible: true });
  if (pressed('up') || pressed('left')) go(Math.max(0, i) - 1);
  else if (pressed('down') || pressed('right')) go(i + 1);
  else if (pressed('a') && i >= 0) items[i].click();
}

function moveFocus(d) {
  const ids = regions.filter((r) => r.nav).map((r) => r.id);
  if (!ids.length) return;
  const i = Math.max(0, ids.indexOf(v.focus));
  v.focus = ids[(i + d + ids.length) % ids.length];
  audio.play('move');
}

function activate(id) {
  if (!id) return;
  audio.unlock();
  if (id === 'start') startGame();
  else if (id === 'again') startGame();
  else if (id.startsWith('up:')) {
    if (pickUpgrade(game, Number(id.slice(3)))) {
      held.launch = false;
      audio.play('select');
      onEvents(game);
    }
  }
}

// ---------------------------------------------------------------- menus
const pauseDlg = document.getElementById('pause');
const helpDlg = document.getElementById('help');
function pause() {
  if (paused || mode !== 'play' || game.phase === 'over') return;
  paused = true;
  audio.suspend();
  held.left = held.right = held.launch = false;
  pauseDlg.returnValue = '';
  if (!pauseDlg.open) pauseDlg.showModal();
}
function resume() {
  paused = false;
  audio.resume();
  canvas.focus({ preventScroll: true });
}
pauseDlg.addEventListener('close', () => {
  if (pauseDlg.returnValue === 'quit') toTitle();
  resume();
});
document.getElementById('btn-pause').addEventListener('click', () => pause());
function toggleSound() {
  store.settings.muted = !store.settings.muted;
  store.save();
  audio.unlock();
  audio.setMuted(store.settings.muted);
  syncSound();
  document.getElementById('opt-sound').checked = !store.settings.muted;
}
soundBtn.addEventListener('click', toggleSound);
let pausedForHelp = false;
function openHelp() {
  if (helpDlg.open) return;
  pausedForHelp = mode === 'play' && !paused;
  if (pausedForHelp) {
    paused = true;
    audio.suspend();
  }
  document.getElementById('opt-sound').checked = !store.settings.muted;
  document.getElementById('opt-music').checked = !!store.settings.music;
  document.getElementById('opt-relaxed').checked = !!store.settings.relaxed;
  document.getElementById('opt-motion').checked = v.reducedMotion;
  helpDlg.showModal();
}
helpDlg.addEventListener('close', () => {
  if (pausedForHelp) resume();
  pausedForHelp = false;
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
document.getElementById('opt-relaxed').addEventListener('change', (e) => {
  store.settings.relaxed = e.target.checked;
  store.save();
});
document.getElementById('opt-motion').addEventListener('change', (e) => {
  store.settings.reducedMotion = e.target.checked;
  store.save();
  applyMotion();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', () => {
  // Keys and fingers held as the window lost focus never report letting go.
  held.left = held.right = held.launch = false;
  pointers.clear();
  pause();
});

// ---------------------------------------------------------------- loop
function tick() {
  let input;
  if (mode === 'title' || AUTO) input = autopilot(game, 0.97);
  else {
    const pad = padPrev;
    input = { left: held.left || !!pad.left, right: held.right || !!pad.right, launch: held.launch || pointerLaunch() || (!!pad.a && !padHoldA), tap: tapped, nudge: nudgeQueued };
    tapped = false;
    nudgeQueued = false;
  }
  step(game, input);
  perf.steps++;
  onEvents(game);
  if (mode === 'title' && game.phase === 'over') toTitle();
}

function updateEffects(dt) {
  for (const p of v.particles) {
    p.life += dt;
    p.vy += (p.g || 0) * dt;
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
  }
  v.particles = v.particles.filter((p) => p.life < p.max);
  if (v.particles.length > 500) v.particles.splice(0, v.particles.length - 500);
  v.popups = v.popups.filter((p) => clock - p.t0 < 1.1);
  v.flash = Math.max(0, v.flash - dt * 2.2);
  v.shake = Math.max(0, v.shake - dt * 14);
  v.nudgeX *= Math.pow(0.001, dt);
  v.lightShow = Math.max(0, v.lightShow - dt);
  // Ball trails.
  const ids = new Set();
  for (const b of game.balls) {
    ids.add(b.id);
    const tr = (v.trails[b.id] ||= []);
    tr.push({ x: b.x, y: b.y });
    if (tr.length > 8) tr.shift();
  }
  for (const id of Object.keys(v.trails)) if (!ids.has(Number(id))) delete v.trails[id];
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  pollPad();
  const t0 = performance.now();
  if (!paused) {
    const tscale = slowmo > 0 ? 0.35 : 1;
    slowmo = Math.max(0, slowmo - rdt);
    clock += rdt;
    acc += rdt * SPEED * tscale;
    let n = 0;
    while (acc >= DT && n < 12) {
      acc -= DT;
      tick();
      n++;
    }
    if (n === 12) acc = 0;
    updateEffects(rdt);
  }
  v.time = clock;
  // Music: calm on the title, driving in play, frantic in multiball and supernova.
  const heat = mode !== 'play' ? 0 : game.supernovaT > 0 ? 1 : game.multiball ? 0.75 : Math.min(0.5, game.combo * 0.1 + (game.mass / 100) * 0.3);
  audio.setHeat(heat);
  audio.setHum(mode === 'play' ? game.mass / 100 : 0.1);
  const ballSpeed = mode === 'play' ? Math.max(0, ...game.balls.map((b) => (b.held ? 0 : Math.hypot(b.vx, b.vy)))) : 0;
  audio.setMotor(Math.min(1, ballSpeed / 700));
  const live = mode === 'play' && (game.phase === 'play' || game.phase === 'launch');
  audio.setTease(live && game.mass > 70 && game.supernovaT === 0, (game.mass - 70) / 30);
  audio.update();
  regions = renderer.draw(ctx, game, v);
  perf.frames++;
  perf.worst = Math.max(perf.worst, performance.now() - t0);
}

titleHint();
renderer.tableArt(game); // paint the first table before the first frame
requestAnimationFrame(frame);

if (TEST) {
  window.__pin = {
    perf,
    store,
    snapshot: () => ({ ...snapshot(game), mode, panel: v.panel, paused, scale, RS, W, H }),
    game: () => game,
    view: () => v,
    regions: () => regions,
    act: (id) => activate(id),
    layout: () => ({ ...renderer.L, TW, TH, LANE_X, PLUNGER }),
  };
}
