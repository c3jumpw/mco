// Offer letters in the app. The wording rules live in the hiring-offer function's offer.ts and are
// shared here, so the preview is exactly what the candidate signs.
import { supabase } from './supabase';
import { DEFAULT_LETTER, DEFAULT_TERMS, type OfferEvent, type OfferFields, type OfferFile } from '../../supabase/functions/hiring-offer/offer';
export * from '../../supabase/functions/hiring-offer/offer';

export const TEAM_BUCKET = 'hiring-team';

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
  server: 'Something went wrong on our side. Try again in a moment.',
};
export const offerError = (code?: string) => OFFER_ERRORS[code || ''] || OFFER_ERRORS.server;

/** Pre-fills a new offer from the job and whatever was remembered from its last offer. */
export function offerDefaults(job: { title: string; posting: string; settings?: { offer_defaults?: OfferFields & { letter?: string; terms?: string } } }) {
  const { letter, terms, ...saved } = job.settings?.offer_defaults || {};
  const line = (label: string) => (job.posting.match(new RegExp(`^\\s*[-*]\\s*\\**${label}\\**\\s*:\\s*(.+)$`, 'im'))?.[1] || '').replace(/\*\*/g, '').trim();
  const fromPosting = (label: string) => { const v = line(label); return /^\[|\btbd\b|to be (decided|confirmed)/i.test(v) ? '' : v; };
  const plus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const fields: OfferFields = {
    pay_currency: 'USD', pay_period: 'per hour',
    ...saved,
    position: job.title,
    location: saved.location || fromPosting('Location'),
    schedule: saved.schedule || fromPosting('Schedule') || fromPosting('Hours'),
    start_date: '', expires: plus(7), pay_amount: '',
  };
  return { fields, letter: letter || DEFAULT_LETTER, terms: terms ?? DEFAULT_TERMS };
}

/** What to remember on the job for its next offer: everything except what's specific to this person. */
export function defaultsToKeep(f: OfferFields, letter: string, terms: string) {
  const { start_date: _s, expires: _e, pay_amount: _p, position: _pos, ...keep } = f;
  return { ...keep, letter, terms };
}
