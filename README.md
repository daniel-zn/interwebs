# interwebs

Small web projects, served at **https://interwebs.danielzn.com**.

The home page is a "select an experience" screen: one title card per project,
generated at build time. Every top-level folder with an `index.html` gets a card
and is published at `interwebs.danielzn.com/<folder>/`. For example,
`astro-angler/` is served at
[interwebs.danielzn.com/astro-angler](https://interwebs.danielzn.com/astro-angler).

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

Dev-only files and folders are not published: `node_modules`, `tests`,
`test-results`, `scripts`, `tools`, `package.json`, `package-lock.json`,
`eslint.config.js`, `README.md`, and dotfiles. The list is in `build.mjs`.
Folders starting with `_` or `.`, plus `scripts`, `dist` and `node_modules`,
are never treated as projects.

## How it works

- `build.mjs` copies each project into `dist/` and generates the home page, a 404
  page, and placeholder covers. The home page's style and script live in `_site/`.
- `wrangler.jsonc` deploys `dist/` as a Cloudflare Worker with static assets, bound
  to `interwebs.danielzn.com`. Every push to `main` redeploys.

```sh
npm install
npm run build     # build dist/
npm run check     # build, then test the site in headless Chromium
npm run covers    # capture missing cover.png files
npm run preview   # build and serve with wrangler at http://localhost:8787
npm run deploy    # build and deploy from your machine (needs `npx wrangler login`)
```

`check` and `covers` use `playwright-core`, which needs a Chromium. Set
`CHROMIUM_PATH=/path/to/chromium` if Playwright's browsers aren't installed.

## Cloudflare setup (one time, already done)

Workers & Pages → Import a repository → `daniel-zn/interwebber`, with project name
`interwebs` (must match `wrangler.jsonc`), build command `npm run build`, deploy
command `npx wrangler deploy`, and production branch `main`.
