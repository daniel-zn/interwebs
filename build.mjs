// Builds the site served at interwebs.danielzn.com.
//
// Every top-level folder with an index.html is a project. It is copied to
// dist/<folder>/, so it is served at /<folder>/, without dev-only files (tests,
// tooling, package manifests). The home page is a "select an experience" screen
// with one title card per project, generated from each project's index.html:
//
//   <title>                          card title
//   <meta name="description">        card blurb
//   <meta name="theme-color">        card accent (or <meta name="interwebs:accent">)
//   <meta name="interwebs:kind">     small label, e.g. "Game" (default "Experience")
//   <meta name="interwebs:order">    optional sort order (lower first)
//   cover.png / .webp / .jpg / .svg  card art (16:9); `npm run covers` captures one.
//                                    Without it the card gets a generated pixel cover.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { findProjects, ROOT } from './scripts/lib.mjs';
import { iconIco, iconPng, iconSvgDataUri } from './scripts/icons.mjs';
import { pixelText } from './scripts/pixelfont.mjs';

const OUT = join(ROOT, 'dist');
const SITE = 'interwebs.danielzn.com';

// Skipped when copying a project. Matched against each file or folder name.
const EXCLUDE = new Set([
  'node_modules', 'tests', 'test-results', 'scripts', 'tools',
  'package.json', 'package-lock.json', 'eslint.config.js', 'README.md',
]);

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

const isColor = (c) => /^#[0-9a-f]{3,8}$/i.test(c);

// Accents that are too dark to read against the page fall back to a palette colour.
function accentFor(project, i) {
  const fallback = ['#7ff4ff', '#f3c252', '#e38bc4', '#8fcf78', '#ff9b6a'][i % 5];
  const c = project.accent;
  if (!isColor(c)) return fallback;
  const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 90 ? fallback : c;
}

function logoSvg(text, label) {
  const { path, width } = pixelText(text);
  return `<svg viewBox="-1 -1 ${width + 3} 8" role="img" aria-label="${escapeHtml(label)}">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff6d6"/><stop offset=".55" stop-color="#fff6d6"/><stop offset=".56" stop-color="#7ff4ff"/><stop offset="1" stop-color="#7ff4ff"/>
      </linearGradient></defs>
      <path d="${path}" fill="#3b2a78" transform="translate(1 1)"/>
      <path d="${path}" fill="url(#lg)"/>
    </svg>`;
}

/** A generated pixel cover for projects without cover art: stars, a planet, the title. */
function placeholderCover(project, accent) {
  let seed = 0;
  for (const ch of project.slug) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const W = 160, H = 90;
  let stars = '';
  for (let i = 0; i < 70; i++) stars += `M${Math.floor(rnd() * W)} ${Math.floor(rnd() * H)}h1v1h-1z`;
  const px = 30 + Math.floor(rnd() * 100), py = 18 + Math.floor(rnd() * 20), r = 9 + Math.floor(rnd() * 6);
  const words = project.title.toUpperCase().split(/\s+/);
  const lines = [];
  for (const w of words) {
    const lastLine = lines[lines.length - 1];
    if (lastLine && (lastLine + ' ' + w).length <= 12) lines[lines.length - 1] = `${lastLine} ${w}`;
    else lines.push(w.slice(0, 12));
  }
  const text = lines.slice(0, 2).map((line, i) => {
    const t = pixelText(line);
    const x = Math.round((W - t.width * 2) / 2);
    const y = 50 + i * 14;
    return `<path d="${t.path}" transform="translate(${x + 1} ${y + 1}) scale(2)" fill="#07081a"/><path d="${t.path}" transform="translate(${x} ${y}) scale(2)" fill="#fff6d6"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">
<rect width="${W}" height="${H}" fill="#0d1030"/>
<path d="${stars}" fill="#8e97cf"/>
<circle cx="${px}" cy="${py}" r="${r}" fill="${accent}" opacity=".85"/>
<circle cx="${px - 3}" cy="${py - 3}" r="${r - 4}" fill="#ffffff" opacity=".18"/>
<rect x="${px - r - 7}" y="${py}" width="${2 * r + 14}" height="1" fill="#eef1f6" opacity=".6"/>
${text}
</svg>
`;
}

function page({ title, description, body, head = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#07081a">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/svg+xml" href="${iconSvgDataUri()}">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/_home/home.css">
${head}</head>
<body>
  <canvas id="sky" aria-hidden="true"></canvas>
  <div class="scanlines" aria-hidden="true"></div>
${body}
  <div class="wipe" aria-hidden="true"></div>
  <script type="module" src="/_home/home.js"></script>
</body>
</html>
`;
}

// ------------------------------------------------------------------ build
const projects = await findProjects();

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, '_home'), { recursive: true });

for (const { slug } of projects) {
  await cp(join(ROOT, slug), join(OUT, slug), {
    recursive: true,
    filter: (src) => !EXCLUDE.has(basename(src)) && !basename(src).startsWith('.'),
  });
}
for (const f of ['home.css', 'home.js']) await cp(join(ROOT, '_site', f), join(OUT, '_home', f));
// Root icons: browsers that skip a page's SVG icon (Safari, notably) ask for these.
await writeFile(join(OUT, 'favicon.ico'), iconIco());
await writeFile(join(OUT, 'apple-touch-icon.png'), iconPng(180));
await writeFile(join(OUT, 'apple-touch-icon-precomposed.png'), iconPng(180));

const cards = [];
for (const [i, p] of projects.entries()) {
  const accent = accentFor(p, i);
  let cover = p.cover ? `/${p.slug}/${p.cover}` : null;
  if (!cover) {
    await writeFile(join(OUT, '_home', `${p.slug}.svg`), placeholderCover(p, accent));
    cover = `/_home/${p.slug}.svg`;
  }
  cards.push(`      <li>
        <a class="card" href="/${p.slug}/" style="--accent:${accent}">
          <span class="shot"><img src="${cover}" alt="" width="400" height="225" loading="${i < 6 ? 'eager' : 'lazy'}" decoding="async"><span class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span></span>
          <span class="body">
            <span class="kind">${escapeHtml(p.kind)}</span>
            <span class="title">${escapeHtml(p.title)}</span>
            ${p.description ? `<span class="desc">${escapeHtml(p.description)}</span>` : ''}
            <span class="play" aria-hidden="true"><b>▶</b>Press start</span>
          </span>
        </a>
      </li>`);
}

const count = `${projects.length} ${projects.length === 1 ? 'experience' : 'experiences'}`;
const firstCover = projects.find((p) => p.cover);
const home = page({
  title: 'interwebs',
  description: `Small games and experiments by Daniel. ${count}.`,
  head: `  <meta property="og:title" content="interwebs">
  <meta property="og:description" content="Small games and experiments. Select an experience.">
${firstCover ? `  <meta property="og:image" content="https://${SITE}/${firstCover.slug}/${firstCover.cover}">\n` : ''}`,
  body: `  <header class="top">
    <h1 class="logo">${logoSvg('INTERWEBS', 'interwebs')}</h1>
    <p class="tagline">Select an experience<span class="cursor" aria-hidden="true">_</span></p>
  </header>
  <main>
${projects.length
    ? `    <ul class="grid${projects.length < 3 ? ' few' : ''}" aria-label="Experiences">
${cards.join('\n')}
    </ul>`
    : '    <p class="empty">Nothing here yet. Add a folder with an index.html.</p>'}
  </main>
  <footer>
    <p class="hint-keys"><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>Enter</kbd> start · gamepad works too</p>
    <p class="hint-touch">Tap a card to start</p>
    <p>${count}</p>
  </footer>`,
});
await writeFile(join(OUT, 'index.html'), home);

await writeFile(join(OUT, '404.html'), page({
  title: 'Lost in space · interwebs',
  description: 'Nothing lives at this address.',
  body: `  <main class="lost">
    <h1 class="logo">${logoSvg('404', 'Not found')}</h1>
    <p>Nothing drifts at this address.</p>
    <a href="/">Back to the select screen</a>
  </main>`,
}));

// Guard against publishing an HTML file from a project that links outside its folder.
for (const { slug } of projects) {
  const html = await readFile(join(OUT, slug, 'index.html'), 'utf8');
  const rootRefs = [...html.matchAll(/(?:src|href)="(\/[^/"][^"]*)"/g)].map((m) => m[1]);
  if (rootRefs.length) console.warn(`warning: ${slug}/index.html uses root paths (${rootRefs.join(', ')}); use relative paths.`);
}

console.log(`Built ${projects.length} project(s): ${projects.map((p) => p.slug).join(', ')}`);
