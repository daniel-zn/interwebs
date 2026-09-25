# Astro Angler

A small, calm pixel-art fishing game. An astronaut sits on a wooden dock at the edge of a tiny lake on a chunk of rock drifting through space. You cast, wait, feel a nibble, catch whatever surfaces, and let it go. Each fish you release swims up into the sky and becomes a new star.

## Play

No install and no build step. The game is static files, but ES modules need to be served over HTTP (they won't load from `file://`):

```sh
cd astro-angler
npm start            # → http://127.0.0.1:5173/  (zero-dependency Node server)
# or: python3 -m http.server 5173
```

Any static host works as-is. Upload the folder and open `index.html`.

## How to play

The whole game uses one button: **Space / Enter**, a **mouse click**, **touch**, or **gamepad A**.

1. **Hold** to charge a cast. The meter rises and falls, and a marker on the water shows where the bobber will land. **Release** to throw. Longer casts reach deeper water, where the rarer fish live.
2. **Wait.** A shadow drifts toward the bobber. Nibbles (`?`) are just teasing. When the bobber **plunges** with a `!`, press right away.
3. **Reel.** Hold to reel the fish in. The **LINE** gauge builds up while you hold. When it goes red ("EASE OFF!") or the fish surges ("IT PULLS!"), let go for a moment. If you hold too long the line snaps. If you let go for too long the fish swims off.
4. Read the catch card, then press again to **let it go**.

The **Star Log** (book button or `L`) tracks the 10 things you can catch: 8 fish, one legendary, and one odd item. It records your best size and how many of each you've caught. Fill the whole log and something changes in the sky.

| Key | Action |
| --- | --- |
| Space / Enter / click / touch / pad A | cast · hook · reel · release |
| L | Star log |
| M | Mute / unmute |
| Esc | Close a dialog |

## Accessibility

- **One-button play**, with keyboard, mouse, touch and gamepad all equivalent. On-screen hints use the verb for your current input ("Hold SPACE", "Touch and hold", "Hold A").
- **Relaxed fishing** (Settings) roughly doubles the bite window, ignores early presses on nibbles, and stops the line from ever snapping.
- **Reduced motion** follows `prefers-reduced-motion` by default and can be toggled. It turns off the island bob, screen shake, shooting stars and blinking prompts, and slows the star drift.
- The tension gauge uses **text labels, segment height and a threshold tick** as well as colour. Bites have a visual cue, a sound, and vibration on touch devices.
- Screen-reader announcements go through `aria-live` regions: the cast settling, nibbles, bites (assertive), hooks, snaps, and each catch with its size and description. The canvas itself is `aria-hidden`. The HUD uses real `<button>`s with labels and 44 px hit targets. Dialogs are native `<dialog>` with focus returned to the game.
- Sound effects, ambient music and vibration can each be switched off separately.

## Tech

- **Vanilla JS + Canvas 2D, no dependencies, no build.** Three.js would add ~150 KB for a scene that is a few thousand pixels, so it wasn't used.
- The game renders at a low internal resolution (about 320×180 on desktop, 195×422 on a portrait phone) and is **scaled by an integer factor in device pixels**, so every art pixel is perfectly square and crisp on any screen density.
- All art is generated in code: sprites are character grids with an automatic outline pass, the island and nebula are procedurally dithered with a Bayer matrix, and the font is a hand-built 5×7 bitmap font. All sound is synthesised live with WebAudio. **No image or audio files.**
- The total download is about **31 KB gzipped** (`npm run check` enforces a 60 KB budget). Static layers are baked once. Each frame is a few hundred `fillRect`s and holds 60 fps in headless Chromium.
- Progress and settings go in `localStorage` (guarded, so private mode is fine).

```
index.html, style.css   page shell, HUD buttons, dialogs
src/main.js             boot, input (pointer/keys/gamepad), sizing, loop, dialogs, a11y wiring
src/game.js             fishing state machine (DOM-free, unit tested)
src/fish.js             species table, rarity-by-distance picking, seeded RNG
src/scene.js            renderer: sky, island, water, rod/line, particles, HUD
src/art.js              palette + pixel sprites
src/font.js             5×7 bitmap font
src/audio.js            WebAudio synth: ambience + effects
src/storage.js          localStorage wrapper
scripts/serve.mjs       tiny static server
scripts/check.mjs       syntax + ESLint + size budget
tests/logic.test.mjs    node:test unit tests for the game logic and tuning
tests/smoke.mjs         Playwright end-to-end run of the real game
```

## Checks

```sh
npm run check    # node --check on every file, ESLint (local or global), gzip size budget
npm test         # node:test: species picking, state machine, full simulated loop, reel tuning
npm run smoke    # headless Chromium: plays the full loop with keyboard, touch and mouse
npm run verify   # all of the above
```

`npm run smoke` uses a local `playwright` if one is installed, otherwise the global one. Set `CHROMIUM_PATH` to point at a specific browser, and `SMOKE_SHOTS=<dir>` to save screenshots of each stage. `?seed=N` in the URL makes a session's fish reproducible.
