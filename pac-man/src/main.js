import { SoundEngine } from './audio.js';
import { MH, MW, Renderer } from './render.js';
import { DOWN, DT, LEFT, NONE, RIGHT, UP, createGame, demoPilot, snapshot, step } from './sim.js';
import { loadStore } from './storage.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SPEED = params.has('fast') ? 3 : 1;
const START_LEVEL = Math.max(1, Number(params.get('level')) || 1);
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
const renderer = new Renderer();

// ---------------------------------------------------------------- state
// 'title': the attract demo plays itself behind PRESS START.
// 'play': a real game, which drops back to the title a few seconds after GAME OVER.
let state = 'title';
let game = demoGame();
let paused = false;
let clock = 0;
let overShownAt = 0;
const perf = { frames: 0, steps: 0, worst: 0 };

// ---------------------------------------------------------------- sizing
// Scale by a whole number of device pixels so every game pixel is a crisp
// square. Portrait screens fit a 224 x 288 layout (scores above and below the
// maze); landscape ones fit 360 x 248 (scores beside it).
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = Math.round(window.innerWidth * dpr), vh = Math.round(window.innerHeight * dpr);
  const fit = (w, h) => Math.floor(Math.min(vw / w, vh / h));
  scale = Math.max(1, fit(MW, MH + 40), fit(MW + 136, MH + 8));
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
const touchFirst = matchMedia('(pointer: coarse)').matches;
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
function titleHint() {
  setHint(touchFirst ? 'Tap to play · swipe to steer' : 'Press Enter to play · arrow keys steer', 'title');
}
function applyMotion() {
  document.documentElement.classList.toggle('reduced-motion', !!store.settings.reducedMotion);
}
applyMotion();

const soundBtn = document.getElementById('btn-sound');
function syncSound() {
  soundBtn.dataset.on = String(!store.settings.muted);
  soundBtn.setAttribute('aria-pressed', String(!store.settings.muted));
}
syncSound();

// ---------------------------------------------------------------- flow
function startGame() {
  audio.unlock();
  game = createGame({ seed: seed++, level: START_LEVEL, relaxed: store.settings.relaxed });
  state = 'play';
  paused = false;
  pendingDir = NONE;
  setHint(store.games ? '' : touchFirst ? 'Swipe to steer' : 'Arrow keys steer');
  audio.play('intro');
  canvas.focus({ preventScroll: true });
  alertSr(`Game started${store.settings.relaxed ? ' at relaxed speed' : ''}. Three lives.`);
}

/** The attract demo: one life, and no waiting for the intro tune. */
function demoGame() {
  const g = createGame({ seed: seed++, lives: 1 });
  g.phaseT = 1;
  return g;
}

function toTitle() {
  state = 'title';
  paused = false;
  game = demoGame();
  audio.setBed(null, 0);
  titleHint();
}

function onEvents(g) {
  if (state !== 'play') return;
  for (const e of g.events) {
    if (e !== 'intro') audio.play(e);
    switch (e) {
      case 'go':
        if (hint.textContent && !hint.classList.contains('title')) setTimeout(() => state === 'play' && game.phase === 'play' && setHint(''), 2500);
        break;
      case 'caught':
        alertSr(g.lives > 1 ? `Caught! ${g.lives - 1} ${g.lives - 1 === 1 ? 'life' : 'lives'} left.` : 'Caught!');
        break;
      case 'clear':
        alertSr(`Level ${g.level} cleared.`);
        break;
      case 'extra':
        alertSr('Extra life!');
        break;
      case 'over': {
        const best = store.record(g.score);
        overShownAt = clock;
        setHint(touchFirst ? 'Tap to play again' : 'Press Enter to play again', 'title');
        alertSr(`Game over. Score ${g.score}${best ? ', a new high score' : ''}.`);
        break;
      }
      default:
    }
  }
}

// ---------------------------------------------------------------- input
const KEY_DIRS = {
  ArrowUp: UP, ArrowLeft: LEFT, ArrowDown: DOWN, ArrowRight: RIGHT,
  w: UP, a: LEFT, s: DOWN, d: RIGHT, W: UP, A: LEFT, S: DOWN, D: RIGHT,
};
let pendingDir = NONE;
const openDialogs = () => document.querySelector('dialog[open]') !== null;
const isControl = (el) => el && el !== canvas && el.closest && el.closest('button, input, a, dialog, select, textarea');

function pressStart() {
  if (state === 'title') startGame();
  else if (game.phase === 'over' && clock - overShownAt > 0.6) startGame();
}

window.addEventListener('keydown', (e) => {
  if (openDialogs() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key in KEY_DIRS && !isControl(e.target)) {
    e.preventDefault();
    audio.unlock();
    pendingDir = KEY_DIRS[e.key];
    return;
  }
  switch (e.key) {
    case 'Enter':
    case ' ':
      if (isControl(e.target)) return;
      e.preventDefault();
      pressStart();
      break;
    case 'p': case 'P': case 'Escape':
      if (state === 'play' && game.phase !== 'over') {
        e.preventDefault();
        pause();
      }
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

// Swipes: every 14 CSS pixels of drag in one direction steers that way, so you
// can keep a finger down and steer continuously. A tap starts a game.
let swipe = null;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  canvas.focus({ preventScroll: true });
  swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic pointers can't be captured; swipes still work.
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
  pendingDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP;
  swipe.x = e.clientX;
  swipe.y = e.clientY;
  swipe.moved = true;
});
const endSwipe = (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  if (!swipe.moved && e.type === 'pointerup') pressStart();
  swipe = null;
};
canvas.addEventListener('pointerup', endSwipe);
canvas.addEventListener('pointercancel', endSwipe);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let padPrev = { a: false, start: false };
let padDir = NONE;
function pollPad() {
  padDir = NONE;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) return;
  const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  if (b(12)) padDir = UP;
  else if (b(13)) padDir = DOWN;
  else if (b(14)) padDir = LEFT;
  else if (b(15)) padDir = RIGHT;
  else if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.5) padDir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? RIGHT : LEFT) : ay > 0 ? DOWN : UP;
  const a = b(0), start = b(9);
  if (!openDialogs()) {
    if ((a && !padPrev.a) || (start && !padPrev.start && state !== 'play')) pressStart();
    else if (start && !padPrev.start && state === 'play' && game.phase !== 'over') pause();
  }
  padPrev = { a, start };
}

// ---------------------------------------------------------------- menus
const pauseDlg = document.getElementById('pause');
const helpDlg = document.getElementById('help');

function pause() {
  if (paused || state !== 'play') return;
  paused = true;
  audio.suspend();
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
document.getElementById('btn-pause').addEventListener('click', () => (state === 'play' && game.phase !== 'over' ? pause() : null));

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
  pausedForHelp = state === 'play' && !paused;
  if (pausedForHelp) {
    paused = true;
    audio.suspend();
  }
  document.getElementById('opt-sound').checked = !store.settings.muted;
  document.getElementById('opt-relaxed').checked = !!store.settings.relaxed;
  document.getElementById('opt-motion').checked = !!store.settings.reducedMotion;
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
  if (document.hidden && state === 'play' && game.phase !== 'over') pause();
});
window.addEventListener('blur', () => {
  if (!TEST && state === 'play' && game.phase !== 'over' && game.phase !== 'ready') pause();
});

// ---------------------------------------------------------------- loop
function tick() {
  let want = NONE;
  if (state === 'title') {
    want = demoPilot(game);
  } else {
    want = pendingDir !== NONE ? pendingDir : padDir;
    pendingDir = NONE;
  }
  step(game, want);
  perf.steps++;
  onEvents(game);
  if (state === 'title' && game.phase === 'over' && game.phaseT > 2) toTitle();
  if (state === 'play' && game.phase === 'over' && game.phaseT > 12) toTitle();
}

function bedFor(g) {
  if (state !== 'play' || g.phase !== 'play') return null;
  if (g.ghosts.some((gh) => gh.state === 'eyes' || gh.state === 'entering')) return 'eyes';
  if (g.frightT > 0) return 'fright';
  return 'siren';
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  pollPad();
  const t0 = performance.now();
  if (!paused) {
    clock += dt;
    acc += dt * SPEED;
    let n = 0;
    while (acc >= DT && n < 20) {
      acc -= DT;
      tick();
      n++;
    }
    if (n === 20) acc = 0;
  }
  audio.setBed(paused ? null : bedFor(game), clock, game.dotsLeft);
  renderer.draw(ctx, game, {
    mode: state,
    high: store.high,
    time: clock,
    reducedMotion: !!store.settings.reducedMotion,
  });
  perf.frames++;
  perf.worst = Math.max(perf.worst, performance.now() - t0);
}

titleHint();
requestAnimationFrame(frame);

if (TEST) {
  window.__pac = {
    perf,
    snapshot: () => ({ ...snapshot(game), state, paused, scale }),
    game: () => game,
    store,
  };
}
