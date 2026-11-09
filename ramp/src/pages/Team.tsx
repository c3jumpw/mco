import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { planFor, planSummary } from '../lib/plan';
import { ago, cx, displayName, fmtDateTime, plural } from '../lib/util';
import type { JobRole, Member, Module, Progress, RoleModule } from '../lib/types';
import { Avatar, Button, Card, Chip, EmptyState, ErrorBox, Icon, PageHeader, Progress as Bar, SearchInput, Select, Skeleton } from '../ui';
import { ReviewSheet, type ReviewTarget } from './parts/tools-review';
import { stageOf } from './parts/tools-people';

interface Data {
  members: Member[];
  modules: Module[];
  roleModules: RoleModule[];
  progress: Progress[];
  roles: Pick<JobRole, 'id' | 'title'>[];
  depts: { id: string; name: string }[];
}

export default function Team() {
  const { me, org, rank, isAdmin, dept } = useMe();
  useTitle(rank <= 2 ? 'Team progress' : 'My team');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [reviewing, setReviewing] = useState<ReviewTarget | null>(null);

  const { data, error, reload } = useAsync<Data>(async () => {
    const [members, modules, roleModules, progress, roles, depts] = await Promise.all([
      q<Member[]>(supabase.from('ramp_members').select('*').order('full_name')),
      q<Module[]>(supabase.from('ramp_modules').select('*').order('sort')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
      q<Progress[]>(supabase.from('ramp_progress').select('*')),
      q<Pick<JobRole, 'id' | 'title'>[]>(supabase.from('ramp_job_roles').select('id, title')),
      q<{ id: string; name: string }[]>(supabase.from('ramp_departments').select('id, name').order('name')),
    ]);
    return { members, modules, roleModules, progress, roles, depts };
  }, [me.id]);

  const people = useMemo(() => {
    if (!data) return [];
    return data.members.filter((m) => m.id !== me.id).map((m) => {
      const plan = planFor(m, data.modules, data.roleModules, data.progress);
      const sum = planSummary(plan);
      return { m, sum, stage: stageOf(m, sum.pct) };
    });
  }, [data, me.id]);

  const queue = useMemo(() => {
    if (!data) return [];
    return data.progress
      .filter((p) => p.status === 'submitted' && p.member_id !== me.id)
      .map((p) => ({ p, member: data.members.find((m) => m.id === p.member_id) || null, module: data.modules.find((x) => x.id === p.module_id) || null }))
      .sort((a, b) => (a.p.submitted_at || '').localeCompare(b.p.submitted_at || ''));
  }, [data, me.id]);

  const title = rank <= 2 ? 'Team progress' : 'My team';
  const scope = isAdmin
    ? `Everyone at ${org.name}: where they are in onboarding and training, and work waiting for review.`
    : rank === 3
      ? `Everyone in ${dept?.name || 'your department'}, plus anyone you mentor. Review their work and assign tasks.`
      : 'The trainees assigned to you. Review their work, assign tasks and read the notebook pages they share with you.';
  const header = <PageHeader title={title} subtitle={scope} />;

  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={2} /><Skeleton rows={4} /></div>;

  const roleOf = (id: string | null) => data.roles.find((r) => r.id === id)?.title || '';
  const term = search.trim().toLowerCase();
  const list = people
    .filter(({ m }) => !deptFilter || (deptFilter === 'none' ? !m.department_id : m.department_id === deptFilter))
    .filter(({ m }) => !term || [displayName(m), m.full_name, m.email, roleOf(m.job_role_id)].some((v) => v.toLowerCase().includes(term)))
    .sort((a, b) => Number(a.m.status === 'inactive') - Number(b.m.status === 'inactive') || displayName(a.m).localeCompare(displayName(b.m)));

  return (
    <div className="flex flex-col gap-6">
      {header}
      {error && <ErrorBox error={error} onRetry={reload} />}

      <section aria-labelledby="review-h" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 id="review-h" className="font-display text-xl font-semibold">Waiting for your review</h2>
          {queue.length > 0 && <Chip tone="warn">{queue.length}</Chip>}
        </div>
        {queue.length === 0 ? (
          <Card padded={false} className="flex items-center gap-3 p-4">
            <span className="w-10 h-10 rounded-xl bg-good-soft text-good flex items-center justify-center shrink-0"><Icon name="check" size={20} /></span>
            <p className="text-[15px] text-ink-2">You’re all caught up. Nothing is waiting for review.</p>
          </Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <ul>
              {queue.map(({ p, member, module }) => {
                const name = member ? displayName(member) : 'Team member';
                return (
                  <li key={`${p.member_id}:${p.module_id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-line-2 first:border-t-0">
                    <Avatar name={name} size={40} />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="text-[15px] font-semibold truncate">{name}</p>
                      <p className="text-[13px] text-muted truncate">
                        {module?.title || 'Training module'} · <span title={fmtDateTime(p.submitted_at, org.timezone)}>sent {ago(p.submitted_at)}</span>
                        {p.score != null && ` · scored ${p.score}%`}
                      </p>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => setReviewing({ progress: p, module, personName: name })}>Review</Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="people-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="people-h" className="font-display text-xl font-semibold">{isAdmin ? 'Everyone' : rank === 3 ? 'Your department' : 'Your trainees'}</h2>
          <span className="text-sm text-muted">{plural(people.length, 'person', 'people')}</span>
        </div>
        {people.length > 0 && (
          <div className={cx('grid gap-2.5', isAdmin && 'sm:grid-cols-[minmax(0,1fr)_220px]')}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email or role" label="Search people" />
            {isAdmin && (
              <label>
                <span className="sr-only">Department</span>
                <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                  <option value="">All departments</option>
                  {data.depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  <option value="none">No department</option>
                </Select>
              </label>
            )}
          </div>
        )}
        {people.length === 0 ? (
          <Card>
            <EmptyState icon="users" title={isAdmin ? 'No one else is in RAMP yet' : rank === 3 ? 'No one in your department yet' : 'No trainees assigned to you yet'}
              body={isAdmin ? 'Invite people from the admin portal and they’ll show up here.' : 'When an admin assigns people to you, you’ll see their progress here.'}
              action={isAdmin ? <Link to="/admin/people" className="font-semibold text-brand-ink no-underline">Go to People</Link> : undefined} />
          </Card>
        ) : list.length === 0 ? (
          <Card><p className="text-[15px] text-muted text-center py-4">No one matches your search.</p></Card>
        ) : (
          <Card padded={false} className="overflow-hidden">
            <ul>
              {list.map(({ m, sum, stage }) => {
                const training = m.level === 'trainee' && m.status === 'active' && !!m.onboarded_at;
                return (
                  <li key={m.id} className="border-t border-line-2 first:border-t-0">
                    <Link to={`/team/${m.id}`} className={cx('flex items-center gap-3 min-h-16 px-4 py-3 no-underline text-ink hover:bg-bg', m.status === 'inactive' && 'opacity-60')}>
                      <Avatar name={displayName(m)} size={42} />
                      <span className="min-w-0 flex-1 flex flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[15px] font-semibold truncate">{displayName(m)}</span>
                          <Chip tone={stage.tone}>{stage.label}</Chip>
                          {sum.waiting > 0 && <Chip tone="warn">{sum.waiting} to review</Chip>}
                          {sum.overdue > 0 && <Chip tone="bad">{plural(sum.overdue, 'overdue module')}</Chip>}
                        </span>
                        <span className="text-[13px] text-muted truncate">{roleOf(m.job_role_id) || 'No job role yet'}{isAdmin && m.department_id ? ` · ${data.depts.find((d) => d.id === m.department_id)?.name || ''}` : ''}</span>
                        {training && sum.total > 0 && (
                          <span className="flex items-center gap-2 max-w-xs">
                            <Bar value={sum.pct} className="flex-1" label={`${displayName(m)}’s training progress`} tone={sum.pct >= 100 ? 'good' : 'brand'} />
                            <span className="text-xs text-muted tabular-nums">{sum.done}/{sum.total}</span>
                          </span>
                        )}
                      </span>
                      <Icon name="chevronRight" size={18} className="text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <ReviewSheet target={reviewing} tz={org.timezone} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); reload(); }} />
    </div>
  );
}
