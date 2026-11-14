// Builds a job's activity from step types: a library to add from, role-family presets, and settings per type.
import { useState } from 'react';
import type { Activity, PasteRule, Question, StepType } from '../../lib/types';
import {
  FAMILIES, STEP_TYPES, activityMinutes, activityWarnings, familyById, newStep, stepInfo, stepType, suggestFamily, type RoleFamily,
} from '../../lib/steps';
import { uploadPublicImage } from '../../lib/files';
import { Button, Card, Input, Modal, Segmented, Select, Spinner, Textarea, Toggle, cx, useToast } from '../../ui';

/** A small glyph per step type, so a list of steps scans at a glance. */
export function StepIcon({ type, className }: { type: StepType; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<StepType, React.ReactNode> = {
    video: <><rect x="3" y="6" width="12" height="12" rx="2" {...p} /><path d="M15 10l6-3v10l-6-3" {...p} /></>,
    written: <><path d="M4 20h4L19 9l-4-4L4 16v4z" {...p} /><path d="M13 7l4 4" {...p} /></>,
    choice: <><rect x="3" y="7" width="8" height="10" rx="1.5" {...p} /><path d="M14 9h7M14 13h7M14 17h4" {...p} /></>,
    voice: <><rect x="9" y="3" width="6" height="11" rx="3" {...p} /><path d="M5 11a7 7 0 0014 0M12 18v3" {...p} /></>,
    work: <><rect x="3" y="7" width="18" height="13" rx="2" {...p} /><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" {...p} /></>,
    brief: <><path d="M6 3h9l4 4v14H6z" {...p} /><path d="M14 3v5h5M9 13h6M9 17h6" {...p} /></>,
    critique: <><circle cx="11" cy="11" r="6" {...p} /><path d="M20 20l-4.5-4.5" {...p} /></>,
    rank: <><path d="M4 6h10M4 12h7M4 18h4" {...p} /><path d="M18 5v14M15 16l3 3 3-3" {...p} /></>,
    quiz: <><circle cx="12" cy="13" r="8" {...p} /><path d="M12 9v4l2.5 2M10 2h4" {...p} /></>,
    musthave: <><rect x="3" y="3" width="18" height="18" rx="3" {...p} /><path d="M8 12l3 3 5-6" {...p} /></>,
  };
  return <svg viewBox="0 0 24 24" className={cx('h-5 w-5', className)} aria-hidden>{paths[type]}</svg>;
}

const TIME_OPTS = [30, 45, 60, 90, 120, 180, 300];
const secLabel = (s: number) => (s < 60 ? `${s} sec` : `${s / 60} min`);

export default function StepsEditor({ steps, onChange, activity, jobId, title, notes, live, compact, aiFills }: {
  steps: Question[];
  onChange: (steps: Question[]) => void;
  activity?: Activity;
  jobId?: string;
  title?: string;
  notes?: string;
  live?: boolean;
  compact?: boolean;
  aiFills?: boolean; // in the wizard, the AI fills [placeholders] on the next step
}) {
  const [library, setLibrary] = useState(false);
  const [presets, setPresets] = useState(false);
  const mins = activityMinutes(steps, activity);
  const all = activityWarnings(steps, activity);
  const warnings = aiFills ? all.filter((w) => !/placeholder|no question yet/.test(w)) : all;
  const placeholders = aiFills && all.some((w) => /placeholder|no question yet/.test(w));
  const setStep = (id: string, p: Partial<Question>) => onChange(steps.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const changeType = (q: Question, type: StepType) =>
    onChange(steps.map((s) => (s.id === q.id ? newStep(type, q.text, { id: q.id, guidance: q.guidance, optional: q.optional }) : s)));
  const suggested = suggestFamily(title || '', notes || '');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          <strong className="text-ink">{steps.length} step{steps.length === 1 ? '' : 's'}</strong>
          {steps.length > 0 && <> · about {mins} minutes for the candidate</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPresets(true)}>Presets by role</Button>
          <Button size="sm" onClick={() => setLibrary(true)}>+ Add a step</Button>
        </div>
      </div>
      {live && <p className="text-xs text-warn">This job is live. Changes apply to new candidates; submitted answers keep the wording they were given.</p>}
      {placeholders && <p className="text-xs text-muted">Text in [square brackets] is filled in by the AI from your notes on the next step.</p>}
      {warnings.length > 0 && steps.length > 0 && (
        <ul className="rounded-xl bg-warn-soft/70 text-warn text-[13px] px-4 py-2.5 space-y-1 list-disc pl-8">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      {steps.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="font-medium">No steps yet.</p>
          <p className="text-sm text-muted mt-1">Start from the {suggested.label.toLowerCase()} preset, or add steps one by one.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => onChange(suggested.steps())}>Use the {suggested.label} preset</Button>
            <Button onClick={() => setLibrary(true)}>Add a step</Button>
          </div>
        </div>
      )}
      {steps.map((q, i) => (
        <StepEditorCard key={q.id} q={q} i={i} total={steps.length} compact={compact} jobId={jobId}
          set={(p) => setStep(q.id, p)} move={(d) => move(i, d)} changeType={(t) => changeType(q, t)}
          remove={() => confirm('Remove this step?') && onChange(steps.filter((s) => s.id !== q.id))} />
      ))}
      {steps.length > 0 && (
        <button onClick={() => setLibrary(true)}
          className="w-full rounded-2xl border border-dashed border-line py-3 text-sm font-medium text-ink-2 hover:border-ink/40 hover:text-ink transition">
          + Add a step
        </button>
      )}

      <Modal open={library} onClose={() => setLibrary(false)} title="Add a step" wide>
        <StepLibrary onPick={(t) => { onChange([...steps, newStep(t)]); setLibrary(false); }} />
      </Modal>
      <Modal open={presets} onClose={() => setPresets(false)} title="Presets by role" wide>
        <FamilyPicker suggested={suggested.id} onPick={(f, mode) => {
          onChange(mode === 'replace' ? f.steps() : [...steps, ...f.steps()]);
          setPresets(false);
        }} hasSteps={steps.length > 0} />
      </Modal>
    </div>
  );
}

export function StepLibrary({ onPick }: { onPick: (t: StepType) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {STEP_TYPES.map((t) => (
        <button key={t.id} onClick={() => onPick(t.id)}
          className="text-left rounded-xl border border-line p-3.5 hover:border-ink/40 hover:bg-paper transition flex gap-3">
          <span className="grid place-items-center h-9 w-9 rounded-lg bg-paper-2 text-ink shrink-0"><StepIcon type={t.id} /></span>
          <span className="min-w-0">
            <span className="block font-medium text-[15px]">{t.label}</span>
            <span className="block text-[13px] text-ink-2 leading-snug mt-0.5">{t.desc}</span>
            <span className="block text-[12px] text-muted mt-1">Shows: {t.shows}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function FamilyPicker({ suggested, onPick, hasSteps }: { suggested?: string; onPick: (f: RoleFamily, mode: 'replace' | 'add') => void; hasSteps: boolean }) {
  const [sel, setSel] = useState(suggested || FAMILIES[0].id);
  const f = familyById(sel)!;
  const preview = f.steps();
  return (
    <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {FAMILIES.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)}
            className={cx('w-full text-left rounded-lg px-3 py-2 transition', sel === x.id ? 'bg-ink text-white' : 'hover:bg-paper-2')}>
            <span className="block text-sm font-medium">{x.label}{x.id === suggested && <span className={cx('ml-1.5 text-[11px] font-normal', sel === x.id ? 'text-white/70' : 'text-accent')}>Suggested</span>}</span>
            <span className={cx('block text-[12px] leading-snug', sel === x.id ? 'text-white/70' : 'text-muted')}>{x.examples}</span>
          </button>
        ))}
      </div>
      <div>
        <p className="text-sm text-ink-2">Tests: <strong>{f.shows}</strong>. About {activityMinutes(preview)} minutes.</p>
        <ol className="mt-3 space-y-2">
          {preview.map((q, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-line px-3 py-2.5">
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-paper-2 shrink-0"><StepIcon type={stepType(q)} className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block text-[12px] text-muted">{stepInfo(stepType(q)).label}{q.optional ? ' · optional' : ''}</span>
                <span className="block text-sm leading-snug line-clamp-2">{q.text.replace(/```[\s\S]*?```/g, '[code]')}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted mt-3">Text in [square brackets] is for you to fill in, or the AI prompt fills it from your notes.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => onPick(f, 'replace')}>{hasSteps ? 'Replace my steps' : 'Use these steps'}</Button>
          {hasSteps && <Button onClick={() => onPick(f, 'add')}>Add to my steps</Button>}
        </div>
      </div>
    </div>
  );
}

function StepEditorCard({ q, i, total, set, move, remove, changeType, compact, jobId }: {
  q: Question; i: number; total: number; set: (p: Partial<Question>) => void; move: (d: -1 | 1) => void;
  remove: () => void; changeType: (t: StepType) => void; compact?: boolean; jobId?: string;
}) {
  const t = stepType(q);
  const [open, setOpen] = useState(!compact || !q.text.trim());
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <button className="flex items-center gap-2.5 min-w-0 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="grid place-items-center h-8 w-8 rounded-lg bg-paper-2 shrink-0"><StepIcon type={t} className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block font-mono text-[11px] text-muted">STEP {i + 1} · {stepInfo(t).label.toUpperCase()}{q.optional ? ' · OPTIONAL' : ''}</span>
            {!open && <span className="block text-sm truncate">{q.text.replace(/```[\s\S]*?```/g, '[code]') || 'No question yet'}</span>}
          </span>
        </button>
        <div className="flex gap-0.5 shrink-0">
          <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(-1)} aria-label="Move up">↑</Button>
          <Button size="sm" variant="ghost" disabled={i === total - 1} onClick={() => move(1)} aria-label="Move down">↓</Button>
          <Button size="sm" variant="ghost" onClick={remove} aria-label="Remove step">✕</Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <Textarea rows={t === 'brief' ? 3 : 2} value={q.text} placeholder={placeholderFor(t)} onChange={(e) => set({ text: e.target.value })} />
          <Input className="text-sm" placeholder="Tip for the candidate (optional)" value={q.guidance || ''} onChange={(e) => set({ guidance: e.target.value })} />
          <TypeSettings q={q} set={set} jobId={jobId} />
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4 accent-ink" checked={!!q.optional} onChange={(e) => set({ optional: e.target.checked })} />
              Optional step
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              Type
              <span className="w-40 block">
                <Select className="h-8 text-[13px]" value={t} onChange={(e) => changeType(e.target.value as StepType)}>
                  {STEP_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </Select>
              </span>
            </label>
          </div>
        </div>
      )}
    </Card>
  );
}

function placeholderFor(t: StepType): string {
  return {
    video: 'e.g. Tell us about a time you had to figure something out with no instructions.',
    written: 'e.g. A customer writes: “…”. Write your reply.',
    choice: 'e.g. Walk us through how you’d plan your first week.',
    voice: 'e.g. In 60 seconds, tell us why this role.',
    work: 'e.g. Share up to 3 pieces of work you’re proud of. For each, tell us your role and the result.',
    brief: 'The task, written to the candidate. Markdown works: **bold**, lists, tables and ```code```.',
    critique: 'e.g. Look at our homepage. What works, what would you change first, and why?',
    rank: 'e.g. It’s Monday at 8am. Put these in the order you’d deal with them.',
    quiz: 'The scenario, or the snippet to spot the error in. Markdown and ```code``` work.',
    musthave: 'e.g. Do you hold a valid driver’s licence?',
  }[t];
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <span className="text-[13px] font-medium">{label}{hint && <span className="block text-[12px] text-muted font-normal">{hint}</span>}</span>
      {children}
    </div>
  );
}

function PasteSetting({ q, set, allowBlock = true }: { q: Question; set: (p: Partial<Question>) => void; allowBlock?: boolean }) {
  const opts: { id: PasteRule; label: string }[] = [{ id: 'allow', label: 'Allow' }, { id: 'flag', label: 'Allow & note' }];
  if (allowBlock) opts.push({ id: 'block', label: 'Block' });
  return (
    <Row label="Pasting" hint={q.paste === 'block' ? 'Best for timed steps, where there’s no time to draft elsewhere.' : 'Typed vs pasted is shown on the candidate’s answer.'}>
      <Segmented size="sm" value={q.paste || 'flag'} onChange={(paste) => set({ paste })} options={opts} />
    </Row>
  );
}

function TimeSelect({ value, onChange, none, opts = TIME_OPTS }: { value?: number | null; onChange: (v: number | null) => void; none?: string; opts?: number[] }) {
  return (
    <div className="w-32 shrink-0">
      <Select className="h-8 text-[13px]" value={value || ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        {none && <option value="">{none}</option>}
        {opts.map((s) => <option key={s} value={s}>{secLabel(s)}</option>)}
      </Select>
    </div>
  );
}

function OptionsEditor({ q, set, quiz }: { q: Question; set: (p: Partial<Question>) => void; quiz?: boolean }) {
  const opts = q.options || [];
  const setOpts = (options: string[], correct = q.correct) => set({ options, ...(quiz ? { correct } : {}) });
  const remove = (i: number) => {
    const c = q.correct ?? 0;
    setOpts(opts.filter((_, j) => j !== i), c === i ? 0 : c > i ? c - 1 : c);
  };
  return (
    <div>
      <p className="text-[13px] font-medium mb-1.5">{quiz ? 'Options · tick the best answer' : 'Items to put in order'}</p>
      <div className="space-y-1.5">
        {opts.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            {quiz
              ? <input type="radio" name={`correct-${q.id}`} className="h-4 w-4 accent-good" checked={(q.correct ?? 0) === i} onChange={() => set({ correct: i })} aria-label={`Option ${i + 1} is the best answer`} />
              : <span className="font-mono text-[12px] text-muted w-4 text-right">{i + 1}</span>}
            <Input className="h-9 text-sm" value={o} placeholder={`Option ${i + 1}`} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => { if (!o.trim() && opts.length > 2) remove(i); }} />
            {opts.length > 2 && <button className="text-muted hover:text-ink text-sm px-1" onClick={() => remove(i)} aria-label={`Remove option ${i + 1}`}>✕</button>}
          </div>
        ))}
      </div>
      {opts.length < 8 && <button className="mt-2 text-sm font-medium text-ink-2 hover:text-ink" onClick={() => setOpts([...opts, ''])}>+ Add option</button>}
      {quiz && <p className="text-xs text-muted mt-1.5">The right answer is never sent to candidates. Answers are scored when they submit.</p>}
    </div>
  );
}

function TypeSettings({ q, set, jobId }: { q: Question; set: (p: Partial<Question>) => void; jobId?: string }) {
  const t = stepType(q);
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const material = (label = 'Material (optional)') => (
    <div>
      <p className="text-[13px] font-medium mb-1.5">{label}</p>
      <Textarea rows={3} mono value={q.material || ''} placeholder="Context, numbers or data. Markdown tables work: | Item | Qty |" onChange={(e) => set({ material: e.target.value })} />
    </div>
  );
  switch (t) {
    case 'video':
      return <p className="text-xs text-muted">Length limits and transcripts are set on the Activity tab and apply to every video step.</p>;
    case 'written':
      return (
        <div className="space-y-3">
          <Row label="Word guide"><div className="w-24 shrink-0"><Input className="h-8 text-sm" type="number" min={20} max={2000} value={q.words || ''} placeholder="None" onChange={(e) => set({ words: e.target.value ? Number(e.target.value) : null })} /></div></Row>
          <Row label="Time limit" hint={q.time_limit ? 'The box locks when time is up.' : undefined}><TimeSelect value={q.time_limit} onChange={(time_limit) => set({ time_limit })} none="No limit" opts={[60, 120, 180, 300, 600, 900]} /></Row>
          <PasteSetting q={q} set={set} />
        </div>
      );
    case 'choice':
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted">Candidates pick: record a Loom or write. Both appear the same way in their answers.</p>
          <Row label="Word guide (written)"><div className="w-24 shrink-0"><Input className="h-8 text-sm" type="number" min={20} max={2000} value={q.words || ''} placeholder="None" onChange={(e) => set({ words: e.target.value ? Number(e.target.value) : null })} /></div></Row>
          <PasteSetting q={q} set={set} allowBlock={false} />
        </div>
      );
    case 'voice':
      return <Row label="Longest recording"><TimeSelect value={q.time_limit || 120} onChange={(v) => set({ time_limit: v })} opts={[30, 45, 60, 90, 120, 180]} /></Row>;
    case 'work':
      return (
        <Row label="Examples to ask for" hint="The first is required; the rest optional.">
          <Segmented size="sm" value={String(q.items || 3) as '3'} onChange={(v) => set({ items: Number(v) })}
            options={['1', '2', '3', '4', '5'].map((n) => ({ id: n as '3', label: n }))} />
        </Row>
      );
    case 'brief':
      return (
        <div className="space-y-3">
          {material()}
          <Input className="text-sm" placeholder="Link to open (optional): a doc, sheet, folder or page" value={q.material_url || ''} onChange={(e) => set({ material_url: e.target.value.trim() })} />
          <Row label="They send back">
            <Segmented size="sm" value={q.deliverable || 'either'} onChange={(deliverable) => set({ deliverable })}
              options={[{ id: 'link', label: 'A link' }, { id: 'file', label: 'A file' }, { id: 'either', label: 'Either' }]} />
          </Row>
          <Row label="Walkthrough video" hint="A short Loom walking through their work. Hard to fake.">
            <Segmented size="sm" value={q.walkthrough || 'optional'} onChange={(walkthrough) => set({ walkthrough })}
              options={[{ id: 'off', label: 'Off' }, { id: 'optional', label: 'Optional' }, { id: 'required', label: 'Required' }]} />
          </Row>
          <Row label="Suggested time"><div className="w-24 shrink-0"><Input className="h-8 text-sm" type="number" min={5} max={240} value={q.minutes || ''} onChange={(e) => set({ minutes: Number(e.target.value) || 30 })} /></div></Row>
        </div>
      );
    case 'critique':
      return (
        <div className="space-y-3">
          <Input className="text-sm" placeholder="Link to what they should look at: a page, ad, post or design" value={q.material_url || ''} onChange={(e) => set({ material_url: e.target.value.trim() })} />
          <div className="flex flex-wrap items-center gap-2">
            {q.image_url
              ? <span className="flex items-center gap-2 text-sm"><img src={q.image_url} alt="" className="h-10 w-14 object-cover rounded border border-line" /> Image added <button className="text-muted underline text-xs" onClick={() => set({ image_url: '' })}>Remove</button></span>
              : jobId && (
                <label className={cx('text-sm font-medium text-ink-2 hover:text-ink cursor-pointer', uploading && 'opacity-60 pointer-events-none')}>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    setUploading(true);
                    try { set({ image_url: await uploadPublicImage(jobId, f) }); } catch (err) { toast((err as Error).message || 'Upload failed', 'bad'); }
                    setUploading(false);
                  }} />
                  {uploading ? <span className="flex items-center gap-2"><Spinner className="h-3 w-3" /> Uploading…</span> : '+ Or upload a screenshot'}
                </label>
              )}
          </div>
          <Row label="They respond by">
            <Segmented size="sm" value={q.respond || 'written'} onChange={(respond) => set({ respond })}
              options={[{ id: 'written', label: 'Writing' }, { id: 'video', label: 'Video' }, { id: 'either', label: 'Their choice' }]} />
          </Row>
          {(q.respond || 'written') !== 'video' && <PasteSetting q={q} set={set} allowBlock={false} />}
        </div>
      );
    case 'rank':
      return (
        <div className="space-y-3">
          <OptionsEditor q={q} set={set} />
          <Toggle checked={q.reason !== false} onChange={(reason) => set({ reason })} label="Ask why their first pick is first" />
        </div>
      );
    case 'quiz':
      return (
        <div className="space-y-3">
          {material('Snippet, table or context (optional)')}
          <OptionsEditor q={q} set={set} quiz />
          <Row label="Time to answer" hint="The question appears when they press Start."><TimeSelect value={q.time_limit || 90} onChange={(v) => set({ time_limit: v })} opts={[30, 45, 60, 90, 120, 180]} /></Row>
          <Toggle checked={q.reason !== false} onChange={(reason) => set({ reason })} label="Ask for a one-line reason" hint="Pasting is blocked here by default." />
        </div>
      );
    case 'musthave':
      return (
        <Row label="The answer you need" hint="A different answer is flagged, not rejected.">
          <Segmented size="sm" value={q.expected || 'any'} onChange={(v) => set({ expected: v === 'any' ? null : v })}
            options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: 'any', label: 'Either' }]} />
        </Row>
      );
  }
}
