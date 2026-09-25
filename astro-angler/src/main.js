import { initArt, sprites, C } from './art.js';
import { Scene } from './scene.js';
import { Game, S } from './game.js';
import { SPECIES, mulberry32, recordCatch } from './fish.js';
import { Sound } from './audio.js';
import { load, save } from './storage.js';

// ------------------------------------------------------------ setup
const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) || 1 : null;
const rng = seed != null ? mulberry32(seed) : Math.random;

initArt();

const reducedMQ = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const data = load({
  stats: { casts: 0, catches: 0 },
  settings: { sfx: true, music: true, reduced: !!reducedMQ?.matches, relaxed: false, haptics: true },
});
const settings = data.settings;

const canvas = document.getElementById('screen');
const stage = document.getElementById('stage');
const scene = new Scene(canvas);
const sound = new Sound();
sound.sfxOn = settings.sfx;
sound.musicOn = settings.music;

const ui = {
  hint: '', hintUrgent: false, toast: null, reduced: settings.reduced,
  aurora: false, logCount: '', startPrompt: '', titleHelp: '',
};

let lastInput = matchMedia('(pointer: coarse)').matches ? 'touch' : 'key';

const game = new Game({ rng, relaxed: settings.relaxed, onEvent });

// ------------------------------------------------------------ helpers
const statusEl = document.getElementById('status');
const alertEl = document.getElementById('alert');
function announce(text, urgent = false) {
  const el = urgent ? alertEl : statusEl;
  el.textContent = '';
  // Re-setting on the next frame makes screen readers repeat identical text.
  requestAnimationFrame(() => { el.textContent = text; });
}
function toast(text, color, dur = 2.6) { ui.toast = { text, color, t: 0, dur }; }
function buzz(pattern) {
  if (settings.haptics && lastInput === 'touch' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}
const foundCount = () => SPECIES.filter((s) => data.log[s.id]?.count).length;
function refreshAurora() { ui.aurora = foundCount() === SPECIES.length; }
refreshAurora();

// ------------------------------------------------------------ game events
function onEvent(type, d) {
  switch (type) {
    case 'start':
      sound.play('start');
      announce('Hold to charge a cast, release to throw.');
      break;
    case 'charge': sound.play('charge'); break;
    case 'cast':
      sound.play('cast', d.power);
      data.stats.casts += 1;
      break;
    case 'splash':
      scene.splash(d.u, d.v);
      sound.play('splash');
      announce('The bobber settles. Wait for a bite.');
      break;
    case 'approach': announce('A shadow drifts toward the bobber.'); break;
    case 'nibble':
      scene.ripple(game.target.u, game.target.v, 3);
      sound.play('nibble');
      buzz(8);
      announce('Nibble. Not yet.');
      break;
    case 'bite':
      scene.splash(game.target.u, game.target.v);
      scene.kick(1.5);
      sound.play('bite');
      buzz([40, 30, 40]);
      announce('Bite! Press now!', true);
      break;
    case 'hook':
      sound.play('hook');
      buzz(20);
      announce('Hooked! Hold to reel. Let go when the line strains.', true);
      break;
    case 'miss':
      toast('It slipped away. Patience...', C.starB);
      sound.play('miss');
      announce('Too slow, it got away. Still waiting.');
      break;
    case 'spook':
      toast('Too eager! It darted off.', C.starB);
      sound.play('miss');
      announce('Too eager, the fish darted off. Wait for the real bite.');
      break;
    case 'patience':
      toast('Just a nibble. Wait for the bite...', C.starB, 1.6);
      break;
    case 'reelIn': sound.play('ui'); announce('Reeled in.'); break;
    case 'surge':
      scene.ripple(game.fish.u, game.fish.v, 5);
      scene.kick(0.8);
      sound.play('surge');
      buzz(15);
      break;
    case 'snap':
      toast('Snap! The line broke.', C.red);
      scene.splash(game.fish.u, game.fish.v, true);
      scene.kick(3);
      sound.play('snap');
      buzz(120);
      announce('Snap! The line broke. Let go sooner when it strains.', true);
      break;
    case 'escape':
      toast('It wriggled free.', C.starB);
      sound.play('escape');
      announce('The fish wriggled free.');
      break;
    case 'land': {
      const res = recordCatch(data.log, d.species.id, d.size);
      Object.assign(d, res);
      data.stats.catches += 1;
      save(data);
      scene.splash(game.fish.u, game.fish.v, true);
      sound.play('land');
      break;
    }
    case 'caught': {
      const n = foundCount();
      ui.logCount = `${n}/${SPECIES.length}`;
      sound.play('caught', d.isNew);
      buzz([20, 40, 20]);
      scene.sparkle(scene.W / 2, Math.max(20, scene.baseIy - 70), 16);
      announce(`Caught a ${d.species.name}, ${d.size.toFixed(1)} centimetres. ${d.species.rarity}.` +
        `${d.isNew ? ' New to your star log!' : d.isRecord ? ' A new record!' : ''} ${d.species.blurb} Press to let it go.`);
      const wasComplete = ui.aurora;
      refreshAurora();
      if (ui.aurora && !wasComplete) setTimeout(() => toast('Star log complete! The sky hums along with you.', C.moss2, 5), 400);
      break;
    }
    case 'release':
      scene.release(d.species);
      sound.play('release');
      announce('You let it go. It swims off into the stars.');
      break;
  }
}

// ------------------------------------------------------------ hints
const VERBS = {
  key: { hold: 'Hold SPACE', press: 'Press SPACE' },
  mouse: { hold: 'Hold the mouse button', press: 'Click' },
  touch: { hold: 'Touch and hold', press: 'Tap' },
  pad: { hold: 'Hold A', press: 'Press A' },
};
function updateHint() {
  const v = VERBS[lastInput];
  let hint = '', urgent = false;
  switch (game.state) {
    case S.IDLE: hint = `${v.hold} to cast`; break;
    case S.CHARGE: hint = 'Release to cast!'; break;
    case S.WAIT:
      hint = game.fish?.phase === 'nibble' ? 'A nibble... wait for it' : `Waiting... (${v.press.toLowerCase()} to reel in)`;
      break;
    case S.BITE: hint = `BITE! ${v.press} now!`; urgent = true; break;
    case S.REEL:
      if (game.reel.tension > 0.78) { hint = 'Let go! The line is straining'; urgent = true; }
      else hint = `${v.hold} to reel, let go when it pulls`;
      break;
    case S.CAUGHT: hint = game.st > 0.4 ? `${v.press} to let it go` : ''; break;
  }
  ui.hint = hint;
  ui.hintUrgent = urgent;
  ui.startPrompt = lastInput === 'touch' ? 'Tap to begin' : lastInput === 'pad' ? 'Press A to begin' : 'Press SPACE or click to begin';
  ui.titleHelp = 'One button. Hold to cast, press on a bite, hold to reel.';
}

// ------------------------------------------------------------ input
const held = new Set();
function press(source) {
  sound.unlock();
  if (held.has(source)) return;
  const was = held.size;
  held.add(source);
  if (was === 0) game.press();
}
function release(source) {
  if (!held.delete(source)) return;
  if (held.size === 0) game.release();
}
function releaseAll() { held.clear(); game.release(); }

const dialogOpen = () => !!document.querySelector('dialog[open]');

stage.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || dialogOpen()) return;
  e.preventDefault();
  stage.focus({ preventScroll: true });
  lastInput = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  press('p' + e.pointerId);
});
const pointerEnd = (e) => release('p' + e.pointerId);
stage.addEventListener('pointerup', pointerEnd);
stage.addEventListener('pointercancel', pointerEnd);
stage.addEventListener('lostpointercapture', pointerEnd);
stage.addEventListener('contextmenu', (e) => e.preventDefault());

const ACTION_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);
window.addEventListener('keydown', (e) => {
  if (dialogOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  const onControl = e.target instanceof Element && e.target.closest('button, input, a');
  if (ACTION_KEYS.has(e.code) || e.key === ' ') {
    if (onControl) return; // let focused buttons behave like buttons
    e.preventDefault();
    lastInput = 'key';
    if (!e.repeat) press('k:' + e.code);
  } else if (e.key === 'l' || e.key === 'L') {
    openLog();
  } else if (e.key === 'm' || e.key === 'M') {
    toggleSound();
  }
});
window.addEventListener('keyup', (e) => {
  if (ACTION_KEYS.has(e.code) || e.key === ' ') release('k:' + e.code);
});
window.addEventListener('blur', releaseAll);

let padDown = false;
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let down = false;
  for (const p of pads) if (p && (p.buttons[0]?.pressed || p.buttons[1]?.pressed)) down = true;
  if (down && !padDown) { lastInput = 'pad'; if (!dialogOpen()) press('pad'); }
  if (!down && padDown) release('pad');
  padDown = down;
}

// ------------------------------------------------------------ HUD buttons + dialogs
const ICONS = {
  book: ['.XXXX.XXXX.', 'X....X....X', 'X.XX.X.XX.X', 'X....X....X', 'X.XX.X.XX.X', 'X....X....X', 'X.XX.X.XX.X', 'X....X....X', '.XXXX.XXXX.'],
  sound: ['....X......', '...XX...X..', 'XXXXX.X..X.', 'XXXXX..X.X.', 'XXXXX..X.X.', 'XXXXX.X..X.', '...XX...X..', '....X......'],
  mute: ['....X......', '...XX......', 'XXXXX.X...X', 'XXXXX..X.X.', 'XXXXX...X..', 'XXXXX..X.X.', '...XX.X...X', '....X......'],
  gear: ['....X....', '.X.XXX.X.', '..XXXXX..', '.XXX.XXX.', 'XXX...XXX', '.XXX.XXX.', '..XXXXX..', '.X.XXX.X.', '....X....'],
};
function icon(rows) {
  const w = rows[0].length, h = rows.length;
  let rects = '';
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg viewBox="-1 -1 ${w + 2} ${h + 2}" aria-hidden="true" focusable="false" fill="currentColor">${rects}</svg>`;
}
const btnLog = document.getElementById('btn-log');
const btnSound = document.getElementById('btn-sound');
const btnSettings = document.getElementById('btn-settings');
btnLog.innerHTML = icon(ICONS.book);
btnSettings.innerHTML = icon(ICONS.gear);
function syncSoundBtn() {
  const on = settings.sfx || settings.music;
  btnSound.innerHTML = icon(on ? ICONS.sound : ICONS.mute);
  btnSound.setAttribute('aria-pressed', String(on));
}
syncSoundBtn();

function toggleSound() {
  const on = !(settings.sfx || settings.music);
  settings.sfx = on; settings.music = on;
  sound.setSfx(on); sound.setMusic(on);
  if (on) { sound.unlock(); sound.play('ui'); }
  syncSoundBtn();
  save(data);
  announce(on ? 'Sound on.' : 'Sound off.');
}
// Keep the HUD buttons from starting a cast underneath them.
for (const b of [btnLog, btnSound, btnSettings]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
btnSound.addEventListener('click', toggleSound);
btnLog.addEventListener('click', openLog);
btnSettings.addEventListener('click', openSettings);

const logDialog = document.getElementById('log-dialog');
const settingsDialog = document.getElementById('settings-dialog');
for (const d of [logDialog, settingsDialog]) {
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // backdrop click
  d.addEventListener('close', () => { stage.focus({ preventScroll: true }); });
}
function openDialog(d) {
  releaseAll();
  if (!d.open) d.showModal();
  sound.play('ui');
}

function openLog() {
  const list = document.getElementById('log-list');
  list.textContent = '';
  for (const s of SPECIES) {
    const e = data.log[s.id];
    const li = document.createElement('li');
    const spr = e ? sprites.fish[s.id] : sprites.fishSil[s.id];
    const scale = spr.width > 16 ? 2 : 3;
    const pic = document.createElement('div');
    pic.className = 'pic';
    const cv = document.createElement('canvas');
    cv.width = spr.width; cv.height = spr.height;
    cv.style.width = spr.width * scale + 'px';
    cv.style.height = spr.height * scale + 'px';
    cv.getContext('2d').drawImage(spr, 0, 0);
    cv.setAttribute('aria-hidden', 'true');
    pic.append(cv);
    const name = document.createElement('span');
    name.className = 'name';
    const meta = document.createElement('span');
    meta.className = 'meta';
    li.append(pic, name, meta);
    if (e) {
      name.textContent = s.name;
      meta.textContent = `${s.rarity} · best ${e.best.toFixed(1)} cm · caught ${e.count}×`;
      const blurb = document.createElement('span');
      blurb.className = 'blurb';
      blurb.textContent = s.blurb;
      li.append(blurb);
    } else {
      li.className = 'unknown';
      name.textContent = '???';
      meta.textContent = s.rarity === 'Legendary' ? 'Legendary · somewhere far out' : `${s.rarity} · not yet found`;
    }
    list.append(li);
  }
  const n = foundCount();
  document.getElementById('log-summary').textContent =
    `${n} of ${SPECIES.length} found · ${data.stats.catches} caught · ${data.stats.casts} casts` + (n === SPECIES.length ? ' · complete!' : '');
  openDialog(logDialog);
}

const form = settingsDialog.querySelector('form');
function openSettings() {
  for (const k of ['sfx', 'music', 'reduced', 'relaxed', 'haptics']) form.elements[k].checked = !!settings[k];
  openDialog(settingsDialog);
}
form.addEventListener('change', (e) => {
  const k = e.target.name;
  settings[k] = e.target.checked;
  if (k === 'sfx') sound.setSfx(settings.sfx);
  if (k === 'music') sound.setMusic(settings.music);
  if (k === 'reduced') ui.reduced = settings.reduced;
  if (k === 'relaxed') game.relaxed = settings.relaxed;
  syncSoundBtn();
  save(data);
});
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('Clear your star log? This forgets every fish you have found.')) return;
  data.log = {};
  data.stats = { casts: 0, catches: 0 };
  save(data);
  refreshAurora();
  announce('Star log cleared.');
});

// ------------------------------------------------------------ sizing
// Integer scaling in device pixels keeps every art pixel perfectly square.
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const dw = Math.floor(window.innerWidth * dpr), dh = Math.floor(window.innerHeight * dpr);
  const fit = Math.floor(Math.min(dw / 192, dh / 170));
  scale = Math.max(1, Math.min(fit, Math.floor(dh / 180)));
  const W = Math.floor(dw / scale), H = Math.floor(dh / scale);
  canvas.width = W; canvas.height = H;
  canvas.style.width = (W * scale) / dpr + 'px';
  canvas.style.height = (H * scale) / dpr + 'px';
  scene.resize(W, H);
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------ loop
let paused = false;
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  if (paused) { releaseAll(); sound.suspend(); } else sound.resume();
});

let last = performance.now();
let tickT = 0, strainT = 0;
const fpsWin = [];
function frame(now) {
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0, raw));
  fpsWin.push(raw);
  if (fpsWin.length > 120) fpsWin.shift();
  if (!paused) {
    pollPad();
    game.update(dt);
    scene.update(dt, game, { reduced: ui.reduced });
    sound.tick(dt);
    if (game.state === S.REEL) {
      if (game.held && (tickT -= dt) <= 0) { tickT = 0.075; sound.play('tick'); }
      if (game.reel.tension > 0.8 && (strainT -= dt) <= 0) { strainT = 0.3; sound.play('strain'); }
    }
    if (ui.toast) ui.toast.t += dt;
    updateHint();
  }
  scene.draw(game, ui);
  requestAnimationFrame(frame);
}
updateHint();
requestAnimationFrame(frame);

// Read-only hooks for automated smoke tests.
window.__astro = {
  game, scene, S, data,
  get fps() { const avg = fpsWin.reduce((a, b) => a + b, 0) / (fpsWin.length || 1); return avg ? 1 / avg : 0; },
  get scale() { return scale; },
};
