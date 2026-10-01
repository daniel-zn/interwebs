// The Aerie: one big outdoor map (built in code from rectangles, so it's easy to
// edit) plus small interiors drawn as ASCII. Everything story-related (NPCs,
// trainers, triggers, gates) is declared here and run by story.js.
import { T } from './tiles.js';
import { hash, mulberry32 } from '../util.js';

export const W = 64, H = 104;

// ------------------------------------------------------------------ encounters
// [species, minLv, maxLv, weight]
const ENC = {
  fiber: [['cablemite', 2, 4, 35], ['zephlit', 2, 4, 30], ['voltick', 3, 5, 20], ['pixlet', 3, 5, 10], ['nebulurk', 4, 4, 5]],
  turbine: [['zephlit', 9, 12, 30], ['voltick', 10, 12, 20], ['cablemite', 10, 12, 18], ['pixlet', 10, 13, 15], ['flarekite', 11, 13, 12], ['stratowing', 14, 14, 5]],
  foundry: [['boltnib', 13, 16, 35], ['pixlet', 14, 16, 15], ['voltick', 13, 15, 12], ['smogmaw', 15, 17, 12], ['wirehive', 17, 18, 11], ['hexadrake', 16, 17, 10], ['rivetaur', 18, 18, 5]],
  rain: [['brinesnap', 19, 23, 35], ['nebulurk', 21, 23, 15], ['stratowing', 22, 24, 15], ['voltick', 20, 22, 15], ['pixlet', 20, 22, 10], ['glitchara', 24, 24, 5], ['tidecoil', 25, 25, 5]],
  night: [['nebulurk', 24, 27, 30], ['comettail', 25, 27, 15], ['glitchara', 26, 28, 15], ['stratowing', 26, 27, 15], ['smogmaw', 26, 27, 10], ['pixlet', 25, 26, 10], ['umbrastar', 28, 29, 5]],
  summit: [['stratowing', 32, 35, 20], ['arcwyrm', 32, 35, 20], ['flarekite', 32, 34, 20], ['umbrastar', 32, 34, 15], ['glitchara', 32, 34, 15], ['tidecoil', 33, 33, 7], ['quasarath', 36, 36, 3]],
};

// ------------------------------------------------------------------ trainers
// team entries: [species, level]; 'RIVAL' is replaced by the rival's starter line.
export const TRAINERS = {
  rival1: { name: 'Kestrel', look: 'rival', team: [['RIVAL1', 5]], creds: 300, rival: true,
    lose: ['...Okay. Okay! Beginner\'s luck. Next time I\'m bringing snacks for my drake AND a strategy.'] },
  jax: { name: 'Runner Jax', look: 'runner', team: [['zephlit', 4], ['voltick', 5]], creds: 200,
    intro: ['Hey! Fresh tether on your belt? That means we fight. That\'s the rule. I just made it up.'],
    lose: ['Aw, scrap. You\'re quick.'], after: ['Every drake came from the Sovereign\'s embers. Even my little Zephlit. Wild, right?'] },
  mei: { name: 'Botanist Mei', look: 'botanist', team: [['cablemite', 5], ['pixlet', 6]], creds: 240,
    intro: ['Mind the fibre grass! Drakes nest in it. So do my experiments.'],
    lose: ['My samples! Fine, fine, you win.'], after: ['Cablemites turn the whole field into a network. You can hear it hum at night.'] },
  dex: { name: 'Apprentice Dex', look: 'hacker', team: [['voltick', 9], ['cablemite', 10]], creds: 420,
    intro: ['You want Warden Volta? Get through the current first!'], lose: ['Ow. Short circuit.'], after: ['Bio drakes ground out a Volt drake\'s charge. Just saying.'] },
  volta: { name: 'Warden Volta', look: 'volta', team: [['voltick', 11], ['cablemite', 11], ['arcwyrm', 13]], creds: 1300, warden: 'sigil1', music: 'warden',
    intro: ['So you\'re the new linker Vance keeps pinging me about.', 'I keep the Current Sigil. Twenty years I\'ve held the Arc Dojo, and I have never once been bored.', 'Let\'s see if you can change that. Full voltage!'],
    lose: ['Ha! Now THAT woke me up.', 'Take the Current Sigil. It opens the Wind Bridge east of the plaza, and it\'s one third of a key to something very old.'],
    after: ['The Sigils were cut after the Blackout War, so no one person could ever reach the Heartcore alone. Remember that.'] },
  rival2: { name: 'Kestrel', look: 'rival', team: [['stratowing', 15], ['pixlet', 15], ['RIVAL2', 17]], creds: 900, rival: true,
    intro: ['There you are! I beat the wind turbines. Well, I raced them. Well, I watched them.', 'Anyway, my drake evolved. Want to see?'],
    lose: ['Again?! Ugh, fine. You\'re good. Don\'t tell anyone I said that.', 'Hey... Helix trucks have been going up to the Foundry all week. Something\'s off. Watch yourself.'] },
  rae: { name: 'Pilot Rae', look: 'pilot', team: [['zephlit', 12], ['flarekite', 13]], creds: 520,
    intro: ['The ridge wind is perfect today. Perfect for losing, I mean. For you!'], lose: ['Blown away.'], after: ['Stratowings fly the old airways between the islands. Yes, there are other islands. Far away.'] },
  oku: { name: 'Scrapper Oku', look: 'worker', team: [['boltnib', 12], ['voltick', 12]], creds: 480,
    intro: ['Scrap rights on this ridge are mine!'], lose: ['Keep your scrap then.'], after: ['Neon Scrap sells for good creds in the Bazaar. I\'m just saying, if you find some.'] },
  lune: { name: 'Mystic Lune', look: 'mystic', team: [['pixlet', 13], ['nebulurk', 13]], creds: 520,
    intro: ['The stars told me you\'d come this way. They also told me to battle you.'], lose: ['The stars were vague about the ending.'], after: ['Nebulurks fall with the meteors. Their skin shows a sky nobody on the Aerie has ever seen.'] },
  grunt1: { name: 'Helix Grunt', look: 'grunt', team: [['pixlet', 15], ['voltick', 16]], creds: 600,
    intro: ['Helix Dynamics property. Move along, linker.', 'Oh, you\'re not moving along. Fine!'], lose: ['This is going in my incident report.'], after: ['Director Kade says the Heartcore is "under-utilised". Whatever that means.'] },
  grunt2: { name: 'Helix Grunt', look: 'grunt', team: [['smogmaw', 16], ['boltnib', 16]], creds: 620,
    intro: ['We\'re just... inspecting the smokestacks. With our drakes. Aggressively.'], lose: ['Ugh. Overtime for this.'], after: ['The Sigils are the only thing between the Director and the Heartcore. Wardens are so stubborn.'] },
  brun: { name: 'Welder Brun', look: 'worker', team: [['boltnib', 18], ['rivetaur', 19]], creds: 700,
    intro: ['Warden Ferra forges her linkers in the heat. Let\'s see if you melt.'], lose: ['Solid work.'], after: ['Plasma melts Chrome. Glitch hacks it. Our plates don\'t care about much else.'] },
  ferra: { name: 'Warden Ferra', look: 'ferra', team: [['rivetaur', 21], ['hexadrake', 21], ['ferrodrax', 24]], creds: 2400, warden: 'sigil2', music: 'warden',
    intro: ['Old Crucible\'s been restless. Helix has been sniffing round my Foundry for weeks.', 'I don\'t hand the Alloy Sigil to just anyone. Show me you\'re made of something that doesn\'t bend.'],
    lose: ['...Hah. Tempered.', 'The Alloy Sigil is yours. It unlocks the gate north of Turbine Ridge, into the Rainshaft.', 'And linker, if Helix starts moving on the Spire, you come find the wardens. Understood?'],
    after: ['Ferrodrax only reforges through a Relay Loop. The kiosk in the Bazaar has one.'] },
  oda: { name: 'Canal Keeper Oda', look: 'worker', team: [['brinesnap', 22], ['brinesnap', 23], ['tidecoil', 24]], creds: 900,
    intro: ['The canals are MY beat. Mind the Brinesnaps. And me.'], lose: ['Soaked.'], after: ['Tidecoils light the whole Rainshaft. When one gets sick, we all feel it.'] },
  nix: { name: 'Hacker Nix', look: 'hacker', team: [['pixlet', 23], ['glitchara', 25]], creds: 950,
    intro: ['Scanning... scanning... target acquired. It\'s you. Let\'s battle.'], lose: ['Segfault.'], after: ['Helix encrypted the Spire doors with the Sigil keys. Clever. Annoying.'] },
  grunt3: { name: 'Helix Grunt', look: 'grunt', team: [['smogmaw', 24], ['hexadrake', 24]], creds: 900,
    intro: ['The Rainshaft is a restricted zone as of this morning. Says who? Says Helix!'], lose: ['Restricted from winning, apparently.'], after: ['We\'re all going up the Spire soon. Director\'s orders.'] },
  pell: { name: 'Stargazer Pell', look: 'mystic', team: [['nebulurk', 27], ['comettail', 28]], creds: 1100,
    intro: ['Shh. The warden is reading the sky. You\'ll have to get past me first.'], lose: ['A shooting star. That was you.'], after: ['Void drakes swallow Volt and Glitch. But Glitch bites back.'] },
  nyx: { name: 'Warden Nyx', look: 'nyx', team: [['nebulurk', 30], ['glitchara', 30], ['umbrastar', 32], ['quasarath', 33]], creds: 3300, warden: 'sigil3', music: 'warden',
    intro: ['I have watched the Sovereign\'s heartbeat on these instruments for thirty years.', 'Last night it skipped. Someone is trying to wake it.', 'Show me that the last Sigil belongs with you, and not with them.'],
    lose: ['...Yes. You\'ll do.', 'The Night Sigil. With all three, the Summit gate will open for you.', 'And take this. The Heartlink. A tether cut from a scale the Sovereign shed when it fell. If it must be linked, let it be linked to someone kind.'],
    after: ['Go. Kade is already on the Summit.'] },
  grunt4: { name: 'Helix Grunt', look: 'grunt', team: [['smogmaw', 27], ['glitchara', 28]], creds: 1000,
    intro: ['No stargazing tonight. Helix has the Observatory under "consultation".'], lose: ['I\'ll consult my supervisor.'], after: ['Don\'t go up the Summit. Seriously. Kade gets weird about the Heartcore.'] },
  enforcer1: { name: 'Helix Enforcer', look: 'grunt', team: [['hexadrake', 34], ['smogmaw', 34]], creds: 1500,
    intro: ['The Summit is sealed by order of Helix Dynamics.'], lose: ['Security breach at the Summit! Oh wait, I\'m the security.'], after: ['The Director is inside. He\'s been talking to the heart for hours.'] },
  enforcer2: { name: 'Helix Enforcer', look: 'grunt', team: [['umbrastar', 34], ['rivetaur', 35]], creds: 1500,
    intro: ['Turn back. This is bigger than you.'], lose: ['...Maybe not bigger than you.'], after: ['If the heart stops, does the island fall? Kade says it rises. Kade says a lot of things.'] },
  rival3: { name: 'Kestrel', look: 'rival', team: [['stratowing', 36], ['glitchara', 36], ['arcwyrm', 37], ['RIVAL3', 39]], creds: 3000, rival: true, music: 'warden',
    intro: ['I figured you\'d come. I got here first, for once.', 'Before you go in there, I need to know you can actually stop him. So: one last battle. Everything we\'ve got.'],
    lose: ['...Yeah. Yeah, you can stop him.', 'Go. I\'ll hold the door against the enforcers. And hey. Link it gently.'] },
  kade: { name: 'Director Kade', look: 'kade', team: [['hexadrake', 38], ['smogmaw', 38], ['glitchara', 39], ['ferrodrax', 40], ['quasarath', 41]], creds: 8000, music: 'boss',
    intro: ['Ah. The Sigil-bearer. The wardens send a child to do an institution\'s work.', 'Do you know what this is? Four hundred terawatts, beating once a minute, holding up a mountain. And we spend it on floating.', 'Helix will put that heart to work. Turn the Aerie into a launch platform. Take us all back to the stars it came from.', 'Your Sigils, please. Or your defeat. Either is fine.'],
    lose: ['...Impossible. The projections were flawless.', 'You don\'t understand. It WANTS to go home. I was only going to help it.'] },
};

// ------------------------------------------------------------------ building styles
const STYLE = {
  home: { roof: '#3a2f6a', wall: '#262048', neon: '#ff4fd8', sign: null },
  lab: { roof: '#2a4a6a', wall: '#1a2a44', neon: '#6dff7a', sign: 'HATCHERY' },
  clinic: { roof: '#2a6a5a', wall: '#1a3a3a', neon: '#6dff7a', sign: 'PATCH DEN' },
  mart: { roof: '#6a4a2a', wall: '#3a2a1a', neon: '#ffe23d', sign: 'NEO-MART' },
  kiosk: { roof: '#5a2a6a', wall: '#2e1a3e', neon: '#3ff7ff', sign: 'TRADE' },
  dojo: { roof: '#6a5a1a', wall: '#3a3010', neon: '#ffe23d', sign: 'ARC DOJO' },
  foundry: { roof: '#4a4a5a', wall: '#2a2a36', neon: '#ff6b3d', sign: 'FOUNDRY' },
  observatory: { roof: '#2a1f5a', wall: '#140c3a', neon: '#b9a8ff', sign: 'OBSERVATORY' },
  house: { roof: '#4a2a4a', wall: '#2a1a2e', neon: '#ff6b3d', sign: null },
  stall: { roof: '#8a2a3a', wall: '#3a1a1a', neon: '#ffe23d', sign: 'NOODLES' },
  spire: { roof: '#1a1a2a', wall: '#0e0e16', neon: '#7ff4ff', sign: 'HELIX' },
};

// ------------------------------------------------------------------ outdoor map
function buildOutdoor() {
  const tiles = new Uint8Array(W * H);
  const rng = mulberry32(hash('aerie'));
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.VOID : tiles[y * W + x]);
  const set = (x, y, t) => {
    if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t;
  };
  const fill = (x0, y0, x1, y1, t) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t);
  };
  /** Only overwrites plain ground, so paths and buildings survive decoration. */
  const deco = (x0, y0, x1, y1, t) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ([T.DECK, T.MOSS].includes(at(x, y))) set(x, y, t);
  };
  const scatter = (x0, y0, x1, y1, t, n) => {
    for (let k = 0; k < n; k++) {
      const x = x0 + Math.floor(rng() * (x1 - x0 + 1)), y = y0 + Math.floor(rng() * (y1 - y0 + 1));
      if ([T.DECK, T.MOSS].includes(at(x, y))) set(x, y, t);
    }
  };
  const buildings = [];
  const warps = [];
  const bld = (x, y, w, h, style, door, to, label) => {
    fill(x, y, x + w - 1, y + h - 1, T.BLDG);
    if (door) {
      set(door[0], door[1], T.DOOR);
      warps.push({ x: door[0], y: door[1], to, tx: null, ty: null });
    }
    buildings.push({ x, y, w, h, ...STYLE[style], sign: label ?? STYLE[style].sign, door, style });
  };

  // Landmasses (each zone), ragged edges come from the renderer's cliffs.
  fill(4, 85, 29, 99, T.DECK); // A Lowdeck
  fill(6, 60, 25, 84, T.MOSS); // B Fiberfields
  fill(3, 40, 31, 59, T.DECK); // C Neon Bazaar
  fill(33, 44, 59, 57, T.MOSS); // D Turbine Ridge
  fill(38, 60, 60, 84, T.DECK); // E Chrome Foundry
  fill(34, 18, 59, 42, T.MOSS); // F Rainshaft
  fill(5, 16, 31, 38, T.DECK); // G Nightside
  fill(12, 2, 40, 14, T.DECK); // H Summit
  // A few extra lumps so the rim isn't a perfect rectangle.
  fill(2, 44, 3, 55, T.DECK);
  fill(26, 99, 28, 101, T.DECK);
  fill(5, 100, 12, 101, T.DECK);
  fill(60, 48, 61, 54, T.MOSS);
  fill(61, 66, 62, 78, T.DECK);
  fill(3, 20, 4, 30, T.DECK);
  fill(41, 4, 43, 10, T.DECK);
  fill(60, 24, 61, 36, T.MOSS);

  // ---- A: Lowdeck
  fill(12, 85, 13, 98, T.PATH);
  fill(5, 92, 28, 93, T.PATH);
  bld(6, 87, 5, 4, 'home', [8, 90], 'home');
  bld(17, 86, 8, 5, 'lab', [20, 90], 'lab');
  bld(18, 95, 6, 3, 'stall', null);
  for (const [x, y] of [[11, 87], [14, 94], [11, 97], [26, 91], [15, 87]]) set(x, y, T.LAMP);
  scatter(4, 85, 29, 99, T.FLOWER, 10);
  for (const [x, y] of [[4, 85], [5, 85], [27, 86], [28, 87], [4, 98], [28, 97], [25, 98]]) set(x, y, T.TREE);
  set(15, 91, T.SIGN);
  deco(6, 84, 25, 84, T.TREE);
  fill(12, 84, 13, 84, T.PATH);
  fill(26, 94, 27, 96, T.CRATE);

  // ---- B: Fiberfields
  fill(12, 76, 13, 83, T.PATH);
  fill(12, 76, 19, 77, T.PATH);
  fill(18, 64, 19, 77, T.PATH);
  fill(13, 64, 19, 65, T.PATH);
  fill(13, 60, 14, 65, T.PATH);
  fill(7, 62, 11, 74, T.GRASS);
  fill(21, 66, 24, 82, T.GRASS);
  fill(14, 79, 17, 83, T.GRASS);
  fill(14, 68, 17, 73, T.GRASS);
  for (let y = 60; y <= 83; y++) {
    if (rng() < 0.7) set(6, y, T.TREE);
    if (rng() < 0.7) set(25, y, T.TREE);
  }
  scatter(7, 75, 11, 83, T.TREE, 8);
  scatter(15, 60, 24, 63, T.TREE, 6);
  scatter(7, 60, 12, 61, T.FLOWER, 4);
  set(11, 82, T.SIGN);
  deco(6, 60, 25, 60, T.TREE);
  fill(13, 60, 14, 60, T.PATH);

  // ---- C: Neon Bazaar
  fill(4, 46, 31, 47, T.PATH);
  fill(13, 46, 14, 59, T.PATH);
  bld(5, 41, 6, 4, 'clinic', [7, 44], 'clinic_c');
  bld(13, 41, 6, 4, 'mart', [15, 44], 'mart_c');
  bld(21, 41, 7, 4, 'kiosk', [24, 44], 'kiosk');
  bld(5, 50, 8, 6, 'dojo', [8, 55], 'dojo');
  bld(21, 51, 5, 4, 'house', [23, 54], 'house_c');
  for (const [x, y] of [[4, 45], [12, 45], [20, 45], [29, 45], [16, 50], [16, 56], [29, 49]]) set(x, y, T.LAMP);
  scatter(16, 49, 30, 58, T.FLOWER, 10);
  for (const [x, y] of [[3, 58], [30, 58], [31, 57], [28, 57], [3, 40], [30, 40], [2, 49]]) set(x, y, T.TREE);
  fill(18, 57, 20, 58, T.CRATE);
  set(12, 48, T.SIGN);
  set(27, 48, T.SIGN);
  fill(32, 46, 32, 47, T.BRIDGE);

  // ---- D: Turbine Ridge
  fill(33, 46, 51, 47, T.PATH);
  fill(50, 46, 51, 57, T.PATH);
  fill(44, 44, 45, 47, T.PATH);
  fill(35, 49, 42, 56, T.GRASS);
  fill(46, 50, 48, 56, T.GRASS);
  fill(53, 46, 58, 56, T.GRASS);
  for (const [x, y] of [[37, 51], [41, 54], [56, 50], [55, 53], [47, 49]]) set(x, y, T.TURBINE);
  for (const [x, y] of [[33, 44], [34, 44], [59, 44], [33, 57], [59, 57], [42, 44], [47, 44]]) set(x, y, T.TREE);
  scatter(36, 44, 43, 45, T.FLOWER, 4);
  set(34, 45, T.SIGN);
  fill(50, 58, 51, 59, T.BRIDGE);
  fill(44, 43, 45, 43, T.BRIDGE);

  // ---- E: Chrome Foundry
  fill(50, 60, 51, 75, T.PATH);
  fill(39, 67, 59, 68, T.PATH);
  fill(42, 74, 56, 75, T.PATH);
  fill(42, 74, 43, 83, T.PATH);
  fill(42, 82, 54, 83, T.PATH);
  bld(40, 61, 6, 4, 'clinic', [42, 64], 'clinic_e');
  bld(53, 61, 6, 4, 'mart', [55, 64], 'mart_e');
  bld(44, 76, 11, 6, 'foundry', [49, 81], 'arena_e');
  bld(39, 70, 5, 3, 'house', [41, 72], 'house_e');
  fill(55, 70, 59, 81, T.GRASS);
  fill(38, 76, 41, 81, T.GRASS);
  for (let y = 60; y <= 66; y++) set(47, y, T.PIPE);
  for (let x = 44; x <= 49; x++) set(x, 70, T.PIPE);
  fill(52, 70, 53, 72, T.CRATE);
  fill(57, 83, 59, 84, T.CRATE);
  for (const [x, y] of [[49, 62], [52, 66], [45, 69], [56, 76], [39, 84]]) set(x, y, T.LAMP);
  set(52, 61, T.SIGN);

  // ---- F: Rainshaft Canals
  fill(44, 18, 45, 42, T.PATH);
  fill(32, 24, 43, 25, T.PATH);
  fill(34, 30, 59, 31, T.WATER);
  fill(52, 18, 53, 29, T.WATER);
  fill(38, 35, 39, 42, T.WATER);
  fill(44, 30, 45, 31, T.BRIDGE);
  fill(35, 33, 37, 41, T.GRASS);
  fill(40, 33, 42, 41, T.GRASS);
  fill(47, 33, 58, 41, T.GRASS);
  fill(35, 19, 42, 22, T.GRASS);
  fill(47, 19, 51, 28, T.GRASS);
  fill(54, 19, 58, 28, T.GRASS);
  for (const [x, y] of [[43, 23], [46, 26], [43, 33], [46, 38], [36, 27]]) set(x, y, T.LAMP);
  scatter(34, 26, 43, 29, T.TREE, 5);
  for (const [x, y] of [[34, 18], [59, 18], [34, 42], [59, 42]]) set(x, y, T.TREE);
  set(46, 41, T.SIGN);
  fill(32, 24, 33, 25, T.BRIDGE);

  // ---- G: Nightside
  fill(6, 24, 31, 25, T.PATH);
  fill(18, 15, 19, 37, T.PATH);
  bld(9, 17, 9, 7, 'observatory', [13, 23], 'arena_g');
  bld(21, 17, 6, 4, 'clinic', [23, 20], 'clinic_g');
  bld(21, 27, 6, 4, 'mart', [23, 30], 'mart_g');
  bld(7, 29, 5, 4, 'house', [9, 32], 'house_g');
  fill(26, 32, 30, 37, T.GRASS);
  fill(6, 35, 15, 37, T.GRASS);
  for (const [x, y] of [[8, 26], [17, 26], [20, 23], [28, 26], [20, 34]]) set(x, y, T.LAMP);
  scatter(5, 26, 17, 34, T.FLOWER, 8);
  for (const [x, y] of [[5, 16], [31, 16], [29, 17], [5, 38], [31, 31]]) set(x, y, T.TREE);
  set(17, 36, T.SIGN);
  fill(18, 15, 19, 15, T.BRIDGE);

  // ---- H: Summit
  fill(18, 9, 19, 14, T.PATH);
  fill(18, 9, 26, 10, T.PATH);
  bld(22, 2, 9, 7, 'spire', [26, 8], 'spire');
  fill(33, 4, 39, 13, T.GRASS);
  for (const [x, y] of [[21, 11], [31, 11], [16, 8], [24, 12]]) set(x, y, T.LAMP);
  for (const [x, y] of [[12, 2], [13, 2], [12, 14], [40, 2], [40, 14], [14, 5], [32, 2]]) set(x, y, T.TREE);
  scatter(13, 3, 20, 13, T.FLOWER, 6);
  set(17, 13, T.SIGN);

  return { tiles, buildings, warps };
}

// ------------------------------------------------------------------ interiors
const LEGEND = {
  '#': T.IWALL, '.': T.FLOOR, '=': T.COUNTER, t: T.TABLE, m: T.MACHINE, p: T.PLANT, b: T.BED, x: T.EXIT,
  o: T.POD, s: T.SCREEN, v: T.TERMINAL, r: T.RUG, H: T.HEART, a: T.ARENA,
};
const ROOMS = {
  home: ['##ss##s###', '#b..m...p#', '#b.......#', '#...tt...#', '#...tt...#', '#p.......#', '#........#', '####xx####'],
  lab: ['#############', '#mm.sss.s.mm#', '#...........#', '#..=ooo=....#', '#...........#', '#.p.......t.#', '#.........t.#', '#m.........p#', '#...........#', '######xx#####'],
  clinic: ['###s##s####', '#p.......v#', '#...===...#', '#.........#', '#.t.....t.#', '#.........#', '#p.......p#', '####xxx####'],
  mart: ['#########', '#mm....p#', '#..===..#', '#.......#', '#t.....m#', '#.......#', '####x####'],
  kiosk: ['###########', '#m.......m#', '#.=======.#', '#.........#', '#p.......m#', '#.........#', '#r.......r#', '####xxx####'],
  arena: ['#####s#####', '#m.......m#', '#.........#', '#.aaaaaaa.#', '#.a.....a.#', '#.a.....a.#', '#.a.....a.#', '#.a.....a.#', '#.aaaaaaa.#', '#.........#', '#p.......p#', '#.........#', '#.........#', '#####x#####'],
  house: ['########', '#b..s.p#', '#......#', '#.tt...#', '#......#', '#p.....#', '###x####'],
  spire: ['######s######', '#m....H....m#', '#....HHH....#', '#...........#', '#...........#', '#m.........m#', '#...........#', '#...........#', '#.aaaaaaaaa.#', '#.a.......a.#', '#.a.......a.#', '#.aaaaaaaaa.#', '#m.........m#', '#...........#', '#...........#', '######x######'],
};

function room(id, template, name, exitTo, opts = {}) {
  const rows = ROOMS[template];
  const w = rows[0].length, h = rows.length;
  const tiles = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (tiles[y * w + x] = LEGEND[ch])));
  const exits = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'x' && exits.push([x, y])));
  return {
    id, name, w, h, tiles, indoor: true, theme: opts.theme ?? template, music: opts.music ?? 'town',
    npcs: [], objects: [], triggers: [], gates: [],
    warps: exits.map(([x, y]) => ({ x, y, to: 'world', tx: exitTo[0], ty: exitTo[1], dir: 'down' })),
    entry: [exits[0][0], exits[0][1] - 1],
    zones: [],
  };
}

// ------------------------------------------------------------------ assembly
export function buildWorld() {
  const o = buildOutdoor();
  const world = {
    id: 'world', name: 'The Aerie', w: W, h: H, tiles: o.tiles, indoor: false, buildings: o.buildings,
    npcs: [], objects: [], triggers: [], gates: [], warps: o.warps,
    zones: [
      { name: 'Lowdeck', rect: [0, 84, 31, 103], music: 'town' },
      { name: 'Fiberfields', rect: [0, 60, 31, 83], music: 'route', enc: ENC.fiber },
      { name: 'Neon Bazaar', rect: [0, 39, 32, 59], music: 'town' },
      { name: 'Turbine Ridge', rect: [33, 43, 63, 58], music: 'route', enc: ENC.turbine, wind: true },
      { name: 'Chrome Foundry', rect: [33, 59, 63, 103], music: 'foundry', enc: ENC.foundry, smoke: true },
      { name: 'Rainshaft Canals', rect: [32, 16, 63, 42], music: 'rain', enc: ENC.rain, rain: true },
      { name: 'Nightside', rect: [0, 15, 31, 38], music: 'night', enc: ENC.night, night: true },
      { name: 'Spire Summit', rect: [0, 0, 63, 14], music: 'summit', enc: ENC.summit, wind: true },
    ],
  };
  const rooms = [
    room('home', 'home', 'Your capsule', [8, 91]),
    room('lab', 'lab', 'Hatchery Lab', [20, 91]),
    room('clinic_c', 'clinic', 'Patch Den · Bazaar', [7, 45], { music: 'clinic' }),
    room('mart_c', 'mart', 'Neo-Mart · Bazaar', [15, 45]),
    room('kiosk', 'kiosk', 'Trade Kiosk', [24, 45]),
    room('dojo', 'arena', 'Arc Dojo', [8, 56], { theme: 'dojo', music: 'gym' }),
    room('house_c', 'house', 'Bazaar flat', [23, 55]),
    room('clinic_e', 'clinic', 'Patch Den · Foundry', [42, 65], { music: 'clinic' }),
    room('mart_e', 'mart', 'Neo-Mart · Foundry', [55, 65]),
    room('arena_e', 'arena', 'Foundry Arena', [49, 82], { theme: 'foundry', music: 'gym' }),
    room('house_e', 'house', 'Worker bunk', [41, 73]),
    room('clinic_g', 'clinic', 'Patch Den · Nightside', [23, 21], { music: 'clinic' }),
    room('mart_g', 'mart', 'Neo-Mart · Nightside', [23, 31]),
    room('arena_g', 'arena', 'Observatory', [13, 24], { theme: 'observatory', music: 'gym' }),
    room('house_g', 'house', 'Nightside loft', [9, 33]),
    room('spire', 'spire', 'Heartcore Spire', [26, 9], { theme: 'spire', music: 'heart' }),
  ];
  const maps = { world };
  for (const r of rooms) maps[r.id] = r;
  // Doors lead to their room's entry.
  for (const w of world.warps) {
    const r = maps[w.to];
    w.tx = r.entry[0];
    w.ty = r.entry[1];
    w.dir = 'up';
  }
  populate(maps);
  return maps;
}

// ------------------------------------------------------------------ people, signs, story hooks
function populate(M) {
  const npc = (map, id, x, y, dir, look, props = {}) => M[map].npcs.push({ id, x, y, dir, look, ...props });
  const sign = (map, x, y, props) => M[map].objects.push({ kind: 'sign', x, y, ...props });
  const item = (map, x, y, id, qty = 1) => M[map].objects.push({ kind: 'item', x, y, item: id, qty, flag: `item_${map}_${x}_${y}` });
  const gate = (x, y, flag, msg) => M.world.gates.push({ x, y, flag, msg });

  // --- Lowdeck
  npc('world', 'aunt_out', 16, 97, 'down', 'aunt', { say: 'aunt_stall' });
  npc('world', 'kid_lowdeck', 22, 92, 'left', 'kid', { say: ['Did you know Kindlets sleep in the reactor vents under our street? Mom says don\'t pet them. I pet them.'], wander: true });
  npc('world', 'elder_lowdeck', 9, 94, 'down', 'elder', { say: ['When I was young, we didn\'t have tethers. We had to ask drakes nicely.', 'They mostly said no.'] });
  sign('world', 15, 91, { text: ['LOWDECK · first deck of the Aerie. Hatchery: north-east. Fiberfields: straight north.'] });
  sign('world', 26, 94, { legend: 'upfall' });
  M.world.triggers.push({ rect: [12, 84, 13, 84], id: 'need_starter' });

  // --- Fiberfields
  npc('world', 'jax', 16, 76, 'left', 'runner', { trainer: 'jax', sight: 4 });
  npc('world', 'mei', 20, 67, 'left', 'botanist', { trainer: 'mei', sight: 3 });
  sign('world', 11, 82, { text: ['FIBERFIELDS · Wild drakes nest in the glowing fibre grass. Lowdeck south, Neon Bazaar north.'] });
  item('world', 8, 61, 'patch', 2);
  item('world', 23, 83, 'spike', 3);

  // --- Neon Bazaar
  npc('world', 'bazaar_hacker', 25, 48, 'left', 'hacker', { say: ['Every Patch Den heals your drakes for free. The Aerie Charter says so. Helix hates the Aerie Charter.'] });
  npc('world', 'bazaar_trader', 18, 52, 'down', 'trader', { say: ['Trade Kiosk\'s just north. You can swap drakes with folk there, and they\'ve got a Relay Loop.', 'Some drakes change when they get relayed. Rivetaurs especially.'], wander: true });
  npc('world', 'bazaar_kid', 9, 48, 'up', 'kid', { say: ['The Arc Dojo warden has a drake that eats lightning! I saw it! It burped a thunderstorm!'] });
  npc('world', 'bazaar_pilot', 28, 52, 'left', 'pilot', { say: ['The Wind Bridge east goes to Turbine Ridge. They lock it with an energy gate until you\'ve got the Current Sigil.'] });
  sign('world', 12, 48, { text: ['NEON BAZAAR · Market district. Patch Den, Neo-Mart, Trade Kiosk, Arc Dojo.'] });
  sign('world', 27, 48, { legend: 'festival' });
  gate(32, 46, 'sigil1', 'An energy gate hums across the Wind Bridge. "CURRENT SIGIL REQUIRED."');
  gate(32, 47, 'sigil1', 'An energy gate hums across the Wind Bridge. "CURRENT SIGIL REQUIRED."');
  item('world', 30, 55, 'scrap');

  // --- Turbine Ridge
  M.world.triggers.push({ rect: [35, 46, 35, 47], id: 'rival2' });
  npc('world', 'rae', 40, 48, 'up', 'pilot', { trainer: 'rae', sight: 3 });
  npc('world', 'oku', 49, 52, 'right', 'worker', { trainer: 'oku', sight: 3 });
  npc('world', 'lune', 52, 55, 'left', 'mystic', { trainer: 'lune', sight: 3 });
  sign('world', 34, 45, { text: ['TURBINE RIDGE · Mind the wind. The Foundry is south; the Rainshaft is north, past the Alloy gate.'] });
  gate(44, 43, 'sigil2', 'A thicker energy gate. "ALLOY SIGIL REQUIRED."');
  gate(45, 43, 'sigil2', 'A thicker energy gate. "ALLOY SIGIL REQUIRED."');
  item('world', 58, 46, 'arc_spike', 2);
  item('world', 36, 56, 'patch_plus');

  // --- Chrome Foundry
  npc('world', 'grunt1', 50, 64, 'down', 'grunt', { trainer: 'grunt1', sight: 3 });
  npc('world', 'grunt2', 57, 67, 'left', 'grunt', { trainer: 'grunt2', sight: 4 });
  npc('world', 'foundry_worker', 46, 72, 'down', 'worker', { say: ['Old Crucible sleeps under the arena. When it snores, we cast girders.'] });
  sign('world', 52, 61, { legend: 'crucible' });
  item('world', 59, 82, 'scale');
  item('world', 38, 83, 'restart');

  // --- Rainshaft
  npc('world', 'oda', 46, 35, 'left', 'worker', { trainer: 'oda', sight: 2 });
  npc('world', 'nix', 43, 21, 'right', 'hacker', { trainer: 'nix', sight: 3 });
  npc('world', 'grunt3', 36, 24, 'right', 'grunt', { trainer: 'grunt3', sight: 4 });
  sign('world', 46, 41, { text: ['RAINSHAFT CANALS · Coolant runs through here from the cloud-catchers. Nightside is west.'] });
  item('world', 58, 40, 'void_spike');
  item('world', 36, 19, 'shard');
  item('world', 55, 19, 'patch_plus', 2);

  // --- Nightside
  npc('world', 'grunt4', 13, 25, 'up', 'grunt', { trainer: 'grunt4', sight: 1 });
  npc('world', 'night_mystic', 24, 34, 'left', 'mystic', { say: ['Look up. See that slow pulse in the clouds? That\'s the Heartcore. It beats once a minute.', 'Lately it\'s been beating faster.'] });
  npc('world', 'night_elder', 10, 27, 'down', 'elder', { say: ['I was a Linker once. I linked a Comettail. It asked me for snacks every single day for forty years.', 'Best forty years of my life.'] });
  sign('world', 17, 36, { legend: 'dream' });
  gate(18, 15, 'sigil3', 'The Summit gate. Three Sigil sockets glow on its frame.');
  gate(19, 15, 'sigil3', 'The Summit gate. Three Sigil sockets glow on its frame.');
  item('world', 29, 37, 'rebuild');

  // --- Summit
  npc('world', 'enforcer1', 18, 12, 'down', 'grunt', { trainer: 'enforcer1', sight: 2 });
  npc('world', 'enforcer2', 22, 9, 'down', 'grunt', { trainer: 'enforcer2', sight: 1 });
  npc('world', 'rival3', 26, 9, 'left', 'rival', { trainer: 'rival3', sight: 4, hide: 'rival3_done' });
  sign('world', 17, 13, { text: ['SPIRE SUMMIT · Helix Dynamics Heartcore Facility. Authorised personnel only.'] });
  item('world', 39, 4, 'shard');

  // --- Interiors
  npc('home', 'aunt', 6, 3, 'right', 'aunt', { say: 'aunt_home' });
  sign('home', 4, 1, { text: ['A server rack you built from scrap. The fans spell out HAPPY LINK DAY in blinking LEDs.'] });
  npc('lab', 'vance', 9, 3, 'left', 'vance', { say: 'vance' });
  npc('lab', 'rival_lab', 3, 6, 'right', 'rival', { hide: 'rival1_done' });
  npc('lab', 'lab_aide', 10, 7, 'left', 'medic', { say: ['Dr. Vance hatched the first Kindlet ever born outside a reactor. She won\'t stop telling people.'] });
  for (const [x, sp] of [[4, 'kindlet'], [5, 'drizzlit'], [6, 'sporlet']]) M.lab.objects.push({ kind: 'pod', x, y: 3, sp });
  sign('lab', 5, 1, { legend: 'embers' });
  sign('lab', 8, 1, { legend: 'first_linker' });

  for (const c of ['clinic_c', 'clinic_e', 'clinic_g']) {
    npc(c, `${c}_medic`, 5, 1, 'down', 'medic', { say: 'medic' });
    M[c].objects.push({ kind: 'vault', x: 9, y: 1 });
  }
  npc('clinic_c', 'clinic_c_guest', 3, 4, 'right', 'runner', { say: ['I link Voltick. I\'ve been shocked four hundred times. I\'m fine. I\'m FINE.'] });
  npc('clinic_e', 'clinic_e_guest', 8, 5, 'left', 'worker', { say: ['Helix bought the old stabiliser contract. Now they act like the Heartcore\'s their private battery.'] });
  npc('clinic_g', 'clinic_g_guest', 3, 5, 'up', 'mystic', { say: ['Void drakes hate being stared at. That\'s why they come out at night, when no one\'s looking.'] });

  for (const [m, shop] of [['mart_c', 'bazaar'], ['mart_e', 'foundry'], ['mart_g', 'night']]) npc(m, `${m}_clerk`, 4, 1, 'down', 'clerk', { say: 'shop', shop });

  npc('kiosk', 'trader1', 3, 1, 'down', 'trader', { say: 'trade', trade: 'trade1' });
  npc('kiosk', 'trader2', 5, 1, 'down', 'pilot', { say: 'trade', trade: 'trade2' });
  npc('kiosk', 'trader3', 7, 1, 'down', 'worker', { say: 'trade', trade: 'trade3' });
  M.kiosk.objects.push({ kind: 'relay', x: 9, y: 4 });
  npc('kiosk', 'kiosk_guest', 4, 5, 'up', 'kid', { say: ['The Relay Loop sends your drake around the whole island network and back. It comes out warm.'] });

  npc('dojo', 'dex', 5, 6, 'down', 'hacker', { trainer: 'dex', sight: 4 });
  npc('dojo', 'volta', 5, 2, 'down', 'volta', { trainer: 'volta', sight: 0 });
  npc('arena_e', 'brun', 5, 7, 'down', 'worker', { trainer: 'brun', sight: 4 });
  npc('arena_e', 'ferra', 5, 2, 'down', 'ferra', { trainer: 'ferra', sight: 0 });
  npc('arena_g', 'pell', 5, 6, 'down', 'mystic', { trainer: 'pell', sight: 4 });
  npc('arena_g', 'nyx', 5, 2, 'down', 'nyx', { trainer: 'nyx', sight: 0 });
  sign('arena_g', 5, 0, { legend: 'sigils' });
  sign('arena_e', 5, 0, { legend: 'helix' });

  npc('house_c', 'house_c_npc', 4, 3, 'left', 'elder', { say: 'sayings' });
  npc('house_e', 'house_e_npc', 2, 2, 'down', 'worker', { say: ['I trade in my Boltnib\'s spare bolts. Well, not trade. It spits them at me.'] });
  item('house_e', 6, 4, 'scrap', 2);
  npc('house_g', 'house_g_npc', 5, 4, 'left', 'hacker', { say: ['I found a Void Core in a meteor crater once. A Comettail ate it and turned into something that glowed so bright I had to sleep with sunglasses on.', 'The Nightside Neo-Mart sells them now. Capitalism.'] });

  npc('spire', 'kade', 6, 6, 'down', 'kade', { trainer: 'kade', sight: 5, hide: 'kade_gone' });
  M.spire.objects.push({ kind: 'sovereign', x: 6, y: 3 });
}

export const TRADES = {
  trade1: { want: 'voltick', give: 'neonewt', lv: 14, nick: 'Flicker', ot: 'Sal', line: 'I\'ll swap my Neonewt for a Voltick. Mine keeps flickering the kiosk sign. It wants a cable to chew on, and I want a Voltick.' },
  trade2: { want: 'zephlit', give: 'brinesnap', lv: 10, nick: 'Snips', ot: 'Rin', line: 'I\'m a pilot. I need a Zephlit. I have a Brinesnap. It bites my boots. Want it?' },
  trade3: { want: 'boltnib', give: 'smogmaw', lv: 15, nick: 'Huff', ot: 'Gorm', line: 'Bring me a Boltnib and I\'ll give you Huff, a Smogmaw. Good lungs. Clean breath. Snores.' },
};
