// The Prepare wizard's section editors. Every field shows an example so nobody starts from a blank page.
import { useId, useState, type ReactNode } from 'react';
import { DAY_NAMES, cx, fmtDate, plural, uid } from '../../lib/util';
import { Chip, Field, IconButton, Input, Notice, Pills, Switch, Textarea, useConfirm, Button } from '../../ui';
import { AddButton, ExampleBox, FilesField, Fold, LinksEditor, MoveBar, StepsEditor, moved, patchById } from './kit';
import {
  COMMON_TOOLS, PERIODS, PRIORITY, SCOPE, STARTER_MILESTONES, STARTER_WEEK, daysText, hasSteps, milestoneDate, newSteps, parseDays, toMin,
  type Block, type Company, type Data, type Milestone, type Period, type Project, type Steps, type Tool,
} from './model';
import { SuccessPath, WeekSchedule } from './views';

export interface StepProps {
  data: Data;
  set: (fn: (d: Data) => Data) => void;
  placementId: string;
  /** The placement's start date. */
  start: string | null;
}

/** Ask before deleting anything that has content. */
function useRemove() {
  const { confirm, dialog } = useConfirm();
  const ask = async (what: string, filled: boolean, run: () => void) => {
    if (!filled || await confirm({ title: `Delete ${what}?`, body: 'It will be removed from the launch plan for everyone.', action: 'Delete', danger: true })) run();
  };
  return { ask, dialog };
}

const Num = ({ n }: { n: number | string }) => (
  <span aria-hidden="true" className="w-8 h-8 rounded-full bg-brand-soft text-brand-ink text-[13px] font-bold flex items-center justify-center shrink-0 tabular-nums">{n}</span>
);

function Label({ children, id }: { children: ReactNode; id?: string }) {
  return <span id={id} className="text-[13px] font-semibold text-ink-2">{children}</span>;
}

// ───────── company ─────────

export function CompanyStep({ data, set, placementId }: StepProps) {
  const c = data.company;
  const put = (patch: Partial<Company>) => set((d) => ({ ...d, company: { ...d.company, ...patch } }));
  return (
    <div className="flex flex-col gap-5">
      <Field label="In a few sentences, what does the company do?" hint="Who you help, what you offer, and what makes you different.">
        <Textarea rows={4} value={c.summary} onChange={(e) => put({ summary: e.target.value })}
          placeholder="e.g. We run three family dental clinics in Austin. Most patients find us on Google and book by phone." />
      </Field>
      <Field label="What anyone can know" hint="Public info: website, services, customers, how people find you.">
        <Textarea rows={5} value={c.public_info} onChange={(e) => put({ public_info: e.target.value })}
          placeholder={'e.g. Website: brightsmile.com\nServices: checkups, cleanings, braces\nCustomers: local families'} />
      </Field>
      <Field label="Inside info for the team" hint="Who’s who, who to ask for what, how decisions get made, and policies to know. Only people on this placement can see it.">
        <Textarea rows={5} value={c.admin_info} onChange={(e) => put({ admin_info: e.target.value })}
          placeholder={'e.g. Dr. Lee approves spending over $200.\nAsk Maria about bookings.\nReply to patients within 2 hours.'} />
      </Field>
      <Field label="Link to a presentation or video (optional)" hint="Slides, a screen recording, or a page that walks through the company.">
        <Input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" value={c.presentation_url}
          onChange={(e) => put({ presentation_url: e.target.value })} placeholder="e.g. https://docs.google.com/presentation/…" />
      </Field>
      <FilesField label="Files (optional)" hint="Slides, a handbook, an org chart. Up to 25 MB each." files={c.files} placementId={placementId}
        onAdd={(f) => set((d) => ({ ...d, company: { ...d.company, files: [...d.company.files, ...f] } }))}
        onRemove={(path) => set((d) => ({ ...d, company: { ...d.company, files: d.company.files.filter((x) => x.path !== path) } }))} />
    </div>
  );
}

// ───────── values ─────────

const VALUE_EX = [
  { title: 'Own the outcome', practice: 'When something slips, say so early and bring a fix.' },
  { title: 'Reply fast, even to say “on it”', practice: 'Check messages at the top of every hour. Answer within 15 minutes during work hours.' },
  { title: 'Leave it better than you found it', practice: 'Fix one small thing in a document or process every day.' },
  { title: 'Ask before guessing', practice: 'If you’re not sure, ask in the team chat. A quick question beats a redo.' },
];

export function ValuesStep({ data, set }: StepProps) {
  const [fresh, setFresh] = useState('');
  const { ask, dialog } = useRemove();
  const put = (id: string, patch: Partial<Data['values'][number]>) => set((d) => ({ ...d, values: patchById(d.values, id, patch) }));
  const add = () => { const id = uid(); setFresh(id); set((d) => ({ ...d, values: [...d.values, { id, title: '', practice: '' }] })); };
  return (
    <div className="flex flex-col gap-3">
      {!data.values.length && (
        <ExampleBox title="No values yet. Three to five is plenty.">
          Think about what you praise people for. For example: <strong className="text-ink">Own the outcome</strong>. Every day: “When something slips, say so early and bring a fix.”
        </ExampleBox>
      )}
      {data.values.map((v, i) => {
        const ex = VALUE_EX[i % VALUE_EX.length]!;
        return (
          <div key={v.id} className="rounded-2xl border border-line bg-white p-3 sm:p-4 flex flex-col gap-3">
            <div className="flex items-center gap-1">
              <Num n={i + 1} />
              <span className="ml-1.5 flex-1 text-[13px] font-semibold text-muted">Value {i + 1}</span>
              <IconButton icon="chevronUp" label={`Move value ${i + 1} up`} disabled={i === 0} onClick={() => set((d) => ({ ...d, values: moved(d.values, i, -1) }))} />
              <IconButton icon="chevronDown" label={`Move value ${i + 1} down`} disabled={i === data.values.length - 1} onClick={() => set((d) => ({ ...d, values: moved(d.values, i, 1) }))} />
              <IconButton icon="trash" label={`Delete value ${i + 1}`} className="text-bad"
                onClick={() => ask('this value', !!(v.title.trim() || v.practice.trim()), () => set((d) => ({ ...d, values: d.values.filter((x) => x.id !== v.id) })))} />
            </div>
            <Field label="Name">
              <Input value={v.title} autoFocus={fresh === v.id} onChange={(e) => put(v.id, { title: e.target.value })} placeholder={`e.g. ${ex.title}`} />
            </Field>
            <Field label="How to practice it daily">
              <Textarea rows={2} value={v.practice} onChange={(e) => put(v.id, { practice: e.target.value })} placeholder={`e.g. ${ex.practice}`} />
            </Field>
          </div>
        );
      })}
      <AddButton onClick={add}>{data.values.length ? 'Add another value' : 'Add a core value'}</AddButton>
      {dialog}
    </div>
  );
}

// ───────── quick-step lists (objectives, checklist items) ─────────

function StepsCards({ items, onChange, noun, titleLabel, titleEx, stepEx, addLabel, empty }: {
  items: Steps[]; onChange: (s: Steps[]) => void; noun: string; titleLabel: string; titleEx: string[]; stepEx: string[][]; addLabel: string; empty: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState('');
  const { ask, dialog } = useRemove();
  const put = (id: string, patch: Partial<Steps>) => onChange(patchById(items, id, patch));
  const add = () => { const s = newSteps(); setFresh(s.id); setOpen(s.id); onChange([...items, s]); };
  return (
    <div className="flex flex-col gap-2.5">
      {!items.length && <p className="text-sm text-muted leading-relaxed">{empty}</p>}
      {items.map((o, i) => {
        const n = o.steps.filter((s) => s.trim()).length;
        return (
          <Fold key={o.id} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)}
            lead={<span className="text-brand-ink font-bold tabular-nums w-5 shrink-0" aria-hidden="true">{i + 1}.</span>}
            title={o.title.trim() || <span className="text-muted font-normal">Untitled {noun}</span>}
            meta={<Chip tone={hasSteps(o) ? 'neutral' : 'warn'} icon={hasSteps(o) ? 'list' : 'alert'}>{n ? plural(n, 'quick step') : 'No quick steps yet'}</Chip>}>
            <Field label={titleLabel}>
              <Input value={o.title} autoFocus={fresh === o.id} onChange={(e) => put(o.id, { title: e.target.value })} placeholder={`e.g. ${titleEx[i % titleEx.length]}`} />
            </Field>
            <StepsEditor steps={o.steps} onChange={(s) => put(o.id, { steps: s })} examples={stepEx[i % stepEx.length]!} />
            <MoveBar index={i} count={items.length} noun={noun} onMove={(dir) => onChange(moved(items, i, dir))}
              onRemove={() => ask(`this ${noun}`, !!(o.title.trim() || n), () => onChange(items.filter((x) => x.id !== o.id)))} />
          </Fold>
        );
      })}
      <Button variant="secondary" icon="plus" className="self-start" onClick={add}>{addLabel}</Button>
      {dialog}
    </div>
  );
}

// ───────── projects ─────────

const OBJ_TITLES = ['Upload the new team photos', 'Write the new services page', 'Fix broken links on old blog posts'];
const OBJ_STEPS = [
  ['Open the shared Photos folder', 'Pick the photos marked “final”', 'Resize each one to 800 px wide', 'Upload them to the Team page'],
  ['Open the draft in Google Docs', 'Copy the text into the page editor', 'Add the photos from the folder', 'Send the preview link for review'],
  ['Run the link checker', 'List broken links in the tracker sheet', 'Replace each link with the new page', 'Re-run the checker to confirm'],
];

export function ProjectsStep({ data, set, placementId }: StepProps) {
  const [open, setOpen] = useState<string | null>(data.projects.length === 1 ? data.projects[0]!.id : null);
  const [fresh, setFresh] = useState('');
  const { ask, dialog } = useRemove();
  const rangeId = useId();
  const put = (id: string, patch: Partial<Project> | ((p: Project) => Project)) => set((d) => ({ ...d, projects: patchById(d.projects, id, patch) }));
  const add = () => {
    const p: Project = { id: uid(), name: '', priority: 'medium', status: '', progress: 0, challenges: '', links: [], files: [], objectives: [] };
    setFresh(p.id); setOpen(p.id);
    set((d) => ({ ...d, projects: [...d.projects, p] }));
  };
  return (
    <div className="flex flex-col gap-3">
      <Notice icon="info">The first two projects become hands-on walkthroughs on Day 1. Put the most important one first.</Notice>
      {!data.projects.length && (
        <ExampleBox title="No projects yet. Start with the two or three that matter most right now.">
          For example: <strong className="text-ink">Website refresh</strong>, high priority, 40% done. Stuck on: waiting for photos.
          Mini objective: “Upload the new team photos”, with quick steps like “Open the shared Photos folder”.
        </ExampleBox>
      )}
      {data.projects.map((p, i) => {
        const pr = PRIORITY[p.priority];
        return (
          <Fold key={p.id} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} lead={<Num n={i + 1} />}
            title={p.name.trim() || <span className="text-muted font-normal">Untitled project</span>}
            meta={<>
              <Chip tone={pr.tone}>{pr.label}</Chip>
              <Chip>{p.progress}% done</Chip>
              <Chip tone={p.objectives.length ? 'neutral' : 'warn'}>{p.objectives.length ? plural(p.objectives.length, 'objective') : 'No objectives yet'}</Chip>
              {i < 2 && <Chip tone="brand" icon="play">Walkthrough {i ? 'B' : 'A'}</Chip>}
            </>}>
            <Field label="Project name">
              <Input value={p.name} autoFocus={fresh === p.id} onChange={(e) => put(p.id, { name: e.target.value })} placeholder="e.g. Website refresh" />
            </Field>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Pills label="Priority" value={p.priority} onChange={(v) => put(p.id, { priority: v })}
                options={[{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
            </div>
            <Field label="Where it stands right now">
              <Input value={p.status} onChange={(e) => put(p.id, { status: e.target.value })} placeholder="e.g. Design approved. Building the new pages." />
            </Field>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={`${rangeId}-${p.id}`} className="text-[13px] font-semibold text-ink-2">How far along</label>
                <output htmlFor={`${rangeId}-${p.id}`} className="text-[15px] font-bold tabular-nums">{p.progress}%</output>
              </div>
              <input id={`${rangeId}-${p.id}`} type="range" min={0} max={100} step={5} value={p.progress} aria-valuetext={`${p.progress}%`}
                onChange={(e) => put(p.id, { progress: Number(e.target.value) })} className="w-full h-11 cursor-pointer accent-[var(--brand,#4338CA)]" />
            </div>
            <Field label="What’s hard or stuck" hint="One per line. These show as bullets.">
              <Textarea rows={3} value={p.challenges} onChange={(e) => put(p.id, { challenges: e.target.value })}
                placeholder={'e.g. Waiting on photos from the clinics\nOld blog posts link to pages that moved'} />
            </Field>
            <LinksEditor label="Links (docs, boards, folders)" links={p.links} onChange={(l) => put(p.id, { links: l })} placeholder="e.g. https://trello.com/b/…" />
            <FilesField label="Screenshots and files" hint="Screenshots help a lot. Show what “done” looks like." files={p.files} placementId={placementId}
              onAdd={(f) => put(p.id, (x) => ({ ...x, files: [...x.files, ...f] }))}
              onRemove={(path) => put(p.id, (x) => ({ ...x, files: x.files.filter((y) => y.path !== path) }))} />
            <div className="flex flex-col gap-2 rounded-2xl bg-bg p-2.5 sm:p-4 -mx-1 sm:mx-0">
              <div>
                <p className="font-display text-base font-semibold">Mini objectives</p>
                <p className="text-sm text-muted leading-relaxed">Break the project into small wins. Give each one quick steps your team member can follow on their own.</p>
              </div>
              <StepsCards items={p.objectives} onChange={(o) => put(p.id, { objectives: o })} noun="objective" titleLabel="Objective"
                titleEx={OBJ_TITLES} stepEx={OBJ_STEPS} addLabel={p.objectives.length ? 'Add another objective' : 'Add an objective'}
                empty="No objectives yet. What’s the next small win on this project?" />
            </div>
            <MoveBar index={i} count={data.projects.length} noun="project" onMove={(dir) => set((d) => ({ ...d, projects: moved(d.projects, i, dir) }))}
              onRemove={() => ask(p.name.trim() ? `“${p.name.trim()}”` : 'this project', true, () => set((d) => ({ ...d, projects: d.projects.filter((x) => x.id !== p.id) })))} />
          </Fold>
        );
      })}
      <AddButton onClick={add}>{data.projects.length ? 'Add another project' : 'Add a project'}</AddButton>
      {dialog}
    </div>
  );
}

// ───────── checklists ─────────

const ITEM_TITLES = { daily: ['Clear the support inbox', 'Confirm tomorrow’s appointments', 'Post the daily update in chat'], weekly: ['Send the weekly report', 'Tidy the shared drive', 'Plan next week’s social posts'] };
const ITEM_STEPS = {
  daily: [
    ['Open the support inbox', 'Reply to anything under 24 hours old', 'Tag and assign anything you can’t answer', 'Archive what’s done'],
    ['Open the calendar for tomorrow', 'Text each patient the reminder template', 'Mark confirmed ones in green'],
    ['Open the team chat', 'List what you finished today', 'Flag anything that’s stuck'],
  ],
  weekly: [
    ['Open the report template', 'Fill in this week’s numbers', 'Send it to the team by Friday noon'],
    ['Open the shared drive', 'Move loose files into the right folders', 'Delete duplicates'],
    ['Check the content calendar', 'Draft three posts', 'Send them for approval'],
  ],
};

export function ChecklistsStep({ data, set }: StepProps) {
  const [fresh, setFresh] = useState('');
  const { ask, dialog } = useRemove();
  const put = (id: string, patch: Partial<Data['checklists'][number]>) => set((d) => ({ ...d, checklists: patchById(d.checklists, id, patch) }));
  const add = (frequency: 'daily' | 'weekly') => {
    const id = uid(); setFresh(id);
    set((d) => ({ ...d, checklists: [...d.checklists, { id, title: '', frequency, items: [] }] }));
  };
  return (
    <div className="flex flex-col gap-3">
      {!data.checklists.length && (
        <ExampleBox title="No checklists yet. Most roles need one daily and one weekly list.">
          List what the role does every day and every week. Give each item quick steps, like a recipe. For example:
          <strong className="text-ink"> Clear the support inbox</strong>: open the inbox, reply to anything under 24 hours old, tag what you can’t answer.
        </ExampleBox>
      )}
      {data.checklists.map((l, i) => (
        <div key={l.id} className="rounded-2xl border border-line bg-white p-3 sm:p-4 flex flex-col gap-4">
          <Field label="Checklist name">
            <Input value={l.title} autoFocus={fresh === l.id} onChange={(e) => put(l.id, { title: e.target.value })}
              placeholder={l.frequency === 'daily' ? 'e.g. Daily routine' : 'e.g. Friday wrap-up'} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label>How often</Label>
            <Pills label="How often" value={l.frequency} onChange={(v) => put(l.id, { frequency: v })}
              options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }]} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Items</Label>
            <StepsCards items={l.items} onChange={(items) => put(l.id, { items })} noun="item" titleLabel="What to do"
              titleEx={ITEM_TITLES[l.frequency]} stepEx={ITEM_STEPS[l.frequency]} addLabel={l.items.length ? 'Add another item' : 'Add an item'}
              empty={l.frequency === 'daily' ? 'What has to happen every day, without fail?' : 'What has to happen once a week?'} />
          </div>
          <MoveBar index={i} count={data.checklists.length} noun="checklist" onMove={(dir) => set((d) => ({ ...d, checklists: moved(d.checklists, i, dir) }))}
            onRemove={() => ask(l.title.trim() ? `“${l.title.trim()}”` : 'this checklist', !!(l.title.trim() || l.items.length), () => set((d) => ({ ...d, checklists: d.checklists.filter((x) => x.id !== l.id) })))} />
        </div>
      ))}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <AddButton onClick={() => add('daily')}>Add a daily checklist</AddButton>
        <AddButton onClick={() => add('weekly')}>Add a weekly checklist</AddButton>
      </div>
      {dialog}
    </div>
  );
}

// ───────── tools and access ─────────

export function ToolsStep({ data, set }: StepProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState('');
  const { ask, dialog } = useRemove();
  const put = (id: string, patch: Partial<Tool>) => set((d) => ({ ...d, tools: patchById(d.tools, id, patch) }));
  const add = (name = '') => {
    const t: Tool = { id: uid(), name, purpose: '', access_how: '', url: '', granted: false, tested: false };
    setFresh(t.id); setOpen(t.id);
    set((d) => ({ ...d, tools: [...d.tools, t] }));
  };
  const have = new Set(data.tools.map((t) => t.name.trim().toLowerCase()));
  const quick = COMMON_TOOLS.filter((n) => !have.has(n.toLowerCase()));
  const granted = data.tools.filter((t) => t.granted).length;
  const tested = data.tools.filter((t) => t.tested).length;
  return (
    <div className="flex flex-col gap-3">
      {data.tools.length > 0 && (
        <p className="text-sm text-muted"><strong className="text-ink">Access log:</strong> {granted} of {plural(data.tools.length, 'tool')} granted, {tested} tested.</p>
      )}
      {!data.tools.length && (
        <ExampleBox title="No tools yet. Include everything the role touches.">
          Email, chat, shared files, the project board, the password manager, phone apps. For example: <strong className="text-ink">Google Workspace</strong>, for email and calendar.
          Access: “Dr. Lee creates the account. The sign-in link arrives by email.”
        </ExampleBox>
      )}
      {data.tools.map((t, i) => (
        <Fold key={t.id} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)}
          title={t.name.trim() || <span className="text-muted font-normal">Untitled tool</span>}
          meta={<>
            <Chip tone={t.granted ? 'good' : 'neutral'} icon={t.granted ? 'check' : undefined}>{t.granted ? 'Access granted' : 'Not granted yet'}</Chip>
            <Chip tone={t.tested ? 'good' : 'neutral'} icon={t.tested ? 'check' : undefined}>{t.tested ? 'Tested' : 'Not tested'}</Chip>
            {!t.access_how.trim() && <Chip tone="warn" icon="alert">No access steps</Chip>}
          </>}>
          <Field label="Name">
            <Input value={t.name} autoFocus={fresh === t.id && !t.name} onChange={(e) => put(t.id, { name: e.target.value })} placeholder="e.g. Google Workspace" />
          </Field>
          <Field label="What it’s for">
            <Input value={t.purpose} autoFocus={fresh === t.id && !!t.name} onChange={(e) => put(t.id, { purpose: e.target.value })} placeholder="e.g. Email, calendar and shared drives" />
          </Field>
          <Field label="How to get access" hint="Who sets it up, where the invite arrives, and anything to turn on.">
            <Textarea rows={3} value={t.access_how} onChange={(e) => put(t.id, { access_how: e.target.value })}
              placeholder={'e.g. Dr. Lee creates the account.\nThe sign-in link arrives by email.\nTurn on 2-step sign-in the first time.'} />
          </Field>
          <Field label="Link (optional)">
            <Input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" value={t.url} onChange={(e) => put(t.id, { url: e.target.value })} placeholder="e.g. https://mail.google.com" />
          </Field>
          <div className="flex flex-col rounded-xl border border-line-2">
            <div className="flex items-center justify-between gap-3 min-h-14 px-3.5">
              <span className="flex flex-col"><span className="text-[15px] font-semibold">Access granted</span><span className="text-[13px] text-muted">The account or invite is set up.</span></span>
              <Switch checked={t.granted} onChange={(v) => put(t.id, { granted: v })} label={`Access granted for ${t.name || 'this tool'}`} />
            </div>
            <div className="flex items-center justify-between gap-3 min-h-14 px-3.5 border-t border-line-2">
              <span className="flex flex-col"><span className="text-[15px] font-semibold">Access tested</span><span className="text-[13px] text-muted">They signed in and it works.</span></span>
              <Switch checked={t.tested} onChange={(v) => put(t.id, { tested: v })} label={`Access tested for ${t.name || 'this tool'}`} />
            </div>
          </div>
          <MoveBar index={i} count={data.tools.length} noun="tool" onMove={(dir) => set((d) => ({ ...d, tools: moved(d.tools, i, dir) }))}
            onRemove={() => ask(t.name.trim() ? `“${t.name.trim()}”` : 'this tool', !!(t.name.trim() || t.access_how.trim()), () => set((d) => ({ ...d, tools: d.tools.filter((x) => x.id !== t.id) })))} />
        </Fold>
      ))}
      <AddButton onClick={() => add()}>{data.tools.length ? 'Add another tool' : 'Add a tool'}</AddButton>
      {quick.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          <Label>Quick add</Label>
          <div className="flex flex-wrap gap-2">
            {quick.slice(0, 10).map((n) => (
              <button key={n} type="button" onClick={() => add(n)}
                className="inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-full border border-[#C9CED6] bg-white text-sm font-semibold text-ink-2 hover:bg-chip cursor-pointer">
                <span aria-hidden="true" className="text-brand-ink">+</span>{n}
              </button>
            ))}
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}

// ───────── milestones ─────────

const MS_EX = [
  { title: 'Runs the daily checklist on their own', why: 'Frees up two hours of your day.', reward: 'More ownership of day-to-day work' },
  { title: 'Owns the weekly report', why: 'The team gets numbers on time, every time.', reward: 'End of probation review' },
  { title: 'Ready for promotion review', why: 'Consistent, trusted work across the role.', reward: 'Promotion and a higher tier' },
];
const longDate = (iso: string) => fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric' });

export function MilestonesStep({ data, set, start }: StepProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState('');
  const { ask, dialog } = useRemove();
  const dayId = useId();
  const put = (id: string, patch: Partial<Milestone>) => set((d) => ({ ...d, milestones: patchById(d.milestones, id, patch) }));
  const add = () => {
    const m: Milestone = { id: uid(), title: '', due_day: null, scope: 'individual', why: '', reward: '' };
    setFresh(m.id); setOpen(m.id);
    set((d) => ({ ...d, milestones: [...d.milestones, m] }));
  };
  const starter = () => set((d) => ({ ...d, milestones: [...d.milestones, ...STARTER_MILESTONES.map((m) => ({ ...m, id: uid() }))] }));
  return (
    <div className="flex flex-col gap-3">
      {!data.milestones.length && (
        <ExampleBox title="No milestones yet. They show what great looks like, and what it earns."
          action={<Button variant="secondary" icon="sparkle" onClick={starter}>Start with a suggested path</Button>}>
          For example: <strong className="text-ink">Day 30: runs the daily checklist on their own</strong>. Why it matters: frees up two hours of your day.
          Reward: more ownership. The suggested path adds four milestones from day 7 to day 90 that you can edit.
        </ExampleBox>
      )}
      {data.milestones.map((m, i) => {
        const ex = MS_EX[i % MS_EX.length]!;
        const date = milestoneDate(start, m.due_day);
        return (
          <Fold key={m.id} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)}
            title={m.title.trim() || <span className="text-muted font-normal">Untitled milestone</span>}
            meta={<>
              <Chip tone={m.due_day === null ? 'warn' : 'brand'} icon="calendar">{m.due_day === null ? 'No date yet' : `Day ${m.due_day}${date ? ` · ${fmtDate(date)}` : ''}`}</Chip>
              <Chip>{SCOPE[m.scope].label}</Chip>
            </>}>
            <Field label="Milestone">
              <Input value={m.title} autoFocus={fresh === m.id} onChange={(e) => put(m.id, { title: e.target.value })} placeholder={`e.g. ${ex.title}`} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${dayId}-${m.id}`} className="text-[13px] font-semibold text-ink-2">When (days after the start date)</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-28">
                  <Input id={`${dayId}-${m.id}`} type="number" inputMode="numeric" min={0} max={3650} value={m.due_day ?? ''} placeholder="e.g. 30"
                    onChange={(e) => put(m.id, { due_day: e.target.value === '' ? null : Math.min(3650, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
                </div>
                {[7, 30, 60, 90].map((n) => (
                  <button key={n} type="button" aria-pressed={m.due_day === n} onClick={() => put(m.id, { due_day: n })}
                    className={cx('min-h-11 px-3 rounded-full border text-sm font-semibold cursor-pointer',
                      m.due_day === n ? 'bg-brand border-brand text-white' : 'bg-white border-[#C9CED6] text-ink-2 hover:bg-chip')}>Day {n}</button>
                ))}
              </div>
              <span className="text-xs text-muted">
                {date ? `That’s ${longDate(date)}.` : start ? 'Pick a day to see the date.' : 'Counted from the start date, once there is one.'}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Whose milestone is it?</Label>
              <Pills label="Whose milestone is it?" value={m.scope} onChange={(v) => put(m.id, { scope: v })}
                options={(['individual', 'team', 'company'] as const).map((s) => ({ value: s, label: SCOPE[s].label }))} />
              <span className="text-xs text-muted">{SCOPE[m.scope].desc}.</span>
            </div>
            <Field label="Why it matters">
              <Textarea rows={2} value={m.why} onChange={(e) => put(m.id, { why: e.target.value })} placeholder={`e.g. ${ex.why}`} />
            </Field>
            <Field label="Reward or result">
              <Input value={m.reward} onChange={(e) => put(m.id, { reward: e.target.value })} placeholder={`e.g. ${ex.reward}`} />
            </Field>
            <MoveBar index={i} count={data.milestones.length} noun="milestone"
              onRemove={() => ask(m.title.trim() ? `“${m.title.trim()}”` : 'this milestone', !!(m.title.trim() || m.why.trim()), () => set((d) => ({ ...d, milestones: d.milestones.filter((x) => x.id !== m.id) })))} />
          </Fold>
        );
      })}
      <AddButton onClick={add}>{data.milestones.length ? 'Add another milestone' : 'Add a milestone'}</AddButton>
      {data.milestones.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <p className="font-display text-base font-semibold">Success path preview</p>
          <SuccessPath milestones={data.milestones} start={start} compact />
        </div>
      )}
      {dialog}
    </div>
  );
}

// ───────── time-blocks ─────────

function DaysPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const on = parseDays(value);
  const toggle = (d: number) => onChange(daysText(on.includes(d) ? on.filter((x) => x !== d) : [...on, d]));
  return (
    <div role="group" aria-label={label} className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((n, d) => (
        <button key={n} type="button" aria-pressed={on.includes(d)} onClick={() => toggle(d)}
          className={cx('min-h-11 rounded-[10px] border text-[13px] font-semibold cursor-pointer',
            on.includes(d) ? 'bg-brand border-brand text-white' : 'bg-white border-[#C9CED6] text-ink-2 hover:bg-chip')}>{n}</button>
      ))}
    </div>
  );
}

export function SchedulesStep({ data, set }: StepProps) {
  const [period, setPeriod] = useState<Period>('training');
  const [fresh, setFresh] = useState('');
  const { ask, dialog } = useRemove();
  const blocks = data.schedules.find((s) => s.period === period)?.blocks || [];
  const meta = PERIODS.find((p) => p.id === period)!;
  const setBlocks = (fn: (b: Block[]) => Block[]) => set((d) => ({ ...d, schedules: d.schedules.map((s) => (s.period === period ? { ...s, blocks: fn(s.blocks) } : s)) }));
  const put = (id: string, patch: Partial<Block>) => setBlocks((b) => patchById(b, id, patch));
  const add = () => {
    const last = blocks[blocks.length - 1];
    const b: Block = { id: uid(), days: last?.days || 'Mon–Fri', start: last?.end || '09:00', end: '', focus: '' };
    if (b.start && !Number.isNaN(toMin(b.start))) { const e = toMin(b.start) + 60; b.end = `${String(Math.floor(e / 60) % 24).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`; }
    setFresh(b.id);
    setBlocks((x) => [...x, b]);
  };
  const other = data.schedules.find((s) => s.period !== period && s.blocks.length);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Pills label="Which period" value={period} onChange={setPeriod}
          options={PERIODS.map((p) => {
            const n = data.schedules.find((s) => s.period === p.id)?.blocks.length || 0;
            return { value: p.id, label: n ? `${p.label} (${n})` : p.label };
          })} />
        <p className="text-sm text-muted leading-relaxed">{meta.desc}</p>
      </div>
      {!blocks.length && (
        <ExampleBox title={`Nothing planned for “${meta.label}” yet.`}
          action={<>
            <Button variant="secondary" icon="sparkle" onClick={() => setBlocks(() => STARTER_WEEK[period].map((b) => ({ ...b, id: uid() })))}>Fill in a sample week</Button>
            {other && <Button variant="ghost" icon="copy" onClick={() => setBlocks(() => other.blocks.map((b) => ({ ...b, id: uid() })))}>Copy from “{PERIODS.find((p) => p.id === other.period)!.label}”</Button>}
          </>}>
          Block out the week so a new person knows what to focus on and when. For example: <strong className="text-ink">Mon–Fri, 9:00 to 10:00 AM: inbox and messages</strong>.
          The sample week gives you a starting point to edit.
        </ExampleBox>
      )}
      {blocks.map((b, i) => (
        <div key={b.id} className="rounded-2xl border border-line bg-white p-3 sm:p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[13px] font-semibold text-muted">Block {i + 1}{b.focus.trim() && <span className="text-ink"> · {b.focus.trim()}</span>}</span>
            <IconButton icon="trash" label={`Delete block ${i + 1}`} className="text-bad -my-1.5 -mr-1.5"
              onClick={() => ask('this time-block', !!b.focus.trim(), () => setBlocks((x) => x.filter((y) => y.id !== b.id)))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Days</Label>
            <DaysPicker value={b.days} onChange={(v) => put(b.id, { days: v })} label={`Days for block ${i + 1}`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><Input type="time" step={900} value={b.start} onChange={(e) => put(b.id, { start: e.target.value })} /></Field>
            <Field label="To" error={b.start && b.end && toMin(b.end) <= toMin(b.start) ? 'Ends before it starts' : undefined}>
              <Input type="time" step={900} value={b.end} onChange={(e) => put(b.id, { end: e.target.value })} />
            </Field>
          </div>
          <Field label="Focus">
            <Input value={b.focus} autoFocus={fresh === b.id} onChange={(e) => put(b.id, { focus: e.target.value })}
              placeholder={`e.g. ${STARTER_WEEK[period][i % STARTER_WEEK[period].length]!.focus}`} />
          </Field>
        </div>
      ))}
      <AddButton onClick={add}>{blocks.length ? 'Add another block' : 'Add a time-block'}</AddButton>
      {blocks.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <p className="font-display text-base font-semibold">The week, {meta.label.toLowerCase()}</p>
          <div className="rounded-2xl border border-line bg-white p-3 sm:p-4"><WeekSchedule blocks={blocks} /></div>
        </div>
      )}
      {dialog}
    </div>
  );
}
