import type { Member } from '../../lib/types';
import { rankOf, type Tone } from '../../lib/util';
import type { AssignKind } from '../../lib/plan';

/** Where someone is in their journey: Invited, Onboarding, Training x% or Graduated. */
export function stageOf(m: Member, pct: number): { label: string; tone: Tone } {
  const rank = rankOf(m.level);
  if (m.status === 'inactive') return { label: 'No access', tone: 'neutral' };
  if (m.status === 'invited') return { label: 'Invited', tone: 'neutral' };
  if (rank === 7) return { label: 'Guest', tone: 'neutral' };
  if (!m.onboarded_at && rank >= 3 && rank <= 6) return { label: 'Onboarding', tone: 'warn' };
  if (m.level === 'trainee') return { label: `Training ${pct}%`, tone: 'brand' };
  return { label: 'Graduated', tone: 'good' };
}

export const KIND_LABEL: Record<AssignKind, string> = {
  required: 'Required',
  role: 'Role track',
  continued: 'Continued',
  optional: 'Optional',
};
