import { SPECIES, fishSprite, pickSpecies, rollSize } from './fish.js';
import {
  BUCKET, CAST_MAX_X, CAST_MIN_X, HAND, REEL_END, ROD_LEN, WATER, inWater, waterHalfHeight,
} from './layout.js';
import { P } from './palette.js';
import { clamp, easeInOutSine, lerp } from './util.js';

const ROD_IDLE = -0.95;
const ROD_BACK = -2.25;
const ROD_FORWARD = -0.3;
const ROD_WAIT = -0.7;

/**
 * The fishing state machine. States:
 * title → idle → charging → casting → waiting → bite → reeling → landing → caught → idle
 * with `lost` as a short detour when a fish escapes or the line snaps.
 */
export class Game {
  constructor({ audio, ui, store, rng, fast = false }) {
    this.audio = audio;
    this.ui = ui;
    this.store = store;
    this.rng = rng;
    this.fast = fast;
    this.t = 0;
    this.state = 'title';
    this.stateT = 0;
    this.holding = false;
    this.swallowRelease = false;
    this.paused = false;
    this.power = 0;
    this.powerDir = 1;
    this.lane = 0;
    this.rodAngle = ROD_IDLE;
    this.rodTarget = ROD_IDLE;
    this.rodBend = 0;
    this.rodShake = 0;
    this.bobber = { x: 0, y: 0, dip: 0, under: false, inWater: false };
    this.cast = null;
    this.pending = null;
    this.hooked = null;
    this.tension = 0;
    this.progress = 0;
    this.surge = { phase: 'calm', t: 0, next: 2 };
    this.leap = null;
    this.exclaim = 0;
    this.strainSaid = 0;
    this.sessionCatches = [];
    this.ripples = [];
    this.particles = [];
    this.texts = [];
    this.jumper = null;
    this.jumpIn = 9;
    this.shadows = [];
    for (let i = 0; i < 4; i++) this.shadows.push(this.makeShadow(SPECIES[i % 3]));
    this.bobber.x = this.rodTip().x;
    this.bobber.y = this.rodTip().y + 6;
  }

  get settings() {
    return this.store.settings;
  }

  setState(s, message) {
    this.state = s;
    this.stateT = 0;
    this.ui.onState(s, message);
  }

  // ---------------------------------------------------------------- input
  press() {
    if (this.paused || this.holding) return;
    this.holding = true;
    switch (this.state) {
      case 'title':
        this.audio.unlock();
        this.swallowRelease = true;
        this.setState('idle');
        break;
      case 'idle':
      case 'lost':
        this.startCharge();
        break;
      case 'waiting':
        this.reelInEmpty();
        this.swallowRelease = true;
        break;
      case 'bite':
        this.hook();
        break;
      case 'caught':
        this.swallowRelease = true;
        if (this.stateT > 0.35) {
          this.ui.hideCard();
          this.audio.click();
          this.setState('idle');
        }
        break;
      default:
        break;
    }
  }

  release() {
    if (!this.holding) return;
    this.holding = false;
    if (this.swallowRelease) {
      this.swallowRelease = false;
      return;
    }
    if (this.state === 'charging') this.doCast();
  }

  /** Drop any held input, e.g. when a dialog opens or the tab is hidden. */
  cancelInput() {
    this.holding = false;
    this.swallowRelease = false;
    if (this.state === 'charging') this.setState('idle');
  }

  // --------------------------------------------------------------- actions
  startCharge() {
    this.power = 0;
    this.powerDir = 1;
    this.lane = this.rng() * 2 - 1;
    this.audio.charge();
    this.setState('charging');
  }

  castTarget(power) {
    const x = Math.round(lerp(CAST_MIN_X, CAST_MAX_X, power));
    const y = Math.round(WATER.y + this.lane * waterHalfHeight(x, 4) * 0.75);
    return { x, y };
  }

  doCast() {
    const p = Math.max(0.06, this.power);
    this.cast = { p, to: this.castTarget(p), from: null, t: 0, launched: false, dur: 0.5 + 0.4 * p };
    this.rodTarget = ROD_FORWARD;
    this.audio.cast();
    this.setState('casting');
  }

  land() {
    const { to, p } = this.cast;
    Object.assign(this.bobber, { x: to.x, y: to.y, inWater: true, under: false, dip: 1 });
    this.splash(to.x, to.y, 8);
    this.ripple(to.x, to.y, 12);
    this.audio.splash(0.6);
    this.scare(to.x, to.y);
    this.rodTarget = ROD_WAIT;

    const species = pickSpecies(p, this.rng, this.store.journal);
    const waitDur = this.fast ? 0.7 : 2.2 + this.rng() * 4.5;
    const nibbles = [];
    const n = this.fast ? 0 : Math.floor(this.rng() * 3);
    for (let i = 0; i < n; i++) nibbles.push(waitDur - 0.7 - i * (0.6 + this.rng() * 0.5));
    // The interested fish appears somewhere across the lake and drifts over.
    let sx, sy;
    for (let i = 0; i < 20; i++) {
      sx = WATER.x + (this.rng() * 2 - 1) * (WATER.rx - 8);
      sy = WATER.y + (this.rng() * 2 - 1) * (WATER.ry - 4);
      if (inWater(sx, sy, 4) && Math.hypot(sx - to.x, sy - to.y) > 26) break;
    }
    const shadow = this.makeShadow(species, sx, sy);
    shadow.approach = true;
    shadow.fade = 0;
    shadow.sx = sx;
    shadow.sy = sy;
    this.shadows.push(shadow);
    this.pending = { species, size: rollSize(species, this.rng), waitDur, nibbles, shadow };
    this.setState('waiting');
  }

  reelInEmpty() {
    this.audio.reelIn();
    this.releasePending();
    this.bobber.inWater = false;
    this.rodTarget = ROD_IDLE;
    this.setState('idle', 'Nothing yet. Cast again whenever you like.');
  }

  releasePending(flee = true) {
    if (!this.pending) return;
    const s = this.pending.shadow;
    s.approach = false;
    if (flee) {
      s.flee = 1.2;
      s.fading = true;
    }
    this.pending = null;
  }

  triggerBite() {
    this.bobber.under = true;
    this.exclaim = 1;
    this.splash(this.bobber.x, this.bobber.y, 10);
    this.ripple(this.bobber.x, this.bobber.y, 14);
    this.audio.bite();
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    this.rodTarget = ROD_WAIT + 0.25;
    this.rodShake = 0.3;
    this.ui.alert('Bite!');
    this.setState('bite');
  }

  hook() {
    const { species, size, shadow } = this.pending;
    shadow.hooked = true;
    this.hooked = { species, size, shadow, from: { x: this.bobber.x, y: this.bobber.y } };
    this.pending = null;
    this.exclaim = 0;
    this.tension = 0.25;
    this.progress = 0.2;
    this.surge = { phase: 'calm', t: 0, next: 0.9 + this.rng() * 1.2 };
    this.audio.hook();
    this.setState('reeling');
  }

  lose(message, snapped = false) {
    if (this.hooked) {
      const s = this.hooked.shadow;
      s.hooked = false;
      s.flee = 1.5;
      s.fading = true;
      this.hooked = null;
    }
    this.releasePending();
    this.exclaim = 0;
    this.bobber.inWater = false;
    this.bobber.under = false;
    this.rodTarget = ROD_IDLE;
    this.rodBend = 0;
    if (snapped) {
      this.audio.snap();
      this.say('SNAP!', HAND.x + 8, HAND.y - 24, P.red);
      if (navigator.vibrate) navigator.vibrate(60);
    } else {
      this.audio.escape();
    }
    this.setState('lost', message);
  }

  startLanding() {
    const { species, shadow } = this.hooked;
    this.shadows.splice(this.shadows.indexOf(shadow), 1);
    const sprite = fishSprite(species);
    this.leap = {
      x0: this.bobber.x, y0: this.bobber.y,
      x1: BUCKET.x + 3, y1: BUCKET.y - 2,
      t: 0, dur: 0.85, sprite, x: this.bobber.x, y: this.bobber.y,
    };
    this.splash(this.bobber.x, this.bobber.y, 14);
    this.ripple(this.bobber.x, this.bobber.y, 16);
    this.audio.splash(1);
    this.bobber.inWater = false;
    this.bobber.under = false;
    this.rodTarget = -1.3;
    this.rodBend = 0;
    this.setState('landing');
  }

  finishCatch() {
    const { species, size } = this.hooked;
    this.hooked = null;
    this.leap = null;
    const result = this.store.record(species, size);
    this.sessionCatches.push(species);
    this.audio.caught(result.isNew);
    this.sparkle(BUCKET.x + 3, BUCKET.y - 2, 16);
    if (result.isNew) this.say('NEW!', BUCKET.x - 2, BUCKET.y - 14, P.visor);
    this.rodTarget = ROD_IDLE;
    this.ui.showCard(species, size, result);
    this.setState('caught');
  }

  // --------------------------------------------------------------- update
  update(dt) {
    this.t += dt;
    this.stateT += dt;
    const s = this.state;

    if (s === 'charging') {
      this.power += (this.powerDir * dt) / 1.15;
      if (this.power >= 1) {
        this.power = 1;
        this.powerDir = -1;
      } else if (this.power <= 0) {
        this.power = 0;
        this.powerDir = 1;
      }
      this.rodTarget = lerp(ROD_IDLE, ROD_BACK, easeInOutSine(this.power));
    } else if (s === 'casting') {
      this.updateCast(dt);
    } else if (s === 'waiting') {
      this.updateWaiting();
    } else if (s === 'bite') {
      const limit = this.settings.gentle ? 1.9 : 1.05;
      if (this.stateT > limit) this.lose('It got away. The bite is the big plunge — be quick!');
    } else if (s === 'reeling') {
      this.updateReel(dt);
    } else if (s === 'landing') {
      const L = this.leap;
      L.t += dt;
      const k = Math.min(1, L.t / L.dur);
      L.x = lerp(L.x0, L.x1, k);
      L.y = lerp(L.y0, L.y1, k) - Math.sin(k * Math.PI) * 34;
      if (k >= 1) this.finishCatch();
    } else if (s === 'lost' && this.stateT > 2.6) {
      this.setState('idle');
    }

    this.updateRod(dt);
    this.updateBobber();
    this.updateShadows(dt);
    this.updateFx(dt);
    this.updateJumper(dt);
    if (this.exclaim > 0 && s !== 'bite') this.exclaim = Math.max(0, this.exclaim - dt * 4);
  }

  updateCast(dt) {
    const c = this.cast;
    c.t += dt;
    if (!c.launched && c.t >= 0.12) {
      c.launched = true;
      c.from = { ...this.rodTip() };
    }
    if (c.launched) {
      const k = Math.min(1, (c.t - 0.12) / c.dur);
      this.bobber.x = lerp(c.from.x, c.to.x, k);
      this.bobber.y = lerp(c.from.y, c.to.y, k) - Math.sin(k * Math.PI) * (16 + 42 * c.p);
      if (k >= 1) this.land();
    }
    if (c.t > 0.2) this.rodTarget = ROD_WAIT;
  }

  updateWaiting() {
    const p = this.pending;
    const sh = p.shadow;
    const arrive = p.waitDur * 0.7;
    const near = { x: this.bobber.x - 4, y: this.bobber.y + 1 };
    if (this.stateT < arrive) {
      const k = easeInOutSine(this.stateT / arrive);
      sh.x = lerp(sh.sx, near.x, k);
      sh.y = lerp(sh.sy, near.y, k);
    } else {
      sh.x = near.x + Math.sin(this.t * 3) * 1.2;
      sh.y = near.y;
    }
    sh.fade = Math.min(1, this.stateT / 1.2);
    while (p.nibbles.length && this.stateT >= p.nibbles[p.nibbles.length - 1]) {
      p.nibbles.pop();
      this.bobber.dip = 1;
      sh.x = this.bobber.x - 1;
      this.ripple(this.bobber.x, this.bobber.y, 6);
      this.audio.nibble();
    }
    if (this.stateT >= p.waitDur) this.triggerBite();
  }

  updateReel(dt) {
    const sp = this.hooked.species;
    const s = sp.strength;
    const gentle = this.settings.gentle;
    const g = gentle ? 0.7 : 1;
    const su = this.surge;

    if (su.phase === 'calm') {
      su.next -= dt;
      if (su.next <= 0) {
        su.phase = 'warn';
        su.t = 0.45;
        this.audio.surge();
        this.splash(this.bobber.x, this.bobber.y, 5);
        if (navigator.vibrate) navigator.vibrate(15);
      }
    } else if (su.phase === 'warn') {
      su.t -= dt;
      if (su.t <= 0) {
        su.phase = 'pull';
        su.t = 0.5 + this.rng() * 0.5 + s * 0.4;
      }
    } else {
      su.t -= dt;
      if (Math.random() < dt * 8) this.splash(this.bobber.x, this.bobber.y, 2);
      if (su.t <= 0) {
        su.phase = 'calm';
        su.next = (1.3 + this.rng() * 2) / (0.6 + s * 0.6);
      }
    }
    const pulling = su.phase === 'pull';

    if (this.holding) {
      this.tension += (0.42 + 0.3 * s + (pulling ? 1.25 * s + 0.35 : 0)) * g * dt;
      const gain = pulling ? 0.03 : (0.3 - 0.12 * s) * (this.tension > 0.92 ? 0.3 : 1);
      this.progress += gain * dt * (this.fast ? 1.6 : 1);
      this.audio.reelTick(this.tension);
    } else {
      this.tension -= 0.8 * dt;
      this.progress -= (pulling ? 0.1 + 0.1 * s : 0.025) * g * dt;
    }
    this.tension = clamp(this.tension, 0, 1);

    if (this.tension >= 1) {
      if (gentle) this.tension = 1;
      else return this.lose('The line snapped! Ease off when the line strains.', true);
    }
    if (this.tension > 0.8 && this.t - this.strainSaid > 4) {
      this.strainSaid = this.t;
      this.ui.alert('Line straining — let go!');
    }
    if (this.progress <= 0) return this.lose('It slipped the hook. Keep reeling between its runs.');
    if (this.progress >= 1) return this.startLanding();

    // The hooked fish is pulled from where it bit toward the dock.
    const from = this.hooked.from;
    const k = clamp(this.progress, 0, 1);
    const wig = Math.sin(this.t * (pulling ? 14 : 5)) * (pulling ? 3 : 1.5);
    this.bobber.x = lerp(from.x, REEL_END.x, k);
    this.bobber.y = lerp(from.y, REEL_END.y, k) + wig * 0.4;
    this.bobber.x += wig;
    const sh = this.hooked.shadow;
    sh.x = this.bobber.x + 3;
    sh.y = this.bobber.y + 1;
    this.rodTarget = ROD_WAIT + 0.15 + this.tension * 0.35 + (pulling ? 0.15 : 0);
    this.rodBend = 2 + this.tension * 7 + (pulling ? 2 : 0);
    this.rodShake = pulling ? 0.08 : su.phase === 'warn' ? 0.05 : 0;
    if (Math.random() < dt * 3) this.ripple(this.bobber.x, this.bobber.y, 6);
  }

  updateRod(dt) {
    const k = this.state === 'casting' ? 22 : 9;
    this.rodAngle += (this.rodTarget - this.rodAngle) * Math.min(1, dt * k);
    if (this.state !== 'reeling') {
      this.rodBend *= Math.max(0, 1 - dt * 6);
      this.rodShake = Math.max(0, this.rodShake - dt);
    }
  }

  updateBobber() {
    const b = this.bobber;
    if (this.state === 'casting' && this.cast.launched) return;
    if (!b.inWater) {
      const tip = this.rodTip();
      b.x = tip.x + Math.sin(this.t * 1.7) * 0.8;
      b.y = tip.y + 6;
    }
    b.dip = Math.max(0, b.dip - 0.08);
  }

  rodPoints(out = []) {
    const shake = this.rodShake > 0 && !this.settings.reducedMotion ? (Math.random() - 0.5) * this.rodShake : 0;
    const a = this.rodAngle + shake;
    const dx = Math.cos(a), dy = Math.sin(a);
    out.length = 0;
    for (let i = 0; i <= ROD_LEN; i++) {
      const s = i / ROD_LEN;
      const bend = this.rodBend * s * s;
      out.push({ x: HAND.x + dx * ROD_LEN * s - dy * bend, y: HAND.y + dy * ROD_LEN * s + dx * bend });
    }
    return out;
  }

  rodTip() {
    const a = this.rodAngle, dx = Math.cos(a), dy = Math.sin(a), b = this.rodBend;
    return { x: HAND.x + dx * ROD_LEN - dy * b, y: HAND.y + dy * ROD_LEN + dx * b };
  }

  // ------------------------------------------------------------- ambience
  makeShadow(species, x, y) {
    if (x === undefined) {
      do {
        x = (this.rng() * 2 - 1) * WATER.rx;
        y = WATER.y + (this.rng() * 2 - 1) * WATER.ry;
      } while (!inWater(x, y, 5));
    }
    const [rx, ry] = species.shadow;
    return { x, y, tx: x, ty: y, rx, ry, speed: 3 + this.rng() * 5, fade: 1, flee: 0, species };
  }

  newTarget(sh) {
    for (let i = 0; i < 12; i++) {
      const tx = sh.x + (this.rng() * 2 - 1) * 40, ty = sh.y + (this.rng() * 2 - 1) * 10;
      if (inWater(tx, ty, sh.rx + 3)) {
        sh.tx = tx;
        sh.ty = ty;
        return;
      }
    }
    sh.tx = WATER.x;
    sh.ty = WATER.y;
  }

  scare(x, y) {
    for (const sh of this.shadows) {
      if (sh.approach || sh.hooked) continue;
      const d = Math.hypot(sh.x - x, sh.y - y);
      if (d < 24) {
        const ang = Math.atan2(sh.y - y, sh.x - x);
        const tx = sh.x + Math.cos(ang) * 30, ty = sh.y + Math.sin(ang) * 8;
        if (inWater(tx, ty, sh.rx + 2)) {
          sh.tx = tx;
          sh.ty = ty;
        }
        sh.flee = 1;
      }
    }
  }

  updateShadows(dt) {
    for (let i = this.shadows.length - 1; i >= 0; i--) {
      const sh = this.shadows[i];
      if (sh.fading) {
        sh.fade -= dt * 0.8;
        if (sh.fade <= 0) {
          this.shadows.splice(i, 1);
          continue;
        }
      }
      if (sh.approach || sh.hooked) continue;
      const sp = sh.speed * (sh.flee > 0 ? 4 : 1);
      sh.flee = Math.max(0, sh.flee - dt);
      const dx = sh.tx - sh.x, dy = sh.ty - sh.y, d = Math.hypot(dx, dy);
      if (d < 1) this.newTarget(sh);
      else {
        sh.x += (dx / d) * Math.min(d, sp * dt);
        sh.y += (dy / d) * Math.min(d, sp * dt);
      }
    }
    // Keep a few fish drifting about.
    const ambient = this.shadows.filter((s) => !s.approach && !s.hooked && !s.fading).length;
    if (ambient < 3 && this.rng() < dt * 0.3) {
      const sh = this.makeShadow(SPECIES[Math.floor(this.rng() * 3)]);
      sh.fade = 0;
      sh.fadeIn = true;
      this.shadows.push(sh);
    }
    for (const sh of this.shadows) if (sh.fadeIn) {
      sh.fade = Math.min(1, sh.fade + dt * 0.5);
      if (sh.fade >= 1) sh.fadeIn = false;
    }
  }

  updateJumper(dt) {
    if (this.jumper) {
      const j = this.jumper;
      j.t += dt;
      if (j.t >= j.dur) {
        this.splash(j.x1, j.y, 4);
        this.ripple(j.x1, j.y, 7);
        this.audio.jump();
        this.jumper = null;
      }
      return;
    }
    if (this.state === 'reeling' || this.state === 'landing' || this.settings.reducedMotion) return;
    this.jumpIn -= dt;
    if (this.jumpIn > 0) return;
    this.jumpIn = 8 + this.rng() * 12;
    const x = (this.rng() * 2 - 1) * 50;
    const y = WATER.y + (this.rng() * 2 - 1) * waterHalfHeight(x, 6) * 0.6;
    const dir = this.rng() < 0.5 ? -1 : 1;
    const sp = SPECIES[this.rng() < 0.6 ? 0 : 2];
    this.jumper = { x0: x, x1: x + dir * 10, y, t: 0, dur: 0.7, dir, sprite: fishSprite(sp) };
    this.splash(x, y, 3);
    this.ripple(x, y, 5);
  }

  ripple(x, y, max) {
    this.ripples.push({ x, y, r: 1, max });
  }

  splash(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y: y - 1, vx: (this.rng() * 2 - 1) * 22, vy: -25 - this.rng() * 35,
        life: 0.5 + this.rng() * 0.35, color: this.rng() < 0.5 ? P.foam : P.waterLight, g: 140,
      });
    }
  }

  sparkle(x, y, n) {
    const colors = [P.star, P.visor, P.crystal];
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, sp = 15 + this.rng() * 25;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10,
        life: 0.6 + this.rng() * 0.5, color: colors[i % 3], g: 20,
      });
    }
  }

  say(text, x, y, color) {
    this.texts.push({ text, x, y, color, t: 0, life: 1.6 });
  }

  updateFx(dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.r += dt * 11;
      if (r.r > r.max) this.ripples.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > t.life) this.texts.splice(i, 1);
    }
  }

  /** Read-only summary for tests and debugging. */
  snapshot() {
    return {
      state: this.state, power: this.power, tension: this.tension, progress: this.progress,
      surge: this.surge.phase, holding: this.holding, total: this.store.total,
      species: this.hooked ? this.hooked.species.id : null,
    };
  }
}
