// Keyboard, on-screen touch pad and gamepad, merged into a few actions:
// up/down/left/right (held or tapped), a (confirm / talk), b (back / menu), start.
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', Space: 'a', Enter: 'a', KeyX: 'b', Escape: 'b', Backspace: 'b', KeyC: 'start', Tab: 'start',
};
export const DIRS = ['up', 'down', 'left', 'right'];

export class Input {
  constructor() {
    this.held = new Set();
    this.order = []; // most recent direction last
    this.handlers = [];
    this.run = false;
    this.mode = 'keys';
    this.listeners = [];
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Shift') this.run = true;
      const act = KEYS[e.code];
      if (!act) return;
      e.preventDefault();
      this.setMode('keys');
      if (DIRS.includes(act)) this.press(act, e.repeat);
      else if (!e.repeat) this.fire(act);
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.run = false;
      const act = KEYS[e.code];
      if (act && DIRS.includes(act)) this.release(act);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.order = [];
      this.run = false;
    });
    // A touch anywhere brings up the touch controls, even where a mouse is the main pointer.
    window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && this.setMode('touch'));
    this.pad = { prev: {} };
  }

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    document.body.dataset.input = m;
    for (const fn of this.listeners) fn(m);
  }

  press(dir, repeat = false) {
    if (!this.held.has(dir)) {
      this.held.add(dir);
      this.order.push(dir);
    }
    this.fire(dir, repeat);
  }

  release(dir) {
    this.held.delete(dir);
    this.order = this.order.filter((d) => d !== dir);
  }

  /** The direction held most recently, for walking. */
  get dir() {
    return this.order[this.order.length - 1] ?? null;
  }

  /** A UI layer grabs actions until it pops itself. */
  push(fn) {
    this.handlers.push(fn);
    return () => {
      const i = this.handlers.lastIndexOf(fn);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }

  fire(act, repeat = false) {
    const h = this.handlers[this.handlers.length - 1];
    if (h) h(act, repeat);
    else this.onWorld?.(act, repeat);
  }

  /** Gamepad polling, called every frame. */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return;
    const b = (i) => !!gp.buttons[i]?.pressed;
    const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
    const now = {
      up: b(12) || ay < -0.5, down: b(13) || ay > 0.5, left: b(14) || ax < -0.5, right: b(15) || ax > 0.5,
      a: b(0), b: b(1), start: b(9) || b(3), run: b(2),
    };
    for (const k of DIRS) {
      if (now[k] && !this.pad.prev[k]) {
        this.setMode('pad');
        this.press(k);
      } else if (!now[k] && this.pad.prev[k]) this.release(k);
    }
    for (const k of ['a', 'b', 'start']) {
      if (now[k] && !this.pad.prev[k]) {
        this.setMode('pad');
        this.fire(k);
      }
    }
    // Hold X to run: follow the button only when it changes, so Shift and the RUN toggle still work.
    if (now.run !== !!this.pad.prev.run) this.run = now.run;
    this.pad.prev = now;
  }

  /** Wires the on-screen d-pad and buttons. */
  bindTouch(root) {
    const dpad = root.querySelector('.dpad');
    let active = null;
    const dirAt = (e) => {
      const r = dpad.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(x, y) < r.width * 0.12) return null;
      return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
    };
    const set = (d) => {
      if (d === active) return;
      if (active) this.release(active);
      active = d;
      dpad.dataset.dir = d ?? '';
      if (d) this.press(d);
    };
    // The overlay hides while dialogs and menus are up, which can swallow the
    // finger's pointerup; let go of the pad so the player doesn't walk on.
    this.clearTouch = () => set(null);
    // Losing focus (an app switch) lets go of everything; show it on the pad and RUN.
    window.addEventListener('blur', () => {
      set(null);
      root.querySelector('[data-act="run"]')?.classList.remove('on');
    });
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.setMode('touch');
      try {
        dpad.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic or already-released pointer: fine without capture.
      }
      set(dirAt(e));
    });
    dpad.addEventListener('pointermove', (e) => active !== undefined && e.buttons && set(dirAt(e)));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) dpad.addEventListener(t, () => set(null));
    for (const btn of root.querySelectorAll('[data-act]')) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.setMode('touch');
        btn.classList.add('down');
        if (btn.dataset.act === 'run') {
          this.run = !this.run;
          btn.classList.toggle('on', this.run);
        } else this.fire(btn.dataset.act);
      });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(t, () => btn.classList.remove('down'));
    }
  }
}
