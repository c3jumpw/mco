// Coaching: placement cards, the check-in timeline and the sheets to record, schedule and edit check-ins. No rates anywhere.
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { PLACEMENT_STATUS, cx, daysUntil, dueLabel, fmtDate, todayISO } from '../../lib/util';
import type { Checkin, CoachPlacementDetail, CoachPlacementSummary } from '../../lib/types';
import { Avatar, Button, Checkbox, Chip, Field, Icon, Input, Notice, Progress, Segmented, Sheet, Textarea, useToast } from '../../ui';
import { ScoreButtons, ScoreChip, TierChip } from './work-common';

export const KIND_WORDS: Record<Checkin['kind'], { short: string; with: string }> = {
  va: { short: 'Assistant', with: 'With the assistant' },
  client: { short: 'Client', with: 'With the client' },
};

function MiniBar({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold text-muted">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <Progress value={pct} tone={pct >= 100 ? 'good' : 'brand'} label={`${label} progress`} />
    </div>
  );
}

export function CoachCard({ p }: { p: CoachPlacementSummary }) {
  const st = PLACEMENT_STATUS[p.status];
  const d = p.next_checkin ? daysUntil(p.next_checkin.due_date) : null;
  const late = d !== null && d < 0;
  const soon = d !== null && d <= 7;
  return (
    <Link to={`/coaching/${p.id}`}
      className="flex flex-col gap-4 bg-card border border-line rounded-2xl p-5 no-underline text-ink hover:border-brand-2 transition-colors">
      <div className="flex items-start gap-3">
        <Avatar name={p.va.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-snug truncate">{p.va.name}</p>
          <p className="text-[13px] text-muted truncate">{p.title} · {p.client.name}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Chip tone={st.tone}>{st.label}</Chip>
            <TierChip tier={p.tier} />
          </div>
        </div>
        <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MiniBar label="Checklist" value={`${p.steps_done} of ${p.steps_total}`} pct={p.steps_total ? (p.steps_done / p.steps_total) * 100 : 0} />
        <MiniBar label="Training" value={`${p.training?.pct ?? 0}%`} pct={p.training?.pct ?? 0} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-2 pt-3">
        <span className={cx('inline-flex items-center gap-1.5 text-[13px] font-semibold', late ? 'text-bad' : soon ? 'text-warn' : 'text-ink-2')}>
          <Icon name={late ? 'alert' : 'calendar'} size={15} />
          {p.next_checkin ? `${KIND_WORDS[p.next_checkin.kind].short} check-in · ${dueLabel(p.next_checkin.due_date)}` : 'No check-in scheduled'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">Last score <ScoreChip score={p.last_score} /></span>
      </div>
    </Link>
  );
}

// ───────── check-in timeline ─────────

type CheckinRow = CoachPlacementDetail['checkins'][number];

export function CheckinItem({ c, onRecord, onReschedule, onSkip, onEdit }: {
  c: CheckinRow; onRecord: () => void; onReschedule: () => void; onSkip: () => void; onEdit: () => void;
}) {
  const kind = KIND_WORDS[c.kind];
  if (c.status === 'scheduled') {
    const d = daysUntil(c.due_date);
    const late = d !== null && d < 0;
    return (
      <li className={cx('rounded-2xl border p-4 flex flex-col gap-3', late ? 'border-bad bg-bad-soft/40' : 'border-line bg-white')}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">Check-in {kind.with.toLowerCase()}</p>
            <p className={cx('text-[13px] font-semibold', late ? 'text-bad' : 'text-muted')}>{c.due_date ? (d !== null && d < 7 ? `${dueLabel(c.due_date)} · ${fmtDate(c.due_date, { weekday: 'short', month: 'short', day: 'numeric' })}` : `Due ${fmtDate(c.due_date, { weekday: 'short', month: 'short', day: 'numeric' })}`) : 'No date'}</p>
          </div>
          <Chip tone={late ? 'bad' : 'warn'} icon={late ? 'alert' : 'calendar'}>{late ? 'Overdue' : 'Scheduled'}</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon="check" onClick={onRecord}>Record it</Button>
          <Button size="sm" icon="calendar" onClick={onReschedule}>Reschedule</Button>
          <Button size="sm" variant="ghost" onClick={onSkip}>Skip</Button>
        </div>
      </li>
    );
  }
  if (c.status === 'skipped') {
    return (
      <li className="flex items-center justify-between gap-3 rounded-2xl border border-line-2 bg-bg px-4 py-3">
        <span className="text-[15px] text-muted">{kind.with} · due {fmtDate(c.due_date)}</span>
        <Chip>Skipped</Chip>
      </li>
    );
  }
  return (
    <li className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{kind.with}</p>
          <p className="text-[13px] text-muted">{fmtDate(c.done_at || c.due_date, { month: 'short', day: 'numeric', year: 'numeric' })}{c.by_name ? ` · by ${c.by_name}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {c.kind === 'va' && c.share_with_client && <Chip tone="brand" icon="eye">Shared with client</Chip>}
          <ScoreChip score={c.score} />
        </div>
      </div>
      <CheckinNotes went={c.went_well} improve={c.improve} actions={c.actions} />
      <div><Button size="sm" variant="ghost" icon="pen" onClick={onEdit}>Edit</Button></div>
    </li>
  );
}

export function CheckinNotes({ went, improve, actions, labels }: { went: string; improve: string; actions: string; labels?: [string, string, string] }) {
  const [l1, l2, l3] = labels || ['Went well', 'To improve', 'Actions'];
  const rows = [[l1, went], [l2, improve], [l3, actions]].filter(([, v]) => v && v.trim());
  if (!rows.length) return <p className="text-[13px] text-muted">No notes.</p>;
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[13px] font-semibold text-muted">{k}</dt>
          <dd className="text-[15px] text-ink-2 leading-relaxed whitespace-pre-line break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────── record or edit a check-in ─────────

export function CheckinSheet({ open, onClose, placementId, vaName, clientName, checkins, editing, defaultKind, onSaved }: {
  open: boolean; onClose: () => void; placementId: string; vaName: string; clientName: string; checkins: CheckinRow[];
  editing: CheckinRow | null; defaultKind: Checkin['kind']; onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<Checkin['kind']>(defaultKind);
  const [score, setScore] = useState<number | null>(null);
  const [went, setWent] = useState('');
  const [improve, setImprove] = useState('');
  const [actions, setActions] = useState('');
  const [share, setShare] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(editing?.kind || defaultKind);
    setScore(editing?.score ?? null);
    setWent(editing?.went_well || '');
    setImprove(editing?.improve || '');
    setActions(editing?.actions || '');
    setShare(!!editing?.share_with_client);
    setErr('');
  }, [open, editing, defaultKind]);

  const scheduled = checkins.filter((k) => k.status === 'scheduled' && k.kind === kind).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const target = editing || scheduled[0] || null;
  const recording = !editing || editing.status !== 'done';
  const first = vaName.split(' ')[0] || vaName;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!score) { setErr('Give the check-in a score from 1 to 5.'); return; }
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.rpc('ramp_checkin_save', {
        p_id: target?.id ?? null, p_placement: placementId, p_kind: kind, p_due: target?.due_date ?? todayISO(), p_status: 'done',
        p_score: score, p_went_well: went.trim(), p_improve: improve.trim(), p_actions: actions.trim(), p_share: kind === 'client' ? true : share,
      });
      if (error) throw error;
      toast(recording ? 'Check-in recorded.' : 'Check-in updated.');
      await onSaved();
      onClose();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={recording ? 'Record a check-in' : 'Edit check-in'}
      subtitle={`${vaName} at ${clientName}`}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form="checkin-form" loading={busy} icon="check">{recording ? 'Save check-in' : 'Save changes'}</Button>
      </>}>
      <form id="checkin-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-2">Who was it with?</span>
          {editing ? <span className="text-[15px] font-semibold">{kind === 'va' ? vaName : clientName}</span> : (
            <Segmented label="Who the check-in was with" value={kind} onChange={setKind}
              options={[{ value: 'va', label: first }, { value: 'client', label: clientName.length > 18 ? 'The client' : clientName }]} />
          )}
          <span className="text-xs text-muted">
            {recording
              ? target ? `Completes the check-in that was due ${fmtDate(target.due_date, { month: 'long', day: 'numeric' })}. The next one is scheduled automatically.` : 'Adds a check-in dated today and schedules the next one.'
              : `From ${fmtDate(editing?.done_at || editing?.due_date, { month: 'long', day: 'numeric', year: 'numeric' })}.`}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-2">How is it going? <span className="text-bad" aria-hidden="true">*</span></span>
          <ScoreButtons value={score} onChange={(n) => { setScore(n); setErr(''); }} label="Check-in score from 1 to 5" />
        </div>
        <Field label="What went well">
          <Textarea rows={3} maxLength={4000} value={went} onChange={(e) => setWent(e.target.value)} />
        </Field>
        <Field label="What to improve">
          <Textarea rows={3} maxLength={4000} value={improve} onChange={(e) => setImprove(e.target.value)} />
        </Field>
        <Field label="Actions" hint="Who does what next.">
          <Textarea rows={3} maxLength={4000} value={actions} onChange={(e) => setActions(e.target.value)} />
        </Field>
        {kind === 'va' ? (
          <Checkbox checked={share} onChange={setShare} label={`Share with ${clientName}`}
            hint="They’ll see the score and these notes in their portal. Leave it off for private coaching notes." />
        ) : (
          <Notice icon="eye">Check-ins with the client are always visible in their portal.</Notice>
        )}
        {err && <Notice tone="bad" icon="alert">{err}</Notice>}
      </form>
    </Sheet>
  );
}

// ───────── schedule or reschedule ─────────

export function ScheduleSheet({ open, onClose, placementId, existing, vaName, onSaved }: {
  open: boolean; onClose: () => void; placementId: string; existing: CheckinRow | null; vaName: string; onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<Checkin['kind']>('va');
  const [date, setDate] = useState(todayISO(7));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(existing?.kind || 'va');
    setDate(existing?.due_date || todayISO(7));
    setErr('');
  }, [open, existing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr('Pick a date.'); return; }
    setBusy(true);
    setErr('');
    try {
      const { error } = await supabase.rpc('ramp_checkin_save', existing ? {
        p_id: existing.id, p_placement: placementId, p_kind: existing.kind, p_due: date, p_status: 'scheduled', p_score: existing.score,
        p_went_well: existing.went_well, p_improve: existing.improve, p_actions: existing.actions, p_share: existing.share_with_client,
      } : {
        p_id: null, p_placement: placementId, p_kind: kind, p_due: date, p_status: 'scheduled', p_score: null,
        p_went_well: '', p_improve: '', p_actions: '', p_share: false,
      });
      if (error) throw error;
      toast(existing ? `Moved to ${fmtDate(date, { month: 'long', day: 'numeric' })}.` : `Check-in scheduled for ${fmtDate(date, { month: 'long', day: 'numeric' })}.`);
      await onSaved();
      onClose();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  }

  const first = vaName.split(' ')[0] || vaName;
  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'Reschedule check-in' : 'Schedule a check-in'}
      subtitle={existing ? `${KIND_WORDS[existing.kind].with}, due ${fmtDate(existing.due_date, { month: 'long', day: 'numeric' })}` : undefined}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form="schedule-form" loading={busy} icon="calendar">{existing ? 'Move check-in' : 'Schedule'}</Button>
      </>}>
      <form id="schedule-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {!existing && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-2">Who is it with?</span>
            <Segmented label="Who the check-in is with" value={kind} onChange={setKind}
              options={[{ value: 'va', label: first }, { value: 'client', label: 'The client' }]} />
          </div>
        )}
        <Field label="Date" error={err || undefined}>
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setErr(''); }} />
        </Field>
      </form>
    </Sheet>
  );
}
