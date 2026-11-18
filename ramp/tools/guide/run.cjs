// Retakes every Guide and tour screenshot from the sample-data preview and updates src/guide/guide.json.
// usage: npm run guide:shots [-- id-prefix ...]     (CHROME_PATH=/path/to/chrome to use a local browser)
const fs = require('fs');
const path = require('path');
const { ROOT, startServers, launch, open, settle, boxOf, unionOf, saveWebp } = require('./lib.cjs');
const { SHOTS } = require('./guide-shots.cjs');
const { TOUR_SHOTS } = require('./tour-shots.cjs');

const GUIDE_JSON = path.join(ROOT, 'src/guide/guide.json');

(async () => {
  const only = process.argv.slice(2);
  const pick = (list) => (only.length ? list.filter((s) => only.some((o) => s.id.startsWith(o))) : list);
  const guide = pick(SHOTS).map((s) => ({ data: 'work', ...s }));
  const tour = pick(TOUR_SHOTS);
  const sets = [...new Set([...guide, ...tour].map((s) => s.data))];
  if (!sets.length) { console.log('Nothing matches.'); return; }
  const stop = await startServers(sets);
  const browser = await launch();
  const manifest = {};
  let failed = 0;
  let rewritten = 0;
  try {
    for (const s of [...guide, ...tour]) {
      const { ctx, page, errors, viewport } = await open(browser, s);
      const problems = [];
      try {
        if (s.prep) await s.prep(page);
        await settle(page, 200);
        if (!s.keepFocus) await page.evaluate(() => { const a = document.activeElement; if (a && a !== document.body && !a.closest('[role=dialog]')) a.blur(); });
        const hotspots = [];
        let n = 0;
        for (const h of s.hotspots || []) {
          n += 1;
          try {
            const at = h.at(page);
            const box = Array.isArray(at) ? await unionOf(page, at, viewport, h.pad ?? 4) : await boxOf(page, at, viewport, h.pad ?? 4);
            hotspots.push({ n, ...box, label: h.label, text: h.text });
          } catch (e) { problems.push(`hotspot ${n} ${h.label}: ${e.message.split('\n')[0]}`); }
        }
        hotspots.sort((a, b) => (Math.round(a.y / 2.5) - Math.round(b.y / 2.5)) || (a.x - b.x));
        hotspots.forEach((h, i) => { h.n = i + 1; });
        const written = await saveWebp(browser, page, s.id);
        if (written) rewritten += 1;
        const dpr = s.device === 'phone' ? 2 : 1.5;
        manifest[s.id] = { w: Math.round(viewport.width * dpr), h: Math.round(viewport.height * dpr), hotspots, caption: s.caption, alt: s.alt, written };
      } catch (e) { problems.push('prep: ' + e.message.split('\n')[0]); }
      const errs = errors.filter((e) => !/favicon/.test(e));
      if (problems.length) failed += 1;
      console.log(`${s.id}: ${problems.length || errs.length ? '\n  ' + [...problems, ...errs].join('\n  ') : 'ok'}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    stop();
  }

  // Guide shots: refresh size and hotspots in guide.json; captions and alt text stay as written there.
  const data = JSON.parse(fs.readFileSync(GUIDE_JSON, 'utf8'));
  let changed = 0;
  for (const sec of data.sections) for (const shot of sec.shots) {
    const id = shot.src.replace(/^.*\//, '').replace(/\.webp$/, '');
    const m = manifest[id];
    if (!m) continue;
    // An unchanged screen keeps its callouts, so tiny layout jitter doesn't create a commit.
    if (!m.written && (shot.hotspots?.length || 0) === m.hotspots.length) continue;
    shot.w = m.w; shot.h = m.h;
    if (m.hotspots.length || !shot.hotspots?.length) shot.hotspots = m.hotspots;
    changed += 1;
  }
  fs.writeFileSync(GUIDE_JSON, JSON.stringify(data, null, 2) + '\n');
  console.log(`\n${Object.keys(manifest).length} screenshots taken, ${rewritten} changed and saved, ${changed} guide shots updated${failed ? `, ${failed} with problems` : ''}.`);
  if (failed && process.env.CI) process.exitCode = 1;
})();
