const KEY = 'solar-kite:v1';
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

/** Best session + settings, persisted to localStorage when it's available. */
export function loadStore() {
  const data = read();
  const best = data.best;
  return {
    // { score, rating, gentle }; a malformed save is dropped rather than shown or compared.
    best: best && Number.isFinite(best.score) && typeof best.rating === 'string' ? best : null,
    runs: data.runs | 0,
    settings: { muted: false, gentle: false, reducedMotion: null, ...(data.settings || {}) },
    get reducedMotion() {
      return this.settings.reducedMotion ?? osReducedMotion.matches;
    },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ best: this.best, runs: this.runs, settings: this.settings }));
      } catch {
        // Storage can be blocked (private mode, embeds). The game still works.
      }
    },
    /** Records a finished session and says whether it's a new best. */
    record(result) {
      this.runs++;
      let isBest = false;
      if (result.score > 0 && (!this.best || result.score > this.best.score)) {
        this.best = { score: result.score, rating: result.rating, gentle: !!result.gentle };
        isBest = true;
      }
      this.save();
      return isBest;
    },
  };
}
