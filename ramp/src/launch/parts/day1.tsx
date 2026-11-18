// Day 1: a timed run sheet. Each item opens to show the part of the plan it covers.
import { useEffect, useId, useState } from 'react';
import { LAUNCH_SECTIONS, cx, fmtDate, uid } from '../../lib/util';
import { Button, Card, CardHeader, Checkbox, Chip, EmptyState, Field, Icon, IconButton, Input, LinkButton, Notice, Progress, Select, Textarea, useConfirm } from '../../ui';
import { moved, patchById, useNow } from './kit';
import {
  ACCESS_CHECKS, STAGES, fmtClock, fmtDur, fmtTimer, isAccessTest, isWalk, localTz, sameOffset, schedule, tzPlace, tzShort, validTz, walkProject, zonedInstant,
  type Data, type Draft, type Item, type LaunchSection, type PlacementInfo, type Role, type Tool,
} from './model';
import { ChecklistsView, CompanyView, Empty, ProjectView, ProjectsView, SchedulesView, SuccessPath, ToolsView, ValuesView } from './views';

export interface Day1Props {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  canEdit: boolean;
  role: Role;
  placement: PlacementInfo;
  tz: string;
  template: Item[];
  onStart: () => void;
  onFinish: () => void;
  onReopen: () => void;
  goPrep: (s: LaunchSection) => void;
}

const longDate = (iso: string) => fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' });
function startedText(iso: string, tz: string) {
  const d = new Date(iso);
  try { return `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })} ${tzShort(tz, d)}`; }
  catch { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
}
const localClock = (d: Date) => d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function Day1({ draft, update, canEdit, role, placement, tz, template, onStart, onFinish, onReopen, goPrep }: Day1Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const run = draft.data.run;
  const agenda = draft.agenda;
  const sched = schedule(agenda, run.start);
  const running = draft.status === 'in_progress';
  const now = useNow(running);
  const currentIdx = running ? agenda.findIndex((i) => !i.done) : -1;
  const current = currentIdx >= 0 ? agenda[currentIdx]! : null;
  const since = Math.max(run.started_at ? Date.parse(run.started_at) : 0, ...agenda.filter((i) => i.done && i.done_at).map((i) => Date.parse(i.done_at!) || 0));
  const elapsed = current && since ? now - since : 0;
  const over = !!current && elapsed > current.minutes * 60000;
  const doneCount = agenda.filter((i) => i.done).length;
  const doneMin = agenda.filter((i) => i.done).reduce((n, i) => n + i.minutes, 0);
  const day1 = draft.day1;
  const abbr = tzShort(tz, day1 ? zonedInstant(day1, run.start, tz) : new Date());
  const viewer = localTz();
  const startAt = day1 && validTz(tz) ? zonedInstant(day1, run.start, tz) : null;
  const endAt = startAt ? new Date(startAt.getTime() + sched.total * 60000) : null;
  const showLocal = !!startAt && validTz(viewer) && !sameOffset(tz, viewer, startAt);

  // While Day 1 runs, keep the current item open.
  const currentKey = current?.key;
  useEffect(() => { if (currentKey) setOpen(new Set([currentKey])); }, [currentKey]);

  const setItem = (key: string, patch: Partial<Item>) => update((d) => ({ ...d, agenda: d.agenda.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const tick = (it: Item, v: boolean) => setItem(it.key, { done: v, done_at: v ? new Date().toISOString() : null });
  const setStage = (it: Item, stage: number) => setItem(it.key, stage === 3 && !it.done ? { stage, done: true, done_at: new Date().toISOString() } : { stage });
  const toggleTool = (id: string, field: 'granted' | 'tested', v: boolean) =>
    update((d) => ({ ...d, data: { ...d.data, tools: patchById(d.data.tools, id, (t: Tool) => ({ ...t, [field]: v })) } }));
  const toggleOpen = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const setRun = (patch: Partial<Data['run']>) => update((d) => ({ ...d, data: { ...d.data, run: { ...d.data.run, ...patch } } }));

  const checkinLink = role === 'admin' ? `/admin/placements/${placement.id}` : role === 'coach' ? `/coaching/${placement.id}` : role === 'client' ? '/client' : null;
  const vaFirst = placement.va.name?.split(' ')[0] || 'your team member';

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
          {canEdit ? (
            <Field label="Day 1 date">
              <Input type="date" value={day1 || ''} onChange={(e) => update((d) => ({ ...d, day1: e.target.value || null }))} />
            </Field>
          ) : (
            <Fact label="Day 1" value={day1 ? longDate(day1) : 'Date not set yet'} />
          )}
          {canEdit ? (
            <Field label={`Start time (${abbr})`}>
              <Input type="time" step={300} value={run.start} onChange={(e) => e.target.value && setRun({ start: e.target.value })} />
            </Field>
          ) : (
            <Fact label="Starts" value={`${fmtClock(sched.first)} ${abbr}`} />
          )}
          <Fact label="Ends" value={`${fmtClock(sched.end)} ${abbr}`} hint={`${fmtDur(sched.total)} in total, breaks included`} />
        </div>
        {showLocal && startAt && endAt && (
          <p className="flex gap-2 text-sm text-muted leading-relaxed">
            <Icon name="clock" size={16} className="mt-0.5" />
            <span>Times are in {tzPlace(tz)} time. In your time zone ({tzPlace(viewer)}) that’s {localClock(startAt)} to {localClock(endAt)}.</span>
          </p>
        )}
        {!day1 && canEdit && placement.start_date && (
          <Button variant="secondary" icon="calendar" className="self-start" onClick={() => update((d) => ({ ...d, day1: placement.start_date }))}>Use the start date ({fmtDate(placement.start_date)})</Button>
        )}
        {agenda.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span><strong className="tabular-nums">{doneCount} of {agenda.length}</strong> <span className="text-muted">done</span></span>
              <span className="text-muted tabular-nums">{fmtDur(doneMin)} of {fmtDur(sched.total)}</span>
            </div>
            <Progress value={agenda.length ? (doneCount / agenda.length) * 100 : 0} tone={doneCount === agenda.length ? 'good' : 'brand'} label="Day 1 progress" />
          </div>
        )}
        {canEdit && (draft.status === 'preparing' || draft.status === 'ready') && agenda.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="primary" size="lg" icon="play" onClick={onStart}>Start Day 1</Button>
            <p className="text-sm text-muted leading-relaxed flex-1 basis-56">Starting runs a timer for each item, so you can see if you’re ahead or behind.</p>
          </div>
        )}
        {running && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-sm text-ink-2"><Chip tone="brand" icon="clock">Underway</Chip>{run.started_at && <span className="ml-2 text-muted">Started {startedText(run.started_at, tz)}</span>}</p>
            {canEdit && <Button variant="success" icon="check" onClick={onFinish}>Finish Day 1</Button>}
          </div>
        )}
        {!canEdit && draft.status === 'ready' && <Notice icon="sparkle">Here’s what your first day looks like. Tap any item to see what it covers.</Notice>}
      </Card>

      {draft.status === 'done' && (
        <Card className="flex flex-col gap-3 border-good-soft">
          <CardHeader title="Day 1 is done. Nice work."
            subtitle={canEdit
              ? 'While it’s fresh, record a quick check-in: what went well, and what to work on next.'
              : 'Great first day. Keep the plan handy: your checklists, tools and milestones are all here.'} />
          <div className="flex flex-wrap gap-2">
            {canEdit && checkinLink && (
              <LinkButton to={checkinLink} variant="primary" icon="pen">{role === 'client' ? 'Share how it went' : 'Record a check-in'}</LinkButton>
            )}
            {canEdit && <Button variant="ghost" icon="replay" onClick={onReopen}>Reopen Day 1</Button>}
          </div>
        </Card>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-line">
          <h2 className="font-display text-lg font-semibold">Agenda</h2>
          {canEdit && (agenda.length > 0 || editing) && (
            <Button variant={editing ? 'primary' : 'secondary'} icon={editing ? 'check' : 'pen'} onClick={() => setEditing(!editing)}>{editing ? 'Done editing' : 'Edit agenda'}</Button>
          )}
        </div>
        {editing ? (
          <AgendaEditor agenda={agenda} template={template} onChange={(a) => update((d) => ({ ...d, agenda: a }))} />
        ) : !agenda.length ? (
          <EmptyState icon="clock" title="No agenda yet"
              body={canEdit ? 'Start from the standard Day 1 agenda and adjust it, or build your own.' : 'Your client hasn’t set the Day 1 agenda yet.'}
              action={canEdit && (
                <div className="flex flex-wrap justify-center gap-2">
                  {template.length > 0 && <Button variant="primary" onClick={() => update((d) => ({ ...d, agenda: template.map((t) => ({ ...t })) }))}>Use the standard agenda</Button>}
                  <Button icon="plus" onClick={() => setEditing(true)}>Build my own</Button>
                </div>
              )} />
        ) : (
          <ol>
            {agenda.map((it, idx) => (
              <AgendaRow key={it.key} it={it} at={sched.at[idx]!} abbr={abbr} open={open.has(it.key)} onToggle={() => toggleOpen(it.key)}
                isCurrent={idx === currentIdx} elapsed={idx === currentIdx ? elapsed : 0} over={idx === currentIdx && over}
                canEdit={canEdit} data={draft.data} start={placement.start_date}
                onTick={(v) => tick(it, v)} onNotes={(v) => setItem(it.key, { notes: v })} onStage={(n) => setStage(it, n)}
                onChecks={(c) => setItem(it.key, { checks: c })} onTool={toggleTool} goPrep={goPrep} />
            ))}
          </ol>
        )}
      </Card>

      {running && canEdit && !editing && (
        <div className="launch-noprint sticky z-20 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-4 -mx-4 md:mx-0 px-4 py-3 bg-ink text-white md:rounded-2xl shadow-lg" role="status" aria-live="off">
          {current ? (
            <div className="flex items-center gap-3">
              <button type="button" className="min-w-0 flex-1 text-left cursor-pointer min-h-11" aria-label={`Show the current item: ${current.title || 'Untitled item'}`}
                onClick={() => document.getElementById(`agenda-${current.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <span className="block text-xs text-white/70">Now · planned {fmtClock(sched.at[currentIdx]!)} · {current.minutes} min</span>
                <span className="block text-[15px] font-semibold truncate">{current.title || 'Untitled item'}</span>
              </button>
              <span className={cx('font-display text-xl font-bold tabular-nums', over && 'text-amber')} aria-label={`Time on this item: ${fmtTimer(elapsed)}`}>{fmtTimer(elapsed)}</span>
              <Button variant="success" icon="check" onClick={() => tick(current, true)}>Done</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-[15px] font-semibold">Everything’s ticked off. Ready to wrap up?</p>
              <Button variant="success" icon="check" onClick={onFinish}>Finish Day 1</Button>
            </div>
          )}
        </div>
      )}
      {!canEdit && draft.status !== 'done' && (
        <p className="text-sm text-muted text-center">Questions about Day 1? Ask {role === 'va' ? 'your client or coach' : vaFirst}.</p>
      )}
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      <span className="text-[17px] font-semibold tabular-nums leading-snug">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function StageBars({ stage }: { stage: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
      <span className="inline-flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className={cx('w-4 h-1.5 rounded-full', stage > i ? 'bg-good-2' : 'bg-line')} />)}
      </span>
      {stage >= 3 ? 'All stages done' : `Next: ${STAGES[stage]!.label.toLowerCase()}`}
    </span>
  );
}

function AgendaRow({ it, at, abbr, open, onToggle, isCurrent, elapsed, over, canEdit, data, start, onTick, onNotes, onStage, onChecks, onTool, goPrep }: {
  it: Item; at: number; abbr: string; open: boolean; onToggle: () => void; isCurrent: boolean; elapsed: number; over: boolean; canEdit: boolean;
  data: Data; start: string | null; onTick: (v: boolean) => void; onNotes: (v: string) => void; onStage: (n: number) => void;
  onChecks: (c: string[]) => void; onTool: (id: string, f: 'granted' | 'tested', v: boolean) => void; goPrep: (s: LaunchSection) => void;
}) {
  const id = useId();
  const walk = isWalk(it);
  const pi = walkProject(it);
  const project = pi !== null ? data.projects[pi] : undefined;
  const isBreak = !it.section && /break|lunch/i.test(it.title);
  const title = it.title.trim() || 'Untitled item';
  return (
    <li id={`agenda-${it.key}`} className={cx('border-t border-line-2 first:border-t-0 scroll-mt-[132px] md:scroll-mt-24', isCurrent && 'bg-brand-soft', isBreak && !isCurrent && 'bg-bg')}>
      <div className="flex items-stretch">
        {canEdit ? (
          <button type="button" role="checkbox" aria-checked={it.done} aria-label={`${title}: done`} onClick={() => onTick(!it.done)}
            className="w-14 shrink-0 flex justify-center pt-4 cursor-pointer">
            <span className={cx('w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors', it.done ? 'bg-good-2 border-good-2 text-white' : 'bg-white border-field')}>
              {it.done && <Icon name="check" size={15} strokeWidth={3} />}
            </span>
          </button>
        ) : (
          <span className="w-14 shrink-0 flex justify-center pt-4" aria-hidden="true">
            <span className={cx('w-6 h-6 rounded-full flex items-center justify-center', it.done ? 'bg-good-2 text-white' : 'border-2 border-line bg-white')}>
              {it.done && <Icon name="check" size={14} strokeWidth={3} />}
            </span>
          </span>
        )}
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}
          className="flex-1 min-w-0 flex items-start gap-3 py-3.5 pr-3 sm:pr-4 text-left cursor-pointer">
          <span className="hidden sm:flex w-[76px] shrink-0 flex-col pt-px">
            <span className="text-[15px] font-semibold tabular-nums">{fmtClock(at)}</span>
            <span className="text-xs text-muted tabular-nums">{it.minutes} min</span>
          </span>
          <span className="min-w-0 flex-1 flex flex-col gap-1">
            <span className="sm:hidden text-[13px] font-semibold text-muted tabular-nums">{fmtClock(at)} · {it.minutes} min</span>
            <span className={cx('text-[15px] font-semibold leading-snug break-words', it.done && 'text-muted line-through decoration-1')}>
              {title}{it.done && <span className="sr-only"> (done)</span>}
            </span>
            {(isCurrent || walk || project || it.notes.trim()) && (
              <span className="flex flex-wrap gap-x-3 gap-y-1 items-center">
                {isCurrent && <Chip tone={over ? 'warn' : 'brand'} icon="clock">Now · {fmtTimer(elapsed)} of {it.minutes} min</Chip>}
                {project && <span className="text-[13px] text-ink-2 font-semibold">{project.name.trim() || `Project ${pi === 0 ? 'A' : 'B'}`}</span>}
                {walk && <StageBars stage={it.stage} />}
                {it.notes.trim() && !open && <span className="inline-flex items-center gap-1 text-[13px] text-muted"><Icon name="notes" size={14} />Notes</span>}
              </span>
            )}
          </span>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} className="text-muted mt-1" />
        </button>
      </div>
      {open && (
        <div id={id} className="pl-4 sm:pl-14 pr-4 sm:pr-5 pb-5 flex flex-col gap-4">
          {walk && <WalkTracker stage={it.stage} onSet={canEdit ? onStage : undefined} />}
          {isAccessTest(it) && <AccessChecks checks={it.checks} onChange={canEdit ? onChecks : undefined} />}
          <SectionContent it={it} data={data} start={start} canEdit={canEdit} onTool={onTool} goPrep={goPrep} isBreak={isBreak} />
          {canEdit ? (
            <Field label="Notes">
              <Textarea rows={2} value={it.notes} onChange={(e) => onNotes(e.target.value)} placeholder="e.g. Needs another look at the tagging rules tomorrow." />
            </Field>
          ) : it.notes.trim() ? (
            <div className="rounded-xl bg-bg px-3.5 py-3"><p className="text-[13px] font-bold text-ink-2">Notes</p><p className="text-[15px] text-ink-2 whitespace-pre-line">{it.notes}</p></div>
          ) : null}
          {canEdit && isCurrent && (
            <Button variant="success" icon="check" className="self-start" onClick={() => onTick(true)}>Done, on to the next item</Button>
          )}
          <span className="sr-only">Planned for {fmtClock(at)} {abbr}.</span>
        </div>
      )}
    </li>
  );
}

function WalkTracker({ stage, onSet }: { stage: number; onSet?: (n: number) => void }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-3.5 flex flex-col gap-3">
      <p className="text-[13px] font-bold text-ink-2">Show, then guide, then supervise</p>
      <ol className="grid grid-cols-3 gap-2">
        {STAGES.map((s, i) => {
          const done = stage > i;
          const next = stage === i;
          return (
            <li key={s.label}>
              <button type="button" disabled={!onSet} aria-pressed={done} onClick={() => onSet?.(done ? i : i + 1)}
                className={cx('w-full min-h-[76px] rounded-xl border-2 px-1.5 py-2 flex flex-col items-center justify-center gap-1.5 text-center disabled:cursor-default',
                  done ? 'bg-good-soft border-good-2 text-good' : next ? 'bg-brand-soft border-brand text-brand-ink' : 'bg-white border-line text-muted', onSet && 'cursor-pointer')}>
                <span className={cx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold', done ? 'bg-good-2 text-white' : next ? 'bg-brand text-white' : 'bg-chip')}>
                  {done ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}
                </span>
                <span className="text-sm font-bold">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-ink-2 leading-relaxed">
        {stage >= 3 ? 'All three stages done. They can do this on their own now.' : <><strong>{STAGES[stage]!.label}:</strong> {STAGES[stage]!.desc}{onSet && ' Tap it when it’s done.'}</>}
      </p>
    </div>
  );
}

function AccessChecks({ checks, onChange }: { checks: string[]; onChange?: (c: string[]) => void }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-3.5 pt-3 pb-1.5">
      <p className="text-[13px] font-bold text-ink-2">Try each of these together · {checks.filter((c) => ACCESS_CHECKS.includes(c)).length} of {ACCESS_CHECKS.length}</p>
      <ul className="grid sm:grid-cols-2 gap-x-4">
        {ACCESS_CHECKS.map((c) => (
          <li key={c}>
            <Checkbox checked={checks.includes(c)} disabled={!onChange} label={c}
              onChange={(v) => onChange?.(v ? [...checks, c] : checks.filter((x) => x !== c))} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionContent({ it, data, start, canEdit, onTool, goPrep, isBreak }: {
  it: Item; data: Data; start: string | null; canEdit: boolean; onTool: (id: string, f: 'granted' | 'tested', v: boolean) => void; goPrep: (s: LaunchSection) => void; isBreak: boolean;
}) {
  const s = it.section;
  if (!s) return isBreak ? <Empty>Step away from the screen for a few minutes. A real break makes the afternoon go better.</Empty> : null;
  const label = LAUNCH_SECTIONS.find((x) => x.id === s)!.label;
  const empty: Record<LaunchSection, boolean> = {
    company: !(data.company.summary.trim() || data.company.public_info.trim() || data.company.admin_info.trim() || data.company.presentation_url.trim() || data.company.files.length),
    values: !data.values.length, projects: !data.projects.length, checklists: !data.checklists.length,
    tools: !data.tools.length, milestones: !data.milestones.length, schedules: !data.schedules.some((x) => x.blocks.length),
  };
  const pi = walkProject(it);
  const project = pi !== null ? data.projects[pi] : undefined;
  let body;
  if (empty[s]) {
    body = (
      <div className="rounded-2xl border border-dashed border-line px-4 py-4 flex flex-col gap-2 items-start">
        <p className="text-[15px] text-muted">{label} isn’t filled in yet.</p>
        {canEdit && <Button variant="secondary" icon="pen" onClick={() => goPrep(s)}>Add it in Prepare</Button>}
      </div>
    );
  } else if (s === 'company') body = <CompanyView c={data.company} />;
  else if (s === 'values') body = <ValuesView values={data.values} />;
  else if (s === 'projects') {
    body = project ? <ProjectView p={project} label={`Big project ${pi === 0 ? 'A' : 'B'}`} />
      : pi !== null ? <Empty>There’s no {pi === 0 ? 'first' : 'second'} project in the plan yet, so use this time on the others below.</Empty>
      : <ProjectsView projects={data.projects} />;
    if (pi !== null && !project) body = <div className="flex flex-col gap-3">{body}<ProjectsView projects={data.projects} /></div>;
  }
  else if (s === 'checklists') body = <ChecklistsView lists={data.checklists} />;
  else if (s === 'tools') body = <ToolsView tools={data.tools} onToggle={canEdit ? onTool : undefined} show={it.key === 'access' ? 'granted' : isAccessTest(it) ? 'tested' : 'both'} />;
  else if (s === 'milestones') body = <SuccessPath milestones={data.milestones} start={start} />;
  else body = <SchedulesView schedules={data.schedules} />;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-muted">From the plan: {label}</p>
        {canEdit && !empty[s] && (
          <button type="button" onClick={() => goPrep(s)} className="min-h-10 px-2 -mr-2 rounded-lg text-[13px] font-semibold text-brand-ink hover:bg-brand-soft cursor-pointer">Edit</button>
        )}
      </div>
      {body}
    </div>
  );
}

// ───────── editing the agenda for this placement ─────────

function AgendaEditor({ agenda, template, onChange }: { agenda: Item[]; template: Item[]; onChange: (a: Item[]) => void }) {
  const { confirm, dialog } = useConfirm();
  const [fresh, setFresh] = useState('');
  const put = (key: string, patch: Partial<Item>) => onChange(agenda.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const add = () => {
    const it: Item = { key: `custom_${uid()}`, title: '', minutes: 15, section: null, done: false, notes: '', done_at: null, stage: 0, checks: [] };
    setFresh(it.key);
    onChange([...agenda, it]);
  };
  const remove = async (it: Item) => {
    if (it.title.trim() && !(await confirm({ title: `Remove “${it.title.trim()}”?`, body: 'It comes off this placement’s Day 1 agenda, with any notes on it.', action: 'Remove item', danger: true }))) return;
    onChange(agenda.filter((x) => x.key !== it.key));
  };
  const reset = async () => {
    if (await confirm({ title: 'Go back to the standard agenda?', body: 'This replaces the agenda for this placement. Ticks and notes on the current agenda are cleared.', action: 'Use the standard agenda', danger: true })) {
      onChange(template.map((t) => ({ ...t })));
    }
  };
  const total = agenda.reduce((n, i) => n + i.minutes, 0);
  return (
    <div className="flex flex-col">
      <p className="px-4 sm:px-5 pt-3.5 text-sm text-muted leading-relaxed">
        Changes apply to this placement only. Link an item to a section to show that part of the plan when you open it on Day 1. Total: <strong className="text-ink">{fmtDur(total)}</strong>.
      </p>
      <ol className="mt-2">
        {agenda.map((it, i) => (
          <li key={it.key} className="border-t border-line-2 first:border-t-0 px-4 sm:px-5 py-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="w-7 h-7 rounded-full bg-brand-soft text-brand-ink text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">{i + 1}</span>
              <Input aria-label={`Item ${i + 1} title`} value={it.title} autoFocus={fresh === it.key} placeholder="e.g. Shadow a client call" onChange={(e) => put(it.key, { title: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:pl-9">
              <label className="flex items-center gap-2 text-sm text-muted">
                <span className="w-20"><Input type="number" inputMode="numeric" min={0} max={600} step={5} value={it.minutes}
                  aria-label={`Minutes for item ${i + 1}`}
                  onChange={(e) => put(it.key, { minutes: Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0))) })} /></span>
                min
              </label>
              <div className="flex-1 min-w-[11rem]">
                <Select aria-label={`Part of the plan item ${i + 1} shows`} value={it.section || ''} onChange={(e) => put(it.key, { section: (e.target.value || null) as LaunchSection | null })}>
                  <option value="">No linked section</option>
                  {LAUNCH_SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
              </div>
              <span className="flex items-center ml-auto">
                <IconButton icon="chevronUp" label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => onChange(moved(agenda, i, -1))} />
                <IconButton icon="chevronDown" label={`Move item ${i + 1} down`} disabled={i === agenda.length - 1} onClick={() => onChange(moved(agenda, i, 1))} />
                <IconButton icon="trash" label={`Remove item ${i + 1}`} className="text-bad" onClick={() => remove(it)} />
              </span>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2 px-4 sm:px-5 py-4 border-t border-line-2">
        <Button icon="plus" onClick={add}>Add an item</Button>
        {template.length > 0 && <Button variant="ghost" icon="replay" onClick={reset}>Use the standard agenda</Button>}
      </div>
      {!agenda.length && <p className="px-4 sm:px-5 pb-4 text-sm text-muted">No items yet. Add one to get started.</p>}
      {dialog}
    </div>
  );
}
