// Placement › Launch plan (status of the client prep and Day 1 run sheet) and Details (schedule, people,
// setup fee, guarantee and notes).

import { useEffect, useMemo, useState } from 'react';
import { supabase, errText } from '../../../lib/supabase';
import { q, useAsync } from '../../../lib/hooks';
import { useMe } from '../../../lib/session';
import { LAUNCH_SECTIONS, LEVELS, ago, fmtDateTime, money, rankOf } from '../../../lib/util';
import type { LaunchData, LaunchPlan, Placement } from '../../../lib/types';
import { Button, Card, CardHeader, Chip, ErrorBox, Field, Icon, Input, LinkButton, Notice, Progress, Select, Skeleton, Textarea, useConfirm, useToast } from '../../../ui';
import { SaveBar, same } from '../../parts/setup-kit';
import { fmtMinutes } from './core-settings';
import { MoneyInput, longDate, num, parseNum, personName, type MemberLite } from './core-common';

// ───────── launch plan ─────────

export const LAUNCH_STATUS: Record<LaunchPlan['status'], { label: string; tone: 'neutral' | 'brand' | 'warn' | 'good' }> = {
  preparing: { label: 'Client preparing', tone: 'warn' },
  ready: { label: 'Ready for day 1', tone: 'brand' },
  in_progress: { label: 'Day 1 in progress', tone: 'brand' },
  done: { label: 'Day 1 done', tone: 'good' },
};

interface LaunchListItem { placement_id: string; plan_status: LaunchPlan['status'] | null; day1_date: string | null; updated_at: string | null }

function sectionFilled(d: LaunchData, id: (typeof LAUNCH_SECTIONS)[number]['id']) {
  switch (id) {
    case 'company': { const c = d.company || {}; return !!(c.summary || c.public_info || c.admin_info || c.presentation_url || c.files?.length); }
    case 'schedules': return (d.schedules || []).some((s) => s.blocks?.length);
    default: return ((d[id] as unknown[] | undefined) || []).length > 0;
  }
}

export function LaunchTab({ placementId, client }: { placementId: string; client: string }) {
  const { org } = useMe();
  const res = useAsync(async () => {
    const [list, plan] = await Promise.all([
      q<LaunchListItem[]>(supabase.rpc('ramp_launch_list')),
      q<LaunchPlan | null>(supabase.from('ramp_launch_plans').select('*').eq('placement_id', placementId).maybeSingle()),
    ]);
    return { item: (list || []).find((x) => x.placement_id === placementId) || null, plan };
  }, [placementId]);

  if (res.error && !res.data) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Skeleton rows={3} />;
  const { item, plan } = res.data;
  const status = plan?.status || item?.plan_status || null;
  const day1 = plan?.day1_date || item?.day1_date || null;
  const data = plan?.data || {};
  const filled = LAUNCH_SECTIONS.filter((s) => sectionFilled(data, s.id)).length;
  const agenda = plan?.agenda || [];
  const agendaDone = agenda.filter((a) => a.done).length;
  const minutes = agenda.reduce((s, a) => s + num(a.minutes), 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
      <Card className="flex flex-col gap-4">
        <CardHeader title="Launch plan"
          subtitle={`A guided prep for ${client} (company intro, values, projects, checklists, tools, milestones and time-blocks) and a timed Day 1 run sheet built from it.`}
          action={<LinkButton to={`/launch/${placementId}`} variant="primary" iconRight="chevronRight">{plan ? 'Open launch plan' : 'Start launch plan'}</LinkButton>} />
        <div className="flex flex-wrap items-center gap-2">
          {status ? <Chip tone={LAUNCH_STATUS[status].tone}>{LAUNCH_STATUS[status].label}</Chip> : <Chip>Not started</Chip>}
          {day1 && <Chip icon="calendar">Day 1: {longDate(day1)}</Chip>}
          {plan && <span className="text-xs text-muted" title={fmtDateTime(plan.updated_at, org.timezone)}>Updated {ago(plan.updated_at)}</span>}
        </div>
        {!plan && <p className="text-[15px] text-ink-2">The plan is created from your Day 1 agenda template the first time you, the coach or the client opens it.</p>}
        {plan && (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{filled} of {LAUNCH_SECTIONS.length} prep sections filled in</p>
              <Progress value={(filled / LAUNCH_SECTIONS.length) * 100} tone={filled === LAUNCH_SECTIONS.length ? 'good' : 'brand'} label="Prep sections filled in" />
            </div>
            <ul className="grid sm:grid-cols-2 gap-x-4">
              {LAUNCH_SECTIONS.map((s) => {
                const ok = sectionFilled(data, s.id);
                return (
                  <li key={s.id} className="flex items-center gap-2 py-1.5 text-[15px]">
                    <Icon name={ok ? 'check' : 'clock'} size={16} strokeWidth={2.4} className={ok ? 'text-good' : 'text-muted'} />
                    <span className={ok ? 'text-ink' : 'text-muted'}>{s.label}</span><span className="sr-only">{ok ? ', filled in' : ', empty'}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
      <Card className="flex flex-col gap-2">
        <CardHeader title="Day 1 agenda" subtitle={plan ? `${agendaDone} of ${agenda.length} items done · ${fmtMinutes(minutes)} in total` : 'From the template in Agency settings.'} />
        {plan && agenda.length > 0 && <Progress value={(agendaDone / agenda.length) * 100} tone={agendaDone === agenda.length ? 'good' : 'brand'} label="Day 1 agenda done" />}
        {plan && agenda.length > 0 && (
          <ol className="flex flex-col mt-1">
            {agenda.slice(0, 6).map((a) => (
              <li key={a.key} className="flex items-center gap-2 py-1.5 text-sm border-t border-line-2 first:border-t-0">
                <Icon name={a.done ? 'check' : 'clock'} size={15} className={a.done ? 'text-good' : 'text-muted'} />
                <span className="flex-1 min-w-0 truncate">{a.title}</span>
                <span className="text-muted tabular-nums">{a.minutes} min</span>
              </li>
            ))}
            {agenda.length > 6 && <li className="text-xs text-muted pt-1">and {agenda.length - 6} more</li>}
          </ol>
        )}
      </Card>
    </div>
  );
}

// ───────── details ─────────

type Form = { title: string; hours: string; schedule: string; start: string; coach: string; contact: string; fee: string; guarantee: string; notes: string };
const formOf = (p: Placement): Form => ({
  title: p.title, hours: String(num(p.hours_per_week)), schedule: p.schedule || '', start: p.start_date || '', coach: p.coach_id || '',
  contact: p.client_contact_id || '', fee: String(num(p.setup_fee)), guarantee: p.guarantee_until || '', notes: p.notes || '',
});

const FEE_STATUS: Record<Placement['setup_fee_status'], { label: string; tone: 'neutral' | 'warn' | 'brand' | 'good' | 'dark' }> = {
  none: { label: 'No setup fee', tone: 'neutral' },
  unbilled: { label: 'Not billed yet', tone: 'warn' },
  invoiced: { label: 'On an invoice', tone: 'brand' },
  paid: { label: 'Paid', tone: 'good' },
  waived: { label: 'Waived', tone: 'dark' },
};

export function DetailsTab({ placement: p, people, client, onSaved }: { placement: Placement; people: MemberLite[]; client: { id: string; name: string; linked_workspace_id?: string | null }; onSaved: () => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const saved = useMemo(() => formOf(p), [p]);
  const [f, setF] = useState<Form>(saved);
  useEffect(() => { setF(saved); }, [saved]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const dirty = !same(f, saved);
  const coaches = people.filter((m) => m.status === 'active' && rankOf(m.level) <= 4);
  const contacts = people.filter((m) => m.level === 'client' && m.client_id === client.id && m.status !== 'inactive');
  const feeLocked = p.setup_fee_status === 'invoiced' || p.setup_fee_status === 'paid';
  const cur = p.currency || 'USD';

  async function save() {
    setError('');
    const hours = parseNum(f.hours), fee = parseNum(f.fee);
    if (!f.title.trim()) { setError('Add a job title.'); return; }
    if (hours === null || hours < 0 || hours > 80) { setError('Enter 0 to 80 hours a week.'); return; }
    if (!feeLocked && (fee === null || fee < 0)) { setError('Enter a setup fee, or 0 for none.'); return; }
    if (p.status === 'active' && !f.start) { setError('An active placement needs a start date.'); return; }
    setBusy(true);
    try {
      const patch: Partial<Placement> = {
        title: f.title.trim().slice(0, 120), hours_per_week: hours, schedule: f.schedule.trim(), start_date: f.start || null,
        coach_id: f.coach || null, client_contact_id: f.contact || null, guarantee_until: f.guarantee || null, notes: f.notes.trim(),
      };
      if (!feeLocked) {
        patch.setup_fee = fee!;
        if (p.setup_fee_status !== 'waived') patch.setup_fee_status = fee! > 0 ? 'unbilled' : 'none';
      }
      const { error: e } = await supabase.from('ramp_placements').update(patch).eq('id', p.id);
      if (e) throw e;
      // A start date added later schedules the check-ins and the guarantee.
      if (!p.start_date && f.start) {
        const { error: e2 } = await supabase.rpc('ramp_placement_seed', { p_placement: p.id });
        if (e2) toast(`Saved, but check-ins couldn’t be scheduled: ${errText(e2)}`, 'bad');
        else toast('Details saved. Check-ins and the guarantee are scheduled from the start date.');
      } else toast('Details saved.');
      onSaved();
    } catch (x) {
      setError(errText(x));
      toast(errText(x), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function setFeeStatus(waive: boolean) {
    const ok = await confirm(waive ? {
      title: `Waive the ${money(p.setup_fee, cur)} setup fee?`, body: `${client.name} won’t be billed for it. You can bill it again later as long as it isn’t on an invoice.`, action: 'Waive fee', danger: true,
    } : {
      title: `Bill the ${money(p.setup_fee, cur)} setup fee?`, body: `It goes on ${client.name}’s next invoice.`, action: 'Bill the fee',
    });
    if (!ok) return;
    const { error: e } = await supabase.from('ramp_placements').update({ setup_fee_status: waive ? 'waived' : num(p.setup_fee) > 0 ? 'unbilled' : 'none' }).eq('id', p.id);
    if (e) { toast(errText(e), 'bad'); return; }
    toast(waive ? 'Setup fee waived.' : 'Setup fee will be billed.');
    onSaved();
  }

  const fs = FEE_STATUS[p.setup_fee_status];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Card className="flex flex-col gap-4">
          <CardHeader title="Role and schedule" />
          <Field label="Job title" required><Input value={f.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours per week"><Input type="number" inputMode="decimal" min={0} max={80} step={0.5} value={f.hours} onChange={(e) => set('hours', e.target.value)} className="tabular-nums" /></Field>
            <Field label="Start date"><Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
          </div>
          <Field label="Schedule" hint="Working days and hours in the client’s time zone.">
            <Input value={f.schedule} maxLength={200} onChange={(e) => set('schedule', e.target.value)} placeholder="Mon–Fri, 9 am – 5 pm Eastern" />
          </Field>
          {!p.start_date && f.start && <Notice tone="brand" icon="calendar">Saving schedules the check-ins and the replacement guarantee from {longDate(f.start)}.</Notice>}
        </Card>

        <Card className="flex flex-col gap-4">
          <CardHeader title="People" />
          <Field label="Coach" hint="Runs check-ins and the checklist. Sees no rates.">
            <Select value={f.coach} onChange={(e) => set('coach', e.target.value)}>
              <option value="">No coach</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{personName(c)} · {LEVELS[c.level].label}</option>)}
            </Select>
          </Field>
          <Field label="Client contact" hint={contacts.length ? 'Approves hours and gets updates.' : `Invite contacts on ${client.name}’s page.`}>
            <Select value={f.contact} onChange={(e) => set('contact', e.target.value)} disabled={!contacts.length && !f.contact}>
              <option value="">{contacts.length ? 'No one in particular' : 'No contacts yet'}</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{personName(c)}{c.status === 'invited' ? ' (not joined yet)' : ''}</option>)}
            </Select>
          </Field>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardHeader title="Setup fee and guarantee" />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Setup fee" className="flex-1 min-w-40" hint={feeLocked ? 'Already invoiced, so it can’t change here.' : 'Billed once, on the client’s next invoice.'}>
              <MoneyInput value={f.fee} onChange={(v) => set('fee', v)} currency={cur} disabled={feeLocked} />
            </Field>
            <Chip tone={fs.tone} className="mb-3">{fs.label}</Chip>
          </div>
          {p.setup_fee_status === 'unbilled' && <Button className="self-start" onClick={() => setFeeStatus(true)}>Waive the fee</Button>}
          {p.setup_fee_status === 'waived' && num(p.setup_fee) > 0 && <Button className="self-start" onClick={() => setFeeStatus(false)}>Bill it after all</Button>}
          <Field label="Replacement guarantee until" hint="If it doesn’t work out before this date, you replace the assistant at no extra charge.">
            <Input type="date" value={f.guarantee} onChange={(e) => set('guarantee', e.target.value)} />
          </Field>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardHeader title="Notes" subtitle="Only admins see these." />
          <Textarea rows={6} aria-label="Notes" value={f.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} placeholder="How the match came about, client preferences, anything to remember." />
        </Card>
        {client.linked_workspace_id && <SyncCard placementId={p.id} client={client.name} />}
      </div>
      {error && <Notice tone="bad" icon="alert">{error}</Notice>}
      <SaveBar dirty={dirty} saving={busy}>
        {dirty && <Button variant="ghost" onClick={() => setF(saved)} disabled={busy}>Discard</Button>}
        <Button variant="primary" icon="check" onClick={save} loading={busy} disabled={!dirty}>Save details</Button>
      </SaveBar>
      {dialog}
    </div>
  );
}

/** For a client with their own RAMP workspace: the assistant is mirrored there and kept in sync automatically. */
function SyncCard({ placementId, client }: { placementId: string; client: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title={`In ${client}’s workspace`} subtitle={`${client} has their own RAMP workspace. This assistant appears on their team there, and status changes sync automatically.`} />
      <Button className="self-start" icon="refresh" loading={busy} onClick={async () => {
        setBusy(true);
        const { data, error } = await supabase.rpc('ramp_placement_sync', { p_placement: placementId });
        setBusy(false);
        if (error) toast(errText(error), 'bad');
        else toast(Number(data) ? 'Synced. Their workspace is up to date.' : 'Already up to date.');
      }}>Sync now</Button>
    </Card>
  );
}
