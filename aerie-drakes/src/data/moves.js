// cat: 'phys' uses ATK/DEF, 'spec' uses SPC/SPC, 'status' deals no damage.
// fx: { status, chance } inflicts a condition; { stat, stages, self } shifts a stat;
// heal / drain / recoil are fractions; prio moves go first; crit raises crit odds.
const m = (name, type, cat, pow, acc, pp, desc, fx = {}) => ({ name, type, cat, pow, acc, pp, desc, ...fx });

export const MOVES = {
  // Plasma
  ember_byte: m('Ember Byte', 'plasma', 'spec', 40, 100, 25, 'A nip of live flame. May scorch.', { status: 'scorch', chance: 0.1 }),
  flare_claw: m('Flare Claw', 'plasma', 'phys', 65, 100, 20, 'Claws heated white. May scorch.', { status: 'scorch', chance: 0.1 }),
  heat_sink: m('Heat Sink', 'plasma', 'status', 0, 100, 20, 'Vents excess heat to sharpen focus. Raises SPC.', { stat: 'spc', stages: 1, self: true }),
  ignite: m('Ignite Protocol', 'plasma', 'status', 0, 85, 15, 'Sets the target smouldering: it is scorched.', { status: 'scorch', chance: 1 }),
  thermal_lance: m('Thermal Lance', 'plasma', 'spec', 90, 100, 15, 'A needle of reactor light. May scorch.', { status: 'scorch', chance: 0.1 }),
  reactor_burst: m('Reactor Burst', 'plasma', 'spec', 120, 100, 5, 'Dumps the whole core at once. Hurts the user too.', { recoil: 0.33 }),
  // Coolant
  mist_jet: m('Mist Jet', 'coolant', 'spec', 40, 100, 25, 'A cold, stinging spray.'),
  frost_fang: m('Frost Fang', 'coolant', 'phys', 65, 95, 15, 'A bite that frosts over. May lower SPD.', { stat: 'spd', stages: -1, chance: 0.2 }),
  condense: m('Condense', 'coolant', 'status', 0, 100, 20, 'Wraps itself in a shell of fog. Raises DEF.', { stat: 'def', stages: 1, self: true }),
  chill_mend: m('Chill Mend', 'coolant', 'status', 0, 100, 10, 'Slows its own systems to repair. Heals half its HP.', { heal: 0.5 }),
  cryo_beam: m('Cryo Beam', 'coolant', 'spec', 90, 100, 10, 'A beam at absolute zero. May lower SPD.', { stat: 'spd', stages: -1, chance: 0.2 }),
  coolant_flood: m('Coolant Flood', 'coolant', 'spec', 110, 85, 5, 'Opens every valve in the district.'),
  // Volt
  spark_nip: m('Spark Nip', 'volt', 'phys', 40, 100, 30, 'A quick, crackling bite. May cause static.', { status: 'static', chance: 0.1 }),
  static_field: m('Static Field', 'volt', 'status', 0, 90, 20, 'Fills the air with charge: the target gets static.', { status: 'static', chance: 1 }),
  surge_step: m('Surge Step', 'volt', 'phys', 40, 100, 30, 'Moves before the target can react.', { prio: 1 }),
  arc_lash: m('Arc Lash', 'volt', 'spec', 65, 100, 20, 'A whip of arcing current. May cause static.', { status: 'static', chance: 0.2 }),
  thunderbus: m('Thunderbus', 'volt', 'spec', 90, 100, 15, 'Rides the grid into the target. May cause static.', { status: 'static', chance: 0.1 }),
  overload: m('Overload', 'volt', 'spec', 120, 100, 5, 'Blows every breaker. Hurts the user too.', { recoil: 0.33 }),
  // Bio
  tendril_snap: m('Tendril Snap', 'bio', 'phys', 40, 100, 25, 'A whip of fibrous root.'),
  spore_cloud: m('Spore Cloud', 'bio', 'status', 0, 75, 15, 'Sleepy spores put the target on standby.', { status: 'standby', chance: 1 }),
  sap_leech: m('Sap Leech', 'bio', 'spec', 60, 100, 15, 'Drinks energy. Heals by half the damage.', { drain: 0.5 }),
  photosynth: m('Photosynth', 'bio', 'status', 0, 100, 10, 'Soaks up neon light. Heals half its HP.', { heal: 0.5 }),
  root_crush: m('Root Crush', 'bio', 'phys', 85, 100, 15, 'Roots burst from the deck plates.'),
  bloom_cannon: m('Bloom Cannon', 'bio', 'spec', 110, 85, 5, 'A blast of pressurised pollen.'),
  // Chrome
  rivet_shot: m('Rivet Shot', 'chrome', 'phys', 40, 100, 30, 'Spits a hot rivet.'),
  plate_up: m('Plate Up', 'chrome', 'status', 0, 100, 20, 'Bolts on extra armour. Sharply raises DEF.', { stat: 'def', stages: 2, self: true }),
  servo_rush: m('Servo Rush', 'chrome', 'status', 0, 100, 20, 'Overclocks its joints. Sharply raises SPD.', { stat: 'spd', stages: 2, self: true }),
  alloy_tail: m('Alloy Tail', 'chrome', 'phys', 75, 95, 15, 'A tail swing like a girder. May lower DEF.', { stat: 'def', stages: -1, chance: 0.3 }),
  magnet_rail: m('Magnet Rail', 'chrome', 'phys', 95, 100, 10, 'Fires itself down a magnetic rail.'),
  titan_press: m('Titan Press', 'chrome', 'phys', 120, 100, 5, 'Drops its full mass. Hurts the user too.', { recoil: 0.33 }),
  // Gale
  updraft: m('Updraft', 'gale', 'spec', 40, 100, 35, 'A sudden rising gust.'),
  tailwind: m('Tailwind', 'gale', 'status', 0, 100, 20, 'Catches the jetstream. Sharply raises SPD.', { stat: 'spd', stages: 2, self: true }),
  vector_strike: m('Vector Strike', 'gale', 'phys', 60, 1000, 20, 'Computes the perfect angle. Never misses.'),
  jet_slash: m('Jetstream Slash', 'gale', 'phys', 70, 100, 15, 'A cutting wind. High critical odds.', { crit: 1 }),
  cyclone: m('Cyclone', 'gale', 'spec', 90, 100, 10, 'A spinning column of storm.'),
  skydive: m('Skydive', 'gale', 'phys', 110, 90, 5, 'Falls from the upper air like a meteor.'),
  // Void
  shade_bite: m('Shade Bite', 'void', 'phys', 50, 100, 25, 'A bite from the dark side. May lower DEF.', { stat: 'def', stages: -1, chance: 0.2 }),
  snarl: m('Snarl', 'void', 'status', 0, 100, 30, 'A sound from very far away. Lowers ATK.', { stat: 'atk', stages: -1 }),
  gravity_well: m('Gravity Well', 'void', 'spec', 70, 100, 15, 'Folds space around the target. Lowers SPD.', { stat: 'spd', stages: -1, chance: 1 }),
  null_veil: m('Null Veil', 'void', 'status', 0, 100, 20, 'Wraps itself in starless dark. Sharply raises SPC.', { stat: 'spc', stages: 2, self: true }),
  event_horizon: m('Event Horizon', 'void', 'spec', 100, 95, 10, 'Nothing that goes in comes back quite whole.'),
  darkmatter: m('Darkmatter Crash', 'void', 'phys', 120, 85, 5, 'A charge of invisible mass.'),
  // Glitch
  bitflip: m('Bitflip', 'glitch', 'spec', 40, 100, 30, 'Flips a few bits. May corrupt.', { status: 'corrupt', chance: 0.1 }),
  scan: m('Deep Scan', 'glitch', 'status', 0, 100, 30, 'Maps every weak point. Lowers DEF.', { stat: 'def', stages: -1 }),
  kernel_panic: m('Kernel Panic', 'glitch', 'status', 0, 90, 15, 'Injects bad code: the target is corrupted.', { status: 'corrupt', chance: 1 }),
  packet_storm: m('Packet Storm', 'glitch', 'spec', 65, 100, 20, 'A flood of junk data. May corrupt.', { status: 'corrupt', chance: 0.3 }),
  datamosh: m('Datamosh', 'glitch', 'spec', 90, 100, 10, 'Smears the target across several frames.'),
  blue_screen: m('Blue Screen', 'glitch', 'status', 0, 65, 10, 'A hypnotic error: the target goes on standby.', { status: 'standby', chance: 1 }),
  zero_day: m('Zero Day', 'glitch', 'spec', 130, 80, 5, 'An exploit nobody has patched yet.'),
  // Signature moves
  sunforge: m('Sunforge', 'plasma', 'spec', 110, 95, 5, 'Solaraxis opens its chest-star. May scorch.', { status: 'scorch', chance: 0.3 }),
  absolute_zero: m('Absolute Zero', 'coolant', 'spec', 110, 95, 5, 'Cryoleviath stops every atom. Lowers SPD.', { stat: 'spd', stages: -1, chance: 1 }),
  canopy_crash: m('Canopy Crash', 'bio', 'phys', 110, 95, 5, 'Fungaroth drops a whole hillside. Heals a little.', { drain: 0.25 }),
  crucible: m('Crucible', 'chrome', 'phys', 110, 95, 5, 'Ferrodrax pours molten alloy. May scorch.', { status: 'scorch', chance: 0.3 }),
  quasar_beam: m('Quasar Beam', 'void', 'spec', 120, 90, 5, 'Twin beams from the poles of a dead star.'),
  heartfall: m('Heartfall', 'void', 'spec', 140, 90, 5, 'The Sovereign remembers how it fell.'),
};

export const STATUS_INFO = {
  scorch: { name: 'Scorched', tag: 'SCR', color: '#ff6b3d' },
  static: { name: 'Static', tag: 'STC', color: '#ffe23d' },
  corrupt: { name: 'Corrupted', tag: 'COR', color: '#ff4fd8' },
  standby: { name: 'Standby', tag: 'SBY', color: '#8a93c9' },
};

// Moves learned by type, in the order a drake picks them up.
export const POOLS = {
  plasma: ['ember_byte', 'heat_sink', 'flare_claw', 'ignite', 'thermal_lance', 'reactor_burst'],
  coolant: ['mist_jet', 'condense', 'frost_fang', 'chill_mend', 'cryo_beam', 'coolant_flood'],
  volt: ['spark_nip', 'static_field', 'surge_step', 'arc_lash', 'thunderbus', 'overload'],
  bio: ['tendril_snap', 'spore_cloud', 'sap_leech', 'photosynth', 'root_crush', 'bloom_cannon'],
  chrome: ['rivet_shot', 'plate_up', 'servo_rush', 'alloy_tail', 'magnet_rail', 'titan_press'],
  gale: ['updraft', 'tailwind', 'vector_strike', 'jet_slash', 'cyclone', 'skydive'],
  void: ['shade_bite', 'snarl', 'gravity_well', 'null_veil', 'event_horizon', 'darkmatter'],
  glitch: ['bitflip', 'scan', 'packet_storm', 'kernel_panic', 'datamosh', 'zero_day', 'blue_screen'],
};
