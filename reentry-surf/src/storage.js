const KEY = 'reentry-surf:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

/** Best run + settings, persisted to localStorage when it's available. */
export function loadStore() {
  const data = read();
  return {
    best: data.best || null, // { score, rating, time, gentle }
    runs: data.runs | 0,
    landings: data.landings | 0,
    settings: { muted: false, gentle: false, reducedMotion: null, ...(data.settings || {}) },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ best: this.best, runs: this.runs, landings: this.landings, settings: this.settings }));
      } catch {
        // Storage can be blocked (private mode, embeds). The game still works.
      }
    },
    /** Records a finished run. Only landings count for the best score. */
    record(result) {
      this.runs++;
      let isBest = false;
      if (result.outcome === 'landed') {
        this.landings++;
        if (!this.best || result.score > this.best.score) {
          this.best = { score: result.score, rating: result.rating, time: Math.round(result.time), gentle: !!result.gentle };
          isBest = true;
        }
      }
      this.save();
      return isBest;
    },
  };
}
