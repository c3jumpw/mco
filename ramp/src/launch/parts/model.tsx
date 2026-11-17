// Launch plan model: the normalized shape the screens edit, readiness checks, and time helpers.
import type { AgencySettings, LaunchAgendaItem, LaunchData, LaunchFile, LaunchGet, LaunchPlan, LaunchSection, QuickSteps } from '../../lib/types';
import { DAY_NAMES, LAUNCH_SECTIONS, addDays, plural, uid, type Tone } from '../../lib/util';

export type Status = LaunchPlan['status'];
export type Role = LaunchGet['role'];
export type PlacementInfo = LaunchGet['placement'];
export type Value = NonNullable<LaunchData['values']>[number];
export type Project = Omit<NonNullable<LaunchData['projects']>[number], 'objectives'> & { objectives: Steps[] };
export type Checklist = Omit<NonNullable<LaunchData['checklists']>[number], 'items'> & { items: Steps[] };
export type Tool = NonNullable<LaunchData['tools']>[number];
export type Milestone = NonNullable<LaunchData['milestones']>[number];
export type Schedule = NonNullable<LaunchData['schedules']>[number];
export type Period = Schedule['period'];
export type Block = Schedule['blocks'][number];
export type { LaunchFile, LaunchSection };

/** A titled list of quick steps. The id only keeps list rows stable while editing (the JSON column keeps it too). */
export type Steps = QuickSteps & { id: string };
export interface Company { summary: string; public_info: string; admin_info: string; presentation_url: string; files: LaunchFile[] }
/** Day 1 run details, kept inside the plan's data (a free-form JSON column). */
export interface Run { start: string; started_at: string | null; finished_at: string | null }
export interface Data {
  company: Company; values: Value[]; projects: Project[]; checklists: Checklist[]; tools: Tool[];
  milestones: Milestone[]; schedules: Schedule[]; run: Run;
}
/** An agenda row plus run details kept in the agenda JSON: when it was ticked, walkthrough stage, access checks. */
export interface Item extends LaunchAgendaItem { done_at: string | null; stage: number; checks: string[] }
export interface Draft { data: Data; agenda: Item[]; day1: string | null; status: Status }

export type StepId = LaunchSection | 'review';
export const SECTION_IDS = LAUNCH_SECTIONS.map((s) => s.id);
export const STEP_IDS: StepId[] = [...SECTION_IDS, 'review'];
export const sectionOf = (id: LaunchSection) => LAUNCH_SECTIONS.find((s) => s.id === id)!;

export const SECTION_ICON: Record<StepId, string> = {
  company: 'building', values: 'star', projects: 'folder', checklists: 'tasks', tools: 'key', milestones: 'target', schedules: 'calendar', review: 'check',
};

export const PLAN_STATUS: Record<Status, { label: string; tone: Tone; icon: string }> = {
  preparing: { label: 'Being prepared', tone: 'warn', icon: 'pen' },
  ready: { label: 'Ready for Day 1', tone: 'good', icon: 'check' },
  in_progress: { label: 'Day 1 underway', tone: 'brand', icon: 'clock' },
  done: { label: 'Day 1 done', tone: 'good', icon: 'check' },
};

export const PRIORITY: Record<Project['priority'], { label: string; tone: Tone }> = {
  high: { label: 'High priority', tone: 'bad' },
  medium: { label: 'Medium priority', tone: 'warn' },
  low: { label: 'Low priority', tone: 'neutral' },
};
export const SCOPE: Record<Milestone['scope'], { label: string; desc: string }> = {
  individual: { label: 'Individual', desc: 'Their own goal' },
  team: { label: 'Team', desc: 'Shared with the team' },
  company: { label: 'Company', desc: 'A company goal they help reach' },
};
export const PERIODS: { id: Period; label: string; desc: string }[] = [
  { id: 'training', label: 'During training', desc: 'Training probation: lighter days with time to learn.' },
  { id: 'post_training', label: 'After training', desc: 'Still on probation, now doing the full job with check-ins.' },
  { id: 'staff', label: 'As staff', desc: 'After probation: the regular week.' },
];
export const periodOf = (id: Period) => PERIODS.find((p) => p.id === id)!;

/** The three stages of a hands-on walkthrough. */
export const STAGES = [
  { label: 'Show', desc: 'You do it while they watch.' },
  { label: 'Guide', desc: 'They do it while you talk them through it.' },
  { label: 'Supervise', desc: 'They do it on their own while you watch.' },
];
/** What to try during "Test access" (from the owner's Day 1 template). */
export const ACCESS_CHECKS = [
  'Signing in works',
  'Messages send and arrive',
  'Notifications come through',
  'Key pages are bookmarked',
  'Works on their phone',
  'Can find the documentation',
];

// ───────── normalizing what the database hands back ─────────

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return (list as readonly unknown[]).includes(v) ? (v as T) : fallback;
}
const files = (v: unknown): LaunchFile[] => arr<unknown>(v).map(obj).filter((f) => typeof f.path === 'string' && f.path)
  .map((f) => ({ name: str(f.name) || str(f.path).split('/').pop() || 'File', path: str(f.path) }));
const stepsList = (v: unknown): Steps[] => arr<unknown>(v).map(obj)
  .map((s) => ({ id: str(s.id) || uid(), title: str(s.title), steps: arr<unknown>(s.steps).map(str) }));

export function normalizeData(raw: unknown): Data {
  const r = obj(raw);
  const c = obj(r.company);
  const run = obj(r.run);
  const schedules = arr<unknown>(r.schedules).map(obj);
  return {
    company: { summary: str(c.summary), public_info: str(c.public_info), admin_info: str(c.admin_info), presentation_url: str(c.presentation_url), files: files(c.files) },
    values: arr<unknown>(r.values).map(obj).map((v) => ({ id: str(v.id) || uid(), title: str(v.title), practice: str(v.practice) })),
    projects: arr<unknown>(r.projects).map(obj).map((p) => ({
      id: str(p.id) || uid(), name: str(p.name), priority: oneOf(p.priority, ['high', 'medium', 'low'] as const, 'medium'),
      status: str(p.status), progress: clamp(Math.round(Number(p.progress) || 0), 0, 100), challenges: str(p.challenges),
      links: arr<unknown>(p.links).map(str), files: files(p.files), objectives: stepsList(p.objectives),
    })),
    checklists: arr<unknown>(r.checklists).map(obj).map((l) => ({
      id: str(l.id) || uid(), title: str(l.title), frequency: oneOf(l.frequency, ['daily', 'weekly'] as const, 'daily'), items: stepsList(l.items),
    })),
    tools: arr<unknown>(r.tools).map(obj).map((t) => ({
      id: str(t.id) || uid(), name: str(t.name), purpose: str(t.purpose), access_how: str(t.access_how), url: str(t.url), granted: !!t.granted, tested: !!t.tested,
    })),
    milestones: arr<unknown>(r.milestones).map(obj).map((m) => ({
      id: str(m.id) || uid(), title: str(m.title),
      due_day: m.due_day === null || m.due_day === undefined || m.due_day === '' || !Number.isFinite(Number(m.due_day)) ? null : clamp(Math.round(Number(m.due_day)), 0, 3650),
      scope: oneOf(m.scope, ['individual', 'team', 'company'] as const, 'individual'), why: str(m.why), reward: str(m.reward),
    })),
    schedules: PERIODS.map(({ id }) => ({
      period: id,
      blocks: arr<unknown>(schedules.find((s) => s.period === id)?.blocks).map(obj).map((b) => ({
        id: str(b.id) || uid(), days: str(b.days), start: str(b.start), end: str(b.end), focus: str(b.focus),
      })),
    })),
    run: {
      start: /^\d{2}:\d{2}$/.test(str(run.start)) ? str(run.start) : '09:00',
      started_at: str(run.started_at) || null,
      finished_at: str(run.finished_at) || null,
    },
  };
}

export function normalizeAgenda(raw: unknown): Item[] {
  const seen = new Set<string>();
  return arr<unknown>(raw).map(obj).map((x) => {
    let key = str(x.key) || `item_${uid()}`;
    while (seen.has(key)) key = `${key}_${uid().slice(0, 3)}`;
    seen.add(key);
    return {
      key, title: str(x.title), minutes: clamp(Math.round(Number(x.minutes) || 0), 0, 600),
      section: SECTION_IDS.includes(x.section as LaunchSection) ? (x.section as LaunchSection) : null,
      done: !!x.done, notes: str(x.notes), done_at: str(x.done_at) || null,
      stage: clamp(Math.round(Number(x.stage) || 0), 0, 3), checks: arr<unknown>(x.checks).map(str),
    };
  });
}

export function templateAgenda(agency: AgencySettings | null | undefined): Item[] {
  return normalizeAgenda((agency?.launch_agenda || []).map((t) => ({ ...t, done: false, notes: '' })));
}

export function toDraft(got: LaunchGet, agency: AgencySettings | null | undefined): Draft {
  const plan = got.plan;
  const agenda = normalizeAgenda(plan?.agenda);
  return {
    data: normalizeData(plan?.data),
    agenda: plan ? agenda : templateAgenda(agency),
    day1: plan?.day1_date || null,
    status: plan?.status || 'preparing',
  };
}

export const newSteps = (): Steps => ({ id: uid(), title: '', steps: [] });
export const hasSteps = (s: QuickSteps) => s.steps.some((x) => x.trim());

// ───────── readiness ─────────

export interface Gap { section: LaunchSection; text: string; soft?: boolean }
const has = (n: number) => (n === 1 ? 'has' : 'have');
const doesnt = (n: number) => (n === 1 ? 'doesn’t' : 'don’t');

export function hasContent(id: LaunchSection, d: Data): boolean {
  switch (id) {
    case 'company': { const c = d.company; return !!(c.summary.trim() || c.public_info.trim() || c.admin_info.trim() || c.presentation_url.trim() || c.files.length); }
    case 'values': return d.values.length > 0;
    case 'projects': return d.projects.length > 0;
    case 'checklists': return d.checklists.length > 0;
    case 'tools': return d.tools.length > 0;
    case 'milestones': return d.milestones.length > 0;
    case 'schedules': return d.schedules.some((s) => s.blocks.length > 0);
  }
}

export function gapsFor(id: LaunchSection, d: Data): Gap[] {
  const g: Gap[] = [];
  const add = (text: string, soft = false) => g.push({ section: id, text, soft });
  switch (id) {
    case 'company': {
      const c = d.company;
      if (!c.summary.trim()) add('The company intro has no summary yet.');
      if (!c.public_info.trim()) add('The company intro doesn’t say what’s public yet.');
      if (!c.admin_info.trim()) add('The company intro has no inside info for the team yet.');
      break;
    }
    case 'values': {
      if (!d.values.length) { add('No core values yet.'); break; }
      const unnamed = d.values.filter((v) => !v.title.trim()).length;
      if (unnamed) add(`${plural(unnamed, 'value')} ${has(unnamed)} no name.`);
      const n = d.values.filter((v) => !v.practice.trim()).length;
      if (n) add(`${plural(n, 'value')} ${doesnt(n)} say how to practice ${n === 1 ? 'it' : 'them'} daily.`);
      break;
    }
    case 'projects': {
      if (!d.projects.length) { add('No major projects yet.'); break; }
      const unnamed = d.projects.filter((p) => !p.name.trim()).length;
      if (unnamed) add(`${plural(unnamed, 'project')} ${has(unnamed)} no name.`);
      const noStatus = d.projects.filter((p) => !p.status.trim()).length;
      if (noStatus) add(`${plural(noStatus, 'project')} ${has(noStatus)} no status.`);
      d.projects.forEach((p) => {
        if (!p.objectives.length) add(p.name.trim() ? `Project “${p.name.trim()}” has no objectives.` : 'A project without a name has no objectives.');
      });
      const objs = d.projects.flatMap((p) => p.objectives);
      const untitled = objs.filter((o) => !o.title.trim()).length;
      if (untitled) add(`${plural(untitled, 'objective')} ${has(untitled)} no name.`);
      const noSteps = objs.filter((o) => !hasSteps(o)).length;
      if (noSteps) add(`${plural(noSteps, 'objective')} ${has(noSteps)} no quick steps.`);
      break;
    }
    case 'checklists': {
      if (!d.checklists.length) { add('No role checklists yet.'); break; }
      d.checklists.forEach((l) => {
        if (!l.items.length) add(l.title.trim() ? `Checklist “${l.title.trim()}” has no items.` : `A ${l.frequency} checklist has no items.`);
      });
      const items = d.checklists.flatMap((l) => l.items);
      const untitled = items.filter((i) => !i.title.trim()).length;
      if (untitled) add(`${plural(untitled, 'checklist item')} ${has(untitled)} no name.`);
      const noSteps = items.filter((i) => !hasSteps(i)).length;
      if (noSteps) add(`${plural(noSteps, 'checklist item')} ${has(noSteps)} no quick steps.`);
      if (!d.checklists.some((l) => l.frequency === 'daily')) add('There’s no daily checklist yet.', true);
      if (!d.checklists.some((l) => l.frequency === 'weekly')) add('There’s no weekly checklist yet.', true);
      break;
    }
    case 'tools': {
      const n = d.tools.length;
      if (!n) { add('No tools listed yet.'); break; }
      const unnamed = d.tools.filter((t) => !t.name.trim()).length;
      if (unnamed) add(`${plural(unnamed, 'tool')} ${has(unnamed)} no name.`);
      const noHow = d.tools.filter((t) => !t.access_how.trim()).length;
      if (noHow === n) add(n === 1 ? 'The tool has no access instructions.' : 'No tools have access instructions.');
      else if (noHow) add(`${plural(noHow, 'tool')} ${has(noHow)} no access instructions.`);
      const noPurpose = d.tools.filter((t) => !t.purpose.trim()).length;
      if (noPurpose) add(`${plural(noPurpose, 'tool')} ${doesnt(noPurpose)} say what ${noPurpose === 1 ? 'it’s' : 'they’re'} for.`);
      const notGranted = d.tools.filter((t) => !t.granted).length;
      if (notGranted) add(`Access isn’t granted yet for ${plural(notGranted, 'tool')}. You can do it before Day 1 or during it.`, true);
      break;
    }
    case 'milestones': {
      const n = d.milestones.length;
      if (!n) { add('No milestones yet.'); break; }
      const unnamed = d.milestones.filter((m) => !m.title.trim()).length;
      if (unnamed) add(`${plural(unnamed, 'milestone')} ${has(unnamed)} no name.`);
      const noDay = d.milestones.filter((m) => m.due_day === null).length;
      if (noDay === n) add(n === 1 ? 'The milestone has no date.' : 'No milestones have dates.');
      else if (noDay) add(`${plural(noDay, 'milestone')} ${has(noDay)} no date.`);
      const noWhy = d.milestones.filter((m) => !m.why.trim()).length;
      if (noWhy) add(`${plural(noWhy, 'milestone')} ${doesnt(noWhy)} say why ${noWhy === 1 ? 'it matters' : 'they matter'}.`);
      const noReward = d.milestones.filter((m) => !m.reward.trim()).length;
      if (noReward) add(`${plural(noReward, 'milestone')} ${doesnt(noReward)} say the reward or result.`);
      break;
    }
    case 'schedules': {
      const all = d.schedules.flatMap((s) => s.blocks);
      if (!all.length) { add('No time-block schedules yet.'); break; }
      d.schedules.forEach((s) => { if (!s.blocks.length) add(`The “${periodOf(s.period).label}” schedule is empty.`); });
      const missing = all.filter((b) => !parseDays(b.days).length || !b.start || !b.end || !b.focus.trim()).length;
      if (missing) add(`${plural(missing, 'time-block')} ${missing === 1 ? 'is' : 'are'} missing days, times or a focus.`);
      const backwards = all.filter((b) => b.start && b.end && toMin(b.end) <= toMin(b.start)).length;
      if (backwards) add(`${plural(backwards, 'time-block')} ${backwards === 1 ? 'ends before it starts' : 'end before they start'}.`);
      break;
    }
  }
  return g;
}

export type SectionState = 'empty' | 'started' | 'complete';
export function sectionState(id: LaunchSection, d: Data): SectionState {
  if (!hasContent(id, d)) return 'empty';
  return gapsFor(id, d).some((g) => !g.soft) ? 'started' : 'complete';
}

/** Share of the plan that's filled in: a section counts fully when it has no gaps, half when started. */
export function readiness(d: Data) {
  const states = Object.fromEntries(SECTION_IDS.map((id) => [id, sectionState(id, d)])) as Record<LaunchSection, SectionState>;
  const score = SECTION_IDS.reduce((s, id) => s + (states[id] === 'complete' ? 1 : states[id] === 'started' ? 0.5 : 0), 0);
  const gaps = SECTION_IDS.flatMap((id) => gapsFor(id, d));
  return { states, pct: Math.round((score / SECTION_IDS.length) * 100), gaps: gaps.filter((g) => !g.soft), notes: gaps.filter((g) => g.soft) };
}

// ───────── agenda ─────────

export const isWalk = (i: Pick<Item, 'key' | 'title'>) => i.key.startsWith('walk') || /walkthrough/i.test(i.title);
/** Walkthroughs A and B use the first and second project. */
export function walkProject(i: Pick<Item, 'key' | 'title'>): number | null {
  if (i.key === 'walk_a' || /project a\b/i.test(i.title)) return 0;
  if (i.key === 'walk_b' || /project b\b/i.test(i.title)) return 1;
  return null;
}
export const isAccessTest = (i: Pick<Item, 'key'>) => i.key === 'test_access';

/** Start minute (from midnight) of every item, given the day's start time. */
export function schedule(agenda: Item[], start: string) {
  const first = Number.isNaN(toMin(start)) ? 9 * 60 : toMin(start);
  let t = first;
  const at = agenda.map((i) => { const s = t; t += i.minutes; return s; });
  return { first, at, end: t, total: t - first };
}

// ───────── times and days ─────────

export function toMin(hm: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
const pad = (n: number) => String(n).padStart(2, '0');
/** 570 → "9:30 AM" */
export function fmtClock(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}
/** 540 → "9 AM", 570 → "9:30" */
export function fmtHour(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h % 12 || 12}:${pad(m % 60)}` : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}
/** 250 → "4 h 10 min" */
export function fmtDur(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}
/** Milliseconds → "12:05" or "1:02:05" */
export function fmtTimer(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function validTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
export const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function offsetMin(at: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - at) / 60000;
}
/** The instant that a wall-clock date and time in a time zone stands for. */
export function zonedInstant(dateISO: string, hm: string, tz: string) {
  const [y, mo, d] = dateISO.slice(0, 10).split('-').map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, Math.floor(toMin(hm) / 60), toMin(hm) % 60);
  const off = offsetMin(guess, tz);
  let t = guess - off * 60000;
  const off2 = offsetMin(t, tz);
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t);
}
/** "EST", or "GMT+8" where there's no short name. */
export function tzShort(tz: string, at: Date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}
export const tzPlace = (tz: string) => (tz.split('/').pop() || tz).replace(/_/g, ' ');
export const sameOffset = (a: string, b: string, at: Date) => offsetMin(at.getTime(), a) === offsetMin(at.getTime(), b);

const DAY_ALIAS: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};
/** "Mon–Fri", "Mon, Wed", "weekdays", "every day" → day indexes, Monday = 0. */
export function parseDays(text: string): number[] {
  const t = (text || '').toLowerCase().trim();
  if (!t) return [];
  if (/every ?day|daily|all week/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  if (/weekdays?/.test(t)) [0, 1, 2, 3, 4].forEach((d) => out.add(d));
  if (/weekends?/.test(t)) [5, 6].forEach((d) => out.add(d));
  for (const part of t.split(/,|\/|&|\+|\band\b/)) {
    const ends = part.split(/\s*(?:-|–|—|\bto\b|\bthrough\b|\bthru\b)\s*/).map((x) => x.trim().replace(/\.$/, '')).filter(Boolean);
    const a = DAY_ALIAS[ends[0] || ''], b = DAY_ALIAS[ends[1] || ''];
    if (ends.length === 2 && a !== undefined && b !== undefined) {
      for (let i = a, n = 0; n < 7; i = (i + 1) % 7, n++) { out.add(i); if (i === b) break; }
    } else {
      ends.forEach((w) => { const v = DAY_ALIAS[w]; if (v !== undefined) out.add(v); });
    }
  }
  return [...out].sort((x, y) => x - y);
}
/** [0,1,2,3,4] → "Mon–Fri" */
export function daysText(days: number[]) {
  const s = [...new Set(days)].sort((a, b) => a - b);
  if (!s.length) return '';
  if (s.length === 7) return 'Every day';
  const runs: number[][] = [];
  for (const d of s) {
    const last = runs[runs.length - 1];
    if (last && d === last[last.length - 1]! + 1) last.push(d); else runs.push([d]);
  }
  return runs.map((r) => (r.length >= 3 ? `${DAY_NAMES[r[0]!]}–${DAY_NAMES[r[r.length - 1]!]}` : r.map((i) => DAY_NAMES[i]).join(', '))).join(', ');
}

/** Day N after the start date, as a date, when the placement has one. */
export const milestoneDate = (start: string | null, day: number | null) => (start && day !== null ? addDays(start, day) : null);

// ───────── starters for people with nothing on paper ─────────

export const STARTER_MILESTONES: Omit<Milestone, 'id'>[] = [
  { title: 'Follows the daily checklist with help', due_day: 7, scope: 'individual', why: 'Shows they know the routine and where everything lives.', reward: 'First check-in and feedback' },
  { title: 'Runs the daily checklist on their own', due_day: 30, scope: 'individual', why: 'Frees up your time every single day.', reward: 'More ownership of day-to-day work' },
  { title: 'Owns a piece of a major project', due_day: 60, scope: 'team', why: 'Moves the team’s biggest goals forward.', reward: 'End of probation review' },
  { title: 'Ready for promotion review', due_day: 90, scope: 'company', why: 'Consistent, trusted work across the role.', reward: 'Promotion review and a higher tier' },
];
export const STARTER_WEEK: Record<Period, Omit<Block, 'id'>[]> = {
  training: [
    { days: 'Mon–Fri', start: '09:00', end: '10:00', focus: 'Inbox and messages' },
    { days: 'Mon–Fri', start: '10:00', end: '12:00', focus: 'Training and walkthroughs' },
    { days: 'Mon–Fri', start: '13:00', end: '15:00', focus: 'Practice with supervision' },
    { days: 'Mon–Fri', start: '15:00', end: '16:00', focus: 'Checklist review and questions' },
  ],
  post_training: [
    { days: 'Mon–Fri', start: '09:00', end: '10:00', focus: 'Inbox and messages' },
    { days: 'Mon–Fri', start: '10:00', end: '12:00', focus: 'Daily checklist' },
    { days: 'Mon–Fri', start: '13:00', end: '16:00', focus: 'Project work' },
    { days: 'Fri', start: '16:00', end: '17:00', focus: 'Weekly review with your lead' },
  ],
  staff: [
    { days: 'Mon–Fri', start: '09:00', end: '09:30', focus: 'Inbox and messages' },
    { days: 'Mon–Fri', start: '09:30', end: '12:00', focus: 'Deep work on projects' },
    { days: 'Mon–Fri', start: '13:00', end: '15:00', focus: 'Daily checklist' },
    { days: 'Mon, Wed, Fri', start: '15:00', end: '16:00', focus: 'Team calls and follow-ups' },
  ],
};

export const COMMON_TOOLS = ['Google Workspace', 'Microsoft 365', 'Slack', 'Microsoft Teams', 'Zoom', 'Asana', 'ClickUp', 'Trello', 'Notion', '1Password', 'LastPass', 'HubSpot', 'QuickBooks', 'Canva'];
