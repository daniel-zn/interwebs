// Captures a cover.png for each project from its own <canvas>, at the canvas's
// native pixel size, so title cards stay crisp and tiny. Projects without a
// canvas get a page screenshot instead.
//
//   npm run covers            # only projects that have no cover yet
//   npm run covers -- --force # recapture everything
//   npm run covers -- astro-angler
//
// Uses playwright-core. Point CHROMIUM_PATH at a Chromium binary if Playwright's
// own browsers are not installed.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, findProjects } from './lib.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    let file = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!file.startsWith(ROOT)) throw new Error('outside');
    if (file.endsWith('/')) file += 'index.html';
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// A small 16:9 viewport at 1x: pixel-art games render at (or near) native size.
const page = await browser.newPage({ viewport: { width: 400, height: 225 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });

for (const p of await findProjects()) {
  if (only.length && !only.includes(p.slug)) continue;
  if (p.cover && !force) {
    console.log(`skip   ${p.slug} (has ${p.cover})`);
    continue;
  }
  await page.goto(`${base}/${p.slug}/?seed=7`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const dataUrl = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
    try {
      return canvases[0] && canvases[0].width >= 160 ? canvases[0].toDataURL('image/png') : null;
    } catch {
      return null;
    }
  });
  const out = join(p.dir, 'cover.png');
  if (dataUrl) await writeFile(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  else await page.screenshot({ path: out });
  console.log(`cover  ${p.slug} -> ${p.slug}/cover.png (${dataUrl ? 'canvas' : 'screenshot'})`);
}

await browser.close();
server.close();
