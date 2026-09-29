// End-to-end check in headless Chromium: the attract mode, starting a game,
// the plunger and flippers from the keyboard and touch, a sector warp and
// upgrade, pause and help, game over and the high score, scaling, and frame
// cost. Screenshots go to test-results/.
//
//   node tests/play.mjs                 (from supernova-pinball/)
//   CHROMIUM_PATH=/path node tests/play.mjs
import { mkdir } from 'node:fs/promises';
import { serve } from '../tools/serve.mjs';

const { chromium } = await import('playwright-core').catch(() => import('playwright'));
const PORT = 8771;
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

async function openGame(context, name, query = '?test&seed=4') {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/${query}`);
  await page.waitForFunction(() => window.__pin && window.__pin.perf.frames > 10);
  page.snap = () => page.evaluate(() => window.__pin.snapshot());
  page.errors = errors;
  page.shot = (label) => page.screenshot({ path: `${OUT}${name}-${label}.png` });
  return page;
}

// ------------------------------------------------------------------ desktop, keyboard
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openGame(context, 'desktop');
  let s = await page.snap();
  check(s.mode === 'title' && s.panel === 'title', 'opens on the title screen');
  const score0 = s.score;
  await sleep(2500);
  s = await page.snap();
  check(s.score > score0 || s.balls.some((b) => b.y < 280), 'the attract mode plays itself', `score ${s.score}`);
  await page.shot('title');

  const size = await page.evaluate(() => {
    const c = document.getElementById('game');
    const s = window.__pin.snapshot(), L = window.__pin.layout();
    return { cw: c.getBoundingClientRect().width, ch: c.getBoundingClientRect().height, scale: s.scale, blit: s.blit, W: s.W, tall: (L.ty + L.TH - L.dy) * s.scale };
  });
  check(Math.abs(size.cw - 1280) < 1 && Math.abs(size.ch - 800) < 1, 'the canvas covers the window');
  check(Number.isInteger(size.blit) && size.blit >= size.scale, 'the frame is blown up by a whole number first', `x${size.blit}`);
  check(size.tall > 800 * 0.9, 'the table and its display fill the height', `${Math.round(size.tall)} of 800 px`);

  await page.keyboard.press('Space');
  await sleep(100);
  s = await page.snap();
  check(s.mode === 'play' && s.phase === 'launch' && s.ballsLeft === 3 && s.score === 0, 'Space starts a game with a ball on the plunger', `${s.phase}`);

  await page.keyboard.down('Space');
  await sleep(600);
  const pull = await page.evaluate(() => window.__pin.game().plunger);
  check(pull > 0.5, 'holding Space pulls the plunger back', pull.toFixed(2));
  await page.keyboard.up('Space');
  await sleep(700);
  s = await page.snap();
  check(s.phase === 'play' && s.balls[0].y < 250, 'releasing launches the ball', `y ${s.balls[0] && s.balls[0].y}`);

  await page.keyboard.down('KeyZ');
  await sleep(80);
  const f1 = await page.evaluate(() => window.__pin.game().table.flippers.map((f) => f.held));
  await page.keyboard.up('KeyZ');
  await page.keyboard.down('ArrowRight');
  await sleep(80);
  const f2 = await page.evaluate(() => window.__pin.game().table.flippers.map((f) => f.held));
  await page.keyboard.up('ArrowRight');
  check(f1[0] && !f1[1] && f2[1] && !f2[0], 'Z flips left, the right arrow flips right');
  await page.shot('play');

  // Pause and help.
  await page.keyboard.press('p');
  const t1 = (await page.snap()).score;
  check(await page.evaluate(() => document.getElementById('pause').open), 'P pauses');
  await page.keyboard.press('Escape');
  await sleep(100);
  check(!(await page.snap()).paused, 'Escape resumes', String(t1));
  await page.keyboard.press('h');
  check(await page.evaluate(() => document.getElementById('help').open), 'H opens help');
  await page.click('#opt-music');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => window.__pin.store.settings.music === false), 'music setting is saved');

  // Sector clear: warp, then pick an upgrade with the keyboard.
  await page.evaluate(() => {
    const g = window.__pin.game();
    g.phase = 'play';
    g.sectorScore = g.target;
  });
  await page.waitForFunction(() => window.__pin.snapshot().panel === 'upgrade', null, { timeout: 8000 });
  await sleep(200);
  await page.shot('upgrade');
  s = await page.snap();
  check(s.offers.length === 3, 'clearing the sector offers three upgrades', s.offers.join(','));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(100);
  s = await page.snap();
  check(s.sector === 2 && s.upgrades.length === 1 && s.panel === null, 'picking one warps to sector 2', `${s.sector} ${s.upgrades}`);

  // Game over and the high score.
  await page.evaluate(() => {
    const g = window.__pin.game();
    g.ballsLeft = 1;
    g.phase = 'play';
    g.ballSaveT = 0;
    g.balls = [g.balls[0]];
    Object.assign(g.balls[0], { x: 100, y: 392, vx: 0, vy: 300, held: null });
    g.score = 123456;
  });
  await page.waitForFunction(() => window.__pin.snapshot().panel === 'over', null, { timeout: 10000 });
  await page.shot('over');
  check(await page.evaluate(() => window.__pin.store.high >= 123456), 'the high score is saved');
  await page.keyboard.press('Space');
  await sleep(100);
  s = await page.snap();
  check(s.mode === 'play' && s.sector === 1 && s.score === 0, 'Space plays again');

  const perf = await page.evaluate(() => window.__pin.perf);
  check(perf.worst < 60, 'frames are cheap', `worst ${perf.worst.toFixed(1)} ms`);
  check(page.errors.length === 0, 'no console errors (desktop)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ a real game with the autopilot
{
  const context = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  const page = await openGame(context, 'auto', '?test&auto&seed=9&fast');
  await page.keyboard.press('Space');
  await sleep(6000);
  const s = await page.snap();
  check(s.score > 10000, 'a game plays out: bumpers, targets and lanes score', `${s.score}`);
  await page.shot('auto');
  check(page.errors.length === 0, 'no console errors (autopilot)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ phone, touch
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await openGame(context, 'phone');
  await page.touchscreen.tap(195, 500);
  await sleep(100);
  let s = await page.snap();
  check(s.mode === 'play', 'a tap starts a game');
  check(s.scale * (200 + 12) >= 390 * 3 * 0.95, 'the table fills a phone', `x${s.scale.toFixed(2)}`);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 600 }] });
  await sleep(600);
  const pull = await page.evaluate(() => window.__pin.game().plunger);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(600);
  s = await page.snap();
  check(pull > 0.5 && s.phase === 'play', 'holding a finger pulls the plunger; letting go launches', pull.toFixed(2));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: 700, id: 1 }, { x: 330, y: 700, id: 2 }] });
  await sleep(80);
  const both = await page.evaluate(() => window.__pin.game().table.flippers.map((f) => f.held));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(both[0] && both[1], 'two fingers flip both flippers at once', JSON.stringify(both));
  await page.shot('play');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || document.documentElement.scrollHeight > window.innerHeight);
  check(!overflow, 'no scrolling on the phone');
  check(page.errors.length === 0, 'no console errors (phone)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ reduced motion
{
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' });
  const page = await openGame(context, 'calm', '?test&auto&seed=5');
  await page.keyboard.press('Space');
  await sleep(1500);
  await page.evaluate(() => (window.__pin.game().mass = 99.9));
  await sleep(2500);
  const v = await page.evaluate(() => ({ flash: window.__pin.view().flash, shake: window.__pin.view().shake }));
  check(v.flash === 0 && v.shake === 0, 'no flashing or shaking with reduced motion', JSON.stringify(v));
  check(page.errors.length === 0, 'no console errors (reduced motion)', page.errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll play checks passed');
process.exit(failures ? 1 : 0);
