import { useState } from 'react';
import type { Job } from '../../lib/types';
import { fullUrl, hintText, placedParts, splitUrl } from '../../lib/posting';
import { randomSlug } from '../../lib/util';
import { Button, Card, Field, Input, Pill, SectionTitle, cx } from '../../ui';
import type { Patch } from '../JobEditor';

export default function PuzzleTab({ job, patch }: { job: Job; patch: Patch }) {
  const [slugDraft, setSlugDraft] = useState(job.slug || '');
  const url = fullUrl(job.domain, job.slug);
  const joined = job.fragments.map((f) => f.text).join('');
  const matches = joined === url;
  const { placed } = placedParts(job.posting, job.fragments.length);

  const applySlug = (raw: string, resplit = true) => {
    const slug = raw.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
    setSlugDraft(slug);
    if (slug.length < 3) return;
    const p: Partial<Job> = { slug };
    if (resplit) p.fragments = splitUrl(fullUrl(job.domain, slug), job.fragments.length || 3).map((text) => ({ text }));
    patch(p);
  };

  const resplit = (n: number) => patch({ fragments: splitUrl(url, n).map((text) => ({ text })) });

  const editFragment = (i: number, text: string) =>
    patch({ fragments: job.fragments.map((f, j) => (j === i ? { text } : f)) });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5 min-w-0">
        <Card>
          <SectionTitle sub="The page candidates must find. Keep it unguessable: a word plus numbers works well.">Secret link</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <Field label="Domain"><Input mono value={job.domain}
              onChange={(e) => patch({ domain: e.target.value.trim().toLowerCase() })} /></Field>
            <Field label="Path">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted text-sm">/</span>
                  <Input mono className="pl-6" value={slugDraft} onChange={(e) => setSlugDraft(e.target.value)}
                    onBlur={(e) => e.target.value !== job.slug && applySlug(e.target.value)} />
                </div>
                <Button onClick={() => applySlug(randomSlug())}>Generate</Button>
              </div>
            </Field>
          </div>
          <div className="mt-4 rounded-xl bg-ink text-white px-4 py-3 font-mono text-[15px] break-all">
            {job.fragments.map((f, i) => (
              <span key={i} className={cx(i % 2 ? 'text-accent' : 'text-white')}>{f.text}</span>
            ))}
          </div>
          <p className={cx('text-xs mt-2', matches ? 'text-good' : 'text-bad')}>
            {matches ? '✓ The pieces add up to the full link.' : `✗ The pieces spell “${joined}”, not “${url}”. Re-split or fix them below.`}
          </p>
          {job.status === 'published' && (
            <p className="text-xs text-warn mt-2">This job is live. Changing the link breaks it for anyone who already pieced it together.</p>
          )}
        </Card>

        <Card>
          <SectionTitle sub="Split automatically at natural breaks, then fine-tune each piece.">Pieces</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm text-muted">Number of pieces:</span>
            {[2, 3, 4, 5, 6].map((n) => (
              <Button key={n} size="sm" variant={job.fragments.length === n ? 'primary' : 'secondary'} onClick={() => resplit(n)}>{n}</Button>
            ))}
          </div>
          <div className="space-y-3">
            {job.fragments.map((f, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_180px_1fr] items-center gap-3">
                <span className="font-mono text-[12px] text-muted w-14">part{i + 1}</span>
                <Input mono value={f.text} onChange={(e) => editFragment(i, e.target.value)} />
                <div className="col-span-2 sm:col-span-1 flex items-center gap-2 min-w-0">
                  <span className="text-sm text-ink-2 truncate">{hintText(job.hint_format, i, job.fragments.length, f.text)}</span>
                  {placed.includes(i + 1) ? <Pill tone="good">in posting</Pill> : <Pill tone="warn">not placed</Pill>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <SectionTitle>Hint format</SectionTitle>
          <Input mono value={job.hint_format} onChange={(e) => patch({ hint_format: e.target.value })} />
          <p className="text-xs text-muted mt-2 leading-relaxed">
            {'{n}'} is the piece number, {'{total}'} the number of pieces, {'{text}'} the piece itself.
            Drop {'{n}'} and {'{total}'} to make it harder: candidates then have to work out the order themselves.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Part {n} of {total}: {text}', 'Clue {n}: {text}', '[{text}]', 'Key: {text}'].map((f) => (
              <button key={f} onClick={() => patch({ hint_format: f })} className="font-mono text-[12px] rounded-md border border-line px-2 py-1 hover:border-ink/40">{f}</button>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle>What gets tracked</SectionTitle>
          <ul className="text-sm text-ink-2 space-y-2 leading-relaxed list-disc pl-4">
            <li>Every wrong or partial address typed on this domain is logged and matched to the closest live job.</li>
            <li>When that person later submits, their wrong tries show up on their profile.</li>
            <li>Tries are tied to the browser, so someone who switches devices starts fresh.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
