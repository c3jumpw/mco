import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { PLACEMENT_STATUS, money, plural } from '../../lib/util';
import type { Client, Placement, PlacementStatus, Tier } from '../../lib/types';
import { Button, Card, EmptyState, ErrorBox, PageHeader, SearchInput, Select, Skeleton } from '../../ui';
import { AGENCY_BACK, EYEBROW, MEMBER_COLS, PlacementRow, econ, personName, sortTiers, type MemberLite, type PlacementRowData } from './parts/core-common';
import { PlaceSheet, type PlacePrefill } from './parts/core-place';

interface Data { placements: Placement[]; clients: Pick<Client, 'id' | 'name' | 'status'>[]; tiers: Tier[]; people: MemberLite[] }

const ORDER: PlacementStatus[] = ['active', 'onboarding', 'proposed', 'paused', 'ended'];
type StatusFilter = 'open' | 'all' | PlacementStatus;

export default function Placements() {
  useTitle('Placements');
  const [params, setParams] = useSearchParams();
  const res = useAsync<Data>(async () => {
    const [placements, clients, tiers, people] = await Promise.all([
      q<Placement[]>(supabase.from('ramp_placements').select('*').order('start_date', { ascending: false })),
      q<Data['clients']>(supabase.from('ramp_clients').select('id, name, status').order('name')),
      q<Tier[]>(supabase.from('ramp_tiers').select('*').order('level')),
      q<MemberLite[]>(supabase.from('ramp_members').select(MEMBER_COLS)),
    ]);
    return { placements, clients, tiers: sortTiers(tiers), people };
  }, []);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const client = params.get('client') || 'all';
  const setClient = (v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'all') n.delete('client'); else n.set('client', v); return n; }, { replace: true });
  const [tier, setTier] = useState(params.get('tier') || 'all');
  const [place, setPlace] = useState<PlacePrefill | null>(null);

  // ?new=1 opens the place sheet (from the dashboard's first-time setup).
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setPlace({ clientId: params.get('client') || undefined });
    setParams((p) => { const n = new URLSearchParams(p); n.delete('new'); return n; }, { replace: true });
  }, [params, setParams]);

  const rows = useMemo<PlacementRowData[]>(() => {
    if (!res.data) return [];
    const d = res.data;
    const s = search.trim().toLowerCase();
    return d.placements
      .filter((p) => status === 'all' || (status === 'open' ? p.status !== 'ended' : p.status === status))
      .filter((p) => client === 'all' || p.client_id === client)
      .filter((p) => tier === 'all' || (tier === 'none' ? !p.tier_id : p.tier_id === tier))
      .map((p) => ({
        p,
        assistant: personName(d.people.find((m) => m.id === p.member_id)),
        client: d.clients.find((c) => c.id === p.client_id)?.name || 'Client',
        tier: d.tiers.find((t) => t.id === p.tier_id) || null,
      }))
      .filter((r) => !s || [r.assistant, r.client, r.p.title].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => ORDER.indexOf(a.p.status) - ORDER.indexOf(b.p.status) || (b.p.start_date || '').localeCompare(a.p.start_date || '') || a.assistant.localeCompare(b.assistant));
  }, [res.data, search, status, client, tier]);

  const working = rows.filter((r) => r.p.status === 'active' || r.p.status === 'onboarding');
  const weekMargin = working.reduce((s, r) => s + econ(r.p.hours_per_week, r.p.bill_rate, r.p.pay_rate).week.margin, 0);
  const filtered = !!search.trim() || status !== 'open' || client !== 'all' || tier !== 'all';
  const clear = () => { setSearch(''); setStatus('open'); setClient('all'); setTier('all'); };
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of res.data?.placements || []) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [res.data]);
  const total = res.data?.placements.length || 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Placements"
        subtitle="Team members working with your clients: rates, onboarding checklists, check-ins and launch plans."
        actions={<Button variant="primary" icon="plus" onClick={() => setPlace({ clientId: client !== 'all' ? client : undefined })}>Place a team member</Button>} />

      {res.error && !res.data && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Skeleton rows={6} />}

      {res.data && (
        <>
          <div className="flex flex-col gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by team member, client or title" label="Search placements" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="open">Not ended ({total - (counts.ended || 0)})</option>
                {ORDER.map((s) => <option key={s} value={s}>{PLACEMENT_STATUS[s].label} ({counts[s] || 0})</option>)}
                <option value="all">All statuses ({total})</option>
              </Select>
              <Select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="all">All clients</option>
                {res.data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value)} className="col-span-2 sm:col-span-1">
                <option value="all">All tiers</option>
                {res.data.tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="none">No tier</option>
              </Select>
            </div>
            <p className="text-sm text-muted flex flex-wrap items-center gap-x-2">
              <span>{plural(rows.length, 'placement')}{working.length ? ` · ${money(weekMargin)} margin a week from ${plural(working.length, 'working team member')}` : ''}</span>
              {filtered && <button type="button" onClick={clear} className="min-h-11 px-1 font-semibold text-brand-ink cursor-pointer">Clear filters</button>}
            </p>
          </div>

          <Card padded={false} className="overflow-hidden">
            {rows.length === 0 ? (
              total === 0
                ? <EmptyState icon="link" title="No placements yet" body="Place a trained team member with a client. RAMP sets up their checklist, check-ins and replacement guarantee."
                  action={<Button variant="primary" icon="plus" onClick={() => setPlace({})}>Place a team member</Button>} />
                : <EmptyState icon="search" title="No placements match" body="Try a different search, or clear the filters." action={<Button onClick={clear}>Clear filters</Button>} />
            ) : (
              <ul>{rows.map((r) => <PlacementRow key={r.p.id} row={r} />)}</ul>
            )}
          </Card>
        </>
      )}

      <PlaceSheet open={!!place} prefill={place} onClose={() => setPlace(null)} />
    </div>
  );
}
