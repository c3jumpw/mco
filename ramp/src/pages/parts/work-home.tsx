// Home: a compact "This week's hours" card for assistants with a placement, plus a link to a ready launch plan.
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { q, useAsync } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { addDays, hours, weekLabel, weekStart } from '../../lib/util';
import type { MyWork, Timesheet } from '../../lib/types';
import { Card, ErrorBox, Icon, LinkButton, Progress } from '../../ui';
import { loadLaunchList } from './work-common';
import { TimesheetChip, fmtNum } from './work-hours';

type Row = Pick<Timesheet, 'id' | 'placement_id' | 'week_start' | 'total' | 'status'>;

export function WeekHoursCard() {
  const { me } = useMe();
  const wk = weekStart();
  const { data, error, reload } = useAsync(async () => {
    const [work, sheets, launch] = await Promise.all([
      q<MyWork>(supabase.rpc('ramp_my_work')),
      q<Row[]>(supabase.from('ramp_timesheets').select('id, placement_id, week_start, total, status').eq('member_id', me.id).gte('week_start', addDays(wk, -56))),
      loadLaunchList().catch(() => []),
    ]);
    return { work, sheets, launch };
  }, [me.id, wk]);

  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <div className="skeleton h-40 rounded-2xl" aria-hidden="true" />;

  const live = data.work.placements.filter((p) => p.status !== 'ended' && p.status !== 'proposed');
  const upcoming = data.work.placements.filter((p) => p.status === 'proposed');
  const returned = data.sheets.filter((t) => t.status === 'rejected');
  const ready = data.launch.filter((l) => l.role === 'va' && (l.plan_status === 'ready' || l.plan_status === 'in_progress'));
  if (!live.length && !upcoming.length) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold leading-snug">This week’s hours</h2>
          <p className="text-sm text-muted mt-0.5">{weekLabel(wk)}</p>
        </div>
        <Link to="/work" className="inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-brand-ink no-underline shrink-0">
          My work<Icon name="chevronRight" size={16} strokeWidth={2} />
        </Link>
      </div>
      {live.length === 0 ? (
        <p className="text-[15px] text-muted">You can log hours once your placement with {upcoming[0]!.client.name} starts.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {live.map((p) => {
            const t = data.sheets.find((x) => x.placement_id === p.id && x.week_start === wk);
            const total = Number(t?.total || 0);
            const target = Number(p.hours_per_week) || 0;
            return (
              <li key={p.id} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[15px] min-w-0">
                    {live.length > 1 && <span className="font-semibold">{p.client.name} · </span>}
                    <span className="font-display text-xl font-bold tabular-nums">{fmtNum(total)}</span>
                    <span className="text-muted"> of {hours(target)}</span>
                  </span>
                  <TimesheetChip status={t?.status || 'none'} />
                </div>
                {target > 0 && <Progress value={(total / target) * 100} tone={total >= target ? 'good' : 'brand'} label={`Hours this week${live.length > 1 ? ` at ${p.client.name}` : ''}`} />}
              </li>
            );
          })}
        </ul>
      )}
      {returned.length > 0 && (
        <p className="flex items-start gap-2 text-sm font-semibold text-bad">
          <Icon name="alert" size={16} className="mt-0.5" />
          {returned.length === 1 ? `Hours for ${weekLabel(returned[0]!.week_start)} were returned. Fix them and send again.` : `${returned.length} weeks of hours were returned. Fix them and send again.`}
        </p>
      )}
      {ready.map((l) => (
        <div key={l.placement_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-soft px-3.5 py-3">
          <span className="text-[15px] font-semibold text-brand-ink min-w-0">Your launch plan for {l.client} is ready</span>
          <LinkButton to={`/launch/${l.placement_id}`} size="sm" variant="primary" iconRight="chevronRight">Open plan</LinkButton>
        </div>
      ))}
      {live.length > 0 && <div><LinkButton to="/work" size="sm" icon="clock">Log hours</LinkButton></div>}
    </Card>
  );
}
