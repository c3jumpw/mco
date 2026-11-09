// The few UI-kit pieces the guide uses, plus chip classes for inline labels.
export { Icon, Segmented, Sheet } from '../ui';
import type { Tone } from '../lib/util';

const CHIP: Record<Tone, string> = {
  neutral: 'bg-chip text-ink-2', brand: 'bg-brand-soft text-brand-ink', good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', dark: 'bg-ink text-white',
};
export const cxChip = (tone: Tone) => `inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${CHIP[tone]}`;
