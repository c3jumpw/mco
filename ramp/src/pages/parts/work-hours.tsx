// Weekly hours: the day grid (editable for assistants, read-only for coaches and clients), totals and the week switcher.
import { useState, type ReactNode } from 'react';
import { DAY_NAMES, TIMESHEET_STATUS, addDays, cx, daysUntil, fmtDate, hours, todayISO, weekLabel, weekStart } from '../../lib/util';
import type { TimesheetStatus } from '../../lib/types';
import { Chip, Icon, IconButton, Progress, inputCls } from '../../ui';

export const EMPTY_WEEK = [0, 0, 0, 0, 0, 0, 0];

export const roundQuarter = (n: number) => Math.round(n * 4) / 4;

/** Blank counts as 0. Returns null when it isn't a number. */
export function parseHours(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
export function dayError(s: string): string | null {
  const n = parseHours(s);
  if (n === null) return 'Enter a number of hours.';
  if (n < 0 || n > 24) return 'Use 0 to 24 hours.';
  return null;
}
export const fmtNum = (n: number | string | null | undefined) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const sumDays = (days: (number | string)[] | null | undefined) =>
  (days || []).reduce<number>((a, d) => a + (typeof d === 'number' ? d : parseHours(d) ?? 0), 0);

/** Days as input strings: 0 shows as blank so the field is easy to type into. */
export const daysToInputs = (days: number[] | null | undefined) => (days && days.length === 7 ? days : EMPTY_WEEK).map((n) => (Number(n) ? String(Number(n)) : ''));

// ───────── status ─────────

/** `clientView`: worded for the client who reviews the hours (a returned week reads "Returned"). */
export function TimesheetChip({ status, clientView }: { status: TimesheetStatus | 'none'; clientView?: boolean }) {
  if (status === 'none') return <Chip>Not started</Chip>;
  const s = TIMESHEET_STATUS[status];
  const icon = status === 'approved' ? 'check' : status === 'submitted' ? 'clock' : status === 'rejected' ? (clientView ? 'replay' : 'alert') : undefined;
  return <Chip tone={clientView && status === 'rejected' ? 'neutral' : s.tone} icon={icon}>{clientView && status === 'rejected' ? 'Returned' : s.label}</Chip>;
}

// ───────── editable grid ─────────

export function HoursEditor({ week, values, onChange, disabled, idPrefix }: {
  week: string; values: string[]; onChange: (i: number, v: string) => void; disabled?: boolean; idPrefix: string;
}) {
  const today = todayISO();
  return (
    <div className="grid gap-2 sm:grid-cols-7">
      {DAY_NAMES.map((d, i) => {
        const date = addDays(week, i);
        const isToday = date === today;
        const v = values[i] ?? '';
        const err = dayError(v);
        const id = `${idPrefix}-d${i}`;
        return (
          <div key={d} className={cx('flex sm:flex-col items-center gap-3 sm:gap-2 rounded-xl border px-3 py-2 sm:px-2 sm:py-3',
            err ? 'border-bad bg-bad-soft' : isToday ? 'border-brand bg-brand-soft' : 'border-line bg-white')}>
            <label htmlFor={id} className="flex-1 sm:flex-none min-w-0 flex sm:flex-col items-baseline sm:items-center gap-2 sm:gap-0">
              <span className="sr-only">Hours on</span>
              <span className="text-[16px] sm:text-[13px] font-semibold text-ink">{d}</span>
              <span className="text-[13px] text-muted whitespace-nowrap">{fmtDate(date)}</span>
              {isToday && <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-brand-ink">Today</span>}
            </label>
            <div className="flex items-center gap-2 sm:w-full">
              <input id={id} type="number" inputMode="decimal" min={0} max={24} step={0.25} value={v} placeholder="0" disabled={disabled}
                aria-invalid={!!err || undefined} aria-describedby={err ? `${id}-err` : undefined}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => onChange(i, e.target.value)}
                onBlur={() => {
                  const n = parseHours(v);
                  if (n !== null && n >= 0 && n <= 24 && v.trim() !== '') onChange(i, n === 0 ? '' : String(roundQuarter(n)));
                }}
                className={cx(inputCls, 'w-24 sm:w-full min-h-12 px-1 text-center text-lg font-semibold tabular-nums placeholder:font-normal placeholder:text-muted/50',
                  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')} />
              <span className="sm:hidden text-[15px] text-muted w-3" aria-hidden="true">h</span>
            </div>
            {err && <span id={`${id}-err`} className="sr-only">{err}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ───────── read-only grid ─────────

export function HoursReadonly({ week, days, className }: { week: string; days: number[] | null | undefined; className?: string }) {
  const d7 = days && days.length === 7 ? days : EMPTY_WEEK;
  return (
    <dl className={cx('grid grid-cols-7 gap-1.5', className)}>
      {DAY_NAMES.map((d, i) => {
        const v = Number(d7[i] || 0);
        const date = addDays(week, i);
        return (
          <div key={d} className="flex flex-col items-center gap-0.5 rounded-lg bg-bg px-0.5 py-2 min-w-0">
            <dt className="text-[11px] font-semibold text-muted leading-tight text-center">
              {d}<span className="block font-normal tabular-nums">{Number(date.slice(8, 10))}</span>
              <span className="sr-only"> {fmtDate(date, { month: 'long', day: 'numeric' })}</span>
            </dt>
            <dd className={cx('text-[15px] font-semibold tabular-nums', v === 0 && 'text-muted')}>
              {v === 0 ? <><span aria-hidden="true">–</span><span className="sr-only">0 hours</span></> : fmtNum(v)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// ───────── totals ─────────

export function HoursTotal({ total, target, label = 'scheduled' }: { total: number; target: number; label?: string }) {
  const over = target > 0 && total > target;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[15px] text-muted" aria-live="polite">
          <span className="font-display text-[26px] leading-none font-bold text-ink tabular-nums">{fmtNum(total)}</span>
          <span className="font-semibold text-ink"> h</span>
          {target > 0 && <> of {hours(target)} {label}</>}
        </p>
        {over && <span className="text-[13px] font-semibold text-warn">{hours(total - target)} more than scheduled</span>}
      </div>
      {target > 0 && <Progress value={(total / target) * 100} tone={total >= target ? 'good' : 'brand'} label={`Hours compared with the ${hours(target)} scheduled`} />}
    </div>
  );
}

// ───────── week switcher ─────────

export function WeekSwitcher({ week, onChange, max = weekStart() }: { week: string; onChange: (w: string) => void; max?: string }) {
  const back = Math.round(-(daysUntil(week) ?? 0) / 7);
  const isMax = week >= max;
  const rel = isMax ? 'This week' : back <= 1 ? 'Last week' : `${back} weeks ago`;
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-line bg-white p-1 w-full sm:w-auto sm:min-w-72">
      <IconButton icon="chevronLeft" label="Previous week" onClick={() => onChange(addDays(week, -7))} />
      <div className="flex-1 min-w-0 text-center" aria-live="polite">
        <p className="text-[15px] font-semibold tabular-nums leading-tight">{weekLabel(week)}</p>
        <p className="text-xs text-muted leading-tight mt-0.5">
          {rel}
          {!isMax && <> · <button type="button" className="font-semibold text-brand-ink underline cursor-pointer" onClick={() => onChange(max)}>Go to this week</button></>}
        </p>
      </div>
      <IconButton icon="chevronRight" label={isMax ? 'Next week (future weeks can’t be logged)' : 'Next week'} disabled={isMax}
        onClick={() => onChange(addDays(week, 7) > max ? max : addDays(week, 7))} />
    </div>
  );
}

// ───────── expandable week row (history) ─────────

export function TimesheetRow({ week, days, total, status, target, title, notes, reviewNote, reviewLabel = 'Review note', meta, right, clientView }: {
  week: string; days: number[]; total: number; status: TimesheetStatus; target?: number; title?: ReactNode; notes?: string;
  reviewNote?: string; reviewLabel?: string; meta?: ReactNode; right?: ReactNode; clientView?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-line-2 first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full min-h-16 px-5 py-3 text-left cursor-pointer hover:bg-bg">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug">{title || weekLabel(week)}</span>
          <span className="block text-[13px] text-muted">
            {title ? `${weekLabel(week)} · ` : ''}<span className="tabular-nums">{hours(total)}{target ? ` of ${hours(target)}` : ''}</span>
          </span>
        </span>
        {right}
        <TimesheetChip status={status} clientView={clientView} />
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} strokeWidth={2} className="text-muted" />
      </button>
      {open && (
        <div className="px-5 pb-4 flex flex-col gap-3">
          <HoursReadonly week={week} days={days} />
          {notes && <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-line"><span className="font-semibold">Notes: </span>{notes}</p>}
          {reviewNote && <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-line"><span className="font-semibold">{reviewLabel}: </span>{reviewNote}</p>}
          {meta && <p className="text-[13px] text-muted">{meta}</p>}
        </div>
      )}
    </li>
  );
}
