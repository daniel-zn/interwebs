# Savannah Bakes · résumé examples

Served at https://interwebs.danielzn.com/savannahbakes-resume/ (not linked from
the interwebs home page; every page is `noindex`). This README is not published.

Nine versions of the same résumé, each a different visual treatment. The content
is only what is on her résumé (the PDF here), with the PDF's bolding.

```
savannahbakes-resume/
  index.html                   landing page: name, links, one card per version
  fonts/                       Orbix + Orbitron for the landing page only (OFL licences beside them)
  Savannah-Bakes-Resume.pdf    used by the landing page
  <version>/
    index.html                 the whole page (CSS and JS inline)
    Savannah-Bakes-Resume.pdf  its own copy of the PDF
    cover.webp                 640×400 card image for the landing page
```

Versions: `living-matter`, `swiss-grid`, `feature`, `two-inks`, `chronology`,
`contours`, `specimen`, `colour-fields`, `letterpress`.

## Moving one version to her own site

Each version folder is self-contained. Copy the folder's contents to the new
site's root (`index.html` + `Savannah-Bakes-Resume.pdf`; `cover.webp` is only
for the card) and then:

1. Remove the "← All versions" link (the only link that leaves the folder,
   `href="../"`).
2. Remove `<meta name="robots" content="noindex">` so search engines can index it.
3. Optionally replace the PDF. The current one is the file she supplied and
   includes her phone number, which the pages themselves leave out.

The only outside requests are Google Fonts (`fonts.googleapis.com` /
`fonts.gstatic.com`). `living-matter` is WebGL and falls back to plain HTML
without it.

## Cleaning up afterwards

Delete the versions that aren't used (their folders, plus their entries in the
`versions` list near the bottom of `index.html`), or delete this whole folder.
Nothing else in the repo depends on it.
