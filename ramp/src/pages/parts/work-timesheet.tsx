// The assistant's weekly hours for one placement: edit, save a draft, send for approval.
import { useEffect, useMemo, useState } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { fmtDate, hours, weekLabel } from '../../lib/util';
import type { MyWork, Timesheet } from '../../lib/types';
import { Button, Card, Field, Notice, Textarea, useConfirm, useToast } from '../../ui';
import { HoursEditor, HoursReadonly, HoursTotal, TimesheetChip, daysToInputs, dayError, parseHours, roundQuarter, sumDays } from './work-hours';

type WorkPlacement = MyWork['placements'][number];
export type Drafts = { current: Record<string, { days: string[]; notes: string }> };

export function TimesheetEditor({ p, week, ts, drafts, onSaved, showClient }: {
  p: WorkPlacement; week: string; ts: Timesheet | undefined; drafts: Drafts; onSaved: () => Promise<void> | void; showClient: boolean;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const key = `${p.id}:${week}`;
  const saved = useMemo(() => ({ days: daysToInputs(ts?.days), notes: ts?.notes || '' }), [ts]);
  const [days, setDays] = useState<string[]>(() => drafts.current[key]?.days || saved.days);
  const [notes, setNotes] = useState(() => drafts.current[key]?.notes ?? saved.notes);
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null);
  const [fail, setFail] = useState('');

  const locked = ts?.status === 'submitted' || ts?.status === 'approved';
  const dirty = !locked && (notes !== saved.notes || days.some((d, i) => (parseHours(d) ?? -1) !== (parseHours(saved.days[i] ?? '') ?? -1)));
  const invalid = days.some((d) => dayError(d));
  const total = sumDays(days.map((d) => parseHours(d) ?? 0));
  const target = Number(p.hours_per_week) || 0;
  const client = p.client.name;

  // Keep unsaved edits when switching weeks.
  useEffect(() => {
    if (dirty) drafts.current[key] = { days, notes };
    else delete drafts.current[key];
  }, [dirty, days, notes, key, drafts]);

  function setDay(i: number, v: string) {
    setDays((d) => d.map((x, j) => (j === i ? v : x)));
    setFail('');
  }

  const perDay = roundQuarter(target / 5);
  const empty = days.every((d) => !parseHours(d));

  async function save(submit: boolean) {
    setFail('');
    if (invalid) { setFail('Fix the highlighted days first. Each day takes 0 to 24 hours.'); return; }
    if (submit) {
      if (total <= 0) { setFail('Add your hours before sending them.'); return; }
      const ok = await confirm({
        title: 'Send these hours for approval?',
        body: `Sends ${hours(total)} for ${weekLabel(week)} to ${client} for approval. You can’t change them after sending unless they’re returned to you.`,
        action: 'Send for approval',
      });
      if (!ok) return;
    }
    setBusy(submit ? 'send' : 'draft');
    try {
      const { error } = await supabase.rpc('ramp_timesheet_save', {
        p_placement: p.id, p_week: week, p_days: days.map((d) => roundQuarter(parseHours(d) ?? 0)), p_notes: notes.trim(), p_submit: submit,
      });
      if (error) throw error;
      delete drafts.current[key];
      toast(submit ? `Sent to ${client} for approval.` : 'Draft saved. Send it when the week is done.');
      await onSaved();
    } catch (e) {
      setFail(errText(e));
      toast(errText(e), 'bad');
    } finally {
      setBusy(null);
    }
  }

  const heading = showClient ? client : 'Your hours';

  if (p.status === 'proposed') {
    return (
      <Card className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-semibold">{heading}</h3>
        <Notice icon="calendar">You can log hours for {client} once this placement starts{p.start_date ? ` on ${fmtDate(p.start_date, { month: 'long', day: 'numeric' })}` : ''}.</Notice>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold leading-snug">{heading}</h3>
          <p className="text-[13px] text-muted">{showClient ? `${p.title} · ` : ''}{weekLabel(week)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <TimesheetChip status={ts?.status || 'none'} />
          {ts?.status === 'submitted' && ts.submitted_at && <span className="text-xs text-muted">Sent {fmtDate(ts.submitted_at)}</span>}
          {ts?.status === 'approved' && ts.reviewed_at && <span className="text-xs text-muted">Approved {fmtDate(ts.reviewed_at)}</span>}
        </div>
      </div>

      {ts?.status === 'rejected' && (
        <Notice tone="bad" icon="alert">
          <span className="font-semibold">{client} returned these hours.</span>
          {ts.review_note ? <span className="block whitespace-pre-line mt-0.5">“{ts.review_note}”</span> : null}
          <span className="block mt-0.5">Fix them below and send them again.</span>
        </Notice>
      )}

      {locked ? (
        <>
          <HoursReadonly week={week} days={ts!.days} />
          <HoursTotal total={Number(ts!.total)} target={target} />
          {ts!.notes && <p className="text-[15px] text-ink-2 leading-relaxed whitespace-pre-line"><span className="font-semibold">Your notes: </span>{ts!.notes}</p>}
          {ts!.status === 'submitted' && <p className="text-[13px] text-muted">Waiting for {client} to approve. If something needs to change, ask your coach{p.coach.name ? `, ${p.coach.name}` : ''}.</p>}
        </>
      ) : (
        <>
          {empty && perDay > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg px-3.5 py-2">
              <span className="text-[13px] text-muted">Worked your usual schedule?</span>
              <Button size="sm" variant="ghost" icon="calendar" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6].map((i) => (i < 5 ? String(perDay) : '')))}>
                Fill Mon–Fri with {hours(perDay)}
              </Button>
            </div>
          )}
          <HoursEditor week={week} values={days} onChange={setDay} disabled={!!busy} idPrefix={`h-${p.id}`} />
          {invalid && <p role="alert" className="text-[13px] font-semibold text-bad -mt-2">Each day takes 0 to 24 hours. Fix the highlighted {days.filter((d) => dayError(d)).length === 1 ? 'day' : 'days'}.</p>}
          <HoursTotal total={total} target={target} />
          <Field label="Notes for your client" hint="Optional. What you worked on, time off, or anything unusual this week.">
            <Textarea rows={3} maxLength={2000} value={notes} disabled={!!busy} onChange={(e) => { setNotes(e.target.value); setFail(''); }} />
          </Field>
          {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
            {dirty && <span className="text-[13px] font-semibold text-warn sm:mr-auto text-center sm:text-left">Unsaved changes</span>}
            <Button className="w-full sm:w-auto" loading={busy === 'draft'} disabled={!!busy || !dirty} onClick={() => save(false)}>Save draft</Button>
            <Button className="w-full sm:w-auto" variant="primary" icon="send" loading={busy === 'send'} disabled={!!busy || total <= 0} onClick={() => save(true)}>
              {ts?.status === 'rejected' ? 'Send again' : 'Send for approval'}
            </Button>
          </div>
        </>
      )}
      {dialog}
    </Card>
  );
}
