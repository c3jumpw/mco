import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { addDays, cx, daysUntil, dueLabel, fmtDate, money, plural, todayISO, weekLabel } from '../../lib/util';
import type { Checkin, Client, ClientRequest, Invoice, InvoiceLine, Module, Placement, PlacementStep, Tier, Timesheet } from '../../lib/types';
import { Avatar, Button, Card, Chip, ErrorBox, Icon, LinkButton, PageHeader, Progress, Skeleton, Stat } from '../../ui';
import {
  AGENCY_BACK, EYEBROW, MEMBER_COLS, econ, hoursText, num, pctText, personName, readinessFor, sortTiers, type MemberLite, type Readiness,
} from './parts/core-common';
import { RateSheet, type RateTarget } from './parts/core-rate';
import { RequestCard } from './parts/core-requests';
import { PlaceSheet } from './parts/core-place';

type Inv = Pick<Invoice, 'id' | 'client_id' | 'number' | 'status' | 'total' | 'due_date' | 'issue_date' | 'currency' | 'created_at' | 'period_start' | 'period_end'>;
type Line = Pick<InvoiceLine, 'id' | 'invoice_id' | 'placement_id' | 'kind' | 'period_start' | 'period_end'>;

interface Data {
  placements: Placement[];
  clients: Pick<Client, 'id' | 'name' | 'status' | 'currency'>[];
  tiers: Tier[];
  people: MemberLite[];
  submitted: Timesheet[];
  unpaid: Timesheet[];
  requests: ClientRequest[];
  invoices: Inv[];
  due: Checkin[];
  scored: Pick<Checkin, 'placement_id' | 'status' | 'score' | 'done_at'>[];
  steps: Pick<PlacementStep, 'placement_id' | 'done_at'>[];
  lines: Line[];
  completed: { member_id: string; module_id: string }[];
  modules: Pick<Module, 'id' | 'title'>[];
}

const WORKING = new Set(['onboarding', 'active']);

export default function AgencyHome() {
  useTitle('Agency');
  const { org } = useMe();
  const today = todayISO();
  const res = useAsync<Data>(async () => {
    const [placements, clients, tiers, people, submitted, unpaid, requests, invoices, due, modules] = await Promise.all([
      q<Placement[]>(supabase.from('ramp_placements').select('*')),
      q<Data['clients']>(supabase.from('ramp_clients').select('id, name, status, currency').order('name')),
      q<Tier[]>(supabase.from('ramp_tiers').select('*').order('level')),
      q<MemberLite[]>(supabase.from('ramp_members').select(MEMBER_COLS)),
      q<Timesheet[]>(supabase.from('ramp_timesheets').select('*').eq('status', 'submitted').order('week_start')),
      q<Timesheet[]>(supabase.from('ramp_timesheets').select('*').eq('status', 'approved').is('payout_line_id', null)),
      q<ClientRequest[]>(supabase.from('ramp_client_requests').select('*').neq('status', 'done').order('created_at')),
      q<Inv[]>(supabase.from('ramp_invoices').select('id, client_id, number, status, total, due_date, issue_date, currency, created_at, period_start, period_end').in('status', ['draft', 'open', 'paid'])),
      q<Checkin[]>(supabase.from('ramp_checkins').select('*').eq('status', 'scheduled').lte('due_date', addDays(todayISO(), 7)).order('due_date')),
      q<Data['modules']>(supabase.from('ramp_modules').select('id, title')),
    ]);
    const working = placements.filter((p) => WORKING.has(p.status));
    const onboarding = placements.filter((p) => p.status === 'onboarding').map((p) => p.id);
    const lineIds = [...new Set(unpaid.map((t) => t.invoice_line_id).filter(Boolean))] as string[];
    const unpaidPlacements = [...new Set(unpaid.map((t) => t.placement_id))];
    const [scored, steps, lines, prepay, completed] = await Promise.all([
      working.length ? q<Data['scored']>(supabase.from('ramp_checkins').select('placement_id, status, score, done_at').eq('status', 'done').in('placement_id', working.map((p) => p.id))) : Promise.resolve([]),
      onboarding.length ? q<Data['steps']>(supabase.from('ramp_placement_steps').select('placement_id, done_at').in('placement_id', onboarding)) : Promise.resolve([]),
      lineIds.length ? q<Line[]>(supabase.from('ramp_invoice_lines').select('id, invoice_id, placement_id, kind, period_start, period_end').in('id', lineIds)) : Promise.resolve([]),
      unpaidPlacements.length ? q<Line[]>(supabase.from('ramp_invoice_lines').select('id, invoice_id, placement_id, kind, period_start, period_end').eq('kind', 'prepay').in('placement_id', unpaidPlacements)) : Promise.resolve([]),
      working.length ? q<Data['completed']>(supabase.from('ramp_progress').select('member_id, module_id').eq('status', 'completed').in('member_id', [...new Set(working.map((p) => p.member_id))])) : Promise.resolve([]),
    ]);
    return { placements, clients, tiers: sortTiers(tiers), people, submitted, unpaid, requests, invoices, due, modules, scored, steps, lines: [...lines, ...prepay], completed };
  }, []);

  const [rateTarget, setRateTarget] = useState<RateTarget | null>(null);
  const [placing, setPlacing] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={EYEBROW} title="Agency dashboard"
        subtitle="Revenue, margin and everything that needs you today."
        actions={<>
          <LinkButton to="/admin/agency/settings" icon="sliders" variant="ghost">Settings</LinkButton>
          <Button variant="primary" icon="plus" onClick={() => setPlacing(true)}>Place an assistant</Button>
        </>} />

      {res.error && !res.data && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <><div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24" />)}</div><Skeleton rows={4} /></>}
      {res.data && <Dashboard d={res.data} today={today} payWhenPaid={org.agency?.pay_when_paid !== false} onPromote={setRateTarget}
        onRequestSaved={(r) => res.setData((prev) => (prev ? { ...prev, requests: prev.requests.map((x) => (x.id === r.id ? r : x)) } : prev!))} />}

      <RateSheet target={rateTarget} tiers={res.data?.tiers || []} onClose={() => setRateTarget(null)} onDone={res.reload} />
      <PlaceSheet open={placing} onClose={() => setPlacing(false)} />
    </div>
  );
}

function Dashboard({ d, today, payWhenPaid, onPromote, onRequestSaved }: {
  d: Data; today: string; payWhenPaid: boolean; onPromote: (t: RateTarget) => void; onRequestSaved: (r: ClientRequest) => void;
}) {
  const nameOf = (id: string | null | undefined) => personName(d.people.find((m) => m.id === id));
  const clientOf = (id: string) => d.clients.find((c) => c.id === id) || null;
  const byId = useMemo(() => new Map(d.placements.map((p) => [p.id, p])), [d.placements]);
  const label = (pid: string) => {
    const p = byId.get(pid);
    return p ? { who: nameOf(p.member_id), where: clientOf(p.client_id)?.name || 'Client', p } : null;
  };

  // ── KPIs
  const working = d.placements.filter((p) => WORKING.has(p.status));
  const active = d.placements.filter((p) => p.status === 'active').length;
  const onboardingN = d.placements.filter((p) => p.status === 'onboarding').length;
  const proposedN = d.placements.filter((p) => p.status === 'proposed').length;
  const revenue = working.reduce((s, p) => s + econ(p.hours_per_week, p.bill_rate, p.pay_rate).week.bill, 0);
  const cost = working.reduce((s, p) => s + econ(p.hours_per_week, p.bill_rate, p.pay_rate).week.pay, 0);
  const margin = revenue - cost;
  const openInv = d.invoices.filter((i) => i.status === 'open');
  const openTotal = openInv.reduce((s, i) => s + num(i.total), 0);
  const overdue = openInv.filter((i) => i.due_date && i.due_date < today);
  const unpaidHours = d.unpaid.reduce((s, t) => s + num(t.total), 0);
  const unpaidOwed = d.unpaid.reduce((s, t) => s + num(t.total) * (t.pay_rate != null ? num(t.pay_rate) : num(byId.get(t.placement_id)?.pay_rate)), 0);

  // ── payouts ready: approved hours from paid invoices (or paid prepaid periods)
  const invStatus = new Map(d.invoices.map((i) => [i.id, i.status]));
  const lineById = new Map(d.lines.map((l) => [l.id, l]));
  const ready = d.unpaid.filter((t) => {
    if (!payWhenPaid) return true;
    const l = t.invoice_line_id ? lineById.get(t.invoice_line_id) : null;
    if (l && invStatus.get(l.invoice_id) === 'paid') return true;
    return d.lines.some((x) => x.kind === 'prepay' && x.placement_id === t.placement_id && invStatus.get(x.invoice_id) === 'paid'
      && !!x.period_start && !!x.period_end && t.week_start >= x.period_start && t.week_start <= x.period_end);
  });
  const readyHours = ready.reduce((s, t) => s + num(t.total), 0);
  const readyOwed = ready.reduce((s, t) => s + num(t.total) * (t.pay_rate != null ? num(t.pay_rate) : num(byId.get(t.placement_id)?.pay_rate)), 0);
  const readyPeople = new Set(ready.map((t) => t.member_id)).size;

  // ── queue
  const dueCheckins = d.due.filter((c) => { const p = byId.get(c.placement_id); return p && p.status !== 'ended' && p.status !== 'proposed'; });
  const onboardingLists = d.placements.filter((p) => p.status === 'onboarding').map((p) => {
    const s = d.steps.filter((x) => x.placement_id === p.id);
    return { p, total: s.length, done: s.filter((x) => x.done_at).length };
  }).filter((x) => x.total > x.done);
  const guarantees = d.placements.filter((p) => p.status !== 'ended' && p.status !== 'proposed' && p.guarantee_until)
    .map((p) => ({ p, left: daysUntil(p.guarantee_until)! })).filter((x) => x.left >= 0 && x.left <= 14).sort((a, b) => a.left - b.left);
  const promotions = useMemo(() => {
    const out: { p: Placement; r: Readiness }[] = [];
    for (const p of d.placements.filter((x) => WORKING.has(x.status))) {
      const done = new Set(d.completed.filter((c) => c.member_id === p.member_id).map((c) => c.module_id));
      const r = readinessFor(p, d.tiers, done, d.scored.filter((c) => c.placement_id === p.id), (id) => d.modules.find((m) => m.id === id)?.title || 'Module');
      if (r.next && r.ready) out.push({ p, r });
    }
    return out;
  }, [d]);
  const drafts = d.invoices.filter((i) => i.status === 'draft').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const requests = [...d.requests].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || a.created_at.localeCompare(b.created_at));

  const queueCount = d.submitted.length + requests.filter((r) => r.status !== 'done').length + dueCheckins.length + onboardingLists.length
    + guarantees.length + promotions.length + drafts.length + (ready.length ? 1 : 0);

  // ── margin by client
  const byClient = d.clients.map((c) => {
    const ps = working.filter((p) => p.client_id === c.id);
    const rev = ps.reduce((s, p) => s + econ(p.hours_per_week, p.bill_rate, p.pay_rate).week.bill, 0);
    const pay = ps.reduce((s, p) => s + econ(p.hours_per_week, p.bill_rate, p.pay_rate).week.pay, 0);
    return { c, n: ps.length, rev, pay, margin: rev - pay };
  }).filter((x) => x.n > 0).sort((a, b) => b.margin - a.margin);

  if (d.placements.length === 0) return <FirstRun tiers={d.tiers.length} clients={d.clients.length} />;

  return (
    <>
      <section aria-label="Key numbers" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Active placements" value={active} hint={[onboardingN && `${onboardingN} onboarding`, proposedN && `${proposedN} proposed`].filter(Boolean).join(' · ') || 'None onboarding'} />
        <Stat label="Weekly revenue" value={money(revenue)} hint={`Cost ${money(cost)} a week`} />
        <Stat label="Gross margin" value={money(margin)} hint={revenue ? `${pctText(margin / revenue)} of revenue, weekly` : 'Weekly, at scheduled hours'} tone={margin > 0 ? 'good' : undefined} />
        <Stat label="Open invoices" value={money(openTotal)} hint={overdue.length ? <span className="font-semibold text-bad">{plural(overdue.length, 'overdue invoice')}</span> : `${plural(openInv.length, 'invoice')}, none overdue`} />
        <div className="col-span-2 lg:col-span-1"><Stat label="Unpaid approved hours" value={hoursText(unpaidHours)} hint={`${money(unpaidOwed)} to pay assistants`} /></div>
      </section>
      <p className="text-xs text-muted -mt-3">Weekly numbers use each onboarding and active placement’s scheduled hours and current rates.</p>

      <section aria-labelledby="queue-title" className="flex flex-col gap-3">
        <div className="flex items-center gap-2 px-1">
          <h2 id="queue-title" className="font-display text-xl font-semibold">Needs you</h2>
          {queueCount > 0 && <Chip tone="warn">{queueCount}</Chip>}
        </div>
        {queueCount === 0 && (
          <Card><div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-good-soft text-good flex items-center justify-center"><Icon name="check" size={20} strokeWidth={2.4} /></span>
            <div><p className="font-semibold">You’re all caught up</p><p className="text-sm text-muted">No hours, requests, check-ins or invoices are waiting on you.</p></div></div></Card>
        )}

        {d.submitted.length > 0 && (
          <Group icon="clock" title="Hours waiting for approval" count={d.submitted.length} link={{ to: '/admin/timesheets', label: 'Review all hours' }}>
            {d.submitted.slice(0, 6).map((t) => {
              const l = label(t.placement_id);
              return (
                <Item key={t.id} to={`/admin/placements/${t.placement_id}?tab=hours`} name={l?.who || nameOf(t.member_id)}
                  line={`${l?.where || ''} · week of ${weekLabel(t.week_start)}`} right={<span className="font-semibold tabular-nums">{hoursText(t.total)}</span>} />
              );
            })}
            {d.submitted.length > 6 && <More n={d.submitted.length - 6} to="/admin/timesheets" />}
          </Group>
        )}

        {requests.length > 0 && (
          <Group icon="chat" title="Client requests" count={requests.filter((r) => r.status !== 'done').length}>
            {requests.slice(0, 5).map((r) => {
              const c = clientOf(r.client_id);
              const l = r.placement_id ? label(r.placement_id) : null;
              return (
                <li key={r.id} className="border-t border-line-2 first:border-t-0">
                  <RequestCard r={r} compact client={c ? { id: c.id, name: c.name } : null} assistant={l?.who || null} from={r.member_id ? nameOf(r.member_id) : null} onSaved={onRequestSaved} />
                </li>
              );
            })}
            {requests.length > 5 && <li className="px-4 py-3 border-t border-line-2 text-sm text-muted">{plural(requests.length - 5, 'more request')} on the clients’ pages.</li>}
          </Group>
        )}

        {dueCheckins.length > 0 && (
          <Group icon="calendar" title="Check-ins due" count={dueCheckins.length}>
            {dueCheckins.slice(0, 6).map((c) => {
              const l = label(c.placement_id);
              const late = (daysUntil(c.due_date) ?? 0) < 0;
              return (
                <Item key={c.id} to={`/admin/placements/${c.placement_id}?tab=checkins`} name={l?.who || 'Assistant'}
                  line={`${l?.where || ''} · ${c.kind === 'client' ? 'with the client' : 'with the assistant'}`}
                  right={<Chip tone={late ? 'bad' : 'warn'}>{dueLabel(c.due_date)}</Chip>} />
              );
            })}
            {dueCheckins.length > 6 && <li className="px-4 py-3 border-t border-line-2 text-sm text-muted">{plural(dueCheckins.length - 6, 'more check-in')} this week.</li>}
          </Group>
        )}

        {onboardingLists.length > 0 && (
          <Group icon="list" title="Onboarding checklists to finish" count={onboardingLists.length}>
            {onboardingLists.map(({ p, total, done }) => (
              <Item key={p.id} to={`/admin/placements/${p.id}`} name={nameOf(p.member_id)}
                line={`${clientOf(p.client_id)?.name || ''}${p.start_date ? ` · ${daysUntil(p.start_date)! > 0 ? `starts ${fmtDate(p.start_date)}` : `started ${fmtDate(p.start_date)}`}` : ''}`}
                right={<span className="w-24 flex flex-col items-end gap-1"><span className="text-xs font-semibold tabular-nums">{done} of {total}</span><Progress value={(done / total) * 100} className="w-full" label="Checklist done" /></span>} />
            ))}
          </Group>
        )}

        {guarantees.length > 0 && (
          <Group icon="shield" title="Guarantees ending soon" count={guarantees.length}>
            {guarantees.map(({ p, left }) => (
              <Item key={p.id} to={`/admin/placements/${p.id}`} name={nameOf(p.member_id)} line={`${clientOf(p.client_id)?.name || ''} · until ${fmtDate(p.guarantee_until)}`}
                right={<Chip tone={left <= 3 ? 'bad' : 'warn'}>{left === 0 ? 'Ends today' : `${plural(left, 'day')} left`}</Chip>} />
            ))}
          </Group>
        )}

        {promotions.length > 0 && (
          <Group icon="star" title="Ready to move up" count={promotions.length}>
            {promotions.map(({ p, r }) => {
              const cur = d.tiers.find((t) => t.id === p.tier_id);
              const next = r.next!;
              const after = econ(p.hours_per_week, next.bill_rate, next.pay_rate);
              return (
                <li key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 border-t border-line-2 first:border-t-0">
                  <Link to={`/admin/placements/${p.id}?tab=rates`} className="flex items-center gap-3 min-w-0 flex-1 no-underline text-ink">
                    <Avatar name={nameOf(p.member_id)} size={36} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[15px] truncate">{nameOf(p.member_id)}</span>
                      <span className="block text-[13px] text-muted">{clientOf(p.client_id)?.name} · {cur ? cur.name : 'No tier'} → <span className="font-semibold text-ink-2">{next.name}</span> · {money(after.margin)}/h margin at the new rates</span>
                    </span>
                  </Link>
                  <Button size="sm" variant="success" icon="star" className="self-start sm:self-center ml-12 sm:ml-0"
                    onClick={() => onPromote({ placement: p, assistant: nameOf(p.member_id), client: clientOf(p.client_id)?.name || 'the client', promoteTo: next })}>Promote</Button>
                </li>
              );
            })}
          </Group>
        )}

        {drafts.length > 0 && (
          <Group icon="fileText" title="Draft invoices to issue" count={drafts.length} link={{ to: '/admin/invoices', label: 'All invoices' }}>
            {drafts.slice(0, 6).map((i) => (
              <Item key={i.id} to={`/admin/invoices/${i.id}`} name={`${i.number} · ${clientOf(i.client_id)?.name || 'Client'}`}
                line={`${fmtDate(i.period_start)} – ${fmtDate(i.period_end)} · created ${fmtDate(i.created_at)}`} right={<span className="font-semibold tabular-nums">{money(i.total, i.currency)}</span>} avatar={false} />
            ))}
          </Group>
        )}

        {ready.length > 0 && (
          <Group icon="send" title="Payouts ready to create" count={1}>
            <li className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px]">{money(readyOwed)} for {plural(readyPeople, 'assistant')}</p>
                <p className="text-[13px] text-muted">{hoursText(readyHours)} of approved hours {payWhenPaid ? 'from paid invoices' : 'not paid out yet'}.</p>
              </div>
              <LinkButton to="/admin/payouts" variant="primary" size="sm" icon="send">Create a payout</LinkButton>
            </li>
          </Group>
        )}
      </section>

      {byClient.length > 0 && (
        <section aria-labelledby="margin-title" className="flex flex-col gap-3">
          <h2 id="margin-title" className="font-display text-xl font-semibold px-1">Margin by client</h2>
          <Card padded={false} className="overflow-hidden">
            <div className="hidden sm:grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-3 px-4 py-2.5 bg-bg text-xs font-semibold text-muted border-b border-line">
              <span>Client</span><span className="text-right">Revenue / week</span><span className="text-right">Cost / week</span><span className="text-right">Margin / week</span><span className="text-right">Margin %</span>
            </div>
            <ul>
              {byClient.map((x) => (
                <li key={x.c.id} className="border-t border-line-2 first:border-t-0">
                  <Link to={`/admin/clients/${x.c.id}`} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-x-3 gap-y-1 px-4 py-3 no-underline text-ink hover:bg-[#FAFBFC] tabular-nums">
                    <span className="col-span-2 sm:col-span-1 min-w-0">
                      <span className="block font-semibold text-[15px] truncate">{x.c.name}</span>
                      <span className="block text-xs text-muted">{plural(x.n, 'assistant')}</span>
                    </span>
                    <span className="sm:text-right text-sm"><span className="sm:hidden text-muted">Revenue </span>{money(x.rev, x.c.currency)}</span>
                    <span className="text-right text-sm"><span className="sm:hidden text-muted">Cost </span>{money(x.pay, x.c.currency)}</span>
                    <span className={cx('sm:text-right text-sm font-semibold', x.margin < 0 ? 'text-bad' : 'text-good')}><span className="sm:hidden text-muted font-normal">Margin </span>{money(x.margin, x.c.currency)}</span>
                    <span className="text-right text-sm">{x.rev ? pctText(x.margin / x.rev) : '–'}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-x-3 gap-y-1 px-4 py-3 border-t border-line bg-bg font-semibold tabular-nums text-sm">
              <span className="col-span-2 sm:col-span-1">Total</span>
              <span className="sm:text-right"><span className="sm:hidden text-muted font-normal">Revenue </span>{money(revenue)}</span>
              <span className="text-right"><span className="sm:hidden text-muted font-normal">Cost </span>{money(cost)}</span>
              <span className={cx('sm:text-right', margin < 0 ? 'text-bad' : 'text-good')}><span className="sm:hidden text-muted font-normal">Margin </span>{money(margin)}</span>
              <span className="text-right">{revenue ? pctText(margin / revenue) : '–'}</span>
            </div>
          </Card>
        </section>
      )}
    </>
  );
}

function Group({ icon, title, count, link, children }: { icon: string; title: string; count: number; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5 border-b border-line-2">
        <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={icon} size={18} /></span>
        <h3 className="font-display text-[17px] font-semibold flex-1 min-w-0">{title}</h3>
        {count > 0 && <Chip tone="warn">{count}</Chip>}
        {link && <Link to={link.to} className="hidden sm:inline-flex text-sm font-semibold text-brand-ink min-h-11 items-center">{link.label}</Link>}
      </div>
      <ul>{children}</ul>
      {link && <Link to={link.to} className="sm:hidden flex items-center justify-center min-h-12 border-t border-line-2 text-sm font-semibold text-brand-ink no-underline">{link.label}</Link>}
    </Card>
  );
}

function Item({ to, name, line, right, avatar = true }: { to: string; name: string; line: string; right?: ReactNode; avatar?: boolean }) {
  return (
    <li className="border-t border-line-2 first:border-t-0">
      <Link to={to} className="flex items-center gap-3 px-4 py-3 min-h-14 no-underline text-ink hover:bg-[#FAFBFC]">
        {avatar && <Avatar name={name} size={36} />}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[15px] truncate">{name}</span>
          <span className="block text-[13px] text-muted truncate">{line}</span>
        </span>
        {right && <span className="shrink-0 text-sm">{right}</span>}
        <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" />
      </Link>
    </li>
  );
}

function More({ n, to }: { n: number; to: string }) {
  return (
    <li className="border-t border-line-2">
      <Link to={to} className="flex items-center min-h-12 px-4 text-sm font-semibold text-brand-ink no-underline">and {n} more</Link>
    </li>
  );
}

function FirstRun({ tiers, clients }: { tiers: number; clients: number }) {
  const steps = [
    { done: tiers > 0, title: 'Set your tiers', body: tiers > 0 ? `You have ${plural(tiers, 'tier')}. Check the default rates and what it takes to move up.` : 'Skill levels with default bill and pay rates, so every placement starts at the right price.', to: '/admin/tiers', action: tiers > 0 ? 'Review tiers' : 'Set up tiers' },
    { done: clients > 0, title: 'Add a client', body: clients > 0 ? `You have ${plural(clients, 'client')}. Invite their contacts so they can approve hours.` : 'The company you staff, with how and how often you bill them.', to: clients > 0 ? '/admin/clients' : '/admin/clients?new=1', action: clients > 0 ? 'Go to clients' : 'Add a client' },
    { done: false, title: 'Place an assistant', body: 'Pick a trained assistant, the client and the rates. RAMP sets up the checklist, check-ins, guarantee and launch plan.', to: '/admin/placements?new=1', action: 'Place an assistant' },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="font-display text-xl font-semibold">Set up your agency</p>
        <p className="text-[15px] text-muted mt-1">Three steps to your first placement. Revenue, margin and your daily queue show up here once someone is placed.</p>
      </div>
      <Progress value={(done / steps.length) * 100} label="Agency setup" />
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 border-t border-line-2 first:border-t-0">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className={cx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold', s.done ? 'bg-good-soft text-good' : i === next ? 'bg-brand text-white' : 'bg-chip text-muted')}>
                {s.done ? <Icon name="check" size={16} strokeWidth={2.6} /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-[15px]">{s.title}<span className="sr-only">{s.done ? ', done' : ''}</span></p>
                <p className="text-sm text-muted leading-relaxed">{s.body}</p>
              </div>
            </div>
            <LinkButton to={s.to} variant={i === next ? 'primary' : 'secondary'} size="sm" className="self-start sm:self-center ml-11 sm:ml-0">{s.action}</LinkButton>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-muted">Also worth a look: <Link to="/admin/agency/settings" className="font-semibold text-brand-ink">Agency settings</Link> for the onboarding checklist, guarantee length, invoice numbers and Stripe.</p>
    </Card>
  );
}
