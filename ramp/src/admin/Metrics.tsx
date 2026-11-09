import { useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { SUBMISSION_COLS, appliesTo, docsFor, latestFor, planFor, planSummary, type PlanItem } from '../lib/plan';
import { LEVELS, TRACKS, cx, plural, rankOf } from '../lib/util';
import type { Department, JobRole, Member, Module, Progress, RoleModule, Submission, Template } from '../lib/types';
import { Button, Card, CardHeader, EmptyState, ErrorBox, Field, PageHeader, Progress as Bar, Select, Skeleton, Stat, useToast } from '../ui';
import { ADMIN_BACK, csvTime, downloadCsv, groupOf, loadLookups, personName, stageOf, stamp } from './parts/ops-common';
import { isRequiredDoc } from './parts/ops-person-docs';

interface Data {
  members: Member[];
  roles: JobRole[];
  depts: Department[];
  modules: Module[];
  roleModules: RoleModule[];
  progress: Progress[];
  templates: Template[];
  subs: Submission[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Stat-tile values use the UI sans, semibold, with proportional figures. */
const fig = (v: ReactNode) => <span className="font-sans font-semibold tracking-tight">{v}</span>;

function daysValue(d: number | null) {
  if (d === null) return '—';
  const v = d < 1 ? null : Math.round(d * 10) / 10;
  return <>{v === null ? '<1' : v}<span className="text-base font-semibold text-muted">{v === null || v === 1 ? ' day' : ' days'}</span></>;
}

export default function Metrics() {
  useTitle('Metrics');
  const { org } = useMe();
  const toast = useToast();
  const [dept, setDept] = useState('all');

  const res = useAsync<Data>(async () => {
    const [members, lookups, modules, roleModules, progress, templates, subs] = await Promise.all([
      q<Member[]>(supabase.from('ramp_members').select('*')),
      loadLookups(),
      q<Module[]>(supabase.from('ramp_modules').select('*').order('sort')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
      q<Progress[]>(supabase.from('ramp_progress').select('*')),
      q<Template[]>(supabase.from('ramp_templates').select('*').eq('status', 'published').order('sort')),
      q<Submission[]>(supabase.from('ramp_submissions').select(SUBMISSION_COLS)),
    ]);
    return { members, ...lookups, modules, roleModules, progress, templates, subs };
  }, []);

  const m = useMemo(() => (res.data ? compute(res.data, dept) : null), [res.data, dept]);

  function exportCsv() {
    if (!res.data || !m) return;
    const d = res.data;
    const roleName = (id: string | null) => d.roles.find((r) => r.id === id)?.title || '';
    const deptName = (id: string | null) => d.depts.find((x) => x.id === id)?.name || '';
    const memberName = (id: string | null) => { const x = id ? d.members.find((y) => y.id === id) : null; return x ? personName(x) : ''; };
    const rows: (string | number)[][] = [[
      'Name', 'Email', 'Access level', 'Job role', 'Department', 'Mentor', 'Stage', 'Start date', 'Invited', 'Joined', 'Finished onboarding', 'Graduated', 'Last seen',
      'Assigned modules', 'Modules completed', 'Training %', 'Waiting for review', 'Overdue', 'Required documents', 'Required documents done',
    ]];
    for (const p of [...m.scope].sort((a, b) => personName(a).localeCompare(personName(b)))) {
      const plan = m.plans.get(p.id) || [];
      const s = planSummary(plan);
      const req = docsFor(p, d.templates).filter((t) => isRequiredDoc(t, p));
      const mine = d.subs.filter((x) => x.member_id === p.id);
      rows.push([
        p.full_name || p.preferred_name, p.email, LEVELS[p.level].label, roleName(p.job_role_id), deptName(p.department_id), memberName(p.mentor_id),
        stageOf(p, plan).label, p.start_date || '', csvTime(p.invited_at, org.timezone), csvTime(p.joined_at, org.timezone), csvTime(p.onboarded_at, org.timezone),
        csvTime(p.graduated_at, org.timezone), csvTime(p.last_seen_at, org.timezone),
        s.total, s.done, s.pct, s.waiting, s.overdue, req.length, req.filter((t) => latestFor(t.id, mine)).length,
      ]);
    }
    const deptSlug = dept === 'all' ? '' : `-${(d.depts.find((x) => x.id === dept)?.name || 'no-department').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    downloadCsv(`ramp-people-progress${deptSlug}-${stamp()}.csv`, rows);
    toast(`Downloaded progress for ${plural(m.scope.length, 'person', 'people')}.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={groupOf('/admin/metrics')} title="Metrics"
        subtitle="Onboarding and training progress across the team. Numbers update each time you open this page."
        actions={<Button icon="download" onClick={exportCsv} disabled={!m || !m.scope.length}>Export people progress</Button>} />

      {res.error && !res.data ? <ErrorBox error={res.error} onRetry={res.reload} />
        : !res.data || !m ? <><Skeleton rows={2} /><Skeleton rows={4} /></>
          : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Department" className="w-full sm:w-72">
                  <Select value={dept} onChange={(e) => setDept(e.target.value)}>
                    <option value="all">All departments</option>
                    {res.data.depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    <option value="none">No department</option>
                  </Select>
                </Field>
                <p className="text-sm text-muted pb-3">{plural(m.scope.length, 'person', 'people')} in view</p>
              </div>

              {m.scope.length === 0 ? (
                <Card><EmptyState icon="users" title="No one in this department yet" body="Pick another department, or assign people to this one from their profile." /></Card>
              ) : (
                <>
                  <section aria-label="Key numbers" className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Stat label="Active members" value={fig(m.active.length)} hint={m.notJoined ? `${m.notJoined} invited, not joined yet` : 'Everyone invited has joined'} />
                    <Stat label="In onboarding" value={fig(m.inOnboarding)} hint="Joined, welcome flow not finished" />
                    <Stat label="Median days to onboard" value={fig(daysValue(m.medianDays))}
                      hint={m.onboardedCount ? `From joining to finishing, ${plural(m.onboardedCount, 'person', 'people')}` : 'No one has finished yet'} />
                    <Stat label="Required training done" value={fig(`${m.reqPct}%`)} tone={m.reqTotal && m.reqPct === 100 ? 'good' : undefined}
                      hint={m.reqTotal ? `${m.reqDone} of ${plural(m.reqTotal, 'assignment')}` : 'Nothing assigned yet'} />
                    <Stat label="Overdue items" value={fig(m.overdue)} tone={m.overdue ? 'warn' : undefined} hint={m.overdue ? `Across ${plural(m.overduePeople, 'person', 'people')}` : 'Nothing overdue'} />
                    <Stat label="Waiting for review" value={fig(m.waiting)} tone={m.waiting ? 'warn' : undefined} hint={m.waiting ? 'Mentors and leads review these' : 'All caught up'} />
                  </section>

                  <Funnel steps={m.funnel} />
                  <ModuleTable rows={m.moduleRows} />
                  <DocsTable rows={m.docRows} />
                </>
              )}
            </>
          )}
    </div>
  );
}

// ───────────────────────── numbers ─────────────────────────

function compute(d: Data, dept: string) {
  const scope = d.members.filter((x) => dept === 'all' || (dept === 'none' ? !x.department_id : x.department_id === dept));
  const plans = new Map<string, PlanItem[]>(scope.map((x) => [x.id, planFor(x, d.modules, d.roleModules, d.progress)]));
  const active = scope.filter((x) => x.status === 'active');
  const activeIds = new Set(active.map((x) => x.id));
  const notJoined = scope.filter((x) => !x.auth_user_id && x.status !== 'inactive').length;
  const inOnboarding = active.filter((x) => x.auth_user_id && !x.onboarded_at && rankOf(x.level) >= 3 && x.level !== 'guest').length;

  const days = scope.filter((x) => x.joined_at && x.onboarded_at)
    .map((x) => Math.max(0, (new Date(x.onboarded_at!).getTime() - new Date(x.joined_at!).getTime()) / 86400000));
  const medianDays = median(days);

  let reqDone = 0, reqTotal = 0, overdue = 0, overduePeople = 0;
  for (const x of active) {
    const plan = plans.get(x.id) || [];
    const req = plan.filter((i) => i.kind === 'required' || i.kind === 'role');
    reqTotal += req.length;
    reqDone += req.filter((i) => i.status === 'completed').length;
    const o = planSummary(plan).overdue;
    overdue += o;
    if (o) overduePeople += 1;
  }
  const waiting = d.progress.filter((p) => p.status === 'submitted' && activeIds.has(p.member_id)).length;

  // People who started as trainees: invited → joined → onboarded → graduated.
  const path = scope.filter((x) => x.level === 'trainee' || x.graduated_at);
  const funnel = [
    { label: 'Invited', n: path.length, desc: 'Added to RAMP as a trainee' },
    { label: 'Joined', n: path.filter((x) => x.joined_at).length, desc: 'Created their login' },
    { label: 'Onboarded', n: path.filter((x) => x.onboarded_at).length, desc: 'Finished the welcome flow' },
    { label: 'Graduated', n: path.filter((x) => x.graduated_at).length, desc: 'Moved on from trainee' },
  ];

  const trackOrder = { company: 0, role: 1, continued: 2 } as const;
  const moduleRows = d.modules.filter((x) => x.status === 'published')
    .sort((a, b) => trackOrder[a.track] - trackOrder[b.track] || a.sort - b.sort)
    .map((mod) => {
      const assigned = active.filter((x) => (plans.get(x.id) || []).some((i) => i.module.id === mod.id && i.kind !== 'optional')).length;
      const prog = d.progress.filter((p) => p.module_id === mod.id && activeIds.has(p.member_id));
      const completed = prog.filter((p) => p.status === 'completed').length;
      const scores = prog.map((p) => p.score).filter((s): s is number => s !== null && s !== undefined);
      return {
        id: mod.id, title: mod.title, track: TRACKS[mod.track].label, optional: mod.track === 'company' && !mod.required,
        assigned, started: prog.length, completed,
        avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      };
    });

  const joined = active.filter((x) => x.auth_user_id && x.level !== 'guest');
  const docRows = d.templates.filter((t) => t.stage === 'onboarding').map((t) => {
    const should = joined.filter((x) => appliesTo(t, x));
    const done = should.filter((x) => d.subs.some((s) => s.member_id === x.id && s.template_id === t.id)).length;
    return { id: t.id, title: t.title, should: should.length, done };
  });

  return {
    scope, plans, active, notJoined, inOnboarding, medianDays, onboardedCount: days.length,
    reqDone, reqTotal, reqPct: pctOf(reqDone, reqTotal), overdue, overduePeople, waiting, funnel, moduleRows, docRows,
  };
}

// ───────────────────────── charts and tables ─────────────────────────

/** Horizontal bars, one hue, values at the tip. Each bar is focusable and shows its detail on hover or focus. */
function Funnel({ steps }: { steps: { label: string; n: number; desc: string }[] }) {
  const top = steps[0]?.n || 0;
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <Card>
      <CardHeader title="Onboarding funnel" subtitle="Everyone who started as a trainee, and how far they’ve got." className="mb-4" />
      {top === 0 ? (
        <p className="text-[15px] text-muted">No trainees yet. Invite someone as a trainee to see them move through onboarding.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => {
            const prev = i ? steps[i - 1]!.n : s.n;
            const share = pctOf(s.n, top);
            const tip = i === 0 ? `${s.n} invited` : `${s.n} of ${top} (${share}%). ${prev - s.n ? `${prev - s.n} not past ${steps[i - 1]!.label.toLowerCase()} yet.` : `Everyone ${steps[i - 1]!.label.toLowerCase()} got here.`}`;
            return (
              <li key={s.label} tabIndex={0} aria-label={`${s.label}: ${tip}`}
                className="group relative grid sm:grid-cols-[11rem_minmax(0,1fr)] gap-x-3 gap-y-1 items-center rounded-lg outline-offset-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{s.label}</p>
                  <p className="text-xs text-muted hidden sm:block">{s.desc}</p>
                </div>
                <div className="flex items-center gap-2 min-w-0 border-l border-line h-8">
                  {s.n > 0 && <span className="h-6 rounded-r-[4px] bg-brand shrink-0 transition-[filter] group-hover:brightness-110 group-focus-visible:brightness-110" style={{ width: `${(s.n / max) * 76}%` }} />}
                  <span className="text-sm whitespace-nowrap pl-0.5"><span className="font-bold text-ink">{s.n}</span>{i > 0 && <span className="text-muted"> · {share}%</span>}</span>
                </div>
                <span role="presentation" className="pointer-events-none absolute z-10 left-0 sm:left-[11.75rem] -top-9 hidden group-hover:block group-focus-visible:block rounded-lg bg-ink text-white text-xs font-medium px-2.5 py-1.5 shadow-lg whitespace-nowrap">
                  <span className="font-bold">{s.n}</span> {s.label.toLowerCase()}{i > 0 ? ` · ${share}% of invited` : ''}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function ModuleTable({ rows }: { rows: ReturnType<typeof compute>['moduleRows'] }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 pb-3"><CardHeader title="Training modules" subtitle="Published modules, among active people in view. Completion is out of the people it’s assigned to." /></div>
      {rows.length === 0 ? (
        <div className="px-5 pb-5"><p className="text-[15px] text-muted">No published modules yet. Build and publish them in Admin › Training modules.</p></div>
      ) : (
        <>
          <ul className="md:hidden border-t border-line">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-3.5 border-t border-line-2 first:border-t-0 flex flex-col gap-2">
                <div>
                  <p className="font-semibold text-[15px]">{r.title}</p>
                  <p className="text-[13px] text-muted">{r.optional ? 'Optional' : r.track}</p>
                </div>
                <dl className="grid grid-cols-4 gap-2 text-center">
                  {[['Assigned', r.assigned], ['Started', r.started], ['Done', r.completed], ['Avg score', r.avg === null ? '—' : `${r.avg}%`]].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-bg py-1.5">
                      <dt className="text-[11px] font-semibold text-muted">{k}</dt>
                      <dd className="text-[15px] font-bold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                {r.assigned > 0 && <Bar value={pctOf(r.completed, r.assigned)} tone={r.completed >= r.assigned ? 'good' : 'brand'} label={`${r.title}: completed`} />}
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto border-t border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-[0.06em] text-muted bg-bg text-right">
                  <th scope="col" className="px-5 py-2.5 text-left font-bold">Module</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">Assigned</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">Started</th>
                  <th scope="col" className="px-3 py-2.5 font-bold">Completed</th>
                  <th scope="col" className="px-3 py-2.5 font-bold w-40 text-left">Completion</th>
                  <th scope="col" className="px-5 py-2.5 font-bold">Avg score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = pctOf(r.completed, r.assigned);
                  return (
                    <tr key={r.id} className="border-t border-line-2 text-right tabular-nums">
                      <td className="px-5 py-3 text-left">
                        <span className="font-semibold text-[15px] text-ink">{r.title}</span>
                        <span className="block text-[13px] text-muted">{r.optional ? 'Optional' : r.track}</span>
                      </td>
                      <td className="px-3 py-3">{r.assigned}</td>
                      <td className="px-3 py-3">{r.started}</td>
                      <td className="px-3 py-3">{r.completed}</td>
                      <td className="px-3 py-3 text-left">
                        {r.assigned ? (
                          <span className="flex items-center gap-2">
                            <Bar value={pct} tone={pct >= 100 ? 'good' : 'brand'} label={`${r.title}: completed`} className="flex-1" />
                            <span className="w-10 text-right text-ink-2">{pct}%</span>
                          </span>
                        ) : <span className="text-muted">Not assigned</span>}
                      </td>
                      <td className="px-5 py-3">{r.avg === null ? <span className="text-muted">—</span> : `${r.avg}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function DocsTable({ rows }: { rows: { id: string; title: string; should: number; done: number }[] }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 pb-3"><CardHeader title="Onboarding documents" subtitle="Documents due in the welcome flow, among people who have joined." /></div>
      {rows.length === 0 ? (
        <div className="px-5 pb-5"><p className="text-[15px] text-muted">No published onboarding documents. Publish them in Admin › Documents.</p></div>
      ) : (
        <ul className="border-t border-line">
          {rows.map((r) => {
            const pct = pctOf(r.done, r.should);
            const complete = r.should > 0 && r.done >= r.should;
            return (
              <li key={r.id} className="px-5 py-3.5 border-t border-line-2 first:border-t-0 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_12rem_6rem] gap-x-4 gap-y-2 items-center">
                <p className="font-semibold text-[15px] min-w-0 break-words">{r.title}</p>
                <p className="text-sm text-ink-2 tabular-nums text-right md:order-last whitespace-nowrap">
                  <span className="font-bold text-ink">{r.done}</span> / {r.should}<span className="text-muted"> done</span>
                </p>
                <div className={cx('col-span-2 md:col-span-1', !r.should && 'text-sm text-muted')}>
                  {r.should ? <Bar value={pct} tone={complete ? 'good' : 'amber'} label={`${r.title}: ${r.done} of ${r.should} done`} /> : 'No one needs it yet'}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
