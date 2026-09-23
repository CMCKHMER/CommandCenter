/**
 * CommandCenter — hero artwork build script
 * -----------------------------------------
 * Generates the derived hero assets and preview renders:
 *
 *   assets/hero/world-map.svg   dotted equirectangular world map (generated from continent outlines)
 *   design/previews/*.png       raster previews of every hero SVG (for review + README screenshots)
 *   assets/hero/hero-poster.png 1200x630 social/poster render of the banner
 *
 * Run:  node design/build-art.mjs
 * Deps: sharp (dev-only, not required by the site itself)
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// resolved through require() so the script also works when sharp lives
// outside the repo, e.g. NODE_PATH=/path/to/node_modules node design/build-art.mjs
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp is required to build the artwork previews:  npm i -D sharp');
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * 1. Dot-matrix world map
 * ------------------------------------------------------------------ */

// Rough continent outlines, [lon, lat] pairs (equirectangular, 1 px per dot cell).
const LAND = {
  northAmerica: [[-168,66],[-158,71],[-140,70],[-125,70],[-110,69],[-95,73],[-85,74],[-75,73],[-62,66],[-56,52],[-66,46],[-70,42],[-75,36],[-81,26],[-84,30],[-90,29],[-97,26],[-105,22],[-112,25],[-117,32],[-124,38],[-124,48],[-131,53],[-140,60],[-150,60],[-160,58],[-168,66]],
  greenland:    [[-45,60],[-20,70],[-20,82],[-45,84],[-60,80],[-58,68],[-45,60]],
  southAmerica: [[-79,9],[-72,11],[-62,10],[-52,5],[-50,0],[-44,-3],[-35,-6],[-38,-16],[-40,-22],[-48,-26],[-57,-34],[-62,-40],[-66,-46],[-68,-52],[-74,-52],[-73,-44],[-72,-32],[-71,-20],[-76,-14],[-81,-4],[-79,9]],
  africa:       [[-17,22],[-16,15],[-10,6],[0,5],[6,4],[9,4],[9,-2],[12,-6],[13,-17],[15,-22],[18,-34],[26,-34],[32,-28],[35,-22],[40,-15],[41,-2],[43,10],[51,12],[48,3],[43,2],[40,10],[35,15],[33,22],[32,31],[24,32],[16,30],[11,34],[3,36],[-6,35],[-12,30],[-17,22]],
  arabia:       [[35,30],[44,30],[57,25],[55,20],[48,13],[43,12],[38,20],[35,30]],
  eurasia:      [[-9,36],[-9,44],[-2,49],[5,52],[7,58],[12,66],[20,70],[32,71],[45,68],[60,71],[75,74],[95,78],[115,76],[135,73],[160,70],[178,66],[170,60],[160,54],[142,46],[130,42],[126,36],[120,30],[112,21],[105,10],[99,8],[97,16],[90,22],[80,12],[72,20],[62,25],[56,27],[50,30],[45,38],[38,42],[28,41],[24,38],[18,40],[12,37],[3,42],[-9,36]],
  uk:           [[-6,50],[-2,51],[0,53],[-3,58],[-6,57],[-6,50]],
  japan:        [[130,32],[136,35],[141,40],[145,44],[142,45],[138,36],[132,30],[130,32]],
  indonesia:    [[95,5],[105,0],[115,-2],[125,-4],[135,-2],[140,-6],[130,-8],[118,-9],[105,-8],[95,5]],
  australia:    [[113,-22],[122,-17],[130,-12],[139,-12],[146,-19],[150,-25],[146,-38],[140,-38],[132,-32],[124,-33],[115,-34],[113,-22]],
  newZealand:   [[166,-46],[172,-42],[176,-37],[174,-40],[170,-44],[166,-46]],
  madagascar:   [[43,-13],[50,-15],[49,-22],[45,-25],[43,-13]],
};

const inPoly = (pt, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// Equirectangular projection: 1600 px across 360 deg of longitude -> 4.444 px/deg.
const W = 1600, H = 900;
const K = W / 360;             // px per degree
const STEP = 5;                // dot pitch in px
const Y0 = 150;                // top of the mapped window
const DOT = 2.9;               // dot diameter (stroke width)

/**
 * Instead of one sub-path per dot, every continent row is emitted as a single
 * polyline run that is stroked with `stroke-dasharray="0.01 STEP"` +
 * `stroke-linecap="round"`: each dash becomes a perfectly round dot and the
 * dash phase restarts per sub-path, so every run renders as its own chain of
 * dots. That keeps the file ~50x smaller than a per-dot path.
 */
// Real coastlines (Natural Earth, decoded by design/build-coastline.mjs).
// Falls back to the hand-drawn outlines when the dataset is absent.
const coastFile = join(root, 'design/data/coastline.json');
const polys = existsSync(coastFile)
  ? JSON.parse(readFileSync(coastFile, 'utf8')).rings
  : Object.values(LAND);

// bounding boxes so the 22k polygon edges are only tested where they can hit
const boxes = polys.map((ring) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [lon, lat] of ring) {
    if (lon < x0) x0 = lon; if (lon > x1) x1 = lon;
    if (lat < y0) y0 = lat; if (lat > y1) y1 = lat;
  }
  return [x0, y0, x1, y1];
});
const onLand = (lon, lat) => polys.some((ring, i) => {
  const [x0, y0, x1, y1] = boxes[i];
  return !(lon < x0 || lon > x1 || lat < y0 || lat > y1) && inPoly([lon, lat], ring);
});

function dotMatrix() {
  const parts = [];
  const stepDeg = STEP / K;
  for (let lat = 78; lat >= -58; lat -= stepDeg) {
    const y = Math.round(Y0 + (78 - lat) * K);
    let run = null;
    for (let lon = -180; lon <= 182; lon += stepDeg) {
      const land = lon <= 180 && onLand(lon, lat);
      if (land && run === null) run = lon;
      if (!land && run !== null) {
        const x1 = Math.round(((run + 180) / 360) * W);
        const x2 = Math.round(((lon - stepDeg + 180) / 360) * W);
        if (x2 - x1 >= 3) parts.push(`M${x1} ${y}H${x2}`);
        run = null;
      }
    }
  }
  return parts.join('');
}

const mapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" fill="none">
  <title>Global command network — dot matrix map</title>
  <defs>
    <linearGradient id="mFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#22d3ee" stop-opacity=".06"/>
      <stop offset=".28" stop-color="#67e8f9" stop-opacity=".40"/>
      <stop offset=".72" stop-color="#22d3ee" stop-opacity=".34"/>
      <stop offset="1" stop-color="#a3e635" stop-opacity=".10"/>
    </linearGradient>
    <radialGradient id="mBloom" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#22d3ee" stop-opacity=".22"/>
      <stop offset=".6" stop-color="#0e7490" stop-opacity=".07"/>
      <stop offset="1" stop-color="#0e7490" stop-opacity="0"/>
    </radialGradient>
    <filter id="mSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".7"/></filter>
  </defs>
  <ellipse cx="800" cy="450" rx="760" ry="330" fill="url(#mBloom)"/>
  <g opacity=".55">
    <path d="M0 421h1600M0 273h1600M0 569h1600" stroke="#22d3ee" stroke-opacity=".08"/>
  </g>
  <g filter="url(#mSoft)">
    <path d="${dotMatrix()}" stroke="url(#mFade)" stroke-width="${DOT}" stroke-linecap="round"
          stroke-dasharray="0.01 ${STEP}" fill="none"/>
  </g>
</svg>
`;

mkdirSync(join(root, 'assets/hero'), { recursive: true });
mkdirSync(join(root, 'design/previews'), { recursive: true });
writeFileSync(join(root, 'assets/hero/world-map.svg'), mapSvg);
console.log('✓ assets/hero/world-map.svg', (mapSvg.length / 1024).toFixed(1) + ' kB');

/* ------------------------------------------------------------------ *
 * 2. Preview renders
 * ------------------------------------------------------------------ */
const previews = [
  ['assets/hero/hero-grid.svg', 'design/previews/hero-grid.png', 1400],
  ['assets/hero/hero-floor.svg', 'design/previews/hero-floor.png', 1400],
  ['assets/hero/world-map.svg', 'design/previews/world-map.png', 1400],
  ['assets/hero/circuit.svg', 'design/previews/circuit.png', 1000],
];

for (const [src, out, width] of previews) {
  const file = join(root, src);
  if (!existsSync(file)) { console.log('· skip (missing):', src); continue; }
  // flattened onto the hero base colour so the previews read like the real page
  await sharp(file, { density: 96 }).resize({ width }).flatten({ background: '#05070d' })
    .png().toFile(join(root, out));
  console.log('✓', out);
}

/* ------------------------------------------------------------------ *
 * 3. Reusable hero fragment (kept in sync with the demo page)
 * ------------------------------------------------------------------ */
const demo = join(root, 'command-center.html');
if (existsSync(demo)) {
  const html = readFileSync(demo, 'utf8');
  const block = html.split('<!-- cc-hero:start -->')[1]?.split('<!-- cc-hero:end -->')[0];
  if (block) {
    const fragment = `<!--
  CommandCenter hero — drop-in fragment
  Paste into any page after linking assets/hero/hero.css and assets/hero/hero.js.
  Paths are relative to the site root; adjust if the page lives in a subfolder.
  Regenerate with: node design/build-art.mjs
-->
${block.trim()}
`;
    writeFileSync(join(root, 'assets/hero/hero.html'), fragment);
    console.log('✓ assets/hero/hero.html', (fragment.length / 1024).toFixed(1) + ' kB');
  }
}

/* ------------------------------------------------------------------ *
 * 4. Poster / og:image render (1200x630) from the design comp
 * ------------------------------------------------------------------ */
const poster = join(root, 'design/hero-poster.svg');
if (existsSync(poster)) {
  await sharp(poster, { density: 192 }).resize({ width: 1200, height: 630, fit: 'cover' })
    .png({ compressionLevel: 9 }).toFile(join(root, 'assets/hero/hero-poster.png'));
  console.log('✓ assets/hero/hero-poster.png');
}

const comp = join(root, 'design/hero-mock.svg');
if (existsSync(comp)) {
  await sharp(comp, { density: 192 }).resize({ width: 1200, height: 630, fit: 'cover' })
    .png({ compressionLevel: 9 }).toFile(join(root, 'assets/hero/hero-poster.png'));
  await sharp(comp, { density: 96 }).resize({ width: 1520 }).flatten({ background: '#05070d' })
    .png().toFile(join(root, 'design/previews/hero-mock.png'));
  console.log('✓ assets/hero/hero-poster.png + design/previews/hero-mock.png');
}

/* ------------------------------------------------------------------ *
 * 5. Quality report — flags an accidentally blank/black render
 * ------------------------------------------------------------------ */
for (const p of ['design/previews/hero-grid.png', 'design/previews/world-map.png', 'design/previews/circuit.png', 'design/previews/hero-floor.png']) {
  const file = join(root, p);
  if (!existsSync(file)) continue;
  const { channels } = await sharp(file).stats();
  const lum = channels.slice(0, 3).map((c) => c.mean.toFixed(1)).join('/');
  const peak = Math.max(...channels.slice(0, 3).map((c) => c.max));
  console.log(`  ${p.padEnd(34)} mean rgb ${lum}  peak ${peak}${peak < 60 ? '  ⚠ looks blank' : ''}`);
}
