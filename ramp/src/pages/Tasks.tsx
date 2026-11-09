import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useDirectory, useIsMobile, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { TASK_ORDER, TASK_STATUS, cx, displayName, plural } from '../lib/util';
import type { Task, TaskStatus, Template } from '../lib/types';
import { FormSheet } from '../components/FormSheet';
import { Button, Card, Chip, EmptyState, ErrorBox, Icon, IconButton, PageHeader, Segmented, Select, Skeleton, useConfirm, useToast } from '../ui';
import { DueChip, TaskSheet, byDue, type TaskDraft } from './parts/tools-task';

interface Data { tasks: Task[]; templates: Template[] }

const OPEN: TaskStatus[] = ['todo', 'doing', 'review'];

export default function Tasks() {
  useTitle('Tasks');
  const { me } = useMe();
  const toast = useToast();
  const mobile = useIsMobile();
  const dir = useDirectory();
  const { confirm, dialog } = useConfirm();

  const { data, error, reload, setData } = useAsync<Data>(async () => {
    const tasks = await q<Task[]>(supabase.from('ramp_tasks').select('*').eq('member_id', me.id).order('created_at'));
    const ids = [...new Set(tasks.map((t) => t.template_id).filter((x): x is string => !!x))];
    const templates = ids.length ? await q<Template[]>(supabase.from('ramp_templates').select('*').in('id', ids)) : [];
    return { tasks, templates };
  }, [me.id]);

  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [filling, setFilling] = useState<Template | null>(null);
  const [seg, setSeg] = useState<TaskStatus>('todo');
  const [showDone, setShowDone] = useState(false);
  const picked = useRef(false);

  const tasks = data?.tasks;
  const grouped = useMemo(() => {
    const g: Record<TaskStatus, Task[]> = { todo: [], doing: [], review: [], done: [] };
    for (const t of tasks || []) g[t.status].push(t);
    for (const s of OPEN) g[s].sort(byDue);
    g.done.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return g;
  }, [tasks]);

  // On phones, open the first status that has something in it.
  useEffect(() => {
    if (!tasks || picked.current) return;
    picked.current = true;
    const first = OPEN.find((s) => grouped[s].length > 0);
    if (first) setSeg(first);
  }, [tasks, grouped]);

  const templateOf = (t: Task) => (t.template_id ? data?.templates.find((x) => x.id === t.template_id && x.status === 'published') || null : null);
  const fromName = (t: Task) => {
    if (!t.created_by || t.created_by === me.id) return null;
    const d = dir.byId(t.created_by);
    return d ? displayName(d) : 'a teammate';
  };

  function patch(id: string, p: Partial<Task>) {
    setData((d) => ({ ...d!, tasks: d!.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
  }

  async function move(t: Task, status: TaskStatus) {
    if (t.status === status) return;
    // A form task is finished by sending the form, which marks it done.
    const tpl = templateOf(t);
    if (status === 'done' && tpl) {
      toast('Send the form to finish this task.');
      setFilling(tpl);
      return;
    }
    const prev = t.status;
    patch(t.id, { status, updated_at: new Date().toISOString() });
    const { error } = await supabase.from('ramp_tasks').update({ status }).eq('id', t.id);
    if (error) {
      patch(t.id, { status: prev });
      toast(errText(error), 'bad');
    } else if (mobile) toast(`Moved to ${TASK_STATUS[status].label}.`);
  }

  async function create(d: TaskDraft) {
    const row = await q<Task>(supabase.from('ramp_tasks').insert({ member_id: me.id, created_by: me.id, status: 'todo', ...d }).select('*').single());
    setData((x) => ({ ...x!, tasks: [...x!.tasks, row] }));
    setEditing(null);
    setSeg('todo');
    toast('Task added.');
  }

  async function update(t: Task, d: TaskDraft) {
    const row = await q<Task>(supabase.from('ramp_tasks').update(d).eq('id', t.id).select('*').single());
    patch(t.id, row);
    setEditing(null);
    toast('Task saved.');
  }

  async function remove(t: Task) {
    setEditing(null);
    const ok = await confirm({ title: 'Delete this task?', body: `“${t.title}” will be removed for good.`, action: 'Delete task', danger: true });
    if (!ok) { setEditing(t); return; }
    setData((d) => ({ ...d!, tasks: d!.tasks.filter((x) => x.id !== t.id) }));
    const { error } = await supabase.from('ramp_tasks').delete().eq('id', t.id);
    if (error) {
      setData((d) => ({ ...d!, tasks: [...d!.tasks, t] }));
      toast(errText(error), 'bad');
    } else toast('Task deleted.');
  }

  const header = (
    <PageHeader title="Tasks" subtitle="Everything you need to get done, in one place. Move a task along as you work on it."
      actions={data && data.tasks.length > 0 ? <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>New task</Button> : undefined} />
  );

  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={4} /></div>;

  const cardProps = {
    templateOf, fromName, onMove: move, onOpen: (t: Task) => setEditing(t), onFill: (tpl: Template) => setFilling(tpl),
  };

  const editingTask = editing && editing !== 'new' ? editing : null;

  return (
    <div className="flex flex-col gap-6">
      {header}
      {error && <ErrorBox error={error} onRetry={reload} />}

      {data.tasks.length === 0 ? (
        <Card>
          <EmptyState icon="tasks" title="No tasks yet"
            body="Add anything you need to get done. Tasks your mentor or lead assigns to you show up here too."
            action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add your first task</Button>} />
        </Card>
      ) : mobile ? (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
            <Segmented label="Show tasks by status" value={seg} onChange={setSeg}
              options={OPEN.map((s) => ({ value: s, label: `${TASK_STATUS[s].label} ${grouped[s].length}` }))} />
          </div>
          {seg !== 'done' && (
            grouped[seg].length === 0 ? (
              <p className="text-[15px] text-muted text-center py-8 px-4 bg-card border border-dashed border-line rounded-2xl">
                Nothing {seg === 'todo' ? 'to do' : seg === 'doing' ? 'in progress' : 'in review'} right now.
              </p>
            ) : (
              <ul className="flex flex-col gap-3" aria-label={TASK_STATUS[seg].label}>
                {grouped[seg].map((t) => <li key={t.id}><TaskCard task={t} compact {...cardProps} /></li>)}
              </ul>
            )
          )}
          {grouped.done.length > 0 && (
            <section className="flex flex-col gap-3">
              <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}
                className="flex items-center gap-2 min-h-11 px-1 text-[15px] font-semibold text-ink-2 cursor-pointer self-start">
                <Icon name={showDone ? 'chevronUp' : 'chevronDown'} size={18} />
                {showDone ? 'Hide done tasks' : `Show ${plural(grouped.done.length, 'done task')}`}
              </button>
              {showDone && (
                <ul className="flex flex-col gap-3" aria-label="Done">
                  {grouped.done.map((t) => <li key={t.id}><TaskCard task={t} compact {...cardProps} /></li>)}
                </ul>
              )}
            </section>
          )}
        </div>
      ) : (
        <Board grouped={grouped} cardProps={cardProps} onDropTask={(id, s) => { const t = data.tasks.find((x) => x.id === id); if (t) move(t, s); }} />
      )}

      <TaskSheet open={!!editing} task={editingTask}
        heading={editingTask ? 'Edit task' : 'New task'}
        subtitle={editingTask && fromName(editingTask) ? `Assigned by ${fromName(editingTask)}` : undefined}
        saveLabel={editingTask ? 'Save changes' : 'Add task'}
        onClose={() => setEditing(null)}
        onSave={(d) => (editingTask ? update(editingTask, d) : create(d))}
        onDelete={editingTask ? () => remove(editingTask) : undefined} />
      <FormSheet template={filling} open={!!filling} onClose={() => setFilling(null)} onDone={() => reload()} />
      {dialog}
    </div>
  );
}

// ───────── board (desktop) ─────────

type CardProps = {
  templateOf: (t: Task) => Template | null;
  fromName: (t: Task) => string | null;
  onMove: (t: Task, s: TaskStatus) => void;
  onOpen: (t: Task) => void;
  onFill: (tpl: Template) => void;
};

function Board({ grouped, cardProps, onDropTask }: { grouped: Record<TaskStatus, Task[]>; cardProps: CardProps; onDropTask: (id: string, s: TaskStatus) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  function onDragOver(e: DragEvent, s: TaskStatus) {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== s) setOver(s);
  }
  function onDrop(e: DragEvent, s: TaskStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setOver(null);
    setDragId(null);
    if (id) onDropTask(id, s);
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-2">
      <div className="grid grid-cols-[repeat(4,minmax(220px,1fr))] gap-4 items-start">
        {TASK_ORDER.map((s) => (
          <section key={s} aria-label={TASK_STATUS[s].label}
            onDragOver={(e) => onDragOver(e, s)}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === s ? null : o)); }}
            onDrop={(e) => onDrop(e, s)}
            className={cx('rounded-2xl p-3 flex flex-col gap-3 min-h-72 border-2 transition-colors',
              over === s ? 'bg-brand-soft border-brand border-dashed' : 'bg-chip border-transparent')}>
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <h2 className="font-display text-[15px] font-semibold">{TASK_STATUS[s].label}</h2>
              <Chip tone={TASK_STATUS[s].tone}>{grouped[s].length}</Chip>
            </div>
            {grouped[s].map((t) => (
              <div key={t.id} draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.id); }}
                onDragEnd={() => { setDragId(null); setOver(null); }}
                className={cx('cursor-grab active:cursor-grabbing', dragId === t.id && 'opacity-50')}>
                <TaskCard task={t} {...cardProps} />
              </div>
            ))}
            {grouped[s].length === 0 && (
              <p className="text-sm text-muted text-center py-6 px-2 border border-dashed border-line rounded-xl">
                {dragId ? 'Drop here' : 'Nothing here yet'}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// ───────── card ─────────

function TaskCard({ task: t, compact, templateOf, fromName, onMove, onOpen, onFill }: CardProps & { task: Task; compact?: boolean }) {
  const i = TASK_ORDER.indexOf(t.status);
  const prev = i > 0 ? TASK_ORDER[i - 1]! : null;
  const next = i < TASK_ORDER.length - 1 ? TASK_ORDER[i + 1]! : null;
  const tpl = templateOf(t);
  const from = fromName(t);
  const done = t.status === 'done';

  return (
    <article className="bg-card border border-line rounded-xl p-3.5 flex flex-col gap-2.5 shadow-[0_1px_0_rgba(17,24,39,0.04)]">
      <button type="button" onClick={() => onOpen(t)} className="text-left cursor-pointer flex flex-col gap-1 min-h-11 -m-1 p-1 rounded-lg hover:bg-bg">
        <span className={cx('text-[15px] font-semibold leading-snug break-words', done && 'text-muted line-through decoration-1')}>{t.title}</span>
        {t.notes && <span className="text-sm text-muted leading-relaxed line-clamp-2 break-words">{t.notes}</span>}
      </button>
      {(t.due_date || from || tpl) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <DueChip task={t} />
          {tpl && <Chip tone="brand" icon="fileText">Form</Chip>}
          {from && <span className="text-[13px] text-muted">From {from}</span>}
        </div>
      )}
      {tpl && !done && (
        <Button variant="primary" size="sm" icon="pen" onClick={() => onFill(tpl)} className="self-start">Fill out</Button>
      )}
      {compact ? (
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-line-2">
          <span className="text-[13px] font-semibold text-muted pt-2">Status</span>
          <div className="w-40 pt-2">
            <Select aria-label={`Status of ${t.title}`} value={t.status} onChange={(e) => onMove(t, e.target.value as TaskStatus)}>
              {TASK_ORDER.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
            </Select>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1 -mx-1 -mb-1">
          <IconButton icon="chevronLeft" label={prev ? `Move to ${TASK_STATUS[prev].label}` : 'Already first'} disabled={!prev} onClick={() => prev && onMove(t, prev)} />
          {next && (
            <Button variant="ghost" size="sm" onClick={() => onMove(t, next)} iconRight="chevronRight">
              {next === 'doing' ? 'Start' : next === 'review' ? 'Send for review' : 'Mark done'}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
