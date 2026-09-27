// Overworld: state, save/load, movement, camera, rendering, encounters and the
// glue that runs story scripts, battles and menus.
import { creatureCanvas } from './art/creatures.js';
import { personSheet } from './art/people.js';
import { TS, drawAnim, paintMap } from './art/tiles.js';
import { Battle, learnMove } from './battle.js';
import { ITEMS } from './data/items.js';
import { SPECIES_BY_ID } from './data/species.js';
import { evolve, healMon, makeMon, monName } from './monster.js';
import { SCRIPTS, onTrigger } from './story.js';
import { BattleHUD } from './ui.js';
import { T, WALKABLE } from './world/tiles.js';
import { TRAINERS, buildWorld } from './world/world.js';
import { clamp, mix, sleep } from './util.js';

const SAVE_KEY = 'aerie-drakes.save.v1';
const SET_KEY = 'aerie-drakes.settings.v1';
const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
export const RIVAL_OF = { kindlet: 'drizzlit', drizzlit: 'sporlet', sporlet: 'kindlet' };
const LINE = { kindlet: ['kindlet', 'scorchwing', 'solaraxis'], drizzlit: ['drizzlit', 'glacivane', 'cryoleviath'], sporlet: ['sporlet', 'mycoil', 'fungaroth'] };

export function newState(name = 'Rook') {
  return {
    v: 1, name, map: 'home', x: 3, y: 5, dir: 'down',
    party: [], box: [], bag: {}, creds: 1500,
    flags: {}, seen: {}, caught: {}, legends: {},
    respawn: { map: 'home', x: 3, y: 5 }, time: 0, starter: null,
  };
}

export class Game {
  constructor({ audio, input, ui, rng, fast = false }) {
    this.audio = audio;
    this.input = input;
    this.ui = ui;
    this.rng = rng;
    this.fast = fast;
    this.hud = new BattleHUD(ui);
    this.maps = buildWorld();
    this.painted = {};
    this.s = newState();
    this.mode = 'title';
    this.busy = false;
    this.battle = null;
    this.fade = 0;
    this.wipe = 0;
    this.emotes = [];
    this.moveT = 0;
    this.stepCount = 0;
    this.t = 0;
    this.weather = [];
    this.settings = { muted: false, textSpeed: 1, reduced: false, fastBattle: false };
    try {
      Object.assign(this.settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}'));
    } catch {
      // Private mode or bad data: use defaults.
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches && localStorage.getItem(SET_KEY) === null) this.settings.reduced = true;
    this.applySettings();
    input.onWorld = (act) => this.onAction(act);
  }

  personSheet(look) {
    return personSheet(look);
  }

  applySettings() {
    const st = this.settings;
    this.audio.setMuted(st.muted);
    this.ui.textSpeed = this.fast ? 3 : st.textSpeed;
    this.ui.fastBattle = st.fastBattle || this.fast;
    document.body.classList.toggle('reduced', st.reduced);
    document.getElementById('btn-sound')?.setAttribute('aria-pressed', String(!st.muted));
    try {
      localStorage.setItem(SET_KEY, JSON.stringify(st));
    } catch {
      // Ignore.
    }
  }

  // ---------------------------------------------------------------- save / load
  hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  save() {
    this.s.map = this.map.id;
    this.s.x = this.player.x;
    this.s.y = this.player.y;
    this.s.dir = this.player.dir;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.s));
      return true;
    } catch {
      return false;
    }
  }

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s || s.v !== 1) return false;
      this.s = Object.assign(newState(), s);
      return true;
    } catch {
      return false;
    }
  }

  start({ fresh, name }) {
    if (fresh) this.s = newState(name || 'Rook');
    this.mode = 'world';
    this.enterMap(this.s.map, this.s.x, this.s.y, this.s.dir);
  }

  // ---------------------------------------------------------------- helpers
  flag(f) {
    return !!this.s.flags[f];
  }
  setFlag(f, v = true) {
    this.s.flags[f] = v;
  }
  sigilCount() {
    return ['sigil1', 'sigil2', 'sigil3'].filter((f) => this.flag(f)).length;
  }
  give(id, qty = 1) {
    this.s.bag[id] = (this.s.bag[id] ?? 0) + qty;
  }
  healParty() {
    for (const m of this.s.party) healMon(m);
  }
  unlockLegend(id) {
    if (this.s.legends[id]) return false;
    this.s.legends[id] = true;
    return true;
  }
  addMon(mon) {
    this.s.seen[mon.sp] = true;
    this.s.caught[mon.sp] = true;
    if (this.s.party.length < 6) this.s.party.push(mon);
    else this.s.box.push(mon);
  }

  // ---------------------------------------------------------------- maps
  enterMap(id, x, y, dir = 'down') {
    const map = this.maps[id];
    this.map = map;
    if (!this.painted[id]) this.painted[id] = paintMap(map);
    this.player = { x, y, px: x * TS, py: y * TS, dir, moving: false, from: null, prog: 0, frame: 0, turnT: 0 };
    this.npcs = map.npcs.filter((n) => !this.npcHidden(n)).map((n) => ({ ...n, px: n.x * TS, py: n.y * TS, home: [n.x, n.y], wanderT: 1 + this.rng() * 3 }));
    this.s.map = id;
    this.currentZone = null;
    this.updateZone(true);
    if (map.indoor) this.audio.music(map.music);
    this.weather = [];
  }

  npcHidden(n) {
    if (n.hide && this.flag(n.hide)) return true;
    if (n.show && !this.flag(n.show)) return true;
    if (n.trainer && TRAINERS[n.trainer].rival && this.flag(`t_${n.trainer}`)) return true;
    return false;
  }

  zoneAt(x, y) {
    return this.map.zones.find((z) => x >= z.rect[0] && x <= z.rect[2] && y >= z.rect[1] && y <= z.rect[3]) ?? null;
  }

  updateZone(force = false) {
    if (this.map.indoor) {
      if (force) this.ui.showBanner(this.map.name);
      return;
    }
    const z = this.zoneAt(this.player.x, this.player.y);
    if (z && (z !== this.currentZone || force)) {
      const changed = z !== this.currentZone;
      this.currentZone = z;
      this.audio.music(z.music);
      if (changed) this.ui.showBanner(z.name);
    }
  }

  tileAt(x, y) {
    const m = this.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return T.VOID;
    return m.tiles[y * m.w + x];
  }

  objectAt(x, y) {
    return this.map.objects.find((o) => o.x === x && o.y === y && !(o.flag && this.flag(o.flag)) && !(o.kind === 'sovereign' && this.flag('sovereign_caught'))) ?? null;
  }

  npcAt(x, y) {
    return this.npcs.find((n) => n.x === x && n.y === y) ?? null;
  }

  gateAt(x, y) {
    return this.map.gates.find((g) => g.x === x && g.y === y && !this.flag(g.flag)) ?? null;
  }

  blocked(x, y, forNpc = false) {
    if (!WALKABLE.has(this.tileAt(x, y))) return true;
    if (this.objectAt(x, y) || this.gateAt(x, y)) return true;
    if (this.npcAt(x, y)) return true;
    if (forNpc && (this.player.x === x && this.player.y === y)) return true;
    if (forNpc && this.map.warps.some((w) => w.x === x && w.y === y)) return true;
    return false;
  }

  // ---------------------------------------------------------------- input
  onAction(act) {
    if (this.mode !== 'world' || this.busy) return;
    if (act === 'a') this.run(() => this.interact());
    else if (act === 'b' || act === 'start') this.run(() => this.ui.pauseMenu(this));
  }

  /** Runs an async script with the overworld paused. */
  async run(fn) {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
      this.ui.hideDialog();
    }
  }

  async interact() {
    const p = this.player;
    if (p.moving) return;
    const [dx, dy] = DV[p.dir];
    let fx = p.x + dx, fy = p.y + dy;
    if (this.tileAt(fx, fy) === T.COUNTER) {
      fx += dx;
      fy += dy;
    }
    const npc = this.npcAt(fx, fy);
    if (npc) return this.talk(npc);
    const obj = this.objectAt(fx, fy) ?? this.objectAt(p.x + dx, p.y + dy);
    if (obj) return SCRIPTS.object(this, obj);
    const gate = this.gateAt(p.x + dx, p.y + dy);
    if (gate) {
      this.audio.sfx('gate');
      return this.ui.say(gate.msg);
    }
    const t = this.tileAt(p.x + dx, p.y + dy);
    if (t === T.SIGN || t === T.SCREEN) return this.ui.say('The screen scrolls ads for Helix Dynamics gravity insurance.');
    if (t === T.MACHINE) return this.ui.say('A server rack blinks at you in a friendly way.');
    if (t === T.VOID && !this.map.indoor) return this.ui.say('Clouds drift far below. Somewhere down there is the continent the Aerie was torn from.');
  }

  async talk(npc) {
    // Face the player.
    const p = this.player;
    npc.dir = p.x < npc.x ? 'left' : p.x > npc.x ? 'right' : p.y < npc.y ? 'up' : 'down';
    if (Math.abs(p.x - npc.x) + Math.abs(p.y - npc.y) > 1) npc.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[p.dir];
    if (npc.trainer) return this.trainerEncounter(npc, false);
    if (typeof npc.say === 'string') return SCRIPTS[npc.say](this, npc);
    return this.ui.say(npc.say, { name: null });
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.t += dt;
    if (this.mode !== 'world') return;
    this.s.time += dt;
    const p = this.player;
    // NPC motion
    for (const n of this.npcs) this.updateNpc(n, dt);
    if (this.scripted) return;
    if (p.moving) {
      const speed = (this.input.run ? 9 : 5.2) * (this.fast ? 2 : 1);
      p.prog += dt * speed;
      if (p.prog >= 1) {
        p.prog = 0;
        p.moving = false;
        p.px = p.x * TS;
        p.py = p.y * TS;
        p.frame = (p.frame + 1) % 4;
        this.run(() => this.afterStep());
      } else {
        p.px = (p.from[0] + (p.x - p.from[0]) * p.prog) * TS;
        p.py = (p.from[1] + (p.y - p.from[1]) * p.prog) * TS;
      }
      return;
    }
    if (this.busy) return;
    const dir = this.input.dir;
    if (!dir) {
      p.turnT = 0;
      return;
    }
    if (dir !== p.dir) {
      p.dir = dir;
      p.turnT = 0.07;
      return;
    }
    if (p.turnT > 0) {
      p.turnT -= dt;
      return;
    }
    const [dx, dy] = DV[dir];
    const nx = p.x + dx, ny = p.y + dy;
    if (this.blocked(nx, ny)) {
      if (this.bumpT === undefined || this.t - this.bumpT > 0.35) {
        this.bumpT = this.t;
        this.audio.sfx('bump');
        const gate = this.gateAt(nx, ny);
        if (gate && !this.gateTold) {
          this.gateTold = true;
          this.run(async () => {
            this.audio.sfx('gate');
            await this.ui.say(gate.msg);
          });
        }
      }
      return;
    }
    this.gateTold = false;
    p.from = [p.x, p.y];
    p.x = nx;
    p.y = ny;
    p.moving = true;
    p.prog = 0;
  }

  updateNpc(n, dt) {
    if (n.moving) {
      n.prog += dt * 5;
      if (n.prog >= 1) {
        n.moving = false;
        n.px = n.x * TS;
        n.py = n.y * TS;
      } else {
        n.px = (n.from[0] + (n.x - n.from[0]) * n.prog) * TS;
        n.py = (n.from[1] + (n.y - n.from[1]) * n.prog) * TS;
      }
      return;
    }
    if (!n.wander || this.busy) return;
    n.wanderT -= dt;
    if (n.wanderT > 0) return;
    n.wanderT = 1.5 + this.rng() * 3;
    const dirs = ['up', 'down', 'left', 'right'];
    const d = dirs[Math.floor(this.rng() * 4)];
    n.dir = d;
    const [dx, dy] = DV[d];
    const nx = n.x + dx, ny = n.y + dy;
    if (Math.abs(nx - n.home[0]) + Math.abs(ny - n.home[1]) > 2 || this.blocked(nx, ny, true)) return;
    n.from = [n.x, n.y];
    n.x = nx;
    n.y = ny;
    n.moving = true;
    n.prog = 0;
  }

  /** Walks an NPC one tile (awaitable), for cutscenes. */
  async walkNpc(n, dir, steps = 1) {
    for (let i = 0; i < steps; i++) {
      n.dir = dir;
      const [dx, dy] = DV[dir];
      n.from = [n.x, n.y];
      n.x += dx;
      n.y += dy;
      n.moving = true;
      n.prog = 0;
      while (n.moving) await sleep(16);
    }
  }

  async walkPlayer(dir, steps = 1) {
    const p = this.player;
    for (let i = 0; i < steps; i++) {
      p.dir = dir;
      const [dx, dy] = DV[dir];
      p.from = [p.x, p.y];
      p.x += dx;
      p.y += dy;
      p.moving = true;
      p.prog = 0;
      this.scripted = true;
      while (p.moving) {
        const speed = 5.2 * (this.fast ? 2 : 1);
        p.prog += 0.016 * speed;
        if (p.prog >= 1) {
          p.moving = false;
          p.px = p.x * TS;
          p.py = p.y * TS;
        } else {
          p.px = (p.from[0] + (p.x - p.from[0]) * p.prog) * TS;
          p.py = (p.from[1] + (p.y - p.from[1]) * p.prog) * TS;
        }
        await sleep(16);
      }
      this.scripted = false;
    }
  }

  async afterStep() {
    const p = this.player;
    this.stepCount++;
    // Warps
    const w = this.map.warps.find((q) => q.x === p.x && q.y === p.y);
    if (w) {
      this.audio.sfx('door');
      await this.fadeTo(1);
      this.enterMap(w.to, w.tx, w.ty, w.dir);
      await this.fadeTo(0);
      return;
    }
    this.updateZone();
    // Story triggers
    for (const tr of this.map.triggers) {
      const [x0, y0, x1, y1] = tr.rect;
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) {
        if (await onTrigger(this, tr.id)) return;
      }
    }
    // Trainers who can see us
    for (const n of this.npcs) {
      if (!n.trainer || this.flag(`t_${n.trainer}`) || !n.sight) continue;
      if (this.inSight(n)) {
        await this.trainerEncounter(n, true);
        return;
      }
    }
    // Wild drakes in the fibre grass
    if (this.tileAt(p.x, p.y) === T.GRASS) {
      const z = this.zoneAt(p.x, p.y);
      if (z?.enc && this.s.party.some((m) => m.hp > 0) && this.rng() < (this.forceEncounter ? 1 : 0.1)) {
        await this.wildBattle(z);
      }
    }
  }

  inSight(n) {
    const p = this.player;
    const [dx, dy] = DV[n.dir];
    for (let k = 1; k <= n.sight; k++) {
      const x = n.x + dx * k, y = n.y + dy * k;
      if (x === p.x && y === p.y) return true;
      if (!WALKABLE.has(this.tileAt(x, y)) || this.npcAt(x, y) || this.objectAt(x, y)) return false;
    }
    return false;
  }

  // ---------------------------------------------------------------- battles
  async trainerEncounter(n, spotted) {
    const id = n.trainer;
    const tr = TRAINERS[id];
    if (this.flag(`t_${id}`)) {
      if (tr.after) return this.ui.say(tr.after, { name: tr.name });
      return;
    }
    if (!this.s.party.some((m) => m.hp > 0)) return this.ui.say('You have no drakes that can battle.');
    if (spotted) {
      this.audio.sfx('exclaim');
      this.emote(n, '!');
      await sleep(this.fast ? 150 : 600);
      // Walk up to the player.
      const p = this.player;
      const [dx, dy] = DV[n.dir];
      while (Math.abs(n.x + dx - p.x) + Math.abs(n.y + dy - p.y) > 0 && !(n.x + dx === p.x && n.y + dy === p.y)) await this.walkNpc(n, n.dir);
      p.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[n.dir];
    }
    this.audio.music(tr.music === 'warden' || tr.warden ? 'warden' : 'battle');
    if (tr.intro) await this.ui.say(tr.intro, { name: tr.name });
    const result = await this.trainerBattle(id);
    if (result === 'win') await SCRIPTS.afterTrainer?.(this, id, n);
    return result;
  }

  buildTeam(id) {
    const tr = TRAINERS[id];
    const rivalLine = LINE[RIVAL_OF[this.s.starter] ?? 'drizzlit'];
    return tr.team.map(([sp, lv]) => {
      const real = sp === 'RIVAL1' ? rivalLine[0] : sp === 'RIVAL2' ? rivalLine[1] : sp === 'RIVAL3' ? rivalLine[2] : sp;
      return makeMon(real, lv, this.rng, { iv: [9, 9, 9, 9, 9] });
    });
  }

  async trainerBattle(id, { canLose = false } = {}) {
    const tr = TRAINERS[id];
    const team = this.buildTeam(id);
    const result = await this.startBattle({ trainer: { ...tr, team }, music: tr.music ?? (tr.warden ? 'warden' : 'battle'), canLose });
    if (result === 'win') this.setFlag(`t_${id}`);
    return result;
  }

  async wildBattle(zone) {
    const enc = zone.enc;
    const total = enc.reduce((a, e) => a + e[3], 0);
    let r = this.rng() * total, pick = enc[0];
    for (const e of enc) {
      r -= e[3];
      if (r <= 0) {
        pick = e;
        break;
      }
    }
    const lv = pick[1] + Math.floor(this.rng() * (pick[2] - pick[1] + 1));
    const mon = makeMon(pick[0], lv, this.rng);
    return this.startBattle({ wild: mon });
  }

  bgFor() {
    if (this.map.indoor) return this.map.id === 'spire' ? 'heart' : 'indoor';
    const z = this.zoneAt(this.player.x, this.player.y);
    if (!z) return 'day';
    if (z.night) return 'night';
    if (z.rain) return 'rain';
    if (z.smoke) return 'foundry';
    if (z.name === 'Spire Summit') return 'summit';
    return 'day';
  }

  async startBattle(opts) {
    this.audio.sfx('encounter');
    this.audio.music(opts.music ?? 'battle');
    await this.battleWipe();
    const battle = new Battle(this, { bg: this.bgFor(), ...opts });
    this.battle = battle;
    this.mode = 'battle';
    this.wipe = 0;
    let result;
    try {
      result = await battle.run();
    } finally {
      this.battle = null;
      this.mode = 'world';
    }
    if (result === 'lose' && opts.canLose) this.healParty();
    else if (result === 'lose') await this.blackout();
    else this.updateZone(true);
    if (this.map.indoor) this.audio.music(this.map.music);
    return result;
  }

  async blackout() {
    await this.fadeTo(1);
    this.healParty();
    const r = this.s.respawn;
    this.enterMap(r.map, r.x, r.y, 'up');
    await this.fadeTo(0);
    await this.ui.say(r.map === 'home' ? 'You woke up back in your capsule. Aunt Ren patched up your drakes.' : 'You came to in the Patch Den. The medic patched up your drakes.');
  }

  async battleWipe() {
    const steps = this.fast ? 6 : 24;
    for (let k = 0; k <= steps; k++) {
      this.wipe = k / steps;
      await sleep(16);
    }
  }

  async fadeTo(v) {
    const steps = this.fast ? 3 : 10;
    const from = this.fade;
    for (let k = 1; k <= steps; k++) {
      this.fade = from + ((v - from) * k) / steps;
      await sleep(16);
    }
    this.fade = v;
  }

  emote(n, text) {
    this.emotes.push({ who: n, text, t: 1.2 });
  }

  // ---------------------------------------------------------------- items & evolution
  async useItemField(id) {
    const it = ITEMS[id];
    const filter = it.kind === 'evo' ? (m) => SPECIES_BY_ID[m.sp].evo?.item === id
      : it.kind === 'revive' ? (m) => m.hp <= 0
        : it.kind === 'cure' ? (m) => m.hp > 0 && !!m.status
          : (m) => m.hp > 0 && (m.hp < m.stats.hp || (it.cure && m.status));
    const i = await this.ui.partyScreen(this, 'pick', { title: `Use ${it.name} on…`, filter });
    if (i < 0) return;
    const mon = this.s.party[i];
    this.s.bag[id]--;
    if (it.kind === 'evo') {
      await this.evolveScene(mon, SPECIES_BY_ID[mon.sp].evo.to);
      return;
    }
    if (it.kind === 'revive') mon.hp = Math.floor(mon.stats.hp / 2);
    if (it.hp) mon.hp = Math.min(mon.stats.hp, mon.hp + it.hp);
    if (it.cure) mon.status = null;
    this.audio.sfx('heal');
    await this.ui.say(`${monName(mon)} ${it.kind === 'revive' ? 'is back online' : it.kind === 'cure' ? 'is running clean again' : 'was patched up'}!`);
  }

  async evolveScene(mon, to) {
    if (!to) return;
    const el = document.getElementById('evolve');
    const cv = el.querySelector('canvas');
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    el.hidden = false;
    const from = mon.sp;
    const oldName = monName(mon);
    this.audio.music('legend');
    const draw = (id, white) => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(creatureCanvas(id), 0, 0);
      if (white) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(255,255,255,${white})`;
        ctx.fillRect(0, 0, 64, 64);
        ctx.globalCompositeOperation = 'source-over';
      }
    };
    draw(from, 0);
    const msg = el.querySelector('p');
    msg.textContent = `What? ${oldName} is evolving!`;
    this.ui.live.textContent = msg.textContent;
    await sleep(this.fast ? 100 : 900);
    this.audio.sfx('evolve');
    const n = this.fast ? 6 : 22;
    for (let k = 0; k < n; k++) {
      draw(k % 2 ? to : from, 0.85);
      await sleep(this.fast ? 20 : Math.max(40, 220 - k * 9));
    }
    const learned = evolve(mon, to);
    this.s.seen[to] = true;
    this.s.caught[to] = true;
    draw(to, 0);
    this.audio.sfx('caught');
    msg.textContent = `${oldName} evolved into ${SPECIES_BY_ID[to].name}!`;
    await this.ui.say(msg.textContent);
    for (const id of learned) await learnMove(this, mon, id, (t) => this.ui.say(t), this.hud);
    el.hidden = true;
    this.updateZone(true);
    if (this.map.indoor) this.audio.music(this.map.music);
  }

  // ---------------------------------------------------------------- rendering
  render(ctx, W, H, reduced) {
    if (this.mode === 'battle' && this.battle) {
      const panel = document.querySelector('#battle .b-panel');
      const cssTop = panel ? panel.getBoundingClientRect().top : window.innerHeight * 0.6;
      const panelTop = Math.round((cssTop / window.innerHeight) * H);
      this.battle.render(ctx, W, H, panelTop, this.t, reduced);
      return;
    }
    this.renderWorld(ctx, W, H, reduced);
    if (this.wipe > 0) {
      // Glitchy bars sweep in.
      const bars = 12;
      for (let i = 0; i < bars; i++) {
        const w = Math.min(1, this.wipe * 1.6 - (i % 3) * 0.2) * W;
        ctx.fillStyle = i % 2 ? '#0a0620' : '#1a1440';
        const y = Math.floor((i * H) / bars);
        ctx.fillRect(i % 2 ? W - w : 0, y, w, Math.ceil(H / bars));
      }
      if (!reduced && Math.floor(this.t * 20) % 2) {
        ctx.fillStyle = '#ff4fd8';
        ctx.globalAlpha = 0.25 * (1 - this.wipe);
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
  }

  renderWorld(ctx, W, H, reduced) {
    const map = this.map;
    const p = this.player;
    const touchPad = document.body.dataset.input === 'touch';
    const focusY = touchPad ? 0.45 : 0.5; // a little above the pad and buttons
    let camX = Math.round(p.px + 8 - W / 2), camY = Math.round(p.py + 8 - H * focusY);
    const mw = map.w * TS, mh = map.h * TS;
    if (map.indoor) {
      camX = mw <= W ? Math.round((mw - W) / 2) : clamp(camX, -8, mw - W + 8);
      camY = mh <= H ? Math.round((mh - H) / 2) : clamp(camY, -8, mh - H + 8);
    } else {
      camX = clamp(camX, -W / 2, mw - W / 2);
      camY = clamp(camY, -H / 3, mh - H / 2);
    }
    this.cam = [camX, camY];
    this.drawSky(ctx, W, H, camX, camY, reduced);
    const painted = this.painted[map.id];
    ctx.drawImage(painted.canvas, -camX, -camY);
    drawAnim(ctx, painted.anim, this.t, camX, camY, W, H, reduced);
    // Gates
    for (const g of map.gates) {
      if (this.flag(g.flag)) continue;
      const x = g.x * TS - camX, y = g.y * TS - camY;
      for (let k = 0; k < 4; k++) {
        const on = reduced || Math.sin(this.t * 10 + k + g.y) > -0.3;
        ctx.fillStyle = on ? '#ff3a5a' : '#8a1a3a';
        ctx.fillRect(x, y + 2 + k * 4, TS, 1);
      }
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(x, y, 2, TS);
      ctx.fillRect(x + TS - 2, y, 2, TS);
    }
    // Objects
    for (const o of map.objects) {
      if (o.flag && this.flag(o.flag)) continue;
      const x = o.x * TS - camX, y = o.y * TS - camY;
      if (o.kind === 'item') {
        const pulse = reduced ? 0.6 : 0.5 + Math.sin(this.t * 4 + o.x) * 0.3;
        ctx.globalAlpha = pulse * 0.5;
        ctx.fillStyle = '#ffe23d';
        ctx.fillRect(x + 2, y + 3, 12, 12);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#3a2a5a';
        ctx.fillRect(x + 4, y + 6, 8, 8);
        ctx.fillStyle = '#ffe23d';
        ctx.fillRect(x + 4, y + 6, 8, 2);
        ctx.fillRect(x + 7, y + 9, 2, 2);
      } else if (o.kind === 'pod' && !this.flag('starter')) {
        const img = creatureCanvas(o.sp);
        ctx.drawImage(img, 0, 0, 64, 64, x - 1, y - 7, 18, 18);
      } else if (o.kind === 'sovereign' && !this.flag('sovereign_caught')) {
        const img = creatureCanvas('sovereign');
        const bob = reduced ? 0 : Math.sin(this.t * 1.2) * 2;
        ctx.globalAlpha = this.flag('kade_done') ? 1 : 0.35;
        ctx.drawImage(img, x - 24, y - 52 + bob, 64, 64);
        ctx.globalAlpha = 1;
      }
    }
    // People, sorted by y
    const ents = [...this.npcs.map((n) => ({ n, y: n.py })), { n: p, y: p.py, player: true }].sort((a, b) => a.y - b.y);
    for (const e of ents) {
      const n = e.n;
      const sheet = personSheet(e.player ? 'player' : n.look);
      const walking = n.moving || (e.player && p.moving);
      const prog = n.prog ?? 0;
      const frame = walking ? (prog < 0.5 ? ((n.frame ?? 0) % 2) + 1 : 0) : 0;
      ctx.drawImage(sheet, frame * 16, DIR_ROW[n.dir] * 16, 16, 16, Math.round(n.px - camX), Math.round(n.py - camY - 4), 16, 16);
    }
    // Tall grass hides the player's feet.
    if (this.tileAt(p.x, p.y) === T.GRASS && !p.moving) {
      ctx.fillStyle = this.zoneAt(p.x, p.y)?.night ? '#1c2a5a' : '#0f5a5a';
      const px = Math.round(p.px - camX), py = Math.round(p.py - camY);
      ctx.fillRect(px + 2, py + 9, 12, 3);
      ctx.fillStyle = this.zoneAt(p.x, p.y)?.night ? '#6a5ad8' : '#3ac9b8';
      for (let k = 0; k < 6; k++) ctx.fillRect(px + 2 + k * 2, py + 8 + (k % 2), 1, 2);
    }
    // Emotes
    for (const em of this.emotes) {
      em.t -= 1 / 60;
      const x = Math.round(em.who.px - camX + 4), y = Math.round(em.who.py - camY - 16);
      ctx.fillStyle = '#eef1f6';
      ctx.fillRect(x, y, 8, 10);
      ctx.fillStyle = '#ff3a5a';
      ctx.fillRect(x + 3, y + 2, 2, 4);
      ctx.fillRect(x + 3, y + 7, 2, 1);
    }
    this.emotes = this.emotes.filter((e) => e.t > 0);
    this.drawWeather(ctx, W, H, reduced);
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(5,3,15,${this.fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawSky(ctx, W, H, camX, camY, reduced) {
    const z = !this.map.indoor && this.zoneAt(this.player.x, this.player.y);
    if (this.map.indoor) {
      ctx.fillStyle = '#05030f';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const night = z?.night, rain = z?.rain;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, night ? '#05031a' : rain ? '#0e1a2e' : '#1c1450');
    g.addColorStop(1, night ? '#1c1450' : rain ? '#2a4a6a' : '#6a2a7a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Parallax clouds far below the island
    const t = reduced ? 0 : this.t;
    for (let layer = 0; layer < 3; layer++) {
      const par = 0.15 + layer * 0.15;
      ctx.fillStyle = night ? ['#140f38', '#1c1650', '#261e62'][layer] : ['#3a2a7a', '#5a3a8a', '#8a4a9a'][layer];
      ctx.globalAlpha = 0.55;
      for (let i = -2; i < W / 40 + 3; i++) {
        const x = Math.round(i * 40 - ((camX * par + t * (4 + layer * 3)) % 40));
        const y = Math.round(H * (0.25 + layer * 0.28) - ((camY * par) % 60) + Math.sin(i * 1.7 + layer) * 8);
        ctx.fillRect(x, y, 34, 5);
        ctx.fillRect(x + 6, y - 3, 20, 3);
      }
    }
    ctx.globalAlpha = 1;
    if (night) {
      for (let i = 0; i < 40; i++) {
        const x = (i * 97 - camX * 0.05) % W, y = (i * 53) % H;
        ctx.fillStyle = i % 5 ? '#b9a8ff' : '#ffffff';
        ctx.fillRect(Math.round((x + W) % W), y, 1, 1);
      }
    }
  }

  drawWeather(ctx, W, H, reduced) {
    const z = !this.map.indoor && this.zoneAt(this.player.x, this.player.y);
    if (!z || reduced) return;
    const t = this.t;
    if (z.rain) {
      ctx.fillStyle = 'rgba(127,244,255,0.45)';
      for (let i = 0; i < 70; i++) {
        const x = ((i * 53 + t * 60) % (W + 40)) - 20, y = (i * 97 + t * 320) % H;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 5);
      }
      ctx.fillStyle = 'rgba(14,26,46,0.18)';
      ctx.fillRect(0, 0, W, H);
    }
    if (z.wind) {
      ctx.fillStyle = 'rgba(238,241,246,0.35)';
      for (let i = 0; i < 14; i++) {
        const x = (i * 131 + t * 140) % (W + 60) - 30, y = (i * 71) % H + Math.sin(t * 2 + i) * 6;
        ctx.fillRect(Math.round(x), Math.round(y), 10, 1);
      }
    }
    if (z.smoke) {
      ctx.fillStyle = 'rgba(255,138,58,0.08)';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 18; i++) {
        const x = (i * 83 + t * 8) % W, y = (H - ((i * 47 + t * 16) % H));
        ctx.fillStyle = 'rgba(58,58,68,0.35)';
        ctx.fillRect(Math.round(x), Math.round(y), 3, 3);
      }
    }
    if (z.night) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(5,3,26,0)');
      g.addColorStop(1, 'rgba(5,3,26,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** Title screen art: the Sovereign drifting over the clouds. */
  renderTitle(ctx, W, H, reduced) {
    const t = reduced ? 0 : this.t;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05031a');
    g.addColorStop(0.55, '#2a1a6a');
    g.addColorStop(1, '#ff6ab0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = i % 4 ? '#b9a8ff' : '#7ff4ff';
      ctx.globalAlpha = 0.4 + ((i * 37) % 60) / 100;
      ctx.fillRect((i * 97) % W, (i * 41) % Math.floor(H * 0.6), 1, 1);
    }
    ctx.globalAlpha = 1;
    const k = Math.max(1, Math.floor(Math.min(W, H) / 110));
    const img = creatureCanvas('sovereign');
    const x = Math.round(W / 2 - 32 * k), y = Math.round(H * 0.3 + Math.sin(t) * 3);
    ctx.drawImage(img, x, y, 64 * k, 64 * k);
    // The island
    const iy = Math.round(H * 0.72);
    ctx.fillStyle = '#1a1030';
    ctx.beginPath();
    ctx.moveTo(W * 0.2, iy);
    ctx.lineTo(W * 0.8, iy);
    ctx.lineTo(W * 0.6, iy + H * 0.16);
    ctx.lineTo(W * 0.5, iy + H * 0.22);
    ctx.lineTo(W * 0.42, iy + H * 0.15);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 16; i++) {
      const bx = Math.round(W * 0.22 + i * (W * 0.035)), bh = 6 + ((i * 7) % 20);
      ctx.fillStyle = '#0e0a24';
      ctx.fillRect(bx, iy - bh, Math.max(3, Math.round(W * 0.028)), bh);
      ctx.fillStyle = ['#ff4fd8', '#3ff7ff', '#ffe23d'][i % 3];
      ctx.fillRect(bx + 1, iy - bh + 2, 1, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < W / 30 + 2; i++) {
      const cx = Math.round((i * 30 + t * 6) % (W + 30)) - 15;
      ctx.fillRect(cx, Math.round(H * 0.86 + Math.sin(i) * 4), 26, 4);
    }
  }

  snapshot() {
    const p = this.player;
    return {
      mode: this.mode, map: this.map?.id, x: p?.x, y: p?.y, dir: p?.dir, busy: this.busy, moving: p?.moving,
      party: this.s.party.map((m) => ({ sp: m.sp, lv: m.lv, hp: m.hp, max: m.stats.hp })),
      box: this.s.box.length, flags: { ...this.s.flags }, creds: this.s.creds, bag: { ...this.s.bag },
      seen: Object.keys(this.s.seen).length, caught: Object.keys(this.s.caught).length,
      zone: this.currentZone?.name ?? null, battle: this.battle ? { foe: this.battle.foe.sp, foeHp: this.battle.foe.hp, me: this.battle.me.sp } : null,
    };
  }
}

export { mix };
