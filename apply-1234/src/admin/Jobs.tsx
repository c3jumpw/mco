import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Activity, Job, JobStats, Template } from '../lib/types';
import { createJob, jobStats, listJobs, listTemplates, updateJob } from './data';
import { Button, Card, Empty, Field, Input, Loading, Modal, Pill, Select, useToast } from '../ui';
import { relTime } from '../lib/util';

export const statusTone = (s: Job['status']) => (s === 'published' ? 'good' : s === 'closed' ? 'neutral' : 'warn') as 'good' | 'neutral' | 'warn';
export const statusLabel = (s: Job['status']) => (s === 'published' ? 'Live' : s === 'closed' ? 'Closed' : 'Draft');

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [stats, setStats] = useState<Record<string, JobStats>>({});
  const [open, setOpen] = useState(false);

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
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Jobs</h1>
          <p className="text-sm text-muted mt-2">
            {totals.live} live · {totals.subs} submission{totals.subs === 1 ? '' : 's'}{totals.fresh ? ` · ${totals.fresh} waiting for review` : ''}
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>+ New job</Button>
      </div>

      {jobs.length === 0 ? (
        <Empty title="No jobs yet." action={<Button variant="primary" onClick={() => setOpen(true)}>Create your first job</Button>}>
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
      <NewJob open={open} onClose={() => setOpen(false)} jobs={jobs} />
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

function NewJob({ open, onClose, jobs }: { open: boolean; onClose: () => void; jobs: Job[] }) {
  const nav = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('blank');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) listTemplates('activity').then(setTemplates); }, [open]);

  const go = async () => {
    setBusy(true);
    try {
      const from = source.startsWith('job:') ? jobs.find((j) => j.id === source.slice(4)) : null;
      const tpl = source.startsWith('tpl:') ? templates.find((t) => t.id === source.slice(4)) : null;
      const job = await createJob({ title: title.trim() || undefined, from, activity: (tpl?.content as Activity) || null });
      if (from && title.trim()) await updateJob(job.id, { title: title.trim() });
      nav(`/admin/jobs/${job.id}?tab=posting`);
    } catch (e: any) {
      toast(e?.message || 'Could not create the job', 'bad');
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="New job">
      <div className="space-y-4">
        <Field label="Role title"><Input autoFocus placeholder="e.g. Operations Coordinator" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Start from" hint="Duplicating copies the notes, posting, activity page and questions, with a fresh secret link.">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="blank">Blank job with the standard activity page</option>
            {templates.length > 0 && <optgroup label="Activity templates">{templates.map((t) => <option key={t.id} value={`tpl:${t.id}`}>{t.name}</option>)}</optgroup>}
            {jobs.length > 0 && <optgroup label="Duplicate a job">{jobs.map((j) => <option key={j.id} value={`job:${j.id}`}>{j.title}</option>)}</optgroup>}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={go}>Create job</Button>
        </div>
      </div>
    </Modal>
  );
}
