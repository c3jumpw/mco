import { useEffect, useMemo, useState } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { useTitle } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { money, plural, uid } from '../../lib/util';
import type { AgencySettings as Settings, LaunchSection, Org } from '../../lib/types';
import { Button, Card, Field, Input, Notice, PageHeader, Switch, useToast } from '../../ui';
import { SaveBar, SectionHead, same, useLeaveGuard } from '../parts/setup-kit';
import { AGENCY_BACK, EYEBROW, MoneyInput } from './parts/core-common';
import { AgendaEditor, ChecklistEditor, DayChips, StripeCard, WiseCard, fmtMinutes, type AgendaRow, type CheckRow } from './parts/core-settings';

interface Form {
  checklist: CheckRow[];
  checkin_days: number[];
  checkin_every_days: string;
  replacement_days: string;
  invoice_prefix: string;
  next_invoice_number: string;
  pay_when_paid: boolean;
  default_setup_fee: string;
  payout_currency: string;
  launch_agenda: AgendaRow[];
}

function formOf(a: Partial<Settings> | null | undefined): Form {
  const s = a || {};
  return {
    checklist: (s.checklist || []).map((c) => ({ id: uid(), title: c.title || '', owner: c.owner || 'agency' })),
    checkin_days: [...(s.checkin_days || [])].map(Number).filter((n) => Number.isFinite(n)).sort((x, y) => x - y),
    checkin_every_days: String(s.checkin_every_days ?? 30),
    replacement_days: String(s.replacement_days ?? 60),
    invoice_prefix: s.invoice_prefix ?? 'INV',
    next_invoice_number: String(s.next_invoice_number ?? 1001),
    pay_when_paid: s.pay_when_paid ?? true,
    default_setup_fee: String(s.default_setup_fee ?? 0),
    payout_currency: s.payout_currency || 'USD',
    launch_agenda: (s.launch_agenda || []).map((x) => ({ key: x.key || `item_${uid()}`, title: x.title || '', minutes: String(x.minutes ?? 15), section: (x.section || null) as LaunchSection | null })),
  };
}

function toSettings(f: Form): Omit<Settings, never> {
  return {
    checklist: f.checklist.map((c) => ({ title: c.title.trim().slice(0, 200), owner: c.owner })),
    checkin_days: f.checkin_days,
    checkin_every_days: Number(f.checkin_every_days),
    replacement_days: Number(f.replacement_days),
    invoice_prefix: f.invoice_prefix.trim(),
    next_invoice_number: Number(f.next_invoice_number),
    pay_when_paid: f.pay_when_paid,
    default_setup_fee: Math.round(Number(f.default_setup_fee) * 100) / 100,
    payout_currency: f.payout_currency.trim().toUpperCase(),
    launch_agenda: f.launch_agenda.map((a) => ({ key: a.key, title: a.title.trim().slice(0, 200), minutes: Number(a.minutes), section: a.section })),
  };
}

type Errs = Partial<Record<keyof Form, string>>;
function validate(f: Form): Errs {
  const e: Errs = {};
  const int = (v: string, lo: number, hi: number) => { const n = Number(v); return v.trim() !== '' && Number.isInteger(n) && n >= lo && n <= hi; };
  if (f.checklist.some((c) => !c.title.trim())) e.checklist = 'Give every step a title, or remove the empty ones.';
  if (!int(f.checkin_every_days, 1, 365)) e.checkin_every_days = 'Enter 1 to 365 days.';
  if (!int(f.replacement_days, 0, 365)) e.replacement_days = 'Enter 0 to 365 days. Use 0 for no guarantee.';
  if (!/^[A-Za-z0-9-]{1,10}$/.test(f.invoice_prefix.trim())) e.invoice_prefix = 'Use 1 to 10 letters, numbers or dashes.';
  if (!int(f.next_invoice_number, 1, 999999999)) e.next_invoice_number = 'Enter a whole number, 1 or more.';
  const fee = Number(f.default_setup_fee);
  if (f.default_setup_fee.trim() === '' || !Number.isFinite(fee) || fee < 0) e.default_setup_fee = 'Enter an amount, or 0 for none.';
  if (!/^[A-Za-z]{3}$/.test(f.payout_currency.trim())) e.payout_currency = 'Use a 3-letter currency code, like USD.';
  if (f.launch_agenda.some((a) => !a.title.trim())) e.launch_agenda = 'Give every agenda item a title, or remove the empty ones.';
  else if (f.launch_agenda.some((a) => !int(a.minutes, 1, 480))) e.launch_agenda = 'Each item needs 1 to 480 minutes.';
  return e;
}

export default function AgencySettings() {
  useTitle('Agency settings');
  const { org, setOrg } = useMe();
  const toast = useToast();
  const saved = useMemo(() => formOf(org.agency), [org.agency]);
  const [f, setF] = useState<Form>(saved);
  useEffect(() => { setF(saved); }, [saved]);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState('');
  // Compare without the local row ids, which only exist for React keys.
  const strip = (x: Form) => ({ ...x, checklist: x.checklist.map(({ title, owner }) => ({ title, owner })) });
  const dirty = !same(strip(f), strip(saved));
  const { dialog } = useLeaveGuard(dirty);
  const errors = validate(f);
  const errs = show ? errors : {};
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const lowered = Number(f.next_invoice_number) < Number(saved.next_invoice_number);

  async function save() {
    setFail('');
    if (Object.keys(errors).length) { setShow(true); toast('Check the highlighted fields.', 'bad'); return; }
    setSaving(true);
    try {
      // Only send what changed, on top of the latest settings, so an invoice number used meanwhile isn't undone.
      const next = toSettings(f);
      const base = toSettings(saved);
      const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => !same(v, base[k as keyof Settings])));
      const { data: fresh, error: e1 } = await supabase.from('ramp_org').select('agency').eq('id', true).single();
      if (e1) throw e1;
      const agency = { ...((fresh as { agency: Settings }).agency || {}), ...changed };
      const { data, error } = await supabase.from('ramp_org').update({ agency }).eq('id', true).select().single();
      if (error) throw error;
      setOrg(data as Org);
      setShow(false);
      toast('Agency settings saved.');
    } catch (e) {
      setFail(errText(e));
      toast(errText(e), 'bad');
    } finally {
      setSaving(false);
    }
  }

  const fee = Number(f.default_setup_fee) || 0;
  const minutes = f.launch_agenda.reduce((s, a) => s + (Number(a.minutes) > 0 ? Number(a.minutes) : 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Agency settings"
        subtitle="How new placements are set up, when check-ins happen, how invoices are numbered and how team members get paid." />

      <Card className="flex flex-col gap-4">
        <SectionHead title="Onboarding checklist" subtitle="Every new placement starts with these steps. Changing them doesn’t touch placements that already exist." />
        <ChecklistEditor rows={f.checklist} onChange={(r) => set('checklist', r)} error={errs.checklist} />
      </Card>

      <Card className="flex flex-col gap-5">
        <SectionHead title="Check-ins and guarantee" />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">First check-ins, in days after the start date</span>
          <p className="text-[13px] text-muted -mt-1">Each day gets two check-ins: one with the team member and one with the client.</p>
          <DayChips days={f.checkin_days} onChange={(d) => set('checkin_days', d)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="After that, check in every" error={errs.checkin_every_days} hint="When a check-in is recorded and none is scheduled, the next one is set this many days later.">
            <span className="relative block">
              <Input type="number" inputMode="numeric" min={1} max={365} value={f.checkin_every_days} onChange={(e) => set('checkin_every_days', e.target.value)} className="pr-14 tabular-nums" aria-invalid={!!errs.checkin_every_days} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true">days</span>
            </span>
          </Field>
          <Field label="Replacement guarantee" error={errs.replacement_days} hint="From the start date. If it doesn’t work out within this time, you replace the team member at no extra charge.">
            <span className="relative block">
              <Input type="number" inputMode="numeric" min={0} max={365} value={f.replacement_days} onChange={(e) => set('replacement_days', e.target.value)} className="pr-14 tabular-nums" aria-invalid={!!errs.replacement_days} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true">days</span>
            </span>
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <SectionHead title="Invoices and fees" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Invoice number prefix" error={errs.invoice_prefix}>
            <Input value={f.invoice_prefix} maxLength={10} onChange={(e) => set('invoice_prefix', e.target.value)} className="font-mono uppercase" aria-invalid={!!errs.invoice_prefix} />
          </Field>
          <Field label="Next invoice number" error={errs.next_invoice_number}
            hint={!errs.invoice_prefix && !errs.next_invoice_number ? `The next invoice will be ${f.invoice_prefix.trim()}-${f.next_invoice_number}.` : undefined}>
            <Input type="number" inputMode="numeric" min={1} step={1} value={f.next_invoice_number} onChange={(e) => set('next_invoice_number', e.target.value)} className="tabular-nums" aria-invalid={!!errs.next_invoice_number} />
          </Field>
        </div>
        {lowered && (
          <Notice tone="warn" icon="alert">
            This is lower than before ({saved.next_invoice_number}). Invoice numbers can’t repeat, so creating an invoice fails if the number was already used. Only lower it if you’re sure.
          </Notice>
        )}
        <Field label="Default setup fee" error={errs.default_setup_fee} hint={fee > 0 ? `New placements start with a ${money(fee)} one-time fee. You can change or waive it on each one.` : 'New placements have no setup fee unless you add one.'} className="max-w-xs">
          <MoneyInput value={f.default_setup_fee} onChange={(v) => set('default_setup_fee', v)} aria-invalid={!!errs.default_setup_fee} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-5">
        <SectionHead title="Paying team members" />
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Pay only for hours the client has paid for</p>
            <p className="text-sm text-muted mt-0.5 leading-relaxed">
              {f.pay_when_paid ? 'On: payouts include only hours on paid invoices or paid prepaid periods. You never pay out money you haven’t collected.'
                : 'Off: payouts include every approved hour, whether or not the client has paid yet.'}
            </p>
          </div>
          <Switch checked={f.pay_when_paid} onChange={(v) => set('pay_when_paid', v)} label="Pay only for hours the client has paid for" />
        </div>
        <Field label="Payout currency" error={errs.payout_currency} hint="The currency payouts are calculated and exported in. Wise converts to each team member’s own currency." className="max-w-xs">
          <Input value={f.payout_currency} maxLength={3} onChange={(e) => set('payout_currency', e.target.value.toUpperCase())} className="font-mono uppercase" aria-invalid={!!errs.payout_currency} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionHead title="Day 1 agenda template" subtitle={`New launch plans start with this run sheet (${fmtMinutes(minutes)}). Link items to a prep section so the client’s material shows up beside them on Day 1.`} />
        <AgendaEditor rows={f.launch_agenda} onChange={(r) => set('launch_agenda', r)} error={errs.launch_agenda} />
        <p className="text-[13px] text-muted">Launch plans that already exist keep their own agenda. {plural(f.launch_agenda.length, 'item')} in the template.</p>
      </Card>

      <StripeCard />
      <WiseCard payWhenPaid={f.pay_when_paid} currency={f.payout_currency} />

      {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
      <SaveBar dirty={dirty} saving={saving}>
        {dirty && <Button variant="ghost" onClick={() => { setF(saved); setShow(false); }} disabled={saving}>Discard</Button>}
        <Button variant="primary" icon="check" onClick={save} loading={saving} disabled={!dirty}>Save settings</Button>
      </SaveBar>
      {dialog}
    </div>
  );
}
