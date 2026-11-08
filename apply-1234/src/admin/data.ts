import { supabase, DEFAULT_DOMAIN } from '../lib/supabase';
import type { Activity, Application, Dashboard, HEvent, HMessage, Job, JobStats, Note, Review, Template } from '../lib/types';
import { DEFAULT_POSTING, fullUrl, splitUrl } from '../lib/posting';
import { randomCode, sourceCode, uid } from '../lib/util';

export const DEFAULT_ACTIVITY: Activity = {
  headline: 'You found it.',
  intro: 'Getting here meant reading the whole posting and piecing the link together. That is exactly the kind of attention this role needs. The rest of this activity takes about 20–30 minutes.',
  loom_steps: 'Create a free account at loom.com and install the desktop app or Chrome extension.\nFor each question below, record a short video answer with your camera on.\nWhen you finish a recording, click “Copy link” in Loom and paste the share link into the matching box.',
  answer_min: 60,
  answer_max: 180,
  extra: '',
  require_transcript: false,
  hidden_code: '',
  consent_text: 'I agree that my answers and videos may be stored and reviewed by the hiring team for this role, including with the help of AI tools, and that I can ask for them to be deleted at any time.',
  accommodations_email: '',
};

export const DEFAULT_SETTINGS = {
  invite_subject: 'Next step: interview for {role}',
  invite_body: 'Hi {first},\n\nThank you for completing the application activity for the {role} role. We enjoyed your answers and would like to invite you to an interview.\n\nPlease pick a time that works for you here: {link}\n\nLooking forward to talking,\n',
  reject_subject: 'Your application for {role}',
  reject_body: 'Hi {first},\n\nThank you for taking the time to complete the application activity for the {role} role. We had many strong submissions, and we’ve decided not to move forward with your application this time.\n\nWe appreciate the effort you put in and wish you the best in your search.\n',
};

export const DEFAULT_CONFIRM = {
  confirm_subject: 'We got your answers for {role}',
  confirm_body: 'Hi {first},\n\nThanks for completing the activity for the {role} role. Your video answers came through, and a person on our team will watch every one.\n\nWhat happens next: if your answers are a good fit, we\'ll email you to set up a short interview. Either way, we\'ll let you know.\n\nYou don\'t need to do anything else. If something went wrong with your submission, just reply to this email.\n',
};

export async function getDashboard(days: number): Promise<Dashboard | null> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const { data, error } = await supabase.rpc('hiring_dashboard', { p_days: days, p_tz: tz });
  if (error) throw error;
  return data as Dashboard | null;
}

export async function listMessages(): Promise<HMessage[]> {
  const { data, error } = await supabase.from('hiring_messages').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data || []) as HMessage[];
}

export async function updateMessage(id: string, patch: Partial<HMessage>) {
  const { error } = await supabase.from('hiring_messages').update(patch).eq('id', id);
  if (error) throw error;
}

export async function unreadMessages(): Promise<number> {
  const { count } = await supabase.from('hiring_messages').select('id', { count: 'exact', head: true }).eq('status', 'new');
  return count || 0;
}

export function fillTemplate(t: string, vars: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export async function listJobs(): Promise<Job[]> {
  const { data, error } = await supabase.from('hiring_jobs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Job[];
}

export async function jobStats(): Promise<Record<string, JobStats>> {
  const { data } = await supabase.rpc('hiring_job_stats');
  const out: Record<string, JobStats> = {};
  for (const r of (data || []) as JobStats[]) out[r.job_id] = r;
  return out;
}

export async function getJob(id: string): Promise<Job | null> {
  const { data } = await supabase.from('hiring_jobs').select('*').eq('id', id).maybeSingle();
  return (data as Job) || null;
}

const RESERVED = ['admin', 'api', 'assets', 'p', 'login', 'index', 'favicon', 'robots', 'new'];

/** Every address already in use: each job's main link and each job-board variant. */
export async function takenLinks(excludeJobId?: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('hiring_jobs').select('id, title, slug, sources');
  const taken = new Map<string, string>();
  for (const j of (data || []) as Pick<Job, 'id' | 'title' | 'slug' | 'sources'>[]) {
    if (j.id === excludeJobId || !j.slug) continue;
    taken.set(j.slug, `“${j.title}” already uses this link.`);
    for (const s of j.sources || []) taken.set(`${j.slug}-${s.code}`, `This matches the ${s.label} link of “${j.title}”.`);
  }
  return taken;
}

/** Returns why a link can't be used, or null if it's free. */
export function linkProblem(slug: string, taken: Map<string, string>, ownSources: { code: string }[] = []): string | null {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(slug)) return 'Use lowercase letters, numbers and dashes (at least 3 characters).';
  if (RESERVED.includes(slug)) return 'That word is reserved by the site.';
  if (taken.has(slug)) return taken.get(slug)!;
  for (const s of ownSources) if (taken.has(`${slug}-${s.code}`)) return `This job's board link “${slug}-${s.code}” would match another job.`;
  for (const k of taken.keys()) if (k.startsWith(slug + '-') && k.length - slug.length <= 4) return `Too close to an existing link (${k}). Pick another.`;
  return null;
}

export function freeCode(taken: Map<string, string>): string {
  for (let i = 0; i < 50; i++) {
    const c = randomCode();
    if (!linkProblem(c, taken)) return c;
  }
  return randomCode() + sourceCode();
}

export function freeSourceCode(slug: string, existing: { code: string }[], taken: Map<string, string>): string {
  for (let i = 0; i < 50; i++) {
    const c = sourceCode();
    if (!existing.some((x) => x.code === c) && !taken.has(`${slug}-${c}`)) return c;
  }
  return sourceCode() + sourceCode();
}

export async function createJob(opts: { title?: string; from?: Job | null; activity?: Activity | null } = {}): Promise<Job> {
  const slug = freeCode(await takenLinks());
  const domain = opts.from?.domain || DEFAULT_DOMAIN;
  const fragments = splitUrl(fullUrl(domain, slug), 3).map((text) => ({ text }));
  const base: Partial<Job> = opts.from
    ? {
        title: `${opts.from.title} (copy)`,
        notes: opts.from.notes,
        posting: opts.from.posting,
        domain,
        hint_format: opts.from.hint_format,
        activity: opts.from.activity,
        questions: opts.from.questions,
        interview_questions: opts.from.interview_questions,
        rubric: opts.from.rubric,
        booking_url: opts.from.booking_url,
        settings: opts.from.settings,
      }
    : {
        title: opts.title || 'New role',
        posting: DEFAULT_POSTING,
        activity: opts.activity || DEFAULT_ACTIVITY,
        questions: [],
        interview_questions: [],
        settings: DEFAULT_SETTINGS,
      };
  // Fragment count follows the copied job's count when duplicating.
  const parts = opts.from?.fragments?.length || 3;
  const { data, error } = await supabase
    .from('hiring_jobs')
    .insert({ ...base, slug, fragments: parts === 3 ? fragments : splitUrl(fullUrl(domain, slug), parts).map((text) => ({ text })) })
    .select('*')
    .single();
  if (error) throw error;
  return data as Job;
}

export interface NewJobInput {
  title: string;
  notes: string;
  posting: string;
  domain: string;
  slug: string;
  parts: number;
  hint_format: string;
  activity: Activity;
  questions: { text: string; guidance?: string }[];
  interview: { text: string; kind: 'general' | 'custom' }[];
  rubric: string[];
}

export async function createJobFromWizard(i: NewJobInput): Promise<Job> {
  const fragments = splitUrl(fullUrl(i.domain, i.slug), i.parts).map((text) => ({ text }));
  const { data, error } = await supabase
    .from('hiring_jobs')
    .insert({
      title: i.title.trim() || 'New role',
      status: 'draft',
      notes: i.notes,
      posting: i.posting,
      domain: i.domain,
      slug: i.slug,
      fragments,
      hint_format: i.hint_format,
      activity: i.activity,
      questions: i.questions.map((q) => ({ id: uid('q'), text: q.text, guidance: q.guidance || '' })),
      interview_questions: i.interview.map((q) => ({ id: uid('q'), text: q.text, kind: q.kind })),
      ...(i.rubric.length ? { rubric: i.rubric } : {}),
      settings: DEFAULT_SETTINGS,
    })
    .select('*')
    .single();
  if (error) throw error;
  const job = data as Job;
  if (i.posting.trim()) {
    await supabase.from('hiring_posting_versions').insert({ job_id: job.id, label: 'AI draft from notes', posting: i.posting });
  }
  return job;
}

export async function updateJob(id: string, patch: Partial<Job>) {
  const { error } = await supabase.from('hiring_jobs').update(patch).eq('id', id);
  return error;
}

export async function deleteJob(id: string) {
  return supabase.from('hiring_jobs').delete().eq('id', id);
}

export async function listApplications(jobId?: string): Promise<Application[]> {
  let q = supabase.from('hiring_applications').select('*').order('submitted_at', { ascending: false });
  if (jobId) q = q.eq('job_id', jobId);
  const { data } = await q;
  return (data || []) as Application[];
}

export async function getApplication(id: string): Promise<Application | null> {
  const { data } = await supabase.from('hiring_applications').select('*').eq('id', id).maybeSingle();
  return (data as Application) || null;
}

export async function updateApplication(id: string, patch: Partial<Application>) {
  const { error } = await supabase.from('hiring_applications').update(patch).eq('id', id);
  return error;
}

export async function reviewsFor(appIds: string[]): Promise<Review[]> {
  if (!appIds.length) return [];
  const { data } = await supabase.from('hiring_reviews').select('*').in('application_id', appIds);
  return (data || []) as Review[];
}

export async function notesFor(appIds: string[]): Promise<Note[]> {
  if (!appIds.length) return [];
  const { data } = await supabase.from('hiring_notes').select('*').in('application_id', appIds).order('created_at');
  return (data || []) as Note[];
}

export async function eventsFor(appIds: string[]): Promise<HEvent[]> {
  if (!appIds.length) return [];
  const out: HEvent[] = [];
  for (let i = 0; i < appIds.length; i += 50) {
    const { data } = await supabase.from('hiring_events').select('*').in('application_id', appIds.slice(i, i + 50)).order('created_at').limit(5000);
    out.push(...((data || []) as HEvent[]));
  }
  return out;
}

export async function listTemplates(kind?: Template['kind']): Promise<Template[]> {
  let q = supabase.from('hiring_templates').select('*').order('created_at', { ascending: false });
  if (kind) q = q.eq('kind', kind);
  const { data } = await q;
  return (data || []) as Template[];
}

export async function saveTemplate(kind: Template['kind'], name: string, content: unknown) {
  return supabase.from('hiring_templates').insert({ kind, name, content });
}

export function groupBy<T>(rows: T[], key: (r: T) => string | null | undefined): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    (out[k] ||= []).push(r);
  }
  return out;
}

export const newQuestionId = () => uid('q');
