// Placement › Hours: weekly timesheets with their status and what they bill and pay.
// Admins approve or return submitted weeks, and can enter or correct any week that isn't billed or paid yet.

import { useMemo, useState, type FormEvent } from 'react';
import { supabase, errText } from '../../../lib/supabase';
import { DAY_NAMES, TIMESHEET_STATUS, addDays, cx, money, plural, weekLabel, weekStart } from '../../../lib/util';
import type { Placement, RateChange, Timesheet } from '../../../lib/types';
import { Button, Card, Checkbox, Chip, EmptyState, Field, Notice, Select, Sheet, Textarea, useToast } from '../../../ui';
import { useBadges } from '../../../shell/AppShell';
import { FormError } from '../../parts/ops-common';
import { hoursText, num, ratesAt } from './core-common';

export function HoursTab({ placement, timesheets, rateChanges, assistant, client, onChanged }: {
  placement: Placement; timesheets: Timesheet[]; rateChanges: RateChange[]; assistant: string; client: string; onChanged: () => void;
}) {
  const toast = useToast();
  const badges = useBadges();
  const [enter, setEnter] = useState<{ week: string } | null>(null);
  const [ret, setRet] = useState<Timesheet | null>(null);
  const [busy, setBusy] = useState('');
  const rows = useMemo(() => [...timesheets].sort((a, b) => b.week_start.localeCompare(a.week_start)), [timesheets]);
  const cur = placement.currency || 'USD';
  const waiting = rows.filter((t) => t.status === 'submitted').length;
  const thisWeek = rows.find((t) => t.week_start === weekStart());
  const unpaid = rows.filter((t) => t.status === 'approved' && !t.payout_line_id);

  async function approve(t: Timesheet) {
    setBusy(t.id);
    const { error } = await supabase.rpc('ramp_timesheet_review', { p_timesheet: t.id, p_approve: true, p_note: '' });
    setBusy('');
    if (error) { toast(errText(error), 'bad'); return; }
    toast(`${hoursText(t.total)} approved for ${weekLabel(t.week_start)}.`);
    badges.refresh();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="grid grid-cols-3 gap-3 sm:gap-8 flex-1 min-w-0">
          <div><p className="text-[13px] font-semibold text-muted">This week</p><p className="text-xl font-semibold tabular-nums whitespace-nowrap">{hoursText(thisWeek?.total)}</p></div>
          <div><p className="text-[13px] font-semibold text-muted">To approve</p><p className={cx('text-xl font-semibold tabular-nums', waiting > 0 && 'text-warn')}>{waiting}</p></div>
          <div><p className="text-[13px] font-semibold text-muted">To pay out</p><p className="text-xl font-semibold tabular-nums whitespace-nowrap">{hoursText(unpaid.reduce((s, t) => s + num(t.total), 0))}</p></div>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setEnter({ week: weekStart() })} disabled={placement.status === 'proposed'}>Enter hours</Button>
      </Card>
      {placement.status === 'proposed' && <Notice tone="brand" icon="info">Hours can be logged once the placement is onboarding or active.</Notice>}

      {rows.length === 0 ? (
        <Card><EmptyState icon="clock" title="No hours yet" body={`${assistant} logs hours each week on My work and ${client} approves them. You can also enter hours here.`} /></Card>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((t) => {
            const st = TIMESHEET_STATUS[t.status];
            const r = ratesAt(placement, rateChanges, t.week_start);
            const payRate = t.pay_rate != null ? num(t.pay_rate) : r.pay;
            const locked = !!(t.invoice_line_id || t.payout_line_id);
            return (
              <li key={t.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-semibold text-[15px]">Week of {weekLabel(t.week_start)}</span>
                    <Chip tone={st.tone}>{st.label}</Chip>
                    {t.invoice_line_id && <Chip tone="brand" icon="fileText">On an invoice</Chip>}
                    {t.payout_line_id && <Chip tone="good" icon="send">On a payout</Chip>}
                    <span className="ml-auto text-lg font-semibold tabular-nums">{hoursText(t.total)}</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center" aria-label="Hours by day">
                    {DAY_NAMES.map((d, i) => (
                      <div key={d} className="rounded-lg bg-bg py-1.5">
                        <p className="text-[11px] font-semibold text-muted">{d}</p>
                        <p className={cx('text-sm tabular-nums', num(t.days?.[i]) ? 'font-semibold text-ink' : 'text-muted')}>{num(t.days?.[i]).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[13px] text-muted tabular-nums">
                    Bills {money(num(t.total) * r.bill, cur)} at {money(r.bill, cur)}/h · Pays {money(num(t.total) * payRate, cur)} at {money(payRate, cur)}/h
                  </p>
                  {t.notes && <p className="text-[15px] text-ink-2 whitespace-pre-wrap break-words"><span className="font-semibold">Notes:</span> {t.notes}</p>}
                  {t.review_note && <Notice tone={t.status === 'rejected' ? 'bad' : 'brand'} icon="chat">{t.review_note}</Notice>}
                  <div className="flex flex-wrap gap-2">
                    {t.status === 'submitted' && (
                      <>
                        <Button size="sm" variant="success" icon="check" loading={busy === t.id} onClick={() => approve(t)}>Approve {hoursText(t.total)}</Button>
                        <Button size="sm" onClick={() => setRet(t)}>Return for changes</Button>
                      </>
                    )}
                    {!locked && <Button size="sm" variant="ghost" icon="pen" onClick={() => setEnter({ week: t.week_start })}>Edit hours</Button>}
                    {locked && <span className="text-xs text-muted self-center">Billed or paid weeks can’t change. Void the invoice or discard the payout first.</span>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {enter && <EnterHoursSheet placement={placement} timesheets={rows} week={enter.week} assistant={assistant} onClose={() => setEnter(null)} onDone={() => { badges.refresh(); onChanged(); }} />}
      {ret && <ReturnSheet t={ret} assistant={assistant} onClose={() => setRet(null)} onDone={() => { badges.refresh(); onChanged(); }} />}
    </div>
  );
}

function EnterHoursSheet({ placement, timesheets, week: week0, assistant, onClose, onDone }: {
  placement: Placement; timesheets: Timesheet[]; week: string; assistant: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const weeks = useMemo(() => {
    const list = Array.from({ length: 12 }, (_, i) => addDays(weekStart(), -7 * i));
    if (!list.includes(week0)) list.push(week0);
    return list.sort((a, b) => b.localeCompare(a));
  }, [week0]);
  const existing = (w: string) => timesheets.find((t) => t.week_start === w) || null;
  const fill = (w: string) => (existing(w)?.days || [0, 0, 0, 0, 0, 0, 0]).map((d) => (num(d) ? String(num(d)) : ''));
  const [week, setWeek] = useState(week0);
  const [days, setDays] = useState<string[]>(() => fill(week0));
  const [notes, setNotes] = useState(existing(week0)?.notes || '');
  const [approveNow, setApproveNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ts = existing(week);
  const locked = !!(ts?.invoice_line_id || ts?.payout_line_id);
  const nums = days.map((d) => (d.trim() === '' ? 0 : Number(d)));
  const bad = nums.some((x) => !Number.isFinite(x) || x < 0 || x > 24);
  const total = bad ? 0 : nums.reduce((s, x) => s + x, 0);

  function pickWeek(w: string) {
    setWeek(w);
    setDays(fill(w));
    setNotes(existing(w)?.notes || '');
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    if (bad) { setError('Each day must be between 0 and 24 hours.'); return; }
    if (locked) { setError('This week is already on an invoice or payout. Void that first.'); return; }
    setBusy(true);
    const { error: err } = await supabase.rpc('ramp_timesheet_admin_save', {
      p_placement: placement.id, p_week: week, p_days: nums, p_notes: notes.trim(), p_approve: approveNow,
    });
    if (err) { setError(errText(err)); setBusy(false); return; }
    toast(approveNow ? `${hoursText(total)} saved and approved.` : `${hoursText(total)} saved. Waiting for the client to approve.`);
    onDone();
    onClose();
  }

  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title="Enter hours" subtitle={`For ${assistant}. Weeks run Monday to Sunday.`}
      footer={<>
        <span className="w-full sm:w-auto sm:mr-auto self-center text-sm font-semibold tabular-nums" aria-live="polite">Total {hoursText(total)}</span>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form="core-hours-form" loading={busy} icon="check" disabled={locked}>{approveNow ? 'Save and approve' : 'Save hours'}</Button>
      </>}>
      <form id="core-hours-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        <Field label="Week">
          <Select value={week} onChange={(e) => pickWeek(e.target.value)}>
            {weeks.map((w) => {
              const t = existing(w);
              return <option key={w} value={w}>{weekLabel(w)}{w === weekStart() ? ' (this week)' : ''}{t ? ` · ${TIMESHEET_STATUS[t.status].label.toLowerCase()}, ${hoursText(t.total)}` : ''}</option>;
            })}
          </Select>
        </Field>
        {ts && !locked && <Notice tone="brand" icon="info">{assistant} already has {hoursText(ts.total)} for this week ({TIMESHEET_STATUS[ts.status].label.toLowerCase()}). Saving replaces them.</Notice>}
        {locked && <Notice tone="warn" icon="lock">This week is on an invoice or payout and can’t change. Void that first.</Notice>}
        <fieldset className="flex flex-col gap-2" disabled={locked}>
          <legend className="text-[13px] font-semibold text-ink-2 mb-2">Hours each day</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_NAMES.map((d, i) => (
              <label key={d} className="flex flex-col items-center gap-1">
                <span className="text-xs font-semibold text-muted">{d}</span>
                <span className="text-[10px] text-muted -mt-1">{new Date(addDays(week, i) + 'T12:00:00').getDate()}</span>
                <input type="number" inputMode="decimal" min={0} max={24} step={0.25} value={days[i]} placeholder="0"
                  aria-label={`${d} hours`} onChange={(e) => setDays((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                  className={cx('w-full min-h-12 px-0.5 rounded-[10px] border bg-white text-center text-base tabular-nums',
                    (() => { const x = Number(days[i] || 0); return !Number.isFinite(x) || x < 0 || x > 24; })() ? 'border-bad' : 'border-field')} />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={locked} onClick={() => setDays(DAY_NAMES.map((_, i) => (i < 5 ? String(Math.round((num(placement.hours_per_week) / 5) * 4) / 4) : '')))}>
            Fill {plural(num(placement.hours_per_week), 'scheduled hour')}, Mon–Fri
          </Button>
          <Button size="sm" variant="ghost" disabled={locked} onClick={() => setDays(['', '', '', '', '', '', ''])}>Clear</Button>
        </div>
        <Field label="Notes" hint="Shown to the team member and the client.">
          <Textarea rows={2} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} disabled={locked} />
        </Field>
        <Checkbox checked={approveNow} onChange={setApproveNow} disabled={locked} label="Approve these hours now"
          hint={approveNow ? 'They’re ready to invoice and pay right away.' : 'They wait for the client to approve, like hours the team member sends.'} />
        <FormError error={error} />
      </form>
    </Sheet>
  );
}

function ReturnSheet({ t, assistant, onClose, onDone }: { t: Timesheet; assistant: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!note.trim()) { setError('Add a note so the team member knows what to fix.'); return; }
    setBusy(true);
    const { error: err } = await supabase.rpc('ramp_timesheet_review', { p_timesheet: t.id, p_approve: false, p_note: note.trim() });
    if (err) { setError(errText(err)); setBusy(false); return; }
    toast(`Returned to ${assistant}.`);
    onDone();
    onClose();
  }
  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title="Return for changes" subtitle={`${hoursText(t.total)} for ${weekLabel(t.week_start)}. ${assistant} fixes them and sends them again.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="core-ret-form" loading={busy}>Return hours</Button></>}>
      <form id="core-ret-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        <Field label="What needs to change" required>
          <Textarea rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Thursday should be 6 hours, not 8." aria-invalid={!!error} />
        </Field>
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
