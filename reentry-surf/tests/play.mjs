// End-to-end play-through in headless Chromium. It plays real runs with the
// keyboard (desktop) and raw touch events (phone): a full descent to splashdown,
// a burn-up and a skip-out, and checks the HUD, menus, persistence, crisp
// scaling, accessibility hooks and frame cost. Screenshots go to test-results/.
//
//   node tests/play.mjs                 (from reentry-surf/)
//   CHROMIUM_PATH=/path node tests/play.mjs
//
// Uses playwright-core (installed at the repo root) or playwright.
import { mkdir } from 'node:fs/promises';
import { serve } from '../tools/serve.mjs';

const { chromium } = await import('playwright-core').catch(() => import('playwright'));
const PORT = 8766;
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

async function openGame(context, name, query = '?test&fast&seed=4') {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/${query}`);
  await page.waitForFunction(() => window.__surf && window.__surf.perf.frames > 10);
  page.snap = () => page.evaluate(() => window.__surf.snapshot());
  page.hint = () => page.textContent('#hint');
  page.errors = errors;
  page.shot = (label) => page.screenshot({ path: `${OUT}${name}-${label}.png` });
  return page;
}

/**
 * Rides a run with a "hold to dive / let go to lift" pilot until it ends.
 * Takes screenshots of the first on-screen hazards and of a warning.
 */
async function ride(page, press, release, { shots = false, until = null } = {}) {
  let holding = false;
  const kinds = new Set();
  const shotsTaken = new Set();
  const deadline = Date.now() + 120000;
  let s;
  while (Date.now() < deadline) {
    s = await page.snap();
    if (s.state !== 'ride' || s.phase !== 'ride') break;
    if (until && until(s)) break;
    const d = s.alt - s.hot, pred = d + s.vy * 0.6, target = s.width * 0.5;
    if (!holding && pred > target + 2) {
      holding = true;
      await press();
    } else if (holding && pred < target - 1.5) {
      holding = false;
      await release();
    }
    for (const o of s.objects) {
      if (o.dx > 4 && o.dx < 45) {
        kinds.add(o.kind);
        if (shots && !shotsTaken.has(o.kind)) {
          shotsTaken.add(o.kind);
          await page.shot(`hazard-${o.kind}`);
        }
      }
    }
    if (shots && !shotsTaken.has('mid') && s.v < 4.5) {
      shotsTaken.add('mid');
      await page.shot('ride-mid');
    }
    await sleep(15);
  }
  if (holding) await release();
  return { snap: await page.snap(), kinds };
}

async function waitResult(page) {
  await page.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 15000 });
  await sleep(450);
  return page.evaluate(() => ({
    title: document.getElementById('result-title').textContent,
    rank: document.getElementById('result-rank').textContent,
    score: document.getElementById('result-score').textContent,
    alert: document.getElementById('sr-alert').textContent,
    focus: document.activeElement && document.activeElement.id,
  }));
}

/** Holds one input until the run ends, logging the alert region along the way. */
async function holdUntilEnd(page, press, release) {
  const alerts = new Set();
  await press();
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const s = await page.snap();
    alerts.add(await page.textContent('#sr-alert'));
    if (s.phase !== 'ride') break;
    await sleep(40);
  }
  await release();
  return { alerts };
}

// ------------------------------------------------------------------ desktop, keyboard
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await openGame(context, 'desktop');
  check((await page.hint()).includes('drop in'), 'title hint shown', await page.hint());
  await sleep(400);
  await page.shot('title');
  const sizing = await page.evaluate(() => {
    const c = document.getElementById('game');
    return { w: c.width, h: c.height, css: parseFloat(c.style.width), scale: window.__surf.scale, rendering: getComputedStyle(c).imageRendering };
  });
  check(sizing.css === sizing.w * sizing.scale && sizing.scale >= 2 && sizing.rendering === 'pixelated', 'integer pixel scaling, image-rendering: pixelated', JSON.stringify(sizing));

  await page.keyboard.press('Space');
  let s = await page.snap();
  check(s.state === 'ride' && s.phase === 'ride', 'Space drops in');
  check((await page.hint()).includes('Hold Space'), 'hint adapts to keyboard', await page.hint());

  // Full descent with the keyboard (Space and the Down arrow both dive).
  let useDown = false;
  const press = () => page.keyboard.down((useDown = !useDown) ? 'ArrowDown' : 'Space');
  const release = async () => {
    await page.keyboard.up('ArrowDown');
    await page.keyboard.up('Space');
  };
  const t0 = Date.now();
  const r = await ride(page, press, release, { shots: true });
  s = r.snap;
  check(r.kinds.size >= 3, 'saw hazards and events along the way', [...r.kinds].join(', '));
  check(s.phase === 'landed', 'keyboard: rode the corridor all the way to the chute', `${s.phase} after ${s.t.toFixed(0)} sim s (${((Date.now() - t0) / 1000).toFixed(0)} s real, fast x2.5)`);
  check(s.t > 60 && s.t < 180, 'a run lasts roughly 1-3 minutes at normal speed', `${s.t.toFixed(0)} s`);
  await sleep(1000);
  await page.shot('chute');
  const landed = await waitResult(page);
  await page.shot('result-landed');
  check(landed.title === 'SPLASHDOWN!' && /^[SABCD]$/.test(landed.rank), 'landing shows splashdown and a rank', `${landed.title} rank ${landed.rank} score ${landed.score}`);
  check(landed.alert.includes('Splashdown'), 'landing announced in aria-live region', landed.alert);
  check(landed.focus === 'btn-again', 'result card focuses the Ride again button');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reentry-surf:v1')));
  check(saved && saved.best && saved.best.score > 0 && saved.landings === 1, 'best landing persisted to localStorage', saved && JSON.stringify(saved.best));

  // Burn-up: restart with Space and hold dive the whole way.
  await page.keyboard.press('Space');
  check((await page.snap()).state === 'ride', 'Space on the result card rides again');
  const burn = await holdUntilEnd(page, () => page.keyboard.down('Space'), () => page.keyboard.up('Space'));
  check([...burn.alerts].some((a) => a.includes('Heat warning')), 'heat warning announced before burning up');
  await sleep(150);
  await page.shot('burn-flare');
  s = await page.snap();
  check(s.phase === 'burned', 'holding dive burns up', `${s.phase} at ${s.t.toFixed(1)} s`);
  const burned = await waitResult(page);
  await page.shot('result-burned');
  check(burned.title === 'BURNED UP' && burned.rank === '–', 'burn-up result is distinct and unranked', burned.title);
  check([...burn.alerts, burned.alert].some((a) => /burned up/i.test(a)), 'burn-up announced');

  // Skip-out: restart with R and pull up the whole way.
  await page.keyboard.press('r');
  check((await page.snap()).state === 'ride', 'R restarts immediately');
  const skip = await holdUntilEnd(page, () => page.keyboard.down('ArrowUp'), () => page.keyboard.up('ArrowUp'));
  check([...skip.alerts].some((a) => a.includes('Skip warning')), 'skip warning announced before skipping out');
  await sleep(500);
  await page.shot('skip-out');
  s = await page.snap();
  check(s.phase === 'skipped', 'pulling up skips out', `${s.phase} at ${s.t.toFixed(1)} s`);
  const skipped = await waitResult(page);
  await page.shot('result-skipped');
  check(skipped.title === 'SKIPPED OUT', 'skip-out result is distinct', skipped.title);

  // A warning mid-ride, for a screenshot: dive briefly into the heat.
  await page.keyboard.press('Enter');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__surf.run.warnHeat, null, { timeout: 15000 });
  await sleep(120);
  await page.shot('warning-heat');
  await page.keyboard.up('Space');

  // Pause, menus and settings, on a fresh run.
  await page.keyboard.press('r');
  await sleep(300);
  await page.keyboard.press('p');
  check(await page.isVisible('#pause') && (await page.snap()).paused, 'P pauses with a dialog');
  const tBefore = (await page.snap()).t;
  await sleep(300);
  check((await page.snap()).t === tBefore, 'the ride is frozen while paused');
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
  check(await page.evaluate(() => window.__surf.store.settings.gentle), 'gentle mode setting saved');
  // Tab reaches the menu buttons with a visible focus ring.
  await page.keyboard.press('Tab');
  const focusRing = await page.evaluate(() => {
    const el = document.activeElement;
    return { id: el.id, outline: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth };
  });
  check(focusRing.outline === 'solid' && parseFloat(focusRing.width) >= 2, 'keyboard focus ring visible on menu buttons', JSON.stringify(focusRing));
  await page.keyboard.press('r');
  check((await page.evaluate(() => window.__surf.run.width)) > 16, 'gentle mode widens the corridor on the next run');

  // Frame cost while riding (update + render), measured in the page.
  await page.evaluate(() => { window.__surf.perf.frames = 0; window.__surf.perf.work = 0; window.__surf.perf.max = 0; });
  await ride(page, () => page.keyboard.down('Space'), () => page.keyboard.up('Space'), { until: (x) => x.t > 25 });
  const perf = await page.evaluate(() => ({ ...window.__surf.perf }));
  const avg = perf.work / perf.frames;
  check(avg < 4, 'per-frame work (update + render) is small', `${avg.toFixed(2)} ms avg, ${perf.max.toFixed(1)} ms max over ${perf.frames} frames`);
  check(page.errors.length === 0, 'no console errors (desktop)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ phone, touch
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await openGame(context, 'phone', '?test&fast&seed=11');
  const cdp = await context.newCDPSession(page);
  const touch = (type) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y: 520, id: 1 }],
  });
  const press = () => touch('touchStart');
  const release = () => touch('touchEnd');
  await page.shot('title');
  await press();
  await release();
  check((await page.snap()).state === 'ride', 'tap drops in');
  check((await page.hint()).startsWith('Hold to dive'), 'hint adapts to touch', await page.hint());
  const r = await ride(page, press, release);
  await page.shot('ride-late');
  check(r.snap.phase === 'landed', 'touch: rode all the way to splashdown', `${r.snap.phase} at ${r.snap.t.toFixed(0)} s, hazards: ${[...r.kinds].join(', ')}`);
  const res = await waitResult(page);
  await page.shot('result');
  check(res.title === 'SPLASHDOWN!', 'touch: result card shown');
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal page scroll on phone');
  const sizes = await page.$$eval('button', (els) => els.filter((b) => b.offsetParent).map((b) => {
    const r = b.getBoundingClientRect();
    return Math.min(r.width, r.height);
  }));
  check(sizes.every((x) => x >= 44), 'visible touch targets are at least 44px', sizes.join(','));
  // Tap the canvas to ride again, then hold to burn up.
  await press();
  await release();
  check((await page.snap()).state === 'ride', 'tap rides again');
  await sleep(600);
  await page.shot('ride-early');
  const b = await holdUntilEnd(page, press, release);
  check((await page.snap()).phase === 'burned', 'touch: holding burns up', [...b.alerts].filter(Boolean).join(' / '));
  check(page.errors.length === 0, 'no console errors (phone)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ reduced motion + no storage
{
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  const page = await openGame(context, 'landscape-reduced');
  check(await page.evaluate(() => window.__surf.store.settings.reducedMotion), 'prefers-reduced-motion respected');
  await page.keyboard.press('Enter');
  await sleep(800);
  check((await page.snap()).state === 'ride', 'Enter starts and the game runs without localStorage');
  await page.shot('ride');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__surf.run.phase === 'burned', null, { timeout: 30000 });
  await page.keyboard.up('Space');
  const shake = await page.evaluate(() => window.__surf.renderer.shake);
  check(shake === 0, 'no screen shake with reduced motion', String(shake));
  await waitResult(page);
  check(page.errors.length === 0, 'no console errors (reduced motion, storage blocked)', page.errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
