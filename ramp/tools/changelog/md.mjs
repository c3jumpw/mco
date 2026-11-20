// Writes ramp/CHANGELOG.md from src/changelog/changelog.json, so the history can be read on GitHub without the app.
//   npm run changelog          rewrite CHANGELOG.md
// npm run guide:check fails if CHANGELOG.md doesn't match the JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const JSON_PATH = path.join(ROOT, 'src/changelog/changelog.json');
export const MD_PATH = path.join(ROOT, 'CHANGELOG.md');

const TYPE = { new: 'New', improved: 'Better', fixed: 'Fixed' };
const WHO = { everyone: 'everyone', member: 'team members', guest: 'guests', coach: 'mentors and leads', admin: 'admins', client: 'clients', platform: 'platform admins' };
const REQ = { agency: 'agency on', work: 'placed team members', coaching: 'coaches', tasks: 'Tasks on', chat: 'Chat on', linkedClient: 'linked clients' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

export function renderMarkdown(data) {
  const out = [
    '# RAMP change log',
    '',
    '<!-- Generated from src/changelog/changelog.json by `npm run changelog`. Edit the JSON, not this file. -->',
    '',
    'Every RAMP release, newest first: what changed, who it affects, and the commits and database migrations behind it.',
    'Admins see the same log in the app under **Admin › Change log**.',
    '',
  ];
  for (const e of data.entries) {
    out.push(`## ${e.version} · ${e.title}`, '', `*${longDate(e.date)}*${e.announce ? ' · shown at sign-in to the people it affects' : ''}`, '', e.summary, '');
    for (const ch of e.changes) {
      const who = ch.who.map((w) => WHO[w]).join(', ');
      const needs = (ch.requires || []).length ? `; needs ${ch.requires.map((r) => REQ[r]).join(', ')}` : '';
      out.push(`- **${TYPE[ch.type]}:** ${ch.text} *(${who}${needs})*`);
    }
    const tech = [];
    if (e.commits?.length) tech.push(`Commits: ${e.commits.map((c) => `\`${c}\``).join(', ')}`);
    if (e.migrations?.length) tech.push(`Database: ${e.migrations.map((m) => `\`${m}\``).join(', ')}`);
    if (tech.length) out.push('', tech.join(' · '));
    out.push('');
  }
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  fs.writeFileSync(MD_PATH, renderMarkdown(data));
  console.log(`Wrote CHANGELOG.md (${data.entries.length} releases).`);
}
