// Builds the site served at interwebs.danielzn.com.
//
// Every top-level folder with an index.html is a project and is copied to
// dist/<folder>/, so it is served at /<folder>/. Dev-only files (tests,
// tooling, package manifests) are left out. A landing page listing the
// projects and a 404 page are generated at the root.

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const ROOT = import.meta.dirname;
const OUT = join(ROOT, 'dist');

// Skipped when copying a project. Matched against each file or folder name.
const EXCLUDE = new Set([
  'node_modules', 'tests', 'test-results', 'scripts', 'tools',
  'package.json', 'package-lock.json', 'eslint.config.js', 'README.md',
]);

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function findProjects() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'dist') continue;
    const index = join(ROOT, entry.name, 'index.html');
    if (!(await exists(index))) continue;
    const html = await readFile(index, 'utf8');
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1].trim() || entry.name;
    const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] ?? '';
    projects.push({ slug: entry.name, title, description });
  }
  return projects.sort((a, b) => a.slug.localeCompare(b.slug));
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'%3E%3Crect width='8' height='8' fill='%230b0a1f'/%3E%3Crect x='3' y='3' width='2' height='2' fill='%236fd3ff'/%3E%3C/svg%3E">
  <style>
    :root { --bg: #0b0a1f; --fg: #eef1f6; --muted: #9aa3b8; --accent: #6fd3ff; --card: #151431; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--fg);
      font: 16px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    main { max-width: 40rem; margin: 0 auto; padding: 3rem 1rem; }
    h1 { font-size: 1.5rem; margin: 0 0 2rem; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; }
    a { color: inherit; text-decoration: none; }
    .card { display: block; padding: 1rem 1.25rem; background: var(--card);
      border: 2px solid transparent; border-radius: 4px; }
    .card:hover, .card:focus-visible { border-color: var(--accent); outline: none; }
    .card strong { color: var(--accent); }
    .card span { display: block; color: var(--muted); font-size: .9rem; margin-top: .25rem; }
    p a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>
`;
}

const projects = await findProjects();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const { slug } of projects) {
  await cp(join(ROOT, slug), join(OUT, slug), {
    recursive: true,
    filter: (src) => !EXCLUDE.has(basename(src)) && !basename(src).startsWith('.'),
  });
}

const list = projects.map((p) => `      <li><a class="card" href="/${p.slug}/"><strong>${escapeHtml(p.title)}</strong>${
  p.description ? `<span>${escapeHtml(p.description)}</span>` : ''}</a></li>`).join('\n');

await writeFile(join(OUT, 'index.html'), page('interwebs', `    <h1>interwebs</h1>
    <ul>
${list}
    </ul>`));

await writeFile(join(OUT, '404.html'), page('Not found', `    <h1>Not found</h1>
    <p>Nothing lives here. <a href="/">See all projects</a>.</p>`));

console.log(`Built ${projects.length} project(s): ${projects.map((p) => p.slug).join(', ')}`);
