// Sectors (stages), upgrades and scoring values. No DOM here.

export const START_BALLS = 3;
export const MAX_BALLS = 6;
export const BALL_SAVE = 6; // seconds after launch
export const GRAVITY = 520;
export const MULTS = [1, 2, 3, 5];

// Base points for everything the ball can do.
export const POINTS = {
  bumper: 1000, sling: 110, drop: 2500, dropsAll: 25000, lane: 5000, lanesAll: 25000, spin: 150, star: 2500,
  wormhole: 30000, orbit: 20000, comet: 50000, ship: 10000, shipKill: 500000, hole: 40000, jackpot: 100000,
  supernova: 250000, combo: 10000, rubber: 10, post: 10, ramp: 25000,
};

// Each sector is a star system with its own palette, target and new trick.
export const SECTORS = [
  { name: 'RED DWARF', target: 400000, pal: { a: '#ff3b4e', b: '#ff9b2f', bg: '#1a0510', glow: '#ff6b4a' } },
  { name: 'YELLOW SUN', target: 2500000, pal: { a: '#ffd23f', b: '#ff9b2f', bg: '#1a1205', glow: '#fff3a8' }, unlock: 'lock' },
  { name: 'BLUE GIANT', target: 12000000, pal: { a: '#3fa9ff', b: '#7ff4ff', bg: '#050d1f', glow: '#7ff4ff' }, unlock: 'comet' },
  { name: 'PULSAR', target: 35000000, pal: { a: '#ff5ad1', b: '#7ff4ff', bg: '#12051a', glow: '#ff5ad1' }, unlock: 'hole' },
  { name: 'NEUTRON STAR', target: 90000000, pal: { a: '#c9d3ff', b: '#b35cff', bg: '#0c0a1e', glow: '#ffffff' }, unlock: 'ship' },
  { name: 'MAGNETAR', target: 200000000, pal: { a: '#3de07a', b: '#b35cff', bg: '#04140c', glow: '#8fffc0' } },
  { name: 'QUASAR', target: 450000000, pal: { a: '#ff9b2f', b: '#ff5ad1', bg: '#170816', glow: '#ffd23f' } },
  { name: 'SUPERNOVA', target: 900000000, pal: { a: '#ffffff', b: '#ffd23f', bg: '#1c0b05', glow: '#ffffff' } },
];
export const FINAL_SECTOR = SECTORS.length;

export function sectorFor(n) {
  if (n <= SECTORS.length) return SECTORS[n - 1];
  const last = SECTORS[SECTORS.length - 1];
  const hue = (n * 67) % 360;
  return { ...last, name: `DEEP SPACE ${n - SECTORS.length}`, target: Math.round(last.target * 2.5 ** (n - SECTORS.length) / 1e6) * 1e6, pal: { a: `hsl(${hue} 100% 65%)`, b: `hsl(${hue + 120} 100% 70%)`, bg: '#0a0514', glow: `hsl(${hue} 100% 80%)` } };
}

export const UNLOCKS = {
  lock: { name: 'WORMHOLE LOCK', desc: 'Sink the wormhole to lock a ball. Lock two for 3-ball multiball, then hit the star for jackpots.' },
  comet: { name: 'COMETS', desc: 'A comet streaks across the top of the table. Hit it for 50,000.' },
  hole: { name: 'BLACK HOLE', desc: 'A small black hole drifts around and bends your shots. Fall in for a gravity assist: double scoring.' },
  ship: { name: 'MOTHERSHIP', desc: 'An alien mothership patrols the top. Hit it until it blows up for 500,000.' },
};

// Upgrades: pick one of three after each sector.
export const UPGRADES = [
  { id: 'mega_bumpers', name: 'MEGA BUMPERS', desc: 'Bumpers score x3 and kick harder.' },
  { id: 'long_flippers', name: 'LONG FLIPPERS', desc: 'Flippers are 15% longer.' },
  { id: 'ball_saver', name: 'BALL SAVER', desc: '+8 seconds of ball save on every ball.' },
  { id: 'kickback', name: 'KICKBACK', desc: 'The left outlane fires the ball back up, once per ball.' },
  { id: 'magna', name: 'MAGNA-SAVE', desc: 'The right outlane catches and returns the ball, once per ball.' },
  { id: 'center_post', name: 'CENTER POST', desc: 'A post between the flippers for the first 30 seconds of each ball.' },
  { id: 'extra_ball', name: 'EXTRA BALLS', desc: '+2 balls right now.', repeat: true },
  { id: 'hot_slings', name: 'HOT SLINGS', desc: 'Slingshots score x20 and feed the star.' },
  { id: 'heavy_star', name: 'HEAVY STAR', desc: 'Star hits add double mass. Supernova comes sooner.' },
  { id: 'combo_king', name: 'COMBO KING', desc: 'Combos last a second longer and score double.' },
  { id: 'gold_spinner', name: 'GOLD SPINNER', desc: 'The spinner scores x8.' },
  { id: 'multi_plus', name: 'MULTIBALL+', desc: 'Every multiball and supernova adds one more ball.' },
  { id: 'jackpot_x2', name: 'JACKPOT X2', desc: 'Jackpots are worth double.' },
  { id: 'low_gravity', name: 'LOW GRAVITY', desc: 'Gravity drops 15%. Everything floats a little longer.' },
  { id: 'chain', name: 'CHAIN LIGHTNING', desc: 'Every bumper hit zaps the others for bonus points.' },
  { id: 'ghost_ball', name: 'GHOST BALL', desc: 'The first ball you lose each sector comes back.' },
  { id: 'score_x', name: 'OVERCLOCK', desc: 'All scoring x1.25. Stacks.', repeat: true },
  { id: 'long_nova', name: 'LONG NOVA', desc: 'Supernova lasts 10 seconds longer.' },
  { id: 'start_x2', name: 'HEAD START', desc: 'Each ball starts with the playfield multiplier at x2.' },
  { id: 'steady', name: 'STEADY HANDS', desc: 'Nudge twice as much before you tilt.' },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
