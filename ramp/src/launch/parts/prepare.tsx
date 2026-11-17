// Prepare: a step-by-step wizard through the owner's prep list, then a readiness review.
import { useEffect, useRef, type ReactNode } from 'react';
import { LAUNCH_SECTIONS, cx, fmtDate, plural } from '../../lib/util';
import { Button, Card, CardHeader, Chip, Field, Icon, Input, Notice, Progress } from '../../ui';
import { CompanyStep, ChecklistsStep, MilestonesStep, ProjectsStep, SchedulesStep, ToolsStep, ValuesStep, type StepProps } from './sections';
import {
  SECTION_ICON, STEP_IDS, gapsFor, hasContent, readiness, sectionOf, fmtDur, tzShort,
  type Data, type Draft, type LaunchSection, type PlacementInfo, type SectionState, type StepId,
} from './model';

const TIPS: Record<LaunchSection, string> = {
  company: 'Write it like you’d explain the business to a friend. Short is fine.',
  values: 'Three to five is plenty. Think about what you praise people for.',
  projects: 'Start with the two or three projects that matter most right now.',
  checklists: 'If it happens every day or every week, it belongs here. Quick steps make it repeatable.',
  tools: 'This is also the access log. Switch on “granted” and “tested” as you go, here or on Day 1.',
  milestones: 'Set a day for each one, counted from the start date. The success path draws itself.',
  schedules: 'Training weeks are usually lighter, with more time to learn and ask questions.',
};

const EDITORS: Record<LaunchSection, (p: StepProps) => ReactNode> = {
  company: CompanyStep, values: ValuesStep, projects: ProjectsStep, checklists: ChecklistsStep,
  tools: ToolsStep, milestones: MilestonesStep, schedules: SchedulesStep,
};

function Editor({ id, ...p }: StepProps & { id: LaunchSection }) {
  const E = EDITORS[id];
  return id === 'company' ? <Card><E {...p} /></Card> : <E {...p} />;
}

const labelOf = (id: StepId) => (id === 'review' ? 'Review and share' : sectionOf(id).label);

function StateDot({ state, n, active }: { state: SectionState | 'review'; n: number; active?: boolean }) {
  if (state === 'complete') {
    return <span className="relative w-7 h-7 rounded-full bg-good-2 text-white flex items-center justify-center shrink-0"><Icon name="check" size={15} strokeWidth={2.6} /><span className="sr-only">Done</span></span>;
  }
  return (
    <span className={cx('relative w-7 h-7 rounded-full border-2 text-xs font-bold flex items-center justify-center shrink-0 tabular-nums',
      state === 'started' ? 'border-amber text-warn bg-warn-soft' : active ? 'border-brand text-brand-ink bg-white' : 'border-line text-muted bg-white')}>
      {state === 'review' ? <Icon name="send" size={13} /> : n}
      {state === 'started' && <span className="sr-only">, started</span>}
    </span>
  );
}

export interface PrepareProps {
  draft: Draft;
  setData: (fn: (d: Data) => Data) => void;
  setDay1: (v: string | null) => void;
  setStart: (v: string) => void;
  placement: PlacementInfo;
  tz: string;
  step: StepId;
  setStep: (s: StepId) => void;
  onReady: () => void;
  onUnready: () => void;
  goDay1: () => void;
  saveNote: ReactNode;
  vaFirst: string;
}

export function Prepare(props: PrepareProps) {
  const { draft, setData, placement, step, setStep, onReady, goDay1, saveNote } = props;
  const r = readiness(draft.data);
  const idx = STEP_IDS.indexOf(step);
  const headRef = useRef<HTMLHeadingElement>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const shown = useRef(step);
  const done = Object.values(r.states).filter((s) => s === 'complete').length;

  // On a step change: bring the step's heading into view and focus, and scroll the phone rail to its chip.
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    const h = headRef.current;
    if (h) { h.focus({ preventScroll: true }); h.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }, [step]);
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>('[aria-current="step"]');
    const box = rail?.parentElement;
    if (chip && box) box.scrollTo({ left: chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
  }, [step]);

  const go = (id: StepId) => setStep(id);
  const next = STEP_IDS[idx + 1];
  const prev = STEP_IDS[idx - 1];
  const stateOf = (id: StepId): SectionState | 'review' => (id === 'review' ? 'review' : r.states[id]);

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="font-display text-[28px] leading-tight font-bold tabular-nums">{r.pct}% ready</p>
          <p className="text-sm text-muted">{done} of {plural(LAUNCH_SECTIONS.length, 'section')} complete</p>
        </div>
        <Progress value={r.pct} tone={r.pct === 100 ? 'good' : 'brand'} label="Launch plan readiness" />
        <p className="text-sm text-muted leading-relaxed">Your answers save as you go, so you can stop and come back any time.</p>
      </Card>

      {r.pct === 0 && step === 'company' && (
        <Notice icon="sparkle">
          <strong>No need to have anything on paper.</strong> Go one section at a time and answer in your own words. Every box shows an example of what to write.
          Rough notes are fine. You can polish them later.
        </Notice>
      )}

      <div className="lg:grid lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-6 lg:items-start">
        {/* Section rail: a list on wide screens, a row of chips on phones. */}
        <nav aria-label="Sections" className="hidden lg:block sticky top-24">
          <ol className="flex flex-col gap-0.5">
            {STEP_IDS.map((id, i) => (
              <li key={id}>
                <button type="button" onClick={() => go(id)} aria-current={id === step ? 'step' : undefined}
                  className={cx('w-full flex items-center gap-3 min-h-11 px-2.5 py-1.5 rounded-xl text-left text-[15px] font-semibold cursor-pointer',
                    id === step ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-chip')}>
                  <StateDot state={stateOf(id)} n={i + 1} active={id === step} />
                  <span className="min-w-0 leading-snug">{labelOf(id)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="relative lg:hidden -mx-4 md:-mx-8 px-4 md:px-8 overflow-x-auto scrollbar-none mb-4">
          <ol ref={railRef} aria-label="Sections" className="flex gap-2 w-max pb-1">
            {STEP_IDS.map((id, i) => (
              <li key={id}>
                <button type="button" onClick={() => go(id)} aria-current={id === step ? 'step' : undefined}
                  className={cx('flex items-center gap-2 min-h-11 pl-1.5 pr-3.5 rounded-full border text-sm font-semibold whitespace-nowrap cursor-pointer',
                    id === step ? 'bg-brand-soft border-brand-2 text-brand-ink' : 'bg-white border-line text-ink-2')}>
                  <StateDot state={stateOf(id)} n={i + 1} active={id === step} />
                  {labelOf(id)}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <section aria-labelledby="launch-step-title" className="flex flex-col gap-4">
            <header className="flex flex-col gap-1.5">
              <p className="text-xs font-bold tracking-[0.08em] uppercase text-brand-ink">Step {idx + 1} of {STEP_IDS.length}</p>
              <h2 id="launch-step-title" ref={headRef} tabIndex={-1} className="font-display text-2xl font-bold leading-tight outline-none scroll-mt-[132px] md:scroll-mt-24 flex items-center gap-2.5">
                <Icon name={SECTION_ICON[step]} size={22} className="text-brand-ink" />{labelOf(step)}
              </h2>
              {step !== 'review' ? (
                <>
                  <p className="text-[15px] text-ink-2 leading-relaxed max-w-2xl">{sectionOf(step).prep}</p>
                  <p className="text-sm text-muted leading-relaxed max-w-2xl">{TIPS[step]}</p>
                  <UsedOn id={step} draft={draft} />
                </>
              ) : (
                <p className="text-[15px] text-ink-2 leading-relaxed max-w-2xl">Check what’s still missing, pick the Day 1 date, then share the plan with {props.vaFirst}.</p>
              )}
            </header>
            {step === 'review' ? <Review {...props} /> : <Editor key={step} id={step} data={draft.data} set={setData} placementId={placement.id} start={placement.start_date} />}
            {step !== 'review' && <SectionCheck id={step} data={draft.data} />}
          </section>

          {/* Back and next: sticky above the phone tab bar, and at the bottom of the window on wide screens. */}
          <div className="launch-noprint sticky z-20 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-4 -mx-4 md:mx-0 px-4 md:px-3 py-3 md:py-2.5 bg-bg/95 backdrop-blur border-t border-line md:border md:rounded-2xl md:bg-white/95 md:shadow-sm">
            <div className="flex items-center gap-2.5">
              <Button icon="chevronLeft" disabled={!prev} onClick={() => prev && go(prev)} aria-label={prev ? `Back to ${labelOf(prev)}` : 'Back'}>Back</Button>
              <span className="hidden sm:flex flex-1 justify-center text-[13px] text-muted">{saveNote}</span>
              {next ? (
                <Button variant="primary" iconRight="chevronRight" className="flex-1 sm:flex-none min-w-0" onClick={() => go(next)}>
                  <span className="truncate">Next: {labelOf(next)}</span>
                </Button>
              ) : draft.status === 'preparing' ? (
                <Button variant="primary" icon="check" className="flex-1 sm:flex-none" onClick={onReady}>Mark ready</Button>
              ) : (
                <Button variant="primary" iconRight="chevronRight" className="flex-1 sm:flex-none" onClick={goDay1}>Go to Day 1</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where this section shows up in the Day 1 agenda. */
function UsedOn({ id, draft }: { id: LaunchSection; draft: Draft }) {
  const items = draft.agenda.filter((i) => i.section === id);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-[13px] font-semibold text-muted mr-0.5">Used on Day 1 for</span>
      {items.map((i) => <Chip key={i.key} icon="clock">{i.title} · {i.minutes} min</Chip>)}
    </div>
  );
}

/** What's still missing in this section, once it's started. */
function SectionCheck({ id, data }: { id: LaunchSection; data: Data }) {
  if (!hasContent(id, data)) return null;
  const gaps = gapsFor(id, data);
  const hard = gaps.filter((g) => !g.soft);
  const soft = gaps.filter((g) => g.soft);
  return (
    <div className="flex flex-col gap-2">
      {hard.length ? (
        <div className="rounded-2xl bg-warn-soft px-4 py-3.5" role="status">
          <p className="text-sm font-bold text-warn">Still to fill in</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {hard.map((g) => <li key={g.text} className="text-sm text-warn leading-relaxed flex gap-2"><span aria-hidden="true">•</span>{g.text}</li>)}
          </ul>
        </div>
      ) : (
        <Notice tone="good" icon="check">This section is complete. Nice work.</Notice>
      )}
      {soft.map((g) => <p key={g.text} className="text-sm text-muted leading-relaxed flex gap-2"><Icon name="info" size={16} className="mt-0.5" />{g.text}</p>)}
    </div>
  );
}

function Review({ draft, setDay1, setStart, placement, tz, onReady, onUnready, goDay1, setStep, vaFirst }: PrepareProps) {
  const r = readiness(draft.data);
  const bySection = LAUNCH_SECTIONS.map((s) => ({ s, gaps: r.gaps.filter((g) => g.section === s.id) })).filter((x) => x.gaps.length);
  const total = draft.agenda.reduce((n, i) => n + i.minutes, 0);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <CardHeader title="Readiness check"
          subtitle={r.gaps.length
            ? `${plural(r.gaps.length, 'thing')} still to fill in. You can mark the plan ready anyway and keep editing after.`
            : 'Everything is filled in. Your assistant is going to have a great start.'} />
        {r.gaps.length === 0 && <Notice tone="good" icon="check">All seven sections are complete.</Notice>}
        {bySection.length > 0 && (
          <ul className="flex flex-col divide-y divide-line-2 -mx-1">
            {bySection.map(({ s, gaps }) => (
              <li key={s.id} className="flex items-start gap-3 py-3 px-1 first:pt-0 last:pb-0">
                <span className="w-9 h-9 rounded-xl bg-warn-soft text-warn flex items-center justify-center shrink-0"><Icon name={SECTION_ICON[s.id]} size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[15px]">{s.label}</p>
                  <ul className="mt-0.5 flex flex-col gap-0.5">
                    {gaps.map((g) => <li key={g.text} className="text-sm text-ink-2 leading-relaxed">{g.text}</li>)}
                  </ul>
                </div>
                <Button size="md" variant="ghost" iconRight="chevronRight" onClick={() => setStep(s.id)} aria-label={`Fix ${s.label}`}>Fix</Button>
              </li>
            ))}
          </ul>
        )}
        {(r.notes.length > 0 || !draft.day1) && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-bg px-3.5 py-3">
            <p className="text-[13px] font-bold text-ink-2">Good to know</p>
            {!draft.day1 && <p className="text-sm text-muted leading-relaxed">There’s no Day 1 date yet. Pick one below.</p>}
            {r.notes.map((g) => <p key={g.text} className="text-sm text-muted leading-relaxed">{g.text}</p>)}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader title="Day 1" subtitle={`The agenda has ${draft.agenda.length} items and takes about ${fmtDur(total)}, breaks included.`} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day 1 date" hint={placement.start_date ? `${vaFirst}’s start date is ${fmtDate(placement.start_date, { weekday: 'short', month: 'short', day: 'numeric' })}.` : 'Usually the start date.'}>
            <Input type="date" value={draft.day1 || ''} onChange={(e) => setDay1(e.target.value || null)} />
          </Field>
          <Field label={`Start time (${tzShort(tz)})`} hint="Agenda times count from here.">
            <Input type="time" step={300} value={draft.data.run.start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </Field>
        </div>
        {!draft.day1 && placement.start_date && (
          <Button variant="secondary" icon="calendar" className="self-start" onClick={() => setDay1(placement.start_date)}>Use the start date</Button>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        {draft.status === 'preparing' ? (
          <>
            <CardHeader title={`Share the plan with ${vaFirst}`} subtitle={`Once it’s ready, ${vaFirst} can read the whole plan before Day 1. You can keep editing after.`} />
            <Button variant="primary" size="lg" icon="check" className="self-start" onClick={onReady}>Mark ready and share</Button>
          </>
        ) : (
          <>
            <Notice tone="good" icon="check">The plan is ready. {vaFirst} can read it now, and any changes you make show up for them too.</Notice>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" iconRight="chevronRight" onClick={goDay1}>Go to Day 1</Button>
              {draft.status === 'ready' && <Button variant="ghost" icon="eyeOff" onClick={onUnready}>Hide it from {vaFirst} for now</Button>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
