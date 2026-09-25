// Home page behaviour: a drifting pixel starfield, arrow-key / gamepad selection,
// and a short "launch" transition before following a card's link.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// ------------------------------------------------------------------ starfield
const sky = document.getElementById('sky');
const ctx = sky.getContext('2d');
const PX = 3; // one star pixel = 3 CSS pixels
let W = 0, H = 0, stars = [], shoot = null, shootIn = 4;

function resize() {
  W = Math.ceil(innerWidth / PX);
  H = Math.ceil(innerHeight / PX);
  sky.width = W;
  sky.height = H;
  const n = Math.round((W * H) / 260);
  stars = Array.from({ length: n }, () => {
    const layer = Math.random() < 0.65 ? 0 : Math.random() < 0.7 ? 1 : 2;
    return {
      x: Math.random() * W, y: Math.random() * H, layer,
      ph: Math.random() * 7, sp: 0.6 + Math.random() * 2,
      c: layer === 2 ? (Math.random() < 0.3 ? '#9fd8ff' : '#fff6d6') : layer === 1 ? '#8e97cf' : '#4a3f86',
    };
  });
  draw(0);
}

function draw(t) {
  ctx.clearRect(0, 0, W, H);
  for (const s of stars) {
    ctx.fillStyle = s.c;
    if (s.layer === 2 && Math.sin(t * s.sp + s.ph) < -0.6) ctx.fillStyle = '#8e97cf';
    ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
  }
  if (shoot) {
    for (let i = 0; i < 10; i++) {
      if (i > 4 && i % 2) continue;
      ctx.fillStyle = i < 2 ? '#ffffff' : '#fff6d6';
      ctx.fillRect(Math.round(shoot.x - shoot.vx * i * 0.012), Math.round(shoot.y - shoot.vy * i * 0.012), 1, 1);
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!reduced.matches) {
    for (const s of stars) {
      s.x -= (0.4 + s.layer * 1.1) * dt;
      if (s.x < 0) s.x += W;
    }
    if (shoot) {
      shoot.x += shoot.vx * dt;
      shoot.y += shoot.vy * dt;
      if ((shoot.t += dt) > 1) shoot = null;
    } else if ((shootIn -= dt) <= 0) {
      shootIn = 6 + Math.random() * 10;
      shoot = { x: Math.random() * W * 0.7, y: Math.random() * H * 0.4, vx: 70 + Math.random() * 40, vy: 25 + Math.random() * 15, t: 0 };
    }
    draw(now / 1000);
  }
  requestAnimationFrame(frame);
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

// ------------------------------------------------------------------ selection
const cards = [...document.querySelectorAll('.card')];
let sel = 0;

function select(i, focus = true) {
  if (!cards.length) return;
  sel = (i + cards.length) % cards.length;
  cards.forEach((c, k) => c.classList.toggle('sel', k === sel));
  if (focus) {
    cards[sel].focus({ preventScroll: true });
    cards[sel].scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
  }
}

/** Nearest card in the row above/below, by horizontal centre. */
function vertical(dir) {
  const r = cards[sel].getBoundingClientRect();
  const cx = r.left + r.width / 2;
  let best = -1, bestScore = Infinity;
  cards.forEach((c, k) => {
    const b = c.getBoundingClientRect();
    const dy = dir > 0 ? b.top - r.bottom : r.top - b.bottom;
    if (k === sel || dy < -1) return;
    const score = dy * 4 + Math.abs(b.left + b.width / 2 - cx);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  });
  return best;
}

function move(key) {
  const active = cards.indexOf(document.activeElement);
  if (active < 0) return select(sel);
  sel = active;
  if (key === 'ArrowRight') select(sel + 1);
  else if (key === 'ArrowLeft') select(sel - 1);
  else if (key === 'Home') select(0);
  else if (key === 'End') select(cards.length - 1);
  else {
    const k = vertical(key === 'ArrowDown' ? 1 : -1);
    if (k >= 0) select(k);
  }
}

addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    move(e.key);
  } else if ((e.key === 'Enter' || e.key === ' ') && !cards.includes(document.activeElement) && cards.length) {
    e.preventDefault();
    launch(cards[sel]);
  } else if (e.key === ' ' && cards.includes(document.activeElement)) {
    e.preventDefault();
    launch(document.activeElement);
  }
});
cards.forEach((c, k) => {
  c.addEventListener('pointerenter', () => select(k, false));
  c.addEventListener('focus', () => select(k, false));
  c.addEventListener('click', (e) => {
    // Let new-tab / new-window clicks behave normally.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    launch(c);
  });
});
select(0, false);

// ------------------------------------------------------------------ launch
let launching = false;
function launch(card) {
  if (launching) return;
  if (reduced.matches) {
    location.href = card.href;
    return;
  }
  launching = true;
  const r = card.getBoundingClientRect();
  document.body.style.setProperty('--x', `${r.left + r.width / 2}px`);
  document.body.style.setProperty('--y', `${r.top + r.height / 2}px`);
  card.classList.add('go');
  document.body.classList.add('launching');
  setTimeout(() => {
    location.href = card.href;
  }, 520);
}
// Coming back with the browser's back button restores the page from cache.
addEventListener('pageshow', () => {
  launching = false;
  document.body.classList.remove('launching');
  cards.forEach((c) => c.classList.remove('go'));
});

// ------------------------------------------------------------------ gamepad
let padLoop = false, prev = {}, repeatAt = 0;
function poll(now) {
  const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (!pad) {
    padLoop = false;
    return;
  }
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  const state = {
    ArrowLeft: pad.buttons[14]?.pressed || ax < -0.5, ArrowRight: pad.buttons[15]?.pressed || ax > 0.5,
    ArrowUp: pad.buttons[12]?.pressed || ay < -0.5, ArrowDown: pad.buttons[13]?.pressed || ay > 0.5,
    A: pad.buttons[0]?.pressed || pad.buttons[9]?.pressed,
  };
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    if (state[key] && (!prev[key] || now > repeatAt)) {
      if (!cards.includes(document.activeElement)) select(sel);
      else move(key);
      repeatAt = now + (prev[key] ? 140 : 380);
    }
  }
  if (state.A && !prev.A && cards.length) launch(cards[sel]);
  prev = state;
  requestAnimationFrame(poll);
}
addEventListener('gamepadconnected', () => {
  if (!padLoop) {
    padLoop = true;
    requestAnimationFrame(poll);
  }
});
