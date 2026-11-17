// One coached placement: checklist, check-ins, recent hours and training. No rates.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { PLACEMENT_STATUS, daysUntil, fmtDate, hours, plural } from '../lib/util';
import type { Checkin, CoachPlacementDetail } from '../lib/types';
import { BackLink, Button, Card, CardHeader, Chip, EmptyState, ErrorBox, LinkButton, PageHeader, Progress, Skeleton, useConfirm, useToast } from '../ui';
import { Fact, Facts, Para, StepProgress, StepRow, TierChip, useStepToggle } from './parts/work-common';
import { TimesheetRow } from './parts/work-hours';
import { CheckinItem, CheckinSheet, ScheduleSheet } from './parts/work-coach';

type CheckinRow = CoachPlacementDetail['checkins'][number];

export default function CoachingPlacement() {
  const { id = '' } = useParams();
  const { rank } = useMe();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, reload, setData } = useAsync(() => q<CoachPlacementDetail | null>(supabase.rpc('ramp_coach_placement', { p_placement: id })), [id]);
  const [recording, setRecording] = useState<{ editing: CheckinRow | null; kind: Checkin['kind'] } | null>(null);
  const [scheduling, setScheduling] = useState<{ existing: CheckinRow | null } | null>(null);
  const { toggle, busy } = useStepToggle(
    (sid, doneAt) => setData((d) => ({ ...d!, steps: d!.steps.map((s) => (s.id === sid ? { ...s, done_at: doneAt, done_by: doneAt ? 'you' : null } : s)) })),
    () => { reload(); },
  );
  useTitle(data ? `${data.va.name} · Coaching` : 'Coaching');

  const back = <BackLink to="/coaching">Coaching</BackLink>;
  if (error && !data) return <div className="flex flex-col gap-6">{back}<ErrorBox error={error} onRetry={reload} /></div>;
  if (data === undefined) return <div className="flex flex-col gap-6">{back}<Skeleton rows={2} /><Skeleton rows={4} /></div>;
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Card><EmptyState icon="target" title="We couldn’t find this placement" body="It may have ended, or you’re no longer its coach." /></Card>
      </div>
    );
  }

  const p = data;
  const st = PLACEMENT_STATUS[p.status];
  const scheduled = p.checkins.filter((c) => c.status === 'scheduled').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const past = p.checkins.filter((c) => c.status !== 'scheduled');
  const nextKind: Checkin['kind'] = scheduled[0]?.kind || 'va';
  const g = daysUntil(p.guarantee_until);

  async function skip(c: CheckinRow) {
    const ok = await confirm({
      title: 'Skip this check-in?',
      body: `The ${c.kind === 'va' ? 'assistant' : 'client'} check-in due ${fmtDate(c.due_date, { month: 'long', day: 'numeric' })} is marked as skipped. No new one is scheduled, so schedule another if you still need it.`,
      action: 'Skip check-in',
    });
    if (!ok) return;
    const { error: e } = await supabase.rpc('ramp_checkin_save', {
      p_id: c.id, p_placement: p.id, p_kind: c.kind, p_due: c.due_date, p_status: 'skipped', p_score: c.score,
      p_went_well: c.went_well, p_improve: c.improve, p_actions: c.actions, p_share: c.share_with_client,
    });
    if (e) { toast(errText(e), 'bad'); return; }
    toast('Check-in skipped.');
    reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ to: '/coaching', label: 'Coaching' }} eyebrow={p.client.name} title={p.va.name}
        subtitle={`${p.title} · ${hours(p.hours_per_week)} a week${p.schedule ? ` · ${p.schedule}` : ''}`}
        actions={<Button variant="primary" icon="check" onClick={() => setRecording({ editing: null, kind: nextKind })}>Record a check-in</Button>} />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={st.tone}>{st.label}</Chip>
          <TierChip tier={p.tier} />
          {p.guarantee_until && g !== null && <Chip tone={g < 0 ? 'neutral' : g <= 14 ? 'warn' : 'good'} icon="shield">{g < 0 ? 'Guarantee ended' : `Guarantee until ${fmtDate(p.guarantee_until)}`}</Chip>}
        </div>
        <Facts>
          <Fact label="Start date">{p.start_date ? fmtDate(p.start_date, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</Fact>
          {p.end_date && <Fact label="End date">{fmtDate(p.end_date, { month: 'short', day: 'numeric', year: 'numeric' })}</Fact>}
          <Fact label="Coach">{p.coach.name || 'Not assigned'}</Fact>
          <Fact label="Assistant’s email" className="col-span-2 sm:col-span-1"><a href={`mailto:${p.va.email}`} className="text-brand-ink break-all">{p.va.email}</a></Fact>
          {p.va.timezone && <Fact label="Assistant’s time zone">{p.va.timezone.replace(/_/g, ' ')}</Fact>}
          {p.client.timezone && <Fact label="Client’s time zone">{p.client.timezone.replace(/_/g, ' ')}</Fact>}
          {p.client.website && <Fact label="Client website" className="col-span-2 sm:col-span-1"><a href={/^https?:\/\//.test(p.client.website) ? p.client.website : `https://${p.client.website}`} target="_blank" rel="noreferrer" className="text-brand-ink break-all">{p.client.website.replace(/^https?:\/\//, '')}</a></Fact>}
        </Facts>
        {p.notes && <div><p className="text-[13px] font-semibold text-muted">Placement notes</p><Para>{p.notes}</Para></div>}
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/launch/${p.id}`} size="sm" icon="calendar">Launch plan</LinkButton>
          {rank <= 4 && <LinkButton to={`/team/${p.va.id}`} size="sm" icon="users">{p.va.name.split(' ')[0]}’s team page</LinkButton>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <Card className="flex flex-col gap-4">
            <CardHeader title="Check-ins" subtitle="Score each one from 1 to 5. The next is scheduled when you record one."
              action={<Button size="sm" icon="plus" onClick={() => setScheduling({ existing: null })}>Schedule one</Button>} />
            {p.checkins.length === 0 ? (
              <p className="text-[15px] text-muted">No check-ins yet. Record one after you talk with {p.va.name.split(' ')[0]} or the client.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {[...scheduled, ...past].map((c) => (
                  <CheckinItem key={c.id} c={c}
                    onRecord={() => setRecording({ editing: c, kind: c.kind })}
                    onReschedule={() => setScheduling({ existing: c })}
                    onSkip={() => skip(c)}
                    onEdit={() => setRecording({ editing: c, kind: c.kind })} />
                ))}
              </ol>
            )}
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="p-5 pb-3">
              <CardHeader title="Recent hours" subtitle="The last 12 weeks. Tap a week to see each day." />
            </div>
            {p.timesheets.length === 0 ? <p className="px-5 pb-5 text-[15px] text-muted">No hours logged yet.</p> : (
              <ul className="border-t border-line-2">
                {p.timesheets.map((t) => (
                  <TimesheetRow key={t.id} week={t.week_start} days={t.days} total={Number(t.total)} status={t.status} target={Number(p.hours_per_week)}
                    notes={t.notes} reviewNote={t.review_note} reviewLabel="Client’s note" />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <Card padded={false} className="overflow-hidden">
            <div className="p-5 pb-3 flex flex-col gap-3">
              <CardHeader title="Onboarding checklist" subtitle="Tick steps as they’re done. You can change any step." />
              <StepProgress steps={p.steps} />
            </div>
            {p.steps.length === 0 ? <p className="px-5 pb-5 text-[15px] text-muted">No checklist for this placement.</p> : (
              <ul className="border-t border-line-2">
                {p.steps.map((s) => (
                  <li key={s.id} className="border-t border-line-2 first:border-t-0">
                    <StepRow step={s} audience="coach" editable busy={busy.includes(s.id)} onToggle={(d) => toggle(s, d)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <CardHeader title="Training" />
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[28px] leading-none font-bold tabular-nums">{p.training?.pct ?? 0}%</span>
              <span className="text-[13px] text-muted tabular-nums">{p.training?.done ?? 0} of {plural(p.training?.total ?? 0, 'module')} done</span>
            </div>
            <Progress value={p.training?.pct ?? 0} tone={(p.training?.pct ?? 0) >= 100 ? 'good' : 'brand'} label="Training progress" />
            <p className="text-[15px] text-ink-2">{p.training?.next ? <>Next: <span className="font-semibold">{p.training.next}</span></> : (p.training?.total ? 'All assigned training is done.' : 'No training assigned.')}</p>
          </Card>
        </div>
      </div>

      <CheckinSheet open={!!recording} onClose={() => setRecording(null)} placementId={p.id} vaName={p.va.name} clientName={p.client.name}
        checkins={p.checkins} editing={recording?.editing || null} defaultKind={recording?.kind || nextKind} onSaved={reload} />
      <ScheduleSheet open={!!scheduling} onClose={() => setScheduling(null)} placementId={p.id} existing={scheduling?.existing || null}
        vaName={p.va.name} onSaved={reload} />
      {dialog}
    </div>
  );
}
