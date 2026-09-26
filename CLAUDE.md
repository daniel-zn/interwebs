# Working in this repo

- **Ship finished work straight to `main`.** When a project (or a change to one)
  is finished and its checks pass, merge it into `main` and push. Don't stop at a
  feature branch or open a pull request unless asked. Every push to `main`
  redeploys https://interwebs.danielzn.com.
- Before pushing, run the project's own checks (for example `npm run check` in
  its folder) and the site check from the root: `npm run check`.
- New projects go in their own top-level folder with an `index.html`; see
  README.md for the conventions (relative asset paths, title card metadata,
  `cover.png`).
