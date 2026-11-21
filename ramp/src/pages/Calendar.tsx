// Calendar: everything with a due date, by day. Your training and tasks, and (for supervisors, leads and admins) the
// people you look after: their training, tasks, start dates and, for coaches, placement check-ins.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { q, useAsync, useIsMobile, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { loadTrainingFor, planFor, type PlanItem } from '../lib/plan';
import { DAY_NAMES, addDays, cx, daysUntil, displayName, initials, plural, todayISO, weekStart } from '../lib/util';
import type { CoachPlacementSummary, Member, Progress, Task } from '../lib/types';
import { Avatar, Button, Card, Chip, EmptyState, ErrorBox, Icon, IconButton, PageHeader, Segmented, Skeleton, Stat, Switch } from '../ui';

type Kind = 'training' | 'task' | 'checkin' | 'start';
type Scope = 'me' | 'team' | 'all';
type View = 'month' | 'list';

interface Item {
  key: string;
  date: string;
  kind: Kind;
  title: string;
  /** Someone else's item; null = yours. */
  who: { id: string; name: string } | null;
  state: 'open' | 'review' | 'done' | 'event';
  to: string;
}

const KIND: Record<Kind, { label: string; icon: string; dot: string; soft: string }> = {
  training: { label: 'Training', icon: 'book', dot: 'bg-brand', soft: 'bg-brand-soft text-brand-ink' },
  task: { label: 'Task', icon: 'tasks', dot: 'bg-amber', soft: 'bg-warn-soft text-warn' },
  checkin: { label: 'Check-in', icon: 'target', dot: 'bg-good-2', soft: 'bg-good-soft text-good' },
  start: { label: 'First day', icon: 'userPlus', dot: 'bg-ink', soft: 'bg-chip text-ink-2' },
};
const KIND_FILTER: { kind: Kind; label: string; team?: boolean }[] = [
  { kind: 'training', label: 'Training' },
  { kind: 'task', label: 'Tasks' },
  { kind: 'checkin', label: 'Check-ins', team: true },
  { kind: 'start', label: 'Start dates', team: true },
];

const overdue = (i: Item, today: string) => i.state === 'open' && i.date < today;
const monthOf = (iso: string) => iso.slice(0, 7);
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
function shiftMonth(m: string, n: number) {
  const d = new Date(`${m}-01T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString('en-CA').slice(0, 7);
}
function relDay(iso: string) {
  const n = daysUntil(iso);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : dayLabel(iso);
}

interface Data { mine: Item[]; team: Item[]; supervised: number }

export default function Calendar() {
  useTitle('Calendar');
  const { me, rank, agencyOn, roles } = useMe();
  const mobile = useIsMobile();
  const today = todayISO();
  const [params, setParams] = useSearchParams();
  const canTeam = rank <= 4 || (agencyOn && roles.coaching > 0);
  const teamLabel = rank <= 2 ? 'Everyone' : rank === 3 ? 'My department' : 'People I supervise';
  const teamPhrase = rank <= 2 ? 'everyone' : rank === 3 ? 'your department' : 'the people you supervise';

  const month = /^\d{4}-\d{2}$/.test(params.get('m') || '') ? params.get('m')! : monthOf(today);
  const view: View = params.get('view') === 'list' ? 'list' : 'month';
  const scopeParam = params.get('scope') as Scope | null;
  const scope: Scope = canTeam && (scopeParam === 'team' || scopeParam === 'all') ? scopeParam : 'me';
  const set = (k: string, v: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const [picked, setPicked] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(['training', 'task', 'checkin', 'start']));
  const [showDone, setShowDone] = useState(false);

  const { data, error, reload } = useAsync<Data>(async () => {
    const [mine, tasks, team, coach] = await Promise.all([
      loadTrainingFor(me),
      q<Task[]>(supabase.from('ramp_tasks').select('*').not('due_date', 'is', null)),
      canTeam
        ? Promise.all([
          q<Member[]>(supabase.from('ramp_members').select('*').neq('level', 'client').neq('status', 'inactive')),
          q<Progress[]>(supabase.from('ramp_progress').select('*')),
        ])
        : Promise.resolve(null),
      agencyOn && roles.coaching > 0 ? q<CoachPlacementSummary[] | null>(supabase.rpc('ramp_coach_placements')).catch(() => null) : Promise.resolve(null),
    ]);
    const training = (p: PlanItem, who: Item['who'], to: string): Item | null => (p.due && p.kind !== 'optional' ? {
      key: `t:${who?.id || me.id}:${p.module.id}`, date: p.due, kind: 'training', title: p.module.title, who, to,
      state: p.status === 'completed' ? 'done' : p.status === 'submitted' ? 'review' : 'open',
    } : null);
    const taskItem = (t: Task, who: Item['who'], to: string): Item => ({
      key: `k:${t.id}`, date: t.due_date!.slice(0, 10), kind: 'task', title: t.title, who, to,
      state: t.status === 'done' ? 'done' : t.status === 'review' ? 'review' : 'open',
    });

    const mineItems: Item[] = [
      ...mine.plan.map((p) => training(p, null, `/training/${p.module.id}`)).filter((x): x is Item => !!x),
      ...tasks.filter((t) => t.member_id === me.id).map((t) => taskItem(t, null, '/tasks')),
    ];

    const teamItems: Item[] = [];
    // Mentors see only the people they supervise; leads their department; admins everyone.
    const people = (team?.[0] || []).filter((m) => m.id !== me.id && (rank <= 3 || m.mentor_id === me.id));
    const byId = new Map(people.map((m) => [m.id, m]));
    for (const m of people) {
      const who = { id: m.id, name: displayName(m) };
      const to = rank <= 4 ? `/team/${m.id}` : '/calendar';
      for (const p of planFor(m, mine.modules, mine.roleModules, team![1])) {
        const it = training(p, who, to);
        if (it) teamItems.push(it);
      }
      if (m.start_date && rank <= 3) teamItems.push({ key: `s:${m.id}`, date: m.start_date, kind: 'start', title: `${who.name.split(' ')[0]} starts`, who, to, state: 'event' });
    }
    for (const t of tasks) {
      const m = byId.get(t.member_id);
      if (m) teamItems.push(taskItem(t, { id: m.id, name: displayName(m) }, `/team/${m.id}`));
    }
    for (const p of coach || []) {
      if (!p.next_checkin) continue;
      teamItems.push({
        key: `c:${p.next_checkin.id}`, date: p.next_checkin.due_date, kind: 'checkin', to: `/coaching/${p.id}`, state: 'open',
        title: `${p.next_checkin.kind === 'client' ? 'Client check-in' : 'Check-in'} · ${p.client.name}`, who: { id: p.va.id, name: p.va.name },
      });
    }
    return { mine: mineItems, team: teamItems, supervised: people.length };
  }, [me.id]);

  const items = useMemo(() => {
    if (!data) return [];
    const all = scope === 'me' ? data.mine : scope === 'team' ? data.team : [...data.mine, ...data.team];
    return all.filter((i) => kinds.has(i.kind) && (showDone || i.state !== 'done'))
      .sort((a, b) => a.date.localeCompare(b.date) || Number(!!a.who) - Number(!!b.who) || a.title.localeCompare(b.title));
  }, [data, scope, kinds, showDone]);
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    items.forEach((i) => { const l = m.get(i.date) || []; l.push(i); m.set(i.date, l); });
    return m;
  }, [items]);

  const late = items.filter((i) => overdue(i, today));
  const week = items.filter((i) => i.state === 'open' && i.date >= today && i.date <= addDays(today, 6));
  const inMonth = items.filter((i) => monthOf(i.date) === month && i.state !== 'event');
  const sel = picked && monthOf(picked) === month ? picked : monthOf(today) === month ? today : `${month}-01`;

  function go(m: string) { setPicked(null); set('m', m === monthOf(today) ? null : m); }

  const header = (
    <PageHeader title="Calendar"
      subtitle={scope === 'me' ? 'Your training and tasks with due dates, by day.' : `Training, tasks and dates for ${scope === 'team' ? teamPhrase : `you and ${teamPhrase}`}, by day.`} />
  );
  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={1} /><Skeleton rows={6} /></div>;

  const shownKinds = KIND_FILTER.filter((k) => !k.team || scope !== 'me')
    .filter((k) => (scope === 'me' ? data.mine : data.team.concat(data.mine)).some((i) => i.kind === k.kind) || k.kind === 'training' || k.kind === 'task');

  return (
    <div className="flex flex-col gap-5">
      {header}

      {canTeam && (
        <div><Segmented label="Whose dates" value={scope} onChange={(v) => { set('scope', v === 'me' ? null : v); }}
          options={[{ value: 'me', label: 'Mine' }, { value: 'team', label: mobile && teamLabel.length > 10 ? 'Team' : teamLabel }, { value: 'all', label: 'Both' }]} /></div>
      )}
      {scope !== 'me' && !data.supervised && !data.team.length && (
        <Card><EmptyState icon="users" title={rank <= 3 ? 'No one to show yet' : 'You don’t supervise anyone yet'}
          body={rank <= 3 ? 'People you look after show up here once they have training or tasks with due dates.' : 'An admin can make you someone’s training supervisor on the People page. Their due dates then show up here.'} /></Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Overdue" value={late.length} tone={late.length ? 'warn' : undefined} hint={late.length ? 'past their due date' : 'nothing late'} />
        <Stat label="Next 7 days" value={week.length} hint="still to do" />
        <Stat label={new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long' })} value={inMonth.length} hint={`due${showDone ? '' : ', not done'}`} />
      </div>

      {late.length > 0 && <Overdue items={late} today={today} />}

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-line-2">
          <div className="flex items-center gap-1">
            <IconButton icon="chevronLeft" label="Previous month" onClick={() => go(shiftMonth(month, -1))} />
            <h2 className="font-display text-[20px] font-bold min-w-[9.5rem] text-center" aria-live="polite">{monthLabel(month)}</h2>
            <IconButton icon="chevronRight" label="Next month" onClick={() => go(shiftMonth(month, 1))} />
          </div>
          {month !== monthOf(today) && <Button size="sm" onClick={() => go(monthOf(today))}>Today</Button>}
          <div className="ml-auto"><Segmented label="View" value={view} onChange={(v) => set('view', v === 'month' ? null : v)}
            options={[{ value: 'month', label: 'Month' }, { value: 'list', label: 'List' }]} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-2.5 border-b border-line-2 bg-[#FAFBFC]">
          {shownKinds.map((k) => {
            const on = kinds.has(k.kind);
            return (
              <button key={k.kind} type="button" aria-pressed={on}
                onClick={() => setKinds((s) => { const n = new Set(s); if (n.has(k.kind)) n.delete(k.kind); else n.add(k.kind); return n; })}
                className={cx('inline-flex items-center gap-2 min-h-10 px-3 rounded-full border text-[13px] font-semibold cursor-pointer',
                  on ? 'bg-white border-[#C9CED6] text-ink' : 'bg-transparent border-dashed border-[#C9CED6] text-muted')}>
                <span className={cx('w-2.5 h-2.5 rounded-full', on ? KIND[k.kind].dot : 'bg-[#C9CED6]')} />{k.label}
              </button>
            );
          })}
          <label className="ml-auto flex items-center gap-2 text-[13px] font-semibold text-ink-2">
            <span className="hidden sm:inline">Show finished</span>
            <Switch checked={showDone} onChange={setShowDone} label="Show finished" />
          </label>
        </div>

        {view === 'month'
          ? (
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
              <MonthGrid month={month} today={today} sel={sel} byDay={byDay} onPick={setPicked} compact={mobile} />
              <section aria-label={`Due on ${dayLabel(sel)}`} className="border-t lg:border-t-0 lg:border-l border-line-2">
                <div className="px-4 sm:px-5 pt-4 pb-2">
                  <h3 className="font-semibold text-[16px]">{relDay(sel)}</h3>
                  <p className="text-sm text-muted">{relDay(sel) === dayLabel(sel) ? '' : `${dayLabel(sel)} · `}{plural((byDay.get(sel) || []).length, 'item')}</p>
                </div>
                <DayList items={byDay.get(sel) || []} today={today} empty="Nothing due on this day." stack />
              </section>
            </div>
          )
          : <Agenda month={month} today={today} byDay={byDay} />}
      </Card>
    </div>
  );
}

function MonthGrid({ month, today, sel, byDay, onPick, compact }: {
  month: string; today: string; sel: string; byDay: Map<string, Item[]>; onPick: (d: string) => void; compact: boolean;
}) {
  const first = `${month}-01`;
  const start = weekStart(first);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const weeks = Math.ceil((daysUntilFrom(start, last) + 1) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return (
    <div className="p-2 sm:p-3">
      <div className="grid grid-cols-7 mb-1" aria-hidden="true">
        {DAY_NAMES.map((d) => <div key={d} className="text-center text-[12px] font-bold uppercase tracking-[0.06em] text-muted py-1.5">{compact ? d[0] : d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel(month)}>
        {days.map((d) => {
          const list = byDay.get(d) || [];
          const out = monthOf(d) !== month;
          const isToday = d === today;
          const late = list.some((i) => overdue(i, today));
          return (
            <button key={d} type="button" role="gridcell" aria-selected={d === sel} onClick={() => onPick(d)}
              aria-label={`${dayLabel(d)}: ${list.length ? plural(list.length, 'item') : 'nothing due'}`}
              className={cx('relative flex flex-col items-stretch text-left rounded-xl border cursor-pointer transition-colors',
                compact ? 'h-14 p-1' : 'min-h-[104px] p-1.5',
                d === sel ? 'border-brand ring-2 ring-brand/25 bg-white' : 'border-line-2 hover:border-[#C9CED6] hover:bg-[#FAFBFC]',
                out && d !== sel && 'bg-bg/60')}>
              <span className={cx('self-start inline-flex items-center justify-center rounded-full text-[13px] font-bold w-7 h-7',
                isToday ? 'bg-brand text-white' : out ? 'text-muted/60' : 'text-ink')}>{Number(d.slice(8))}</span>
              {compact ? (
                list.length > 0 && (
                  <span className="mt-auto flex items-center justify-center gap-1 pb-0.5">
                    {list.slice(0, 3).map((i) => <span key={i.key} className={cx('w-1.5 h-1.5 rounded-full', overdue(i, today) ? 'bg-bad' : KIND[i.kind].dot, i.state === 'done' && 'opacity-40')} />)}
                    {list.length > 3 && <span className="text-[10px] font-bold text-muted leading-none">+</span>}
                  </span>
                )
              ) : (
                <span className="flex flex-col gap-0.5 mt-0.5 min-w-0">
                  {list.slice(0, 3).map((i) => (
                    <span key={i.key} title={`${i.who ? `${i.who.name} · ` : ''}${i.title}`}
                      className={cx('truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold leading-tight',
                        overdue(i, today) ? 'bg-bad-soft text-bad' : KIND[i.kind].soft, i.state === 'done' && 'line-through opacity-60')}>
                      {i.who && <span className="font-bold opacity-70 mr-1">{initials(i.who.name)}</span>}{i.title}
                    </span>
                  ))}
                  {list.length > 3 && <span className="text-[11.5px] font-semibold text-muted px-1.5">+{list.length - 3} more</span>}
                </span>
              )}
              {late && compact && <span className="sr-only">Overdue</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function daysUntilFrom(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
}

function Agenda({ month, today, byDay }: { month: string; today: string; byDay: Map<string, Item[]> }) {
  const days = [...byDay.keys()].filter((d) => monthOf(d) === month).sort();
  if (!days.length) return <EmptyState icon="calendar" title={`Nothing due in ${monthLabel(month)}`} body="Try another month, or turn on finished items." />;
  return (
    <div className="flex flex-col">
      {days.map((d) => (
        <section key={d} aria-label={dayLabel(d)} className={cx('border-t border-line-2 first:border-t-0', d < today && 'opacity-80')}>
          <h3 className={cx('px-4 sm:px-5 pt-3.5 pb-1 text-[13px] font-bold uppercase tracking-[0.06em]', d === today ? 'text-brand-ink' : 'text-muted')}>
            {relDay(d)}{relDay(d) !== dayLabel(d) ? ` · ${dayLabel(d)}` : ''}
          </h3>
          <DayList items={byDay.get(d) || []} today={today} />
        </section>
      ))}
    </div>
  );
}

function DayList({ items, today, empty, stack }: { items: Item[]; today: string; empty?: string; stack?: boolean }) {
  if (!items.length) return <p className="px-4 sm:px-5 pb-5 text-sm text-muted">{empty}</p>;
  return <ul className="pb-2">{items.map((i) => <li key={i.key}><ItemRow item={i} today={today} stack={stack} /></li>)}</ul>;
}

/** One due item. `stack` puts the status under the title (narrow side panel). */
function ItemRow({ item: i, today, showDate, stack }: { item: Item; today: string; showDate?: boolean; stack?: boolean }) {
  const k = KIND[i.kind];
  const n = daysUntil(i.date) ?? 0;
  const status = i.state === 'done' ? <Chip tone="good" icon="check">Done</Chip>
    : i.state === 'review' ? <Chip tone="brand">{i.kind === 'task' ? 'In review' : 'Waiting for review'}</Chip>
      : i.state === 'event' ? null
        : overdue(i, today) ? <Chip tone="bad">{plural(-n, 'day')} late</Chip>
          : n === 0 ? <Chip tone="warn">Due today</Chip> : null;
  return (
    <Link to={i.to} className="flex items-center gap-3 min-h-14 px-4 sm:px-5 py-2.5 no-underline text-ink hover:bg-bg">
      <span className={cx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', k.soft)}><Icon name={k.icon} size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-semibold text-[15px] truncate', i.state === 'done' && 'line-through text-muted')}>{i.title}</span>
        <span className="flex items-center gap-1.5 text-[13px] text-muted min-w-0">
          {i.who && <Avatar name={i.who.name} size={18} />}
          <span className="truncate">{i.who ? i.who.name : 'You'} · {k.label}{showDate ? ` · due ${new Date(`${i.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
        </span>
        {stack && status && <span className="flex mt-1">{status}</span>}
      </span>
      {!stack && status}
    </Link>
  );
}

function Overdue({ items, today }: { items: Item[]; today: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <Card padded={false} className="overflow-hidden border-bad/30">
      <div className="flex items-center gap-2.5 px-4 sm:px-5 pt-4 pb-1">
        <span className="w-8 h-8 rounded-full bg-bad-soft text-bad flex items-center justify-center"><Icon name="alert" size={17} /></span>
        <h2 className="font-semibold text-[16px]">Overdue</h2>
        <span className="text-sm text-muted">{plural(items.length, 'item')}</span>
      </div>
      <ul className="pb-1">{shown.map((i) => <li key={i.key}><ItemRow item={i} today={today} showDate /></li>)}</ul>
      {items.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full min-h-12 border-t border-line-2 text-sm font-semibold text-brand-ink cursor-pointer hover:bg-bg">
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  );
}
