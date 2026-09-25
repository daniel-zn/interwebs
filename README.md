# interwebs

Small web projects, served at **https://interwebs.danielzn.com**.

Every top-level folder that has an `index.html` is published at
`interwebs.danielzn.com/<folder>/`. For example, `astro-angler/` is served at
[interwebs.danielzn.com/astro-angler](https://interwebs.danielzn.com/astro-angler).
The root page lists all projects automatically.

## Adding a project

Create a new folder with an `index.html` and push. Use relative paths for assets
(`style.css`, `src/main.js`), not root paths (`/style.css`), because each project
lives under its own subdirectory.

Dev-only files and folders (`node_modules`, `tests`, `scripts`, `tools`,
`package.json`, `package-lock.json`, `eslint.config.js`, `README.md`, and
dotfiles) are not published. The list is in `build.mjs`.

## How it works

- `build.mjs` copies each project into `dist/` and generates the landing page and a 404 page.
- `wrangler.jsonc` deploys `dist/` as a Cloudflare Worker with static assets, bound to
  the custom domain `interwebs.danielzn.com`.

```sh
npm install
npm run preview   # build and serve locally at http://localhost:8787
npm run deploy    # build and deploy from your machine (needs `npx wrangler login`)
```

## Cloudflare setup (one time)

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**
   and pick `daniel-zn/interwebs`.
2. Settings:
   - **Project name:** `interwebs` (must match `name` in `wrangler.jsonc`)
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Production branch:** `main`
3. Deploy. Cloudflare creates the `interwebs.danielzn.com` DNS record and certificate
   from `wrangler.jsonc`, since `danielzn.com` is on the same account.

After that, every push to `main` redeploys the site.
