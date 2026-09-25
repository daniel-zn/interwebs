// Everything you hear is synthesised with WebAudio, so there are no audio files.
// The context starts on the first user gesture, as browsers require.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.beepIn = 0;
    this.crackleIn = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp).connect(c.destination);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startBeds();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get live() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  /** Two looping noise beds: rushing wind and the plasma roar. */
  startBeds() {
    const c = this.ctx;
    const bed = (type, freq, q) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { f, g };
    };
    this.wind = bed('bandpass', 500, 0.8);
    this.roar = bed('lowpass', 300, 0.9);
  }

  /**
   * Called every frame with the ride's state (or null when nothing is riding).
   * Moves the beds and runs the warning beeps and heat crackle.
   */
  tick(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const speed = s ? s.speed : 0, plasma = s ? s.plasma : 0, air = s ? s.air : 0;
    this.wind.g.gain.setTargetAtTime(s ? 0.05 + 0.2 * speed * (0.4 + 0.6 * air) : 0, now, 0.15);
    this.wind.f.frequency.setTargetAtTime(260 + 1100 * speed * (0.5 + 0.5 * air), now, 0.2);
    this.roar.g.gain.setTargetAtTime(s ? plasma * plasma * 0.5 : 0, now, 0.1);
    this.roar.f.frequency.setTargetAtTime(180 + 900 * plasma, now, 0.1);
    if (!s) return;

    this.crackleIn -= dt;
    if (plasma > 0.35 && this.crackleIn <= 0) {
      this.crackleIn = 0.02 + Math.random() * (0.25 - plasma * 0.2);
      this.noise({ dur: 0.02 + Math.random() * 0.03, vol: 0.03 + plasma * 0.07, type: 'highpass', freq: 2000 + Math.random() * 4000 });
    }
    this.beepIn -= dt;
    if (this.beepIn <= 0 && (s.warnHeat || s.warnSkip)) {
      if (s.warnHeat) {
        this.beepIn = 0.42;
        this.tone(880, { type: 'square', vol: 0.04, dur: 0.09, lp: 2600 });
        this.tone(660, { type: 'square', vol: 0.04, dur: 0.09, lp: 2600, delay: 0.14 });
      } else {
        this.beepIn = 0.55;
        this.tone(520, { type: 'triangle', vol: 0.07, dur: 0.18, slideTo: 1040 });
      }
    }
  }

  env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(freq, { type = 'sine', dur = 0.25, vol = 0.1, attack = 0.005, delay = 0, slideTo = null, lp = null } = {}) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this.env(g, t, vol, attack, dur);
    let node = o;
    if (lp) {
      const f = c.createBiquadFilter();
      f.frequency.value = lp;
      node = node.connect(f);
    }
    node.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.1, type = 'lowpass', freq = 1200, sweepTo = null, q = 0.7, delay = 0, attack = 0.01 } = {}) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, vol, attack, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // --- one-shots ---------------------------------------------------------------
  click() { this.tone(720, { type: 'square', vol: 0.025, dur: 0.05, lp: 2400 }); }
  dropIn() {
    this.noise({ dur: 0.7, vol: 0.12, type: 'bandpass', freq: 300, sweepTo: 1800, q: 1.5, attack: 0.2 });
    this.tone(196, { type: 'triangle', vol: 0.07, dur: 0.5, slideTo: 392 });
  }
  boost() {
    this.noise({ dur: 0.6, vol: 0.16, type: 'bandpass', freq: 420, sweepTo: 2600, q: 2, attack: 0.08 });
    this.tone(392, { type: 'triangle', vol: 0.05, dur: 0.3, slideTo: 784 });
  }
  hit() {
    this.noise({ dur: 0.35, vol: 0.3, freq: 900, sweepTo: 120 });
    this.tone(120, { type: 'square', vol: 0.12, dur: 0.25, slideTo: 50, lp: 600 });
  }
  coolant() {
    [987.77, 1318.51, 1760].forEach((f, i) => this.tone(f, { vol: 0.06, dur: 0.5, delay: i * 0.06 }));
    this.noise({ dur: 0.4, vol: 0.05, type: 'highpass', freq: 4000 });
  }
  popup() { this.tone(1046.5, { type: 'triangle', vol: 0.05, dur: 0.12 }); this.tone(1318.5, { type: 'triangle', vol: 0.05, dur: 0.16, delay: 0.07 }); }
  flow(level) { this.tone(440 * Math.pow(2, level / 6), { type: 'triangle', vol: 0.06, dur: 0.2, slideTo: 880 * Math.pow(2, level / 6) }); }
  flowLost() { this.tone(330, { type: 'triangle', vol: 0.05, dur: 0.3, slideTo: 165 }); }
  incoming() { this.tone(1567.98, { vol: 0.035, dur: 0.12 }); this.tone(1567.98, { vol: 0.03, dur: 0.12, delay: 0.16 }); }
  updraft() { this.noise({ dur: 0.9, vol: 0.12, type: 'bandpass', freq: 200, sweepTo: 900, q: 1, attack: 0.3 }); }
  burn() {
    this.noise({ dur: 1.8, vol: 0.45, freq: 3000, sweepTo: 80, attack: 0.02 });
    this.tone(90, { type: 'sawtooth', vol: 0.15, dur: 1.4, slideTo: 30, lp: 400 });
  }
  skipOut() {
    this.tone(180, { vol: 0.14, dur: 0.9, slideTo: 1400 });
    this.noise({ dur: 1.1, vol: 0.12, type: 'bandpass', freq: 1800, sweepTo: 200, q: 1.5 });
    this.tone(784, { type: 'triangle', vol: 0.05, dur: 0.4, delay: 0.5, slideTo: 392 });
  }
  chute() {
    this.noise({ dur: 0.12, vol: 0.2, type: 'bandpass', freq: 700, q: 1 });
    this.noise({ dur: 1.2, vol: 0.06, type: 'bandpass', freq: 300, q: 3, delay: 0.1 });
  }
  splash() {
    this.noise({ dur: 1.1, vol: 0.28, freq: 2400, sweepTo: 200 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, { type: 'triangle', vol: 0.07, dur: 0.6, delay: 0.5 + i * 0.12 }));
  }
}
