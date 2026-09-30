// Edge to edge on phones. iPhones show the page behind the status bar and
// Safari's toolbars, outside the area the game's canvas fills. This paints
// strips just above and below the screen with the colours along the canvas's
// top and bottom edges, and keeps the page and theme colours in step, so the
// game's backdrop carries on behind them.
const COLS = 32;

export function bleed(source) {
  const strip = (cls) => {
    const c = document.createElement('canvas');
    c.width = COLS;
    c.height = 1;
    c.className = `bleed ${cls}`;
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    return c.getContext('2d', { willReadFrequently: true });
  };
  const top = strip('bleed-top'), bottom = strip('bleed-bottom');
  const meta = document.querySelector('meta[name="theme-color"]');
  const root = document.documentElement;
  const average = (g) => {
    const d = g.getImageData(0, 0, COLS, 1).data;
    let r = 0, gr = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      gr += d[i + 1];
      b += d[i + 2];
    }
    const hex = (v) => Math.round(v / COLS).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(gr)}${hex(b)}`;
  };
  let frame = 0, lastTop = '', lastBottom = '';
  function tick() {
    requestAnimationFrame(tick);
    if (frame++ % 4 || document.hidden) return;
    const w = source.width, h = source.height;
    if (!w || !h) return;
    const rows = Math.max(1, Math.round(h / 150));
    top.drawImage(source, 0, 0, w, rows, 0, 0, COLS, 1);
    bottom.drawImage(source, 0, h - rows, w, rows, 0, 0, COLS, 1);
    if (frame % 32 !== 1) return;
    const t = average(top), b = average(bottom);
    if (t === lastTop && b === lastBottom) return;
    lastTop = t;
    lastBottom = b;
    root.style.backgroundColor = t;
    root.style.backgroundImage = `linear-gradient(${t} 50%, ${b} 50%)`;
    if (meta) meta.content = t;
  }
  requestAnimationFrame(tick);
}
