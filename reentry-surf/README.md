# Re-entry Surf

You're an astronaut surfing a heat shield down through a planet's upper
atmosphere. The descent is the wave. Carve the thin corridor of air between
**burning up** (too deep, too steep) and **skipping out** (too shallow, flung
back into space). Keep riding until you're slow enough to pop the chute and
splash down. A run lasts about 2 minutes.

**Stack:** vanilla JS + Canvas 2D · no runtime dependencies · no build step ·
about 34 KB gzipped in total (`npm run size`).

## Play

ES modules need HTTP, not `file://`:

```sh
cd reentry-surf
npm start            # zero-dependency server on http://127.0.0.1:8080/
```

## Controls

| Action | Keyboard | Mouse / touch | Gamepad |
| --- | --- | --- | --- |
| Dive (nose down) | Hold **Space**, **↓** or **S** | Hold anywhere | Hold **A** / **RT** / d-pad down, or stick down (analogue) |
| Lift | Let go | Let go | Let go |
| Pull up harder | **↑** or **W** | – | d-pad up / stick up |
| Start / ride again | **Space** or **Enter** | Tap / click | **A** |
| Pause | **P** or **Esc** | ❚❚ button | **Start** |
| Restart | **R** | Pause → Restart | – |
| Sound / help | **M** / **H** | Buttons, top right | – |

## How it works

- **The corridor** is the band between two lines that ripple with the layers of
  air. The glowing orange **hot line** is below and the dashed cyan **thin line**
  is above it. The whole band sinks as you slow down, so you keep dropping
  towards the surface.
- **Heat:** below the hot line the HEAT gauge fills. It fills faster the deeper
  you go and the faster you're moving. Inside the band it cools off. If it fills,
  you **burn up**: the shield flares white-hot, throws sparks and becomes a meteor.
- **Skip:** above the thin line the SKIP gauge fills. It fills faster the higher
  you are, if you're still climbing, and at high speed. If it fills, you **skip
  out** and tumble off into space. Early on, near orbital speed, gravity barely
  holds you, so letting go drifts you up towards the skip zone. Later, gravity
  wins and the danger turns to diving too deep.
- **Flying:** holding tilts the board nose-down (negative lift). Letting go
  tilts it back up. Lift grows with air density, so a dive into thick air comes
  back as a strong bounce. Riding well means pumping between the two.
- **Drag** sets the pace. Deeper air slows you faster, so hugging the hot edge
  gets you down sooner (and scores style), while riding high takes longer.
- **Plasma bow shock:** its size and colour (orange → yellow → white) show how
  hard you're pushing the air. Warnings arrive in three ways at once: a gauge
  that flashes and shakes, a banner with flame or chevron icons, and the
  boundary line blinking. Screen readers hear them too.

### Scoring

Points tick up while you ride, multiplied by **flow** (x1–x5). Flow goes up one
step for every 5 s riding cleanly inside the band. A junk hit resets it, and
red-lining a gauge drops it one step. You get **edge** points for skimming within
a hair of either line, plus bonuses for close calls, jet-stream rides, cresting
storm waves and coolant. A landing adds a bonus for shield condition and best
flow. Landings get a rank from S to D. Your best landing is saved in
`localStorage` (key `reentry-surf:v1`).

### Hazards and events

A director spawns one every 4–6 s, depending on how far down you are. Each one is
telegraphed by a blinking marker with its own icon at the right edge, plus a
chime and a screen-reader line, before it arrives.

| | Event | Effect |
| --- | --- | --- |
| **!** | Space junk (satellites, rocks, spent boosters) | Upper atmosphere. A hit adds heat, knocks you down and resets flow. A near miss scores a close call. |
| **^** | Updraft column | Pushes you up. It helps when you're deep, and it's dangerous when you're already shallow. |
| **\*** | Storm band | The hot air bulges up into a big wave with lightning. Carve over the crest for a bonus, or plough into the heat. |
| **>** | Jet stream ribbon | Ride the line to lock on, cool down, stop braking and score fast. |
| **+** | Coolant | Vents 40% heat and some skip. |

**Gentle mode** (in Help) widens the corridor downwards, so the heat starts
deeper, and heat builds more slowly. Ranks are a little stricter.

## Tech notes

- `src/sim.js`: all the rules, with no DOM, so they run in Node. `createRun`,
  `step(run, dt, input)`, seeded RNG, and events for UI and audio.
- `src/render.js`: the canvas renders at a low internal resolution (about
  320×180 on landscape screens, and larger pixels in portrait) and is scaled by
  whole device pixels with `image-rendering: pixelated`. The air layers, hot line
  and hazards are drawn per column. Particles use a fixed pool, so there's no
  per-frame allocation. The planet and clouds are procedural textures made once.
  Update + render costs about 1 ms per frame in headless Chromium.
- `src/audio.js`: WebAudio only. Rushing wind that rises with speed and density,
  a plasma roar and crackle that follow heat, warning beeps, a boost whoosh, and
  hits, chute and splash sounds. It starts on the first gesture and has a mute
  toggle.
- `src/sprites.js`: hand-authored pixel grids. `src/font.js`: a 5×5 bitmap font.
- The game pauses when the tab is hidden. Reduce motion (from the OS setting or
  the toggle) removes shake, flashes, speed lines and heat shimmer, and thins the
  particles.
- Accessibility: every action has a key, buttons are 44 px or larger with a
  visible focus ring, and an `aria-live` region announces start, heat and skip
  warnings, incoming hazards, hits, burn-up, skip-out, chute and splashdown.

## Test URL flags

`?test` exposes `window.__surf` (state, snapshot, perf). `?fast` runs the sim at
2.5× speed. `?seed=N` makes runs repeatable.

## Development

```sh
npm test          # unit tests for the rules (node --test)
npm run play      # headless Chromium play-through (keyboard + touch), screenshots in test-results/
npm run size      # gzipped payload, fails over 50 KB
npm run tune      # balance harness: bots play many seeded runs
```

`npm run play` uses `playwright-core` from the repo root (`npm install` there) or
from this folder. Set `CHROMIUM_PATH` if Playwright's browsers aren't installed.
