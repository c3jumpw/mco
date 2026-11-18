// Placement › Checklist: onboarding steps grouped by who does them. Ticking goes through ramp_step_toggle
// (so it's recorded who did it); admins add, rename, move and remove steps directly.

import { useState, type FormEvent } from 'react';
import { supabase, errText } from '../../../lib/supabase';
import { useMe } from '../../../lib/session';
import { STEP_OWNER, cx, fmtDate, plural } from '../../../lib/util';
import type { PlacementStep, StepOwner } from '../../../lib/types';
import { Button, Card, Icon, IconButton, Input, Progress, Select, Switch, useConfirm, useToast } from '../../../ui';

const OWNERS: StepOwner[] = ['agency', 'client', 'va'];
const OWNER_DESC: Record<StepOwner, string> = {
  agency: 'Things we do: agreements, kickoff, explaining hours and pay.',
  client: 'The client ticks these in their portal: access, SOPs, priorities.',
  va: 'The team member ticks these on My work: payout details, accounts.',
};

export const sortSteps = (s: PlacementStep[]) => [...s].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));

export function ChecklistTab({ placementId, steps, setSteps, nameOf }: {
  placementId: string; steps: PlacementStep[]; setSteps: (fn: (s: PlacementStep[]) => PlacementStep[]) => void; nameOf: (id: string | null) => string;
}) {
  const { me } = useMe();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const ordered = sortSteps(steps);
  const done = ordered.filter((s) => s.done_at).length;

  async function toggle(s: PlacementStep) {
    const on = !s.done_at;
    const before = s;
    setSteps((all) => all.map((x) => (x.id === s.id ? { ...x, done_at: on ? new Date().toISOString() : null, done_by: on ? me.id : null } : x)));
    const { error } = await supabase.rpc('ramp_step_toggle', { p_step: s.id, p_done: on });
    if (error) {
      setSteps((all) => all.map((x) => (x.id === s.id ? before : x)));
      toast(errText(error), 'bad');
    }
  }

  async function patch(s: PlacementStep, change: Partial<PlacementStep>, ok?: string) {
    const before = s;
    setSteps((all) => all.map((x) => (x.id === s.id ? { ...x, ...change } : x)));
    const { error } = await supabase.from('ramp_placement_steps').update(change).eq('id', s.id);
    if (error) {
      setSteps((all) => all.map((x) => (x.id === s.id ? before : x)));
      toast(errText(error), 'bad');
    } else if (ok) toast(ok);
  }

  async function move(s: PlacementStep, dir: -1 | 1) {
    const group = ordered.filter((x) => x.owner === s.owner);
    const other = group[group.findIndex((x) => x.id === s.id) + dir];
    if (!other) return;
    const next = ordered.slice();
    const a = next.findIndex((x) => x.id === s.id), b = next.findIndex((x) => x.id === other.id);
    next[a] = other;
    next[b] = s;
    const renum = next.map((x, i) => ({ ...x, sort: i }));
    const changed = renum.filter((x) => ordered.find((o) => o.id === x.id)!.sort !== x.sort);
    setSteps(() => renum);
    const results = await Promise.all(changed.map((x) => supabase.from('ramp_placement_steps').update({ sort: x.sort }).eq('id', x.id)));
    const bad = results.find((r) => r.error);
    if (bad) {
      setSteps(() => ordered);
      toast(errText(bad.error), 'bad');
    }
  }

  async function remove(s: PlacementStep) {
    const ok = await confirm({ title: 'Remove this step?', body: `“${s.title}” is removed from this placement’s checklist. The default checklist in Agency settings doesn’t change.`, action: 'Remove step', danger: true });
    if (!ok) return;
    setSteps((all) => all.filter((x) => x.id !== s.id));
    const { error } = await supabase.from('ramp_placement_steps').delete().eq('id', s.id);
    if (error) {
      setSteps((all) => [...all, s]);
      toast(errText(error), 'bad');
    } else toast('Step removed.');
  }

  async function add(owner: StepOwner, title: string) {
    const sort = ordered.reduce((m, x) => Math.max(m, x.sort), -1) + 1;
    const { data, error } = await supabase.from('ramp_placement_steps').insert({ placement_id: placementId, title, owner, sort }).select('*').single();
    if (error) { toast(errText(error), 'bad'); return false; }
    setSteps((all) => [...all, data as PlacementStep]);
    return true;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold">{ordered.length ? `${done} of ${plural(ordered.length, 'step')} done` : 'No steps yet'}</p>
            <p className="text-sm text-muted">Everyone on the placement sees this list. The client and the team member tick their own steps.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-2 cursor-pointer">
            Edit steps
            <Switch checked={editing} onChange={setEditing} label="Edit steps" />
          </label>
        </div>
        <Progress value={ordered.length ? (done / ordered.length) * 100 : 0} tone={ordered.length && done === ordered.length ? 'good' : 'brand'} label="Checklist done" />
      </Card>

      {OWNERS.map((owner) => {
        const rows = ordered.filter((s) => s.owner === owner);
        if (!rows.length && !editing) return null;
        const groupDone = rows.filter((s) => s.done_at).length;
        return (
          <Card key={owner} padded={false} className="overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h3 className="font-display text-lg font-semibold">{STEP_OWNER[owner].label} <span className="text-sm font-sans font-semibold text-muted">· {groupDone} of {rows.length}</span></h3>
              <p className="text-[13px] text-muted">{OWNER_DESC[owner]}</p>
            </div>
            <ul>
              {rows.map((s, i) => (
                <li key={s.id} className="flex items-center gap-1 pl-2 pr-1 border-t border-line-2">
                  {editing ? (
                    <EditRow s={s} first={i === 0} last={i === rows.length - 1} onMove={(d) => move(s, d)} onRemove={() => remove(s)}
                      onRename={(t) => patch(s, { title: t }, 'Step renamed.')} onOwner={(o) => patch(s, { owner: o }, `Moved to ${STEP_OWNER[o].label}.`)} />
                  ) : (
                    <button type="button" role="checkbox" aria-checked={!!s.done_at} onClick={() => toggle(s)}
                      className="flex-1 min-w-0 flex items-start gap-3 text-left px-2 py-3 min-h-14 cursor-pointer rounded-xl hover:bg-[#FAFBFC]">
                      <span className={cx('w-6 h-6 mt-0.5 rounded-md border-2 flex items-center justify-center shrink-0',
                        s.done_at ? 'bg-good-2 border-good-2 text-white' : 'border-field bg-white')}>
                        {s.done_at && <Icon name="check" size={15} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx('block text-[15px] leading-snug break-words', s.done_at ? 'text-muted line-through decoration-1' : 'font-semibold text-ink')}>{s.title}</span>
                        {s.done_at && <span className="block text-xs text-muted mt-0.5">Done {fmtDate(s.done_at)}{s.done_by ? ` by ${nameOf(s.done_by)}` : ''}</span>}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editing && <AddRow owner={owner} onAdd={add} />}
          </Card>
        );
      })}
      {!ordered.length && !editing && (
        <Card><p className="text-sm text-muted text-center">This placement has no checklist. Turn on Edit steps to add some.</p></Card>
      )}
      {dialog}
    </div>
  );
}

function EditRow({ s, first, last, onMove, onRemove, onRename, onOwner }: {
  s: PlacementStep; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onRemove: () => void; onRename: (t: string) => void; onOwner: (o: StepOwner) => void;
}) {
  const [title, setTitle] = useState(s.title);
  const commit = () => {
    const t = title.trim();
    if (!t) { setTitle(s.title); return; }
    if (t !== s.title) onRename(t.slice(0, 200));
  };
  return (
    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1 py-2">
      <Input aria-label="Step title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} className="flex-1 min-w-[200px]" />
      <span className="flex items-center gap-1 ml-auto">
        <span className="w-32 shrink-0">
          <Select aria-label="Who does this step" value={s.owner} onChange={(e) => onOwner(e.target.value as StepOwner)}>
            {OWNERS.map((o) => <option key={o} value={o}>{STEP_OWNER[o].label}</option>)}
          </Select>
        </span>
        <IconButton icon="chevronUp" label={`Move “${s.title}” up`} disabled={first} onClick={() => onMove(-1)} />
        <IconButton icon="chevronDown" label={`Move “${s.title}” down`} disabled={last} onClick={() => onMove(1)} />
        <IconButton icon="trash" label={`Remove “${s.title}”`} onClick={onRemove} className="text-bad" />
      </span>
    </div>
  );
}

function AddRow({ owner, onAdd }: { owner: StepOwner; onAdd: (owner: StepOwner, title: string) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    if (await onAdd(owner, t.slice(0, 200))) setTitle('');
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="flex gap-2 px-4 py-3 border-t border-line-2 bg-bg">
      <Input aria-label={`New step for ${STEP_OWNER[owner].label}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Add a step" />
      <Button type="submit" icon="plus" loading={busy} disabled={!title.trim()}>Add</Button>
    </form>
  );
}
