// Site icons generated from one 8x8 pixel grid: an SVG favicon, a PNG-in-ICO
// /favicon.ico, and /apple-touch-icon.png. Safari and some other browsers ignore
// SVG favicons and ask the site root for these files instead.
import { deflateSync } from 'node:zlib';

const COLORS = { '.': '#07081a', p: '#111335', t: '#7ff4ff', g: '#f3c252' };
// A little screen with a gold stand: the same mark as the SVG favicon.
const GRID = [
  '........',
  '.pppppp.',
  '.pttttp.',
  '.pttttp.',
  '.pttttp.',
  '.pppppp.',
  '...gg...',
  '........',
];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function iconSvgDataUri() {
  let rects = '';
  GRID.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${COLORS[ch]}'/>`;
  }));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><rect width='8' height='8' fill='${COLORS['.']}'/>${rects}</svg>`;
  return `data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}`;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Opaque RGB PNG of the grid: `size` px square, grid scaled by whole pixels and centred. */
export function iconPng(size) {
  const scale = Math.floor(size / GRID.length);
  const off = Math.floor((size - scale * GRID.length) / 2);
  const bg = rgb(COLORS['.']);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - off) / scale), gy = Math.floor((y - off) / scale);
      const ch = GRID[gy]?.[gx];
      const c = ch ? rgb(COLORS[ch]) : bg;
      raw.set(c, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A .ico file wrapping PNG images (supported by every current browser). */
export function iconIco(sizes = [16, 32, 48]) {
  const pngs = sizes.map((s) => iconPng(s));
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach((png, i) => {
    const e = 6 + i * 16;
    header[e] = sizes[i] % 256;
    header[e + 1] = sizes[i] % 256;
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs]);
}
