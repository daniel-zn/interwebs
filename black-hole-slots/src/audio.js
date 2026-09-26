// Every sound is synthesised with WebAudio: no audio files. The context starts
// on the first user gesture, as browsers require.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
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
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(c.destination);
      const len = c.sampleRate * 0.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // The black hole's hum: two detuned low sines, always there.
      this.hum = c.createGain();
      this.hum.gain.value = 0;
      this.hum.connect(this.master);
      for (const f of [41, 41.7]) {
        const o = c.createOscillator();
        o.frequency.value = f;
        o.connect(this.hum);
        o.start();
      }
      // A voice for the rising tease tone.
      this.teaseOsc = c.createOscillator();
      this.teaseOsc.type = 'sawtooth';
      this.teaseGain = c.createGain();
      this.teaseGain.gain.value = 0;
      this.teaseOsc.connect(this.teaseGain).connect(this.master);
      this.teaseOsc.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
  }

  get live() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** How hungry the hole sounds (0..1). */
  setHum(level) {
    if (!this.ctx) return;
    this.hum.gain.setTargetAtTime(0.05 + level * 0.12, this.ctx.currentTime, 0.4);
  }

  setTease(on, pitch = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.teaseGain.gain.setTargetAtTime(on ? 0.025 : 0, t, 0.03);
    if (on) this.teaseOsc.frequency.setTargetAtTime(220 + pitch * 660, t, 0.05);
  }

  tone(freq, dur, { type = 'square', vol = 0.1, at = 0, slide = null, attack = 0.004 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, at = 0, freq = 2000, q = 1, type = 'bandpass', slide = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(event, arg = 0) {
    if (!this.live) return;
    switch (event) {
      case 'lever':
        this.noise(0.08, { vol: 0.25, freq: 900, q: 2 });
        this.tone(140, 0.12, { type: 'triangle', vol: 0.25, slide: 70 });
        this.tone(1200, 0.03, { vol: 0.05, at: 0.12 });
        break;
      case 'tick':
        this.noise(0.02, { vol: 0.06, freq: 3000 + Math.random() * 1500, q: 6 });
        break;
      case 'stop':
        this.tone(170 - arg * 12, 0.09, { type: 'triangle', vol: 0.3, slide: 60 });
        this.noise(0.04, { vol: 0.12, freq: 1800, q: 3 });
        break;
      case 'voidland':
        this.tone(90, 0.4, { type: 'sawtooth', vol: 0.08, slide: 45 });
        break;
      case 'line': {
        const notes = [523, 587, 659, 784, 880, 988, 1047, 1175, 1319, 1568];
        const f = notes[Math.min(arg, notes.length - 1)];
        this.tone(f, 0.09, { vol: 0.08 });
        this.tone(f * 1.5, 0.12, { vol: 0.06, at: 0.06 });
        this.tone(f * 2, 0.18, { type: 'triangle', vol: 0.08, at: 0.1 });
        break;
      }
      case 'mult':
        this.tone(300, 0.35, { type: 'sawtooth', vol: 0.06, slide: 1400 });
        this.tone(1400, 0.2, { vol: 0.05, at: 0.3 });
        break;
      case 'coin':
        this.tone(1900 + Math.random() * 500, 0.05, { vol: 0.04 });
        this.tone(2800 + Math.random() * 500, 0.06, { vol: 0.03, at: 0.03 });
        break;
      case 'bigwin': {
        const seq = [523, 659, 784, 1047, 784, 1047, 1319];
        seq.forEach((f, i) => {
          this.tone(f, 0.14, { vol: 0.07, at: i * 0.09 });
          this.tone(f / 2, 0.14, { type: 'triangle', vol: 0.12, at: i * 0.09 });
        });
        break;
      }
      case 'jackpot': {
        for (let i = 0; i < 16; i++) {
          const f = [1047, 1319, 1568, 2093][i % 4];
          this.tone(f, 0.1, { vol: 0.06, at: i * 0.07 });
        }
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 1.2, { type: 'triangle', vol: 0.1, at: 1.1 + i * 0.02 }));
        this.noise(1.5, { vol: 0.08, freq: 6000, q: 0.5, at: 1.1 });
        break;
      }
      case 'void':
        this.tone(110, 1.4, { type: 'sawtooth', vol: 0.18, slide: 30 });
        this.tone(116, 1.4, { type: 'square', vol: 0.08, slide: 28 });
        this.noise(1.2, { vol: 0.3, freq: 800, q: 0.7, slide: 80 });
        break;
      case 'lose':
        this.tone(220, 0.12, { type: 'triangle', vol: 0.08, slide: 180 });
        break;
      case 'buy':
        [784, 1047, 1319].forEach((f, i) => this.tone(f, 0.08, { vol: 0.07, at: i * 0.05 }));
        break;
      case 'sell':
        [1319, 1047, 784].forEach((f, i) => this.tone(f, 0.08, { vol: 0.06, at: i * 0.05 }));
        break;
      case 'arm':
        this.tone(660, 0.06, { vol: 0.06 });
        break;
      case 'nope':
        this.tone(110, 0.16, { type: 'square', vol: 0.08 });
        this.tone(104, 0.16, { type: 'square', vol: 0.08 });
        break;
      case 'move':
        this.tone(1320, 0.025, { vol: 0.03 });
        break;
      case 'reroll':
        for (let i = 0; i < 6; i++) this.tone(600 + i * 150, 0.04, { vol: 0.05, at: i * 0.035 });
        break;
      case 'pay':
        this.noise(0.1, { vol: 0.2, freq: 5000, q: 1 });
        this.tone(1568, 0.08, { vol: 0.08, at: 0.05 });
        this.tone(2093, 0.3, { vol: 0.08, at: 0.12 });
        this.tone(80, 0.8, { type: 'sawtooth', vol: 0.1, slide: 30, at: 0.1 });
        break;
      case 'transmit':
        for (let i = 0; i < 8; i++) this.tone(900 + (i % 3) * 300, 0.03, { vol: 0.04, at: i * 0.06 });
        this.noise(0.5, { vol: 0.05, freq: 3000, q: 0.5 });
        break;
      case 'bless':
        [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.1, at: i * 0.07 }));
        break;
      case 'day':
        [784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, { vol: 0.06, at: i * 0.1 }));
        break;
      case 'deadline':
        [392, 370, 349, 330].forEach((f, i) => this.tone(f, 0.2, { type: 'sawtooth', vol: 0.06, at: i * 0.2 }));
        break;
      case 'swallow':
        this.tone(400, 2.4, { type: 'sawtooth', vol: 0.12, slide: 25 });
        this.tone(410, 2.4, { type: 'square', vol: 0.05, slide: 22 });
        this.noise(2.6, { vol: 0.25, freq: 3000, q: 0.6, slide: 60 });
        break;
      case 'won': {
        const seq = [523, 659, 784, 1047, 0, 784, 1047, 1319, 1568];
        seq.forEach((f, i) => f && this.tone(f, 0.22, { vol: 0.07, at: i * 0.13 }));
        seq.forEach((f, i) => f && this.tone(f / 2, 0.22, { type: 'triangle', vol: 0.12, at: i * 0.13 }));
        break;
      }
      case 'free':
        this.tone(400, 0.3, { type: 'sine', vol: 0.12, slide: 1600 });
        break;
      default:
    }
  }
}
