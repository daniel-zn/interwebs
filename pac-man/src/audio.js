// Every sound is synthesised with WebAudio: no audio files. The context starts
// on the first user gesture, as browsers require.

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
    this.waka = 0;
    this.bedKind = null;
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
      // One looping voice for the siren, the frightened warble and the eyes going home.
      this.bed = c.createOscillator();
      this.bed.type = 'triangle';
      this.bedGain = c.createGain();
      this.bedGain.gain.value = 0;
      this.bed.connect(this.bedGain).connect(this.master);
      this.bed.start();
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

  tone(freq, dur, { type = 'square', vol = 0.12, at = 0, slide = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(event) {
    if (!this.live) return;
    switch (event) {
      case 'dot':
        // Alternating up and down chirps make the chomping sound.
        this.waka ^= 1;
        this.tone(this.waka ? 260 : 480, 0.075, { type: 'triangle', vol: 0.22, slide: this.waka ? 480 : 260 });
        break;
      case 'ghost':
        this.tone(180, 0.5, { type: 'sawtooth', vol: 0.08, slide: 1400 });
        break;
      case 'fruit':
        [660, 880, 990, 1320].forEach((f, i) => this.tone(f, 0.06, { vol: 0.08, at: i * 0.055 }));
        break;
      case 'extra':
        for (let i = 0; i < 6; i++) this.tone(i % 2 ? 1568 : 2093, 0.1, { vol: 0.07, at: i * 0.12 });
        break;
      case 'death': {
        for (let i = 0; i < 9; i++) this.tone(780 - i * 60, 0.14, { type: 'triangle', vol: 0.2, at: i * 0.13, slide: 520 - i * 50 });
        this.tone(160, 0.08, { vol: 0.12, at: 1.3 });
        this.tone(160, 0.08, { vol: 0.12, at: 1.45 });
        break;
      }
      case 'intro': {
        // An original little fanfare (not the arcade tune).
        const notes = [
          [523, 0.15], [784, 0.15], [659, 0.15], [784, 0.3], [0, 0.15],
          [587, 0.15], [880, 0.15], [698, 0.15], [880, 0.3], [0, 0.15],
          [659, 0.15], [784, 0.15], [988, 0.15], [1047, 0.15], [988, 0.15], [1047, 0.45],
        ];
        let at = 0.1;
        for (const [f, d] of notes) {
          if (f) {
            this.tone(f, d * 0.9, { vol: 0.08, at });
            this.tone(f / 4, d * 0.9, { type: 'triangle', vol: 0.18, at });
          }
          at += d;
        }
        break;
      }
      case 'clear':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, { vol: 0.07, at: i * 0.09 }));
        break;
      default:
    }
  }

  /** The looping voice: 'siren' (pitch climbs as dots run out), 'fright', 'eyes' or null. */
  setBed(kind, time, dotsLeft = 244) {
    if (!this.ctx) return;
    const c = this.ctx;
    const g = this.bedGain.gain;
    if (kind !== this.bedKind) {
      this.bedKind = kind;
      this.bed.type = kind === 'fright' ? 'square' : 'triangle';
      g.setTargetAtTime(kind ? (kind === 'fright' ? 0.035 : 0.07) : 0, c.currentTime, 0.02);
    }
    if (!kind) return;
    let f;
    if (kind === 'eyes') f = 900 + 500 * ((time * 7) % 1);
    else if (kind === 'fright') f = 180 + 120 * ((time * 7.5) % 1);
    else {
      const stage = dotsLeft > 180 ? 0 : dotsLeft > 120 ? 1 : dotsLeft > 60 ? 2 : 3;
      const base = 360 + stage * 70;
      const k = (time * (2.6 + stage * 0.35)) % 1;
      f = base + 220 * (k < 0.5 ? k * 2 : 2 - k * 2);
    }
    this.bed.frequency.setTargetAtTime(f, c.currentTime, 0.008);
  }
}
