// Placement › Rates and tier: readiness for the next tier and the full rate history.

import { useMe } from '../../../lib/session';
import { cx, fmtDateTime, money } from '../../../lib/util';
import type { Placement, RateChange, Tier } from '../../../lib/types';
import { Button, Card, CardHeader, Chip, EmptyState } from '../../../ui';
import { ReadyList, longDate, num, type Readiness } from './core-common';

export function RatesTab({ placement: p, tiers, history, readiness, nameOf, onChange }: {
  placement: Placement; tiers: Tier[]; history: RateChange[]; readiness: Readiness; nameOf: (id: string | null) => string;
  onChange: (promoteTo?: Tier | null) => void;
}) {
  const { org } = useMe();
  const cur = p.currency || 'USD';
  const tierName = (id: string | null) => (id ? tiers.find((t) => t.id === id)?.name || 'Removed tier' : 'No tier');
  const rows = [...history].sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.created_at.localeCompare(a.created_at));
  const next = readiness.next;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
      <div className="flex flex-col gap-5 min-w-0">
        <Card>
          <CardHeader title="Change rate or tier"
            subtitle={`Now ${money(p.bill_rate, cur)} bill and ${money(p.pay_rate, cur)} pay per hour. Set new rates or a new tier from a date; earlier weeks keep the old rates.`}
            action={<Button variant="primary" icon="pen" onClick={() => onChange(null)}>Change rate or tier</Button>} />
        </Card>

        <Card padded={false} className="overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <h3 className="font-display text-lg font-semibold">Rate history</h3>
            <p className="text-sm text-muted mt-1">Each week bills and pays the rates in effect on its Monday.</p>
          </div>
          {rows.length === 0 ? (
            <EmptyState icon="chart" title="No changes yet" body="The rates have stayed the same since this placement was created." />
          ) : (
            <ol>
              {rows.map((c) => {
                const tierChanged = c.old_tier_id !== c.new_tier_id;
                return (
                  <li key={c.id} className="px-5 py-3.5 border-t border-line-2 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[15px]">From {longDate(c.effective_date)}</span>
                      {tierChanged && <Chip tone="brand" icon="star">{tierName(c.old_tier_id)} → {tierName(c.new_tier_id)}</Chip>}
                    </div>
                    <p className="text-sm text-ink-2 tabular-nums">
                      Bill {money(c.old_bill, cur)} → <span className="font-semibold">{money(c.new_bill, cur)}</span>
                      <span className="text-muted"> · </span>
                      Pay {money(c.old_pay, cur)} → <span className="font-semibold">{money(c.new_pay, cur)}</span>
                      <span className="text-muted"> · </span>
                      <span className={cx(num(c.new_bill) - num(c.new_pay) < 0 ? 'text-bad' : 'text-good', 'font-semibold')}>{money(num(c.new_bill) - num(c.new_pay), cur)}/h margin</span>
                    </p>
                    {c.reason && <p className="text-[15px] text-ink-2 break-words">{c.reason}</p>}
                    <p className="text-xs text-muted">{c.created_by ? `${nameOf(c.created_by)} · ` : ''}{fmtDateTime(c.created_at, org.timezone)}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        {next ? (
          <>
            <CardHeader title={`Ready for ${next.name}?`}
              subtitle={`${next.name} defaults: ${money(next.bill_rate)} bill, ${money(next.pay_rate)} pay.`} />
            {readiness.ready ? <Chip tone="good" icon="check" className="self-start">Ready to move up</Chip> : <Chip tone="neutral" icon="clock" className="self-start">Not yet</Chip>}
            <ReadyList checks={readiness.checks} />
            <Button variant={readiness.ready ? 'success' : 'secondary'} icon="star" onClick={() => onChange(next)}>
              {readiness.ready ? `Promote to ${next.name}` : `Move to ${next.name} anyway`}
            </Button>
          </>
        ) : (
          <CardHeader title={p.tier_id ? 'Top of the ladder' : 'No tiers yet'}
            subtitle={p.tier_id ? `${tierName(p.tier_id)} is the highest tier. Add more on the Tiers page.` : 'Set up skill tiers to track who’s ready to move up.'} />
        )}
      </Card>
    </div>
  );
}
