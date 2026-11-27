# interwebs

Small web projects, served at **https://interwebs.danielzn.com**.

The home page is a "select an experience" screen: one title card per project,
generated at build time. Every top-level folder with an `index.html` gets a card
and is published at `interwebs.danielzn.com/<folder>/`. For example,
`reentry-surf/` is served at
[interwebs.danielzn.com/reentry-surf](https://interwebs.danielzn.com/reentry-surf).

You can choose with the mouse, touch, arrow keys and Enter, or a gamepad (d-pad and A).

## Adding a project

1. Create a folder with an `index.html` and push to `main`. It shows up on the
   home page automatically.
2. Use relative asset paths (`style.css`, `src/main.js`), not root paths
   (`/style.css`), because each project lives under its own subdirectory. The
   build warns if it finds root paths.
3. Optional, for a nicer title card:

   | In the project's `index.html` | Used for |
   | --- | --- |
   | `<title>` | card title |
   | `<meta name="description" content="…">` | card blurb |
   | `<meta name="interwebs:kind" content="Game">` | small label (default "Experience") |
   | `<meta name="interwebs:accent" content="#f3c252">` | card highlight colour (falls back to `theme-color`, then a palette colour) |
   | `<meta name="interwebs:order" content="1">` | sort order (lower first; otherwise alphabetical by title) |
   | `cover.png` (or `.webp`, `.jpg`, `.svg`) next to `index.html` | card art, 16:9 |

   Without a cover, the card gets a generated pixel-art cover with the project's name.
   `npm run covers` captures `cover.png` for any project that lacks one. It grabs
   the project's own `<canvas>` at native pixel size, which suits pixel-art games,
   and falls back to a screenshot. Use `npm run covers -- --force` to recapture all.

**Sound on phones.** Phones only let WebAudio start inside a finished tap
(`pointerup`, `touchend`, `click`) or a key press, never on `pointerdown` or
`touchstart`. Headless Chromium doesn't enforce this, so it's easy to miss. The
games' `SoundEngine`s listen for those gestures on the whole page, resume the
context (also after iOS "interrupts" it), and ask iOS for the `playback` audio
session so the silent switch doesn't mute them. `npm run check` fakes the
phone rule and taps every project that creates an `AudioContext` to make sure
its sound starts.

**Gestures on phones.** iOS Safari ignores `user-scalable=no`, so each game
stops double-tap zoom with `touch-action: manipulation` on every element,
blocks pinch-zoom by cancelling `gesturestart`, and turns off text selection
and long-press callouts on the whole page (text fields excepted). Otherwise a
double tap on a button, or a gap between buttons, zooms the page, and a long
press highlights text, sometimes text that's only there for screen readers.
`npm run check` reads the computed styles of every element in every project
to make sure none of it creeps back.

**Edge to edge on iPhones.** Safari shows the page behind the status bar,
the Dynamic Island and its toolbars, outside the area a game's canvas fills.
Each game's `src/bleed.js` samples the colours along the canvas's top and
bottom edges a few times a second and paints them into soft layers behind
the game that reach well past the top and bottom of the screen (the body has
no background of its own, so they show wherever the canvas stops, including
behind Safari's toolbar, which sits inside the page), and sets the page
background to match. No page sets `theme-color`, so Safari's
bars stay see-through instead of solid. On the home page the fixed layers
(the starfield) reach down behind the toolbar and none has a solid
background, so its own background runs behind the bars as you scroll. `npm run check` makes sure every game with a canvas does this.

Dev-only files and folders at the top of a project are not published:
`node_modules`, `tests`, `test-results`, `scripts`, `tools`, `package.json`,
`package-lock.json`, `eslint.config.js` and `README.md`; nor are dotfiles,
anywhere. The list is in `build.mjs`.

`_archive/` holds things kept for reference but never published (for example
`_archive/site-concepts/`, eight website prototypes).

Folders starting with `_` or `.`, plus `scripts`, `dist` and `node_modules`,
are never treated as projects.

## Mounting another repo

A project can also live in its own repository and Cloudflare Worker and still be
served at `interwebs.danielzn.com/<folder>/` with a card on the home page. For
example, `/surprise-me/` is the `surprise-me` Worker, and `/kalumkari/` (unlisted,
no card) is the `kalumkari-site` Worker. The site's `worker.js`
forwards that folder's requests to the Worker through a service binding. Only
mounted paths run it (`assets.run_worker_first`); everything else is served as
plain static assets.

To mount another one:

1. In the other repo's `wrangler.jsonc`, set `"assets": { …, "base_path": "/<folder>/" }`
   and `"workers_dev": false` (it needs no public URL of its own), then deploy it.
   Its pages should use relative asset paths.
2. Here, add an entry to `_mounts/mounts.json`:
   `"<folder>": { "binding": "<BINDING>", "title": "…", "description": "…" }`
   (optional `kind`, `accent`, `order`, as for cards). Add a 16:9 cover as
   `_mounts/<folder>.jpg` (or `.png`, `.webp`, `.svg`). For an unlisted page with
   no card, the entry is just `"<folder>": { "binding": "<BINDING>", "card": false }`.
3. In `wrangler.jsonc`, add `{ "binding": "<BINDING>", "service": "<worker name>" }`
   to `services`, and add `"/<folder>"` and `"/<folder>/*"` to `assets.run_worker_first`.

`npm run check` makes sure every mount has its binding, its `run_worker_first`
paths, a cover and a card (or no card, if it has `"card": false`), that `/<folder>` redirects to `/<folder>/`, and that
its paths reach its Worker unchanged. To try both Workers together locally, run
`npx wrangler dev -c wrangler.jsonc -c ../<other repo>/wrangler.jsonc` (the other
repo checked out next to this one, without its `node_modules`, which wrangler
would otherwise watch as site files).

## How it works

- `build.mjs` copies each project into `dist/` and generates the home page, a 404
  page, and placeholder covers. The home page's style and script live in `_site/`.
- `wrangler.jsonc` deploys `dist/` as a Cloudflare Worker with static assets, bound
  to `interwebs.danielzn.com`. Its `worker.js` only runs for mounted projects
  (see "Mounting another repo"). `scripts/deploy.sh` deploys it from the Mac
  (`mercurius-agent integrate` runs it after a push to `main`); Cloudflare doesn't
  build the repository.

```sh
npm install
npm run build     # build dist/
npm run check     # build, then test the site in headless Chromium
npm run covers    # capture missing cover.png files
npm run preview   # serve with wrangler at http://localhost:8787 (builds first)
```

`check` and `covers` use `playwright-core`, which needs a Chromium. After installing the dependencies, run
`npx playwright-core install --only-shell chromium` to install the pinned browser for checks. Set
`CHROMIUM_PATH=/path/to/chromium` if Playwright's browsers aren't installed.
