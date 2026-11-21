// Practice versions of everyday tools: a task manager, a day calendar, an inbox and a team chat channel.
// They look like RAMP, behave like the real thing, and check the learner's work against what a good assistant does.
import { useMemo, useState, type ReactNode } from 'react';
import { cx, plural } from '../lib/util';
import { Button, Chip, Field, Icon, Input, Pills, Select, Sheet, Textarea } from '../ui';
import { ActivityHead, CheckButton, Mark, ResultBar, pct, type StepProps } from './kit';
import type { CalendarSim, Duration, Priority, TaskSim, TaskType, TriageAction, TriageSim } from './types';

// ───────── shared frame ─────────

function Frame({ icon, name, place, children, right }: { icon: string; name: string; place?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#D5D9E0] bg-white overflow-hidden shadow-[0_12px_32px_-18px_rgba(17,24,39,.35)]">
      <div className="h-11 px-3 flex items-center gap-2.5 bg-ink text-white">
        <span className="flex gap-1.5" aria-hidden="true"><i className="w-2.5 h-2.5 rounded-full bg-white/25" /><i className="w-2.5 h-2.5 rounded-full bg-white/25" /><i className="w-2.5 h-2.5 rounded-full bg-white/25" /></span>
        <Icon name={icon} size={16} />
        <span className="font-semibold text-[14px] truncate">{name}</span>
        {place && <span className="text-white/60 text-[13px] truncate">· {place}</span>}
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber text-ink text-[11px] font-bold tracking-[0.06em] px-2 py-0.5">PRACTICE</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Brief({ text, done, total, unit }: { text: string; done: number; total: number; unit: string }) {
  return (
    <div className="rounded-2xl bg-card border border-line p-4 flex gap-3 items-start">
      <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name="target" size={20} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-ink">Your job</p>
        <p className="text-[15.5px] leading-relaxed text-ink mt-0.5 whitespace-pre-line">{text}</p>
      </div>
      <span className="shrink-0 text-right">
        <span className="block font-display font-bold text-[22px] leading-none">{done}<span className="text-muted text-[15px]">/{total}</span></span>
        <span className="block text-[12px] text-muted mt-1">{unit}</span>
      </span>
    </div>
  );
}

const has = (hay: string, kw: string) => kw.split('|').some((k) => hay.toLowerCase().includes(k.trim().toLowerCase()));

// ───────── task manager ─────────

const VERBS = new Set(('create design complete contact develop review schedule update send research draft call book follow prepare organize organise set add '
  + 'confirm reply pay order renew cancel file submit write check plan find compare email text invite share upload record log sort process move '
  + 'reschedule buy arrange fix clean collect request ask remind finalize finalise build test train gather audit publish post print sign scan '
  + 'clear archive label assign coordinate outline summarize summarise transfer verify edit pick choose purchase register install reconcile '
  + 'respond notify forward map document set-up setup list rebook pull convert store').split(/\s+/));
const DURATIONS: Duration[] = ['Quick task', 'Small project', 'Big project'];
const DUR_HINT: Record<Duration, string> = { 'Quick task': '1–30 min', 'Small project': '30 min–2 h', 'Big project': '2 h+' };
const PRIORITIES: Priority[] = ['Low', 'Normal', 'High', 'Urgent'];
const TYPES: TaskType[] = ['Operational', 'Administrative'];
const PRI_TONE: Record<Priority, string> = { Low: 'text-muted', Normal: 'text-brand-ink', High: 'text-warn', Urgent: 'text-bad' };

interface SimTask { key: string; title: string; list: string; description: string; type: TaskType | ''; duration: Duration | ''; priority: Priority | ''; status: string; comments: string[]; req?: string; seeded?: boolean }

export function TaskSimStep({ block: b, onResult, review }: StepProps<TaskSim>) {
  const seeded = useMemo<SimTask[]>(() => (b.tasks || []).map((t, i) => ({
    key: `s${i}`, title: t.title, list: t.list, description: t.description || '', type: '', duration: '', priority: '', status: t.status || 'To do', comments: t.comments || [], seeded: true,
  })), [b]);
  const [tasks, setTasks] = useState<SimTask[]>(seeded);
  const [list, setList] = useState<string>(b.lists[0] || '');
  const [edit, setEdit] = useState<{ task: SimTask; req?: string; mode: 'create' | 'edit' | 'comment' } | null>(null);
  const [checked, setChecked] = useState<Record<string, { score: number; notes: string[] }> | null>(null);

  const handled = (rid: string) => {
    const r = b.requests.find((x) => x.id === rid)!;
    if ((r.action || 'create') === 'comment') return tasks.some((t) => t.title === r.task && t.comments.some((c) => c.startsWith(`[${rid}]`)));
    return tasks.some((t) => t.req === rid);
  };
  const doneCount = b.requests.filter((r) => handled(r.id)).length;

  function startRequest(rid: string) {
    const r = b.requests.find((x) => x.id === rid)!;
    if ((r.action || 'create') === 'comment') {
      const t = tasks.find((x) => x.title === r.task);
      if (t) setEdit({ task: t, req: rid, mode: 'comment' });
      return;
    }
    const existing = tasks.find((t) => t.req === rid);
    setEdit(existing ? { task: existing, req: rid, mode: 'edit' }
      : { task: { key: `n${Date.now()}`, title: '', list, description: '', type: '', duration: '', priority: '', status: 'To do', comments: [], req: rid }, req: rid, mode: 'create' });
  }

  function save(t: SimTask) {
    setTasks((all) => (all.some((x) => x.key === t.key) ? all.map((x) => (x.key === t.key ? t : x)) : [...all, t]));
    setList(t.list);
    setEdit(null);
    setChecked(null);
  }

  function check() {
    const out: Record<string, { score: number; notes: string[] }> = {};
    for (const r of b.requests) {
      const notes: string[] = []; let pass = 0, total = 0;
      const ok = (cond: boolean, msg: string) => { total++; if (cond) pass++; else notes.push(msg); };
      if ((r.action || 'create') === 'comment') {
        const t = tasks.find((x) => x.title === r.task);
        const c = (t?.comments || []).filter((x) => x.startsWith(`[${r.id}]`)).map((x) => x.replace(/^\[[^\]]+\]\s*/, '')).join(' ');
        ok(c.split(/\s+/).filter(Boolean).length >= 6, 'Write a fuller update: what happened, what’s next.');
        for (const k of r.expect.keywords || []) ok(has(c, k), `Mention ${k.split('|')[0]}.`);
      } else {
        const t = tasks.find((x) => x.req === r.id);
        if (!t) { out[r.id] = { score: 0, notes: ['Not logged yet.'] }; continue; }
        const words = t.title.trim().split(/\s+/).filter(Boolean);
        ok(VERBS.has((words[0] || '').toLowerCase().replace(/[^a-z-]/g, '')), 'Start the title with a verb, like “Send”, “Schedule” or “Review”.');
        ok(words.length >= 5, 'Make the title at least five words so it explains itself.');
        ok(t.description.trim().split(/\s+/).filter(Boolean).length >= 8, 'Add a description of a sentence or two: the why and what done looks like.');
        if (r.expect.list) ok(t.list === r.expect.list, `This belongs in the “${r.expect.list}” list.`);
        if (r.expect.type) ok(t.type === r.expect.type, `This is ${r.expect.type.toLowerCase()} work.`);
        else ok(!!t.type, 'Pick a task type.');
        if (r.expect.duration) ok(t.duration === r.expect.duration, `Label it “${r.expect.duration}” (${DUR_HINT[r.expect.duration]}).`);
        else ok(!!t.duration, 'Add a duration label.');
        if (r.expect.priority) ok(t.priority === r.expect.priority, `Priority should be ${r.expect.priority}.`);
        else ok(!!t.priority, 'Set a priority.');
        for (const k of r.expect.keywords || []) ok(has(`${t.title} ${t.description}`, k), `Include the detail “${k.split('|')[0]}”.`);
      }
      out[r.id] = { score: pct(pass, total), notes };
    }
    setChecked(out);
    const scores = Object.values(out).map((x) => x.score);
    onResult(Math.round(scores.reduce((a, c) => a + c, 0) / Math.max(1, scores.length)));
  }
  const overall = checked ? Math.round(Object.values(checked).reduce((a, c) => a + c.score, 0) / Math.max(1, b.requests.length)) : 0;
  const inList = tasks.filter((t) => t.list === list);

  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon="tasks" kind="Practice · task manager" title={b.title} />
      <Brief text={b.brief} done={doneCount} total={b.requests.length} unit="requests logged" />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <section aria-label="Requests from the owner" className="flex flex-col gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted px-1">Requests</p>
          {b.requests.map((r) => {
            const done = handled(r.id);
            const res = checked?.[r.id];
            return (
              <div key={r.id} className={cx('rounded-2xl border bg-white p-3 flex flex-col gap-2', res ? (res.score >= 100 ? 'border-good' : 'border-amber') : done ? 'border-good/40' : 'border-line')}>
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="w-7 h-7 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center">{r.from.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)}</span>
                  <span className="font-semibold">{r.from}</span>
                  {res ? <span className="ml-auto"><Chip tone={res.score >= 100 ? 'good' : 'warn'}>{res.score}%</Chip></span>
                    : done ? <span className="ml-auto"><Chip tone="good" icon="check">Logged</Chip></span> : null}
                </div>
                <p className="text-[14.5px] leading-snug">{r.text}</p>
                {res && res.notes.length > 0 && <ul className="text-[13px] text-warn list-disc pl-4 flex flex-col gap-0.5">{res.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                {res && r.why && <p className="text-[13px] text-ink-2">{r.why}</p>}
                {!review && (
                  <Button size="sm" variant={done ? 'secondary' : 'primary'} icon={(r.action || 'create') === 'comment' ? 'chat' : done ? 'pen' : 'plus'} onClick={() => startRequest(r.id)}>
                    {(r.action || 'create') === 'comment' ? (done ? 'Edit update' : 'Add an update') : done ? 'Edit task' : 'Log as a task'}
                  </Button>
                )}
              </div>
            );
          })}
        </section>
        <Frame icon="tasks" name="Task manager" place={b.space}>
          <div className="grid md:grid-cols-[180px_1fr] min-h-[340px]">
            <nav aria-label="Lists" className="border-b md:border-b-0 md:border-r border-line bg-[#FAFBFC] p-2 flex md:flex-col gap-1 overflow-x-auto">
              {b.space && <p className="hidden md:block px-2 pt-1 pb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">{b.space}</p>}
              {b.lists.map((l) => (
                <button key={l} type="button" onClick={() => setList(l)}
                  className={cx('shrink-0 text-left rounded-lg px-2.5 py-2 text-[14px] font-semibold flex items-center gap-2 cursor-pointer', l === list ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-chip')}>
                  <Icon name="list" size={15} /><span className="truncate">{l}</span>
                  <span className="ml-auto text-[12px] text-muted">{tasks.filter((t) => t.list === l).length}</span>
                </button>
              ))}
            </nav>
            <div className="min-w-0">
              <div className="hidden sm:grid grid-cols-[1fr_110px_100px_80px] gap-2 px-3 py-2 border-b border-line text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
                <span>Task</span><span>Duration</span><span>Type</span><span>Priority</span>
              </div>
              {inList.length === 0 && <p className="p-6 text-center text-sm text-muted">No tasks in {list} yet.</p>}
              {inList.map((t) => (
                <button key={t.key} type="button" disabled={review} onClick={() => setEdit({ task: t, req: t.req, mode: t.seeded ? 'comment' : 'edit' })}
                  className="w-full grid sm:grid-cols-[1fr_110px_100px_80px] gap-1 sm:gap-2 px-3 py-2.5 border-b border-line-2 text-left hover:bg-[#FAFBFC] cursor-pointer">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={cx('w-3.5 h-3.5 rounded-full border-2 shrink-0', t.status === 'Done' ? 'bg-good-2 border-good-2' : t.status === 'In progress' ? 'border-brand bg-brand-2' : 'border-[#AEB4BF]')} />
                    <span className="text-[14.5px] font-semibold truncate">{t.title || 'Untitled task'}</span>
                    {t.comments.length > 0 && <span className="text-[12px] text-muted inline-flex items-center gap-0.5"><Icon name="chat" size={13} />{t.comments.length}</span>}
                  </span>
                  <span className="text-[13px] text-ink-2">{t.duration || '—'}</span>
                  <span className="text-[13px] text-ink-2">{t.type || '—'}</span>
                  <span className={cx('text-[13px] font-semibold', t.priority ? PRI_TONE[t.priority] : 'text-muted')}>{t.priority || '—'}</span>
                </button>
              ))}
            </div>
          </div>
        </Frame>
      </div>
      {!review && (checked
        ? <ResultBar score={overall} onRetry={() => setChecked(null)} retryLabel="Fix and check again" extra={<span className="block text-sm text-ink-2 mt-1">Open a request to fix it, then check again.</span>} />
        : <CheckButton onClick={check} disabled={doneCount < b.requests.length} hint={doneCount < b.requests.length ? `Log ${plural(b.requests.length - doneCount, 'more request')} first.` : undefined} />)}
      {edit && <TaskSheet sim={b} edit={edit} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

function TaskSheet({ sim, edit, onClose, onSave }: { sim: TaskSim; edit: { task: SimTask; req?: string; mode: 'create' | 'edit' | 'comment' }; onClose: () => void; onSave: (t: SimTask) => void }) {
  const [t, setT] = useState<SimTask>(edit.task);
  const req = sim.requests.find((r) => r.id === edit.req);
  const mine = t.comments.find((c) => c.startsWith(`[${edit.req}]`));
  const [comment, setComment] = useState(mine ? mine.replace(/^\[[^\]]+\]\s*/, '') : '');
  const set = <K extends keyof SimTask>(k: K, v: SimTask[K]) => setT((x) => ({ ...x, [k]: v }));
  if (edit.mode === 'comment') {
    const others = t.comments.filter((c) => !c.startsWith(`[${edit.req}]`));
    return (
      <Sheet open onClose={onClose} title={t.title} subtitle={`${t.list} · ${t.status}`} wide
        footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="send" disabled={!comment.trim() || !edit.req}
          onClick={() => onSave({ ...t, comments: [...others, `[${edit.req}] ${comment.trim()}`] })}>Post update</Button></>}>
        {t.description && <p className="text-[15px] text-ink-2">{t.description}</p>}
        {req && <div className="rounded-xl bg-brand-soft p-3 text-[14px]"><span className="font-semibold">{req.from}:</span> {req.text}</div>}
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Comments</p>
          {others.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
          {others.map((c, i) => <div key={i} className="rounded-xl border border-line p-3 text-[14px]">{c.replace(/^\[[^\]]+\]\s*/, '')}</div>)}
        </div>
        {edit.req && <Field label="Your update"><Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What happened, what’s next, and @mention whoever needs to know." /></Field>}
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={onClose} title={edit.mode === 'create' ? 'New task' : 'Edit task'} wide
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" disabled={!t.title.trim()} onClick={() => onSave(t)}>Save task</Button></>}>
      {req && <div className="rounded-xl bg-brand-soft p-3 text-[14px]"><span className="font-semibold">{req.from}:</span> {req.text}</div>}
      <Field label="Task name"><Input value={t.title} onChange={(e) => set('title', e.target.value)} placeholder="Start with a verb, at least five words" /></Field>
      <Field label="List"><Select value={t.list} onChange={(e) => set('list', e.target.value)}>{sim.lists.map((l) => <option key={l}>{l}</option>)}</Select></Field>
      <Field label="Description"><Textarea rows={3} value={t.description} onChange={(e) => set('description', e.target.value)} placeholder="The why and the how, and what done looks like" /></Field>
      <div className="flex flex-col gap-2"><span className="text-[13px] font-semibold text-ink-2">Task type</span>
        <Pills size="sm" label="Task type" value={t.type || null} onChange={(v: TaskType) => set('type', v)} options={TYPES.map((x) => ({ value: x, label: x }))} /></div>
      <div className="flex flex-col gap-2"><span className="text-[13px] font-semibold text-ink-2">Duration label</span>
        <Pills size="sm" label="Duration" value={t.duration || null} onChange={(v: Duration) => set('duration', v)} options={DURATIONS.map((x) => ({ value: x, label: `${x} · ${DUR_HINT[x]}` }))} /></div>
      <div className="flex flex-col gap-2"><span className="text-[13px] font-semibold text-ink-2">Priority</span>
        <Pills size="sm" label="Priority" value={t.priority || null} onChange={(v: Priority) => set('priority', v)} options={PRIORITIES.map((x) => ({ value: x, label: x }))} /></div>
      <div className="flex flex-col gap-2"><span className="text-[13px] font-semibold text-ink-2">Status</span>
        <Pills size="sm" label="Status" value={t.status} onChange={(v: string) => set('status', v)} options={['To do', 'In progress', 'Done'].map((x) => ({ value: x, label: x }))} /></div>
    </Sheet>
  );
}

// ───────── day calendar ─────────

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fmt = (min: number) => { const h = Math.floor(min / 60), m = min % 60; const ap = h >= 12 ? 'PM' : 'AM'; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`; };
const ROW = 26; // px per 15 minutes

export function CalendarSimStep({ block: b, onResult, review }: StepProps<CalendarSim>) {
  const dayStart = b.start * 60, dayEnd = b.end * 60;
  const [placed, setPlaced] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, string[]> | null>(null);
  const events = b.events.map((e) => ({ ...e, s: toMin(e.start), e: toMin(e.end) }));
  const slots = Array.from({ length: (dayEnd - dayStart) / 15 }, (_, i) => dayStart + i * 15);
  const place = (start: number) => {
    if (!sel || review) return;
    const blk = b.blocks.find((x) => x.id === sel)!;
    const s = Math.min(start, dayEnd - blk.minutes);
    setPlaced((p) => ({ ...p, [sel]: s })); setSel(null); setChecked(null);
  };
  function check() {
    const out: Record<string, string[]> = {};
    for (const blk of b.blocks) {
      const s = placed[blk.id]; const notes: string[] = [];
      if (s == null) { out[blk.id] = ['Not placed.']; continue; }
      const e = s + blk.minutes;
      for (const ev of events) if (s < ev.e && e > ev.s) notes.push(`Overlaps “${ev.title}”.`);
      for (const other of b.blocks) {
        const os = placed[other.id];
        if (other.id !== blk.id && os != null && s < os + other.minutes && e > os) notes.push(`Overlaps “${other.title}”.`);
      }
      if (blk.after && s < toMin(blk.after)) notes.push(`Should start at ${fmt(toMin(blk.after))} or later.`);
      if (blk.before && e > toMin(blk.before)) notes.push(`Should be finished by ${fmt(toMin(blk.before))}.`);
      out[blk.id] = [...new Set(notes)];
    }
    setChecked(out);
    const right = Object.values(out).filter((n) => n.length === 0).length;
    onResult(pct(right, b.blocks.length));
  }
  const right = checked ? Object.values(checked).filter((n) => n.length === 0).length : 0;
  const allPlaced = b.blocks.every((x) => placed[x.id] != null);
  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon="calendar" kind="Practice · calendar" title={b.title} />
      <Brief text={b.brief} done={Object.keys(placed).length} total={b.blocks.length} unit="blocks placed" />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <section aria-label="Time blocks to place" className="flex flex-col gap-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted px-1">Time blocks</p>
          {b.blocks.map((blk) => {
            const notes = checked?.[blk.id];
            return (
              <button key={blk.id} type="button" disabled={review} onClick={() => setSel(sel === blk.id ? null : blk.id)} aria-pressed={sel === blk.id}
                className={cx('rounded-2xl border-2 p-3 text-left bg-white cursor-pointer', sel === blk.id ? 'border-brand ring-4 ring-brand/15' : notes ? (notes.length ? 'border-amber' : 'border-good') : 'border-line hover:border-brand')}>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-8 rounded-full bg-brand" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-[14.5px] leading-snug">{blk.title}</span>
                    <span className="block text-[12.5px] text-muted">{blk.minutes} min{placed[blk.id] != null ? ` · ${fmt(placed[blk.id]!)}` : ' · not placed'}</span>
                  </span>
                  {notes && <Mark ok={notes.length === 0} />}
                </span>
                {notes && notes.length > 0 && <span className="block text-[12.5px] text-warn mt-1.5">{notes.join(' ')}</span>}
                {notes && blk.why && <span className="block text-[12.5px] text-ink-2 mt-1">{blk.why}</span>}
              </button>
            );
          })}
          {sel && <p className="text-sm font-semibold text-brand-ink px-1">Now tap a start time on the calendar.</p>}
        </section>
        <Frame icon="calendar" name="Calendar" place={b.day}>
          <div className="relative max-h-[560px] overflow-y-auto">
            <div className="relative" style={{ height: slots.length * ROW }}>
              {slots.map((m, i) => (
                <button key={m} type="button" onClick={() => place(m)} disabled={!sel}
                  aria-label={sel ? `Start at ${fmt(m)}` : fmt(m)}
                  className={cx('absolute left-0 right-0 flex items-start border-t text-left', m % 60 === 0 ? 'border-line' : 'border-line-2 border-dashed', sel ? 'hover:bg-brand-soft cursor-pointer' : 'cursor-default')}
                  style={{ top: i * ROW, height: ROW }}>
                  {m % 60 === 0 && <span className="w-16 pl-2 -mt-px text-[11.5px] text-muted">{fmt(m).replace(':00', '')}</span>}
                </button>
              ))}
              {events.map((ev, i) => (
                <div key={i} className={cx('absolute left-16 right-2 rounded-lg px-2 py-1 text-[12.5px] overflow-hidden pointer-events-none border-l-4',
                  ev.kind === 'personal' ? 'bg-good-soft border-good-2' : ev.kind === 'focus' ? 'bg-warn-soft border-amber' : 'bg-chip border-[#8A93A0]')}
                  style={{ top: ((ev.s - dayStart) / 15) * ROW + 1, height: ((ev.e - ev.s) / 15) * ROW - 2 }}>
                  <span className="font-semibold">{ev.title}</span> <span className="text-muted">{fmt(ev.s)}–{fmt(ev.e)}</span>
                </div>
              ))}
              {b.blocks.filter((blk) => placed[blk.id] != null).map((blk) => {
                const s = placed[blk.id]!; const notes = checked?.[blk.id];
                return (
                  <button key={blk.id} type="button" disabled={review} onClick={() => { setSel(blk.id); }}
                    className={cx('absolute left-[40%] right-2 rounded-lg px-2 py-1 text-[12.5px] text-left text-white overflow-hidden shadow-md cursor-pointer', sel && 'pointer-events-none opacity-80',
                      notes ? (notes.length ? 'bg-warn' : 'bg-good') : 'bg-brand')}
                    style={{ top: ((s - dayStart) / 15) * ROW + 1, height: (blk.minutes / 15) * ROW - 2 }}>
                    <span className="font-semibold">{blk.title}</span> <span className="opacity-80">{fmt(s)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Frame>
      </div>
      {!review && (checked
        ? <ResultBar score={pct(right, b.blocks.length)} right={right} total={b.blocks.length} onRetry={() => setChecked(null)} retryLabel="Adjust and check again"
            extra={<span className="block text-sm text-ink-2 mt-1">Tap a block on the calendar to pick it up and move it.</span>} />
        : <CheckButton onClick={check} disabled={!allPlaced} label="Check my plan" hint={allPlaced ? undefined : 'Place every block first.'} />)}
    </div>
  );
}

// ───────── inbox and chat triage ─────────

const AI_WORDS = ['delve', 'leverage', 'utilize', 'ensure', 'it’s important to note', "it's important to note", 'furthermore', 'in today’s fast-paced', 'seamless', 'tapestry'];

const ACTIONS: Record<'inbox' | 'chat', { a: TriageAction; label: string; icon: string }[]> = {
  inbox: [
    { a: 'reply', label: 'Reply', icon: 'send' }, { a: 'task', label: 'Make a task', icon: 'tasks' }, { a: 'calendar', label: 'Add to calendar', icon: 'calendar' },
    { a: 'sync', label: 'Raise at the sync', icon: 'users' }, { a: 'forward', label: 'Forward to the owner', icon: 'mail' }, { a: 'archive', label: 'Archive', icon: 'folder' },
  ],
  chat: [
    { a: 'reply', label: 'Reply in thread', icon: 'chat' }, { a: 'task', label: 'Turn into a task', icon: 'tasks' }, { a: 'calendar', label: 'Add to calendar', icon: 'calendar' },
    { a: 'sync', label: 'Raise at the sync', icon: 'users' }, { a: 'note', label: 'Save to resources', icon: 'folder' }, { a: 'archive', label: 'Acknowledge only', icon: 'check' },
  ],
};

export function TriageSimStep({ block: b, onResult, review }: StepProps<TriageSim>) {
  const kind = b.tool;
  const acts = ACTIONS[kind];
  const label = (a: TriageAction) => acts.find((x) => x.a === a)?.label || a;
  const [open, setOpen] = useState<string>(b.messages[0]?.id || '');
  const [picks, setPicks] = useState<Record<string, TriageAction>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [checked, setChecked] = useState<Record<string, { score: number; notes: string[] }> | null>(null);
  const m = b.messages.find((x) => x.id === open);
  const handled = b.messages.filter((x) => picks[x.id]).length;

  function choose(a: TriageAction) {
    if (!m || review) return;
    if (a === 'reply') { setDraft(replies[m.id] || ''); setPicks((p) => ({ ...p, [m.id]: 'reply' })); setChecked(null); return; }
    setPicks((p) => ({ ...p, [m.id]: a }));
    setChecked(null);
    const next = b.messages.find((x) => !picks[x.id] && x.id !== m.id);
    if (next) setOpen(next.id);
  }
  function sendReply() {
    if (!m) return;
    setReplies((r) => ({ ...r, [m.id]: draft.trim() }));
    const next = b.messages.find((x) => !picks[x.id] && x.id !== m.id);
    if (next) setOpen(next.id);
  }
  function check() {
    const out: Record<string, { score: number; notes: string[] }> = {};
    for (const msg of b.messages) {
      const a = picks[msg.id]; const notes: string[] = [];
      if (!a) { out[msg.id] = { score: 0, notes: ['Not handled.'] }; continue; }
      if (!msg.expect.includes(a)) { out[msg.id] = { score: 0, notes: [`Better: ${msg.expect.map(label).join(' or ')}.`] }; continue; }
      let score = 100;
      if (a === 'reply') {
        const text = replies[msg.id] || '';
        if (!text) { score = 0; notes.push('Write the reply and send it.'); }
        for (const k of msg.reply?.mustInclude || []) if (!has(text, k)) { score = Math.min(score, 50); notes.push(`Your reply should mention ${k.split('|')[0]}.`); }
        const ai = AI_WORDS.filter((w) => text.toLowerCase().includes(w));
        if (ai.length) { score = Math.min(score, 50); notes.push(`Sounds like AI: “${ai[0]}”. Say it the way a person would.`); }
      }
      out[msg.id] = { score, notes };
    }
    setChecked(out);
    onResult(Math.round(Object.values(out).reduce((s, x) => s + x.score, 0) / Math.max(1, b.messages.length)));
  }
  const overall = checked ? Math.round(Object.values(checked).reduce((s, x) => s + x.score, 0) / Math.max(1, b.messages.length)) : 0;
  const replying = m && picks[m.id] === 'reply' && replies[m.id] == null;

  return (
    <div className="flex flex-col gap-5">
      <ActivityHead icon={kind === 'inbox' ? 'mail' : 'chat'} kind={kind === 'inbox' ? 'Practice · inbox' : 'Practice · team chat'} title={b.title} />
      <Brief text={b.brief} done={handled} total={b.messages.length} unit={kind === 'inbox' ? 'emails handled' : 'messages handled'} />
      <Frame icon={kind === 'inbox' ? 'mail' : 'chat'} name={kind === 'inbox' ? 'Inbox' : 'Chat'} place={kind === 'chat' ? `# ${b.place}` : b.place}
        right={<span className="text-[12px] text-white/70 hidden sm:inline">{b.messages.length - handled} left</span>}>
        <div className="grid md:grid-cols-[minmax(220px,300px)_1fr] min-h-[380px]">
          <ul className="border-b md:border-b-0 md:border-r border-line max-h-[420px] overflow-y-auto">
            {b.messages.map((x) => {
              const res = checked?.[x.id];
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => { setOpen(x.id); setDraft(replies[x.id] || ''); }}
                    className={cx('w-full text-left px-3 py-2.5 border-b border-line-2 flex gap-2.5 cursor-pointer', x.id === open ? 'bg-brand-soft' : 'hover:bg-[#FAFBFC]')}>
                    <span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', picks[x.id] ? 'bg-transparent' : 'bg-brand')} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2"><span className={cx('text-[14px] truncate', picks[x.id] ? 'font-medium text-ink-2' : 'font-bold')}>{x.from}</span><span className="ml-auto text-[11.5px] text-muted shrink-0">{x.time}</span></span>
                      {x.subject && <span className="block text-[13.5px] font-semibold truncate">{x.subject}</span>}
                      <span className="block text-[13px] text-muted truncate">{x.body}</span>
                      {picks[x.id] && <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-2"><Icon name="check" size={12} />{label(picks[x.id]!)}</span>}
                    </span>
                    {res && <Mark ok={res.score >= 100} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="p-4 flex flex-col gap-4 min-w-0">
            {m ? (
              <>
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-full bg-ink text-white text-sm font-bold flex items-center justify-center shrink-0">{m.from.split(/\s+/).map((w) => w[0]).join('').slice(0, 2)}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[15px]">{m.from} <span className="font-normal text-muted text-[13px]">· {m.time}</span></p>
                    {m.subject && <p className="font-display font-semibold text-[18px] leading-snug mt-0.5">{m.subject}</p>}
                  </div>
                </div>
                <p className="text-[15.5px] leading-relaxed whitespace-pre-line">{m.body}</p>
                {replies[m.id] != null && <div className="rounded-xl bg-brand-soft border border-brand/20 p-3 text-[14.5px] whitespace-pre-line"><span className="block text-[11.5px] font-bold uppercase tracking-[0.06em] text-brand-ink mb-1">Your reply</span>{replies[m.id]}</div>}
                {checked?.[m.id] && (
                  <div className={cx('rounded-xl p-3 text-[14px]', checked[m.id]!.score >= 100 ? 'bg-good-soft' : 'bg-warn-soft')}>
                    {checked[m.id]!.notes.map((n) => <p key={n} className="font-semibold">{n}</p>)}
                    <p className="text-ink-2 mt-0.5">{m.why}</p>
                  </div>
                )}
                {replying && !review && (
                  <div className="flex flex-col gap-2">
                    <Textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={m.reply?.hint || 'Write it the way you’d say it. Short and clear.'} aria-label="Your reply" />
                    <div className="flex gap-2"><Button variant="primary" icon="send" disabled={!draft.trim()} onClick={sendReply}>Send reply</Button>
                      <Button variant="ghost" onClick={() => setPicks((p) => { const n = { ...p }; delete n[m.id]; return n; })}>Cancel</Button></div>
                  </div>
                )}
                {!replying && !review && (
                  <div className="mt-auto pt-2 border-t border-line-2">
                    <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted mb-2">What will you do with it?</p>
                    <div className="flex flex-wrap gap-2">
                      {acts.map((x) => (
                        <button key={x.a} type="button" onClick={() => choose(x.a)}
                          className={cx('min-h-10 px-3 rounded-xl border text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer',
                            picks[m.id] === x.a ? 'bg-brand border-brand text-white' : 'bg-white border-[#C9CED6] text-ink-2 hover:bg-chip')}>
                          <Icon name={x.icon} size={15} />{x.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : <p className="text-muted text-sm">Pick a message.</p>}
          </div>
        </div>
      </Frame>
      {!review && (checked
        ? <ResultBar score={overall} onRetry={() => setChecked(null)} retryLabel="Change answers" />
        : <CheckButton onClick={check} disabled={handled < b.messages.length} label={kind === 'inbox' ? 'Check my inbox' : 'Check my triage'}
            hint={handled < b.messages.length ? `${plural(b.messages.length - handled, kind === 'inbox' ? 'email' : 'message')} still to handle.` : undefined} />)}
    </div>
  );
}
