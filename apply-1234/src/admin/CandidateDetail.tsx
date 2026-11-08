import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Application, HEvent, Job, Note, Review, Stage } from '../lib/types';
import { STAGES } from '../lib/types';
import { behavior, EVENT_LABELS } from '../lib/metrics';
import { embedUrl, fetchLoomInfo, knownDuration, loomId, type LoomInfo } from '../lib/loom';
import { fmtDate, fmtDuration, fmtSpan, fromLocalInput, rangeLabel, relTime, toLocalInput } from '../lib/util';
import { reviewAverage } from '../lib/export';
import { DEFAULT_SETTINGS, fillTemplate, getApplication, getJob, updateApplication } from './data';
import { fileLink, fmtSize } from '../lib/files';
import { Button, Card, Input, Loading, Pill, SectionTitle, Select, Stars, Textarea, cx, useToast } from '../ui';
import { Flags, stageLabel, stageTone } from './Pipeline';
import ExportModal from './ExportModal';

export default function CandidateDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [app, setApp] = useState<Application | null | undefined>(undefined);
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<HEvent[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.auth.getUser().then(({ data }) => data.user && setMe({ id: data.user.id, email: data.user.email || '' }));
    getApplication(id).then(async (a) => {
      setApp(a);
      if (!a) return;
      getJob(a.job_id).then(setJob);
      supabase.from('hiring_events').select('*').eq('application_id', a.id).order('created_at').limit(2000).then(({ data }) => setEvents((data || []) as HEvent[]));
      supabase.from('hiring_reviews').select('*').eq('application_id', a.id).then(({ data }) => setReviews((data || []) as Review[]));
      supabase.from('hiring_notes').select('*').eq('application_id', a.id).order('created_at').then(({ data }) => setNotes((data || []) as Note[]));
    });
  }, [id]);

  // debounced save for application fields
  const pending = useRef<Partial<Application>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useCallback((p: Partial<Application>, now = false) => {
    if (!id) return;
    setApp((a) => (a ? { ...a, ...p } : a));
    pending.current = { ...pending.current, ...p };
    clearTimeout(timer.current);
    const run = async () => {
      const body = pending.current;
      pending.current = {};
      const err = await updateApplication(id, body);
      if (err) toast(err.message, 'bad');
    };
    if (now) run(); else timer.current = setTimeout(run, 700);
  }, [id, toast]);
  useEffect(() => () => { clearTimeout(timer.current); if (Object.keys(pending.current).length && id) updateApplication(id, pending.current); }, [id]);

  const b = useMemo(() => (app ? behavior(app, events) : null), [app, events]);

  if (app === undefined) return <Loading />;
  if (app === null) return <p className="py-10 text-muted">Candidate not found. <Link className="underline" to="/admin/candidates">Back</Link></p>;

  const first = app.name.trim().split(/\s+/)[0] || app.name;
  const settings = { ...DEFAULT_SETTINGS, ...(job?.settings || {}) };
  const vars = { first, name: app.name, role: job?.title || '', link: job?.booking_url || '[add your scheduling link on the job’s Interview tab]' };
  const mail = (subject: string, body: string) =>
    `mailto:${encodeURIComponent(app.email)}?subject=${encodeURIComponent(fillTemplate(subject, vars))}&body=${encodeURIComponent(fillTemplate(body, vars))}`;

  const addTag = (t: string) => { const v = t.trim().toLowerCase(); if (v && !app.tags.includes(v)) save({ tags: [...app.tags, v] }, true); };

  const myReview = reviews.find((r) => r.reviewer_id === me?.id);
  const avg = reviewAverage(reviews);

  return (
    <div className="rise">
      <div className="flex items-center gap-2 text-sm text-muted mb-3">
        <Link to="/admin/candidates" className="hover:text-ink">Candidates</Link><span>/</span>
        {job && <><Link to={`/admin/jobs/${job.id}?tab=candidates`} className="hover:text-ink truncate">{job.title}</Link><span>/</span></>}
        <span className="truncate">{app.name}</span>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl sm:text-5xl leading-none">{app.name}</h1>
            <Pill tone={stageTone(app.stage)}>{stageLabel(app.stage)}</Pill>
            {avg != null && <Pill tone="neutral">★ {avg}</Pill>}
          </div>
          <p className="text-sm text-muted mt-2">
            <a className="hover:text-ink underline-offset-2 hover:underline" href={`mailto:${app.email}`}>{app.email}</a> · submitted {fmtDate(app.submitted_at)}
          </p>
          <Flags a={app} wrong={b?.wrongAttempts || 0} className="mt-3" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={app.stage} onChange={(e) => save({ stage: e.target.value as Stage }, true)} className="w-auto h-10">
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
          <a href={mail(settings.invite_subject, settings.invite_body)}
            onClick={() => { if (['new', 'reviewed', 'shortlisted'].includes(app.stage)) save({ stage: 'interview' }, true); }}>
            <Button variant="primary">Invite to interview</Button>
          </a>
          <a href={mail(settings.reject_subject, settings.reject_body)} onClick={() => save({ stage: 'rejected' }, true)}>
            <Button>Reject</Button>
          </a>
          <Button onClick={() => setExportOpen(true)}>Export</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5 min-w-0">
          {(job?.questions.length ? app.answers : app.answers).map((ans, i) => (
            <AnswerCard key={ans.question_id + i} n={i + 1} ans={ans} job={job}
              score={myReview?.scores?.[ans.question_id]}
              onScore={(v) => upsertReview(me, app.id, myReview, { scores: { ...(myReview?.scores || {}), [ans.question_id]: v } }, setReviews, toast)} />
          ))}

          {((app.attachments || []).length > 0 || (app.cover_letter || '').trim()) && <ExtrasCard app={app} />}

          <Card>
            <SectionTitle sub="Shared with everyone on the hiring team.">Notes</SectionTitle>
            <NotesPanel appId={app.id} notes={notes} setNotes={setNotes} />
          </Card>

          <Card>
            <SectionTitle sub={job?.booking_url ? undefined : 'Add a scheduling link on the job’s Interview tab to include it in invites.'}>Interview</SectionTitle>
            <InterviewPanel app={app} job={job} save={save} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Your review</SectionTitle>
            <div className="space-y-3">
              {(job?.rubric || []).map((c) => (
                <div key={c} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{c}</span>
                  <Stars size="sm" value={myReview?.criteria?.[c]}
                    onChange={(v) => upsertReview(me, app.id, myReview, { criteria: { ...(myReview?.criteria || {}), [c]: v } }, setReviews, toast)} />
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
                <span className="text-sm font-semibold">Overall</span>
                <Stars value={myReview?.overall}
                  onChange={(v) => upsertReview(me, app.id, myReview, { overall: v || null }, setReviews, toast)} />
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {([['strong_yes', 'Strong yes'], ['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => upsertReview(me, app.id, myReview, { recommendation: myReview?.recommendation === k ? null : k }, setReviews, toast)}
                    className={cx('h-9 rounded-lg border text-[12px] font-medium transition',
                      myReview?.recommendation === k ? (k === 'no' ? 'bg-bad text-white border-bad' : k === 'maybe' ? 'bg-warn text-white border-warn' : 'bg-good text-white border-good') : 'bg-card border-line hover:border-ink/30')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {reviews.filter((r) => r.reviewer_id !== me?.id).length > 0 && (
              <div className="mt-4 pt-4 border-t border-line space-y-1.5">
                <p className="text-[12px] text-muted">Other reviewers</p>
                {reviews.filter((r) => r.reviewer_id !== me?.id).map((r) => (
                  <p key={r.id} className="text-sm flex justify-between gap-2"><span className="truncate">{r.reviewer_email}</span>
                    <span className="font-mono">{r.overall ?? '—'}/5 {r.recommendation ? `· ${r.recommendation.replace('_', ' ')}` : ''}</span></p>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Tags</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {app.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-paper-2 pl-3 pr-1.5 py-1 text-sm">
                  {t}<button className="h-5 w-5 rounded-full hover:bg-line text-muted" onClick={() => save({ tags: app.tags.filter((x) => x !== t) }, true)}>×</button>
                </span>
              ))}
            </div>
            <form className="mt-3" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem('tag') as HTMLInputElement; addTag(f.value); f.value = ''; }}>
              <Input name="tag" placeholder="Add a tag and press Enter" className="h-9 text-sm" />
            </form>
          </Card>

          {b && (
            <Card>
              <SectionTitle sub="How they got here and how they worked.">Behavior</SectionTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Metric k="Wrong link tries" v={String(b.wrongAttempts)} tone={b.wrongAttempts === 0 ? 'good' : b.wrongAttempts > 5 ? 'warn' : undefined} />
                <Metric k="Page visits" v={String(b.arrivals || 1)} />
                <Metric k="Arrival → submit" v={fmtSpan(b.arrivalToSubmitMs)} />
                <Metric k="Answering time" v={fmtSpan(b.formMs)} />
                <Metric k="On setup steps" v={fmtSpan(b.instructionsMs)} />
                <Metric k="Active on page" v={b.activeSeconds != null ? fmtSpan(b.activeSeconds * 1000) : '—'} />
                <Metric k="Switched away" v={`${b.tabSwitches}×`} />
                <Metric k="Failed link checks" v={String(b.invalidLinks)} />
                <Metric k="Came from" v={String((app.metrics as any)?.source_label || 'Main link')} />
                <Metric k="Referrer" v={b.referrer || '—'} />
                <Metric k="Time zone" v={b.tz || '—'} />
                <Metric k="Device" v={b.device || '—'} />
              </dl>
              {b.wrongPaths.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12px] text-muted mb-1.5">Links they tried</p>
                  <div className="flex flex-wrap gap-1.5">
                    {b.wrongPaths.map((w, i) => <span key={i} className="font-mono text-[12px] bg-paper-2 rounded px-1.5 py-0.5" title={fmtDate(w.at)}>/{w.path}</span>)}
                  </div>
                </div>
              )}
              <details className="mt-4 group">
                <summary className="text-sm cursor-pointer text-muted hover:text-ink">Full timeline ({events.length} events)</summary>
                <ol className="mt-3 space-y-2 border-l border-line pl-4">
                  {events.map((e) => (
                    <li key={e.id} className="text-[13px]">
                      <span className="text-muted font-mono text-[11px] block">{fmtDate(e.created_at)}</span>
                      {EVENT_LABELS[e.type] || e.type}
                      {e.type === 'wrong_url' && <span className="font-mono text-muted"> /{e.path}</span>}
                      {e.type === 'tab_return' && typeof e.meta?.away_ms === 'number' && <span className="text-muted"> after {fmtSpan(e.meta.away_ms as number)}</span>}
                    </li>
                  ))}
                </ol>
              </details>
            </Card>
          )}

          <Button variant="danger" size="sm" onClick={async () => {
            if (!confirm(`Delete ${app.name}'s submission, notes and reviews? This can't be undone.`)) return;
            await supabase.from('hiring_applications').delete().eq('id', app.id);
            nav('/admin/candidates');
          }}>Delete candidate</Button>
        </div>
      </div>
      {job && <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} job={job} appIds={[app.id]} />}
    </div>
  );
}

async function upsertReview(
  me: { id: string; email: string } | null, appId: string, existing: Review | undefined,
  patch: Partial<Review>, setReviews: React.Dispatch<React.SetStateAction<Review[]>>, toast: (m: string, t?: 'good' | 'bad') => void,
) {
  if (!me) return;
  const row = {
    application_id: appId,
    reviewer_id: me.id,
    reviewer_email: me.email.toLowerCase(),
    scores: existing?.scores || {},
    criteria: existing?.criteria || {},
    overall: existing?.overall ?? null,
    recommendation: existing?.recommendation ?? null,
    ...patch,
  };
  setReviews((rs) => {
    const others = rs.filter((r) => !(r.application_id === appId && r.reviewer_id === me.id));
    return [...others, { ...(existing || ({} as Review)), ...row } as Review];
  });
  const { data, error } = await supabase.from('hiring_reviews').upsert(row, { onConflict: 'application_id,reviewer_id' }).select('*').single();
  if (error) toast(error.message, 'bad');
  else setReviews((rs) => rs.map((r) => (r.application_id === appId && r.reviewer_id === me.id ? (data as Review) : r)));
}

function Metric({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className={cx('font-medium truncate', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn')} title={v}>{v}</dd>
    </div>
  );
}

function AnswerCard({ n, ans, job, score, onScore }:
  { n: number; ans: Application['answers'][number]; job: Job | null; score?: number; onScore: (v: number) => void }) {
  const [live, setLive] = useState<LoomInfo | null>(null);
  const [showTx, setShowTx] = useState(false);
  const id = ans.loom_id || loomId(ans.url);
  useEffect(() => { if (id) fetchLoomInfo(ans.url).then(setLive); }, [ans.url, id]);
  const a = job?.activity || {};
  const dur = knownDuration(live) ?? (ans.duration_sec && ans.duration_sec >= 1 ? ans.duration_sec : null);
  const out = dur != null && ((a.answer_min && dur < a.answer_min) || (a.answer_max && dur > a.answer_max));

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <p className="font-mono text-[12px] text-muted">QUESTION {n}</p>
        <p className="font-medium leading-snug mt-1">{ans.question}</p>
      </div>
      {id ? (
        <div className="aspect-video bg-ink">
          <iframe src={embedUrl(id)} className="w-full h-full" allow="fullscreen; picture-in-picture" allowFullScreen loading="lazy" title={`Answer ${n}`} />
        </div>
      ) : (
        <div className="mx-4 sm:mx-5 rounded-xl bg-warn-soft text-warn text-sm px-4 py-3">Not a Loom link, so it can’t be embedded. Open it below.</div>
      )}
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a href={ans.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] text-muted hover:text-ink truncate max-w-full">{ans.url}</a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={dur == null ? 'neutral' : out ? 'warn' : 'good'}>{fmtDuration(dur)}{rangeLabel(a.answer_min, a.answer_max) ? ` · asked ${rangeLabel(a.answer_min, a.answer_max)}` : ''}</Pill>
          {(live?.title || ans.title) && <Pill tone="neutral">“{live?.title || ans.title}”</Pill>}
          {live && !live.ok && live.reason !== 'not_loom' && <Pill tone="bad">Video is private or removed</Pill>}
          {live?.ok && dur == null && <Pill tone="neutral">Length not available yet</Pill>}
          {a.hidden_code && (live?.title || ans.title) && (
            (live?.title || ans.title || '').toLowerCase().includes(a.hidden_code.toLowerCase())
              ? <Pill tone="good">Code word ✓</Pill> : <Pill tone="bad">No code word</Pill>
          )}
        </div>
        {ans.transcript && (
          <div>
            <button className="text-sm text-muted hover:text-ink" onClick={() => setShowTx(!showTx)}>{showTx ? 'Hide' : 'Show'} transcript</button>
            {showTx && <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap bg-paper rounded-xl p-3 max-h-80 overflow-auto">{ans.transcript}</p>}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
          <span className="text-sm text-muted">Your score</span>
          <Stars size="sm" value={score} onChange={onScore} />
        </div>
      </div>
    </Card>
  );
}

function NotesPanel({ appId, notes, setNotes }: { appId: string; notes: Note[]; setNotes: React.Dispatch<React.SetStateAction<Note[]>> }) {
  const [body, setBody] = useState('');
  const toast = useToast();
  const add = async () => {
    const text = body.trim();
    if (!text) return;
    const { data, error } = await supabase.from('hiring_notes').insert({ application_id: appId, body: text, kind: 'note' }).select('*').single();
    if (error) toast(error.message, 'bad');
    else { setNotes((n) => [...n, data as Note]); setBody(''); }
  };
  return (
    <div>
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl bg-paper px-3 py-2.5">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{n.body}</p>
            <p className="text-[11px] text-muted mt-1.5 flex justify-between gap-2">
              <span>{n.author_email}{n.kind === 'interview' ? ' · interview' : ''} · {relTime(n.created_at)}</span>
              <button className="hover:text-bad" onClick={async () => {
                if (!confirm('Delete this note?')) return;
                await supabase.from('hiring_notes').delete().eq('id', n.id);
                setNotes((ns) => ns.filter((x) => x.id !== n.id));
              }}>Delete</button>
            </p>
          </li>
        ))}
      </ul>
      <Textarea rows={2} className={notes.length ? 'mt-3' : ''} placeholder="Add a note…" value={body} onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} />
      <div className="flex justify-end mt-2"><Button size="sm" variant="primary" disabled={!body.trim()} onClick={add}>Add note</Button></div>
    </div>
  );
}

function InterviewPanel({ app, job, save }: { app: Application; job: Job | null; save: (p: Partial<Application>, now?: boolean) => void }) {
  const ia = app.interview_answers || {};
  const qs = job?.interview_questions || [];
  const setQ = (qid: string, p: { notes?: string; score?: number }) => save({ interview_answers: { ...ia, [qid]: { ...ia[qid], ...p } } });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Scheduled for</span>
        <Input type="datetime-local" className="w-auto h-9 text-sm" value={toLocalInput(app.interview_at)}
          onChange={(e) => save({ interview_at: fromLocalInput(e.target.value) || null }, true)} />
      </div>
      {qs.length === 0 && <p className="text-sm text-muted">Add interview questions on the job’s Interview tab to get a scorecard here.</p>}
      {qs.map((q, i) => (
        <div key={q.id} className="rounded-xl border border-line p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-snug"><span className="font-mono text-muted mr-1.5">{i + 1}</span>{q.text}</p>
            <Pill tone={q.kind === 'general' ? 'neutral' : 'accent'}>{q.kind}</Pill>
          </div>
          <Textarea rows={2} className="mt-2 text-sm" placeholder="What they said…" value={ia[q.id]?.notes || ''} onChange={(e) => setQ(q.id, { notes: e.target.value })} />
          <div className="mt-2 flex justify-end"><Stars size="sm" value={ia[q.id]?.score} onChange={(v) => setQ(q.id, { score: v })} /></div>
        </div>
      ))}
      <div>
        <p className="text-sm font-medium mb-1.5">Summary</p>
        <Textarea rows={3} placeholder="Overall impression, concerns, next step…" value={app.interview_summary} onChange={(e) => save({ interview_summary: e.target.value })} />
      </div>
    </div>
  );
}

function ExtrasCard({ app }: { app: Application }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const files = app.attachments || [];
  const open = async (path: string, name: string, download = false) => {
    setBusy(path);
    try {
      const url = await fileLink(path, download ? name : undefined);
      window.open(url, '_blank', 'noopener');
    } catch (e: any) {
      toast(e?.message || 'Could not open the file', 'bad');
    }
    setBusy('');
  };
  const label = { resume: 'Résumé', cover_letter: 'Cover letter', other: 'File' } as const;
  return (
    <Card>
      <SectionTitle sub="Optional extras the candidate added. Links to files expire after 10 minutes.">Résumé and cover letter</SectionTitle>
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.path} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <span className="grid place-items-center h-9 w-8 rounded-md bg-accent-soft text-accent text-[10px] font-bold uppercase">{f.name.split('.').pop()}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{label[f.kind] || 'File'}</p>
                <p className="text-[12px] text-muted truncate">{f.name} · {fmtSize(f.size || 0)}</p>
              </div>
              <Button size="sm" disabled={busy === f.path} onClick={() => open(f.path, f.name)}>Open</Button>
              <Button size="sm" variant="ghost" disabled={busy === f.path} onClick={() => open(f.path, f.name, true)}>Download</Button>
            </li>
          ))}
        </ul>
      )}
      {(app.cover_letter || '').trim() && (
        <div className={cx(files.length > 0 && 'mt-4')}>
          <p className="text-[12px] text-muted mb-1.5">Cover letter, written in the form</p>
          <div className="rounded-xl bg-paper-2 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">{app.cover_letter}</div>
        </div>
      )}
    </Card>
  );
}
