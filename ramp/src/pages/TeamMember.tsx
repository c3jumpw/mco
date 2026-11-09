import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, errText, openFile } from '../lib/supabase';
import { q, useAsync, useDirectory, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { planFor, planSummary, type PlanItem } from '../lib/plan';
import { LEVELS, PROGRESS_STATUS, TASK_STATUS, ago, displayName, fmtDate, fmtDateTime, plural, dueLabel, daysUntil } from '../lib/util';
import type { Department, JobRole, Member, Module, Page, Progress, RoleModule, Task } from '../lib/types';
import { Avatar, BackLink, Button, Card, CardHeader, Chip, EmptyState, ErrorBox, Icon, LinkButton, Progress as Bar, Sheet, Skeleton, useConfirm, useToast } from '../ui';
import { ReviewSheet, type ReviewTarget } from './parts/tools-review';
import { KIND_LABEL, stageOf } from './parts/tools-people';
import { DueChip, TaskSheet, byDue, type TaskDraft } from './parts/tools-task';
import { fmtSize } from './parts/tools-notes-editor';

const PAGE_COLS = 'id, member_id, parent_id, title, body, shared, module_id, files, sort, created_at, updated_at';

interface Data {
  member: Member | null;
  role: JobRole | null;
  dept: Department | null;
  modules: Module[];
  roleModules: RoleModule[];
  progress: Progress[];
  pages: Page[];
  tasks: Task[];
}

export default function TeamMember() {
  const { id = '' } = useParams();
  const { me, org, rank, isAdmin } = useMe();
  const dir = useDirectory();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [reviewing, setReviewing] = useState<ReviewTarget | null>(null);
  const [reading, setReading] = useState<Page | null>(null);
  const [taskSheet, setTaskSheet] = useState<Task | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  const { data, error, reload, setData } = useAsync<Data>(async () => {
    const member = await q<Member | null>(supabase.from('ramp_members').select('*').eq('id', id).maybeSingle());
    if (!member) return { member: null, role: null, dept: null, modules: [], roleModules: [], progress: [], pages: [], tasks: [] };
    const [role, dept, modules, roleModules, progress, pages, tasks] = await Promise.all([
      member.job_role_id ? q<JobRole | null>(supabase.from('ramp_job_roles').select('*').eq('id', member.job_role_id).maybeSingle()) : Promise.resolve(null),
      member.department_id ? q<Department | null>(supabase.from('ramp_departments').select('*').eq('id', member.department_id).maybeSingle()) : Promise.resolve(null),
      q<Module[]>(supabase.from('ramp_modules').select('*').order('sort')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
      q<Progress[]>(supabase.from('ramp_progress').select('*').eq('member_id', id)),
      q<Page[]>(supabase.from('ramp_pages').select(PAGE_COLS).eq('member_id', id).eq('shared', true).order('updated_at', { ascending: false })),
      q<Task[]>(supabase.from('ramp_tasks').select('*').eq('member_id', id).order('created_at')),
    ]);
    return { member, role, dept, modules, roleModules, progress, pages, tasks };
  }, [id]);

  const m = data?.member || null;
  useTitle(m ? displayName(m) : 'Team member');
  const back = { to: '/team', label: rank <= 2 ? 'Team progress' : 'My team' };

  if (error && !data) return <div className="flex flex-col gap-6"><BackLink to={back.to}>{back.label}</BackLink><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6"><BackLink to={back.to}>{back.label}</BackLink><Skeleton rows={2} /><Skeleton rows={4} /></div>;
  if (!m) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink to={back.to}>{back.label}</BackLink>
        <Card>
          <EmptyState icon="users" title="We couldn’t find this person"
            body="They may have left, or they’re not someone you look after. You can see the people in your department or assigned to you." />
        </Card>
      </div>
    );
  }

  const name = displayName(m);
  const first = name.split(' ')[0] || name;
  const self = m.id === me.id;
  const plan = planFor(m, data.modules, data.roleModules, data.progress);
  const sum = planSummary(plan);
  const stage = stageOf(m, sum.pct);
  const mentor = m.mentor_id ? dir.byId(m.mentor_id) : null;
  const assigned = plan.filter((i) => i.kind !== 'optional' || i.progress);
  const optional = plan.filter((i) => i.kind === 'optional' && !i.progress);
  const openTasks = data.tasks.filter((t) => t.status !== 'done').sort(byDue);
  const doneTasks = data.tasks.filter((t) => t.status === 'done').sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const editingTask = taskSheet && taskSheet !== 'new' ? taskSheet : null;
  const creatorOf = (t: Task) => {
    if (!t.created_by || t.created_by === m.id) return null;
    const d = dir.byId(t.created_by);
    return d ? displayName(d) : 'a teammate';
  };

  function review(i: PlanItem) {
    if (i.progress) setReviewing({ progress: i.progress, module: i.module, personName: name });
  }

  async function assign(d: TaskDraft) {
    const row = await q<Task>(supabase.from('ramp_tasks').insert({ member_id: m!.id, title: d.title, notes: d.notes, due_date: d.due_date, created_by: me.id }).select('*').single());
    setData((x) => ({ ...x!, tasks: [...x!.tasks, row] }));
    setTaskSheet(null);
    toast(`Task assigned to ${first}.`);
  }

  async function updateTask(t: Task, d: TaskDraft) {
    const row = await q<Task>(supabase.from('ramp_tasks').update(d).eq('id', t.id).select('*').single());
    setData((x) => ({ ...x!, tasks: x!.tasks.map((k) => (k.id === t.id ? row : k)) }));
    setTaskSheet(null);
    toast('Task saved.');
  }

  async function removeTask(t: Task) {
    setTaskSheet(null);
    const ok = await confirm({ title: 'Delete this task?', body: `“${t.title}” will be removed from ${first}’s tasks.`, action: 'Delete task', danger: true });
    if (!ok) { setTaskSheet(t); return; }
    setData((x) => ({ ...x!, tasks: x!.tasks.filter((k) => k.id !== t.id) }));
    const { error } = await supabase.from('ramp_tasks').delete().eq('id', t.id);
    if (error) {
      setData((x) => ({ ...x!, tasks: [...x!.tasks, t] }));
      toast(errText(error), 'bad');
    } else toast('Task deleted.');
  }

  const onboarding = m.status === 'invited'
    ? `Invited ${fmtDate(m.invited_at)}. Hasn’t signed in yet.`
    : m.onboarded_at ? `Finished ${fmtDate(m.onboarded_at)}` : 'Not finished yet';

  return (
    <div className="flex flex-col gap-6">
      <BackLink to={back.to}>{back.label}</BackLink>

      <header className="flex flex-wrap items-center gap-4 rise">
        <Avatar name={name} size={64} />
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight break-words">{name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <Chip tone={stage.tone}>{stage.label}</Chip>
            <span className="text-sm text-muted">{LEVELS[m.level].label}{data.role ? ` · ${data.role.title}` : ''}</span>
          </div>
        </div>
        {isAdmin && <LinkButton to={`/admin/people/${m.id}`} icon="shield">Open full record</LinkButton>}
      </header>
      {error && <ErrorBox error={error} onRetry={reload} />}

      <Card padded={false}>
        <CardHeader title="Overview" className="px-5 pt-5 pb-2" />
        <dl className="grid sm:grid-cols-2 px-5 pb-4">
          <Row label="Job role">{data.role?.title || 'Not set'}</Row>
          <Row label="Department">{data.dept?.name || 'Not set'}</Row>
          <Row label="Mentor">{mentor ? displayName(mentor) : m.mentor_id ? 'Assigned' : 'No mentor yet'}</Row>
          <Row label="Start date">{m.start_date ? fmtDate(m.start_date, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</Row>
          <Row label="Onboarding">{onboarding}</Row>
          <Row label="Last seen"><span title={m.last_seen_at ? fmtDateTime(m.last_seen_at, org.timezone) : undefined}>{m.last_seen_at ? ago(m.last_seen_at) : 'Never'}</span></Row>
          <Row label="Email"><a href={`mailto:${m.email}`} className="text-brand-ink font-semibold no-underline break-all">{m.email}</a></Row>
          {m.phone && <Row label="Phone"><a href={`tel:${m.phone}`} className="text-brand-ink font-semibold no-underline">{m.phone}</a></Row>}
        </dl>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="p-5 flex flex-col gap-3">
          <CardHeader title="Training plan"
            subtitle={sum.total ? `${sum.done} of ${sum.total} done${sum.waiting ? ` · ${sum.waiting} waiting for review` : ''}${sum.overdue ? ` · ${plural(sum.overdue, 'overdue module')}` : ''}` : 'Nothing assigned yet.'} />
          {sum.total > 0 && <Bar value={sum.pct} tone={sum.pct >= 100 ? 'good' : 'brand'} label={`${name}’s training progress`} />}
        </div>
        {assigned.length > 0 && (
          <ul>
            {assigned.map((i) => <PlanRow key={i.module.id} item={i} canReview={!self} onReview={() => review(i)} />)}
          </ul>
        )}
        {optional.length > 0 && (
          <div className="border-t border-line-2">
            <button type="button" onClick={() => setShowOptional((v) => !v)} aria-expanded={showOptional}
              className="flex items-center gap-2 w-full min-h-12 px-5 text-sm font-semibold text-ink-2 cursor-pointer hover:bg-bg">
              <Icon name={showOptional ? 'chevronUp' : 'chevronDown'} size={18} />
              {showOptional ? 'Hide optional modules' : `${plural(optional.length, 'optional module')} not started`}
            </button>
            {showOptional && <ul>{optional.map((i) => <PlanRow key={i.module.id} item={i} canReview={false} onReview={() => {}} />)}</ul>}
          </div>
        )}
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="p-5 pb-3">
          <CardHeader title="Shared notebook pages" subtitle={`Pages ${first} chose to share with their mentor and lead. Read-only.`} />
        </div>
        {data.pages.length === 0 ? (
          <p className="px-5 pb-5 text-[15px] text-muted">{first} hasn’t shared any pages yet.</p>
        ) : (
          <ul>
            {data.pages.map((p) => (
              <li key={p.id} className="border-t border-line-2">
                <button type="button" onClick={() => setReading(p)} className="flex items-center gap-3 w-full min-h-14 px-5 py-2.5 text-left hover:bg-bg cursor-pointer">
                  <Icon name="fileText" size={19} className="text-brand-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold truncate">{p.title}</span>
                    <span className="block text-[13px] text-muted">Edited {ago(p.updated_at)}{(p.files || []).length ? ` · ${plural(p.files.length, 'file')}` : ''}</span>
                  </span>
                  <Icon name="chevronRight" size={18} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="p-5 pb-3">
          <CardHeader title="Tasks" subtitle={openTasks.length ? `${plural(openTasks.length, 'open task')}` : 'No open tasks.'}
            action={!self && m.status !== 'inactive' ? <Button variant="primary" size="sm" icon="plus" onClick={() => setTaskSheet('new')}>Assign a task</Button> : undefined} />
        </div>
        {openTasks.length > 0 && <ul>{openTasks.map((t) => <TaskRow key={t.id} task={t} mine={t.created_by === me.id} creator={creatorOf(t)} onEdit={() => setTaskSheet(t)} />)}</ul>}
        {doneTasks.length > 0 && (
          <div className="border-t border-line-2">
            <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}
              className="flex items-center gap-2 w-full min-h-12 px-5 text-sm font-semibold text-ink-2 cursor-pointer hover:bg-bg">
              <Icon name={showDone ? 'chevronUp' : 'chevronDown'} size={18} />
              {showDone ? 'Hide done tasks' : `Show ${plural(doneTasks.length, 'done task')}`}
            </button>
            {showDone && <ul>{doneTasks.map((t) => <TaskRow key={t.id} task={t} mine={t.created_by === me.id} creator={creatorOf(t)} onEdit={() => setTaskSheet(t)} />)}</ul>}
          </div>
        )}
        {data.tasks.length === 0 && <p className="px-5 pb-5 text-[15px] text-muted">Assign {first} a task and it shows up on their task board.</p>}
      </Card>

      <ReviewSheet target={reviewing} tz={org.timezone} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); reload(); }} />
      <PageSheet page={reading} owner={first} onClose={() => setReading(null)} />
      <TaskSheet open={!!taskSheet} task={editingTask}
        heading={editingTask ? 'Edit task' : `Assign a task to ${first}`}
        subtitle={editingTask ? undefined : `It shows up on ${first}’s task board, marked as from you.`}
        saveLabel={editingTask ? 'Save changes' : 'Assign task'}
        onClose={() => setTaskSheet(null)}
        onSave={(d) => (editingTask ? updateTask(editingTask, d) : assign(d))}
        onDelete={editingTask ? () => removeTask(editingTask) : undefined} />
      {dialog}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-t border-line-2 sm:[&:nth-child(2)]:border-t-0 first:border-t-0 sm:pr-4">
      <dt className="text-[13px] font-semibold text-muted">{label}</dt>
      <dd className="text-[15px] text-ink">{children}</dd>
    </div>
  );
}

function PlanRow({ item: i, canReview, onReview }: { item: PlanItem; canReview: boolean; onReview: () => void }) {
  const st = PROGRESS_STATUS[i.status];
  const late = i.due && i.status !== 'completed' && i.status !== 'submitted' && (daysUntil(i.due) ?? 0) < 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 border-t border-line-2">
      <div className="min-w-0 flex-1 basis-52">
        <p className="text-[15px] font-semibold leading-snug">{i.module.title}</p>
        <p className="text-[13px] text-muted">
          {KIND_LABEL[i.kind]}
          {i.due && i.status !== 'completed' ? <> · <span className={late ? 'text-bad font-semibold' : undefined}>{dueLabel(i.due)}</span></> : null}
          {i.status === 'completed' && i.progress?.completed_at ? ` · Done ${fmtDate(i.progress.completed_at)}` : ''}
          {i.progress?.score != null ? ` · ${i.progress.score}%` : ''}
        </p>
        {i.status === 'returned' && i.progress?.feedback && <p className="text-[13px] text-ink-2 mt-1 line-clamp-2">Feedback: {i.progress.feedback}</p>}
      </div>
      {i.status === 'in_progress' && <span className="text-xs text-muted tabular-nums">{i.pct}%</span>}
      <Chip tone={st.tone}>{st.label}</Chip>
      {i.status === 'submitted' && canReview && <Button variant="primary" size="sm" onClick={onReview}>Review</Button>}
    </li>
  );
}

function TaskRow({ task: t, mine, creator, onEdit }: { task: Task; mine: boolean; creator: string | null; onEdit: () => void }) {
  const st = TASK_STATUS[t.status];
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug break-words">{t.title}</span>
        <span className="flex flex-wrap items-center gap-1.5 mt-1">
          <Chip tone={st.tone}>{st.label}</Chip>
          <DueChip task={t} />
          {creator && <span className="text-[13px] text-muted">From {mine ? 'you' : creator}</span>}
        </span>
      </span>
      {mine && <Icon name="pen" size={17} className="text-muted" />}
    </>
  );
  return (
    <li className="border-t border-line-2">
      {mine
        ? <button type="button" onClick={onEdit} aria-label={`Edit ${t.title}`} className="flex items-center gap-3 w-full min-h-14 px-5 py-2.5 text-left hover:bg-bg cursor-pointer">{body}</button>
        : <div className="flex items-center gap-3 min-h-14 px-5 py-2.5">{body}</div>}
    </li>
  );
}

function PageSheet({ page, owner, onClose }: { page: Page | null; owner: string; onClose: () => void }) {
  const toast = useToast();
  if (!page) return null;
  async function open(path: string) {
    try { await openFile(path); } catch (e) { toast(errText(e), 'bad'); }
  }
  return (
    <Sheet open onClose={onClose} title={page.title} wide subtitle={`${owner}’s notebook · edited ${ago(page.updated_at)} · read-only`}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {page.body.trim()
        ? <div className="text-base leading-relaxed text-ink-2 whitespace-pre-wrap break-words">{page.body}</div>
        : <p className="text-[15px] text-muted">This page is empty.</p>}
      {(page.files || []).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-ink-2">Attachments</p>
          <ul className="flex flex-col divide-y divide-line-2 border border-line rounded-xl">
            {page.files.map((f) => (
              <li key={f.path}>
                <button type="button" onClick={() => open(f.path)} className="flex items-center gap-2.5 w-full min-h-12 px-3 text-left cursor-pointer hover:bg-bg">
                  <Icon name="file" size={18} className="text-brand-ink" />
                  <span className="min-w-0 flex-1 text-[15px] font-semibold truncate">{f.name}</span>
                  {f.size != null && <span className="text-xs text-muted">{fmtSize(f.size)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
