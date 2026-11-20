// Help › Change log: every update to apply1234, with dates, filters and a download to keep.
import { useMemo, useState } from 'react';
import { CHANGELOG, changelogMarkdown, type Area, type Release } from './changelog';
import { Button, Input, Pill, Segmented, cx } from '../ui';
import { openTour } from './tour/Tour';

const REPO = 'https://github.com/c3jumpw/mco/commit/';
const KIND_TONE = { New: 'accent', Improved: 'good', Fixed: 'warn' } as const;
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const longDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Changelog() {
  const [order, setOrder] = useState<'new' | 'old'>('new');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [q, setQ] = useState('');
  const areas = useMemo(() => [...new Set(CHANGELOG.flatMap((r) => r.areas))].sort(), []);
  const first = CHANGELOG[CHANGELOG.length - 1];

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (r: Release) => {
      const text = [r.title, r.kind, ...r.areas, ...r.items, ...(r.technical || []), ...(r.commits || [])].join(' ').toLowerCase();
      return words.every((w) => text.includes(w));
    };
    const l = CHANGELOG.filter((r) => (area === 'all' || r.areas.includes(area)) && hit(r));
    return order === 'new' ? l : [...l].reverse();
  }, [order, area, q]);

  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="rise max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Change log</h1>
          <p className="text-sm text-muted mt-2">
            Every update to apply1234 since it launched on {longDay(first.date)}: {CHANGELOG.length} updates.
            {' '}<button className="underline underline-offset-2 hover:text-ink" onClick={() => openTour('new')}>See the latest in What’s new</button>.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" onClick={() => download(`apply1234-change-log-${stamp}.md`, changelogMarkdown(list), 'text/markdown')}>Download (Markdown)</Button>
          <Button size="sm" onClick={() => download(`apply1234-change-log-${stamp}.json`, JSON.stringify(list, null, 2), 'application/json')}>JSON</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <Input type="search" className="h-9 text-sm sm:max-w-xs" placeholder="Search the change log" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the change log" />
        <Segmented size="sm" value={order} onChange={setOrder} options={[{ id: 'new', label: 'Newest first' }, { id: 'old', label: 'Oldest first' }]} />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-6" role="group" aria-label="Filter by area">
        {(['all', ...areas] as const).map((a) => (
          <button key={a} type="button" onClick={() => setArea(a)} aria-pressed={area === a}
            className={cx('rounded-full px-3 py-1 text-[13px] border transition', area === a ? 'bg-ink text-white border-ink' : 'bg-card border-line text-ink-2 hover:border-ink/30')}>
            {a === 'all' ? 'All areas' : a}
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="text-sm text-muted py-10">Nothing matches. Try another word or area.</p>}
      <ol className="relative sm:border-l sm:border-line sm:ml-[7.5rem]">
        {list.map((r) => (
          <li key={`${r.date}-${r.title}`} className="relative sm:pl-6 pb-6">
            <span className="hidden sm:block absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-paper" aria-hidden />
            <time dateTime={r.date} className="block sm:absolute sm:-left-[7.5rem] sm:w-[6.5rem] sm:text-right sm:top-0.5 text-[13px] font-medium text-muted mb-1.5 sm:mb-0">{day(r.date)}</time>
            <article className="rounded-2xl bg-card border border-line p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={KIND_TONE[r.kind]}>{r.kind}</Pill>
                <h2 className="font-semibold text-[17px] leading-snug">{r.title}</h2>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {r.areas.map((a) => <span key={a} className="text-[11px] uppercase tracking-wide text-muted bg-paper-2 rounded px-1.5 py-0.5">{a}</span>)}
                {r.version && <span className="text-[11px] uppercase tracking-wide text-accent bg-accent-soft rounded px-1.5 py-0.5">What’s new {r.version}</span>}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-2 leading-relaxed list-disc pl-5 marker:text-accent">
                {r.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
              {(r.technical?.length || r.commits?.length) ? (
                <details className="mt-3 group">
                  <summary className="text-[13px] text-muted cursor-pointer hover:text-ink">Technical details</summary>
                  <div className="mt-2 rounded-xl bg-paper-2/60 px-3 py-2.5 text-[13px] text-ink-2 space-y-1.5">
                    {r.technical?.map((t) => <p key={t}>{t}</p>)}
                    {r.commits?.length ? (
                      <p className="font-mono text-[12px]">Commits: {r.commits.map((c, i) => <span key={c}>{i ? ', ' : ''}<a className="underline underline-offset-2 hover:text-ink" href={REPO + c} target="_blank" rel="noopener noreferrer">{c}</a></span>)}</p>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
