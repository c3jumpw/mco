import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { q, useAsync, useIsMobile, useTitle } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { TIMESHEET_STATUS, addDays, ago, cx, fmtDate, hours, plural, weekLabel, weekStart } from '../../lib/util';
import type { Timesheet, TimesheetStatus } from '../../lib/types';
import { Avatar, Button, Card, Chip, EmptyState, ErrorBox, IconButton, PageHeader, Progress, Segmented, Select, Skeleton, Stat, useConfirm, useToast } from '../../ui';
import { useBadges } from '../../shell/AppShell';
import { AGENCY_BACK, AGENCY_EYEBROW, DaysGrid, num, useOrgToday } from './parts/money-common';
import { BillingChips, EntrySheet, ReturnSheet, TimesheetSheet, isLocked, loadTimesheetData, type EntryPrefill, type PlacementRef, type TsData } from './parts/money-timesheets';

type View = 'queue' | 'week' | 'all';
const VIEWS: View[] = ['queue', 'week', 'all'];

export default function Timesheets() {
  useTitle('Timesheets');
  const { org } = useMe();
  const tz = org.timezone;
  const today = useOrgToday();
  const isMobile = useIsMobile();
  const toast = useToast();
  const badges = useBadges();
  const { confirm, dialog } = useConfirm();
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.includes(params.get('view') as View) ? (params.get('view') as View) : 'queue';
  const setView = (v: View) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'queue') n.delete('view'); else n.set('view', v); return n; }, { replace: true });

  const [weeksBack, setWeeksBack] = useState(12);
  const data = useAsync(() => loadTimesheetData(today, weeksBack), [today, weeksBack]);
  const { reload, setData } = data;

  const [entry, setEntry] = useState<EntryPrefill | null>(null);
  const [returning, setReturning] = useState<{ ts: Timesheet; name: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => { await reload(); badges.refresh(); }, [reload, badges]);

  const patchStatus = useCallback((ids: string[], status: TimesheetStatus) => {
    setData((d) => ({ ...d!, timesheets: (d?.timesheets || []).map((t) => (ids.includes(t.id) ? { ...t, status } : t)) }));
  }, [setData]);

  const nameFor = (t: Timesheet) => data.data?.placements.get(t.placement_id)?.name || 'the assistant';

  async function approve(t: Timesheet) {
    setBusy((b) => new Set(b).add(t.id));
    patchStatus([t.id], 'approved');
    try {
      await q(supabase.rpc('ramp_timesheet_review', { p_timesheet: t.id, p_approve: true, p_note: '' }));
      toast(`Approved ${hours(t.total)} for ${nameFor(t)}.`);
    } catch (e) {
      patchStatus([t.id], t.status);
      toast(errText(e), 'bad');
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(t.id); return n; });
      refresh();
    }
  }

  async function sendBack(t: Timesheet, note: string) {
    try {
      await q(supabase.rpc('ramp_timesheet_review', { p_timesheet: t.id, p_approve: false, p_note: note }));
      patchStatus([t.id], 'rejected');
      toast(`Returned to ${nameFor(t)} with your note.`);
      refresh();
      return true;
    } catch (e) {
      toast(errText(e), 'bad');
      return false;
    }
  }

  async function approveAll(client: string, list: Timesheet[]) {
    const total = list.reduce((a, t) => a + Number(t.total), 0);
    const people = new Set(list.map((t) => t.member_id)).size;
    const ok = await confirm({
      title: `Approve all ${plural(list.length, 'week')} for ${client}?`,
      body: `Approves ${hours(total)} from ${plural(people, 'assistant')}. Approved hours can go on the next invoice and payout.`,
      action: 'Approve all',
    });
    if (!ok) return;
    const ids = list.map((t) => t.id);
    setBusy((b) => new Set([...b, ...ids]));
    patchStatus(ids, 'approved');
    let done = 0;
    const failed: string[] = [];
    for (const t of list) {
      try { await q(supabase.rpc('ramp_timesheet_review', { p_timesheet: t.id, p_approve: true, p_note: '' })); done++; }
      catch (e) { failed.push(`${nameFor(t)}: ${errText(e)}`); }
    }
    setBusy((b) => { const n = new Set(b); ids.forEach((i) => n.delete(i)); return n; });
    if (failed.length) toast(`Approved ${done} of ${list.length}. ${failed[0]}`, 'bad');
    else toast(`Approved ${plural(done, 'week')} for ${client}.`);
    refresh();
  }

  const d = data.data;
  const submitted = d ? d.timesheets.filter((t) => t.status === 'submitted') : [];
  const detail = d && detailId ? d.timesheets.find((t) => t.id === detailId) || null : null;
  const openEntryFor = (t: Timesheet) => { setDetailId(null); setEntry({ placementId: t.placement_id, week: t.week_start }); };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={AGENCY_EYEBROW} title="Timesheets"
        subtitle="Approve the hours assistants send, enter hours for anyone, and see which weeks are billed and paid."
        actions={<Button variant="primary" icon="plus" onClick={() => setEntry({})} disabled={!d}>Enter hours for someone</Button>} />

      <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
        <Segmented label="Which timesheets" value={view} onChange={setView} options={[
          { value: 'queue', label: `${isMobile ? 'To approve' : 'Waiting for approval'}${d ? ` (${submitted.length})` : ''}` },
          { value: 'week', label: 'This week' },
          { value: 'all', label: 'All' },
        ]} />
      </div>

      {data.error && !d ? <ErrorBox error={data.error} onRetry={reload} />
        : !d ? <Skeleton rows={5} />
          : view === 'queue' ? (
            <QueueView data={d} today={today} busy={busy} onApprove={approve} onReturn={(t) => setReturning({ ts: t, name: nameFor(t) })}
              onApproveAll={approveAll} onEdit={openEntryFor} onEnter={setEntry} />
          ) : view === 'week' ? (
            <WeekView data={d} today={today} busy={busy} onApprove={approve} onOpen={setDetailId} onEnter={setEntry} />
          ) : (
            <AllView data={d} loading={data.loading} onOpen={setDetailId} onMore={() => setWeeksBack((w) => w + 12)} />
          )}

      {d && (
        <EntrySheet open={!!entry} onClose={() => setEntry(null)} placements={d.placementList} today={today} prefill={entry} onSaved={refresh} />
      )}
      <ReturnSheet target={returning} onClose={() => setReturning(null)} onReturn={sendBack} />
      {d && (
        <TimesheetSheet ts={detail} data={d} tz={tz} onClose={() => setDetailId(null)}
          onApprove={(t) => { setDetailId(null); approve(t); }}
          onReturn={(t) => { setDetailId(null); setReturning({ ts: t, name: nameFor(t) }); }}
          onEdit={openEntryFor} />
      )}
      {dialog}
    </div>
  );
}

// ───────────────────────── waiting for approval ─────────────────────────

function QueueView({ data, today, busy, onApprove, onReturn, onApproveAll, onEdit, onEnter }: {
  data: TsData; today: string; busy: Set<string>;
  onApprove: (t: Timesheet) => void; onReturn: (t: Timesheet) => void; onApproveAll: (client: string, list: Timesheet[]) => void;
  onEdit: (t: Timesheet) => void; onEnter: (p: EntryPrefill) => void;
}) {
  const groups = useMemo(() => {
    const g = new Map<string, Timesheet[]>();
    for (const t of data.timesheets.filter((x) => x.status === 'submitted')) {
      const c = data.placements.get(t.placement_id)?.p.client_id || '';
      g.set(c, [...(g.get(c) || []), t]);
    }
    return [...g.entries()]
      .map(([clientId, list]) => ({
        clientId, client: data.clients.get(clientId)?.name || 'Client',
        list: list.sort((a, b) => a.week_start.localeCompare(b.week_start) || (data.placements.get(a.placement_id)?.name || '').localeCompare(data.placements.get(b.placement_id)?.name || '')),
      }))
      .sort((a, b) => a.client.localeCompare(b.client));
  }, [data]);

  return (
    <div className="flex flex-col gap-5">
      {groups.length === 0 ? (
        <Card>
          <EmptyState icon="check" title="Nothing waiting for approval"
            body="When assistants send their hours, they show up here for you or the client to approve."
            action={<Button icon="plus" onClick={() => onEnter({})}>Enter hours for someone</Button>} />
        </Card>
      ) : groups.map((g) => {
        const total = g.list.reduce((a, t) => a + Number(t.total), 0);
        return (
          <Card key={g.clientId} padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-line">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold leading-snug">
                  {g.clientId ? <Link to={`/admin/clients/${g.clientId}`} className="text-ink no-underline hover:underline">{g.client}</Link> : g.client}
                </h2>
                <p className="text-sm text-muted">{plural(g.list.length, 'week')} waiting · {hours(total)}</p>
              </div>
              {g.list.length > 1 && (
                <Button variant="success" size="sm" icon="check" onClick={() => onApproveAll(g.client, g.list)} disabled={g.list.some((t) => busy.has(t.id))}>
                  Approve all for this client
                </Button>
              )}
            </div>
            <ul>
              {g.list.map((t) => (
                <QueueRow key={t.id} t={t} ref_={data.placements.get(t.placement_id)} busy={busy.has(t.id)}
                  onApprove={() => onApprove(t)} onReturn={() => onReturn(t)} onEdit={() => onEdit(t)} />
              ))}
            </ul>
          </Card>
        );
      })}
      <MissingCard data={data} today={today} onEnter={onEnter} />
    </div>
  );
}

function QueueRow({ t, ref_, busy, onApprove, onReturn, onEdit }: { t: Timesheet; ref_?: PlacementRef; busy: boolean; onApprove: () => void; onReturn: () => void; onEdit: () => void }) {
  const usual = ref_?.p.hours_per_week || 0;
  const over = usual > 0 && Number(t.total) > usual * 1.1;
  return (
    <li className="px-4 sm:px-5 py-4 border-t border-line-2 first:border-t-0 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar name={ref_?.name || '?'} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{ref_?.name || 'Assistant'}</p>
          <p className="text-sm text-muted leading-snug">{ref_?.p.title || 'Placement'} · {weekLabel(t.week_start)}</p>
          {t.submitted_at && <p className="text-xs text-muted mt-0.5">Sent {ago(t.submitted_at)}</p>}
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-bold tabular-nums leading-tight">{hours(t.total)}</p>
          {usual > 0 && <p className={cx('text-xs', over ? 'text-warn font-semibold' : 'text-muted')}>{over ? 'Over' : 'Usual'} {num(usual)} h</p>}
        </div>
      </div>
      <DaysGrid days={t.days} total={t.total} />
      {t.notes && <p className="text-[15px] bg-chip rounded-xl px-3.5 py-2.5 whitespace-pre-line leading-relaxed"><span className="font-semibold">Note: </span>{t.notes}</p>}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button variant="success" icon="check" loading={busy} onClick={onApprove}>Approve</Button>
        <Button icon="replay" disabled={busy} onClick={onReturn}>Return</Button>
        <Button variant="ghost" icon="pen" disabled={busy} onClick={onEdit} className="col-span-2 sm:col-span-1">Edit hours</Button>
      </div>
    </li>
  );
}

/** Active placements that have no sent timesheet for last week. */
function MissingCard({ data, today, onEnter }: { data: TsData; today: string; onEnter: (p: EntryPrefill) => void }) {
  const lastMon = addDays(weekStart(today), -7);
  const rows = useMemo(() => {
    const byKey = new Map(data.timesheets.filter((t) => t.week_start === lastMon).map((t) => [t.placement_id, t]));
    return data.placementList
      .filter((r) => r.p.status === 'active' && (!r.p.start_date || r.p.start_date <= addDays(lastMon, 6)) && (!r.p.end_date || r.p.end_date >= lastMon))
      .map((r) => ({ r, t: byKey.get(r.p.id) }))
      .filter((x) => !x.t || x.t.status === 'draft' || x.t.status === 'rejected');
  }, [data, lastMon]);
  if (!rows.length) return null;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-line">
        <h2 className="font-display text-lg font-semibold">Missing hours for last week</h2>
        <p className="text-sm text-muted mt-0.5">{weekLabel(lastMon)}. These active placements haven’t sent their hours yet. Remind the assistant, or enter the hours for them.</p>
      </div>
      <ul>
        {rows.map(({ r, t }) => (
          <li key={r.p.id} className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-t border-line-2 first:border-t-0">
            <Avatar name={r.name} size={36} tone="amber" />
            <div className="min-w-0 flex-1 basis-40">
              <p className="font-semibold leading-snug">{r.name}</p>
              <p className="text-sm text-muted leading-snug">{r.client} · {r.p.title}</p>
            </div>
            <Chip tone={t?.status === 'rejected' ? 'bad' : 'warn'}>{!t ? 'Nothing logged' : t.status === 'draft' ? `Saved, not sent (${hours(t.total)})` : 'Returned, not sent again'}</Chip>
            <Button size="sm" icon="pen" onClick={() => onEnter({ placementId: r.p.id, week: lastMon })}>Enter hours</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ───────────────────────── a week at a time ─────────────────────────

function WeekView({ data, today, busy, onApprove, onOpen, onEnter }: {
  data: TsData; today: string; busy: Set<string>; onApprove: (t: Timesheet) => void; onOpen: (id: string) => void; onEnter: (p: EntryPrefill) => void;
}) {
  const thisMon = weekStart(today);
  const [week, setWeek] = useState(thisMon);
  const rows = useMemo(() => {
    const byKey = new Map(data.timesheets.filter((t) => t.week_start === week).map((t) => [t.placement_id, t]));
    return data.placementList
      .filter((r) => byKey.has(r.p.id) || (['onboarding', 'active', 'paused'].includes(r.p.status)
        && (!r.p.start_date || r.p.start_date <= addDays(week, 6)) && (!r.p.end_date || r.p.end_date >= week)))
      .map((r) => ({ r, t: byKey.get(r.p.id) }));
  }, [data, week]);
  const logged = rows.reduce((a, x) => a + Number(x.t?.total || 0), 0);
  const waiting = rows.filter((x) => x.t?.status === 'submitted').length;
  const missing = rows.filter((x) => !x.t || x.t.status === 'draft').length;
  const title = week === thisMon ? 'This week' : week === addDays(thisMon, -7) ? 'Last week' : 'Week of';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconButton icon="chevronLeft" label="Previous week" disabled={week <= data.since} onClick={() => setWeek(addDays(week, -7))} className="bg-white border border-line" />
        <div className="min-w-0 flex-1 sm:flex-none sm:min-w-44 text-center">
          <p className="font-display font-semibold leading-tight">{title}</p>
          <p className="text-sm text-muted">{weekLabel(week)}</p>
        </div>
        <IconButton icon="chevronRight" label="Next week" disabled={week >= thisMon} onClick={() => setWeek(addDays(week, 7))} className="bg-white border border-line" />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Logged" value={num(logged)} hint="hours" />
        <Stat label="To approve" value={waiting} tone={waiting ? 'warn' : undefined} />
        <Stat label="Not sent" value={missing} />
      </div>
      <Card padded={false} className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="clock" title="No placements this week" body="Active placements show up here so you can see who has logged hours." />
        ) : (
          <ul>
            {rows.map(({ r, t }) => {
              const usual = r.p.hours_per_week || 0;
              const s = t ? TIMESHEET_STATUS[t.status] : null;
              return (
                <li key={r.p.id} className="px-4 sm:px-5 py-4 border-t border-line-2 first:border-t-0 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={r.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{r.name}</p>
                      <p className="text-sm text-muted leading-snug">{r.client} · {r.p.title}</p>
                    </div>
                    {s ? <Chip tone={s.tone}>{s.label}</Chip> : <Chip tone="neutral">Nothing logged</Chip>}
                  </div>
                  {t && <DaysGrid days={t.days} total={t.total} />}
                  {usual > 0 && (
                    <div className="flex items-center gap-3">
                      <Progress value={(Number(t?.total || 0) / usual) * 100} tone={t?.status === 'approved' ? 'good' : 'brand'} className="flex-1" label={`${num(t?.total || 0)} of ${num(usual)} hours`} />
                      <span className="text-sm text-muted tabular-nums whitespace-nowrap">{num(t?.total || 0)} of {num(usual)} h</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {t?.status === 'submitted' && <Button size="sm" variant="success" icon="check" loading={busy.has(t.id)} onClick={() => onApprove(t)}>Approve</Button>}
                    {!isLocked(t) && <Button size="sm" icon="pen" onClick={() => onEnter({ placementId: r.p.id, week })}>{t ? 'Edit hours' : 'Enter hours'}</Button>}
                    {t && <Button size="sm" variant="ghost" onClick={() => onOpen(t.id)}>Details</Button>}
                    {t && <BillingChips ts={t} link={data.links.get(t.id)} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── everything ─────────────────────────

function AllView({ data, loading, onOpen, onMore }: { data: TsData; loading: boolean; onOpen: (id: string) => void; onMore: () => void }) {
  const [client, setClient] = useState('all');
  const [status, setStatus] = useState<TimesheetStatus | 'all'>('all');
  const [billing, setBilling] = useState<'all' | 'unbilled' | 'invoiced' | 'paidout'>('all');
  const clients = useMemo(() => [...data.clients.values()].filter((c) => data.placementList.some((r) => r.p.client_id === c.id)), [data]);
  const rows = useMemo(() => data.timesheets
    .filter((t) => client === 'all' || data.placements.get(t.placement_id)?.p.client_id === client)
    .filter((t) => status === 'all' || t.status === status)
    .filter((t) => billing === 'all'
      || (billing === 'unbilled' && t.status === 'approved' && !t.invoice_line_id)
      || (billing === 'invoiced' && !!t.invoice_line_id)
      || (billing === 'paidout' && !!t.payout_line_id))
    .sort((a, b) => b.week_start.localeCompare(a.week_start) || (data.placements.get(a.placement_id)?.name || '').localeCompare(data.placements.get(b.placement_id)?.name || '')),
  [data, client, status, billing]);
  const filtered = client !== 'all' || status !== 'all' || billing !== 'all';
  const total = rows.reduce((a, t) => a + Number(t.total), 0);
  const clear = () => { setClient('all'); setStatus('all'); setBilling('all'); };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)} className="col-span-2 sm:col-span-1">
          <option value="all">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as TimesheetStatus | 'all')}>
          <option value="all">Any status</option>
          {(Object.keys(TIMESHEET_STATUS) as TimesheetStatus[]).map((s) => <option key={s} value={s}>{TIMESHEET_STATUS[s].label}</option>)}
        </Select>
        <Select aria-label="Billing" value={billing} onChange={(e) => setBilling(e.target.value as typeof billing)}>
          <option value="all">Billed or not</option>
          <option value="unbilled">Approved, not billed</option>
          <option value="invoiced">On an invoice</option>
          <option value="paidout">On a payout</option>
        </Select>
      </div>
      <p className="text-sm text-muted flex flex-wrap items-center gap-x-2">
        <span>{plural(rows.length, 'timesheet')} · {hours(total)} since the week of {fmtDate(data.since)}</span>
        {filtered && <button type="button" onClick={clear} className="min-h-11 px-1 font-semibold text-brand-ink cursor-pointer">Clear filters</button>}
      </p>

      <Card padded={false} className="overflow-hidden">
        {rows.length === 0 ? (
          filtered
            ? <EmptyState icon="search" title="No timesheets match" body="Try other filters, or clear them." action={<Button onClick={clear}>Clear filters</Button>} />
            : <EmptyState icon="clock" title="No timesheets yet" body="Hours show up here once assistants log them, or when you enter them for someone." />
        ) : (
          <>
            <table className="hidden md:table w-full text-[15px]">
              <thead>
                <tr className="text-left text-[13px] text-muted border-b border-line">
                  <th scope="col" className="font-semibold px-5 py-3">Week</th>
                  <th scope="col" className="font-semibold px-3 py-3">Assistant</th>
                  <th scope="col" className="font-semibold px-3 py-3 text-right">Hours</th>
                  <th scope="col" className="font-semibold px-3 py-3">Status</th>
                  <th scope="col" className="font-semibold px-5 py-3">Billing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const r = data.placements.get(t.placement_id);
                  const s = TIMESHEET_STATUS[t.status];
                  return (
                    <tr key={t.id} className="border-t border-line-2 hover:bg-[#FAFBFC] cursor-pointer" onClick={() => onOpen(t.id)}>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <button type="button" className="font-semibold text-brand-ink cursor-pointer text-left" onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}>
                          {weekLabel(t.week_start)}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold leading-snug">{r?.name || 'Assistant'}</p>
                        <p className="text-sm text-muted leading-snug">{r?.client} · {r?.p.title}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">{num(t.total)}</td>
                      <td className="px-3 py-3"><Chip tone={s.tone}>{s.label}</Chip></td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}><BillingChips ts={t} link={data.links.get(t.id)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ul className="md:hidden">
              {rows.map((t) => {
                const r = data.placements.get(t.placement_id);
                const s = TIMESHEET_STATUS[t.status];
                return (
                  <li key={t.id} className="border-t border-line-2 first:border-t-0">
                    <button type="button" onClick={() => onOpen(t.id)} className="w-full text-left px-4 py-3.5 flex flex-col gap-1.5 cursor-pointer hover:bg-[#FAFBFC]">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-semibold leading-snug">{r?.name || 'Assistant'}</span>
                          <span className="block text-sm text-muted leading-snug">{r?.client} · {weekLabel(t.week_start)}</span>
                        </span>
                        <span className="font-display text-lg font-bold tabular-nums">{hours(t.total)}</span>
                      </span>
                      <span className="flex flex-wrap gap-1.5"><Chip tone={s.tone}>{s.label}</Chip></span>
                    </button>
                    {t.status === 'approved' && <div className="px-4 pb-3 -mt-1"><BillingChips ts={t} link={data.links.get(t.id)} /></div>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
      <Button onClick={onMore} loading={loading} icon="chevronDown" className="self-center">Show 12 more weeks</Button>
    </div>
  );
}
