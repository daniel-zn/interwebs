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
import { ROOT } from './lib.mjs';

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

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
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
  check(cards.length === 3, 'one card per project folder', cards.map((c) => c.href).join(' '));
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

check(errors.length === 0, 'no console errors', errors.join(' | '));

await browser.close();
server.close();
// Rebuild without the throwaway project so dist/ matches the repo.
execFileSync('node', ['build.mjs'], { cwd: ROOT, stdio: 'ignore' });
console.log(failures ? `\n${failures} check(s) failed` : '\nAll site checks passed');
process.exit(failures ? 1 : 0);
