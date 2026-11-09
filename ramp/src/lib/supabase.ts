import { createClient } from '@supabase/supabase-js';

// Public values: the publishable key only allows what the database's row-level security permits.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://symbmscaajjmgywbifhv.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_IUie6Hv_qAJs2pBkYEqbzw_gUAxoSgz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ramp-auth' },
});

export const FILES_BUCKET = 'ramp-files';

/** Turn a Supabase/Postgres error into a sentence a person can act on. */
export function errText(e: unknown): string {
  if (!e) return 'Something went wrong. Try again.';
  const msg = typeof e === 'string' ? e : (e as { message?: string }).message || '';
  if (/JWT|session/i.test(msg)) return 'Your session ended. Sign in again.';
  if (/duplicate key/i.test(msg)) return 'That already exists.';
  if (/row-level security|permission denied/i.test(msg)) return 'You don’t have permission to do that.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'You seem to be offline. Check your connection and try again.';
  return msg || 'Something went wrong. Try again.';
}

/** Upload a file into the signed-in member's own folder and return its storage path. */
export async function uploadFile(memberId: string, file: File, folder = 'files'): Promise<string> {
  const clean = file.name.replace(/[^\w.\-]+/g, '-').slice(-80) || 'file';
  const path = `${memberId}/${folder}/${crypto.randomUUID()}-${clean}`;
  const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

/** A short-lived link for opening a private file. */
export async function fileUrl(path: string, seconds = 120): Promise<string> {
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Open a private file in a new tab. The tab is opened right away (so phones don't block it as a pop-up),
 * then pointed at a short-lived signed link. Pass `log` to record the view in the audit log.
 */
export async function openFile(path: string, log?: { member: string | null; detail: string }) {
  const w = window.open('', '_blank');
  try {
    const url = await fileUrl(path);
    if (w) w.location.href = url;
    else window.location.href = url;
    if (log) supabase.rpc('ramp_log', { p_action: 'opened file', p_member: log.member, p_detail: log.detail }).then(() => {});
  } catch (e) {
    w?.close();
    throw e;
  }
}
