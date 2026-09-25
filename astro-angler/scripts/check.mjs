// Static checks: syntax, lint (if ESLint is available), and a size budget.
import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (f === 'node_modules' || f.startsWith('.')) return [];
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(root);
let ok = true;

// 1. Syntax.
const scripts = files.filter((f) => /\.m?js$/.test(f));
for (const f of scripts) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { ok = false; console.error(`syntax error in ${relative(root, f)}\n${e.stderr}`); }
}
console.log(`syntax: ${scripts.length} files checked`);

// 2. Lint with a local or global ESLint, when one is installed.
let eslint = join(root, 'node_modules/.bin/eslint');
if (!existsSync(eslint)) {
  try { eslint = join(execSync('npm root -g').toString().trim(), 'eslint/bin/eslint.js'); } catch { eslint = null; }
}
if (eslint && existsSync(eslint)) {
  try {
    execFileSync(eslint.endsWith('.js') ? process.execPath : eslint, [...(eslint.endsWith('.js') ? [eslint] : []), '.'], { cwd: root, stdio: 'inherit' });
    console.log('lint: clean');
  } catch { ok = false; console.error('lint: problems found'); }
} else {
  console.log('lint: skipped (ESLint not installed)');
}

// 3. Size budget for everything the browser downloads.
const shipped = files.filter((f) => /^(index\.html|style\.css|src[/\\].*\.js)$/.test(relative(root, f)));
const raw = shipped.reduce((n, f) => n + statSync(f).size, 0);
const gz = shipped.reduce((n, f) => n + gzipSync(readFileSync(f)).length, 0);
const BUDGET = 60 * 1024;
console.log(`size: ${shipped.length} files, ${(raw / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped (budget ${BUDGET / 1024} KB gz)`);
if (gz > BUDGET) { ok = false; console.error('size: over budget'); }

if (!ok) process.exit(1);
console.log('check: all good');
