# Working in this repo

- **Ship finished work straight to `main`.** When a project (or a change to one)
  is finished and its checks pass, save it to `main` (`mercurius-agent integrate`, whose release deploys
  https://interwebs.danielzn.com from the Mac; work merged on GitHub goes live
  with `mercurius-agent integrate release --force`). Don't stop at a feature
  branch or open a pull request unless asked. Cloudflare doesn't build this repo.
- Before pushing, run the project's own checks (for example `npm run check` in
  its folder) and the site check from the root: `npm run check`.
- New projects go in their own top-level folder with an `index.html`; see
  README.md for the conventions (relative asset paths, title card metadata,
  `cover.png`).
