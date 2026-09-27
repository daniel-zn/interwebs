// All sound is synthesised with WebAudio: a tiny chiptune sequencer for music
// plus one-shot effects. No audio files.
import { hash, mulberry32 } from './util.js';

// Phones only let sound start inside a finished tap (touchend, pointerup,
// click) or a key press, never on pointerdown or touchstart. So the engine
// listens for those on the whole page, whatever the game's own handlers do.
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'];
function listenForGestures(engine) {
  const wake = () => engine.unlock();
  for (const type of GESTURES) window.addEventListener(type, wake, { capture: true, passive: true });
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // Not supported: nothing to do.
  }
}

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
function chord(name) {
  const m = name.match(/^([A-G][#b]?)(m?)$/);
  const root = NOTE[m[1]];
  return { root, tones: m[2] ? [0, 3, 7] : [0, 4, 7], minor: !!m[2] };
}

// bpm, chords (one per bar), arp: 16 steps of chord-tone indices (-1 rest), feel.
const SONGS = {
  title: { bpm: 84, prog: ['Am', 'F', 'C', 'G'], arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 1], lead: 0.5, drums: 0 },
  town: { bpm: 104, prog: ['Dm', 'Bb', 'F', 'C'], arp: [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2], lead: 0.7, drums: 1 },
  route: { bpm: 120, prog: ['Em', 'C', 'G', 'D'], arp: [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 1, 3, 2, 1, 2], lead: 0.8, drums: 1 },
  foundry: { bpm: 112, prog: ['Cm', 'Cm', 'Bb', 'Ab'], arp: [0, -1, 0, 2, -1, 1, 0, -1, 0, -1, 0, 2, 3, 2, 1, -1], lead: 0.5, drums: 2 },
  rain: { bpm: 96, prog: ['F#m', 'D', 'A', 'E'], arp: [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 2, 3, 2], lead: 0.4, drums: 1 },
  night: { bpm: 80, prog: ['Bm', 'G', 'D', 'A'], arp: [0, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1, 3, -1, 1, -1], lead: 0.5, drums: 0 },
  summit: { bpm: 108, prog: ['Gm', 'Eb', 'Bb', 'F'], arp: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 3], lead: 0.8, drums: 1 },
  clinic: { bpm: 92, prog: ['F', 'C', 'Dm', 'Bb'], arp: [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 1, 3, 1, 2, 1], lead: 0.6, drums: 0 },
  gym: { bpm: 122, prog: ['Em', 'C', 'D', 'B'], arp: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2], lead: 0.7, drums: 1 },
  battle: { bpm: 152, prog: ['Am', 'Am', 'F', 'G'], arp: [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 1], lead: 0.9, drums: 3 },
  warden: { bpm: 162, prog: ['Dm', 'Bb', 'C', 'A'], arp: [0, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 0, 3, 2, 1, 0], lead: 1, drums: 3 },
  boss: { bpm: 144, prog: ['Cm', 'Ab', 'Eb', 'G'], arp: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 3, 2, 1, 0], lead: 1, drums: 3 },
  heart: { bpm: 72, prog: ['C#m', 'A', 'E', 'B'], arp: [0, -1, -1, 1, -1, -1, 2, -1, -1, 3, -1, -1, 2, -1, 1, -1], lead: 0.4, drums: 0 },
  victory: { bpm: 132, prog: ['C', 'G', 'Am', 'F'], arp: [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 0], lead: 0.9, drums: 2 },
  legend: { bpm: 138, prog: ['Em', 'C', 'Am', 'B'], arp: [0, 1, 2, 3, 2, 3, 2, 1, 0, 1, 2, 3, 3, 2, 1, 0], lead: 1, drums: 3 },
};

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.held = false;
    this.muted = false;
    this.song = null;
    this.want = null;
    listenForGestures(this);
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
      this.musicBus = c.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(this.master);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.timer = setInterval(() => this.tick(), 30);
      if (this.want) this.music(this.want, true);
    }
    this.wake();
  }

  wake() {
    const c = this.ctx;
    if (!c || this.held) return;
    if (c.state !== 'running') c.resume().catch(() => {});
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
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
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
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  // ---------------------------------------------------------------- music
  music(name, force = false) {
    this.want = name;
    if (!this.ctx || (!force && this.song?.name === name)) return;
    const def = SONGS[name];
    if (!def) return;
    const rng = mulberry32(hash(name));
    // A little melody per song: a seeded walk over chord tones.
    const melody = def.prog.map(() => Array.from({ length: 16 }, (_, i) => (i % 2 === 0 && rng() < def.lead * 0.8 ? Math.floor(rng() * 5) : -1)));
    this.song = { name, def, melody, step: 0, next: this.ctx.currentTime + 0.08 };
  }

  stopMusic() {
    this.song = null;
    this.want = null;
  }

  tick() {
    const c = this.ctx, s = this.song;
    if (!c || !s || c.state !== 'running') return;
    const stepDur = 60 / s.def.bpm / 4;
    while (s.next < c.currentTime + 0.15) {
      this.playStep(s, s.step, s.next, stepDur);
      s.step = (s.step + 1) % (16 * s.def.prog.length);
      s.next += stepDur;
    }
  }

  playStep(s, step, t, dur) {
    const bar = Math.floor(step / 16), i = step % 16;
    const ch = chord(s.def.prog[bar]);
    const base = 57 + ch.root - (ch.root > 6 ? 12 : 0);
    const tones = [...ch.tones, 12];
    const a = s.def.arp[i];
    if (a >= 0) this.tone(midi(base + 12 + tones[a]), t, dur * 0.9, 'square', 0.035, this.musicBus);
    // Bass: roots on beats, octave bounce in faster songs.
    if (i % 4 === 0 || (s.def.drums >= 2 && i % 2 === 0)) this.tone(midi(base - 12 + (i % 8 === 4 && s.def.drums >= 3 ? 12 : 0)), t, dur * 1.8, 'triangle', 0.12, this.musicBus);
    const m = s.melody[bar][i];
    if (m >= 0 && s.def.lead) {
      const scale = ch.minor ? [0, 3, 7, 10, 12] : [0, 4, 7, 11, 12];
      this.tone(midi(base + 24 + scale[m]), t, dur * 1.7, 'sawtooth', 0.018, this.musicBus, 1800);
    }
    const d = s.def.drums;
    if (d >= 1 && i % 4 === 2) this.noise(t, 0.03, 0.035, 7000, this.musicBus);
    if (d >= 2 && i % 8 === 4) this.noise(t, 0.08, 0.06, 1800, this.musicBus);
    if (d >= 3 && i % 4 === 0) this.kick(t);
  }

  // ---------------------------------------------------------------- voices
  tone(freq, t, dur, type, vol, dest = this.master, cutoff = 0, slideTo = 0) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cutoff) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(t, dur, vol, freq = 3000, dest = this.master, type = 'highpass') {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  kick(t) {
    this.tone(150, t, 0.12, 'sine', 0.25, this.musicBus, 0, 40);
  }

  // ---------------------------------------------------------------- effects
  sfx(name, arg) {
    if (!this.live) return;
    const t = this.ctx.currentTime + 0.005;
    const seq = (notes, step, type = 'square', vol = 0.08) => notes.forEach((n, i) => this.tone(midi(n), t + i * step, step * 1.4, type, vol));
    switch (name) {
      case 'blip': this.tone(1320, t, 0.04, 'square', 0.04); break;
      case 'select': seq([76, 83], 0.04); break;
      case 'cancel': seq([72, 65], 0.04); break;
      case 'bump': this.tone(90, t, 0.08, 'square', 0.06, this.master, 600); break;
      case 'door': this.noise(t, 0.2, 0.08, 1200, this.master, 'bandpass'); seq([60, 67], 0.06, 'triangle', 0.1); break;
      case 'talk': this.tone(900 + Math.random() * 200, t, 0.025, 'square', 0.02); break;
      case 'exclaim': seq([84, 91], 0.05); break;
      case 'encounter':
        for (let i = 0; i < 10; i++) this.tone(midi(60 + i * 2), t + i * 0.03, 0.06, 'square', 0.05);
        this.noise(t, 0.5, 0.05, 2000);
        break;
      case 'hit': {
        const eff = arg ?? 1;
        this.noise(t, 0.18, 0.18, eff > 1 ? 1500 : eff < 1 ? 400 : 900, this.master, 'lowpass');
        this.tone(eff > 1 ? 220 : 160, t, 0.15, 'square', 0.1, this.master, 1200, 60);
        if (eff > 1) seq([79, 86], 0.05);
        break;
      }
      case 'crit': seq([88, 93], 0.04); break;
      case 'status': this.tone(400, t, 0.3, 'sawtooth', 0.05, this.master, 2000, 900); break;
      case 'statup': seq([67, 71, 74, 79], 0.04, 'triangle', 0.1); break;
      case 'statdown': seq([79, 74, 71, 67], 0.04, 'triangle', 0.1); break;
      case 'heal': seq([72, 76, 79, 84, 88], 0.06, 'triangle', 0.1); break;
      case 'faint': this.tone(440, t, 0.6, 'square', 0.07, this.master, 1500, 60); break;
      case 'throw': this.noise(t, 0.3, 0.06, 3000, this.master, 'bandpass'); this.tone(300, t, 0.3, 'sine', 0.05, this.master, 0, 900); break;
      case 'shake': this.tone(180, t, 0.05, 'square', 0.07); this.tone(120, t + 0.06, 0.05, 'square', 0.06); break;
      case 'caught': seq([72, 76, 79, 84, 79, 84, 88], 0.08, 'square', 0.07); break;
      case 'breakout': this.noise(t, 0.25, 0.1, 800, this.master, 'lowpass'); seq([76, 70], 0.06); break;
      case 'levelup': seq([72, 76, 79, 84, 84, 88, 91, 96], 0.05, 'square', 0.06); break;
      case 'coin': seq([88, 95], 0.05, 'square', 0.06); break;
      case 'evolve': for (let i = 0; i < 24; i++) this.tone(midi(60 + ((i * 5) % 24)), t + i * 0.07, 0.1, 'triangle', 0.07); break;
      case 'gate': this.tone(110, t, 0.25, 'sawtooth', 0.05, this.master, 700); break;
      case 'win': seq([72, 72, 72, 76, 79, 76, 79, 84], 0.09, 'square', 0.07); break;
      case 'lose': seq([67, 63, 60, 55], 0.14, 'triangle', 0.1); break;
      case 'heartbeat': this.tone(55, t, 0.3, 'sine', 0.3, this.master, 0, 35); this.tone(50, t + 0.25, 0.3, 'sine', 0.25, this.master, 0, 30); break;
    }
  }
}
