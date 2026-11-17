import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { money, plural } from '../../lib/util';
import type { Payout } from '../../lib/types';
import { Button, Card, EmptyState, ErrorBox, PageHeader, Skeleton } from '../../ui';
import { AGENCY_BACK, AGENCY_EYEBROW, MoneyStat, PayoutChip, dayIn, rangeLabel, selectIn, sumMoney, useOrgToday } from './parts/money-common';
import { NewPayoutSheet, WaitingCard, loadWaiting } from './parts/money-payout-new';

export default function Payouts() {
  useTitle('Payouts');
  const { org } = useMe();
  const today = useOrgToday();
  const navigate = useNavigate();
  const currency = org.agency?.payout_currency || 'USD';
  const onlyPaidDefault = org.agency?.pay_when_paid ?? true;

  const list = useAsync(async () => {
    const payouts = await q<Payout[]>(supabase.from('ramp_payouts').select('*').is('discarded_at', null).order('period_end', { ascending: false }).order('created_at', { ascending: false }));
    const lines = await selectIn<{ payout_id: string; member_id: string }>('ramp_payout_lines', 'payout_id, member_id', 'payout_id', payouts.map((p) => p.id));
    const people = new Map<string, Set<string>>();
    for (const l of lines) people.set(l.payout_id, (people.get(l.payout_id) || new Set()).add(l.member_id));
    return { payouts, people };
  }, []);
  const waiting = useAsync(loadWaiting, []);
  const [creating, setCreating] = useState(false);

  const stats = useMemo(() => {
    const p = list.data?.payouts || [];
    const open = p.filter((x) => x.status !== 'sent');
    const year = today.slice(0, 4);
    const sentYear = p.filter((x) => x.status === 'sent' && (x.sent_at || '').slice(0, 4) === year);
    const ready = (waiting.data?.rows || []).filter((r) => r.paid).reduce((a, r) => a + r.total * r.rate, 0);
    const owed = (waiting.data?.rows || []).filter((r) => !r.paid).reduce((a, r) => a + r.total * r.rate, 0);
    const m = (xs: Payout[]) => sumMoney(xs.map((x) => ({ amount: x.total, currency: x.currency })), currency);
    return { open, sentYear, ready, owed, m };
  }, [list.data, waiting.data, today, currency]);

  const payouts = list.data?.payouts;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={AGENCY_EYEBROW} title="Payouts"
        subtitle="Pay assistants for approved hours. Create a payout, export the Wise batch files, then mark it sent."
        actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New payout</Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <MoneyStat label="Ready to pay" value={waiting.data ? `≈ ${money(stats.ready, currency)}` : '…'} hint="Approved, client paid" tone={stats.ready > 0 ? 'good' : undefined} />
        <MoneyStat label="Waiting on clients" value={waiting.data ? `≈ ${money(stats.owed, currency)}` : '…'} hint="Approved, not paid yet" />
        <MoneyStat label="Not sent yet" value={payouts ? stats.m(stats.open) : '…'} hint={payouts ? plural(stats.open.length, 'payout') : ''} tone={stats.open.length ? 'warn' : undefined} />
        <MoneyStat label={`Sent in ${today.slice(0, 4)}`} value={payouts ? stats.m(stats.sentYear) : '…'} hint={payouts ? plural(stats.sentYear.length, 'payout') : ''} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="payout-list">
        <h2 id="payout-list" className="font-display text-xl font-semibold">Payouts</h2>
        <Card padded={false} className="overflow-hidden">
          {list.error && !payouts ? <div className="p-4"><ErrorBox error={list.error} onRetry={list.reload} /></div>
            : !payouts ? <div className="p-4"><Skeleton rows={3} /></div>
              : payouts.length === 0 ? (
                <EmptyState icon="send" title="No payouts yet"
                  body="When hours are approved (and paid, if you pay only for paid invoices), create a payout to gather them and export Wise batch files."
                  action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New payout</Button>} />
              ) : (
                <>
                  <table className="hidden md:table w-full text-[15px]">
                    <caption className="sr-only">Payouts</caption>
                    <thead>
                      <tr className="text-left text-[13px] text-muted border-b border-line">
                        <th scope="col" className="font-semibold pl-5 pr-3 py-3">Payout</th>
                        <th scope="col" className="font-semibold px-3 py-3">Weeks</th>
                        <th scope="col" className="font-semibold px-3 py-3 text-right">Assistants</th>
                        <th scope="col" className="font-semibold px-3 py-3 text-right">Total</th>
                        <th scope="col" className="font-semibold px-3 py-3">Status</th>
                        <th scope="col" className="font-semibold pl-3 pr-5 py-3">Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.id} className="border-t border-line-2 hover:bg-[#FAFBFC] cursor-pointer" onClick={() => navigate(`/admin/payouts/${p.id}`)}>
                          <td className="pl-5 pr-3 py-3">
                            <Link to={`/admin/payouts/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-ink no-underline hover:underline">{p.label || 'Payout'}</Link>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-ink-2">{rangeLabel(p.period_start, p.period_end)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{list.data!.people.get(p.id)?.size || 0}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-semibold whitespace-nowrap">{money(p.total, p.currency)}</td>
                          <td className="px-3 py-3"><PayoutChip payout={p} /></td>
                          <td className="pl-3 pr-5 py-3 text-ink-2 whitespace-nowrap">{p.sent_at ? dayIn(p.sent_at, org.timezone) : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="md:hidden">
                    {payouts.map((p) => (
                      <li key={p.id} className="border-t border-line-2 first:border-t-0">
                        <Link to={`/admin/payouts/${p.id}`} className="flex flex-col gap-1 px-4 py-3.5 no-underline text-ink hover:bg-[#FAFBFC]">
                          <span className="flex items-center justify-between gap-3">
                            <span className="font-semibold leading-snug">{rangeLabel(p.period_start, p.period_end)}</span>
                            <span className="font-display text-lg font-bold tabular-nums">{money(p.total, p.currency)}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                            <PayoutChip payout={p} />
                            <span>{plural(list.data!.people.get(p.id)?.size || 0, 'assistant')}</span>
                            {p.sent_at && <span>· sent {dayIn(p.sent_at, org.timezone)}</span>}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
        </Card>
      </section>

      {waiting.error && !waiting.data ? <ErrorBox error={waiting.error} onRetry={waiting.reload} />
        : !waiting.data ? <Skeleton rows={2} />
          : <WaitingCard data={waiting.data} currency={currency} onNew={() => setCreating(true)} />}

      <NewPayoutSheet open={creating} onClose={() => setCreating(false)} today={today} waiting={waiting.data} defaultOnlyPaid={onlyPaidDefault} currency={currency} />
    </div>
  );
}
