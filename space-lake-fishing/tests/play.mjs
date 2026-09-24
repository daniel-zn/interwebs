// End-to-end play-through in headless Chromium: plays the real fishing loop with
// keyboard (desktop) and raw touch events (phone), checks the journal, settings,
// persistence, crisp scaling and frame cost. Screenshots land in test-results/.
//
//   node tests/play.mjs            (uses the Playwright-managed Chromium)
//   CHROMIUM_PATH=/path node tests/play.mjs
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';

const PORT = 8765;
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

async function openGame(context, name) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/?test&fast&seed=42`);
  await page.waitForFunction(() => window.__pond && window.__pond.perf.frames > 10);
  page.snap = () => page.evaluate(() => window.__pond.game.snapshot());
  page.hint = () => page.textContent('#hint');
  page.errors = errors;
  page.shot = (label) => page.screenshot({ path: `${OUT}${name}-${label}.png` });
  return page;
}

/** Plays one full cast→bite→reel cycle using the supplied press/release functions. */
async function playOnce(page, press, release, { power = 0.55, shots = false } = {}) {
  const deadline = Date.now() + 45000;
  let holding = false;
  const seen = new Set();
  while (Date.now() < deadline) {
    const s = await page.snap();
    seen.add(s.state);
    if (s.state === 'idle' || s.state === 'lost') {
      if (s.state === 'lost') seen.add(`lost:${await page.hint()}`);
      await press();
      await page.waitForFunction((p) => window.__pond.game.power >= p, power, { timeout: 5000 });
      seen.add((await page.snap()).state);
      if (shots) await page.shot('charging');
      await release();
    } else if (s.state === 'bite') {
      if (shots) await page.shot('bite');
      await press();
      await sleep(30);
      holding = true;
    } else if (s.state === 'reeling') {
      const want = s.tension < 0.55 && s.surge === 'calm';
      if (want && !holding) await press();
      if (!want && holding) await release();
      holding = want;
      if (shots && s.progress > 0.6 && !seen.has('reelshot')) {
        seen.add('reelshot');
        await page.shot('reeling');
      }
    } else if (s.state === 'caught') {
      if (holding) await release();
      return { caught: true, seen, snap: s };
    } else if (holding && s.state !== 'reeling') {
      await release();
      holding = false;
    }
    await sleep(25);
  }
  return { caught: false, seen };
}

// ------------------------------------------------------------------ desktop
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await openGame(context, 'desktop');
  check((await page.hint()).includes('to begin'), 'title hint shown', await page.hint());
  await page.shot('title');

  const sizing = await page.evaluate(() => {
    const c = document.getElementById('game');
    return { w: c.width, h: c.height, css: parseFloat(c.style.width), scale: window.__pond.scale };
  });
  check(sizing.css === sizing.w * sizing.scale && sizing.scale >= 3, 'integer pixel scaling', JSON.stringify(sizing));

  const press = () => page.keyboard.down(' ');
  const release = () => page.keyboard.up(' ');
  await press();
  await release();
  check((await page.snap()).state === 'idle', 'Space starts the game');
  check((await page.hint()).includes('Hold Space'), 'hint adapts to keyboard', await page.hint());

  const r1 = await playOnce(page, press, release, { power: 0.8, shots: true });
  check(r1.caught, 'keyboard: cast, hook, reel and land a fish', [...r1.seen].join(','));
  check(['charging', 'casting', 'waiting', 'bite', 'reeling', 'landing'].every((s) => r1.seen.has(s)), 'visited every loop state');
  const card = await page.evaluate(() => ({
    visible: !document.getElementById('card').hidden,
    name: document.getElementById('card-name').textContent,
    size: document.getElementById('card-size').textContent,
  }));
  check(card.visible && card.name.length > 0, 'catch card shows the fish', `${card.name}, ${card.size}`);
  await sleep(600);
  await page.shot('caught');
  check(r1.snap.total === 1, 'catch recorded');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('orbit-pond:v1')));
  check(saved && saved.total === 1 && Object.keys(saved.journal).length === 1, 'journal persisted to localStorage');

  await sleep(400);
  await press();
  await release();
  check((await page.snap()).state === 'idle' && (await page.isHidden('#card')), 'Space dismisses the card');

  // Mouse input path, second catch.
  const box = await page.locator('#game').boundingBox();
  const mpress = async () => {
    await page.mouse.move(box.width / 2, box.height / 2);
    await page.mouse.down();
  };
  const mrelease = () => page.mouse.up();
  const r2 = await playOnce(page, mpress, mrelease, { power: 0.3 });
  check(r2.caught, 'mouse: second fish landed');
  check((await page.textContent('#stat')).startsWith('2 caught'), 'HUD counter updates', await page.textContent('#stat'));
  await sleep(400);
  await mpress();
  await mrelease();

  // Pressing while waiting reels the line back in.
  await press();
  await page.waitForFunction(() => window.__pond.game.power >= 0.4);
  await release();
  await page.waitForFunction(() => window.__pond.game.state === 'waiting');
  await press();
  await release();
  check((await page.snap()).state === 'idle', 'pressing while waiting reels in');

  // Journal dialog via keyboard, pauses the game, Esc closes.
  await page.keyboard.press('j');
  check(await page.isVisible('#journal'), 'J opens the journal');
  const entries = await page.$$eval('#journal-list li', (els) => els.map((e) => e.className));
  check(entries.length === 10 && entries.filter((c) => c.includes('found')).length >= 1, 'journal lists species', `${entries.filter((c) => c.includes('found')).length} found`);
  check(await page.evaluate(() => window.__pond.game.paused), 'game pauses behind dialogs');
  await page.shot('journal');
  await page.keyboard.press('Escape');
  await sleep(100);
  check(!(await page.isVisible('#journal')) && !(await page.evaluate(() => window.__pond.game.paused)), 'Esc closes journal and resumes');

  // Sound toggle and help/settings.
  await page.keyboard.press('m');
  check((await page.getAttribute('#btn-sound', 'aria-pressed')) === 'false', 'M mutes (aria-pressed=false)');
  await page.keyboard.press('m');
  await page.keyboard.press('h');
  check(await page.isVisible('#help'), 'H opens help and settings');
  await page.check('#opt-gentle');
  await page.shot('help');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => window.__pond.store.settings.gentle), 'gentle mode setting saved');

  // Frame cost of update + render.
  const perf0 = await page.evaluate(() => ({ ...window.__pond.perf }));
  await sleep(2000);
  const perf1 = await page.evaluate(() => ({ ...window.__pond.perf }));
  const frames = perf1.frames - perf0.frames;
  const ms = (perf1.work - perf0.work) / frames;
  check(ms < 8, 'per-frame work under 8 ms', `${ms.toFixed(2)} ms avg over ${frames} frames in ~2 s`);
  check(page.errors.length === 0, 'no console errors (desktop)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ phone (touch)
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const page = await openGame(context, 'phone');
  const cdp = await context.newCDPSession(page);
  const pt = { x: 195, y: 420 };
  const touch = (type) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: pt.x, y: pt.y, id: 1 }],
  });
  const press = () => touch('touchStart');
  const release = () => touch('touchEnd');
  await press();
  await release();
  check((await page.snap()).state === 'idle', 'tap starts the game on touch');
  check((await page.hint()).startsWith('Hold anywhere'), 'hint adapts to touch', await page.hint());
  await page.shot('idle');
  const r = await playOnce(page, press, release, { power: 0.6, shots: true });
  check(r.caught, 'touch: full catch with hold-to-reel');
  await sleep(600);
  await page.shot('caught');
  const btn = await page.locator('#btn-journal').boundingBox();
  check(btn.width >= 44 && btn.height >= 44, 'touch targets are at least 44px', `${btn.width}x${btn.height}`);
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal page scroll on phone');
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
  check(await page.evaluate(() => window.__pond.store.settings.reducedMotion), 'prefers-reduced-motion respected');
  await page.keyboard.press('Enter');
  check((await page.snap()).state === 'idle', 'Enter works and game runs without localStorage');
  await page.shot('idle');
  check(page.errors.length === 0, 'no console errors (reduced motion, storage blocked)', page.errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
