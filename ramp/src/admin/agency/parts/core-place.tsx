// "Place an assistant": pick the assistant and the client, set the title, tier, rates and schedule,
// then insert the placement and seed its checklist, check-ins, guarantee and coach.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errText } from '../../../lib/supabase';
import { q, useAsync } from '../../../lib/hooks';
import { useMe } from '../../../lib/session';
import { planFor, planSummary } from '../../../lib/plan';
import { LEVELS, PLACEMENT_STATUS, cx, money, rankOf } from '../../../lib/util';
import type { Client, ClientModule, Member, Module, Placement, PlacementStatus, Progress, RoleModule, Tier } from '../../../lib/types';
import { Avatar, Button, ErrorBox, Field, Input, Notice, Pills, Progress as Bar, SearchInput, Select, Sheet, Skeleton, useToast } from '../../../ui';
import { FormError, focusInvalid, personName } from '../../parts/ops-common';
import { EconGrid, MoneyInput, econ, longDate, num, parseNum, sortTiers } from './core-common';

export interface PlacePrefill {
  /** Preselect this client (from the client page). */
  clientId?: string;
  /** Start a replacement for this placement: copies its client, role, rates and people. */
  replaces?: Placement;
  replacesName?: string;
}

const NEW_STATUSES: PlacementStatus[] = ['proposed', 'onboarding', 'active'];
const STATUS_HINT: Record<string, string> = {
  proposed: 'Shared with the client but not confirmed yet. The team member and client don’t see it.',
  onboarding: 'Confirmed. The checklist and launch plan are being worked through before day 1.',
  active: 'Working with the client and logging hours.',
};

interface PlaceData {
  staff: Member[];
  coaches: Member[];
  contacts: Member[];
  clients: Client[];
  tiers: Tier[];
  placements: Pick<Placement, 'id' | 'member_id' | 'client_id' | 'status'>[];
  training: Map<string, number>;
}

export function PlaceSheet({ open, onClose, prefill }: { open: boolean; onClose: () => void; prefill?: PlacePrefill | null }) {
  if (!open) return null;
  return <PlaceBody onClose={onClose} prefill={prefill || {}} />;
}

function PlaceBody({ onClose, prefill }: { onClose: () => void; prefill: PlacePrefill }) {
  const res = useAsync<PlaceData>(async () => {
    const [members, clients, tiers, placements, modules, roleModules, progress, clientModules] = await Promise.all([
      q<Member[]>(supabase.from('ramp_members').select('*').neq('status', 'inactive').order('full_name')),
      q<Client[]>(supabase.from('ramp_clients').select('*').order('name')),
      q<Tier[]>(supabase.from('ramp_tiers').select('*').order('level')),
      q<PlaceData['placements']>(supabase.from('ramp_placements').select('id, member_id, client_id, status')),
      q<Module[]>(supabase.from('ramp_modules').select('*').eq('status', 'published')),
      q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
      q<Progress[]>(supabase.from('ramp_progress').select('*')),
      q<ClientModule[]>(supabase.from('ramp_client_modules').select('*')),
    ]);
    const active = members.filter((m) => m.status === 'active');
    const staff = active.filter((m) => rankOf(m.level) <= 6);
    const training = new Map<string, number>();
    for (const m of staff) {
      const clientIds = new Set(placements.filter((p) => p.member_id === m.id && p.status !== 'ended').map((p) => p.client_id));
      const mine = clientModules.filter((c) => clientIds.has(c.client_id));
      training.set(m.id, planSummary(planFor(m, modules, roleModules, progress, mine)).pct);
    }
    return {
      staff,
      coaches: active.filter((m) => rankOf(m.level) <= 4),
      contacts: members.filter((m) => m.level === 'client'),
      clients, tiers: sortTiers(tiers), placements, training,
    };
  }, []);

  const title = prefill.replaces ? 'Start a replacement' : 'Place a team member';
  if (res.error && !res.data) {
    return <Sheet open onClose={onClose} title={title}><ErrorBox error={res.error} onRetry={res.reload} /></Sheet>;
  }
  if (!res.data) {
    return <Sheet open onClose={onClose} title={title}><Skeleton rows={5} /></Sheet>;
  }
  return <PlaceForm data={res.data} prefill={prefill} onClose={onClose} title={title} />;
}

function PlaceForm({ data, prefill, onClose, title }: { data: PlaceData; prefill: PlacePrefill; onClose: () => void; title: string }) {
  const { me, org } = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const r = prefill.replaces;

  const [memberId, setMemberId] = useState('');
  const [picking, setPicking] = useState(true);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState(prefill.clientId || r?.client_id || '');
  const [jobTitle, setJobTitle] = useState(r?.title || '');
  const firstTier = data.tiers[0];
  const [tierId, setTierId] = useState(r ? r.tier_id || '' : firstTier?.id || '');
  const [bill, setBill] = useState(r ? String(num(r.bill_rate)) : firstTier ? String(num(firstTier.bill_rate)) : '');
  const [pay, setPay] = useState(r ? String(num(r.pay_rate)) : firstTier ? String(num(firstTier.pay_rate)) : '');
  const [hoursPW, setHoursPW] = useState(r ? String(num(r.hours_per_week)) : '40');
  const [schedule, setSchedule] = useState(r?.schedule || '');
  const [start, setStart] = useState('');
  const [status, setStatus] = useState<PlacementStatus>('proposed');
  const [fee, setFee] = useState(r ? '0' : String(num(org.agency?.default_setup_fee ?? 0)));
  const [coachId, setCoachId] = useState(r?.coach_id || '');
  const coachTouched = useRef(!!r?.coach_id);
  const [contactId, setContactId] = useState(r?.client_contact_id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});

  const client = data.clients.find((c) => c.id === clientId) || null;
  const currency = client?.currency || 'USD';
  const member = data.staff.find((m) => m.id === memberId) || null;
  const contacts = useMemo(() => data.contacts.filter((c) => c.client_id === clientId), [data.contacts, clientId]);
  const tier = data.tiers.find((t) => t.id === tierId) || null;

  // When the client changes, a client with a single contact gets them by default.
  useEffect(() => {
    setContactId((cur) => (contacts.some((c) => c.id === cur) ? cur : contacts.length === 1 ? contacts[0]!.id : ''));
  }, [contacts]);

  function pickMember(m: Member) {
    setMemberId(m.id);
    setPicking(false);
    setErrs((e) => ({ ...e, member: '' }));
    if (!coachTouched.current) setCoachId(m.mentor_id && data.coaches.some((c) => c.id === m.mentor_id) ? m.mentor_id : '');
  }

  function pickTier(id: string) {
    setTierId(id);
    const t = data.tiers.find((x) => x.id === id);
    if (t) { setBill(String(num(t.bill_rate))); setPay(String(num(t.pay_rate))); }
  }

  const staffRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.staff
      .filter((m) => !s || [m.full_name, m.preferred_name, m.email].some((v) => (v || '').toLowerCase().includes(s)))
      .map((m) => ({
        m,
        pct: data.training.get(m.id) ?? 0,
        at: data.placements.filter((p) => p.member_id === m.id && p.status !== 'ended')
          .map((p) => data.clients.find((c) => c.id === p.client_id)?.name || 'a client'),
      }))
      // Employees and trainees first; leads, mentors and admins are rarely placed.
      .sort((a, b) => Number(rankOf(a.m.level) < 5) - Number(rankOf(b.m.level) < 5) || personName(a.m).localeCompare(personName(b.m)));
  }, [data, search]);

  const billN = parseNum(bill), payN = parseNum(pay), hoursN = parseNum(hoursPW), feeN = parseNum(fee);
  const e = econ(hoursN ?? 0, billN ?? 0, payN ?? 0);
  const losing = billN !== null && payN !== null && billN < payN;
  const dup = member && client && data.placements.some((p) => p.member_id === member.id && p.client_id === client.id && p.status !== 'ended');
  const openClients = data.clients.filter((c) => c.status !== 'ended');

  async function save(ev?: FormEvent) {
    ev?.preventDefault();
    setError('');
    const x: Record<string, string> = {};
    if (!member) x.member = 'Pick the team member.';
    if (!client) x.client = 'Pick the client.';
    if (!jobTitle.trim()) x.title = 'Add a job title, like Operations coordinator.';
    if (billN === null || billN < 0) x.bill = 'Enter the hourly bill rate.';
    if (payN === null || payN < 0) x.pay = 'Enter the hourly pay rate.';
    if (hoursN === null || hoursN < 0 || hoursN > 80) x.hours = 'Enter 0 to 80 hours a week.';
    if (feeN === null || feeN < 0) x.fee = 'Enter a setup fee, or 0 for none.';
    if (status === 'active' && !start) x.start = 'Add the start date for an active placement.';
    setErrs(x);
    if (Object.keys(x).length) {
      if (x.member) setPicking(true);
      focusInvalid('core-place-form');
      return;
    }
    setBusy(true);
    try {
      const { data: row, error: e1 } = await supabase.from('ramp_placements').insert({
        client_id: client!.id, member_id: member!.id, title: jobTitle.trim().slice(0, 120), tier_id: tierId || null, status,
        start_date: start || null, hours_per_week: hoursN, schedule: schedule.trim(), bill_rate: billN, pay_rate: payN,
        currency, setup_fee: feeN, coach_id: coachId || null, client_contact_id: contactId || null,
        replaces_id: r?.id || null, created_by: me.id,
      }).select('id').single();
      if (e1) throw e1;
      const id = (row as { id: string }).id;
      const { error: e2 } = await supabase.rpc('ramp_placement_seed', { p_placement: id });
      if (e2) toast(`Placement saved, but its checklist couldn’t be set up: ${errText(e2)}`, 'bad');
      else toast(`${personName(member)} placed with ${client!.name}.`);
      onClose();
      navigate(`/admin/placements/${id}`);
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  const section = (n: number, label: string) => (
    <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted mt-1">{n}. {label}</p>
  );

  return (
    <Sheet open wide onClose={() => (busy ? undefined : onClose())} title={title}
      subtitle={r ? <>Replaces {prefill.replacesName || 'the current team member'}. Client, role, rates and people are copied over; pick the new team member.</>
        : 'Pick who, where and at what rates. The checklist, check-ins and guarantee are set up for you.'}
      footer={
        <>
          <span className="w-full sm:w-auto sm:mr-auto text-sm text-ink-2 tabular-nums self-center min-w-0" aria-live="polite">
            Margin <span className={cx('font-semibold', e.margin < 0 ? 'text-bad' : 'text-good')}>{money(e.margin, currency)}/h</span>
            <span className="text-muted"> · {money(e.week.margin, currency)}/week</span>
          </span>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form="core-place-form" loading={busy} icon="check">{r ? 'Create replacement' : 'Place team member'}</Button>
        </>
      }>
      <form id="core-place-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        {section(1, 'Team member')}
        {member && !picking ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
            <Avatar name={personName(member)} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[15px] break-words">{personName(member)}</p>
              <p className="text-[13px] text-muted">{LEVELS[member.level].label} · training {data.training.get(member.id) ?? 0}% done</p>
            </div>
            <Button size="sm" onClick={() => setPicking(true)}>Change</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2" role="group" aria-label="Pick the team member">
            <SearchInput value={search} onChange={setSearch} placeholder="Search staff by name or email" label="Search staff" />
            {errs.member && <p className="text-xs font-semibold text-bad" role="alert">{errs.member}</p>}
            {staffRows.length === 0 ? (
              <p className="text-sm text-muted py-3 text-center">{data.staff.length ? 'No one matches that search.' : 'No active staff yet. Invite your team members in Admin › People first.'}</p>
            ) : (
              <ul role="radiogroup" aria-label="Team member" className="rounded-2xl border border-line divide-y divide-line-2 max-h-72 overflow-y-auto">
                {staffRows.map(({ m, pct, at }) => (
                  <li key={m.id}>
                    <button type="button" role="radio" aria-checked={m.id === memberId} aria-invalid={!!errs.member && !memberId} onClick={() => pickMember(m)}
                      className={cx('w-full flex items-center gap-3 px-3.5 py-2.5 min-h-14 text-left cursor-pointer', m.id === memberId ? 'bg-brand-soft' : 'hover:bg-[#FAFBFC]')}>
                      <Avatar name={personName(m)} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[15px] truncate">{personName(m)}</span>
                        <span className="block text-xs text-muted truncate">{LEVELS[m.level].label}{at.length ? ` · with ${at.join(', ')}` : ''}</span>
                      </span>
                      <span className="w-20 shrink-0 flex flex-col items-end gap-1">
                        <span className="text-xs font-semibold text-ink-2 tabular-nums">{pct}% trained</span>
                        <Bar value={pct} tone={pct === 100 ? 'good' : 'brand'} className="w-full" label={`${personName(m)} training`} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {section(2, 'Client')}
        <Field label="Client" required error={errs.client}>
          <Select value={clientId} onChange={(ev) => { setClientId(ev.target.value); setErrs((x) => ({ ...x, client: '' })); }} aria-invalid={!!errs.client}>
            <option value="">Choose a client</option>
            {openClients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'active' ? ` (${c.status})` : ''}</option>)}
          </Select>
        </Field>
        {data.clients.length === 0 && <Notice tone="warn" icon="alert">Add a client first, in Agency › Clients.</Notice>}
        {dup && <Notice tone="warn" icon="alert">{personName(member)} already has an open placement with {client!.name}. Saving adds a second one.</Notice>}

        {section(3, 'Role and rates')}
        <Field label="Job title" required error={errs.title}>
          <Input value={jobTitle} maxLength={120} onChange={(ev) => setJobTitle(ev.target.value)} aria-invalid={!!errs.title} placeholder="Operations coordinator" />
        </Field>
        <Field label="Tier" hint={tier ? `${tier.description || tier.name}. Picking a tier fills in its default rates.` : 'Picking a tier fills in its default rates.'}>
          <Select value={tierId} onChange={(ev) => pickTier(ev.target.value)}>
            <option value="">No tier</option>
            {data.tiers.map((t) => <option key={t.id} value={t.id}>{t.name} · {money(t.bill_rate)} bill, {money(t.pay_rate)} pay</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bill rate per hour" required error={errs.bill} hint="What the client pays.">
            <MoneyInput value={bill} onChange={setBill} currency={currency} aria-invalid={!!errs.bill} />
          </Field>
          <Field label="Pay rate per hour" required error={errs.pay} hint="What the team member gets.">
            <MoneyInput value={pay} onChange={setPay} currency={currency} aria-invalid={!!errs.pay} />
          </Field>
        </div>
        {losing && <Notice tone="bad" icon="alert">The bill rate is lower than the pay rate, so this placement loses {money(-e.margin, currency)} an hour.</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hours per week" required error={errs.hours}>
            <Input type="number" inputMode="decimal" min={0} max={80} step={0.5} value={hoursPW} onChange={(ev) => setHoursPW(ev.target.value)} aria-invalid={!!errs.hours} className="tabular-nums" />
          </Field>
          <Field label="Setup fee" error={errs.fee} hint="Billed once, on the next invoice.">
            <MoneyInput value={fee} onChange={setFee} currency={currency} aria-invalid={!!errs.fee} />
          </Field>
        </div>
        <div className="rounded-2xl bg-bg px-4 py-3">
          <EconGrid hoursPerWeek={hoursN ?? 0} bill={billN ?? 0} pay={payN ?? 0} currency={currency} />
        </div>
        <Field label="Schedule" hint="Working days and hours in the client’s time zone.">
          <Input value={schedule} maxLength={200} onChange={(ev) => setSchedule(ev.target.value)} placeholder="Mon–Fri, 9 am – 5 pm Eastern" />
        </Field>

        {section(4, 'Status and start')}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Status</span>
          <Pills label="Status" size="sm" value={status} onChange={setStatus}
            options={NEW_STATUSES.map((s) => ({ value: s, label: PLACEMENT_STATUS[s].label }))} />
          <p className="text-[13px] text-muted">{STATUS_HINT[status]}</p>
        </div>
        <Field label="Start date" error={errs.start} required={status === 'active'}
          hint={start ? `Check-ins and the ${org.agency?.replacement_days ?? 60}-day replacement guarantee count from ${longDate(start)}.` : 'Check-ins and the replacement guarantee are scheduled from the start date. You can add it later.'}>
          <Input type="date" value={start} onChange={(ev) => setStart(ev.target.value)} aria-invalid={!!errs.start} />
        </Field>

        {section(5, 'People')}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Coach" hint={member?.mentor_id && coachId === member.mentor_id ? 'Their mentor. Runs check-ins and the checklist.' : 'Runs check-ins and the checklist.'}>
            <Select value={coachId} onChange={(ev) => { coachTouched.current = true; setCoachId(ev.target.value); }}>
              <option value="">{member?.mentor_id ? 'Their mentor' : 'No coach yet'}</option>
              {data.coaches.map((c) => <option key={c.id} value={c.id}>{personName(c)} · {LEVELS[c.level].label}</option>)}
            </Select>
          </Field>
          <Field label="Client contact" hint={!clientId ? 'Pick the client first.' : contacts.length ? 'Approves hours and gets updates.' : 'Invite contacts on the client’s page.'}>
            <Select value={contactId} onChange={(ev) => setContactId(ev.target.value)} disabled={!contacts.length}>
              <option value="">{contacts.length ? 'No one in particular' : 'No contacts yet'}</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{personName(c)}{c.status === 'invited' ? ' (not joined yet)' : ''}</option>)}
            </Select>
          </Field>
        </div>
        {num(feeN) > 0 && client && <p className="text-[13px] text-muted">The {money(feeN, currency)} setup fee goes on {client.name}’s next invoice. You can waive it on the placement later.</p>}
        {r && <Notice tone="brand" icon="info">The current placement stays as it is. End it from its page when the handover is done.</Notice>}
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
