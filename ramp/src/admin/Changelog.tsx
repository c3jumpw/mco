// Admin › Change log: every RAMP release in date order, what changed and who it affects.
// The data is src/changelog/changelog.json; it can be downloaded as CSV or JSON, or printed / saved as a PDF.
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTitle } from '../lib/hooks';
import { cx, plural } from '../lib/util';
import { Button, Card, EmptyState, Icon, PageHeader, Pills, SearchInput, Segmented, Select } from '../ui';
import { ADMIN_BACK, downloadCsv, groupOf } from './parts/ops-common';
import { useTourCtx, openWhatsNew } from '../guide/Tour';
import { ENTRIES, LATEST, TYPE_META, WHO_LABEL, changelogRows, dateText, inAdminLog, type ChangeType, type Entry, type Who } from '../changelog/changelog';
import { TypeTag, WhoChips } from '../changelog/ui';

type TypeFilter = 'all' | ChangeType;
type Order = 'newest' | 'oldest';

const WHO_FILTERS: { value: '' | Who; label: string }[] = [
  { value: '', label: 'Anyone' }, { value: 'member', label: 'Team members' }, { value: 'guest', label: 'Guests' },
  { value: 'coach', label: 'Mentors and leads' }, { value: 'admin', label: 'Admins' }, { value: 'client', label: 'Clients' },
  { value: 'platform', label: 'Platform admins' },
];

export default function Changelog() {
  useTitle('Change log');
  const c = useTourCtx();
  const [type, setType] = useState<TypeFilter>('all');
  const [who, setWho] = useState<'' | Who>('');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<Order>('newest');

  // What this admin's log holds: platform-only changes and switched-off features are left out for workspace admins.
  const visible = useMemo(() => ENTRIES.map((e) => ({ ...e, changes: e.changes.filter((ch) => inAdminLog(ch, c)) }))
    .filter((e) => e.changes.length), [c]);
  const total = visible.reduce((n, e) => n + e.changes.length, 0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = visible.map((e) => {
      const hit = !q || `${e.version} ${e.title} ${e.summary}`.toLowerCase().includes(q);
      return {
        ...e,
        changes: e.changes.filter((ch) => (type === 'all' || ch.type === type)
          && (!who || ch.who.includes(who) || ch.who.includes('everyone'))
          && (hit || ch.text.toLowerCase().includes(q))),
      };
    }).filter((e) => e.changes.length);
    return order === 'newest' ? list : [...list].reverse();
  }, [visible, type, who, query, order]);
  const shownCount = shown.reduce((n, e) => n + e.changes.length, 0);
  const filtered = type !== 'all' || !!who || !!query.trim();

  const stamp = new Date().toISOString().slice(0, 10);
  const download = (kind: 'csv' | 'json') => {
    if (kind === 'csv') { downloadCsv(`ramp-change-log-${stamp}.csv`, changelogRows(visible)); return; }
    const blob = new Blob([JSON.stringify({ product: 'RAMP', version: LATEST.version, exported: stamp, entries: visible }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `ramp-change-log-${stamp}.json` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={groupOf('/admin/changelog')} title="Change log"
        subtitle="Every update to RAMP, when it went live and who it affects. People see the changes that apply to them the next time they sign in."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button icon="download" onClick={() => download('csv')}>CSV</Button>
            <Button icon="download" onClick={() => download('json')}>JSON</Button>
            <Button icon="fileText" onClick={() => window.print()}>Print</Button>
          </div>
        )} />

      <Card padded={false} className="overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
          <Fact label="Current version" value={`RAMP ${LATEST.version}`} hint={LATEST.title} accent />
          <Fact label="Last update" value={dateText(LATEST.date, { month: 'long', day: 'numeric', year: 'numeric' })} hint={relative(LATEST.date)} />
          <Fact label="History" value={plural(visible.length, 'release')} hint={`${plural(total, 'change')} since ${dateText(ENTRIES[ENTRIES.length - 1]!.date, { month: 'short', day: 'numeric', year: 'numeric' })}`} />
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <SearchInput value={query} onChange={setQuery} placeholder="Search changes" label="Search the change log" />
          <label className="block">
            <span className="sr-only">Who it affects</span>
            <Select value={who} onChange={(e) => setWho(e.target.value as '' | Who)} aria-label="Who it affects">
              {WHO_FILTERS.filter((w) => w.value !== 'platform' || c.isSuper).map((w) => <option key={w.value} value={w.value}>{w.value ? `Affects ${w.label.toLowerCase()}` : 'Affects anyone'}</option>)}
            </Select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Pills size="sm" label="Kind of change" value={type} onChange={setType}
            options={[{ value: 'all', label: 'All changes' }, ...(['new', 'improved', 'fixed'] as ChangeType[]).map((t) => ({ value: t, label: TYPE_META[t].label }))]} />
          <Segmented label="Order" value={order} onChange={setOrder} options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} />
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          {filtered ? `${plural(shownCount, 'change')} in ${plural(shown.length, 'release')} match.` : `${plural(total, 'change')} in ${plural(visible.length, 'release')}.`}
          {filtered && <button type="button" className="ml-2 font-semibold text-brand-ink cursor-pointer hover:underline" onClick={() => { setType('all'); setWho(''); setQuery(''); }}>Clear filters</button>}
        </p>
      </div>

      {shown.length === 0
        ? <EmptyState icon="search" title="No changes match" body="Try another word, or clear the filters." />
        : (
          <ol className="relative flex flex-col gap-5" aria-label="Releases">
            <span aria-hidden="true" className="absolute left-[15px] md:left-[171px] top-3 bottom-3 w-[2px] rounded-full bg-line" />
            {shown.map((e) => <Release key={e.id} e={e} latest={e.id === LATEST.id} showTech={c.isSuper} />)}
          </ol>
        )}

      <p className="text-sm text-muted">
        RAMP adds to this log with every update. Need help with something new? <Link to="/guide?view=admin" className="font-semibold text-brand-ink">Open the Admin guide</Link>.
      </p>
      <ChangelogPrint entries={[...visible].reverse()} />
    </div>
  );
}

function Fact({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={cx('px-5 py-4', accent && 'bg-[linear-gradient(135deg,var(--color-brand-soft),#fff_80%)]')}>
      <p className="text-[12px] font-bold tracking-[0.08em] uppercase text-muted">{label}</p>
      <p className={cx('font-display text-[22px] font-bold leading-tight mt-1', accent && 'text-brand-ink')}>{value}</p>
      <p className="text-sm text-muted mt-0.5 truncate">{hint}</p>
    </div>
  );
}

function relative(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const days = Math.round((Date.now() - new Date(y!, m! - 1, d!).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'A month ago' : `${months} months ago`;
}

function Release({ e, latest, showTech }: { e: Entry; latest: boolean; showTech: boolean }) {
  const counts = (['new', 'improved', 'fixed'] as ChangeType[]).map((t) => [t, e.changes.filter((x) => x.type === t).length] as const).filter(([, n]) => n);
  return (
    <li className="relative pl-11 md:pl-0 md:grid md:grid-cols-[150px_1fr] md:gap-11">
      <div className="hidden md:block pt-4 text-right">
        <p className="font-display text-[17px] font-bold leading-tight">{dateText(e.date, { month: 'short', day: 'numeric' })}</p>
        <p className="text-sm text-muted">{e.date.slice(0, 4)}</p>
      </div>
      <span aria-hidden="true" className={cx('absolute left-[7px] md:left-[163px] top-[18px] w-[18px] h-[18px] rounded-full border-[3px] border-bg',
        latest ? 'bg-brand shadow-[0_0_0_4px_var(--color-brand-2)]' : 'bg-[#AEB4BF]')} />
      <Card padded={false} as="article" className="overflow-hidden">
        <header className={cx('px-5 pt-4 pb-4 border-b border-line', latest && 'bg-[linear-gradient(135deg,var(--color-brand-soft),#fff_70%)]')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx('inline-flex items-center rounded-lg px-2 py-0.5 text-[13px] font-bold', latest ? 'bg-brand text-white' : 'bg-ink text-white')}>{e.version}</span>
            <span className="md:hidden text-sm font-semibold text-muted">{dateText(e.date)}</span>
            {latest && <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-bold text-brand-ink">Latest</span>}
            {e.announce && <span className="inline-flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 text-[12px] font-semibold text-ink-2" title="Shown once to the people it applies to, when they next signed in"><Icon name="bell" size={12} strokeWidth={2.2} />Shown at sign-in</span>}
          </div>
          <h2 className="font-display text-[20px] font-bold leading-snug mt-2">{e.title}</h2>
          <p className="text-[15px] text-ink-2 mt-1">{e.summary}</p>
          <p className="text-[13px] text-muted mt-2">{counts.map(([t, n]) => `${n} ${TYPE_META[t].label.toLowerCase()}`).join(' · ')}</p>
        </header>
        <ul className="divide-y divide-line-2">
          {e.changes.map((ch, k) => (
            <li key={k} className="px-5 py-3.5 flex items-start gap-3">
              <TypeTag type={ch.type} className="mt-[2px]" />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] leading-snug">{ch.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <WhoChips change={ch} />
                  {ch.link && <Link to={ch.link} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand-ink no-underline hover:underline">Open<Icon name="chevronRight" size={14} /></Link>}
                  {ch.guide && <Link to={`/guide?view=admin#s-${ch.guide}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-ink no-underline hover:underline"><Icon name="lifebuoy" size={14} />Guide</Link>}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <footer className="px-5 py-3 border-t border-line flex flex-wrap items-center gap-3 bg-[#FAFBFC]">
          <Button size="sm" icon="play" onClick={() => openWhatsNew([e.id])}>View as slides</Button>
          {showTech && (e.commits?.length || e.migrations?.length) ? (
            <span className="text-[12.5px] text-muted flex flex-wrap gap-x-3 gap-y-1">
              {!!e.commits?.length && <span>Commits <code className="font-mono text-ink-2">{e.commits.join(', ')}</code></span>}
              {!!e.migrations?.length && <span>Database <code className="font-mono text-ink-2">{e.migrations.join(', ')}</code></span>}
            </span>
          ) : null}
        </footer>
      </Card>
    </li>
  );
}

// ───────── print: the whole log as a plain document, oldest first ─────────

const PRINT_CSS = `
.ramp-changelog-print { display: none; }
@media print {
  body > *:not(.ramp-changelog-print) { display: none !important; }
  .ramp-changelog-print { display: block !important; color: #111827; font: 11pt/1.45 Inter, system-ui, sans-serif; }
  .ramp-changelog-print h1 { font-size: 20pt; margin: 0 0 2pt; }
  .ramp-changelog-print h2 { font-size: 13pt; margin: 16pt 0 2pt; break-after: avoid; }
  .ramp-changelog-print .meta { color: #4B5563; font-size: 9.5pt; }
  .ramp-changelog-print ul { margin: 6pt 0 0; padding-left: 16pt; }
  .ramp-changelog-print li { margin: 2pt 0; break-inside: avoid; }
  .ramp-changelog-print .tag { font-weight: 700; }
  html, body { background: #fff !important; }
  @page { margin: 16mm; }
}`;

function ChangelogPrint({ entries }: { entries: Entry[] }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ramp-changelog-print" aria-hidden="true">
      <style>{PRINT_CSS}</style>
      <h1>RAMP change log</h1>
      <p className="meta">Version {LATEST.version} · printed {dateText(new Date().toISOString().slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })} · oldest first</p>
      {entries.map((e) => (
        <section key={e.id}>
          <h2>{e.version} · {e.title}</h2>
          <p className="meta">{dateText(e.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. {e.summary}</p>
          <ul>
            {e.changes.map((ch, k) => (
              <li key={k}><span className="tag">{TYPE_META[ch.type].label}:</span> {ch.text} <span className="meta">({ch.who.map((w) => WHO_LABEL[w]).join(', ')})</span></li>
            ))}
          </ul>
        </section>
      ))}
    </div>,
    document.body,
  );
}
