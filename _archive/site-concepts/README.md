# Site concepts (archived, not deployed)

Eight working prototypes of radically different personal websites, built on
danielzn.com content (projects, résumé, course notes) as general design concepts.
They are kept here for reference only: `_archive/` is never built or deployed
(folders starting with `_` are not projects, and only `_pages/` is published).

| File | Concept |
| --- | --- |
| `c/scope.html` | Bench Scope: the site is a WebGL oscilloscope; knobs scrub projects, the beam traces text, photos scan onto phosphor |
| `c/bench.html` | The Workbench: physics desk of objects (matter-js); pick things up to read them, tape measure, magnifier, lamp |
| `c/zine.html` | Riso Zine: a stapled two-ink zine with 3D page curl and live halftone photos |
| `c/zoom.html` | Infinite Zoom: each project nested inside a detail of the previous one, one endless zoom |
| `c/museum.html` | The Museum: walkable three.js gallery with a wing per craft |
| `c/synth.html` | The Instrument: WebAudio groove box where every project is a pad |
| `c/matter.html` | Living Matter: GPU particles that morph between the name, titles and photos |
| `c/town.html` | The Town: a walkable pixel-art town where buildings are sections |

`index.html` is a gallery of all eight (thumbnails in `img/thumb-*.webp`).
Project images are in `img/`, the shared content in `content.json`.

## Viewing them

They use relative paths, so serve the folder and open `index.html`:

```sh
cd _archive/site-concepts && python3 -m http.server 8000
# http://localhost:8000/
```

Some load libraries and fonts from cdnjs and Google Fonts.

The Living Matter concept was adapted into Savannah Bakes's résumé at
`_pages/savannahbakes-resume/living-matter/`.
