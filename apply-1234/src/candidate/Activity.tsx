import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Activity as ActivityT, Question } from '../lib/types';
import { fetchLoomInfo, knownDuration, loomId, looksLikeUrl, type LoomInfo } from '../lib/loom';
import SetupStep from './SetupArt';
import HelpButton from './HelpButton';
import { StepCard, emptyDraft, stepMissing, stepPayload, stepSummary, type StepCtx, type StepDraft } from './StepCards';
import { ACCEPT, fileProblem, fmtSize, notify, uploadFile, type UploadedFile } from '../lib/files';
import { fmtDate, fmtDuration, isPreviewBrowser, rangeLabel, storeJson, visitorId } from '../lib/util';
import { mdToHtml } from '../lib/posting';
import { activityMinutes, aiMessage, needsLoomSetup, stepMix, stepType, usesLoom } from '../lib/steps';
import { Button, Field, Input, Spinner, Textarea, Wordmark, cx } from '../ui';

type Step = 0 | 1 | 2 | 3 | 4;
type AnswerDraft = StepDraft;
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
  aiUsed?: boolean | null;
  aiHow?: string;
  pledge?: boolean;
}

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

  // Which screens this activity needs: the Loom set-up screen only when a step requires a recording.
  const loomSetup = useMemo(() => needsLoomSetup(questions), [questions]);
  const anyLoom = useMemo(() => questions.some(usesLoom), [questions]);
  const allVideo = useMemo(() => questions.length > 0 && questions.every((q) => stepType(q) === 'video'), [questions]);
  const labels = loomSetup ? ['Welcome', 'Set up', 'Answers', 'Submit'] : ['Welcome', 'Answers', 'Submit'];
  const screen = (step: Step) => (loomSetup ? step : step === 0 ? 0 : step - 1); // position in `labels`
  const aiNote = aiMessage(activity);

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

  const go = (to: Step) => {
    const step: Step = to === 1 && !loomSetup ? (dRef.current.step === 0 ? 2 : 0) : to;
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

  const answer = (qid: string): StepDraft => d.answers[qid] || emptyDraft();
  const updaters = useRef<Record<string, (patch: Partial<StepDraft> | ((a: StepDraft) => Partial<StepDraft>)) => void>>({});
  const updater = (qid: string) => (updaters.current[qid] ||= (patch) => set((p) => {
    const cur = p.answers[qid] || emptyDraft();
    return { answers: { ...p.answers, [qid]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } } };
  }));
  const stillNeeded = questions.map((q, i) => stepMissing(q, answer(q.id), i + 1, activity)).filter((x): x is string => !!x);
  const ctx: StepCtx = { jobId, vid, activity, range: rangeLabel(activity.answer_min, activity.answer_max), track, checkLink };

  // ── submit ──
  const submitMissing = [
    ...(d.name.trim().length < 2 ? ['your full name'] : []),
    ...(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()) ? ['a valid email'] : []),
    ...(aiNote && d.aiUsed == null ? ['whether you used AI'] : []),
    ...(aiNote && d.aiUsed && (d.aiHow || '').trim().length < 5 ? ['a few words on how you used AI'] : []),
    ...(activity.pledge && !d.pledge ? ['a tick to confirm the work is your own'] : []),
    ...(activity.consent_text && !d.consent ? ['a tick in the consent box'] : []),
  ];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    track('submit_attempt');
    setBusy(true);
    const payload = questions.map((q) => stepPayload(q, answer(q.id)));
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
        ...(aiNote && d.aiUsed != null ? { ai_use: { used: d.aiUsed, how: d.aiUsed ? (d.aiHow || '').trim().slice(0, 1000) : '' } } : {}),
        ...(activity.pledge ? { pledge: !!d.pledge } : {}),
        ...(source ? { source: source.code, source_label: source.label } : {}),
      },
    });
    const res = data as { ok: boolean; id?: string; error?: string; question_id?: string } | null;
    if (error || !res?.ok) {
      setBusy(false);
      const code = res?.error || 'network';
      track('submit_error', { code });
      setErr({
        closed: 'This activity has closed and is no longer accepting submissions.',
        name: 'Please enter your full name.',
        email: 'Please enter a valid email address.',
        consent: 'Please tick the consent box to submit.',
        answer_missing: `Step ${questions.findIndex((q) => q.id === res?.question_id) + 1 || ''} needs an answer before you can submit.`.replace('Step  ', 'A step '),
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

  const range = ctx.range;
  const steps = (activity.loom_steps || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const minutes = activityMinutes(questions, activity);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line/70">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <Wordmark className="text-[15px]" />
          {d.step < 4 && (
            <ol className="flex items-center gap-1.5" aria-label="Progress">
              {labels.map((l, i) => (
                <li key={l} className="flex items-center gap-1.5">
                  <span className={cx('h-1.5 rounded-full transition-all', i < screen(d.step) ? 'w-5 bg-ink' : i === screen(d.step) ? 'w-8 bg-accent' : 'w-5 bg-line')} />
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
              {allVideo
                ? <Fact k="Questions" v={`${questions.length} short video answer${questions.length === 1 ? '' : 's'}`} />
                : <Fact k="Steps" v={`${questions.length} short step${questions.length === 1 ? '' : 's'}`} />}
              {allVideo ? range && <Fact k="Length" v={`${range} per answer`} /> : minutes > 0 && <Fact k="Time" v={`About ${minutes} minutes`} />}
              {anyLoom && <Fact k="Tool" v={loomSetup ? 'Loom (free) for recording' : 'Loom (free), if you choose to record'} />}
              {activity.deadline && <Fact k="Deadline" v={fmtDate(activity.deadline)} />}
            </div>
            {!allVideo && questions.length > 0 && (
              <p className="mt-4 text-[15px] text-ink-2 leading-relaxed">Includes {stepMix(questions)}.</p>
            )}
            {aiNote && (
              <p className="mt-4 flex items-start gap-2.5 text-[15px] text-ink-2 leading-relaxed">
                <span aria-hidden className="mt-0.5 grid place-items-center h-5 w-5 rounded-full bg-accent-soft text-accent text-[11px] font-bold shrink-0">AI</span>
                {aiNote}
              </p>
            )}
            <div className="mt-10 flex items-center gap-4">
              <Button variant="primary" size="lg" onClick={() => go(1)}>Begin</Button>
              {d.visits > 1 && <span className="text-sm text-muted">Welcome back. Your progress is saved on this device.</span>}
            </div>
          </section>
        )}

        {d.step === 1 && (
          <section className="pt-12 rise">
            <StepLabel n={1} of={labels.length - 1} label="Set up" />
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
            <StepLabel n={screen(2)} of={labels.length - 1} label="Answers" />
            <h2 className="font-display text-5xl leading-none mt-3">{allVideo ? 'Record your answers.' : 'Your activity.'}</h2>
            <p className="text-ink-2 leading-relaxed mt-4">
              {allVideo
                ? `Record one Loom per question${range ? `, ${range} each` : ''}. Paste each share link in its box. We check the link as you go.`
                : 'Work through each step below, in any order. Everything saves on this device as you go, so you can take a break and come back.'}
            </p>
            <div className="mt-8 space-y-5">
              {questions.map((q, i) => (
                <StepCard key={q.id} q={q} i={i} total={questions.length} a={answer(q.id)} update={updater(q.id)} ctx={ctx} />
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="ghost" onClick={() => go(1)}>Back</Button>
              <Button variant="primary" size="lg" disabled={stillNeeded.length > 0} onClick={() => go(3)}>Continue</Button>
            </div>
            {stillNeeded.length > 0 && (
              <div className="mt-3 rounded-xl bg-paper-2 px-4 py-3 text-sm">
                <p className="font-medium">To continue, add:</p>
                <ul className="mt-1 list-disc pl-5 text-ink-2 space-y-0.5">{stillNeeded.slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul>
                {questions.some((q) => stepType(q) === 'video') && <p className="text-xs text-muted mt-2">Video length is only a guideline. It never stops you from submitting.</p>}
              </div>
            )}
          </section>
        )}

        {d.step === 3 && (
          <section className="pt-12 rise">
            <StepLabel n={screen(3)} of={labels.length - 1} label="Submit" />
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
                      <p className="text-[12px] font-mono text-muted">{allVideo ? `Q${i + 1}` : `STEP ${i + 1}`}</p>
                      <p className="text-sm leading-snug mt-0.5 line-clamp-2">{stepType(q) === 'quiz' && !a.started_at ? 'A quick scenario' : q.text.replace(/```[\s\S]*?```/g, '').replace(/[#*|`]/g, '')}</p>
                      <p className="font-mono text-[12px] text-muted truncate mt-1">{stepSummary(q, a)}</p>
                    </div>
                    <span className="text-sm font-mono shrink-0">{knownDuration(a.info) != null ? fmtDuration(knownDuration(a.info)) : ''}</span>
                  </div>
                );
              })}
            </div>
            <Extras jobId={jobId} visitor={vid} files={d.files || []} cover={d.coverLetter || ''}
              onFiles={(files) => set({ files })} onCover={(coverLetter) => set({ coverLetter })} track={track} />
            {aiNote && (
              <div className="mt-6 rounded-2xl border border-line bg-card p-5">
                <p className="font-medium">Did you use AI for any of this?</p>
                <p className="text-sm text-muted mt-0.5">{aiNote} An honest answer counts for more than the answer itself.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([[false, 'No, I didn’t'], [true, 'Yes, I did']] as const).map(([v, l]) => (
                    <button key={l} aria-pressed={d.aiUsed === v} onClick={() => set({ aiUsed: v })}
                      className={cx('h-10 px-4 rounded-lg border text-sm font-medium transition', d.aiUsed === v ? 'bg-ink text-white border-ink' : 'bg-card border-line hover:border-ink/30')}>
                      {l}
                    </button>
                  ))}
                </div>
                {d.aiUsed && (
                  <Textarea className="mt-3" rows={2} value={d.aiHow || ''} placeholder="Which tool, and for what? For example: “ChatGPT to check my grammar on step 2.”"
                    onChange={(e) => set({ aiHow: e.target.value })} />
                )}
              </div>
            )}
            {activity.pledge && (
              <label className="mt-6 flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-ink" checked={!!d.pledge} onChange={(e) => set({ pledge: e.target.checked })} />
                <span className="text-sm leading-relaxed text-ink-2">I confirm these answers are my own work{aiNote ? ', and what I’ve said about AI is accurate' : ''}.</span>
              </label>
            )}
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
      <HelpButton jobId={jobId} visitor={vid} step={labels[Math.min(screen(d.step), labels.length - 1)] + (d.step === 4 ? ' (after submitting)' : '')}
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

function StepLabel({ n, of, label }: { n: number; of: number; label: string }) {
  return <p className="text-[12px] font-mono text-muted tracking-wide">STEP {n} OF {of} · {label.toUpperCase()}</p>;
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
        <p className="text-sm text-muted mt-0.5">PDF or Word, up to 5 MB. Your answers above are what we look at first.</p>
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
