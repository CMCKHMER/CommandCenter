/**
 * Render the hero in a real browser and write screenshots + a metrics report.
 *
 *   LD_LIBRARY_PATH=/tmp/al2023/lib node design/shot.mjs [outDir]
 *
 * Development helper (not part of the shipped site). Uses the Chromium binary
 * shipped inside the @sparticuz/chromium npm package, plus the @fontsource
 * copies of Space Grotesk / Outfit / JetBrains Mono, so the render is faithful
 * even on a machine with no access to Google Fonts. It also writes the
 * 1200x630 social poster (assets/hero/hero-poster.png) from a real render.
 *
 * Deps:  npm i -D playwright-core @sparticuz/chromium sharp
 *        npm i -D @fontsource/space-grotesk @fontsource/outfit @fontsource/jetbrains-mono
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

let pw, chromium;
try {
  ({ chromium: pw } = await import('playwright-core'));
  ({ default: chromium } = await import('@sparticuz/chromium'));
} catch {
  console.error(
    'design/shot.mjs needs a Chromium build and its driver:\n' +
    '  npm i -D playwright-core @sparticuz/chromium sharp\n' +
    'On a minimal Linux box the bundled Chromium also needs the NSS libs, e.g.\n' +
    '  LD_LIBRARY_PATH=/tmp/al2023/lib node design/shot.mjs'
  );
  process.exit(1);
}

const outDir = process.argv[2] || 'design/previews/live';
const only = process.argv[3];
await mkdir(outDir, { recursive: true });

const nm = path.resolve('node_modules/@fontsource');
const face = (family, dir, weights) =>
  weights
    .map(
      (w) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:block;` +
        `src:url('file://${nm}/${dir}/files/${dir}-latin-${w}-normal.woff2') format('woff2');}`
    )
    .join('\n');

const fontCSS = [
  face('Space Grotesk', 'space-grotesk', [500, 600, 700]),
  face('Outfit', 'outfit', [300, 400, 500, 600]),
  face('JetBrains Mono', 'jetbrains-mono', [400, 500, 700]),
].join('\n');

const browser = await pw.launch({
  executablePath: await chromium.executablePath(),
  // NB: do not pass @sparticuz/chromium's own `chromium.args` here — its
  // `--single-process` flag deadlocks Playwright's CDP pipe connection.
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
  headless: true,
});

const url = 'file://' + path.resolve('command-center.html');

const viewports = [
  { name: 'panorama-1600x900', width: 1600, height: 900, dsf: 1 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, dsf: 1 },
  { name: 'ultrawide-2560x1080', width: 2560, height: 1080, dsf: 1 },
  { name: 'laptop-1280x800', width: 1280, height: 800, dsf: 1 },
  { name: 'tablet-834x1112', width: 834, height: 1112, dsf: 1 },
  { name: 'mobile-390x844', width: 390, height: 844, dsf: 2 },
];

const report = [];

for (const vp of viewports) {
  if (only && vp.name !== only) continue;
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: fontCSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2800); // let entry animations settle

  const hero = page.locator('.cc-hero');
  await hero.screenshot({ path: path.join(outDir, `${vp.name}.png`) });

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const heroEl = document.querySelector('.cc-hero');
    const r = heroEl.getBoundingClientRect();
    const overflows = [];
    for (const el of heroEl.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (b.right > r.right + 2 || b.left < r.left - 2) {
        overflows.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.toString() || '').slice(0, 70),
          left: Math.round(b.left),
          right: Math.round(b.right),
        });
      }
    }
    const fontsUsed = new Set();
    for (const sel of ['.cc-hero__title', '.cc-hero__lede', '.cc-hero__msg', '.cc-hero__wordmark']) {
      const el = document.querySelector(sel);
      if (el) fontsUsed.add(sel + ' → ' + getComputedStyle(el).fontFamily.split(',')[0]);
    }
    return {
      viewport: [window.innerWidth, window.innerHeight],
      pageScrollW: doc.scrollWidth,
      heroRect: { w: Math.round(r.width), h: Math.round(r.height) },
      heroAspect: +(r.width / r.height).toFixed(2),
      heroHeightPx: Math.round(r.height),
      sheetCount: document.styleSheets.length,
      fontFacesLoaded: Array.from(document.fonts).filter((f) => f.status === 'loaded').length,
      sampleFonts: [...fontsUsed],
      overflowCount: overflows.length,
      overflows: overflows.slice(0, 10),
      titleSize: getComputedStyle(document.querySelector('.cc-hero__title')).fontSize,
      consoleErrors: window.__ccErrors || [],
    };
  });
  report.push({ name: vp.name, ...metrics });
  await ctx.close();
}

/* ------------------------------------------------------------------ *
 * Progressive-enhancement guard — with JavaScript disabled the banner must
 * still render its finished state (counters, drawn sparkline, bar heights,
 * progress fill), otherwise a no-JS visitor sees a half-built hero.
 * ------------------------------------------------------------------ */
{
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    javaScriptEnabled: false,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const noJs = await page.evaluate(() => {
    const style = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    return {
      counters: [...document.querySelectorAll('[data-cc-count]')].map((el) => el.textContent),
      typed: (document.querySelector('[data-cc-type]') || {}).textContent || '',
      sparkOffset: parseFloat(style('.cc-hero__sparkline', 'strokeDashoffset')) || 0,
      barHeight: parseFloat(style('.cc-hero__bars i', 'height')) || 0,
      progressWidth: parseFloat(style('.cc-hero__progress i', 'width')) || 0,
    };
  });
  await ctx.close();

  const zeroed = noJs.counters.filter((c) => !c || c === '0' || /^0\.0*$/.test(c));
  const broken = [];
  if (zeroed.length) broken.push(`counters still zeroed: ${zeroed.join(', ')}`);
  if (!noJs.typed.trim()) broken.push('terminal command line is empty');
  if (noJs.sparkOffset !== 0) broken.push(`sparkline not drawn (dashoffset ${noJs.sparkOffset})`);
  if (noJs.barHeight <= 0) broken.push('telemetry bars collapsed');
  if (noJs.progressWidth <= 0) broken.push('progress bar empty');

  if (broken.length) {
    console.error('✗ no-JS render is incomplete:');
    broken.forEach((b) => console.error('  -', b));
    process.exitCode = 1;
  } else {
    console.log('✓ no-JS render is complete', JSON.stringify(noJs));
  }
}

/* ------------------------------------------------------------------ *
 * Social / og:image poster — a 1200x630 card cropped from a real render
 * (1920x1008 has the same 1.905 ratio, so the downscale is lossless of
 * composition). Falls back to a message if sharp is unavailable.
 * ------------------------------------------------------------------ */
try {
  const { default: sharp } = await import('sharp');
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: fontCSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2800);
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1008 } });
  await sharp(shot).resize({ width: 1200, height: 630, fit: 'cover' })
    .png({ compressionLevel: 9 }).toFile('assets/hero/hero-poster.png');
  await ctx.close();
  console.log('✓ assets/hero/hero-poster.png (1200x630, live render)');
} catch (err) {
  console.warn('! poster skipped:', err.message);
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
