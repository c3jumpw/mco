// Shared helpers for the People, Person, Metrics, News, Resources and System admin pages.

import { useEffect, useRef, type ReactNode } from 'react';
import { ADMIN_SECTIONS } from '../../shell/AppShell';
import { supabase } from '../../lib/supabase';
import { q } from '../../lib/hooks';
import { planSummary, type PlanItem } from '../../lib/plan';
import { LEVELS, cx, daysUntil, fmtDate, rankOf, type Tone } from '../../lib/util';
import type { Department, JobRole, Level, Member } from '../../lib/types';
import { Chip, Notice, Segmented } from '../../ui';

export const ADMIN_BACK = { to: '/admin', label: 'Admin' };

/** The admin hub group a page belongs to ("People", "Communicate", "System"), shown as the eyebrow. */
export function groupOf(path: string) {
  return ADMIN_SECTIONS.find((s) => s.to === path)?.group || 'Admin';
}

export const LEVEL_TONE: Record<Level, Tone> = {
  owner: 'dark', admin: 'dark', lead: 'brand', mentor: 'brand', employee: 'good', trainee: 'warn', guest: 'neutral',
};

export function LevelChip({ level }: { level: Level }) {
  return <Chip tone={LEVEL_TONE[level]}>{LEVELS[level].label}</Chip>;
}

/** Full name for admin screens, falling back to the email address. */
export function personName(m: { full_name?: string; preferred_name?: string; email?: string } | null | undefined) {
  if (!m) return 'Someone';
  return m.full_name?.trim() || m.preferred_name?.trim() || m.email || 'Someone';
}

export type StageKey = 'invited' | 'onboarding' | 'training' | 'graduated' | 'paused' | 'guest' | 'ended';
export interface Stage { key: StageKey; label: string; tone: Tone; icon?: string; pct?: number }

/**
 * Where someone is in RAMP: Invited (no login yet), Onboarding (welcome flow not finished),
 * Training x% (trainees, from their assigned plan), Graduated, or Paused (access turned off).
 */
export function stageOf(m: Member, plan: PlanItem[] | null | undefined): Stage {
  if (m.status === 'inactive') return { key: 'paused', label: 'Paused', tone: 'bad', icon: 'lock' };
  if (!m.auth_user_id) return { key: 'invited', label: 'Invited', tone: 'neutral', icon: 'mail' };
  const rank = rankOf(m.level);
  if (m.level === 'guest') {
    const left = daysUntil(m.access_until);
    if (left !== null && left < 0) return { key: 'ended', label: 'Access ended', tone: 'bad', icon: 'clock' };
    const items = plan || [];
    if (!items.length) return { key: 'guest', label: 'Guest access', tone: 'neutral' };
    const pct = Math.round((items.filter((i) => i.status === 'completed').length / items.length) * 100);
    return { key: 'training', label: `Training ${pct}%`, tone: 'brand', pct };
  }
  if (!m.onboarded_at && rank >= 3) return { key: 'onboarding', label: 'Onboarding', tone: 'warn' };
  if (m.level === 'trainee') {
    const pct = plan ? planSummary(plan).pct : 0;
    return { key: 'training', label: `Training ${pct}%`, tone: 'brand', pct };
  }
  return { key: 'graduated', label: 'Graduated', tone: 'good', icon: 'check' };
}

export const STAGE_FILTERS: { value: StageKey | 'all'; label: string }[] = [
  { value: 'all', label: 'Any stage' },
  { value: 'invited', label: 'Invited' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'training', label: 'In training' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'paused', label: 'Paused' },
];

export function StatusChip({ m }: { m: Member }) {
  if (m.status === 'inactive') return <Chip tone="bad" icon="lock">Paused</Chip>;
  if (!m.auth_user_id) return <Chip tone="neutral" icon="mail">Not joined yet</Chip>;
  return <Chip tone="good" icon="check">Active</Chip>;
}

/** Guests only: "Access until Dec 1" or "Access ended Nov 2". */
export function GuestAccessChip({ m }: { m: Member }) {
  if (m.level !== 'guest' || !m.access_until) return null;
  const left = daysUntil(m.access_until);
  if (left !== null && left < 0) return <Chip tone="bad" icon="clock">Access ended {fmtDate(m.access_until)}</Chip>;
  return <Chip tone={left !== null && left <= 7 ? 'warn' : 'neutral'} icon="clock">Access until {fmtDate(m.access_until)}</Chip>;
}

// ───────── lookups ─────────

export async function loadLookups() {
  const [roles, depts] = await Promise.all([
    q<JobRole[]>(supabase.from('ramp_job_roles').select('*').order('title')),
    q<Department[]>(supabase.from('ramp_departments').select('*').order('name')),
  ]);
  return { roles, depts };
}

export function roleLabel(role: JobRole, depts: Department[]) {
  const d = depts.find((x) => x.id === role.department_id);
  return d ? `${role.title} · ${d.name}` : role.title;
}

// ───────── CSV ─────────

type Cell = string | number | boolean | null | undefined;

function csvCell(v: Cell) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // Stop spreadsheet apps from running text that looks like a formula.
  let s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, rows: Cell[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** "2026-11-08 13:45" in the organization's time zone, for CSV files (sorts correctly in spreadsheets). */
export function csvTime(d: string | null | undefined, tz: string) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('sv-SE', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return d;
  }
}

export function stamp() {
  return new Date().toLocaleDateString('en-CA');
}

// ───────── clipboard ─────────

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// ───────── small layout pieces ─────────

/** Segmented tabs that scroll sideways on narrow phones instead of squashing. */
export function TabBar<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scrollbar-none whitespace-nowrap">
      <Segmented options={options} value={value} onChange={onChange} label={label} />
    </div>
  );
}

export function DefList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cx('grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4', className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[13px] font-semibold text-muted">{i.label}</dt>
          <dd className="text-[15px] text-ink mt-0.5 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A row inside a card: label and value on the left, an action on the right. */
export function ActionRow({ label, value, action, hint }: { label: string; value: ReactNode; action?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3 border-t border-line-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-muted">{label}</p>
        <div className="text-[15px] text-ink mt-0.5 break-words">{value}</div>
        {hint && <p className="text-xs text-muted mt-1 leading-relaxed">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function fmtSize(bytes: number | null | undefined) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Storage names start with a random id; show the original file name. */
export function cleanFileName(name: string) {
  return name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
}

/** A form-level error that is announced and scrolled into view, so it's never hidden below a long form. */
export function FormError({ error }: { error: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [error]);
  if (!error) return null;
  return <div ref={ref} role="alert"><Notice tone="bad" icon="alert">{error}</Notice></div>;
}

/** After validation, move focus to the first invalid field in a form (which also scrolls it into view). */
export function focusInvalid(formId: string) {
  requestAnimationFrame(() => document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
