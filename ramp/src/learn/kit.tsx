// Shared pieces for interactive steps: the heading, the check/try-again bar, shuffling and result colors.
import type { ReactNode } from 'react';
import { cx } from '../lib/util';
import { Button, Icon } from '../ui';
import type { StepResult } from './types';

export interface StepProps<B> {
  block: B;
  result?: StepResult;
  /** Report a checked attempt (score 0–100). Passive steps call it once with 100 when they're done. */
  onResult: (score: number) => void;
  preview?: boolean;
  /** Read-only look-back after the module is finished. */
  review?: boolean;
}

export function ActivityHead({ icon, kind, title, prompt, children }: { icon: string; kind: string; title: string; prompt?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] uppercase text-brand-ink">
        <span className="w-6 h-6 rounded-md bg-brand-soft flex items-center justify-center"><Icon name={icon} size={14} strokeWidth={2.2} /></span>{kind}
      </p>
      <h2 className="font-display text-[24px] md:text-[28px] leading-tight font-bold tracking-tight">{title}</h2>
      {prompt && <div className="text-[16px] leading-relaxed text-ink-2">{prompt}</div>}
      {children}
    </div>
  );
}

/** Score message after checking, with Try again. */
export function ResultBar({ score, right, total, onRetry, retryLabel = 'Try again', extra }: {
  score: number; right?: number; total?: number; onRetry?: () => void; retryLabel?: string; extra?: ReactNode;
}) {
  const tone = score >= 100 ? 'good' : score >= 70 ? 'brand' : 'warn';
  const head = score >= 100 ? 'Perfect' : score >= 70 ? 'Nice work' : 'Not quite yet';
  const tail = right != null && total != null ? `${right} of ${total} right.` : `${score}%.`;
  return (
    <div role="status" className={cx('rounded-2xl border p-4 flex flex-wrap items-center gap-3 rise',
      tone === 'good' ? 'bg-good-soft border-good/25' : tone === 'brand' ? 'bg-brand-soft border-brand/20' : 'bg-warn-soft border-warn/25')}>
      <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white',
        tone === 'good' ? 'bg-good' : tone === 'brand' ? 'bg-brand' : 'bg-warn')}>
        <Icon name={score >= 70 ? 'check' : 'refresh'} size={20} strokeWidth={2.4} />
      </span>
      <span className="flex-1 min-w-[180px]">
        <span className="block font-semibold text-[16px]">{head}. {tail}</span>
        <span className="block text-sm text-ink-2">{score >= 100 ? 'You can move on.' : 'The marks below show what to change. You can move on or try again.'}</span>
        {extra}
      </span>
      {onRetry && score < 100 && <Button onClick={onRetry} icon="replay">{retryLabel}</Button>}
    </div>
  );
}

export function CheckButton({ onClick, disabled, label = 'Check my answer', hint }: { onClick: () => void; disabled?: boolean; label?: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" icon="check" onClick={onClick} disabled={disabled}>{label}</Button>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

/** Same shuffle every time for the same seed, and never already in the right order. */
export function shuffled<T>(items: T[], seed: string): number[] {
  const idx = items.map((_, i) => i);
  if (idx.length < 2) return idx;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  for (let tries = 0; tries < 5; tries++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
    if (idx.some((v, i) => v !== i)) break;
  }
  return idx;
}

export const pct = (right: number, total: number) => (total ? Math.round((right / total) * 100) : 100);

/** Small ✓ / ✗ mark after checking. */
export function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={cx('w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white', ok ? 'bg-good' : 'bg-bad')}
      aria-label={ok ? 'Right' : 'Not right'}>
      <Icon name={ok ? 'check' : 'x'} size={14} strokeWidth={2.6} />
    </span>
  );
}

export const TONES = ['#4338CA', '#0E7490', '#B45309', '#BE185D', '#15803D', '#7C3AED', '#C2410C', '#0369A1'];
