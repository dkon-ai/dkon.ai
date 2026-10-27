# hero-optimind: the north star's grammar for dkon.ai (clay)

Built overnight Oct 26-27 2026 on WINTERMUTE by HERO (a DKON blade), with ORB's tree orb and EMBOSS's plates. **Clay, never pushed:** main deploys live through GitHub Pages, so this branch stays local until Rick says otherwise.

## See it
`hugo server --bind 127.0.0.1 --port 8912 --disableFastRender` (Hugo extended 0.140.0, the same as CI). Push the clay with URL params: `?sky=slate|paper` · `?grow=0` (the full tree from the first frame) · `?icons=svg` (live SVG emboss instead of the plates) · `?type=unbounded|serif` · `?float=1` (the wall's floating panel; automatic at 21:9 and up) · `?tour=1` (drifts through everything on a loop) · `?orb=standin` (the canvas stand-in).

## What lives where
- `layouts/index.html`: the landing, standalone (no baseof). Five beats: the split and the seed (001), the tree growing (002), the wipe and the cards (003), the story (004), the letters (005).
- `layouts/_default/{single,list}.html`, `layouts/404.html`, `layouts/partials/hero/`: the letters, About and the 404 in the same grammar.
- `static/hero/hero.css` (both skies, the wall, the phone), `letters.css`, `hero.js` (one pinned GSAP timeline, the growth, the intro, the plates' sweep, the tour).
- `static/hero/orb-tree.js`: the adapter around ORB's orb (`static/hero/orb/`, copied from the orb branch; refresh with `tools/refresh-hero-data.sh`). `orb-standin.js` is the fallback.
- `static/hero/plates/`: EMBOSS's renders as 640 px WebP, base relief and gold-only. Blend the gold with `screen`; it reproduces EMBOSS's composite.
- `static/hero/fonts/`: subset WOFF2 (Archivo with its width axis, Inter, JetBrains Mono, Unbounded, Young Serif), all OFL. `static/hero/vendor/`: GSAP 3.13 (standard no-charge licence).

## Before this goes public (Rick's calls)
1. Whether the page may carry the real tree's shape. It's positions, charge, weight and births to the day: no words and no authors.
2. Paper or slate.
3. Where "Letters from the Glass" and "Watch on YouTube" point, once the newsletter has a home.
