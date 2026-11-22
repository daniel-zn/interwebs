import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serve } from '../tools/serve.mjs';

const server = await serve(0);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  const result = await page.evaluate(async () => {
    const { Renderer, MW, MH } = await import('./src/render.js');
    // One distance measurement per wall pixel during maze generation.
    const sqrt = Math.sqrt;
    let distances = 0;
    Math.sqrt = value => { distances++; return sqrt(value); };
    const renderer = new Renderer();
    Math.sqrt = sqrt;
    const hashes = [];
    for (const canvas of [renderer.walls, renderer.wallsWhite]) {
      const pixels = canvas.getContext('2d').getImageData(0, 0, MW, MH).data;
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      hashes.push(Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''));
    }
    return { distances, hashes };
  });
  console.log(result);
  assert.deepEqual(result.hashes, [
    "f6956f4f6b4a44a1247ba235d3b15c2154114d81de2b90a612e0354c9f316f2e",
    "b7127c7bd58ffa71b7c912b121f7178f9c40d8ec89a9d10ab3f3f70bbe6610fe",
  ]);
  assert.ok(result.distances <= 31232);
} finally {
  await browser.close();
  server.close();
}
