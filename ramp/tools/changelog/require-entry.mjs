// CI: fails a push that changes RAMP (app code or database migrations) without adding to the change log.
//   node ramp/tools/changelog/require-entry.mjs <before-sha> <after-sha>
// Changes that people won't notice (refactors, tests, tooling) can say so with "[no changelog]" in a commit message.
import { execSync } from 'node:child_process';

const [before, after] = process.argv.slice(2);
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
if (!before || !after || /^0+$/.test(before)) { console.log('No earlier commit to compare with: skipped.'); process.exit(0); }

let files, messages;
try {
  files = sh(`git diff --name-only ${before} ${after}`).split('\n').filter(Boolean);
  messages = sh(`git log --format=%B ${before}..${after}`);
} catch {
  console.log('Could not compare the pushed commits (history rewritten?): skipped.');
  process.exit(0);
}

const changed = files.filter((f) => /^ramp\/(src|supabase)\//.test(f) && !/^ramp\/src\/(guide\/guide\.json$|changelog\/)/.test(f));
const logged = files.includes('ramp/src/changelog/changelog.json');
if (!changed.length) { console.log('No RAMP app or database changes in this push.'); process.exit(0); }
if (logged) { console.log(`Change log updated alongside ${changed.length} changed file(s).`); process.exit(0); }
if (/\[no changelog\]/i.test(messages)) { console.log('Marked [no changelog]: nothing people will notice.'); process.exit(0); }

console.error([
  'This push changes RAMP but doesn’t add to the change log.',
  '',
  'Add an entry (or a change to the newest entry) in ramp/src/changelog/changelog.json, run `npm run changelog`,',
  'and push again. If nobody will notice the change, put [no changelog] in the commit message.',
  '',
  'Changed:',
  ...changed.slice(0, 30).map((f) => `  ${f}`),
  changed.length > 30 ? `  …and ${changed.length - 30} more` : '',
].join('\n'));
process.exit(1);
