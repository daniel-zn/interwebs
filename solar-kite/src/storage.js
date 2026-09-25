const KEY = 'solar-kite:v1';

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
  return {
    best: data.best || null, // { score, rating, gentle }
    runs: data.runs | 0,
    settings: { muted: false, gentle: false, reducedMotion: null, ...(data.settings || {}) },
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
