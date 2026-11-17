// Read-only views of each launch plan section. The Day 1 run sheet and the plan document both use them.
import { Fragment, type ReactNode } from 'react';
import { DAY_NAMES, cx, daysUntil, fmtDate, plural } from '../../lib/util';
import { Chip, Icon, Progress, Switch } from '../../ui';
import { Bullets, FileTiles, LinkList, Prose, StepsView, hostOf, hrefOf } from './kit';
import {
  PERIODS, PRIORITY, SCOPE, daysText, fmtClock, fmtHour, milestoneDate, parseDays, toMin,
  type Block, type Checklist, type Company, type Milestone, type Project, type Schedule, type Tool, type Value,
} from './model';

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-muted leading-relaxed">{children}</p>;
}

export function Sub({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h5 className="text-xs font-bold uppercase tracking-[0.07em] text-muted mb-2">{title}</h5>
      {children}
    </div>
  );
}

// ───────── company ─────────

export function CompanyView({ c }: { c: Company }) {
  const any = c.summary.trim() || c.public_info.trim() || c.admin_info.trim() || c.presentation_url.trim() || c.files.length;
  if (!any) return <Empty>The company intro isn’t filled in yet.</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <Prose text={c.summary} className="text-base text-ink" />
      {(c.public_info.trim() || c.admin_info.trim()) && (
        <div className="grid gap-3 md:grid-cols-2">
          {c.public_info.trim() && (
            <div className="launch-keep rounded-2xl bg-bg border border-line-2 p-4">
              <Sub title="What anyone can know"><Prose text={c.public_info} /></Sub>
            </div>
          )}
          {c.admin_info.trim() && (
            <div className="launch-keep rounded-2xl bg-bg border border-line-2 p-4">
              <Sub title="Inside info for the team"><Prose text={c.admin_info} /></Sub>
            </div>
          )}
        </div>
      )}
      {c.presentation_url.trim() && (
        <a href={hrefOf(c.presentation_url)} target="_blank" rel="noopener noreferrer"
          className="self-start inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-brand-soft text-brand-ink font-semibold text-[15px] no-underline break-all">
          <Icon name="play" size={18} />Company presentation<span className="font-normal text-muted text-sm hidden sm:inline">· {hostOf(c.presentation_url)}</span>
        </a>
      )}
      {c.files.length > 0 && <Sub title="Files"><FileTiles files={c.files} /></Sub>}
    </div>
  );
}

// ───────── values ─────────

export function ValuesView({ values }: { values: Value[] }) {
  if (!values.length) return <Empty>No core values yet.</Empty>;
  return (
    <ol className="grid gap-3 md:grid-cols-2">
      {values.map((v, i) => (
        <li key={v.id} className="launch-keep rounded-2xl border border-line bg-white p-4 flex gap-3.5">
          <span aria-hidden="true" className="w-9 h-9 rounded-xl bg-brand text-white font-display font-bold flex items-center justify-center shrink-0 tabular-nums">{i + 1}</span>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold leading-snug break-words">{v.title.trim() || 'Untitled value'}</p>
            {v.practice.trim() && (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.07em] text-muted mt-2.5 mb-1">How to practice it daily</p>
                <Prose text={v.practice} />
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ───────── projects ─────────

export function ProjectView({ p, label }: { p: Project; label?: string }) {
  const pr = PRIORITY[p.priority];
  return (
    <article className="rounded-2xl border border-line bg-white p-4 md:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-48">
          {label && <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-ink mb-0.5">{label}</p>}
          <h4 className="font-display text-lg font-semibold leading-snug break-words">{p.name.trim() || 'Untitled project'}</h4>
        </div>
        <Chip tone={pr.tone}>{pr.label}</Chip>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 text-[15px]">
          <span className="text-ink-2 min-w-0 break-words">{p.status.trim() || <span className="text-muted">No status yet</span>}</span>
          <span className="font-semibold tabular-nums shrink-0">{p.progress}%</span>
        </div>
        <Progress value={p.progress} tone={p.progress >= 100 ? 'good' : 'brand'} label={`${p.name || 'Project'} progress`} />
      </div>
      {p.challenges.trim() && <Sub title="Challenges"><Bullets text={p.challenges} /></Sub>}
      {p.links.some((l) => l.trim()) && <Sub title="Links"><LinkList links={p.links} /></Sub>}
      {p.files.length > 0 && <Sub title="Screenshots and files"><FileTiles files={p.files} /></Sub>}
      <Sub title="Mini objectives">
        {p.objectives.length ? (
          <ol className="flex flex-col gap-2.5">
            {p.objectives.map((o, i) => (
              <li key={o.id} className="launch-keep rounded-xl bg-bg border border-line-2 p-3.5">
                <p className="font-semibold text-[15px] leading-snug break-words">
                  <span className="text-brand-ink tabular-nums">{i + 1}.</span> {o.title.trim() || 'Untitled objective'}
                </p>
                <StepsView steps={o.steps} className="mt-2.5" />
              </li>
            ))}
          </ol>
        ) : <Empty>No objectives yet.</Empty>}
      </Sub>
    </article>
  );
}

export function ProjectsView({ projects }: { projects: Project[] }) {
  if (!projects.length) return <Empty>No major projects yet.</Empty>;
  return <div className="flex flex-col gap-3">{projects.map((p) => <ProjectView key={p.id} p={p} />)}</div>;
}

// ───────── checklists ─────────

export function ChecklistsView({ lists }: { lists: Checklist[] }) {
  if (!lists.length) return <Empty>No role checklists yet.</Empty>;
  const sorted = [...lists].sort((a, b) => (a.frequency === b.frequency ? 0 : a.frequency === 'daily' ? -1 : 1));
  return (
    <div className="flex flex-col gap-3">
      {sorted.map((l) => (
        <article key={l.id} className="rounded-2xl border border-line bg-white p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-lg font-semibold leading-snug break-words">{l.title.trim() || (l.frequency === 'daily' ? 'Daily checklist' : 'Weekly checklist')}</h4>
            <Chip tone={l.frequency === 'daily' ? 'brand' : 'neutral'} icon="calendar">{l.frequency === 'daily' ? 'Every day' : 'Every week'}</Chip>
          </div>
          {l.items.length ? (
            <ol className="mt-3 flex flex-col divide-y divide-line-2">
              {l.items.map((it) => (
                <li key={it.id} className="launch-keep py-3 first:pt-1 last:pb-0">
                  <p className="font-semibold text-[15px] leading-snug flex gap-2.5 break-words">
                    <span aria-hidden="true" className="mt-0.5 w-5 h-5 rounded-md border-2 border-field shrink-0" />
                    {it.title.trim() || 'Untitled item'}
                  </p>
                  {it.steps.some((s) => s.trim()) && <StepsView steps={it.steps} className="mt-2 pl-7" />}
                </li>
              ))}
            </ol>
          ) : <Empty>No items yet.</Empty>}
        </article>
      ))}
    </div>
  );
}

// ───────── tools ─────────

export function accessSummary(tools: Tool[]) {
  const granted = tools.filter((t) => t.granted).length;
  const tested = tools.filter((t) => t.tested).length;
  return { granted, tested, text: `${granted} of ${plural(tools.length, 'tool')} with access, ${tested} tested` };
}

export function ToolsView({ tools, onToggle, show = 'both' }: {
  tools: Tool[]; onToggle?: (id: string, field: 'granted' | 'tested', v: boolean) => void; show?: 'both' | 'granted' | 'tested';
}) {
  if (!tools.length) return <Empty>No tools listed yet.</Empty>;
  const sum = accessSummary(tools);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted"><strong className="text-ink tabular-nums">{sum.granted} of {tools.length}</strong> with access · <strong className="text-ink tabular-nums">{sum.tested}</strong> tested</p>
        <Progress value={(sum.granted + sum.tested) / (tools.length * 2) * 100} tone={sum.tested === tools.length ? 'good' : 'brand'} label="Access set up and tested" />
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {tools.map((t) => (
          <li key={t.id} className="launch-keep rounded-2xl border border-line bg-white p-4 flex flex-col gap-2.5">
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold leading-snug break-words">{t.name.trim() || 'Untitled tool'}</p>
              {t.purpose.trim() && <p className="text-[15px] text-ink-2 leading-relaxed mt-0.5">{t.purpose}</p>}
              {t.url.trim() && (
                <a href={hrefOf(t.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-10 text-sm font-semibold text-brand-ink break-all">
                  <Icon name="link" size={15} />{hostOf(t.url)}
                </a>
              )}
            </div>
            {t.access_how.trim() && <Sub title="How to get access"><Prose text={t.access_how} /></Sub>}
            {onToggle ? (
              <div className="flex flex-col border-t border-line-2 -mb-1 mt-auto">
                {show !== 'tested' && (
                  <div className="flex items-center justify-between gap-3 min-h-12">
                    <span className="text-[15px] font-semibold">Access granted</span>
                    <Switch checked={t.granted} onChange={(v) => onToggle(t.id, 'granted', v)} label={`Access granted for ${t.name || 'this tool'}`} />
                  </div>
                )}
                {show !== 'granted' && (
                  <div className="flex items-center justify-between gap-3 min-h-12 border-t border-line-2">
                    <span className="text-[15px] font-semibold">Access tested</span>
                    <Switch checked={t.tested} onChange={(v) => onToggle(t.id, 'tested', v)} label={`Access tested for ${t.name || 'this tool'}`} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                <Chip tone={t.granted ? 'good' : 'warn'} icon={t.granted ? 'check' : 'clock'}>{t.granted ? 'Access granted' : 'Access not granted yet'}</Chip>
                <Chip tone={t.tested ? 'good' : 'neutral'} icon={t.tested ? 'check' : undefined}>{t.tested ? 'Tested' : 'Not tested yet'}</Chip>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────── milestones: the success path ─────────

const longDate = (iso: string) => fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric' });

function MilestoneRow({ m, n, start, last }: { m: Milestone; n?: number; start: string | null; last: boolean }) {
  const date = milestoneDate(start, m.due_day);
  const left = date ? daysUntil(date) : null;
  return (
    <li className="launch-keep relative flex gap-3.5 pb-5 last:pb-0">
      {!last && <span aria-hidden="true" className="absolute left-[15px] top-9 bottom-1 w-0.5 rounded-full bg-line" />}
      <span aria-hidden="true" className={cx('w-8 h-8 rounded-full border-2 text-[13px] font-bold flex items-center justify-center shrink-0 tabular-nums',
        n ? 'border-brand bg-white text-brand-ink' : 'border-dashed border-field bg-white text-muted')}>{n || '?'}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[13px] font-semibold text-brand-ink">
          {m.due_day !== null ? `Day ${m.due_day}` : 'No date yet'}{date && ` · ${longDate(date)}`}
          {left !== null && left >= 0 && left <= 14 && <span className="text-warn"> · {left === 0 ? 'today' : `in ${plural(left, 'day')}`}</span>}
        </p>
        <p className="font-display text-lg font-semibold leading-snug break-words">{m.title.trim() || 'Untitled milestone'}</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5"><Chip tone={m.scope === 'individual' ? 'brand' : m.scope === 'team' ? 'warn' : 'neutral'}>{SCOPE[m.scope].label}</Chip></div>
        {m.why.trim() && <p className="mt-2 text-[15px] leading-relaxed text-ink-2 break-words"><span className="font-semibold text-ink">Why it matters: </span>{m.why}</p>}
        {m.reward.trim() && <p className="mt-1 text-[15px] leading-relaxed text-ink-2 break-words"><span className="font-semibold text-ink">Reward or result: </span>{m.reward}</p>}
      </div>
    </li>
  );
}

/** A path from the start (probation) to promotion, with every dated milestone on it, then the list. */
export function SuccessPath({ milestones, start, compact }: { milestones: Milestone[]; start: string | null; compact?: boolean }) {
  if (!milestones.length) return <Empty>No milestones yet.</Empty>;
  const dated = milestones.filter((m) => m.due_day !== null).sort((a, b) => a.due_day! - b.due_day!);
  const undated = milestones.filter((m) => m.due_day === null);
  const lastDay = dated.length ? dated[dated.length - 1]!.due_day! : 0;
  const span = Math.max(30, Math.ceil(lastDay * 1.12));
  const since = start ? -(daysUntil(start) ?? 0) : null;
  const todayPct = since !== null && since >= 0 ? Math.min(100, (since / span) * 100) : null;
  let prev = -100;
  let up = false;
  const marks = dated.map((m, i) => {
    const pct = (m.due_day! / span) * 100;
    up = pct - prev < 8 ? !up : false;
    prev = pct;
    return { m, i, pct, up };
  });
  return (
    <div className="flex flex-col gap-5">
      {dated.length > 0 && (
        <figure className="launch-keep rounded-2xl border border-line bg-white px-5 pt-3 pb-3">
          <figcaption className="sr-only">Success path from the start date to promotion, with {plural(dated.length, 'dated milestone')}.</figcaption>
          <div className="relative h-[68px] mx-3" aria-hidden="true">
            <div className="absolute inset-x-0 top-[40px] h-1.5 rounded-full bg-line" />
            {todayPct !== null && <div className="absolute left-0 top-[40px] h-1.5 rounded-full bg-brand" style={{ width: `${todayPct}%` }} />}
            <span className="absolute left-0 top-[43px] -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-brand ring-4 ring-white" />
            {marks.map(({ m, i, pct, up: lifted }) => (
              <span key={m.id} className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-brand bg-white text-brand-ink text-xs font-bold flex items-center justify-center tabular-nums"
                style={{ left: `${pct}%`, top: lifted ? 14 : 43 }}>{i + 1}</span>
            ))}
            <span className="absolute right-0 top-[43px] translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-good-2 text-white flex items-center justify-center ring-4 ring-white">
              <Icon name="star" size={16} />
            </span>
            {todayPct !== null && todayPct > 4 && todayPct < 92 && (
              <span className="absolute top-[54px] -translate-x-1/2 text-[11px] font-bold text-brand-ink" style={{ left: `${todayPct}%` }}>Today</span>
            )}
          </div>
          <div className="flex justify-between gap-3 text-xs font-semibold text-muted">
            <span>Start{start ? ` · ${fmtDate(start)}` : ''}<span className="block font-normal">Probation begins</span></span>
            <span className="text-right">Day {span}<span className="block font-normal">Promotion</span></span>
          </div>
        </figure>
      )}
      {!compact && dated.length > 0 && (
        <ol className="flex flex-col">
          {dated.map((m, i) => <MilestoneRow key={m.id} m={m} n={i + 1} start={start} last={i === dated.length - 1} />)}
        </ol>
      )}
      {compact && dated.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {dated.map((m, i) => (
            <li key={m.id} className="flex gap-2.5 text-[15px] leading-snug">
              <span className="font-bold text-brand-ink tabular-nums shrink-0">{i + 1}.</span>
              <span className="min-w-0"><span className="font-semibold">Day {m.due_day}</span> · {m.title.trim() || 'Untitled milestone'}
                {m.reward.trim() && <span className="text-muted"> · {m.reward}</span>}</span>
            </li>
          ))}
        </ol>
      )}
      {undated.length > 0 && (
        <Sub title="No date yet">
          <ol className="flex flex-col">
            {undated.map((m, i) => <MilestoneRow key={m.id} m={m} start={start} last={i === undated.length - 1} />)}
          </ol>
        </Sub>
      )}
    </div>
  );
}

// ───────── time-blocks: the week ─────────

const SWATCH = ['bg-brand text-white', 'bg-amber text-ink', 'bg-good-2 text-white', 'bg-ink text-white', 'bg-brand-2 text-brand-ink', 'bg-warn-soft text-warn', 'bg-good-soft text-good', 'bg-bad-soft text-bad'];

/** Days down the side, hours across: one bar per block, colored by focus. */
export function WeekSchedule({ blocks }: { blocks: Block[] }) {
  const valid = blocks
    .map((b) => ({ b, days: parseDays(b.days), s: toMin(b.start), e: toMin(b.end) }))
    .filter((x) => x.days.length && !Number.isNaN(x.s) && !Number.isNaN(x.e) && x.e > x.s);
  if (!valid.length) return <Empty>Add days and times to see the week.</Empty>;
  const lo = Math.floor(Math.min(...valid.map((x) => x.s)) / 60) * 60;
  const hi = Math.ceil(Math.max(...valid.map((x) => x.e)) / 60) * 60;
  const span = Math.max(60, hi - lo);
  const step = span > 9 * 60 ? 180 : span > 4 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  const pos = (m: number) => ((m - lo) / span) * 100;
  const keyOf = (f: string) => f.trim().toLowerCase() || '—';
  const keys = [...new Set(valid.map((x) => keyOf(x.b.focus)))];
  const swatch = (f: string) => SWATCH[keys.indexOf(keyOf(f)) % SWATCH.length]!;
  const days = DAY_NAMES.map((_, d) => {
    const items = valid.filter((x) => x.days.includes(d)).sort((a, b) => a.s - b.s);
    const ends: number[] = [];
    const placed = items.map((x) => {
      let lane = ends.findIndex((e) => e <= x.s);
      if (lane < 0) { lane = ends.length; ends.push(x.e); } else ends[lane] = x.e;
      return { ...x, lane };
    });
    return { placed, lanes: Math.max(1, ends.length) };
  });
  const legend = [...valid].sort((a, b) => a.days[0]! - b.days[0]! || a.s - b.s);
  return (
    <figure className="flex flex-col gap-3">
      <div className="launch-keep grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 gap-y-1.5" aria-hidden="true">
        <span />
        <div className="relative h-4">
          {ticks.map((t, i) => (
            <span key={t} className={cx('absolute top-0 text-[11px] font-semibold text-muted whitespace-nowrap',
              i === 0 ? '' : i === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${pos(t)}%` }}>{fmtHour(t)}</span>
          ))}
        </div>
        {days.map(({ placed, lanes }, d) => (
          <Fragment key={d}>
            <span className={cx('text-[13px] font-semibold self-center', placed.length ? 'text-ink-2' : 'text-muted')}>{DAY_NAMES[d]}</span>
            <div className="relative h-10 rounded-lg bg-chip overflow-hidden">
              {ticks.slice(1, -1).map((t) => <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pos(t)}%` }} />)}
              {!placed.length && <span className="absolute inset-0 flex items-center pl-2.5 text-xs text-muted">Off</span>}
              {placed.map((x) => (
                <span key={x.b.id} className={cx('absolute rounded-md px-1.5 text-[11px] font-semibold leading-tight flex items-center overflow-hidden', swatch(x.b.focus))}
                  style={{ left: `calc(${pos(x.s)}% + 1px)`, width: `calc(${pos(x.e) - pos(x.s)}% - 2px)`, top: `calc(${(x.lane / lanes) * 100}% + 2px)`, height: `calc(${100 / lanes}% - 4px)` }}>
                  <span className="truncate">{x.b.focus}</span>
                </span>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
      <figcaption>
        <ul className="flex flex-col gap-1.5">
          {legend.map((x) => (
            <li key={x.b.id} className="flex items-start gap-2.5 text-[15px] leading-snug">
              <span aria-hidden="true" className={cx('mt-1 w-3.5 h-3.5 rounded shrink-0', swatch(x.b.focus).split(' ')[0])} />
              <span className="min-w-0">
                <span className="font-semibold">{x.b.focus.trim() || 'No focus yet'}</span>
                <span className="text-muted"> · {daysText(x.days)} · {fmtClock(x.s)} to {fmtClock(x.e)}</span>
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

export function SchedulesView({ schedules, only }: { schedules: Schedule[]; only?: Schedule['period'] }) {
  if (!schedules.some((s) => s.blocks.length)) return <Empty>No time-block schedules yet.</Empty>;
  const list = PERIODS.filter((p) => !only || p.id === only);
  return (
    <div className="flex flex-col gap-3">
      {list.map((p) => {
        const s = schedules.find((x) => x.period === p.id);
        return (
          <article key={p.id} className="launch-period rounded-2xl border border-line bg-white p-4 md:p-5 flex flex-col gap-3">
            <div>
              <h4 className="font-display text-lg font-semibold">{p.label}</h4>
              <p className="text-sm text-muted leading-relaxed">{p.desc}</p>
            </div>
            {s && s.blocks.length ? <WeekSchedule blocks={s.blocks} /> : <Empty>Not set yet.</Empty>}
          </article>
        );
      })}
    </div>
  );
}
