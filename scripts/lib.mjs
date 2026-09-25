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

const meta = (html, name) =>
  html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'))?.[1].trim() ?? '';

/** Every top-level folder with an index.html is a project. */
export async function findProjects() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || /^[._]/.test(entry.name) || ['dist', 'node_modules', 'scripts'].includes(entry.name)) continue;
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
    projects.push({
      slug: entry.name,
      dir,
      title: html.match(/<title>([^<]*)<\/title>/i)?.[1].trim() || entry.name,
      description: meta(html, 'description'),
      kind: meta(html, 'interwebs:kind') || 'Experience',
      accent: meta(html, 'interwebs:accent') || meta(html, 'theme-color'),
      order: Number(meta(html, 'interwebs:order')) || 0,
      cover,
    });
  }
  return projects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
