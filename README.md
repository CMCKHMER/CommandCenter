# Command Center

A static, HTML-first dashboard (CMC Network) used for educational materials, interactive exercises, and teacher resources.

> This README was updated automatically to match the repository contents. Please review and edit any project-specific details.

---

## What this is
Command Center (CMC Network) is a static front-end dashboard serving learning materials (PDFs, interactive games, worksheets, and story content) for students and teachers.

### Stack
- Language(s): HTML (primary)
- Framework / runtime: Static HTML + Tailwind via CDN
- Notable libraries: Tailwind CSS (via CDN), Google Fonts

## How it's organized
```
.gitattributes         # Git attributes
.github/               # GitHub workflows or issue templates (if present)
.gitignore
LICENSE
README.md
index.html             # Main dashboard / entry point (CMC Network)
RF.html                # Reading Future materials (legacy page)
RF2_materials.html     # Reading Future Connect 2 materials (links from dashboard)
Test.html
syntex.html            # Syntax / grammar game
toefl_reading_test.html
toefl_writing_test.html
unittest.html
word.html
wordreview.html
wordtest.html
write.html             # Writing practice page
The_Hallow_Below_story/ # Interactive story/book (has its own index.html)
assets/screenshot.svg  # Placeholder screenshot added for README
```

How it fits together: index.html is the main dashboard that links to other static pages (RF, RF2 materials, games like syntex.html, write.html, and the The_Hallow_Below_story book folder). The site is static — pages are navigated by anchor links and standard hyperlinks; interactive behaviour is implemented with client-side JS embedded in the HTML files.

## How to run it
The site is static. The fastest way to preview locally:

```bash
# Clone
git clone https://github.com/CMCKHMER/CommandCenter.git
cd CommandCenter

# Option A: Open directly
# double-click index.html or open it in your browser

# Option B: Serve with Python's simple HTTP server
python -m http.server 8000
# then open http://localhost:8000

# Option C: Serve with npx http-server
npx http-server -p 8000
```

## Project details & usage notes
- index.html is the primary entry point and implements the dashboard UI and navigation to the site's learning modules.
- The `The_Hallow_Below_story/` directory contains an interactive story with its own index.html — useful as an example of multi-page content in this repo.
- Several pages appear to be learning modules or tests (TOEFL pages, word exercises). Inspect each HTML file to find the source content and any assets embedded inline.

## CommandCenter hero banner
A wide, dark, terminal-inspired hero section built as a drop-in homepage banner.

![CommandCenter hero](assets/hero/hero-poster.png)

- **Preview it:** open [`command-center.html`](command-center.html) — a standalone page that renders the banner at full size.
- **Drop it in:** copy [`assets/hero/hero.html`](assets/hero/hero.html) into a page that already links `assets/hero/hero.css` and `assets/hero/hero.js`. All styles are scoped under `.cc-hero`, so it will not collide with existing Tailwind or page styles.
- **Artwork:** four hand-built SVG layers (`assets/hero/hero-grid.svg`, `hero-floor.svg`, `world-map.svg`, `circuit.svg`) — holographic grid, perspective data floor, dotted world map, and glowing circuit traces. All are resolution-independent and total under 30 kB.
- **Proportions:** the banner lands at 16:9 (1600x894) on a 1600px viewport and stretches to 2.86:1 on ultrawides, so it reads as a panoramic homepage header rather than a content block. Below 1180px it folds into a single column and stacks cleanly down to 390px.
- **Behaviour:** the sparkline draws itself, telemetry bars rise, metric counters count up, and the prompt types out on a loop. The finished state is the default, so the banner is complete with JavaScript disabled; `prefers-reduced-motion` skips the animation and keeps it visible.

Rebuild the artwork, the reusable fragment, the comp previews, and verify:

```bash
npm i -D sharp
node design/build-art.mjs      # writes assets/hero/* + design/previews/*.png
node design/verify-hero.mjs    # static checks: assets, classes, SVG paths, tags
```

The artwork SVGs are generated, but the **social poster and the review
screenshots come from the real page** — `design/shot.mjs` renders
`command-center.html` in headless Chromium and writes
`design/previews/live/*.png`, a metrics report, and `assets/hero/hero-poster.png`:

```bash
npm i -D playwright-core @sparticuz/chromium sharp \
         @fontsource/space-grotesk @fontsource/outfit @fontsource/jetbrains-mono
node design/shot.mjs
```

See [`design/README.md`](design/README.md) for how the artwork is generated and
what the checks cover.

## Screenshots
A placeholder screenshot has been added at assets/screenshot.svg — replace it with a real PNG/JPEG screenshot if you want images in the README.

![Dashboard screenshot](assets/screenshot.svg)

## Contributing
Contributions are welcome:
1. Fork the repository
2. Create a branch: `git checkout -b feature/my-change`
3. Commit: `git commit -m "Describe your change"`
4. Push and open a PR

If you have large media files (images, PDFs), consider using LFS or hosting them externally and linking.

## License
This project is released under the MIT License — see [LICENSE](LICENSE).

## Contact
Repository owner: CMCKHMER

If you'd like an email or project maintainer added here, tell me and I will update the README.
