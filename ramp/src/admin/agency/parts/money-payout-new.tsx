// Payouts page helpers: the approved hours not paid out yet, and the "New payout" sheet.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errText } from '../../../lib/supabase';
import { q } from '../../../lib/hooks';
import { addDays, cx, hours, money, plural, weekLabel, weekStart } from '../../../lib/util';
import type { InvoiceStatus, Placement, Timesheet } from '../../../lib/types';
import { Avatar, Button, Card, CardHeader, EmptyState, Icon, Notice, Pills, Sheet, Switch, useToast } from '../../../ui';
import { CustomRange, loadMembers, monthStart, nameOf, prevMonth, rangeLabel, selectIn, usePeriod, type MemberLite, type PeriodPreset } from './money-common';

export interface WaitingRow { id: string; member_id: string; placement_id: string; week_start: string; total: number; rate: number; paid: boolean; client: string }
export interface WaitingData { rows: WaitingRow[]; members: Map<string, MemberLite> }

/** Approved weeks not on any payout, each marked paid when its invoice (or the prepayment covering it) is paid. */
export async function loadWaiting(): Promise<WaitingData> {
  const ts = await q<Pick<Timesheet, 'id' | 'member_id' | 'placement_id' | 'week_start' | 'total' | 'pay_rate' | 'invoice_line_id'>[]>(
    supabase.from('ramp_timesheets').select('id, member_id, placement_id, week_start, total, pay_rate, invoice_line_id').eq('status', 'approved').is('payout_line_id', null));
  const placements = await selectIn<Pick<Placement, 'id' | 'client_id' | 'title' | 'pay_rate'>>('ramp_placements', 'id, client_id, title, pay_rate', 'id', ts.map((t) => t.placement_id));
  const [lines, prepayLines, members, clients] = await Promise.all([
    selectIn<{ id: string; invoice_id: string }>('ramp_invoice_lines', 'id, invoice_id', 'id', ts.map((t) => t.invoice_line_id)),
    selectIn<{ invoice_id: string; placement_id: string; period_start: string; period_end: string; kind: string }>(
      'ramp_invoice_lines', 'invoice_id, placement_id, period_start, period_end, kind', 'placement_id', placements.map((p) => p.id)),
    loadMembers(ts.map((t) => t.member_id)),
    selectIn<{ id: string; name: string }>('ramp_clients', 'id, name', 'id', placements.map((p) => p.client_id)),
  ]);
  const prepays = prepayLines.filter((l) => l.kind === 'prepay');
  const invoices = await selectIn<{ id: string; status: InvoiceStatus }>('ramp_invoices', 'id, status', 'id', [...lines.map((l) => l.invoice_id), ...prepays.map((l) => l.invoice_id)]);
  const invStatus = new Map(invoices.map((i) => [i.id, i.status]));
  const lineInv = new Map(lines.map((l) => [l.id, l.invoice_id]));
  const pById = new Map(placements.map((p) => [p.id, p]));
  const cName = new Map(clients.map((c) => [c.id, c.name]));
  const rows: WaitingRow[] = ts.map((t) => {
    const p = pById.get(t.placement_id);
    const viaInvoice = !!t.invoice_line_id && invStatus.get(lineInv.get(t.invoice_line_id) || '') === 'paid';
    const viaPrepay = prepays.some((l) => l.placement_id === t.placement_id && invStatus.get(l.invoice_id) === 'paid' && l.period_start <= t.week_start && t.week_start <= l.period_end);
    return {
      id: t.id, member_id: t.member_id, placement_id: t.placement_id, week_start: t.week_start, total: Number(t.total),
      rate: Number(t.pay_rate ?? p?.pay_rate ?? 0), paid: viaInvoice || viaPrepay, client: cName.get(p?.client_id || '') || 'Client',
    };
  });
  return { rows, members };
}

interface Group { memberId: string; name: string; readyH: number; readyAmt: number; waitH: number; waitAmt: number; oldest: string; clients: string[] }

function group(d: WaitingData): Group[] {
  const g = new Map<string, Group>();
  for (const r of d.rows) {
    if (!(r.total > 0)) continue;
    const x = g.get(r.member_id) || { memberId: r.member_id, name: nameOf(d.members.get(r.member_id)), readyH: 0, readyAmt: 0, waitH: 0, waitAmt: 0, oldest: r.week_start, clients: [] };
    if (r.paid) { x.readyH += r.total; x.readyAmt += r.total * r.rate; } else { x.waitH += r.total; x.waitAmt += r.total * r.rate; }
    if (r.week_start < x.oldest) x.oldest = r.week_start;
    if (!x.clients.includes(r.client)) x.clients.push(r.client);
    g.set(r.member_id, x);
  }
  return [...g.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Who's owed for approved hours, split by whether the client has paid for them. */
export function WaitingCard({ data, currency, onNew }: { data: WaitingData; currency: string; onNew: () => void }) {
  const groups = useMemo(() => group(data), [data]);
  const t = groups.reduce((a, x) => ({ rh: a.rh + x.readyH, ra: a.ra + x.readyAmt, wh: a.wh + x.waitH, wa: a.wa + x.waitAmt }), { rh: 0, ra: 0, wh: 0, wa: 0 });
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <CardHeader title="Approved hours not paid out yet"
          subtitle="Ready: the client has paid for these weeks (or prepaid them). Waiting: the client hasn’t paid yet. Amounts are estimates at each week’s pay rate."
          action={groups.length > 0 ? <Button size="sm" icon="plus" onClick={onNew}>New payout</Button> : undefined} />
      </div>
      {groups.length === 0 ? (
        <EmptyState icon="check" title="Everyone’s paid up" body="Approved hours show up here until they go on a payout." />
      ) : (
        <>
          <table className="hidden md:table w-full text-[15px]">
            <caption className="sr-only">Approved hours not paid out, by team member</caption>
            <thead>
              <tr className="text-left text-[13px] text-muted border-y border-line">
                <th scope="col" className="font-semibold px-5 py-2.5">Team member</th>
                <th scope="col" className="font-semibold px-3 py-2.5 text-right">Ready to pay</th>
                <th scope="col" className="font-semibold px-3 py-2.5 text-right">Waiting on the client</th>
                <th scope="col" className="font-semibold px-5 py-2.5">Oldest week</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.memberId} className="border-t border-line-2">
                  <td className="px-5 py-3">
                    <p className="font-semibold leading-snug">{g.name}</p>
                    <p className="text-sm text-muted leading-snug">{g.clients.join(', ')}</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {g.readyH > 0 ? <><p className="font-semibold text-good">{money(g.readyAmt, currency)}</p><p className="text-sm text-muted">{hours(g.readyH)}</p></> : <span className="text-muted">–</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {g.waitH > 0 ? <><p className="font-semibold">{money(g.waitAmt, currency)}</p><p className="text-sm text-muted">{hours(g.waitH)}</p></> : <span className="text-muted">–</span>}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-ink-2">{weekLabel(g.oldest)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line bg-bg/60 font-semibold">
                <td className="px-5 py-3">Total</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(t.ra, currency)}<span className="block text-sm font-normal text-muted">{hours(t.rh)}</span></td>
                <td className="px-3 py-3 text-right tabular-nums">{money(t.wa, currency)}<span className="block text-sm font-normal text-muted">{hours(t.wh)}</span></td>
                <td />
              </tr>
            </tbody>
          </table>
          <ul className="md:hidden border-t border-line">
            {groups.map((g) => (
              <li key={g.memberId} className="px-4 py-3.5 border-t border-line-2 first:border-t-0">
                <div className="flex items-center gap-3">
                  <Avatar name={g.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{g.name}</p>
                    <p className="text-xs text-muted truncate">{g.clients.join(', ')} · since {weekLabel(g.oldest)}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
                  <div className="rounded-xl bg-good-soft px-3 py-2">
                    <p className="text-xs font-semibold text-good">Ready</p>
                    <p className="font-semibold">{g.readyH > 0 ? money(g.readyAmt, currency) : '–'}</p>
                    {g.readyH > 0 && <p className="text-xs text-muted">{hours(g.readyH)}</p>}
                  </div>
                  <div className="rounded-xl bg-chip px-3 py-2">
                    <p className="text-xs font-semibold text-ink-2">Waiting on the client</p>
                    <p className="font-semibold">{g.waitH > 0 ? money(g.waitAmt, currency) : '–'}</p>
                    {g.waitH > 0 && <p className="text-xs text-muted">{hours(g.waitH)}</p>}
                  </div>
                </div>
              </li>
            ))}
            <li className="px-4 py-3 border-t border-line bg-bg/60 flex justify-between gap-3 text-sm font-semibold tabular-nums">
              <span>Ready {money(t.ra, currency)}</span><span className="text-muted">Waiting {money(t.wa, currency)}</span>
            </li>
          </ul>
        </>
      )}
    </Card>
  );
}

// ───────── new payout ─────────

export function payoutPresets(today: string): PeriodPreset[] {
  const mon = weekStart(today);
  const pm = prevMonth(today);
  return [
    { key: 'last_2', label: 'Last 2 weeks', start: addDays(mon, -14), end: addDays(mon, -1) },
    { key: 'last_month', label: 'Last month', start: monthStart(pm), end: pm },
  ];
}

export function NewPayoutSheet({ open, onClose, today, waiting, defaultOnlyPaid, currency }:
  { open: boolean; onClose: () => void; today: string; waiting: WaitingData | undefined; defaultOnlyPaid: boolean; currency: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const presets = useMemo(() => payoutPresets(today), [today]);
  const period = usePeriod(presets, 'last_2');
  const [onlyPaid, setOnlyPaid] = useState(defaultOnlyPaid);
  const [busy, setBusy] = useState(false);
  const [nothing, setNothing] = useState('');
  const { setKey } = period;
  useEffect(() => { if (open) { setOnlyPaid(defaultOnlyPaid); setNothing(''); setKey('last_2'); } }, [open, defaultOnlyPaid, setKey]);

  const { start, end } = period.period;
  const preview = useMemo(() => {
    if (!waiting || !period.valid) return null;
    const inRange = waiting.rows.filter((r) => r.week_start >= start && r.week_start <= end && r.total > 0);
    const pick = inRange.filter((r) => !onlyPaid || r.paid);
    const left = inRange.filter((r) => onlyPaid && !r.paid);
    return {
      people: new Set(pick.map((r) => r.member_id)).size, h: pick.reduce((a, r) => a + r.total, 0), amt: pick.reduce((a, r) => a + r.total * r.rate, 0),
      leftH: left.reduce((a, r) => a + r.total, 0), leftPeople: new Set(left.map((r) => r.member_id)).size,
    };
  }, [waiting, period.valid, start, end, onlyPaid]);

  async function create() {
    if (!period.valid) return;
    setBusy(true);
    setNothing('');
    try {
      const id = await q<string>(supabase.rpc('ramp_payout_generate', { p_start: start, p_end: end, p_only_paid: onlyPaid }));
      toast('Draft payout created.');
      onClose();
      navigate(`/admin/payouts/${id}`);
    } catch (e) {
      const msg = errText(e);
      if (/no approved hours/i.test(msg)) setNothing(msg);
      else toast(msg, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New payout"
      subtitle="Gathers approved hours into a draft payout. Nothing is sent until you export it and pay in Wise."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="send" loading={busy} disabled={!period.valid} onClick={create}>Create draft payout</Button></>}>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-[13px] font-semibold text-ink-2 mb-1.5">Weeks to pay</legend>
        <Pills label="Weeks to pay" size="sm" value={period.key} onChange={period.setKey}
          options={[...presets.map((p) => ({ value: p.key, label: p.label })), { value: 'custom', label: 'Custom' }]} />
        {period.key === 'custom' ? <CustomRange value={period.custom} onChange={period.setCustom} />
          : <p className="text-[15px] font-semibold">{rangeLabel(start, end, true)}</p>}
        {period.valid && <p className="text-sm text-muted leading-relaxed">Includes approved weeks starting {rangeLabel(start, end)} that aren’t on another payout yet.</p>}
      </fieldset>

      <div className="flex items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Only hours from paid invoices</p>
          <p className="text-sm text-muted leading-relaxed">
            {onlyPaid
              ? 'Pays only for weeks the client has already paid for, or prepaid. Safer for cash flow.'
              : 'Pays every approved week in the period, even if the client hasn’t paid for it yet.'}
            {' '}Your agency setting is {defaultOnlyPaid ? 'on' : 'off'}.
          </p>
        </div>
        <Switch checked={onlyPaid} onChange={setOnlyPaid} label="Only hours from paid invoices" />
      </div>

      {preview && (
        <div className={cx('rounded-2xl border px-4 py-3 flex items-center gap-3', preview.h > 0 ? 'border-line bg-white' : 'border-line bg-bg')}>
          <Icon name={preview.h > 0 ? 'users' : 'info'} size={20} className="text-muted" />
          <p className="flex-1 text-[15px] leading-snug">
            {preview.h > 0 ? <>About <span className="font-semibold">{plural(preview.people, 'team member')}</span>, {hours(preview.h)}</> : 'Nothing to pay with these settings yet.'}
          </p>
          {preview.h > 0 && <span className="font-display text-lg font-bold tabular-nums">≈ {money(preview.amt, currency)}</span>}
        </div>
      )}
      {preview && preview.leftH > 0 && (
        <p className="text-sm text-muted">{hours(preview.leftH)} for {plural(preview.leftPeople, 'team member')} in this period {preview.leftH === 1 ? 'is' : 'are'} left out because the client hasn’t paid yet.</p>
      )}
      {nothing && (
        <Notice tone="warn">
          <p className="font-semibold">{nothing}</p>
          <p className="mt-1">{onlyPaid ? 'Turn off “Only hours from paid invoices”, mark paid invoices as paid, or pick another period.' : 'Approve waiting hours first, or pick another period.'}</p>
        </Notice>
      )}
    </Sheet>
  );
}
