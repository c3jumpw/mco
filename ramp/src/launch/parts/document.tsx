// The plan: a clean, read-only document of everything, for the assistant and for printing.
import type { ReactNode } from 'react';
import { LAUNCH_SECTIONS, fmtDate } from '../../lib/util';
import { Button, Card, Chip, Icon } from '../../ui';
import {
  PLAN_STATUS, SECTION_ICON, fmtClock, fmtDur, schedule, tzShort, walkProject, zonedInstant,
  type Draft, type PlacementInfo,
} from './model';
import { ChecklistsView, CompanyView, ProjectsView, SchedulesView, SuccessPath, ToolsView, ValuesView } from './views';

const PRINT_CSS = `
@media print {
  @page { margin: 14mm 12mm; }
  html, body { background: #fff !important; min-height: 0 !important; }
  aside, nav, header, .launch-noprint { display: none !important; }
  main { padding: 0 !important; max-width: none !important; }
  /* Block layout so page-break hints work (Chrome ignores them inside flex containers). */
  .launch-doc, .launch-sec { display: block !important; }
  .launch-doc > * + * { margin-top: 22px !important; }
  .launch-sec > * + * { margin-top: 10px !important; }
  .launch-doc .launch-keep, .launch-doc figure, .launch-sec-head, .launch-period { break-inside: avoid; }
  .launch-sec-head { break-after: avoid; }
  .launch-doc * { box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .launch-doc a { text-decoration: none; color: inherit; }
}`;

const SECTION_TITLE: Record<string, string> = {
  company: 'Company intro', values: 'Core values', projects: 'Major projects', checklists: 'Role checklists',
  tools: 'Tools and access', milestones: 'Milestones and success path', schedules: 'Time-blocks',
};

function DocSection({ id, title, icon, intro, children }: { id: string; title: string; icon: string; intro?: string; children: ReactNode }) {
  return (
    <section id={`plan-${id}`} aria-labelledby={`plan-${id}-h`} className="launch-sec scroll-mt-[132px] md:scroll-mt-24 flex flex-col gap-3">
      <div className="launch-sec-head">
        <h2 id={`plan-${id}-h`} className="font-display text-xl font-bold flex items-center gap-2.5">
          <span aria-hidden="true" className="w-9 h-9 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center"><Icon name={icon} size={18} /></span>
          {title}
        </h2>
        {intro && <p className="text-sm text-muted leading-relaxed mt-1.5 max-w-2xl">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export function PlanDocument({ draft, placement, tz, isVa }: { draft: Draft; placement: PlacementInfo; tz: string; isVa: boolean }) {
  const { data, agenda } = draft;
  const sched = schedule(agenda, data.run.start);
  const abbr = tzShort(tz, draft.day1 ? zonedInstant(draft.day1, data.run.start, tz) : new Date());
  const st = PLAN_STATUS[draft.status];
  const vaName = placement.va.name || 'Your assistant';
  const jump = [{ id: 'day1', label: 'Day 1' }, ...LAUNCH_SECTIONS.map((s) => ({ id: s.id, label: s.label }))];
  const go = (id: string) => document.getElementById(`plan-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <article className="launch-doc flex flex-col gap-7">
      <style>{PRINT_CSS}</style>
      <div className="launch-noprint flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted leading-relaxed flex-1 basis-60">
          {isVa ? 'Everything for your first weeks, in one place. Come back to it any time.' : `Everything ${vaName.split(' ')[0]} sees, in one place.`}
        </p>
        <Button icon="download" onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
      <nav aria-label="Jump to a section" className="launch-noprint relative -mx-4 md:mx-0 px-4 md:px-0 -mt-3 overflow-x-auto scrollbar-none">
        <ul className="flex md:flex-wrap gap-2 w-max md:w-auto">
          {jump.map((j) => (
            <li key={j.id}>
              <button type="button" onClick={() => go(j.id)}
                className="min-h-11 px-3.5 rounded-full border border-line bg-white text-sm font-semibold text-ink-2 hover:bg-chip whitespace-nowrap cursor-pointer">{j.label}</button>
            </li>
          ))}
        </ul>
      </nav>

      <Card className="launch-keep flex flex-col gap-4 border-t-4 border-t-brand">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] uppercase text-brand-ink">Launch plan</p>
          <p className="font-display text-[28px] leading-tight font-bold mt-1">{vaName}</p>
          <p className="text-[15px] text-ink-2 mt-1">{placement.title} at {placement.client.name}</p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-sm">
          <div><dt className="text-muted font-semibold">Start date</dt><dd className="font-semibold mt-0.5">{placement.start_date ? fmtDate(placement.start_date, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</dd></div>
          <div><dt className="text-muted font-semibold">Day 1</dt><dd className="font-semibold mt-0.5">{draft.day1 ? fmtDate(draft.day1, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Not set'}</dd></div>
          <div><dt className="text-muted font-semibold">Coach</dt><dd className="font-semibold mt-0.5">{placement.coach.name || 'Not assigned'}</dd></div>
          <div><dt className="text-muted font-semibold">Status</dt><dd className="mt-0.5"><Chip tone={st.tone}>{st.label}</Chip></dd></div>
        </dl>
      </Card>

      <DocSection id="day1" title="Day 1 agenda" icon="clock"
        intro={`${draft.day1 ? fmtDate(draft.day1, { weekday: 'long', month: 'long', day: 'numeric' }) + ', ' : ''}${fmtClock(sched.first)} to ${fmtClock(sched.end)} ${abbr}. About ${fmtDur(sched.total)}, breaks included.`}>
        {agenda.length ? (
          <Card padded={false}>
            <ol>
              {agenda.map((it, i) => {
                const pi = walkProject(it);
                const project = pi !== null ? data.projects[pi] : undefined;
                return (
                  <li key={it.key} className="launch-keep flex items-baseline gap-3 px-4 sm:px-5 py-3 border-t border-line-2 first:border-t-0">
                    <span className="w-[76px] shrink-0 text-[15px] font-semibold tabular-nums whitespace-nowrap">{fmtClock(sched.at[i]!)}</span>
                    <span className="flex-1 min-w-0 text-[15px] leading-snug break-words">
                      {it.title.trim() || 'Untitled item'}
                      {project?.name.trim() && <span className="text-muted"> · {project.name.trim()}</span>}
                      {it.done && <Icon name="check" size={15} className="inline ml-1.5 text-good-2 align-[-2px]" />}
                    </span>
                    <span className="shrink-0 text-sm text-muted tabular-nums">{it.minutes} min</span>
                  </li>
                );
              })}
              <li className="flex items-baseline gap-3 px-4 sm:px-5 py-3 border-t border-line bg-bg rounded-b-2xl">
                <span className="w-[76px] shrink-0 text-[15px] font-semibold tabular-nums whitespace-nowrap">{fmtClock(sched.end)}</span>
                <span className="flex-1 text-[15px] font-semibold">Day 1 wraps up</span>
                <span className="shrink-0 text-sm text-muted tabular-nums">{fmtDur(sched.total)}</span>
              </li>
            </ol>
          </Card>
        ) : <p className="text-[15px] text-muted">The Day 1 agenda isn’t set yet.</p>}
      </DocSection>

      <DocSection id="company" title={SECTION_TITLE.company!} icon={SECTION_ICON.company}>
        <Card><CompanyView c={data.company} /></Card>
      </DocSection>
      <DocSection id="values" title={SECTION_TITLE.values!} icon={SECTION_ICON.values} intro="The principles every team member practices daily.">
        <ValuesView values={data.values} />
      </DocSection>
      <DocSection id="projects" title={SECTION_TITLE.projects!} icon={SECTION_ICON.projects} intro="What matters most right now, broken into small wins with quick steps.">
        <ProjectsView projects={data.projects} />
      </DocSection>
      <DocSection id="checklists" title={SECTION_TITLE.checklists!} icon={SECTION_ICON.checklists} intro="What happens every day and every week, with quick steps for each item.">
        <ChecklistsView lists={data.checklists} />
      </DocSection>
      <DocSection id="tools" title={SECTION_TITLE.tools!} icon={SECTION_ICON.tools} intro="Every tool the role uses, what it’s for, how to get in, and where access stands.">
        <ToolsView tools={data.tools} />
      </DocSection>
      <DocSection id="milestones" title={SECTION_TITLE.milestones!} icon={SECTION_ICON.milestones} intro="The path from probation to promotion: what to reach, when, and what it earns.">
        <Card><SuccessPath milestones={data.milestones} start={placement.start_date} /></Card>
      </DocSection>
      <DocSection id="schedules" title={SECTION_TITLE.schedules!} icon={SECTION_ICON.schedules} intro="What to focus on and when, for each stage.">
        <SchedulesView schedules={data.schedules} />
      </DocSection>
    </article>
  );
}
