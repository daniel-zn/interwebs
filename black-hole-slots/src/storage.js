const KEY = 'black-hole-slots:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

/** Best results, settings and the run in progress, persisted when storage works. */
export function loadStore() {
  const data = read();
  return {
    best: { runs: 0, round: 0, escaped: 0, win: 0, ...(data.best || {}) },
    settings: { muted: false, fast: false, reducedMotion: null, ...(data.settings || {}) },
    run: data.run && data.run.v === 1 ? data.run : null,
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ best: this.best, settings: this.settings, run: this.run }));
      } catch {
        // Storage can be blocked (private mode, embeds). The game still works.
      }
    },
    /** Records a finished run; says whether it beat the best round reached. */
    record(run, escaped) {
      const b = this.best;
      b.runs++;
      const reached = escaped ? run.round + 1 : run.round;
      const isBest = reached > b.round;
      b.round = Math.max(b.round, reached);
      if (escaped) b.escaped++;
      b.win = Math.max(b.win, run.stats.bestWin);
      this.run = null;
      this.save();
      return isBest;
    },
  };
}
