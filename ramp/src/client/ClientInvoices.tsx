// Client portal invoices: everything issued to this client (row-level security limits it to theirs, never drafts).
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { INVOICE_STATUS, cx, daysUntil, dueLabel, fmtDate, money, plural } from '../lib/util';
import type { Client, Invoice } from '../lib/types';
import { Card, Chip, EmptyState, ErrorBox, Icon, PageHeader, Skeleton } from '../ui';
import { ExternalButton, invoicePeriod } from './parts/portal-common';

const INV_COLS = 'id, client_id, number, status, period_start, period_end, issue_date, due_date, currency, total, paid_at, stripe_url, stripe_pdf, sent_at';
type Row = Pick<Invoice, 'id' | 'client_id' | 'number' | 'status' | 'period_start' | 'period_end' | 'issue_date' | 'due_date' | 'currency' | 'total' | 'paid_at' | 'stripe_url' | 'stripe_pdf' | 'sent_at'>;

function DueText({ inv }: { inv: Row }) {
  if (inv.status === 'paid') return <span className="text-muted">Paid {fmtDate(inv.paid_at)}</span>;
  if (inv.status === 'void') return <span className="text-muted">Voided</span>;
  if (!inv.due_date) return <span className="text-muted">No due date</span>;
  const late = (daysUntil(inv.due_date) ?? 0) < 0;
  return <span className={cx(late ? 'text-bad font-semibold' : 'text-ink-2')}>{dueLabel(inv.due_date)}</span>;
}

export default function ClientInvoices() {
  useTitle('Invoices');
  const { me, roles } = useMe();
  const navigate = useNavigate();
  const { data, error, reload } = useAsync(async () => {
    const [invoices, client] = await Promise.all([
      q<Row[]>(supabase.from('ramp_invoices').select(INV_COLS).neq('status', 'draft')
        .order('issue_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })),
      roles.client?.id
        ? q<Pick<Client, 'billing_email' | 'net_days'> | null>(supabase.from('ramp_clients').select('billing_email, net_days').eq('id', roles.client.id).maybeSingle()).catch(() => null)
        : Promise.resolve(null),
    ]);
    return { invoices, client };
  }, [me.id, roles.client?.id]);

  const header = <PageHeader title="Invoices" subtitle="Every invoice we’ve sent you, with what’s due and when." />;
  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={4} /></div>;

  const list = data.invoices;
  const open = list.filter((i) => i.status === 'open');
  const balance = open.reduce((a, i) => a + Number(i.total || 0), 0);
  const nextDue = open.filter((i) => i.due_date && (daysUntil(i.due_date) ?? 0) >= 0).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
  const overdue = open.filter((i) => i.due_date && (daysUntil(i.due_date) ?? 0) < 0).length;
  const cur = list[0]?.currency || 'USD';
  const active = list.filter((i) => i.status !== 'void');
  const voided = list.filter((i) => i.status === 'void');

  if (!list.length) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <EmptyState icon="fileText" title="No invoices yet"
            body={`Invoices show up here as soon as they’re issued${data.client?.billing_email ? `, and we email them to ${data.client.billing_email}` : ''}.`} />
        </Card>
      </div>
    );
  }

  const row = (i: Row) => {
    const st = INVOICE_STATUS[i.status];
    const payable = i.status === 'open' && !!i.stripe_url;
    return { st, payable };
  };

  return (
    <div className="flex flex-col gap-6">
      {header}

      <section aria-label="Balance" className={cx('rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-3', overdue ? 'bg-bad-soft' : open.length ? 'bg-warn-soft' : 'bg-good-soft')}>
        <div className="min-w-0 flex-1">
          <p className={cx('text-[13px] font-semibold', overdue ? 'text-bad' : open.length ? 'text-warn' : 'text-good')}>{open.length ? 'Open balance' : 'All paid up'}</p>
          <p className="font-display text-[30px] leading-tight font-bold tabular-nums">{money(balance, cur)}</p>
          <p className="text-sm text-ink-2">
            {open.length === 0 ? 'Thank you. There’s nothing to pay right now.'
              : `${plural(open.length, 'open invoice')}${overdue ? `, ${overdue} past due` : ''}${nextDue ? `. Next due ${fmtDate(nextDue.due_date, { month: 'long', day: 'numeric' })}.` : '.'}`}
          </p>
        </div>
        {open.length === 1 && open[0]!.stripe_url && <ExternalButton href={open[0]!.stripe_url} icon="lock" className="w-full sm:w-auto">Pay {money(open[0]!.total, open[0]!.currency)}</ExternalButton>}
      </section>

      {/* Phones: cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {[...active, ...voided].map((i) => {
          const { st, payable } = row(i);
          return (
            <li key={i.id} className={cx('bg-card border border-line rounded-2xl', i.status === 'void' && 'opacity-70')}>
              <button type="button" onClick={() => navigate(`/client/invoices/${i.id}`)} className="w-full text-left px-4 pt-4 pb-3 flex flex-col gap-2 cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold">{i.number}</p>
                    <p className="text-[13px] text-muted">{invoicePeriod(i.period_start, i.period_end)}</p>
                  </div>
                  <span className="text-[17px] font-semibold tabular-nums">{money(i.total, i.currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <DueText inv={i} />
                  <Chip tone={st.tone}>{st.label}</Chip>
                </div>
              </button>
              <div className="flex gap-2 px-4 pb-4">
                <button type="button" onClick={() => navigate(`/client/invoices/${i.id}`)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-[#C9CED6] bg-white text-[15px] font-semibold cursor-pointer">
                  View<span className="sr-only"> invoice {i.number}</span>
                </button>
                {payable && <ExternalButton href={i.stripe_url!} icon="lock" className="flex-1">Pay</ExternalButton>}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Larger screens: table */}
      <Card padded={false} className="hidden md:block overflow-hidden">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="text-left text-[13px] text-muted border-b border-line">
              <th scope="col" className="font-semibold px-5 py-3">Invoice</th>
              <th scope="col" className="font-semibold px-3 py-3">Period</th>
              <th scope="col" className="font-semibold px-3 py-3">Due</th>
              <th scope="col" className="font-semibold px-3 py-3 text-right">Total</th>
              <th scope="col" className="font-semibold px-3 py-3">Status</th>
              <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {[...active, ...voided].map((i) => {
              const { st, payable } = row(i);
              return (
                <tr key={i.id} className={cx('border-t border-line-2 first:border-t-0 hover:bg-bg cursor-pointer', i.status === 'void' && 'opacity-70')}
                  onClick={() => navigate(`/client/invoices/${i.id}`)}>
                  <td className="px-5 py-3">
                    <a href={`/client/invoices/${i.id}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/client/invoices/${i.id}`); }}
                      className="font-semibold text-ink no-underline hover:text-brand-ink">{i.number}</a>
                    {i.issue_date && <span className="block text-[13px] text-muted">Issued {fmtDate(i.issue_date)}</span>}
                  </td>
                  <td className="px-3 py-3 text-ink-2 whitespace-nowrap">{invoicePeriod(i.period_start, i.period_end)}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-[13px]"><DueText inv={i} /></td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{money(i.total, i.currency)}</td>
                  <td className="px-3 py-3"><Chip tone={st.tone}>{st.label}</Chip></td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {payable ? <ExternalButton href={i.stripe_url!} size="sm" icon="lock">Pay</ExternalButton>
                      : <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted inline" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {open.some((i) => !i.stripe_url) && (
        <p className="text-[13px] text-muted">Invoices without a Pay button are paid by the method on the invoice. Open one to see the details.</p>
      )}
    </div>
  );
}
