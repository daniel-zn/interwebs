# Orbit Pond

A quiet, pixel-retro fishing trip. You're an astronaut on a small wooden dock,
fishing a tiny lake that floats alone through space inside a thin bubble of air.
Cast, wait for the plunge, reel carefully, and fill a journal of ten odd
little species (plus one very old one).

**Stack:** vanilla JS + Canvas 2D · no runtime dependencies · ~34 KB gzipped in total

## Play

The game is static files, but ES modules need to be served over HTTP (not `file://`):

```sh
cd space-lake-fishing
npm start            # zero-dependency server on http://127.0.0.1:8080/
# or any static server: python3 -m http.server 8080
```

`npm start` needs no `npm install`.

### Controls: one button

| Step | Mouse / touch | Keyboard |
| --- | --- | --- |
| Cast | Hold, then let go when the power meter is where you want it | Hold **Space** or **Enter**, then let go |
| Hook | Tap once when the bobber **plunges** and a **!** pops up | Press **Space** |
| Reel | Hold to reel in; let go when the line meter strains or its frame flashes | Same, with **Space** |
| Keep fishing | Tap the catch card | **Space** |

Extra keys: **J** journal · **M** sound · **H** help and settings · **Esc** closes windows.
Pressing while you wait reels the line back in. Small twitches are only nibbles.

Farther casts reach rarer fish. The power meter has markers for near, mid and far
water, and a blinking reticle shows where the bobber will land.

## Design notes

- **Rendering.** A single `<canvas>` at a low internal resolution (about 230–460 px
  wide), scaled up by a whole number of *device* pixels, so every game pixel is a
  crisp square at any DPR. The sky, nebula, planet and island are pre-rendered
  once (redrawn on resize) with ordered dithering; each frame draws the water,
  characters and effects on top. Update + render costs about 0.3 ms per frame in headless Chromium.
- **No image or audio files.** All art is procedural or hand-authored pixel grids
  in code (`src/fish.js`, `src/sprites.js`). All sound (ambient pad, distant bells,
  splashes, reel clicks) is synthesised with WebAudio (`src/audio.js`). Audio
  starts on the first interaction, as browsers require.
- **Why not Three.js?** The scene is a 2D pixel diorama. Canvas 2D does it in a few
  KB with exact pixel control. A 3D engine would add ~150 KB+ and fight the
  pixel-art look.
- **Loop.** `title → idle → charging → casting → waiting (nibbles) → bite → reeling → landing → caught`,
  with a short `lost` detour when the fish escapes or the line snaps (`src/game.js`).
  Reeling is one-button tension management: holding raises tension and gains
  line, letting go relaxes it, and fish make telegraphed runs (a flash and a splash
  first, then a pull).

## Accessibility

- One-button play with Space/Enter, mouse, pen or touch. Every control has a
  keyboard shortcut and a 44 px or larger on-screen button with a visible focus ring.
- The bite is shown four ways: the bobber plunges, a **!** bubble appears, the hint
  bar turns gold, and a chime plays. Phones also vibrate. The tension meter's danger zone is
  striped, so it doesn't rely on colour alone.
- The hint bar is a polite live region. Bites, strain warnings and catches are
  announced assertively for screen readers. The journal and help are native `<dialog>`s.
- **Gentle mode** gives longer bite windows and a line that never snaps.
  **Reduce motion** (on by default when `prefers-reduced-motion` is set) stops
  bobbing, twinkling, shooting stars and animations.
- Progress and settings go to `localStorage` when it's available. The game works without it.

## Development

```sh
npm install          # dev tools only: eslint, playwright
npm run lint         # ESLint (flat config)
npm run size         # payload report + 40 KB gzip budget
npm test             # headless Chromium play-through (see below)
npm run check        # all of the above
```

`npm test` (`tests/play.mjs`) starts the local server and plays the game for real:

- On desktop it catches fish with the keyboard and then the mouse, checks the catch card,
  persistence, reel-in while waiting, the journal (J/Esc, pausing), mute (M),
  settings (H), integer scaling and per-frame cost.
- On an emulated phone it plays a full catch with raw touch events, then checks tap target
  sizes and that the page never scrolls sideways.
- It also runs a landscape pass with reduced motion and `localStorage` blocked.

Screenshots go to `test-results/`. Test-only URL flags: `?test` exposes
`window.__pond` for inspection, `?fast` shortens waits, `?seed=N` fixes the world.

If Playwright's bundled Chromium isn't available, point it at one:
`CHROMIUM_PATH=/path/to/chromium npm test`.

## Files

```
index.html  style.css      page shell, HUD, catch card, dialogs
src/main.js                boot, integer scaling, input, loop
src/game.js                fishing state machine and ambient life
src/scene.js               all drawing (sky, island, water, astronaut, meters)
src/fish.js                species, rarity, procedural fish sprites
src/sprites.js font.js     astronaut/bucket pixel grids, 5x5 bitmap font
src/audio.js               WebAudio synth
src/ui.js storage.js       DOM/ARIA side, persistence
src/layout.js palette.js util.js
tools/serve.mjs size.mjs   static server, payload budget
tests/play.mjs             end-to-end play-through
```
