// Placement › Check-ins: a timeline of scheduled and done check-ins with the assistant and the client.
// Recording, rescheduling and skipping all go through ramp_checkin_save.

import { useState, type FormEvent } from 'react';
import { supabase, errText } from '../../../lib/supabase';
import { cx, dueLabel, daysUntil, fmtDate, todayISO } from '../../../lib/util';
import type { Checkin } from '../../../lib/types';
import { Button, Card, Checkbox, Chip, EmptyState, Field, Icon, Input, Notice, Pills, Sheet, Textarea, useConfirm, useToast } from '../../../ui';
import { FormError } from '../../parts/ops-common';
import { ScorePicker, recentScore, scoreText } from './core-common';

const KIND_LABEL: Record<Checkin['kind'], string> = { va: 'With the assistant', client: 'With the client' };

type SheetState =
  | { mode: 'record'; checkin: Checkin | null; kind: Checkin['kind'] }
  | { mode: 'schedule'; checkin: Checkin | null; kind: Checkin['kind'] };

export function CheckinsTab({ placementId, checkins, assistant, client, nameOf, onChanged }: {
  placementId: string; checkins: Checkin[]; assistant: string; client: string; nameOf: (id: string | null) => string; onChanged: () => void;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const upcoming = checkins.filter((c) => c.status === 'scheduled').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const past = checkins.filter((c) => c.status !== 'scheduled')
    .sort((a, b) => (b.done_at || b.due_date || b.updated_at).localeCompare(a.done_at || a.due_date || a.updated_at));
  const score = recentScore(checkins);

  async function skip(c: Checkin) {
    const ok = await confirm({
      title: 'Skip this check-in?',
      body: `The ${KIND_LABEL[c.kind].toLowerCase()} check-in due ${fmtDate(c.due_date)} is marked skipped. It stays in the history.`,
      action: 'Skip check-in',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('ramp_checkin_save', {
      p_id: c.id, p_placement: placementId, p_kind: c.kind, p_due: c.due_date, p_status: 'skipped', p_score: c.score,
      p_went_well: c.went_well, p_improve: c.improve, p_actions: c.actions, p_share: c.share_with_client,
    });
    if (error) { toast(errText(error), 'bad'); return; }
    toast('Check-in skipped.');
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0 flex-1 basis-60">
          <p className="font-display text-lg font-semibold">{score ? `Recent score ${scoreText(score.avg)} of 5` : 'No scores yet'}</p>
          <p className="text-sm text-muted">{score ? `Average of the last ${score.count === 1 ? 'check-in' : `${score.count} check-ins`}. Tiers use this to decide who’s ready to move up.` : 'Record how the first check-in went to start the score.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setSheet({ mode: 'schedule', checkin: null, kind: 'va' })} icon="calendar">Schedule</Button>
          <Button variant="primary" icon="plus" onClick={() => setSheet({ mode: 'record', checkin: null, kind: upcoming[0]?.kind || 'va' })}>Record a check-in</Button>
        </div>
      </Card>

      <section className="flex flex-col gap-2" aria-labelledby="ci-up">
        <h3 id="ci-up" className="font-display text-lg font-semibold px-1">Coming up</h3>
        {upcoming.length === 0 ? (
          <Card><p className="text-sm text-muted text-center">Nothing scheduled. Recording a check-in schedules the next one automatically.</p></Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <ul>
              {upcoming.map((c) => {
                const n = daysUntil(c.due_date);
                const late = n !== null && n < 0;
                return (
                  <li key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3.5 border-t border-line-2 first:border-t-0">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', late ? 'bg-bad-soft text-bad' : n !== null && n <= 3 ? 'bg-warn-soft text-warn' : 'bg-chip text-ink-2')}>
                        <Icon name="calendar" size={20} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-[15px]">{KIND_LABEL[c.kind]}</p>
                        <p className={cx('text-sm', late ? 'text-bad font-semibold' : 'text-muted')}>{fmtDate(c.due_date, { weekday: 'short', month: 'short', day: 'numeric' })} · {dueLabel(c.due_date)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-[52px] sm:pl-0">
                      <Button size="sm" variant="primary" onClick={() => setSheet({ mode: 'record', checkin: c, kind: c.kind })}>Record</Button>
                      <Button size="sm" onClick={() => setSheet({ mode: 'schedule', checkin: c, kind: c.kind })}>Reschedule</Button>
                      <Button size="sm" variant="ghost" onClick={() => skip(c)}>Skip</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="ci-past">
        <h3 id="ci-past" className="font-display text-lg font-semibold px-1">History</h3>
        {past.length === 0 ? (
          <Card><EmptyState icon="chat" title="No check-ins yet" body={`Talk with ${assistant} and ${client} regularly and record how it’s going here.`} /></Card>
        ) : (
          <ol className="flex flex-col gap-3">
            {past.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[15px]">{KIND_LABEL[c.kind]}</span>
                    {c.status === 'skipped' ? <Chip>Skipped</Chip> : c.score != null && <Chip tone={c.score >= 4 ? 'good' : c.score >= 3 ? 'warn' : 'bad'} icon="star">{c.score} of 5</Chip>}
                    {c.kind === 'va' && c.share_with_client && c.status === 'done' && <Chip tone="brand" icon="eye">Shared with client</Chip>}
                    <span className="text-xs text-muted ml-auto">
                      {c.status === 'done' ? `${fmtDate(c.done_at)}${c.by_member ? ` · ${nameOf(c.by_member)}` : ''}` : `Was due ${fmtDate(c.due_date)}`}
                    </span>
                  </div>
                  {c.status === 'done' && (
                    <dl className="grid gap-2 text-[15px]">
                      {c.went_well && <div><dt className="text-[13px] font-semibold text-good">Went well</dt><dd className="text-ink-2 whitespace-pre-wrap break-words">{c.went_well}</dd></div>}
                      {c.improve && <div><dt className="text-[13px] font-semibold text-warn">To improve</dt><dd className="text-ink-2 whitespace-pre-wrap break-words">{c.improve}</dd></div>}
                      {c.actions && <div><dt className="text-[13px] font-semibold text-brand-ink">Next steps</dt><dd className="text-ink-2 whitespace-pre-wrap break-words">{c.actions}</dd></div>}
                      {!c.went_well && !c.improve && !c.actions && <p className="text-sm text-muted">No notes.</p>}
                    </dl>
                  )}
                  {c.status === 'done' && (
                    <div><Button size="sm" variant="ghost" icon="pen" onClick={() => setSheet({ mode: 'record', checkin: c, kind: c.kind })}>Edit</Button></div>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      {sheet?.mode === 'record' && (
        <RecordSheet key={sheet.checkin?.id || 'new'} placementId={placementId} checkin={sheet.checkin} kind={sheet.kind} upcoming={upcoming}
          assistant={assistant} client={client} onClose={() => setSheet(null)} onDone={onChanged} />
      )}
      {sheet?.mode === 'schedule' && (
        <ScheduleSheet key={sheet.checkin?.id || 'new'} placementId={placementId} checkin={sheet.checkin} kind={sheet.kind} onClose={() => setSheet(null)} onDone={onChanged} />
      )}
      {dialog}
    </div>
  );
}

function RecordSheet({ placementId, checkin, kind: kind0, upcoming, assistant, client, onClose, onDone }: {
  placementId: string; checkin: Checkin | null; kind: Checkin['kind']; upcoming: Checkin[]; assistant: string; client: string; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const editingDone = checkin?.status === 'done';
  const [kind, setKind] = useState<Checkin['kind']>(checkin?.kind || kind0);
  const [score, setScore] = useState<number | null>(checkin?.score ?? null);
  const [wentWell, setWentWell] = useState(checkin?.went_well || '');
  const [improve, setImprove] = useState(checkin?.improve || '');
  const [actions, setActions] = useState(checkin?.actions || '');
  const [share, setShare] = useState(checkin?.share_with_client ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A new check-in completes the next scheduled one of the same kind, so it isn't left hanging.
  const scheduled = !checkin ? upcoming.find((c) => c.kind === kind) || null : null;
  const [completes, setCompletes] = useState(true);
  const target = checkin || (completes ? scheduled : null);
  const who = kind === 'va' ? assistant : client;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    if (!score) { setError('Give the check-in a score from 1 to 5.'); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.rpc('ramp_checkin_save', {
        p_id: target?.id || null, p_placement: placementId, p_kind: kind, p_due: target?.due_date || todayISO(), p_status: 'done',
        p_score: score, p_went_well: wentWell.trim(), p_improve: improve.trim(), p_actions: actions.trim(), p_share: kind === 'client' ? true : share,
      });
      if (err) throw err;
      toast(editingDone ? 'Check-in updated.' : `Check-in with ${who} recorded.`);
      onDone();
      onClose();
    } catch (x) {
      setError(errText(x));
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title={editingDone ? 'Edit check-in' : 'Record a check-in'}
      subtitle={checkin?.status === 'scheduled' ? `Due ${fmtDate(checkin.due_date)}.` : `How is it going with ${assistant} at ${client}?`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="core-ci-form" loading={busy} icon="check">{editingDone ? 'Save changes' : 'Save check-in'}</Button></>}>
      <form id="core-ci-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        {!checkin && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-2">Who was it with?</span>
            <Pills label="Who the check-in was with" value={kind} onChange={setKind}
              options={[{ value: 'va', label: `The assistant` }, { value: 'client', label: 'The client' }]} />
          </div>
        )}
        {scheduled && (
          <Checkbox checked={completes} onChange={setCompletes} label={`This is the check-in due ${fmtDate(scheduled.due_date)}`}
            hint="Marks that scheduled check-in done. The next one is scheduled automatically." />
        )}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Score <span className="text-bad" aria-hidden="true">*</span></span>
          <ScorePicker value={score} onChange={setScore} />
        </div>
        <Field label="What went well">
          <Textarea rows={3} value={wentWell} maxLength={4000} onChange={(e) => setWentWell(e.target.value)} />
        </Field>
        <Field label="What to improve">
          <Textarea rows={3} value={improve} maxLength={4000} onChange={(e) => setImprove(e.target.value)} />
        </Field>
        <Field label="Next steps" hint="Who does what before the next check-in.">
          <Textarea rows={3} value={actions} maxLength={4000} onChange={(e) => setActions(e.target.value)} />
        </Field>
        {kind === 'va' ? (
          <Checkbox checked={share} onChange={setShare} label="Share with the client"
            hint={`${client} sees the score and notes in their portal. Leave off for private coaching notes.`} />
        ) : (
          <Notice tone="brand" icon="eye">Client check-ins are always visible to {client} in their portal.</Notice>
        )}
        <FormError error={error} />
      </form>
    </Sheet>
  );
}

function ScheduleSheet({ placementId, checkin, kind: kind0, onClose, onDone }: {
  placementId: string; checkin: Checkin | null; kind: Checkin['kind']; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<Checkin['kind']>(checkin?.kind || kind0);
  const [due, setDue] = useState(checkin?.due_date || todayISO(7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!due) { setError('Pick a date.'); return; }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('ramp_checkin_save', {
      p_id: checkin?.id || null, p_placement: placementId, p_kind: kind, p_due: due, p_status: 'scheduled', p_score: checkin?.score ?? null,
      p_went_well: checkin?.went_well || '', p_improve: checkin?.improve || '', p_actions: checkin?.actions || '', p_share: checkin?.share_with_client ?? false,
    });
    if (err) { setError(errText(err)); setBusy(false); return; }
    toast(checkin ? `Moved to ${fmtDate(due)}.` : `Check-in scheduled for ${fmtDate(due)}.`);
    onDone();
    onClose();
  }

  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title={checkin ? 'Reschedule check-in' : 'Schedule a check-in'}
      subtitle={checkin ? `Now due ${fmtDate(checkin.due_date)}.` : undefined}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="core-cis-form" loading={busy} icon="calendar">{checkin ? 'Move check-in' : 'Schedule'}</Button></>}>
      <form id="core-cis-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        {!checkin && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-2">Who is it with?</span>
            <Pills label="Who the check-in is with" value={kind} onChange={setKind} options={[{ value: 'va', label: 'The assistant' }, { value: 'client', label: 'The client' }]} />
          </div>
        )}
        <Field label="Due date" required>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
