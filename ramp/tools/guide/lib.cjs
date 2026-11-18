// Shared helpers for taking the guide and tour screenshots of the sample-data preview (see README.md).
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function loadPlaywright() {
  for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright']) {
    try { return require(p); } catch { /* try the next */ }
  }
  throw new Error('Playwright is missing. Run: npm i -D playwright && npx playwright install chromium');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '../..');
const MEDIA = path.join(ROOT, 'public/guide-media');
const PORTS = { work: 5311, core: 5312, money: 5313, launch: 5314 };
const baseFor = (data) => `http://localhost:${PORTS[data || 'work']}`;
// Thursday, November 5, 2026, 9:42 AM Eastern. The sample data's dates are relative to this.
const NOW = new Date('2026-11-05T09:42:00-05:00');

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, isMobile: false, hasTouch: false },
};

const CSS = `
*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
html { scrollbar-width: none !important; }
::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
.pulse-ring { box-shadow: 0 0 0 7px rgba(245,158,11,.30) !important; }
`;

/** Starts one preview server per data set and waits for each to answer. */
async function startServers(sets) {
  const procs = [];
  for (const data of sets) {
    // Run Vite's own script (not through npx) so stopping the server really ends it.
    const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--config', 'tools/guide/vite.config.mjs'], {
      cwd: ROOT, env: { ...process.env, RAMP_DATA: data, PORT: String(PORTS[data]) }, stdio: ['ignore', 'ignore', 'inherit'],
    });
    procs.push(p);
  }
  for (const data of sets) {
    const url = baseFor(data);
    for (let i = 0; i < 120; i++) {
      try { const r = await fetch(url); if (r.ok) break; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return () => procs.forEach((p) => p.kill());
}

async function launch() {
  const executablePath = process.env.CHROME_PATH || (fs.existsSync('/usr/bin/google-chrome') && !process.env.CI ? '/usr/bin/google-chrome' : undefined);
  return chromium.launch({ executablePath, args: ['--no-sandbox', '--font-render-hinting=none'] });
}

/** A fresh context for one shot. `height` overrides the viewport height (for taller clips). */
async function open(browser, { data, device, height, as, url, storage }) {
  const d = DEVICES[device];
  const viewport = { width: d.viewport.width, height: height || d.viewport.height };
  const ctx = await browser.newContext({ ...d, viewport, locale: 'en-US', timezoneId: 'America/New_York', reducedMotion: 'reduce', colorScheme: 'light' });
  await ctx.addInitScript(({ css, storage }) => {
    const add = () => { const s = document.createElement('style'); s.setAttribute('data-guide', ''); s.textContent = css; document.documentElement.appendChild(s); };
    if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
    try {
      for (const [k, v] of Object.entries(storage || {})) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
      // Screenshots never show the getting-started tour or What's new on their own.
      localStorage.setItem('ramp-tour-off', '1');
    } catch (e) { /* ignore */ }
  }, { css: CSS, storage: storage || {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // Failed requests are reported with their URL by the response handler below (favicon and missing guide images skipped).
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('popup', (p) => p.close().catch(() => {}));
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon|guide-media/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  const sep = url.includes('?') ? '&' : '?';
  await page.goto(`${baseFor(data)}${url}${as ? `${sep}as=${as}` : ''}`, { waitUntil: 'networkidle' });
  await settle(page);
  return { ctx, page, errors, viewport };
}

/** Wait until skeletons and spinners are gone and fonts are ready. */
async function settle(page, ms = 250) {
  await page.waitForTimeout(150);
  try {
    await page.waitForFunction(() => !document.querySelector('.skeleton, .animate-spin, [aria-label="Loading"]'), null, { timeout: 6000 });
  } catch (e) { /* captured anyway; review catches it */ }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Box of a locator as percentages of the viewport, padded and clamped. */
async function boxOf(page, loc, viewport, pad = 4) {
  const el = typeof loc === 'string' ? page.locator(loc).first() : loc;
  const b = await el.boundingBox();
  if (!b) throw new Error('no box for ' + (typeof loc === 'string' ? loc : String(loc)));
  const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad);
  const x1 = Math.min(viewport.width, b.x + b.width + pad), y1 = Math.min(viewport.height, b.y + b.height + pad);
  if (x1 - x0 < 4 || y1 - y0 < 4) throw new Error('box outside the image for ' + String(loc));
  return { x: r1((x0 / viewport.width) * 100), y: r1((y0 / viewport.height) * 100), w: r1(((x1 - x0) / viewport.width) * 100), h: r1(((y1 - y0) / viewport.height) * 100) };
}

/** Union of several locators' boxes. */
async function unionOf(page, locs, viewport, pad = 4) {
  const boxes = [];
  for (const l of locs) {
    const el = typeof l === 'string' ? page.locator(l).first() : l;
    const b = await el.boundingBox();
    if (b) boxes.push(b);
  }
  if (!boxes.length) throw new Error('no boxes for union');
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.min(viewport.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(viewport.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: r1((x0 / viewport.width) * 100), y: r1((y0 / viewport.height) * 100), w: r1(((x1 - x0) / viewport.width) * 100), h: r1(((y1 - y0) / viewport.height) * 100) };
}

/**
 * Saves the page as public/guide-media/<id>.webp. When a file is already there, the new image is kept only if the
 * screen really changed (more than a few hundred pixels differ clearly), so re-running the shots locally or in CI
 * doesn't rewrite every file because of encoder or anti-aliasing noise. Returns true when the file was written.
 */
async function saveWebp(browser, page, id, quality = 0.86) {
  const png = await page.screenshot({ type: 'png' });
  const file = path.join(MEDIA, `${id}.webp`);
  const old = fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null;
  const conv = await browser.newPage();
  const { b64, changed, diff } = await conv.evaluate(async ({ data, old, q }) => {
    const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
    const pixels = (img) => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      return { c, data: g.getImageData(0, 0, c.width, c.height).data };
    };
    const shot = pixels(await load('data:image/png;base64,' + data));
    const b64 = shot.c.toDataURL('image/webp', q).split(',')[1];
    if (!old) return { b64, changed: true, diff: -1 };
    if (old === b64) return { b64, changed: false, diff: 0 };
    try {
      const prevImg = await load('data:image/webp;base64,' + old);
      if (prevImg.naturalWidth !== shot.c.width || prevImg.naturalHeight !== shot.c.height) return { b64, changed: true, diff: -1 };
      const a = pixels(await load('data:image/webp;base64,' + b64)).data;
      const b = pixels(prevImg).data;
      let diff = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 90) diff++;
      }
      return { b64, changed: diff > 300, diff };
    } catch (e) { return { b64, changed: true, diff: -1 }; }
  }, { data: png.toString('base64'), old, q: quality });
  await conv.close();
  if (process.env.GUIDE_DEBUG) console.log(`  ${id}: ${diff} pixels differ`);
  if (!changed) return false;
  fs.mkdirSync(MEDIA, { recursive: true });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return true;
}

module.exports = { ROOT, MEDIA, PORTS, NOW, DEVICES, startServers, launch, open, settle, boxOf, unionOf, saveWebp };
