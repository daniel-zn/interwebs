# Solar Kite

An astronaut kicks back in a lawn chair on a huge asteroid that orbits a
hair's breadth from the sun, with a beer in one hand (with a straw through the
helmet, obviously) and a stunt kite's control handle in the other. The kite
rides the **solar wind**. Fly loops, figure 8s and orbits round floating junk,
thread flux rings and skim the dust, and chain it all into combos before the
asteroid turns and the sun sets. A session lasts 2½ minutes.

**Stack:** vanilla JS + Canvas 2D · no runtime dependencies · no build step ·
about 36 KB gzipped in total (`npm run size`).

## Play

ES modules need HTTP, not `file://`:

```sh
cd solar-kite
npm start            # zero-dependency server on http://127.0.0.1:8080/
```

## Controls

The kite always flies forward, like a real stunt kite. You only steer it.

| Action | Keyboard | Mouse / touch | Gamepad |
| --- | --- | --- | --- |
| Steer | **←** / **A** spin anticlockwise, **→** / **D** clockwise | Hold and drag: the nose turns towards the pointer | Left stick points where to go; bumpers or d-pad spin |
| Tug the lines (speed burst) | **Space**, **↑** or **W** | Quick tap or click, or a second finger | **A** |
| Launch / fly again | **Space** or **Enter** | Tap / click | **A** |
| Pause | **P** or **Esc** | ❚❚ button | **Start** |
| Restart | **R** | Pause → Restart | – |
| Sound / help | **M** / **H** | Buttons, top right | – |

## How it works

- **The wind window.** The kite flies inside a half-ellipse standing on the
  ground downwind of the astronaut (drawn as a faint dotted arc). Low and in the
  middle is the power zone, where the kite is fastest (about 50 units/s). Towards
  the edge it runs out of power, slows to a hover and gets pulled back in, so
  letting go of the controls just parks it at the edge. Climbing costs a little
  speed and diving gains some. When the wind is too weak, the kite sags.
- **The ground** is the only hard hazard. Fly into it and the kite crashes, the
  combo is lost, and after two seconds the astronaut yanks it back into the air.
  (In gentle mode it bounces off instead.)
- **Floating things** (moonlets, a satellite, comet chunks) drift through on the
  solar wind. Flying into one is a **bonk**: the kite tumbles and the combo is
  lost.
- **Line twists.** Every loop twists the two lines round each other, and you can
  see the braid. Past two twists the kite gets sluggish to turn. Loop back the
  other way to untwist; clearing three or more twists scores **UNTWIST**.

### Tricks

| Trick | How | Points |
| --- | --- | --- |
| Loop | Turn a full 360° without flying straight for more than about half a second | 100 (double 200, triple 300…) |
| Figure 8 | A loop, then a loop the other way within 2.6 s | 300+ |
| Tight / huge | A loop with a short path (under 40 units) / one over 46 units across | +80 / +120 |
| Orbit | Circle all the way round a floating object, staying within 16 units of it | 250 moonlet, 350 satellite, 450 comet chunk |
| Ring / ring chain | Fly through a flux ring / all four in a set | 120 each / +400 |
| Regolith skim | Fly lower than 7 units for at least half a second and climb back out | 180 per second |
| Untwist | Unwind 3+ line twists back to zero | 250 |

**Combos.** Tricks go into a combo, which banks 2.6 s after your last trick
(or at sunset). Every *different* trick adds 1 to the multiplier and repeats
add 1 per 4, up to x10. Each repeat of the same trick also scores 40% less.
Circling one satellite forever doesn't pay; mixing tricks up does. A crash or a
bonk loses the whole combo.

**Solar weather.** Every 16–26 s the sun does something, with a 3-second warning
(a flare swelling on the limb, a HUD countdown, a sound and a screen-reader
line). A **solar flare** blows 40% harder for 7 s, and every trick scores
double. A **lull** drops the wind to 55% for 6 s, and the kite sags unless you
keep it low and central and tug the lines.

**Radio calls.** The kite club back at base radios in a request ("FIGURE 8!",
"ORBIT SOMETHING!", "SKIM THE GROUND!"…). Land it within 12 s for +500.

Final ranks: S ≥ 55,000 · A ≥ 34,000 · B ≥ 18,000 · C ≥ 7,000 (20% higher in
gentle mode). Your best session is saved in `localStorage` (key
`solar-kite:v1`).

## Tech notes

- `src/sim.js`: all the rules, with no DOM, so they run in Node.
  `createRun`, `step(run, dt, { turn, tug })`, a seeded RNG, and events for the
  UI and audio. `steerToward` turns a pointer or stick position into a turn
  input, and `demoPilot` flies the title screen.
- `src/render.js`: the canvas renders at a low internal resolution (about
  320×180 on landscape screens, and larger pixels in portrait) and is scaled by
  whole device pixels with `image-rendering: pixelated`. The sun's disc
  (limb darkening, granulation, spots) and its banded glow are dithered textures
  made once per resize. The astronaut's corner is drawn at 2× pixels when there's
  room. The kite is pre-rasterised at 64 headings so it stays crisp at any angle.
  The trail, lines and braid are plotted pixel by pixel. As the sun sinks, the
  shadows stretch and the ground darkens. There's no red sunset, because there's
  no air. Update + render costs well under 1 ms per frame in headless Chromium.
- `src/audio.js`: WebAudio only. Solar-wind hiss, the kite's buzz and hum
  (following its speed and how hard it's turning), a can cracking open, sips,
  trick chimes on a rising pentatonic scale, a combo cash-in, radio chirps, flare
  rumbles and a sunset chord.
- `src/sprites.js`: hand-authored pixel grids. `src/font.js`: a 5×5 bitmap font.
- The game pauses when the tab is hidden. Reduce motion (from the OS setting or
  the toggle) removes shake and flashes and calms the sun.
- Accessibility: every action has a key, buttons are 44 px or larger with a
  visible focus ring, and an `aria-live` region announces tricks, combos, radio
  calls, weather warnings, crashes and the result.

## Test URL flags

`?test` exposes `window.__kite` (state, snapshot, perf, `toClient`). `?fast`
runs the sim at 2.5× speed. `?seed=N` makes sessions repeatable, and
`?session=N` shortens a session to N seconds.

## Development

```sh
npm test          # unit tests for the rules (node --test)
npm run play      # headless Chromium play-through (keyboard, mouse + touch), screenshots in test-results/
npm run size      # gzipped payload, fails over 50 KB
npm run tune      # balance harness: bots fly many seeded sessions
```

`npm run play` uses `playwright-core` from the repo root (`npm install` there) or
from this folder. Set `CHROMIUM_PATH` if Playwright's browsers aren't installed.
