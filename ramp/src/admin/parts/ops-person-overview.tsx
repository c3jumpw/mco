// Person profile: shared data shape, admin actions (level, role, mentor, pause, graduate, remove) and the Overview tab.

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { invalidateDirectory, useDirectory } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { latestFor, onboardingDocs, planSummary, type PlanItem } from '../../lib/plan';
import { LEVELS, LEVEL_ORDER, ago, cx, displayName, firstName, fmtDate, fmtDateTime, rankOf } from '../../lib/util';
import type { Department, FlowStepId, JobRole, Level, Member, Module, Progress, RoleModule, Submission, Template } from '../../lib/types';
import { Button, Card, CardHeader, Field, Icon, Input, Notice, Pills, Progress as Bar, Select, Sheet, useConfirm, useToast } from '../../ui';
import { ActionRow, DefList, FormError, LevelChip, personName } from './ops-common';
import { mentorOptions } from './ops-invite';

export type PersonLite = Pick<Member, 'id' | 'full_name' | 'preferred_name' | 'email' | 'level' | 'status'>;

export interface PersonData {
  member: Member;
  roles: JobRole[];
  depts: Department[];
  people: PersonLite[];
  modules: Module[];
  roleModules: RoleModule[];
  progress: Progress[];
  templates: Template[];
  subs: Submission[];
}

export const SOURCE_LABEL: Record<Member['source'], string> = {
  manual: 'Invited in RAMP', hiring: 'Hiring app', staff: 'Staff records', request: 'Access request', seed: 'Set up with RAMP',
};

// ───────── admin actions ─────────

export function useMemberActions(member: Member, roles: JobRole[], plan: PlanItem[], setMember: (m: Member) => void) {
  const { me, refresh } = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState('');
  const name = personName(member);
  const self = member.id === me.id;

  const update = useCallback(async (patch: Partial<Member>, done: string) => {
    const { data, error } = await supabase.from('ramp_members').update(patch).eq('id', member.id).select('*').single();
    if (error) throw error;
    setMember(data as Member);
    invalidateDirectory();
    toast(done);
    if (self) refresh();
  }, [member.id, setMember, toast, self, refresh]);

  async function graduate() {
    const role = roles.find((r) => r.id === member.job_role_id);
    const next: Level = role?.level || 'employee';
    const s = planSummary(plan);
    const ok = await confirm({
      title: `Graduate ${name}?`,
      body: `They move from Trainee to ${LEVELS[next].label} access${role ? `, as set for ${role.title}` : ''}. ${LEVELS[next].scope}`
        + (s.total && s.done < s.total ? ` They’ve finished ${s.done} of ${s.total} assigned modules.` : ''),
      action: 'Graduate',
    });
    if (!ok) return;
    setBusy('graduate');
    try {
      const { data, error } = await supabase.rpc('ramp_graduate', { p_member: member.id });
      if (error) throw error;
      const { data: row, error: e2 } = await supabase.from('ramp_members').select('*').eq('id', member.id).single();
      if (e2) throw e2;
      setMember(row as Member);
      invalidateDirectory();
      toast(`${name} graduated to ${LEVELS[(data as Level) || next]?.label || 'Employee'}.`);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  async function setPaused(paused: boolean) {
    const ok = await confirm(paused ? {
      title: `Pause ${name}’s access?`,
      body: 'They lose access to RAMP right away and can’t sign in. Their training, documents and records are kept, and you can restore access at any time.',
      action: 'Pause access', danger: true,
    } : {
      title: `Restore ${name}’s access?`,
      body: member.auth_user_id ? 'They can sign in again and pick up where they left off.' : 'Their invite works again, so they can create a login.',
      action: 'Restore access',
    });
    if (!ok) return;
    setBusy('pause');
    try {
      await update({ status: paused ? 'inactive' : member.auth_user_id ? 'active' : 'invited' }, paused ? 'Access paused.' : 'Access restored.');
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Remove ${name} from RAMP?`,
      body: 'This permanently deletes their profile, training progress, documents, tasks, notebook and sign-in history. The audit log keeps a note that they were removed. To keep their records, pause their access instead.',
      action: 'Remove permanently', danger: true,
    });
    if (!ok) return;
    setBusy('remove');
    try {
      const { error } = await supabase.from('ramp_members').delete().eq('id', member.id);
      if (error) throw error;
      invalidateDirectory();
      toast(`${name} was removed.`);
      navigate('/admin/people', { replace: true });
    } catch (e) {
      toast(errText(e), 'bad');
      setBusy('');
    }
  }

  return { update, graduate, setPaused, remove, busy, dialog, self };
}

export type MemberActions = ReturnType<typeof useMemberActions>;

// ───────── Overview tab ─────────

const FLOW_LABEL: Record<FlowStepId, { label: string; desc: string }> = {
  welcome: { label: 'Welcome', desc: 'Opened RAMP and saw the welcome message' },
  profile: { label: 'Profile', desc: 'Name and phone number' },
  practice: { label: 'Platform practice', desc: 'The interactive RAMP sandbox' },
  documents: { label: 'Onboarding documents', desc: 'Forms and signatures due in the welcome flow' },
  mentor: { label: 'Meet their mentor', desc: 'Introduced to the person they go to with questions' },
  done: { label: 'Finished onboarding', desc: 'First-week tasks added' },
};

type EditField = 'level' | 'job_role' | 'department' | 'mentor' | 'start_date' | 'access_until';

export function OverviewTab({ d, plan, actions }: { d: PersonData; plan: PlanItem[]; actions: MemberActions }) {
  const { org, me } = useMe();
  const tz = org.timezone;
  const m = d.member;
  const [edit, setEdit] = useState<EditField | null>(null);
  const closeEdit = useCallback(() => setEdit(null), []);
  const role = d.roles.find((r) => r.id === m.job_role_id) || null;
  const dept = d.depts.find((x) => x.id === m.department_id) || null;
  const nameOf = (id: string | null) => {
    const p = id ? d.people.find((x) => x.id === id) : null;
    return p ? personName(p) : null;
  };
  const ownerLocked = m.level === 'owner' && me.level !== 'owner';

  const docs = onboardingDocs(m, d.templates);
  const docsDone = docs.filter((t) => latestFor(t.id, d.subs)).length;
  const onboarded = !!m.onboarded_at;
  const stepDone: Record<FlowStepId, boolean> = {
    welcome: !!m.joined_at,
    profile: onboarded || !!(m.full_name.trim() && m.phone.trim()),
    practice: !!m.practice_done_at,
    documents: docsDone === docs.length && (onboarded || !!m.joined_at),
    mentor: onboarded,
    done: onboarded,
  };
  const steps = (org.flow || []).filter((s) => s.on);
  const stepsDone = steps.filter((s) => stepDone[s.id]).length;

  const when = (v: string | null, empty = 'Not yet') => (v ? fmtDateTime(v, tz) : empty);
  const details = [
    { label: 'Email', value: <span className="break-all">{m.email}</span> },
    { label: 'Phone', value: m.phone || <span className="text-muted">Not added yet</span> },
    { label: 'Time zone', value: m.timezone || <span className="text-muted">Not set (company time zone is {tz})</span> },
    { label: 'Source', value: <>{SOURCE_LABEL[m.source]}{m.source_ref && <span className="text-muted text-sm font-mono"> · {m.source_ref.slice(0, 8)}</span>}</> },
    { label: 'Invited', value: <>{when(m.invited_at)}{nameOf(m.invited_by) && <span className="text-muted"> by {nameOf(m.invited_by)}</span>}</> },
    { label: 'Joined', value: when(m.joined_at, 'Hasn’t created a login yet') },
    { label: 'Finished onboarding', value: when(m.onboarded_at) },
    { label: 'Practice done', value: when(m.practice_done_at) },
    { label: 'Graduated', value: m.level === 'trainee' || m.graduated_at ? when(m.graduated_at) : <span className="text-muted">Didn’t start as a trainee</span> },
    { label: 'Last seen', value: m.last_seen_at ? <>{ago(m.last_seen_at)} <span className="text-muted text-sm">({fmtDateTime(m.last_seen_at, tz)})</span></> : 'Never' },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
      <div className="flex flex-col gap-5 min-w-0">
        <Card>
          <CardHeader title="Details" className="mb-4" />
          <DefList items={details} />
        </Card>

        <Card>
          <CardHeader title="Onboarding" subtitle={rankOf(m.level) <= 2 && !onboarded ? 'Owners and admins can skip the welcome flow.' : `${stepsDone} of ${steps.length} steps done`} className="mb-3" />
          <Bar value={steps.length ? (stepsDone / steps.length) * 100 : 0} tone={stepsDone === steps.length ? 'good' : 'brand'} label="Onboarding steps done" className="mb-3" />
          <ol className="flex flex-col">
            {steps.map((s, i) => {
              const done = stepDone[s.id];
              return (
                <li key={s.id} className="flex items-start gap-3 py-2.5 border-t border-line-2 first:border-t-0">
                  <span className={cx('w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold', done ? 'bg-good-soft text-good' : 'bg-chip text-muted')}>
                    {done ? <Icon name="check" size={15} strokeWidth={2.6} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{FLOW_LABEL[s.id].label}<span className="sr-only">{done ? ', done' : ', not done'}</span></p>
                    <p className="text-[13px] text-muted">
                      {s.id === 'documents' ? (docs.length ? `${docsDone} of ${docs.length} done` : 'None assigned') : FLOW_LABEL[s.id].desc}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      <div className="flex flex-col gap-5 min-w-0">
        <Card>
          <CardHeader title="Access and role" className="mb-1" />
          <ActionRow label="Access level" value={<LevelChip level={m.level} />} hint={LEVELS[m.level].scope}
            action={<Button size="sm" onClick={() => setEdit('level')} disabled={ownerLocked} aria-label="Change access level">Change</Button>} />
          {ownerLocked && <p className="text-xs text-muted -mt-1 mb-2">Only an owner can change an owner.</p>}
          <ActionRow label="Job role" value={role?.title || <span className="text-muted">None</span>}
            action={<Button size="sm" onClick={() => setEdit('job_role')} disabled={ownerLocked} aria-label="Change job role">Change</Button>} />
          <ActionRow label="Department" value={dept?.name || <span className="text-muted">None</span>}
            action={<Button size="sm" onClick={() => setEdit('department')} disabled={ownerLocked} aria-label="Change department">Change</Button>} />
          <ActionRow label="Mentor" value={nameOf(m.mentor_id) || <span className="text-muted">None</span>}
            action={<Button size="sm" onClick={() => setEdit('mentor')} disabled={ownerLocked} aria-label="Change mentor">Change</Button>} />
          <ActionRow label="Start date" value={m.start_date ? fmtDate(m.start_date, { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="text-muted">Not set</span>}
            action={<Button size="sm" onClick={() => setEdit('start_date')} disabled={ownerLocked} aria-label="Change start date">Change</Button>} />
          {m.level === 'guest' && (
            <ActionRow label="Guest access until" value={m.access_until ? fmtDate(m.access_until, { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="text-muted">No end date</span>}
              action={<Button size="sm" onClick={() => setEdit('access_until')} aria-label="Change guest access end date">Change</Button>} />
          )}
        </Card>

        {m.level === 'trainee' && m.status !== 'inactive' && !!m.auth_user_id && (
          <Card>
            <CardHeader title="Graduate" subtitle={`When training is done, move them to ${LEVELS[role?.level || 'employee'].label} access${role ? ` (set by ${role.title})` : ''}.`} className="mb-3" />
            <Button variant="success" icon="star" onClick={actions.graduate} loading={actions.busy === 'graduate'}>Graduate {firstName(m)}</Button>
          </Card>
        )}

        <Card>
          <CardHeader title="Pause or remove" subtitle={actions.self ? 'You can’t pause or remove yourself. Ask another admin.' : 'Pausing keeps their records. Removing deletes them.'} className="mb-3" />
          <div className="flex flex-wrap gap-2">
            {m.status === 'inactive'
              ? <Button icon="refresh" onClick={() => actions.setPaused(false)} loading={actions.busy === 'pause'} disabled={actions.self || ownerLocked}>Restore access</Button>
              : <Button icon="lock" onClick={() => actions.setPaused(true)} loading={actions.busy === 'pause'} disabled={actions.self || ownerLocked}>Pause access</Button>}
            <Button variant="danger" icon="trash" onClick={actions.remove} loading={actions.busy === 'remove'} disabled={actions.self || ownerLocked}>Remove person</Button>
          </div>
        </Card>
      </div>

      <EditSheet field={edit} d={d} onClose={closeEdit} onSave={actions.update} />
    </div>
  );
}

// ───────── edit sheet (one field at a time) ─────────

function EditSheet({ field, d, onClose, onSave }: { field: EditField | null; d: PersonData; onClose: () => void; onSave: MemberActions['update'] }) {
  if (!field) return null;
  return <EditBody key={field} field={field} d={d} onClose={onClose} onSave={onSave} />;
}

function EditBody({ field, d, onClose, onSave }: { field: EditField; d: PersonData; onClose: () => void; onSave: MemberActions['update'] }) {
  const { me } = useMe();
  const dir = useDirectory();
  const m = d.member;
  const name = personName(m);
  const initial = {
    level: m.level, job_role: m.job_role_id || '', department: m.department_id || '', mentor: m.mentor_id || '',
    start_date: m.start_date || '', access_until: m.access_until || '',
  }[field];
  const [value, setValue] = useState<string>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mentors = useMemo(() => {
    const list = mentorOptions(dir.list, m.id).map((x) => ({ id: x.id, label: `${displayName(x)}${x.job_title ? ` · ${x.job_title}` : ''}` }));
    if (m.mentor_id && !list.some((x) => x.id === m.mentor_id)) {
      const cur = d.people.find((p) => p.id === m.mentor_id);
      list.unshift({ id: m.mentor_id, label: `${cur ? personName(cur) : 'Current mentor'} (no longer active)` });
    }
    return list;
  }, [dir.list, m.id, m.mentor_id, d.people]);

  const levels = LEVEL_ORDER.filter((l) => l !== 'owner' || me.level === 'owner').map((l) => ({ value: l, label: LEVELS[l].label }));
  const newRole = field === 'job_role' ? d.roles.find((r) => r.id === value) : null;
  const newRoleDept = newRole?.department_id ? d.depts.find((x) => x.id === newRole.department_id) : null;

  const meta: Record<EditField, { title: string; action: string }> = {
    level: { title: `Access level for ${name}`, action: value !== m.level ? `Change to ${LEVELS[value as Level]?.label}` : 'Save' },
    job_role: { title: `Job role for ${name}`, action: 'Save job role' },
    department: { title: `Department for ${name}`, action: 'Save department' },
    mentor: { title: `Mentor for ${name}`, action: 'Save mentor' },
    start_date: { title: `Start date for ${name}`, action: 'Save start date' },
    access_until: { title: `Guest access for ${name}`, action: 'Save end date' },
  };

  async function save() {
    setError('');
    let patch: Partial<Member>;
    let done: string;
    if (field === 'level') { patch = { level: value as Level }; done = `Access changed to ${LEVELS[value as Level].label}.`; }
    else if (field === 'job_role') {
      patch = { job_role_id: value || null, ...(newRole?.department_id ? { department_id: newRole.department_id } : {}) };
      done = value ? `Job role changed to ${newRole?.title}.` : 'Job role cleared.';
    } else if (field === 'department') { patch = { department_id: value || null }; done = 'Department saved.'; }
    else if (field === 'mentor') { patch = { mentor_id: value || null }; done = value ? 'Mentor saved.' : 'Mentor cleared.'; }
    else if (field === 'start_date') { patch = { start_date: value || null }; done = value ? 'Start date saved.' : 'Start date cleared.'; }
    else { patch = { access_until: value || null }; done = value ? 'End date saved.' : 'End date cleared.'; }
    setBusy(true);
    try {
      await onSave(patch, done);
      onClose();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  const selfDemote = field === 'level' && m.id === me.id && rankOf(value as Level) > 2;

  return (
    <Sheet open onClose={onClose} title={meta[field].title}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={selfDemote ? 'danger' : 'primary'} onClick={save} loading={busy} disabled={value === initial}>{meta[field].action}</Button></>}>
      {field === 'level' && (
        <>
          <Pills options={levels} value={value as Level} onChange={setValue} label="Access level" size="sm" />
          <Notice tone="brand" icon="shield"><span className="font-semibold">{LEVELS[value as Level].label}:</span> {LEVELS[value as Level].scope}</Notice>
          {m.level === 'trainee' && value !== 'trainee' && value !== 'guest' && (
            <p className="text-[13px] text-muted">Finished training? Use <span className="font-semibold">Graduate</span> instead. It also records their graduation date.</p>
          )}
          {value === 'owner' && <Notice tone="warn" icon="alert">Owners can do everything in RAMP, including changing or removing other owners.</Notice>}
          {selfDemote && <Notice tone="bad" icon="alert">This is your own access. You’ll lose the admin pages as soon as you save.</Notice>}
          {me.level !== 'owner' && <p className="text-[13px] text-muted">Only an owner can make someone an owner.</p>}
        </>
      )}
      {field === 'job_role' && (
        <Field label="Job role" hint={newRoleDept ? `Their department changes to ${newRoleDept.name} to match.` : 'Their role track training updates right away.'}>
          <Select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">No job role</option>
            {d.roles.map((r) => {
              const dn = d.depts.find((x) => x.id === r.department_id)?.name;
              return <option key={r.id} value={r.id}>{r.title}{dn ? ` · ${dn}` : ''}</option>;
            })}
          </Select>
        </Field>
      )}
      {field === 'department' && (
        <Field label="Department" hint="Department leads see the progress of people in their department.">
          <Select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">No department</option>
            {d.depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
      )}
      {field === 'mentor' && (
        <Field label="Mentor" hint="Mentors see their trainees’ progress and review their work.">
          <Select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">No mentor</option>
            {mentors.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>
        </Field>
      )}
      {(field === 'start_date' || field === 'access_until') && (
        <>
          <Field label={field === 'start_date' ? 'Start date' : 'Last day of access'}
            hint={field === 'start_date' ? 'Training due dates count from this day.' : 'After this day they can’t sign in. Leave empty for no end date.'}>
            <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          {value && <Button variant="ghost" size="sm" className="self-start" onClick={() => setValue('')}>Clear date</Button>}
        </>
      )}
      <FormError error={error} />
    </Sheet>
  );
}
