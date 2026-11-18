import { useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { money, plural, todayISO } from '../../lib/util';
import type { Client, ClientModule, ClientRequest, Invoice, Module, Placement, Tier } from '../../lib/types';
import { Avatar, Button, Card, EmptyState, ErrorBox, LinkButton, PageHeader, Skeleton } from '../../ui';
import { TabBar } from '../parts/ops-common';
import { AGENCY_BACK, CYCLE_LABEL, ClientStatusChip, EYEBROW, MEMBER_COLS, useTabInView, PlacementRow, econ, personName, sortTiers, type MemberLite } from './parts/core-common';
import { ContactsTab, InvoicesTab, OverviewTab, RequestsTab, TrainingTrackTab } from './parts/core-client-tabs';
import { PlaceSheet, type PlacePrefill } from './parts/core-place';

type Tab = 'overview' | 'placements' | 'contacts' | 'training' | 'invoices' | 'requests';
const TABS: Tab[] = ['overview', 'placements', 'contacts', 'training', 'invoices', 'requests'];

interface Data {
  client: Client;
  placements: Placement[];
  people: MemberLite[];
  tiers: Tier[];
  invoices: Invoice[];
  requests: ClientRequest[];
  track: ClientModule[];
  modules: Pick<Module, 'id' | 'title' | 'status' | 'track' | 'minutes' | 'summary'>[];
}

export default function ClientDetail() {
  const { id = '' } = useParams();
  const res = useAsync<Data | null>(async () => {
    const [client, placements, people, tiers, invoices, requests, track, modules] = await Promise.all([
      q<Client | null>(supabase.from('ramp_clients').select('*').eq('id', id).maybeSingle()),
      q<Placement[]>(supabase.from('ramp_placements').select('*').eq('client_id', id).order('start_date', { ascending: false })),
      q<MemberLite[]>(supabase.from('ramp_members').select(MEMBER_COLS)),
      q<Tier[]>(supabase.from('ramp_tiers').select('*').order('level')),
      q<Invoice[]>(supabase.from('ramp_invoices').select('*').eq('client_id', id).order('created_at', { ascending: false })),
      q<ClientRequest[]>(supabase.from('ramp_client_requests').select('*').eq('client_id', id).order('created_at', { ascending: false })),
      q<ClientModule[]>(supabase.from('ramp_client_modules').select('*').eq('client_id', id).order('sort')),
      q<Data['modules']>(supabase.from('ramp_modules').select('id, title, status, track, minutes, summary').order('sort')),
    ]);
    if (!client) return null;
    return { client, placements, people, tiers: sortTiers(tiers), invoices, requests, track, modules };
  }, [id]);
  useTitle(res.data ? res.data.client.name : res.data === null ? 'Client not found' : 'Client');

  if (res.error && !res.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Client" />
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
        <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Client not found" />
        <Card><EmptyState icon="building" title="This client isn’t in RAMP" body="The link may be wrong." action={<LinkButton to="/admin/clients" variant="primary">Go to clients</LinkButton>} /></Card>
      </div>
    );
  }
  return <Detail d={res.data} reload={res.reload} setData={res.setData} />;
}

function Detail({ d, reload, setData }: { d: Data; reload: () => Promise<void>; setData: (fn: (prev: Data | null | undefined) => Data | null) => void }) {
  const { client } = d;
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'overview';
  const setTab = (t: Tab) => setParams((x) => { const n = new URLSearchParams(x); if (t === 'overview') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });
  useTabInView('Client sections', tab);
  const [place, setPlace] = useState<PlacePrefill | null>(null);

  const patch = useCallback((fn: (x: Data) => Data) => setData((prev) => (prev ? fn(prev) : prev ?? null)), [setData]);
  const nameOf = useCallback((mid: string | null) => (mid ? personName(d.people.find((m) => m.id === mid)) : null), [d.people]);
  const assistantOf = useCallback((pid: string | null) => {
    const p = pid ? d.placements.find((x) => x.id === pid) : null;
    return p ? personName(d.people.find((m) => m.id === p.member_id)) : null;
  }, [d.placements, d.people]);

  const contacts = d.people.filter((m) => m.level === 'client' && m.client_id === client.id);
  const working = d.placements.filter((p) => p.status === 'active' || p.status === 'onboarding');
  const open = d.placements.filter((p) => p.status !== 'ended');
  const weekBill = working.reduce((s, p) => s + econ(p.hours_per_week, p.bill_rate, p.pay_rate).week.bill, 0);
  const weekMargin = working.reduce((s, p) => s + econ(p.hours_per_week, p.bill_rate, p.pay_rate).week.margin, 0);
  const today = todayISO();
  const balance = d.invoices.filter((i) => i.status === 'open').reduce((s, i) => s + Number(i.total || 0), 0);
  const overdue = d.invoices.filter((i) => i.status === 'open' && i.due_date && i.due_date < today).length;
  const openRequests = d.requests.filter((r) => r.status !== 'done').length;

  const options: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'placements', label: `Placements (${open.length})` },
    { value: 'contacts', label: `Contacts (${contacts.filter((c) => c.status !== 'inactive').length})` },
    { value: 'training', label: `Training track (${d.track.length})` },
    { value: 'invoices', label: overdue ? `Invoices (${overdue} overdue)` : `Invoices (${d.invoices.filter((i) => i.status !== 'void').length})` },
    { value: 'requests', label: openRequests ? `Requests (${openRequests} open)` : 'Requests' },
  ];

  const rows = [...d.placements]
    .sort((a, b) => (a.status === 'ended' ? 1 : 0) - (b.status === 'ended' ? 1 : 0) || (b.start_date || '').localeCompare(a.start_date || ''))
    .map((p) => ({ p, assistant: personName(d.people.find((m) => m.id === p.member_id)), client: client.name, tier: d.tiers.find((t) => t.id === p.tier_id) || null }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW}
        title={<span className="flex items-center gap-3 min-w-0"><Avatar name={client.name} size={48} tone={client.status === 'ended' ? 'ink' : 'brand'} /><span className="min-w-0 break-words">{client.name}</span></span>}
        subtitle={[client.industry, `Billed ${CYCLE_LABEL[client.billing_cycle].toLowerCase()}, ${client.billing_mode === 'advance' ? 'up front' : 'after the work'}`,
          client.net_days ? `invoices due in ${plural(client.net_days, 'day')}` : 'invoices due on receipt'].filter(Boolean).join(' · ')}
        actions={<Button variant="primary" icon="plus" onClick={() => setPlace({ clientId: client.id })}>Place a team member</Button>} />

      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <ClientStatusChip status={client.status} />
        <span className="text-sm text-muted">
          {plural(working.length, 'working team member')} · {money(weekBill, client.currency)} billed and {money(weekMargin, client.currency)} margin a week · {money(balance, client.currency)} open
        </span>
      </div>

      <TabBar options={options} value={tab} onChange={setTab} label="Client sections" />

      {tab === 'overview' && <OverviewTab client={client} openPlacements={open.length} onSaved={(c) => patch((x) => ({ ...x, client: c }))} />}
      {tab === 'placements' && (
        <Card padded={false} className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon="link" title="No placements yet" body={`Place a trained team member with ${client.name}. RAMP sets up the checklist, check-ins and guarantee.`}
              action={<Button variant="primary" icon="plus" onClick={() => setPlace({ clientId: client.id })}>Place a team member</Button>} />
          ) : (
            <ul>{rows.map((r) => <PlacementRow key={r.p.id} row={r} showClient={false} />)}</ul>
          )}
        </Card>
      )}
      {tab === 'contacts' && <ContactsTab client={client} contacts={contacts} placements={d.placements} assistantName={(mid) => personName(d.people.find((m) => m.id === mid))} onChanged={reload} />}
      {tab === 'training' && <TrainingTrackTab client={client} track={d.track} modules={d.modules} onChanged={(t) => patch((x) => ({ ...x, track: t }))} />}
      {tab === 'invoices' && <InvoicesTab client={client} invoices={d.invoices} />}
      {tab === 'requests' && <RequestsTab client={client} requests={d.requests} nameOf={nameOf} assistantOf={assistantOf}
        onSaved={(r) => patch((x) => ({ ...x, requests: x.requests.map((y) => (y.id === r.id ? r : y)) }))} />}

      <PlaceSheet open={!!place} prefill={place} onClose={() => setPlace(null)} />
    </div>
  );
}
