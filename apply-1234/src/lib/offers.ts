// Offer letters in the app. The wording rules live in the hiring-offer function's offer.ts and are
// shared here, so the preview is exactly what the candidate signs.
import { supabase } from './supabase';
import { DEFAULT_LETTER, DEFAULT_TERMS, type OfferEvent, type OfferFields, type OfferFile } from '../../supabase/functions/hiring-offer/offer';
export * from '../../supabase/functions/hiring-offer/offer';

export const TEAM_BUCKET = 'hiring-team';

export const slugName = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'file';

/** A short-lived link to a file in the hiring team's private storage. */
export async function teamFileLink(path: string, download?: string) {
  const { data, error } = await supabase.storage.from(TEAM_BUCKET).createSignedUrl(path, 600, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export type OfferStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'withdrawn';
export interface Offer {
  id: string; application_id: string; job_id: string; status: OfferStatus;
  fields: OfferFields; letter: string; terms: string; attachments: OfferFile[];
  token: string | null; final_letter: string | null; final_terms: string | null; doc_hash: string | null;
  expires_at: string | null; sent_at: string | null; sent_by: string | null; sent_meta: { ip?: string; ua?: string } | null;
  viewed_at: string | null; views: number; signed_at: string | null; signer_name: string | null;
  signature: { kind: 'drawn' | 'typed'; path?: string; text?: string } | null;
  signer_meta: { ip?: string; ua?: string; tz?: string } | null;
  declined_at: string | null; decline_reason: string | null; withdrawn_at: string | null;
  pdf_path: string | null; events: OfferEvent[]; created_by: string; created_at: string; updated_at: string;
}

/** What the candidate's page receives from the function. */
export interface PublicOffer {
  id: string; status: OfferStatus; expired: boolean; company: string; company_address: string; position: string;
  summary: { position: string; employment_type: string; start_date: string; pay: string; pay_schedule: string; schedule: string; location: string; expires: string };
  manager: { name: string; title: string; email: string; phone: string };
  candidate: { name: string; email: string };
  letter: string; terms: string; attachments: { id: number; name: string; size: number | null; type: string }[];
  sent_at: string | null; signed_at: string | null; signer_name: string | null; declined_at: string | null;
  signature_kind: 'drawn' | 'typed' | null; pdf: boolean; doc_hash: string | null;
  messages: PublicChat[];
}

/** A message as the candidate sees it. */
export interface PublicChat { id: string; from: 'you' | 'team'; name: string; body: string; at: string }

/** A message as the hiring team sees it (hiring_chat). */
export interface ChatRow {
  id: string; application_id: string; job_id: string; offer_id: string | null; sender: 'candidate' | 'team';
  author_email: string; author_name: string; body: string; meta: { ip?: string; ua?: string }; emailed: string[];
  read_at: string | null; read_by: string | null; created_at: string;
}

export const OFFER_STATUS: Record<OfferStatus, { label: string; tone: 'neutral' | 'accent' | 'good' | 'warn' | 'bad' }> = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Sent', tone: 'accent' }, viewed: { label: 'Opened', tone: 'accent' },
  signed: { label: 'Signed', tone: 'good' }, declined: { label: 'Declined', tone: 'bad' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

/** Calls the hiring-offer function. Signed-in users send their login with it automatically. */
export async function offerCall<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T & { ok: boolean; error?: string; missing?: string[] }> {
  const { data, error } = await supabase.functions.invoke('hiring-offer', { body });
  if (data) return data as T & { ok: boolean };
  // Errors come back with a JSON body too; read it when there is one.
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    const j = await ctx.json().catch(() => null);
    if (j) return j as T & { ok: boolean };
  }
  return { ok: false, error: 'network' } as T & { ok: boolean; error: string };
}

export const OFFER_ERRORS: Record<string, string> = {
  network: 'We couldn’t reach the server. Check your connection and try again.',
  not_found: 'This offer link isn’t valid. Check that you copied the whole link from the email.',
  expired: 'This offer has expired. Contact the hiring manager if you’d still like to accept.',
  already_signed: 'This offer has already been signed.',
  not_open: 'This offer is no longer open.',
  consent: 'Please tick both boxes to sign.',
  name: 'Please type your full name.',
  signature: 'Please draw or type your signature.',
  sign_in: 'Your session has ended. Sign in again.',
  not_allowed: 'You don’t have access to send offers for this job.',
  already_sent: 'This offer has already been sent.',
  not_signed: 'This offer hasn’t been signed yet.',
  empty: 'Write a message first.',
  too_many: 'That’s a lot of messages for one day. Please wait for a reply.',
  not_sent: 'Send the offer first. Messages work through the candidate’s offer page.',
  server: 'Something went wrong on our side. Try again in a moment.',
};
export const offerError = (code?: string) => OFFER_ERRORS[code || ''] || OFFER_ERRORS.server;

/** Defaults an offer starts from. Company-wide ones live in hiring_company; each job can override them
 *  in settings.offer_defaults. `pay_amount` on a job is its internal starting pay (never shown publicly). */
export type OfferDefaults = Omit<OfferFields, 'cc' | 'start_date' | 'expires'> & {
  letter?: string; terms?: string; attachments?: OfferFile[]; sign_days?: number;
};

const isSet = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null);
const setOnly = <T extends object>(o?: T | null) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => isSet(v))) as Partial<T>;

/** Company defaults with the job's own choices on top. Attachments from both are used. */
export function mergeDefaults(company?: OfferDefaults | null, job?: OfferDefaults | null): OfferDefaults {
  const atts = [...(company?.attachments || []), ...(job?.attachments || [])];
  const seen = new Set<string>();
  return { ...setOnly(company), ...setOnly(job), attachments: atts.filter((a) => !seen.has(a.path) && !!seen.add(a.path)) };
}

export async function loadCompanyDefaults(): Promise<OfferDefaults> {
  const { data } = await supabase.from('hiring_company').select('offer_defaults').maybeSingle();
  return ((data as { offer_defaults?: OfferDefaults } | null)?.offer_defaults) || {};
}

export async function saveCompanyDefaults(d: OfferDefaults) {
  const { error } = await supabase.from('hiring_company').update({ offer_defaults: d }).eq('id', true);
  return error;
}

const plusDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

/** Pre-fills a new offer: company defaults, then the job's offer details, then what the posting says. */
export function offerDefaults(job: { title: string; posting: string; settings?: { offer_defaults?: OfferDefaults } }, company?: OfferDefaults | null) {
  const { letter, terms, attachments, sign_days, ...saved } = mergeDefaults(company, job.settings?.offer_defaults);
  const line = (label: string) => (job.posting.match(new RegExp(`^\\s*[-*]\\s*\\**${label}\\**\\s*:\\s*(.+)$`, 'im'))?.[1] || '').replace(/\*\*/g, '').trim();
  const fromPosting = (label: string) => { const v = line(label); return /^\[|\btbd\b|to be (decided|confirmed)/i.test(v) ? '' : v; };
  const fields: OfferFields = {
    pay_currency: 'USD', pay_period: 'per hour',
    ...saved,
    position: job.title,
    location: saved.location || fromPosting('Location'),
    schedule: saved.schedule || fromPosting('Schedule') || fromPosting('Hours'),
    start_date: '', expires: plusDays(Number(sign_days) > 0 ? Number(sign_days) : 7), pay_amount: saved.pay_amount || '',
  };
  return { fields, letter: letter || DEFAULT_LETTER, terms: terms || DEFAULT_TERMS, attachments: attachments || [] };
}

/** What to save as the job's offer details after sending: only what differs from the company defaults,
 *  and nothing specific to this person. The job's starting pay is kept. */
export function defaultsToKeep(f: OfferFields, letter: string, terms: string, attachments: OfferFile[], company: OfferDefaults, job: OfferDefaults): OfferDefaults {
  const { start_date: _s, expires: _e, pay_amount: _p, position: _pos, cc: _cc, ...rest } = f;
  const keep: OfferDefaults = { ...job };
  for (const [k, v] of Object.entries(rest) as [keyof OfferDefaults, string][]) {
    if ((v || '') === ((company as Record<string, unknown>)[k] || '')) delete keep[k]; else (keep as Record<string, unknown>)[k] = v;
  }
  if (letter === (company.letter || DEFAULT_LETTER)) delete keep.letter; else keep.letter = letter;
  if (terms === (company.terms || DEFAULT_TERMS)) delete keep.terms; else keep.terms = terms;
  const companyPaths = new Set((company.attachments || []).map((a) => a.path));
  const own = attachments.filter((a) => !companyPaths.has(a.path));
  if (own.length) keep.attachments = own; else delete keep.attachments;
  return keep;
}
