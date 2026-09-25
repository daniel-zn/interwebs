// Reports the gzipped size of everything the game loads at runtime.
//   node tools/size.mjs
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const files = ['index.html', 'style.css', ...(await readdir(new URL('src/', root))).map((f) => `src/${f}`)];
let raw = 0, gz = 0;
for (const f of files) {
  const buf = await readFile(new URL(f, root));
  const z = gzipSync(buf, { level: 9 }).length;
  raw += buf.length;
  gz += z;
  console.log(`${f.padEnd(18)} ${String(buf.length).padStart(7)} B  ${String(z).padStart(6)} B gz`);
}
console.log(`${'total'.padEnd(18)} ${String(raw).padStart(7)} B  ${String(gz).padStart(6)} B gz`);
const LIMIT = 50 * 1024;
if (gz > LIMIT) {
  console.error(`Over budget: ${gz} > ${LIMIT} bytes gzipped`);
  process.exit(1);
}
