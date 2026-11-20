// Writes CHANGELOG.md from src/admin/changelog.ts, the one record of every update (oldest last).
//   node scripts/changelog.mjs
import { writeFileSync } from 'node:fs';
import { CHANGELOG, changelogMarkdown } from '../src/admin/changelog.ts';

const md = changelogMarkdown(CHANGELOG).replace('# apply1234 change log',
  '# apply1234 change log\n\nWritten from `src/admin/changelog.ts` by `node scripts/changelog.mjs`. Edit that file, not this one.');
writeFileSync(new URL('../CHANGELOG.md', import.meta.url), md + '\n');
console.log(`CHANGELOG.md: ${CHANGELOG.length} updates`);
