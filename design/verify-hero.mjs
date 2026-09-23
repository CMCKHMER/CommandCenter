/**
 * CommandCenter hero — static checks
 * ----------------------------------
 * Catches the mistakes a headless browser would: missing assets, classes the
 * CSS never defines, unbalanced tags, undefined custom properties, asset paths
 * that do not exist on disk.
 *
 *   node design/verify-hero.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

/* ---------------------------------------------------------------- inputs */
const page = read('command-center.html');
const css = read('assets/hero/hero.css');
const js = read('assets/hero/hero.js');

const heroSection = page.split('<!-- cc-hero:start -->')[1]?.split('<!-- cc-hero:end -->')[0];
if (!heroSection) fail('command-center.html: cc-hero:start/end markers not found');

/* --------------------------------------------------------- asset exists */
const refs = [...page.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map((m) => m[1])
  .filter((u) => !/^(https?:|data:|mailto:)/.test(u));
for (const r of refs) if (!existsSync(join(root, r))) fail(`missing asset referenced by the page: ${r}`);

/* ------------------------------------------------- class ↔ css coverage */
const usedClasses = new Set();
for (const m of heroSection.matchAll(/class="([^"]+)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) usedClasses.add(c);
}
const definedClasses = new Set([...css.matchAll(/\.(cc-hero[\w-]*)/g)].map((m) => m[1]));

for (const c of usedClasses) if (!definedClasses.has(c)) fail(`class used in HTML but never styled: .${c}`);
for (const c of definedClasses) if (!usedClasses.has(c)) notes.push(`class styled but not used in the fragment: .${c}`);

/* ------------------------------------------------- custom properties */
// custom properties may be declared in the stylesheet *or* inline in the markup
const declared = new Set([
  ...[...css.matchAll(/(--cc-[\w-]+)\s*:/g)].map((m) => m[1]),
  ...[...heroSection.matchAll(/(--cc-[\w-]+)\s*:/g)].map((m) => m[1]),
]);
const usedVars = new Set([...css.matchAll(/var\((--cc-[\w-]+)/g)].map((m) => m[1]));
for (const v of usedVars) if (!declared.has(v)) fail(`var(${v}) used but never declared`);
const inlineVars = [...new Set([...heroSection.matchAll(/(--cc-[\w-]+)\s*:/g)].map((m) => m[1]))];
if (inlineVars.length) notes.push(`inline custom properties: ${inlineVars.join(', ')}`);

/* ------------------------------------------------------ tag balance */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'ellipse', 'polygon', 'polyline', 'stop', 'use']);
const stack = [];
for (const m of heroSection.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
  const [, close, tag, attrs, selfClose] = m;
  const t = tag.toLowerCase();
  if (close) {
    const top = stack.pop();
    if (top !== t) fail(`tag mismatch: </${t}> closes <${top ?? 'nothing'}>`);
  } else if (!selfClose && !VOID.has(t)) {
    stack.push(t);
  }
}
if (stack.length) fail(`unclosed tags: ${stack.join(', ')}`);

/* --------------------------------------------------------- svg hygiene */
const svgs = [...heroSection.matchAll(/<svg[^>]*>/g)].map((m) => m[0]);
for (const s of svgs) if (!/viewBox=/.test(s)) fail(`<svg> without viewBox: ${s.slice(0, 60)}…`);
notes.push(`${svgs.length} inline SVG icons, all with viewBox`);

/* ------------------------------------------------- svg path sanity ----
 * Strict scanner: valid commands only, correct arity per command, arc flags
 * read as single characters, numbers well formed. Catches "0111" style flag
 * swallowing and stray letters. Note it cannot judge *intent* — a path that
 * is syntactically fine can still be geometrically wrong, which is why the
 * rendered previews in design/previews/ are reviewed visually as well.
 * -------------------------------------------------------------------- */
const ARITY = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function scanPath(d, where) {
  let i = 0;
  const n = d.length;
  const skip = () => { while (i < n && (d[i] === ' ' || d[i] === ',' || d[i] === '\n' || d[i] === '\t')) i++; };
  const num = () => {
    skip();
    const start = i;
    if (d[i] === '+' || d[i] === '-') i++;
    while (i < n && d[i] >= '0' && d[i] <= '9') i++;
    if (d[i] === '.') { i++; while (i < n && d[i] >= '0' && d[i] <= '9') i++; }
    if (d[i] === 'e' || d[i] === 'E') { i++; if (d[i] === '+' || d[i] === '-') i++; while (i < n && d[i] >= '0' && d[i] <= '9') i++; }
    const raw = d.slice(start, i);
    if (!raw || !/^[-+]?[\d.eE+-]+$/.test(raw) || isNaN(parseFloat(raw))) fail(`${where}: bad number "${raw}" in path`);
    return parseFloat(raw);
  };
  const flag = () => {
    skip();
    if (d[i] !== '0' && d[i] !== '1') fail(`${where}: arc flag must be 0 or 1, found "${d[i] || 'end'}"`);
    return d[i++];
  };

  let cmd = null;
  while (i < n) {
    skip();
    if (i >= n) break;
    if (/[a-zA-Z]/.test(d[i])) { cmd = d[i++]; }
    else if (!cmd) { fail(`${where}: path does not start with a command`); return; }
    if (!(cmd.toLowerCase() in ARITY)) { fail(`${where}: unknown path command "${cmd}"`); return; }

    const lower = cmd.toLowerCase();
    if (lower === 'z') continue;
    let guard = 0;
    while (guard++ < 4000) {
      skip();
      if (i >= n || /[a-zA-Z]/.test(d[i])) break;
      for (let p = 0; p < ARITY[lower]; p++) {
        if (lower === 'a' && (p === 3 || p === 4)) flag();
        else num();
      }
      // an implicit-repeat only continues while more numbers are present
    }
    if (guard >= 4000) { fail(`${where}: path too long / runaway params`); return; }
  }
}

const heroFiles = ['assets/hero/hero-grid.svg', 'assets/hero/hero-floor.svg', 'assets/hero/world-map.svg', 'assets/hero/circuit.svg'];
let pathCount = 0;
for (const f of heroFiles) {
  const svg = read(f);
  for (const m of svg.matchAll(/\sd="([^"]+)"/g)) { scanPath(m[1], f); pathCount++; }
}
for (const m of heroSection.matchAll(/\sd="([^"]+)"/g)) { scanPath(m[1], 'command-center.html'); pathCount++; }
notes.push(`${pathCount} SVG paths parsed (arc flags + arity strict)`);

/* ------------------------------------------------------------- anchors */
const ids = new Set([...page.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
for (const m of page.matchAll(/href="#([^"]+)"/g)) if (!ids.has(m[1])) fail(`anchor #${m[1]} has no target`);

/* -------------------------------------------------------- css structure */
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open !== close) fail(`hero.css brace imbalance: ${open} { vs ${close} }`);

/* ------------------------------------------------------------ js hooks */
for (const hook of ['data-cc-type', 'data-cc-count', 'is-live', '[data-cc-count]']) {
  if (!heroSection.includes(hook.replace(/[[\]]/g, '')) && !js.includes(hook)) {
    notes.push(`js hook ${hook} not found in markup`);
  }
}
const countNodes = [...heroSection.matchAll(/data-cc-count="([\d.]+)"/g)].map((m) => m[1]);
notes.push(`${countNodes.length} animated counters: ${countNodes.join(', ')}`);

/* ------------------------------------------------------------- report */
console.log(`hero fragment: ${(heroSection.length / 1024).toFixed(1)} kB · classes ${usedClasses.size} used / ${definedClasses.size} defined`);
notes.forEach((n) => console.log('  ·', n));
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):`);
  problems.forEach((p) => console.error('  -', p));
  process.exit(1);
}
console.log('\n✓ all hero checks passed');
