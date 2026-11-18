// Fails (exit 1) when the Guide or the tours have fallen behind the app:
//   • a page in src/App.tsx has no entry in tools/guide/coverage.json, or points at a Guide section that doesn't exist;
//   • a Guide screenshot, tour slide or What's new slide uses an image that isn't in public/guide-media;
//   • an image isn't retaken by the screenshot script (so it would go stale);
//   • a tour slide links to a page that doesn't exist.
// Runs before every build (npm run build) and in CI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (problems.length) {
  console.error(`Guide check failed (${problems.length}):\n  • ` + problems.join('\n  • '));
  process.exit(1);
}
console.log(`Guide check passed: ${routes.size} pages covered, ${guide.sections.length} Guide sections, every image present and retaken by the screenshot script.`);
