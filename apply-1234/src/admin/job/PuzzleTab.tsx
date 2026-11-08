import { useEffect, useState } from 'react';
import type { Job, Source } from '../../lib/types';
import { fragmentsFor, fullUrl, hintText, placedParts, splitUrl, variantSlug } from '../../lib/posting';
import { randomSlug, uid } from '../../lib/util';
import { freeCode, freeSourceCode, linkProblem, takenLinks } from '../data';
import { Button, Card, CopyButton, Field, Input, Pill, SectionTitle, Toggle, cx } from '../../ui';
import type { Patch } from '../JobEditor';

export default function PuzzleTab({ job, patch }: { job: Job; patch: Patch }) {
  const [slugDraft, setSlugDraft] = useState(job.slug || '');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [taken, setTaken] = useState<Map<string, string> | null>(null);
  useEffect(() => { takenLinks(job.id).then(setTaken).catch(() => setTaken(new Map())); }, [job.id]);
  const url = fullUrl(job.domain, job.slug);
  const joined = job.fragments.map((f) => f.text).join('');
  const matches = joined === url;
  const { placed } = placedParts(job.posting, job.fragments.length);

  const applySlug = async (raw: string, resplit = true) => {
    const slug = raw.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
    setSlugDraft(slug);
    if (slug === job.slug) { setSlugError(null); return; }
    // Always check against the latest jobs before saving, so two jobs can never share a link.
    const t = await takenLinks(job.id).catch(() => taken || new Map<string, string>());
    setTaken(t);
    const problem = linkProblem(slug, t, job.sources || []);
    setSlugError(problem);
    if (problem) return;
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
          <SectionTitle sub="The page candidates must find. A random code keeps the job private: nobody can guess it, and the site never lists jobs.">Secret link</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <Field label="Domain"><Input mono value={job.domain}
              onChange={(e) => patch({ domain: e.target.value.trim().toLowerCase() })} /></Field>
            <Field label="Path">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted text-sm">/</span>
                  <Input mono className="pl-6" value={slugDraft} onChange={(e) => { setSlugDraft(e.target.value); setSlugError(null); }}
                    onBlur={(e) => applySlug(e.target.value)} />
                </div>
                <Button disabled={!taken} onClick={() => taken && applySlug(freeCode(taken))}>Random code</Button>
              </div>
              {slugError && <p className="text-xs text-bad mt-1.5 font-medium">✗ {slugError} The link was not changed.</p>}
            </Field>
          </div>
          <button className="mt-2 text-[12px] text-muted underline underline-offset-2" onClick={() => {
            let next = randomSlug();
            for (let i = 0; taken && i < 30 && linkProblem(next, taken, job.sources || []); i++) next = randomSlug();
            applySlug(next);
          }}>Use a word + number instead</button>
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
        <SourcesCard job={job} patch={patch} taken={taken} />
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

const QUICK = ['LinkedIn', 'Indeed', 'Facebook', 'Craigslist', 'Referral'];

function SourcesCard({ job, patch, taken }: { job: Job; patch: Patch; taken: Map<string, string> | null }) {
  const sources = job.sources || [];
  const set = (next: Source[]) => patch({ sources: next });
  const add = (label: string) => {
    const name = label.trim();
    if (!name) return;
    const code = freeSourceCode(job.slug || "", sources, taken || new Map());
    set([...sources, { id: uid('s'), label: name, code, active: true }]);
  };
  const baseOff = !!job.settings?.base_link_off;
  return (
    <Card>
      <SectionTitle sub="Give each job board its own version of the link. You'll see which board sends the best candidates, and if one link leaks you can switch just that one off.">
        Links per job board
      </SectionTitle>
      {sources.length === 0 && <p className="text-sm text-muted mb-3">No board links yet. Everyone uses the main link.</p>}
      <div className="space-y-3">
        {sources.map((src) => {
          const link = fullUrl(job.domain, variantSlug(job.slug, src.code));
          const pieces = fragmentsFor(job, src.code);
          return (
            <div key={src.id} className={cx('rounded-xl border p-3', src.active ? 'border-line' : 'border-dashed border-line opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-40 shrink-0">
                  <Input value={src.label} className="h-9 text-sm"
                    onChange={(e) => set(sources.map((x) => (x.id === src.id ? { ...x, label: e.target.value } : x)))} />
                </div>
                <span className="font-mono text-[13px] break-all flex-1 min-w-0">{link}</span>
              </div>
              <p className="text-[12px] text-muted mt-1.5">Last piece in this board's posting: <span className="font-mono text-ink-2">{pieces[pieces.length - 1]?.text}</span></p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <CopyButton text={link} label="Copy link" />
                <Button size="sm" variant="ghost" onClick={() => {
                  if (confirm(`Give ${src.label} a new code? Its current link stops working right away.`)) {
                    const code = freeSourceCode(job.slug || "", sources, taken || new Map());
                    set(sources.map((x) => (x.id === src.id ? { ...x, code } : x)));
                  }
                }}>New code</Button>
                <Button size="sm" variant="ghost" onClick={() => set(sources.map((x) => (x.id === src.id ? { ...x, active: !x.active } : x)))}>
                  {src.active ? 'Turn off' : 'Turn on'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm(`Remove ${src.label}? Its link stops working.`) && set(sources.filter((x) => x.id !== src.id))}>Remove</Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {QUICK.filter((q) => !sources.some((x) => x.label === q)).map((q) => (
          <Button key={q} size="sm" onClick={() => add(q)}>+ {q}</Button>
        ))}
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem('src') as HTMLInputElement; add(f.value); f.value = ''; }}>
          <Input name="src" placeholder="Other board" className="h-8 w-32 text-sm" />
          <Button size="sm" type="submit">Add</Button>
        </form>
      </div>
      {sources.length > 0 && (
        <div className="mt-5 pt-4 border-t border-line">
          <Toggle checked={baseOff} onChange={(v) => patch({ settings: { ...(job.settings || {}), base_link_off: v } })}
            label="Turn off the main link"
            hint={`Only the board links work. ${fullUrl(job.domain, job.slug)} will show “Nothing here”.`} />
        </div>
      )}
      <p className="text-xs text-muted mt-4 leading-relaxed">To post on a board, open Overview and pick that board under “Copy for job boards”. The posting fills in that board's pieces.</p>
    </Card>
  );
}
