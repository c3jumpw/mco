import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Application, Job, Review, Stage } from '../lib/types';
import { STAGES } from '../lib/types';
import { initials, relTime } from '../lib/util';
import { reviewAverage } from '../lib/export';
import { groupBy, listApplications, reviewsFor, updateApplication } from './data';
import { Empty, Input, Loading, Pill, Segmented, Select, cx, useToast } from '../ui';

export const stageTone = (s: Stage) =>
  (s === 'new' ? 'accent' : s === 'shortlisted' || s === 'interview' || s === 'offer' ? 'ink' : s === 'hired' ? 'good' : s === 'rejected' ? 'bad' : 'neutral') as
    'accent' | 'ink' | 'good' | 'bad' | 'neutral';
export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;

export default function Pipeline({ jobId, jobs }: { jobId?: string; jobs: Job[] }) {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review[]>>({});
  const [wrong, setWrong] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<Stage | 'all' | 'active'>('active');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [sort, setSort] = useState<'new' | 'score'>('new');
  const toast = useToast();
  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  useEffect(() => {
    setApps(null);
    listApplications(jobId).then(async (rows) => {
      setApps(rows);
      const ids = rows.map((r) => r.id);
      reviewsFor(ids).then((rv) => setReviews(groupBy(rv, (r) => r.application_id)));
      if (ids.length) {
        const { data } = await supabase.from('hiring_events').select('application_id').eq('type', 'wrong_url').in('application_id', ids.slice(0, 300));
        const c: Record<string, number> = {};
        for (const e of (data || []) as { application_id: string }[]) c[e.application_id] = (c[e.application_id] || 0) + 1;
        setWrong(c);
      }
    });
  }, [jobId]);

  if (!apps) return <Loading />;

  const tags = Array.from(new Set(apps.flatMap((a) => a.tags || []))).sort();
  const term = q.trim().toLowerCase();
  let rows = apps.filter((a) =>
    (stage === 'all' || (stage === 'active' ? a.stage !== 'rejected' : a.stage === stage)) &&
    (!term || a.name.toLowerCase().includes(term) || a.email.toLowerCase().includes(term) || (a.tags || []).some((t) => t.toLowerCase().includes(term))));
  if (sort === 'score') rows = [...rows].sort((a, b) => (reviewAverage(reviews[b.id] || []) ?? -1) - (reviewAverage(reviews[a.id] || []) ?? -1));

  const counts = Object.fromEntries(STAGES.map((s) => [s.id, apps.filter((a) => a.stage === s.id).length]));

  const move = async (a: Application, s: Stage) => {
    setApps((list) => list!.map((x) => (x.id === a.id ? { ...x, stage: s } : x)));
    const err = await updateApplication(a.id, { stage: s });
    if (err) toast(err.message, 'bad');
  };

  if (apps.length === 0)
    return <Empty title="No candidates yet.">Submissions appear here as soon as someone completes the activity.</Empty>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex-1 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1.5 w-max">
            {([['active', 'Active', apps.length - counts.rejected], ['all', 'All', apps.length]] as const).map(([id, label, n]) => (
              <Chip key={id} on={stage === id} onClick={() => setStage(id)}>{label} <span className="text-muted">{n}</span></Chip>
            ))}
            {STAGES.map((s) => (
              <Chip key={s.id} on={stage === s.id} onClick={() => setStage(s.id)}>{s.label} <span className="text-muted">{counts[s.id]}</span></Chip>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Input placeholder="Search name, email, tag" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 text-sm sm:w-56" list="pipeline-tags" />
          <datalist id="pipeline-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          <Select value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'score')} className="h-9 text-sm w-auto">
            <option value="new">Newest</option>
            <option value="score">Top score</option>
          </Select>
          <Segmented size="sm" value={view} onChange={setView} options={[{ id: 'list', label: 'List' }, { id: 'board', label: 'Board' }]} />
        </div>
      </div>

      {view === 'list' ? (
        <div className="rounded-2xl border border-line bg-card divide-y divide-line overflow-hidden">
          {rows.length === 0 && <p className="p-6 text-sm text-muted">Nobody matches these filters.</p>}
          {rows.map((a) => (
            <Row key={a.id} a={a} job={jobById[a.job_id]} showJob={!jobId} avg={reviewAverage(reviews[a.id] || [])} wrong={wrong[a.id] || 0} onMove={move} />
          ))}
        </div>
      ) : (
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto pb-2">
          <div className="flex gap-3 w-max">
            {STAGES.map((s) => {
              const col = rows.filter((a) => a.stage === s.id);
              if (stage === 'active' && s.id === 'rejected') return null;
              return (
                <div key={s.id} className="w-64 shrink-0">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-[12px] text-muted">{col.length}</span>
                  </div>
                  <div className="space-y-2 min-h-24 rounded-2xl bg-paper-2/60 p-2">
                    {col.map((a) => (
                      <Link key={a.id} to={`/admin/candidates/${a.id}`} className="block rounded-xl bg-card border border-line p-3 hover:border-ink/25">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        {!jobId && <p className="text-[12px] text-muted truncate">{jobById[a.job_id]?.title}</p>}
                        <div className="flex items-center justify-between mt-2 text-[12px] text-muted">
                          <span>{relTime(a.submitted_at)}</span>
                          <span className="font-mono">{reviewAverage(reviews[a.id] || []) ?? '—'}</span>
                        </div>
                        <Flags a={a} wrong={wrong[a.id] || 0} className="mt-2" />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('h-8 px-3 rounded-full text-[13px] border whitespace-nowrap transition',
      on ? 'bg-ink text-white border-ink [&_span]:text-white/60' : 'bg-card border-line hover:border-ink/30')}>{children}</button>
  );
}

export function Flags({ a, wrong, className }: { a: Application; wrong: number; className?: string }) {
  const f = a.flags || {};
  const items: { ok: boolean | null | undefined; label: string; title: string }[] = [
    { ok: f.all_loom_links, label: 'Loom', title: f.all_loom_links ? 'All answers are Loom links' : 'Some answers are not Loom links' },
    { ok: f.lengths_in_range, label: 'Length', title: f.lengths_in_range == null ? 'Length not checked' : f.lengths_in_range ? 'All answers within the requested length' : 'Some answers outside the requested length' },
  ];
  if (f.hidden_code_ok != null) items.push({ ok: f.hidden_code_ok, label: 'Code', title: f.hidden_code_ok ? 'Hidden code word found' : 'Hidden code word missing' });
  return (
    <div className={cx('flex flex-wrap items-center gap-1', className)}>
      {items.map((i) => (
        <span key={i.label} title={i.title}
          className={cx('text-[11px] rounded px-1.5 py-0.5 font-medium',
            i.ok == null ? 'bg-paper-2 text-muted' : i.ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
          {i.ok == null ? '?' : i.ok ? '✓' : '✗'} {i.label}
        </span>
      ))}
      <span title="Wrong link attempts before finding the page" className="text-[11px] rounded px-1.5 py-0.5 bg-paper-2 text-ink-2">{wrong} wrong tr{wrong === 1 ? 'y' : 'ies'}</span>
      {f.duplicate_email && <span className="text-[11px] rounded px-1.5 py-0.5 bg-warn-soft text-warn">Repeat</span>}
      {(a.metrics as any)?.preview && <span className="text-[11px] rounded px-1.5 py-0.5 bg-ink text-white">Test</span>}
    </div>
  );
}

function Row({ a, job, showJob, avg, wrong, onMove }:
  { a: Application; job?: Job; showJob: boolean; avg: number | null; wrong: number; onMove: (a: Application, s: Stage) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-paper/60">
      <Link to={`/admin/candidates/${a.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <span className="h-10 w-10 shrink-0 rounded-full bg-paper-2 flex items-center justify-center font-mono text-[13px]">{initials(a.name)}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{a.name}</p>
            <Pill tone={stageTone(a.stage)} className="sm:hidden">{stageLabel(a.stage)}</Pill>
          </div>
          <p className="text-[12px] text-muted truncate">{showJob && job ? `${job.title} · ` : ''}{relTime(a.submitted_at)}</p>
          <Flags a={a} wrong={wrong} className="mt-1.5" />
        </div>
      </Link>
      <div className="hidden sm:flex items-center gap-4 shrink-0">
        <div className="text-right">
          <p className="font-display text-2xl leading-none">{avg ?? '—'}</p>
          <p className="text-[11px] text-muted">score</p>
        </div>
        <Select value={a.stage} onChange={(e) => onMove(a, e.target.value as Stage)} className="h-9 text-sm w-36">
          {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </div>
    </div>
  );
}
