// People › Training supervisors: pick a supervisor, tick the people they look after, save. A supervisor is the
// person's mentor_id: they see that person's training on My team, review their work, assign tasks and send reminders.
import { useEffect, useMemo, useState } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { LEVELS, cx, plural } from '../../lib/util';
import type { Level, Member } from '../../lib/types';
import { Avatar, Button, Chip, EmptyState, Field, SearchInput, Select, Sheet, useToast } from '../../ui';
import { FormError, personName } from './ops-common';

/** Who can supervise training. */
export const SUPERVISOR_LEVELS = new Set<Level>(['owner', 'admin', 'lead', 'mentor']);
/** Who can be supervised. */
const SUPERVISED = new Set<Level>(['lead', 'mentor', 'employee', 'trainee', 'guest']);

export function SupervisorsSheet({ open, onClose, members, onSaved, initial }: {
  open: boolean; onClose: () => void; members: Member[]; onSaved: (changed: Member[]) => void; initial?: string;
}) {
  const toast = useToast();
  const supervisors = useMemo(() => members.filter((m) => m.status !== 'inactive' && SUPERVISOR_LEVELS.has(m.level))
    .sort((a, b) => personName(a).localeCompare(personName(b))), [members]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    members.forEach((m) => { if (m.mentor_id && m.status !== 'inactive') c.set(m.mentor_id, (c.get(m.mentor_id) || 0) + 1); });
    return c;
  }, [members]);
  const [sup, setSup] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Open on the requested supervisor, else the one with the most people, else the first.
  useEffect(() => {
    if (!open) return;
    const first = initial || [...supervisors].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))[0]?.id || '';
    setSup(first); setSearch(''); setError('');
  }, [open, initial, supervisors, counts]);
  useEffect(() => {
    setPicked(new Set(members.filter((m) => sup && m.mentor_id === sup).map((m) => m.id)));
  }, [sup, members]);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const term = search.trim().toLowerCase();
  const people = members
    .filter((m) => m.id !== sup && m.status !== 'inactive' && SUPERVISED.has(m.level))
    .filter((m) => !term || [m.full_name, m.preferred_name, m.email].some((v) => (v || '').toLowerCase().includes(term)))
    .sort((a, b) => Number(b.level === 'trainee') - Number(a.level === 'trainee') || personName(a).localeCompare(personName(b)));
  const adding = members.filter((m) => picked.has(m.id) && m.mentor_id !== sup);
  const removing = members.filter((m) => !picked.has(m.id) && sup && m.mentor_id === sup);
  const changes = adding.length + removing.length;

  function toggle(id: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function save() {
    if (!sup || !changes) return;
    setBusy(true); setError('');
    try {
      if (adding.length) {
        const { error: e } = await supabase.from('ramp_members').update({ mentor_id: sup }).in('id', adding.map((m) => m.id));
        if (e) throw e;
      }
      if (removing.length) {
        const { error: e } = await supabase.from('ramp_members').update({ mentor_id: null }).in('id', removing.map((m) => m.id));
        if (e) throw e;
      }
      onSaved([...adding.map((m) => ({ ...m, mentor_id: sup })), ...removing.map((m) => ({ ...m, mentor_id: null }))]);
      const name = personName(byId.get(sup));
      toast(adding.length && !removing.length ? `${name} now supervises ${plural(adding.length, 'more person', 'more people')}.` : `Saved ${name}’s team.`);
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const supName = personName(byId.get(sup));
  return (
    <Sheet open={open} onClose={onClose} wide title="Training supervisors"
      subtitle="A supervisor follows someone’s training: they see progress on My team, review submitted work, assign tasks and send reminders. Mentors, leads and admins can supervise."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={busy} disabled={!sup || !changes}>
          {changes ? `Save ${plural(changes, 'change')}` : 'Save'}
        </Button>
      </>}>
      {!supervisors.length ? (
        <EmptyState icon="users" title="No one can supervise yet" body="Give someone the Mentor, Department lead or Admin level first, on their People record." />
      ) : (
        <>
          <Field label="Supervisor">
            <Select value={sup} onChange={(e) => setSup(e.target.value)}>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>{personName(s)} · {LEVELS[s.level].label}{counts.get(s.id) ? ` · supervises ${counts.get(s.id)}` : ''}</option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="text-[15px] font-semibold">Who {supName.split(' ')[0]} supervises</p>
              <p className="text-sm text-muted">{plural(picked.size, 'person', 'people')} ticked</p>
            </div>
            {members.length > 8 && <SearchInput value={search} onChange={setSearch} placeholder="Search people" label="Search people" />}
            <ul className="flex flex-col rounded-2xl border border-line overflow-hidden">
              {people.map((m) => {
                const on = picked.has(m.id);
                const other = m.mentor_id && m.mentor_id !== sup ? byId.get(m.mentor_id) : null;
                return (
                  <li key={m.id} className="border-t border-line-2 first:border-t-0">
                    <label className={cx('flex items-center gap-3 min-h-14 px-4 py-2 cursor-pointer', on ? 'bg-brand-soft' : 'hover:bg-bg')}>
                      <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="w-5 h-5 shrink-0 accent-[var(--brand,#4338CA)]" />
                      <Avatar name={personName(m)} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold truncate">{personName(m)}</span>
                        <span className="block text-[13px] text-muted truncate">
                          {LEVELS[m.level].label}
                          {other && !on && <> · supervised by {personName(other)}</>}
                          {other && on && <> · moves from {personName(other)}</>}
                          {!m.mentor_id && !on && <> · no supervisor</>}
                        </span>
                      </span>
                      {on && m.mentor_id !== sup && <Chip tone="brand">Adding</Chip>}
                      {!on && m.mentor_id === sup && <Chip tone="warn">Removing</Chip>}
                    </label>
                  </li>
                );
              })}
              {!people.length && <li className="px-4 py-6 text-sm text-muted text-center">No one matches.</li>}
            </ul>
          </div>
          <FormError error={error} />
        </>
      )}
    </Sheet>
  );
}
