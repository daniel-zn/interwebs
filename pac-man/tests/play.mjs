// End-to-end check in headless Chromium: the attract demo, starting a game,
// keyboard and swipe steering, pause/help/sound menus, persistence, crisp
// scaling on desktop and phone, and frame cost. Screenshots go to test-results/.
//
//   node tests/play.mjs                 (from pac-man/)
//   CHROMIUM_PATH=/path node tests/play.mjs
//
// Uses playwright-core (installed at the repo root) or playwright.
import { mkdir } from 'node:fs/promises';
import { serve } from '../tools/serve.mjs';

const { chromium } = await import('playwright-core').catch(() => import('playwright'));
const PORT = 8768;
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
  await page.waitForFunction(() => window.__pac && window.__pac.perf.frames > 10);
  page.snap = () => page.evaluate(() => window.__pac.snapshot());
  page.errors = errors;
  page.shot = (label) => page.screenshot({ path: `${OUT}${name}-${label}.png` });
  return page;
}

// ------------------------------------------------------------------ desktop, keyboard
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openGame(context, 'desktop');
  let s = await page.snap();
  check(s.state === 'title', 'opens on the title screen', s.state);
  check((await page.textContent('#hint')).includes('Enter'), 'title hint says how to start');
  await sleep(2500);
  s = await page.snap();
  check(s.dotsLeft < 244, 'the attract demo plays itself', `${244 - s.dotsLeft} dots eaten`);
  await page.shot('title');

  await page.keyboard.press('Enter');
  s = await page.snap();
  check(s.state === 'play' && s.phase === 'ready' && s.lives === 3 && s.score === 0, 'Enter starts a game at READY!', `${s.phase} lives ${s.lives}`);
  await page.waitForFunction(() => window.__pac.snapshot().phase === 'play', null, { timeout: 8000 });
  await sleep(400);
  s = await page.snap();
  check(s.pac.x < 14 && s.score > 0, 'Pac-Man sets off left and eats', `x ${s.pac.x}, score ${s.score}`);

  await page.keyboard.press('ArrowRight');
  await sleep(700);
  s = await page.snap();
  check(s.pac.dir === 3 && s.pac.x > 12, 'arrow keys steer (reverse to the right)', `dir ${s.pac.dir} x ${s.pac.x}`);
  await page.keyboard.press('ArrowUp');
  await sleep(900);
  s = await page.snap();
  check(s.pac.y < 23.5, 'a buffered turn takes the next gap up', `y ${s.pac.y}`);
  await page.shot('play');

  // Canvas scale: whole device pixels per game pixel.
  const size = await page.evaluate(() => {
    const c = document.getElementById('game');
    return { w: c.width, h: c.height, cw: c.getBoundingClientRect().width, scale: window.__pac.snapshot().scale };
  });
  check(Number.isInteger(size.scale) && Math.abs(size.cw - size.w * size.scale) < 1, 'canvas scales by whole pixels', `${size.w}x${size.h} x${size.scale}`);

  // Pause.
  await page.keyboard.press('p');
  const t1 = (await page.snap()).t;
  await sleep(400);
  s = await page.snap();
  check(s.paused && s.t === t1 && (await page.isVisible('#pause')), 'P pauses and shows the menu');
  await page.click('#btn-resume');
  await sleep(300);
  s = await page.snap();
  check(!s.paused && s.t > t1, 'Resume carries on');

  // Help and settings.
  await page.keyboard.press('h');
  check(await page.isVisible('#help'), 'H opens help');
  s = await page.snap();
  check(s.paused, 'help pauses the game');
  await page.click('#opt-relaxed');
  await page.click('#help .close');
  await sleep(150);
  s = await page.snap();
  check(!s.paused && !(await page.isVisible('#help')), 'closing help resumes');

  await page.keyboard.press('m');
  check((await page.getAttribute('#btn-sound', 'aria-pressed')) === 'false', 'M mutes');
  await page.keyboard.press('m');

  // Get caught on purpose until the game ends, then check the high score sticks.
  await page.evaluate(() => {
    const g = window.__pac.game();
    g.lives = 1;
    g.score = 1230;
    const b = g.ghosts[0];
    b.state = 'active';
    b.fright = false;
    b.x = g.pac.x;
    b.y = g.pac.y;
  });
  await page.waitForFunction(() => window.__pac.snapshot().phase === 'over', null, { timeout: 8000 });
  await sleep(300);
  check((await page.textContent('#hint')).toLowerCase().includes('again'), 'game over offers another go');
  await page.shot('over');
  const high = await page.evaluate(() => JSON.parse(localStorage.getItem('pac-man:v1')));
  check(high.high >= 1230 && high.settings.relaxed === true, 'high score and settings persist', JSON.stringify(high));
  await sleep(400);
  await page.keyboard.press('Enter');
  s = await page.snap();
  check(s.state === 'play' && s.phase === 'ready' && s.score === 0, 'Enter plays again');

  // Pause -> quit to title.
  await page.waitForFunction(() => window.__pac.snapshot().phase === 'play', null, { timeout: 8000 });
  await page.keyboard.press('Escape');
  await page.click('#btn-quit');
  await sleep(200);
  s = await page.snap();
  check(s.state === 'title', 'Quit returns to the title');

  const perf = await page.evaluate(() => window.__pac.perf);
  check(perf.worst < 50, 'frames are cheap', `worst ${perf.worst.toFixed(1)} ms over ${perf.frames} frames`);
  check(page.errors.length === 0, 'no console errors (desktop)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ phone, touch
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await openGame(context, 'phone');
  check((await page.textContent('#hint')).includes('Tap'), 'touch hint on phones');
  const box = await page.$eval('#game', (c) => c.getBoundingClientRect().toJSON());
  const { scale } = await page.snap();
  check(scale >= 4, 'the maze is big on a phone', `scale ${scale}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow && box.width <= 391, 'no horizontal overflow');

  await page.tap('#game', { position: { x: 195, y: 500 } });
  let s = await page.snap();
  check(s.state === 'play', 'a tap starts a game');
  await page.waitForFunction(() => window.__pac.snapshot().phase === 'play', null, { timeout: 8000 });

  const swipe = (dx, dy) => page.evaluate(async ([dx, dy]) => {
    const c = document.getElementById('game');
    const opts = (x, y) => ({ pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true });
    c.dispatchEvent(new window.PointerEvent('pointerdown', opts(200, 400)));
    for (let i = 1; i <= 4; i++) c.dispatchEvent(new window.PointerEvent('pointermove', opts(200 + (dx * i) / 4, 400 + (dy * i) / 4)));
    c.dispatchEvent(new window.PointerEvent('pointerup', opts(200 + dx, 400 + dy)));
  }, [dx, dy]);
  await swipe(60, 4);
  await sleep(500);
  s = await page.snap();
  check(s.pac.dir === 3, 'swipe right steers right', `dir ${s.pac.dir}`);
  await swipe(0, -60);
  await sleep(1200);
  s = await page.snap();
  check(s.pac.y < 23.5, 'swipe up turns up at the next gap', `y ${s.pac.y}`);
  check(s.state === 'play', 'swipes do not restart the game');
  await page.shot('play');
  check(page.errors.length === 0, 'no console errors (phone)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ landscape phone
{
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await openGame(context, 'landscape');
  const { scale } = await page.snap();
  const layout = await page.evaluate(() => ({ w: document.getElementById('game').width }));
  check(scale >= 4 && layout.w >= 360, 'landscape uses the side-by-side layout', `scale ${scale}, ${layout.w} px wide`);
  await page.shot('title');
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll play checks passed');
process.exit(failures ? 1 : 0);
