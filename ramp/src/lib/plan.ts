// Who gets which training and documents. Used by Home, Training, Team, Admin metrics and the person profile,
// so every screen agrees on what someone "has to do".

import { supabase } from './supabase';
import { q } from './hooks';
import { rankOf } from './util';
import type { Block, Member, Module, Progress, ProgressStatus, RoleModule, Submission, Template } from './types';

export type AssignKind = 'required' | 'role' | 'continued' | 'optional';

export interface PlanItem {
  module: Module;
  kind: AssignKind;
  progress: Progress | null;
  status: ProgressStatus | 'not_started';
  /** ISO date (yyyy-mm-dd) or null. */
  due: string | null;
  /** 0–100, from the saved step. */
  pct: number;
}

/** The date training due dates count from: start date, else the day they joined, else today. */
export function startOf(m: Member): string {
  return (m.start_date || m.joined_at || m.invited_at || new Date().toISOString()).slice(0, 10);
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}

/**
 * Assigned training for one person, in the order they should do it.
 * - Guests: only published modules marked visible to guests.
 * - Company-wide + required: everyone.
 * - Role track: modules linked to the person's job role.
 * - Continued: everyone who has graduated (employee and above).
 * - Company-wide, not required: optional library for staff.
 */
export function planFor(member: Member, modules: Module[], roleModules: RoleModule[], progress: Progress[]): PlanItem[] {
  const rank = rankOf(member.level);
  const published = modules.filter((m) => m.status === 'published');
  const roleIds = new Set(roleModules.filter((r) => r.job_role_id === member.job_role_id).map((r) => r.module_id));
  const roleSort = new Map(roleModules.filter((r) => r.job_role_id === member.job_role_id).map((r) => [r.module_id, r.sort]));
  const mine = progress.filter((p) => p.member_id === member.id);
  const out: PlanItem[] = [];

  for (const m of published) {
    let kind: AssignKind | null = null;
    if (rank === 7) kind = m.guest_visible ? 'optional' : null;
    else if (m.track === 'company') kind = m.required ? 'required' : 'optional';
    else if (m.track === 'role') kind = roleIds.has(m.id) ? 'role' : null;
    else if (m.track === 'continued') kind = rank <= 5 ? 'continued' : null;
    if (!kind) continue;
    const p = mine.find((x) => x.module_id === m.id) || null;
    const steps = stepCount(m.blocks);
    const pct = p ? (p.status === 'completed' || p.status === 'submitted' ? 100 : Math.min(95, Math.round((p.step / Math.max(1, steps)) * 100))) : 0;
    out.push({
      module: m,
      kind,
      progress: p,
      status: p ? p.status : 'not_started',
      due: m.due_days != null && kind !== 'optional' ? addDays(startOf(member), m.due_days) : null,
      pct,
    });
  }
  const order: Record<AssignKind, number> = { required: 0, role: 1, continued: 2, optional: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]
    || (a.kind === 'role' ? (roleSort.get(a.module.id) ?? 0) - (roleSort.get(b.module.id) ?? 0) : 0)
    || a.module.sort - b.module.sort);
}

export function planSummary(items: PlanItem[]) {
  const counted = items.filter((i) => i.kind !== 'optional');
  const done = counted.filter((i) => i.status === 'completed').length;
  const waiting = counted.filter((i) => i.status === 'submitted').length;
  const overdue = counted.filter((i) => i.due && i.status !== 'completed' && i.status !== 'submitted' && i.due < new Date().toLocaleDateString('en-CA')).length;
  const next = counted.find((i) => i.status === 'returned') || counted.find((i) => i.status === 'in_progress') || counted.find((i) => i.status === 'not_started') || null;
  return { total: counted.length, done, waiting, overdue, next, pct: counted.length ? Math.round((done / counted.length) * 100) : 0 };
}

// ───────── module steps (what the player shows, one at a time) ─────────

export type Step =
  | { kind: 'slide'; title: string; body: string; index: number; of: number }
  | { kind: 'reading'; title: string; body: string }
  | { kind: 'video'; url: string; caption?: string }
  | { kind: 'quiz'; questions: Extract<Block, { type: 'quiz' }>['questions'] }
  | { kind: 'assignment'; prompt: string }
  | { kind: 'form'; template_id: string | null; note?: string }
  | { kind: 'practice' };

export function stepsOf(blocks: Block[]): Step[] {
  const out: Step[] = [];
  for (const b of blocks || []) {
    if (b.type === 'slides') b.slides.forEach((s, i) => out.push({ kind: 'slide', title: s.title, body: s.body, index: i, of: b.slides.length }));
    else if (b.type === 'reading') out.push({ kind: 'reading', title: b.title, body: b.body });
    else if (b.type === 'video') out.push({ kind: 'video', url: b.url, caption: b.caption });
    else if (b.type === 'quiz') out.push({ kind: 'quiz', questions: b.questions });
    else if (b.type === 'assignment') out.push({ kind: 'assignment', prompt: b.prompt });
    else if (b.type === 'form') out.push({ kind: 'form', template_id: b.template_id, note: b.note });
    else if (b.type === 'practice') out.push({ kind: 'practice' });
  }
  return out;
}
export const stepCount = (blocks: Block[]) => stepsOf(blocks).length;

/** Turn a video page link (YouTube, Vimeo, Loom) into an embeddable URL, or null. */
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (/youtu\.be$/.test(u.hostname)) return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (/youtube\.com$/.test(u.hostname)) {
      const id = u.searchParams.get('v') || u.pathname.split('/').pop();
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (/vimeo\.com$/.test(u.hostname)) return `https://player.vimeo.com/video/${u.pathname.split('/').filter(Boolean).pop()}`;
    if (/loom\.com$/.test(u.hostname)) return `https://www.loom.com/embed/${u.pathname.split('/').pop()}`;
    return null;
  } catch {
    return null;
  }
}

// ───────── documents ─────────

/** Published templates this person must complete in the welcome flow (stage = onboarding). */
export function onboardingDocs(member: Member, templates: Template[]) {
  return templates.filter((t) => t.status === 'published' && t.stage === 'onboarding' && appliesTo(t, member));
}

/** Every published template that applies to the person (any stage), in order. */
export function docsFor(member: Member, templates: Template[]) {
  return templates.filter((t) => t.status === 'published' && appliesTo(t, member)).sort((a, b) => a.sort - b.sort);
}

export function appliesTo(t: Template, member: Member) {
  if (t.audience === 'candidates') return member.level === 'guest';
  if (t.audience === 'role') return !!member.job_role_id && t.job_role_id === member.job_role_id;
  return member.level !== 'guest' || t.stage === 'before';
}

/** Latest submission for a template, if any. */
export function latestFor(templateId: string, subs: Submission[]) {
  return subs.filter((s) => s.template_id === templateId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
}

// ───────── shared loaders ─────────

export const SUBMISSION_COLS = 'id, member_id, template_id, template_title, template_version, answers, secure_fields, files, signed_name, ip, user_agent, created_at';

export async function loadTrainingFor(member: Member) {
  const [modules, roleModules, progress] = await Promise.all([
    q<Module[]>(supabase.from('ramp_modules').select('*').order('sort')),
    q<RoleModule[]>(supabase.from('ramp_role_modules').select('*')),
    q<Progress[]>(supabase.from('ramp_progress').select('*').eq('member_id', member.id)),
  ]);
  return { modules, roleModules, progress, plan: planFor(member, modules, roleModules, progress) };
}
