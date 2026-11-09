import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle, invalidateDirectory } from '../lib/hooks';
import { LEVELS, LEVEL_ORDER, displayName, plural } from '../lib/util';
import type { Department, JobRole, Member, RoleModule, Template } from '../lib/types';
import { Button, Card, Chip, EmptyState, ErrorBox, Field, IconButton, Input, Notice, PageHeader, Pills, Select, Sheet, Skeleton, Textarea, useConfirm, useToast } from '../ui';
import { ADMIN_BACK, MetaLine, SectionHead } from './parts/setup-kit';

type Person = Pick<Member, 'id' | 'full_name' | 'preferred_name' | 'email' | 'level' | 'status' | 'job_role_id' | 'department_id'>;
type Tpl = Pick<Template, 'id' | 'title' | 'audience' | 'job_role_id'>;
interface Data { depts: Department[]; roles: JobRole[]; people: Person[]; links: RoleModule[]; templates: Tpl[] }

const GRAD_LEVELS: JobRole['level'][] = ['employee', 'mentor', 'lead', 'admin'];

export default function Roles() {
  useTitle('Roles and departments');
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [editRole, setEditRole] = useState<JobRole | 'new' | null>(null);
  const [editDept, setEditDept] = useState<Department | 'new' | null>(null);

  const { data, error, loading, reload, setData } = useAsync<Data>(async () => {
    const [depts, roles, people, links, templates] = await Promise.all([
      q<Department[]>(supabase.from('ramp_departments').select('*').order('name')),
      q<JobRole[]>(supabase.from('ramp_job_roles').select('*').order('title')),
      q<Person[]>(supabase.from('ramp_members').select('id, full_name, preferred_name, email, level, status, job_role_id, department_id')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
      q<Tpl[]>(supabase.from('ramp_templates').select('id, title, audience, job_role_id')),
    ]);
    return { depts, roles, people, links, templates };
  }, []);

  const mutate = (fn: (d: Data) => Data) => setData((d) => fn(d as Data));
  const current = (data?.people || []).filter((p) => p.status !== 'inactive');
  const deptName = (id: string | null) => data?.depts.find((d) => d.id === id)?.name || '';
  const personName = (id: string | null) => {
    const p = data?.people.find((x) => x.id === id);
    return p ? displayName(p) : '';
  };

  function upsertRole(r: JobRole) {
    mutate((d) => ({ ...d, roles: [...d.roles.filter((x) => x.id !== r.id), r].sort((a, b) => a.title.localeCompare(b.title)) }));
  }
  function upsertDept(dep: Department) {
    mutate((d) => ({ ...d, depts: [...d.depts.filter((x) => x.id !== dep.id), dep].sort((a, b) => a.name.localeCompare(b.name)) }));
  }

  async function removeRole(r: JobRole) {
    if (!data) return;
    const people = current.filter((p) => p.job_role_id === r.id).length;
    const mods = data.links.filter((l) => l.job_role_id === r.id).length;
    const docs = data.templates.filter((t) => t.audience === 'role' && t.job_role_id === r.id).length;
    const parts = [
      people
        ? `${plural(people, 'person', 'people')} ${people === 1 ? 'has' : 'have'} this role. They keep their access level, but their job role will be empty, so role training and role documents stop applying to them until you give them a new role.`
        : 'Nobody has this role right now.',
      mods ? `Its training track (${plural(mods, 'module')}) is removed. The modules themselves stay.` : '',
      docs ? `${plural(docs, 'role-only document')} won’t go to anyone until you pick another role for ${docs === 1 ? 'it' : 'them'}.` : '',
    ].filter(Boolean);
    const ok = await confirm({ title: `Delete ${r.title}?`, body: parts.join(' '), action: 'Delete role', danger: true });
    if (!ok) return;
    const before = data;
    mutate((d) => ({
      ...d,
      roles: d.roles.filter((x) => x.id !== r.id),
      links: d.links.filter((l) => l.job_role_id !== r.id),
      people: d.people.map((p) => (p.job_role_id === r.id ? { ...p, job_role_id: null } : p)),
      templates: d.templates.map((t) => (t.job_role_id === r.id ? { ...t, job_role_id: null } : t)),
    }));
    const { error: e } = await supabase.from('ramp_job_roles').delete().eq('id', r.id);
    if (e) { setData(before); toast(errText(e), 'bad'); return; }
    invalidateDirectory();
    toast(`${r.title} deleted.`);
  }

  async function removeDept(dep: Department) {
    if (!data) return;
    const people = current.filter((p) => p.department_id === dep.id).length;
    const roles = data.roles.filter((r) => r.department_id === dep.id).length;
    let channels = 0;
    let posts = 0;
    try {
      const [c, a] = await Promise.all([
        supabase.from('ramp_channels').select('id', { count: 'exact', head: true }).eq('department_id', dep.id),
        supabase.from('ramp_announcements').select('id', { count: 'exact', head: true }).eq('department_id', dep.id),
      ]);
      channels = c.count || 0;
      posts = a.count || 0;
    } catch { /* counts are only for the warning */ }
    const parts = [
      people || roles
        ? `${[people && plural(people, 'person', 'people'), roles && plural(roles, 'job role')].filter(Boolean).join(' and ')} will no longer belong to a department. Nobody loses access.`
        : 'Nobody is in this department.',
      channels ? `Its department chat ${channels === 1 ? 'channel is' : 'channels are'} deleted with ${channels === 1 ? 'its' : 'their'} messages.` : '',
      posts ? `${plural(posts, 'department announcement')} ${posts === 1 ? 'is' : 'are'} deleted too.` : '',
      'This can’t be undone.',
    ].filter(Boolean);
    const ok = await confirm({ title: `Delete ${dep.name}?`, body: parts.join(' '), action: 'Delete department', danger: true });
    if (!ok) return;
    const before = data;
    mutate((d) => ({
      ...d,
      depts: d.depts.filter((x) => x.id !== dep.id),
      roles: d.roles.map((r) => (r.department_id === dep.id ? { ...r, department_id: null } : r)),
      people: d.people.map((p) => (p.department_id === dep.id ? { ...p, department_id: null } : p)),
    }));
    const { error: e } = await supabase.from('ramp_departments').delete().eq('id', dep.id);
    if (e) { setData(before); toast(errText(e), 'bad'); return; }
    invalidateDirectory();
    toast(`${dep.name} deleted.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow="Set up" title="Roles and departments"
        subtitle="Job roles decide which training and documents someone gets, and the access they move to when they graduate." />

      {loading && !data && <Skeleton rows={5} />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}

      {data && (
        <>
          <Card className="flex flex-col gap-4">
            <SectionHead title="Job roles" subtitle="Everyone starts as a trainee and moves to their role’s access level when they graduate."
              action={<Button variant="primary" icon="plus" onClick={() => setEditRole('new')}>Add job role</Button>} />
            {data.roles.length === 0 ? (
              <EmptyState icon="sliders" title="No job roles yet" body="Add the roles people are hired into, like Dispatcher or Account Manager. Each role gets its own training track."
                action={<Button variant="primary" icon="plus" onClick={() => setEditRole('new')}>Add your first role</Button>} />
            ) : (
              <ul className="flex flex-col -mx-5 -mb-5 border-t border-line-2">
                {data.roles.map((r) => {
                  const n = current.filter((p) => p.job_role_id === r.id).length;
                  const mods = data.links.filter((l) => l.job_role_id === r.id).length;
                  return (
                    <li key={r.id} className="flex items-center gap-2 pl-5 pr-2 py-3 border-b border-line-2 last:border-b-0">
                      <button type="button" onClick={() => setEditRole(r)} className="flex-1 min-w-0 text-left cursor-pointer min-h-11 flex flex-col justify-center gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[15px]">{r.title}</span>
                          <Chip tone={r.level === 'admin' ? 'dark' : r.level === 'employee' ? 'neutral' : 'brand'}>Graduates to {LEVELS[r.level].label}</Chip>
                        </span>
                        <MetaLine parts={[deptName(r.department_id) || 'No department', plural(n, 'person', 'people'), plural(mods, 'training module')]} />
                        {r.description && <span className="text-[13px] text-muted line-clamp-2">{r.description}</span>}
                      </button>
                      <IconButton icon="pen" label={`Edit ${r.title}`} onClick={() => setEditRole(r)} />
                      <IconButton icon="trash" label={`Delete ${r.title}`} onClick={() => removeRole(r)} className="text-bad" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          {data.roles.length > 0 && (
            <p className="text-sm text-muted -mt-3 px-1">Pick the modules each role learns on <Link to="/admin/assign" className="font-semibold text-brand-ink">Assign training</Link>.</p>
          )}

          <Card className="flex flex-col gap-4">
            <SectionHead title="Departments" subtitle="Departments group people and roles. Department leads see progress and reviews for their department only."
              action={<Button icon="plus" onClick={() => setEditDept('new')}>Add department</Button>} />
            {data.depts.length === 0 ? (
              <EmptyState icon="building" title="No departments yet" body="Add one for each team, like Operations or Sales. You can pick a lead for each."
                action={<Button icon="plus" onClick={() => setEditDept('new')}>Add a department</Button>} />
            ) : (
              <ul className="flex flex-col -mx-5 -mb-5 border-t border-line-2">
                {data.depts.map((dep) => {
                  const n = current.filter((p) => p.department_id === dep.id).length;
                  const roles = data.roles.filter((r) => r.department_id === dep.id).length;
                  const lead = personName(dep.lead_id);
                  return (
                    <li key={dep.id} className="flex items-center gap-2 pl-5 pr-2 py-3 border-b border-line-2 last:border-b-0">
                      <button type="button" onClick={() => setEditDept(dep)} className="flex-1 min-w-0 text-left cursor-pointer min-h-11 flex flex-col justify-center gap-0.5">
                        <span className="font-semibold text-[15px]">{dep.name}</span>
                        <MetaLine parts={[lead ? `Lead: ${lead}` : 'No lead yet', plural(n, 'person', 'people'), plural(roles, 'role')]} />
                      </button>
                      <IconButton icon="pen" label={`Edit ${dep.name}`} onClick={() => setEditDept(dep)} />
                      <IconButton icon="trash" label={`Delete ${dep.name}`} onClick={() => removeDept(dep)} className="text-bad" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      <Card className="flex flex-col gap-4" as="section">
        <SectionHead title="Access levels" subtitle="Each level includes what the levels below it can do, within its scope. Only owners and admins reach setup, people records and the audit log." />
        <ol className="flex flex-col -mx-5 -mb-5 border-t border-line-2">
          {LEVEL_ORDER.map((l) => {
            const v = LEVELS[l];
            return (
              <li key={l} className="flex gap-3.5 px-5 py-3.5 border-b border-line-2 last:border-b-0">
                <span className="w-8 h-8 rounded-full bg-chip text-ink-2 font-display font-bold flex items-center justify-center shrink-0" aria-label={`Level ${v.rank}`}>{v.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-[15px]">{v.label}</span>
                    <span className="text-[13px] text-muted">{v.who}</span>
                    {v.backend && <Chip tone="dark" icon="shield">Admin access</Chip>}
                  </p>
                  <p className="text-sm text-ink-2 leading-relaxed mt-0.5">{v.scope}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {data && editRole && (
        <RoleSheet role={editRole === 'new' ? null : editRole} depts={data.depts} people={editRole === 'new' ? 0 : current.filter((p) => p.job_role_id === editRole.id).length}
          onClose={() => setEditRole(null)} onSaved={(r, isNew) => { upsertRole(r); setEditRole(null); invalidateDirectory(); toast(isNew ? `${r.title} added. Next, pick its training on Assign training.` : `${r.title} saved.`); }} />
      )}
      {data && editDept && (
        <DeptSheet dept={editDept === 'new' ? null : editDept} people={data.people}
          onClose={() => setEditDept(null)} onSaved={(dep, isNew) => { upsertDept(dep); setEditDept(null); invalidateDirectory(); toast(isNew ? `${dep.name} added.` : `${dep.name} saved.`); }} />
      )}
      {dialog}
    </div>
  );
}

function RoleSheet({ role, depts, people, onClose, onSaved }: {
  role: JobRole | null; depts: Department[]; people: number; onClose: () => void; onSaved: (r: JobRole, isNew: boolean) => void;
}) {
  const [title, setTitle] = useState(role?.title || '');
  const [dept, setDept] = useState<string>(role?.department_id || (role ? '' : depts[0]?.id || ''));
  const [level, setLevel] = useState<JobRole['level']>(role?.level || 'employee');
  const [desc, setDesc] = useState(role?.description || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const titleErr = !title.trim() ? 'Give the role a title.' : title.trim().length > 100 ? 'Keep it to 100 characters or fewer.' : '';

  async function save() {
    setTried(true);
    setErr('');
    if (titleErr) return;
    setBusy(true);
    const row = { title: title.trim(), department_id: dept || null, level, description: desc.trim() };
    const res = role
      ? await supabase.from('ramp_job_roles').update(row).eq('id', role.id).select().single()
      : await supabase.from('ramp_job_roles').insert(row).select().single();
    setBusy(false);
    if (res.error) { setErr(errText(res.error)); return; }
    onSaved(res.data as JobRole, !role);
  }

  const moved = role && (role.department_id || '') !== dept && people > 0;
  const leveled = role && role.level !== level && people > 0;

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title={role ? 'Edit job role' : 'Add a job role'}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={save} loading={busy} icon="check">{role ? 'Save role' : 'Add role'}</Button></>}>
      <Field label="Role title" required error={tried ? titleErr : ''}>
        <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="For example, Dispatcher" onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      </Field>
      <Field label="Department" hint={depts.length ? undefined : 'Add departments on this page to group roles.'}>
        <Select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">No department</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-2">Access after graduating</span>
        <Pills label="Access after graduating" value={level} onChange={setLevel} options={GRAD_LEVELS.map((l) => ({ value: l, label: LEVELS[l].label }))} />
        <Notice tone={level === 'admin' ? 'warn' : 'brand'} icon={level === 'admin' ? 'alert' : 'info'}>
          <strong>{LEVELS[level].label}:</strong> {LEVELS[level].scope}
          {level === 'admin' && ' Admins can open sensitive records, so pick this only for HR and operations roles.'}
        </Notice>
      </div>
      <Field label="Description" hint="Optional. What this role does, in a sentence or two.">
        <Textarea value={desc} rows={3} maxLength={600} onChange={(e) => setDesc(e.target.value)} />
      </Field>
      {(moved || leveled) && (
        <Notice tone="warn" icon="info">
          {moved && `Changing the department doesn’t move the ${plural(people, 'person', 'people')} who already have this role. Update them on the People page. `}
          {leveled && 'People who already graduated keep their current access. The new level applies to the next graduations.'}
        </Notice>
      )}
      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
    </Sheet>
  );
}

function DeptSheet({ dept, people, onClose, onSaved }: {
  dept: Department | null; people: Person[]; onClose: () => void; onSaved: (d: Department, isNew: boolean) => void;
}) {
  const [name, setName] = useState(dept?.name || '');
  const [lead, setLead] = useState(dept?.lead_id || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const nameErr = !name.trim() ? 'Give the department a name.' : name.trim().length > 80 ? 'Keep it to 80 characters or fewer.' : '';
  const leads = people
    .filter((p) => p.status !== 'inactive' && (p.level === 'lead' || p.level === 'admin' || p.id === dept?.lead_id))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));

  async function save() {
    setTried(true);
    setErr('');
    if (nameErr) return;
    setBusy(true);
    const row = { name: name.trim(), lead_id: lead || null };
    const res = dept
      ? await supabase.from('ramp_departments').update(row).eq('id', dept.id).select().single()
      : await supabase.from('ramp_departments').insert(row).select().single();
    setBusy(false);
    if (res.error) {
      setErr(/duplicate key/i.test(res.error.message) ? 'There’s already a department with that name.' : errText(res.error));
      return;
    }
    onSaved(res.data as Department, !dept);
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title={dept ? 'Edit department' : 'Add a department'}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={save} loading={busy} icon="check">{dept ? 'Save department' : 'Add department'}</Button></>}>
      <Field label="Department name" required error={tried ? nameErr : ''}>
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="For example, Operations" onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      </Field>
      <Field label="Department lead" hint={leads.length ? 'Leads see progress, reviews and news for their department.' : 'Only people with Department lead or Admin access can lead a department. Change someone’s access on the People page.'}>
        <Select value={lead} onChange={(e) => setLead(e.target.value)} disabled={!leads.length}>
          <option value="">No lead yet</option>
          {leads.map((p) => <option key={p.id} value={p.id}>{displayName(p)} · {LEVELS[p.level].label}</option>)}
        </Select>
      </Field>
      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
    </Sheet>
  );
}
