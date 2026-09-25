// End-to-end play-through in headless Chromium. It flies real sessions with the
// keyboard (desktop), the mouse, and raw touch events (phone), and checks tricks,
// combos, the HUD, menus, persistence, crisp scaling, accessibility hooks and
// frame cost. Screenshots go to test-results/.
//
//   node tests/play.mjs                 (from solar-kite/)
//   CHROMIUM_PATH=/path node tests/play.mjs
//
// Uses playwright-core (installed at the repo root) or playwright.
import { mkdir } from 'node:fs/promises';
import { serve } from '../tools/serve.mjs';

const { chromium } = await import('playwright-core').catch(() => import('playwright'));
const PORT = 8767;
const OUT = new URL('../test-results/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};

const server = await serve(PORT);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openGame(context, name, query = '?test&fast&seed=4&session=50') {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/${query}`);
  await page.waitForFunction(() => window.__kite && window.__kite.perf.frames > 10);
  page.snap = () => page.evaluate(() => window.__kite.snapshot());
  page.hint = () => page.textContent('#hint');
  page.errors = errors;
  page.shot = (label) => page.screenshot({ path: `${OUT}${name}-${label}.png` });
  return page;
}

/** Where a human would steer: round a figure 8 in the power zone, pulling up near the ground. */
function target(s) {
  const heading = Math.sin(s.th);
  if (s.y + heading * s.s * 0.45 < 12 && heading < 0.5) return { x: s.x + Math.cos(s.th) * 4, y: s.y + 30 };
  const t = s.t * 0.55;
  return { x: 96 + Math.sin(t) * 34, y: 40 + Math.sin(2 * t) * 16 };
}

/** Turn the kite towards a world point with the arrow keys (like steerToward, but bang-bang). */
function keyTurn(s, p) {
  let d = Math.atan2(p.y - s.y, p.x - s.x) - s.th;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < 0.15 ? 0 : d > 0 ? 1 : -1;
}

async function waitResult(page) {
  await page.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 20000 });
  await sleep(450);
  return page.evaluate(() => ({
    rank: document.getElementById('result-rank').textContent,
    score: document.getElementById('result-score').textContent,
    stats: document.getElementById('result-stats').textContent,
    alert: document.getElementById('sr-alert').textContent,
    focus: document.activeElement && document.activeElement.id,
  }));
}

// ------------------------------------------------------------------ desktop, keyboard
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await openGame(context, 'desktop');
  check((await page.hint()).includes('launch'), 'title hint shown', await page.hint());
  await sleep(600);
  await page.shot('title');
  const demo = await page.snap();
  check(demo.state === 'title' && demo.t > 0.5, 'demo pilot flies behind the title');
  const sizing = await page.evaluate(() => {
    const c = document.getElementById('game');
    return { w: c.width, h: c.height, css: parseFloat(c.style.width), scale: window.__kite.scale, rendering: getComputedStyle(c).imageRendering };
  });
  check(sizing.css === sizing.w * sizing.scale && sizing.scale >= 2 && sizing.rendering === 'pixelated', 'integer pixel scaling, image-rendering: pixelated', JSON.stringify(sizing));

  await page.keyboard.press('Space');
  let s = await page.snap();
  check(s.state === 'fly' && s.phase === 'fly' && s.t < 1, 'Space launches a fresh session');
  check((await page.hint()).includes('steer'), 'hint adapts to keyboard', await page.hint());

  // Fly the whole (shortened) session with the arrow keys, tugging now and then.
  const seen = new Set();
  const alerts = new Set();
  let key = null, lastTug = 0, maxCombo = 0;
  const shots = new Set();
  while (true) {
    s = await page.snap();
    if (s.state !== 'fly' || s.phase !== 'fly') break;
    const turn = keyTurn(s, target(s));
    const want = turn > 0 ? 'ArrowLeft' : turn < 0 ? 'ArrowRight' : null;
    if (want !== key) {
      if (key) await page.keyboard.up(key);
      if (want) await page.keyboard.down(want);
      key = want;
    }
    if (s.t - lastTug > 4 && s.y > 25) {
      lastTug = s.t;
      await page.keyboard.press('ArrowUp');
    }
    for (const n of s.combo.names) seen.add(n.replace(/ X\d+$/, ''));
    maxCombo = Math.max(maxCombo, s.combo.count);
    alerts.add(await page.textContent('#sr-alert'));
    if (s.combo.count >= 2 && !shots.has('combo')) {
      shots.add('combo');
      await page.shot('combo');
    }
    if (s.call && !shots.has('radio')) {
      shots.add('radio');
      await page.shot('radio');
    }
    await sleep(15);
  }
  if (key) await page.keyboard.up(key);
  check(s.phase === 'done', 'the session ends at sunset', `${s.phase} at ${s.t.toFixed(1)} s`);
  check([...seen].some((n) => /LOOP|FIGURE 8/.test(n)), 'keyboard flying scores loops', [...seen].join(', '));
  check(maxCombo >= 2, 'tricks chain into combos', `max ${maxCombo} tricks`);
  check(s.score > 0, 'score banked', String(s.score));
  check([...alerts].some((a) => /points/.test(a)), 'tricks announced in the aria-live region', [...alerts].filter(Boolean).slice(0, 4).join(' / '));
  await sleep(600);
  await page.shot('sunset');
  const res = await waitResult(page);
  await page.shot('result');
  check(/^[SABCD]$/.test(res.rank) && res.stats.includes('Loops'), 'result card shows a rank and stats', `rank ${res.rank}, score ${res.score}`);
  check(res.alert.includes('Sunset'), 'result announced', res.alert);
  check(res.focus === 'btn-again', 'result card focuses the Fly again button');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solar-kite:v1')));
  check(saved && saved.best && saved.best.score > 0, 'best session persisted to localStorage', saved && JSON.stringify(saved.best));

  // Diving straight into the ground crashes and relaunches.
  await page.keyboard.press('Space');
  check((await page.snap()).state === 'fly', 'Space on the result card flies again');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__kite.run.k.state === 'crashed', null, { timeout: 15000 });
  await page.keyboard.up('ArrowRight');
  await sleep(100);
  await page.shot('crash');
  check((await page.snap()).stats.crashes === 1, 'spinning into the dust crashes the kite');
  await page.waitForFunction(() => window.__kite.run.k.state === 'fly', null, { timeout: 5000 });
  check(true, 'the kite relaunches after a crash');

  // Pause, menus and settings.
  await page.keyboard.press('p');
  check(await page.isVisible('#pause') && (await page.snap()).paused, 'P pauses with a dialog');
  const tBefore = (await page.snap()).t;
  await sleep(300);
  check((await page.snap()).t === tBefore, 'the session is frozen while paused');
  await page.shot('paused');
  await page.keyboard.press('Escape');
  await sleep(100);
  check(!(await page.snap()).paused, 'Esc resumes');
  await page.keyboard.press('m');
  check((await page.getAttribute('#btn-sound', 'aria-pressed')) === 'false', 'M mutes (aria-pressed=false)');
  await page.keyboard.press('m');
  await page.keyboard.press('h');
  check(await page.isVisible('#help') && (await page.snap()).paused, 'H opens help and settings (and pauses)');
  await page.check('#opt-gentle');
  await page.shot('help');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => window.__kite.store.settings.gentle), 'gentle mode setting saved');
  await page.keyboard.press('Tab');
  const focusRing = await page.evaluate(() => {
    const el = document.activeElement;
    return { id: el.id, outline: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth };
  });
  check(focusRing.outline === 'solid' && parseFloat(focusRing.width) >= 2, 'keyboard focus ring visible on menu buttons', JSON.stringify(focusRing));
  await page.keyboard.press('r');
  check(await page.evaluate(() => window.__kite.run.gentle), 'gentle mode applies to the next session');

  // Mouse: hold the button and the kite steers towards the pointer.
  const aimAt = await page.evaluate(() => window.__kite.toClient(120, 60));
  await page.mouse.move(aimAt.x, aimAt.y);
  await page.mouse.down();
  await sleep(250);
  const turning = await page.evaluate(() => window.__kite.turn);
  // The kite flies to the pointer, then keeps circling round it.
  let closest = Infinity;
  for (let i = 0; i < 40; i++) {
    const k = await page.snap();
    closest = Math.min(closest, Math.hypot(k.x - 120, k.y - 60));
    await sleep(40);
  }
  await page.mouse.up();
  check(turning !== 0 && closest < 15, 'holding the mouse steers the kite towards it', `closest ${closest.toFixed(1)} world units`);
  await page.mouse.click(aimAt.x, aimAt.y);
  await sleep(50);
  check(await page.evaluate(() => window.__kite.run.k.tugCool > 0), 'a quick click tugs the lines');

  // Frame cost while flying (update + render), measured in the page.
  await page.evaluate(() => { window.__kite.perf.frames = 0; window.__kite.perf.work = 0; window.__kite.perf.max = 0; });
  await page.keyboard.down('ArrowLeft');
  await sleep(2500);
  await page.keyboard.up('ArrowLeft');
  const perf = await page.evaluate(() => ({ ...window.__kite.perf }));
  const avg = perf.work / perf.frames;
  check(avg < 4, 'per-frame work (update + render) is small', `${avg.toFixed(2)} ms avg, ${perf.max.toFixed(1)} ms max over ${perf.frames} frames`);
  check(page.errors.length === 0, 'no console errors (desktop)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ phone, touch
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await openGame(context, 'phone', '?test&fast&seed=11&session=30');
  const cdp = await context.newCDPSession(page);
  const touch = (type, p = { x: 195, y: 520 }) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, id: 1 }],
  });
  await sleep(400);
  await page.shot('title');
  await touch('touchStart');
  await touch('touchEnd');
  check((await page.snap()).state === 'fly', 'tap launches');
  check((await page.hint()).includes('finger'), 'hint adapts to touch', await page.hint());
  // Hold a finger down and drag it round the figure 8.
  let s = await page.snap();
  await touch('touchStart', await page.evaluate(({ x, y }) => window.__kite.toClient(x, y), target(s)));
  let shot = false;
  while (s.state === 'fly' && s.phase === 'fly') {
    const p = await page.evaluate(({ x, y }) => window.__kite.toClient(x, y), target(s));
    await touch('touchMove', p);
    if (!shot && s.t > 8) {
      shot = true;
      await page.shot('fly');
    }
    await sleep(20);
    s = await page.snap();
  }
  await touch('touchEnd');
  check(s.phase === 'done' && s.stats.loops > 0, 'touch: dragging steers the kite through loops until sunset', `${s.stats.loops} loops, ${s.stats.crashes} crashes, score ${s.score}`);
  await waitResult(page);
  await page.shot('result');
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal page scroll on phone');
  const sizes = await page.$$eval('button', (els) => els.filter((b) => b.offsetParent).map((b) => {
    const r = b.getBoundingClientRect();
    return Math.min(r.width, r.height);
  }));
  check(sizes.every((x) => x >= 44), 'visible touch targets are at least 44px', sizes.join(','));
  await touch('touchStart');
  await touch('touchEnd');
  check((await page.snap()).state === 'fly', 'tap flies again');
  await sleep(300);
  await touch('touchStart');
  await touch('touchEnd');
  await sleep(30);
  check(await page.evaluate(() => window.__kite.run.k.tugCool > 0), 'a quick tap tugs the lines');
  check(page.errors.length === 0, 'no console errors (phone)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ reduced motion + no storage
{
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  const page = await openGame(context, 'landscape-reduced', '?test&fast&seed=5&session=40');
  check(await page.evaluate(() => window.__kite.store.settings.reducedMotion), 'prefers-reduced-motion respected');
  await page.keyboard.press('Enter');
  await sleep(800);
  check((await page.snap()).state === 'fly', 'Enter starts and the game runs without localStorage');
  await page.shot('fly');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__kite.run.k.state === 'crashed', null, { timeout: 15000 });
  await page.keyboard.up('ArrowRight');
  const shake = await page.evaluate(() => window.__kite.renderer.shake);
  check(shake === 0, 'no screen shake with reduced motion', String(shake));
  await waitResult(page);
  check(page.errors.length === 0, 'no console errors (reduced motion, storage blocked)', page.errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
