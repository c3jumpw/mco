import type { Level, ProgressStatus, TaskStatus, TemplateKind, TemplateStage, Track, BlockType, FieldType } from './types';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const plural = (n: number, word: string, many?: string) => `${n} ${n === 1 ? word : many || word + 's'}`;

export function initials(name: string, fallback = '?') {
  const words = (name || '').replace(/[[\]]/g, '').split(/[\s@._-]+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || fallback);
}

export function displayName(m: { full_name?: string; preferred_name?: string; email?: string } | null | undefined) {
  if (!m) return 'Someone';
  return m.preferred_name?.trim() || m.full_name?.trim() || m.email?.split('@')[0] || 'Someone';
}
export function firstName(m: { full_name?: string; preferred_name?: string; email?: string } | null | undefined) {
  return displayName(m).split(' ')[0]!;
}

// ───────── dates ─────────

const toDate = (d: string | Date) => (typeof d === 'string' ? new Date(d.length === 10 ? d + 'T12:00:00' : d) : d);

export function fmtDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  if (!d) return '';
  const date = toDate(d);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', sameYear ? opts : { ...opts, year: 'numeric' });
}

export function fmtDateTime(d: string | Date | null | undefined, tz?: string) {
  if (!d) return '';
  try {
    return toDate(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: tz || undefined });
  } catch {
    return toDate(d).toLocaleString('en-US');
  }
}

export function fmtTime(d: string | Date) {
  return toDate(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function ago(d: string | Date | null | undefined) {
  if (!d) return 'never';
  const s = (Date.now() - toDate(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(d);
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA');
}

export function daysUntil(dateISO: string | null | undefined) {
  if (!dateISO) return null;
  const a = new Date(todayISO() + 'T12:00:00').getTime();
  const b = new Date(dateISO.slice(0, 10) + 'T12:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

/** “Due today”, “Due tomorrow”, “Due in 3 days”, “2 days overdue”. */
export function dueLabel(dateISO: string | null | undefined) {
  const n = daysUntil(dateISO);
  if (n === null) return '';
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n > 1 && n < 7) return `Due in ${n} days`;
  if (n >= 7) return `Due ${fmtDate(dateISO!)}`;
  return `${plural(-n, 'day')} overdue`;
}

// ───────── device ─────────

export function deviceText(ua: string | null | undefined) {
  if (!ua) return 'Unknown device';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${br}`;
}

// ───────── labels ─────────

export const LEVELS: Record<Level, { rank: number; label: string; who: string; scope: string; backend: boolean }> = {
  owner: { rank: 1, label: 'Owner', who: 'Founders, executives', scope: 'Everything, including system settings, feature switches and the full audit log.', backend: true },
  admin: { rank: 2, label: 'Admin', who: 'HR and operations', scope: 'Set up the organization, invite people, build training and documents, see records and metrics.', backend: true },
  lead: { rank: 3, label: 'Department lead', who: 'Heads of departments', scope: 'Their department only: progress, reviews, assigning tasks and department news.', backend: false },
  mentor: { rank: 4, label: 'Mentor', who: 'Senior staff', scope: 'Their assigned trainees: progress, reviews and the notebook pages shared with them.', backend: false },
  employee: { rank: 5, label: 'Employee', who: 'Graduated team members', scope: 'Continued training, resources, notebooks, chat and their own tasks.', backend: false },
  trainee: { rank: 6, label: 'Trainee', who: 'New hires in training', scope: 'Onboarding, assigned training and documents, notebooks, practice tasks and chat.', backend: false },
  guest: { rank: 7, label: 'Guest', who: 'Contractors, candidates', scope: 'Only the modules, forms and resources shared with guests. Time-limited.', backend: false },
};
export const LEVEL_ORDER: Level[] = ['owner', 'admin', 'lead', 'mentor', 'employee', 'trainee', 'guest'];
export const rankOf = (l: Level | null | undefined) => (l ? LEVELS[l].rank : 99);

export type Tone = 'neutral' | 'brand' | 'good' | 'warn' | 'bad' | 'dark';

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: 'To do', tone: 'neutral' },
  doing: { label: 'In progress', tone: 'brand' },
  review: { label: 'In review', tone: 'warn' },
  done: { label: 'Done', tone: 'good' },
};
export const TASK_ORDER: TaskStatus[] = ['todo', 'doing', 'review', 'done'];

export const PROGRESS_STATUS: Record<ProgressStatus | 'not_started' | 'locked', { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'brand' },
  submitted: { label: 'Waiting for review', tone: 'warn' },
  returned: { label: 'Needs changes', tone: 'bad' },
  completed: { label: 'Completed', tone: 'good' },
  locked: { label: 'Locked', tone: 'neutral' },
};

export const TRACKS: Record<Track, { label: string; desc: string }> = {
  company: { label: 'Company-wide', desc: 'For everyone' },
  role: { label: 'Role track', desc: 'For specific job roles' },
  continued: { label: 'Continued training', desc: 'Ongoing, after graduating' },
};

export const BLOCKS: Record<BlockType, { label: string; desc: string }> = {
  slides: { label: 'Slides', desc: 'Key ideas, one per slide' },
  reading: { label: 'Reading', desc: 'A page of text or an SOP' },
  video: { label: 'Video', desc: 'A link to a video' },
  quiz: { label: 'Quiz', desc: 'Multiple-choice questions' },
  assignment: { label: 'Assignment', desc: 'A written answer to a task' },
  form: { label: 'Form or e-sign', desc: 'Links a document template' },
  practice: { label: 'Platform practice', desc: 'The interactive RAMP sandbox' },
};

export const KINDS: Record<TemplateKind, { label: string; action: string }> = {
  form: { label: 'Form', action: 'Fill out' },
  upload: { label: 'Upload', action: 'Upload' },
  esign: { label: 'E-sign', action: 'Review and sign' },
  checklist: { label: 'Checklist', action: 'Open checklist' },
};
export const STAGES: Record<TemplateStage, { label: string; desc: string }> = {
  before: { label: 'Before start', desc: 'Sent to candidates or guests' },
  onboarding: { label: 'During onboarding', desc: 'Must be done in the welcome flow' },
  first_week: { label: 'First week', desc: 'Added as tasks after onboarding' },
};
export const FIELD_TYPES: Record<FieldType, string> = {
  text: 'Short answer', email: 'Email', phone: 'Phone', date: 'Date', choice: 'Choice', file: 'File upload',
  check: 'Checkbox', sign: 'Signature', secure: 'Sensitive (encrypted)', info: 'Instructions',
};

export const BRAND_COLORS = [
  { c: '#4338CA', name: 'Indigo' },
  { c: '#1D4ED8', name: 'Blue' },
  { c: '#0F766E', name: 'Teal' },
  { c: '#15803D', name: 'Green' },
  { c: '#B45309', name: 'Amber' },
  { c: '#BE185D', name: 'Rose' },
  { c: '#111827', name: 'Ink' },
];

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function slugKey(label: string) {
  return (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'field') + '_' + uid().slice(0, 4);
}
