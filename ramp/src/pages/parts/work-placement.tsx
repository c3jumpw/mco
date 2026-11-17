// An assistant's placement summary and checklist (My work).
import { PLACEMENT_STATUS, dueLabel, fmtDate, hours } from '../../lib/util';
import type { MyWork } from '../../lib/types';
import { Card, Chip, Icon, LinkButton } from '../../ui';
import { Disclosure, Fact, Facts, LAUNCH_WORDS, StepProgress, StepRow, TierChip, type LaunchListItem, type StepItem } from './work-common';

type WorkPlacement = MyWork['placements'][number];

export function PlacementCard({ p, launch, launchLoaded }: { p: WorkPlacement; launch: LaunchListItem | undefined; launchLoaded: boolean }) {
  const st = PLACEMENT_STATUS[p.status];
  const plan = launch?.plan_status || null;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name="building" size={22} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold leading-snug break-words">{p.client.name}</h2>
          <p className="text-[15px] text-ink-2">{p.title}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Chip tone={st.tone}>{st.label}</Chip>
            <TierChip tier={p.tier} />
          </div>
        </div>
      </div>
      <Facts>
        <Fact label="Schedule">{p.schedule || 'Not set yet'}</Fact>
        <Fact label="Hours per week"><span className="tabular-nums">{hours(p.hours_per_week)}</span></Fact>
        <Fact label="Coach">{p.coach.name || 'Not assigned yet'}</Fact>
        <Fact label={p.start_date && p.start_date > new Date().toLocaleDateString('en-CA') ? 'Starts' : 'Started'}>
          {p.start_date ? fmtDate(p.start_date, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set yet'}
        </Fact>
        {p.next_checkin && <Fact label="Next check-in">{(() => { const t = dueLabel(p.next_checkin).replace(/^Due /, ''); return t.charAt(0).toUpperCase() + t.slice(1); })()}</Fact>}
        {p.client.timezone && <Fact label="Client time zone">{p.client.timezone.replace(/_/g, ' ')}</Fact>}
      </Facts>
      {launchLoaded && p.status !== 'ended' && (
        plan ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">Launch plan</p>
              <p className="text-[13px] text-muted">
                {plan === 'preparing' ? `${p.client.name} is still preparing it. You can look at what’s there so far.` : LAUNCH_WORDS[plan].label}
                {launch?.day1_date ? ` · Day 1 ${fmtDate(launch.day1_date)}` : ''}
              </p>
            </div>
            <LinkButton to={`/launch/${p.id}`} size="sm" variant={plan === 'preparing' ? 'secondary' : 'primary'} iconRight="chevronRight">Open launch plan</LinkButton>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-bg px-3.5 py-3 text-[15px] text-muted">
            <Icon name="clock" size={18} />Your client is preparing your launch plan. It shows up here when they start it.
          </p>
        )
      )}
    </Card>
  );
}

export function WorkChecklist({ p, showClient, busy, onToggle }: {
  p: WorkPlacement; showClient: boolean; busy: string[]; onToggle: (s: StepItem, done: boolean) => void;
}) {
  const mine = p.steps.filter((s) => s.owner === 'va');
  const others = p.steps.filter((s) => s.owner !== 'va');
  const agency = others.filter((s) => s.owner === 'agency');
  const client = others.filter((s) => s.owner === 'client');
  const left = mine.filter((s) => !s.done_at).length;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 pb-3 flex flex-col gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold leading-snug">Your checklist{showClient ? ` · ${p.client.name}` : ''}</h3>
          <p className="text-sm text-muted mt-0.5">
            {mine.length === 0 ? 'Nothing for you to do here.' : left === 0 ? 'All your steps are done.' : `Tap a step when it’s done. ${left} left.`}
          </p>
        </div>
        {mine.length > 0 && <StepProgress steps={mine} label="Your steps" />}
      </div>
      {mine.length > 0 && (
        <ul className="border-t border-line-2">
          {mine.map((s) => (
            <li key={s.id} className="border-t border-line-2 first:border-t-0">
              <StepRow step={s} audience="va" editable busy={busy.includes(s.id)} onToggle={(d) => onToggle(s, d)} hideOwner />
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <div className="border-t border-line bg-bg/60">
          <div className="px-5 pt-4 flex flex-col gap-3">
            <p className="text-[13px] font-semibold text-muted">Everyone else’s steps</p>
            {agency.length > 0 && <StepProgress steps={agency} label="Our team" />}
            {client.length > 0 && <StepProgress steps={client} label={p.client.name} />}
          </div>
          <Disclosure label="See their steps" openLabel="Hide their steps" className="pb-1">
            <ul className="border-t border-line-2 bg-white">
              {others.map((s) => (
                <li key={s.id} className="border-t border-line-2 first:border-t-0"><StepRow step={s} audience="va" editable={false} /></li>
              ))}
            </ul>
          </Disclosure>
        </div>
      )}
      {p.steps.length === 0 && <p className="px-5 pb-5 text-[15px] text-muted">No checklist for this placement.</p>}
    </Card>
  );
}

export function EndedPlacements({ list }: { list: WorkPlacement[] }) {
  if (!list.length) return null;
  return (
    <p className="text-[13px] text-muted">
      Recently ended: {list.map((p, i) => (
        <span key={p.id}>{i > 0 ? ', ' : ''}{p.client.name}{p.end_date ? ` (${fmtDate(p.end_date)})` : ''}</span>
      ))}. Their hours and pay stay below.
    </p>
  );
}
