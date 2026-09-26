// End-to-end check in headless Chromium: the title, the pit stop with the
// keyboard, spinning, wins and the void, a whole round to the deadline and a
// transmission, losing, resuming a saved run, menus, phone taps and scaling.
// Screenshots go to test-results/.
//
//   node tests/play.mjs                 (from black-hole-slots/)
//   CHROMIUM_PATH=/path node tests/play.mjs
//
// Uses playwright-core (installed at the repo root) or playwright.
import { mkdir } from 'node:fs/promises';
import { serve } from '../tools/serve.mjs';

const { chromium } = await import('playwright-core').catch(() => import('playwright'));
const PORT = 8769;
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

async function openGame(context, name, query = '?test&seed=4&fast') {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/${query}`);
  await page.waitForFunction(() => window.__slots && window.__slots.perf.frames > 10);
  page.snap = () => page.evaluate(() => window.__slots.snapshot());
  page.idle = () => page.waitForFunction(() => !window.__slots.snapshot().busy, null, { timeout: 15000 });
  page.errors = errors;
  page.shot = (label) => page.screenshot({ path: `${OUT}${name}-${label}.png` });
  return page;
}
const G = { c: 'comet', m: 'moon', p: 'planet', r: 'rocket', a: 'alien', g: 'gem', s: 'seven', v: 'void' };
const grid = (...rows) => [0, 1, 2, 3, 4].map((c) => rows.map((r) => G[r[c]]));
const LOSE = grid('mpcra', 'crmpg', 'mpcra');

// ------------------------------------------------------------------ desktop, keyboard
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openGame(context, 'desktop');
  let s = await page.snap();
  check(s.mode === 'title', 'opens on the title screen', s.mode);
  check((await page.textContent('#hint')).includes('Enter'), 'title hint says how to start');
  await sleep(1500);
  await page.shot('title');

  // Whole-pixel scaling.
  const size = await page.evaluate(() => {
    const c = document.getElementById('game');
    return { w: c.width, h: c.height, cw: c.getBoundingClientRect().width, scale: window.__slots.snapshot().scale };
  });
  check(Number.isInteger(size.scale) && Math.abs(size.cw - size.w * size.scale) < 1, 'canvas scales by whole pixels', `${size.w}x${size.h} x${size.scale}`);

  await page.keyboard.press('Enter');
  await sleep(100);
  s = await page.snap();
  check(s.mode === 'run' && s.panel === 'shop' && s.round === 1 && s.day === 1, 'Enter starts a run at the pit stop', `${s.panel} r${s.round}`);
  check(s.shop.length === 4 && s.tickets === 3 && s.coins === 0, 'four charms for sale, three tickets to spend', `${s.shop} ${s.tickets}`);
  await page.shot('shop');

  // Keyboard: arrows move focus, Enter buys the focused charm.
  await page.keyboard.press('ArrowRight');
  s = await page.snap();
  check(s.focus === 'shop:1', 'arrow right moves along the shop', s.focus);
  await page.evaluate(() => {
    // Make sure the focused charm is cheap enough to buy.
    const r = window.__slots.run();
    r.tickets = 10;
  });
  await page.keyboard.press('Enter');
  s = await page.snap();
  check(s.charms.length === 1 && s.shop[1] === null, 'Enter buys the focused charm', `${s.charms}`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  s = await page.snap();
  check(s.focus.startsWith('pkg:'), 'arrow down reaches the day deals', s.focus);
  await page.keyboard.press('Enter');
  await sleep(50);
  s = await page.snap();
  check(s.phase === 'spin' && s.panel === null && s.spinsLeft > 0, 'picking a deal starts the day', `${s.phase} ${s.spinsLeft} spins`);
  const spins0 = s.spinsLeft;
  await page.idle();

  // A forced win pays and the coins arrive.
  await page.evaluate((g) => window.__slots.force(g), grid('sssmp', 'mpcra', 'crmpg'));
  await page.keyboard.press(' ');
  await sleep(250);
  await page.shot('spinning');
  await page.idle();
  s = await page.snap();
  check(s.spinsLeft === spins0 - 1, 'space spins', `${s.spinsLeft}`);
  check(s.coins >= 7 && s.shownCoins === s.coins, 'a row of 7s pays and the counter catches up', `${s.coins} shown ${s.shownCoins}`);

  // A big one, captured mid-celebration.
  await page.evaluate((g) => window.__slots.force(g), grid('sssss', 'sssss', 'sssss'));
  await page.keyboard.press(' ');
  await sleep(1400);
  await page.shot('jackpot');
  // Pressing spin during the reveal skips it and spins again.
  const before = await page.snap();
  await page.evaluate((g) => window.__slots.force(g), LOSE);
  await page.waitForFunction(() => window.__slots.view().pending && window.__slots.view().reels.every((r) => r.stopped));
  await page.keyboard.press(' ');
  s = await page.snap();
  check(s.spinsLeft === before.spinsLeft - 1 || s.phase === 'dayEnd', 'spin during a reveal skips ahead', `${before.spinsLeft} -> ${s.spinsLeft}`);
  await page.idle();

  // The void.
  await page.evaluate(() => {
    const r = window.__slots.run();
    r.spinsLeft = Math.max(r.spinsLeft, 2);
  });
  const coinsBefore = (await page.snap()).coins;
  await page.evaluate((g) => window.__slots.force(g), grid('vpcra', 'crvpg', 'mpcrv'));
  await page.keyboard.press(' ');
  await sleep(900);
  await page.shot('void');
  await page.idle();
  s = await page.snap();
  check(s.coins === coinsBefore - Math.floor(coinsBefore * 0.25), 'three void eyes eat a quarter of the coins', `${coinsBefore} -> ${s.coins}`);

  // Play out the round: every day, then the deadline.
  let guard = 0;
  while (guard++ < 1500) {
    s = await page.snap();
    if (s.panel === 'deadline') break;
    if (s.busy) {
      await sleep(60);
      continue;
    }
    if (s.panel === 'shop') await page.evaluate(() => window.__slots.act('pkg:0'));
    else if (s.phase === 'spin') {
      await page.evaluate((g) => window.__slots.force(g), LOSE);
      await page.keyboard.press(' ');
    }
    await sleep(40);
  }
  s = await page.snap();
  check(s.panel === 'deadline' && s.day === 3, 'three days end at the deadline', `${s.panel} day ${s.day}`);
  await page.shot('deadline');
  await page.evaluate(() => {
    window.__slots.run().coins += 500;
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__slots.snapshot().panel === 'transmit', null, { timeout: 8000 });
  await sleep(500);
  await page.shot('transmit');
  s = await page.snap();
  check(s.panel === 'transmit', 'paying the debt brings a transmission');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__slots.snapshot().panel === 'shop', null, { timeout: 8000 });
  s = await page.snap();
  check(s.round === 2 && s.day === 1, 'picking a gift starts round 2', `r${s.round} d${s.day}`);

  // Saved run survives a reload.
  await page.reload();
  await page.waitForFunction(() => window.__slots && window.__slots.perf.frames > 5);
  check((await page.textContent('#hint')).includes('continue'), 'after a reload the title offers to continue');
  await page.keyboard.press('Enter');
  await sleep(100);
  s = await page.snap();
  check(s.round === 2 && s.panel === 'shop', 'the run resumes where it was', `r${s.round} ${s.panel}`);

  // Help dialog and settings.
  await page.keyboard.press('h');
  check(await page.evaluate(() => document.getElementById('help').open), 'H opens help');
  await page.click('#opt-fast');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => window.__slots.store.settings.fast === true), 'fast spins setting is saved');
  await page.keyboard.press('m');
  check(await page.evaluate(() => window.__slots.store.settings.muted === true), 'M mutes');

  // Losing: can't pay.
  await page.evaluate(() => {
    const r = window.__slots.run();
    r.phase = 'deadline';
    r.coins = 0;
    window.__slots.act('pay');
  });
  await sleep(700);
  await page.shot('swallowed');
  await page.waitForFunction(() => window.__slots.snapshot().panel === 'over', null, { timeout: 8000 });
  await page.shot('over');
  s = await page.snap();
  check(s.panel === 'over', 'an unpaid debt swallows the machine');
  check(await page.evaluate(() => window.__slots.store.run === null && window.__slots.store.best.runs === 1), 'the run is recorded and cleared');
  await page.keyboard.press('Enter');
  await sleep(100);
  s = await page.snap();
  check(s.round === 1 && s.panel === 'shop', 'NEW RUN starts over', `r${s.round}`);

  const perf = await page.evaluate(() => window.__slots.perf);
  check(perf.worst < 60, 'frames are cheap', `worst ${perf.worst.toFixed(1)} ms`);
  check(page.errors.length === 0, 'no console errors (desktop)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ escape
{
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const page = await openGame(context, 'won');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const r = window.__slots.run();
    r.round = 8;
    r.debt = 1400;
    r.phase = 'deadline';
    r.coins = 5000;
    window.__slots.act('pay');
  });
  await page.waitForFunction(() => window.__slots.snapshot().panel === 'won', null, { timeout: 8000 });
  await sleep(300);
  await page.shot('escaped');
  check(true, 'paying the eighth debt escapes');
  await page.evaluate(() => window.__slots.act('endless'));
  let s = await page.snap();
  check(s.panel === 'transmit' && s.endless, 'KEEP GOING continues into endless mode');
  await page.evaluate(() => window.__slots.act('offer:0'));
  await page.waitForFunction(() => window.__slots.snapshot().panel === 'shop', null, { timeout: 8000 });
  s = await page.snap();
  check(s.round === 9, 'endless round 9', `r${s.round}`);
  check(page.errors.length === 0, 'no console errors (escape)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ phone, touch
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await openGame(context, 'phone');
  check((await page.textContent('#hint')).includes('Tap'), 'touch devices get a tap hint');
  await page.shot('title');
  const box = async (id) => page.evaluate((id) => {
    const r = window.__slots.regions().find((q) => q.id === id);
    const c = document.getElementById('game').getBoundingClientRect();
    const k = c.width / document.getElementById('game').width;
    return r && { x: c.left + (r.x + r.w / 2) * k, y: c.top + (r.y + r.h / 2) * k };
  }, id);
  const m = await box('machine');
  await page.touchscreen.tap(m.x, m.y);
  await sleep(100);
  let s = await page.snap();
  check(s.panel === 'shop', 'tapping the machine starts a run', s.panel);
  await page.shot('shop');
  await page.evaluate(() => (window.__slots.run().tickets = 10));
  const card = await box('shop:2');
  await page.touchscreen.tap(card.x, card.y);
  s = await page.snap();
  check(s.charms.length === 0 && s.focus === 'shop:2', 'first tap on a charm shows it', `${s.focus}`);
  await page.touchscreen.tap(card.x, card.y);
  s = await page.snap();
  check(s.charms.length === 1, 'second tap buys it');
  const deal = await box('pkg:1');
  await page.touchscreen.tap(deal.x, deal.y);
  s = await page.snap();
  check(s.phase === 'spin', 'tapping a deal starts the day');
  await page.idle();
  await page.evaluate((g) => window.__slots.force(g), grid('ggggg', 'mpcra', 'crmpg'));
  const lever = await box('lever');
  await page.touchscreen.tap(lever.x, lever.y);
  await sleep(1200);
  await page.shot('win');
  await page.idle();
  s = await page.snap();
  check(s.coins >= 15, 'tapping the lever spins and pays', `${s.coins}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth || document.documentElement.scrollHeight > window.innerHeight);
  check(!overflow, 'no scrolling on the phone');
  const scale = (await page.snap()).scale;
  check(scale >= 6, 'the machine fills the phone width (6x on a 3x phone)', `x${scale}`);
  check(page.errors.length === 0, 'no console errors (phone)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ reduced motion
{
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' });
  const page = await openGame(context, 'calm');
  const rm = await page.evaluate(() => window.__slots.store.settings.reducedMotion);
  check(rm === true, 'reduced motion is picked up from the system');
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__slots.act('pkg:0'));
  await page.idle();
  await page.evaluate((g) => window.__slots.force(g), grid('sssss', 'sssss', 'sssss'));
  await page.keyboard.press(' ');
  await sleep(1500);
  const v = await page.evaluate(() => ({ flash: window.__slots.view().flash, shake: window.__slots.view().shake }));
  check(v.flash === 0 && v.shake === 0, 'no flashing or shaking with reduced motion', JSON.stringify(v));
  await page.shot('jackpot');
  check(page.errors.length === 0, 'no console errors (reduced motion)', page.errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll play checks passed');
process.exit(failures ? 1 : 0);
