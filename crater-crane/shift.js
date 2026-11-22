// World coordinates match the pixels of the yard.
export const bins = [52, 107, 160];
export const hoistTime = 0.36;
export const hotSocket = 6;

export function newShift() {
  return { time: 0, phase: 'seek', cargo: 0, loads: 0, misses: 0, hot: false,
    drop: null, event: null, note: '' };
}
export function hotBin(s) { return bins[(s.cargo + 1) % bins.length]; }
export function hook(s) { return 158 + 126 * Math.sin(s.time * (0.95 + s.loads * 0.09)); }
export function rover(s) { return 236 + 48 * Math.sin(s.time * 1.25); }

export function act(s) {
  if (s.phase === 'seek' || s.phase === 'carry') {
    s.drop = { x: hook(s), y: 80 };
    s.phase = s.phase === 'seek' ? 'lower' : 'fall';
  }
}
export function step(s, dt) {
  s.time += dt;
  if (s.phase === 'hoist') {
    if (s.time - s.event.time >= hoistTime) s.phase = 'carry';
    return;
  }
  if (s.phase !== 'lower' && s.phase !== 'fall') return;
  const lifting = s.phase === 'lower';
  s.drop.y += dt * (lifting ? 165 : 130);
  if (s.drop.y < (lifting ? 137 : 141)) return;
  const x = s.drop.x;
  if (lifting) s.hot = Math.abs(x - hotBin(s)) <= 5;
  if (lifting && (s.hot || Math.abs(x - bins[s.cargo]) <= 10)) {
    s.phase = 'hoist';
    s.event = { kind: 'catch', x, time: s.time };
    s.note = s.hot ? 'Overdrive cell secured.' : 'Cargo secured.';
  } else if (!lifting && Math.abs(x - rover(s)) <= (s.hot ? hotSocket : 15)) {
    const credit = s.hot ? 2 : 1;
    s.event = { kind: 'land', x, credit, time: s.time };
    s.loads = Math.min(4, s.loads + credit);
    s.cargo = (s.cargo + 1) % bins.length;
    s.phase = s.loads === 4 ? 'win' : 'seek';
    s.note = s.hot ? 'Core docked! Two loads.' : 'Freight received.';
    s.hot = false;
  } else {
    s.misses++;
    s.phase = s.misses === 3 ? 'lost' : 'seek';
    s.note = lifting ? 'Empty hook.' : s.hot ? 'Core missed the center socket.' : 'Missed the rover.';
    s.event = { kind: 'miss', x, time: s.time };
    s.hot = false;
  }
  s.drop = null;
}
