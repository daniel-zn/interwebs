// The eight currents every drake is born into. Attacker -> defender multipliers;
// anything not listed is 1x.
export const TYPES = ['plasma', 'coolant', 'volt', 'bio', 'chrome', 'gale', 'void', 'glitch'];

export const TYPE_INFO = {
  plasma: { name: 'Plasma', color: '#ff6b3d', blurb: 'Reactor heat and living flame.' },
  coolant: { name: 'Coolant', color: '#4fd8ff', blurb: 'Fog, frost and the canal tides.' },
  volt: { name: 'Volt', color: '#ffe23d', blurb: 'Current stolen from the grid.' },
  bio: { name: 'Bio', color: '#6dff7a', blurb: 'Wetware, spores and vat-grown roots.' },
  chrome: { name: 'Chrome', color: '#b9c6e0', blurb: 'Alloy, rivets and servo muscle.' },
  gale: { name: 'Gale', color: '#9ff0d8', blurb: 'The high winds around the Aerie.' },
  void: { name: 'Void', color: '#9b6bff', blurb: 'Starlight and the dark between it.' },
  glitch: { name: 'Glitch', color: '#ff4fd8', blurb: 'Corrupted signal that learned to bite.' },
};

const CHART = {
  plasma: { bio: 2, chrome: 2, coolant: 0.5, plasma: 0.5, void: 0.5 },
  coolant: { plasma: 2, gale: 2, coolant: 0.5, bio: 0.5 },
  volt: { coolant: 2, gale: 2, bio: 0.5, volt: 0.5, void: 0.5 },
  bio: { coolant: 2, volt: 2, plasma: 0.5, gale: 0.5, chrome: 0.5, bio: 0.5 },
  chrome: { coolant: 2, gale: 2, plasma: 0.5, volt: 0.5, chrome: 0.5 },
  gale: { bio: 2, glitch: 2, chrome: 0.5, volt: 0.5 },
  void: { glitch: 2, volt: 2, void: 0.5, plasma: 0.5 },
  glitch: { chrome: 2, bio: 2, void: 2, glitch: 0.5 },
};

export function effectiveness(moveType, defTypes) {
  let m = 1;
  for (const t of defTypes) m *= CHART[moveType][t] ?? 1;
  return m;
}
