// kind: 'tether' catches, 'heal' restores HP, 'cure' clears a condition, 'revive'
// restarts a fainted drake, 'escape' flees a wild fight, 'evo' evolves, 'loot' sells,
// 'key' is a story item. price is the shop price; things sell for half.
const i = (name, kind, price, desc, fx = {}) => ({ name, kind, price, desc, ...fx });

export const ITEMS = {
  spike: i('Tether Spike', 'tether', 200, 'A neural tether that links a weakened wild drake to you.', { rate: 1 }),
  arc_spike: i('Arc Spike', 'tether', 600, 'A tether with an overclocked handshake. Better odds.', { rate: 1.5 }),
  void_spike: i('Void Spike', 'tether', 1200, 'Machined from meteor iron. Much better odds.', { rate: 2 }),
  heartlink: i('Heartlink', 'tether', 0, 'A tether cut from a Sovereign scale. It never fails.', { rate: 255, key: true }),
  patch: i('Nanopatch', 'heal', 200, 'A swarm of repair nanites. Restores 25 HP.', { hp: 25 }),
  patch_plus: i('Nanopatch+', 'heal', 700, 'Military-grade nanites. Restores 80 HP.', { hp: 80 }),
  rebuild: i('Full Rebuild', 'heal', 1800, 'Restores all HP and clears any condition.', { hp: 9999, cure: true }),
  reboot: i('Reboot Chip', 'cure', 250, 'Clears scorch, static, corruption and standby.', { cure: true }),
  restart: i('Restart Shard', 'revive', 1500, 'Restarts a fainted drake with half its HP.'),
  flare: i('Smoke Flare', 'escape', 300, 'Guarantees an escape from a wild drake.'),
  void_core: i('Void Core', 'evo', 3000, 'A cold, humming stone. Some void drakes crave it.'),
  scrap: i('Neon Scrap', 'loot', 300, 'Bent tubing, still faintly glowing. Brokers buy it.'),
  scale: i('Drake Scale', 'loot', 1000, 'A shed scale with circuitry grown into it. Worth good creds.'),
  shard: i('Star Shard', 'loot', 3000, 'A splinter of fallen star. Collectors pay a fortune.'),
  codex: i('Linker Codex', 'key', 0, 'Records every drake you see and link. Holds the island\'s legends too.', { key: true }),
};

export const SHOPS = {
  bazaar: ['spike', 'arc_spike', 'patch', 'patch_plus', 'reboot', 'flare'],
  foundry: ['spike', 'arc_spike', 'void_spike', 'patch', 'patch_plus', 'reboot', 'restart', 'flare'],
  night: ['arc_spike', 'void_spike', 'patch_plus', 'rebuild', 'reboot', 'restart', 'void_core'],
};
