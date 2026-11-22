// World coordinates match the pixels of the yard. The crane runs on its own rail.
export const bins = [52, 107, 160];
export function newShift() {
  return { time: 0, phase: 'seek', cargo: 0, loads: 0, misses: 0, drop: null, note: '' };
}
export function hook(s) {
  return 158 + 126 * Math.sin(s.time * (0.95 + s.loads * 0.09));
}
export function rover(s) {
  return 236 + 48 * Math.sin(s.time * 1.25);
}
export function act(s) {
  if (s.phase === 'seek') {
    s.drop = { x: hook(s), y: 80 };
    s.phase = 'lower';
  } else if (s.phase === 'carry') {
    s.drop = { x: hook(s), y: 80 };
    s.phase = 'fall';
  }
}
export function step(s, dt) {
  s.time += dt;
  if (s.phase !== 'lower' && s.phase !== 'fall') return;
  const lifting = s.phase === 'lower';
  s.drop.y += dt * (lifting ? 165 : 130);
  if (s.drop.y < (lifting ? 137 : 141)) return;
  if (lifting && Math.abs(s.drop.x - bins[s.cargo]) <= 10) {
    s.phase = 'carry';
    s.note = 'Cell secured.';
  } else if (!lifting && Math.abs(s.drop.x - rover(s)) <= 15) {
    s.loads++;
    s.cargo = s.loads % bins.length;
    s.phase = s.loads === 4 ? 'win' : 'seek';
    s.note = 'Freight received.';
  } else {
    s.misses++;
    s.phase = s.misses === 3 ? 'lost' : 'seek';
    s.note = lifting ? 'Empty hook.' : 'Missed the rover.';
  }
  s.drop = null;
}
