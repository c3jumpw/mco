// Shared bits for the money pages: timesheets, invoices and payouts (admin only).
import { useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../../../lib/supabase';
import { q } from '../../../lib/hooks';
import { useMe } from '../../../lib/session';
import { DAY_NAMES, INVOICE_STATUS, PAYOUT_STATUS, addDays, cx, displayName, fmtDate, todayISO, weekStart } from '../../../lib/util';
import type { Invoice, Payout } from '../../../lib/types';
import { Chip, Input } from '../../../ui';

export const AGENCY_BACK = { to: '/admin', label: 'Admin' };
export const AGENCY_EYEBROW = 'Agency';

// ───────── dates ─────────

/** Today (yyyy-mm-dd) in a time zone, falling back to the device's. */
export function todayIn(tz?: string | null) {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: tz || undefined }); } catch { return todayISO(); }
}
/** Today in the org's time zone. Admin screens use it for "this week", "overdue" and period presets. */
export function useOrgToday() {
  const { org } = useMe();
  return todayIn(org.timezone);
}

export const monthStart = (iso: string) => iso.slice(0, 8) + '01';
export function monthEnd(iso: string) {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0, 12);
  return d.toLocaleDateString('en-CA');
}
export const prevMonth = (iso: string) => addDays(monthStart(iso), -1);

/** "Nov 3 – 16", "Oct 27 – Nov 9", "Dec 29, 2025 – Jan 4, 2026". Pass withYear to always show the year. */
export function rangeLabel(start: string, end: string, withYear = false) {
  const nowY = String(new Date().getFullYear());
  const y1 = start.slice(0, 4), y2 = end.slice(0, 4);
  const showYear = withYear || y1 !== nowY || y2 !== nowY;
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', o);
  if (start === end) return f(start, { month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}) });
  const a = f(start, { month: 'short', day: 'numeric', ...(showYear && y1 !== y2 ? { year: 'numeric' } : {}) });
  const b = start.slice(0, 7) === end.slice(0, 7) ? f(end, { day: 'numeric' }) : f(end, { month: 'short', day: 'numeric' });
  return `${a} – ${b}${showYear ? `, ${y2}` : ''}`;
}

/** A timestamp's calendar date in a time zone: "Nov 12" (adds the year when it isn't this year). */
export function dayIn(ts: string | null | undefined, tz?: string | null) {
  if (!ts) return '';
  try {
    const iso = new Date(ts).toLocaleDateString('en-CA', { timeZone: tz || undefined });
    return fmtDate(iso);
  } catch { return fmtDate(ts); }
}

/** Whole days from a to b (both yyyy-mm-dd). */
export function diffDays(a: string, b: string) {
  return Math.round((new Date(b.slice(0, 10) + 'T12:00:00').getTime() - new Date(a.slice(0, 10) + 'T12:00:00').getTime()) / 86400000);
}

/** Mondays from this week back, newest first. */
export function recentWeeks(today: string, count: number) {
  const mon = weekStart(today);
  return Array.from({ length: count }, (_, i) => addDays(mon, -7 * i));
}

// ───────── numbers ─────────

/** Parse a typed amount ("1,250.5" → 1250.5). NaN when it isn't a number. */
export function parseNum(s: string) {
  const t = s.replace(/[,\s$]/g, '');
  if (t === '' || t === '-' || t === '.') return NaN;
  return Number(t);
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
/** "37.5" — hours without the unit. */
export const num = (n: number | string | null | undefined) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Sum amounts per currency: "$1,200.00" or "$1,200.00 + €300.00". */
export function sumMoney(rows: { amount: number | string; currency: string }[], fallback = 'USD') {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency || fallback, (by.get(r.currency || fallback) || 0) + Number(r.amount || 0));
  if (!by.size) return moneyFmt(0, fallback);
  return [...by.entries()].map(([c, v]) => moneyFmt(v, c)).join(' + ');
}
function moneyFmt(v: number, c: string) {
  try { return v.toLocaleString('en-US', { style: 'currency', currency: c, minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch { return `${c} ${v.toFixed(2)}`; }
}

// ───────── data ─────────

export interface MemberLite { id: string; full_name: string; preferred_name: string; email: string }
export const nameOf = (m: MemberLite | undefined | null) => (m ? displayName(m) : 'Someone');

/** Select rows whose `col` is in `ids`, in chunks so the URL stays short. */
export async function selectIn<T>(table: string, cols: string, col: string, ids: (string | null | undefined)[]): Promise<T[]> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 120) chunks.push(uniq.slice(i, i + 120));
  const parts = await Promise.all(chunks.map((c) => q<T[]>(supabase.from(table).select(cols).in(col, c) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>)));
  return parts.flat();
}

export async function loadMembers(ids: (string | null | undefined)[]) {
  const rows = await selectIn<MemberLite>('ramp_members', 'id, full_name, preferred_name, email', 'id', ids);
  return new Map(rows.map((m) => [m.id, m]));
}

// ───────── status ─────────

export const isOverdue = (inv: Pick<Invoice, 'status' | 'due_date'>, today: string) => inv.status === 'open' && !!inv.due_date && inv.due_date < today;

export function InvoiceChip({ invoice, today }: { invoice: Pick<Invoice, 'status' | 'due_date'>; today: string }) {
  if (isOverdue(invoice, today)) return <Chip tone="bad" icon="alert">Overdue</Chip>;
  const s = INVOICE_STATUS[invoice.status];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function PayoutChip({ payout }: { payout: Pick<Payout, 'status'> }) {
  const s = PAYOUT_STATUS[payout.status];
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

// ───────── hours grid ─────────

const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Read-only Mon–Sun hours with the week's total. */
export function DaysGrid({ days, total, className }: { days: (number | string)[]; total?: number | string; className?: string }) {
  const vals = Array.from({ length: 7 }, (_, i) => Number(days?.[i] || 0));
  const sum = total !== undefined ? Number(total) : vals.reduce((a, b) => a + b, 0);
  const label = `Hours by day: ${vals.map((v, i) => `${DAY_NAMES[i]} ${num(v)}`).join(', ')}. Total ${num(sum)}.`;
  return (
    <div role="img" aria-label={label} className={cx('grid grid-cols-8 gap-1 text-center tabular-nums max-w-md', className)}>
      {vals.map((v, i) => (
        <div key={i} className={cx('flex flex-col rounded-lg py-1', v > 0 ? 'bg-brand-soft' : 'bg-chip')}>
          <span className="text-[11px] font-semibold text-muted">{DAY_NAMES[i]}</span>
          <span className={cx('text-[13px] font-semibold', v > 0 ? 'text-ink' : 'text-muted')}>{v > 0 ? num(v) : '–'}</span>
        </div>
      ))}
      <div className="flex flex-col rounded-lg py-1 bg-ink text-white">
        <span className="text-[11px] font-semibold opacity-80">Total</span>
        <span className="text-[13px] font-bold">{num(sum)}</span>
      </div>
    </div>
  );
}

/** Editable Mon–Sun hours. Values stay strings while typing. */
export function DaysInput({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const total = value.reduce((a, s) => a + (Number.isFinite(parseNum(s)) ? parseNum(s) : 0), 0);
  return (
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
      {DAY_NAMES.map((d, i) => {
        const v = value[i] ?? '';
        const n = parseNum(v);
        const bad = v.trim() !== '' && (!Number.isFinite(n) || n < 0 || n > 24);
        return (
          <label key={d} className="flex flex-col gap-1 text-xs font-semibold text-ink-2 text-center">
            <span>{d}</span>
            <Input type="text" inputMode="decimal" value={v} disabled={disabled} placeholder="0" aria-label={`${FULL_DAYS[i]} hours`}
              aria-invalid={bad || undefined}
              onChange={(e) => { const next = [...value]; next[i] = e.target.value; onChange(next); }}
              className={cx('text-center px-1 tabular-nums', bad && 'border-bad bg-bad-soft')} />
          </label>
        );
      })}
      <div className="flex flex-col gap-1 text-xs font-semibold text-ink-2 text-center">
        <span>Total</span>
        <span className="min-h-11 rounded-[10px] bg-ink text-white flex items-center justify-center text-base font-bold tabular-nums" aria-live="polite">{num(total)}</span>
      </div>
    </div>
  );
}

/** Check typed hours: returns numbers, or an error sentence. */
export function readDays(value: string[]): { days: number[] } | { error: string } {
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    const s = (value[i] ?? '').trim();
    const n = s === '' ? 0 : parseNum(s);
    if (!Number.isFinite(n) || n < 0 || n > 24) return { error: `${FULL_DAYS[i]} must be a number of hours between 0 and 24.` };
    days.push(round2(n));
  }
  return { days };
}

// ───────── files ─────────

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** RFC 4180 CSV with CRLF line ends. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]) {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
/** Keep spreadsheet apps from running a cell as a formula (for human-facing files only). */
export const safeText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ───────── small layout pieces ─────────

/** A label/value row for summary cards. */
export function Line({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={cx('text-right tabular-nums', strong ? 'text-lg font-bold text-ink' : 'text-[15px] font-semibold text-ink-2')}>{children}</dd>
    </div>
  );
}

/** A stat tile sized for money amounts (they're longer than counts). */
export function MoneyStat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' | 'good' | 'bad' }) {
  return (
    <div className="bg-card border border-line rounded-2xl px-4 py-3.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className={cx('text-xl sm:text-2xl leading-tight font-semibold tabular-nums tracking-tight break-words',
        tone === 'warn' && 'text-warn', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')}>{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** Mutually exclusive presets plus a custom start/end. */
export interface PeriodPreset { key: string; label: string; start: string; end: string }
export function usePeriod(presets: PeriodPreset[], initial: string) {
  const [key, setKey] = useState(initial);
  const [custom, setCustom] = useState<{ start: string; end: string }>(() => {
    const p = presets.find((x) => x.key === initial) || presets[0];
    return { start: p?.start || todayISO(), end: p?.end || todayISO() };
  });
  const preset = presets.find((p) => p.key === key);
  const period = useMemo(() => (key === 'custom' || !preset ? custom : { start: preset.start, end: preset.end }), [key, preset, custom]);
  return { key, setKey, custom, setCustom, period, valid: !!period.start && !!period.end && period.start <= period.end };
}

export function CustomRange({ value, onChange }: { value: { start: string; end: string }; onChange: (v: { start: string; end: string }) => void }) {
  const bad = !!value.start && !!value.end && value.end < value.start;
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
        <span>From</span>
        <Input type="date" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
        <span>To</span>
        <Input type="date" value={value.end} min={value.start || undefined} onChange={(e) => onChange({ ...value, end: e.target.value })} aria-invalid={bad || undefined} />
      </label>
      {bad && <p className="col-span-2 text-xs font-semibold text-bad">The end date is before the start date.</p>}
    </div>
  );
}
