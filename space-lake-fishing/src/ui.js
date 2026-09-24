import { SPECIES, fishSprite, formatSize, silhouette } from './fish.js';

const $ = (id) => document.getElementById(id);

function spriteInto(canvasEl, sprite, maxCss, maxScale = 8) {
  canvasEl.width = sprite.width;
  canvasEl.height = sprite.height;
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, sprite.width, sprite.height);
  ctx.drawImage(sprite, 0, 0);
  const scale = Math.max(2, Math.min(maxScale, Math.floor(maxCss / sprite.width)));
  canvasEl.style.width = `${sprite.width * scale}px`;
  canvasEl.style.height = `${sprite.height * scale}px`;
}

/** DOM side of the game: hints, live announcements, the catch card and dialogs. */
export class UI {
  constructor(store) {
    this.store = store;
    this.mode = 'pointer';
    this.state = 'title';
    this.message = '';
    this.hint = $('hint');
    this.alertEl = $('sr-alert');
    this.stat = $('stat');
    this.card = $('card');
    this.updateStats();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    document.documentElement.dataset.input = mode;
    this.refreshHint();
  }

  words() {
    if (this.mode === 'touch') return { tap: 'Tap', hold: 'Hold anywhere', holdShort: 'Hold' };
    if (this.mode === 'key') return { tap: 'Press Space', hold: 'Hold Space', holdShort: 'Hold Space' };
    return { tap: 'Click', hold: 'Hold the mouse button', holdShort: 'Hold' };
  }

  hintFor(state) {
    const w = this.words();
    switch (state) {
      case 'title': return `${w.tap} to begin`;
      case 'idle': return this.message || `${w.hold} to cast`;
      case 'charging': return 'Let go to cast · farther casts find rarer fish';
      case 'casting': return '';
      case 'waiting': return 'Wait for the bobber to plunge…';
      case 'bite': return `Bite! ${w.tap} now!`;
      case 'reeling': return `${w.holdShort} to reel · let go when the line strains`;
      case 'landing': return '';
      case 'caught': return `${w.tap} to keep fishing`;
      case 'lost': return this.message;
      default: return '';
    }
  }

  onState(state, message = '') {
    this.state = state;
    this.message = message;
    this.refreshHint();
  }

  refreshHint() {
    const text = this.hintFor(this.state);
    this.hint.textContent = text;
    this.hint.classList.toggle('urgent', this.state === 'bite');
    this.hint.classList.toggle('empty', !text);
  }

  alert(text) {
    // Clearing first makes screen readers re-announce identical messages.
    this.alertEl.textContent = '';
    requestAnimationFrame(() => {
      this.alertEl.textContent = text;
    });
  }

  updateStats() {
    const found = this.store.discovered();
    this.stat.textContent = `${this.store.total} caught · ${found}/${SPECIES.length} species`;
  }

  showCard(sp, size, { isNew, personalBest }) {
    const sprite = fishSprite(sp);
    spriteInto($('card-sprite'), sprite, 190);
    $('card-sprite').classList.toggle('shimmer', !!sp.shimmer);
    $('card-name').textContent = sp.name;
    $('card-rarity').textContent = sp.rarity;
    $('card-rarity').dataset.rarity = sp.rarity.toLowerCase();
    $('card-size').textContent = formatSize(sp, size);
    $('card-desc').textContent = sp.desc;
    const badge = isNew ? 'New to your journal!' : personalBest ? 'New personal best!' : '';
    $('card-badge').textContent = badge;
    $('card-badge').hidden = !badge;
    $('card-cta').textContent = `${this.words().tap} to keep fishing`;
    this.card.hidden = false;
    this.card.classList.remove('show');
    void this.card.offsetWidth;
    this.card.classList.add('show');
    this.updateStats();
    this.alert(`You caught a ${sp.name}, ${formatSize(sp, size)}. ${badge}`);
  }

  hideCard() {
    this.card.hidden = true;
  }

  renderJournal() {
    const list = $('journal-list');
    list.textContent = '';
    for (const sp of SPECIES) {
      const entry = this.store.journal[sp.id];
      const li = document.createElement('li');
      li.className = entry ? 'entry found' : 'entry';
      const cv = document.createElement('canvas');
      cv.className = 'sprite';
      cv.setAttribute('aria-hidden', 'true');
      const sprite = fishSprite(sp);
      spriteInto(cv, entry ? sprite : silhouette(sprite, '#2a2f5a'), 96, 4);
      if (entry && sp.shimmer) cv.classList.add('shimmer');
      const text = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = entry ? sp.name : '???';
      const meta = document.createElement('p');
      meta.className = 'meta';
      const p = document.createElement('p');
      if (entry) {
        meta.textContent = `${sp.rarity} · caught ${entry.count}× · best ${formatSize(sp, entry.best)}`;
        p.textContent = sp.desc;
      } else {
        meta.textContent = 'Not yet caught';
        p.textContent = sp.hint;
      }
      text.append(h, meta, p);
      li.append(cv, text);
      list.append(li);
    }
    $('journal-summary').textContent =
      `${this.store.discovered()} of ${SPECIES.length} species discovered · ${this.store.total} fish caught in total`;
  }
}
