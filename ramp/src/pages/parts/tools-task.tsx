import { useId, useState, type FormEvent } from 'react';
import { errText } from '../../lib/supabase';
import { daysUntil, dueLabel, type Tone } from '../../lib/util';
import type { Task } from '../../lib/types';
import { Button, Chip, Field, Input, Notice, Sheet, Textarea } from '../../ui';

export interface TaskDraft { title: string; notes: string; due_date: string | null }

/** Tone for a due-date chip: overdue is bad, due today is a warning, anything else is neutral. */
export function dueTone(task: Pick<Task, 'due_date' | 'status'>): Tone {
  const n = daysUntil(task.due_date);
  if (n === null || task.status === 'done') return 'neutral';
  if (n < 0) return 'bad';
  if (n === 0) return 'warn';
  return 'neutral';
}

export function DueChip({ task }: { task: Pick<Task, 'due_date' | 'status'> }) {
  if (!task.due_date || task.status === 'done') return null;
  return <Chip tone={dueTone(task)} icon="calendar">{dueLabel(task.due_date)}</Chip>;
}

/** Open tasks first by due date (no date last), then by when they were added. */
export function byDue(a: Task, b: Task) {
  return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31') || a.created_at.localeCompare(b.created_at);
}

/**
 * Create or edit a task: title, notes and due date. `onSave` should throw on failure; the error is shown in the sheet.
 * Pass `onDelete` to show a delete button (the caller confirms).
 */
export function TaskSheet(props: {
  open: boolean;
  task: Task | null;
  heading: string;
  subtitle?: string;
  saveLabel: string;
  onClose: () => void;
  onSave: (d: TaskDraft) => Promise<void>;
  onDelete?: () => void;
}) {
  if (!props.open) return null;
  return <TaskForm key={props.task?.id || 'new'} {...props} />;
}

function TaskForm({ task, heading, subtitle, saveLabel, onClose, onSave, onDelete }: Parameters<typeof TaskSheet>[0]) {
  const formId = useId();
  const [title, setTitle] = useState(task?.title || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [due, setDue] = useState(task?.due_date || '');
  const [titleErr, setTitleErr] = useState('');
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = title.trim();
    if (!t) { setTitleErr('Give the task a name.'); return; }
    if (t.length > 200) { setTitleErr('Keep the name under 200 characters.'); return; }
    setBusy(true);
    setFail('');
    try {
      await onSave({ title: t, notes: notes.trim(), due_date: due || null });
    } catch (err) {
      setFail(errText(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title={heading} subtitle={subtitle}
      footer={
        <div className="flex flex-wrap items-center gap-2.5 w-full">
          {onDelete && <Button variant="danger" icon="trash" onClick={onDelete} disabled={busy}>Delete</Button>}
          <span className="flex-1" />
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>{saveLabel}</Button>
        </div>
      }>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="What needs to be done?" required error={titleErr}>
          <Input value={title} maxLength={200} placeholder="Start with a verb, like “Send the weekly report”"
            onChange={(e) => { setTitle(e.target.value); setTitleErr(''); }} aria-invalid={!!titleErr} />
        </Field>
        <Field label="Notes" hint="Details, links or what done looks like.">
          <Textarea value={notes} rows={4} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Due date" hint={due ? dueLabel(due) : 'Optional'}>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
      </form>
    </Sheet>
  );
}
