// Everything you hear is synthesised with WebAudio, so there are no audio files.
// The context starts on the first user gesture, as browsers require.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastTick = -1;
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

  /** Looping beds: the solar wind hiss, and the kite's buzz with a low hum under it. */
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
    this.wind = bed('bandpass', 700, 0.6);
    this.buzz = bed('bandpass', 900, 3);
    const hum = c.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 80;
    const hf = c.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 400;
    const hg = c.createGain();
    hg.gain.value = 0;
    hum.connect(hf).connect(hg).connect(this.master);
    hum.start();
    this.hum = { o: hum, g: hg };
  }

  /** Called every frame with the flight state (or null when nothing is flying). */
  tick(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const wind = s ? s.wind : 0.4, speed = s ? s.speed : 0, turn = s ? s.turn : 0;
    this.wind.g.gain.setTargetAtTime(0.05 + wind * 0.07 + (s && s.flare ? 0.06 : 0), now, 0.3);
    this.wind.f.frequency.setTargetAtTime(500 + wind * 500, now, 0.3);
    this.buzz.g.gain.setTargetAtTime(s ? speed * speed * 0.16 + turn * 0.04 : 0, now, 0.08);
    this.buzz.f.frequency.setTargetAtTime(500 + speed * 1300 + turn * 300, now, 0.08);
    this.hum.g.gain.setTargetAtTime(s ? speed * 0.035 : 0, now, 0.1);
    this.hum.o.frequency.setTargetAtTime(60 + speed * 70, now, 0.1);
    // The last ten seconds of daylight tick down.
    if (s && s.left < 10 && s.left > 0) {
      const sec = Math.ceil(s.left);
      if (sec !== this.lastTick) {
        this.lastTick = sec;
        this.tone(sec <= 3 ? 1320 : 990, 0.06, 'square', 0.05);
      }
    }
  }

  // ---------------------------------------------------------------- one-shots
  tone(freq, dur, type = 'sine', vol = 0.2, delay = 0, slide = 0) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, freq, type = 'bandpass', vol = 0.3, delay = 0, q = 1, slideTo = 0) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  click() {
    this.tone(880, 0.05, 'square', 0.06);
  }

  /** Cracking open a cold one. */
  canOpen() {
    this.noise(0.06, 3000, 'highpass', 0.35);
    this.noise(0.5, 5000, 'bandpass', 0.18, 0.04, 0.8, 1800);
  }

  sip() {
    for (let i = 0; i < 3; i++) this.noise(0.09, 600 + i * 150, 'bandpass', 0.12, i * 0.12, 4);
  }

  tug() {
    this.noise(0.12, 400, 'bandpass', 0.25, 0, 1.5, 1600);
  }

  trick(count, flare) {
    const base = flare ? 523.25 : 440;
    const n = PENTA[Math.min(PENTA.length - 1, count - 1)];
    const f = base * Math.pow(2, n / 12);
    this.tone(f, 0.18, 'triangle', 0.22);
    this.tone(f * 2, 0.12, 'sine', 0.08, 0.03);
  }

  ring(n) {
    const f = 880 * Math.pow(2, PENTA[Math.min(8, n)] / 12);
    this.tone(f, 0.4, 'sine', 0.2);
    this.tone(f * 1.5, 0.3, 'sine', 0.08, 0.02);
  }

  orbit() {
    this.tone(330, 0.35, 'triangle', 0.18, 0, 2);
    this.tone(660, 0.3, 'sine', 0.1, 0.08, 1.5);
  }

  bank(total) {
    const notes = total >= 5000 ? [0, 4, 7, 12, 16] : total >= 1500 ? [0, 4, 7, 12] : [0, 7];
    notes.forEach((n, i) => this.tone(660 * Math.pow(2, n / 12), 0.22, 'square', 0.07, i * 0.07));
  }

  drop() {
    this.tone(300, 0.35, 'sawtooth', 0.1, 0, 0.5);
  }

  crash() {
    this.noise(0.5, 300, 'lowpass', 0.6, 0, 1, 80);
    this.tone(110, 0.3, 'sine', 0.3, 0, 0.5);
  }

  bonk() {
    this.tone(520, 0.12, 'square', 0.14, 0, 0.6);
    this.tone(780, 0.1, 'square', 0.08, 0.02, 0.7);
  }

  radio() {
    this.noise(0.08, 2400, 'bandpass', 0.2, 0, 2);
    this.tone(1320, 0.06, 'square', 0.07, 0.06);
    this.tone(1760, 0.08, 'square', 0.07, 0.14);
    this.noise(0.05, 2400, 'bandpass', 0.14, 0.25, 2);
  }

  callDone() {
    [0, 4, 7, 11, 14].forEach((n, i) => this.tone(880 * Math.pow(2, n / 12), 0.15, 'triangle', 0.12, i * 0.05));
  }

  incoming(kind) {
    if (kind === 'flare') this.noise(2.6, 120, 'lowpass', 0.4, 0, 1, 900);
    else this.tone(440, 0.8, 'sine', 0.12, 0, 0.5);
  }

  flare() {
    this.noise(1.2, 2000, 'bandpass', 0.35, 0, 0.5, 400);
    this.tone(110, 1, 'sawtooth', 0.12, 0, 2);
  }

  relaunch() {
    this.noise(0.2, 500, 'bandpass', 0.2, 0, 1, 2000);
  }

  end() {
    [0, 7, 12, 16, 19].forEach((n, i) => this.tone(330 * Math.pow(2, n / 12), 1.4, 'triangle', 0.12, i * 0.1));
  }
}
