# Supernova Pinball

A roguelike neon pinball table built around a dying star. Every star system
is a **sector** with a score target: reach it and the ball warps to the next
one, and you pick one of three table upgrades. Run out of balls and it's over.

Everything you hit feeds the star at the centre of the table. When its mass
meter fills, it goes **SUPERNOVA**: two extra balls, double scoring for 20
seconds, slow motion, and the whole table lights up.

**Stack:** vanilla JS + Canvas 2D · no runtime dependencies · no build step ·
all sound and music synthesised with WebAudio · about 60 KB gzipped
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

The table fills the screen: on a phone it takes the full width and nearly
the whole height (the menu buttons sit either side of the display), on a
laptop the full height, with score and upgrades in panels either side. The
lower half is a classic symmetric pair of flippers, slingshots and lanes; the
upper half is lopsided and packed:

- **Warp ramp**: a see-through spiral round the wormhole vortex, down into
  the left orbit. **Comet ramp**: a hairpin over the bumpers into the right
  orbit. Ramps back to back multiply.
- **Plasma cannon**: roll the ball slowly into its muzzle and it loads. The
  turret sweeps back and forth; flip to fire the ball wherever it points. Hit
  a major shot straight out of the cannon for a **CANNON SNIPE**.
- **Mystery saucer**: catches the ball, spins a slot-machine reel of awards
  on the display (big points, light lock, extra ball, multiplier, super
  spinner, super jets, ball save, star mass, a mission, letters), then kicks
  it back out.
- **Lots of different round things to hit**:
  - **Four pop bumpers** (planets, one ringed) under the top lanes.
  - **Binary stars**: two small bumpers orbiting each other. Hit both within
    a second for an **ECLIPSE**.
  - The **gas giant**: big, soft and bouncier than anything else; it wobbles
    like jelly.
  - **Meteors**: six crystal pegs that crack, then shatter. Smash them all for
    a **METEOR SHOWER**, and they grow back.
  - The **quasar**: a target that blinks to a new spot every few seconds and
    is worth more every time you catch it.
  - The **gravity bob**: a pendulum hanging over the flippers. Hit it hard
    enough and it swings right over the top.
  - The **dying star** with **two orbiting moons**, and an **asteroid belt**
    drifting below it.
- **The vortex**: a spinning disc that swirls the ball into the **wormhole**,
  which teleports it out of the **white hole** across the table. It starts
  missions, collects extra balls and locks balls for multiball.
- **The pulsar**: a bar spinning in the middle of the table. Ten hits send it
  into **overdrive** (faster, and five times the points).
- **Two orbits**: a **spinner** on the left, a **hyperspace gate** on the
  right. Loop all the way round for an ORBIT award.
- **Two mini flippers**, one on each orbit guide, at different heights.
- **Four pop bumpers** under four **S T A R** top lanes (all four raise the
  playfield multiplier up to ×5). Each plunge lights one lane as a **skill
  shot**; the flippers move it.
- A **five-bank of drop targets**, **I O N standups** (they light missions)
  and a **captive ball** chamber (smack it to the top to crack the planet).
- The **S U P E R N O V A** rollover letters arching over the star.
- **Combos**, **ball save** for the first 8 seconds of each ball, a **ball
  search** if the ball ever gets stuck, and an end-of-ball **bonus count**.

### Missions

Missions start at the wormhole (or by cracking the planet) when lit; the
first one is lit from the start and the I O N targets relight them. Arrows
in front of each shot blink when the running mission wants it, and the
display counts down the time.

| Mission | Goal |
| --- | --- |
| Comet Chase | Hit the lit shot 4 times; it moves after every hit |
| Orbit Run | 4 orbits |
| Hyperdrive | 4 ramps |
| Star Forge | 8 star hits (worth 5× while it runs) |
| Solar Sweep | Every shot on the table once |

Every third completed mission lights an **extra ball** at the wormhole.
Every fifth sets off the **BIG BANG**: three more balls and every shot on
the table lit at 250,000 (× the sector) for 40 seconds.

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

The table is 240 × 480 units. Everything on it is drawn as smooth vector
shapes (spline ramps with rails and struts, shaded planets, tapered
flippers) on a canvas with up to 4 device pixels per unit, so it stays sharp
at any size; only the lettering keeps a chunky pixel font. A
cheap **bloom** pass (the table shrunk to 1/4 and 1/8 size, then added back
blurred) makes every lamp and wall glow like neon. The dot-matrix display
above the table runs its own animations for jackpots, multiball, supernova,
combos and the bonus count.

Big moments get slow motion, screen shake, flashes, fireworks, shockwave
rings, lightning between bumpers and a light show on the lamps. **Reduce
motion** (in help) turns all of that off.

| File | What |
| --- | --- |
| `src/table.js` | The layout: walls, bumpers, targets, lanes, ramps (as splines), the vortex, cannon, saucer, pulsar, pendulum, binary stars, meteors, gas giant, quasar, captive ball, flippers |
| `src/physics.js` | Ball stepping, collisions, flippers, ball on ball |
| `src/game.js` | The rules: scoring, combos, missions, Big Bang, cannon, mystery awards, the round targets, skill shot, wormhole, multiball, supernova, sectors, upgrades, tilt, bonus, and an autopilot |
| `src/data.js` | Sectors, upgrades and points |
| `src/render.js` | The table, lamps, bloom, dot-matrix display, side panels and menus |
| `src/main.js` | Input, the loop, effects, the DMD's messages and menus |
| `src/audio.js` | Synthesised sound and music |

## Tests and tuning

```sh
npm test             # physics and rules: launching, draining, flippers, no tunnelling, gates, bumpers, targets, lanes, supernova, multiball, tilt, ball save, sectors, upgrades
npm run play         # headless Chromium: keyboard, touch (two-finger flips), plunger, warp and upgrade, pause, game over, scaling
npm run check        # all of the above plus the size budget
npm run tune -- 16 30 0.8   # let the autopilot play 16 games (30 min cap) flipping 80% of the time
```

The autopilot plays the attract mode. For tuning it can be made to miss
flips like a person would. At 80%, most of its games end in sectors 2 to 5, and some reach 9.

URL flags for testing: `?seed=N`, `?sector=N` (start further in), `?fast`
(3× speed), `?auto` (the autopilot plays your game), `?test` (exposes
`window.__pin`).
