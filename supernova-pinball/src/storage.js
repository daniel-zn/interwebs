const KEY = 'supernova-pinball:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

/** High score and settings, persisted to localStorage when it's available. */
export function loadStore() {
  const data = read();
  return {
    high: data.high | 0,
    bestSector: data.bestSector | 0,
    games: data.games | 0,
    settings: { muted: false, music: true, relaxed: false, reducedMotion: null, ...(data.settings || {}) },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ high: this.high, bestSector: this.bestSector, games: this.games, settings: this.settings }));
      } catch {
        // Storage can be blocked (private mode, embeds). The game still works.
      }
    },
    /** Records a finished game and says whether it set a new high score. */
    record(score, sector) {
      this.games++;
      const isBest = score > this.high;
      if (isBest) this.high = score;
      this.bestSector = Math.max(this.bestSector, sector);
      this.save();
      return isBest;
    },
  };
}
