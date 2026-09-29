// Every sound is synthesised with WebAudio: no audio files. The context starts
// on the first user gesture, as browsers require.
//
// A driving synthwave loop that gets faster and busier with multiball and
// supernova, a rolling-ball rumble, and a big bag of one-shot effects: every
// bumper, sling, target, lane and solenoid on the table has its own sound.

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
// Em - C - G - D, one bar each: root (MIDI) and the arpeggio's chord tones.
const CHORDS = [
  { root: 40, tones: [52, 55, 59, 64] },
  { root: 36, tones: [48, 52, 55, 60] },
  { root: 43, tones: [50, 55, 59, 62] },
  { root: 38, tones: [50, 54, 57, 62] },
];
// Driving eighth-note bass, synthwave style.
const BASS = [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 7, 0, 12, 10];
const ARP = [0, 1, 2, 3, 1, 2, 3, 2, 0, 1, 2, 3, 3, 2, 1, 0];

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

      // The dying star's drone: two detuned low sines, always there.
      this.hum = c.createGain();
      this.hum.gain.value = 0;
      this.hum.connect(this.fx);
      for (const f of [41, 41.7]) {
        const o = c.createOscillator();
        o.frequency.value = f;
        o.connect(this.hum);
        o.start();
      }
      // The ball rolling: a filtered sawtooth rumble that follows its speed.
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
      // A rising tone as the star nears supernova.
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

  suspend() {
    this.held = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    this.held = false;
    this.wake();
  }

  get live() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** How unstable the star sounds (0..1). */
  setHum(level) {
    if (!this.ctx) return;
    this.hum.gain.setTargetAtTime(0.05 + level * 0.12, this.ctx.currentTime, 0.4);
  }

  /** Rolling rumble: 0 when still, 1 at full speed. */
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
    const bpm = 124 + heat * 30;
    const stepDur = 60 / bpm / 4;
    if (this.nextStep < c.currentTime - 0.2) this.nextStep = c.currentTime + 0.05;
    while (this.nextStep < c.currentTime + 0.15) {
      const at = this.nextStep - c.currentTime;
      const s = this.step % 16;
      const chord = CHORDS[Math.floor(this.step / 16) % CHORDS.length];
      const b = BASS[s];
      if (b !== null) this.tone(NOTE(chord.root + b), stepDur * 0.8, { type: 'sawtooth', vol: 0.06, at, out: this.music });
      if (b !== null) this.tone(NOTE(chord.root + b - 12), stepDur * 0.8, { type: 'triangle', vol: 0.16, at, out: this.music });
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
    const r = Math.random();
    switch (event) {
      case 'flip':
        // Solenoid: a sharp clack and a thump.
        this.noise(0.05, { vol: 0.22, freq: 1800, q: 1.5 });
        this.tone(95, 0.07, { type: 'square', vol: 0.12, slide: 50 });
        break;
      case 'flipHit':
        this.tone(180, 0.05, { type: 'triangle', vol: 0.1 + Math.min(0.15, arg / 6000), slide: 90 });
        break;
      case 'bumper': {
        // Pop bumpers: a pop plus a pitched ring per bumper.
        const f = [523, 659, 784][arg % 3];
        this.noise(0.04, { vol: 0.25, freq: 1200, q: 2 });
        this.tone(f, 0.12, { type: 'square', vol: 0.07, slide: f * 0.5 });
        this.tone(f * 2, 0.08, { type: 'sine', vol: 0.05, at: 0.01 });
        break;
      }
      case 'chain':
        for (let i = 0; i < 3; i++) this.tone(1500 + r * 800, 0.04, { type: 'sawtooth', vol: 0.03, at: i * 0.03, slide: 400 });
        break;
      case 'sling':
        this.noise(0.05, { vol: 0.2, freq: 2400, q: 2 });
        this.tone(260, 0.08, { type: 'square', vol: 0.08, slide: 700 });
        break;
      case 'drop':
        this.noise(0.07, { vol: 0.2, freq: 600, q: 1.5 });
        this.tone(880 + arg * 220, 0.1, { vol: 0.06 });
        break;
      case 'targets':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.09, { vol: 0.07, at: i * 0.06 }));
        this.bell(2093, 0.26, 0.05);
        break;
      case 'dropReset':
        this.noise(0.12, { vol: 0.15, freq: 400, q: 1 });
        this.tone(140, 0.1, { type: 'square', vol: 0.06 });
        break;
      case 'lane':
        this.bell(1047 + arg * 175, 0, 0.06, 0.4);
        break;
      case 'multiplier':
        for (let i = 0; i < 8; i++) this.tone(523 * 2 ** (i / 7), 0.07, { vol: 0.06, at: i * 0.045 });
        this.bell(2093, 0.38, 0.06);
        break;
      case 'spin':
        for (let i = 0; i < Math.min(8, arg); i++) this.noise(0.015, { vol: 0.09, freq: 4200, q: 6, at: i * 0.04 });
        break;
      case 'star':
        this.bell(660 + r * 40, 0, 0.07, 0.5);
        this.tone(1320, 0.12, { type: 'triangle', vol: 0.05 });
        break;
      case 'wormhole':
        // Sucked in: a falling whoosh and a thunk.
        this.noise(0.5, { vol: 0.18, freq: 4000, q: 0.8, slide: 200 });
        this.tone(900, 0.5, { type: 'sine', vol: 0.08, slide: 120, vibrato: 14 });
        this.tone(70, 0.2, { type: 'sine', vol: 0.35, at: 0.45, slide: 40 });
        break;
      case 'rampIn':
        this.noise(0.5, { vol: 0.1, freq: 300, q: 1.2, slide: 2400 });
        this.tone(200, 0.5, { type: 'triangle', vol: 0.06, slide: 700 });
        break;
      case 'ramp':
        [659, 784, 988, 1319].forEach((f, i) => this.tone(f * (1 + Math.min(4, arg - 1) * 0.12), 0.08, { vol: 0.07, at: i * 0.05 }));
        this.bell(2093, 0.22, 0.05);
        break;
      case 'letter':
        this.tone(988 + arg * 110, 0.06, { type: 'triangle', vol: 0.07 });
        break;
      case 'letters':
        for (let i = 0; i < 9; i++) this.tone(523 * 2 ** (i / 6), 0.1, { vol: 0.06, at: i * 0.06 });
        [1047, 1319, 1568].forEach((f) => this.tone(f, 0.8, { type: 'triangle', vol: 0.06, at: 0.55, vibrato: 6 }));
        break;
      case 'moon':
        this.bell(1568, 0, 0.05, 0.3);
        break;
      case 'rollover':
        this.tone(1760, 0.04, { vol: 0.04 });
        this.tone(2349, 0.05, { vol: 0.04, at: 0.03 });
        break;
      case 'kickout':
        this.noise(0.08, { vol: 0.3, freq: 700, q: 1 });
        this.tone(120, 0.12, { type: 'square', vol: 0.1, slide: 60 });
        break;
      case 'lock':
        this.tone(220, 0.8, { type: 'sawtooth', vol: 0.06, slide: 880 });
        [440, 554, 659].forEach((f, i) => this.tone(f, 0.2, { vol: 0.06, at: 0.6 + i * 0.12 }));
        break;
      case 'multiball':
        // Alarm, then a fanfare.
        for (let i = 0; i < 4; i++) this.tone(600, 0.3, { type: 'square', vol: 0.05, slide: 1300, at: i * 0.32 });
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.14, { vol: 0.07, at: 1.3 + i * 0.1 }));
        break;
      case 'jackpot':
        for (let i = 0; i < 16; i++) this.bell([1047, 1319, 1568, 2093][i % 4], i * 0.05, 0.04, 0.35);
        [523, 659, 784, 1047].forEach((f) => this.tone(f, 1.0, { type: 'sawtooth', vol: 0.035, at: 0.8, vibrato: 6 }));
        this.noise(0.9, { vol: 0.1, freq: 7000, q: 0.5, at: 0.8 });
        break;
      case 'relight':
        this.tone(880, 0.1, { vol: 0.05 });
        this.tone(1320, 0.14, { vol: 0.05, at: 0.08 });
        break;
      case 'supernova':
        // The star blows: a huge riser, a boom and a shimmering chord.
        this.tone(80, 1.2, { type: 'sawtooth', vol: 0.1, slide: 2400 });
        this.noise(1.2, { vol: 0.15, freq: 200, q: 0.8, slide: 9000 });
        this.tone(45, 1.4, { type: 'sine', vol: 0.55, at: 1.2, slide: 25 });
        this.noise(1.5, { vol: 0.4, freq: 900, q: 0.4, at: 1.2, slide: 80 });
        [330, 415, 494, 659, 830].forEach((f) => this.tone(f, 2.2, { type: 'sawtooth', vol: 0.03, at: 1.25, vibrato: 5 }));
        for (let i = 0; i < 10; i++) this.bell(1319 + i * 120, 1.3 + i * 0.08, 0.035);
        break;
      case 'novaEnd':
        this.tone(660, 0.8, { type: 'triangle', vol: 0.06, slide: 110 });
        break;
      case 'launch':
        // Plunger spring.
        this.noise(0.12, { vol: 0.12 + arg * 0.2, freq: 900, q: 1 });
        this.tone(160 + arg * 200, 0.25, { type: 'sine', vol: 0.12, slide: 60, vibrato: 25 });
        break;
      case 'plunger':
        this.tone(220 + arg * 440, 0.04, { type: 'triangle', vol: 0.03 });
        break;
      case 'serve':
        // The ball rolls into the shooter lane.
        for (let i = 0; i < 5; i++) this.noise(0.03, { vol: 0.06, freq: 900 + i * 100, q: 3, at: i * 0.06 });
        this.tone(200, 0.08, { type: 'triangle', vol: 0.1, at: 0.3 });
        break;
      case 'drain':
        [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.3, { type: 'sawtooth', vol: 0.05, at: i * 0.22, slide: f * 0.95 }));
        break;
      case 'drainOne':
        this.tone(330, 0.3, { type: 'triangle', vol: 0.06, slide: 160 });
        break;
      case 'save':
        [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.1, { vol: 0.07, at: i * 0.07 }));
        break;
      case 'combo':
        for (let i = 0; i < Math.min(6, arg); i++) this.tone(784 * 2 ** (i / 5), 0.08, { vol: 0.06, at: i * 0.05 });
        break;
      case 'orbit':
        this.noise(0.4, { vol: 0.12, freq: 600, q: 1.2, slide: 6000 });
        this.bell(1568, 0.3, 0.05);
        break;
      case 'comet':
        this.noise(0.5, { vol: 0.14, freq: 7000, q: 1.5, slide: 900 });
        [1319, 1760, 2093].forEach((f, i) => this.bell(f, i * 0.07, 0.05));
        break;
      case 'shipHit':
        this.tone(1200, 0.12, { type: 'square', vol: 0.06, slide: 300 });
        this.noise(0.06, { vol: 0.15, freq: 3000, q: 2 });
        break;
      case 'shipKill':
        this.noise(1.3, { vol: 0.4, freq: 1500, q: 0.5, slide: 60 });
        this.tone(200, 1.0, { type: 'sawtooth', vol: 0.12, slide: 30 });
        for (let i = 0; i < 6; i++) this.noise(0.1, { vol: 0.2, freq: 600 + r * 800, q: 1, at: 0.15 + i * 0.12 });
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { vol: 0.07, at: 1.1 + i * 0.1 }));
        break;
      case 'hole':
        this.tone(300, 0.8, { type: 'sine', vol: 0.15, slide: 40, vibrato: 8 });
        this.noise(0.8, { vol: 0.12, freq: 2000, q: 0.6, slide: 100 });
        break;
      case 'holeOut':
        this.tone(60, 0.5, { type: 'sawtooth', vol: 0.1, slide: 900 });
        break;
      case 'nudge':
        this.tone(55, 0.15, { type: 'sine', vol: 0.4, slide: 35 });
        this.noise(0.08, { vol: 0.15, freq: 300, q: 1 });
        break;
      case 'warning':
        this.tone(880, 0.1, { type: 'square', vol: 0.06 });
        this.tone(880, 0.1, { type: 'square', vol: 0.06, at: 0.15 });
        break;
      case 'tilt':
        this.tone(110, 1.0, { type: 'square', vol: 0.1 });
        this.tone(116, 1.0, { type: 'square', vol: 0.08 });
        break;
      case 'bonusTick':
        this.tone(660 + arg * 110, 0.06, { vol: 0.06 });
        this.noise(0.03, { vol: 0.06, freq: 5000, q: 3 });
        break;
      case 'bonusTotal':
        this.bell(1319, 0, 0.07);
        this.bell(1760, 0.1, 0.07);
        break;
      case 'clear':
        [523, 659, 784, 1047, 0, 784, 1047, 1319, 1568].forEach((f, i) => f && this.tone(f, 0.2, { vol: 0.07, at: i * 0.12 }));
        [262, 330, 392].forEach((f) => this.tone(f, 1.4, { type: 'sawtooth', vol: 0.03, at: 0.6, vibrato: 5 }));
        this.noise(1.5, { vol: 0.1, freq: 400, q: 0.6, slide: 8000, at: 0.4 });
        break;
      case 'upgrade':
        [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.6, { type: 'sine', vol: 0.06, at: i * 0.05, attack: 0.05, vibrato: 5 }));
        break;
      case 'kickback':
        this.noise(0.1, { vol: 0.35, freq: 500, q: 1 });
        this.tone(90, 0.2, { type: 'square', vol: 0.15, slide: 400 });
        break;
      case 'thud':
        this.noise(0.05, { vol: Math.min(0.2, arg / 3000), freq: 300, q: 1 });
        break;
      case 'rubber':
        this.tone(420 + r * 60, 0.04, { type: 'triangle', vol: 0.04 });
        break;
      case 'move':
        this.tone(1320, 0.025, { vol: 0.03 });
        break;
      case 'select':
        this.tone(880, 0.06, { vol: 0.06 });
        this.tone(1320, 0.08, { vol: 0.06, at: 0.05 });
        break;
      case 'start':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, { vol: 0.07, at: i * 0.06 }));
        break;
      case 'over':
        [[392, 0.35], [370, 0.35], [349, 0.35], [330, 1.0]].reduce((at, [f, d]) => {
          this.tone(f, d, { type: 'sawtooth', vol: 0.06, at, vibrato: d > 0.5 ? 6 : 0, slide: d > 0.5 ? f * 0.94 : null });
          return at + d + 0.05;
        }, 0);
        break;
      default:
    }
  }
}
