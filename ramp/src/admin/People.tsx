import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useIsMobile, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { planFor, type PlanItem } from '../lib/plan';
import { LEVELS, LEVEL_ORDER, ago, cx, fmtDate, fmtDateTime, plural } from '../lib/util';
import type { AccessRequest, Department, JobRole, Level, Member, MemberStatus, Module, PotentialStaff, Progress, RoleModule } from '../lib/types';
import { Avatar, Button, Card, Chip, EmptyState, ErrorBox, Icon, PageHeader, Pills, RowLink, SearchInput, Select, Skeleton, useConfirm, useToast } from '../ui';
import { ADMIN_BACK, LevelChip, TabBar, groupOf, loadLookups, personName, stageOf, type Stage } from './parts/ops-common';
import { BulkInviteSheet, InviteSheet, type InvitePrefill } from './parts/ops-invite';

type Tab = 'team' | 'potential' | 'requests';

interface TeamData {
  members: Member[];
  roles: JobRole[];
  depts: Department[];
  plans: Map<string, PlanItem[]>;
}

export default function People() {
  useTitle('People');
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (['team', 'potential', 'requests'] as Tab[]).includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'team';
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'team') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });

  const team = useAsync<TeamData>(async () => {
    const [members, lookups, modules, roleModules, progress] = await Promise.all([
      q<Member[]>(supabase.from('ramp_members').select('*').order('full_name')),
      loadLookups(),
      q<Module[]>(supabase.from('ramp_modules').select('*').order('sort')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
      q<Progress[]>(supabase.from('ramp_progress').select('*')),
    ]);
    const plans = new Map(members.map((m) => [m.id, planFor(m, modules, roleModules, progress)]));
    return { members, ...lookups, plans };
  }, []);
  const potential = useAsync(() => q<PotentialStaff[]>(supabase.rpc('ramp_potential_staff')), []);
  const requests = useAsync(() => q<AccessRequest[]>(supabase.from('ramp_access_requests').select('*').eq('status', 'open').order('created_at', { ascending: false })), []);

  const [invite, setInvite] = useState<InvitePrefill | null>(null);
  const closeInvite = useCallback(() => setInvite(null), []);
  const reloadTeam = team.reload, reloadPotential = potential.reload, reloadRequests = requests.reload;
  const refreshAll = useCallback(() => { reloadTeam(); reloadPotential(); reloadRequests(); }, [reloadTeam, reloadPotential, reloadRequests]);

  const count = (n: number | undefined) => (n === undefined ? '' : ` (${n})`);
  const options: { value: Tab; label: string }[] = [
    { value: 'team', label: `Team${count(team.data?.members.length)}` },
    { value: 'potential', label: `${isMobile ? 'Potential' : 'Potential staff'}${count(potential.data?.length)}` },
    { value: 'requests', label: `${isMobile ? 'Requests' : 'Access requests'}${count(requests.data?.length)}` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={groupOf('/admin/people')} title="People"
        subtitle="Invite people, bring in staff from your other tools and manage everyone’s access."
        actions={<Button variant="primary" icon="userPlus" onClick={() => setInvite({})} disabled={!team.data}>Invite someone</Button>} />
      <TabBar options={options} value={tab} onChange={setTab} label="People lists" />

      {tab === 'team' && (
        team.error && !team.data ? <ErrorBox error={team.error} onRetry={team.reload} />
          : !team.data ? <Skeleton rows={6} />
            : <TeamTab data={team.data} onInvite={() => setInvite({})} />
      )}
      {tab === 'potential' && (
        potential.error && !potential.data ? <ErrorBox error={potential.error} onRetry={potential.reload} />
          : !potential.data || !team.data ? <Skeleton rows={6} />
            : <PotentialTab rows={potential.data} roles={team.data.roles} depts={team.data.depts} onInvite={setInvite} onDone={refreshAll} />
      )}
      {tab === 'requests' && (
        requests.error && !requests.data ? <ErrorBox error={requests.error} onRetry={requests.reload} />
          : !requests.data ? <Skeleton rows={3} />
            : <RequestsTab rows={requests.data} setRows={requests.setData} onInvite={setInvite} onChanged={reloadPotential} />
      )}

      <InviteSheet open={!!invite} onClose={closeInvite} prefill={invite} roles={team.data?.roles || []} depts={team.data?.depts || []} onInvited={refreshAll} />
    </div>
  );
}

// ───────────────────────── Team ─────────────────────────

function TeamTab({ data, onInvite }: { data: TeamData; onInvite: () => void }) {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<Level | 'all'>('all');
  const [status, setStatus] = useState<MemberStatus | 'all'>('all');
  const [dept, setDept] = useState<string>('all');

  const roleById = useMemo(() => new Map(data.roles.map((r) => [r.id, r])), [data.roles]);
  const deptById = useMemo(() => new Map(data.depts.map((d) => [d.id, d])), [data.depts]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.members
      .filter((m) => level === 'all' || m.level === level)
      .filter((m) => status === 'all' || m.status === status)
      .filter((m) => dept === 'all' || (dept === 'none' ? !m.department_id : m.department_id === dept))
      .filter((m) => !s || [m.full_name, m.preferred_name, m.email, roleById.get(m.job_role_id || '')?.title].some((v) => (v || '').toLowerCase().includes(s)))
      .map((m) => ({ m, stage: stageOf(m, data.plans.get(m.id)) }))
      .sort((a, b) => personName(a.m).localeCompare(personName(b.m)));
  }, [data, search, level, status, dept, roleById]);

  const filtered = !!search.trim() || level !== 'all' || status !== 'all' || dept !== 'all';
  const clear = () => { setSearch(''); setLevel('all'); setStatus('all'); setDept('all'); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email or job role" label="Search people" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Select aria-label="Access level" value={level} onChange={(e) => setLevel(e.target.value as Level | 'all')}>
            <option value="all">All levels</option>
            {LEVEL_ORDER.map((l) => <option key={l} value={l}>{LEVELS[l].label}</option>)}
          </Select>
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as MemberStatus | 'all')}>
            <option value="all">All statuses</option>
            <option value="invited">Not joined yet</option>
            <option value="active">Active</option>
            <option value="inactive">Paused</option>
          </Select>
          <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="col-span-2 sm:col-span-1">
            <option value="all">All departments</option>
            {data.depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value="none">No department</option>
          </Select>
        </div>
        {filtered && (
          <p className="text-sm text-muted flex items-center gap-2 flex-wrap">
            Showing {plural(rows.length, 'person', 'people')} of {data.members.length}.
            <button type="button" onClick={clear} className="min-h-11 px-1 font-semibold text-brand-ink cursor-pointer">Clear filters</button>
          </p>
        )}
      </div>

      <Card padded={false} className="overflow-hidden">
        {rows.length === 0 ? (
          filtered
            ? <EmptyState icon="search" title="No one matches" body="Try a different search, or clear the filters." action={<Button onClick={clear}>Clear filters</Button>} />
            : <EmptyState icon="userPlus" title="No one here yet" body="Invite your first team member. You’ll get a message to send them." action={<Button variant="primary" icon="userPlus" onClick={onInvite}>Invite someone</Button>} />
        ) : (
          <ul>
            {rows.map(({ m, stage }) => {
              const role = m.job_role_id ? roleById.get(m.job_role_id) : null;
              const d = m.department_id ? deptById.get(m.department_id) : null;
              const named = !!(m.full_name.trim() || m.preferred_name.trim());
              return (
                <li key={m.id} className="border-t border-line-2 first:border-t-0">
                  <RowLink to={`/admin/people/${m.id}`}>
                    <Avatar name={personName(m)} size={40} tone={m.status === 'inactive' ? 'ink' : 'brand'} />
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <span className="font-semibold text-[15px] truncate max-w-full">{personName(m)}</span>
                        <LevelChip level={m.level} />
                      </div>
                      <p className="text-sm text-muted truncate">
                        {role ? role.title : 'No job role'}{d ? ` · ${d.name}` : ''}
                        {named && <span className="hidden lg:inline"> · {m.email}</span>}
                      </p>
                      <div className="flex md:hidden flex-wrap items-center gap-2">
                        <StageChip stage={stage} />
                        <span className="text-xs text-muted">{seenText(m)}</span>
                      </div>
                    </div>
                    <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
                      <StageChip stage={stage} />
                      <span className="text-xs text-muted">{seenText(m)}</span>
                    </div>
                  </RowLink>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function seenText(m: Member) {
  if (!m.auth_user_id) return `Invited ${fmtDate(m.invited_at)}`;
  return m.last_seen_at ? `Seen ${ago(m.last_seen_at)}` : 'Not seen yet';
}

function StageChip({ stage }: { stage: Stage }) {
  return <Chip tone={stage.tone} icon={stage.icon}>{stage.label}</Chip>;
}

// ───────────────────────── Potential staff ─────────────────────────

const SOURCE_CHIP: Record<PotentialStaff['source'], { label: string; tone: 'brand' | 'good' | 'warn' }> = {
  hiring: { label: 'Hiring', tone: 'brand' },
  staff: { label: 'Staff', tone: 'good' },
  request: { label: 'Request', tone: 'warn' },
};
const keyOf = (p: PotentialStaff) => `${p.source}:${p.ref}`;

function PotentialTab({ rows, roles, depts, onInvite, onDone }: {
  rows: PotentialStaff[]; roles: JobRole[]; depts: Department[]; onInvite: (p: InvitePrefill) => void; onDone: () => void;
}) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<PotentialStaff['source'] | 'all'>('all');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState(false);
  const closeBulk = useCallback(() => setBulk(false), []);
  const finishBulk = useCallback(() => { setPicked(new Set()); onDone(); }, [onDone]);

  const counts = useMemo(() => {
    const c = { hiring: 0, staff: 0, request: 0 };
    rows.forEach((r) => { c[r.source] += 1; });
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => (source === 'all' || r.source === source)
      && (!s || [r.name, r.email, r.detail].some((v) => (v || '').toLowerCase().includes(s))));
  }, [rows, search, source]);

  const pickable = shown.filter((r) => (r.email || '').trim());
  const allPicked = pickable.length > 0 && pickable.every((r) => picked.has(keyOf(r)));
  const selected = rows.filter((r) => picked.has(keyOf(r)));

  function toggle(k: string, on: boolean) {
    setPicked((prev) => { const n = new Set(prev); if (on) n.add(k); else n.delete(k); return n; });
  }
  function toggleAll(on: boolean) {
    setPicked((prev) => { const n = new Set(prev); pickable.forEach((r) => (on ? n.add(keyOf(r)) : n.delete(keyOf(r)))); return n; });
  }

  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon="users" title="Everyone’s already in RAMP"
          body="People from the hiring app, your staff records and access requests show up here until they’re invited." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-muted leading-relaxed">
        Hiring applicants and staff records from MKC-Admin who aren’t in RAMP yet. Invite one at a time, or pick several and invite them together.
      </p>
      <div className="flex flex-col gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email or job" label="Search potential staff" />
        <Pills label="Where they come from" size="sm" value={source} onChange={setSource} options={[
          { value: 'all', label: `All (${rows.length})` },
          { value: 'hiring', label: `Hiring (${counts.hiring})` },
          { value: 'staff', label: `Staff (${counts.staff})` },
          { value: 'request', label: `Requests (${counts.request})` },
        ]} />
      </div>

      <Card padded={false} className="overflow-hidden">
        {shown.length === 0 ? (
          <EmptyState icon="search" title="No one matches" body="Try a different search or source."
            action={<Button onClick={() => { setSearch(''); setSource('all'); }}>Show everyone</Button>} />
        ) : (
          <>
            <label className="flex items-center gap-3 min-h-12 px-4 border-b border-line bg-bg text-sm font-semibold text-ink-2 cursor-pointer">
              <input type="checkbox" checked={allPicked} disabled={!pickable.length} onChange={(e) => toggleAll(e.target.checked)}
                className="w-5 h-5 shrink-0 accent-[var(--brand,#4338CA)]" />
              {allPicked ? 'Unselect all' : `Select all ${plural(pickable.length, 'person', 'people')} shown`}
            </label>
            <ul>
              {shown.map((p) => {
                const k = keyOf(p);
                const hasEmail = !!(p.email || '').trim();
                const chip = SOURCE_CHIP[p.source];
                return (
                  <li key={k} className={cx('flex items-start gap-3 px-4 py-3 border-t border-line-2 first:border-t-0', picked.has(k) && 'bg-brand-soft')}>
                    <label className="w-11 h-11 -ml-2.5 -my-1 flex items-center justify-center shrink-0 cursor-pointer">
                      <span className="sr-only">Select {p.name || p.email}</span>
                      <input type="checkbox" checked={picked.has(k)} disabled={!hasEmail} onChange={(e) => toggle(k, e.target.checked)}
                        className="w-5 h-5 accent-[var(--brand,#4338CA)]" />
                    </label>
                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-[15px] break-words">{p.name || p.email || 'No name'}</span>
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                      </div>
                      <p className="text-sm text-muted break-all">{hasEmail ? p.email : 'No email address on file'}</p>
                      {p.detail && <p className="text-sm text-ink-2 leading-relaxed break-words">{p.detail}</p>}
                      {p.at && <p className="text-xs text-muted">{p.source === 'hiring' ? 'Applied' : p.source === 'request' ? 'Asked' : 'Added'} {fmtDate(p.at)}</p>}
                    </div>
                    <Button size="sm" icon="userPlus" disabled={!hasEmail} className="shrink-0 self-start"
                      onClick={() => onInvite({ email: p.email, name: p.name, source: p.source, ref: p.ref })}
                      aria-label={`Invite ${p.name || p.email}`}>Invite</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {selected.length > 0 && (
        <div className="sticky z-20 bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-4">
          <div className="flex items-center gap-3 rounded-2xl bg-ink text-white px-4 py-3 shadow-lg">
            <span className="flex-1 min-w-0 text-[15px] font-semibold">{plural(selected.length, 'person', 'people')} selected</span>
            <button type="button" onClick={() => setPicked(new Set())} className="min-h-11 px-2 text-sm font-semibold text-white/80 hover:text-white cursor-pointer">Clear</button>
            <Button variant="primary" icon="userPlus" onClick={() => setBulk(true)}>Invite</Button>
          </div>
        </div>
      )}

      <BulkInviteSheet open={bulk} onClose={closeBulk} people={selected} roles={roles} depts={depts} onDone={finishBulk} />
    </div>
  );
}

// ───────────────────────── Access requests ─────────────────────────

function RequestsTab({ rows, setRows, onInvite, onChanged }: {
  rows: AccessRequest[]; setRows: (v: AccessRequest[] | ((p: AccessRequest[] | undefined) => AccessRequest[])) => void;
  onInvite: (p: InvitePrefill) => void; onChanged: () => void;
}) {
  const { org } = useMe();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  async function dismiss(r: AccessRequest) {
    const ok = await confirm({
      title: `Dismiss ${r.name || r.email}’s request?`,
      body: 'They won’t get access. If they ask again, their request comes back here.',
      action: 'Dismiss request',
      danger: true,
    });
    if (!ok) return;
    setRows((prev) => (prev || []).filter((x) => x.id !== r.id));
    const { error } = await supabase.from('ramp_access_requests').update({ status: 'dismissed' }).eq('id', r.id);
    if (error) {
      setRows((prev) => [r, ...(prev || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      toast(errText(error), 'bad');
      return;
    }
    toast('Request dismissed.');
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-muted leading-relaxed">
        People who created a login with an email RAMP didn’t recognize. Invite them to give them access.
      </p>
      <Card padded={false} className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="check" title="No open requests"
            body={<>When someone signs up at <span className="font-semibold">{window.location.host}</span> without an invite, their request shows up here.</>} />
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-start gap-3 px-4 py-4 border-t border-line-2 first:border-t-0">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Avatar name={r.name || r.email} size={40} tone="amber" />
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <span className="font-semibold text-[15px] break-words">{r.name || r.email}</span>
                    {r.name && <span className="text-sm text-muted break-all">{r.email}</span>}
                    {r.note && <p className="text-[15px] text-ink-2 leading-relaxed border-l-2 border-line pl-3 break-words whitespace-pre-wrap">{r.note}</p>}
                    <span className="text-xs text-muted" title={fmtDateTime(r.created_at, org.timezone)}><Icon name="clock" size={12} className="inline -mt-0.5 mr-1" />Asked {ago(r.created_at)}</span>
                  </div>
                </div>
                <div className="flex gap-2 sm:shrink-0 pl-[52px] sm:pl-0">
                  <Button size="sm" variant="primary" icon="userPlus" onClick={() => onInvite({ email: r.email, name: r.name, source: 'request', ref: r.id })}>Invite</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(r)}>Dismiss</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {dialog}
    </div>
  );
}
