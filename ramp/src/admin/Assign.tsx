import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { TRACKS, plural } from '../lib/util';
import type { Department, JobRole, Member, Module, RoleModule } from '../lib/types';
import { Button, Card, Chip, EmptyState, ErrorBox, IconButton, LinkButton, PageHeader, Select, Skeleton, Switch, useConfirm, useToast } from '../ui';
import { ADMIN_BACK, MetaLine, MoveButtons, SectionHead, move } from './parts/setup-kit';

type Mod = Pick<Module, 'id' | 'title' | 'track' | 'status' | 'required' | 'minutes' | 'sort' | 'due_days' | 'builtin'>;
type Person = Pick<Member, 'id' | 'job_role_id' | 'status'>;
interface Data { modules: Mod[]; links: RoleModule[]; roles: JobRole[]; depts: Pick<Department, 'id' | 'name'>[]; people: Person[] }

const mins = (n: number) => (n < 60 ? `${n} min` : `${Math.round((n / 60) * 10) / 10} hours`);
const byRoleSort = (a: RoleModule, b: RoleModule) => a.sort - b.sort;

export default function Assign() {
  useTitle('Assign training');
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const { data, error, loading, reload, setData } = useAsync<Data>(async () => {
    const [modules, links, roles, depts, people] = await Promise.all([
      q<Mod[]>(supabase.from('ramp_modules').select('id, title, track, status, required, minutes, sort, due_days, builtin').order('sort')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*').order('sort')),
      q<JobRole[]>(supabase.from('ramp_job_roles').select('*').order('title')),
      q<Pick<Department, 'id' | 'name'>[]>(supabase.from('ramp_departments').select('id, name')),
      q<Person[]>(supabase.from('ramp_members').select('id, job_role_id, status')),
    ]);
    return { modules, links, roles, depts, people };
  }, []);
  const mutate = (fn: (d: Data) => Data) => setData((d) => fn(d as Data));

  async function toggleRequired(m: Mod, v: boolean) {
    setPending((p) => ({ ...p, [m.id]: true }));
    mutate((d) => ({ ...d, modules: d.modules.map((x) => (x.id === m.id ? { ...x, required: v } : x)) }));
    const { error: e } = await supabase.from('ramp_modules').update({ required: v }).eq('id', m.id);
    setPending((p) => ({ ...p, [m.id]: false }));
    if (e) {
      mutate((d) => ({ ...d, modules: d.modules.map((x) => (x.id === m.id ? { ...x, required: !v } : x)) }));
      toast(errText(e), 'bad');
      return;
    }
    toast(v ? (m.status === 'published' ? `${m.title} is now required for everyone.` : `${m.title} will be required once it’s published.`) : `${m.title} moved to the optional library.`);
  }

  /** Rewrite sort for a role's track to match the given order. Only changed rows are written. */
  async function reorder(roleId: string, ordered: RoleModule[]) {
    if (!data) return;
    const before = data.links;
    const next = ordered.map((l, i) => ({ ...l, sort: (i + 1) * 10 }));
    const changed = next.filter((l) => before.find((b) => b.job_role_id === l.job_role_id && b.module_id === l.module_id)?.sort !== l.sort);
    mutate((d) => ({ ...d, links: [...d.links.filter((l) => l.job_role_id !== roleId), ...next] }));
    const results = await Promise.all(changed.map((l) => supabase.from('ramp_role_modules').update({ sort: l.sort }).eq('job_role_id', l.job_role_id).eq('module_id', l.module_id)));
    const failed = results.find((r) => r.error);
    if (failed) {
      mutate((d) => ({ ...d, links: before }));
      toast(errText(failed.error), 'bad');
    }
  }

  async function add(role: JobRole, moduleId: string) {
    if (!data || !moduleId) return;
    const mine = data.links.filter((l) => l.job_role_id === role.id);
    const link: RoleModule = { job_role_id: role.id, module_id: moduleId, sort: mine.reduce((mx, l) => Math.max(mx, l.sort), 0) + 10 };
    mutate((d) => ({ ...d, links: [...d.links, link] }));
    const { error: e } = await supabase.from('ramp_role_modules').insert(link);
    if (e) {
      mutate((d) => ({ ...d, links: d.links.filter((l) => !(l.job_role_id === role.id && l.module_id === moduleId)) }));
      toast(errText(e), 'bad');
      return;
    }
    const mod = data.modules.find((x) => x.id === moduleId);
    toast(`${mod?.title || 'Module'} added to ${role.title}.`);
  }

  async function remove(role: JobRole, l: RoleModule) {
    const mod = data?.modules.find((x) => x.id === l.module_id);
    const ok = await confirm({
      title: `Remove ${mod?.title || 'this module'} from ${role.title}?`,
      body: 'People in this role won’t have it assigned anymore. Any progress they’ve made is kept.',
      action: 'Remove', danger: true,
    });
    if (!ok) return;
    mutate((d) => ({ ...d, links: d.links.filter((x) => !(x.job_role_id === l.job_role_id && x.module_id === l.module_id)) }));
    const { error: e } = await supabase.from('ramp_role_modules').delete().eq('job_role_id', l.job_role_id).eq('module_id', l.module_id);
    if (e) {
      mutate((d) => ({ ...d, links: [...d.links, l] }));
      toast(errText(e), 'bad');
      return;
    }
    toast(`Removed from ${role.title}.`);
  }

  const company = (data?.modules || []).filter((m) => m.track === 'company');
  const requiredLive = company.filter((m) => m.required && m.status === 'published');
  const roleMods = (data?.modules || []).filter((m) => m.track === 'role');
  const unassigned = roleMods.filter((m) => !(data?.links || []).some((l) => l.module_id === m.id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow="Set up" title="Assign training"
        subtitle="What everyone must complete, and what each job role learns on top."
        actions={<LinkButton to="/admin/training" icon="book">Training modules</LinkButton>} />

      {loading && !data && <Skeleton rows={6} />}
      {error && !data && <ErrorBox error={error} onRetry={reload} />}

      {data && (
        <>
          <Card className="flex flex-col gap-4">
            <SectionHead title="Required for everyone"
              subtitle={`${plural(requiredLive.length, 'required module')} · about ${mins(requiredLive.reduce((a, m) => a + m.minutes, 0))} · assigned automatically to every team member`} />
            {company.length === 0 ? (
              <EmptyState icon="book" title="No company-wide modules yet" body="Build one, like a welcome and culture module, and mark it as required."
                action={<LinkButton to="/admin/training" variant="primary" icon="plus">Build a module</LinkButton>} />
            ) : (
              <ul className="flex flex-col -mx-5 -mb-5 border-t border-line-2">
                {company.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 pl-5 pr-3 py-3 border-b border-line-2 last:border-b-0">
                    <Link to={`/admin/training/${m.id}`} className="flex-1 min-w-0 no-underline text-ink flex flex-col gap-0.5 min-h-11 justify-center">
                      <span className="font-semibold text-[15px]">{m.title}</span>
                      <MetaLine parts={[
                        mins(m.minutes),
                        m.due_days != null && `Due ${plural(m.due_days, 'day')} after start`,
                        m.status !== 'published' && <span className="text-warn font-semibold">Draft, not visible yet</span>,
                        m.status === 'published' && !m.required && 'Optional library',
                      ]} />
                    </Link>
                    <Switch checked={m.required} onChange={(v) => toggleRequired(m, v)} disabled={pending[m.id]} label={`Required for everyone: ${m.title}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section className="flex flex-col gap-3" aria-labelledby="tracks-title">
            <div className="px-1">
              <h2 id="tracks-title" className="font-display text-lg font-semibold">Role tracks</h2>
              <p className="text-sm text-muted">The modules each job role learns after the required ones, in this order.</p>
            </div>
            {unassigned.length > 0 && data.roles.length > 0 && (
              <p className="text-sm text-warn px-1 font-semibold">{plural(unassigned.length, 'role module')} {unassigned.length === 1 ? 'isn’t' : 'aren’t'} in any track yet: {unassigned.map((m) => m.title).join(', ')}.</p>
            )}
            {data.roles.length === 0 ? (
              <Card><EmptyState icon="sliders" title="No job roles yet" body="Add job roles first, then pick the training each one gets."
                action={<LinkButton to="/admin/roles" variant="primary" icon="plus">Add job roles</LinkButton>} /></Card>
            ) : data.roles.map((role) => (
              <RoleTrack key={role.id} role={role} data={data} onAdd={(id) => add(role, id)} onRemove={(l) => remove(role, l)}
                onReorder={(list) => reorder(role.id, list)} />
            ))}
          </section>
        </>
      )}

      <Card className="flex flex-col gap-3" as="section">
        <SectionHead title="How assignment works" subtitle="Everyone’s training list is built from these four parts, in this order. Only published modules count." />
        <ol className="flex flex-col gap-3">
          {[
            ['Required for everyone', 'Company-wide modules switched on above. Every team member gets them, with due dates counted from their start date.'],
            ['Their role track', 'Role modules added to their job role here, in the order you set. Changing someone’s job role changes their track.'],
            ['Continued training', `${TRACKS.continued.label} modules go to everyone who has graduated (employee and above), whatever their role.`],
            ['Optional library', 'Company-wide modules that aren’t required. Staff can take them any time, with no due date.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-brand-soft text-brand-ink font-display font-bold text-sm flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="min-w-0"><span className="block font-semibold text-[15px]">{t}</span><span className="block text-sm text-muted leading-relaxed">{d}</span></span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted leading-relaxed border-t border-line-2 pt-3">Guests only see published modules marked “Visible to guests” in the module settings.</p>
      </Card>
      {dialog}
    </div>
  );
}

function RoleTrack({ role, data, onAdd, onRemove, onReorder }: {
  role: JobRole; data: Data; onAdd: (moduleId: string) => void; onRemove: (l: RoleModule) => void; onReorder: (list: RoleModule[]) => void;
}) {
  const [pick, setPick] = useState('');
  const links = data.links.filter((l) => l.job_role_id === role.id).sort(byRoleSort);
  const people = data.people.filter((p) => p.job_role_id === role.id && p.status !== 'inactive').length;
  const dept = data.depts.find((d) => d.id === role.department_id)?.name;
  const options = data.modules.filter((m) => m.track === 'role' && !links.some((l) => l.module_id === m.id));
  const total = links.reduce((a, l) => {
    const m = data.modules.find((x) => x.id === l.module_id);
    return a + (m && m.status === 'published' && m.track === 'role' ? m.minutes : 0);
  }, 0);

  return (
    <Card className="flex flex-col gap-3" as="article">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-semibold">{role.title}</h3>
          <MetaLine parts={[dept, plural(people, 'person', 'people'), links.length ? `${plural(links.length, 'module')} · about ${mins(total)}` : 'No modules yet']} />
        </div>
      </div>
      {links.length > 0 && (
        <ol className="flex flex-col -mx-5 border-y border-line-2">
          {links.map((l, i) => {
            const m = data.modules.find((x) => x.id === l.module_id);
            return (
              <li key={l.module_id} className="flex items-center gap-1 pl-5 pr-2 py-2 border-b border-line-2 last:border-b-0">
                <span className="w-6 text-sm font-bold text-muted shrink-0" aria-hidden="true">{i + 1}</span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  {m ? <Link to={`/admin/training/${m.id}`} className="font-semibold text-[15px] text-ink no-underline truncate">{m.title}</Link> : <span className="text-muted">Deleted module</span>}
                  {m && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Chip tone={m.track === 'role' ? 'brand' : 'neutral'}>{TRACKS[m.track].label}</Chip>
                      {m.status !== 'published' && <Chip tone="warn">Draft, not visible yet</Chip>}
                      {m.track === 'continued' && <span className="text-xs text-muted">Goes to everyone after graduating</span>}
                      {m.track === 'company' && <span className="text-xs text-muted">Company-wide, set above</span>}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0">
                  <MoveButtons index={i} count={links.length} what={m?.title || 'module'} onMove={(d) => onReorder(move(links, i, d))} />
                  <IconButton icon="x" label={`Remove ${m?.title || 'module'} from ${role.title}`} onClick={() => onRemove(l)} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {options.length > 0 ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Add a module to ${role.title}`} className="sm:flex-1">
            <option value="">Add a role module…</option>
            {options.map((m) => <option key={m.id} value={m.id}>{m.title}{m.status !== 'published' ? ' (draft)' : ''}</option>)}
          </Select>
          <Button icon="plus" disabled={!pick} onClick={() => { onAdd(pick); setPick(''); }}>Add to track</Button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {data.modules.some((m) => m.track === 'role') ? 'Every role module is already in this track. ' : 'No role-track modules yet. '}
          <Link to="/admin/training" className="font-semibold text-brand-ink">Build a role module</Link>
        </p>
      )}
    </Card>
  );
}
