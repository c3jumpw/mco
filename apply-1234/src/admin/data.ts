import { supabase, DEFAULT_DOMAIN } from '../lib/supabase';
import type { Activity, Application, HEvent, Job, JobStats, Note, Review, Template } from '../lib/types';
import { DEFAULT_POSTING, fullUrl, splitUrl } from '../lib/posting';
import { randomSlug, uid } from '../lib/util';

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

export async function createJob(opts: { title?: string; from?: Job | null; activity?: Activity | null } = {}): Promise<Job> {
  const slug = randomSlug();
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
