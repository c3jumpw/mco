import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { q, useAsync, useTitle } from '../lib/hooks';
import { loadTrainingFor, stepsOf, type Step } from '../lib/plan';
import { TRACKS, cx, dueLabel, fmtDate, plural } from '../lib/util';
import type { Module, Progress as ProgressRow } from '../lib/types';
import { FocusFrame } from '../shell/AppShell';
import { Button, Card, EmptyState, ErrorBox, Icon, IconButton, LinkButton, Notice, Progress, Spinner, useToast } from '../ui';
import { store } from './parts/journey-common';
import {
  AssignmentStep, FormStep, PracticeStep, QuizStep, ReadingStep, SlideStep, StepHeading, VideoStep, emptyQuiz,
  type FormStatus, type QuizState,
} from './parts/journey-steps';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ModulePlayer() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const { me, isAdmin } = useMe();
  const { data, error, loading, reload } = useAsync(async () => {
    if (!UUID.test(id)) return { mod: null as Module | null, prog: null as ProgressRow | null };
    const [mod, prog] = await Promise.all([
      q<Module | null>(supabase.from('ramp_modules').select('*').eq('id', id).maybeSingle()),
      q<ProgressRow | null>(supabase.from('ramp_progress').select('*').eq('member_id', me.id).eq('module_id', id).maybeSingle()),
    ]);
    return { mod, prog };
  }, [id, me.id]);
  useTitle(data?.mod?.title || 'Training');

  const stale = !!data && data.mod?.id !== id && UUID.test(id);
  if ((loading && !data) || (loading && stale)) {
    return <FocusFrame><div className="min-h-dvh flex items-center justify-center gap-3 text-muted text-sm" role="status"><Spinner />Opening module…</div></FocusFrame>;
  }
  if (error && !data) {
    return (
      <FocusFrame>
        <div className="max-w-xl mx-auto px-4 pt-6 flex flex-col gap-4">
          <BarOnly to="/training" />
          <ErrorBox error={error} onRetry={reload} />
        </div>
      </FocusFrame>
    );
  }
  if (!data?.mod) {
    return (
      <FocusFrame>
        <div className="max-w-xl mx-auto px-4 pt-6 flex flex-col gap-4">
          <BarOnly to="/training" />
          <Card><EmptyState icon="book" title="This module isn’t available" body="It may have been unpublished or removed, or it isn’t shared with you."
            action={<LinkButton to="/training" variant="primary">Back to training</LinkButton>} /></Card>
        </div>
      </FocusFrame>
    );
  }
  // Admins can open drafts; a draft can't be saved, so it always opens as a preview.
  const preview = isAdmin && (sp.get('preview') === '1' || data.mod.status !== 'published');
  return <Player key={data.mod.id} module={data.mod} progress={data.prog} preview={preview} />;
}

function BarOnly({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-ink no-underline self-start">
      <Icon name="x" size={18} />Close
    </Link>
  );
}

type Result = 'completed' | 'submitted';

function Player({ module: mod, progress, preview }: { module: Module; progress: ProgressRow | null; preview: boolean }) {
  const { me } = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const steps = useMemo(() => stepsOf(mod.blocks), [mod.blocks]);
  const n = steps.length;
  const status = progress?.status || 'not_started';
  const review = !preview && (status === 'completed' || status === 'submitted');
  const free = preview || review;
  const exitTo = preview ? `/admin/training/${mod.id}` : '/training';
  const keyBase = `${me.id}:${mod.id}`;

  const [pos, setPos] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [quiz, setQuiz] = useState<Record<number, QuizState>>(() => (preview ? {} : store.get(`ramp-quiz:${keyBase}`, {})));
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    const saved = preview ? {} : store.get<Record<number, string>>(`ramp-answer:${keyBase}`, {});
    // Bring back what was sent last time (returned for changes, or for review) when there's one assignment and no draft.
    const only = steps.map((s, i) => (s.kind === 'assignment' ? i : -1)).filter((i) => i >= 0);
    if (only.length === 1 && saved[only[0]!] == null && progress?.answer) saved[only[0]!] = progress.answer;
    return saved;
  });
  const [forms, setForms] = useState<Record<number, FormStatus>>({});
  // Set when finishing sent the person back to a quiz: once it's passed they can finish from there.
  const [finishFrom, setFinishFrom] = useState<number | null>(null);

  useEffect(() => { if (!preview) store.set(`ramp-quiz:${keyBase}`, quiz); }, [quiz, keyBase, preview]);
  useEffect(() => { if (!preview && !review) store.set(`ramp-answer:${keyBase}`, answers); }, [answers, keyBase, preview, review]);

  const step: Step | null = pos >= 1 ? steps[pos - 1] || null : null;
  const idx = pos - 1;

  const canNext = (() => {
    if (!step || free) return true;
    if (step.kind === 'quiz') {
      if (mod.pass_score === 0) return true;
      const s = quiz[idx];
      return !!s && s.checked && s.score >= mod.pass_score;
    }
    if (step.kind === 'assignment') return !!(answers[idx] || '').trim();
    if (step.kind === 'form') return forms[idx] !== 'todo' && forms[idx] !== 'loading' && forms[idx] !== undefined;
    return true;
  })();

  const blockedHint = (() => {
    if (canNext || !step) return '';
    if (step.kind === 'quiz') return quiz[idx]?.checked ? `Score ${mod.pass_score}% to continue` : 'Check your answers first';
    if (step.kind === 'assignment') return 'Write your answer to continue';
    if (step.kind === 'form') return forms[idx] === 'todo' ? 'Submit the document to continue' : 'Loading…';
    return '';
  })();

  const go = useCallback((to: number) => {
    setPos(to);
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }, []);

  const save = useCallback((to: number) => {
    if (free) return;
    supabase.rpc('ramp_module_save', { p_module: mod.id, p_step: to }).then(({ error }) => {
      if (error) toast(`Your place wasn’t saved: ${errText(error)}`, 'bad');
    });
  }, [free, mod.id, toast]);

  const resumeAt = (() => {
    if (status === 'returned') {
      const a = steps.findIndex((s) => s.kind === 'assignment');
      return a >= 0 ? a + 1 : 1;
    }
    if (status === 'in_progress' && progress) return Math.min(Math.max(progress.step, 1), Math.max(n, 1));
    return 1;
  })();

  async function finish() {
    if (preview) { navigate(exitTo); return; }
    if (review) { navigate('/training'); return; }
    // Every quiz has to be passed. Quiz answers are kept on this device; if they're missing, send the person back to it.
    const quizIdx = steps.map((s, i) => (s.kind === 'quiz' ? i : -1)).filter((i) => i >= 0);
    if (mod.pass_score > 0) {
      const missing = quizIdx.find((i) => !(quiz[i]?.checked && quiz[i]!.score >= mod.pass_score));
      if (missing !== undefined) {
        setFinishFrom(missing + 1);
        go(missing + 1);
        return;
      }
    }
    const checked = quizIdx.filter((i) => quiz[i]?.checked);
    let score: number | null = null;
    if (checked.length) {
      let right = 0, total = 0;
      for (const i of checked) {
        const s = steps[i] as Extract<Step, { kind: 'quiz' }>;
        total += s.questions.length;
        right += s.questions.filter((qq, qi) => quiz[i]!.picks[qi] === qq.answer).length;
      }
      score = total ? Math.round((right / total) * 100) : 100;
    }
    const parts = steps.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'assignment');
    const answer = parts.length === 1
      ? (answers[parts[0]!.i] || '').trim()
      : parts.map(({ s, i }) => `${(s as Extract<Step, { kind: 'assignment' }>).prompt}\n\n${(answers[i] || '').trim()}`).join('\n\n———\n\n');
    setBusy(true);
    try {
      const r = await q<string>(supabase.rpc('ramp_module_finish', { p_module: mod.id, p_score: score, p_answer: answer }));
      store.del(`ramp-answer:${keyBase}`);
      store.del(`ramp-quiz:${keyBase}`);
      setResult(r === 'submitted' ? 'submitted' : 'completed');
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (pos === 0) {
      if (n === 0) { finish(); return; }
      const to = free ? 1 : resumeAt;
      go(to);
      save(to);
      return;
    }
    if (!canNext) return;
    if (pos < n && finishFrom !== pos) { go(pos + 1); save(pos + 1); return; }
    finish();
  }
  const back = () => { if (pos > 0) go(pos - 1); };

  // Left and right arrow keys move between steps (not while typing or picking an answer, or with a sheet open).
  const keyRef = useRef({ next, back, pos, n, canNext, result, finishHere: false });
  keyRef.current = { next, back, pos, n, canNext, result, finishHere: finishFrom === pos };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"], [role="radio"]'))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = keyRef.current;
      if (k.result) return;
      if (e.key === 'ArrowRight' && k.pos > 0 && k.pos < k.n && k.canNext && !k.finishHere) { e.preventDefault(); k.next(); }
      if (e.key === 'ArrowLeft' && k.pos > 0) { e.preventDefault(); k.back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setFormStatus = useCallback((i: number, s: FormStatus) => setForms((f) => (f[i] === s ? f : { ...f, [i]: s })), []);
  const formHandlers = useMemo(() => steps.map((_, i) => (s: FormStatus) => setFormStatus(i, s)), [steps, setFormStatus]);

  const isLast = (pos === n && n > 0) || (finishFrom === pos && pos > 0);
  const nextLabel = pos === 0
    ? (n === 0 ? (free ? 'Done' : 'Mark as complete') : free ? (review ? 'Review module' : 'Start preview') : status === 'returned' ? 'Make changes' : status === 'in_progress' && resumeAt > 1 ? 'Continue' : 'Start')
    : isLast ? (preview ? 'Exit preview' : review ? 'Done' : mod.mentor_review ? 'Send for review' : 'Finish module') : 'Next';
  const pct = n ? Math.round((Math.max(0, pos) / n) * 100) : 0;

  if (result) return <ResultScreen module={mod} result={result} onClose={() => navigate('/training')} />;

  return (
    <FocusFrame>
      <div className="min-h-dvh flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-line">
          <div className="max-w-3xl mx-auto flex items-center gap-2 px-2 md:px-4 h-14">
            <IconButton icon="x" label={preview ? 'Exit preview' : 'Close module'} onClick={() => navigate(exitTo)} />
            <div className="min-w-0 flex-1">
              <span className="block font-display font-semibold text-[15px] leading-tight truncate">{mod.title}</span>
              <p className="text-xs text-muted">{pos === 0 ? (n ? `Overview · ${plural(n, 'step')}` : 'Overview') : `Step ${pos} of ${n}`}</p>
            </div>
            {preview && <span className="hidden sm:inline-flex rounded-full bg-amber text-ink text-[11px] font-bold tracking-[0.08em] px-2.5 py-1">PREVIEW</span>}
          </div>
          <Progress value={pct} className="h-1 rounded-none" label="Module progress" />
        </header>

        {preview && (
          <div className="bg-ink text-white">
            <p className="max-w-3xl mx-auto px-4 py-2.5 text-sm font-semibold flex items-center gap-2"><Icon name="eye" size={16} />Preview. Nothing is saved.</p>
          </div>
        )}

        <main className="flex-1 w-full max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <div key={pos} className="rise">
            {pos === 0 ? (
              <Intro module={mod} progress={progress} steps={n} preview={preview} resumeAt={!free && status === 'in_progress' && resumeAt > 1 ? resumeAt : 0} />
            ) : step ? (
              <>
              {finishFrom === pos && step.kind === 'quiz' && !canNext && (
                <Notice tone="warn" icon="alert" className="mb-6">Pass this quiz to finish the module. Your answers from before weren’t saved on this device.</Notice>
              )}
              <StepView step={step} idx={idx} mod={mod} preview={preview} review={review} feedback={status === 'returned' ? progress?.feedback : undefined}
                quiz={quiz[idx]} onQuiz={(s) => setQuiz((m) => ({ ...m, [idx]: s }))}
                answer={answers[idx] || ''} onAnswer={(v) => setAnswers((m) => ({ ...m, [idx]: v }))}
                onFormStatus={formHandlers[idx]!} />
              </>
            ) : null}
          </div>
        </main>

        {/* Footer: sticky so it stays under the thumb on phones */}
        <footer className="sticky bottom-0 z-30 bg-white border-t border-line pb-safe">
          {blockedHint && <p className="sm:hidden px-4 pt-2 -mb-1 text-center text-[13px] text-muted" aria-hidden="true">{blockedHint}</p>}
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
            {pos > 0 ? (
              <Button onClick={back} icon="chevronLeft" aria-label="Back"><span className="hidden sm:inline">Back</span></Button>
            ) : (
              <span className="hidden sm:block text-[13px] text-muted flex-1">{mod.minutes} min{n ? ` · ${plural(n, 'step')}` : ''}</span>
            )}
            {pos > 0 && (
              <span className="flex-1 min-w-0 text-[13px] text-muted text-center truncate" aria-live="polite">
                <span className="hidden sm:inline">{blockedHint}</span>
                {!blockedHint && <span className="hidden md:inline">Use the arrow keys to move between steps</span>}
              </span>
            )}
            {pos === 0 && status === 'in_progress' && resumeAt > 1 && !free && (
              <Button variant="ghost" onClick={() => { go(1); save(1); }}>Start over</Button>
            )}
            <Button variant={isLast && !free ? 'success' : 'primary'} onClick={next} disabled={!canNext} loading={busy}
              iconRight={isLast ? undefined : 'chevronRight'} icon={isLast && !free ? (mod.mentor_review ? 'send' : 'check') : undefined}
              className={cx(pos === 0 && 'flex-1 sm:flex-none')}>
              {nextLabel}
            </Button>
          </div>
        </footer>
      </div>
    </FocusFrame>
  );
}

function Intro({ module: mod, progress, steps, preview, resumeAt }: { module: Module; progress: ProgressRow | null; steps: number; preview: boolean; resumeAt: number }) {
  const goals = (mod.objectives || []).filter(Boolean);
  const status = progress?.status;
  return (
    <div className="flex flex-col gap-6">
      {!preview && status === 'returned' && (
        <Notice tone="bad" icon="chat">
          <strong className="block">Your mentor sent this back with feedback</strong>
          <span className="whitespace-pre-line">{progress?.feedback || 'Take another look and send it again.'}</span>
        </Notice>
      )}
      {!preview && status === 'completed' && (
        <Notice tone="good" icon="check">You completed this module{progress?.completed_at ? ` on ${fmtDate(progress.completed_at, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}. You can look back through it any time.</Notice>
      )}
      {!preview && status === 'submitted' && (
        <Notice tone="warn" icon="clock">Sent to your mentor for review{progress?.submitted_at ? ` on ${fmtDate(progress.submitted_at)}` : ''}. You can look back through it while you wait.</Notice>
      )}
      {preview && mod.status !== 'published' && <Notice tone="warn" icon="alert">This module is a draft. Only admins can see it until it’s published.</Notice>}
      {resumeAt > 0 && <Notice icon="replay">You stopped at step {resumeAt} of {steps}. Continue picks up there.</Notice>}

      <StepHeading eyebrow={TRACKS[mod.track]?.label || 'Training'} title={mod.title} />
      {mod.summary && <p className="text-[17px] leading-relaxed text-ink-2 -mt-2">{mod.summary}</p>}

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-line px-3 py-1.5 text-[13px] font-semibold"><Icon name="clock" size={15} />{mod.minutes} min</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-line px-3 py-1.5 text-[13px] font-semibold"><Icon name="list" size={15} />{plural(steps, 'step')}</span>
      </div>

      {goals.length > 0 && (
        <section className="bg-card border border-line rounded-2xl p-5 flex flex-col gap-3">
          <h3 className="font-display text-lg font-semibold">What you’ll be able to do</h3>
          <ul className="flex flex-col gap-2.5">
            {goals.map((g, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
                <span className="w-6 h-6 rounded-full bg-brand-soft text-brand-ink flex items-center justify-center shrink-0 mt-px"><Icon name="check" size={14} strokeWidth={2.4} /></span>
                <span className="min-w-0">{g}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(mod.pass_score > 0 || mod.mentor_review) && (
        <div className="flex flex-col gap-2">
          {mod.pass_score > 0 && (
            <p className="flex gap-2.5 items-start text-[15px] text-ink-2"><Icon name="target" size={18} className="mt-0.5 text-brand-ink" />You need {mod.pass_score}% on the quiz to finish. You can retake it as often as you like.</p>
          )}
          {mod.mentor_review && (
            <p className="flex gap-2.5 items-start text-[15px] text-ink-2"><Icon name="users" size={18} className="mt-0.5 text-brand-ink" />Your mentor reviews this module before it’s marked complete. They may send it back with feedback.</p>
          )}
        </div>
      )}
      {steps === 0 && <Notice icon="info">This module has no content yet.</Notice>}
    </div>
  );
}

function StepView({ step, idx, mod, preview, review, feedback, quiz, onQuiz, answer, onAnswer, onFormStatus }: {
  step: Step; idx: number; mod: Module; preview: boolean; review: boolean; feedback?: string;
  quiz?: QuizState; onQuiz: (s: QuizState) => void; answer: string; onAnswer: (v: string) => void; onFormStatus: (s: FormStatus) => void;
}) {
  const { me } = useMe();
  switch (step.kind) {
    case 'slide': return <SlideStep step={step} />;
    case 'reading': return <ReadingStep step={step} />;
    case 'video': return <VideoStep step={step} />;
    case 'quiz': return <QuizStep key={idx} questions={step.questions} passScore={mod.pass_score} state={quiz || emptyQuiz(step.questions.length)} onChange={onQuiz} />;
    case 'assignment': return <AssignmentStep prompt={step.prompt} value={answer} onChange={onAnswer} feedback={feedback || undefined} readOnly={review} />;
    case 'form': return <FormStep templateId={step.template_id} note={step.note} preview={preview} onStatus={onFormStatus} />;
    case 'practice': return <PracticeStep returnTo={`/training/${mod.id}${preview ? '?preview=1' : ''}`} done={!!me.practice_done_at} preview={preview} />;
  }
}

function ResultScreen({ module: mod, result, onClose }: { module: Module; result: Result; onClose: () => void }) {
  const { me } = useMe();
  const plan = useAsync(() => loadTrainingFor(me), [me.id]);
  const items = plan.data?.plan || [];
  const here = items.findIndex((i) => i.module.id === mod.id);
  const open = (i: (typeof items)[number]) => i.module.id !== mod.id && i.status !== 'completed' && i.status !== 'submitted';
  const nextItem = items.slice(here + 1).find(open) || items.find((i) => open(i) && i.kind !== 'optional') || null;
  const done = result === 'completed';
  return (
    <FocusFrame>
      <div className="min-h-dvh flex flex-col">
        <header className="flex items-center gap-2 px-2 md:px-4 h-14 max-w-3xl w-full mx-auto">
          <IconButton icon="x" label="Close" onClick={onClose} />
        </header>
        <main className="flex-1 flex items-center justify-center px-4 pb-16">
          <div className="w-full max-w-md flex flex-col items-center text-center gap-4 rise" role="status">
            <span className={cx('w-20 h-20 rounded-3xl flex items-center justify-center', done ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn')}>
              <Icon name={done ? 'check' : 'send'} size={38} strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="font-display text-[28px] leading-tight font-bold">{done ? 'Module complete' : 'Sent to your mentor for review'}</h1>
              <p className="text-[16px] text-muted mt-2 leading-relaxed">
                {done
                  ? <>Nice work. “{mod.title}” is marked complete in your training.</>
                  : <>Your mentor will look at “{mod.title}” and either approve it or send it back with feedback. You’ll see their answer on Home and in Training.</>}
              </p>
            </div>
            <div className="flex flex-col gap-2.5 w-full mt-2">
              {plan.loading && !plan.data ? <div className="skeleton h-24" aria-hidden="true" /> : nextItem && (
                <div className="rounded-2xl bg-card border border-line p-4 flex flex-col gap-3 text-left">
                  <div className="min-w-0">
                    <p className="text-xs font-bold tracking-[0.08em] uppercase text-brand-ink">Up next</p>
                    <p className="font-display text-[17px] font-semibold leading-snug mt-0.5">{nextItem.module.title}</p>
                    <p className="text-[13px] text-muted mt-0.5">{nextItem.module.minutes} min{nextItem.due ? ` · ${dueLabel(nextItem.due)}` : ''}</p>
                  </div>
                  <LinkButton to={`/training/${nextItem.module.id}`} variant="primary" iconRight="chevronRight">Next module</LinkButton>
                </div>
              )}
              <LinkButton to="/training" variant={nextItem ? 'secondary' : 'primary'} size="lg">Back to training</LinkButton>
              {plan.data && !nextItem && <p className="text-sm text-muted">That’s everything assigned to you for now.</p>}
            </div>
          </div>
        </main>
      </div>
    </FocusFrame>
  );
}
