const $ = (id) => document.getElementById(id);

const SUBS = {
  S: 'The kite club is naming a trick after you.',
  A: 'Big patterns, clean lines. The beer barely got warm.',
  B: 'Solid flying. Try chaining different tricks for a bigger multiplier.',
  C: 'Nice and relaxed. Mix loops, orbits and rings into one combo to score big.',
  D: 'A lazy afternoon. Steer in circles to loop, and go round things to orbit them.',
};

/** DOM side of the game: the hint line, screen-reader announcements and the result card. */
export class UI {
  constructor() {
    this.mode = 'pointer';
    this.state = 'title';
    this.hint = $('hint');
    this.alertEl = $('sr-alert');
    this.result = $('result');
    this.lastAlert = {};
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    document.documentElement.dataset.input = mode;
    this.refreshHint();
  }

  words() {
    switch (this.mode) {
      case 'touch': return { start: 'Tap to launch', fly: 'Hold and drag: the kite steers towards your finger · quick tap to tug', again: 'Tap to fly again' };
      case 'key': return { start: 'Press Space to launch', fly: '← → steer · Space or ↑ tugs the lines for speed', again: 'Space to fly again' };
      case 'pad': return { start: 'Press A to launch', fly: 'Stick aims the kite · A tugs the lines', again: 'Press A to fly again' };
      default: return { start: 'Click or press Space to launch', fly: 'Hold the mouse: the kite steers towards it · click to tug', again: 'Click or press Space to fly again' };
    }
  }

  setState(state) {
    this.state = state;
    this.flyHintUntil = state === 'fly' ? performance.now() + 8000 : 0;
    this.refreshHint();
  }

  refreshHint() {
    const w = this.words();
    let text = '';
    if (this.state === 'title') text = w.start;
    else if (this.state === 'fly' && performance.now() < this.flyHintUntil) text = w.fly;
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.toggle('empty', !text);
    this.hint.classList.toggle('title', this.state === 'title');
    $('result-cta').textContent = w.again;
  }

  /** Throttled assertive announcement for key moments. */
  alert(text, key = text, gap = 4000) {
    const now = performance.now();
    if (this.lastAlert[key] && now - this.lastAlert[key] < gap) return;
    this.lastAlert[key] = now;
    this.alertEl.textContent = '';
    requestAnimationFrame(() => {
      this.alertEl.textContent = text;
    });
  }

  showResult(result, store, isBest) {
    const card = this.result;
    const rank = $('result-rank');
    rank.textContent = result.rating;
    rank.dataset.rank = result.rating;
    rank.setAttribute('aria-label', `Rank ${result.rating}`);
    $('result-sub').textContent = SUBS[result.rating];
    $('result-score').textContent = result.score.toLocaleString('en-US');
    const s = result.stats;
    const rows = [
      ['Loops', s.loops],
      ['Figure 8s', s.fig8],
      ['Orbits', s.orbits],
      ['Rings', s.rings],
      ['Ground skims', s.skims],
      ['Radio calls', s.calls],
      ['Best combo', s.bestCombo.toLocaleString('en-US')],
      ['Crashes', s.crashes + s.bonks],
    ];
    $('result-stats').replaceChildren(...rows.map(([k, v]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      div.append(dt, dd);
      return div;
    }));
    const best = store.best;
    $('result-best').textContent = isBest
      ? '★ New best session!'
      : best ? `Best: ${best.score.toLocaleString('en-US')} (rank ${best.rating})` : '';
    card.hidden = false;
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    $('btn-again').focus({ preventScroll: true });
    this.alert(`Sunset. Score ${result.score}, rank ${result.rating}.${isBest ? ' New best.' : ''}`, 'result', 0);
  }

  hideResult() {
    this.result.hidden = true;
  }
}
