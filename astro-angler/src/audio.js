// All sound is synthesised with WebAudio: no audio files to download.
// A soft drone + sparse pentatonic chimes for ambience, small blips for events.

const PENTA = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98]; // D major pentatonic

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.nextChime = 2;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 1 : 0;
    this.music.connect(this.master);
    // A feedback delay gives everything a little "big empty space" tail.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.38;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 2200;
    this.echo.connect(echoLp).connect(fb).connect(this.echo);
    echoLp.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startDrone();
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.3);
  }
  suspend() { this.ctx?.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  startDrone() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.gain.setTargetAtTime(0.045, ctx.currentTime, 3);
    lp.connect(g).connect(this.music);
    for (const [f, det] of [[73.42, -4], [110, 3], [146.83, 6]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start();
    }
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
  }

  /** Called every frame; schedules ambient chimes. */
  tick(dt) {
    if (!this.ctx || !this.musicOn) return;
    this.nextChime -= dt;
    if (this.nextChime <= 0) {
      this.nextChime = 2.5 + Math.random() * 5;
      const f = PENTA[Math.floor(Math.random() * PENTA.length)];
      this.tone(f, 2.2, { vol: 0.035, bus: this.music, echo: 0.6 });
      if (Math.random() < 0.35) this.tone(f * 1.5, 1.8, { vol: 0.02, bus: this.music, delay: 0.18, echo: 0.6 });
    }
  }

  tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, slide = 0, attack = 0.006, bus = this.sfx, echo = 0.25 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    if (echo) {
      const s = ctx.createGain();
      s.gain.value = echo;
      g.connect(s).connect(this.echo);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.2, freq = 1200, q = 0.8, type = 'lowpass', slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name, arg) {
    if (!this.ctx) return;
    switch (name) {
      case 'start': this.tone(587, 0.5, { vol: 0.08 }); this.tone(880, 0.8, { vol: 0.07, delay: 0.12 }); break;
      case 'charge': this.tone(330, 0.18, { type: 'triangle', vol: 0.05, slide: 1.4, echo: 0 }); break;
      case 'cast': this.noise(0.35, { vol: 0.12, freq: 900, type: 'bandpass', slide: 3, q: 1.4 }); this.tone(520 + arg * 300, 0.25, { type: 'triangle', vol: 0.04, slide: 1.6 }); break;
      case 'splash': this.noise(0.28, { vol: 0.16, freq: 1600, slide: 0.3 }); this.tone(240, 0.2, { vol: 0.06, slide: 0.5 }); break;
      case 'nibble': this.tone(1320, 0.07, { type: 'triangle', vol: 0.05, echo: 0.1 }); break;
      case 'bite': this.noise(0.18, { vol: 0.14, freq: 2200, slide: 0.4 }); this.tone(880, 0.12, { type: 'square', vol: 0.05 }); this.tone(1174, 0.25, { type: 'square', vol: 0.05, delay: 0.1 }); break;
      case 'hook': this.tone(440, 0.12, { type: 'triangle', vol: 0.1, slide: 2 }); break;
      case 'tick': this.tone(1900 + Math.random() * 200, 0.025, { type: 'square', vol: 0.018, echo: 0 }); break;
      case 'strain': this.tone(92, 0.2, { type: 'sawtooth', vol: 0.03, slide: 1.1, echo: 0 }); break;
      case 'surge': this.noise(0.25, { vol: 0.1, freq: 700, slide: 2 }); break;
      case 'snap': this.noise(0.12, { vol: 0.3, freq: 4000, type: 'highpass' }); this.tone(660, 0.5, { type: 'triangle', vol: 0.08, slide: 0.25 }); break;
      case 'escape': this.tone(523, 0.3, { vol: 0.06, slide: 0.7 }); this.tone(392, 0.5, { vol: 0.06, delay: 0.2, slide: 0.8 }); break;
      case 'miss': this.tone(392, 0.4, { vol: 0.05, slide: 0.8 }); break;
      case 'land': this.noise(0.4, { vol: 0.16, freq: 1400, slide: 0.4 }); break;
      case 'caught': {
        const notes = arg ? [587, 740, 880, 1175, 1480] : [587, 740, 880, 1175];
        notes.forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', vol: 0.07, delay: i * 0.09, echo: 0.4 }));
        break;
      }
      case 'release': [1480, 1175, 1760].forEach((f, i) => this.tone(f, 0.9, { vol: 0.04, delay: i * 0.14, echo: 0.6 })); break;
      case 'ui': this.tone(988, 0.06, { type: 'triangle', vol: 0.04, echo: 0 }); break;
    }
  }
}
