import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { SUBMISSION_COLS, docsFor, latestFor, planFor, planSummary } from '../lib/plan';
import { ago, fmtDateTime } from '../lib/util';
import type { Member, Module, Progress, RoleModule, Submission, Template } from '../lib/types';
import { Avatar, Button, Card, Chip, EmptyState, ErrorBox, LinkButton, PageHeader, Skeleton } from '../ui';
import { ADMIN_BACK, GuestAccessChip, LevelChip, StatusChip, TabBar, loadLookups, personName, stageOf } from './parts/ops-common';
import { InviteMessagePanel } from './parts/ops-invite';
import { OverviewTab, useMemberActions, type PersonData, type PersonLite } from './parts/ops-person-overview';
import { TrainingTab } from './parts/ops-person-training';
import { DocumentsTab, FilesTab, isRequiredDoc } from './parts/ops-person-docs';
import { ActivityTab, SigninsTab } from './parts/ops-person-log';

type Tab = 'overview' | 'training' | 'documents' | 'files' | 'signins' | 'activity';
const TABS: Tab[] = ['overview', 'training', 'documents', 'files', 'signins', 'activity'];

export default function Person() {
  const { id = '' } = useParams();
  const res = useAsync<PersonData | null>(async () => {
    const [member, lookups, people, modules, roleModules, progress, templates, subs] = await Promise.all([
      q<Member | null>(supabase.from('ramp_members').select('*').eq('id', id).maybeSingle()),
      loadLookups(),
      q<PersonLite[]>(supabase.from('ramp_members').select('id, full_name, preferred_name, email, level, status')),
      q<Module[]>(supabase.from('ramp_modules').select('*').order('sort')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
      q<Progress[]>(supabase.from('ramp_progress').select('*').eq('member_id', id)),
      q<Template[]>(supabase.from('ramp_templates').select('*').order('sort')),
      q<Submission[]>(supabase.from('ramp_submissions').select(SUBMISSION_COLS).eq('member_id', id).order('created_at', { ascending: false })),
    ]);
    if (!member) return null;
    return { member, ...lookups, people, modules, roleModules, progress, templates, subs };
  }, [id]);
  useTitle(res.data ? personName(res.data.member) : res.data === null ? 'Person not found' : 'Person');

  // One "viewed profile" entry per person per browser session.
  useEffect(() => {
    if (!id) return;
    const key = `ramp-viewed-${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    supabase.rpc('ramp_log', { p_action: 'viewed profile', p_member: id, p_detail: '' }).then(({ error }) => {
      if (error) sessionStorage.removeItem(key);
    });
  }, [id]);

  if (res.error && !res.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={ADMIN_BACK} eyebrow={<PeopleEyebrow />} title="Person" />
        <ErrorBox error={res.error} onRetry={res.reload} />
      </div>
    );
  }
  if (res.data === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={ADMIN_BACK} eyebrow={<PeopleEyebrow />} title={<span className="skeleton inline-block h-8 w-56 align-middle" aria-label="Loading" />} />
        <Skeleton rows={5} />
      </div>
    );
  }
  if (res.data === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={ADMIN_BACK} eyebrow={<PeopleEyebrow />} title="Person not found" />
        <Card>
          <EmptyState icon="users" title="This person isn’t in RAMP" body="They may have been removed, or the link is wrong."
            action={<LinkButton to="/admin/people" variant="primary">Go to People</LinkButton>} />
        </Card>
      </div>
    );
  }
  return <Profile d={res.data} setData={res.setData} />;
}

function PeopleEyebrow() {
  return <Link to="/admin/people" className="no-underline text-brand-ink hover:underline underline-offset-2">People</Link>;
}

function Profile({ d, setData }: { d: PersonData; setData: (v: PersonData | null | ((p: PersonData | null | undefined) => PersonData | null)) => void }) {
  const { org } = useMe();
  const m = d.member;
  const name = personName(m);
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'overview';
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'overview') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });

  const setMember = useCallback((member: Member) => setData((prev) => (prev ? { ...prev, member } : prev ?? null)), [setData]);
  const onReviewed = useCallback((p: Progress) => setData((prev) => (prev ? {
    ...prev, progress: prev.progress.map((x) => (x.module_id === p.module_id ? p : x)),
  } : prev ?? null)), [setData]);

  const plan = useMemo(() => planFor(m, d.modules, d.roleModules, d.progress), [m, d.modules, d.roleModules, d.progress]);
  const summary = planSummary(plan);
  const stage = stageOf(m, plan);
  const actions = useMemberActions(m, d.roles, plan, setMember);
  const role = d.roles.find((r) => r.id === m.job_role_id);
  const dept = d.depts.find((x) => x.id === m.department_id);
  const nameOf = useCallback((pid: string | null) => {
    if (!pid) return 'System';
    const p = d.people.find((x) => x.id === pid);
    return p ? personName(p) : 'Removed person';
  }, [d.people]);

  const required = docsFor(m, d.templates).filter((t) => isRequiredDoc(t, m));
  const missingDocs = required.filter((t) => !latestFor(t.id, d.subs)).length;

  const options: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'training', label: summary.waiting ? `Training (${summary.waiting} to review)` : 'Training' },
    { value: 'documents', label: missingDocs ? `Documents (${missingDocs} missing)` : 'Documents' },
    { value: 'files', label: 'Files' },
    { value: 'signins', label: 'Sign-ins' },
    { value: 'activity', label: 'Activity' },
  ];

  const canGraduate = m.level === 'trainee' && m.status !== 'inactive' && !!m.auth_user_id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={<PeopleEyebrow />}
        title={<span className="flex items-center gap-3 min-w-0"><Avatar name={name} size={48} tone={m.status === 'inactive' ? 'ink' : 'brand'} /><span className="min-w-0 break-words">{name}</span></span>}
        subtitle={<span className="break-all">{m.email}{role ? <span className="break-normal"> · {role.title}{dept ? `, ${dept.name}` : ''}</span> : null}</span>}
        actions={canGraduate ? <Button variant="success" icon="star" onClick={actions.graduate} loading={actions.busy === 'graduate'}>Graduate</Button> : undefined} />

      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <LevelChip level={m.level} />
        <StatusChip m={m} />
        {stage.key !== 'paused' && stage.key !== 'invited' && <Chip tone={stage.tone} icon={stage.icon}>{stage.label}</Chip>}
        <GuestAccessChip m={m} />
        <span className="text-sm text-muted">{m.last_seen_at ? `Last seen ${ago(m.last_seen_at)}` : m.auth_user_id ? 'Not seen yet' : `Invited ${fmtDateTime(m.invited_at, org.timezone)}`}</span>
      </div>

      {!m.auth_user_id && m.status !== 'inactive' && (
        <InviteMessagePanel emails={[m.email]} name={m.full_name || m.preferred_name} title="Send invite again" collapsible />
      )}

      <TabBar options={options} value={tab} onChange={setTab} label="Profile sections" />

      {tab === 'overview' && <OverviewTab d={d} plan={plan} actions={actions} />}
      {tab === 'training' && <TrainingTab member={m} plan={plan} people={d.people} onReviewed={onReviewed} />}
      {tab === 'documents' && <DocumentsTab member={m} templates={d.templates} subs={d.subs} />}
      {tab === 'files' && <FilesTab member={m} subs={d.subs} />}
      {tab === 'signins' && <SigninsTab member={m} />}
      {tab === 'activity' && <ActivityTab member={m} nameOf={nameOf} />}

      {actions.dialog}
    </div>
  );
}
