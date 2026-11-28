// interwebs.danielzn.com is static assets (dist/) plus mounts: projects that live in their own repo and
// Worker, served at /<folder>/ through a service binding. _mounts/mounts.json lists them; wrangler.jsonc
// gives each a binding and sends only its paths here (assets.run_worker_first), so the rest of the site
// is served as plain assets without running this script. The mounted Worker sets assets.base_path to
// "/<folder>/", so requests are passed on unchanged. A mount's old folders ("old") redirect to its folder.
import mounts from './_mounts/mounts.json' with { type: 'json' };

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    for (const [folder, { binding, old = [] }] of Object.entries(mounts)) {
      // /<folder> -> /<folder>/, so the mounted site's relative asset paths resolve.
      if (url.pathname === `/${folder}`) {
        return new Response(null, { status: 307, headers: { location: `/${folder}/${url.search}` } });
      }
      if (url.pathname.startsWith(`/${folder}/`)) return env[binding].fetch(request);
      for (const was of old) {
        if (url.pathname === `/${was}` || url.pathname.startsWith(`/${was}/`)) {
          const rest = url.pathname.slice(was.length + 1) || '/';
          return new Response(null, { status: 301, headers: { location: `/${folder}${rest}${url.search}` } });
        }
      }
    }
    return env.ASSETS.fetch(request);
  },
};
