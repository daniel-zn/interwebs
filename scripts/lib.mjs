// Shared helpers for the site scripts.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..');
export const COVER_NAMES = ['cover.png', 'cover.webp', 'cover.jpg', 'cover.gif', 'cover.svg'];

export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// Folders at the top of the repo that are never projects (and, inside a
// project, the dev-only files and folders the build leaves out).
export const NOT_PROJECTS = ['dist', 'node_modules', 'scripts', 'tools', 'tests', 'test-results'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
/** Text from HTML source: entities decoded, so the build can escape it exactly once. */
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
  const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
});

const meta = (html, name) =>
  decode(html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'))?.[1].trim() ?? '');

/** Every top-level folder with an index.html is a project. */
export async function findProjects() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || /^[._]/.test(entry.name) || NOT_PROJECTS.includes(entry.name)) continue;
    const dir = join(ROOT, entry.name);
    const index = join(dir, 'index.html');
    if (!(await exists(index))) continue;
    const html = await readFile(index, 'utf8');
    let cover = null;
    for (const name of COVER_NAMES) {
      if (await exists(join(dir, name))) {
        cover = name;
        break;
      }
    }
    const order = meta(html, 'interwebs:order');
    projects.push({
      slug: entry.name,
      dir,
      title: decode(html.match(/<title>([^<]*)<\/title>/i)?.[1].trim() ?? '') || entry.name,
      description: meta(html, 'description'),
      kind: meta(html, 'interwebs:kind') || 'Experience',
      accent: meta(html, 'interwebs:accent') || meta(html, 'theme-color'),
      // Projects with an order come first (lower first), then the rest by title.
      order: order !== '' && Number.isFinite(Number(order)) ? Number(order) : Infinity,
      cover,
    });
  }
  return projects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
