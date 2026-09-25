// End-to-end smoke test in headless Chromium: plays the real fishing loop
// with keyboard, mouse and touch input, and checks dialogs, a11y hooks and fps.
//
//   node tests/smoke.mjs            (SMOKE_SHOTS=dir to save screenshots)
//
// Uses a locally installed `playwright` if present, else the global one.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { startServer } from '../scripts/serve.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall through */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(`${globalRoot}/playwright`);
}
const { chromium } = loadPlaywright();
const SHOTS = process.env.SMOKE_SHOTS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
let failed = false;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed = true;
    results.push(`FAIL ${name}: ${e.message}`);
  }
  console.log(results[results.length - 1]);
}

async function openPage(opts, query = '?seed=42') {
  const page = await browser.newPage(opts);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + query);
  await page.waitForFunction(() => window.__astro && window.__astro.scene.W > 0);
  return { page, errors };
}
const state = (page) => page.evaluate(() => window.__astro.game.state);
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); }

async function waitState(page, states, timeout = 45000) {
  const want = [].concat(states);
  await page.waitForFunction((w) => w.includes(window.__astro.game.state), want, { timeout, polling: 30 });
  return state(page);
}

/**
 * Plays one full attempt: cast, wait for the bite, hook, reel with a
 * tension-aware policy. Returns the final state ('caught' or 'lost').
 */
async function fishOnce(page, input, shotPrefix) {
  await input.down();
  await sleep(1100); // charge the cast
  if (shotPrefix) await shot(page, shotPrefix + '-2-charge');
  await input.up();
  assert.equal(await state(page), 'cast');
  await waitState(page, 'wait', 5000);
  for (;;) {
    const s = await waitState(page, ['bite', 'idle']);
    if (s === 'idle') throw new Error('line came back without a bite');
    if (shotPrefix) await shot(page, shotPrefix + '-3-bite');
    await input.down(); // hook — and keep holding to reel
    const after = await state(page);
    if (after === 'reel') break;
    await input.up(); // too late: the fish left; keep waiting
  }
  let holding = true, shotReel = !!shotPrefix;
  for (;;) {
    const r = await page.evaluate(() => {
      const g = window.__astro.game;
      return { s: g.state, t: g.reel?.tension ?? 0, p: g.reel?.progress ?? 0 };
    });
    if (r.s !== 'reel') { if (holding) await input.up(); break; }
    if (shotReel && r.p > 0.5) { shotReel = false; await shot(page, shotPrefix + '-4-reel'); }
    if (holding && r.t > 0.62) { holding = false; await input.up(); }
    else if (!holding && r.t < 0.3) { holding = true; await input.down(); }
    await sleep(25);
  }
  return waitState(page, ['caught', 'idle', 'lost'], 5000);
}

async function catchAFish(page, input, prefix) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const s = await fishOnce(page, input, attempt === 0 ? prefix : null);
    if (s === 'caught') return;
    await waitState(page, 'idle', 5000);
  }
  throw new Error('no fish landed in 4 attempts');
}

// ---------------------------------------------------------------- desktop, keyboard
await step('desktop keyboard: full loop cast → bite → reel → catch → release', async () => {
  const { page, errors } = await openPage({ viewport: { width: 1280, height: 720 } });
  await sleep(400);
  await shot(page, 'desk-1-title');
  assert.equal(await state(page), 'title');
  const kb = { down: () => page.keyboard.down('Space'), up: () => page.keyboard.up('Space') };
  await page.keyboard.press('Space');
  assert.equal(await state(page), 'idle');
  await catchAFish(page, kb, 'desk');
  await sleep(700);
  await shot(page, 'desk-5-card');
  const caught = await page.evaluate(() => {
    const c = window.__astro.game.lastCatch;
    return { id: c.species.id, name: c.species.name, size: c.size, isNew: c.isNew, status: document.getElementById('status').textContent };
  });
  assert.ok(caught.size > 0 && caught.isNew === true, 'first catch is new');
  assert.match(caught.status, new RegExp(`Caught a ${caught.name}`), 'screen reader announcement');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('astro-angler/v1')));
  assert.equal(stored.log[caught.id].count, 1, 'catch persisted to localStorage');
  await page.keyboard.press('Space'); // release it back
  assert.equal(await state(page), 'idle');
  assert.equal(await page.evaluate(() => window.__astro.scene.freed.length), 1, 'released fish floats off');
  await sleep(1200);
  await shot(page, 'desk-6-release');

  // Star log dialog via keyboard, then focus returns to the game.
  await page.keyboard.press('l');
  assert.ok(await page.locator('#log-dialog').evaluate((d) => d.open));
  const logText = await page.locator('#log-list').innerText();
  assert.ok(logText.includes(caught.name) && logText.includes('???'));
  await shot(page, 'desk-7-log');
  await page.keyboard.press('Escape');
  assert.ok(!(await page.locator('#log-dialog').evaluate((d) => d.open)));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'stage');
  // Space after closing a dialog must cast, not re-open the dialog.
  await page.keyboard.down('Space');
  assert.equal(await state(page), 'charge');
  await page.keyboard.up('Space');

  const fps = await page.evaluate(() => window.__astro.fps);
  console.log(`     desktop fps ≈ ${fps.toFixed(1)}, scale ${await page.evaluate(() => window.__astro.scale)}x`);
  assert.ok(fps > 45, `fps ${fps}`);
  assert.deepEqual(errors, []);
  await page.close();
});

// ---------------------------------------------------------------- phone, touch
await step('phone touch: tap to start, touch-hold cast, tap bite, hold reel, catch', async () => {
  const { page, errors } = await openPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, '?seed=7');
  const cdp = await page.context().newCDPSession(page);
  const pt = [{ x: 195, y: 520, id: 1 }];
  const touch = {
    down: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt }),
    up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
  await touch.down(); await touch.up();
  assert.equal(await state(page), 'idle');
  await sleep(100);
  await shot(page, 'phone-1-idle');
  await catchAFish(page, touch, 'phone');
  await sleep(700);
  await shot(page, 'phone-5-card');
  await touch.down(); await touch.up();
  assert.equal(await state(page), 'idle');
  // No page scroll / zoom should have happened.
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  const scale = await page.evaluate(() => window.__astro.scale);
  assert.ok(Number.isInteger(scale) && scale >= 2, 'integer pixel scale');
  assert.deepEqual(errors, []);
  await page.close();
});

// ---------------------------------------------------------------- mouse + HUD
await step('mouse + HUD buttons: accessible names, sound toggle, settings', async () => {
  const { page, errors } = await openPage({ viewport: { width: 1024, height: 768 } });
  for (const id of ['btn-log', 'btn-sound', 'btn-settings']) {
    const name = await page.locator('#' + id).getAttribute('aria-label');
    assert.ok(name && name.length > 2, id + ' has a label');
    const box = await page.locator('#' + id).boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, id + ' is a 44px target');
  }
  await page.mouse.click(500, 500);
  assert.equal(await state(page), 'idle');
  // Clicking a HUD button must not start a cast underneath it.
  await page.click('#btn-sound');
  assert.equal(await page.getAttribute('#btn-sound', 'aria-pressed'), 'false');
  assert.equal(await state(page), 'idle');
  await page.click('#btn-sound');
  assert.equal(await page.getAttribute('#btn-sound', 'aria-pressed'), 'true');
  await page.click('#btn-settings');
  await page.check('input[name=relaxed]');
  await page.check('input[name=reduced]');
  assert.equal(await page.evaluate(() => window.__astro.game.relaxed), true);
  await shot(page, 'mouse-settings');
  await page.keyboard.press('Escape');
  await page.mouse.move(500, 500);
  await page.mouse.down();
  await sleep(500);
  assert.equal(await state(page), 'charge');
  await page.mouse.up();
  assert.equal(await state(page), 'cast');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('astro-angler/v1')).settings);
  assert.equal(saved.relaxed, true);
  assert.deepEqual(errors, []);
  await page.close();
});

// ---------------------------------------------------------------- odd viewports
await step('layout holds at small, landscape-phone and ultrawide sizes', async () => {
  for (const vp of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 2560, height: 1080 }]) {
    const { page, errors } = await openPage({ viewport: vp });
    const r = await page.evaluate(() => {
      const c = document.getElementById('screen').getBoundingClientRect();
      return { w: c.width, h: c.height, iw: innerWidth, ih: innerHeight, W: window.__astro.scene.W, H: window.__astro.scene.H };
    });
    assert.ok(r.w <= r.iw && r.h <= r.ih, 'canvas fits the viewport');
    assert.ok(r.w >= r.iw - 8 && r.h >= r.ih - 8, 'canvas fills the viewport');
    assert.ok(r.W >= 160 && r.H >= 150, `logical size ${r.W}x${r.H}`);
    await shot(page, `vp-${vp.width}x${vp.height}`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

await browser.close();
server.close();
console.log(failed ? '\nSMOKE FAILED' : `\nSMOKE PASSED (${results.filter((r) => r.startsWith('ok')).length} scenarios)`);
process.exit(failed ? 1 : 0);
