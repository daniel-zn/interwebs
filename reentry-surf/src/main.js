import { SoundEngine } from './audio.js';
import { Renderer } from './render.js';
import { createRun, hotAt, snapshot, speedN, step } from './sim.js';
import { loadStore } from './storage.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const SPEED = params.has('fast') ? 2.5 : 1;
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
// 'title' (a demo ride plays behind the logo) -> 'ride' -> 'ending' (the
// burn-up / skip-off / chute plays out) -> 'end' (result card) -> 'ride' ...
let state = 'title';
let run = createRun({ seed: seed ^ 0xabc, gentle: false });
let demoMem = {};
let paused = false;
let endShownAt = 0;
let endTimer = 0;
let lastResult = null;

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
  run = createRun({ seed: seed++, gentle: store.settings.gentle });
  renderer.camAlt = null;
  state = 'ride';
  paused = false;
  ui.setState('ride');
  audio.dropIn();
  canvas.focus({ preventScroll: true });
  ui.alert(store.settings.gentle ? 'Dropping in, gentle mode.' : 'Dropping in.', 'start', 0);
}

function showResult() {
  state = 'end';
  endShownAt = performance.now();
  ui.setState('end');
  ui.showResult(lastResult.result, store, lastResult.isBest);
}

const canRestart = () => state === 'end' && performance.now() - endShownAt > 350;

/** The demo rider on the title screen: a simple "hold above the middle" pilot. */
function autopilot(r, mem) {
  const d = r.alt - hotAt(r, r.x + 20);
  const predicted = d + r.vy * 0.6;
  const target = r.width * 0.5;
  if (!mem.holding && predicted > target + 2) mem.holding = true;
  else if (mem.holding && predicted < target - 1.5) mem.holding = false;
  return mem.holding ? -1 : 0;
}

// ---------------------------------------------------------------- input
const held = { pointers: new Set(), dive: new Set(), pull: new Set() };
let pad = { value: 0, a: false, start: false };
const DIVE_KEYS = new Set([' ', 'ArrowDown', 's', 'S']);
const PULL_KEYS = new Set(['ArrowUp', 'w', 'W']);
const openDialogs = () => document.querySelector('dialog[open]') !== null;
const isControl = (el) => el && el !== canvas && el.closest && el.closest('button, input, a, dialog, select, textarea');

function currentInput() {
  let v = 0;
  if (held.pointers.size || held.dive.size) v = -1;
  else if (held.pull.size) v = 1;
  if (Math.abs(pad.value) > Math.abs(v)) v = pad.value;
  return v;
}

function releaseAll() {
  held.pointers.clear();
  held.dive.clear();
  held.pull.clear();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || openDialogs()) return;
  ui.setMode(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'pointer');
  canvas.setPointerCapture?.(e.pointerId);
  e.preventDefault();
  audio.unlock();
  if (state === 'title') startRun();
  else if (state === 'end') {
    if (canRestart()) startRun();
    return;
  }
  if (state === 'ride') held.pointers.add(e.pointerId);
});
const up = (e) => held.pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('lostpointercapture', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (openDialogs()) return;
  const k = e.key;
  const control = isControl(e.target);
  if ((DIVE_KEYS.has(k) || PULL_KEYS.has(k) || k === 'Enter') && !control) {
    e.preventDefault();
    ui.setMode('key');
    audio.unlock();
    if (!e.repeat && (state === 'title' || canRestart()) && (k === ' ' || k === 'Enter')) {
      startRun();
    }
    if (state === 'ride') {
      if (DIVE_KEYS.has(k)) held.dive.add(k.toLowerCase());
      if (PULL_KEYS.has(k)) held.pull.add(k.toLowerCase());
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const lk = k.toLowerCase();
  if (lk === 'p' || k === 'Escape') {
    if (state === 'ride') pause();
  } else if (lk === 'm') toggleSound();
  else if (lk === 'h' || k === '?') openHelp();
  else if (lk === 'r' && state !== 'title') startRun();
});
window.addEventListener('keyup', (e) => {
  held.dive.delete(e.key.toLowerCase());
  held.pull.delete(e.key.toLowerCase());
});
window.addEventListener('blur', releaseAll);

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let value = 0, a = false, start = false;
  for (const p of pads) {
    if (!p) continue;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const ay = p.axes[1] || 0;
    if (b(0) || b(7) || b(13)) value = -1;
    else if (b(12)) value = 1;
    else if (Math.abs(ay) > 0.3) value = -ay;
    a = a || b(0);
    start = start || b(9);
  }
  if (value || a || start) ui.setMode('pad');
  if (a && !pad.a && !openDialogs()) {
    audio.unlock();
    if (state === 'title' || canRestart()) startRun();
  }
  if (start && !pad.start) {
    if (state === 'ride' && !paused) pause();
    else if (paused) document.getElementById('pause').close('resume');
  }
  pad = { value: state === 'ride' ? value : 0, a, start };
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
  if (paused || state !== 'ride') return;
  paused = true;
  releaseAll();
  if (!pauseDlg.open) pauseDlg.showModal();
  ui.alert('Paused.', 'pause', 0);
}

function openHelp() {
  if (helpDlg.open) return;
  if (pauseDlg.open) pauseDlg.close('help');
  releaseAll();
  if (state === 'ride') paused = true;
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

document.getElementById('btn-pause').addEventListener('click', () => (state === 'ride' ? pause() : null));
document.getElementById('btn-help').addEventListener('click', openHelp);
// Tapping anywhere on the result card rides again, like the hint says.
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
    if (state === 'ride') pause();
    audio.suspend();
  } else {
    audio.resume();
    last = performance.now();
  }
});

// ---------------------------------------------------------------- events
const INCOMING = {
  debris: 'Space junk ahead.', updraft: 'Updraft ahead.', storm: 'Storm band ahead: the hot air rises.',
  jet: 'Jet stream ahead.', coolant: 'Coolant ahead.',
};

function handleEvents() {
  const rm = store.settings.reducedMotion;
  const live = state !== 'title';
  for (const e of run.events) {
    if (live) renderer.onEvent(e, run, rm);
    if (!live) continue;
    switch (e.type) {
      case 'hit': audio.hit(); ui.alert('Hit by space junk! Heat up, flow lost.', 'hit', 2500); break;
      case 'coolant': audio.coolant(); break;
      case 'popup': audio.popup(); break;
      case 'boost': audio.boost(); break;
      case 'updraft': audio.updraft(); break;
      case 'flow': audio.flow(e.flow); break;
      case 'flowlost': audio.flowLost(); break;
      case 'incoming':
        audio.incoming();
        ui.alert(INCOMING[e.kind], `in-${e.kind}`, 6000);
        break;
      case 'warn':
        ui.alert(e.kind === 'heat' ? 'Heat warning! Let go to lift.' : 'Skip warning! Hold to dive.', e.kind, 5000);
        break;
      case 'splash': audio.splash(); ui.alert('Splashdown!', 'splash', 0); break;
      case 'end': {
        const result = { ...run.result, gentle: run.gentle };
        const isBest = store.record(result);
        lastResult = { result, isBest };
        state = 'ending';
        ui.setState('ending');
        releaseAll();
        if (e.outcome === 'burned') {
          audio.burn();
          ui.alert('Burned up!', 'end', 0);
        } else if (e.outcome === 'skipped') {
          audio.skipOut();
          ui.alert('Skipped out into space!', 'end', 0);
        } else {
          audio.chute();
          ui.alert('Chute open. Heading for splashdown.', 'end', 0);
        }
        endTimer = { burned: 1.4, skipped: 1.9, landed: 6.2 }[e.outcome] / SPEED;
        break;
      }
    }
  }
  run.events.length = 0;
}

// ---------------------------------------------------------------- loop
const perf = { frames: 0, work: 0, max: 0 };
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const t0 = performance.now();
  pollGamepad();
  if (ui.state === 'ride') ui.refreshHint();
  if (!paused) {
    let simDt = dt * SPEED;
    const input = state === 'title' ? autopilot(run, demoMem) : state === 'ride' ? currentInput() : 0;
    while (simDt > 1e-6) {
      const h = Math.min(simDt, 1 / 120);
      step(run, h, input);
      simDt -= h;
    }
    handleEvents();
    if (state === 'title' && run.phase !== 'ride') {
      run = createRun({ seed: (seed ^ run.seed) + 1, gentle: false });
      demoMem = {};
      renderer.camAlt = null;
    }
    if (state === 'ending') {
      endTimer -= dt;
      if (endTimer <= 0) showResult();
    }
  }
  const riding = state !== 'title' && run.phase === 'ride' && !paused;
  renderer.draw(ctx, dt, {
    run, mode: state === 'title' ? 'title' : 'ride', rm: store.settings.reducedMotion, paused,
    best: store.best, gentle: store.settings.gentle, inputMode: ui.mode,
  });
  audio.tick(dt, riding ? {
    speed: speedN(run.v) * 0.8 + 0.2, air: Math.min(1, Math.exp(-run.depth / 10)), plasma: run.plasma,
    warnHeat: run.warnHeat, warnSkip: run.warnSkip,
  } : null);
  const work = performance.now() - t0;
  perf.frames++;
  perf.work += work;
  perf.max = Math.max(perf.max, work);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (TEST) {
  window.__surf = {
    get run() { return run; },
    get state() { return state; },
    get paused() { return paused; },
    get scale() { return scale; },
    get input() { return currentInput(); },
    snapshot: () => ({ ...snapshot(run), state, paused }),
    store, perf, renderer,
  };
}
