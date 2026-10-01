const KEY = 'orbit-pond:v1';
// Reduce motion follows the OS setting until the player picks one in settings
// (the save keeps null until then, so a later OS change still counts).
const osReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

/** The saved journal's well-formed entries ({ count, best } by species id); a broken save mustn't break catches. */
function readJournal(saved) {
  const journal = {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return journal;
  for (const [id, e] of Object.entries(saved)) {
    if (e && Number.isFinite(e.count) && e.count > 0 && Number.isFinite(e.best)) journal[id] = { count: e.count, best: e.best };
  }
  return journal;
}

/** Journal + settings, persisted to localStorage when available. */
export function loadStore() {
  const data = read();
  return {
    journal: readJournal(data.journal),
    total: data.total | 0,
    settings: { muted: false, gentle: false, reducedMotion: null, ...(data.settings || {}) },
    get reducedMotion() {
      return this.settings.reducedMotion ?? osReducedMotion.matches;
    },
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
