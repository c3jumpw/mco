import { supabase } from './supabase';

export const UPLOAD_BUCKET = 'hiring-uploads';
export const MAX_UPLOAD = 5 * 1024 * 1024;
export const ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.txt';

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
};

export interface UploadedFile { kind: 'resume' | 'cover_letter'; path: string; name: string; size: number }

export function fileProblem(f: File): string | null {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!TYPES[ext]) return 'Please choose a PDF or Word document.';
  if (f.size > MAX_UPLOAD) return 'That file is over 5 MB. Please choose a smaller one.';
  if (f.size === 0) return 'That file is empty.';
  return null;
}

export function fmtSize(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Uploads into <job>/<visitor>/<time>-<name>, the only place the storage rules allow. */
export async function uploadFile(jobId: string, visitor: string, kind: UploadedFile['kind'], f: File): Promise<UploadedFile> {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const base = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || kind;
  const path = `${jobId}/${visitor}/${Date.now().toString(36)}-${kind}-${base}.${ext}`;
  const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, f, { contentType: TYPES[ext], upsert: false });
  if (error) throw error;
  return { kind, path, name: f.name.slice(0, 200), size: f.size };
}

/** Short-lived link an admin can open. */
export async function fileLink(path: string, download?: string) {
  const { data, error } = await supabase.storage.from(UPLOAD_BUCKET).createSignedUrl(path, 600, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/** Fire-and-forget: tells the email function about a new submission or help message. */
export async function notify(body: { application_id?: string; message_id?: string; visitor_id: string }) {
  try {
    const { data } = await supabase.functions.invoke('hiring-notify', { body });
    return data as { ok: boolean; results?: { candidate?: { ok: boolean } }; error?: string } | null;
  } catch {
    return null;
  }
}

export function browserLabel(ua = navigator.userAgent) {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return `${b}${os ? ` on ${os}` : ''}`;
}
