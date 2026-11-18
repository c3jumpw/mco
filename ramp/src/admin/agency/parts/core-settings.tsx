// Agency settings pieces: list editors for the default checklist and the Day 1 agenda template,
// check-in day chips, and the Stripe and Wise cards.

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAsync } from '../../../lib/hooks';
import { LAUNCH_SECTIONS, STEP_OWNER, cx, plural, uid } from '../../../lib/util';
import type { LaunchSection, StepOwner } from '../../../lib/types';
import { Button, Card, Chip, ErrorBox, Icon, IconButton, Input, Notice, Select, Spinner, useToast } from '../../../ui';
import { copyText } from '../../parts/ops-common';
import { SectionHead } from '../../parts/setup-kit';

// ───────── default checklist ─────────

export interface CheckRow { id: string; title: string; owner: StepOwner }

const swap = <T,>(list: T[], i: number, j: number) => {
  if (j < 0 || j >= list.length) return list;
  const out = list.slice();
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
};

export function ChecklistEditor({ rows, onChange, error }: { rows: CheckRow[]; onChange: (r: CheckRow[]) => void; error?: string }) {
  const counts = (['agency', 'client', 'va'] as StepOwner[]).map((o) => `${rows.filter((r) => r.owner === o).length} for ${STEP_OWNER[o].label.toLowerCase()}`);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">{plural(rows.length, 'step')}: {counts.join(', ')}.</p>
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-center gap-1 rounded-xl border border-line-2 p-1.5 sm:border-0 sm:p-0">
            <span className="hidden sm:inline-flex w-7 justify-center text-sm font-bold text-muted shrink-0" aria-hidden="true">{i + 1}</span>
            <Input aria-label={`Step ${i + 1}`} value={r.title} maxLength={200} className="flex-1 min-w-[200px]"
              aria-invalid={!!error && !r.title.trim()} onChange={(e) => onChange(rows.map((x) => (x.id === r.id ? { ...x, title: e.target.value } : x)))} />
            <span className="flex items-center gap-1 ml-auto">
              <span className="w-32 shrink-0">
                <Select aria-label={`Who does step ${i + 1}`} value={r.owner}
                  onChange={(e) => onChange(rows.map((x) => (x.id === r.id ? { ...x, owner: e.target.value as StepOwner } : x)))}>
                  {(['agency', 'client', 'va'] as StepOwner[]).map((o) => <option key={o} value={o}>{STEP_OWNER[o].label}</option>)}
                </Select>
              </span>
              <IconButton icon="chevronUp" label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => onChange(swap(rows, i, i - 1))} />
              <IconButton icon="chevronDown" label={`Move step ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => onChange(swap(rows, i, i + 1))} />
              <IconButton icon="trash" label={`Remove step ${i + 1}`} onClick={() => onChange(rows.filter((x) => x.id !== r.id))} className="text-bad" />
            </span>
          </li>
        ))}
      </ol>
      {error && <p className="text-xs font-semibold text-bad">{error}</p>}
      <Button className="self-start" icon="plus" onClick={() => onChange([...rows, { id: uid(), title: '', owner: 'agency' }])}>Add a step</Button>
    </div>
  );
}

// ───────── check-in days ─────────

export function DayChips({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  function add() {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 1 || n > 365) { setErr('Enter a whole number of days from 1 to 365.'); return; }
    if (days.includes(n)) { setErr(`Day ${n} is already on the list.`); return; }
    onChange([...days, n].sort((a, b) => a - b));
    setDraft('');
    setErr('');
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2" aria-label="Check-in days">
        {days.length === 0 && <li className="text-sm text-muted">No first check-ins. Add at least one so the schedule starts.</li>}
        {days.map((d) => (
          <li key={d}>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft text-brand-ink pl-3 pr-1 min-h-10 text-sm font-semibold">
              Day {d}
              <button type="button" aria-label={`Remove day ${d}`} onClick={() => onChange(days.filter((x) => x !== d))}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-brand-2 cursor-pointer"><Icon name="x" size={14} strokeWidth={2.4} /></button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 max-w-xs">
        <Input type="number" inputMode="numeric" min={1} max={365} step={1} aria-label="Day to add" placeholder="Day, like 14" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} className="tabular-nums" />
        <Button onClick={add} icon="plus" disabled={!draft.trim()}>Add</Button>
      </div>
      {err && <p className="text-xs font-semibold text-bad" role="alert">{err}</p>}
    </div>
  );
}

// ───────── Day 1 agenda template ─────────

export interface AgendaRow { key: string; title: string; minutes: string; section: LaunchSection | null }

export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

export function AgendaEditor({ rows, onChange, error }: { rows: AgendaRow[]; onChange: (r: AgendaRow[]) => void; error?: string }) {
  const total = rows.reduce((s, r) => s + (Number(r.minutes) > 0 ? Number(r.minutes) : 0), 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold" aria-live="polite">{plural(rows.length, 'item')} · {fmtMinutes(total)} in total</p>
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const badMin = !(Number.isInteger(Number(r.minutes)) && Number(r.minutes) >= 1 && Number(r.minutes) <= 480);
          return (
            <li key={r.key} className="flex flex-wrap items-center gap-1 rounded-xl border border-line-2 p-1.5 md:border-0 md:p-0">
              <span className="hidden md:inline-flex w-7 justify-center text-sm font-bold text-muted shrink-0" aria-hidden="true">{i + 1}</span>
              <Input aria-label={`Agenda item ${i + 1}`} value={r.title} maxLength={200} className="flex-1 min-w-[200px]" aria-invalid={!!error && !r.title.trim()}
                onChange={(e) => onChange(rows.map((x) => (x.key === r.key ? { ...x, title: e.target.value } : x)))} />
              <span className="flex flex-wrap items-center gap-1 ml-auto justify-end">
                <span className="relative w-24 shrink-0">
                  <Input type="number" inputMode="numeric" min={1} max={480} step={5} aria-label={`Minutes for item ${i + 1}`} value={r.minutes}
                    aria-invalid={!!error && badMin} className="pr-11 tabular-nums" onChange={(e) => onChange(rows.map((x) => (x.key === r.key ? { ...x, minutes: e.target.value } : x)))} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none" aria-hidden="true">min</span>
                </span>
                <span className="w-48 shrink-0">
                  <Select aria-label={`Prep section for item ${i + 1}`} value={r.section || ''}
                    onChange={(e) => onChange(rows.map((x) => (x.key === r.key ? { ...x, section: (e.target.value || null) as LaunchSection | null } : x)))}>
                    <option value="">No section</option>
                    {LAUNCH_SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                </span>
                <IconButton icon="chevronUp" label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => onChange(swap(rows, i, i - 1))} />
                <IconButton icon="chevronDown" label={`Move item ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => onChange(swap(rows, i, i + 1))} />
                <IconButton icon="trash" label={`Remove item ${i + 1}`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))} className="text-bad" />
              </span>
            </li>
          );
        })}
      </ol>
      {error && <p className="text-xs font-semibold text-bad">{error}</p>}
      <Button className="self-start" icon="plus" onClick={() => onChange([...rows, { key: `item_${uid()}`, title: '', minutes: '15', section: null }])}>Add an item</Button>
    </div>
  );
}

// ───────── Stripe ─────────

interface StripeStatus { configured: boolean; mode: 'test' | 'live' | null; webhook: boolean; webhook_url: string }

function fallbackWebhookUrl() {
  const base = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';
  return base ? `${String(base).replace(/\/$/, '')}/functions/v1/ramp-stripe-webhook` : '';
}

export function StripeCard() {
  const toast = useToast();
  const res = useAsync<StripeStatus>(async () => {
    const { data, error } = await supabase.functions.invoke('ramp-stripe', { body: { action: 'status' } });
    if (error) throw new Error('Couldn’t reach the Stripe connection. The ramp-stripe function may not be deployed yet.');
    return data as StripeStatus;
  }, []);
  const s = res.data;
  const url = s?.webhook_url || fallbackWebhookUrl();
  async function copy() {
    const ok = await copyText(url);
    toast(ok ? 'Webhook address copied.' : 'Couldn’t copy. Select the address and copy it yourself.', ok ? 'ok' : 'bad');
  }
  const steps = [
    <>In Stripe › Developers › API keys, create a restricted or secret key.</>,
    <>In Supabase › Edge Functions › Secrets, add it as <code className="font-mono text-[13px] bg-chip rounded px-1">STRIPE_SECRET_KEY</code>.</>,
    <>
      In Stripe › Webhooks, add an endpoint at this address for the events <code className="font-mono text-[13px] bg-chip rounded px-1">invoice.paid</code> and{' '}
      <code className="font-mono text-[13px] bg-chip rounded px-1">invoice.voided</code>. Copy its signing secret into <code className="font-mono text-[13px] bg-chip rounded px-1">STRIPE_WEBHOOK_SECRET</code>.
      {url && (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <code className="font-mono text-[13px] bg-bg border border-line rounded-lg px-2 py-1.5 break-all select-all">{url}</code>
          <Button size="sm" icon="copy" onClick={copy}>Copy</Button>
        </span>
      )}
    </>,
    <>Come back and check the status.</>,
  ];
  const showSteps = !s || !s.configured;

  return (
    <Card className="flex flex-col gap-4">
      <SectionHead title="Stripe" subtitle="Send invoices through Stripe so clients can pay by card or bank. Paid and voided invoices update here automatically."
        action={<Button size="sm" icon="refresh" onClick={res.reload} loading={res.loading && !!res.data}>Check again</Button>} />
      {res.loading && !res.data && !res.error && <p className="flex items-center gap-2 text-sm text-muted"><Spinner size={16} /> Checking the Stripe connection…</p>}
      {res.error && <ErrorBox error={res.error} />}
      {s && s.configured && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="good" icon="check">Connected</Chip>
            <Chip tone={s.mode === 'live' ? 'dark' : 'warn'}>{s.mode === 'live' ? 'Live mode: real charges' : 'Test mode: no real charges'}</Chip>
            <Chip tone={s.webhook ? 'good' : 'bad'} icon={s.webhook ? 'check' : 'alert'}>{s.webhook ? 'Webhook set up' : 'Webhook missing'}</Chip>
          </div>
          {s.mode === 'test' && <p className="text-sm text-muted">Invoices go to Stripe’s test mode. Swap in a live key in Supabase when you’re ready to bill for real.</p>}
          {!s.webhook && (
            <Notice tone="warn" icon="alert">
              Without the webhook, invoices paid in Stripe aren’t marked paid here. Finish step 3 below.
            </Notice>
          )}
          {!s.webhook && <ol className="flex flex-col gap-3">{[steps[2]!, steps[3]!].map((st, i) => <Step key={i} n={i + 3}>{st}</Step>)}</ol>}
        </div>
      )}
      {showSteps && (s || res.error) && (
        <>
          {s && <Notice tone="warn" icon="info">Stripe isn’t connected yet. Until it is, invoices are issued in RAMP and you collect payment your usual way.</Notice>}
          <ol className="flex flex-col gap-3">{steps.map((st, i) => <Step key={i} n={i + 1}>{st}</Step>)}</ol>
        </>
      )}
    </Card>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-brand-soft text-brand-ink text-sm font-bold flex items-center justify-center shrink-0" aria-hidden="true">{n}</span>
      <span className="text-[15px] text-ink-2 leading-relaxed min-w-0 flex-1 pt-0.5"><span className="sr-only">Step {n}: </span>{children}</span>
    </li>
  );
}

// ───────── Wise ─────────

export function WiseCard({ payWhenPaid, currency }: { payWhenPaid: boolean; currency: string }) {
  const steps = [
    'Hours are approved each week, by the client or by you on Timesheets.',
    payWhenPaid ? 'On Payouts, create a payout for a period. Only hours from paid invoices (or paid prepaid periods) are included.' : 'On Payouts, create a payout for a period. Every approved hour not paid yet is included.',
    `Export the Wise batch file. It lists each team member once with their total in ${currency || 'USD'} and their payout details. The export is logged.`,
    'In Wise, start a batch payment and upload the file. Check the amounts, then pay.',
    'Back in RAMP, mark the payout sent with the Wise reference. Team members see it on My work.',
  ];
  return (
    <Card className="flex flex-col gap-4">
      <SectionHead title="Wise payouts" subtitle="Team members are paid in batches through Wise. There’s nothing to connect: RAMP makes the file and you upload it."
        action={<Link to="/admin/payouts" className="text-sm font-semibold text-brand-ink min-h-11 inline-flex items-center">Go to payouts</Link>} />
      <ol className="flex flex-col gap-3">{steps.map((st, i) => <Step key={i} n={i + 1}>{st}</Step>)}</ol>
      <p className={cx('text-[13px] text-muted')}>Team members add their payout details on My work. Bank details are encrypted, and only admins can open them.</p>
    </Card>
  );
}
