import { POOLS } from './moves.js';

// Every drake on the Aerie, with the lore the Codex unlocks once you've linked one.
// stats: [HP, ATK, DEF, SPC, SPD]. art: parameters for the procedural sprite painter.
const s = (id, name, types, cls, stats, catchRate, exp, evo, art, habitat, size, lore, extra = []) => ({
  id, name, types, cls, stats, catchRate, exp, evo, art, habitat, size, lore, extra,
});

export const SPECIES = [
  s('kindlet', 'Kindlet', ['plasma'], 'Reactor Hatchling', [39, 52, 43, 60, 65], 45, 62, { lv: 16, to: 'scorchwing' },
    { kind: 'hatch', body: '#ff7a3a', belly: '#ffd27a', wing: '#c23a4c', accent: '#fff36b', horn: '#ffe9c2', eye: '#7ff4ff', tail: 'flame', horns: 1 },
    'Lowdeck reactor ducts', '0.4 m · 6 kg',
    'Kindlets hatch in the warm ducts under Lowdeck, where the first embers of the Sovereign settled after the Upfall. They sleep curled around live cables. The flame on a Kindlet\'s tail is a mood ring: blue when it is calm, white when it is furious, and a soft gold when it has decided you are family.'),
  s('scorchwing', 'Scorchwing', ['plasma', 'gale'], 'Afterburner Drake', [58, 64, 58, 80, 80], 45, 142, { lv: 34, to: 'solaraxis' },
    { kind: 'drake', body: '#f0582c', belly: '#ffc56b', wing: '#9a2440', accent: '#fff36b', horn: '#ffe9c2', eye: '#7ff4ff', tail: 'flame', horns: 2, spikes: 1, circuits: 1 },
    'Exhaust stacks and delivery lanes', '1.2 m · 38 kg',
    'Its wing membranes are lined with vented heat-sinks, and it flies by setting the air beneath itself on fire. Courier syndicates once raced Scorchwings between the spires, until the year a winner melted the finish line and three sponsors\' billboards with it.'),
  s('solaraxis', 'Solaraxis', ['plasma', 'gale'], 'Starcore Dragon', [78, 84, 78, 109, 100], 45, 240, null,
    { kind: 'drake', body: '#e8452a', belly: '#ffd98a', wing: '#7a1a3e', accent: '#fffbd0', horn: '#ffe9c2', eye: '#7ff4ff', tail: 'flame', horns: 3, spikes: 2, circuits: 2, chest: 1 },
    'The high thermals above the Spire', '2.6 m · 180 kg',
    'Lowdeck grandmothers say the first Solaraxis flew so high it touched the Sovereign while it was still falling, and came back with a star lodged in its chest. You can hear that star from a kilometre away: a low, steady hum the children call "the good engine".',
    [[1, 'sunforge']]),

  s('drizzlit', 'Drizzlit', ['coolant'], 'Condensate Hatchling', [44, 48, 65, 50, 43], 45, 63, { lv: 16, to: 'glacivane' },
    { kind: 'hatch', body: '#4ab8ff', belly: '#d8f6ff', wing: '#2a6fc9', accent: '#b8fff6', horn: '#e9fbff', eye: '#ff4fd8', tail: 'fin', horns: 0, frill: 1 },
    'Cloud-catcher nets on the island rim', '0.5 m · 8 kg',
    'Drizzlits live in the fog nets that ring the Aerie, drinking condensation straight out of the clouds. Their skin sweats a mild coolant, so server techs keep one curled on top of an overheating rack. It is the only job on the island that pays in cuddles.'),
  s('glacivane', 'Glacivane', ['coolant'], 'Frostvane Drake', [59, 63, 80, 65, 58], 45, 142, { lv: 34, to: 'cryoleviath' },
    { kind: 'drake', body: '#3aa0ec', belly: '#d8f6ff', wing: '#1e5aa8', accent: '#b8fff6', horn: '#e9fbff', eye: '#ff4fd8', tail: 'fin', horns: 2, spikes: 2, frill: 1 },
    'Rainshaft cooling towers', '1.4 m · 60 kg',
    'Frost crystals grow along a Glacivane\'s spine in neat rows, like the fins of a heat-sink. On the hottest days of the dry season, Bazaar merchants rent a resting Glacivane by the hour and sell cold noodles in its shade.'),
  s('cryoleviath', 'Cryoleviath', ['coolant', 'void'], 'Absolute-Zero Dragon', [79, 83, 100, 90, 78], 45, 239, null,
    { kind: 'drake', body: '#2a86d8', belly: '#e0f8ff', wing: '#1a3f8a', accent: '#d0fffa', horn: '#ffffff', eye: '#ff4fd8', tail: 'fin', horns: 3, spikes: 3, frill: 1, circuits: 1 },
    'Above the cloud line, where the air thins', '3.0 m · 240 kg',
    'Said to be the only drake that has left the atmosphere and come back. It survived by freezing the vacuum around itself into a shell it could breathe. When a Cryoleviath roars indoors, every screen in the room fogs over.',
    [[1, 'absolute_zero']]),

  s('sporlet', 'Sporlet', ['bio'], 'Spore Hatchling', [45, 49, 49, 65, 45], 45, 64, { lv: 16, to: 'mycoil' },
    { kind: 'hatch', body: '#5fd46a', belly: '#e8ffc9', wing: '#2e8a55', accent: '#ff7af0', horn: '#fff2c9', eye: '#ffe23d', tail: 'leaf', horns: 0, cap: 1 },
    'Helix vertical farms', '0.4 m · 7 kg',
    'Sporlets were an accident. A Sovereign ember fell through a Helix Dynamics vertical farm and landed in a nutrient vat; by morning the vat was full of small green drakes blinking at the night shift. They glow faintly when happy and very brightly when someone steps on their tail.'),
  s('mycoil', 'Mycoil', ['bio'], 'Mycelium Drake', [60, 62, 63, 80, 60], 45, 142, { lv: 34, to: 'fungaroth' },
    { kind: 'drake', body: '#44b35a', belly: '#e8ffc9', wing: '#236b40', accent: '#ff7af0', horn: '#fff2c9', eye: '#ffe23d', tail: 'leaf', horns: 1, cap: 1, circuits: 1 },
    'Cable ducts and root-choked alleys', '1.3 m · 55 kg',
    'Mycoil roots itself into the island\'s fibre lines while it sleeps and listens to the traffic passing through. Hackers call them "wet routers". More than one Helix secret has leaked because a Mycoil was dreaming out loud.'),
  s('fungaroth', 'Fungaroth', ['bio', 'glitch'], 'Canopy Dragon', [80, 82, 83, 100, 80], 45, 236, null,
    { kind: 'drake', body: '#37964c', belly: '#f0ffd8', wing: '#1c5436', accent: '#ff7af0', horn: '#fff2c9', eye: '#ffe23d', tail: 'leaf', horns: 2, cap: 2, circuits: 2, spikes: 1 },
    'Sleeping under whole districts', '3.4 m · 410 kg',
    'An old Fungaroth can sleep for decades and slowly become a hill. Three of the Aerie\'s districts are built on the backs of sleeping Fungaroths, and residents still pour sugar water down the storm drains for them on the first night of spring.',
    [[1, 'canopy_crash']]),

  s('zephlit', 'Zephlit', ['gale'], 'Updraft Hatchling', [40, 45, 40, 35, 56], 255, 50, { lv: 18, to: 'stratowing' },
    { kind: 'wyvern', body: '#8ee6d0', belly: '#f4fff9', wing: '#4ab0a4', accent: '#ffe23d', horn: '#ffffff', eye: '#ff6b3d', tail: 'fork', horns: 0, small: 1 },
    'Turbine ridges and exhaust thermals', '0.3 m · 2 kg',
    'Flocks of Zephlits ride the hot air rising from the city\'s exhaust stacks. At dusk they swirl around the turbines in huge murmurations that the traffic AIs have learned to route around.'),
  s('stratowing', 'Stratowing', ['gale', 'chrome'], 'Jetstream Wyvern', [70, 80, 75, 50, 91], 120, 150, null,
    { kind: 'wyvern', body: '#5fc9b8', belly: '#e8fff6', wing: '#9aa9c9', accent: '#ffe23d', horn: '#d9e2f5', eye: '#ff6b3d', tail: 'fork', horns: 2, circuits: 1 },
    'The airways between floating islands', '1.6 m · 30 kg',
    'Its flight feathers are laced with titanium it scrapes off old antennae. Before GPS came back online, sky-pilots navigated by Stratowing migrations: their routes trace the invisible airways between the floating islands.'),

  s('voltick', 'Voltick', ['volt'], 'Spark Critter', [35, 55, 30, 50, 90], 190, 60, { lv: 20, to: 'arcwyrm' },
    { kind: 'critter', body: '#ffd83a', belly: '#fff6c9', wing: '#b08a1a', accent: '#7ff4ff', horn: '#3a2a4a', eye: '#1a1030', tail: 'bolt', ears: 1 },
    'Junction boxes and cable runs', '0.3 m · 3 kg',
    'Voltick chew cable the way other animals chew grass. A single Voltick is a nuisance; a swarm can black out a district. Lowdeck kids trade shed Voltick teeth as batteries, and they really do work for about a week.'),
  s('arcwyrm', 'Arcwyrm', ['volt'], 'Storm Serpent', [60, 85, 55, 90, 110], 75, 158, null,
    { kind: 'serpent', body: '#f5c02a', belly: '#fff3b8', wing: '#8a6a10', accent: '#7ff4ff', horn: '#fff6c9', eye: '#1a1030', tail: 'bolt', horns: 2, frill: 1, circuits: 1 },
    'Lightning rods on the Spire', '2.8 m · 44 kg',
    'Arcwyrms coil around the Spire\'s lightning rods during storms and drink the strikes. Old folks say that\'s why lightning never hits the same tower twice on the Aerie: an Arcwyrm has already eaten the second one.'),

  s('pixlet', 'Pixlet', ['glitch'], 'Artifact Hatchling', [40, 35, 40, 70, 60], 190, 61, { lv: 22, to: 'glitchara' },
    { kind: 'hatch', body: '#ff4fd8', belly: '#ffd0f6', wing: '#7a2ad8', accent: '#3ff7ff', horn: '#ffffff', eye: '#3ff7ff', tail: 'pixel', horns: 0, glitch: 1 },
    'Broken holo-billboards', '0.3 m · ? kg',
    'Pixlets show up wherever a holo-ad malfunctions. Half of one is never quite rendered, and its weight changes depending on who is holding the scale. Touch one and a faint checkerboard pattern stays on your palm for about an hour.'),
  s('glitchara', 'Glitchara', ['glitch', 'void'], 'Corruption Dragon', [60, 60, 60, 110, 95], 60, 172, null,
    { kind: 'serpent', body: '#e83ac8', belly: '#ffd0f6', wing: '#5a1ab0', accent: '#3ff7ff', horn: '#ffffff', eye: '#3ff7ff', tail: 'pixel', horns: 2, glitch: 2, frill: 1 },
    'Dead zones in the city net', '2.0 m · ?? kg',
    'Glitchara exist in several frames at once. Photos of the same Glitchara, taken at the same moment, show it in different poses. Helix net-security lists it as a Class-A threat, which Glitchara seem to find very funny.'),

  s('boltnib', 'Boltnib', ['chrome'], 'Rivet Hatchling', [45, 60, 70, 25, 30], 190, 60, { lv: 18, to: 'rivetaur' },
    { kind: 'mech', body: '#9aa8c4', belly: '#dfe6f5', wing: '#5a6684', accent: '#ff6b3d', horn: '#ffe23d', eye: '#ff6b3d', tail: 'plug', horns: 1, small: 1 },
    'Scrapyards around the Foundry', '0.5 m · 40 kg',
    'Boltnibs nest in scrapyards and swallow bolts, washers and the occasional wrench to build their armour from the inside out. A Foundry crew can tell whose Boltnib it is by the brand of the screws rattling in its belly.'),
  s('rivetaur', 'Rivetaur', ['chrome'], 'Foundry Drake', [65, 85, 100, 40, 40], 90, 148, { trade: true, to: 'ferrodrax' },
    { kind: 'mech', body: '#7f8eae', belly: '#dfe6f5', wing: '#4a5574', accent: '#ff6b3d', horn: '#ffe23d', eye: '#ff6b3d', tail: 'plug', horns: 2, spikes: 1 },
    'Foundry floors and slag fields', '1.5 m · 310 kg',
    'Foundry workers paint their Rivetaurs\' plates in crew colours. A Rivetaur can only reforge itself when it is broken down and rebuilt: send it through a Relay Loop and it comes back as something much hotter.'),
  s('ferrodrax', 'Ferrodrax', ['chrome', 'plasma'], 'Forge Dragon', [85, 115, 120, 60, 55], 45, 242, null,
    { kind: 'mech', body: '#6a7896', belly: '#ffb86b', wing: '#3a4462', accent: '#ff6b3d', horn: '#ffe23d', eye: '#fff36b', tail: 'flame', horns: 3, spikes: 2, circuits: 1 },
    'The heart of the Chrome Foundry', '2.4 m · 900 kg',
    'Ferrodrax carries a working forge in its belly. The Chrome Foundry was built around a single sleeping Ferrodrax the workers call Old Crucible, and every girder on the Aerie was once poured from its breath.',
    [[1, 'crucible']]),

  s('nebulurk', 'Nebulurk', ['void'], 'Nebula Hatchling', [45, 40, 45, 70, 55], 120, 66, { lv: 25, to: 'umbrastar' },
    { kind: 'hatch', body: '#3a2a8a', belly: '#6a58c9', wing: '#1e1450', accent: '#ffffff', horn: '#b9a8ff', eye: '#ffe23d', tail: 'orb', horns: 2, stars: 1 },
    'Falls with meteor showers', '0.5 m · 5 kg',
    'Nebulurks fall out of the sky during meteor showers, still warm. Their skin holds a tiny starfield that doesn\'t match any sky you can see from the Aerie. Observatory staff have been trying to map it for forty years.'),
  s('umbrastar', 'Umbrastar', ['void'], 'Eclipse Dragon', [75, 70, 70, 110, 90], 45, 175, null,
    { kind: 'wyvern', body: '#2e1f78', belly: '#5a48b8', wing: '#2a1a6a', accent: '#ffffff', horn: '#b9a8ff', eye: '#ffe23d', tail: 'orb', horns: 3, stars: 2, circuits: 1 },
    'Nightside rooftops', '2.2 m · 70 kg',
    'Wherever an Umbrastar flies, streetlights go out one by one beneath it. The Observatory believes Umbrastars are juveniles of the same kind as the Sovereign, which would mean the Sovereign was once small enough to hold.'),

  s('brinesnap', 'Brinesnap', ['coolant'], 'Canal Eel-drake', [50, 65, 45, 45, 60], 190, 64, { lv: 22, to: 'tidecoil' },
    { kind: 'serpent', body: '#2ac9b8', belly: '#c9fff4', wing: '#137a80', accent: '#ffe23d', horn: '#e9fffb', eye: '#ff3a5a', tail: 'fin', horns: 0, frill: 1, small: 1 },
    'Rainshaft coolant canals', '0.9 m · 9 kg',
    'Brinesnaps live in the coolant canals of the Rainshaft and bite maintenance drones on sight. Canal workers wear rubber boots two sizes too big, so a Brinesnap only gets rubber.'),
  s('tidecoil', 'Tidecoil', ['coolant', 'volt'], 'Current Leviathan', [85, 90, 70, 80, 70], 60, 170, null,
    { kind: 'serpent', body: '#1aa8a8', belly: '#c9fff4', wing: '#0e5a70', accent: '#ffe23d', horn: '#e9fffb', eye: '#ff3a5a', tail: 'fin', horns: 2, frill: 1, circuits: 2 },
    'Deep Rainshaft channels', '4.1 m · 120 kg',
    'Tidecoils generate power as they swim. Most of the Rainshaft\'s lights run on Tidecoils pacing the canals, and when one gets sick, the whole district dims in sympathy.'),

  s('cablemite', 'Cablemite', ['bio', 'volt'], 'Wire-nest Critter', [40, 45, 45, 40, 55], 255, 48, { lv: 17, to: 'wirehive' },
    { kind: 'critter', body: '#7ac94a', belly: '#e8ffc9', wing: '#3a7a2a', accent: '#ffe23d', horn: '#2a3a1a', eye: '#ff3a5a', tail: 'plug', antennae: 1 },
    'Fiberfields and cable gardens', '0.2 m · 1 kg',
    'Cablemites spin nests out of stripped copper filament. A colony\'s nests link up into a living network that routes signal better than most commercial hardware, so the Fiberfields have terrible reception whenever it rains and the colony moves indoors.'),
  s('wirehive', 'Wirehive', ['bio', 'volt'], 'Hive Drake', [65, 70, 75, 75, 80], 120, 150, null,
    { kind: 'wyvern', body: '#5aa83a', belly: '#e8ffc9', wing: '#b8ffea', accent: '#ffe23d', horn: '#2a3a1a', eye: '#ff3a5a', tail: 'plug', horns: 0, antennae: 1, circuits: 2 },
    'Old relay towers', '1.1 m · 22 kg',
    'Every Wirehive is thousands of Cablemites fused into one mind. Its buzz is a data stream. Decoded, it is the same six notes over and over, and nobody knows what they mean.'),

  s('flarekite', 'Flarekite', ['plasma', 'gale'], 'Kite Drake', [60, 65, 55, 75, 95], 75, 158, null,
    { kind: 'wyvern', body: '#ff5a7a', belly: '#ffd0da', wing: '#ffb13a', accent: '#fff36b', horn: '#ffffff', eye: '#3ff7ff', tail: 'ribbon', horns: 1 },
    'Festival skies over Turbine Ridge', '1.0 m · 4 kg',
    'Every Festival of Embers, children fly Flarekites on long silk tethers like kites. Every year the Flarekites slip their lines at midnight and vanish. Every year they come back for the next festival, as if they had simply been waiting to be invited.'),

  s('hexadrake', 'Hexadrake', ['glitch', 'chrome'], 'Firewall Drake', [70, 80, 95, 85, 60], 45, 175, null,
    { kind: 'mech', body: '#3a3f5a', belly: '#9aa8c4', wing: '#1e2236', accent: '#3ff7ff', horn: '#ff4fd8', eye: '#3ff7ff', tail: 'pixel', horns: 2, glitch: 1, circuits: 2 },
    'Helix server farms', '1.8 m · 260 kg',
    'Helix Dynamics engineered the Hexadrake to guard its servers. A few escaped into the Foundry\'s slag fields, where they now guard nothing in particular with total dedication. They attack anything that looks like a password.'),

  s('comettail', 'Comettail', ['void', 'plasma'], 'Comet Hatchling', [50, 55, 45, 70, 70], 60, 70, { item: 'void_core', to: 'quasarath' },
    { kind: 'cosmic', body: '#4a3ab0', belly: '#9ad8ff', wing: '#241a6a', accent: '#ffb13a', horn: '#fff6c9', eye: '#ffffff', tail: 'comet', horns: 1, stars: 1, small: 1 },
    'Nightside skies after midnight', '0.7 m · 3 kg',
    'Comettails trail a thin line of burning dust wherever they go. Astronomers used to mistake them for real comets until one landed on the Observatory dome and asked, as politely as a drake can, for a snack.'),
  s('quasarath', 'Quasarath', ['void', 'plasma'], 'Quasar Dragon', [85, 90, 75, 120, 100], 30, 245, null,
    { kind: 'cosmic', body: '#2a1f8a', belly: '#8ad0ff', wing: '#120c4a', accent: '#ffb13a', horn: '#fff6c9', eye: '#ffffff', tail: 'comet', horns: 3, stars: 2, halo: 1, circuits: 1 },
    'Deep sky, very rarely', '3.6 m · 90 kg',
    'Quasarath fires two beams of light from the poles of its body, bright enough to see from the ground at noon. The oldest legends name it the Sovereign\'s herald: it flew ahead of the great dragon as it fell, warning the world below.',
    [[1, 'quasar_beam']]),

  s('neonewt', 'Neonewt', ['glitch', 'volt'], 'Sign Lizard', [55, 50, 55, 85, 90], 90, 150, null,
    { kind: 'critter', body: '#3ff7ff', belly: '#e0fffe', wing: '#1a8aa8', accent: '#ff4fd8', horn: '#ffffff', eye: '#ff4fd8', tail: 'ribbon', frill: 1, circuits: 2 },
    'Inside neon signs', '0.4 m · 1 kg',
    'Neonewts live inside neon tubes and eat the light. Sign-makers consider a Neonewt in the tubing good luck, even though it means the second letter of the sign will flicker forever.'),
  s('smogmaw', 'Smogmaw', ['void', 'bio'], 'Exhaust Drake', [90, 70, 80, 60, 40], 90, 160, null,
    { kind: 'drake', body: '#5a5a6e', belly: '#a8e0a0', wing: '#34344a', accent: '#8aff7a', horn: '#c9c9d8', eye: '#ffe23d', tail: 'orb', horns: 2, spikes: 2, stout: 1 },
    'Foundry smokestacks', '1.9 m · 320 kg',
    'Smogmaw inhales soot and exhales clean, faintly minty air. The Foundry keeps a pair near every smokestack. Helix once tried to patent one; the patent office\'s air filters have never been the same.'),

  s('sovereign', 'Aether Sovereign', ['void', 'gale'], 'Heartcore Dragon', [106, 100, 100, 130, 110], 3, 306, null,
    { kind: 'cosmic', body: '#1c1450', belly: '#7ff4ff', wing: '#3a2a9a', accent: '#7ff4ff', horn: '#ffe9c2', eye: '#fff36b', tail: 'comet', horns: 4, stars: 3, halo: 2, circuits: 2, wings: 1, big: 1 },
    'The Heartcore, under the Spire', '41 m · unknown',
    'Three hundred years ago a star-dragon fell out of orbit, tore a mountain from the continent and lifted it into the sky. Its body became the island; its heart, still beating, became the gravity engine that keeps the Aerie afloat. Every drake alive is said to be born from one of its embers. It is not dead. It is asleep, and it dreams of going home.',
    [[1, 'heartfall']]),
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((sp, i) => [sp.id, Object.assign(sp, { no: i + 1 })]));

/** Level-up moves: the primary current's pool, a little of the second, plus signatures. */
export function learnset(sp) {
  if (sp._learn) return sp._learn;
  const out = [];
  const LV1 = [1, 1, 7, 12, 19, 29, 41];
  POOLS[sp.types[0]].forEach((mv, i) => out.push([LV1[i] ?? 46, mv]));
  if (sp.types[1]) {
    const p = POOLS[sp.types[1]];
    out.push([9, p[0]], [22, p[2]], [35, p[4]]);
  }
  for (const e of sp.extra) out.push(e);
  // Signature moves (extra) are also taught on evolution and always kept in generated movesets.
  sp._learn = out.sort((a, b) => a[0] - b[0]);
  return sp._learn;
}
