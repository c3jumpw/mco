import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Application, ClientJob, Review } from '../../lib/types';
import { relTime } from '../../lib/util';
import { reviewAverage } from '../../lib/export';
import { Card, Empty, Loading, Pill, Segmented, Wordmark, cx } from '../../ui';
import { Icon, PullToRefresh, REFRESH_ICON, useRefresh } from '../chrome';
import { Flags, stageLabel, stageTone } from '../Pipeline';
import CandidateDetail from '../CandidateDetail';

type ListApp = Application & { answer_count: number; wrong_tries: number };

/** What an invited reviewer sees: only the jobs shared with them, their candidates, their own scorecard and notes. */
export default function ClientApp({ email }: { email: string }) {
  const [jobs, setJobs] = useState<ClientJob[] | null>(null);
  const { nonce, refreshing, refresh } = useRefresh();
  const loc = useLocation();

  useEffect(() => { document.title = 'apply1234 · review'; }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    supabase.rpc('hiring_review_jobs').then(({ data }) => setJobs((data || []) as ClientJob[]));
  }, [nonce]);

  return (
    <div className="min-h-dvh pb-16">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <NavLink to="/admin" className="flex items-baseline gap-2">
            <Wordmark className="text-[15px]" />
            <span className="text-[12px] text-muted">review</span>
          </NavLink>
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh data" title="Refresh data"
            className="ml-auto grid place-items-center h-9 w-9 rounded-lg text-muted hover:text-ink hover:bg-card border border-transparent hover:border-line transition disabled:opacity-100">
            <Icon d={REFRESH_ICON} className={cx('h-[18px] w-[18px]', refreshing && 'animate-spin text-accent')} />
          </button>
          <span className="text-[12px] text-muted truncate max-w-[40vw] hidden sm:block">{email}</span>
          <button className="text-[12px] text-muted hover:text-ink underline underline-offset-2" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      <PullToRefresh onRefresh={refresh} refreshing={refreshing} />
      <main key={nonce} className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        {!jobs ? <Loading /> : (
          <Routes>
            <Route index element={jobs.length === 1 ? <Navigate to={`/admin/jobs/${jobs[0].id}`} replace /> : <ClientHome jobs={jobs} />} />
            <Route path="jobs/:id" element={<ClientJobPage jobs={jobs} />} />
            <Route path="candidates/:id" element={<CandidateDetail client={jobs} />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

function ClientHome({ jobs }: { jobs: ClientJob[] }) {
  return (
    <div className="rise">
      <h1 className="font-display text-4xl sm:text-5xl leading-none">Jobs shared with you</h1>
      <p className="text-sm text-muted mt-2">Open a job to watch the candidates' answers, score them and leave notes.</p>
      {jobs.length === 0 ? (
        <Empty title="Nothing shared yet.">When someone shares a job with you, it appears here.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 mt-6">
          {jobs.map((j) => (
            <Link key={j.id} to={`/admin/jobs/${j.id}`} className="group">
              <Card className="h-full transition group-hover:border-ink/25">
                <h2 className="font-semibold">{j.title}</h2>
                <p className="text-sm text-muted mt-1">{j.candidates} candidate{j.candidates === 1 ? '' : 's'} · {j.scored_by_me} scored by you</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type Filter = 'all' | 'todo' | 'done';

function ClientJobPage({ jobs }: { jobs: ClientJob[] }) {
  const { id } = useParams();
  const job = jobs.find((j) => j.id === id);
  const [apps, setApps] = useState<ListApp[] | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!id) return;
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id || null));
    supabase.rpc('hiring_review_apps', { p_job: id }).then(async ({ data }) => {
      const list = (data || []) as ListApp[];
      setApps(list);
      if (list.length) {
        const { data: rv } = await supabase.from('hiring_reviews').select('*').in('application_id', list.map((a) => a.id));
        setReviews((rv || []) as Review[]);
      }
    });
  }, [id]);

  const mine = useMemo(() => new Map(reviews.filter((r) => r.reviewer_id === me).map((r) => [r.application_id, r])), [reviews, me]);
  const scored = (a: ListApp) => {
    const r = mine.get(a.id);
    return !!r && (r.overall != null || Object.keys(r.criteria || {}).length > 0 || Object.keys(r.scores || {}).length > 0);
  };

  if (!job) return <Navigate to="/admin" replace />;
  if (!apps) return <Loading />;
  const shown = apps.filter((a) => (filter === 'all' ? true : filter === 'todo' ? !scored(a) : scored(a)));
  const todo = apps.filter((a) => !scored(a)).length;
  const multi = jobs.length > 1;

  return (
    <div className="rise">
      {multi && <div className="text-sm text-muted mb-3"><Link to="/admin" className="hover:text-ink">Jobs</Link> / <span>{job.title}</span></div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-muted uppercase tracking-wide">
            {job.access.role === 'editor' ? 'Full access' : 'Reviewing'}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl leading-none mt-1">{job.title}</h1>
          <p className="text-sm text-muted mt-2">
            {apps.length} candidate{apps.length === 1 ? '' : 's'}{apps.length ? ` · ${apps.length - todo} scored by you` : ''}
            {job.access.shortlisted_only ? ' · shortlisted candidates only' : ''}
          </p>
        </div>
        {apps.length > 0 && (
          <Segmented value={filter} onChange={setFilter} options={[
            { id: 'all', label: 'All' },
            { id: 'todo', label: `To score${todo ? ` · ${todo}` : ''}` },
            { id: 'done', label: 'Scored' },
          ]} />
        )}
      </div>

      <div className="mt-4 rounded-xl bg-paper-2 px-4 py-3 text-sm text-ink-2 leading-relaxed">
        Open a candidate to go through their answers, fill in your scorecard and add notes. Your scores are saved as you click, and the hiring team sees them right away.
      </div>

      {apps.length === 0 ? (
        <div className="mt-6">
          <Empty title="No candidates yet.">
            {job.access.shortlisted_only
              ? 'Candidates appear here once the hiring team shortlists them.'
              : job.access.notify ? 'You’ll get an email when someone applies.' : 'Check back soon.'}
          </Empty>
        </div>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {shown.map((a) => {
            const all = reviews.filter((r) => r.application_id === a.id);
            const avg = reviewAverage(all);
            const my = mine.get(a.id);
            return (
              <li key={a.id}>
                <Link to={`/admin/candidates/${a.id}`} className="block group">
                  <Card className="transition group-hover:border-ink/25">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{a.name}</span>
                          <Pill tone={stageTone(a.stage)}>{stageLabel(a.stage)}</Pill>
                        </div>
                        <p className="text-[12px] text-muted mt-0.5">
                          Applied {relTime(a.submitted_at)} · {a.answer_count} video answer{a.answer_count === 1 ? '' : 's'}
                        </p>
                        <Flags a={a} wrong={a.wrong_tries} className="mt-2" />
                      </div>
                      <div className="text-right shrink-0">
                        {scored(a)
                          ? <p className="text-sm">You: <span className="font-mono font-medium">{my?.overall ?? '–'}/5</span></p>
                          : <Pill tone="accent">To score</Pill>}
                        <p className="text-[12px] text-muted mt-1">
                          {all.length ? `Team ★ ${avg ?? '–'} · ${all.length} scorecard${all.length === 1 ? '' : 's'}` : 'No scores yet'}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
          {shown.length === 0 && <p className="text-sm text-muted py-6 text-center">Nothing here with this filter.</p>}
        </ul>
      )}
    </div>
  );
}
