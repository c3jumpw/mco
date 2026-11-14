import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Job, Question } from '../lib/types';
import { DEFAULT_DOMAIN } from '../lib/supabase';
import {
  DEFAULT_POSTING, aiJobPrompt, ensureCodeWord, fullUrl, hintText, insertMissingTokens, mdToHtml, parseAiJob,
  postingPlain, splitUrl, stepsHaveVideo,
} from '../lib/posting';
import { FAMILIES, activityMinutes, activityWarnings, applyAiSteps, familyById, newStep, stepType, suggestFamily } from '../lib/steps';
import StepsEditor, { StepIcon } from './job/StepsEditor';
import { randomCode, randomSlug, randomWord, rangeLabel, storeJson } from '../lib/util';
import { DEFAULT_ACTIVITY, createJob, createJobFromWizard, freeCode, linkProblem, listJobs, takenLinks, updateJob } from './data';
import { ParsedSummary } from './AiImport';
import { Button, Card, CopyButton, Field, Input, Pill, Segmented, Select, Textarea, Toggle, cx, useToast } from '../ui';

type Step = 0 | 1 | 2 | 3 | 4 | 5;
interface WizardState {
  v?: number;
  step: Step;
  title: string;
  notes: string;
  questionCount: number;
  answer: '60-120' | '60-180' | '120-240';
  useCodeWord: boolean;
  codeWord: string;
  requireTranscript: boolean;
  domain: string;
  slug: string;
  parts: number;
  hintFormat: string;
  aiText: string;
  skippedAi: boolean;
  family?: string;        // role family the steps came from ('video' = classic video questions)
  steps?: Question[] | null;
  edited?: boolean;       // steps changed after picking a preset
}

const KEY = 'a1234_wizard';
const STEPS = ['Notes', 'Link', 'Activity', 'AI prompt', 'Paste reply', 'Launch'];
const videoSteps = (n: number) => Array.from({ length: n }, () => newStep('video'));

/** Drafts saved before the Activity step existed: shift them along one step. */
function upgrade(saved: WizardState | null): Partial<WizardState> {
  if (!saved) return {};
  if (saved.v === 2) return saved;
  return { ...saved, v: 2, step: (saved.step >= 2 ? saved.step + 1 : saved.step) as Step, family: 'video', steps: videoSteps(saved.questionCount || 5) };
}
const HINTS = ['Part {n} of {total}: {text}', 'Clue {n}: {text}', '[{text}]', 'Key: {text}'];

function fresh(): WizardState {
  const slug = randomCode();
  return {
    v: 2, step: 0, title: '', notes: '', questionCount: 5, answer: '60-180', useCodeWord: true, codeWord: randomWord(),
    requireTranscript: true, domain: DEFAULT_DOMAIN, slug, parts: 4, hintFormat: HINTS[0], aiText: '', skippedAi: false,
    family: undefined, steps: null, edited: false,
  };
}

export default function NewJobWizard() {
  const nav = useNavigate();
  const toast = useToast();
  const [s, setS] = useState<WizardState>(() => ({ ...fresh(), ...upgrade(storeJson<WizardState>(KEY)) }));
  const [created, setCreated] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dupId, setDupId] = useState('');

  const set = (p: Partial<WizardState>) => setS((prev) => {
    const next = { ...prev, ...p };
    storeJson(KEY, next);
    return next;
  });
  const [taken, setTaken] = useState<Map<string, string> | null>(null);
  useEffect(() => { listJobs().then(setJobs).catch(() => {}); }, []);
  useEffect(() => {
    takenLinks().then((t) => {
      setTaken(t);
      // A saved draft's random link may have been used by another job since. Swap it quietly.
      setS((prev) => (linkProblem(prev.slug, t) && /^[a-z0-9]{4}-[a-z0-9]{4}$/.test(prev.slug) ? { ...prev, slug: freeCode(t) } : prev));
    }).catch(() => setTaken(new Map()));
  }, []);
  const slugProblem = taken ? linkProblem(s.slug, taken) : null;
  const newRandom = () => set({ slug: taken ? freeCode(taken) : randomCode() });
  const newWordSlug = () => {
    let next = randomSlug();
    for (let i = 0; taken && i < 30 && linkProblem(next, taken); i++) next = randomSlug();
    set({ slug: next });
  };
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [s.step, created]);

  const [ansMin, ansMax] = s.answer.split('-').map(Number);
  const range = rangeLabel(ansMin, ansMax);
  const url = fullUrl(s.domain, s.slug);
  const fragments = useMemo(() => splitUrl(url, s.parts).map((text) => ({ text })), [url, s.parts]);
  const codeWord = s.useCodeWord ? s.codeWord : undefined;
  const steps = s.steps || [];
  const hasVideo = steps.some((q) => stepType(q) === 'video');
  const prompt = aiJobPrompt({ title: s.title, notes: s.notes, parts: fragments.length, questionCount: s.questionCount, answerRange: range, codeWord, steps });
  const parsed = useMemo(() => parseAiJob(s.aiText), [s.aiText]);
  const finalTitle = (s.title.trim() || parsed.title || '').trim();
  const video = stepsHaveVideo(steps);
  const finalPosting = s.skippedAi || !parsed.posting
    ? ensureCodeWord(insertMissingTokens(s.skippedAi ? DEFAULT_POSTING : parsed.posting || DEFAULT_POSTING, fragments.length), codeWord, video)
    : ensureCodeWord(insertMissingTokens(parsed.posting, fragments.length), codeWord, video);
  const placeholders = Array.from(new Set(finalPosting.match(/\[add [^\]]+\]/gi) || []));
  // The AI fills in the chosen steps; an older-style reply with only screening questions still works.
  const finalSteps: Question[] = useMemo(() => {
    if (s.skippedAi) return steps;
    if (parsed.steps.length) return applyAiSteps(steps, parsed.steps);
    if (parsed.questions.length && steps.every((q) => stepType(q) === 'video')) return parsed.questions.slice(0, 8).map((q) => newStep('video', q.text, { guidance: q.guidance }));
    return steps;
  }, [s.skippedAi, steps, parsed]);
  const stepIssues = activityWarnings(finalSteps).filter((w) => /no question yet|at least 2 options|empty option|placeholder|to critique|No steps/.test(w));
  const suggested = suggestFamily(s.title, s.notes);

  const go = (step: Step) => {
    // First visit to the Activity step: start from the suggested preset.
    if (step === 2 && !s.steps) set({ step, family: suggested.id, steps: suggested.steps(), edited: false });
    else set({ step });
  };
  // A draft saved on the Activity step before its steps were picked.
  useEffect(() => {
    if (s.step === 2 && !s.steps) set({ family: suggested.id, steps: suggested.steps(), edited: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.step, s.steps]);
  const pickFamily = (id: string) => {
    if (id === s.family) return;
    if (s.edited && !confirm('Replace your edited steps with this preset?')) return;
    set({ family: id, steps: id === 'video' ? videoSteps(s.questionCount) : familyById(id)!.steps(), edited: false });
  };

  // Re-check against the latest jobs, in case one was created in another tab.
  const freshProblem = async () => {
    const t = await takenLinks();
    setTaken(t);
    return linkProblem(s.slug, t);
  };
  const checkSlugThenNext = async () => {
    const problem = await freshProblem();
    if (problem) { toast(problem, 'bad'); return; }
    go(2);
  };
  const promptNext = () => go(3);

  const create = async (goLive = false) => {
    setBusy(true);
    try {
      const problem = await freshProblem();
      if (problem) { toast(`${problem} Go back to step 2 and pick another link.`, 'bad'); setBusy(false); return; }
      const job = await createJobFromWizard({
        title: finalTitle || 'New role',
        notes: s.notes,
        posting: finalPosting,
        domain: s.domain,
        slug: s.slug,
        parts: s.parts,
        hint_format: s.hintFormat,
        activity: {
          ...DEFAULT_ACTIVITY,
          answer_min: ansMin,
          answer_max: ansMax,
          require_transcript: s.requireTranscript && hasVideo,
          hidden_code: codeWord || '',
          extra: hasVideo ? 'Title each video **Q1 – Your Name**, **Q2 – Your Name**, and so on, and set sharing so anyone with the link can watch it.' : '',
        },
        questions: finalSteps,
        interview: s.skippedAi ? [] : parsed.interview,
        rubric: s.skippedAi ? [] : parsed.rubric,
      });
      if (goLive && job.questions.length && !stepIssues.length) {
        await updateJob(job.id, { status: 'published', published_at: new Date().toISOString() });
        job.status = 'published';
      }
      storeJson(KEY, null);
      setCreated(job);
    } catch (e: any) {
      toast(e?.code === '23505' ? 'That link is already used. Go back and generate a new one.' : e?.message || 'Could not create the job', 'bad');
    }
    setBusy(false);
  };

  const duplicate = async () => {
    const from = jobs.find((j) => j.id === dupId);
    if (!from) return;
    setBusy(true);
    try {
      const job = await createJob({ from });
      nav(`/admin/jobs/${job.id}?tab=puzzle`);
    } catch (e: any) { toast(e?.message || 'Could not duplicate', 'bad'); }
    setBusy(false);
  };

  if (created) return <Launched job={created} placeholders={placeholders} onLive={(j) => setCreated(j)} />;

  return (
    <div className="rise max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-muted mb-3">
        <Link to="/admin" className="hover:text-ink">Jobs</Link><span>/</span><span>New job</span>
        <button className="ml-auto text-[12px] underline underline-offset-2 hover:text-ink"
          onClick={() => { if (confirm('Clear this draft and start over?')) { storeJson(KEY, null); setS(fresh()); } }}>Start over</button>
      </div>
      <h1 className="font-display text-4xl sm:text-5xl leading-none">From notes to posting.</h1>
      <p className="text-sm text-muted mt-2">Your progress saves as you go, so you can switch to your AI tool and come back.</p>

      <ol className="mt-6 mb-6 grid grid-cols-6 gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" disabled={i > s.step} onClick={() => go(i as Step)} className="w-full text-left disabled:cursor-default">
              <span className={cx('block h-1.5 rounded-full transition', i < s.step ? 'bg-ink' : i === s.step ? 'bg-accent' : 'bg-line')} />
              <span className={cx('block mt-1.5 text-[11px] sm:text-[12px] truncate', i === s.step ? 'text-ink font-medium' : 'text-muted')}>
                <span className="font-mono">{i + 1}</span> {label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {s.step === 0 && (
        <div className="space-y-5">
          <Card>
            <div className="space-y-4">
              <Field label="Your notes on the role" hint="Duties, must-haves, schedule, pay, what thriving looks like. Rough notes are fine.">
                <Textarea rows={10} autoFocus value={s.notes} onChange={(e) => set({ notes: e.target.value })}
                  placeholder="- Looking for an executive assistant to work with the CEO day to day…" />
              </Field>
              <Field label="Job title (optional)" hint="Leave blank and the AI suggests one.">
                <Input value={s.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Executive Assistant to the CEO" />
              </Field>
            </div>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" disabled={!s.notes.trim()} onClick={() => go(1)}>Next: the link →</Button>
            {!s.notes.trim() && <span className="text-sm text-muted">Add your notes to continue.</span>}
          </div>
          {jobs.length > 0 && (
            <details className="rounded-2xl border border-dashed border-line px-4 py-3">
              <summary className="text-sm text-muted cursor-pointer">Hiring for a similar role again? Duplicate a job instead</summary>
              <div className="flex gap-2 mt-3">
                <Select value={dupId} onChange={(e) => setDupId(e.target.value)}>
                  <option value="">Choose a job…</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                </Select>
                <Button disabled={!dupId || busy} onClick={duplicate}>Duplicate</Button>
              </div>
              <p className="text-xs text-muted mt-2">Copies the posting, activity page and questions with a fresh private link.</p>
            </details>
          )}
        </div>
      )}

      {s.step === 1 && (
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">The hidden link</h2>
            <p className="text-sm text-muted mt-1">Candidates have to find these pieces in the posting and put them together. A random code keeps the job private: nobody can guess it, and the site never lists jobs.</p>
            <div className="mt-4 rounded-xl bg-ink text-white px-4 py-3 font-mono text-[16px] break-all">
              {fragments.map((f, i) => <span key={i} className={i % 2 ? 'text-accent' : ''}>{f.text}</span>)}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" onClick={newRandom}>New random code</Button>
              <Button size="sm" variant="ghost" onClick={newWordSlug}>Word + number</Button>
            </div>
            <Field className="mt-4" label="Or type your own" hint="Lowercase letters, numbers and dashes.">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted text-sm">{s.domain}/</span>
                <Input mono className="pl-[8.5rem]" value={s.slug}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 63) })} />
              </div>
              <LinkCheck checking={!taken} problem={slugProblem} />
            </Field>
          </Card>
          <Card>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Number of pieces" hint="More pieces, harder puzzle.">
                <Segmented value={String(s.parts)} onChange={(v) => set({ parts: Number(v) })} options={['3', '4', '5'].map((n) => ({ id: n, label: n }))} />
              </Field>
              <Field label="How each piece appears">
                <Select value={s.hintFormat} onChange={(e) => set({ hintFormat: e.target.value })}>
                  {HINTS.map((h) => <option key={h} value={h}>{hintText(h, 0, fragments.length, 'apply1234')}{h.includes('{n}') ? '' : ' (no order given: harder)'}</option>)}
                </Select>
              </Field>
            </div>
            <ul className="mt-4 space-y-1">
              {fragments.map((f, i) => <li key={i} className="font-mono text-[13px] text-ink-2">{hintText(s.hintFormat, i, fragments.length, f.text)}</li>)}
            </ul>
          </Card>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => go(0)}>Back</Button>
            <Button variant="primary" size="lg" disabled={!!slugProblem} onClick={checkSlugThenNext}>Next: the activity →</Button>
          </div>
        </div>
      )}

      {s.step === 2 && (
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">What candidates will do</h2>
            <p className="text-sm text-muted mt-1">
              Pick the kind of role and you get a set of steps that tests what matters for it. Change, add or remove steps below; the AI writes them for this job on the next step.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {FAMILIES.map((f) => (
                <button key={f.id} onClick={() => pickFamily(f.id)} title={f.examples}
                  className={cx('rounded-full border px-3 py-1.5 text-[13px] transition', s.family === f.id ? 'bg-ink text-white border-ink' : 'border-line hover:border-ink/30')}>
                  {f.label}{f.id === suggested.id && s.family !== f.id && <span className="ml-1 text-accent">•</span>}
                </button>
              ))}
              <button onClick={() => pickFamily('video')}
                className={cx('rounded-full border px-3 py-1.5 text-[13px] transition', s.family === 'video' ? 'bg-ink text-white border-ink' : 'border-line border-dashed hover:border-ink/30')}>
                Video questions only
              </button>
            </div>
            {s.family && s.family !== 'video' && (
              <p className="text-[13px] text-ink-2 mt-3">
                {s.family === suggested.id ? 'Suggested from your notes. ' : ''}Tests <strong>{familyById(s.family)?.shows.toLowerCase()}</strong>.
                {' '}<span className="text-muted">Examples: {familyById(s.family)?.examples}.</span>
              </p>
            )}
            {s.family === 'video' && (
              <div className="mt-3 flex items-center gap-3 text-sm">
                How many?
                <Segmented size="sm" value={String(s.questionCount)} onChange={(v) => set({ questionCount: Number(v), steps: videoSteps(Number(v)), edited: false })}
                  options={['2', '3', '4', '5', '6'].map((n) => ({ id: n, label: n }))} />
              </div>
            )}
          </Card>
          <StepsEditor steps={steps} compact aiFills title={s.title} notes={s.notes} activity={{ answer_max: ansMax }}
            onChange={(next) => set({ steps: next, edited: true })} />
          <Card>
            <div className="space-y-4">
              {hasVideo && (
                <Field label="Video answer length">
                  <Segmented value={s.answer} onChange={(v) => set({ answer: v })}
                    options={[{ id: '60-120', label: '1–2 min' }, { id: '60-180', label: '1–3 min' }, { id: '120-240', label: '2–4 min' }]} />
                </Field>
              )}
              <Toggle checked={s.useCodeWord} onChange={(v) => set({ useCodeWord: v })}
                label={<>Hidden code-word test {s.useCodeWord && <span className="font-mono text-accent">“{s.codeWord}”</span>}</>}
                hint={video ? 'The posting asks candidates to put this word in every video title. Submissions are checked for it automatically.'
                  : 'The posting asks candidates to use this word in a written answer. Submissions are checked for it automatically.'} />
              {s.useCodeWord && (
                <button className="text-[12px] text-muted underline underline-offset-2 -mt-2 ml-[52px]" onClick={() => set({ codeWord: randomWord(s.codeWord) })}>Pick another word</button>
              )}
              {hasVideo && (
                <Toggle checked={s.requireTranscript} onChange={(v) => set({ requireTranscript: v })}
                  label="Ask for video transcripts" hint="Candidates paste Loom's transcript under each video, so AI exports can read what they said." />
              )}
            </div>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => go(1)}>Back</Button>
            <Button variant="primary" size="lg" disabled={!steps.length} onClick={promptNext}>Next: AI prompt →</Button>
            <span className="text-sm text-muted">{steps.length} steps · about {activityMinutes(steps, { answer_max: ansMax })} min for candidates</span>
          </div>
        </div>
      )}

      {s.step === 3 && (
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Let AI draft the job</h2>
            <ol className="text-sm text-ink-2 mt-2 space-y-1.5 list-decimal pl-5 leading-relaxed">
              <li>Copy the prompt. It includes your notes and tells the AI exactly how to format its reply.</li>
              <li>Paste it into Claude, ChatGPT or Gemini.</li>
              <li>Copy the AI's whole reply and come back here.</li>
            </ol>
            <div className="flex flex-wrap gap-2 mt-4">
              <CopyButton size="lg" variant="primary" label="Copy prompt" done="Prompt copied" text={prompt} />
              <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer"><Button size="lg">Open Claude ↗</Button></a>
            </div>
            <details className="mt-4">
              <summary className="text-sm text-muted cursor-pointer">See the prompt</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-paper p-3 text-[12px] font-mono whitespace-pre-wrap">{prompt}</pre>
            </details>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => go(2)}>Back</Button>
            <Button variant="primary" size="lg" onClick={() => { set({ skippedAi: false }); go(4); }}>I have the reply →</Button>
            <button className="text-sm text-muted underline underline-offset-2" onClick={() => { set({ skippedAi: true }); go(5); }}>Skip: I'll write it myself</button>
          </div>
        </div>
      )}

      {s.step === 4 && (
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Paste the AI's reply</h2>
            <p className="text-sm text-muted mt-1">Paste all of it. The app splits it into the title, posting, activity steps, interview kit and rubric.</p>
            <Textarea rows={10} autoGrow={false} className="mt-3 font-mono text-[13px]" value={s.aiText}
              placeholder={'# TITLE\n…\n\n# POSTING\n…\n\n# ACTIVITY STEPS\n…'} onChange={(e) => set({ aiText: e.target.value })} />
            {s.aiText.trim() && parsed.sections.length === 0 && (
              <p className="mt-3 rounded-xl bg-warn-soft text-warn text-sm px-4 py-3">
                No section headings found, so this will be used as the posting only. For the full import, the reply needs the headings # TITLE, # POSTING, # ACTIVITY STEPS, # INTERVIEW QUESTIONS and # RUBRIC. Try asking the AI to “use the exact format from my prompt”.
              </p>
            )}
            {s.aiText.trim() && parsed.sections.length > 0 && !parsed.steps.length && steps.some((q) => stepType(q) !== 'video') && (
              <p className="mt-3 rounded-xl bg-warn-soft text-warn text-sm px-4 py-3">
                The reply has no # ACTIVITY STEPS section, so your steps keep their preset wording. You can edit them after creating the job.
              </p>
            )}
          </Card>
          {s.aiText.trim() && (
            <Card>
              <h3 className="text-[15px] font-semibold mb-1">What the app found</h3>
              <ParsedSummary parsed={parsed} parts={fragments.length} fragments={fragments} hintFormat={s.hintFormat} codeWord={codeWord} />
            </Card>
          )}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => go(3)}>Back</Button>
            <Button variant="primary" size="lg" disabled={!s.aiText.trim()} onClick={() => go(5)}>Next: review →</Button>
          </div>
        </div>
      )}

      {s.step === 5 && (
        <div className="space-y-5">
          <Card>
            <Field label="Job title">
              <Input value={finalTitle} onChange={(e) => set({ title: e.target.value })} placeholder="Job title" />
            </Field>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Fact k="Link" v={<span className="font-mono break-all">{url}</span>} />
              <Fact k="Pieces in posting" v={`${fragments.length}`} />
              <Fact k="Activity" v={`${finalSteps.length} steps · about ${activityMinutes(finalSteps, { answer_max: ansMax })} min`} warn={!finalSteps.length} />
              {hasVideo ? <Fact k="Video length" v={range} /> : <Fact k="Video" v="None required" />}
              <Fact k="Interview questions" v={s.skippedAi ? 'Add later' : `${parsed.interview.length}`} />
              <Fact k="Code word" v={codeWord ? <span className="font-mono">{codeWord}</span> : 'Off'} />
            </dl>
          </Card>
          <Card>
            <p className="text-sm font-medium mb-2">Activity steps</p>
            <ol className="space-y-1.5">
              {finalSteps.map((q, i) => (
                <li key={q.id} className="flex gap-2.5 text-sm">
                  <StepIcon type={stepType(q)} className="h-4 w-4 mt-0.5 text-muted shrink-0" />
                  <span className="min-w-0 line-clamp-2"><span className="text-muted font-mono text-[12px] mr-1">{i + 1}</span>{q.text.replace(/```[\s\S]*?```/g, '[code]') || <em className="text-muted">No question yet</em>}</span>
                </li>
              ))}
            </ol>
            {stepIssues.length > 0 && <p className="text-xs text-warn mt-3">{stepIssues.join(' ')} Fix these on the job’s Steps tab before going live.</p>}
          </Card>
          {placeholders.length > 0 && (
            <Card className="border-warn/30 bg-warn-soft/40">
              <p className="text-sm font-medium text-warn">Fill these in before going live</p>
              <p className="text-sm text-ink-2 mt-1">{placeholders.join(' · ')}</p>
              <p className="text-xs text-muted mt-1">Edit them on the job's “Notes & posting” tab after you create it.</p>
            </Card>
          )}
          <Card pad={false}>
            <details>
              <summary className="px-5 py-4 text-sm font-medium cursor-pointer">Preview the posting</summary>
              <div className="px-5 pb-5">
                <h1 className="font-display text-3xl">{finalTitle || 'New role'}</h1>
                <div className="prose-posting" dangerouslySetInnerHTML={{ __html: mdToHtml(finalPosting, 'hint', fragments, s.hintFormat) }} />
              </div>
            </details>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => go(s.skippedAi ? 3 : 4)}>Back</Button>
            <Button variant="primary" size="lg" disabled={busy} onClick={() => create(false)}>Create as draft</Button>
            <Button variant="accent" size="lg" disabled={busy || placeholders.length > 0 || !finalSteps.length || stepIssues.length > 0 || s.skippedAi}
              onClick={() => create(true)}>Create and go live</Button>
          </div>
          <p className="text-xs text-muted">Drafts aren't visible to candidates. You can preview them while signed in.</p>
        </div>
      )}
    </div>
  );
}

function Fact({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className={cx('font-medium', warn && 'text-warn')}>{v}</dd>
    </div>
  );
}

function Launched({ job, placeholders, onLive }: { job: Job; placeholders: string[]; onLive: (j: Job) => void }) {
  const toast = useToast();
  const live = job.status === 'published';
  const plain = () => `${job.title}\n\n` + postingPlain(job.posting, job.fragments, job.hint_format);
  const html = () => `<h1>${job.title}</h1>` + mdToHtml(job.posting, undefined, job.fragments, job.hint_format);
  const stepsUnfinished = activityWarnings(job.questions).some((w) => /placeholder|no question yet|empty option|to critique/.test(w));
  const extra = stepsUnfinished ? 1 : 0;
  return (
    <div className="rise max-w-2xl">
      <p className="font-mono text-sm text-good">✓ {live ? 'Created and live' : 'Created as a draft'}</p>
      <h1 className="font-display text-5xl leading-none mt-3">{job.title}</h1>
      <div className="mt-8 space-y-4">
        <Step n={1} title="Check the activity page" body="See exactly what candidates see after they find the link.">
          <a href={`${window.location.origin}/${job.slug}`} target="_blank" rel="noreferrer"><Button>Preview as candidate ↗</Button></a>
        </Step>
        {stepsUnfinished && (
          <Step n={2} title="Finish the activity steps" body="Some steps still have [placeholders] or missing parts.">
            <Link to={`/admin/jobs/${job.id}?tab=questions`}><Button>Open steps</Button></Link>
          </Step>
        )}
        <Step n={2 + extra} title={placeholders.length ? 'Finish the posting' : 'Review the posting'}
          body={placeholders.length ? `Still to fill in: ${placeholders.join(', ')}.` : 'Tweak wording, then save a version.'}>
          <Link to={`/admin/jobs/${job.id}?tab=posting`}><Button>Open posting</Button></Link>
        </Step>
        <Step n={3 + extra} title="Go live" body="Opens the activity page to candidates.">
          {live ? <Pill tone="good">Live</Pill> : (
            <Button variant="accent" disabled={placeholders.length > 0 || !job.questions.length || stepsUnfinished} onClick={async () => {
              const err = await updateJob(job.id, { status: 'published', published_at: new Date().toISOString() });
              if (err) toast(err.message, 'bad'); else { toast('Live'); onLive({ ...job, status: 'published' }); }
            }}>Go live</Button>
          )}
          {!live && (placeholders.length > 0 || stepsUnfinished) && <p className="text-xs text-muted mt-2">Fill in the placeholders first.</p>}
        </Step>
        <Step n={4 + extra} title="Post it on job boards" body="The pieces of the link are filled in. Paste it into Indeed, LinkedIn or anywhere else.">
          <div className="flex flex-wrap gap-2">
            <CopyButton variant="primary" label="Copy formatted" text={plain} html={html} done="Posting copied" />
            <CopyButton label="Copy plain text" text={plain} />
            <Link to={`/admin/jobs/${job.id}?tab=puzzle`}><Button size="sm" variant="ghost">Make a link per job board</Button></Link>
          </div>
        </Step>
      </div>
      <Link to={`/admin/jobs/${job.id}`} className="inline-block mt-8 text-sm underline underline-offset-4 text-muted hover:text-ink">Open the full job →</Link>
    </div>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex gap-4">
        <span className="font-mono text-sm h-7 w-7 shrink-0 rounded-full border border-ink/20 flex items-center justify-center">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted mt-0.5">{body}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export function LinkCheck({ checking, problem }: { checking: boolean; problem: string | null }) {
  if (checking) return <p className="text-xs text-muted mt-1.5">Checking that no other job uses this link…</p>;
  if (problem) return <p className="text-xs text-bad mt-1.5 font-medium">✗ {problem}</p>;
  return <p className="text-xs text-good mt-1.5 font-medium">✓ Available. No other job uses this link or anything close to it.</p>;
}
