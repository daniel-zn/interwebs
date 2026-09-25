import { SoundEngine } from './audio.js';
import { Renderer } from './render.js';
import { CALLS, OBJECTS, SESSION, createRun, demoPilot, snapshot, step, steerToward } from './sim.js';
import { loadStore } from './storage.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SPEED = params.has('fast') ? 2.5 : 1;
const LENGTH = params.has('session') ? Math.max(10, Number(params.get('session')) || SESSION) : SESSION;
let seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Date.now() ^ (Math.random() * 1e9)) >>> 0;

const store = loadStore();
if (store.settings.reducedMotion === null) {
  store.settings.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const audio = new SoundEngine();
audio.setMuted(store.settings.muted);
const ui = new UI();
const renderer = new Renderer(seed);
ui.setState('title');

// ---------------------------------------------------------------- state
// 'title' (a demo pilot flies behind the logo) -> 'fly' -> 'ending' (the sun
// sets and the astronaut raises a toast) -> 'end' (result card) -> 'fly' ...
let state = 'title';
let run = createRun({ seed: seed ^ 0xabc, gentle: false });
let demoMem = {};
let paused = false;
let endShownAt = 0;
let endTimer = 0;
let lastResult = null;
let lastTurn = 0;

// ---------------------------------------------------------------- sizing
// Render at a low internal resolution and scale by a whole number of device
// pixels, so every game pixel is a crisp square on any screen.
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = Math.round(window.innerWidth * dpr), vh = Math.round(window.innerHeight * dpr);
  const minW = vw < vh ? 220 : 320;
  scale = Math.max(1, Math.floor(Math.min(vw / minW, vh / 180)));
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

// ---------------------------------------------------------------- flow
function startRun() {
  audio.unlock();
  ui.hideResult();
  run = createRun({ seed: seed++, gentle: store.settings.gentle, session: LENGTH });
  renderer.clearTrail();
  renderer.setPose('sip', 1.4);
  state = 'fly';
  paused = false;
  releaseAll();
  ui.setState('fly');
  audio.canOpen();
  canvas.focus({ preventScroll: true });
  ui.alert(`Kite up${store.settings.gentle ? ', gentle mode' : ''}. The sun sets in ${LENGTH === SESSION ? 'two and a half minutes' : `${LENGTH} seconds`}.`, 'start', 0);
}

function showResult() {
  state = 'end';
  endShownAt = performance.now();
  ui.setState('end');
  ui.showResult(lastResult.result, store, lastResult.isBest);
}

const canRestart = () => state === 'end' && performance.now() - endShownAt > 350;

// ---------------------------------------------------------------- input
// Keys spin the kite; a held pointer (or the stick) steers its nose towards a
// point; a tap, Space or A tugs the lines for a burst of speed.
const held = { left: new Set(), right: new Set() };
const pointers = new Map();
let aim = null; // world point the held pointer is steering towards
let tugQueued = false;
let pad = { turn: null, a: false, start: false };
const LEFT_KEYS = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT_KEYS = new Set(['ArrowRight', 'd', 'D']);
const TUG_KEYS = new Set([' ', 'ArrowUp', 'w', 'W', 'Enter']);
const openDialogs = () => document.querySelector('dialog[open]') !== null;
const isControl = (el) => el && el !== canvas && el.closest && el.closest('button, input, a, dialog, select, textarea');

function currentTurn() {
  if (pad.turn !== null) return pad.turn;
  if (aim) return steerToward(run, aim.x, aim.y);
  const l = held.left.size > 0, r = held.right.size > 0;
  return l === r ? 0 : l ? 1 : -1;
}

function releaseAll() {
  held.left.clear();
  held.right.clear();
  pointers.clear();
  aim = null;
  tugQueued = false;
}

function toWorld(e) {
  const rect = canvas.getBoundingClientRect();
  return renderer.toWorld(((e.clientX - rect.left) * canvas.width) / rect.width, ((e.clientY - rect.top) * canvas.height) / rect.height);
}

function updateAim() {
  let latest = null;
  for (const p of pointers.values()) if (p.steer && (!latest || p.t0 > latest.t0)) latest = p;
  aim = latest ? latest.at : null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || openDialogs()) return;
  ui.setMode(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'pointer');
  canvas.setPointerCapture?.(e.pointerId);
  e.preventDefault();
  audio.unlock();
  if (state === 'title') {
    startRun();
    return;
  }
  if (state === 'end') {
    if (canRestart()) startRun();
    return;
  }
  if (state !== 'fly') return;
  // A second finger while one is steering is a tug.
  if (pointers.size) tugQueued = true;
  pointers.set(e.pointerId, { t0: performance.now(), x: e.clientX, y: e.clientY, at: toWorld(e), steer: false });
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.at = toWorld(e);
  if (!p.steer && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) p.steer = true;
  updateAim();
});
const up = (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (!p.steer && performance.now() - p.t0 < 220 && state === 'fly') tugQueued = true;
  updateAim();
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('lostpointercapture', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (openDialogs()) return;
  const k = e.key;
  const control = isControl(e.target);
  if ((LEFT_KEYS.has(k) || RIGHT_KEYS.has(k) || TUG_KEYS.has(k)) && !control) {
    e.preventDefault();
    ui.setMode('key');
    audio.unlock();
    if (!e.repeat && TUG_KEYS.has(k)) {
      if (state === 'title' || canRestart()) {
        startRun();
        return;
      }
      if (state === 'fly') tugQueued = true;
    }
    if (state === 'fly') {
      if (LEFT_KEYS.has(k)) held.left.add(k.toLowerCase());
      if (RIGHT_KEYS.has(k)) held.right.add(k.toLowerCase());
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const lk = k.toLowerCase();
  if (lk === 'p' || k === 'Escape') {
    if (state === 'fly') pause();
  } else if (lk === 'm') toggleSound();
  else if (lk === 'h' || k === '?') openHelp();
  else if (lk === 'r' && state !== 'title') startRun();
});
window.addEventListener('keyup', (e) => {
  held.left.delete(e.key.toLowerCase());
  held.right.delete(e.key.toLowerCase());
});
window.addEventListener('blur', releaseAll);

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let turn = null, a = false, start = false;
  for (const p of pads) {
    if (!p) continue;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (b(14) || b(4)) turn = 1;
    else if (b(15) || b(5)) turn = -1;
    else if (Math.hypot(ax, ay) > 0.45) {
      // The stick points where the kite should head.
      turn = steerToward(run, run.k.x + ax * 30, run.k.y - ay * 30);
    }
    a = a || b(0);
    start = start || b(9);
  }
  if (turn !== null || a || start) ui.setMode('pad');
  if (a && !pad.a && !openDialogs()) {
    audio.unlock();
    if (state === 'title' || canRestart()) startRun();
    else if (state === 'fly') tugQueued = true;
  }
  if (start && !pad.start) {
    if (state === 'fly' && !paused) pause();
    else if (paused) document.getElementById('pause').close('resume');
  }
  pad = { turn: state === 'fly' ? turn : null, a, start };
}

// ---------------------------------------------------------------- menus & settings
const soundBtn = document.getElementById('btn-sound');
const optSound = document.getElementById('opt-sound');
const optGentle = document.getElementById('opt-gentle');
const optMotion = document.getElementById('opt-motion');
const pauseDlg = document.getElementById('pause');
const helpDlg = document.getElementById('help');

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

function pause() {
  if (paused || state !== 'fly') return;
  paused = true;
  releaseAll();
  if (!pauseDlg.open) pauseDlg.showModal();
  ui.alert('Paused.', 'pause', 0);
}

function openHelp() {
  if (helpDlg.open) return;
  if (pauseDlg.open) pauseDlg.close('help');
  releaseAll();
  if (state === 'fly') paused = true;
  helpDlg.showModal();
  audio.click();
}

pauseDlg.addEventListener('close', () => {
  const v = pauseDlg.returnValue;
  pauseDlg.returnValue = '';
  if (v === 'help') return;
  if (v === 'restart') startRun();
  else resume();
});
helpDlg.addEventListener('close', () => resume());
function resume() {
  if (openDialogs()) return;
  paused = false;
  last = performance.now();
  canvas.focus({ preventScroll: true });
}
for (const dlg of [pauseDlg, helpDlg]) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
}

document.getElementById('btn-pause').addEventListener('click', () => (state === 'fly' ? pause() : null));
document.getElementById('btn-help').addEventListener('click', openHelp);
// Tapping anywhere on the result card flies again, like the hint says.
document.getElementById('result').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  ui.setMode(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'pointer');
  e.preventDefault();
  if (canRestart()) startRun();
});
document.getElementById('btn-again').addEventListener('click', () => {
  if (canRestart()) startRun();
});
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
syncSettings();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseAll();
    if (state === 'fly') pause();
    audio.suspend();
  } else {
    audio.resume();
    last = performance.now();
  }
});

// ---------------------------------------------------------------- events
function handleEvents() {
  const rm = store.settings.reducedMotion;
  const live = state !== 'title';
  for (const e of run.events) {
    if (!live) continue;
    renderer.onEvent(e, run, rm);
    switch (e.type) {
      case 'trick':
        if (e.kind === 'ring' || e.kind === 'chain') audio.ring(e.count);
        else if (e.kind.startsWith('orbit')) audio.orbit();
        else audio.trick(e.count, e.flare);
        ui.alert(`${e.name.toLowerCase()}, ${e.pts} points.`, 'trick', 700);
        break;
      case 'bank':
        audio.bank(e.total);
        ui.alert(`Combo banked: ${e.total} points.`, 'bank', 0);
        break;
      case 'drop':
        if (e.pts) {
          audio.drop();
          ui.alert('Combo lost.', 'drop', 1500);
        }
        break;
      case 'crash':
        audio.crash();
        ui.alert('Crashed into the dust. Relaunching.', 'crash', 2000);
        break;
      case 'scrape':
        audio.bonk();
        ui.alert('Scraped the ground.', 'crash', 2000);
        break;
      case 'bonk':
        audio.bonk();
        ui.alert(`Bonk! The kite hit ${OBJECTS[e.kind].say}.`, 'bonk', 2000);
        break;
      case 'relaunch': audio.relaunch(); break;
      case 'tug': audio.tug(); break;
      case 'rings': ui.alert('Flux rings ahead. Fly through them.', 'rings', 5000); break;
      case 'incoming':
        audio.incoming(e.kind);
        ui.alert(e.kind === 'flare' ? 'Solar flare incoming: tricks will score double.' : 'Wind lull incoming: stay low and central.', 'weather', 3000);
        break;
      case 'weather': if (e.kind === 'flare') audio.flare(); break;
      case 'call':
        audio.radio();
        ui.alert(`Radio: give us ${CALLS[e.kind].say}!`, 'call', 0);
        break;
      case 'callDone':
        audio.callDone();
        ui.alert(`Radio: nice one! Plus ${e.pts}.`, 'call', 0);
        break;
      case 'end': {
        const result = { ...run.result, gentle: run.gentle };
        const isBest = store.record(result);
        lastResult = { result, isBest };
        state = 'ending';
        ui.setState('ending');
        releaseAll();
        audio.end();
        ui.alert('The sun has set. Cheers!', 'end', 0);
        endTimer = 2.8;
        break;
      }
    }
  }
  run.events.length = 0;
}

// ---------------------------------------------------------------- loop
const perf = { frames: 0, work: 0, max: 0 };
let last = performance.now();
let lastPose = 'rest';
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const t0 = performance.now();
  pollGamepad();
  // A pointer held still for a moment starts steering too (a quick tap is a tug).
  for (const p of pointers.values()) {
    if (!p.steer && now - p.t0 > 180) {
      p.steer = true;
      updateAim();
    }
  }
  if (ui.state === 'fly') ui.refreshHint();
  if (!paused) {
    let simDt = dt * SPEED;
    const turn = state === 'title' ? demoPilot(run, demoMem) : state === 'fly' ? currentTurn() : 0;
    lastTurn = turn;
    let tug = state === 'fly' && tugQueued;
    tugQueued = false;
    while (simDt > 1e-6) {
      const h = Math.min(simDt, 1 / 120);
      // Pointer aim is re-evaluated every substep so the kite curves smoothly.
      step(run, h, { turn: aim && state === 'fly' && pad.turn === null ? steerToward(run, aim.x, aim.y) : turn, tug });
      tug = false;
      simDt -= h;
    }
    handleEvents();
    if (state === 'title' && run.t > 60) {
      run = createRun({ seed: (seed ^ run.seed) + 1, gentle: false });
      demoMem = {};
      renderer.clearTrail();
    }
    if (state === 'ending') {
      endTimer -= dt;
      if (endTimer <= 0) showResult();
    }
  }
  if (renderer.pose !== lastPose) {
    lastPose = renderer.pose;
    if (lastPose === 'sip' && state === 'fly') audio.sip();
  }
  const flying = state === 'fly' && run.phase === 'fly' && !paused;
  renderer.draw(ctx, dt, {
    run, mode: state === 'title' ? 'title' : 'fly', rm: store.settings.reducedMotion, paused,
    best: store.best, inputMode: ui.mode,
  });
  audio.tick(dt, flying ? {
    wind: run.wind, speed: Math.min(1, run.k.state === 'fly' ? run.k.s / 60 : 0), turn: Math.abs(lastTurn),
    flare: run.flareMul > 1, left: run.session - run.t,
  } : null);
  const work = performance.now() - t0;
  perf.frames++;
  perf.work += work;
  perf.max = Math.max(perf.max, work);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (TEST) {
  window.__kite = {
    get run() { return run; },
    get state() { return state; },
    get paused() { return paused; },
    get scale() { return scale; },
    get turn() { return currentTurn(); },
    snapshot: () => ({ ...snapshot(run), state, paused }),
    /** World point -> page coordinates, for driving the pointer in tests. */
    toClient(x, y) {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (renderer.sx(x) * rect.width) / canvas.width, y: rect.top + (renderer.sy(y) * rect.height) / canvas.height };
    },
    store, perf, renderer,
  };
}
