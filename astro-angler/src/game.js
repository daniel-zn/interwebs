// The fishing loop as a small, DOM-free state machine.
// Inputs: press(), release(), update(dt). Outputs: readable state + events.
//
// Lake coordinates: the lake is the unit disc; u runs left→right, v back→front.
// The dock (and the angler) sit at the left shore.

import { pickSpecies, rollSize } from './fish.js';

export const S = {
  TITLE: 'title', IDLE: 'idle', CHARGE: 'charge', CAST: 'cast', WAIT: 'wait',
  BITE: 'bite', REEL: 'reel', LAND: 'land', CAUGHT: 'caught', LOST: 'lost',
};

export const DOCK = { u: -0.86, v: 0.12 };
export const CHARGE_PERIOD = 1.5; // seconds for the meter to rise 0→1
const rand = (rng, a, b) => a + (b - a) * rng();
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export class Game {
  constructor({ rng = Math.random, relaxed = false, onEvent = () => {} } = {}) {
    this.rng = rng;
    this.relaxed = relaxed;
    this.emit = onEvent;
    this.state = S.TITLE;
    this.st = 0; // seconds in current state
    this.time = 0;
    this.held = false;
    this.power = 0;
    this.target = { u: 0, v: 0 };
    this.fish = null; // the fish currently interested in the bobber
    this.reel = null;
    this.dip = 0; // bobber nibble dip 0..1
    this.casts = 0;
    this.lastCatch = null;
    this.message = '';
  }

  set(state) {
    this.state = state;
    this.st = 0;
  }

  get biteWindow() { return this.relaxed ? 2.0 : 1.1; }

  press() {
    this.held = true;
    switch (this.state) {
      case S.TITLE:
        this.set(S.IDLE);
        this.emit('start');
        break;
      case S.IDLE:
        this.power = 0;
        this.set(S.CHARGE);
        this.emit('charge');
        break;
      case S.WAIT:
        if (this.fish && this.fish.phase === 'nibble') {
          if (this.relaxed) { this.emit('patience'); break; }
          this.fish.phase = 'flee';
          this.fish.fleeT = 0;
          this.waitTimer = rand(this.rng, 3, 6);
          this.emit('spook');
        } else {
          this.fish = null;
          this.set(S.IDLE);
          this.emit('reelIn');
        }
        break;
      case S.BITE:
        this.hook();
        break;
      case S.CAUGHT:
        if (this.st > 0.4) {
          this.set(S.IDLE);
          this.emit('release', this.lastCatch);
        }
        break;
      case S.LOST:
        if (this.st > 0.5) this.set(S.IDLE);
        break;
    }
  }

  release() {
    this.held = false;
    if (this.state === S.CHARGE) this.cast();
  }

  cast() {
    const p = this.power;
    this.target = { u: -0.62 + p * 1.42, v: rand(this.rng, -0.35, 0.35) * (0.4 + 0.6 * p) };
    this.flight = 0.75 + p * 0.55;
    this.casts += 1;
    this.fish = null;
    this.set(S.CAST);
    this.emit('cast', { power: p });
  }

  hook() {
    const f = this.fish;
    this.reel = {
      progress: 0.22,
      tension: 0.15,
      surge: 0, // seconds left in the current surge
      nextSurge: rand(this.rng, 1.2, 2.6),
      slack: 0,
    };
    f.phase = 'hooked';
    this.set(S.REEL);
    this.emit('hook', f);
  }

  spawnFish() {
    const distance = clamp01((this.target.u + 0.62) / 1.42);
    const species = pickSpecies(this.rng, distance);
    const ang = rand(this.rng, 0, Math.PI * 2);
    let u = this.target.u + Math.cos(ang) * 0.55;
    let v = this.target.v + Math.sin(ang) * 0.55;
    const d = Math.hypot(u, v);
    if (d > 0.85) { u *= 0.85 / d; v *= 0.85 / d; }
    this.fish = {
      species,
      size: rollSize(this.rng, species),
      u, v,
      phase: 'approach',
      nibbles: Math.floor(rand(this.rng, 0, 3)),
      timer: 0,
      heading: 1,
      fleeT: 0,
      speed: 0.16 + 0.08 * this.rng(),
    };
    this.emit('approach', this.fish);
  }

  update(dt) {
    this.time += dt;
    this.st += dt;
    this.dip = Math.max(0, this.dip - dt * 3);
    const f = this.fish;

    switch (this.state) {
      case S.CHARGE: {
        const k = (this.st / CHARGE_PERIOD) % 2;
        this.power = k <= 1 ? k : 2 - k;
        break;
      }
      case S.CAST:
        if (this.st >= this.flight) {
          this.set(S.WAIT);
          // The very first cast gets a quick visitor so the loop is learnt fast.
          this.waitTimer = this.casts === 1 ? 1.6 : rand(this.rng, 2.5, 6.5);
          this.emit('splash', this.target);
        }
        break;
      case S.WAIT:
        if (!f) {
          this.waitTimer -= dt;
          if (this.waitTimer <= 0) this.spawnFish();
        } else if (f.phase === 'approach') {
          const dx = this.target.u - f.u, dy = this.target.v - f.v;
          const d = Math.hypot(dx, dy);
          if (Math.abs(dx) > 0.01) f.heading = Math.sign(dx);
          if (d < 0.06) {
            f.phase = 'nibble';
            f.timer = rand(this.rng, 0.5, 1.2);
          } else {
            const step = Math.min(d, f.speed * dt * (0.4 + Math.min(1, d * 3)));
            f.u += (dx / d) * step;
            f.v += (dy / d) * step;
          }
        } else if (f.phase === 'nibble') {
          f.timer -= dt;
          if (f.timer <= 0) {
            if (f.nibbles > 0) {
              f.nibbles -= 1;
              this.dip = 1;
              f.timer = rand(this.rng, 0.8, 1.6);
              this.emit('nibble');
            } else {
              this.set(S.BITE);
              this.emit('bite', f);
            }
          }
        } else if (f.phase === 'flee') {
          f.fleeT += dt;
          f.u -= f.heading * dt * 0.5;
          if (f.fleeT > 1.4) this.fish = null;
        }
        break;
      case S.BITE:
        if (this.st > this.biteWindow) {
          f.phase = 'flee';
          f.fleeT = 0;
          this.waitTimer = rand(this.rng, 3, 6);
          this.set(S.WAIT);
          this.emit('miss');
        }
        break;
      case S.REEL:
        this.updateReel(dt);
        break;
      case S.LOST:
        if (f) {
          f.fleeT += dt;
          f.u += dt * 0.4;
          if (f.fleeT > 1.4) this.fish = null;
        }
        if (this.st > 1.8) this.set(S.IDLE);
        break;
      case S.LAND:
        if (this.st > 1.3) {
          this.set(S.CAUGHT);
          this.emit('caught', this.lastCatch);
        }
        break;
    }
  }

  updateReel(dt) {
    const r = this.reel, f = this.fish;
    const str = f.species.strength;
    // Surges: the fish pulls hard for a moment. Ease off or the line strains.
    if (r.surge > 0) {
      r.surge -= dt;
    } else {
      r.nextSurge -= dt;
      if (r.nextSurge <= 0) {
        r.surge = rand(this.rng, 0.5, 0.8 + 0.5 * str);
        r.nextSurge = rand(this.rng, 1.4, 3.2 - str * 1.2);
        this.emit('surge');
      }
    }
    const surging = r.surge > 0;
    if (this.held) {
      const gain = (0.24 - 0.11 * str) * (surging ? 0.2 : 1) * (r.tension > 0.9 && this.relaxed ? 0.35 : 1);
      r.progress += gain * dt;
      r.tension += (0.18 + 0.36 * str + (surging ? 0.75 + str * 0.4 : 0)) * dt;
    } else {
      r.tension -= 0.6 * dt;
      r.progress -= (surging ? 0.07 + 0.05 * str : 0.012) * dt;
    }
    r.tension = clamp01(r.tension);
    if (this.relaxed) r.tension = Math.min(r.tension, 0.97);

    // The hooked fish is dragged along the line toward the dock.
    const p = clamp01(r.progress);
    const wob = Math.sin(this.time * (surging ? 14 : 5)) * (surging ? 0.06 : 0.025);
    f.u = this.target.u + (DOCK.u + 0.12 - this.target.u) * p;
    f.v = this.target.v + (DOCK.v - this.target.v) * p + wob;
    f.heading = surging ? 1 : -1;

    if (r.tension >= 1) {
      this.lose('snap');
    } else if (r.progress <= 0) {
      this.lose('escape');
    } else if (r.progress >= 1) {
      this.lastCatch = { species: f.species, size: f.size };
      this.set(S.LAND);
      this.emit('land', this.lastCatch);
    }
  }

  lose(kind) {
    const f = this.fish;
    f.phase = 'flee';
    f.fleeT = 0;
    this.set(S.LOST);
    this.lostKind = kind;
    this.emit(kind, f);
  }
}
