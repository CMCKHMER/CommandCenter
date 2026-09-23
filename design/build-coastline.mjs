/**
 * Extracts a compact, dependency-free coastline dataset from Natural Earth
 * (world-atlas `land-50m.json`, public domain) so the hero artwork can be
 * rebuilt offline.
 *
 *   node design/build-coastline.mjs /path/to/world-atlas/land-50m.json
 *
 * Output: design/data/coastline.json
 *   { source, rings: [[[lon,lat], ...], ...] }
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) {
  console.error('usage: node design/build-coastline.mjs <land-50m.json>');
  process.exit(1);
}

const topo = JSON.parse(readFileSync(src, 'utf8'));
const { scale, translate } = topo.transform;

/* --- decode TopoJSON arcs (delta encoded, quantised) ---------------- */
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx; y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

const ringFrom = (indexes) => {
  const pts = [];
  for (const i of indexes) {
    const rev = i < 0;
    const arc = arcs[rev ? ~i : i];
    const seq = rev ? [...arc].reverse() : arc;
    // skip the duplicated joint between consecutive arcs
    for (let k = pts.length && !rev ? 1 : 0; k < seq.length; k++) pts.push(seq[k]);
  }
  return pts;
};

const geoms = topo.objects.land.geometries ?? [topo.objects.land];
const rings = [];
for (const g of geoms) {
  const polys = g.type === 'MultiPolygon' ? g.arcs : [g.arcs];
  for (const poly of polys) for (const ring of poly) rings.push(ringFrom(ring));
}

/* --- simplify: Douglas-Peucker, drop tiny islands ------------------- */
const TOL = 0.16; // degrees ≈ 0.7 px of the 1600 px map

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const den = Math.hypot(dx, dy);
  if (den < 1e-9) return [pts[0], pts[pts.length - 1]];
  let maxD = -1, idx = 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / den;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

/** Rings are closed, so split them at their most distant point and simplify both halves. */
function simplifyRing(ring, tol) {
  const pts = ring.slice();
  if (pts.length > 2 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-9) pts.pop();
  if (pts.length < 5) return pts;
  let far = 1, fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = simplify(pts.slice(0, far + 1), tol);
  const b = simplify(pts.slice(far), tol);
  return [...a.slice(0, -1), ...b];
}

const out = [];
for (const ring of rings) {
  const keep = simplifyRing(ring, TOL);
  if (keep.length < 4) continue;
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const [lon, lat] of keep) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  if (maxLat < -60) continue;                            // Antarctica — out of frame
  if (maxLon - minLon < 0.6 && maxLat - minLat < 0.6) continue; // specks
  out.push(keep.map(([lon, lat]) => [+lon.toFixed(2), +lat.toFixed(2)]));
}

mkdirSync(join(root, 'design/data'), { recursive: true });
const file = join(root, 'design/data/coastline.json');
writeFileSync(file, JSON.stringify({
  source: 'Natural Earth 1:50m land, via world-atlas (public domain)',
  rings: out,
}));
console.log(`✓ ${out.length} rings, ${out.reduce((n, r) => n + r.length, 0)} points → design/data/coastline.json`);
