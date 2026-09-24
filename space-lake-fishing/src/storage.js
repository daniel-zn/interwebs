const KEY = 'orbit-pond:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

/** Journal + settings, persisted to localStorage when available. */
export function loadStore() {
  const data = read();
  return {
    journal: data.journal || {},
    total: data.total | 0,
    settings: { muted: false, gentle: false, reducedMotion: null, ...(data.settings || {}) },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ journal: this.journal, total: this.total, settings: this.settings }));
      } catch {
        // Storage can be unavailable (private mode, embedded); the game still works.
      }
    },
    discovered() {
      return Object.keys(this.journal).length;
    },
    record(sp, size) {
      const prev = this.journal[sp.id];
      const isNew = !prev;
      const best = prev ? prev.best : 0;
      this.journal[sp.id] = { count: (prev ? prev.count : 0) + 1, best: Math.max(best, size) };
      this.total++;
      this.save();
      return { isNew, personalBest: !isNew && size > best };
    },
    resetJournal() {
      this.journal = {};
      this.total = 0;
      this.save();
    },
  };
}
