import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Job, JobStats } from '../lib/types';
import { jobStats, listJobs } from './data';
import { Button, Card, Empty, Loading, Pill } from '../ui';
import { relTime } from '../lib/util';
import Dashboard from './Dashboard';

export const statusTone = (s: Job['status']) => (s === 'published' ? 'good' : s === 'closed' ? 'neutral' : 'warn') as 'good' | 'neutral' | 'warn';
export const statusLabel = (s: Job['status']) => (s === 'published' ? 'Live' : s === 'closed' ? 'Closed' : 'Draft');

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [stats, setStats] = useState<Record<string, JobStats>>({});
  const nav = useNavigate();

  useEffect(() => {
    listJobs().then(setJobs).catch(() => setJobs([]));
    jobStats().then(setStats);
  }, []);

  if (!jobs) return <Loading />;
  const totals = Object.values(stats).reduce(
    (a, s) => ({ subs: a.subs + Number(s.submissions), fresh: a.fresh + Number(s.new_count), live: a.live }),
    { subs: 0, fresh: 0, live: jobs.filter((j) => j.status === 'published').length });

  return (
    <div className="rise">
      {jobs.length > 0 && <Dashboard jobs={jobs} />}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          {jobs.length > 0
            ? <h2 className="font-display text-3xl sm:text-4xl leading-none">Jobs</h2>
            : <h1 className="font-display text-4xl sm:text-5xl leading-none">Jobs</h1>}
          <p className="text-sm text-muted mt-2">
            {totals.live} live · {totals.subs} submission{totals.subs === 1 ? '' : 's'}{totals.fresh ? ` · ${totals.fresh} waiting for review` : ''}
          </p>
        </div>
        <Button variant="primary" onClick={() => nav('/admin/new')}>+ New job</Button>
      </div>

      {jobs.length === 0 ? (
        <Empty title="No jobs yet." action={<Button variant="primary" onClick={() => nav('/admin/new')}>Create your first job</Button>}>
          Each job gets its notes, a posting with the link hidden in it, an activity page, and its own candidate pipeline.
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => {
            const s = stats[j.id];
            return (
              <Link key={j.id} to={`/admin/jobs/${j.id}`} className="group">
                <Card className="h-full transition group-hover:border-ink/25 group-hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold leading-snug">{j.title}</h2>
                    <Pill tone={statusTone(j.status)}>{statusLabel(j.status)}</Pill>
                  </div>
                  <p className="font-mono text-[12px] text-muted mt-1 truncate">/{j.slug}</p>
                  <div className="grid grid-cols-3 gap-2 mt-5">
                    <Stat n={s?.submissions} label="Submitted" />
                    <Stat n={s?.new_count} label="To review" accent={!!Number(s?.new_count)} />
                    <Stat n={s?.shortlisted} label="Shortlist" />
                  </div>
                  <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-[12px] text-muted">
                    <span>{Number(s?.arrivals || 0)} found the page · {Number(s?.wrong_attempts || 0)} wrong tries</span>
                    <span>{relTime(j.updated_at)}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, accent }: { n?: number; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`font-display text-3xl leading-none ${accent ? 'text-accent' : ''}`}>{Number(n || 0)}</p>
      <p className="text-[11px] text-muted mt-1">{label}</p>
    </div>
  );
}
