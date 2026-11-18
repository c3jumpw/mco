import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { CLIENT_STATUS, INVOICE_STATUS, cx, fmtDate, money, plural, todayISO } from '../../lib/util';
import type { Client, ClientStatus, Invoice } from '../../lib/types';
import { Avatar, Button, Card, Chip, EmptyState, ErrorBox, Icon, PageHeader, Pills, SearchInput, Skeleton } from '../../ui';
import { AGENCY_BACK, ClientStatusChip, EYEBROW } from './parts/core-common';
import { NewClientSheet } from './parts/core-client-form';

type Inv = Pick<Invoice, 'id' | 'client_id' | 'number' | 'status' | 'total' | 'due_date' | 'issue_date' | 'currency' | 'created_at'>;
interface Data {
  clients: Client[];
  placements: { client_id: string; status: string }[];
  invoices: Inv[];
  contacts: { client_id: string | null }[];
}

const STATUSES: ClientStatus[] = ['active', 'prospect', 'paused', 'ended'];

export default function Clients() {
  useTitle('Clients');
  const [params, setParams] = useSearchParams();
  const res = useAsync<Data>(async () => {
    const [clients, placements, invoices, contacts] = await Promise.all([
      q<Client[]>(supabase.from('ramp_clients').select('*').order('name')),
      q<Data['placements']>(supabase.from('ramp_placements').select('client_id, status')),
      q<Inv[]>(supabase.from('ramp_invoices').select('id, client_id, number, status, total, due_date, issue_date, currency, created_at').neq('status', 'void').order('created_at', { ascending: false })),
      q<Data['contacts']>(supabase.from('ramp_members').select('client_id').eq('level', 'client').neq('status', 'inactive')),
    ]);
    return { clients, placements, invoices, contacts };
  }, []);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (params.get('new') !== '1') return;
    setCreating(true);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('new'); return n; }, { replace: true });
  }, [params, setParams]);

  const today = todayISO();
  const rows = useMemo(() => {
    if (!res.data) return [];
    const d = res.data;
    const s = search.trim().toLowerCase();
    return d.clients
      .filter((c) => status === 'all' || c.status === status)
      .filter((c) => !s || [c.name, c.industry, c.billing_email, c.billing_name].some((v) => (v || '').toLowerCase().includes(s)))
      .map((c) => {
        const inv = d.invoices.filter((i) => i.client_id === c.id);
        const open = inv.filter((i) => i.status === 'open');
        return {
          c,
          working: d.placements.filter((p) => p.client_id === c.id && (p.status === 'active' || p.status === 'onboarding')).length,
          proposed: d.placements.filter((p) => p.client_id === c.id && p.status === 'proposed').length,
          balance: open.reduce((sum, i) => sum + Number(i.total || 0), 0),
          overdue: open.filter((i) => i.due_date && i.due_date < today).length,
          last: inv.find((i) => i.status !== 'draft') || inv[0] || null,
          contacts: d.contacts.filter((m) => m.client_id === c.id).length,
        };
      })
      .sort((a, b) => STATUSES.indexOf(a.c.status) - STATUSES.indexOf(b.c.status) || a.c.name.localeCompare(b.c.name));
  }, [res.data, search, status, today]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of res.data?.clients || []) c[x.status] = (c[x.status] || 0) + 1;
    return c;
  }, [res.data]);
  const total = res.data?.clients.length || 0;
  const filtered = !!search.trim() || status !== 'all';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Clients"
        subtitle="The companies you staff: their contacts, billing, training track and requests."
        actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New client</Button>} />

      {res.error && !res.data && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Skeleton rows={5} />}

      {res.data && (
        <>
          {total > 0 && (
            <div className="flex flex-col gap-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Search by name, industry or billing email" label="Search clients" />
              <Pills label="Status" size="sm" value={status} onChange={setStatus} options={[
                { value: 'all', label: `All (${total})` },
                ...STATUSES.map((s) => ({ value: s, label: `${CLIENT_STATUS[s].label} (${counts[s] || 0})` })),
              ]} />
              {filtered && <p className="text-sm text-muted" role="status">Showing {plural(rows.length, 'client')} of {total}.</p>}
            </div>
          )}
          <Card padded={false} className="overflow-hidden">
            {rows.length === 0 ? (
              total === 0
                ? <EmptyState icon="building" title="No clients yet" body="Add the first company you place team members with. Then invite their contacts and place a team member."
                  action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New client</Button>} />
                : <EmptyState icon="search" title="No clients match" body="Try a different search or status."
                  action={<Button onClick={() => { setSearch(''); setStatus('all'); }}>Show all clients</Button>} />
            ) : (
              <ul>
                {rows.map((r) => (
                  <li key={r.c.id} className="border-t border-line-2 first:border-t-0">
                    <Link to={`/admin/clients/${r.c.id}`} className="flex items-start sm:items-center gap-3 px-4 py-3.5 min-h-16 no-underline text-ink hover:bg-[#FAFBFC]">
                      <Avatar name={r.c.name} size={40} tone={r.c.status === 'ended' ? 'ink' : 'brand'} />
                      <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-[15px] break-words">{r.c.name}</span>
                          <ClientStatusChip status={r.c.status} />
                        </span>
                        <span className="text-sm text-muted">
                          {[r.c.industry, r.working ? plural(r.working, 'working team member') : 'No working team members', r.proposed ? `${r.proposed} proposed` : '', plural(r.contacts, 'contact')].filter(Boolean).join(' · ')}
                        </span>
                        <span className="sm:hidden text-[13px] tabular-nums flex flex-wrap gap-x-2">
                          <span className={cx(r.overdue ? 'text-bad font-semibold' : 'text-ink-2')}>{money(r.balance, r.c.currency)} open{r.overdue ? ` · ${r.overdue} overdue` : ''}</span>
                          {r.last && <span className="text-muted">Last invoice {r.last.number}</span>}
                        </span>
                      </div>
                      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-right">
                        <span className={cx('text-[15px] font-semibold tabular-nums', r.overdue ? 'text-bad' : r.balance ? 'text-ink' : 'text-muted')}>{money(r.balance, r.c.currency)} open</span>
                        {r.overdue > 0 && <Chip tone="bad" icon="alert">{plural(r.overdue, 'overdue invoice')}</Chip>}
                        <span className="text-xs text-muted">
                          {r.last ? <>Last invoice {r.last.number} · {fmtDate(r.last.issue_date || r.last.created_at)} · {INVOICE_STATUS[r.last.status].label.toLowerCase()}</> : 'No invoices yet'}
                        </span>
                      </div>
                      <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted self-center" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <NewClientSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
