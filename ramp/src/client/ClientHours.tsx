// Client portal hours: approve or return each week, then the history. Shows the bill-rate cost, never pay rates.
import { useState, type FormEvent } from 'react';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { fmtDate, hours, money, plural, weekLabel } from '../lib/util';
import type { ClientPortal } from '../lib/types';
import { useBadges } from '../shell/AppShell';
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Notice, PageHeader, Pills, Sheet, Skeleton, Textarea, useConfirm, useToast } from '../ui';
import { HoursReadonly, HoursTotal, TimesheetChip, TimesheetRow } from '../pages/parts/work-hours';
import { first, type PortalPlacement, type PortalTimesheet } from './parts/portal-common';

export default function ClientHours() {
  useTitle('Hours');
  const { me } = useMe();
  const badges = useBadges();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, reload, setData } = useAsync(() => q<ClientPortal>(supabase.rpc('ramp_client_portal')), [me.id]);
  const [busy, setBusy] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const [returning, setReturning] = useState<PortalTimesheet | null>(null);
  const [who, setWho] = useState('all');

  const header = <PageHeader title="Hours" subtitle="Review your team members’ weekly hours. Approved hours go on your next invoice." />;
  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={2} /><Skeleton rows={3} /></div>;

  const byId = new Map(data.placements.map((p) => [p.id, p]));
  const waiting = data.timesheets.filter((t) => t.status === 'submitted').sort((a, b) => a.week_start.localeCompare(b.week_start));
  const history = data.timesheets.filter((t) => t.status !== 'submitted').sort((a, b) => b.week_start.localeCompare(a.week_start));
  const people = [...new Map(history.map((t) => [t.placement_id, t.va_name])).entries()];
  const shownHistory = who === 'all' ? history : history.filter((t) => t.placement_id === who);
  const costOf = (t: PortalTimesheet) => { const p = byId.get(t.placement_id); return p ? Number(t.total) * Number(p.bill_rate || 0) : null; };
  const currency = data.placements[0]?.currency || 'USD';
  const waitingCost = waiting.reduce((a, t) => a + (costOf(t) ?? 0), 0);
  const waitingHours = waiting.reduce((a, t) => a + Number(t.total || 0), 0);
  const billNote = data.client?.billing_mode === 'advance'
    ? 'Approved hours are settled against the hours you prepaid, on your next invoice.'
    : 'Approved hours go on your next invoice.';

  function mark(ids: string[], status: 'approved' | 'rejected', note = '') {
    setData((d) => ({ ...d!, timesheets: d!.timesheets.map((t) => (ids.includes(t.id) ? { ...t, status, review_note: note, reviewed_at: new Date().toISOString() } : t)) }));
  }

  async function approve(t: PortalTimesheet) {
    setBusy((b) => [...b, t.id]);
    mark([t.id], 'approved');
    const { error: e } = await supabase.rpc('ramp_timesheet_review', { p_timesheet: t.id, p_approve: true, p_note: '' });
    setBusy((b) => b.filter((x) => x !== t.id));
    if (e) {
      setData((d) => ({ ...d!, timesheets: d!.timesheets.map((x) => (x.id === t.id ? t : x)) }));
      toast(errText(e), 'bad');
    } else {
      toast(`Approved ${hours(t.total)} for ${first(t.va_name)}.`);
    }
    badges.refresh();
    reload();
  }

  async function approveAll() {
    const cost = waitingCost ? `, about ${money(waitingCost, currency)} at current rates` : '';
    const ok = await confirm({
      title: `Approve all ${plural(waiting.length, 'week')}?`,
      body: `Approves ${hours(waitingHours)}${cost}, for ${[...new Set(waiting.map((t) => t.va_name))].join(', ')}. ${billNote}`,
      action: `Approve ${plural(waiting.length, 'week')}`,
    });
    if (!ok) return;
    setBulk(true);
    let failed = 0;
    let lastErr = '';
    for (const t of waiting) {
      const { error: e } = await supabase.rpc('ramp_timesheet_review', { p_timesheet: t.id, p_approve: true, p_note: '' });
      if (e) { failed++; lastErr = errText(e); }
    }
    setBulk(false);
    if (failed) toast(`${plural(waiting.length - failed, 'week')} approved. ${plural(failed, 'week')} couldn’t be approved: ${lastErr}`, 'bad');
    else toast(`All ${plural(waiting.length, 'week')} approved. Thank you.`);
    badges.refresh();
    reload();
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <section aria-labelledby="waiting-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="waiting-h" className="font-display text-xl font-semibold">Waiting for your approval</h2>
            <p className="text-sm text-muted mt-0.5">
              {waiting.length ? `${plural(waiting.length, 'week')} · ${hours(waitingHours)}${waitingCost ? ` · about ${money(waitingCost, currency)}` : ''}` : 'Nothing to review right now.'}
            </p>
          </div>
          {waiting.length > 1 && <Button variant="success" icon="check" loading={bulk} onClick={approveAll} className="w-full sm:w-auto">Approve all</Button>}
        </div>
        {waiting.length === 0 ? (
          <Card>
            <EmptyState icon="check" title="You’re all caught up"
              body="New hours show up here when your team member sends them, usually at the end of each week." />
          </Card>
        ) : waiting.map((t) => (
          <WaitingCard key={t.id} t={t} p={byId.get(t.placement_id)} busy={bulk || busy.includes(t.id)}
            onApprove={() => approve(t)} onReturn={() => setReturning(t)} />
        ))}
        {waiting.length > 0 && <p className="text-[13px] text-muted">{billNote} Costs use each team member’s current rate; your invoice shows the final amount.</p>}
      </section>

      <Card padded={false} className="overflow-hidden">
        <div className="p-5 pb-3 flex flex-col gap-3">
          <CardHeader title="History" subtitle="Hours you’ve approved or returned in the last four months. Tap a week to see each day." />
          {people.length > 1 && (
            <Pills label="Show hours for" size="sm" value={who} onChange={setWho}
              options={[{ value: 'all', label: 'Everyone' }, ...people.map(([id, name]) => ({ value: id, label: name }))]} />
          )}
        </div>
        {shownHistory.length === 0 ? (
          <p className="px-5 pb-5 text-[15px] text-muted">No approved or returned hours yet.</p>
        ) : (
          <ul className="border-t border-line-2">
            {shownHistory.map((t) => {
              const p = byId.get(t.placement_id);
              return (
                <TimesheetRow key={t.id} week={t.week_start} days={t.days} total={Number(t.total)} status={t.status}
                  target={p ? Number(p.hours_per_week) : undefined} title={people.length > 1 ? t.va_name : undefined}
                  notes={t.notes} reviewNote={t.review_note} reviewLabel="Your note" clientView
                  meta={t.reviewed_at ? `${t.status === 'approved' ? 'Approved' : 'Returned'} ${fmtDate(t.reviewed_at, { month: 'short', day: 'numeric', year: 'numeric' })}` : undefined} />
              );
            })}
          </ul>
        )}
      </Card>

      <ReturnSheet t={returning} onClose={() => setReturning(null)}
        onDone={(t, note) => { mark([t.id], 'rejected', note); badges.refresh(); reload(); }} />
      {dialog}
    </div>
  );
}

function WaitingCard({ t, p, busy, onApprove, onReturn }: {
  t: PortalTimesheet; p: PortalPlacement | undefined; busy: boolean; onApprove: () => void; onReturn: () => void;
}) {
  const rate = p ? Number(p.bill_rate || 0) : null;
  const cur = p?.currency || 'USD';
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Avatar name={t.va_name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-snug">{t.va_name}</p>
          <p className="text-[13px] text-muted">{t.title} · week of {weekLabel(t.week_start)}</p>
          <div className="sm:hidden flex flex-wrap items-center gap-2 mt-1.5">
            <TimesheetChip status={t.status} />
            {t.submitted_at && <span className="text-xs text-muted">Sent {fmtDate(t.submitted_at)}</span>}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1">
          <TimesheetChip status={t.status} />
          {t.submitted_at && <span className="text-xs text-muted">Sent {fmtDate(t.submitted_at)}</span>}
        </div>
      </div>
      <HoursReadonly week={t.week_start} days={t.days} />
      <HoursTotal total={Number(t.total)} target={p ? Number(p.hours_per_week) : 0} />
      {t.notes && (
        <blockquote className="rounded-xl bg-bg px-3.5 py-3 text-[15px] text-ink-2 leading-relaxed whitespace-pre-line break-words">
          <span className="block text-[13px] font-semibold text-muted mb-0.5">Notes from {first(t.va_name)}</span>{t.notes}
        </blockquote>
      )}
      {rate !== null && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line-2 pt-3">
          <span className="text-[13px] text-muted tabular-nums">{hours(t.total)} × {money(rate, cur)}/h</span>
          <span className="text-[17px] font-semibold tabular-nums">{money(Number(t.total) * rate, cur)}</span>
        </div>
      )}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
        <Button onClick={onReturn} disabled={busy} className="w-full sm:w-auto">Return with a note</Button>
        <Button variant="success" icon="check" loading={busy} onClick={onApprove} className="w-full sm:w-auto">Approve {hours(t.total)}</Button>
      </div>
    </Card>
  );
}

function ReturnSheet({ t, onClose, onDone }: { t: PortalTimesheet | null; onClose: () => void; onDone: (t: PortalTimesheet, note: string) => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forId, setForId] = useState<string | null>(null);
  if (t && t.id !== forId) { setForId(t.id); setNote(''); setErr(''); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!t) return;
    if (!note.trim()) { setErr(`Add a note so ${first(t.va_name)} knows what to fix.`); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('ramp_timesheet_review', { p_timesheet: t.id, p_approve: false, p_note: note.trim() });
      if (error) throw error;
      toast(`Returned to ${first(t.va_name)}. They’ll fix the hours and send them again.`);
      onDone(t, note.trim());
      onClose();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!t} onClose={onClose} title="Return these hours"
      subtitle={t ? `${t.va_name} · week of ${weekLabel(t.week_start)} · ${hours(t.total)}` : undefined}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form="return-form" loading={busy} icon="send">Return hours</Button>
      </>}>
      <form id="return-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="What needs to change?" required error={err || undefined} hint="Your note goes to your team member and our team.">
          <Textarea rows={4} maxLength={1000} value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }}
            placeholder="For example: Thursday should be 6 hours, not 8." />
        </Field>
        <Notice icon="info">The hours aren’t billed until they’re sent again and you approve them.</Notice>
      </form>
    </Sheet>
  );
}
