const gardens = [
  { name: 'First light', pulses: [4] },
  { name: 'Twin stars', pulses: [0, 8] },
  { name: 'Orchard moon', pulses: [1, 4, 7] },
  { name: 'Golden hour', pulses: [0, 2, 6, 8] },
  { name: 'Full bloom', pulses: [1, 3, 4, 5, 7] },
];
const garden = document.querySelector('#garden');
const next = document.querySelector('#next');
const status = document.querySelector('#status');
let stage = 0;
let moves = 0;
let flowers;

function pulse(center) {
  const row = Math.floor(center / 3);
  const col = center % 3;
  flowers = flowers.map((lit, i) =>
    Math.abs(Math.floor(i / 3) - row) + Math.abs(i % 3 - col) <= 1 ? !lit : lit);
}

function draw() {
  const won = flowers.every(Boolean);
  for (const [i, button] of [...garden.children].entries()) {
    button.textContent = flowers[i] ? '✿' : '◇';
    button.setAttribute('aria-pressed', flowers[i]);
  }
  const level = gardens[stage];
  status.textContent = (won ? 'Garden awake! ' : '') + level.name + ' · ' +
    moves + ' pulses · Par ' + level.pulses.length;
  next.hidden = !won;
  next.textContent = stage === gardens.length - 1 ? 'Play again' : 'Next garden';
}

function start() {
  moves = 0;
  flowers = Array(9).fill(true);
  for (const center of gardens[stage].pulses) pulse(center);
  draw();
}

for (let i = 0; i < 9; i++) {
  const flower = document.createElement('button');
  flower.setAttribute('aria-label', 'Flower ' + (i + 1));
  flower.addEventListener('click', () => {
    if (flowers.every(Boolean)) return;
    pulse(i);
    moves++;
    draw();
    if (!next.hidden) next.focus();
  });
  garden.append(flower);
}
document.querySelector('#reset').onclick = start;
next.onclick = () => {
  stage = (stage + 1) % gardens.length;
  start();
  garden.firstElementChild.focus();
};
document.addEventListener('gesturestart', event => event.preventDefault(), { passive: false });
start();
