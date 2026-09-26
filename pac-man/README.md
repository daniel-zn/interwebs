# Pac-Man

The arcade classic, rebuilt from scratch for the browser. Eat all 244 dots in
the maze, dodge Blinky, Pinky, Inky and Clyde, and use the four energizers to
turn the tables.

**Stack:** vanilla JS + Canvas 2D · no runtime dependencies · no build step ·
about 24 KB gzipped in total (`npm run size`).

## Play

ES modules need HTTP, not `file://`:

```sh
cd pac-man
npm start            # zero-dependency server on http://127.0.0.1:8080/
```

## Controls

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Steer | Arrows or **W A S D** | Swipe (keep your finger down and keep swiping to steer) | D-pad or left stick |
| Start / play again | **Enter** or **Space** | Tap | **A** or **Start** |
| Pause | **P** or **Esc** | ❚❚ button | **Start** |
| Sound / help | **M** / **H** | Buttons, top right | – |

Turns are buffered: press a direction early and Pac-Man takes the next gap that
way. He can reverse at any time.

## How it follows the arcade game

- **Maze and timing.** The original 28 × 31 tile maze at its native 224 × 248
  pixels, with the arcade's speed tables (Pac-Man 80% on level 1, ghosts 75%,
  40% in the tunnel, 50% when frightened, and so on up the levels), the pause
  after each dot, and the scatter/chase schedule (7 s scatter, 20 s chase, …).
  Ghosts reverse whenever the mode changes.
- **Ghost personalities.** Every ghost picks, at each junction, the exit
  closest to its target tile (ties go up, left, down, right), and may not turn
  upward at the four "red zone" junctions above the house and Pac-Man's start.
  - **Blinky** targets Pac-Man's tile, and speeds up ("Cruise Elroy") when few dots are left.
  - **Pinky** targets four tiles ahead of Pac-Man (and four left as well when he faces up, the arcade's overflow bug).
  - **Inky** doubles the vector from Blinky to the tile two ahead of Pac-Man.
  - **Clyde** chases while more than eight tiles away, then heads for his corner.
- **The ghost house.** Pinky leaves at once, Inky after 30 dots and Clyde after
  60 on level 1 (fewer later). If Pac-Man stops eating for 4 seconds, the next
  ghost comes out anyway. After a death, a shared dot counter takes over.
- **Energizers** frighten the ghosts for a time that shrinks with the level
  (6 s on level 1, none from level 19). Eaten ghosts score 200, 400, 800 and
  1600, and their eyes race back to the house.
- **Fruit** appears after 70 and 170 dots: cherry, strawberry, orange, apple,
  melon, Galaxian, bell, key. Extra life at 10,000 points.

The sounds are synthesised with WebAudio and the intro fanfare is original,
not the arcade tune.

**Relaxed speed** (in the help panel) slows everything by 20% and stretches the
energizers to match. **Reduce motion** stops the blinking and flashing.

## Code

| File | What |
| --- | --- |
| `src/maze.js` | The maze layout and tile lookups |
| `src/sim.js` | All the rules, with no DOM: movement, ghost AI, scoring, levels, and the attract-mode autopilot |
| `src/render.js` | Pixel-art sprites and the maze outline, drawn at native resolution |
| `src/main.js` | Input, scaling, game flow and menus |
| `src/audio.js` | Synthesised sound |

The canvas is scaled by whole device pixels so the pixel art stays crisp.
Portrait screens get the scores above and below the maze; landscape screens
get them beside it.

## Tests

```sh
npm test             # rules: maze, movement, tunnel, ghost targets, modes, house, scoring, levels
npm run play         # headless Chromium: keyboard, swipe, menus, persistence, scaling
npm run check        # all of the above plus the size budget
```

URL flags for testing: `?seed=N` (repeatable games), `?level=N` (start on a
later level), `?fast` (3× speed), `?test` (exposes `window.__pac`).
