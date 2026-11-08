import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Job, JobStats } from '../lib/types';
import { deleteJob, getJob, jobStats, updateJob } from './data';
import { Button, Card, CopyButton, Input, Loading, Pill, SectionTitle, Select, Tabs, useToast, cx } from '../ui';
import { fragmentsFor, fullUrl, mdToHtml, placedParts, postingMarkdown, postingPlain, variantSlug } from '../lib/posting';
import { supabase } from '../lib/supabase';
import { statusLabel, statusTone } from './Jobs';
import PostingTab from './job/PostingTab';
import PuzzleTab from './job/PuzzleTab';
import ActivityTab from './job/ActivityTab';
import QuestionsTab from './job/QuestionsTab';
import InterviewTab from './job/InterviewTab';
import Pipeline from './Pipeline';
import ExportModal from './ExportModal';

export type TabId = 'overview' | 'posting' | 'puzzle' | 'activity' | 'questions' | 'interview' | 'candidates';
export type Patch = (p: Partial<Job>) => void;

export default function JobEditor() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as TabId) || 'overview';
  const setTab = (t: TabId) => setSp({ tab: t }, { replace: true });
  const toast = useToast();
  const nav = useNavigate();

  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const pending = useRef<Partial<Job>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    getJob(id).then(setJob);
    jobStats().then((s) => setStats(s[id] || null));
  }, [id]);

  const flush = useCallback(async () => {
    if (!id) return;
    const p = pending.current;
    if (!Object.keys(p).length) return;
    pending.current = {};
    setSaving('saving');
    const err = await updateJob(id, p);
    if (err) {
      pending.current = { ...p, ...pending.current };
      setSaving('error');
      toast(err.code === '23505' ? 'That link is already used by another job. Pick a different one.' :
        err.code === '23514' ? 'That value isn’t allowed. Links use lowercase letters, numbers and dashes (3+ characters).' : err.message, 'bad');
    } else setSaving('saved');
  }, [id, toast]);

  const patch: Patch = useCallback((p) => {
    setJob((j) => (j ? { ...j, ...p } : j));
    pending.current = { ...pending.current, ...p };
    setSaving('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }, [flush]);

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (Object.keys(pending.current).length) { e.preventDefault(); } };
    window.addEventListener('beforeunload', before);
    return () => { window.removeEventListener('beforeunload', before); clearTimeout(timer.current); flush(); };
  }, [flush]);

  if (job === undefined) return <Loading />;
  if (job === null) return <p className="text-muted py-10">Job not found. <Link className="underline" to="/admin">Back to jobs</Link></p>;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'posting', label: 'Notes & posting' },
    { id: 'puzzle', label: 'Hidden link' },
    { id: 'activity', label: 'Activity page' },
    { id: 'questions', label: `Questions${job.questions.length ? ` (${job.questions.length})` : ''}` },
    { id: 'interview', label: 'Interview' },
    { id: 'candidates', label: `Candidates${stats?.submissions ? ` (${stats.submissions})` : ''}` },
  ];

  return (
    <div className="rise">
      <div className="flex items-center gap-2 text-sm text-muted mb-3">
        <Link to="/admin" className="hover:text-ink">Jobs</Link><span>/</span>
        <span className="truncate">{job.title}</span>
        <span className={cx('ml-auto text-[12px]', saving === 'error' ? 'text-bad' : 'text-muted')}>
          {saving === 'saving' || saving === 'pending' ? 'Saving…' : saving === 'saved' ? 'All changes saved' : saving === 'error' ? 'Not saved' : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input value={job.title} onChange={(e) => patch({ title: e.target.value })}
          className="font-display text-4xl sm:text-5xl leading-none bg-transparent outline-none min-w-0 flex-1 focus:bg-card rounded-lg -mx-1 px-1" />
        <Pill tone={statusTone(job.status)}>{statusLabel(job.status)}</Pill>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="pt-6">
        {tab === 'overview' && <Overview job={job} stats={stats} patch={patch} flush={flush} setTab={setTab}
          onDelete={async () => {
            if (!confirm(`Delete “${job.title}” and all of its candidates? This can't be undone.`)) return;
            await deleteJob(job.id);
            nav('/admin');
          }} />}
        {tab === 'posting' && <PostingTab job={job} patch={patch} />}
        {tab === 'puzzle' && <PuzzleTab job={job} patch={patch} />}
        {tab === 'activity' && <ActivityTab job={job} patch={patch} />}
        {tab === 'questions' && <QuestionsTab job={job} patch={patch} />}
        {tab === 'interview' && <InterviewTab job={job} patch={patch} />}
        {tab === 'candidates' && <Pipeline jobId={job.id} jobs={[job]} />}
      </div>
    </div>
  );
}

export function activityLinks(job: Job) {
  const live = `https://${fullUrl(job.domain, job.slug)}`;
  const test = `${window.location.origin}/${job.slug}`;
  const sharePage = `${window.location.origin}/p/${job.public_id}`;
  const bare = (h: string) => h.replace(/^www\./, '');
  const sameOrigin = bare(window.location.hostname) === bare((job.domain || '').split('/')[0]);
  return { live, test, sharePage, sameOrigin };
}

export function publishProblems(job: Job): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!job.slug) blocking.push('Set the secret link on the Hidden link tab.');
  if (!job.questions.length) blocking.push('Add at least one question.');
  const url = fullUrl(job.domain, job.slug);
  if (job.fragments.map((f) => f.text).join('') !== url) warnings.push('The link pieces don’t add up to the full link. Re-split them on the Hidden link tab.');
  const { missing } = placedParts(job.posting, job.fragments.length);
  if (missing.length) warnings.push(`Piece${missing.length > 1 ? 's' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'aren’t' : 'isn’t'} placed in the posting yet.`);
  if (!job.posting.trim()) warnings.push('The posting is empty.');
  if ((job.activity.answer_max || 0) > 300) warnings.push('Answers longer than 5 minutes won’t fit on Loom’s free plan.');
  return { blocking, warnings };
}

function Overview({ job, stats, patch, flush, setTab, onDelete }:
  { job: Job; stats: JobStats | null; patch: Patch; flush: () => Promise<void>; setTab: (t: TabId) => void; onDelete: () => void }) {
  const links = activityLinks(job);
  const { blocking, warnings } = publishProblems(job);
  const [exportOpen, setExportOpen] = useState(false);
  const toast = useToast();

  const setStatus = async (status: Job['status']) => {
    if (status === 'published' && blocking.length) { toast(blocking[0], 'bad'); return; }
    patch({
      status,
      ...(status === 'published' && !job.published_at ? { published_at: new Date().toISOString() } : {}),
      ...(status === 'closed' ? { closed_at: new Date().toISOString() } : {}),
    });
    await flush();
    toast(status === 'published' ? 'Live. The activity page is open.' : status === 'closed' ? 'Closed. New submissions are blocked.' : 'Moved back to draft.');
  };

  const sources = (job.sources || []).filter((x) => x.active);
  const [srcCode, setSrcCode] = useState('');
  const src = sources.find((x) => x.code === srcCode) || null;
  const frags = fragmentsFor(job, src?.code);
  const md = () => `# ${job.title}\n\n` + postingMarkdown(job.posting, frags, job.hint_format);
  const plain = () => `${job.title}\n\n` + postingPlain(job.posting, frags, job.hint_format);
  const html = () => `<h1>${job.title}</h1>` + mdToHtml(job.posting, undefined, frags, job.hint_format);
  const bySource = useSourceStats(job);

  const share = async () => {
    if (!job.share_enabled) patch({ share_enabled: true });
    await flush();
    if (navigator.share) {
      try { await navigator.share({ title: job.title, url: links.sharePage }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard?.writeText(links.sharePage);
    toast('Posting link copied');
  };

  const n = (k: keyof JobStats) => Number(stats?.[k] || 0);
  const funnel = [
    ...(job.share_enabled ? [{ label: 'Viewed the shared posting', v: n('posting_views') }] : []),
    { label: 'Tried a wrong link', v: n('wrong_visitors'), note: `${n('wrong_attempts')} attempts`, muted: true },
    { label: 'Found the activity page', v: n('arrivals') },
    { label: 'Started answering', v: n('form_starts') },
    { label: 'Submitted', v: n('submissions') },
    { label: 'Shortlisted', v: n('shortlisted') },
    { label: 'Interviewed', v: n('interviews') },
    { label: 'Hired', v: n('hired') },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.v));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5 min-w-0">
        <Card>
          <SectionTitle sub={job.status === 'published' ? 'Candidates who assemble the link can open the activity and submit.' : job.status === 'closed' ? 'The page shows a “closed” message. Existing candidates stay in your pipeline.' : 'Candidates see “Nothing here” at the secret link until you go live. You can still preview it while signed in.'}>
            Status
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant={job.status === 'draft' ? 'primary' : 'secondary'} size="sm" onClick={() => setStatus('draft')}>Draft</Button>
            <Button variant={job.status === 'published' ? 'accent' : 'secondary'} size="sm" onClick={() => setStatus('published')}>Live</Button>
            <Button variant={job.status === 'closed' ? 'primary' : 'secondary'} size="sm" onClick={() => setStatus('closed')}>Closed</Button>
          </div>
          {(blocking.length > 0 || warnings.length > 0) && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {blocking.map((b) => <li key={b} className="text-bad">● {b}</li>)}
              {warnings.map((w) => <li key={w} className="text-warn">● {w}</li>)}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle sub="Where the assembled fragments lead.">Activity link</SectionTitle>
          <div className="rounded-xl bg-paper px-3 py-2.5 font-mono text-sm break-all">{links.live}</div>
          <div className="flex flex-wrap gap-2 mt-3">
            <CopyButton text={links.live} label="Copy link" />
            <a href={links.test} target="_blank" rel="noreferrer"><Button size="sm">Preview as candidate ↗</Button></a>
            <Button size="sm" variant="ghost" onClick={() => setTab('puzzle')}>Change link</Button>
          </div>
          {!links.sameOrigin && (
            <p className="text-xs text-muted mt-3 leading-relaxed">
              Until apply1234.com points at this app, use the preview link: <span className="font-mono break-all">{links.test}</span>.
              Your own visits from this browser are marked as tests and left out of the numbers.
            </p>
          )}
        </Card>

        <Card>
          <SectionTitle sub="The posting with link fragments filled in. Paste it into Indeed, LinkedIn or any job board.">Copy for job boards</SectionTitle>
          {sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-sm text-muted">Posting for</span>
              <Select value={srcCode} onChange={(e) => setSrcCode(e.target.value)} className="w-auto h-9 text-sm">
                <option value="">Main link</option>
                {sources.map((x) => <option key={x.id} value={x.code}>{x.label}</option>)}
              </Select>
              <span className="font-mono text-[12px] text-muted break-all">{fullUrl(job.domain, variantSlug(job.slug, src?.code))}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <CopyButton text={plain} html={html} label="Copy formatted" variant="primary" done="Formatted posting copied" />
            <CopyButton text={plain} label="Copy plain text" />
            <CopyButton text={md} label="Copy Markdown" />
            <Button size="sm" onClick={share}>Share posting link</Button>
            <Button size="sm" variant="ghost" onClick={() => setTab('posting')}>Edit posting</Button>
            {sources.length === 0 && <Button size="sm" variant="ghost" onClick={() => setTab('puzzle')}>Make a link per board</Button>}
          </div>
          {job.share_enabled && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Input readOnly mono value={links.sharePage} className="h-9 text-[13px]" onFocus={(e) => e.target.select()} />
              <Button size="sm" variant="ghost" onClick={() => patch({ share_enabled: false })}>Turn off</Button>
            </div>
          )}
          <p className="text-xs text-muted mt-3 leading-relaxed">
            The shared posting page lives on this site, so its address shows the domain. If the domain is one of your hidden pieces, post the text on job boards instead.
          </p>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <SectionTitle sub="Unique visitors at each step. Your test visits are excluded.">Funnel</SectionTitle>
          <div className="space-y-3">
            {funnel.map((f) => (
              <div key={f.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className={f.muted ? 'text-muted' : ''}>{f.label}</span>
                  <span className="font-mono">{f.v}{f.note && <span className="text-muted text-[11px] ml-1.5">({f.note})</span>}</span>
                </div>
                <div className="h-1.5 rounded-full bg-paper-2 mt-1.5 overflow-hidden">
                  <div className={cx('h-full rounded-full', f.muted ? 'bg-warn/60' : 'bg-ink')} style={{ width: `${(f.v / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-4 leading-relaxed">
            Lots of wrong tries and few arrivals means the puzzle may be too hard. Nearly no wrong tries can mean the link is being shared.
          </p>
        </Card>
        {bySource.length > 0 && (
          <Card>
            <SectionTitle sub="Unique visitors who found the page, and submissions, per link.">By job board</SectionTitle>
            <table className="w-full text-sm">
              <thead><tr className="text-[12px] text-muted text-left"><th className="font-normal pb-1.5">Link</th><th className="font-normal pb-1.5 text-right">Found</th><th className="font-normal pb-1.5 text-right">Submitted</th></tr></thead>
              <tbody>
                {bySource.map((r) => (
                  <tr key={r.key} className="border-t border-line">
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 text-right font-mono">{r.arrivals}</td>
                    <td className="py-1.5 text-right font-mono">{r.submissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <Card>
          <SectionTitle>Export</SectionTitle>
          <p className="text-sm text-muted leading-relaxed">All candidates for this job as Markdown or HTML, ready to load into an AI model for analysis.</p>
          <Button className="mt-3" size="sm" onClick={() => setExportOpen(true)}>Export candidates</Button>
        </Card>
        <Button variant="danger" size="sm" onClick={onDelete}>Delete job</Button>
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} job={job} />
    </div>
  );
}

/** Arrivals and submissions per job-board link, counted from the event log. */
function useSourceStats(job: Job) {
  const [rows, setRows] = useState<{ key: string; label: string; arrivals: number; submissions: number }[]>([]);
  const hasSources = (job.sources || []).length > 0;
  useEffect(() => {
    if (!hasSources) { setRows([]); return; }
    (async () => {
      const [{ data: ev }, { data: apps }] = await Promise.all([
        supabase.from('hiring_events').select('visitor_id, meta').eq('job_id', job.id).eq('type', 'arrival').limit(10000),
        supabase.from('hiring_applications').select('metrics').eq('job_id', job.id).limit(5000),
      ]);
      const label = (code: string) => (code ? job.sources.find((x) => x.code === code)?.label || `Old link (${code})` : 'Main link');
      const acc: Record<string, { visitors: Set<string>; submissions: number }> = {};
      const bucket = (k: string) => (acc[k] ||= { visitors: new Set(), submissions: 0 });
      for (const e of (ev || []) as { visitor_id: string; meta: Record<string, unknown> }[]) {
        if (e.meta?.preview) continue;
        bucket(String(e.meta?.source || '')).visitors.add(e.visitor_id);
      }
      for (const a of (apps || []) as { metrics: Record<string, unknown> }[]) {
        if (a.metrics?.preview) continue;
        bucket(String(a.metrics?.source || '')).submissions++;
      }
      for (const x of job.sources) bucket(x.code);
      setRows(Object.entries(acc).map(([k, v]) => ({ key: k || 'main', label: label(k), arrivals: v.visitors.size, submissions: v.submissions }))
        .sort((a, b) => b.arrivals - a.arrivals));
    })();
  }, [job.id, hasSources, job.sources]);
  return rows;
}
