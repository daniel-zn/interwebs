// Every sound is synthesised with WebAudio: no audio files. The context starts
// on the first user gesture, as browsers require.
//
// Three always-on voices (the black hole's hum, the reel motor and the tease
// tone), a little space-lounge music loop that gets busier while you win, and
// a big bag of one-shot effects.

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
// Am - F - C - G, one bar each: root (MIDI) and the arpeggio's chord tones.
const CHORDS = [
  { root: 45, tones: [57, 60, 64, 69] },
  { root: 41, tones: [53, 57, 60, 65] },
  { root: 48, tones: [55, 60, 64, 67] },
  { root: 43, tones: [55, 59, 62, 67] },
];
const BASS = [0, null, 0, 12, null, 0, 7, null, 0, null, 0, 12, null, 7, 10, 12];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 2];

// Phones only let sound start inside a finished tap (touchend, pointerup,
// click) or a key press, never on pointerdown or touchstart. So the engine
// listens for those on the whole page, whatever the game's own handlers do.
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'];
function listenForGestures(engine) {
  const wake = () => engine.unlock();
  for (const type of GESTURES) window.addEventListener(type, wake, { capture: true, passive: true });
  // iOS: use the media "playback" session so the ring/silent switch doesn't mute the game.
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // Not supported: nothing to do.
  }
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.held = false; // paused on purpose: gestures must not restart it
    listenForGestures(this);
    this.muted = false;
    this.musicOn = true;
    this.heat = 0;
    this.nextStep = 0;
    this.step = 0;
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
      // A gentle compressor keeps the loud moments from clipping.
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.fx = c.createGain();
      this.fx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = this.musicOn ? 0.32 : 0;
      this.music.connect(this.master);

      const len = c.sampleRate * 0.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // The black hole's hum: two detuned low sines, always there.
      this.hum = c.createGain();
      this.hum.gain.value = 0;
      this.hum.connect(this.fx);
      for (const f of [41, 41.7]) {
        const o = c.createOscillator();
        o.frequency.value = f;
        o.connect(this.hum);
        o.start();
      }
      // The reel motor: a filtered sawtooth that whirs while reels turn.
      this.motor = c.createOscillator();
      this.motor.type = 'sawtooth';
      this.motor.frequency.value = 60;
      const mf = c.createBiquadFilter();
      mf.type = 'lowpass';
      mf.frequency.value = 500;
      this.motorGain = c.createGain();
      this.motorGain.gain.value = 0;
      this.motor.connect(mf).connect(this.motorGain).connect(this.fx);
      this.motor.start();
      // A voice for the rising tease tone.
      this.teaseOsc = c.createOscillator();
      this.teaseOsc.type = 'sawtooth';
      this.teaseGain = c.createGain();
      this.teaseGain.gain.value = 0;
      this.teaseOsc.connect(this.teaseGain).connect(this.fx);
      this.teaseOsc.start();
      this.nextStep = c.currentTime + 0.1;
    }
    this.wake();
  }

  /** (Re)starts the context. Only works inside a user gesture on phones. */
  wake() {
    const c = this.ctx;
    if (!c || this.held) return;
    // iOS can also leave it 'interrupted' after a call or an app switch.
    if (c.state !== 'running') c.resume().catch(() => {});
    // Older iOS only truly unlocks once a sound starts inside the gesture.
    try {
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination);
      s.start(0);
    } catch {
      // Ignore: the context may be closing.
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1);
  }

  get live() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** How hungry the hole sounds (0..1). */
  setHum(level) {
    if (!this.ctx) return;
    this.hum.gain.setTargetAtTime(0.05 + level * 0.12, this.ctx.currentTime, 0.4);
  }

  /** Reel motor: 0 when still, up to 1 with every reel racing. */
  setMotor(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.motorGain.gain.setTargetAtTime(level * 0.045, t, 0.05);
    this.motor.frequency.setTargetAtTime(45 + level * 70, t, 0.08);
  }

  setTease(on, pitch = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.teaseGain.gain.setTargetAtTime(on ? 0.025 : 0, t, 0.03);
    if (on) this.teaseOsc.frequency.setTargetAtTime(220 + pitch * 660, t, 0.05);
  }

  /** How excited the music is (0 calm .. 1 frantic). */
  setHeat(h) {
    this.heat = Math.max(0, Math.min(1, h));
  }

  // ---------------------------------------------------------------- music
  /** Call every frame: schedules the next bit of the loop ahead of time. */
  update() {
    if (!this.live || !this.musicOn || this.muted) {
      if (this.ctx) this.nextStep = Math.max(this.nextStep, this.ctx.currentTime + 0.05);
      return;
    }
    const c = this.ctx;
    const heat = this.heat;
    const bpm = 112 + heat * 36;
    const stepDur = 60 / bpm / 4;
    if (this.nextStep < c.currentTime - 0.2) this.nextStep = c.currentTime + 0.05;
    while (this.nextStep < c.currentTime + 0.15) {
      const at = this.nextStep - c.currentTime;
      const s = this.step % 16;
      const chord = CHORDS[Math.floor(this.step / 16) % CHORDS.length];
      const b = BASS[s];
      if (b !== null) this.tone(NOTE(chord.root + b), stepDur * 0.9, { type: 'triangle', vol: 0.22, at, out: this.music });
      if (s % 2 === 0 || heat > 0.4) {
        const n = chord.tones[ARP[s]] + (heat > 0.7 && s % 4 === 2 ? 12 : 0);
        this.tone(NOTE(n + 12), stepDur * 0.6, { type: 'square', vol: 0.035 + heat * 0.02, at, out: this.music });
      }
      if (s % 4 === 0) this.kick(at);
      if (s % 4 === 2 || (heat > 0.3 && s % 2 === 1)) this.noise(0.03, { vol: 0.05 + heat * 0.04, at, freq: 8000, q: 1, type: 'highpass', out: this.music });
      if (s === 4 || s === 12) this.noise(0.12, { vol: 0.08 + heat * 0.05, at, freq: 1800, q: 0.8, out: this.music });
      // A sparkly counter-melody when things are hot.
      if (heat > 0.55 && s % 8 === 7) this.tone(NOTE(chord.tones[3] + 24), stepDur * 2, { type: 'triangle', vol: 0.05, at, out: this.music });
      this.nextStep += stepDur;
      this.step++;
    }
  }

  kick(at) {
    this.tone(150, 0.14, { type: 'sine', vol: 0.3, at, slide: 45, out: this.music });
  }

  // ---------------------------------------------------------------- building blocks
  tone(freq, dur, { type = 'square', vol = 0.1, at = 0, slide = null, attack = 0.004, out = null, vibrato = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + Math.max(0, at);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    if (vibrato) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = vibrato;
      lg.gain.value = freq * 0.03;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(out || this.fx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, at = 0, freq = 2000, q = 1, type = 'bandpass', slide = null, out = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + Math.max(0, at);
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
    s.connect(f).connect(g).connect(out || this.fx);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  bell(freq, at = 0, vol = 0.07, dur = 0.6) {
    // Inharmonic partials make a metallic ding.
    for (const [k, v] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12]]) {
      this.tone(freq * k, dur / k ** 0.3, { type: 'sine', vol: vol * v, at, attack: 0.002 });
    }
  }

  // ---------------------------------------------------------------- one-shots
  play(event, arg = 0) {
    if (!this.live) return;
    switch (event) {
      case 'lever':
        // Ratchet clicks on the way down, then the clunk.
        for (let i = 0; i < 5; i++) this.noise(0.02, { vol: 0.14, freq: 2600 + i * 200, q: 8, at: i * 0.025 });
        this.noise(0.08, { vol: 0.25, freq: 900, q: 2, at: 0.12 });
        this.tone(140, 0.12, { type: 'triangle', vol: 0.25, slide: 70, at: 0.12 });
        // And the spring back up.
        this.tone(220, 0.25, { type: 'sine', vol: 0.06, slide: 520, at: 0.22, vibrato: 18 });
        break;
      case 'button':
        this.tone(900, 0.03, { vol: 0.06 });
        this.noise(0.03, { vol: 0.08, freq: 3000, q: 3 });
        break;
      case 'spinStart':
        this.noise(0.35, { vol: 0.12, freq: 400, q: 0.7, slide: 3000 });
        this.tone(200, 0.3, { type: 'sawtooth', vol: 0.04, slide: 600 });
        break;
      case 'tick':
        this.noise(0.02, { vol: 0.06, freq: 3000 + Math.random() * 1500, q: 6 });
        break;
      case 'stop':
        // Each reel lands a little higher.
        this.tone(170 - arg * 12, 0.09, { type: 'triangle', vol: 0.3, slide: 60 });
        this.noise(0.04, { vol: 0.12, freq: 1800, q: 3 });
        this.tone(660 + arg * 110, 0.05, { vol: 0.04, at: 0.02 });
        break;
      case 'bigstop':
        this.tone(90, 0.4, { type: 'sine', vol: 0.4, slide: 35 });
        this.noise(0.25, { vol: 0.25, freq: 300, q: 0.8 });
        this.bell(880, 0.03, 0.06);
        break;
      case 'heart':
        this.tone(70, 0.12, { type: 'sine', vol: 0.35, slide: 40 });
        this.tone(64, 0.12, { type: 'sine', vol: 0.25, slide: 38, at: 0.16 });
        break;
      case 'voidland':
        this.tone(90, 0.4, { type: 'sawtooth', vol: 0.08, slide: 45 });
        this.tone(1800, 0.15, { type: 'sine', vol: 0.03, slide: 900, vibrato: 30 });
        break;
      case 'line': {
        const notes = [523, 587, 659, 784, 880, 988, 1047, 1175, 1319, 1568, 1760, 2093];
        const f = notes[Math.min(arg, notes.length - 1)];
        this.tone(f, 0.09, { vol: 0.08 });
        this.tone(f * 1.5, 0.12, { vol: 0.06, at: 0.06 });
        this.tone(f * 2, 0.18, { type: 'triangle', vol: 0.08, at: 0.1 });
        this.noise(0.06, { vol: 0.05, freq: 7000, q: 1, at: 0.02 });
        break;
      }
      case 'sym':
        this.symbol(arg);
        break;
      case 'mult':
        this.tone(300, 0.35, { type: 'sawtooth', vol: 0.06, slide: 1400 });
        this.tone(1400, 0.2, { vol: 0.05, at: 0.3 });
        this.bell(1760, 0.32, 0.05);
        break;
      case 'coin':
        this.tone(1900 + Math.random() * 500, 0.05, { vol: 0.04 });
        this.tone(2800 + Math.random() * 500, 0.06, { vol: 0.03, at: 0.03 });
        break;
      case 'shower':
        // A cascade of coins spilling into the tray.
        for (let i = 0; i < 14 + arg * 10; i++) {
          const at = Math.random() * (0.6 + arg * 0.5);
          this.tone(1800 + Math.random() * 1400, 0.05, { vol: 0.025, at });
          this.noise(0.03, { vol: 0.03, freq: 5000 + Math.random() * 2000, q: 4, at });
        }
        break;
      case 'count':
        this.tone(1200 + arg * 30, 0.025, { vol: 0.03 });
        break;
      case 'siren':
        // A slot-machine alarm; `arg` is how many whoops.
        for (let i = 0; i < arg; i++) {
          this.tone(600, 0.35, { type: 'square', vol: 0.04, slide: 1300, at: i * 0.38 });
          this.tone(605, 0.35, { type: 'sawtooth', vol: 0.025, slide: 1310, at: i * 0.38 });
        }
        break;
      case 'bigwin': {
        const seq = [523, 659, 784, 1047, 784, 1047, 1319];
        seq.forEach((f, i) => {
          this.tone(f, 0.14, { vol: 0.07, at: i * 0.09 });
          this.tone(f / 2, 0.14, { type: 'triangle', vol: 0.12, at: i * 0.09 });
        });
        [1047, 1319, 1568].forEach((f, i) => this.bell(f, 0.65 + i * 0.08, 0.05));
        break;
      }
      case 'megawin': {
        const seq = [392, 523, 659, 784, 1047, 1319, 1568, 2093];
        seq.forEach((f, i) => {
          this.tone(f, 0.12, { vol: 0.07, at: i * 0.07 });
          this.tone(f / 2, 0.12, { type: 'sawtooth', vol: 0.05, at: i * 0.07 });
        });
        [523, 659, 784, 1047].forEach((f) => this.tone(f, 1.0, { type: 'triangle', vol: 0.08, at: 0.6, vibrato: 6 }));
        for (let i = 0; i < 8; i++) this.bell(1568 + (i % 3) * 262, 0.6 + i * 0.09, 0.04);
        break;
      }
      case 'jackpot': {
        for (let i = 0; i < 20; i++) {
          const f = [1047, 1319, 1568, 2093][i % 4];
          this.bell(f, i * 0.06, 0.04, 0.4);
        }
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 1.6, { type: 'triangle', vol: 0.1, at: 1.2 + i * 0.02, vibrato: 5 }));
        [262, 330, 392].forEach((f) => this.tone(f, 1.6, { type: 'sawtooth', vol: 0.03, at: 1.2 }));
        this.noise(1.5, { vol: 0.08, freq: 6000, q: 0.5, at: 1.2 });
        break;
      }
      case 'firework':
        this.noise(0.08, { vol: 0.12, freq: 600, q: 0.8 });
        for (let i = 0; i < 8; i++) this.noise(0.02, { vol: 0.05, freq: 4000 + Math.random() * 4000, q: 5, at: 0.1 + Math.random() * 0.4 });
        break;
      case 'kick':
        // The machine thumps as it jumps.
        this.tone(110, 0.12, { type: 'sine', vol: 0.18 + arg * 0.15, slide: 50 });
        break;
      case 'void':
        this.tone(110, 1.4, { type: 'sawtooth', vol: 0.18, slide: 30 });
        this.tone(116, 1.4, { type: 'square', vol: 0.08, slide: 28 });
        this.noise(1.2, { vol: 0.3, freq: 800, q: 0.7, slide: 80 });
        // A slurping gulp.
        this.tone(300, 0.25, { type: 'sine', vol: 0.15, slide: 80, at: 0.9 });
        this.tone(250, 0.25, { type: 'sine', vol: 0.12, slide: 60, at: 1.15 });
        break;
      case 'lose':
        this.tone(220, 0.12, { type: 'triangle', vol: 0.08, slide: 180 });
        this.tone(196, 0.14, { type: 'triangle', vol: 0.06, slide: 160, at: 0.1 });
        break;
      case 'open':
        this.noise(0.25, { vol: 0.08, freq: 600, q: 0.7, slide: 4000 });
        this.tone(440, 0.15, { type: 'triangle', vol: 0.05, slide: 880 });
        break;
      case 'buy':
        this.noise(0.08, { vol: 0.15, freq: 5000, q: 1 });
        [784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.08, { vol: 0.07, at: 0.04 + i * 0.05 }));
        this.bell(2093, 0.25, 0.05);
        break;
      case 'sell':
        [1319, 1047, 784].forEach((f, i) => this.tone(f, 0.08, { vol: 0.06, at: i * 0.05 }));
        this.tone(1800, 0.05, { vol: 0.04, at: 0.2 });
        break;
      case 'arm':
        this.tone(660, 0.06, { vol: 0.06 });
        this.tone(660, 0.06, { vol: 0.06, at: 0.09 });
        break;
      case 'nope':
        this.tone(110, 0.16, { type: 'square', vol: 0.08 });
        this.tone(104, 0.16, { type: 'square', vol: 0.08 });
        break;
      case 'move':
        this.tone(1320 + Math.random() * 80, 0.025, { vol: 0.03 });
        break;
      case 'reroll':
        for (let i = 0; i < 10; i++) {
          this.noise(0.02, { vol: 0.07, freq: 2500, q: 3, at: i * 0.03 });
          this.tone(500 + i * 120, 0.03, { vol: 0.04, at: i * 0.03 });
        }
        break;
      case 'ticket':
        this.noise(0.06, { vol: 0.08, freq: 3500, q: 2, slide: 6000 });
        this.tone(1568, 0.06, { vol: 0.04, at: 0.04 });
        break;
      case 'pay':
        this.noise(0.1, { vol: 0.2, freq: 5000, q: 1 });
        this.bell(1568, 0.05, 0.08);
        this.bell(2093, 0.14, 0.08);
        this.tone(80, 0.8, { type: 'sawtooth', vol: 0.1, slide: 30, at: 0.1 });
        this.tone(320, 0.3, { type: 'sine', vol: 0.12, slide: 70, at: 0.6 });
        break;
      case 'transmit':
        for (let i = 0; i < 8; i++) this.tone(900 + (i % 3) * 300, 0.03, { vol: 0.04, at: i * 0.06 });
        this.noise(0.5, { vol: 0.05, freq: 3000, q: 0.5 });
        this.tone(1200, 0.4, { type: 'sine', vol: 0.03, at: 0.5, vibrato: 9 });
        break;
      case 'bless':
        // A little choir.
        [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.9, { type: 'sine', vol: 0.06, at: i * 0.05, attack: 0.08, vibrato: 5 }));
        [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.08, at: i * 0.07 }));
        break;
      case 'day':
        [784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, { vol: 0.06, at: i * 0.1 }));
        this.bell(1047, 0.4, 0.05);
        break;
      case 'deadline':
        // Klaxon.
        for (let i = 0; i < 3; i++) {
          this.tone(330, 0.3, { type: 'sawtooth', vol: 0.07, at: i * 0.45 });
          this.tone(311, 0.3, { type: 'square', vol: 0.05, at: i * 0.45 });
        }
        break;
      case 'swallow':
        this.tone(400, 2.4, { type: 'sawtooth', vol: 0.12, slide: 25 });
        this.tone(410, 2.4, { type: 'square', vol: 0.05, slide: 22 });
        this.noise(2.6, { vol: 0.25, freq: 3000, q: 0.6, slide: 60 });
        break;
      case 'sad':
        // Wah wah wah waaah.
        [[392, 0.35], [370, 0.35], [349, 0.35], [330, 1.0]].reduce((at, [f, d]) => {
          this.tone(f, d, { type: 'sawtooth', vol: 0.06, at, vibrato: d > 0.5 ? 6 : 0, slide: d > 0.5 ? f * 0.94 : null });
          return at + d + 0.05;
        }, 0);
        break;
      case 'won': {
        const seq = [523, 659, 784, 1047, 0, 784, 1047, 1319, 1568];
        seq.forEach((f, i) => f && this.tone(f, 0.22, { vol: 0.07, at: i * 0.13 }));
        seq.forEach((f, i) => f && this.tone(f / 2, 0.22, { type: 'triangle', vol: 0.12, at: i * 0.13 }));
        break;
      }
      case 'free':
        this.tone(400, 0.3, { type: 'sine', vol: 0.12, slide: 1600 });
        this.tone(1600, 0.4, { type: 'sine', vol: 0.06, slide: 400, at: 0.3, vibrato: 12 });
        break;
      case 'charm':
        // A charm kicks in (echo, finale, tip jar...).
        this.bell(1319, 0, 0.05);
        this.bell(1976, 0.08, 0.05);
        break;
      case 'shoot':
        this.tone(3000, 0.4, { type: 'sine', vol: 0.012, slide: 1200 });
        break;
      default:
    }
  }

  /** A sting for each symbol, played when its line lights up. */
  symbol(id) {
    switch (id) {
      case 'comet':
        this.noise(0.3, { vol: 0.08, freq: 6000, q: 1.5, slide: 1200 });
        break;
      case 'moon':
        this.bell(784, 0, 0.05, 0.5);
        break;
      case 'planet':
        this.tone(330, 0.3, { type: 'sine', vol: 0.08, vibrato: 7 });
        break;
      case 'rocket':
        this.noise(0.35, { vol: 0.1, freq: 300, q: 1, slide: 2500 });
        this.tone(150, 0.3, { type: 'sawtooth', vol: 0.03, slide: 900 });
        break;
      case 'alien':
        this.tone(600, 0.3, { type: 'sine', vol: 0.06, slide: 1200, vibrato: 16 });
        break;
      case 'gem':
        for (let i = 0; i < 5; i++) this.tone(2093 + i * 330, 0.06, { type: 'sine', vol: 0.04, at: i * 0.04 });
        break;
      case 'seven':
        this.bell(1047, 0, 0.07);
        this.bell(1319, 0.1, 0.07);
        this.bell(1568, 0.2, 0.07);
        break;
      default:
    }
  }
}
