// "New invoice" sheet: pick a client and a period, preview what will be billed, then ramp_invoice_generate.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errText } from '../../../lib/supabase';
import { q, useAsync } from '../../../lib/hooks';
import { addDays, cx, fmtDate, hours, money, plural, weekStart } from '../../../lib/util';
import type { Client, InvoiceStatus, Placement, Timesheet } from '../../../lib/types';
import { Button, Field, Icon, Notice, Pills, Select, Sheet, Skeleton, useToast } from '../../../ui';
import { CustomRange, monthEnd, monthStart, prevMonth, rangeLabel, round2, usePeriod, type PeriodPreset } from './money-common';

export type BillingClient = Pick<Client, 'id' | 'name' | 'status' | 'billing_name' | 'billing_email' | 'billing_cycle' | 'billing_mode' | 'net_days' | 'currency'>;

const CYCLE: Record<Client['billing_cycle'], string> = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };

/** Period presets for a client, based on its billing cycle and mode. */
export function invoicePresets(c: BillingClient | undefined, today: string): { presets: PeriodPreset[]; initial: string } {
  const mon = weekStart(today);
  if (c?.billing_mode === 'advance') {
    const presets: PeriodPreset[] = [
      { key: 'this_week', label: 'This week', start: mon, end: addDays(mon, 6) },
      { key: 'two_weeks', label: 'This week and next', start: mon, end: addDays(mon, 13) },
      { key: 'this_month', label: 'This month', start: monthStart(today), end: monthEnd(today) },
    ];
    return { presets, initial: c.billing_cycle === 'monthly' ? 'this_month' : c.billing_cycle === 'biweekly' ? 'two_weeks' : 'this_week' };
  }
  const pm = prevMonth(today);
  const presets: PeriodPreset[] = [
    { key: 'last_week', label: 'Last week', start: addDays(mon, -7), end: addDays(mon, -1) },
    { key: 'last_2', label: 'Last 2 weeks', start: addDays(mon, -14), end: addDays(mon, -1) },
    { key: 'last_month', label: 'Last month', start: monthStart(pm), end: pm },
  ];
  return { presets, initial: c?.billing_cycle === 'monthly' ? 'last_month' : c?.billing_cycle === 'biweekly' ? 'last_2' : 'last_week' };
}

/** One line in plain words: what the invoice will include. */
export function invoiceExplainer(c: BillingClient, start: string, end: string) {
  if (c.billing_mode === 'advance') {
    return `Approved hours up to ${fmtDate(addDays(start, -1))} that aren’t billed yet, the difference for prepaid weeks that have ended, prepayment for ${rangeLabel(start, end)}, and unbilled setup fees.`;
  }
  return `Approved hours up to ${fmtDate(end)} that aren’t billed yet, and unbilled setup fees.`;
}

interface PreviewData {
  placements: Pick<Placement, 'id' | 'member_id' | 'title' | 'status' | 'start_date' | 'hours_per_week' | 'bill_rate' | 'setup_fee' | 'setup_fee_status'>[];
  timesheets: Pick<Timesheet, 'id' | 'placement_id' | 'member_id' | 'week_start' | 'total' | 'status'>[];
  prepays: { placement_id: string; period_start: string; period_end: string; status: InvoiceStatus }[];
}

async function loadPreview(clientId: string, advance: boolean): Promise<PreviewData> {
  const placements = await q<PreviewData['placements']>(supabase.from('ramp_placements')
    .select('id, member_id, title, status, start_date, hours_per_week, bill_rate, setup_fee, setup_fee_status').eq('client_id', clientId));
  const ids = placements.map((p) => p.id);
  if (!ids.length) return { placements, timesheets: [], prepays: [] };
  const [timesheets, lines] = await Promise.all([
    q<PreviewData['timesheets']>(supabase.from('ramp_timesheets').select('id, placement_id, member_id, week_start, total, status')
      .in('placement_id', ids).is('invoice_line_id', null).in('status', ['submitted', 'approved'])),
    advance
      ? q<{ invoice_id: string; placement_id: string; period_start: string; period_end: string }[]>(supabase.from('ramp_invoice_lines')
        .select('invoice_id, placement_id, period_start, period_end').in('placement_id', ids).eq('kind', 'prepay'))
      : Promise.resolve([]),
  ]);
  const invIds = [...new Set(lines.map((l) => l.invoice_id))];
  const invs = invIds.length ? await q<{ id: string; status: InvoiceStatus }[]>(supabase.from('ramp_invoices').select('id, status').in('id', invIds)) : [];
  const st = new Map(invs.map((i) => [i.id, i.status]));
  return { placements, timesheets, prepays: lines.map((l) => ({ ...l, status: st.get(l.invoice_id) || 'draft' })) };
}

export function NewInvoiceSheet({ open, onClose, clients, initialClient, today }:
  { open: boolean; onClose: () => void; clients: BillingClient[]; initialClient?: string | null; today: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [clientId, setClientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [nothing, setNothing] = useState('');
  const client = clients.find((c) => c.id === clientId);
  const { presets, initial } = useMemo(() => invoicePresets(client, today), [client, today]);
  const period = usePeriod(presets, initial);
  const { setKey, setCustom } = period;

  useEffect(() => {
    if (!open) return;
    setClientId(initialClient && clients.some((c) => c.id === initialClient) ? initialClient : '');
    setNothing('');
  }, [open, initialClient, clients]);
  // A new client brings its own presets: start from the one that fits its billing cycle.
  useEffect(() => {
    setKey(initial);
    const p = presets.find((x) => x.key === initial);
    if (p) setCustom({ start: p.start, end: p.end });
    setNothing('');
  }, [clientId, initial, presets, setKey, setCustom]);

  const preview = useAsync<PreviewData | null>(() => (open && clientId ? loadPreview(clientId, client?.billing_mode === 'advance') : Promise.resolve(null)), [open, clientId]);
  const { start, end } = period.period;
  const sum = useMemo(() => (preview.data && client && period.valid ? summarize(preview.data, client, start, end) : null), [preview.data, client, period.valid, start, end]);

  const sorted = useMemo(() => [...clients].sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.name.localeCompare(b.name)), [clients]);

  async function create() {
    if (!client || !period.valid) return;
    setBusy(true);
    setNothing('');
    try {
      const id = await q<string>(supabase.rpc('ramp_invoice_generate', { p_client: client.id, p_start: start, p_end: end }));
      toast(`Draft invoice created for ${client.name}.`);
      onClose();
      navigate(`/admin/invoices/${id}`);
    } catch (e) {
      const msg = errText(e);
      if (/nothing to bill/i.test(msg)) setNothing(msg);
      else toast(msg, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New invoice"
      subtitle="It starts as a draft, so you can check and edit the lines before you issue or send it."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="fileText" loading={busy} disabled={!client || !period.valid} onClick={create}>Create draft invoice</Button>
      </>}>
      <Field label="Client" required>
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Pick a client…</option>
          {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'active' ? ` (${c.status})` : ''}</option>)}
        </Select>
      </Field>
      {!clients.length && <Notice tone="warn">Add a client first. <Link to="/admin/clients" className="font-semibold text-brand-ink">Go to Clients</Link></Notice>}

      {client && (
        <>
          <p className="text-sm text-muted -mt-2 leading-relaxed">
            {CYCLE[client.billing_cycle]}, {client.billing_mode === 'advance' ? 'billed in advance' : 'billed after the work (arrears)'} · due {plural(client.net_days, 'day')} after issue ·{' '}
            {client.billing_email ? client.billing_email : <span className="text-warn font-semibold">no billing email yet</span>} ·{' '}
            <Link to={`/admin/clients/${client.id}`} className="font-semibold text-brand-ink">Billing settings</Link>
          </p>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="text-[13px] font-semibold text-ink-2 mb-1.5">Period</legend>
            <Pills label="Period" size="sm" value={period.key} onChange={period.setKey}
              options={[...presets.map((p) => ({ value: p.key, label: p.label })), { value: 'custom', label: 'Custom' }]} />
            {period.key === 'custom' ? <CustomRange value={period.custom} onChange={period.setCustom} />
              : <p className="text-[15px] font-semibold tabular-nums">{rangeLabel(start, end, true)}</p>}
          </fieldset>

          {period.valid && (
            <p className="flex gap-2 text-[15px] text-ink-2 leading-relaxed">
              <Icon name="info" size={18} className="mt-0.5 text-brand-ink" />
              <span><span className="font-semibold">Includes: </span>{invoiceExplainer(client, start, end)}</span>
            </p>
          )}

          {preview.loading && !preview.data ? <Skeleton rows={1} />
            : preview.error ? <Notice tone="bad" icon="alert">Couldn’t load the preview: {preview.error}</Notice>
              : sum && <Preview sum={sum} client={client} start={start} end={end} />}

          {nothing && (
            <Notice tone="warn" icon="info">
              <p className="font-semibold">{nothing}</p>
              <p className="mt-1">There are no approved hours{client.billing_mode === 'advance' ? ', prepayments' : ''} or setup fees waiting for {client.name} in this period.
                Approve waiting hours first, or pick a longer period. <Link to="/admin/timesheets" className="font-semibold underline">Open timesheets</Link></p>
            </Notice>
          )}
          {!client.billing_email && (
            <Notice tone="warn" icon="mail">No billing email for {client.name} yet. You can still create and issue the invoice, but add an email before sending it through Stripe.</Notice>
          )}
        </>
      )}
    </Sheet>
  );
}

interface Summary {
  approvedHours: number; approvedPeople: number; approvedEst: number;
  waitingHours: number; waitingWeeks: number;
  setupCount: number; setupTotal: number;
  prepayHours: number; prepayPeople: number; prepayEst: number;
}

function summarize(d: PreviewData, c: BillingClient, start: string, end: string): Summary {
  const byId = new Map(d.placements.map((p) => [p.id, p]));
  const covered = (pid: string, week: string) => d.prepays.some((l) => l.placement_id === pid && l.status !== 'void' && l.period_start <= week && week <= l.period_end);
  const approved = d.timesheets.filter((t) => t.status === 'approved' && t.week_start <= end && (c.billing_mode === 'arrears' || !covered(t.placement_id, t.week_start)));
  const waiting = d.timesheets.filter((t) => t.status === 'submitted' && t.week_start <= end);
  const setups = d.placements.filter((p) => Number(p.setup_fee) > 0 && p.setup_fee_status === 'unbilled');
  let prepayHours = 0, prepayEst = 0, prepayPeople = 0;
  if (c.billing_mode === 'advance') {
    for (const p of d.placements) {
      if (!['onboarding', 'active'].includes(p.status) || !(Number(p.hours_per_week) > 0)) continue;
      if ((p.start_date || start) > end) continue;
      if (d.prepays.some((l) => l.placement_id === p.id && l.status !== 'void' && l.period_start <= end && l.period_end >= start)) continue;
      const from = p.start_date && p.start_date > start ? p.start_date : start;
      const days = Math.round((new Date(end + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000) + 1;
      const h = round2(Number(p.hours_per_week) * Math.round((days / 7) * 100) / 100);
      if (h <= 0) continue;
      prepayHours += h; prepayEst += h * Number(p.bill_rate); prepayPeople++;
    }
  }
  return {
    approvedHours: approved.reduce((a, t) => a + Number(t.total), 0),
    approvedPeople: new Set(approved.filter((t) => Number(t.total) > 0).map((t) => t.member_id)).size,
    approvedEst: approved.reduce((a, t) => a + Number(t.total) * Number(byId.get(t.placement_id)?.bill_rate || 0), 0),
    waitingHours: waiting.reduce((a, t) => a + Number(t.total), 0), waitingWeeks: waiting.length,
    setupCount: setups.length, setupTotal: setups.reduce((a, p) => a + Number(p.setup_fee), 0),
    prepayHours, prepayPeople, prepayEst,
  };
}

function Preview({ sum, client, start, end }: { sum: Summary; client: BillingClient; start: string; end: string }) {
  const cur = client.currency || 'USD';
  const est = sum.approvedEst + sum.setupTotal + sum.prepayEst;
  const empty = sum.approvedHours <= 0 && sum.setupCount === 0 && sum.prepayHours <= 0;
  const row = (icon: string, label: string, value: string, sub?: string) => (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon name={icon} size={18} className="mt-0.5 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug">{label}</p>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      <span className="text-[15px] font-semibold tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className={cx('rounded-2xl border border-line divide-y divide-line-2 bg-white', empty && 'opacity-80')} aria-label="What this invoice will include">
        {sum.approvedHours > 0 && row('clock', 'Approved hours', hours(sum.approvedHours), plural(sum.approvedPeople, 'team member'))}
        {sum.prepayHours > 0 && row('calendar', `Prepayment for ${rangeLabel(start, end)}`, hours(sum.prepayHours), `${plural(sum.prepayPeople, 'team member')}, scheduled hours`)}
        {sum.setupCount > 0 && row('star', plural(sum.setupCount, 'setup fee'), money(sum.setupTotal, cur))}
        {empty
          ? <p className="px-4 py-3 text-[15px] text-muted">Nothing is waiting to bill for this period yet.</p>
          : (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-bg rounded-b-2xl">
              <span className="text-sm text-muted">Estimate at current rates. The draft shows the exact amounts.</span>
              <span className="font-display text-lg font-bold tabular-nums whitespace-nowrap">≈ {money(est, cur)}</span>
            </div>
          )}
      </div>
      {sum.waitingHours > 0 && (
        <Notice tone="warn" icon="clock">
          {hours(sum.waitingHours)} ({plural(sum.waitingWeeks, 'week')}) up to {fmtDate(end)} {sum.waitingWeeks === 1 ? 'is' : 'are'} still waiting for approval and won’t be included.{' '}
          <Link to="/admin/timesheets" className="font-semibold underline">Review hours</Link>
        </Notice>
      )}
    </div>
  );
}
