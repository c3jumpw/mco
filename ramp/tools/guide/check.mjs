// Fails (exit 1) when the Guide or the tours have fallen behind the app:
//   • a page in src/App.tsx has no entry in tools/guide/coverage.json, or points at a Guide section that doesn't exist;
//   • a Guide screenshot, tour slide or What's new slide uses an image that isn't in public/guide-media;
//   • an image isn't retaken by the screenshot script (so it would go stale);
//   • a tour slide links to a page that doesn't exist;
//   • the change log (src/changelog/changelog.json) is malformed, out of order, points at missing pages, Guide sections
//     or images, or CHANGELOG.md hasn't been regenerated from it.
// Runs before every build (npm run build) and in CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../changelog/md.mjs';

const H = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(H, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const problems = [];

// Pages: path="…" in src/App.tsx, with the admin block's children under /admin.
const app = read('src/App.tsx');
const routes = new Set();
let inAdmin = false;
for (const line of app.split('\n')) {
  if (/<Route path="admin">/.test(line)) { inAdmin = true; routes.add('/admin'); continue; }
  if (inAdmin && /<\/Route>/.test(line) && !/path=/.test(line)) { inAdmin = false; continue; }
  const m = line.match(/path="([^"]+)"/);
  if (!m || m[1] === '*') continue;
  const p = m[1].startsWith('/') ? m[1] : `${inAdmin ? '/admin/' : '/'}${m[1]}`;
  routes.add(p);
}
if (/<Route index element=\{[^}]*Home/.test(app) || /<Route index /.test(app)) routes.add('/');

const coverage = JSON.parse(fs.readFileSync(path.join(H, 'coverage.json'), 'utf8'));
const guide = JSON.parse(read('src/guide/guide.json'));
const sections = new Set(guide.sections.map((s) => s.id));
for (const r of routes) {
  if (!coverage[r]) problems.push(`Page ${r} isn’t in tools/guide/coverage.json. Add a Guide section (src/guide/guide.json) and map the page to it.`);
  else if (!sections.has(coverage[r])) problems.push(`coverage.json maps ${r} to Guide section “${coverage[r]}”, which doesn’t exist.`);
}
for (const r of Object.keys(coverage)) if (r !== '_about' && !routes.has(r)) problems.push(`coverage.json lists ${r}, which is no longer a page. Remove it.`);

// Images and the shots that keep them current.
const media = new Set(fs.readdirSync(path.join(ROOT, 'public/guide-media')));
const shotIds = new Set([...read('tools/guide/guide-shots.cjs').matchAll(/\bid: '([^']+)'/g), ...read('tools/guide/tour-shots.cjs').matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]));
const need = (file, where) => {
  if (!media.has(file)) problems.push(`${where} uses guide-media/${file}, which is missing. Run npm run guide:shots.`);
  if (!shotIds.has(file.replace(/\.webp$/, ''))) problems.push(`${where} uses guide-media/${file}, but no screenshot recipe retakes it (tools/guide/*-shots.cjs).`);
};
for (const s of guide.sections) for (const sh of s.shots) need(sh.src.replace(/^.*\//, ''), `Guide section “${s.id}”`);
const tours = read('src/guide/tours.ts');
for (const m of tours.matchAll(/\{ id: '([^']+)'[^\n]*?image: '([^']+)'/g)) need(m[2], `Tour slide “${m[1]}”`);

// Tour links must open real pages.
const matchRoute = (to) => {
  const p = to.split('?')[0];
  return [...routes].some((r) => new RegExp('^' + r.replace(/:[^/]+/g, '[^/]+') + '$').test(p));
};
for (const m of tours.matchAll(/\{ id: '([^']+)'[^\n]*?link: \{ to: '([^']+)'/g)) if (!matchRoute(m[2])) problems.push(`Tour slide “${m[1]}” links to ${m[2]}, which isn’t a page.`);

// Change log.
const log = JSON.parse(read('src/changelog/changelog.json'));
const TYPES = ['new', 'improved', 'fixed'];
const WHO = ['everyone', 'member', 'guest', 'coach', 'admin', 'client', 'platform'];
const REQS = ['agency', 'work', 'coaching', 'tasks', 'chat', 'linkedClient'];
const ver = (v) => v.split('.').map(Number);
const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const today = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);   // allow for time zones
const seenIds = new Set(), seenVersions = new Set(), slideIds = new Set();
const checkWho = (x, where) => {
  if (!Array.isArray(x.who) || !x.who.length || x.who.some((w) => !WHO.includes(w))) problems.push(`${where}: "who" must list some of ${WHO.join(', ')}.`);
  if (x.requires && (!Array.isArray(x.requires) || x.requires.some((r) => !REQS.includes(r)))) problems.push(`${where}: "requires" can only use ${REQS.join(', ')}.`);
};
if (!Array.isArray(log.entries) || !log.entries.length) problems.push('The change log has no entries.');
(log.entries || []).forEach((e, i) => {
  const at = `Change log ${e.version || e.id || '#' + i}`;
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(e.id || '') || !e.id.startsWith(e.date)) problems.push(`${at}: id must be the date then a short slug, like ${e.date}-what-changed.`);
  if (seenIds.has(e.id)) problems.push(`${at}: id ${e.id} is used twice.`);
  seenIds.add(e.id);
  if (!/^\d+\.\d+(\.\d+)?$/.test(e.version || '')) problems.push(`${at}: version must look like 1.7 or 1.7.1.`);
  if (seenVersions.has(e.version)) problems.push(`${at}: version ${e.version} is used twice.`);
  seenVersions.add(e.version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) problems.push(`${at}: date must be YYYY-MM-DD.`);
  else if (e.date > today) problems.push(`${at}: date ${e.date} is in the future.`);
  const prev = log.entries[i - 1];
  if (prev && (e.date > prev.date || !newer(prev.version, e.version))) problems.push(`${at}: entries must be newest first (it comes after ${prev.version}).`);
  if (!e.title?.trim() || !e.summary?.trim()) problems.push(`${at}: needs a title and a summary.`);
  if (typeof e.announce !== 'boolean') problems.push(`${at}: "announce" must be true (shown at sign-in) or false.`);
  if (!Array.isArray(e.changes) || !e.changes.length) problems.push(`${at}: needs at least one change.`);
  (e.changes || []).forEach((ch, k) => {
    const w = `${at}, change ${k + 1}`;
    if (!TYPES.includes(ch.type)) problems.push(`${w}: type must be new, improved or fixed.`);
    if (!ch.text?.trim()) problems.push(`${w}: needs text.`);
    checkWho(ch, w);
    if (ch.link && !matchRoute(ch.link)) problems.push(`${w}: link ${ch.link} isn’t a page.`);
    if (ch.guide && !sections.has(ch.guide)) problems.push(`${w}: Guide section “${ch.guide}” doesn’t exist.`);
  });
  (e.slides || []).forEach((sl) => {
    const w = `${at}, slide ${sl.id}`;
    if (!sl.id || slideIds.has(sl.id)) problems.push(`${w}: slide ids must be unique.`);
    slideIds.add(sl.id);
    if (!sl.title || !sl.text || !['phone', 'desktop'].includes(sl.device)) problems.push(`${w}: needs a title, text and device (phone or desktop).`);
    if (sl.who) checkWho(sl, w);
    need(sl.image || '', w);
    if (sl.link && !matchRoute(sl.link.to)) problems.push(`${w}: link ${sl.link.to} isn’t a page.`);
  });
});
if (!fs.existsSync(path.join(ROOT, 'CHANGELOG.md')) || read('CHANGELOG.md') !== renderMarkdown(log)) {
  problems.push('CHANGELOG.md doesn’t match src/changelog/changelog.json. Run npm run changelog.');
}

if (problems.length) {
  console.error(`Guide check failed (${problems.length}):\n  • ` + problems.join('\n  • '));
  process.exit(1);
}
console.log(`Guide check passed: ${routes.size} pages covered, ${guide.sections.length} Guide sections, every image present and retaken by the screenshot script, change log at ${log.entries[0].version} (${log.entries.length} releases).`);
