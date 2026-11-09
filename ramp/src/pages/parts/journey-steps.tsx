// What the module player shows for each kind of step.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMe } from '../../lib/session';
import { q, useAsync } from '../../lib/hooks';
import { SUBMISSION_COLS, embedUrl, type Step } from '../../lib/plan';
import { KINDS, cx, fmtDate, plural } from '../../lib/util';
import type { QuizQuestion, Submission, Template } from '../../lib/types';
import { FormSheet } from '../../components/FormSheet';
import { Button, Chip, ErrorBox, Icon, LinkButton, Notice, Skeleton, Textarea } from '../../ui';
import { Lines, Paragraphs } from './journey-common';

export function StepHeading({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="flex flex-col gap-1">
      {eyebrow && <p className="text-xs font-bold tracking-[0.08em] uppercase text-brand-ink">{eyebrow}</p>}
      <h2 className="font-display text-[24px] md:text-[28px] leading-tight font-bold tracking-tight">{title}</h2>
    </div>
  );
}

// ───────── slide, reading, video ─────────

export function SlideStep({ step }: { step: Extract<Step, { kind: 'slide' }> }) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeading eyebrow={step.of > 1 ? `Slide ${step.index + 1} of ${step.of}` : 'Slide'} title={step.title || 'Untitled slide'} />
      <Lines text={step.body} />
      {step.of > 1 && (
        <div aria-hidden="true" className="flex gap-1.5 pt-1">
          {Array.from({ length: step.of }).map((_, i) => (
            <span key={i} className={cx('h-1.5 rounded-full transition-all', i === step.index ? 'w-6 bg-brand' : i < step.index ? 'w-1.5 bg-brand-2' : 'w-1.5 bg-line')} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReadingStep({ step }: { step: Extract<Step, { kind: 'reading' }> }) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeading eyebrow="Reading" title={step.title || 'Reading'} />
      <Paragraphs text={step.body} />
    </div>
  );
}

export function VideoStep({ step }: { step: Extract<Step, { kind: 'video' }> }) {
  const src = step.url ? embedUrl(step.url) : null;
  return (
    <div className="flex flex-col gap-4">
      <StepHeading eyebrow="Video" title={step.caption || 'Watch the video'} />
      {src ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-ink">
          <iframe src={src} title={step.caption || 'Training video'} className="absolute inset-0 w-full h-full" loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" />
        </div>
      ) : step.url ? (
        <div className="rounded-2xl bg-bg border border-line p-5 flex flex-col items-start gap-3">
          <p className="text-[15px] text-ink-2">This video opens on its own site.</p>
          <a href={step.url} target="_blank" rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl bg-brand text-white font-semibold no-underline hover:bg-brand-ink">
            <Icon name="play" size={18} />Open video
          </a>
        </div>
      ) : (
        <Notice tone="warn" icon="alert">This video hasn’t been added yet. You can carry on.</Notice>
      )}
    </div>
  );
}

// ───────── quiz ─────────

export interface QuizState { picks: (number | null)[]; checked: boolean; score: number }
export const emptyQuiz = (n: number): QuizState => ({ picks: Array.from({ length: n }, () => null), checked: false, score: 0 });

export function scoreOf(questions: QuizQuestion[], picks: (number | null)[]) {
  if (!questions.length) return 100;
  const right = questions.filter((qq, i) => picks[i] === qq.answer).length;
  return Math.round((right / questions.length) * 100);
}

export function QuizStep({ questions, state, onChange, passScore }: {
  questions: QuizQuestion[]; state: QuizState; onChange: (s: QuizState) => void; passScore: number;
}) {
  const answered = state.picks.filter((p) => p !== null).length;
  const all = answered === questions.length;
  const passed = state.checked && state.score >= passScore;
  const pick = (qi: number, oi: number) => {
    if (state.checked) return;
    const picks = state.picks.slice();
    picks[qi] = oi;
    onChange({ ...state, picks });
  };
  const check = () => onChange({ ...state, checked: true, score: scoreOf(questions, state.picks) });
  const reset = () => onChange(emptyQuiz(questions.length));

  return (
    <div className="flex flex-col gap-6">
      <StepHeading eyebrow={`Quiz · ${plural(questions.length, 'question')}`} title="Check what you’ve learned" />
      {passScore > 0 && !state.checked && <p className="text-[15px] text-muted -mt-3">You need {passScore}% to pass. You can try as many times as you like.</p>}
      {questions.map((qq, qi) => {
        const picked = state.picks[qi] ?? null;
        const right = picked === qq.answer;
        return (
          <fieldset key={qi} className="flex flex-col gap-2.5 min-w-0">
            <legend id={`q-${qi}`} className="font-semibold text-[16px] leading-snug mb-2.5">
              <span className="text-muted mr-1.5">{qi + 1}.</span>{qq.q}
            </legend>
            <div role="radiogroup" aria-labelledby={`q-${qi}`} className="flex flex-col gap-2">
              {qq.options.map((o, oi) => {
                const on = picked === oi;
                const showRight = state.checked && oi === qq.answer;
                const showWrong = state.checked && on && !right;
                return (
                  <button key={oi} type="button" role="radio" aria-checked={on} disabled={state.checked && !on && !showRight}
                    onClick={() => pick(qi, oi)}
                    className={cx('flex items-center gap-3 w-full min-h-12 px-3.5 py-2.5 rounded-xl border-2 text-left text-[15px] font-medium transition-colors',
                      state.checked ? 'cursor-default' : 'cursor-pointer hover:bg-brand-soft',
                      showRight ? 'border-good-2 bg-good-soft text-good' : showWrong ? 'border-bad bg-bad-soft text-bad'
                        : on ? 'border-brand bg-brand-soft text-ink' : 'border-line bg-white text-ink',
                      state.checked && !on && !showRight && 'opacity-60')}>
                    <span aria-hidden="true" className={cx('w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0',
                      showRight ? 'border-good-2 bg-good-2 text-white' : showWrong ? 'border-bad bg-bad text-white' : on ? 'border-brand' : 'border-line')}>
                      {showRight ? <Icon name="check" size={14} strokeWidth={3} /> : showWrong ? <Icon name="x" size={14} strokeWidth={3} />
                        : on ? <span className="w-2.5 h-2.5 rounded-full bg-brand" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">{o}</span>
                    {showRight && <span className="sr-only">(correct answer)</span>}
                    {showWrong && <span className="sr-only">(your answer, incorrect)</span>}
                  </button>
                );
              })}
            </div>
            {state.checked && (
              <p className={cx('text-sm leading-relaxed rounded-xl px-3.5 py-2.5', right ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn')} aria-live="polite">
                <strong>{right ? 'Correct.' : 'Not quite.'}</strong>{qq.explain ? ` ${qq.explain}` : !right ? ` The right answer is “${qq.options[qq.answer] ?? ''}”.` : ''}
              </p>
            )}
          </fieldset>
        );
      })}

      {!state.checked ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="dark" icon="check" disabled={!all} onClick={check}>Check answers</Button>
          {!all && <span className="text-[13px] text-muted">{answered} of {questions.length} answered</span>}
        </div>
      ) : (
        <div role="status" className={cx('flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5', passed || passScore === 0 ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
          <span className="font-semibold text-[15px]">
            You scored {state.score}%.{' '}
            {passScore > 0 ? (passed ? 'You passed.' : `You need ${passScore}% to pass.`) : state.score === 100 ? 'Perfect.' : ''}
          </span>
          <Button size="sm" icon="replay" onClick={reset} variant={passed || passScore === 0 ? 'secondary' : 'primary'}>Try again</Button>
        </div>
      )}
    </div>
  );
}

// ───────── assignment ─────────

export function AssignmentStep({ prompt, value, onChange, feedback, readOnly }: {
  prompt: string; value: string; onChange: (v: string) => void; feedback?: string; readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading eyebrow="Assignment" title="Your turn" />
      <Lines text={prompt} />
      {feedback && (
        <Notice tone="bad" icon="chat">
          <strong className="block">Feedback from your mentor</strong>
          <span className="whitespace-pre-line">{feedback}</span>
        </Notice>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink-2">Your answer</span>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={8} readOnly={readOnly} maxLength={20000}
          placeholder={readOnly ? '' : 'Write your answer here. It’s saved on this device as you type.'} />
        <span className="text-xs text-muted">{readOnly ? 'This is what you sent.' : value.trim() ? 'Draft saved on this device.' : 'Write something to continue.'}</span>
      </label>
    </div>
  );
}

// ───────── form (links a document template) ─────────

export type FormStatus = 'loading' | 'done' | 'todo' | 'na';

export function FormStep({ templateId, note, preview, onStatus }: {
  templateId: string | null; note?: string; preview: boolean; onStatus: (s: FormStatus) => void;
}) {
  const { me, org } = useMe();
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useAsync(async () => {
    if (!templateId) return { t: null as Template | null, sub: null as Submission | null };
    const [t, subs] = await Promise.all([
      q<Template | null>(supabase.from('ramp_templates').select('*').eq('id', templateId).maybeSingle()),
      q<Submission[]>(supabase.from('ramp_submissions').select(SUBMISSION_COLS).eq('member_id', me.id).eq('template_id', templateId)
        .order('created_at', { ascending: false }).limit(1)),
    ]);
    return { t, sub: subs[0] || null };
  }, [templateId, me.id]);

  const t = data?.t || null;
  const usable = !!t && t.status === 'published';
  const status: FormStatus = !data ? (error ? 'na' : 'loading') : !usable ? 'na' : data.sub ? 'done' : 'todo';
  useEffect(() => { onStatus(status); }, [status, onStatus]);

  return (
    <div className="flex flex-col gap-4">
      <StepHeading eyebrow="Document" title={t?.title || 'Fill in a document'} />
      {note && <Lines text={note} />}
      {loading && !data && <Skeleton rows={1} />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {data && !t && (
        <Notice tone="warn" icon="alert">This document isn’t available yet. You can carry on, and your admin will send it to you when it’s ready.</Notice>
      )}
      {t && !usable && (
        <Notice tone="warn" icon="alert">“{t.title}” is still a draft, so it can’t be filled in yet. Publish it in Documents so people can complete it here.</Notice>
      )}
      {t && usable && (
        <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={t.kind === 'esign' ? 'pen' : t.kind === 'upload' ? 'upload' : 'fileText'} size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[15px]">{t.title}</p>
              <p className="text-[13px] text-muted">{KINDS[t.kind].label}{t.description ? ` · ${t.description}` : ''}</p>
            </div>
            {data?.sub ? <Chip tone="good" icon="check">Done</Chip> : <Chip>To do</Chip>}
          </div>
          {data?.sub && <p className="text-[13px] text-muted">Submitted {fmtDate(data.sub.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}. You can submit it again if something changed.</p>}
          {preview ? (
            <p className="text-[13px] text-muted">In preview, documents can’t be submitted. People taking the module open it from here.</p>
          ) : (
            <div><Button variant={data?.sub ? 'secondary' : 'primary'} icon={t.kind === 'esign' ? 'pen' : 'fileText'} onClick={() => setOpen(true)}>
              {data?.sub ? 'Submit again' : KINDS[t.kind].action}
            </Button></div>
          )}
          {org.flags?.record_ip !== false && !preview && <p className="text-xs text-muted">Sensitive answers are encrypted. Only you and HR admins can see them.</p>}
        </div>
      )}
      <FormSheet template={t} open={open} onClose={() => setOpen(false)} onDone={() => reload()} />
    </div>
  );
}

// ───────── practice (the sandbox) ─────────

export function PracticeStep({ returnTo, done, preview }: { returnTo: string; done: boolean; preview: boolean }) {
  const href = `/practice?return=${encodeURIComponent(returnTo)}${preview ? '&preview=1' : ''}`;
  return (
    <div className="flex flex-col gap-4">
      <StepHeading eyebrow="Interactive" title="Practice the platform" />
      <p className="text-[16px] leading-relaxed text-ink-2">
        Try RAMP in a safe sandbox. Follow nine short missions and tap the glowing spot each time. It takes about five minutes, and nothing you do there is saved.
      </p>
      <div className="rounded-2xl bg-ink text-white p-5 flex flex-col gap-3">
        <p className="text-xs font-bold tracking-[0.08em] uppercase text-amber">Practice mode</p>
        <ul className="flex flex-col gap-1.5 text-[15px] text-white/85">
          <li>Find your training and start a module</li>
          <li>Create a task and send it for review</li>
          <li>Start a notebook page and message your mentor</li>
        </ul>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <LinkButton to={href} variant={done ? 'secondary' : 'primary'} icon={done ? 'replay' : 'play'}>{done ? 'Practice again' : 'Start practice'}</LinkButton>
          {done && <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-good-soft"><Icon name="check" size={16} />You’ve done this</span>}
        </div>
      </div>
    </div>
  );
}
