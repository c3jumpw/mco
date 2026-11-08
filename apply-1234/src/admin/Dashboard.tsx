import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Application, Dashboard as Dash, DashDay, HMessage, Job } from '../lib/types';
import { fmtDate, relTime, store } from '../lib/util';
import { getDashboard } from './data';
import { KIND_LABEL } from './Inbox';
import { Card, Pill, Segmented, cx } from '../ui';

const ACCENT = '#ff5a1f';
const CONTEXT = '#b9b3a6';
const PERIODS = [{ id: '1', label: 'Today' }, { id: '7', label: '7 days' }, { id: '30', label: '30 days' }];

type Lite = Pick<Application, 'id' | 'name' | 'job_id' | 'submitted_at' | 'flags' | 'metrics' | 'interview_at' | 'attachments'>;

export default function Dashboard({ jobs }: { jobs: Job[] }) {
  const [days, setDays] = useState(() => store('a1234_dash_days') || '7');
  const [d, setD] = useState<Dash | null>(null);
  const [failed, setFailed] = useState(false);
  const [review, setReview] = useState<Lite[]>([]);
  const [interviews, setInterviews] = useState<Lite[]>([]);
  const [messages, setMessages] = useState<HMessage[]>([]);
  const titles = Object.fromEntries(jobs.map((j) => [j.id, j.title]));

  useEffect(() => {
    store('a1234_dash_days', days);
    getDashboard(Number(days)).then((x) => { setD(x); setFailed(false); }).catch(() => setFailed(true));
  }, [days]);

  useEffect(() => {
    const cols = 'id, name, job_id, submitted_at, flags, metrics, interview_at, attachments';
    supabase.from('hiring_applications').select(cols).eq('stage', 'new').order('submitted_at', { ascending: false }).limit(5)
      .then(({ data }) => setReview((data || []) as Lite[]));
    supabase.from('hiring_applications').select(cols).gte('interview_at', new Date().toISOString()).order('interview_at').limit(5)
      .then(({ data }) => setInterviews((data || []) as Lite[]));
    supabase.from('hiring_messages').select('*').eq('status', 'new').order('created_at', { ascending: false }).limit(4)
      .then(({ data }) => setMessages((data || []) as HMessage[]));
  }, []);

  const n = Number(days);
  const prevLabel = n === 1 ? 'yesterday' : `previous ${n} days`;
  const finish = d && d.starts ? Math.min(100, Math.round((d.applicants / d.starts) * 100)) : null;

  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Overview</h1>
          <p className="text-sm text-muted mt-2">Your own test visits are left out. {d ? `Times in ${d.tz.replace(/_/g, ' ')}.` : ''}{' '}
            <Link to="/admin/guide" className="underline underline-offset-2 hover:text-ink">New here? Read the guide</Link>
          </p>
        </div>
        <Segmented value={days} onChange={setDays} options={PERIODS} />
      </div>

      {failed && <p className="text-sm text-bad mb-4">Couldn't load the numbers. Refresh to try again.</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="New applicants" value={d?.applicants} delta={d ? d.applicants - d.applicants_prev : undefined} vs={prevLabel} />
        <Tile label="Found the activity page" value={d?.arrivals} delta={d ? d.arrivals - d.arrivals_prev : undefined} vs={prevLabel}
          note={d && d.wrong_visitors ? `${d.wrong_tries} wrong-link tr${d.wrong_tries === 1 ? 'y' : 'ies'} from ${d.wrong_visitors} ${d.wrong_visitors === 1 ? 'person' : 'people'}` : undefined} />
        <Tile label="Started answering" value={d?.starts} note={finish != null ? `${finish}% went on to submit` : undefined} />
        <Tile label="Help messages" value={d?.messages_period} note={d?.messages_new ? `${d.messages_new} unread` : 'None unread'} to="/admin/inbox" attention={!!d?.messages_new} />
        <Tile label="Waiting for review" value={d?.to_review} note="All time" to="/admin/candidates" attention={!!d?.to_review} />
        <Tile label="Shortlisted" value={d?.shortlisted} note="Right now" to="/admin/candidates" />
        <Tile label="Interviews, next 7 days" value={d?.interviews_next7} />
        <Tile label="Live jobs" value={d?.live_jobs} note={`${jobs.length} in total`} />
      </div>

      {d && (
        <div className="grid gap-3 lg:grid-cols-[1fr_340px] mt-3">
          <Card>
            <DailyChart series={d.series} days={n} />
          </Card>
          <Card>
            <Funnel d={d} />
          </Card>
        </div>
      )}

      {(review.length > 0 || interviews.length > 0 || messages.length > 0) && (
        <div className="grid gap-3 md:grid-cols-3 mt-3">
          <ListCard title="Waiting for review" empty="Nobody waiting." to="/admin/candidates">
            {review.map((a) => (
              <Row key={a.id} to={`/admin/candidates/${a.id}`} title={a.name} sub={`${titles[a.job_id] || 'Job'} · ${relTime(a.submitted_at)}`}
                tags={<>
                  {a.metrics?.preview === true && <Pill>Test</Pill>}
                  {a.flags?.hidden_code_ok === false && <Pill tone="bad">No code word</Pill>}
                  {(a.attachments || []).length > 0 && <Pill>Résumé</Pill>}
                </>} />
            ))}
          </ListCard>
          <ListCard title="Upcoming interviews" empty="None booked." to="/admin/candidates">
            {interviews.map((a) => (
              <Row key={a.id} to={`/admin/candidates/${a.id}`} title={a.name} sub={`${a.interview_at ? fmtDate(a.interview_at) : ''} · ${titles[a.job_id] || ''}`} />
            ))}
          </ListCard>
          <ListCard title="Unread messages" empty="All caught up." to="/admin/inbox">
            {messages.map((m) => (
              <Row key={m.id} to="/admin/inbox" title={m.name || m.email || 'Anonymous'} sub={`${KIND_LABEL[m.kind]} · ${relTime(m.created_at)}`} />
            ))}
          </ListCard>
        </div>
      )}
    </section>
  );
}

function compact(n: number) {
  return n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : n.toLocaleString();
}

function Tile({ label, value, delta, vs, note, to, attention }:
  { label: string; value?: number; delta?: number; vs?: string; note?: string; to?: string; attention?: boolean }) {
  const body = (
    <Card className={cx('h-full transition', to && 'hover:border-ink/25')}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className={cx('text-3xl font-semibold tracking-tight mt-1.5 tabular-nums', attention && 'text-accent')}>{value == null ? '–' : compact(Number(value))}</p>
      {delta != null && (
        <p className="text-[12px] mt-1 text-muted">
          <span className={cx('font-medium', delta > 0 ? 'text-good' : delta < 0 ? 'text-bad' : 'text-muted')}>
            {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : 'No change'}
          </span>{' '}vs {vs}
        </p>
      )}
      {note && <p className="text-[12px] text-muted mt-1">{note}</p>}
    </Card>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

function dayLabel(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

function DailyChart({ series, days }: { series: DashDay[]; days: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...series.map((s) => s.applicants));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const firstInWindow = series.length - days;
  const h = hover != null ? series[hover] : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Applicants per day</p>
          <p className="text-[12px] text-muted mt-0.5">
            {days === 1 ? 'Today' : `Last ${days} days`} in orange{series.length > days ? `, the ${series.length - days} days before in gray` : ''}.
          </p>
        </div>
        <button className="text-[12px] text-muted underline underline-offset-2 hover:text-ink shrink-0" onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show numbers'}
        </button>
      </div>

      {table ? (
        <div className="mt-4 max-h-56 overflow-y-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-[12px] text-muted text-left"><tr><th className="font-normal py-1">Day</th><th className="font-normal text-right">Found page</th><th className="font-normal text-right">Started</th><th className="font-normal text-right">Applied</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[...series].reverse().map((s) => (
                <tr key={s.day}><td className="py-1.5">{dayLabel(s.day, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td className="text-right">{s.arrivals}</td><td className="text-right">{s.starts}</td><td className="text-right font-medium">{s.applicants}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 relative">
          <div className="relative h-40 ml-6">
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / max) * 100}%` }}>
                <span className="absolute -left-6 -translate-y-1/2 text-[11px] text-muted tabular-nums w-5 text-right">{t}</span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
              {series.map((s, i) => {
                const pct = (s.applicants / max) * 100;
                const inWindow = i >= firstInWindow;
                return (
                  <button key={s.day} type="button"
                    className="relative flex-1 h-full flex items-end justify-center outline-none group"
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                    aria-label={`${dayLabel(s.day)}: ${s.applicants} applicant${s.applicants === 1 ? '' : 's'}, ${s.starts} started, ${s.arrivals} found the page`}>
                    {hover === i && <span className="absolute inset-y-0 inset-x-0 bg-paper-2 rounded-sm -z-0" />}
                    <span className="relative w-full max-w-[24px] rounded-t-[4px]"
                      style={{ height: s.applicants ? `${Math.max(pct, 3)}%` : 0, background: inWindow ? ACCENT : CONTEXT }} />
                  </button>
                );
              })}
            </div>
            {h && hover != null && (
              <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-lg bg-ink text-white px-3 py-2 text-[12px] shadow-lg whitespace-nowrap"
                style={{ left: `${((hover + 0.5) / series.length) * 100}%`, transform: `translate(${hover > series.length / 2 ? '-100%' : '0'}, -100%)` }}>
                <p className="font-medium">{dayLabel(h.day, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                <p className="tabular-nums">{h.applicants} applied · {h.starts} started · {h.arrivals} found the page</p>
              </div>
            )}
          </div>
          <div className="ml-6 mt-1.5 flex justify-between text-[11px] text-muted">
            <span>{dayLabel(series[0]?.day || '')}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Funnel({ d }: { d: Dash }) {
  const steps = [
    ...(d.posting_views ? [{ label: 'Viewed the shared posting', n: d.posting_views }] : []),
    { label: 'Found the activity page', n: d.arrivals },
    { label: 'Started answering', n: d.starts },
    { label: 'Submitted', n: d.applicants },
  ];
  const top = Math.max(1, ...steps.map((s) => s.n));
  return (
    <div>
      <p className="font-semibold">From link to application</p>
      <p className="text-[12px] text-muted mt-0.5">People in this period, step by step.</p>
      <div className="mt-4 space-y-3">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].n : null;
          const rate = prev ? Math.min(100, Math.round((s.n / prev) * 100)) : null;
          return (
            <div key={s.label} title={`${s.label}: ${s.n}${rate != null ? ` (${rate}% of the step before)` : ''}`}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-ink-2">{s.label}</span>
                <span className="tabular-nums"><span className="font-medium">{s.n}</span>{rate != null && <span className="text-muted"> · {rate}%</span>}</span>
              </div>
              <div className="mt-1 h-2.5 rounded-[4px] bg-paper-2 overflow-hidden">
                <div className="h-full rounded-r-[4px]" style={{ width: `${(s.n / top) * 100}%`, background: ACCENT }} />
              </div>
            </div>
          );
        })}
      </div>
      {d.arrivals === 0 && <p className="text-[12px] text-muted mt-4">Nobody has opened an activity page in this period yet.</p>}
    </div>
  );
}

function ListCard({ title, empty, to, children }: { title: string; empty: string; to: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">{title}</p>
        <Link to={to} className="text-[12px] text-muted hover:text-ink">See all →</Link>
      </div>
      {items.length ? <ul className="mt-2 divide-y divide-line">{children}</ul> : <p className="text-sm text-muted mt-2">{empty}</p>}
    </Card>
  );
}

function Row({ to, title, sub, tags }: { to: string; title: string; sub: string; tags?: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex items-start justify-between gap-2 py-2 group">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate group-hover:underline underline-offset-2">{title}</p>
          <p className="text-[12px] text-muted truncate">{sub}</p>
        </div>
        {tags && <div className="flex gap-1 shrink-0">{tags}</div>}
      </Link>
    </li>
  );
}
