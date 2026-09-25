// Zero-dependency static file server for local play and the smoke test.
// Usage: node scripts/serve.mjs [port]   (defaults to 5173, or $PORT)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8',
};

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (path === '' || path.endsWith('/')) path += 'index.html';
      const file = join(root, path);
      if (!file.startsWith(root) || /(^|[/\\])(node_modules|tests|scripts)([/\\]|$)/.test(path)) throw Object.assign(new Error(), { code: 'ENOENT' });
      if (!(await stat(file)).isFile()) throw Object.assign(new Error(), { code: 'ENOENT' });
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || process.env.PORT || 5173);
  const server = await startServer(port);
  console.log(`Astro Angler: http://127.0.0.1:${server.address().port}/`);
}
