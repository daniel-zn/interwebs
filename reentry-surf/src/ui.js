const $ = (id) => document.getElementById(id);

const OUTCOMES = {
  landed: { kicker: 'Mission complete', title: 'SPLASHDOWN!', sub: 'You rode the corridor all the way down, popped the chute and hit the sea.' },
  burned: { kicker: 'Too steep, too hot', title: 'BURNED UP', sub: 'Too deep in the thick air: the shield went white-hot. Let go sooner to lift out of the heat.' },
  skipped: { kicker: 'Too shallow', title: 'SKIPPED OUT', sub: 'The air was too thin to hold you, and you got flung back into space. Hold to dive before the dashed line.' },
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
      case 'touch': return { start: 'Tap to drop in', dive: 'Hold to dive, let go to lift', again: 'Tap to ride again' };
      case 'key': return { start: 'Press Space to drop in', dive: 'Hold Space or ↓ to dive · let go to lift · ↑ pulls up', again: 'Space to ride again' };
      case 'pad': return { start: 'Press A to drop in', dive: 'Hold A to dive · let go to lift', again: 'Press A to ride again' };
      default: return { start: 'Click or press Space to drop in', dive: 'Hold the mouse button to dive · let go to lift', again: 'Click or press Space to ride again' };
    }
  }

  setState(state) {
    this.state = state;
    this.rideHintUntil = state === 'ride' ? performance.now() + 7000 : 0;
    this.refreshHint();
  }

  refreshHint() {
    const w = this.words();
    let text = '';
    if (this.state === 'title') text = w.start;
    else if (this.state === 'ride' && performance.now() < this.rideHintUntil) text = w.dive;
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
    const o = OUTCOMES[result.outcome];
    const card = this.result;
    card.dataset.outcome = result.outcome;
    $('result-kicker').textContent = o.kicker;
    $('result-title').textContent = o.title;
    $('result-sub').textContent = o.sub;
    const rank = $('result-rank');
    rank.textContent = result.rating || '–';
    rank.dataset.rank = result.rating || '-';
    rank.setAttribute('aria-label', result.rating ? `Rank ${result.rating}` : 'No rank: land to earn one');
    $('result-score').textContent = result.score.toLocaleString('en-US');
    const s = result.stats;
    const rows = [
      ['Time', `${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, '0')}`],
      ['Best flow', `x${s.maxFlow}`],
      ['Edge riding', `${s.edgeTime}s`],
      ['Jet streams', `${s.jetTime}s`],
      ['Close calls', s.nearMiss],
      ['Junk hits', s.hits],
    ];
    if (result.outcome === 'landed') rows.push(['Landing bonus', `+${result.bonus}`]);
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
      ? '★ New best landing!'
      : best ? `Best landing: ${best.score.toLocaleString('en-US')} (rank ${best.rating})` : 'Land safely to set a best score.';
    card.hidden = false;
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    $('btn-again').focus({ preventScroll: true });
    const summary = result.outcome === 'landed'
      ? `Splashdown! Score ${result.score}, rank ${result.rating}.${isBest ? ' New best.' : ''}`
      : `${o.title.toLowerCase()}. Score ${result.score}.`;
    this.alert(summary, 'result', 0);
  }

  hideResult() {
    this.result.hidden = true;
  }
}
