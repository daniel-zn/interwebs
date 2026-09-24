// Everything you hear is synthesised with WebAudio: no audio files to download.
const CHORDS = [
  [110.0, 164.81, 277.18], // A
  [92.5, 138.59, 220.0], // F#m
  [146.83, 220.0, 369.99], // D
  [123.47, 185.0, 311.13], // B-ish, drifting
];
const BELLS = [880, 987.77, 1108.73, 1318.51, 1479.98, 1760];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.twinkleIn = 3;
    this.chordIn = 14;
    this.chord = 0;
    this.lastTick = 0;
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
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp).connect(c.destination);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
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

  startAmbient() {
    const c = this.ctx;
    this.pad = c.createGain();
    this.pad.gain.value = 0;
    this.pad.gain.setTargetAtTime(0.045, c.currentTime, 3);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    filter.Q.value = 0.4;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    filter.connect(this.pad).connect(this.master);
    this.voices = CHORDS[0].flatMap((f) =>
      [-5, 5].map((cents) => {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(filter);
        o.start();
        return o;
      }),
    );
  }

  /** Called every frame: drifts the pad chord and sprinkles distant bells. */
  tick(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.chordIn -= dt;
    if (this.chordIn <= 0) {
      this.chordIn = 14 + Math.random() * 6;
      this.chord = (this.chord + 1) % CHORDS.length;
      const now = this.ctx.currentTime;
      this.voices.forEach((o, i) => o.frequency.setTargetAtTime(CHORDS[this.chord][i >> 1], now, 2.5));
    }
    this.twinkleIn -= dt;
    if (this.twinkleIn <= 0) {
      this.twinkleIn = 3 + Math.random() * 6;
      const f = BELLS[Math.floor(Math.random() * BELLS.length)];
      this.bell(f, 0.018 + Math.random() * 0.015);
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

  noise({ dur = 0.3, vol = 0.1, type = 'lowpass', freq = 1200, sweepTo = null, q = 0.7, delay = 0 } = {}) {
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
    this.env(g, t, vol, 0.01, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  bell(freq, vol = 0.05, delay = 0) {
    this.tone(freq, { vol, dur: 1.6, attack: 0.01, delay });
    this.tone(freq * 2.01, { vol: vol * 0.3, dur: 0.9, attack: 0.01, delay });
  }

  // --- Game sounds -----------------------------------------------------------
  click() { this.tone(720, { type: 'square', vol: 0.025, dur: 0.05, lp: 2400 }); }
  charge() { this.tone(220, { vol: 0.04, dur: 0.35, slideTo: 330 }); }
  cast() { this.noise({ dur: 0.35, vol: 0.12, type: 'bandpass', freq: 2400, sweepTo: 500, q: 1.2 }); }
  splash(size = 1) {
    this.noise({ dur: 0.25 + 0.2 * size, vol: 0.09 + 0.07 * size, freq: 1600, sweepTo: 300 });
    this.tone(200, { vol: 0.06 * size, dur: 0.15, slideTo: 90 });
  }
  nibble() { this.tone(560, { vol: 0.06, dur: 0.09, slideTo: 380 }); }
  bite() {
    this.tone(660, { type: 'triangle', vol: 0.14, dur: 0.18 });
    this.tone(990, { type: 'triangle', vol: 0.12, dur: 0.3, delay: 0.09 });
    this.splash(0.8);
  }
  hook() { this.tone(330, { type: 'triangle', vol: 0.08, dur: 0.12, slideTo: 440 }); }
  reelTick(tension) {
    const now = performance.now();
    if (now - this.lastTick < 70) return;
    this.lastTick = now;
    this.tone(1500 + tension * 900, { type: 'square', vol: 0.018, dur: 0.02, lp: 3000 });
  }
  surge() { this.tone(110, { type: 'sawtooth', vol: 0.06, dur: 0.3, lp: 500, slideTo: 80 }); this.splash(0.5); }
  snap() {
    this.tone(900, { type: 'sawtooth', vol: 0.09, dur: 0.3, slideTo: 110, lp: 2000 });
    this.noise({ dur: 0.08, vol: 0.08, type: 'highpass', freq: 3000 });
  }
  escape() {
    this.tone(392, { vol: 0.07, dur: 0.25 });
    this.tone(330, { vol: 0.07, dur: 0.4, delay: 0.18 });
  }
  reelIn() { this.noise({ dur: 0.25, vol: 0.04, type: 'bandpass', freq: 900, sweepTo: 1800, q: 2 }); }
  jump() { this.splash(0.25); }
  caught(isNew) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, 0.06, i * 0.09));
    if (isNew) [1318.51, 1567.98].forEach((f, i) => this.bell(f, 0.05, 0.4 + i * 0.12));
  }
}
