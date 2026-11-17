// Client fields: the "New client" sheet and the client Overview editor use the same form shape.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errText } from '../../../lib/supabase';
import { useMe } from '../../../lib/session';
import type { Client } from '../../../lib/types';
import { Button, Field, Input, Pills, Sheet, useToast } from '../../../ui';
import { FormError, focusInvalid } from '../../parts/ops-common';
import { CYCLE_LABEL, MODE_INFO, TimezoneSelect } from './core-common';

export interface ClientForm {
  name: string; website: string; industry: string; timezone: string; status: Client['status'];
  billing_name: string; billing_email: string; billing_address: string; billing_cycle: Client['billing_cycle'];
  billing_mode: Client['billing_mode']; net_days: string; currency: string; notes: string;
}

export const blankClient = (): ClientForm => ({
  name: '', website: '', industry: '', timezone: '', status: 'active', billing_name: '', billing_email: '', billing_address: '',
  billing_cycle: 'weekly', billing_mode: 'arrears', net_days: '7', currency: 'USD', notes: '',
});

export const clientFormOf = (c: Client): ClientForm => ({
  name: c.name, website: c.website || '', industry: c.industry || '', timezone: c.timezone || '', status: c.status,
  billing_name: c.billing_name || '', billing_email: c.billing_email || '', billing_address: c.billing_address || '',
  billing_cycle: c.billing_cycle, billing_mode: c.billing_mode, net_days: String(c.net_days ?? 7), currency: c.currency || 'USD', notes: c.notes || '',
});

export function validateClient(f: ClientForm) {
  const e: Partial<Record<keyof ClientForm, string>> = {};
  if (!f.name.trim()) e.name = 'Add the company name.';
  else if (f.name.trim().length > 120) e.name = 'Keep the name to 120 characters or fewer.';
  if (f.billing_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.billing_email.trim())) e.billing_email = 'Enter a valid email address.';
  const n = Number(f.net_days);
  if (f.net_days.trim() === '' || !Number.isInteger(n) || n < 0 || n > 60) e.net_days = 'Enter 0 to 60 days.';
  if (!/^[A-Za-z]{3}$/.test(f.currency.trim())) e.currency = 'Use a 3-letter currency code, like USD.';
  return e;
}

export function clientPatch(f: ClientForm) {
  return {
    name: f.name.trim(), website: f.website.trim(), industry: f.industry.trim(), timezone: f.timezone, status: f.status,
    billing_name: f.billing_name.trim(), billing_email: f.billing_email.trim().toLowerCase(), billing_address: f.billing_address.trim(),
    billing_cycle: f.billing_cycle, billing_mode: f.billing_mode, net_days: Number(f.net_days), currency: f.currency.trim().toUpperCase(),
    notes: f.notes.trim(),
  };
}

/** Link for a website typed without https://. */
export const siteHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

type Errs = Partial<Record<keyof ClientForm, string>>;

/** How often and how the client is billed, explained plainly. */
export function BillingFields({ f, set, errs }: { f: ClientForm; set: <K extends keyof ClientForm>(k: K, v: ClientForm[K]) => void; errs: Errs }) {
  return (
    <>
      <div className="grid gap-4">
        <Field label="Billing contact name" hint="Who invoices are addressed to.">
          <Input value={f.billing_name} maxLength={120} onChange={(e) => set('billing_name', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Billing email" error={errs.billing_email} hint="Invoices sent through Stripe go here.">
          <Input type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={f.billing_email} onChange={(e) => set('billing_email', e.target.value)}
            aria-invalid={!!errs.billing_email} placeholder="billing@company.com" autoComplete="off" />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-2">How often you invoice</span>
        <Pills label="How often you invoice" size="sm" value={f.billing_cycle} onChange={(v) => set('billing_cycle', v)}
          options={(['weekly', 'biweekly', 'monthly'] as const).map((v) => ({ value: v, label: CYCLE_LABEL[v] }))} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-2">When hours are billed</span>
        <Pills label="When hours are billed" size="sm" value={f.billing_mode} onChange={(v) => set('billing_mode', v)}
          options={(['arrears', 'advance'] as const).map((v) => ({ value: v, label: MODE_INFO[v].label }))} />
        <p className="text-[13px] text-muted leading-relaxed">{MODE_INFO[f.billing_mode].desc}</p>
      </div>
      <Field label="Days to pay" error={errs.net_days} hint={`Each invoice is due ${Number(f.net_days) === 0 ? 'the day it’s issued' : `${f.net_days || 'some'} days after it’s issued`}.`} className="max-w-48">
        <Input type="number" inputMode="numeric" min={0} max={60} step={1} value={f.net_days} onChange={(e) => set('net_days', e.target.value)} aria-invalid={!!errs.net_days} className="tabular-nums" />
      </Field>
    </>
  );
}

export function NewClientSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <NewClientBody onClose={onClose} />;
}

function NewClientBody({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState<ClientForm>(blankClient);
  const [errs, setErrs] = useState<Errs>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ClientForm>(k: K, v: ClientForm[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    const x = validateClient(f);
    setErrs(x);
    if (Object.keys(x).length) { focusInvalid('core-client-new'); return; }
    setBusy(true);
    try {
      const { data, error: err } = await supabase.from('ramp_clients').insert({ ...clientPatch(f), created_by: me.id }).select('id').single();
      if (err) throw err;
      toast(`${f.name.trim()} added.`);
      onClose();
      navigate(`/admin/clients/${(data as { id: string }).id}`);
    } catch (x2) {
      setError(errText(x2));
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title="New client" subtitle="The company you place assistants with. You can change any of this later."
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="core-client-new" loading={busy} icon="check">Add client</Button></>}>
      <form id="core-client-new" onSubmit={save} noValidate className="flex flex-col gap-4">
        <Field label="Company name" required error={errs.name}>
          <Input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errs.name} autoComplete="organization" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Website"><Input type="url" inputMode="url" autoCapitalize="none" value={f.website} maxLength={200} onChange={(e) => set('website', e.target.value)} placeholder="company.com" /></Field>
          <Field label="Industry"><Input value={f.industry} maxLength={80} onChange={(e) => set('industry', e.target.value)} placeholder="Real estate" /></Field>
        </div>
        <Field label="Time zone" hint="Where the client works. Assistants’ schedules follow it.">
          <TimezoneSelect value={f.timezone} onChange={(tz) => set('timezone', tz)} />
        </Field>
        <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted mt-1">Billing</p>
        <BillingFields f={f} set={set} errs={errs} />
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
