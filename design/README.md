# CommandCenter hero — design pipeline

Everything that renders the hero banner: the artwork sources, the generators
that derive the complex pieces, and the checks that keep it honest.

```
command-center.html          standalone page: full-size hero + page shell
assets/hero/
  hero.html                  the reusable fragment (generated from the page)
  hero.css                   all hero styling, scoped under .cc-hero
  hero.js                    typing prompt, counters, scroll reveal
  hero-grid.svg              ambient holographic grid + circuit traces + grain
  hero-floor.svg             perspective data floor over the horizon
  world-map.svg              dotted world map (generated)
  circuit.svg                glowing PCB-style traces
  hero-poster.png            1200x630 render of the comp, used for og:image
design/
  hero-mock.svg              design comp — the geometry hero.css implements
  build-art.mjs              generates world-map.svg, hero.html, poster, previews
  build-coastline.mjs        decodes Natural Earth data into design/data/
  verify-hero.mjs            static checks (assets, classes, paths, tags)
  shot.mjs                   renders the real page in headless Chromium (screenshots + poster)
  data/coastline.json        coastline rings, Natural Earth 1:50m (public domain)
  previews/*.png             raster previews for review
  previews/live/*.png        browser renders of the real page (generated, not committed)
```

## Comp, screenshot, and which one wins

`design/hero-mock.svg` is a **1:1 spec of the hero** — same copy, same pixel
geometry, same colours as `hero.css`. Every number in the comp has a
counterpart in the stylesheet: the shell is 1520 px wide, the terminal body is
12.9 px, panels are 16 px radius, and so on. It is still useful as an annotated
reference for spacing, but it is a drawing: it cannot catch a cascade bug.

`design/shot.mjs` is the source of truth. It drives the *actual page* in headless
Chromium, injects the `@fontsource` copies of the three typefaces (so the render
does not depend on Google Fonts being reachable), waits for the entry animation
to settle, and writes:

- `design/previews/live/<viewport>.png` — 1600x900, 1920x1080, 2560x1080,
  1280x800, 834x1112, 390x844
- `design/previews/live/report.json` — measured hero box, aspect ratio, title
  size, loaded font faces, console errors, and any element overflowing the hero
- `assets/hero/hero-poster.png` — the 1200x630 og:image, cropped from a real
  1920x1008 render rather than from the comp

That is how the metric-strip regression was found: in the comp the cards read
`128+ / COMMANDS SHIPPED`, but in the browser the unit wrapped onto its own line
and the numerals rendered at label size, because a single unqualified
`.cc-hero__metric span` rule was also matching the counter `<span>` inside `<b>`.

The artwork layers were rendered individually and inspected as PNGs, which is
how a malformed arc in the comp was caught (an `a` command whose flags swallowed
a coordinate and drew a stray curve across the canvas).

## Regenerating

```bash
npm i -D sharp                       # dev-only, used for raster previews
node design/build-art.mjs            # world map, fragment, comp previews
node design/verify-hero.mjs          # checks must pass

# browser renders + the social poster (needs a Chromium build)
npm i -D playwright-core @sparticuz/chromium \
         @fontsource/space-grotesk @fontsource/outfit @fontsource/jetbrains-mono
node design/shot.mjs

# optional: rebuild the coastline dataset from scratch
npm i -D world-atlas topojson-client
node design/build-coastline.mjs node_modules/world-atlas/land-50m.json
```

`build-art.mjs` reads `command-center.html` between the `<!-- cc-hero:start -->`
and `<!-- cc-hero:end -->` markers and writes `assets/hero/hero.html`, so the
fragment can never drift from the page it is previewed on. Edit the page, not
the fragment.

If `sharp` lives outside the repo, point `NODE_PATH` at it — the scripts resolve
it through `require()` for exactly that case:

```bash
NODE_PATH=/path/to/node_modules node design/build-art.mjs
```

## What the checks cover

`verify-hero.mjs` fails the build on:

- asset paths referenced by the page that do not exist on disk
- classes used in the markup that the stylesheet never defines (and reports the
  reverse, which is usually a left-over)
- `var(--cc-*)` properties that are never declared
- unbalanced or mismatched tags in the hero fragment
- `<svg>` elements without a `viewBox`
- anchors pointing at ids that do not exist
- malformed SVG path data — validated with a strict scanner: known commands,
  correct arity, arc flags read as single digits, well-formed numbers

It cannot judge intent, so the previews in `design/previews/` are reviewed by
eye as well.

## Design tokens

| Token | Value | Used for |
| --- | --- | --- |
| `--cc-ink` | `#05070d` | page base |
| `--cc-cyan` | `#22d3ee` | primary accent, prompts, lines |
| `--cc-green` | `#a3e635` | success states, "online", counters |
| `--cc-purple` | `#a855f7` | secondary accent, gradients |
| `--cc-text` | `#e6f1ff` | body copy |
| `--cc-text-dim` | `#93a7bd` | descriptions |
| `--cc-text-faint` | `#7b90a6` | labels, metadata |

Type: **Space Grotesk** for the headline (`--cc-display`), **Outfit** for prose
(`--cc-body`), **JetBrains Mono** for anything terminal-flavoured (`--cc-mono`).
All three load from Google Fonts, with system fallbacks for offline use.

## Progressive enhancement

The finished state is the *default*: the counters carry their real values, the
sparkline is already drawn, and the bars carry their heights, all from the
markup and base CSS. `hero.js` only adds `.is-live`, which replays the entry as
keyframe animations and types the prompt. So with JavaScript disabled nothing
looks half-built, and with `prefers-reduced-motion` the animation is skipped
while the finished state stays visible.
