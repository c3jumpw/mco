import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { HEvent, Job } from '../lib/types';
import { EVENT_LABELS } from '../lib/metrics';
import { fmtDate } from '../lib/util';
import { listJobs } from './data';
import { Card, Empty, Loading, Pill, SectionTitle, Segmented, Select } from '../ui';

export default function ActivityLog() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<HEvent[] | null>(null);
  const [jobId, setJobId] = useState('');
  const [kind, setKind] = useState<'wrong' | 'all'>('wrong');
  const [hideTests, setHideTests] = useState(true);

  useEffect(() => { listJobs().then(setJobs); }, []);
  useEffect(() => {
    setEvents(null);
    let q = supabase.from('hiring_events').select('*').order('created_at', { ascending: false }).limit(500);
    if (kind === 'wrong') q = q.in('type', ['wrong_url', 'root_visit']);
    if (jobId === 'none') q = q.is('job_id', null);
    else if (jobId) q = q.eq('job_id', jobId);
    q.then(({ data }) => setEvents((data || []) as HEvent[]));
  }, [jobId, kind]);

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);
  const rows = (events || []).filter((e) => !hideTests || !e.meta?.preview);
  const topPaths = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of rows) if (e.type === 'wrong_url') c[e.path] = (c[e.path] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [rows]);

  return (
    <div className="rise">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Activity</h1>
          <p className="text-sm text-muted mt-2">Every visit to the domain, including addresses that lead nowhere.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented value={kind} onChange={setKind} options={[{ id: 'wrong', label: 'Wrong links' }, { id: 'all', label: 'Everything' }]} />
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-auto">
            <option value="">All jobs</option>
            <option value="none">Not matched to a job</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
        </div>
      </div>

      {!events ? <Loading /> : rows.length === 0 ? (
        <Empty title="Nothing logged yet.">Once candidates start trying addresses on the domain, you’ll see each attempt here.</Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-line bg-card divide-y divide-line overflow-hidden min-w-0">
            {rows.map((e) => (
              <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {EVENT_LABELS[e.type] || e.type}
                    {(e.type === 'wrong_url' || e.type === 'arrival') && <span className="font-mono text-[13px] text-ink-2"> /{e.path}</span>}
                  </p>
                  <p className="text-[12px] text-muted mt-0.5 flex flex-wrap gap-x-2">
                    <span>{fmtDate(e.created_at)}</span>
                    {e.job_id && jobById[e.job_id] && <span>· {jobById[e.job_id].title}</span>}
                    <span className="font-mono">· {e.visitor_id.slice(0, 7) || 'anon'}</span>
                    {typeof e.meta?.distance === 'number' && <span>· {e.meta.distance as number} characters off</span>}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {!!e.meta?.preview && <Pill tone="ink">Test</Pill>}
                  {e.application_id && <Link to={`/admin/candidates/${e.application_id}`}><Pill tone="good">Submitted later</Pill></Link>}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-5">
            <Card>
              <SectionTitle sub="Common wrong guesses show where people get stuck.">Most-tried wrong links</SectionTitle>
              {topPaths.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
                <ul className="space-y-1.5">
                  {topPaths.map(([p, n]) => (
                    <li key={p} className="flex justify-between gap-3 text-sm"><span className="font-mono truncate">/{p}</span><span className="font-mono text-muted">{n}</span></li>
                  ))}
                </ul>
              )}
            </Card>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={hideTests} onChange={(e) => setHideTests(e.target.checked)} className="accent-ink" /> Hide my test visits
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
