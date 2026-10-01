// Turn-based drake battles: logic (damage, currents, conditions, AI, tethering,
// XP) and the canvas scene that animates it. Text and menus live in BattleHUD.
import { creatureCanvas } from './art/creatures.js';
import { ITEMS } from './data/items.js';
import { MOVES, STATUS_INFO } from './data/moves.js';
import { SPECIES_BY_ID } from './data/species.js';
import { TYPE_INFO, effectiveness } from './data/types.js';
import { MAX_LEVEL, evolve, levelEvolution, monName, movesAt, refresh, xpFor } from './monster.js';
import { clamp, makeCanvas, mix, sleep } from './util.js';

const stageMul = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
const STAT_NAME = { atk: 'ATK', def: 'DEF', spc: 'SPC', spd: 'SPD' };

export class Battle {
  /**
   * opts: { wild: mon } or { trainer: {name, team: [mon], creds, ...} }, plus bg, music.
   */
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.hud = game.hud;
    this.audio = game.audio;
    this.rng = game.rng;
    this.foes = opts.wild ? [opts.wild] : opts.trainer.team;
    this.foeIdx = 0;
    this.meIdx = game.s.party.findIndex((m) => m.hp > 0);
    this.stages = { me: newStages(), foe: newStages() };
    this.participants = new Set([this.meIdx]);
    this.sleepTurns = { me: 0, foe: 0 };
    this.evolveQueue = new Set();
    this.anim = {
      t: 0, shake: 0,
      foe: { x: 0, y: 0, a: 0, s: 1, flash: 0, white: 0, show: false },
      me: { x: 0, y: 0, a: 0, s: 1, flash: 0, white: 0, show: false },
      spike: null, particles: [], trainer: opts.trainer ? { look: opts.trainer.look, x: 0, a: 0 } : null,
    };
    this.bgKey = null;
  }

  get me() {
    return this.game.s.party[this.meIdx];
  }
  get foe() {
    return this.foes[this.foeIdx];
  }
  get fast() {
    return this.game.settings.fastBattle || this.game.fast;
  }
  wait(ms) {
    return sleep(this.fast ? ms * 0.35 : ms);
  }

  // ---------------------------------------------------------------- main flow
  async run() {
    this.game.input.clearTouch?.();
    this.hud.show(true);
    this.hud.setMon('foe', null);
    this.hud.setMon('me', null);
    this.audio.music(this.opts.music ?? 'battle');
    await this.intro();
    let result = null;
    while (!result) {
      const act = await this.chooseAction();
      if (act.kind === 'run') {
        if (this.opts.trainer) {
          await this.hud.say('No running from a Linker battle!');
          continue;
        }
        if (act.flare || this.tryRun()) {
          this.audio.sfx('door');
          await this.hud.say(act.flare ? 'The Smoke Flare covers your escape!' : 'Got away safely!');
          result = 'run';
          break;
        }
        await this.hud.say('Couldn\'t get away!');
      }
      if (act.kind === 'tether') {
        const r = await this.throwTether(act.item);
        if (r === 'caught') {
          result = 'caught';
          break;
        }
      }
      if (act.kind === 'item') await this.useItem(act.item, act.target);
      if (act.kind === 'switch') await this.switchTo(act.idx);
      // Foe acts (and we act, if we chose a move) in speed order.
      const foeMove = this.pickFoeMove();
      const order = [];
      if (act.kind === 'move') {
        const mine = MOVES[this.me.moves[act.slot].id], theirs = MOVES[foeMove];
        const meFirst = (mine.prio ?? 0) !== (theirs.prio ?? 0) ? (mine.prio ?? 0) > (theirs.prio ?? 0) : this.speed('me') === this.speed('foe') ? this.rng() < 0.5 : this.speed('me') > this.speed('foe');
        const a = { side: 'me', slot: act.slot }, b = { side: 'foe', id: foeMove };
        order.push(...(meFirst ? [a, b] : [b, a]));
      } else if (act.kind !== 'run' || !result) order.push({ side: 'foe', id: foeMove });
      // Only the drakes that started the turn act in it: one sent out after a
      // faint waits for the next turn (it didn't pick the fainted one's move).
      const meIdx = this.meIdx, foeIdx = this.foeIdx;
      for (const o of order) {
        if (this.meIdx !== meIdx || this.foeIdx !== foeIdx) break;
        const user = o.side === 'me' ? this.me : this.foe;
        if (user.hp <= 0) continue;
        const target = o.side === 'me' ? this.foe : this.me;
        if (target.hp <= 0) continue;
        await this.doMove(o.side, o.side === 'me' ? user.moves[o.slot] : { id: o.id, pp: 99 });
        result = await this.checkFaints();
        if (result || this.foe.hp <= 0 || this.me.hp <= 0) break;
      }
      if (!result && this.me.hp > 0 && this.foe.hp > 0) {
        await this.endOfTurn('me');
        await this.endOfTurn('foe');
        result = await this.checkFaints();
      }
      if (!result && this.foe.hp > 0 && this.me.hp <= 0) result = await this.checkFaints();
    }
    await this.outro(result);
    this.hud.show(false);
    return result;
  }

  async intro() {
    const a = this.anim;
    const foeName = monName(this.foe);
    this.markSeen(this.foe);
    if (this.opts.trainer) {
      const tr = this.opts.trainer;
      a.trainer.a = 1;
      for (let k = 0; k <= 10; k++) {
        a.trainer.x = (1 - k / 10) * -160;
        await sleep(16);
      }
      await this.hud.say(`${tr.name} wants to battle!`);
      for (let k = 0; k <= 8; k++) {
        a.trainer.x = (k / 8) * 160;
        a.trainer.a = 1 - k / 8;
        await sleep(16);
      }
      a.trainer = null;
      await this.sendOut('foe');
      await this.hud.say(`${tr.name} sent out ${foeName}!`, { wait: false });
    } else {
      a.foe.show = true;
      a.foe.a = 1;
      for (let k = 0; k <= 14; k++) {
        a.foe.x = (1 - k / 14) * -220;
        await sleep(16);
      }
      this.hud.setMon('foe', this.foe, true);
      if (this.opts.legendary) {
        this.audio.sfx('heartbeat');
        a.shake = 1;
        await this.hud.say('The Aether Sovereign opened its eyes!');
      } else await this.hud.say(`A wild ${foeName} appeared!`);
    }
    await this.sendOut('me');
  }

  async sendOut(side) {
    const a = this.anim[side];
    const mon = side === 'me' ? this.me : this.foe;
    if (side === 'me') this.hud.say(`Go, ${monName(mon)}!`, { wait: false });
    a.show = true;
    a.x = 0;
    a.white = 1;
    for (let k = 0; k <= 10; k++) {
      a.s = k / 10;
      a.a = 1;
      await sleep(16);
    }
    for (let k = 0; k <= 6; k++) {
      a.white = 1 - k / 6;
      await sleep(16);
    }
    a.white = 0;
    this.audio.sfx('select');
    this.hud.setMon(side, mon, true);
    this.markSeen(mon);
    if (side === 'me') await this.wait(400);
  }

  async recall(side) {
    const a = this.anim[side];
    a.white = 1;
    for (let k = 10; k >= 0; k--) {
      a.s = k / 10;
      await sleep(14);
    }
    a.show = false;
    a.white = 0;
    a.s = 1;
  }

  markSeen(mon) {
    this.game.s.seen[mon.sp] = true;
    if (this.game.s.caught[mon.sp]) mon.caughtMark = this.opts.wild ? true : false;
  }

  async chooseAction() {
    for (;;) {
      const cmd = await this.hud.command(this.me, !this.opts.trainer);
      if (cmd === 'fight') {
        if (this.me.moves.every((m) => m.pp <= 0)) {
          await this.hud.say(`${monName(this.me)} has no PP left! It thrashes wildly.`);
          return { kind: 'move', slot: 0 };
        }
        const slot = await this.hud.moves(this.me, this.foe);
        if (slot >= 0) return { kind: 'move', slot };
      } else if (cmd === 'bag') {
        const id = await this.game.ui.bagScreen(this.game, 'battle');
        if (!id) continue;
        const it = ITEMS[id];
        if (it.kind === 'tether') {
          if (this.opts.trainer) {
            await this.hud.say('You can\'t tether a drake that already has a Linker!');
            continue;
          }
          return { kind: 'tether', item: id };
        }
        if (it.kind === 'escape') {
          if (this.opts.trainer) {
            await this.hud.say('A flare won\'t help in a Linker battle.');
            continue;
          }
          this.game.s.bag[id]--;
          return { kind: 'run', flare: true };
        }
        const filter = it.kind === 'revive' ? (m) => m.hp <= 0 : it.kind === 'cure' ? (m) => m.hp > 0 && m.status : (m) => m.hp > 0 && (m.hp < m.stats.hp || (it.cure && m.status));
        const target = await this.game.ui.partyScreen(this.game, 'pick', { title: `Use ${it.name} on…`, filter });
        if (target < 0) continue;
        return { kind: 'item', item: id, target };
      } else if (cmd === 'party') {
        const idx = await this.game.ui.partyScreen(this.game, 'battle');
        if (idx < 0) continue;
        if (idx === this.meIdx) {
          await this.hud.say(`${monName(this.me)} is already out there!`);
          continue;
        }
        if (this.game.s.party[idx].hp <= 0) {
          await this.hud.say('That drake is out of energy. It needs rest.');
          continue;
        }
        return { kind: 'switch', idx };
      } else if (cmd === 'run') return { kind: 'run' };
    }
  }

  tryRun() {
    this.runTries = (this.runTries ?? 0) + 1;
    const f = (this.speed('me') * 32) / Math.max(1, (this.speed('foe') / 4) % 256) + 30 * this.runTries;
    return this.opts.legendary ? this.rng() < 0.5 : f > 255 || this.rng() * 255 < f;
  }

  speed(side) {
    const mon = side === 'me' ? this.me : this.foe;
    return mon.stats.spd * stageMul(this.stages[side].spd) * (mon.status === 'static' ? 0.5 : 1);
  }

  async switchTo(idx) {
    await this.hud.say(`${monName(this.me)}, come back!`, { wait: false });
    await this.recall('me');
    this.meIdx = idx;
    this.stages.me = newStages();
    this.participants.add(idx);
    await this.sendOut('me');
  }

  // ---------------------------------------------------------------- items
  async useItem(id, targetIdx) {
    const it = ITEMS[id];
    const mon = this.game.s.party[targetIdx];
    this.game.s.bag[id]--;
    const before = mon.hp;
    if (it.kind === 'revive') mon.hp = Math.floor(mon.stats.hp / 2);
    if (it.hp) mon.hp = Math.min(mon.stats.hp, mon.hp + it.hp);
    if (it.cure) mon.status = null;
    this.audio.sfx('heal');
    if (targetIdx === this.meIdx) {
      this.sparkle('me', '#6dff7a');
      await this.hud.hp('me', mon, before, this.fast);
      this.hud.setMon('me', mon);
    }
    await this.hud.say(`Used ${it.name} on ${monName(mon)}.${it.kind === 'revive' ? ' It\'s back online!' : ''}`);
  }

  async throwTether(id) {
    const it = ITEMS[id];
    if (!it.key) this.game.s.bag[id]--;
    const foe = this.foe;
    await this.hud.say(`You threw a ${it.name}!`, { wait: false });
    const a = this.anim;
    this.audio.sfx('throw');
    const L = this.layout();
    a.spike = { x: L.me.x, y: L.me.y - 30, rot: 0, glow: it.key ? '#7ff4ff' : id === 'void_spike' ? '#9b6bff' : id === 'arc_spike' ? '#ffe23d' : '#ff4fd8' };
    const x0 = L.me.x, y0 = L.me.y - 40, x1 = L.foe.x, y1 = L.foe.y - 20;
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      a.spike.x = x0 + (x1 - x0) * t;
      a.spike.y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 50;
      a.spike.rot = t * 12;
      await sleep(16);
    }
    // Light swallows the drake.
    a.foe.white = 1;
    for (let k = 10; k >= 0; k--) {
      a.foe.s = k / 10;
      await sleep(18);
    }
    a.foe.show = false;
    for (let k = 0; k <= 8; k++) {
      a.spike.y = y1 + (L.foe.y - 6 - y1) * (k / 8);
      await sleep(16);
    }
    const shakes = this.captureShakes(foe, it.rate);
    for (let k = 0; k < Math.min(3, shakes); k++) {
      await this.wait(420);
      this.audio.sfx('shake');
      for (let j = 0; j <= 12; j++) {
        a.spike.rot = Math.sin((j / 12) * Math.PI * 2) * 0.5;
        await sleep(16);
      }
      a.spike.rot = 0;
    }
    await this.wait(400);
    if (shakes >= 4) {
      this.audio.sfx('caught');
      this.burst(a.spike.x, a.spike.y, '#ffe23d', 26);
      a.spike.glow = '#ffffff';
      await this.hud.say(`Linked! ${SPECIES_BY_ID[foe.sp].name} is tethered to you!`);
      a.spike = null;
      await this.onCaught(foe);
      return 'caught';
    }
    this.audio.sfx('breakout');
    a.spike = null;
    a.foe.show = true;
    for (let k = 0; k <= 8; k++) {
      a.foe.s = k / 8;
      a.foe.white = 1 - k / 8;
      await sleep(16);
    }
    await this.hud.say(['Oh no! It broke the link!', 'Argh! Almost had it!', 'Aaah! It was so close!', 'Shoot! It slipped the tether!'][shakes]);
    return 'free';
  }

  captureShakes(foe, rate) {
    if (rate >= 255) return 4;
    const sp = SPECIES_BY_ID[foe.sp];
    const bonus = foe.status === 'standby' ? 2 : foe.status ? 1.5 : 1;
    const A = (((3 * foe.stats.hp - 2 * foe.hp) * sp.catchRate * rate) / (3 * foe.stats.hp)) * bonus;
    if (A >= 255) return 4;
    const p = (A / 255) ** 0.25;
    let n = 0;
    while (n < 4 && this.rng() < p) n++;
    return n;
  }

  async onCaught(mon) {
    const g = this.game;
    mon.caughtMark = false;
    delete mon.caughtMark;
    mon.ot = g.s.name;
    const isNew = !g.s.caught[mon.sp];
    g.s.caught[mon.sp] = true;
    for (const m of mon.moves) m.pp = Math.max(m.pp, 0);
    if (g.s.party.length < 6) {
      g.s.party.push(mon);
    } else {
      g.s.box.push(mon);
      await this.hud.say(`Your party is full, so ${SPECIES_BY_ID[mon.sp].name} was uploaded to the Datavault.`);
    }
    if (isNew) await this.hud.say(`${SPECIES_BY_ID[mon.sp].name}'s legend was added to your Codex.`);
  }

  // ---------------------------------------------------------------- moves
  pickFoeMove() {
    const foe = this.foe, me = this.me;
    const usable = foe.moves.filter((m) => m.pp > 0);
    if (!usable.length) return foe.moves[0].id;
    if (this.opts.wild && !this.opts.legendary) {
      const m = usable[Math.floor(this.rng() * usable.length)];
      m.pp--;
      return m.id;
    }
    let best = null, bestScore = -1;
    for (const m of usable) {
      const d = MOVES[m.id];
      let score;
      if (d.cat === 'status') {
        score = 25;
        if (d.status && me.status) score = 0;
        if (d.heal) score = foe.hp < foe.stats.hp * 0.45 ? 120 : 0;
        if (d.stat && d.self && this.stages.foe[d.stat] >= 2) score = 5;
        if (d.stat && !d.self && this.stages.me[d.stat] <= -2) score = 5;
      } else {
        const eff = effectiveness(d.type, SPECIES_BY_ID[me.sp].types);
        const stab = SPECIES_BY_ID[foe.sp].types.includes(d.type) ? 1.5 : 1;
        const atk = d.cat === 'phys' ? foe.stats.atk : foe.stats.spc;
        score = d.pow * eff * stab * (Math.min(d.acc, 100) / 100) * (atk / 100);
      }
      score *= 0.8 + this.rng() * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    best.pp--;
    return best.id;
  }

  async doMove(side, slot) {
    const user = side === 'me' ? this.me : this.foe, target = side === 'me' ? this.foe : this.me;
    const tside = side === 'me' ? 'foe' : 'me';
    const who = side === 'me' ? monName(user) : `${this.opts.wild ? 'The wild ' : 'Foe '}${monName(user)}`;
    const twho = tside === 'me' ? monName(target) : `${this.opts.wild ? 'the wild ' : 'the foe '}${monName(target)}`;
    // Conditions that stop a move.
    if (user.status === 'standby') {
      if (--this.sleepTurns[side] <= 0) {
        user.status = null;
        this.hud.setMon(side, user);
        await this.hud.say(`${who} came back online!`, { wait: false });
      } else {
        await this.hud.say(`${who} is on standby…`, { wait: false });
        return;
      }
    }
    if (user.status === 'static' && this.rng() < 0.25) {
      this.sparkle(side, STATUS_INFO.static.color);
      await this.hud.say(`${who} is locked up by static!`, { wait: false });
      return;
    }
    const noPP = side === 'me' && slot.pp <= 0;
    const id = noPP ? 'spark_nip' : slot.id;
    if (side === 'me' && !noPP) slot.pp--;
    const d = MOVES[id];
    await this.hud.say(`${who} used ${d.name}!`, { wait: false });
    if (this.rng() * 100 >= d.acc) {
      await this.lunge(side, 0.5);
      await this.hud.say(d.cat === 'status' ? 'But it failed!' : `${who}'s attack missed!`, { wait: false });
      return;
    }
    if (d.cat === 'status') {
      await this.statusMove(side, tside, d, who, twho);
      return;
    }
    // Damage.
    const L = user.lv;
    const phys = d.cat === 'phys';
    let A = (phys ? user.stats.atk : user.stats.spc) * stageMul(this.stages[side][phys ? 'atk' : 'spc']);
    const D = (phys ? target.stats.def : target.stats.spc) * stageMul(this.stages[tside][phys ? 'def' : 'spc']);
    if (phys && user.status === 'scorch') A *= 0.5;
    const eff = effectiveness(d.type, SPECIES_BY_ID[target.sp].types);
    const stab = SPECIES_BY_ID[user.sp].types.includes(d.type) ? 1.5 : 1;
    const crit = this.rng() < (d.crit ? 0.25 : 1 / 16);
    let dmg = ((((2 * L) / 5 + 2) * d.pow * (A / D)) / 50 + 2) * stab * eff * (crit ? 1.5 : 1) * (0.85 + this.rng() * 0.15);
    dmg = Math.max(1, Math.floor(dmg));
    if (eff === 0) dmg = 0;
    await this.lunge(side);
    this.particles(tside, d.type);
    this.audio.sfx('hit', eff);
    if (eff > 1) this.anim.shake = 1;
    await this.flash(tside);
    const before = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    await this.hud.hp(tside, target, before, this.fast);
    if (crit) {
      this.audio.sfx('crit');
      await this.hud.say('A critical hit!', { wait: false });
    }
    if (eff > 1) await this.hud.say('It\'s super effective!', { wait: false });
    else if (eff < 1) await this.hud.say('It\'s not very effective…', { wait: false });
    if (d.drain && user.hp > 0) {
      const b2 = user.hp;
      user.hp = Math.min(user.stats.hp, user.hp + Math.max(1, Math.floor((before - target.hp) * d.drain)));
      await this.hud.hp(side, user, b2, this.fast);
      await this.hud.say(`${who} drained energy!`, { wait: false });
    }
    if (d.recoil) {
      const b2 = user.hp;
      user.hp = Math.max(0, user.hp - Math.max(1, Math.floor((before - target.hp) * d.recoil)));
      await this.flash(side);
      await this.hud.hp(side, user, b2, this.fast);
      await this.hud.say(`${who} is hurt by the backlash!`, { wait: false });
    }
    if (target.hp > 0) {
      if (d.status && !target.status && this.rng() < d.chance) await this.inflict(tside, d.status, twho);
      if (d.stat && this.rng() < (d.chance ?? 1)) await this.shift(d.self ? side : tside, d.stat, d.stages, d.self ? who : twho);
    }
  }

  async statusMove(side, tside, d, who, twho) {
    const user = side === 'me' ? this.me : this.foe, target = side === 'me' ? this.foe : this.me;
    if (d.heal) {
      if (user.hp >= user.stats.hp) {
        await this.hud.say('But its HP is already full!', { wait: false });
        return;
      }
      const b = user.hp;
      user.hp = Math.min(user.stats.hp, user.hp + Math.floor(user.stats.hp * d.heal));
      this.audio.sfx('heal');
      this.sparkle(side, '#6dff7a');
      await this.hud.hp(side, user, b, this.fast);
      await this.hud.say(`${who} repaired itself!`, { wait: false });
      return;
    }
    if (d.status) {
      if (target.status) {
        await this.hud.say(`But ${twho} is already ${STATUS_INFO[target.status].name.toLowerCase()}!`, { wait: false });
        return;
      }
      this.particles(tside, d.type);
      await this.inflict(tside, d.status, twho);
      return;
    }
    if (d.stat) await this.shift(d.self ? side : tside, d.stat, d.stages, d.self ? who : twho);
  }

  async inflict(side, status, name) {
    const mon = side === 'me' ? this.me : this.foe;
    mon.status = status;
    if (status === 'standby') this.sleepTurns[side] = 1 + Math.floor(this.rng() * 3);
    this.audio.sfx('status');
    this.sparkle(side, STATUS_INFO[status].color);
    this.hud.setMon(side, mon);
    const txt = { scorch: 'was scorched!', static: 'is crackling with static! It may lock up.', corrupt: 'was corrupted!', standby: 'went into standby mode!' }[status];
    await this.hud.say(`${name[0].toUpperCase()}${name.slice(1)} ${txt}`, { wait: false });
  }

  async shift(side, stat, n, name) {
    const st = this.stages[side];
    const cap = name[0].toUpperCase() + name.slice(1);
    if ((n > 0 && st[stat] >= 6) || (n < 0 && st[stat] <= -6)) {
      await this.hud.say(`${cap}'s ${STAT_NAME[stat]} won't go any ${n > 0 ? 'higher' : 'lower'}!`, { wait: false });
      return;
    }
    st[stat] = clamp(st[stat] + n, -6, 6);
    this.audio.sfx(n > 0 ? 'statup' : 'statdown');
    this.sparkle(side, n > 0 ? '#7ff4ff' : '#ff6b3d', n > 0 ? -1 : 1);
    await this.hud.say(`${cap}'s ${STAT_NAME[stat]} ${Math.abs(n) > 1 ? 'sharply ' : ''}${n > 0 ? 'rose' : 'fell'}!`, { wait: false });
  }

  async endOfTurn(side) {
    const mon = side === 'me' ? this.me : this.foe;
    if (mon.hp <= 0 || !['scorch', 'corrupt'].includes(mon.status)) return;
    const who = side === 'me' ? monName(mon) : `${this.opts.wild ? 'The wild ' : 'Foe '}${monName(mon)}`;
    const dmg = Math.max(1, Math.floor(mon.stats.hp / (mon.status === 'scorch' ? 16 : 8)));
    const b = mon.hp;
    mon.hp = Math.max(0, mon.hp - dmg);
    this.sparkle(side, STATUS_INFO[mon.status].color);
    await this.flash(side);
    await this.hud.hp(side, mon, b, this.fast);
    await this.hud.say(`${who} is hurt by ${mon.status === 'scorch' ? 'its burns' : 'corrupted code'}!`, { wait: false });
  }

  /** Handles fainting on either side. Returns 'win', 'lose' or null to keep going. */
  async checkFaints() {
    if (this.foe.hp <= 0) {
      const foe = this.foe;
      this.audio.sfx('faint');
      await this.faintAnim('foe');
      await this.hud.say(`${this.opts.wild ? 'The wild ' : 'Foe '}${monName(foe)} fainted!`);
      await this.giveXP(foe);
      if (this.me.hp <= 0 && !this.game.s.party.some((m) => m.hp > 0)) return 'lose';
      if (this.foeIdx < this.foes.length - 1) {
        this.foeIdx++;
        this.stages.foe = newStages();
        this.participants = new Set(this.me.hp > 0 ? [this.meIdx] : []);
        await this.sendOut('foe');
        await this.hud.say(`${this.opts.trainer.name} sent out ${monName(this.foe)}!`, { wait: false });
        this.markSeen(this.foe);
      } else return 'win';
    }
    if (this.me.hp <= 0) {
      this.audio.sfx('faint');
      await this.faintAnim('me');
      await this.hud.say(`${monName(this.me)} fainted!`);
      if (!this.game.s.party.some((m) => m.hp > 0)) return 'lose';
      const idx = await this.game.ui.partyScreen(this.game, 'pick', { title: 'Send out which drake?', filter: (m) => m.hp > 0, forced: true });
      this.meIdx = idx;
      this.stages.me = newStages();
      this.participants.add(idx);
      await this.sendOut('me');
    }
    return null;
  }

  async giveXP(foe) {
    const g = this.game;
    const base = Math.floor((SPECIES_BY_ID[foe.sp].exp * foe.lv) / 5 * (this.opts.trainer ? 1.5 : 1));
    for (const [i, mon] of g.s.party.entries()) {
      if (mon.hp <= 0 || mon.lv >= MAX_LEVEL) continue;
      const part = this.participants.has(i);
      let xp = part ? base : Math.floor(base * 0.5);
      if (mon.ot && mon.ot !== g.s.name) xp = Math.floor(xp * 1.5);
      if (xp <= 0) continue;
      mon.xp += xp;
      if (part) await this.hud.say(`${monName(mon)} gained ${xp} XP!`, { wait: false });
      while (mon.lv < MAX_LEVEL && mon.xp >= xpFor(mon.lv + 1)) await this.levelUp(mon, i === this.meIdx);
      if (i === this.meIdx) this.hud.setMon('me', mon);
    }
    if (g.s.party.length > 1 && g.s.party.some((m, i) => !this.participants.has(i) && m.hp > 0)) await this.hud.say('The rest of your party shared the XP through the link.', { wait: false });
  }

  async levelUp(mon, active) {
    const before = mon.hp;
    mon.lv++;
    refresh(mon);
    this.audio.sfx('levelup');
    if (active) {
      this.hud.setMon('me', mon);
      await this.hud.hp('me', mon, before, true);
    }
    await this.hud.say(`${monName(mon)} grew to level ${mon.lv}!`);
    for (const id of movesAt(mon.sp, mon.lv)) await learnMove(this.game, mon, id, (t) => this.hud.say(t), this.hud);
    if (levelEvolution(mon)) this.evolveQueue.add(mon);
  }

  async outro(result) {
    const g = this.game;
    if (result === 'win' && this.opts.trainer) {
      const tr = this.opts.trainer;
      this.audio.music('victory');
      this.audio.sfx('win');
      const a = this.anim;
      a.trainer = { look: tr.look, x: 0, a: 1 };
      for (const line of tr.lose ?? []) await this.hud.say(line);
      if (tr.creds) {
        g.s.creds += tr.creds;
        this.audio.sfx('coin');
        await this.hud.say(`You got ₵${tr.creds} for winning!`);
      }
    }
    if (result === 'win' && this.opts.wild) this.audio.sfx('win');
    if (result === 'lose' && this.opts.canLose) {
      this.audio.sfx('lose');
      await this.hud.say('Your drakes are worn out! You lost this one.');
    } else if (result === 'lose') {
      this.audio.sfx('lose');
      const lost = Math.floor(g.s.creds / 2);
      await this.hud.say('You have no drakes left that can fight!');
      g.s.creds -= lost;
      await this.hud.say(lost ? `You dropped ₵${lost} in the confusion and blacked out…` : 'You blacked out…');
    }
    // Clear battle-only state.
    for (const m of g.s.party) delete m.caughtMark;
    for (const mon of this.evolveQueue) if (result !== 'lose') await g.evolveScene(mon, levelEvolution(mon));
  }

  // ---------------------------------------------------------------- animation helpers
  async lunge(side, amount = 1) {
    const a = this.anim[side];
    const dir = side === 'me' ? 1 : -1;
    for (let k = 0; k <= 6; k++) {
      a.x = Math.sin((k / 6) * Math.PI) * 14 * dir * amount;
      a.y = -Math.sin((k / 6) * Math.PI) * 6 * dir * amount;
      await sleep(14);
    }
    a.x = a.y = 0;
  }

  async flash(side) {
    const a = this.anim[side];
    for (let k = 0; k < 4; k++) {
      a.flash = k % 2 ? 0 : 1;
      await this.wait(70);
    }
    a.flash = 0;
  }

  async faintAnim(side) {
    const a = this.anim[side];
    for (let k = 0; k <= 12; k++) {
      a.y = k * 4;
      a.a = 1 - k / 12;
      await sleep(18);
    }
    a.show = false;
    a.y = 0;
    a.a = 1;
    this.hud.setMon(side, null);
  }

  particles(side, type) {
    const L = this.layout()[side];
    const col = TYPE_INFO[type].color;
    for (let k = 0; k < 22; k++) {
      const ang = this.rng() * Math.PI * 2, sp = 0.6 + this.rng() * 2.4;
      this.anim.particles.push({
        x: L.x + (this.rng() - 0.5) * 20, y: L.y - L.h * 0.45 + (this.rng() - 0.5) * 20,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (type === 'plasma' ? 1 : 0), life: 30 + this.rng() * 20,
        col: k % 3 ? col : mix(col, '#ffffff', 0.6), size: type === 'glitch' ? 3 : type === 'chrome' ? 2 : 2, type,
      });
    }
  }

  sparkle(side, col, dir = -1) {
    const L = this.layout()[side];
    for (let k = 0; k < 14; k++) {
      this.anim.particles.push({ x: L.x + (this.rng() - 0.5) * L.w * 0.7, y: L.y - this.rng() * L.h, vx: 0, vy: dir * (0.5 + this.rng()), life: 35, col, size: 2, type: 'spark' });
    }
  }

  burst(x, y, col, n) {
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      this.anim.particles.push({ x, y, vx: Math.cos(ang) * 2.2, vy: Math.sin(ang) * 2.2, life: 40, col, size: 2, type: 'spark' });
    }
  }

  // ---------------------------------------------------------------- scene
  layout() {
    const { W, panelTop } = this.dims ?? { W: 320, panelTop: 140 };
    const sceneH = panelTop;
    const k = clamp(Math.floor(Math.min(W / 110, sceneH / 85)), 1, 3);
    const size = 64 * k;
    return {
      k, size, sceneH,
      foe: { x: Math.round(W * 0.7), y: Math.max(Math.round(sceneH * 0.5), Math.round(size * 0.95) + 6), w: size, h: size },
      me: { x: Math.round(W * 0.25), y: Math.round(sceneH * 0.95), w: size, h: size },
    };
  }

  render(ctx, W, H, panelTop, t, reduced) {
    this.dims = { W, H, panelTop };
    const L = this.layout();
    const a = this.anim;
    a.t = t;
    const key = `${W}x${H}x${panelTop}x${this.opts.bg}`;
    if (this.bgKey !== key) {
      this.bg = paintBattleBg(W, H, panelTop, this.opts.bg, L.foe.y);
      this.bgKey = key;
    }
    let sx = 0, sy = 0;
    if (a.shake > 0 && !reduced) {
      sx = Math.round((Math.random() - 0.5) * 6 * a.shake);
      sy = Math.round((Math.random() - 0.5) * 4 * a.shake);
      a.shake = Math.max(0, a.shake - 0.06);
    }
    ctx.drawImage(this.bg, sx, sy);
    const bob = (side) => (reduced ? 0 : Math.round(Math.sin(t * 2.2 + (side === 'me' ? 1.3 : 0)) * 1.5));
    for (const side of ['foe', 'me']) {
      const s = a[side];
      if (!s.show) continue;
      const mon = side === 'me' ? this.me : this.foe;
      if (!mon) continue;
      const P = L[side];
      const img = creatureCanvas(mon.sp);
      const size = P.w * s.s;
      const dx = Math.round(P.x - size / 2 + s.x + sx), dy = Math.round(P.y - size + s.y + bob(side) + sy + (1 - s.s) * P.h * 0.5);
      ctx.save();
      ctx.globalAlpha = s.a;
      if (side === 'me') {
        ctx.translate(dx + size, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, size, size);
      } else ctx.drawImage(img, dx, dy, size, size);
      ctx.restore();
      if (s.flash || s.white) {
        const tint = whiteVersion(mon.sp);
        ctx.save();
        ctx.globalAlpha = s.flash ? 0.9 : s.white;
        if (side === 'me') {
          ctx.translate(dx + size, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(tint, 0, 0, size, size);
        } else ctx.drawImage(tint, dx, dy, size, size);
        ctx.restore();
      }
    }
    if (a.trainer) {
      const img = this.game.personSheet(a.trainer.look);
      const k = L.k * 2;
      ctx.globalAlpha = a.trainer.a;
      ctx.drawImage(img, 0, 0, 16, 16, Math.round(L.foe.x - 8 * k + a.trainer.x), Math.round(L.foe.y - 16 * k), 16 * k, 16 * k);
      ctx.globalAlpha = 1;
    }
    if (a.spike) {
      const sp = a.spike;
      ctx.save();
      ctx.translate(Math.round(sp.x), Math.round(sp.y));
      ctx.rotate(sp.rot);
      const k = L.k;
      ctx.fillStyle = sp.glow;
      ctx.globalAlpha = 0.35 + Math.sin(t * 12) * 0.15;
      ctx.fillRect(-5 * k, -8 * k, 10 * k, 16 * k);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(-2 * k, -6 * k, 4 * k, 12 * k);
      ctx.fillStyle = sp.glow;
      ctx.fillRect(-2 * k, -2 * k, 4 * k, 2 * k);
      ctx.fillStyle = '#eef1f6';
      ctx.fillRect(-1 * k, 6 * k, 2 * k, 2 * k);
      ctx.restore();
    }
    // Particles
    const ps = a.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.type === 'plasma') p.vy -= 0.04;
      else if (p.type === 'coolant' || p.type === 'bio') p.vy += 0.05;
      p.life--;
      if (p.life <= 0) {
        ps.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, p.life / 15);
      ctx.fillStyle = p.col;
      const sz = p.size * L.k;
      if (p.type === 'volt') ctx.fillRect(Math.round(p.x), Math.round(p.y), sz * 2, 1 * L.k);
      else ctx.fillRect(Math.round(p.x), Math.round(p.y), sz, sz);
    }
    ctx.globalAlpha = 1;
  }
}

function newStages() {
  return { atk: 0, def: 0, spc: 0, spd: 0 };
}

const whiteCache = new Map();
function whiteVersion(id) {
  if (whiteCache.has(id)) return whiteCache.get(id);
  const src = creatureCanvas(id);
  const [c, ctx] = makeCanvas(64, 64);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  whiteCache.set(id, c);
  return c;
}

const BG = {
  day: ['#3a2a8a', '#ff6ab0', '#ffb86b'],
  night: ['#05031a', '#1c1450', '#3a2a8a'],
  rain: ['#0e1a2e', '#1a3a5a', '#2a5a7a'],
  foundry: ['#1a1016', '#5a2a1a', '#ff8a3a'],
  indoor: ['#0e0a24', '#221a4a', '#3a2a6a'],
  heart: ['#02010a', '#0a1a3a', '#1a6a8a'],
  summit: ['#1a0a3a', '#8a2a6a', '#ffb13a'],
};

function paintBattleBg(W, H, panelTop, key = 'day', foeY = Math.round(panelTop * 0.5)) {
  const [c, ctx] = makeCanvas(W, H);
  const [top, mid, low] = BG[key] ?? BG.day;
  const g = ctx.createLinearGradient(0, 0, 0, panelTop);
  g.addColorStop(0, top);
  g.addColorStop(0.6, mid);
  g.addColorStop(1, low);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Stars for dark skies
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (['night', 'heart', 'indoor', 'summit'].includes(key)) {
    for (let i = 0; i < W / 3; i++) {
      ctx.fillStyle = rnd() < 0.2 ? '#7ff4ff' : '#ffffff';
      ctx.globalAlpha = 0.3 + rnd() * 0.6;
      ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * panelTop * 0.6), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  // Distant skyline of other floating islands and towers.
  const horizon = Math.round(panelTop * 0.62);
  ctx.fillStyle = mix(low, '#000000', 0.55);
  for (let x = 0; x < W; ) {
    const bw = 6 + Math.floor(rnd() * 14), bh = 10 + Math.floor(rnd() * panelTop * 0.3);
    ctx.fillRect(x, horizon - bh, bw, bh + 4);
    for (let wy = horizon - bh + 3; wy < horizon; wy += 4) {
      for (let wx = x + 2; wx < x + bw - 2; wx += 3) {
        if (rnd() < 0.25) {
          ctx.fillStyle = ['#ff4fd8', '#3ff7ff', '#ffe23d'][Math.floor(rnd() * 3)];
          ctx.globalAlpha = 0.7;
          ctx.fillRect(wx, wy, 1, 1);
          ctx.globalAlpha = 1;
          ctx.fillStyle = mix(low, '#000000', 0.55);
        }
      }
    }
    x += bw + Math.floor(rnd() * 4);
  }
  // Cloud sea
  ctx.fillStyle = mix(low, '#ffffff', 0.25);
  ctx.globalAlpha = 0.5;
  for (let x = -20; x < W + 20; x += 18) {
    const r = 10 + Math.floor(rnd() * 10);
    ctx.beginPath();
    ctx.arc(x, horizon + 6 + rnd() * 6, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // A neon deck grid running off toward the horizon.
  const floorTop = horizon + 8;
  const fg = ctx.createLinearGradient(0, floorTop, 0, H);
  fg.addColorStop(0, mix(low, '#1a1030', 0.55));
  fg.addColorStop(1, '#0a0620');
  ctx.fillStyle = fg;
  ctx.fillRect(0, floorTop, W, H - floorTop);
  ctx.fillStyle = mix(low, '#ff4fd8', 0.5);
  ctx.globalAlpha = 0.55;
  for (let i = 1; i < 14; i++) {
    const y = Math.round(floorTop + (H - floorTop) * ((i / 14) ** 2.2));
    ctx.fillRect(0, y, W, 1);
  }
  for (let i = -12; i <= 12; i++) {
    const xb = W / 2 + i * (W / 8);
    for (let y = floorTop; y < H; y += 1) {
      const t = (y - floorTop) / (H - floorTop);
      ctx.fillRect(Math.round(W / 2 + (xb - W / 2) * t), y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = mix(low, '#ffffff', 0.4);
  ctx.fillRect(0, floorTop, W, 1);
  // Hover pads
  const k = clamp(Math.floor(Math.min(W / 110, panelTop / 85)), 1, 3);
  const pad = (x, y, rx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 4 * k, rx, rx * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2448';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3ff7ff';
    ctx.lineWidth = k;
    ctx.beginPath();
    ctx.ellipse(x, y, rx - k, rx * 0.28 - k, 0, 0, Math.PI * 2);
    ctx.stroke();
  };
  pad(Math.round(W * 0.7), foeY, 34 * k);
  pad(Math.round(W * 0.25), Math.round(panelTop * 0.95), 38 * k);
  return c;
}

/** Teaches a move, asking which to forget if the drake already knows four. */
export async function learnMove(game, mon, id, say, hud) {
  if (mon.moves.some((m) => m.id === id)) return;
  const name = MOVES[id].name;
  if (mon.moves.length < 4) {
    mon.moves.push({ id, pp: MOVES[id].pp });
    game.audio.sfx('statup');
    await say(`${monName(mon)} learned ${name}!`);
    return;
  }
  await say(`${monName(mon)} wants to learn ${name}, but already knows four moves.`);
  const slot = await hud.replaceMove(mon, id);
  if (slot < 0) {
    await say(`${monName(mon)} did not learn ${name}.`);
    return;
  }
  const old = MOVES[mon.moves[slot].id].name;
  mon.moves[slot] = { id, pp: MOVES[id].pp };
  await say(`1, 2 and… poof! ${monName(mon)} forgot ${old} and learned ${name}!`);
}

export { evolve };
