import { SoundEngine } from './audio.js';
import { Game } from './game.js';
import { SCENE_BOTTOM, SCENE_TOP } from './layout.js';
import { Scene } from './scene.js';
import { loadStore } from './storage.js';
import { UI } from './ui.js';
import { mulberry32 } from './util.js';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
const store = loadStore();
if (store.settings.reducedMotion === null) {
  store.settings.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const audio = new SoundEngine();
audio.setMuted(store.settings.muted);
const ui = new UI(store);
const game = new Game({ audio, ui, store, rng: mulberry32(seed), fast: params.has('fast') });
const scene = new Scene(seed);
ui.onState('title');

// ---------------------------------------------------------------- sizing
// Render at a low internal resolution and scale by a whole number of device
// pixels, so every game pixel is a crisp square on any screen.
const MIN_W = 204; // the bubble may crop slightly on narrow screens; the island never does
const MIN_H = SCENE_BOTTOM - SCENE_TOP + 16;
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = Math.round(window.innerWidth * dpr), vh = Math.round(window.innerHeight * dpr);
  scale = Math.max(1, Math.floor(Math.min(vw / MIN_W, vh / MIN_H)));
  const W = Math.ceil(vw / scale), H = Math.ceil(vh / scale);
  if (W === canvas.width && H === canvas.height && scene.bg) return;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${(W * scale) / dpr}px`;
  canvas.style.height = `${(H * scale) / dpr}px`;
  ctx.imageSmoothingEnabled = false;
  scene.resize(W, H);
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

// ---------------------------------------------------------------- input
const openDialogs = () => document.querySelector('dialog[open]') !== null;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || openDialogs()) return;
  ui.setMode(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'pointer');
  canvas.setPointerCapture?.(e.pointerId);
  e.preventDefault();
  game.press();
});
const up = (e) => {
  if (e.button !== undefined && e.button !== 0 && e.type !== 'pointercancel') return;
  game.release();
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// The catch card sits above the canvas; taps on it keep fishing too.
document.getElementById('card').addEventListener('pointerdown', (e) => {
  ui.setMode(e.pointerType === 'touch' ? 'touch' : 'pointer');
  e.preventDefault();
  game.press();
});
document.getElementById('card').addEventListener('pointerup', () => game.release());

const ACTION_KEYS = new Set([' ', 'Enter']);
const isControl = (el) => el && el !== canvas && el.closest && el.closest('button, input, a, dialog, select, textarea');

window.addEventListener('keydown', (e) => {
  if (openDialogs()) return;
  if (ACTION_KEYS.has(e.key) && !isControl(e.target)) {
    e.preventDefault();
    if (e.repeat) return;
    ui.setMode('key');
    game.press();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'j') openDialog('journal');
  else if (k === 'm') toggleSound();
  else if (k === 'h' || k === '?') openDialog('help');
});
window.addEventListener('keyup', (e) => {
  if (ACTION_KEYS.has(e.key)) game.release();
});
window.addEventListener('blur', () => game.cancelInput());

// ---------------------------------------------------------------- HUD & dialogs
const soundBtn = document.getElementById('btn-sound');
const optSound = document.getElementById('opt-sound');
const optGentle = document.getElementById('opt-gentle');
const optMotion = document.getElementById('opt-motion');

function syncSettings() {
  const s = store.settings;
  soundBtn.setAttribute('aria-pressed', String(!s.muted));
  soundBtn.dataset.on = String(!s.muted);
  soundBtn.setAttribute('aria-label', s.muted ? 'Sound is off. Turn sound on (M)' : 'Sound is on. Turn sound off (M)');
  optSound.checked = !s.muted;
  optGentle.checked = s.gentle;
  optMotion.checked = s.reducedMotion;
  document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
}

function toggleSound(force) {
  store.settings.muted = force === undefined ? !store.settings.muted : !force;
  audio.unlock();
  audio.setMuted(store.settings.muted);
  store.save();
  syncSettings();
  audio.click();
}

function openDialog(id) {
  const dlg = document.getElementById(id);
  if (dlg.open) return;
  game.cancelInput();
  if (id === 'journal') ui.renderJournal();
  dlg.showModal();
  game.paused = true;
  audio.click();
}

for (const dlg of document.querySelectorAll('dialog')) {
  dlg.addEventListener('close', () => {
    if (!openDialogs()) {
      game.paused = false;
      canvas.focus({ preventScroll: true });
    }
  });
  // Clicking the backdrop closes the dialog.
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
}

document.getElementById('btn-journal').addEventListener('click', () => openDialog('journal'));
document.getElementById('btn-help').addEventListener('click', () => openDialog('help'));
soundBtn.addEventListener('click', () => toggleSound());
optSound.addEventListener('change', () => toggleSound(optSound.checked));
optGentle.addEventListener('change', () => {
  store.settings.gentle = optGentle.checked;
  store.save();
});
optMotion.addEventListener('change', () => {
  store.settings.reducedMotion = optMotion.checked;
  store.save();
  syncSettings();
});
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('Clear your fish journal? This cannot be undone.')) return;
  store.resetJournal();
  ui.updateStats();
});
syncSettings();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.cancelInput();
    audio.suspend();
  } else {
    audio.resume();
    last = performance.now();
  }
});

// ---------------------------------------------------------------- loop
const perf = { frames: 0, work: 0 };
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const t0 = performance.now();
  if (!game.paused) {
    game.update(dt);
    scene.update(dt, game);
  }
  scene.draw(ctx, game);
  audio.tick(dt);
  perf.frames++;
  perf.work += performance.now() - t0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has('test')) {
  window.__pond = { game, scene, store, perf, get scale() { return scale; } };
}
