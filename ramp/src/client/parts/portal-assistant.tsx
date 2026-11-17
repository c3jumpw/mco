// One assistant on the client's overview: onboarding, training, hours, the latest shared check-in, and actions.
import { Link } from 'react-router-dom';
import { PLACEMENT_STATUS, daysUntil, fmtDate, hours, money, plural } from '../../lib/util';
import { Avatar, Button, Card, Chip, Icon, LinkButton, Progress } from '../../ui';
import { Disclosure, Fact, Facts, ScoreChip, StepProgress, StepRow, TierChip, type StepItem } from '../../pages/parts/work-common';
import { CheckinNotes } from '../../pages/parts/work-coach';
import { fmtNum } from '../../pages/parts/work-hours';
import { first, type PortalPlacement } from './portal-common';

function HoursLine({ label, value, target }: { label: string; value: number; target: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold text-muted">{label}</span>
        <span className="tabular-nums"><span className="font-semibold text-ink text-[15px]">{fmtNum(value)}</span> of {hours(target)}</span>
      </div>
      {target > 0 && <Progress value={(value / target) * 100} tone={value >= target ? 'good' : 'brand'} label={`${label}: hours compared with the schedule`} />}
    </div>
  );
}

export function AssistantCard({ p, busy, onToggle, onFeedback, onHelp }: {
  p: PortalPlacement; busy: string[]; onToggle: (s: StepItem, done: boolean) => void; onFeedback: () => void; onHelp: () => void;
}) {
  const fn = first(p.va.name);
  const st = PLACEMENT_STATUS[p.status];
  const mine = p.steps.filter((s) => s.owner === 'client');
  const myLeft = mine.filter((s) => !s.done_at).length;
  const allDone = p.steps.length > 0 && p.steps.every((s) => s.done_at);
  const others = p.steps.filter((s) => s.owner !== 'client');
  const latest = p.checkins[0];
  const g = daysUntil(p.guarantee_until);
  const target = Number(p.hours_per_week) || 0;
  const startsLater = !!p.start_date && (daysUntil(p.start_date) ?? 0) > 0;
  const t = p.training || { pct: 0, done: 0, total: 0, next: null };

  return (
    <Card as="article" padded={false} className="overflow-hidden">
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3.5">
          <Avatar name={p.va.name} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold leading-snug break-words">{p.va.name}</h2>
            <p className="text-[15px] text-ink-2">{p.title}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Chip tone={st.tone}>{st.label}</Chip>
              <TierChip tier={p.tier} />
            </div>
          </div>
        </div>
        {p.tier?.description && <p className="text-sm text-muted leading-relaxed -mt-1">{p.tier.description}</p>}
        <Facts>
          <Fact label={startsLater ? 'Starts' : 'Started'}>{p.start_date ? fmtDate(p.start_date, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date to be set'}</Fact>
          <Fact label="Hours per week"><span className="tabular-nums">{hours(p.hours_per_week)}</span></Fact>
          <Fact label="Rate"><span className="tabular-nums">{money(p.bill_rate, p.currency)}/h</span></Fact>
          {p.schedule && <Fact label="Schedule">{p.schedule}</Fact>}
          <Fact label="Your coach">{p.coach?.name || 'Being assigned'}</Fact>
          {p.guarantee_until && (
            <Fact label="Replacement guarantee">
              {g !== null && g < 0 ? `Ended ${fmtDate(p.guarantee_until)}` : `Until ${fmtDate(p.guarantee_until, { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </Fact>
          )}
        </Facts>
      </div>

      <section aria-label={`${fn}’s onboarding`} className="border-t border-line-2">
        <div className="px-5 pt-4 pb-3 flex flex-col gap-3">
          <h3 className="text-[15px] font-semibold">Onboarding</h3>
          <StepProgress steps={p.steps} label="All steps" />
          <p className="text-sm text-ink-2">
            {allDone ? `Onboarding is complete. ${fn} is all set up.`
              : myLeft > 0 ? `${plural(myLeft, 'step')} for you. Tick each one off when it’s done.`
              : mine.length ? 'You’ve done your part. We’re finishing the rest.' : 'Nothing needed from you right now.'}
          </p>
        </div>
        {mine.length > 0 && !allDone && (
          <ul className="border-t border-line-2">
            {mine.map((s) => (
              <li key={s.id} className="border-t border-line-2 first:border-t-0">
                <StepRow step={s} audience="client" vaFirst={fn} editable busy={busy.includes(s.id)} onToggle={(d) => onToggle(s, d)} hideOwner />
              </li>
            ))}
          </ul>
        )}
        {(allDone ? p.steps.length > 0 : others.length > 0) && (
          <Disclosure label={allDone ? 'See every step' : 'See our steps and your assistant’s'} openLabel="Hide steps" className="border-t border-line-2">
            <ul className="border-t border-line-2">
              {(allDone ? p.steps : others).map((s) => (
                <li key={s.id} className="border-t border-line-2 first:border-t-0"><StepRow step={s} audience="client" vaFirst={fn} editable={false} /></li>
              ))}
            </ul>
          </Disclosure>
        )}
      </section>

      <section aria-label={`${fn}’s training and hours`} className="border-t border-line-2 px-5 py-4 grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">Training</h3>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold tabular-nums leading-none">{t.pct}%</span>
            <span className="text-[13px] text-muted tabular-nums">{t.done} of {plural(t.total, 'module')}</span>
          </div>
          <Progress value={t.pct} tone={t.pct >= 100 ? 'good' : 'brand'} label={`${fn}’s training progress`} />
          <p className="text-sm text-ink-2">{t.next ? <>Next: <span className="font-semibold">{t.next}</span></> : t.total ? 'All training complete.' : 'Training starts soon.'}</p>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold">Hours</h3>
            <Link to="/client/hours" className="text-[13px] font-semibold text-brand-ink no-underline inline-flex items-center min-h-11 -my-3">All hours<Icon name="chevronRight" size={14} strokeWidth={2} /></Link>
          </div>
          <HoursLine label="This week" value={Number(p.hours_this_week)} target={target} />
          <HoursLine label="Last week" value={Number(p.hours_last_week)} target={target} />
        </div>
      </section>

      <section aria-label="Latest check-in" className="border-t border-line-2 px-5 py-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">Latest check-in</h3>
            {latest && <p className="text-[13px] text-muted">{fmtDate(latest.done_at, { month: 'short', day: 'numeric', year: 'numeric' })}{latest.by_name ? ` · ${latest.by_name}` : ''}</p>}
          </div>
          {latest && <ScoreChip score={latest.score} />}
        </div>
        {latest ? <CheckinNotes went={latest.went_well} improve={latest.improve} actions={latest.actions} labels={['What’s going well', 'What to improve', 'Next steps']} />
          : <p className="text-[15px] text-muted">No check-ins yet. Your coach will check in with you soon after {fn} starts.</p>}
        {p.next_checkin && <p className="text-[13px] text-muted"><Icon name="calendar" size={14} className="inline -mt-0.5 mr-1" />Next check-in with you: {fmtDate(p.next_checkin, { weekday: 'short', month: 'short', day: 'numeric' })}</p>}
      </section>

      <div className="border-t border-line-2 px-5 py-4 flex flex-wrap gap-2">
        <LinkButton to={`/launch/${p.id}`} icon="calendar" variant={p.status === 'onboarding' ? 'primary' : 'secondary'} className="flex-1 sm:flex-none">Launch plan</LinkButton>
        <Button icon="star" onClick={onFeedback} className="flex-1 sm:flex-none">Give feedback</Button>
        <Button icon="lifebuoy" onClick={onHelp} className="flex-1 sm:flex-none">Ask for help</Button>
      </div>
    </Card>
  );
}
