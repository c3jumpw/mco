// Person profile: Training tab. Assigned modules with status, score and answer; approve or return submitted work.

import { useCallback, useState } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { useMe } from '../../lib/session';
import { planSummary, type AssignKind, type PlanItem } from '../../lib/plan';
import { PROGRESS_STATUS, TRACKS, cx, dueLabel, fmtDateTime, plural } from '../../lib/util';
import type { Member, Progress } from '../../lib/types';
import { useBadges } from '../../shell/AppShell';
import { Button, Card, CardHeader, Chip, EmptyState, Field, Progress as Bar, Sheet, Textarea, useToast } from '../../ui';
import { FormError, personName } from './ops-common';
import type { PersonLite } from './ops-person-overview';

/** Reminder tasks use this title, so finishing the module can close them. */
export const reminderTitle = (title: string) => `Finish your training: ${title}`.slice(0, 200);

const GROUPS: { kind: AssignKind; label: string; desc: string }[] = [
  { kind: 'required', label: 'Required for everyone', desc: TRACKS.company.desc },
  { kind: 'role', label: 'Role track', desc: 'Linked to their job role' },
  { kind: 'continued', label: 'Continued training', desc: TRACKS.continued.desc },
  { kind: 'optional', label: 'Optional', desc: 'Available, not assigned' },
];

export function TrainingTab({ member, plan, people, onReviewed }: {
  member: Member; plan: PlanItem[]; people: PersonLite[]; onReviewed: (p: Progress) => void;
}) {
  const { me, org } = useMe();
  const [review, setReview] = useState<{ item: PlanItem; approve: boolean } | null>(null);
  const closeReview = useCallback(() => setReview(null), []);
  const s = planSummary(plan);
  const self = member.id === me.id;
  const nameOf = (id: string | null) => { const p = id ? people.find((x) => x.id === id) : null; return p ? personName(p) : 'A reviewer'; };
  const today = new Date().toLocaleDateString('en-CA');
  const toast = useToast();
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const open = plan.filter((i) => i.kind !== 'optional' && i.status !== 'completed' && i.status !== 'submitted');

  // A reminder is a task on their list (it shows on their Home with the due date) that closes itself when they finish.
  async function remind(items: PlanItem[]) {
    const inTwoDays = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA');
    const rows = items.map((i) => ({
      member_id: member.id, created_by: me.id, status: 'todo', title: reminderTitle(i.module.title),
      notes: `Reminder from ${personName(me)}: please finish “${i.module.title}” in Training (${i.module.minutes} min).`,
      due_date: i.due && i.due >= today ? i.due : inTwoDays,
    }));
    const { error } = await supabase.from('ramp_tasks').insert(rows);
    if (error) { toast(errText(error), 'bad'); return; }
    setReminded((r) => new Set([...r, ...items.map((i) => i.module.id)]));
    toast(`Reminder sent. ${personName(member)} sees it on Home and in Tasks.`);
  }

  if (!plan.length) {
    return (
      <Card>
        <EmptyState icon="book" title="No training assigned"
          body={member.level === 'guest' ? 'Guests only see modules marked as visible to guests.' : 'Publish required modules, or link modules to their job role in Assign training.'} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={`${s.pct}% of assigned training done`} subtitle={`${s.done} of ${plural(s.total, 'assigned module')} completed`} className="mb-3" />
        <Bar value={s.pct} tone={s.pct === 100 ? 'good' : 'brand'} label="Assigned training completed" />
        {(s.waiting > 0 || s.overdue > 0) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {s.waiting > 0 && <Chip tone="warn" icon="clock">{plural(s.waiting, 'item')} waiting for review</Chip>}
            {s.overdue > 0 && <Chip tone="bad" icon="alert">{s.overdue} overdue</Chip>}
          </div>
        )}
        {!self && open.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-line-2">
            <Button size="sm" icon="bell" onClick={() => remind(open.filter((i) => !reminded.has(i.module.id)))} disabled={open.every((i) => reminded.has(i.module.id))}>
              Remind about {plural(open.length, 'open module')}
            </Button>
            <span className="text-[13px] text-muted">Adds a task with the due date to their Home and Tasks. It closes itself when they finish.</span>
          </div>
        )}
      </Card>

      {GROUPS.map((g) => {
        const items = plan.filter((i) => i.kind === g.kind);
        if (!items.length) return null;
        return (
          <section key={g.kind} className="flex flex-col gap-2" aria-label={g.label}>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2 px-1">
              <h2 className="font-display text-lg font-semibold">{g.label}</h2>
              <span className="text-[13px] text-muted">{g.desc}</span>
            </div>
            <Card padded={false} className="overflow-hidden">
              <ul>
                {items.map((i) => {
                  const p = i.progress;
                  const st = PROGRESS_STATUS[i.status];
                  const overdue = !!i.due && i.status !== 'completed' && i.status !== 'submitted' && i.due < today;
                  const due = i.due && i.status !== 'completed' && i.status !== 'submitted' ? dueLabel(i.due) : '';
                  return (
                    <li key={i.module.id} className={cx('px-4 py-4 border-t border-line-2 first:border-t-0 flex flex-col gap-2', i.status === 'submitted' && 'bg-warn-soft/40')}>
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="font-semibold text-[15px]">{i.module.title}</p>
                          <p className="text-[13px] text-muted">
                            {i.module.minutes} min
                            {p?.started_at && ` · started ${fmtDateTime(p.started_at, org.timezone)}`}
                            {p?.completed_at && i.status === 'completed' && ` · done ${fmtDateTime(p.completed_at, org.timezone)}`}
                            {p?.submitted_at && i.status === 'submitted' && ` · sent ${fmtDateTime(p.submitted_at, org.timezone)}`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {p?.score != null && <Chip tone="neutral">Score {p.score}%</Chip>}
                          {p?.results?.practice != null && <Chip tone={p.results.practice >= 80 ? 'good' : p.results.practice >= 60 ? 'neutral' : 'warn'}>Practice {p.results.practice}%</Chip>}
                          {!!p?.results?.secs && <Chip tone="neutral" icon="clock">{Math.max(1, Math.round(p.results.secs / 60))} min</Chip>}
                          {due && <Chip tone={overdue ? 'bad' : 'neutral'} icon="calendar">{due}</Chip>}
                          <Chip tone={st.tone}>{st.label}</Chip>
                        </div>
                      </div>
                      {i.status === 'in_progress' && <Bar value={i.pct} label={`${i.module.title} progress`} className="max-w-sm" />}
                      {!self && i.kind !== 'optional' && i.status !== 'completed' && i.status !== 'submitted' && (
                        <div><Button size="sm" variant="ghost" icon="bell" disabled={reminded.has(i.module.id)} onClick={() => remind([i])}>{reminded.has(i.module.id) ? 'Reminder sent' : 'Remind'}</Button></div>
                      )}
                      {(p?.results?.steps || []).some((x) => x.scored && x.first != null && x.first < 70) && (
                        <p className="text-[13px] text-warn">Found hard: {(p!.results!.steps || []).filter((x) => x.scored && x.first != null && x.first < 70).map((x) => x.title).join(', ')}</p>
                      )}
                      {p?.answer?.trim() && (
                        i.status === 'submitted'
                          ? <Answer text={p.answer} open />
                          : <details className="text-sm"><summary className="cursor-pointer min-h-11 flex items-center font-semibold text-brand-ink">Their answer</summary><Answer text={p.answer} /></details>
                      )}
                      {p?.feedback?.trim() && (
                        <p className="text-sm text-ink-2 leading-relaxed bg-bg rounded-xl px-3 py-2">
                          <span className="font-semibold">Feedback from {nameOf(p.reviewer_id)}:</span> {p.feedback}
                        </p>
                      )}
                      {i.status === 'submitted' && !self && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" variant="success" icon="check" onClick={() => setReview({ item: i, approve: true })}>Approve</Button>
                          <Button size="sm" icon="replay" onClick={() => setReview({ item: i, approve: false })}>Return with feedback</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        );
      })}

      <ReviewSheet review={review} member={member} onClose={closeReview} onDone={onReviewed} />
    </div>
  );
}

function Answer({ text, open }: { text: string; open?: boolean }) {
  return (
    <div className={cx('rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words max-h-72 overflow-y-auto', !open && 'mt-1')}>
      {text}
    </div>
  );
}

function ReviewSheet({ review, member, onClose, onDone }: { review: { item: PlanItem; approve: boolean } | null; member: Member; onClose: () => void; onDone: (p: Progress) => void }) {
  if (!review) return null;
  return <ReviewBody key={review.item.module.id + String(review.approve)} item={review.item} approve={review.approve} member={member} onClose={onClose} onDone={onDone} />;
}

function ReviewBody({ item, approve, member, onClose, onDone }: { item: PlanItem; approve: boolean; member: Member; onClose: () => void; onDone: (p: Progress) => void }) {
  const { me } = useMe();
  const toast = useToast();
  const badges = useBadges();
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = personName(member);

  async function send() {
    if (!approve && !feedback.trim()) { setError('Say what needs to change so they can fix it.'); return; }
    setBusy(true);
    setError('');
    try {
      const { error: err } = await supabase.rpc('ramp_review', { p_member: member.id, p_module: item.module.id, p_approve: approve, p_feedback: feedback.trim() });
      if (err) throw err;
      const now = new Date().toISOString();
      onDone({
        ...(item.progress as Progress),
        status: approve ? 'completed' : 'returned', feedback: feedback.trim(), reviewer_id: me.id,
        completed_at: approve ? now : null, updated_at: now,
      });
      badges.refresh();
      toast(approve ? `Approved. ${item.module.title} is complete.` : `Returned to ${name} with your feedback.`);
      onClose();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={approve ? 'Approve this work?' : 'Return with feedback'} subtitle={`${item.module.title} · ${name}`}
      footer={<><Button onClick={onClose}>Cancel</Button>
        <Button variant={approve ? 'success' : 'primary'} icon={approve ? 'check' : 'send'} loading={busy} onClick={send}>{approve ? 'Approve' : 'Send back'}</Button></>}>
      <Field label={approve ? 'Note for them (optional)' : 'What needs to change'} required={!approve} error={error && !approve ? error : undefined}>
        <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={5}
          placeholder={approve ? 'Nice work on…' : 'Be specific: what to fix and how to know it’s right.'} />
      </Field>
      <p className="text-[13px] text-muted">{approve ? 'The module is marked complete.' : 'They’ll see your feedback and can send it again.'}</p>
      {approve && <FormError error={error} />}
    </Sheet>
  );
}
