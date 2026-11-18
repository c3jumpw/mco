import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { PLACEMENT_STATUS, daysUntil, plural, todayISO } from '../../lib/util';
import type { Checkin, Client, Module, Placement, PlacementStatus, PlacementStep, RateChange, Tier, Timesheet } from '../../lib/types';
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, LinkButton, Notice, PageHeader, Pills, Sheet, Skeleton, Textarea, useToast } from '../../ui';
import { FormError, TabBar } from '../parts/ops-common';
import {
  AGENCY_BACK, EYEBROW, EconGrid, MEMBER_COLS, useTabInView, PlacementStatusChip, TierChip, longDate, personName, startText, readinessFor, sortTiers, type MemberLite,
} from './parts/core-common';
import { ChecklistTab } from './parts/core-pd-checklist';
import { CheckinsTab } from './parts/core-pd-checkins';
import { HoursTab } from './parts/core-pd-hours';
import { RatesTab } from './parts/core-pd-rates';
import { DetailsTab, LaunchTab } from './parts/core-pd-details';
import { RateSheet, type RateTarget } from './parts/core-rate';
import { PlaceSheet, type PlacePrefill } from './parts/core-place';

type Tab = 'checklist' | 'checkins' | 'hours' | 'rates' | 'launch' | 'details';
const TABS: Tab[] = ['checklist', 'checkins', 'hours', 'rates', 'launch', 'details'];

type Linked = Pick<Placement, 'id' | 'member_id' | 'status' | 'replaces_id' | 'start_date'>;

interface Data {
  p: Placement;
  client: Client;
  tiers: Tier[];
  people: MemberLite[];
  steps: PlacementStep[];
  checkins: Checkin[];
  rates: RateChange[];
  timesheets: Timesheet[];
  completed: Set<string>;
  modules: Pick<Module, 'id' | 'title'>[];
  linked: Linked[];
}

export default function PlacementDetail() {
  const { id = '' } = useParams();
  const res = useAsync<Data | null>(async () => {
    const [p, tiers, people, steps, checkins, rates, timesheets, modules, replacements] = await Promise.all([
      q<Placement | null>(supabase.from('ramp_placements').select('*').eq('id', id).maybeSingle()),
      q<Tier[]>(supabase.from('ramp_tiers').select('*').order('level')),
      q<MemberLite[]>(supabase.from('ramp_members').select(MEMBER_COLS)),
      q<PlacementStep[]>(supabase.from('ramp_placement_steps').select('*').eq('placement_id', id).order('sort')),
      q<Checkin[]>(supabase.from('ramp_checkins').select('*').eq('placement_id', id)),
      q<RateChange[]>(supabase.from('ramp_rate_changes').select('*').eq('placement_id', id)),
      q<Timesheet[]>(supabase.from('ramp_timesheets').select('*').eq('placement_id', id).order('week_start', { ascending: false })),
      q<Pick<Module, 'id' | 'title'>[]>(supabase.from('ramp_modules').select('id, title')),
      q<Linked[]>(supabase.from('ramp_placements').select('id, member_id, status, replaces_id, start_date').eq('replaces_id', id)),
    ]);
    if (!p) return null;
    const [client, progress, replaced] = await Promise.all([
      q<Client>(supabase.from('ramp_clients').select('*').eq('id', p.client_id).single()),
      q<{ module_id: string }[]>(supabase.from('ramp_progress').select('module_id').eq('member_id', p.member_id).eq('status', 'completed')),
      p.replaces_id
        ? q<Linked[]>(supabase.from('ramp_placements').select('id, member_id, status, replaces_id, start_date').eq('id', p.replaces_id))
        : Promise.resolve([] as Linked[]),
    ]);
    return {
      p, client, tiers: sortTiers(tiers), people, steps, checkins, rates, timesheets, modules,
      completed: new Set(progress.map((x) => x.module_id)), linked: [...replaced, ...replacements],
    };
  }, [id]);

  const assistant = res.data ? personName(res.data.people.find((m) => m.id === res.data!.p.member_id)) : '';
  useTitle(res.data ? `${assistant} at ${res.data.client.name}` : res.data === null ? 'Placement not found' : 'Placement');

  if (res.error && !res.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Placement" />
        <ErrorBox error={res.error} onRetry={res.reload} />
      </div>
    );
  }
  if (res.data === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title={<span className="skeleton inline-block h-8 w-56 align-middle" aria-label="Loading" />} />
        <Skeleton rows={5} />
      </div>
    );
  }
  if (res.data === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Placement not found" />
        <Card>
          <EmptyState icon="link" title="This placement isn’t in RAMP" body="The link may be wrong."
            action={<LinkButton to="/admin/placements" variant="primary">Go to placements</LinkButton>} />
        </Card>
      </div>
    );
  }
  return <Detail d={res.data} assistant={assistant} reload={res.reload} setData={res.setData} />;
}

function Detail({ d, assistant, reload, setData }: {
  d: Data; assistant: string; reload: () => Promise<void>; setData: (fn: (prev: Data | null | undefined) => Data | null) => void;
}) {
  const { p, client } = d;
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'checklist';
  const setTab = (t: Tab) => setParams((x) => { const n = new URLSearchParams(x); if (t === 'checklist') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });
  useTabInView('Placement sections', tab);
  const [statusOpen, setStatusOpen] = useState(false);
  const [rateTarget, setRateTarget] = useState<RateTarget | null>(null);
  const [place, setPlace] = useState<PlacePrefill | null>(null);

  const tier = d.tiers.find((t) => t.id === p.tier_id) || null;
  const nameOf = useCallback((mid: string | null) => personName(d.people.find((m) => m.id === mid)), [d.people]);
  const coach = p.coach_id ? nameOf(p.coach_id) : null;
  const readiness = useMemo(() => readinessFor(p, d.tiers, d.completed, d.checkins,
    (mid) => d.modules.find((m) => m.id === mid)?.title || 'Removed module'), [p, d.tiers, d.completed, d.checkins, d.modules]);
  const setSteps = useCallback((fn: (s: PlacementStep[]) => PlacementStep[]) => setData((prev) => (prev ? { ...prev, steps: fn(prev.steps) } : prev ?? null)), [setData]);

  const stepsDone = d.steps.filter((s) => s.done_at).length;
  const waiting = d.timesheets.filter((t) => t.status === 'submitted').length;
  const overdue = d.checkins.filter((c) => c.status === 'scheduled' && (daysUntil(c.due_date) ?? 1) < 0).length;
  const options: { value: Tab; label: string }[] = [
    { value: 'checklist', label: d.steps.length ? `Checklist ${stepsDone}/${d.steps.length}` : 'Checklist' },
    { value: 'checkins', label: overdue ? `Check-ins (${overdue} overdue)` : 'Check-ins' },
    { value: 'hours', label: waiting ? `Hours (${waiting} waiting)` : 'Hours' },
    { value: 'rates', label: readiness.ready && readiness.next ? 'Rates and tier · ready' : 'Rates and tier' },
    { value: 'launch', label: 'Launch plan' },
    { value: 'details', label: 'Details' },
  ];

  const gLeft = daysUntil(p.guarantee_until);
  const inGuarantee = gLeft !== null && gLeft >= 0 && p.status !== 'proposed';
  const replaces = d.linked.find((l) => l.id === p.replaces_id) || null;
  const replacedBy = d.linked.filter((l) => l.replaces_id === p.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW}
        title={<span className="flex items-center gap-3 min-w-0"><Avatar name={assistant} size={48} tone={p.status === 'ended' ? 'ink' : 'brand'} /><span className="min-w-0 break-words">{assistant}</span></span>}
        subtitle={<>{p.title} at <Link to={`/admin/clients/${client.id}`} className="font-semibold text-brand-ink">{client.name}</Link></>}
        actions={<Button onClick={() => setStatusOpen(true)} icon="refresh">Change status</Button>} />

      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <PlacementStatusChip status={p.status} />
        <TierChip tier={tier} />
        <span className="text-sm text-muted">
          {startText(p.start_date)}
          {p.status === 'ended' && p.end_date ? ` · ended ${longDate(p.end_date)}` : ''}
          {coach ? ` · coach ${coach}` : ' · no coach'}
        </span>
        <span className="inline-flex gap-3">
          <Link to={`/admin/people/${p.member_id}`} className="text-sm font-semibold text-brand-ink min-h-11 inline-flex items-center">{assistant.split(' ')[0]}’s profile</Link>
          <Link to="/admin/placements" className="text-sm font-semibold text-brand-ink min-h-11 inline-flex items-center">All placements</Link>
        </span>
      </div>
      {p.status === 'ended' && p.ended_reason && <Notice tone="dark" icon="info">Ended: {p.ended_reason}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
        <Card>
          <CardHeader title="Rates" className="mb-3"
            action={<Button size="sm" icon="pen" onClick={() => setRateTarget({ placement: p, assistant, client: client.name })}>Change</Button>} />
          <EconGrid hoursPerWeek={p.hours_per_week} bill={p.bill_rate} pay={p.pay_rate} currency={p.currency} />
        </Card>
        <Card className="flex flex-col gap-3">
          <CardHeader title="Replacement guarantee" subtitle={
            !p.guarantee_until ? 'Set when the placement gets a start date.'
              : gLeft !== null && gLeft >= 0 ? `Until ${longDate(p.guarantee_until)} · ${gLeft === 0 ? 'ends today' : `${plural(gLeft, 'day')} left`}`
                : `Ended ${longDate(p.guarantee_until)}`} />
          {inGuarantee && gLeft !== null && gLeft <= 14 && <Notice tone="warn" icon="clock">The guarantee ends soon. Check in with {client.name} before it does.</Notice>}
          {replaces && <p className="text-sm text-ink-2">Replaces <Link to={`/admin/placements/${replaces.id}`} className="font-semibold text-brand-ink">{nameOf(replaces.member_id)}</Link>.</p>}
          {replacedBy.map((r) => (
            <p key={r.id} className="text-sm text-ink-2">Replacement: <Link to={`/admin/placements/${r.id}`} className="font-semibold text-brand-ink">{nameOf(r.member_id)}</Link> ({PLACEMENT_STATUS[r.status].label.toLowerCase()}).</p>
          ))}
          <Button className="self-start" icon="users"
            onClick={() => setPlace({ replaces: p, replacesName: assistant })}>Start a replacement</Button>
        </Card>
      </div>

      <TabBar options={options} value={tab} onChange={setTab} label="Placement sections" />

      {tab === 'checklist' && <ChecklistTab placementId={p.id} steps={d.steps} setSteps={setSteps} nameOf={nameOf} />}
      {tab === 'checkins' && <CheckinsTab placementId={p.id} checkins={d.checkins} assistant={assistant} client={client.name} nameOf={nameOf} onChanged={reload} />}
      {tab === 'hours' && <HoursTab placement={p} timesheets={d.timesheets} rateChanges={d.rates} assistant={assistant} client={client.name} onChanged={reload} />}
      {tab === 'rates' && <RatesTab placement={p} tiers={d.tiers} history={d.rates} readiness={readiness} nameOf={nameOf}
        onChange={(promoteTo) => setRateTarget({ placement: p, assistant, client: client.name, promoteTo })} />}
      {tab === 'launch' && <LaunchTab placementId={p.id} client={client.name} />}
      {tab === 'details' && <DetailsTab placement={p} people={d.people} client={client} onSaved={reload} />}

      <RateSheet target={rateTarget} tiers={d.tiers} onClose={() => setRateTarget(null)} onDone={reload} />
      {statusOpen && <StatusSheet p={p} assistant={assistant} client={client.name} inGuarantee={inGuarantee} onClose={() => setStatusOpen(false)} onDone={reload} />}
      <PlaceSheet open={!!place} prefill={place} onClose={() => setPlace(null)} />
    </div>
  );
}

const STATUS_ORDER: PlacementStatus[] = ['proposed', 'onboarding', 'active', 'paused', 'ended'];
const STATUS_DESC: Record<PlacementStatus, string> = {
  proposed: 'Not confirmed yet. The team member and the client don’t see it.',
  onboarding: 'Confirmed. Working through the checklist and launch plan before day 1.',
  active: 'Working with the client and logging hours.',
  paused: 'On hold. Nothing is prepaid for paused placements.',
  ended: 'Finished. Hours already logged can still be approved, billed and paid.',
};

function StatusSheet({ p, assistant, client, inGuarantee, onClose, onDone }: {
  p: Placement; assistant: string; client: string; inGuarantee: boolean; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<PlacementStatus>(p.status);
  const [end, setEnd] = useState(p.end_date || todayISO());
  const [reason, setReason] = useState(p.ended_reason || '');
  const [start, setStart] = useState(p.start_date || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsStart = (status === 'onboarding' || status === 'active') && !p.start_date;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    if (status === p.status && status !== 'ended') { onClose(); return; }
    if (status === 'ended' && (!end || !reason.trim())) { setError('Add the end date and the reason it ended.'); return; }
    if (status === 'active' && !p.start_date && !start) { setError('Add the start date.'); return; }
    setBusy(true);
    try {
      const patch: Partial<Placement> = { status };
      if (status === 'ended') { patch.end_date = end; patch.ended_reason = reason.trim().slice(0, 500); }
      else patch.end_date = null;
      if (needsStart && start) patch.start_date = start;
      const { error: e1 } = await supabase.from('ramp_placements').update(patch).eq('id', p.id);
      if (e1) throw e1;
      if (needsStart && start) {
        const { error: e2 } = await supabase.rpc('ramp_placement_seed', { p_placement: p.id });
        if (e2) toast(`Status changed, but check-ins couldn’t be scheduled: ${errText(e2)}`, 'bad');
      }
      toast(status === 'ended' ? `${assistant}’s placement at ${client} ended.` : `Now ${PLACEMENT_STATUS[status].label.toLowerCase()}.`);
      onDone();
      onClose();
    } catch (x) {
      setError(errText(x));
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title="Change status" subtitle={`${assistant} at ${client}. Now ${PLACEMENT_STATUS[p.status].label.toLowerCase()}.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={status === 'ended' ? 'danger' : 'primary'} type="submit" form="core-status-form" loading={busy}>
          {status === 'ended' ? 'End placement' : status === p.status ? 'Done' : `Mark ${PLACEMENT_STATUS[status].label.toLowerCase()}`}
        </Button></>}>
      <form id="core-status-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        <Pills label="Status" value={status} onChange={setStatus} options={STATUS_ORDER.map((s) => ({ value: s, label: PLACEMENT_STATUS[s].label }))} />
        <p className="text-[15px] text-ink-2 -mt-1">{STATUS_DESC[status]}</p>
        {needsStart && (
          <Field label="Start date" required={status === 'active'} hint="Check-ins and the replacement guarantee are scheduled from it.">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
        )}
        {status === 'ended' && (
          <>
            <Field label="Last day" required><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            <Field label="Why it ended" required hint="Only admins see this.">
              <Textarea rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Client reduced hours; team member moved to another client." />
            </Field>
            {inGuarantee && <Notice tone="warn" icon="alert">This placement is still inside its replacement guarantee. If {client} wants someone new, use Start a replacement on the placement page.</Notice>}
          </>
        )}
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
