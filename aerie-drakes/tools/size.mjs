// Reports the shipped payload (everything the browser downloads) and fails if it grows past a budget.
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_GZIP = 120 * 1024;
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}
const files = ['index.html', 'style.css', ...(await walk('src')).sort()];
let raw = 0, gz = 0;
for (const f of files) {
  const buf = await readFile(f);
  const z = gzipSync(buf, { level: 9 }).length;
  raw += buf.length;
  gz += z;
  console.log(`${f.padEnd(26)} ${String(buf.length).padStart(7)} B  ${String(z).padStart(6)} B gz`);
}
console.log(`${'total'.padEnd(26)} ${String(raw).padStart(7)} B  ${String(gz).padStart(6)} B gz  (budget ${BUDGET_GZIP} B gz)`);
if (gz > BUDGET_GZIP) {
  console.error('Payload is over budget.');
  process.exit(1);
}
