// Reports the shipped payload (everything the browser downloads) and fails if it grows past a budget.
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_GZIP = 40 * 1024;
const files = ['index.html', 'style.css', ...readdirSync('src').map((f) => join('src', f))];
let raw = 0, gz = 0;
for (const f of files) {
  const buf = await readFile(f);
  const z = gzipSync(buf, { level: 9 }).length;
  raw += buf.length;
  gz += z;
  console.log(`${f.padEnd(18)} ${String(buf.length).padStart(7)} B  ${String(z).padStart(6)} B gz`);
}
console.log(`${'total'.padEnd(18)} ${String(raw).padStart(7)} B  ${String(gz).padStart(6)} B gz  (budget ${BUDGET_GZIP} B gz)`);
if (gz > BUDGET_GZIP) {
  console.error('Payload is over budget.');
  process.exit(1);
}
