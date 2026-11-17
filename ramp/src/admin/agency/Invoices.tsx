import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { INVOICE_STATUS, cx, fmtDate, money, plural } from '../../lib/util';
import type { Invoice, InvoiceStatus } from '../../lib/types';
import { Button, Card, EmptyState, ErrorBox, Icon, PageHeader, Select, Skeleton } from '../../ui';
import { AGENCY_BACK, AGENCY_EYEBROW, InvoiceChip, MoneyStat, diffDays, isOverdue, rangeLabel, sumMoney, useOrgToday } from './parts/money-common';
import { NewInvoiceSheet, type BillingClient } from './parts/money-invoice-new';

type StatusFilter = 'all' | InvoiceStatus | 'overdue';
const FILTERS: StatusFilter[] = ['all', 'draft', 'open', 'overdue', 'paid', 'void'];

export default function Invoices() {
  useTitle('Invoices');
  const today = useOrgToday();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const data = useAsync(async () => {
    const [invoices, clients] = await Promise.all([
      q<Invoice[]>(supabase.from('ramp_invoices').select('*').order('created_at', { ascending: false }).order('number', { ascending: false })),
      q<BillingClient[]>(supabase.from('ramp_clients').select('id, name, status, billing_name, billing_email, billing_cycle, billing_mode, net_days, currency').order('name')),
    ]);
    return { invoices, clients };
  }, []);

  const initialStatus = params.get('status') as StatusFilter;
  const [status, setStatus] = useState<StatusFilter>(FILTERS.includes(initialStatus) ? initialStatus : 'all');
  const [client, setClient] = useState('all');
  const [creating, setCreating] = useState(false);
  const prefillClient = params.get('client');
  const sheetOpen = creating || !!prefillClient;
  const closeSheet = () => {
    setCreating(false);
    if (prefillClient) setParams((p) => { const n = new URLSearchParams(p); n.delete('client'); return n; }, { replace: true });
  };

  const d = data.data;
  const clientName = useMemo(() => new Map((d?.clients || []).map((c) => [c.id, c.name])), [d]);
  const rows = useMemo(() => (d?.invoices || [])
    .filter((i) => client === 'all' || i.client_id === client)
    .filter((i) => status === 'all' || (status === 'overdue' ? isOverdue(i, today) : i.status === status)),
  [d, client, status, today]);

  const stats = useMemo(() => {
    const all = d?.invoices || [];
    const open = all.filter((i) => i.status === 'open');
    const overdue = open.filter((i) => isOverdue(i, today));
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const paid30 = all.filter((i) => i.status === 'paid' && i.paid_at && i.paid_at >= cutoff);
    const drafts = all.filter((i) => i.status === 'draft');
    const m = (list: Invoice[]) => sumMoney(list.map((i) => ({ amount: i.total, currency: i.currency })));
    return { open, overdue, paid30, drafts, m };
  }, [d, today]);

  const filtered = status !== 'all' || client !== 'all';
  const clear = () => { setStatus('all'); setClient('all'); };
  const billable = rows.filter((i) => i.status !== 'void');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={AGENCY_EYEBROW} title="Invoices"
        subtitle="Bill clients for approved hours, prepayments and setup fees. Issue them yourself or send them through Stripe."
        actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)} disabled={!d}>New invoice</Button>} />

      {data.error && !d ? <ErrorBox error={data.error} onRetry={data.reload} /> : !d ? <Skeleton rows={6} /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <MoneyStat label="Open" value={stats.m(stats.open)} hint={plural(stats.open.length, 'invoice')} />
            <MoneyStat label="Overdue" value={stats.m(stats.overdue)} hint={plural(stats.overdue.length, 'invoice')} tone={stats.overdue.length ? 'bad' : undefined} />
            <MoneyStat label="Paid, last 30 days" value={stats.m(stats.paid30)} hint={plural(stats.paid30.length, 'invoice')} tone={stats.paid30.length ? 'good' : undefined} />
            <MoneyStat label="Drafts" value={stats.drafts.length} hint={stats.drafts.length ? 'Check and issue them' : 'None waiting'} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">Any status</option>
              {FILTERS.filter((f) => f !== 'all').map((f) => <option key={f} value={f}>{f === 'overdue' ? 'Overdue' : INVOICE_STATUS[f as InvoiceStatus].label}</option>)}
            </Select>
            <Select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="all">All clients</option>
              {d.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>

          <Card padded={false} className="overflow-hidden">
            {rows.length === 0 ? (
              filtered
                ? <EmptyState icon="search" title="No invoices match" body="Try another status or client, or clear the filters." action={<Button onClick={clear}>Clear filters</Button>} />
                : <EmptyState icon="fileText" title="No invoices yet"
                    body="Create one from approved hours, prepayments and setup fees. It starts as a draft you can check before sending."
                    action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New invoice</Button>} />
            ) : (
              <>
                <table className="hidden md:table w-full text-[15px]">
                  <caption className="sr-only">Invoices</caption>
                  <thead>
                    <tr className="text-left text-[13px] text-muted border-b border-line">
                      <th scope="col" className="font-semibold pl-5 pr-3 py-3">Number</th>
                      <th scope="col" className="font-semibold px-3 py-3">Client</th>
                      <th scope="col" className="font-semibold px-3 py-3">Period</th>
                      <th scope="col" className="font-semibold px-3 py-3 text-right">Total</th>
                      <th scope="col" className="font-semibold px-3 py-3">Status</th>
                      <th scope="col" className="font-semibold px-3 py-3">Due</th>
                      <th scope="col" className="font-semibold pl-1 pr-3 py-3"><span className="sr-only">Stripe</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => (
                      <tr key={i.id} className="border-t border-line-2 hover:bg-[#FAFBFC] cursor-pointer" onClick={() => navigate(`/admin/invoices/${i.id}`)}>
                        <td className="pl-5 pr-3 py-3 whitespace-nowrap">
                          <Link to={`/admin/invoices/${i.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-ink no-underline hover:underline tabular-nums">{i.number}</Link>
                        </td>
                        <td className="px-3 py-3">{clientName.get(i.client_id) || 'Client'}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-ink-2">{rangeLabel(i.period_start, i.period_end)}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold whitespace-nowrap">{money(i.total, i.currency)}</td>
                        <td className="px-3 py-3"><InvoiceChip invoice={i} today={today} /></td>
                        <td className="px-3 py-3 whitespace-nowrap"><Due inv={i} today={today} /></td>
                        <td className="pl-1 pr-3 py-1.5 w-12"><StripeLink inv={i} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="md:hidden">
                  {rows.map((i) => (
                    <li key={i.id} className="relative border-t border-line-2 first:border-t-0">
                      <Link to={`/admin/invoices/${i.id}`} className="flex flex-col gap-1 px-4 py-3.5 no-underline text-ink hover:bg-[#FAFBFC]">
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-semibold tabular-nums">{i.number}</span>
                          <span className="font-display text-lg font-bold tabular-nums">{money(i.total, i.currency)}</span>
                        </span>
                        <span className="text-sm text-ink-2 truncate">{clientName.get(i.client_id) || 'Client'} · {rangeLabel(i.period_start, i.period_end)}</span>
                        <span className={cx('flex flex-wrap items-center gap-2 mt-0.5', i.stripe_url && 'pr-12')}>
                          <InvoiceChip invoice={i} today={today} />
                          <span className="text-sm"><Due inv={i} today={today} /></span>
                        </span>
                      </Link>
                      {i.stripe_url && <div className="absolute right-2 bottom-1.5"><StripeLink inv={i} /></div>}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-line bg-bg/60 text-sm">
                  <span className="text-muted">{plural(rows.length, 'invoice')}{rows.length !== billable.length ? `, ${rows.length - billable.length} void` : ''}</span>
                  <span className="font-semibold tabular-nums">Total {sumMoney(billable.map((i) => ({ amount: i.total, currency: i.currency })))}</span>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {d && <NewInvoiceSheet open={sheetOpen} onClose={closeSheet} clients={d.clients} initialClient={prefillClient} today={today} />}
    </div>
  );
}

function Due({ inv, today }: { inv: Invoice; today: string }) {
  if (!inv.due_date || inv.status === 'void') return <span className="text-muted">–</span>;
  if (inv.status === 'paid') return <span className="text-muted">{fmtDate(inv.due_date)}</span>;
  const late = isOverdue(inv, today);
  return (
    <span className={cx(late ? 'text-bad font-semibold' : 'text-ink-2')}>
      {fmtDate(inv.due_date)}{late ? ` · ${plural(diffDays(inv.due_date, today), 'day')} late` : ''}
    </span>
  );
}

function StripeLink({ inv }: { inv: Invoice }) {
  if (!inv.stripe_url) return null;
  return (
    <a href={inv.stripe_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      aria-label={`Open ${inv.number} in Stripe`} title="Open in Stripe"
      className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-brand-ink hover:bg-brand-soft">
      <Icon name="link" size={18} />
    </a>
  );
}
