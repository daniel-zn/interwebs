// End-to-end play-through in headless Chromium. Plays the opening for real with
// the keyboard (new game, Hatchery, starter, rival battle), then checks wild
// battles and tethering, trainers' line of sight, shops, saving and continuing,
// the touch controls on a phone, and frame cost. Screenshots go to test-results/.
//
//   node tests/play.mjs            (uses the Playwright-managed Chromium)
//   CHROMIUM_PATH=/path node tests/play.mjs
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';

const PORT = 8766;
const OUT = new URL('../test-results/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};

const server = await serve(PORT);
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe }).catch(() => chromium.launch());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

async function open(context, name, query = '') {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/?test&fast&seed=42${query}`);
  await page.waitForFunction(() => window.__aerie && window.__aerie.perf.frames > 5);
  page.snap = () => page.evaluate(() => window.__aerie.snap());
  page.errors = errors;
  page.shot = (label) => page.screenshot({ path: `${OUT}${name}-${label}.png` });
  return page;
}

const uiState = (page) => page.evaluate(() => ({
  dialog: !document.getElementById('dialog').hidden,
  panel: !document.getElementById('panel').hidden,
  battle: !document.getElementById('battle').hidden,
  evolve: !document.getElementById('evolve').hidden,
  text: document.querySelector('#dialog .text').textContent,
  bmsg: document.querySelector('#battle .b-msg').textContent,
  cmds: document.querySelectorAll('#battle .cmd').length,
  moves: document.querySelectorAll('#battle .move').length,
}));

/** Presses Z until the overworld is free again (dialog, battles and prompts all take Z). */
async function mashUntilFree(page, { max = 400, onBattle } = {}) {
  for (let i = 0; i < max; i++) {
    const s = await page.snap();
    const u = await uiState(page);
    if (!s.busy && !u.dialog && !u.panel && !u.battle && s.mode === 'world') return true;
    if (u.battle && onBattle) await onBattle(u);
    // In battle menus, go back to the top-left option (Fight / first move) first.
    if (u.battle && u.cmds === 4) {
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowLeft');
    }
    await page.keyboard.press('z');
    await sleep(40);
  }
  return false;
}

/** Presses Z through battle text until the Fight/Bag/Drakes/Run menu is up. */
async function toCommands(page) {
  for (let i = 0; i < 200; i++) {
    const u = await uiState(page);
    if (!u.battle) return false;
    if (u.cmds === 4) return true;
    await page.keyboard.press(u.panel ? 'x' : 'z');
    await sleep(40);
  }
  return false;
}

/** Walks to a tile with the arrow keys, following a BFS path computed from the live map. */
async function walkTo(page, tx, ty, { face } = {}) {
  const startMap = (await page.snap()).map;
  const path = await page.evaluate(([tx, ty]) => {
    const g = window.__aerie.game;
    const p = g.player;
    const key = (x, y) => `${x},${y}`;
    const prev = new Map([[key(p.x, p.y), null]]);
    const q = [[p.x, p.y]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy, d] of [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k) || g.blocked(nx, ny)) continue;
        if (g.map.warps.some((w) => w.x === nx && w.y === ny) && !(nx === tx && ny === ty)) continue;
        prev.set(k, [x, y, d]);
        q.push([nx, ny]);
      }
    }
    const out = [];
    let cur = prev.get(key(tx, ty));
    if (cur === undefined) return null;
    while (cur) {
      out.unshift(cur[2]);
      cur = prev.get(key(cur[0], cur[1]));
    }
    return out;
  }, [tx, ty]);
  if (!path) {
    console.log(`      walkTo ${tx},${ty}: no path`);
    return false;
  }
  for (const d of path) {
    const before = await page.snap();
    await page.keyboard.down(KEY[d]);
    // The player commits to the next tile as soon as a step starts, so let go right away.
    await page.waitForFunction(([x, y, m]) => {
      const s = window.__aerie.snap();
      return s.x !== x || s.y !== y || s.map !== m || s.busy;
    }, [before.x, before.y, before.map], { timeout: 3000, polling: 5 }).catch(() => {});
    await page.keyboard.up(KEY[d]);
    await page.waitForFunction(() => !window.__aerie.snap().moving, null, { timeout: 2000 }).catch(() => {});
    const s = await page.snap();
    if (s.busy) await mashUntilFree(page);
  }
  if (face) {
    await page.keyboard.down(KEY[face]);
    await sleep(30);
    await page.keyboard.up(KEY[face]);
    await sleep(30);
  }
  const s = await page.snap();
  if (s.map !== startMap) return true; // walked through a door
  if (s.x !== tx || s.y !== ty) console.log(`      walkTo ${tx},${ty} ended at ${s.x},${s.y} via ${path.join(' ')}`);
  return s.x === tx && s.y === ty;
}

// ------------------------------------------------------------------ desktop: the opening
{
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const page = await open(context, 'desktop');
  await page.shot('title');
  check(await page.isVisible('#btn-new'), 'title screen shows New game');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#name-field', { state: 'visible' });
  await page.fill('#name-field', 'Nova');
  await page.keyboard.press('Enter');
  await sleep(300);
  check(await mashUntilFree(page), 'intro story plays and hands over control');
  let s = await page.snap();
  check(s.map === 'home' && s.mode === 'world', 'new game starts in your capsule', `${s.map} ${s.x},${s.y}`);

  // Talk to Aunt Ren.
  check(await walkTo(page, 6, 4, { face: 'up' }), 'walk to Aunt Ren with the arrow keys');
  await page.keyboard.press('z');
  await sleep(100);
  const u = await uiState(page);
  check(u.dialog && /Link Day/.test(u.text), 'talking shows dialog', u.text.slice(0, 40));
  await page.shot('dialog');
  await mashUntilFree(page);

  // Out the door into Lowdeck.
  check(await walkTo(page, 4, 7), 'walk out of the capsule door');
  await page.waitForFunction(() => window.__aerie.snap().map === 'world', null, { timeout: 3000 }).catch(() => {});
  s = await page.snap();
  check(s.map === 'world' && s.zone === 'Lowdeck', 'door leads out to Lowdeck', `${s.map} ${s.zone}`);
  await page.shot('lowdeck');

  // Can't leave without a drake.
  await walkTo(page, 12, 85);
  await page.keyboard.down('ArrowUp');
  await sleep(400);
  await page.keyboard.up('ArrowUp');
  await mashUntilFree(page);
  s = await page.snap();
  check(s.y >= 85, 'Aunt Ren stops you leaving town without a drake', `${s.x},${s.y}`);

  // Hatchery: choose Kindlet and fight Kestrel.
  check(await walkTo(page, 20, 90), 'walk into the Hatchery');
  await page.waitForFunction(() => window.__aerie.snap().map === 'lab', null, { timeout: 3000 }).catch(() => {});
  check(await walkTo(page, 4, 4, { face: 'up' }), 'walk up to the Kindlet pod');
  await page.shot('lab');
  let sawBattle = false, sawMoves = false;
  await page.keyboard.press('z');
  await mashUntilFree(page, {
    max: 800,
    onBattle: async (st) => {
      sawBattle = true;
      if (st.moves) sawMoves = true;
      if (st.moves && !page.shotMoves) {
        page.shotMoves = true;
        await page.shot('battle-moves');
      }
    },
  });
  s = await page.snap();
  check(sawBattle && sawMoves, 'rival battle runs with a move menu');
  check(s.party.length === 1 && s.party[0].sp === 'kindlet', 'Kindlet joined the party', JSON.stringify(s.party));
  check(s.flags.codex && s.bag.spike === 5 && s.bag.codex === 1, 'Dr. Vance gives the Codex and 5 Tether Spikes', JSON.stringify(s.bag));
  check(s.flags.rival1_done, 'Kestrel leaves the lab after the battle');

  // ---- Wild battle and tethering in the Fiberfields.
  await page.evaluate(() => {
    const a = window.__aerie;
    a.teleport('world', 9, 70, 'up');
    a.forceEncounters(true);
  });
  await sleep(200);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__aerie.snap().battle, null, { timeout: 4000 }).catch(() => {});
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => window.__aerie.forceEncounters(false));
  s = await page.snap();
  check(!!s.battle, 'walking in fibre grass starts a wild battle', s.battle?.foe);
  // Wait for the command menu, weaken the foe, then throw a spike.
  await toCommands(page);
  await page.shot('battle-wild');
  const foeSp = s.battle?.foe;
  let caught = false;
  for (let attempt = 0; attempt < 6 && !caught; attempt++) {
    if (!(await toCommands(page))) break;
    await page.evaluate(() => {
      const b = window.__aerie.game.battle;
      if (b) {
        b.foe.hp = 1;
        b.foe.status = 'standby';
        b.sleepTurns.foe = 9;
      }
    });
    await page.keyboard.press('ArrowRight'); // Bag
    await page.keyboard.press('z');
    await page.waitForSelector('#panel:not([hidden])');
    await sleep(100);
    await page.shot('bag');
    await page.keyboard.press('z'); // first usable item: Tether Spike
    for (let i = 0; i < 200; i++) {
      const st = await page.snap();
      if (!st.battle) break;
      const ui = await uiState(page);
      if (ui.cmds === 4) break;
      if (ui.panel) {
        await page.keyboard.press('x');
      } else await page.keyboard.press('z');
      await sleep(40);
    }
    s = await page.snap();
    caught = s.party.length === 2;
  }
  await mashUntilFree(page);
  s = await page.snap();
  check(caught && s.party[1].sp === foeSp, 'a Tether Spike links the wild drake', JSON.stringify(s.party.map((m) => m.sp)));
  check(s.caught >= 2 && s.bag.spike < 5, 'Codex and bag update after tethering', `caught ${s.caught}, spikes ${s.bag.spike}`);

  // ---- Trainer line of sight: step in front of Runner Jax.
  await page.evaluate(() => window.__aerie.teleport('world', 12, 78, 'up'));
  await sleep(100);
  await walkTo(page, 12, 77);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__aerie.snap().busy || window.__aerie.snap().battle, null, { timeout: 3000 }).catch(() => {});
  await page.keyboard.up('ArrowUp');
  const spotted = (await page.snap()).busy;
  for (let i = 0; i < 100 && !(await page.snap()).battle; i++) {
    await page.keyboard.press('z');
    await sleep(40);
  }
  s = await page.snap();
  check(spotted && !!s.battle, 'Runner Jax spots you and battles', s.battle?.foe);
  await page.evaluate(() => {
    for (const m of window.__aerie.game.s.party) m.lv < 30 && Object.assign(m.stats, { atk: 300, spc: 300, spd: 300 });
  });
  const freed = await mashUntilFree(page, { max: 600 });
  s = await page.snap();
  if (!freed) await page.shot('stuck-jax');
  check(s.flags.t_jax && s.creds > 1500, 'beating a trainer pays creds and sets their flag', `creds ${s.creds}`);

  // ---- Menus: party, codex, bag.
  await page.keyboard.press('x');
  await page.waitForSelector('#panel:not([hidden])');
  await page.shot('menu');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  await sleep(150);
  check(await page.isVisible('.dex-grid'), 'Codex opens from the menu');
  await page.shot('codex');
  // Open the Kindlet entry (the first cell, selected on open) to read its legend.
  await page.keyboard.press('z');
  await sleep(120);
  const lore = await page.textContent('#panel .lore').catch(() => '');
  check(/Lowdeck/.test(lore), 'Codex entry shows the drake\'s legend', lore.slice(0, 50));
  await page.shot('codex-entry');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('x');
    await sleep(60);
  }
  s = await page.snap();
  check(!(await uiState(page)).panel && !s.busy, 'back closes every menu layer');

  // ---- Shop: buy a spike.
  await page.evaluate(() => window.__aerie.teleport('mart_c', 4, 3, 'up'));
  const credsBefore = (await page.snap()).creds;
  await page.keyboard.press('z');
  await sleep(100);
  await page.keyboard.press('z'); // Buy
  await page.waitForSelector('#panel:not([hidden])');
  await page.keyboard.press('z'); // Tether Spike
  await sleep(60);
  await page.keyboard.press('z'); // OK x1
  await sleep(60);
  await page.shot('shop');
  await page.keyboard.press('x'); // close the list
  await sleep(60);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z'); // Leave
  await sleep(60);
  await mashUntilFree(page);
  s = await page.snap();
  check(s.creds === credsBefore - 200, 'buying a Tether Spike costs ₵200', `${credsBefore} -> ${s.creds}`);

  // ---- Save, reload, continue.
  await page.evaluate(() => window.__aerie.teleport('world', 14, 50, 'down'));
  await sleep(100);
  await page.keyboard.press('x');
  await page.waitForSelector('#panel:not([hidden])');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  await sleep(100);
  await mashUntilFree(page);
  const saved = await page.snap();
  await page.reload();
  await page.waitForFunction(() => window.__aerie && window.__aerie.perf.frames > 5);
  check(await page.isVisible('#btn-continue'), 'Continue appears once there is a save');
  await page.keyboard.press('z');
  await sleep(200);
  s = await page.snap();
  check(s.map === 'world' && s.x === 14 && s.y === 50 && s.party.length === saved.party.length && s.creds === saved.creds, 'Continue restores place, party and creds', `${s.x},${s.y} party ${s.party.length}`);

  // ---- Frame cost & crispness
  const perf = await page.evaluate(() => window.__aerie.perf.ms);
  check(perf < 8, 'update + render under 8 ms a frame', `${perf.toFixed(2)} ms`);
  const crisp = await page.evaluate(() => {
    const c = document.getElementById('game');
    return (c.getBoundingClientRect().width * devicePixelRatio) / c.width;
  });
  check(Math.abs(crisp - Math.round(crisp)) < 0.01, 'canvas scales by a whole number of device pixels', crisp.toFixed(3));
  check(page.errors.length === 0, 'no console errors (desktop)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ phone: touch controls
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await open(context, 'phone');
  await page.tap('#btn-new');
  await page.waitForSelector('#name-field', { state: 'visible' });
  await page.tap('.name-form button');
  await sleep(200);
  // Tap through the intro.
  for (let i = 0; i < 20 && !(await page.snap()).busy === false; i++) await sleep(50);
  for (let i = 0; i < 30; i++) {
    const u = await uiState(page);
    if (!u.dialog && !(await page.snap()).busy) break;
    if (u.dialog) await page.tap('#dialog');
    await sleep(60);
  }
  let s = await page.snap();
  check(s.mode === 'world' && !s.busy, 'tapping the dialog box advances the story');
  check(await page.isVisible('.dpad'), 'touch pad is shown on a phone');
  const overlay = await page.evaluate(() => {
    const game = document.getElementById('game').getBoundingClientRect();
    const alpha = (el) => {
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
      return (m[3] ?? 1) * Number(getComputedStyle(el).opacity) * Number(getComputedStyle(el.parentElement).opacity);
    };
    return {
      full: game.height >= innerHeight - 1 && game.width >= innerWidth - 1,
      see: [...document.querySelectorAll('.dpad span, .tb')].every((el) => alpha(el) < 0.5),
    };
  });
  check(overlay.full, 'the game fills the whole phone screen under the controls');
  check(overlay.see, 'touch controls are a see-through overlay');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(!overflow, 'no horizontal scroll on a phone');
  const before = await page.snap();
  const box = await page.locator('.dpad').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2 + 50, box.y + box.height / 2);
  // Hold right with a real pointer so the player walks a few tiles.
  await page.evaluate(() => {
    const d = document.querySelector('.dpad');
    const r = d.getBoundingClientRect();
    const opts = { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: r.right - 10, clientY: r.top + r.height / 2, buttons: 1 };
    d.dispatchEvent(new PointerEvent('pointerdown', opts));
    setTimeout(() => d.dispatchEvent(new PointerEvent('pointerup', opts)), 400);
  });
  await sleep(700);
  s = await page.snap();
  check(s.x > before.x, 'holding the touch pad walks the player', `${before.x} -> ${s.x}`);
  await page.shot('home');
  // A opens talk, B opens the menu.
  await page.tap('.tb.b');
  await sleep(150);
  check(await page.isVisible('#panel'), 'B button opens the menu');
  check(!(await page.isVisible('.dpad')), 'the controls step aside while a menu is open');
  await page.shot('menu');
  await page.tap('#panel .close');
  await sleep(150);
  check(!(await page.isVisible('#panel')), 'the ✕ button closes the menu');
  // A starter and a battle on the phone.
  await page.evaluate(() => {
    const a = window.__aerie;
    a.addMon('sporlet', 8);
    a.setFlag('starter');
    a.setFlag('codex');
    a.give('codex');
    a.give('spike', 3);
    a.teleport('world', 8, 66, 'down');
    a.forceEncounters(true);
  });
  await page.evaluate(() => {
    const d = document.querySelector('.dpad');
    const r = d.getBoundingClientRect();
    const opts = { bubbles: true, pointerId: 8, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.bottom - 10, buttons: 1 };
    d.dispatchEvent(new PointerEvent('pointerdown', opts));
    setTimeout(() => d.dispatchEvent(new PointerEvent('pointerup', opts)), 300);
  });
  await page.waitForFunction(() => window.__aerie.snap().battle, null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => window.__aerie.forceEncounters(false));
  for (let i = 0; i < 100 && (await uiState(page)).cmds !== 4; i++) {
    await page.tap('.b-msg').catch(() => {});
    await sleep(50);
  }
  check(await page.isVisible('.cmd-fight'), 'battle menu appears on a phone');
  await page.shot('battle');
  const fits = await page.evaluate(() => {
    const cmds = [...document.querySelectorAll('#battle .cmd')].map((b) => b.getBoundingClientRect());
    const me = document.querySelector('.bh-me').getBoundingClientRect();
    const panel = document.querySelector('.b-panel').getBoundingClientRect();
    return cmds.every((r) => r.bottom <= innerHeight && r.height >= 40) && me.bottom <= panel.top;
  });
  check(fits, 'battle buttons fit on screen and are big enough to tap');
  await page.tap('.cmd-fight');
  await sleep(100);
  await page.tap('#battle .move');
  await sleep(300);
  s = await page.snap();
  check(!!s.battle && s.battle.foeHp >= 0, 'tapping Fight then a move plays a turn');
  check(page.errors.length === 0, 'no console errors (phone)', page.errors.join(' | '));
  await context.close();
}

// ------------------------------------------------------------------ late game: services, Warden, Heartcore, ending
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await open(context, 'late');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#name-field', { state: 'visible' });
  await page.fill('#name-field', 'Vex');
  await page.keyboard.press('Enter');
  await mashUntilFree(page);
  const strong = () => page.evaluate(() => {
    for (const m of window.__aerie.game.s.party) {
      Object.assign(m.stats, { hp: 999, atk: 999, def: 999, spc: 999, spd: 999 });
      m.hp = 999;
    }
  });
  await page.evaluate(() => {
    const a = window.__aerie;
    for (const f of ['starter', 'codex', 'rival1_done', 't_rival1']) a.setFlag(f);
    a.game.s.starter = 'kindlet';
    a.addMon('kindlet', 15);
    a.addMon('rivetaur', 20);
    a.addMon('voltick', 12);
    a.give('codex');
    a.game.s.creds = 5000;
  });

  // Relay Loop reforges Rivetaur into Ferrodrax.
  await page.evaluate(() => window.__aerie.teleport('kiosk', 9, 5, 'up'));
  await page.keyboard.press('z');
  await sleep(80);
  await page.keyboard.press('z'); // read the sign text
  await sleep(80);
  await page.keyboard.press('z'); // Send one
  await page.waitForSelector('#panel:not([hidden])');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z'); // Rivetaur
  let sawEvolve = false;
  for (let i = 0; i < 200; i++) {
    const u = await uiState(page);
    if (u.evolve && !sawEvolve) {
      sawEvolve = true;
      await page.shot('evolve');
    }
    const st = await page.snap();
    if (!st.busy && !u.dialog && !u.panel && !u.evolve) break;
    await page.keyboard.press(u.panel ? 'x' : 'z');
    await sleep(40);
  }
  let s = await page.snap();
  check(sawEvolve && s.party[1].sp === 'ferrodrax' && s.creds === 4500, 'the Relay Loop reforges Rivetaur into Ferrodrax', `${s.party[1].sp} ₵${s.creds}`);

  // NPC trade: Voltick for Flicker the Neonewt.
  await page.evaluate(() => window.__aerie.teleport('kiosk', 3, 3, 'up'));
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('z');
    await sleep(40);
    if ((await uiState(page)).panel) break;
  }
  await page.keyboard.press('z'); // the only Voltick
  await mashUntilFree(page);
  s = await page.snap();
  check(s.party.some((m) => m.sp === 'neonewt') && !s.party.some((m) => m.sp === 'voltick') && s.flags.trade1, 'trading a Voltick brings Flicker the Neonewt');

  // Level-up evolution after a battle, and the first Warden.
  await page.evaluate(() => {
    const g = window.__aerie.game;
    g.s.party[0].xp = 3200; // enough for Lv16 after one win
    window.__aerie.teleport('dojo', 5, 3, 'up');
  });
  await strong();
  await page.keyboard.press('z');
  await mashUntilFree(page, { max: 900, onBattle: async () => {} });
  for (let i = 0; i < 100; i++) {
    const u = await uiState(page);
    const st = await page.snap();
    if (!st.busy && !u.dialog && !u.panel && !u.evolve && !u.battle) break;
    await page.keyboard.press('z');
    await sleep(40);
  }
  s = await page.snap();
  check(s.flags.t_volta && s.flags.sigil1, 'beating Warden Volta awards the Current Sigil');
  check(s.party[0].sp === 'scorchwing', 'Kindlet evolves into Scorchwing after levelling up', s.party[0].sp);
  await page.evaluate(() => window.__aerie.teleport('world', 31, 46, 'right'));
  await page.keyboard.down('ArrowRight');
  await sleep(500);
  await page.keyboard.up('ArrowRight');
  await mashUntilFree(page);
  s = await page.snap();
  check(s.x >= 32, 'the Current Sigil opens the Wind Bridge gate', `${s.x},${s.y}`);

  // The Heartcore: Director Kade, then the Sovereign with the Heartlink.
  await page.evaluate(() => {
    const a = window.__aerie;
    for (const f of ['sigil2', 'sigil3', 't_rival3', 'rival3_done']) a.setFlag(f);
    a.give('heartlink');
    a.addMon('solaraxis', 60);
    const party = a.game.s.party;
    party.unshift(party.pop());
    a.teleport('spire', 6, 12, 'up');
  });
  await strong();
  await page.keyboard.down('ArrowUp');
  await sleep(300);
  await page.keyboard.up('ArrowUp');
  await mashUntilFree(page, { max: 1200 });
  s = await page.snap();
  check(s.flags.t_kade && s.flags.kade_done, 'Director Kade spots you and is beaten');
  await page.shot('heartcore');
  // Face the Sovereign and link it with the Heartlink.
  const ok = await walkTo(page, 6, 4, { face: 'up' });
  check(ok, 'walk up to the Heartcore');
  await page.keyboard.press('z');
  for (let i = 0; i < 40 && !(await page.snap()).battle; i++) {
    await page.keyboard.press('z');
    await sleep(50);
  }
  check((await page.snap()).battle?.foe === 'sovereign', 'the Aether Sovereign battle begins');
  await toCommands(page);
  await page.shot('sovereign');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('z');
  await page.waitForSelector('#panel:not([hidden])');
  // Pick the Heartlink from the bag.
  const hl = await page.evaluate(() => [...document.querySelectorAll('#panel .bag-item')].findIndex((b) => b.textContent.includes('Heartlink')));
  const first = await page.evaluate(() => [...document.querySelectorAll('#panel .bag-item')].findIndex((b) => !b.disabled));
  for (let i = first; i < hl; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('z');
  let sawEnding = false;
  for (let i = 0; i < 300; i++) {
    const u = await page.evaluate(() => !document.getElementById('ending').hidden);
    if (u && !sawEnding) {
      sawEnding = true;
      await sleep(400);
      await page.shot('ending');
    }
    const st = await page.snap();
    const ui = await uiState(page);
    if (sawEnding && !u && !st.busy && !ui.dialog) break;
    await page.keyboard.press('z');
    await sleep(50);
  }
  s = await page.snap();
  check(s.flags.sovereign_caught && s.party.some((m) => m.sp === 'sovereign') && sawEnding, 'the Heartlink links the Sovereign and the ending plays');
  check(s.flags.ending_seen && s.mode === 'world', 'you can keep exploring after the ending');
  check(page.errors.length === 0, 'no console errors (late game)', page.errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll play checks passed');
process.exit(failures ? 1 : 0);
