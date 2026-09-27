# Black Hole Slots

A roguelike slot machine, in the spirit of CloverPit. Your slot machine is
drifting into a black hole, and the hole wants coins. Every round there's a
**debt** due in three days. Spin the reels, stack up **charms** and gifts from
the void, and pay each debt before the deadline, or watch the whole machine
get spaghettified past the horizon.

Pay all eight debts to escape. Then keep going in endless mode if you dare.

**Stack:** vanilla JS + Canvas 2D · no runtime dependencies · no build step ·
all sound and music synthesised with WebAudio · about 59 KB gzipped (`npm run size`).

## Play

ES modules need HTTP, not `file://`:

```sh
cd black-hole-slots
npm start            # zero-dependency server on http://127.0.0.1:8080/
```

## How a run works

1. **Pit stop.** Each day starts here. Spend **tickets** on charms (four for
   sale, reroll for more), sell charms you've outgrown, then pick a deal:
   **7 spins + 1 ticket**, or **4 spins + 3 tickets**. From day 2 you can
   **pay early** if you're covered, skipping the rest of the round for bonus
   tickets.
2. **Spin.** The machine is a 5 × 3 grid. Every match on screen pays the
   symbol's value times the pattern's mult:

   | Pattern | Mult |
   | --- | --- |
   | Row of 3 · 4 · 5 | ×1 · ×2 · ×3 |
   | Column · Diagonal | ×1 |
   | Zig (V) · Zag (Λ) across all five reels | ×4 |
   | Orbit: eight round an empty middle | ×7 |
   | Jackpot: all fifteen | ×10, plus every other line |

   Symbols: Comet and Moon 2, Planet and Rocket 3, Alien and Star Gem 5,
   Lucky 7 is 7.
3. **The void.** Three or more **Void Eyes** anywhere on screen and the void
   eats a quarter of your coins and cancels the spin. They land more often
   every round.
4. **Deadline.** After three days the hole collects. Can't pay? Swallowed.
5. **Transmission.** Pay, and the void offers one of three permanent gifts:
   bigger symbol values, pattern mults, luck, extra spins, tickets, or a
   stacking ×1.5 on every win.

### Deeper in: mechanics that unlock as you go

Each arrives with a "new mechanic" card the first time you reach its round.

| Round | Mechanic |
| --- | --- |
| 2 | **Overdrive.** Winning spins charge a meter under the reels (more lines, more charge; a jackpot fills it; the void drains half). When it's full, the next 3 spins pay ×3, with hyperspace streaking past. |
| 3 | **Golden symbols.** Some cells land gold (luck and Golden Hour help). Every gold symbol in a paying line doubles that line, up to ×8. |
| 4 | **Pulsars and the Bonus Wheel.** A scatter symbol that never pays in lines. Three or more anywhere spin a prize wheel: coins (30%, 70% or 150% of the debt), +3 spins, +4 tickets, +1 luck, or Overdrive. |
| 5 | **Cosmic events.** Every day brings space weather: Meteor Shower (Comets and Moons ×3), Solar Flare (wins ×1.5, twice the Void Eyes), Gravity Well, Quiet Void, Pulsar Storm, Golden Hour, Alignment. |

There are 25 charms in three rarities. Some highlights: **Wild Aliens**
(aliens match anything), **Dark Matter** (every winning spin adds mult for
good), **Hot Streak**, **Echo Chamber**, **Wormhole** (free respins),
**Piggy Satellite** (interest), **Event Horizon** (void eyes pay you instead),
and **Double Down** (all wins ×2, fewer spins).

`npm run balance` plays thousands of runs with two simple bots and prints how
far they get. The debts are tuned so a bot that buys charms at random usually
dies around rounds 5 to 7, and a slightly smarter one escapes about one run in
six. A human who builds around a synergy should do better.

## Controls

| Action | Keyboard | Touch / mouse | Gamepad |
| --- | --- | --- | --- |
| Spin | **Space** or **Enter** | Tap the machine, the lever or the SPIN button | **A** |
| Choose in menus | Arrows, then **Enter** | Tap (on touch, the first tap on a charm shows it, the second buys it) | D-pad, then **A** |
| Read your charms | Arrows while spinning | Point or tap | – |
| Sound / help | **M** / **H** | Buttons, top right | – |

Pressing spin while a win is still being counted skips to the end and spins
again.

## The machine

Everything the player watches is one big pixel-art cabinet: a neon marquee
with a flickering tube, chasing bulbs that change pattern while spinning,
teasing, winning, hitting a jackpot or feeding the void, ivory reels with
cylinder shading and motion blur, a seven-segment WIN and SPINS display, a
pull lever, an arcade SPIN button, and a coin tray whose pile grows with your
coins. The reels slow down and glow when the last ones could land something
big (or a third Void Eye). Wins trace their paylines, pop the symbols,
spray sparks, fire spotlight rays and send coins flying to your counter.
Behind it all, the black hole's accretion disk spins, shooting stars streak
past, and the hole grows as the deadline gets closer.

Wins build **heat**. Every paying line heats things up (faster when the total
is big next to the debt), and heat drives everything: the cabinet rocks,
hops and squashes on springs harder and harder, the rays multiply and spin
faster, casino bulbs chase round the edge of the screen, the sky throbs, the
win display goes rainbow and the music speeds up. Big wins, mega wins and
jackpots add sirens, coin showers, coin rain and fireworks.

**Sound:** a space-lounge music loop (bass, arpeggio, drums) that gets busier
with heat, the reel motor's whirr, lever ratchet and spring, a thunk per reel,
a heartbeat while the last reels tease, a sting for every symbol, rising
dings per line, sirens, coin cascades and a sad trombone when you fall in.
Music can be turned off separately in help.

**Fast spins** (in help) halves every animation. **Reduce motion** stops the
flashing, shaking, jiggling, rays and chasing lights. Runs are saved in `localStorage`,
so a reload offers to continue.

## Code

| File | What |
| --- | --- |
| `src/data.js` | Symbols, paylines, charms, debts, deals |
| `src/sim.js` | All the rules, with no DOM: rolling, paying lines, charms, shop, days, debts, transmissions. The run (RNG included) is plain JSON |
| `src/sprites.js` | Symbols and charm icons, from palette strings or painted from maths |
| `src/render.js` | The black hole, the machine, HUD and panels; returns clickable regions each frame |
| `src/main.js` | Flow, reel animation, the win reveal, input and menus |
| `src/audio.js` | Synthesised sound |

The canvas is scaled by whole device pixels so the pixel art stays crisp.
Landscape screens get the stats and charms beside the machine; portrait
screens get them above and below it, and scale the machine to fill the
phone's width.

## Tests

```sh
npm test             # rules: paylines, wilds, the void, charms, shop, days, debts, saving
npm run play         # headless Chromium: keyboard, touch, a full round, losing, escaping, resuming
npm run check        # all of the above plus the size budget
```

URL flags for testing: `?seed=N` (repeatable runs), `?fast` (3× speed),
`?test` (exposes `window.__slots`, including `force(grid)` to pick the next
spin's result).
