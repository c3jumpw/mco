// Shared pieces for the agency admin pages (dashboard, clients, placements, tiers, settings):
// money math, status and tier chips, tier readiness, rate history lookups and small form controls.

import { useEffect, useMemo, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CLIENT_STATUS, PLACEMENT_STATUS, addDays, cx, daysUntil, fmtDate, money, plural, weekStart } from '../../../lib/util';
import type { Checkin, Client, Member, Placement, PlacementStatus, RateChange, Tier } from '../../../lib/types';
import { Avatar, Chip, Icon, Input, Select } from '../../../ui';
import { zoneLabel } from '../../parts/setup-timezone';
import { personName } from '../../parts/ops-common';

export const AGENCY_BACK = { to: '/admin', label: 'Admin' };
export const EYEBROW = 'Agency';

/** Member columns the agency pages need (never anything sensitive). */
export const MEMBER_COLS = 'id, full_name, preferred_name, email, level, status, client_id, mentor_id, job_role_id, start_date, joined_at, invited_at, auth_user_id, last_seen_at, timezone';
export type MemberLite = Pick<Member, 'id' | 'full_name' | 'preferred_name' | 'email' | 'level' | 'status' | 'client_id' | 'mentor_id' | 'job_role_id'
  | 'start_date' | 'joined_at' | 'invited_at' | 'auth_user_id' | 'last_seen_at' | 'timezone'>;

export { personName };

/** Numeric columns can arrive as strings; treat anything odd as 0. */
export const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const WEEKS_PER_MONTH = 52 / 12;

/** Bill, pay and margin per hour, week and month for a schedule. */
export function econ(hoursPerWeek: unknown, bill: unknown, pay: unknown) {
  const h = num(hoursPerWeek), b = num(bill), p = num(pay);
  const m = b - p;
  return {
    hours: h, bill: b, pay: p, margin: m, pct: b > 0 ? m / b : 0,
    week: { bill: b * h, pay: p * h, margin: m * h },
    month: { bill: b * h * WEEKS_PER_MONTH, pay: p * h * WEEKS_PER_MONTH, margin: m * h * WEEKS_PER_MONTH },
  };
}

export const pctText = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

/** “Nov 20” this year, “Nov 20, 2027” otherwise, for date-only values. */
export const longDate = (d: string | null | undefined) => (d ? fmtDate(d) : '');

/** “Starts Nov 22” or “Started Sep 28”, depending on whether the date has come. */
export const startText = (d: string | null | undefined) => (!d ? 'No start date' : `${(daysUntil(d) ?? 0) > 0 ? 'Starts' : 'Started'} ${fmtDate(d)}`);

/** Monday of next week, the default date for rate changes (hours are billed by week). */
export const nextMonday = () => addDays(weekStart(), 7);

/** Days since a date (0 on the day), or null. */
export function daysSince(d: string | null | undefined) {
  const n = daysUntil(d);
  return n === null ? null : Math.max(0, -n);
}

/** Keep the selected tab visible in a sideways-scrolling tab bar (deep links on phones). */
export function useTabInView(groupLabel: string, tab: string) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[role="group"][aria-label="${groupLabel}"] [aria-pressed="true"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [groupLabel, tab]);
}

// ───────── chips ─────────

export function PlacementStatusChip({ status }: { status: PlacementStatus }) {
  const s = PLACEMENT_STATUS[status];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function ClientStatusChip({ status }: { status: Client['status'] }) {
  const s = CLIENT_STATUS[status];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function TierChip({ tier }: { tier: Pick<Tier, 'name' | 'level'> | null | undefined }) {
  if (!tier) return <Chip>No tier</Chip>;
  return <Chip tone="brand" icon="star">{tier.name}</Chip>;
}

// ───────── money display ─────────

/** Bill, pay and margin per hour, week and month. */
export function EconGrid({ hoursPerWeek, bill, pay, currency = 'USD', className }: { hoursPerWeek: unknown; bill: unknown; pay: unknown; currency?: string; className?: string }) {
  const e = econ(hoursPerWeek, bill, pay);
  const rows = [
    { label: 'Per hour', v: { bill: e.bill, pay: e.pay, margin: e.margin } },
    { label: `Per week`, hint: `${e.hours.toLocaleString('en-US', { maximumFractionDigits: 2 })} h`, v: e.week },
    { label: 'Per month', hint: 'avg.', v: e.month },
  ];
  return (
    <div className={cx('text-sm', className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,auto))] gap-x-3 sm:gap-x-6 items-baseline">
        <span />
        <span className="text-xs font-semibold text-muted text-right">Bill</span>
        <span className="text-xs font-semibold text-muted text-right">Pay</span>
        <span className="text-xs font-semibold text-muted text-right">Margin</span>
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="py-1.5 border-t border-line-2 font-semibold text-ink-2 min-w-0">{r.label}{r.hint && <span className="block text-xs font-normal text-muted">{r.hint}</span>}</span>
            <span className="py-1.5 border-t border-line-2 text-right tabular-nums">{money(r.v.bill, currency)}</span>
            <span className="py-1.5 border-t border-line-2 text-right tabular-nums">{money(r.v.pay, currency)}</span>
            <span className={cx('py-1.5 border-t border-line-2 text-right tabular-nums font-semibold', r.v.margin < 0 ? 'text-bad' : 'text-good')}>{money(r.v.margin, currency)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-2">Margin is {pctText(e.pct)} of the bill rate. A month is 52 weeks ÷ 12.</p>
    </div>
  );
}

// ───────── tiers and readiness ─────────

export const sortTiers = (t: Tier[]) => [...t].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

/** The tier above the current one. With no tier yet, the first tier on the ladder. */
export function nextTierOf(tiers: Tier[], tierId: string | null | undefined): Tier | null {
  const sorted = sortTiers(tiers);
  const cur = tierId ? sorted.find((t) => t.id === tierId) : null;
  if (!cur) return tierId ? null : sorted[0] || null;
  return sorted.find((t) => t.level > cur.level) || null;
}

/** Average score of the last 3 done check-ins (any kind), like the assistant sees on My work. */
export function recentScore(checkins: Pick<Checkin, 'status' | 'score' | 'done_at'>[]) {
  const done = checkins.filter((c) => c.status === 'done' && c.score != null)
    .sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 3);
  if (!done.length) return null;
  return { avg: done.reduce((s, c) => s + num(c.score), 0) / done.length, count: done.length };
}

export const scoreText = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export interface ReadyCheck { key: string; label: string; detail: string; met: boolean; items?: { id: string; title: string; done: boolean }[] }
export interface Readiness { next: Tier | null; checks: ReadyCheck[]; ready: boolean }

/**
 * Is this placement ready for the next tier? Checks the tier's minimum days since the start date,
 * its required modules (completed in training) and the average of the last 3 check-in scores.
 */
export function readinessFor(p: Pick<Placement, 'start_date' | 'tier_id'>, tiers: Tier[], completed: Set<string>,
  checkins: Pick<Checkin, 'status' | 'score' | 'done_at'>[], titleOf: (id: string) => string): Readiness {
  const next = nextTierOf(tiers, p.tier_id);
  if (!next) return { next: null, checks: [], ready: false };
  const checks: ReadyCheck[] = [];
  if (next.min_days > 0) {
    const days = daysSince(p.start_date);
    checks.push({
      key: 'days', label: `${plural(next.min_days, 'day')} since starting`,
      detail: days === null ? 'No start date yet' : `${plural(days, 'day')} so far`, met: days !== null && days >= next.min_days,
    });
  }
  const req = next.required_modules || [];
  if (req.length) {
    const items = req.map((id) => ({ id, title: titleOf(id), done: completed.has(id) }));
    const done = items.filter((i) => i.done).length;
    checks.push({ key: 'modules', label: req.length === 1 ? 'Required module completed' : `All ${req.length} required modules completed`, detail: `${done} of ${req.length} done`, met: done === req.length, items });
  }
  const min = num(next.min_checkin_score);
  if (min > 0) {
    const s = recentScore(checkins);
    checks.push({
      key: 'score', label: `Check-in average of ${scoreText(min)} or higher`,
      detail: s ? `Last ${s.count === 1 ? 'check-in' : `${s.count} check-ins`}: ${scoreText(s.avg)}` : 'No scored check-ins yet',
      met: !!s && s.avg >= min,
    });
  }
  return { next, checks, ready: checks.every((c) => c.met) };
}

export function ReadyList({ checks }: { checks: ReadyCheck[] }) {
  if (!checks.length) return <p className="text-sm text-muted">This tier has no requirements, so they can move up any time.</p>;
  return (
    <ul className="flex flex-col">
      {checks.map((c) => (
        <li key={c.key} className="flex items-start gap-3 py-2.5 border-t border-line-2 first:border-t-0">
          <span className={cx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', c.met ? 'bg-good-soft text-good' : 'bg-chip text-muted')}>
            <Icon name={c.met ? 'check' : 'clock'} size={15} strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{c.label}<span className="sr-only">{c.met ? ', met' : ', not met yet'}</span></p>
            <p className={cx('text-[13px]', c.met ? 'text-good' : 'text-muted')}>{c.detail}</p>
            {c.items && c.items.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1">
                {c.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-[13px]">
                    <Icon name={i.done ? 'check' : 'x'} size={14} strokeWidth={2.4} className={i.done ? 'text-good' : 'text-muted'} />
                    <span className={i.done ? 'text-ink-2' : 'text-muted'}>{i.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ───────── rate history ─────────

/** Bill and pay rate in effect on a date, using the rate history (same rule as ramp_rates_at). */
export function ratesAt(p: Pick<Placement, 'id' | 'bill_rate' | 'pay_rate'>, changes: RateChange[], dateISO: string) {
  const later = changes.filter((c) => c.placement_id === p.id && c.effective_date > dateISO)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.created_at.localeCompare(b.created_at));
  return later[0] ? { bill: num(later[0].old_bill), pay: num(later[0].old_pay) } : { bill: num(p.bill_rate), pay: num(p.pay_rate) };
}

// ───────── form controls ─────────

/** Number input with a currency prefix. Keeps the raw text so people can clear and retype. */
export function MoneyInput({ value, onChange, currency = 'USD', className, ...rest }:
  { value: string; onChange: (v: string) => void; currency?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const prefix = currency === 'USD' ? '$' : currency;
  return (
    <span className="relative block">
      <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none text-base">{prefix}</span>
      <Input {...rest} type="number" inputMode="decimal" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)}
        className={cx('tabular-nums', prefix.length > 1 ? 'pl-12' : 'pl-7', className)} />
    </span>
  );
}

/** Parse a money or hours field: '' → null, otherwise a finite number. */
export function parseNum(v: string): number | null {
  if (v.trim() === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

const US_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];

/** Native time zone list (US first). Used inside sheets, where the picker sheet can't stack. */
export function TimezoneSelect({ value, onChange, id }: { value: string; onChange: (tz: string) => void; id?: string }) {
  const all = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone'); } catch { return US_ZONES; }
  }, []);
  const known = value === '' || all.includes(value) || US_ZONES.includes(value);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not set</option>
      {!known && <option value={value}>{value}</option>}
      <optgroup label="United States">
        {US_ZONES.map((tz) => <option key={tz} value={tz}>{zoneLabel(tz)}</option>)}
      </optgroup>
      <optgroup label="All time zones">
        {all.filter((tz) => !US_ZONES.includes(tz)).map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
      </optgroup>
    </Select>
  );
}

export const CYCLE_LABEL: Record<Client['billing_cycle'], string> = { weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month' };
export const MODE_INFO: Record<Client['billing_mode'], { label: string; desc: string }> = {
  arrears: { label: 'After the work (arrears)', desc: 'Each invoice bills the hours the client approved in the period that just ended.' },
  advance: { label: 'Up front (advance)', desc: 'Each invoice bills the scheduled hours for the coming period. The next invoice adds or credits the difference once the real hours are approved.' },
};

// ───────── placement rows ─────────

export interface PlacementRowData {
  p: Placement;
  assistant: string;
  client: string;
  tier: Tier | null;
}

/** One placement in a list: assistant, client and title, status and tier, rates and start date. */
export function PlacementRow({ row, showClient = true }: { row: PlacementRowData; showClient?: boolean }) {
  const { p } = row;
  const e = econ(p.hours_per_week, p.bill_rate, p.pay_rate);
  return (
    <li className="border-t border-line-2 first:border-t-0">
      <Link to={`/admin/placements/${p.id}`} className="flex items-start sm:items-center gap-3 px-4 py-3.5 min-h-16 no-underline text-ink hover:bg-[#FAFBFC]">
        <Avatar name={row.assistant} size={40} tone={p.status === 'ended' ? 'ink' : 'brand'} />
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <span className="font-semibold text-[15px] leading-snug break-words">{row.assistant}</span>
          <span className="text-sm text-muted break-words">{showClient ? `${row.client} · ` : ''}{p.title}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <PlacementStatusChip status={p.status} />
            <TierChip tier={row.tier} />
            <span className="text-xs text-muted">{startText(p.start_date)}</span>
          </span>
          <span className="sm:hidden text-[13px] text-ink-2 tabular-nums">
            {money(e.bill, p.currency)} bill · {money(e.pay, p.currency)} pay · <span className={cx('font-semibold', e.margin < 0 ? 'text-bad' : 'text-good')}>{money(e.margin, p.currency)}/h margin</span>
          </span>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 text-right tabular-nums">
          <span className="text-[13px] text-muted">Bill {money(e.bill, p.currency)} · Pay {money(e.pay, p.currency)}</span>
          <span className={cx('text-[15px] font-semibold', e.margin < 0 ? 'text-bad' : 'text-good')}>{money(e.margin, p.currency)}/h margin</span>
          <span className="text-xs text-muted">{hoursText(p.hours_per_week)} a week</span>
        </div>
        <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted self-center" />
      </Link>
    </li>
  );
}

export const hoursText = (h: unknown) => `${num(h).toLocaleString('en-US', { maximumFractionDigits: 2 })} h`;

/** Small label/value pair for summary strips. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <div className="text-[15px] text-ink mt-0.5 break-words">{children}</div>
    </div>
  );
}

/** Score buttons 1–5 (radio group). */
export function ScorePicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const words = ['', 'Poor', 'Needs work', 'Okay', 'Good', 'Excellent'];
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Score from 1 to 5" className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={value === s} aria-label={`${s}, ${words[s]}`} onClick={() => onChange(s)}
            className={cx('min-h-12 rounded-xl border text-lg font-bold cursor-pointer tabular-nums',
              value === s ? 'bg-brand border-brand text-white' : 'bg-white border-[#C9CED6] text-ink-2 hover:bg-chip')}>
            {s}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{value ? `${value}: ${words[value]}` : '1 is poor, 5 is excellent.'}</p>
    </div>
  );
}
