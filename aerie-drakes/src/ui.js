// DOM overlays: dialog, menus and panels. Everything is keyboard, pad, mouse and
// touch navigable through one tiny list-navigation helper.
import { creatureCanvas } from './art/creatures.js';
import { ITEMS } from './data/items.js';
import { MOVES, STATUS_INFO } from './data/moves.js';
import { SPECIES, SPECIES_BY_ID } from './data/species.js';
import { TYPE_INFO, TYPES, effectiveness } from './data/types.js';
import { LEGENDS } from './data/legends.js';
import { monName, xpFor } from './monster.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const typeChip = (t) => `<span class="type" style="--c:${TYPE_INFO[t].color}">${TYPE_INFO[t].name}</span>`;
const DIRS4 = ['up', 'down', 'left', 'right'];
const hpClass = (f) => (f > 0.5 ? '' : f > 0.2 ? 'mid' : 'low');

export function spriteImg(spId, { silhouette = false, size = 64, flip = false } = {}) {
  const src = creatureCanvas(spId, { silhouette });
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  c.className = 'sprite';
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  const ctx = c.getContext('2d');
  if (flip) {
    ctx.translate(64, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Moves within a row of 3 tabs followed by a grid of cells with `cols` columns. */
function gridMove(i, act, cols, n) {
  if (i < 3) {
    if (act === 'left') return Math.max(0, i - 1);
    if (act === 'right') return Math.min(2, i + 1);
    if (act === 'down' && n) return 3;
    return i;
  }
  const c = i - 3;
  if (act === 'left') return c % cols ? i - 1 : i;
  if (act === 'right') return c % cols < cols - 1 && c + 1 < n ? i + 1 : i;
  if (act === 'up') return c - cols < 0 ? 0 : i - cols;
  if (act === 'down') return c + cols < n ? i + cols : i;
  return i;
}

export class UI {
  constructor(input, audio) {
    this.input = input;
    this.audio = audio;
    this.textSpeed = 1;
    this.dialog = $('#dialog');
    this.panel = $('#panel');
    this.banner = $('#banner');
    this.toastEl = $('#toast');
    this.live = $('#sr-live');
  }

  // ---------------------------------------------------------------- list navigation
  /**
   * Makes a set of buttons navigable. Resolves with the chosen index, or -1 on back.
   * opts: cols, index, cancel (allow B), onMove(i), keys (extra act -> handler).
   */
  nav(buttons, opts = {}) {
    const cols = opts.cols ?? 1;
    let i = Math.min(opts.index ?? 0, buttons.length - 1);
    while (buttons[i]?.disabled && i < buttons.length - 1) i++;
    return new Promise((resolve) => {
      const mark = () => {
        buttons.forEach((b, k) => b.classList.toggle('sel', k === i));
        buttons[i]?.scrollIntoView?.({ block: 'nearest' });
        opts.onMove?.(i);
      };
      const done = (v) => {
        pop();
        for (const b of buttons) b.onclick = b.onpointerenter = null;
        resolve(v);
      };
      const move = (d) => {
        let j = i;
        for (let n = 0; n < buttons.length; n++) {
          j += d;
          if (j < 0 || j >= buttons.length) {
            if (Math.abs(d) === 1 && cols === 1) j = (j + buttons.length) % buttons.length;
            else return;
          }
          if (!buttons[j].hidden) break;
        }
        if (j !== i) {
          i = j;
          this.audio.sfx('blip');
          mark();
        }
      };
      const pop = this.input.push((act) => {
        if (opts.keys?.[act]) {
          const r = opts.keys[act](i);
          if (r !== undefined) done(r);
          return;
        }
        if (opts.move && DIRS4.includes(act)) {
          const j = opts.move(i, act);
          if (j !== null && j !== undefined && j !== i && buttons[j]) {
            i = j;
            this.audio.sfx('blip');
            mark();
          }
          return;
        }
        if (act === 'up') move(-cols);
        else if (act === 'down') move(cols);
        else if (act === 'left' && cols > 1) move(-1);
        else if (act === 'right' && cols > 1) move(1);
        else if (act === 'a') {
          if (buttons[i]?.disabled) return this.audio.sfx('bump');
          this.audio.sfx('select');
          done(i);
        } else if ((act === 'b' || act === 'start') && opts.cancel !== false) {
          this.audio.sfx('cancel');
          done(-1);
        }
      });
      buttons.forEach((b, k) => {
        b.onpointerenter = (e) => {
          if (e.pointerType === 'mouse' && k !== i) {
            i = k;
            mark();
          }
        };
        b.onclick = () => {
          if (b.disabled) return;
          i = k;
          this.audio.sfx('select');
          done(k);
        };
      });
      mark();
    });
  }

  // ---------------------------------------------------------------- dialog
  /** Shows lines of text one box at a time; resolves when the last is dismissed. */
  async say(lines, { name = null } = {}) {
    for (const line of [].concat(lines)) await this.box(line, { name });
    this.dialog.hidden = true;
  }

  box(text, { name = null, keep = false } = {}) {
    const d = this.dialog;
    this.input.clearTouch?.();
    d.hidden = false;
    d.classList.remove('asking');
    $('.speaker', d).textContent = name ?? '';
    $('.speaker', d).hidden = !name;
    const p = $('.text', d);
    $('.choices', d).innerHTML = '';
    this.live.textContent = (name ? `${name}: ` : '') + text;
    return new Promise((resolve) => {
      let shown = 0, full = false;
      const speed = [1, 2, 4, 999][this.textSpeed] ?? 2;
      const step = () => {
        if (full) return;
        shown = Math.min(text.length, shown + speed);
        p.textContent = text.slice(0, shown);
        if (shown % 3 === 0) this.audio.sfx('talk');
        if (shown >= text.length) {
          full = true;
          d.classList.add('ready');
          if (keep) finish();
        } else this.typeTimer = setTimeout(step, 16);
      };
      d.classList.remove('ready');
      const finish = () => {
        pop();
        d.onclick = null;
        clearTimeout(this.typeTimer);
        resolve();
      };
      const advance = () => {
        if (!full) {
          full = true;
          clearTimeout(this.typeTimer);
          p.textContent = text;
          d.classList.add('ready');
          if (keep) finish();
          return;
        }
        this.audio.sfx('blip');
        finish();
      };
      const pop = this.input.push((act) => {
        if (act === 'a' || act === 'b') advance();
      });
      d.onclick = advance;
      step();
    });
  }

  /** A question with choices. Resolves with the chosen index (or -1 if cancelled). */
  async ask(text, options, { name = null, cancel = true } = {}) {
    await this.box(text, { name, keep: true });
    const d = this.dialog;
    d.classList.add('asking');
    const ul = $('.choices', d);
    ul.innerHTML = '';
    const btns = options.map((o) => {
      const b = h('button', 'choice', esc(o));
      b.type = 'button';
      const li = h('li');
      li.append(b);
      ul.append(li);
      return b;
    });
    const r = await this.nav(btns, { cancel, index: 0 });
    ul.innerHTML = '';
    d.classList.remove('asking');
    d.hidden = true;
    return r;
  }

  hideDialog() {
    this.dialog.hidden = true;
  }

  // ---------------------------------------------------------------- toast & banner
  showBanner(text) {
    const b = this.banner;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  toast(text) {
    const t = this.toastEl;
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    this.live.textContent = text;
  }

  // ---------------------------------------------------------------- panels
  openPanel(title, cls = '') {
    const p = this.panel;
    this.input.clearTouch?.();
    p.hidden = false;
    p.className = `panel ${cls}`;
    $('h2', p).textContent = title;
    const body = $('.body', p);
    body.innerHTML = '';
    body.scrollTop = 0;
    return body;
  }

  closePanel() {
    this.panel.hidden = true;
  }

  /** The pause menu. */
  async pauseMenu(game) {
    const items = [
      ['Drakes', 'party'], ['Codex', 'codex'], ['Bag', 'bag'], ['Linker ID', 'card'], ['Save', 'save'], ['Settings', 'settings'], ['Close', 'close'],
    ];
    let idx = 0;
    for (;;) {
      const body = this.openPanel('Menu', 'menu');
      const list = h('div', 'menu-list');
      const btns = items.map(([label, id]) => {
        const b = h('button', `menu-item mi-${id}`, esc(label));
        b.type = 'button';
        if (id === 'party' && !game.s.party.length) b.disabled = true;
        if (id === 'codex' && !game.s.bag.codex) b.disabled = true;
        list.append(b);
        return b;
      });
      body.append(list);
      body.append(h('p', 'menu-foot', `<span>₵${game.s.creds.toLocaleString()}</span><span>${game.sigilCount()}/3 Sigils</span>`));
      idx = await this.nav(btns, { index: idx });
      const id = items[idx]?.[1];
      if (idx < 0 || id === 'close') break;
      if (id === 'party') await this.partyScreen(game, 'view');
      else if (id === 'codex') await this.codexScreen(game);
      else if (id === 'bag') await this.bagScreen(game, 'field');
      else if (id === 'card') await this.cardScreen(game);
      else if (id === 'save') {
        this.closePanel();
        game.save();
        await this.say('Progress saved to your Linker ID.');
      } else if (id === 'settings') await this.settingsScreen(game);
    }
    this.closePanel();
  }

  monRow(mon, extra = '') {
    const sp = SPECIES_BY_ID[mon.sp];
    const f = mon.hp / mon.stats.hp;
    const b = h('button', `mon-row${mon.hp <= 0 ? ' fainted' : ''}`);
    b.type = 'button';
    b.append(spriteImg(mon.sp, { size: 48 }));
    const info = h('span', 'mon-info', `<span class="mon-name">${esc(monName(mon))} <small>Lv${mon.lv}</small>${mon.status ? ` <span class="status" style="--c:${STATUS_INFO[mon.status].color}">${STATUS_INFO[mon.status].tag}</span>` : ''}</span>
      <span class="hpbar ${hpClass(f)}"><i style="width:${Math.max(0, f * 100)}%"></i></span>
      <span class="mon-sub">${sp.types.map(typeChip).join('')} <span class="hpnum">${Math.max(0, mon.hp)}/${mon.stats.hp}</span>${extra}</span>`);
    b.append(info);
    return b;
  }

  /**
   * mode: 'view' (field), 'battle' (pick a drake to switch in), 'pick' (choose one, e.g. for an item or trade).
   * Resolves with a party index or -1.
   */
  async partyScreen(game, mode = 'view', { title = 'Drakes', filter = null, forced = false } = {}) {
    let idx = filter ? Math.max(0, game.s.party.findIndex(filter)) : 0;
    for (;;) {
      const body = this.openPanel(title, 'party');
      const party = game.s.party;
      const btns = party.map((m, i) => {
        const b = this.monRow(m, filter && !filter(m) ? ' <em class="no">can\'t</em>' : '');
        if (filter && !filter(m)) b.classList.add('dim');
        if (mode === 'view' && i === 0) b.classList.add('lead');
        body.append(b);
        return b;
      });
      if (mode === 'view') body.append(h('p', 'hint-line', 'Pick a drake to see its summary or move it to the front.'));
      idx = await this.nav(btns, { index: idx, cancel: !forced });
      if (idx < 0) {
        this.closePanel();
        return -1;
      }
      const mon = party[idx];
      if (mode === 'pick') {
        if (filter && !filter(mon)) {
          this.audio.sfx('bump');
          continue;
        }
        this.closePanel();
        return idx;
      }
      const opts = mode === 'battle' ? ['Switch in', 'Summary', 'Back'] : ['Summary', 'Move to front', 'Back'];
      const r = await this.popup(btns[idx], opts);
      const choice = opts[r];
      if (choice === 'Summary') await this.summaryScreen(game, idx);
      else if (choice === 'Move to front' && idx > 0) {
        party.unshift(party.splice(idx, 1)[0]);
        idx = 0;
      } else if (choice === 'Switch in') {
        this.closePanel();
        return idx;
      }
    }
  }

  /** A little menu of options that appears under an element. */
  async popup(anchor, options) {
    const pop = h('div', 'popup');
    const btns = options.map((o) => {
      const b = h('button', '', esc(o));
      b.type = 'button';
      pop.append(b);
      return b;
    });
    anchor.after(pop);
    const r = await this.nav(btns);
    pop.remove();
    return r;
  }

  async summaryScreen(game, idx, list = game.s.party) {
    for (;;) {
      const mon = list[idx];
      const sp = SPECIES_BY_ID[mon.sp];
      const body = this.openPanel(monName(mon), 'summary');
      const top = h('div', 'sum-top');
      top.append(spriteImg(mon.sp, { size: 128 }));
      const next = xpFor(mon.lv + 1) - mon.xp;
      top.append(h('div', 'sum-info', `<p class="big">${esc(monName(mon))} <small>Lv${mon.lv}</small></p>
        <p>${sp.types.map(typeChip).join('')} <span class="muted">No.${String(sp.no).padStart(3, '0')} ${esc(sp.name)}</span></p>
        <p class="muted">${esc(sp.cls)}${mon.ot ? ` · from ${esc(mon.ot)}` : ''}</p>
        <p>HP ${Math.max(0, mon.hp)}/${mon.stats.hp}${mon.status ? ` · <span style="color:${STATUS_INFO[mon.status].color}">${STATUS_INFO[mon.status].name}</span>` : ''}</p>
        <p class="muted">${mon.lv >= 60 ? 'Max level' : `${next} XP to Lv${mon.lv + 1}`}</p>`));
      body.append(top);
      const stats = h('dl', 'stats');
      for (const [k, label] of [['atk', 'ATK'], ['def', 'DEF'], ['spc', 'SPC'], ['spd', 'SPD']]) {
        stats.append(h('div', '', `<dt>${label}</dt><dd><i style="width:${Math.min(100, mon.stats[k] / 1.6)}%"></i><b>${mon.stats[k]}</b></dd>`));
      }
      body.append(stats);
      const mv = h('ul', 'moves');
      for (const m of mon.moves) {
        const d = MOVES[m.id];
        mv.append(h('li', '', `<p>${typeChip(d.type)} <b>${esc(d.name)}</b> <span class="muted">${d.cat === 'status' ? 'Status' : `${d.cat === 'phys' ? 'Physical' : 'Special'} · ${d.pow}`} · ${m.pp}/${d.pp} PP</span></p><p class="muted">${esc(d.desc)}</p>`));
      }
      body.append(mv);
      const nav = h('div', 'row-btns');
      const prev = h('button', '', '◀ Prev'), nxt = h('button', '', 'Next ▶'), back = h('button', '', 'Back');
      for (const b of [prev, nxt, back]) b.type = 'button';
      nav.append(prev, nxt, back);
      body.append(nav);
      const r = await this.nav([prev, nxt, back], { cols: 3, index: 2, keys: { left: () => 0, right: () => 1 } });
      if (r === 0) idx = (idx - 1 + list.length) % list.length;
      else if (r === 1) idx = (idx + 1) % list.length;
      else return;
    }
  }

  // ---------------------------------------------------------------- codex
  async codexScreen(game) {
    let tab = 0, idx = 0;
    for (;;) {
      const body = this.openPanel('Codex', 'codex');
      const tabs = h('div', 'tabs');
      const tabNames = ['Drakes', 'Legends', 'Currents'];
      const tabBtns = tabNames.map((n, i) => {
        const b = h('button', `tab${i === tab ? ' on' : ''}`, n);
        b.type = 'button';
        tabs.append(b);
        return b;
      });
      body.append(tabs);
      const seen = SPECIES.filter((s) => game.s.seen[s.id]).length, caught = SPECIES.filter((s) => game.s.caught[s.id]).length;
      const switchTab = (d) => () => {
        tab = (tab + d + 3) % 3;
        idx = 0;
        return -2;
      };
      let r;
      if (tab === 0) {
        body.append(h('p', 'muted', `Seen ${seen} · Linked ${caught} · of ${SPECIES.length}`));
        const grid = h('div', 'dex-grid');
        const btns = SPECIES.map((sp) => {
          const b = h('button', 'dex-cell');
          b.type = 'button';
          const known = game.s.seen[sp.id];
          b.append(known ? spriteImg(sp.id, { size: 48, silhouette: !game.s.caught[sp.id] && !game.s.seen[sp.id] }) : h('span', 'unknown', '?'));
          b.append(h('span', 'dex-no', `${String(sp.no).padStart(3, '0')}${game.s.caught[sp.id] ? ' ◆' : ''}`));
          b.append(h('span', 'dex-name', known ? esc(sp.name) : '???'));
          grid.append(b);
          return b;
        });
        body.append(grid);
        const cols = Math.max(1, Math.round((grid.clientWidth + 6) / (btns[0].offsetWidth + 6)) || 3);
        r = await this.nav([...tabBtns, ...btns], {
          index: idx + 3,
          keys: { start: switchTab(1) },
          move: (i, act) => gridMove(i, act, cols, btns.length),
        });
        if (r === -2) continue;
        if (r < 0) break;
        if (r < 3) {
          tab = r;
          idx = 0;
          continue;
        }
        idx = r - 3;
        const sp = SPECIES[idx];
        if (game.s.seen[sp.id]) await this.dexEntry(game, sp);
      } else if (tab === 1) {
        const got = LEGENDS.filter((l) => game.s.legends[l.id]);
        body.append(h('p', 'muted', `${got.length} of ${LEGENDS.length} legends found. Look for lore terminals and old stories around the Aerie.`));
        const list = h('div', 'menu-list');
        const btns = LEGENDS.map((l) => {
          const b = h('button', 'menu-item', game.s.legends[l.id] ? esc(l.title) : '— undiscovered —');
          b.type = 'button';
          b.disabled = !game.s.legends[l.id];
          list.append(b);
          return b;
        });
        body.append(list);
        r = await this.nav([...tabBtns, ...btns], { index: idx + 3, keys: { start: switchTab(1) }, move: (i, act) => gridMove(i, act, 1, btns.length) });
        if (r === -2) continue;
        if (r < 0) break;
        if (r < 3) {
          tab = r;
          idx = 0;
          continue;
        }
        idx = r - 3;
        await this.legendScreen(LEGENDS[idx]);
      } else {
        body.append(h('p', 'muted', 'Every drake is born into one or two currents. Hit a weakness for double damage; a resisted hit does half.'));
        const list = h('div', 'currents');
        for (const t of TYPES) {
          const strong = TYPES.filter((d) => effectiveness(t, [d]) > 1), weak = TYPES.filter((d) => effectiveness(t, [d]) < 1);
          list.append(h('div', 'current', `<p>${typeChip(t)} <span class="muted">${esc(TYPE_INFO[t].blurb)}</span></p>
            <p><span class="k">Strong vs</span> ${strong.map(typeChip).join('') || '—'}</p><p><span class="k">Weak vs</span> ${weak.map(typeChip).join('') || '—'}</p>`));
        }
        body.append(list);
        r = await this.nav(tabBtns, { index: tab, keys: { start: switchTab(1) }, move: (i, act) => gridMove(i, act, 1, 0) });
        if (r === -2) continue;
        if (r < 0) break;
        tab = r;
      }
    }
    this.closePanel();
  }

  async dexEntry(game, sp) {
    const body = this.openPanel(`No.${String(sp.no).padStart(3, '0')} ${sp.name}`, 'dex-entry');
    const caught = game.s.caught[sp.id];
    const top = h('div', 'sum-top');
    top.append(spriteImg(sp.id, { size: 128 }));
    top.append(h('div', 'sum-info', `<p class="big">${esc(sp.name)}</p><p>${sp.types.map(typeChip).join('')}</p><p class="muted">${esc(sp.cls)}</p>
      ${caught ? `<p class="muted">${esc(sp.size)}</p><p class="muted">Habitat: ${esc(sp.habitat)}</p>` : '<p class="muted">Link one to unlock its full entry.</p>'}`));
    body.append(top);
    if (caught) {
      body.append(h('p', 'lore', esc(sp.lore)));
      const evo = sp.evo;
      if (evo) {
        const to = SPECIES_BY_ID[evo.to];
        const how = evo.lv ? `at level ${evo.lv}` : evo.trade ? 'when sent through a Relay Loop' : `when given a ${ITEMS[evo.item].name}`;
        body.append(h('p', 'muted', `Evolves into ${game.s.seen[evo.to] ? esc(to.name) : '???'} ${how}.`));
      }
    } else body.append(h('p', 'lore muted', 'Linkers say you only understand a drake once it trusts you. Tether one to read its legend.'));
    const back = h('button', 'wide', 'Back');
    back.type = 'button';
    body.append(back);
    await this.nav([back]);
  }

  async legendScreen(leg) {
    const body = this.openPanel(leg.title, 'legend');
    for (const para of leg.text) body.append(h('p', 'lore', esc(para)));
    const back = h('button', 'wide', 'Back');
    back.type = 'button';
    body.append(back);
    await this.nav([back]);
  }

  // ---------------------------------------------------------------- bag
  /** context: 'field' or 'battle'. Resolves with an item id to use (battle) or null. */
  async bagScreen(game, context = 'field') {
    let idx = 0;
    for (;;) {
      const body = this.openPanel('Bag', 'bag');
      const ids = Object.keys(game.s.bag).filter((id) => game.s.bag[id] > 0);
      if (!ids.length) body.append(h('p', 'muted', 'Your bag is empty.'));
      const list = h('div', 'menu-list');
      const btns = ids.map((id) => {
        const it = ITEMS[id];
        const b = h('button', 'menu-item bag-item', `<span>${esc(it.name)}</span><span class="qty">${it.key ? '' : `×${game.s.bag[id]}`}</span>`);
        b.type = 'button';
        if (context === 'battle' && !['tether', 'heal', 'cure', 'revive', 'escape'].includes(it.kind)) b.disabled = true;
        if (context === 'field' && ['tether', 'escape', 'loot'].includes(it.kind)) b.classList.add('dim');
        list.append(b);
        return b;
      });
      body.append(list);
      const desc = h('p', 'item-desc muted', '');
      body.append(desc);
      idx = await this.nav(btns, { index: idx, onMove: (i) => (desc.textContent = ITEMS[ids[i]]?.desc ?? '') });
      if (idx < 0) {
        this.closePanel();
        return null;
      }
      const id = ids[idx];
      const it = ITEMS[id];
      if (context === 'battle') {
        this.closePanel();
        return id;
      }
      if (['heal', 'cure', 'revive', 'evo'].includes(it.kind)) {
        await game.useItemField(id);
      } else {
        this.audio.sfx('bump');
        desc.textContent = it.kind === 'loot' ? 'Sell this at any Neo-Mart.' : it.kind === 'key' ? it.desc : 'Only useful in battle.';
        await new Promise((r) => setTimeout(r, 900));
      }
    }
  }

  // ---------------------------------------------------------------- shop
  async shopScreen(game, stock) {
    let mode = 0;
    for (;;) {
      const r = await this.ask('Welcome to Neo-Mart! What\'ll it be?', ['Buy', 'Sell', 'Leave'], { name: 'Clerk' });
      mode = r;
      if (r !== 0 && r !== 1) break;
      let idx = 0;
      for (;;) {
        const body = this.openPanel(mode === 0 ? 'Buy' : 'Sell', 'shop');
        const ids = mode === 0 ? stock : Object.keys(game.s.bag).filter((id) => game.s.bag[id] > 0 && !ITEMS[id].key && ITEMS[id].price);
        body.append(h('p', 'muted creds', `You have ₵${game.s.creds.toLocaleString()}`));
        const list = h('div', 'menu-list');
        const btns = ids.map((id) => {
          const it = ITEMS[id];
          const price = mode === 0 ? it.price : Math.floor(it.price / 2);
          const b = h('button', 'menu-item bag-item', `<span>${esc(it.name)}${mode === 1 ? ` <small>×${game.s.bag[id]}</small>` : ''}</span><span class="qty">₵${price}</span>`);
          b.type = 'button';
          list.append(b);
          return b;
        });
        if (!ids.length) body.append(h('p', 'muted', 'Nothing to sell.'));
        body.append(list);
        const desc = h('p', 'item-desc muted', '');
        body.append(desc);
        idx = await this.nav(btns, { index: idx, onMove: (i) => (desc.textContent = ITEMS[ids[i]]?.desc ?? '') });
        if (idx < 0) break;
        const id = ids[idx];
        const it = ITEMS[id];
        const price = mode === 0 ? it.price : Math.floor(it.price / 2);
        const max = mode === 0 ? Math.min(99, Math.floor(game.s.creds / price)) : game.s.bag[id];
        if (max < 1) {
          this.audio.sfx('bump');
          desc.textContent = 'Not enough creds.';
          await new Promise((res) => setTimeout(res, 800));
          continue;
        }
        const qty = await this.qtyPicker(btns[idx], max, price);
        if (qty > 0) {
          if (mode === 0) {
            game.s.creds -= qty * price;
            game.give(id, qty);
            if (id === 'spike' && qty >= 10) game.give('arc_spike', 1);
          } else {
            game.s.creds += qty * price;
            game.s.bag[id] -= qty;
          }
          this.audio.sfx('coin');
        }
      }
      this.closePanel();
    }
    this.closePanel();
    await this.say('Come back soon! Stay neon!', { name: 'Clerk' });
  }

  qtyPicker(anchor, max, price) {
    const box = h('div', 'popup qty-picker');
    let q = 1;
    const label = h('span', 'q');
    const render = () => (label.textContent = `×${q}  ₵${(q * price).toLocaleString()}`);
    const minus = h('button', '', '−'), plus = h('button', '', '+'), ok = h('button', '', 'OK');
    for (const b of [minus, plus, ok]) b.type = 'button';
    box.append(minus, label, plus, ok);
    anchor.after(box);
    render();
    return new Promise((resolve) => {
      const change = (d) => {
        q = Math.max(1, Math.min(max, q + d));
        this.audio.sfx('blip');
        render();
      };
      const done = (v) => {
        pop();
        box.remove();
        resolve(v);
      };
      const pop = this.input.push((act) => {
        if (act === 'left' || act === 'down') change(act === 'down' ? -10 : -1);
        else if (act === 'right' || act === 'up') change(act === 'up' ? 10 : 1);
        else if (act === 'a') done(q);
        else if (act === 'b') done(0);
      });
      minus.onclick = () => change(-1);
      plus.onclick = () => change(1);
      ok.onclick = () => done(q);
    });
  }

  // ---------------------------------------------------------------- vault (storage)
  async vaultScreen(game) {
    for (;;) {
      const r = await this.ask(`Datavault terminal. ${game.s.box.length} drake${game.s.box.length === 1 ? '' : 's'} stored.`, ['Deposit', 'Withdraw', 'Log off']);
      if (r === 0) {
        if (game.s.party.length <= 1) {
          await this.say('You need to keep at least one drake with you.');
          continue;
        }
        const i = await this.partyScreen(game, 'pick', { title: 'Deposit which?' });
        if (i >= 0) {
          const [mon] = game.s.party.splice(i, 1);
          game.s.box.push(mon);
          this.audio.sfx('door');
          await this.say(`${monName(mon)} was uploaded to the Datavault.`);
        }
      } else if (r === 1) {
        if (!game.s.box.length) {
          await this.say('The vault is empty.');
          continue;
        }
        if (game.s.party.length >= 6) {
          await this.say('Your party is full. Deposit a drake first.');
          continue;
        }
        const body = this.openPanel('Withdraw which?', 'party');
        const btns = game.s.box.map((m) => {
          const b = this.monRow(m);
          body.append(b);
          return b;
        });
        const i = await this.nav(btns);
        this.closePanel();
        if (i >= 0) {
          const [mon] = game.s.box.splice(i, 1);
          game.s.party.push(mon);
          this.audio.sfx('door');
          await this.say(`${monName(mon)} rejoined your party.`);
        }
      } else break;
    }
  }

  // ---------------------------------------------------------------- linker card & settings
  async cardScreen(game) {
    const body = this.openPanel('Linker ID', 'card');
    const s = game.s;
    const mins = Math.floor(s.time / 60);
    const sig = [['sigil1', 'Current', '#ffe23d'], ['sigil2', 'Alloy', '#ff6b3d'], ['sigil3', 'Night', '#b9a8ff']];
    body.append(h('div', 'idcard', `<p class="big">${esc(s.name)}</p>
      <p>Creds <b>₵${s.creds.toLocaleString()}</b></p>
      <p>Codex <b>${Object.keys(s.caught).length}</b> linked · <b>${Object.keys(s.seen).length}</b> seen</p>
      <p>Time <b>${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m</b></p>
      <div class="sigils">${sig.map(([f, n, c]) => `<span class="sigil${s.flags[f] ? ' got' : ''}" style="--c:${c}"><i></i>${n}</span>`).join('')}</div>`));
    const back = h('button', 'wide', 'Back');
    back.type = 'button';
    body.append(back);
    await this.nav([back]);
  }

  async settingsScreen(game) {
    let idx = 0;
    for (;;) {
      const st = game.settings;
      const body = this.openPanel('Settings', 'settings');
      const rows = [
        ['Sound', st.muted ? 'Off' : 'On'],
        ['Text speed', ['Slow', 'Normal', 'Fast', 'Instant'][st.textSpeed]],
        ['Reduce motion', st.reduced ? 'On' : 'Off'],
        ['Battle animations', st.fastBattle ? 'Quick' : 'Full'],
        ['Back', ''],
      ];
      const list = h('div', 'menu-list');
      const btns = rows.map(([k, v]) => {
        const b = h('button', 'menu-item', `<span>${k}</span><span class="qty">${v}</span>`);
        b.type = 'button';
        list.append(b);
        return b;
      });
      body.append(list);
      body.append(h('p', 'muted small', 'Keys: arrows/WASD move · Z/Space/Enter confirm · X/Esc back &amp; menu · Shift run. Touch: pad, A, B. Gamepads work too.'));
      idx = await this.nav(btns, { index: idx });
      if (idx < 0 || idx === 4) break;
      if (idx === 0) st.muted = !st.muted;
      if (idx === 1) st.textSpeed = (st.textSpeed + 1) % 4;
      if (idx === 2) st.reduced = !st.reduced;
      if (idx === 3) st.fastBattle = !st.fastBattle;
      game.applySettings();
    }
  }
}

// ------------------------------------------------------------------ battle HUD
export class BattleHUD {
  constructor(ui) {
    this.ui = ui;
    this.root = $('#battle');
    this.foe = $('.bh-foe', this.root);
    this.me = $('.bh-me', this.root);
    this.msg = $('.b-msg', this.root);
    this.cmds = $('.b-cmds', this.root);
  }

  show(on) {
    this.root.hidden = !on;
    if (!on) {
      this.cmds.innerHTML = '';
      this.msg.textContent = '';
    }
  }

  setMon(side, mon, animate = false) {
    const el = side === 'foe' ? this.foe : this.me;
    if (!mon) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const f = Math.max(0, mon.hp) / mon.stats.hp;
    const xpNow = mon.xp - xpFor(mon.lv), xpNeed = xpFor(mon.lv + 1) - xpFor(mon.lv);
    el.innerHTML = `<p class="bh-name"><span>${esc(monName(mon))}</span><small>Lv${mon.lv}</small></p>
      <p class="bh-types">${SPECIES_BY_ID[mon.sp].types.map(typeChip).join('')}${mon.status ? `<span class="status" style="--c:${STATUS_INFO[mon.status].color}">${STATUS_INFO[mon.status].tag}</span>` : ''}${side === 'foe' && mon.caughtMark ? '<span class="caught" title="Already linked">◆</span>' : ''}</p>
      <span class="hpbar ${hpClass(f)}"><i style="width:${f * 100}%"></i></span>
      ${side === 'me' ? `<p class="hpnum">${Math.max(0, mon.hp)}/${mon.stats.hp}</p><span class="xpbar"><i style="width:${Math.min(100, (xpNow / xpNeed) * 100)}%"></i></span>` : ''}`;
    if (animate) el.classList.add('pop');
    else el.classList.remove('pop');
  }

  /** Smoothly animates the HP bar from its current width to the new value. */
  async hp(side, mon, from, fast) {
    const el = side === 'foe' ? this.foe : this.me;
    const bar = el.querySelector('.hpbar'), fill = bar?.querySelector('i'), num = el.querySelector('.hpnum');
    if (!fill) return;
    const to = Math.max(0, mon.hp);
    const steps = fast ? 6 : 18;
    for (let k = 1; k <= steps; k++) {
      const v = Math.round(from + ((to - from) * k) / steps);
      const f = v / mon.stats.hp;
      fill.style.width = `${f * 100}%`;
      bar.className = `hpbar ${hpClass(f)}`;
      if (num) num.textContent = `${v}/${mon.stats.hp}`;
      await new Promise((r) => setTimeout(r, 22));
    }
  }

  async say(text, { wait = true } = {}) {
    this.cmds.innerHTML = '';
    this.msg.hidden = false;
    this.ui.live.textContent = text;
    this.msg.textContent = '';
    this.msg.classList.remove('ready');
    const speed = [1, 2, 4, 999][this.ui.textSpeed] ?? 2;
    let shown = 0;
    let skip = false;
    const popSkip = this.ui.input.push((act) => {
      if (act === 'a' || act === 'b') skip = true;
    });
    this.msg.onclick = () => (skip = true);
    while (shown < text.length) {
      if (skip) shown = text.length;
      else shown = Math.min(text.length, shown + speed);
      this.msg.textContent = text.slice(0, shown);
      await new Promise((r) => setTimeout(r, 16));
    }
    popSkip();
    if (!wait) {
      await new Promise((r) => setTimeout(r, this.ui.fastBattle ? 250 : 650));
      return;
    }
    this.msg.classList.add('ready');
    await new Promise((resolve) => {
      const pop = this.ui.input.push((act) => {
        if (act === 'a' || act === 'b') {
          pop();
          this.msg.onclick = null;
          resolve();
        }
      });
      this.msg.onclick = () => {
        pop();
        this.msg.onclick = null;
        resolve();
      };
    });
    this.msg.classList.remove('ready');
  }

  /** Main command menu. */
  async command(mon, canRun) {
    this.msg.textContent = `What will ${monName(mon)} do?`;
    this.cmds.innerHTML = '';
    this.cmds.className = 'b-cmds main';
    const labels = ['Fight', 'Bag', 'Drakes', canRun ? 'Run' : 'Run'];
    const btns = labels.map((l, i) => {
      const b = h('button', `cmd cmd-${l.toLowerCase()}`, l);
      b.type = 'button';
      if (i === 3 && !canRun) b.classList.add('dim');
      this.cmds.append(b);
      return b;
    });
    const r = await this.ui.nav(btns, { cols: 2, index: this.lastCmd ?? 0, cancel: false });
    this.lastCmd = r;
    return ['fight', 'bag', 'party', 'run'][r];
  }

  async moves(mon, foe) {
    this.cmds.innerHTML = '';
    this.cmds.className = 'b-cmds moves';
    const btns = mon.moves.map((m) => {
      const d = MOVES[m.id];
      const eff = d.cat === 'status' ? 1 : effectiveness(d.type, SPECIES_BY_ID[foe.sp].types);
      const hint = d.cat === 'status' ? '' : eff > 1 ? '<em class="eff up">▲ strong</em>' : eff < 1 ? '<em class="eff down">▼ weak</em>' : '';
      const b = h('button', 'move', `<span class="mv-name">${esc(d.name)}</span><span class="mv-sub" >${typeChip(d.type)} <span class="pp">${m.pp}/${d.pp}</span>${hint}</span>`);
      b.type = 'button';
      b.style.setProperty('--c', TYPE_INFO[d.type].color);
      if (m.pp <= 0) b.disabled = true;
      this.cmds.append(b);
      return b;
    });
    const back = h('button', 'move back', 'Back');
    back.type = 'button';
    this.cmds.append(back);
    const r = await this.ui.nav([...btns, back], { cols: 2, index: this.lastMove ?? 0 });
    if (r === btns.length) return -1;
    if (r >= 0) this.lastMove = r;
    return r;
  }

  /** Learn-a-move prompt: resolves with the slot to replace, or -1 to skip. */
  async replaceMove(mon, newId) {
    const body = this.ui.openPanel(`Forget a move for ${MOVES[newId].name}?`, 'party');
    const list = h('div', 'menu-list');
    const btns = [...mon.moves.map((m) => m.id), newId].map((id, i) => {
      const d = MOVES[id];
      const b = h('button', 'menu-item', `<span>${typeChip(d.type)} ${esc(d.name)}${i === 4 ? ' <small>(new — skip it)</small>' : ''}</span><span class="qty">${d.cat === 'status' ? '—' : d.pow}</span>`);
      b.type = 'button';
      list.append(b);
      return b;
    });
    body.append(list);
    const desc = h('p', 'item-desc muted');
    body.append(desc);
    const ids = [...mon.moves.map((m) => m.id), newId];
    const r = await this.ui.nav(btns, { onMove: (i) => (desc.textContent = MOVES[ids[i]].desc), cancel: false });
    this.ui.closePanel();
    return r === 4 ? -1 : r;
  }
}
