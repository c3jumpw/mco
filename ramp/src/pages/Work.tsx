// My work: an assistant's placements, weekly hours, checklist, path to the next tier, pay and payout details.
// Data comes from ramp_my_work() (no bill rates) and the assistant's own ramp_timesheets rows.
import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { addDays, cx, fmtDate, hours, weekLabel, weekStart } from '../lib/util';
import type { MyWork, Timesheet } from '../lib/types';
import { Button, Card, EmptyState, ErrorBox, LinkButton, Notice, PageHeader, Skeleton } from '../ui';
import { SectionHeading, loadLaunchList, useStepToggle } from './parts/work-common';
import { TimesheetChip, WeekSwitcher } from './parts/work-hours';
import { TimesheetEditor, type Drafts } from './parts/work-timesheet';
import { EndedPlacements, PlacementCard, WorkChecklist } from './parts/work-placement';
import { TierPathCard, type ModuleRef } from './parts/work-tier';
import { PayCard, PayeeCard } from './parts/work-pay';

type WorkData = MyWork & { modules: ModuleRef[] };

export default function Work() {
  useTitle('My work');
  const { me, org } = useMe();
  const thisWeek = weekStart();
  const [week, setWeek] = useState(thisWeek);
  const drafts: Drafts = useRef<Drafts['current']>({});
  const hoursRef = useRef<HTMLElement>(null);

  const work = useAsync<WorkData>(async () => {
    const w = await q<MyWork>(supabase.rpc('ramp_my_work'));
    // Titles for the modules each tier requires, so they can link to the player.
    const ids = [...new Set((w.tiers || []).flatMap((t) => t.required_modules || []))];
    const modules = ids.length
      ? await q<ModuleRef[]>(supabase.from('ramp_modules').select('id, title').in('id', ids)).catch(() => [] as ModuleRef[])
      : [];
    return { ...w, modules };
  }, [me.id]);
  const sheets = useAsync(
    () => q<Timesheet[]>(supabase.from('ramp_timesheets').select('*').eq('member_id', me.id).order('week_start', { ascending: false }).limit(104)),
    [me.id],
  );
  // ramp_launch_list only reads; it never creates a plan.
  const launch = useAsync(() => loadLaunchList(), [me.id]);

  const { toggle, busy } = useStepToggle((id, doneAt) => work.setData((d) => ({
    ...d!, placements: d!.placements.map((p) => ({ ...p, steps: p.steps.map((s) => (s.id === id ? { ...s, done_at: doneAt } : s)) })),
  })));

  function jumpTo(w: string) {
    setWeek(w);
    hoursRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const header = <PageHeader title="My work" subtitle="Your placement, hours, checklist and pay, all in one place." />;
  if (work.error && !work.data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={work.error} onRetry={work.reload} /></div>;
  if (!work.data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={2} /><Skeleton rows={3} /></div>;

  const w = work.data;
  const active = w.placements.filter((p) => p.status !== 'ended');
  const ended = w.placements.filter((p) => p.status === 'ended');
  const list = sheets.data || [];
  const sheetFor = (pid: string, wk: string) => list.find((t) => t.placement_id === pid && t.week_start === wk);
  const multi = active.length > 1;

  if (!w.placements.length) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <EmptyState icon="building" title="No placement yet"
            body="When you’re placed with a client, your hours, checklist and pay show up here. Until then, keep going with your training."
            action={<LinkButton to="/training" variant="primary" icon="book">Go to training</LinkButton>} />
        </Card>
      </div>
    );
  }

  // Placements that take hours for the week on screen.
  const weekEnd = addDays(week, 6);
  const forWeek = w.placements.filter((p) => {
    const ts = sheetFor(p.id, week);
    if (ts) return true;
    if (p.status === 'ended') return !!p.end_date && week <= p.end_date;
    return !(p.start_date && weekEnd < p.start_date);
  });
  const returned = list.filter((t) => t.status === 'rejected');
  const recent = list.slice(0, 8);
  const nameOf = (pid: string) => w.placements.find((p) => p.id === pid)?.client.name || 'Client';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My work"
        subtitle={active.length === 1 ? `Your hours, checklist and pay for ${active[0]!.client.name}.` : 'Your placements, hours, checklist and pay, all in one place.'} />

      {returned.length > 0 && (
        <Notice tone="bad" icon="alert">
          <span className="font-semibold">{returned.length === 1 ? 'One week of hours was returned to you.' : `${returned.length} weeks of hours were returned to you.`}</span>
          <span className="flex flex-wrap gap-2 mt-2">
            {returned.slice(0, 3).map((t) => (
              <Button key={t.id} size="sm" onClick={() => jumpTo(t.week_start)}>{multi ? `${nameOf(t.placement_id)} · ` : ''}{weekLabel(t.week_start)}</Button>
            ))}
          </span>
        </Notice>
      )}
      {!w.payee && (
        <Notice tone="warn" icon="alert">
          <span className="font-semibold">Add your payout details so we can pay you.</span>{' '}
          <a href="#payout-details" className="font-semibold underline text-warn">Add them now</a>
        </Notice>
      )}

      <section aria-label="Your placements" className={cx('grid gap-4 items-start', multi && 'lg:grid-cols-2')}>
        {(active.length ? active : ended).map((p) => (
          <PlacementCard key={p.id} p={p} launch={launch.data?.find((l) => l.placement_id === p.id)} launchLoaded={!!launch.data} />
        ))}
      </section>
      {active.length > 0 && <EndedPlacements list={ended} />}

      <section ref={hoursRef} aria-labelledby="hours-h" className="flex flex-col gap-3 scroll-mt-20">
        <SectionHeading id="hours-h" title={week === thisWeek ? 'This week’s hours' : `Hours for ${weekLabel(week)}`}
          sub="Weeks run Monday to Sunday. Add your hours each day, then send the week to your client for approval."
          action={<WeekSwitcher week={week} onChange={setWeek} max={thisWeek} />} />
        {sheets.error && !sheets.data ? <ErrorBox error={sheets.error} onRetry={sheets.reload} />
          : !sheets.data ? <Skeleton rows={3} />
          : forWeek.length === 0 ? (
            <Card><p className="text-[15px] text-muted">Nothing to log for {weekLabel(week)}. Your placement {active[0]?.start_date ? `started on ${fmtDate(active[0].start_date, { month: 'long', day: 'numeric' })}` : 'hadn’t started yet'}.</p></Card>
          ) : forWeek.map((p) => {
            const ts = sheetFor(p.id, week);
            return (
              <TimesheetEditor key={`${p.id}:${week}:${ts?.updated_at || 'new'}`} p={p} week={week} ts={ts} drafts={drafts}
                showClient={forWeek.length > 1} onSaved={sheets.reload} />
            );
          })}
        {recent.length > 0 && (
          <Card padded={false} className="overflow-hidden">
            <h3 className="px-5 pt-4 pb-2 text-[13px] font-semibold text-muted">Recent weeks</h3>
            <ul>
              {recent.map((t) => (
                <li key={t.id} className="border-t border-line-2">
                  <button type="button" onClick={() => jumpTo(t.week_start)} aria-current={t.week_start === week ? 'true' : undefined}
                    className={cx('flex items-center gap-3 w-full min-h-14 px-5 py-2.5 text-left cursor-pointer hover:bg-bg', t.week_start === week && 'bg-brand-soft/60')}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{weekLabel(t.week_start)}</span>
                      <span className="block text-[13px] text-muted tabular-nums">{multi ? `${nameOf(t.placement_id)} · ` : ''}{hours(t.total)}</span>
                    </span>
                    <TimesheetChip status={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {active.length > 0 && (
        <section aria-label="Checklist and growth" className="grid gap-4 lg:grid-cols-2 items-start">
          {active.map((p) => (
            <div key={p.id} className="contents">
              <WorkChecklist p={p} showClient={multi} busy={busy} onToggle={toggle} />
              <TierPathCard p={p} tiers={w.tiers} completed={w.completed_modules || []} modules={w.modules} showClient={multi} />
            </div>
          ))}
        </section>
      )}

      <section aria-label="Pay" className="grid gap-4 lg:grid-cols-2 items-start">
        <PayCard placements={w.placements} payouts={w.payouts || []} sheets={list} payWhenPaid={!!org.agency?.pay_when_paid} />
        <div id="payout-details" className="scroll-mt-20">
          <PayeeCard payee={w.payee} onSaved={work.reload} />
        </div>
      </section>
    </div>
  );
}
