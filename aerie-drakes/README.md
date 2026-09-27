# Aerie Drakes

A cyberpunk creature-linking RPG on an island floating in the sky. Explore the
Aerie, tether wild drakes, battle other Linkers and the three Sigil Wardens,
trade in the Neon Bazaar, and climb to the Heartcore, where the star-dragon
that holds the island up is waking.

**Stack:** vanilla JS + Canvas 2D + DOM overlays · no runtime dependencies ·
no image or audio files · about 90 KB gzipped

## Play

```sh
cd aerie-drakes
npm start            # zero-dependency server on http://127.0.0.1:8080/
```

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Move | Arrows / WASD | Pad | D-pad / stick |
| Talk, confirm | Z / Space / Enter | A | A |
| Back, open menu | X / Esc | B, or the ☰ button | B / Start |
| Run | Hold Shift | RUN toggle | Hold X |

On phones the pad and buttons are a see-through overlay on the full-screen game,
and they step aside while text or a menu is up (tap those directly). Where the
browser allows it (Android, desktop) there's a full-screen button; on an iPhone,
add the game to the home screen to hide the browser bars.

## The world

Three hundred years ago a star-dragon, the **Aether Sovereign**, fell out of
orbit, tore a mountain loose and lifted it into the clouds. Its body became the
island; its still-beating heart became the gravity engine that keeps it aloft.
The sparks it throws off, the *embers*, hatch into drakes shaped by wherever
they land: reactor ducts, fog nets, broken holograms, scrapyards.

- **Linkers** bond with drakes through neural *tethers*, a medical implant hack
  first made by the street medic Mara Quell. Her rule still stands: *a tether is
  a promise, not a leash.*
- **Helix Dynamics** built the stabilisers that caught the island when the heart
  stuttered, and has sent the Aerie an invoice ever since. Director Silas Kade
  wants to put the heart to work.
- **The three Wardens** each hold one Sigil, a third of the key to the Heartcore:
  Volta (Volt) at the Arc Dojo, Ferra (Chrome) at the Foundry Arena, Nyx (Void)
  at the Observatory.

Route: Lowdeck → Fiberfields → Neon Bazaar (Warden 1) → Turbine Ridge →
Chrome Foundry (Warden 2) → Rainshaft Canals → Nightside (Warden 3) → Spire
Summit → the Heartcore.

### Drakes

31 species across 8 *currents* (types): Plasma, Coolant, Volt, Bio, Chrome,
Gale, Void and Glitch. Every species has a classification, habitat, size and a
legend that the Codex unlocks when you link one. There are three starter lines,
level evolutions, an item evolution (Void Core) and a "trade" evolution
(Rivetaur reforges in the Kiosk's Relay Loop). The Codex also collects nine
**Legends** of the island's history from lore terminals and old-timers.

### Mechanics

- Turn-based battles with STAB, an 8×8 type chart, physical/special split,
  crits, accuracy, priority moves, stat stages, drain/recoil/heal moves and four
  conditions (Scorched, Static, Corrupted, Standby).
- Tethering uses a catch formula with HP, catch rate, tether strength and a
  condition bonus; the spike shakes up to three times.
- XP and levels (cubic curve), learnsets, move replacement, evolution scenes,
  shared XP for the rest of the party, bonus XP for traded drakes.
- Trainers with line of sight, Wardens and their Sigil gates, a rival, Helix
  grunts, and a legendary encounter.
- Patch Dens (healing, save, restart point, the Datavault for storage),
  Neo-Marts (buy and sell), the Trade Kiosk (three NPC trades and the Relay
  Loop), items to find, and a Linker ID.
- Saves to `localStorage`. Settings: sound, text speed, reduced motion, quick
  battle animations.

## Code map

| File | What it does |
| --- | --- |
| `src/data/*.js` | Types chart, moves, species (with lore and art params), items, legends |
| `src/world/world.js` | The island map (built from rectangles in code), interiors (ASCII), NPCs, trainers, gates, trades |
| `src/art/creatures.js` | Procedural drake painter: body plans + parts into a material buffer, then shading and outlines |
| `src/art/people.js`, `tiles.js`, `font.js` | Pixel people, tiles, buildings and neon sign lettering |
| `src/game.js` | Overworld: movement, camera, rendering, encounters, trainer sight, save/load |
| `src/battle.js` | Battle rules, AI, tethering, XP, and the animated battle scene |
| `src/story.js` | Every conversation, cutscene and service |
| `src/ui.js` | Dialog, menus, party, Codex, bag, shop, vault, battle HUD |
| `src/audio.js` | Chiptune sequencer and synthesised effects (WebAudio) |
| `src/input.js` | Keyboard, touch pad and gamepad |

Rendering follows the other games here: one low-resolution canvas scaled by a
whole number of device pixels. Text and menus are DOM on top, so they stay sharp
and work with screen readers (`aria-live` announces dialog).

## Checks

```sh
npm install
npm run check        # eslint, payload budget, data + map tests, headless play-through
```

`tests/data.mjs` checks every species, move and item reference, and walks the
map to prove each Sigil gate opens the next area and every door, NPC and item can
be reached. `tests/play.mjs` plays the opening with the keyboard (new game,
starter, rival battle), then a wild battle and tether, a trainer spotting you,
the Codex, the shop, save and continue, and the touch controls on a phone.
Screenshots land in `test-results/`.

In the browser, `?test` exposes `window.__aerie` (teleport, give items, add drakes)
and `?fast` speeds up text and animations.
