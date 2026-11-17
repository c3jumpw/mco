// "Change rate or tier": records a rate change from a date with ramp_rate_change. Old rates stay in the
// history so earlier weeks still bill and pay what they were worth. Also used for "Promote".

import { useState, type FormEvent } from 'react';
import { supabase, errText } from '../../../lib/supabase';
import { addDays, cx, money, weekStart } from '../../../lib/util';
import type { Placement, Tier } from '../../../lib/types';
import { Button, Field, Input, Notice, Select, Sheet, Textarea, useToast } from '../../../ui';
import { FormError } from '../../parts/ops-common';
import { MoneyInput, econ, longDate, nextMonday, num, parseNum } from './core-common';

export interface RateTarget {
  placement: Placement;
  assistant: string;
  client: string;
  /** Prefill this tier and its default rates (the "Promote" action). */
  promoteTo?: Tier | null;
}

/** First Monday on or after a date: the first week billed at the new rates. */
const firstWeek = (d: string) => (weekStart(d) === d ? d : addDays(weekStart(d), 7));

export function RateSheet({ target, tiers, onClose, onDone }: { target: RateTarget | null; tiers: Tier[]; onClose: () => void; onDone: () => void }) {
  if (!target) return null;
  return <RateBody key={target.placement.id + (target.promoteTo?.id || '')} target={target} tiers={tiers} onClose={onClose} onDone={onDone} />;
}

function RateBody({ target, tiers, onClose, onDone }: { target: RateTarget; tiers: Tier[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { placement: p, promoteTo } = target;
  const cur = p.currency || 'USD';
  const [tierId, setTierId] = useState(promoteTo ? promoteTo.id : p.tier_id || '');
  const [bill, setBill] = useState(String(num(promoteTo ? promoteTo.bill_rate : p.bill_rate)));
  const [pay, setPay] = useState(String(num(promoteTo ? promoteTo.pay_rate : p.pay_rate)));
  const [effective, setEffective] = useState(nextMonday());
  const [reason, setReason] = useState(promoteTo ? `Promoted to ${promoteTo.name}` : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tier = tiers.find((t) => t.id === tierId) || null;
  const oldTier = tiers.find((t) => t.id === p.tier_id) || null;
  const billN = parseNum(bill), payN = parseNum(pay);
  const before = econ(p.hours_per_week, p.bill_rate, p.pay_rate);
  const after = econ(p.hours_per_week, billN ?? 0, payN ?? 0);
  const tierDefaults = tier && (num(tier.bill_rate) !== billN || num(tier.pay_rate) !== payN);
  const unchanged = (tierId || null) === (p.tier_id || null) && billN === num(p.bill_rate) && payN === num(p.pay_rate);
  const losing = billN !== null && payN !== null && billN < payN;
  const week1 = effective ? firstWeek(effective) : '';
  const past = !!effective && week1 < weekStart();

  function pickTier(id: string) {
    setTierId(id);
    const t = tiers.find((x) => x.id === id);
    if (t && !reason.trim()) setReason(oldTier && t.level > oldTier.level ? `Promoted to ${t.name}` : `Moved to ${t.name}`);
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    if (billN === null || payN === null || billN < 0 || payN < 0) { setError('Enter both hourly rates.'); return; }
    if (losing) { setError('The bill rate is lower than the pay rate. Check the numbers.'); return; }
    if (!effective) { setError('Pick the date the new rates start.'); return; }
    if (unchanged) { setError('Nothing has changed yet. Pick a new tier or enter new rates.'); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.rpc('ramp_rate_change', {
        p_placement: p.id, p_tier: tierId || null, p_bill: billN, p_pay: payN, p_effective: effective, p_reason: reason.trim(),
      });
      if (err) throw err;
      toast(tier && tier.id !== p.tier_id ? `${target.assistant} moved to ${tier.name}.` : 'Rates changed.');
      onDone();
      onClose();
    } catch (x) {
      setError(errText(x));
      setBusy(false);
    }
  }

  const row = (label: string, a: number, b: number, strong?: boolean) => (
    <div className="contents">
      <span className={cx('py-1.5 border-t border-line-2 text-ink-2', strong && 'font-semibold')}>{label}</span>
      <span className="py-1.5 border-t border-line-2 text-right tabular-nums text-muted">{money(a, cur)}</span>
      <span className={cx('py-1.5 border-t border-line-2 text-right tabular-nums', strong && 'font-semibold', a !== b && 'text-ink')}>{money(b, cur)}</span>
    </div>
  );

  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title={promoteTo ? `Promote ${target.assistant}` : 'Change rate or tier'}
      subtitle={`${target.assistant} at ${target.client}. Old rates stay in the history, so earlier weeks still bill and pay what they were worth.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form="core-rate-form" loading={busy} icon="check" disabled={unchanged}>{promoteTo ? `Promote to ${promoteTo.name}` : 'Change rates'}</Button></>}>
      <form id="core-rate-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        <Field label="Tier" hint={oldTier ? `Now: ${oldTier.name}` : 'No tier yet'}>
          <Select value={tierId} onChange={(e) => pickTier(e.target.value)}>
            <option value="">No tier</option>
            {tiers.map((t) => <option key={t.id} value={t.id}>{t.name} · {money(t.bill_rate)} bill, {money(t.pay_rate)} pay</option>)}
          </Select>
        </Field>
        {tierDefaults && (
          <div className="flex flex-wrap items-center gap-2 -mt-2">
            <span className="text-[13px] text-muted">{tier!.name} defaults: {money(tier!.bill_rate)} bill, {money(tier!.pay_rate)} pay.</span>
            <Button size="sm" variant="ghost" onClick={() => { setBill(String(num(tier!.bill_rate))); setPay(String(num(tier!.pay_rate))); }}>Use these rates</Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="New bill rate per hour" required><MoneyInput value={bill} onChange={setBill} currency={cur} /></Field>
          <Field label="New pay rate per hour" required><MoneyInput value={pay} onChange={setPay} currency={cur} /></Field>
        </div>
        {losing && <Notice tone="bad" icon="alert">The bill rate is lower than the pay rate. RAMP won’t save a rate that loses money.</Notice>}

        <div className="rounded-2xl bg-bg px-4 py-3 text-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-5 items-baseline">
            <span />
            <span className="text-xs font-semibold text-muted text-right">Now</span>
            <span className="text-xs font-semibold text-muted text-right">New</span>
            {row('Bill per hour', before.bill, after.bill)}
            {row('Pay per hour', before.pay, after.pay)}
            {row('Margin per hour', before.margin, after.margin, true)}
            {row(`Margin per week (${num(p.hours_per_week)} h)`, before.week.margin, after.week.margin, true)}
          </div>
        </div>

        <Field label="New rates start" required hint={!week1 ? undefined : week1 === effective ? `Hours are billed by week. Weeks starting ${longDate(week1)} or later use the new rates.` : `Hours are billed by week (Monday to Sunday), so the new rates start with the week of ${longDate(week1)}.`}>
          <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
        </Field>
        {past && <Notice tone="warn" icon="alert">This date is in the past. Weeks that were already approved keep the pay rate they were approved at, and weeks already on an invoice don’t change.</Notice>}
        <Field label="Reason" hint="Kept in the rate history and the audit log.">
          <Textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Promoted after the 90-day review" />
        </Field>
        {!unchanged && billN !== null && payN !== null && !losing && (
          <p className="text-[15px] text-ink-2 leading-relaxed">
            Bills {target.client} <span className="font-semibold tabular-nums">{money(billN, cur)}/h</span> (now {money(p.bill_rate, cur)}) and pays {target.assistant}{' '}
            <span className="font-semibold tabular-nums">{money(payN, cur)}/h</span> (now {money(p.pay_rate, cur)}) for weeks starting {longDate(week1)} or later.
          </p>
        )}
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
