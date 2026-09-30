// Builds the site and checks it in headless Chromium, serving dist/ the way the
// Cloudflare config does (auto trailing slash, custom 404 page).
//
//   npm run check                 # build + checks
//   npm run check -- --shots DIR  # also save screenshots to DIR
//
// A throwaway project without cover art is added for the run to exercise the
// generated placeholder cover, then removed again.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, findProjects } from './lib.mjs';

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
const DIST = join(ROOT, 'dist');
const TEMP = join(ROOT, 'zz-check-placeholder');

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};

await mkdir(TEMP, { recursive: true });
await writeFile(join(TEMP, 'index.html'), '<!doctype html><title>Check Placeholder</title><meta name="description" content="Temporary project."><h1>hi</h1>');
try {
  execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'inherit' });
} finally {
  await rm(TEMP, { recursive: true, force: true });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(DIST, path));
  try {
    if (!file.startsWith(DIST)) throw new Error('outside');
    if ((await stat(file)).isDirectory()) {
      if (!path.endsWith('/')) {
        res.writeHead(307, { location: `${path}/` }).end();
        return;
      }
      file = join(file, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(await readFile(join(DIST, '404.html')));
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
};

// ------------------------------------------------------------------ desktop
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(page);
  await page.goto(base + '/');
  const cards = await page.$$eval('.card', (els) => els.map((a) => ({
    href: a.getAttribute('href'), title: a.querySelector('.title').textContent,
    img: a.querySelector('img').complete && a.querySelector('img').naturalWidth > 0,
  })));
  // Every real project, plus the placeholder added for this run.
  const expected = (await findProjects()).length + 1;
  check(cards.length === expected, 'one card per project folder', cards.map((c) => c.href).join(' '));
  check(cards.every((c) => /^\/[\w-]+\/$/.test(c.href)), 'cards link to /<folder>/');
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const imgs = await page.$$eval('.card img', (els) => els.map((i) => i.naturalWidth));
  check(imgs.every((w) => w > 0), 'all cover images load (incl. generated placeholder)', imgs.join(','));
  check(cards.some((c) => c.title === 'Check Placeholder'), 'project without cover still gets a card');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-desktop.png` });

  // Keyboard: arrows move focus between cards, Enter launches.
  await page.keyboard.press('ArrowRight');
  const f1 = await page.evaluate(() => document.activeElement.getAttribute('href'));
  await page.keyboard.press('ArrowRight');
  const f2 = await page.evaluate(() => document.activeElement.getAttribute('href'));
  check(f1 === cards[0].href && f2 === cards[1].href, 'arrow keys move between cards', `${f1} -> ${f2}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-selected.png` });
  // Two columns: down from the first card lands on the third.
  await page.setViewportSize({ width: 760, height: 800 });
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  const f3 = await page.evaluate(() => document.activeElement.getAttribute('href'));
  check(f3 === cards[2].href, 'arrow down moves to the card below', f3);
  await page.keyboard.press('ArrowUp');
  const f4 = await page.evaluate(() => document.activeElement.getAttribute('href'));
  check(f4 === cards[0].href, 'arrow up moves back', f4);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.keyboard.press('Home');
  await Promise.all([page.waitForURL(`**${cards[0].href}`), page.keyboard.press('Enter')]);
  check(page.url().endsWith(cards[0].href), 'Enter launches the selected experience', new URL(page.url()).pathname);
  await page.waitForTimeout(600);
  check((await page.title()) === cards[0].title, 'experience page loads at its folder', await page.title());

  await page.goBack();
  await page.waitForTimeout(300);
  check(!(await page.evaluate(() => document.body.classList.contains('launching'))), 'back button returns to a usable select screen');

  // Click path.
  await Promise.all([page.waitForURL(`**${cards[1].href}`), page.click(`.card[href="${cards[1].href}"]`)]);
  check(page.url().endsWith(cards[1].href), 'clicking a card opens it', new URL(page.url()).pathname);

  // Folder URL without a trailing slash, and an unknown path.
  const noSlash = cards[1].href.slice(0, -1);
  await page.goto(base + noSlash);
  check(page.url().endsWith(cards[1].href), 'folder without trailing slash redirects', new URL(page.url()).pathname);
  for (const icon of ['/favicon.ico', '/apple-touch-icon.png']) {
    const r = await page.goto(base + icon);
    const type = r.headers()['content-type'] || '';
    check(r.status() === 200 && !type.includes('html'), `root icon ${icon} is served`, `${r.status()} ${type}`);
  }
  const res = await page.goto(base + '/does-not-exist');
  check(res.status() === 404 && (await page.textContent('.lost p')).includes('Nothing drifts'), 'unknown path shows the 404 page');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/404.png` });
  await page.close();
}

// ------------------------------------------------------------------ phone
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(base + '/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(!overflow, 'no horizontal scroll on phone');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-phone.png`, fullPage: true });
  const href = await page.getAttribute('.card', 'href');
  await Promise.all([page.waitForURL(`**${href}`), page.tap('.card')]);
  check(page.url().endsWith(href), 'tapping a card opens it', new URL(page.url()).pathname);
  await ctx.close();
}

// ------------------------------------------------------------------ reduced motion
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 700 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(base + '/');
  const href = await page.getAttribute('.card', 'href');
  const t0 = Date.now();
  await Promise.all([page.waitForURL(`**${href}`), page.click('.card')]);
  check(Date.now() - t0 < 450, 'reduced motion skips the launch animation', `${Date.now() - t0} ms`);
  await ctx.close();
}

// ------------------------------------------------------------------ sound on phones
// Headless Chromium lets audio start anytime, which hides a classic phone bug:
// real phones only let an AudioContext start inside a finished tap (touchend,
// pointerup, click) or a key press, never on pointerdown or touchstart. This
// fakes that rule, taps every game twice and checks its sound actually starts.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    const Real = window.AudioContext || window.webkitAudioContext;
    if (!Real) return;
    window.__audio = [];
    let current = null;
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown', 'mousedown']) {
      window.addEventListener(type, (e) => {
        current = e;
        setTimeout(() => current === e && (current = null));
      }, true);
    }
    const allowed = (e) => !!e && (['pointerup', 'touchend', 'click', 'keydown', 'mousedown'].includes(e.type) || (e.type === 'pointerdown' && e.pointerType === 'mouse'));
    class PhoneAudioContext extends Real {
      constructor(...args) {
        super(...args);
        this.fakeState = 'suspended';
        window.__audio.push(this);
      }
      get state() {
        return this.fakeState;
      }
      resume() {
        if (!allowed(current)) return Promise.reject(new DOMException('The AudioContext was not allowed to start.', 'NotAllowedError'));
        this.fakeState = 'running';
        return super.resume();
      }
      suspend() {
        this.fakeState = 'suspended';
        return super.suspend();
      }
    }
    window.AudioContext = PhoneAudioContext;
    window.webkitAudioContext = PhoneAudioContext;
  });
  for (const p of await findProjects()) {
    const page = await ctx.newPage();
    await page.goto(`${base}/${p.slug}/`);
    await page.waitForTimeout(500);
    await page.touchscreen.tap(195, 460);
    await page.waitForTimeout(300);
    await page.touchscreen.tap(195, 460);
    await page.waitForTimeout(300);
    const states = await page.evaluate(() => (window.__audio || []).map((c) => c.state));
    if (states.length) check(states.includes('running'), `${p.slug}: sound starts from a phone tap`, states.join(','));
    await page.close();
  }
  await ctx.close();
}

// ------------------------------------------------------------------ phone gestures
// iOS Safari ignores user-scalable=no, so double-tapping a button or a gap in
// the controls zooms the page unless touch-action says otherwise, and a long
// press or double tap selects text (even visually hidden text) unless
// user-select is off. Headless Chromium doesn't zoom or select, so this reads
// the computed styles instead: every element in every game must be covered by
// a touch-action other than auto, and nothing but text fields may be selectable.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const p of await findProjects()) {
    const page = await ctx.newPage();
    await page.goto(`${base}/${p.slug}/`);
    await page.waitForTimeout(300);
    const bad = await page.evaluate(() => {
      const zoomable = new Set(), selectable = new Set();
      const name = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.classList.length ? `.${[...el.classList].join('.')}` : '');
      const scrolls = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY + getComputedStyle(el).overflowX) || el === document.documentElement;
      for (const el of [document.documentElement, ...document.querySelectorAll('body, body *')]) {
        if (['SCRIPT', 'STYLE', 'TITLE', 'META', 'LINK'].includes(el.tagName)) continue;
        // touch-action applies as the intersection up to the nearest scroll container.
        let covered = false;
        for (let a = el; a; a = a.parentElement) {
          if (getComputedStyle(a).touchAction !== 'auto') {
            covered = true;
            break;
          }
          if (a !== el && scrolls(a)) break;
        }
        if (!covered) zoomable.add(name(el));
        const cs = getComputedStyle(el);
        const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (text && !['INPUT', 'TEXTAREA'].includes(el.tagName) && (cs.userSelect ?? cs.webkitUserSelect) !== 'none' && cs.webkitUserSelect !== 'none') selectable.add(name(el));
      }
      return { zoomable: [...zoomable].slice(0, 6), selectable: [...selectable].slice(0, 6) };
    });
    check(!bad.zoomable.length, `${p.slug}: double-tap can't zoom anywhere`, bad.zoomable.join(' '));
    check(!bad.selectable.length, `${p.slug}: no stray text selection on long press`, bad.selectable.join(' '));
    const pinch = await page.evaluate(() => {
      const e = new Event('gesturestart', { cancelable: true });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    });
    check(pinch, `${p.slug}: pinch-zoom is blocked on iOS`);
    await page.close();
  }
  await ctx.close();
}

// ------------------------------------------------------------------ edge to edge
// iPhones show the page behind the status bar and Safari's toolbars, outside
// the area a game's canvas fills. Each game's bleed.js paints strips just
// past the top and bottom of the screen in its canvas's edge colours, and
// keeps the page background in step with them. No theme-color, so Safari's
// bars stay see-through instead of solid.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  {
    // The home page: its own background runs behind the bars as it scrolls.
    const page = await ctx.newPage();
    await page.goto(`${base}/`);
    const home = await page.evaluate(() => ({
      theme: !!document.querySelector('meta[name="theme-color"]'),
      html: getComputedStyle(document.documentElement).backgroundImage + getComputedStyle(document.documentElement).backgroundColor,
    }));
    check(!home.theme && home.html === 'nonergba(0, 0, 0, 0)', 'home page: Safari\'s bars stay see-through over the page\'s own background', JSON.stringify(home));
    await page.close();
  }
  for (const p of await findProjects()) {
    const page = await ctx.newPage();
    await page.goto(`${base}/${p.slug}/`);
    if (!(await page.$('canvas#game'))) {
      await page.close();
      continue;
    }
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const top = document.querySelector('.bleed-top'), bottom = document.querySelector('.bleed-bottom');
      if (!top || !bottom) return null;
      const rgb = (c) => c.getContext('2d').getImageData(c.width >> 1, 0, 1, 1).data.slice(0, 3).join(',');
      const game = document.getElementById('game');
      const g = document.createElement('canvas');
      g.width = 1;
      g.height = 1;
      g.getContext('2d').drawImage(game, game.width >> 1, 0, 1, 1, 0, 0, 1, 1);
      return {
        outside: top.getBoundingClientRect().bottom <= 0 && bottom.getBoundingClientRect().top >= innerHeight && top.getBoundingClientRect().height > 100,
        painted: rgb(top) !== '0,0,0' || rgb(g) === '0,0,0',
        root: getComputedStyle(document.documentElement).backgroundImage.includes('gradient'),
        seeThrough: !document.querySelector('meta[name="theme-color"]'),
      };
    });
    check(r && r.outside && r.painted, `${p.slug}: the backdrop carries on past the top and bottom of the screen`, JSON.stringify(r));
    check(r && r.root && r.seeThrough, `${p.slug}: the page colour follows the game's edges, and Safari's bars stay see-through`, JSON.stringify(r));
    await page.close();
  }
  await ctx.close();
}

check(errors.length === 0, 'no console errors', errors.join(' | '));

await browser.close();
server.close();
// Rebuild without the throwaway project so dist/ matches the repo.
execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'ignore' });
console.log(failures ? `\n${failures} check(s) failed` : '\nAll site checks passed');
process.exit(failures ? 1 : 0);
