// Timesheets page helpers: loading, billing links, and the sheets for entering, returning and viewing hours.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../../../lib/supabase';
import { q, useAsync } from '../../../lib/hooks';
import { PLACEMENT_STATUS, TIMESHEET_STATUS, addDays, fmtDateTime, hours, weekLabel, weekStart } from '../../../lib/util';
import type { Client, InvoiceStatus, Payout, Placement, Timesheet } from '../../../lib/types';
import { Button, Chip, Field, Input, Notice, Select, Sheet, Skeleton, Switch, Textarea, useToast } from '../../../ui';
import { DaysGrid, DaysInput, loadMembers, nameOf, num, readDays, recentWeeks, selectIn, type MemberLite } from './money-common';

export interface PlacementRef { p: Placement; name: string; client: string }
export interface TsLink {
  invoice?: { id: string; number: string; status: InvoiceStatus };
  payout?: { id: string; label: string; status: Payout['status'] };
}
export interface TsData {
  since: string;
  timesheets: Timesheet[];
  placements: Map<string, PlacementRef>;
  placementList: PlacementRef[];
  clients: Map<string, Pick<Client, 'id' | 'name' | 'status'>>;
  members: Map<string, MemberLite>;
  links: Map<string, TsLink>;
}

/** Timesheets from `weeksBack` weeks ago (plus anything still waiting), with names and invoice/payout links. */
export async function loadTimesheetData(today: string, weeksBack: number): Promise<TsData> {
  const since = addDays(weekStart(today), -7 * weeksBack);
  const [timesheets, placements, clients] = await Promise.all([
    q<Timesheet[]>(supabase.from('ramp_timesheets').select('*').or(`week_start.gte.${since},status.eq.submitted`).order('week_start', { ascending: false })),
    q<Placement[]>(supabase.from('ramp_placements').select('*')),
    q<Pick<Client, 'id' | 'name' | 'status'>[]>(supabase.from('ramp_clients').select('id, name, status').order('name')),
  ]);
  const [members, invLines, poLines] = await Promise.all([
    loadMembers([...placements.map((p) => p.member_id), ...timesheets.map((t) => t.reviewed_by)]),
    selectIn<{ id: string; invoice_id: string }>('ramp_invoice_lines', 'id, invoice_id', 'id', timesheets.map((t) => t.invoice_line_id)),
    selectIn<{ id: string; payout_id: string }>('ramp_payout_lines', 'id, payout_id', 'id', timesheets.map((t) => t.payout_line_id)),
  ]);
  const [invoices, payouts] = await Promise.all([
    selectIn<{ id: string; number: string; status: InvoiceStatus }>('ramp_invoices', 'id, number, status', 'id', invLines.map((l) => l.invoice_id)),
    selectIn<{ id: string; label: string; status: Payout['status'] }>('ramp_payouts', 'id, label, status', 'id', poLines.map((l) => l.payout_id)),
  ]);
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const refs: PlacementRef[] = placements.map((p) => ({ p, name: nameOf(members.get(p.member_id)), client: clientMap.get(p.client_id)?.name || 'Client' }));
  refs.sort((a, b) => a.client.localeCompare(b.client) || a.name.localeCompare(b.name));
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const poById = new Map(payouts.map((p) => [p.id, p]));
  const invByLine = new Map(invLines.map((l) => [l.id, invById.get(l.invoice_id)]));
  const poByLine = new Map(poLines.map((l) => [l.id, poById.get(l.payout_id)]));
  const links = new Map<string, TsLink>();
  for (const t of timesheets) {
    const invoice = t.invoice_line_id ? invByLine.get(t.invoice_line_id) : undefined;
    const payout = t.payout_line_id ? poByLine.get(t.payout_line_id) : undefined;
    if (invoice || payout) links.set(t.id, { invoice, payout });
  }
  return { since, timesheets, placements: new Map(refs.map((r) => [r.p.id, r])), placementList: refs, clients: clientMap, members, links };
}

export const isLocked = (t: Pick<Timesheet, 'invoice_line_id' | 'payout_line_id'> | null | undefined) => !!t && (!!t.invoice_line_id || !!t.payout_line_id);

/** Where an approved week stands: on an invoice, paid by the client, paid out. */
export function BillingChips({ ts, link }: { ts: Timesheet; link?: TsLink }) {
  if (ts.status !== 'approved') return null;
  const inv = link?.invoice, po = link?.payout;
  if (!inv && !po) {
    if (ts.invoice_line_id || ts.payout_line_id) return <Chip tone="neutral">Billed</Chip>;
    return <Chip tone="neutral">Not billed yet</Chip>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {inv && (
        <Link to={`/admin/invoices/${inv.id}`} className="no-underline" aria-label={`Invoice ${inv.number}`}>
          <Chip tone={inv.status === 'paid' ? 'good' : inv.status === 'open' ? 'warn' : 'neutral'} icon="fileText">
            {inv.number}{inv.status === 'paid' ? ' · paid' : inv.status === 'draft' ? ' · draft' : ''}
          </Chip>
        </Link>
      )}
      {po && (
        <Link to={`/admin/payouts/${po.id}`} className="no-underline" aria-label={`Payout: ${po.label}`}>
          <Chip tone={po.status === 'sent' ? 'good' : 'brand'} icon="send">{po.status === 'sent' ? 'Paid out' : 'On a payout'}</Chip>
        </Link>
      )}
    </span>
  );
}

// ───────── enter hours for someone ─────────

export interface EntryPrefill { placementId?: string; week?: string }

export function EntrySheet({ open, onClose, placements, today, prefill, onSaved }:
  { open: boolean; onClose: () => void; placements: PlacementRef[]; today: string; prefill: EntryPrefill | null; onSaved: () => void }) {
  const toast = useToast();
  const thisMon = weekStart(today);
  const weeks = useMemo(() => recentWeeks(today, 16), [today]);
  const [placementId, setPlacementId] = useState('');
  const [weekSel, setWeekSel] = useState('');
  const [otherDate, setOtherDate] = useState('');
  const [days, setDays] = useState<string[]>(Array(7).fill(''));
  const [notes, setNotes] = useState('');
  const [approve, setApprove] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const w = prefill?.week || addDays(thisMon, -7);
    setPlacementId(prefill?.placementId || '');
    if (weeks.includes(w)) { setWeekSel(w); setOtherDate(''); } else { setWeekSel('other'); setOtherDate(w); }
    setDays(Array(7).fill(''));
    setNotes('');
    setApprove(true);
    setErr('');
  }, [open, prefill, thisMon, weeks]);

  const week = weekSel === 'other' ? (otherDate ? weekStart(otherDate) : '') : weekSel;
  const ref = placements.find((r) => r.p.id === placementId);
  const existing = useAsync<Timesheet | null>(async () => (open && placementId && week
    ? q<Timesheet | null>(supabase.from('ramp_timesheets').select('*').eq('placement_id', placementId).eq('week_start', week).maybeSingle())
    : null), [open, placementId, week]);
  const ex = existing.data;
  useEffect(() => {
    if (existing.loading) return;
    setDays(ex ? Array.from({ length: 7 }, (_, i) => (Number(ex.days?.[i]) ? String(Number(ex.days[i])) : '')) : Array(7).fill(''));
    setNotes(ex?.notes || '');
  }, [ex, existing.loading]);

  const locked = isLocked(ex);
  const perDay = ref && ref.p.hours_per_week > 0 ? Math.round((ref.p.hours_per_week / 5) * 4) / 4 : 0;
  const byClient = useMemo(() => {
    const g = new Map<string, PlacementRef[]>();
    for (const r of placements.filter((x) => x.p.status !== 'proposed')) g.set(r.client, [...(g.get(r.client) || []), r]);
    for (const list of g.values()) list.sort((a, b) => Number(a.p.status === 'ended') - Number(b.p.status === 'ended') || a.name.localeCompare(b.name));
    return [...g.entries()];
  }, [placements]);

  async function save() {
    setErr('');
    if (!placementId) return setErr('Pick whose hours these are.');
    if (!week) return setErr('Pick the week.');
    if (week > thisMon) return setErr('That week hasn’t started yet. Pick this week or an earlier one.');
    const r = readDays(days);
    if ('error' in r) return setErr(r.error);
    setSaving(true);
    try {
      await q(supabase.rpc('ramp_timesheet_admin_save', { p_placement: placementId, p_week: week, p_days: r.days, p_notes: notes.trim(), p_approve: approve }));
      const total = r.days.reduce((a, b) => a + b, 0);
      toast(`${approve ? 'Approved' : 'Saved'} ${hours(total)} for ${ref?.name || 'the assistant'}, ${weekLabel(week)}.`);
      onSaved();
      onClose();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setSaving(false);
    }
  }

  const weekName = (w: string) => (w === thisMon ? `This week (${weekLabel(w)})` : w === addDays(thisMon, -7) ? `Last week (${weekLabel(w)})` : weekLabel(w));

  return (
    <Sheet open={open} onClose={onClose} title="Enter hours for someone"
      subtitle="Log or correct a week for an assistant, for example when they couldn’t send it themselves."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="check" loading={saving} disabled={locked || existing.loading} onClick={save}>{approve ? 'Save and approve' : 'Save for approval'}</Button>
      </>}>
      <Field label="Assistant and placement" required>
        <Select value={placementId} onChange={(e) => setPlacementId(e.target.value)}>
          <option value="">Pick an assistant…</option>
          {byClient.map(([client, list]) => (
            <optgroup key={client} label={client}>
              {list.map((r) => (
                <option key={r.p.id} value={r.p.id}>
                  {r.name} · {r.p.title}{r.p.status !== 'active' ? ` (${PLACEMENT_STATUS[r.p.status].label.toLowerCase()})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      {!byClient.length && <Notice tone="warn">There are no placements yet. Add a placement first, then you can log hours for it.</Notice>}

      <Field label="Week" required hint={weekSel === 'other' && otherDate ? `Uses the week of ${weekLabel(weekStart(otherDate))} (Monday to Sunday).` : 'Weeks run Monday to Sunday.'}>
        <Select value={weekSel} onChange={(e) => setWeekSel(e.target.value)}>
          {weeks.map((w) => <option key={w} value={w}>{weekName(w)}</option>)}
          <option value="other">Another week…</option>
        </Select>
      </Field>
      {weekSel === 'other' && (
        <Field label="Any day in that week">
          <Input type="date" value={otherDate} max={addDays(thisMon, 6)} onChange={(e) => setOtherDate(e.target.value)} />
        </Field>
      )}

      {placementId && week && existing.loading && <Skeleton rows={1} />}
      {placementId && week && !existing.loading && existing.error && <Notice tone="bad" icon="alert">{existing.error}</Notice>}
      {ex && !locked && (
        <Notice tone={ex.status === 'approved' ? 'good' : 'warn'}>
          This week already has {hours(ex.total)} ({TIMESHEET_STATUS[ex.status].label.toLowerCase()}). Saving replaces it.
        </Notice>
      )}
      {locked && (
        <Notice tone="bad" icon="lock">
          This week is already on {ex?.invoice_line_id ? 'an invoice' : 'a payout'}, so its hours can’t change here.
          Void that {ex?.invoice_line_id ? 'invoice' : 'payout'} first, or add an adjustment line to the next one.
        </Notice>
      )}

      {placementId && week && !existing.loading && !locked && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-semibold text-ink-2 mb-1.5">Hours each day</legend>
            <DaysInput value={days} onChange={setDays} />
            {perDay > 0 && (
              <button type="button" className="self-start min-h-11 px-1 text-sm font-semibold text-brand-ink cursor-pointer"
                onClick={() => setDays((d) => d.map((v, i) => (i < 5 ? String(perDay) : v)))}>
                Fill Mon–Fri with {num(perDay)} h ({num(ref!.p.hours_per_week)} h a week)
              </button>
            )}
          </fieldset>
          <Field label="Notes" hint="Optional. The assistant can see these.">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="For example: entered from the client’s report" />
          </Field>
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">Approve now</p>
              <p className="text-sm text-muted leading-relaxed">
                {approve ? 'These hours are ready for the next invoice and payout.' : 'These hours wait in the approval queue for you or the client.'}
              </p>
            </div>
            <Switch checked={approve} onChange={setApprove} label="Approve now" />
          </div>
        </>
      )}
      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
    </Sheet>
  );
}

// ───────── return with a note ─────────

export function ReturnSheet({ target, onClose, onReturn }:
  { target: { ts: Timesheet; name: string } | null; onClose: () => void; onReturn: (ts: Timesheet, note: string) => Promise<boolean> }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(''); setErr(''); }, [target]);
  if (!target) return null;
  const submit = async () => {
    if (!note.trim()) return setErr('Add a note so the assistant knows what to fix.');
    setBusy(true);
    const ok = await onReturn(target.ts, note.trim());
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`Return ${target.name}’s hours`}
      subtitle={`Week of ${weekLabel(target.ts.week_start)} · ${hours(target.ts.total)}. They’ll see your note, fix the week and send it again.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="replay" loading={busy} onClick={submit}>Return with this note</Button></>}>
      <DaysGrid days={target.ts.days} total={target.ts.total} />
      <Field label="What needs to change?" required error={err || undefined}>
        <Textarea rows={3} value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} maxLength={1000}
          placeholder="For example: Tuesday looks too high. The client says you finished at 3 pm." />
      </Field>
    </Sheet>
  );
}

// ───────── one week, in full ─────────

export function TimesheetSheet({ ts, data, tz, onClose, onApprove, onReturn, onEdit }:
  { ts: Timesheet | null; data: TsData; tz: string; onClose: () => void; onApprove: (t: Timesheet) => void; onReturn: (t: Timesheet) => void; onEdit: (t: Timesheet) => void }) {
  if (!ts) return null;
  const ref = data.placements.get(ts.placement_id);
  const link = data.links.get(ts.id);
  const s = TIMESHEET_STATUS[ts.status];
  const locked = isLocked(ts);
  const reviewer = ts.reviewed_by ? data.members.get(ts.reviewed_by) : undefined;
  return (
    <Sheet open onClose={onClose} title={ref?.name || 'Timesheet'} subtitle={`${ref?.client || ''} · ${ref?.p.title || ''} · ${weekLabel(ts.week_start)}`}
      footer={<>
        {!locked && <Button icon="pen" onClick={() => onEdit(ts)}>Edit hours</Button>}
        {ts.status === 'submitted' && <Button icon="replay" onClick={() => onReturn(ts)}>Return</Button>}
        {ts.status === 'submitted' && <Button variant="success" icon="check" onClick={() => onApprove(ts)}>Approve</Button>}
        {ts.status !== 'submitted' && <Button onClick={onClose}>Close</Button>}
      </>}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={s.tone}>{s.label}</Chip>
        <BillingChips ts={ts} link={link} />
      </div>
      <DaysGrid days={ts.days} total={ts.total} />
      {ts.notes && <p className="text-[15px] bg-chip rounded-xl px-3.5 py-2.5 whitespace-pre-line"><span className="font-semibold">Assistant’s note: </span>{ts.notes}</p>}
      {ts.review_note && <p className="text-[15px] bg-warn-soft text-warn rounded-xl px-3.5 py-2.5 whitespace-pre-line"><span className="font-semibold">Review note: </span>{ts.review_note}</p>}
      <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {ts.submitted_at && <><dt className="text-muted">Sent</dt><dd>{fmtDateTime(ts.submitted_at, tz)}</dd></>}
        {ts.reviewed_at && (
          <><dt className="text-muted">{ts.status === 'rejected' ? 'Returned' : 'Approved'}</dt>
            <dd>{fmtDateTime(ts.reviewed_at, tz)}{reviewer ? ` by ${nameOf(reviewer)}` : ''}</dd></>
        )}
        {ref && <><dt className="text-muted">Usual week</dt><dd>{hours(ref.p.hours_per_week)}</dd></>}
      </dl>
      {locked && (
        <Notice tone="brand" icon="lock">
          These hours are on {[ts.invoice_line_id && (link?.invoice ? `invoice ${link.invoice.number}` : 'an invoice'), ts.payout_line_id && 'a payout'].filter(Boolean).join(' and ')},
          so they can’t be edited here. To change them, {ts.invoice_line_id ? 'void the invoice' : 'discard the payout'} first, or add an adjustment line to the next one.
        </Notice>
      )}
    </Sheet>
  );
}
