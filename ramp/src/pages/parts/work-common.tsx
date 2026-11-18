// Shared bits for the agency screens: My work, Coaching and the client portal.
// Nothing here shows rates; each page decides what money it may show.
import { useState, type ReactNode } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { q } from '../../lib/hooks';
import { STEP_OWNER, cx, fmtDate, plural } from '../../lib/util';
import type { LaunchPlan, PlacementStatus, StepOwner } from '../../lib/types';
import { Chip, Icon, Progress, Spinner, useToast } from '../../ui';

// ───────── checklist steps ─────────

export type Audience = 'va' | 'client' | 'coach';

/** Who owns a step, worded for the person reading it. */
export function ownerLabel(owner: StepOwner, audience: Audience, vaFirst?: string) {
  if (audience === 'va') return owner === 'va' ? 'You' : owner === 'client' ? 'Your client' : 'Our team';
  if (audience === 'client') return owner === 'client' ? 'You' : owner === 'va' ? vaFirst || 'Your team member' : 'Our team';
  return STEP_OWNER[owner].label;
}

export interface StepItem { id: string; title: string; owner: StepOwner; done_at: string | null; done_by?: string | null }

export function StepRow({ step, audience, vaFirst, editable, busy, onToggle, hideOwner }: {
  step: StepItem; audience: Audience; vaFirst?: string; editable: boolean; busy?: boolean; onToggle?: (done: boolean) => void; hideOwner?: boolean;
}) {
  const done = !!step.done_at;
  const inner = (
    <>
      <span className={cx('w-7 h-7 mt-0.5 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors',
        done ? 'bg-good-2 border-good-2 text-white' : editable ? 'border-field bg-white text-transparent' : 'border-line bg-chip text-transparent')}>
        {busy ? <Spinner size={14} className={done ? 'text-white' : 'text-muted'} /> : <Icon name="check" size={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[15px] font-semibold leading-snug', done && 'text-muted line-through decoration-line')}>{step.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[13px] text-muted">
          {!hideOwner && <Chip tone={STEP_OWNER[step.owner].tone}>{ownerLabel(step.owner, audience, vaFirst)}</Chip>}
          {done ? <span>Done {fmtDate(step.done_at)}{step.done_by ? ` by ${step.done_by}` : ''}</span>
            : !editable && <span>Not done yet</span>}
        </span>
      </span>
    </>
  );
  const cls = 'flex items-start gap-3 w-full min-h-14 px-5 py-3 text-left text-ink';
  if (!editable) return <div className={cls}>{inner}</div>;
  return (
    <button type="button" role="checkbox" aria-checked={done} disabled={busy} onClick={() => onToggle?.(!done)}
      className={cx(cls, 'cursor-pointer hover:bg-bg disabled:cursor-wait')}>
      {inner}
    </button>
  );
}

export function StepProgress({ steps, label = 'Checklist progress', className }: { steps: { done_at: string | null }[]; label?: string; className?: string }) {
  const done = steps.filter((s) => s.done_at).length;
  const pct = steps.length ? (done / steps.length) * 100 : 0;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold text-ink-2">{label}</span>
        <span className="text-muted tabular-nums">{done} of {plural(steps.length, 'step')} done</span>
      </div>
      <Progress value={pct} tone={pct === 100 ? 'good' : 'brand'} label={label} />
    </div>
  );
}

/**
 * Toggle a checklist step through ramp_step_toggle, optimistically.
 * `apply(id, doneAt)` writes the step into the page's data; it's called again with the old value if the save fails.
 */
export function useStepToggle(apply: (id: string, doneAt: string | null) => void, after?: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState<string[]>([]);
  async function toggle(step: StepItem, done: boolean) {
    const prev = step.done_at;
    apply(step.id, done ? new Date().toISOString() : null);
    setBusy((b) => [...b, step.id]);
    const { error } = await supabase.rpc('ramp_step_toggle', { p_step: step.id, p_done: done });
    setBusy((b) => b.filter((x) => x !== step.id));
    if (error) {
      apply(step.id, prev);
      toast(errText(error), 'bad');
      return;
    }
    toast(done ? `Done: ${step.title}` : `Marked as not done: ${step.title}`);
    after?.();
  }
  return { toggle, busy };
}

/** A tappable "Show more" that reveals a block. */
export function Disclosure({ label, openLabel, children, className }: { label: string; openLabel?: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 min-h-11 px-5 text-sm font-semibold text-brand-ink cursor-pointer">
        {open ? openLabel || 'Hide' : label}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} strokeWidth={2} />
      </button>
      {open && children}
    </div>
  );
}

// ───────── scores ─────────

const SCORE_WORDS = ['', 'Poor', 'Needs work', 'Okay', 'Good', 'Great'];

/** 1–5 score picker with big buttons. */
export function ScoreButtons({ value, onChange, label }: { value: number | null; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n;
        return (
          <button key={n} type="button" role="radio" aria-checked={on} aria-label={`${n}: ${SCORE_WORDS[n]}`} onClick={() => onChange(n)}
            className={cx('flex flex-col items-center justify-center gap-0.5 min-h-16 px-1 rounded-xl border cursor-pointer transition-colors',
              on ? 'bg-brand border-brand text-white' : 'bg-white border-[#C9CED6] text-ink hover:bg-chip')}>
            <span className="font-display text-xl font-bold tabular-nums leading-none">{n}</span>
            <span className={cx('text-[11px] font-semibold leading-tight text-center', on ? 'text-white/85' : 'text-muted')}>{SCORE_WORDS[n]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function scoreTone(score: number | null | undefined) {
  if (score == null) return 'neutral' as const;
  return score >= 4 ? ('good' as const) : score >= 3 ? ('warn' as const) : ('bad' as const);
}

export function ScoreChip({ score }: { score: number | null | undefined }) {
  if (score == null) return <Chip>No score</Chip>;
  return <Chip tone={scoreTone(score)} icon="star"><span className="tabular-nums">{Number(score).toLocaleString('en-US', { maximumFractionDigits: 2 })}/5</span></Chip>;
}

// ───────── tiers, placement status ─────────

export function TierChip({ tier }: { tier: { name: string } | null | undefined }) {
  return tier ? <Chip tone="brand" icon="star">{tier.name}</Chip> : <Chip>No tier yet</Chip>;
}

export const PLACEMENT_WORDS: Record<PlacementStatus, string> = {
  proposed: 'Proposed', onboarding: 'Onboarding', active: 'Active', paused: 'Paused', ended: 'Ended',
};

// ───────── definition rows ─────────

export function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx('grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3', className)}>{children}</dl>;
}
export function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <dt className="text-[13px] font-semibold text-muted">{label}</dt>
      <dd className="text-[15px] text-ink mt-0.5 break-words">{children}</dd>
    </div>
  );
}

// ───────── launch plans ─────────

/** Row from rpc('ramp_launch_list'). Reading it never creates a plan. */
export interface LaunchListItem {
  placement_id: string; title: string; status: PlacementStatus; start_date: string | null; client: string; va: string;
  role: 'admin' | 'coach' | 'client' | 'va' | null; plan_status: LaunchPlan['status'] | null; day1_date: string | null; updated_at: string | null;
}
export async function loadLaunchList(): Promise<LaunchListItem[]> {
  return (await q<LaunchListItem[] | null>(supabase.rpc('ramp_launch_list'))) || [];
}
export const LAUNCH_WORDS: Record<LaunchPlan['status'], { label: string; tone: 'neutral' | 'brand' | 'good' | 'warn' }> = {
  preparing: { label: 'Being prepared', tone: 'neutral' },
  ready: { label: 'Ready', tone: 'good' },
  in_progress: { label: 'Day 1 in progress', tone: 'brand' },
  done: { label: 'Day 1 done', tone: 'good' },
};

// ───────── misc ─────────

/** Line breaks kept, long words wrapped. */
export function Para({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-[15px] text-ink-2 leading-relaxed whitespace-pre-line break-words', className)}>{children}</p>;
}

export function SectionHeading({ title, sub, action, id }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1 basis-56">
        <h2 id={id} className="font-display text-xl font-semibold leading-snug">{title}</h2>
        {sub && <p className="text-sm text-muted mt-0.5 leading-relaxed">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
