import { SoundEngine } from './audio.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { makeMon } from './monster.js';
import { mulberry32 } from './util.js';

// iOS ignores user-scalable=no, so block pinch-zoom here (double-tap zoom is
// handled by touch-action in the stylesheet).
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Date.now() ^ (Math.random() * 1e9)) >>> 0;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const audio = new SoundEngine();
const input = new Input();
const ui = new UI(input, audio);
const game = new Game({ audio, input, ui, rng: mulberry32(seed), fast: params.has('fast') });
input.bindTouch(document.getElementById('touch'));
if (matchMedia('(pointer: coarse)').matches) input.setMode('touch');
else document.body.dataset.input = 'keys';

// ---------------------------------------------------------------- sizing
// Render at a low internal resolution and scale by a whole number of device
// pixels, so every game pixel is a crisp square on any screen.
const MIN_W = 232, MIN_H = 180;
let W = 0, H = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = Math.round(window.innerWidth * dpr), vh = Math.round(window.innerHeight * dpr);
  const scale = Math.max(1, Math.floor(Math.min(vw / MIN_W, vh / MIN_H)));
  W = Math.ceil(vw / scale);
  H = Math.ceil(vh / scale);
  if (canvas.width === W && canvas.height === H) return;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${(W * scale) / dpr}px`;
  canvas.style.height = `${(H * scale) / dpr}px`;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', () => requestAnimationFrame(resize));
resize();

// ---------------------------------------------------------------- title screen
const title = document.getElementById('title');
const titleButtons = () => [...title.querySelectorAll('.title-menu button:not([hidden])')];
const btnContinue = document.getElementById('btn-continue');
btnContinue.hidden = !game.hasSave();

async function titleMenu() {
  audio.music('title');
  title.hidden = false;
  document.body.classList.add('on-title');
  const btns = titleButtons();
  const r = await ui.nav(btns, { cancel: false });
  const id = btns[r].id;
  if (id === 'btn-continue' && game.load()) {
    closeTitle();
    game.start({ fresh: false });
    ui.toast(`Welcome back, ${game.s.name}.`);
    return;
  }
  // New game: ask for a name.
  const form = document.getElementById('name-form');
  const field = document.getElementById('name-field');
  title.querySelector('.title-menu').hidden = true;
  form.hidden = false;
  field.value = '';
  if (input.mode !== 'touch') field.focus();
  const name = await new Promise((resolve) => {
    const pop = input.push((act) => {
      if (act === 'a' && document.activeElement !== field) {
        pop();
        resolve(field.value);
      }
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      pop();
      resolve(field.value);
    };
  });
  field.blur();
  form.hidden = true;
  closeTitle();
  game.start({ fresh: true, name: name.trim().slice(0, 12) || 'Rook' });
  await game.run(async () => {
    await game.fadeTo(1);
    await ui.say([
      'Three hundred years ago a star-dragon fell out of the sky and lifted a mountain into the clouds.',
      'Its body became the island. Its heart became the engine that keeps it flying. We call it the Aerie.',
      'Its embers still fall. Wherever they land, drakes hatch: in reactors, in fog nets, in broken holograms.',
      'The people who bond with them are called Linkers. Today is your Link Day.',
    ]);
    await game.fadeTo(0);
    await ui.say(`${game.s.name}! Are you up? Come here a sec!`, { name: 'Aunt Ren' });
  });
}

function closeTitle() {
  title.hidden = true;
  document.body.classList.remove('on-title');
}

// ---------------------------------------------------------------- HUD buttons
document.getElementById('btn-menu').addEventListener('click', () => input.fire('start'));
document.querySelector('#panel .close').addEventListener('click', () => input.fire('b'));
document.getElementById('btn-sound').addEventListener('click', () => {
  game.settings.muted = !game.settings.muted;
  game.applySettings();
});
// Full screen where the browser allows it (Android and desktop; iPhones get
// it by adding the game to the home screen instead).
const btnFull = document.getElementById('btn-full');
if (document.fullscreenEnabled) {
  btnFull.hidden = false;
  btnFull.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => btnFull.setAttribute('aria-pressed', String(!!document.fullscreenElement)));
}
document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()));

// ---------------------------------------------------------------- loop
const perf = { frames: 0, ms: 0 };
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  input.poll();
  const reduced = game.settings.reduced;
  if (game.mode === 'title') {
    game.t += dt;
    game.renderTitle(ctx, W, H, reduced);
  } else {
    game.update(dt);
    game.render(ctx, W, H, reduced);
  }
  perf.frames++;
  perf.ms = perf.ms * 0.95 + (performance.now() - t0) * 0.05;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
titleMenu();

// ---------------------------------------------------------------- test hooks
if (params.has('test')) {
  window.__aerie = {
    game, perf, ui, input,
    snap: () => game.snapshot(),
    teleport(map, x, y, dir = 'down') {
      game.enterMap(map, x, y, dir);
    },
    give(id, n = 1) {
      game.give(id, n);
    },
    addMon(sp, lv) {
      game.addMon(makeMon(sp, lv, game.rng));
    },
    setFlag(f) {
      game.setFlag(f);
    },
    forceEncounters(on = true) {
      game.forceEncounter = on;
    },
  };
}
