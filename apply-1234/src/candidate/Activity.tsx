import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Activity as ActivityT, Question } from '../lib/types';
import { fetchLoomInfo, knownDuration, loomId, looksLikeUrl, type LoomInfo } from '../lib/loom';
import SetupStep from './SetupArt';
import HelpButton from './HelpButton';
import { ACCEPT, fileProblem, fmtSize, notify, uploadFile, type UploadedFile } from '../lib/files';
import { fmtDate, fmtDuration, isPreviewBrowser, rangeLabel, storeJson, visitorId } from '../lib/util';
import { mdToHtml } from '../lib/posting';
import { Button, Field, Input, Spinner, Textarea, Wordmark, cx } from '../ui';

type Step = 0 | 1 | 2 | 3 | 4;
interface AnswerDraft { url: string; transcript: string; info?: LoomInfo | null; checking?: boolean }
interface Draft {
  step: Step;
  name: string;
  email: string;
  consent: boolean;
  ready: boolean;
  answers: Record<string, AnswerDraft>;
  activeSeconds: number;
  visits: number;
  firstArrival: string;
  submittedAt?: string;
  coverLetter?: string;
  files?: UploadedFile[];
  confirmTo?: string;
}

const STEP_LABELS = ['Welcome', 'Set up', 'Answers', 'Submit'];

export default function Activity({ jobId, title, activity, questions, source }:
  { jobId: string; title: string; activity: ActivityT; questions: Question[]; source?: { code: string; label: string } | null }) {
  const key = `a1234_draft_${jobId}`;
  const vid = useMemo(() => visitorId(), []);
  const preview = useMemo(() => isPreviewBrowser(), []);
  const restored = useRef(false);

  const [d, setD] = useState<Draft>(() => {
    const saved = storeJson<Draft>(key);
    if (saved) {
      restored.current = saved.step > 0 && !saved.submittedAt;
      return { ...saved, visits: (saved.visits || 1) + 1, answers: Object.fromEntries(Object.entries(saved.answers || {}).map(([k, v]) => [k, { ...v, checking: false }])) };
    }
    return { step: 0, name: '', email: '', consent: false, ready: false, answers: {}, activeSeconds: 0, visits: 1, firstArrival: new Date().toISOString() };
  });
  const dRef = useRef(d);
  dRef.current = d;

  const set = useCallback((patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    setD((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      storeJson(key, next);
      return next;
    });
  }, [key]);

  // ── tracking ──
  const sent = useRef(new Set<string>());
  const track = useCallback((type: string, meta: Record<string, unknown> = {}, onceKey?: string) => {
    if (onceKey) {
      if (sent.current.has(onceKey)) return;
      sent.current.add(onceKey);
    }
    supabase.rpc('hiring_track', { p_job: jobId, p_visitor: vid, p_type: type, p_meta: { ...meta, preview, ...(source ? { source: source.code } : {}) } }).then(() => {});
  }, [jobId, vid, preview, source]);

  useEffect(() => {
    if (restored.current) track('draft_restored', { step: dRef.current.step }, 'restored');
  }, [track]);

  // active time while the page is visible
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && dRef.current.step < 4) {
        set((p) => ({ activeSeconds: (p.activeSeconds || 0) + 5 }));
      }
    }, 5000);
    return () => clearInterval(t);
  }, [set]);

  // switching away (only once the activity is underway)
  useEffect(() => {
    let hiddenAt = 0;
    let lastLog = 0;
    const h = () => {
      const step = dRef.current.step;
      if (step < 1 || step > 3) return;
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        if (Date.now() - lastLog > 8000) { lastLog = Date.now(); track('tab_hidden', { step }); }
      } else if (hiddenAt) {
        const away = Date.now() - hiddenAt;
        hiddenAt = 0;
        if (away > 3000) track('tab_return', { step, away_ms: away });
      }
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [track]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [d.step]);

  const go = (step: Step) => {
    if (step === 1) track('instructions_view', {}, 'instructions_view');
    if (step === 2) { track('instructions_done', {}, 'instructions_done'); track('form_start', {}, 'form_start'); }
    set({ step });
  };

  // ── answers ──
  // A link pasted right after recording reports 0:00 while Loom processes it, so we re-check a few times.
  const retries = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const checkLink = useCallback(async (qid: string, url: string, attempt = 0) => {
    const u = url.trim();
    clearTimeout(retries.current[qid]);
    if (!u) return;
    if (!looksLikeUrl(u)) {
      set((p) => ({ answers: { ...p.answers, [qid]: { ...p.answers[qid], info: { ok: false, reason: 'not_loom' }, checking: false } } }));
      track('link_invalid', { question_id: qid, reason: 'not_url' });
      return;
    }
    if (attempt === 0) set((p) => ({ answers: { ...p.answers, [qid]: { ...p.answers[qid], checking: true } } }));
    const info = loomId(u) ? await fetchLoomInfo(u, attempt > 0) : ({ ok: false, reason: 'not_loom' } as LoomInfo);
    let still = false;
    set((p) => {
      still = (p.answers[qid]?.url || '').trim() === u;
      return still ? { answers: { ...p.answers, [qid]: { ...p.answers[qid], info, checking: false } } } : {};
    });
    if (info.ok && knownDuration(info) === null && attempt < 2) {
      retries.current[qid] = setTimeout(() => {
        if ((dRef.current.answers[qid]?.url || '').trim() === u) checkLinkRef.current(qid, u, attempt + 1);
      }, 15000 + attempt * 15000);
    }
    if (attempt > 0) return;
    if (info.ok) track('link_added', { question_id: qid, duration: knownDuration(info) });
    else track('link_invalid', { question_id: qid, reason: info.reason });
  }, [set, track]);
  const checkLinkRef = useRef(checkLink);
  checkLinkRef.current = checkLink;

  // Re-check saved links whose length wasn't known yet (e.g. the candidate came back later).
  useEffect(() => {
    for (const [qid, a] of Object.entries(dRef.current.answers)) {
      if (a.url?.trim() && loomId(a.url) && knownDuration(a.info) === null) checkLinkRef.current(qid, a.url, 1);
    }
    const timers = retries.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const answer = (qid: string) => d.answers[qid] || { url: '', transcript: '' };
  const allLinked = questions.every((q) => looksLikeUrl(answer(q.id).url));
  const needsTranscript = !!activity.require_transcript;
  const allTranscripts = !needsTranscript || questions.every((q) => (answer(q.id).transcript || '').trim().length >= 20);
  const stillNeeded: string[] = [];
  questions.forEach((q, i) => {
    const a = answer(q.id);
    if (!a.url.trim()) stillNeeded.push(`a video link for question ${i + 1}`);
    else if (!looksLikeUrl(a.url)) stillNeeded.push(`a full link (starting with https://) for question ${i + 1}`);
    if (needsTranscript && (a.transcript || '').trim().length < 20) stillNeeded.push(`the transcript for question ${i + 1}`);
  });

  // ── submit ──
  const submitMissing = [
    ...(d.name.trim().length < 2 ? ['your full name'] : []),
    ...(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()) ? ['a valid email'] : []),
    ...(activity.consent_text && !d.consent ? ['a tick in the consent box'] : []),
  ];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    track('submit_attempt');
    setBusy(true);
    const payload = questions.map((q) => {
      const a = answer(q.id);
      return {
        question_id: q.id,
        url: a.url.trim(),
        loom_id: loomId(a.url) || '',
        title: a.info?.ok ? a.info.title || '' : '',
        duration_sec: knownDuration(a.info),
        transcript: a.transcript || '',
      };
    });
    const { data, error } = await supabase.rpc('hiring_submit', {
      p_job: jobId, p_visitor: vid, p_name: d.name, p_email: d.email, p_answers: payload, p_consent: d.consent,
      p_meta: {
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ua: navigator.userAgent.slice(0, 300),
        lang: navigator.language,
        screen: `${window.screen.width}x${window.screen.height}`,
        active_seconds: d.activeSeconds,
        visits: d.visits,
        first_arrival_local: d.firstArrival,
        preview,
        ...(source ? { source: source.code, source_label: source.label } : {}),
      },
    });
    const res = data as { ok: boolean; id?: string; error?: string } | null;
    if (error || !res?.ok) {
      setBusy(false);
      const code = res?.error || 'network';
      track('submit_error', { code });
      setErr({
        closed: 'This activity has closed and is no longer accepting submissions.',
        name: 'Please enter your full name.',
        email: 'Please enter a valid email address.',
        consent: 'Please tick the consent box to submit.',
        answer_missing: 'Every question needs a video link before you can submit.',
        answers: 'Something is missing from your answers. Please check each question.',
      }[code] || 'We couldn’t submit right now. Check your connection and try again. Your answers are saved on this device.');
      return;
    }
    const appId = res.id;
    const files = d.files || [];
    const cover = (d.coverLetter || '').trim();
    if (appId && (files.length || cover)) {
      await supabase.rpc('hiring_attach', { p_app: appId, p_visitor: vid, p_cover: cover, p_files: files }).then(() => {}, () => {});
    }
    setBusy(false);
    set({ step: 4, submittedAt: new Date().toISOString(), confirmTo: undefined });
    if (appId) {
      notify({ application_id: appId, visitor_id: vid }).then((r) => {
        if (r?.results?.candidate?.ok) set({ confirmTo: d.email.trim() });
      });
    }
  };

  const range = rangeLabel(activity.answer_min, activity.answer_max);
  const steps = (activity.loom_steps || '').split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line/70">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <Wordmark className="text-[15px]" />
          {d.step < 4 && (
            <ol className="flex items-center gap-1.5" aria-label="Progress">
              {STEP_LABELS.map((l, i) => (
                <li key={l} className="flex items-center gap-1.5">
                  <span className={cx('h-1.5 rounded-full transition-all', i < d.step ? 'w-5 bg-ink' : i === d.step ? 'w-8 bg-accent' : 'w-5 bg-line')} />
                  <span className="sr-only">{l}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </header>
      {preview && (
        <div className="bg-ink text-white text-center text-xs py-1.5">Preview: you're signed in as an admin on this browser, so this visit is marked as a test.</div>
      )}

      <main className="max-w-2xl mx-auto px-5 pb-24">
        {d.step === 0 && (
          <section className="pt-14 sm:pt-20 rise">
            <p className="text-[13px] font-medium text-muted uppercase tracking-[.12em]">{title}</p>
            <h1 className="font-display text-[56px] sm:text-[80px] leading-[.95] mt-4">{activity.headline || 'You found it.'}</h1>
            {activity.intro && <p className="text-lg text-ink-2 leading-relaxed mt-6 max-w-xl">{activity.intro}</p>}
            <div className="mt-10 grid gap-px bg-line rounded-2xl overflow-hidden border border-line">
              <Fact k="Questions" v={`${questions.length} short video answer${questions.length === 1 ? '' : 's'}`} />
              {range && <Fact k="Length" v={`${range} per answer`} />}
              <Fact k="Tool" v="Loom (free) for recording" />
              {activity.deadline && <Fact k="Deadline" v={fmtDate(activity.deadline)} />}
            </div>
            <div className="mt-10 flex items-center gap-4">
              <Button variant="primary" size="lg" onClick={() => go(1)}>Begin</Button>
              {d.visits > 1 && <span className="text-sm text-muted">Welcome back. Your progress is saved on this device.</span>}
            </div>
          </section>
        )}

        {d.step === 1 && (
          <section className="pt-12 rise">
            <StepLabel n={1} label="Set up" />
            <h2 className="font-display text-5xl leading-none mt-3">Get Loom ready.</h2>
            <p className="text-ink-2 leading-relaxed mt-4">
              You'll answer each question on video using Loom, a free screen and camera recorder. Learning a new tool
              quickly is part of this activity.
            </p>
            <ol className="mt-8 space-y-3">
              {steps.map((s, i) => <SetupStep key={i} n={i + 1} text={s} />)}
            </ol>
            <div className="mt-6">
              <a href="https://www.loom.com/download" target="_blank" rel="noopener noreferrer"
                onClick={() => track('loom_link_click', {}, 'loom')}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-card border border-line font-medium text-sm hover:border-ink/30">
                Get Loom <span aria-hidden>↗</span>
              </a>
            </div>
            {range && (
              <div className="mt-8 rounded-2xl bg-accent-soft/60 border border-accent/20 p-5">
                <p className="text-[13px] font-semibold text-accent uppercase tracking-wide">Answer length</p>
                <p className="mt-1 text-lg">Keep each answer to <strong>{range}</strong>.</p>
                {activity.answer_max && activity.answer_max > 300 && (
                  <p className="text-sm text-ink-2 mt-1">Loom's free plan stops recordings at 5 minutes.</p>
                )}
              </div>
            )}
            {activity.extra && (
              <div className="prose-posting mt-8" dangerouslySetInnerHTML={{ __html: mdToHtml(activity.extra) }} />
            )}
            <label className="mt-10 flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-ink" checked={d.ready} onChange={(e) => set({ ready: e.target.checked })} />
              <span className="leading-relaxed">Loom is installed, I'm signed in, and I've read the instructions above.</span>
            </label>
            <div className="mt-6 flex gap-3">
              <Button variant="ghost" onClick={() => go(0)}>Back</Button>
              <Button variant="primary" size="lg" disabled={!d.ready} onClick={() => go(2)}>Continue to questions</Button>
            </div>
          </section>
        )}

        {d.step === 2 && (
          <section className="pt-12 rise">
            <StepLabel n={2} label="Answers" />
            <h2 className="font-display text-5xl leading-none mt-3">Record your answers.</h2>
            <p className="text-ink-2 leading-relaxed mt-4">
              Record one Loom per question{range ? `, ${range} each` : ''}. Paste each share link in its box. We check the link as you go.
            </p>
            <div className="mt-8 space-y-5">
              {questions.map((q, i) => {
                const a = answer(q.id);
                return (
                  <div key={q.id} className="rounded-2xl bg-card border border-line p-5 sm:p-6"
                    onFocusCapture={() => track('question_focus', { question_id: q.id }, `qf_${q.id}`)}>
                    <p className="text-[12px] font-mono text-muted">QUESTION {i + 1} OF {questions.length}</p>
                    <p className="text-[19px] leading-snug font-medium mt-2">{q.text}</p>
                    {q.guidance && <p className="text-sm text-muted mt-2 leading-relaxed">{q.guidance}</p>}
                    <div className="mt-4">
                      <Input inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://www.loom.com/share/…" mono
                        value={a.url}
                        onChange={(e) => set((p) => ({ answers: { ...p.answers, [q.id]: { ...a, url: e.target.value, info: null } } }))}
                        onBlur={(e) => checkLink(q.id, e.target.value)}
                        onPaste={(e) => { const v = e.clipboardData.getData('text'); setTimeout(() => checkLink(q.id, v), 0); }} />
                      <LinkStatus a={a} min={activity.answer_min} max={activity.answer_max} range={range} />
                    </div>
                    {needsTranscript && (
                      <div className="mt-4">
                        <Field label="Transcript" hint="In Loom, open the video, click Transcript, copy all of the text and paste it here.">
                          <Textarea rows={3} value={a.transcript}
                            onChange={(e) => set((p) => ({ answers: { ...p.answers, [q.id]: { ...a, transcript: e.target.value } } }))}
                            onBlur={(e) => e.target.value.trim().length >= 20 && track('transcript_added', { question_id: q.id }, `tx_${q.id}`)} />
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="ghost" onClick={() => go(1)}>Back</Button>
              <Button variant="primary" size="lg" disabled={!allLinked || !allTranscripts} onClick={() => go(3)}>Continue</Button>
            </div>
            {stillNeeded.length > 0 && (
              <div className="mt-3 rounded-xl bg-paper-2 px-4 py-3 text-sm">
                <p className="font-medium">To continue, add:</p>
                <ul className="mt-1 list-disc pl-5 text-ink-2 space-y-0.5">{stillNeeded.slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="text-xs text-muted mt-2">Video length is only a guideline. It never stops you from submitting.</p>
              </div>
            )}
          </section>
        )}

        {d.step === 3 && (
          <section className="pt-12 rise">
            <StepLabel n={3} label="Submit" />
            <h2 className="font-display text-5xl leading-none mt-3">Last step.</h2>
            <div className="mt-8 grid gap-4">
              <Field label="Full name"><Input autoComplete="name" value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" autoComplete="email" inputMode="email" value={d.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            </div>
            <div className="mt-8 rounded-2xl border border-line bg-card divide-y divide-line">
              {questions.map((q, i) => {
                const a = answer(q.id);
                return (
                  <div key={q.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[12px] font-mono text-muted">Q{i + 1}</p>
                      <p className="text-sm leading-snug mt-0.5 line-clamp-2">{q.text}</p>
                      <p className="font-mono text-[12px] text-muted truncate mt-1">{a.url}</p>
                    </div>
                    <span className="text-sm font-mono shrink-0">{knownDuration(a.info) != null ? fmtDuration(knownDuration(a.info)) : ''}</span>
                  </div>
                );
              })}
            </div>
            <Extras jobId={jobId} visitor={vid} files={d.files || []} cover={d.coverLetter || ''}
              onFiles={(files) => set({ files })} onCover={(coverLetter) => set({ coverLetter })} track={track} />
            {activity.consent_text && (
              <label className="mt-6 flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-ink" checked={d.consent} onChange={(e) => set({ consent: e.target.checked })} />
                <span className="text-sm leading-relaxed text-ink-2">{activity.consent_text}</span>
              </label>
            )}
            {err && <p className="mt-5 rounded-xl bg-bad-soft text-bad text-sm px-4 py-3">{err}</p>}
            <div className="mt-8 flex gap-3">
              <Button variant="ghost" onClick={() => go(2)}>Back</Button>
              <Button variant="accent" size="lg" disabled={busy || submitMissing.length > 0} onClick={submit}>
                {busy ? <><Spinner /> Submitting</> : 'Submit application'}
              </Button>
            </div>
            {submitMissing.length > 0 && !busy && (
              <p className="mt-3 text-sm text-muted">To submit, add {submitMissing.join(', ').replace(/, ([^,]*)$/, ' and $1')}.</p>
            )}
          </section>
        )}

        {d.step === 4 && (
          <section className="pt-20 sm:pt-28 rise">
            <p className="font-mono text-sm text-good">✓ Received{d.submittedAt ? ` · ${fmtDate(d.submittedAt)}` : ''}</p>
            <h1 className="font-display text-[56px] sm:text-[76px] leading-[.95] mt-4">Thank you{d.name ? `, ${d.name.trim().split(/\s+/)[0]}` : ''}.</h1>
            <p className="text-lg text-ink-2 leading-relaxed mt-6 max-w-xl">
              Your answers for the {title} role are in. We review every submission and will reply by email.
            </p>
            {d.confirmTo && <p className="text-sm text-muted mt-3">We sent a confirmation to <span className="text-ink-2">{d.confirmTo}</span>. If it's not there in a few minutes, check your spam folder.</p>}
            <button className="mt-10 text-sm text-muted underline underline-offset-4"
              onClick={() => set({ step: 3, submittedAt: undefined })}>
              Need to fix something? You can submit again.
            </button>
          </section>
        )}

        {activity.accommodations_email && d.step < 4 && (
          <p className="mt-16 text-sm text-muted leading-relaxed">
            Need an accommodation or a different way to complete this activity? Email{' '}
            <a className="underline" href={`mailto:${activity.accommodations_email}`}>{activity.accommodations_email}</a>.
          </p>
        )}
      </main>
      <HelpButton jobId={jobId} visitor={vid} step={STEP_LABELS[Math.min(d.step, 3)] + (d.step === 4 ? ' (after submitting)' : '')}
        name={d.name} email={d.email} lastError={err} preview={preview} />
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-card px-5 py-4 flex items-baseline justify-between gap-4">
      <span className="text-[13px] text-muted">{k}</span>
      <span className="text-[15px] font-medium text-right">{v}</span>
    </div>
  );
}

function StepLabel({ n, label }: { n: number; label: string }) {
  return <p className="text-[12px] font-mono text-muted tracking-wide">STEP {n} OF 3 · {label.toUpperCase()}</p>;
}

function LinkStatus({ a, min, max, range }: { a: AnswerDraft; min?: number | null; max?: number | null; range: string }) {
  if (!a.url.trim()) return null;
  if (a.checking) return <p className="mt-2 text-sm text-muted flex items-center gap-2"><Spinner className="h-3 w-3" /> Checking link…</p>;
  const info = a.info;
  if (!info) return null;
  if (info.ok) {
    const d = knownDuration(info);
    const out = d != null && ((min && d < min) || (max && d > max));
    return (
      <div className="mt-2 text-sm">
        <p className="text-good">✓ {info.title ? `“${info.title}”` : 'Loom video found'}{d != null ? ` · ${fmtDuration(d)}` : ''}</p>
        {out && <p className="text-muted mt-1">Loom says this video is {fmtDuration(d)}. The suggested length is {range}, but that's only a guide.</p>}
      </div>
    );
  }
  if (info.reason === 'not_loom')
    return <p className="mt-2 text-sm text-warn">{looksLikeUrl(a.url) ? 'This doesn’t look like a Loom share link (loom.com/share/…). Check that you copied the right link.' : 'Paste the full link, starting with https://'}</p>;
  if (info.reason === 'private_or_unavailable' || info.reason === 'not_found')
    return <p className="mt-2 text-sm text-warn">We couldn’t open this video. In Loom, set sharing to “Anyone with the link”, then paste it again.</p>;
  return <p className="mt-2 text-sm text-muted">Link saved. We couldn’t verify it right now.</p>;
}

function Extras({ jobId, visitor, files, cover, onFiles, onCover, track }: {
  jobId: string; visitor: string; files: UploadedFile[]; cover: string;
  onFiles: (f: UploadedFile[]) => void; onCover: (c: string) => void;
  track: (type: string, meta?: Record<string, unknown>, onceKey?: string) => void;
}) {
  const [open, setOpen] = useState(files.length > 0 || cover.trim().length > 0);
  const [busy, setBusy] = useState<UploadedFile['kind'] | null>(null);
  const [err, setErr] = useState('');
  const [letterMode, setLetterMode] = useState<'write' | 'file'>(files.some((f) => f.kind === 'cover_letter') ? 'file' : 'write');

  const pick = async (kind: UploadedFile['kind'], f?: File | null) => {
    if (!f) return;
    setErr('');
    const problem = fileProblem(f);
    if (problem) { setErr(problem); return; }
    setBusy(kind);
    try {
      const up = await uploadFile(jobId, visitor, kind, f);
      onFiles([...files.filter((x) => x.kind !== kind), up]);
      track('file_added', { kind, size: f.size });
    } catch {
      setErr('That upload didn’t go through. Check your connection and try again, or skip it. It’s optional.');
    }
    setBusy(null);
  };

  const slot = (kind: UploadedFile['kind'], label: string) => {
    const f = files.find((x) => x.kind === kind);
    if (f) {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5">
          <span className="grid place-items-center h-9 w-8 rounded-md bg-accent-soft text-accent text-[10px] font-bold uppercase">{f.name.split('.').pop()}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{f.name}</p>
            <p className="text-xs text-muted">{fmtSize(f.size)} · attached</p>
          </div>
          <button className="text-xs text-muted underline underline-offset-2 hover:text-ink" onClick={() => onFiles(files.filter((x) => x.kind !== kind))}>Remove</button>
        </div>
      );
    }
    return (
      <label className={cx('flex items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-4 text-sm cursor-pointer hover:border-ink/40 transition', busy === kind && 'opacity-60 pointer-events-none')}>
        <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { pick(kind, e.target.files?.[0]); e.target.value = ''; }} />
        {busy === kind ? <><Spinner className="h-4 w-4" /> Uploading…</> : <><span aria-hidden className="text-lg leading-none">+</span> {label}</>}
      </label>
    );
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-6 w-full text-left rounded-2xl border border-dashed border-line px-5 py-4 hover:border-ink/40 transition">
        <p className="font-medium">Add a résumé or cover letter <span className="text-muted font-normal">(optional)</span></p>
        <p className="text-sm text-muted mt-0.5">PDF or Word, up to 5 MB. Your video answers are what we look at first.</p>
      </button>
    );
  }
  return (
    <div className="mt-6 rounded-2xl border border-line bg-card p-5">
      <p className="font-medium">Résumé and cover letter <span className="text-muted font-normal">(optional)</span></p>
      <p className="text-sm text-muted mt-0.5">PDF or Word, up to 5 MB. Only the hiring team can open these.</p>
      <div className="mt-4 space-y-4">
        <div>
          <p className="text-sm font-medium mb-1.5">Résumé</p>
          {slot('resume', 'Choose your résumé')}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-medium">Cover letter</p>
            <div className="text-xs text-muted flex gap-3">
              <button className={cx(letterMode === 'write' && 'text-ink font-medium underline underline-offset-2')} onClick={() => setLetterMode('write')}>Write it here</button>
              <button className={cx(letterMode === 'file' && 'text-ink font-medium underline underline-offset-2')} onClick={() => setLetterMode('file')}>Upload a file</button>
            </div>
          </div>
          {letterMode === 'write'
            ? <Textarea rows={5} value={cover} placeholder="A few lines on why this role, and why you." onChange={(e) => onCover(e.target.value)} />
            : slot('cover_letter', 'Choose your cover letter')}
        </div>
      </div>
      {err && <p className="mt-3 rounded-xl bg-bad-soft text-bad text-sm px-4 py-2.5">{err}</p>}
    </div>
  );
}
