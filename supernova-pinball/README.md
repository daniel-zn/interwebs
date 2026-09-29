# Supernova Pinball

A roguelike neon pinball table built around a dying star. Every star system
is a **sector** with a score target: reach it and the ball warps to the next
one, and you pick one of three table upgrades. Run out of balls and it's over.

Everything you hit feeds the star at the centre of the table. When its mass
meter fills, it goes **SUPERNOVA**: two extra balls, double scoring for 20
seconds, slow motion, and the whole table lights up.

**Stack:** vanilla JS + Canvas 2D · no runtime dependencies · no build step ·
all sound and music synthesised with WebAudio · about 49 KB gzipped
(`npm run size`).

## Play

ES modules need HTTP, not `file://`:

```sh
cd supernova-pinball
npm start            # zero-dependency server on http://127.0.0.1:8080/
```

## Controls

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Left flipper | **Z**, ←, Left Shift, A | Left half of the screen | LB / LT / d-pad left |
| Right flipper | **/**, →, Right Shift, L, D | Right half | RB / RT / d-pad right |
| Plunger | Hold **Space** (or Enter, ↓), let go to launch | Hold anywhere, let go | Hold **A** |
| Nudge | ↑, W, N | Quick swipe up | Y |
| Pause · sound · help | P · M · H | Buttons, top right | Start |

Flipping also moves the lit S T A R lanes, like a real table's lane change.
Nudge too hard and the table **tilts**: dead flippers until the ball drains.

## The table

The table is mirror-symmetric, and packed:

- **Twin lanes**: the right one is the shooter lane; extra balls launch
  themselves from the left one.
- **Twin orbits** with **spinners** (loop all the way round for an ORBIT
  award), fed by **mini flippers** up in the corners.
- **Crossing ramps**: a lit bridge over the bumpers. Each ride drops the ball
  into the opposite orbit; ramps back to back multiply.
- **Pop bumpers** (three planets), **slingshots** and inlane **rollover
  stars**.
- **Two drop target banks** (clear one for a bonus, both for a DOUBLE BANK).
- Four **S T A R** top lanes (all four raise the playfield multiplier up to
  ×5).
- **S U P E R N O V A** rollover letters arching over the star: spell it for a
  big award and a burst of mass.
- The **dying star** itself, with **two moons** orbiting it, and **twin
  wormhole** saucers.
- **Combos**: major shots within 2.5 seconds of each other chain for growing
  bonuses.
- **Ball save** for the first 6 seconds of each ball, a **ball search** if the
  ball ever gets stuck, and an end-of-ball **bonus count** on the dot-matrix
  display.

## Sectors and what they unlock

| Sector | Name | New |
| --- | --- | --- |
| 1 | Red Dwarf | The base table |
| 2 | Yellow Sun | **Wormhole locks**: lock two balls for 3-ball multiball, then hit the star for jackpots (bumpers relight them) |
| 3 | Blue Giant | A **comet** streaks across the top |
| 4 | Pulsar | A roaming **black hole** bends your shots; fall in for a gravity assist (double scoring) |
| 5 | Neutron Star | An alien **mothership** with hit points patrols the top |
| 6–8 | Magnetar, Quasar, Supernova | Higher targets, new palettes |
| 9+ | Deep space | Endless |

Each sector repaints the table in its own colours. Clearing one gives a ball
back.

**Upgrades** (20, pick one of three per sector): Mega Bumpers, Long
Flippers, Ball Saver, Kickback, Magna-Save, Center Post, Extra Balls, Hot
Slings, Heavy Star, Combo King, Gold Spinner, Multiball+, Jackpot ×2, Low
Gravity, Chain Lightning, Ghost Ball, Overclock (stacks), Long Nova, Head
Start and Steady Hands.

## How it's made

The physics is a fixed-step simulation (60 Hz, 10 substeps a frame, so a fast
ball never moves more than about 1.7 px per step and can't tunnel through a
wall). Walls are line segments, bumpers and posts are circles, and flippers
are tapered capsules whose surface speed (ω × r) is added to the bounce, so a
flip really throws the ball. Balls also bounce off each other in multiball.

The pixel art is drawn at 176 × 344 and scaled by whole device pixels. A
cheap **bloom** pass (the table shrunk to 1/4 and 1/8 size, then added back
blurred) makes every lamp and wall glow like neon. The dot-matrix display
above the table runs its own animations for jackpots, multiball, supernova,
combos and the bonus count.

Big moments get slow motion, screen shake, flashes, fireworks, shockwave
rings, lightning between bumpers and a light show on the lamps. **Reduce
motion** (in help) turns all of that off.

| File | What |
| --- | --- |
| `src/table.js` | The layout: walls, bumpers, targets, lanes, flippers |
| `src/physics.js` | Ball stepping, collisions, flippers, ball on ball |
| `src/game.js` | The rules: scoring, combos, wormhole, multiball, supernova, sectors, upgrades, tilt, bonus, and an autopilot |
| `src/data.js` | Sectors, upgrades and points |
| `src/render.js` | The table, lamps, bloom, dot-matrix display, side panels and menus |
| `src/main.js` | Input, the loop, effects, the DMD's messages and menus |
| `src/audio.js` | Synthesised sound and music |

## Tests and tuning

```sh
npm test             # physics and rules: launching, draining, flippers, no tunnelling, gates, bumpers, targets, lanes, supernova, multiball, tilt, ball save, sectors, upgrades
npm run play         # headless Chromium: keyboard, touch (two-finger flips), plunger, warp and upgrade, pause, game over, scaling
npm run check        # all of the above plus the size budget
npm run tune -- 16 30 0.6   # let the autopilot play 16 games (30 min cap) flipping 60% of the time
```

The autopilot plays the attract mode. For tuning it can be made to miss
flips like a person would. At 60%, most of its games end in sectors 1 to 5.

URL flags for testing: `?seed=N`, `?sector=N` (start further in), `?fast`
(3× speed), `?auto` (the autopilot plays your game), `?test` (exposes
`window.__pin`).
