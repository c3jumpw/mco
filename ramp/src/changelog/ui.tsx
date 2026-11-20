// Small pieces shared by the What's new slides and the Admin › Change log page.
import { cx } from '../lib/util';
import { Icon } from '../ui';
import { REQ_LABEL, TYPE_META, WHO_LABEL, type Change, type ChangeType } from './changelog';

const TONE: Record<'brand' | 'good' | 'warn', string> = {
  brand: 'bg-brand-soft text-brand-ink ring-1 ring-inset ring-brand/15',
  good: 'bg-good-soft text-good ring-1 ring-inset ring-good/15',
  warn: 'bg-warn-soft text-warn ring-1 ring-inset ring-warn/20',
};

/** New / Better / Fixed, all the same width so lists line up. */
export function TypeTag({ type, className }: { type: ChangeType; className?: string }) {
  const t = TYPE_META[type];
  return (
    <span className={cx('inline-flex items-center justify-center gap-1 w-[68px] shrink-0 rounded-full py-[3px] text-[11px] font-bold tracking-wide', TONE[t.tone], className)}>
      <Icon name={t.icon} size={12} strokeWidth={2.4} />{t.label}
    </span>
  );
}

/** Who a change affects, plus anything it needs, as quiet chips. */
export function WhoChips({ change, className }: { change: Change; className?: string }) {
  return (
    <span className={cx('flex flex-wrap gap-1.5', className)}>
      {change.who.map((w) => (
        <span key={w} className="inline-flex items-center rounded-full bg-chip px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{WHO_LABEL[w]}</span>
      ))}
      {(change.requires || []).map((r) => (
        <span key={r} className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[11.5px] font-semibold text-muted">{REQ_LABEL[r]}</span>
      ))}
    </span>
  );
}
