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

// ── Files for activity steps: work samples, deliverables, voice notes ──
export const MAX_STEP_UPLOAD = 10 * 1024 * 1024;
const STEP_TYPES_MIME: Record<string, string> = {
  ...TYPES,
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
  webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac',
};
export const STEP_ACCEPT = '.pdf,.doc,.docx,.pptx,.xlsx,.csv,.odt,.rtf,.txt,.png,.jpg,.jpeg,.webp,.gif,.heic';
export const AUDIO_ACCEPT = '.webm,.ogg,.m4a,.mp3,.wav,.aac,audio/*';

export function stepFileProblem(f: File, audio = false): string | null {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const mime = STEP_TYPES_MIME[ext];
  if (!mime || (audio && !mime.startsWith('audio/'))) {
    return audio ? 'Please choose an audio file (m4a, mp3, wav, webm or ogg).' : 'Please choose a PDF, Word, PowerPoint, Excel, CSV or image file.';
  }
  if (f.size > MAX_STEP_UPLOAD) return 'That file is over 10 MB. Share a link to it instead.';
  if (f.size === 0) return 'That file is empty.';
  return null;
}

/** Uploads a step file into the candidate's folder. `blob` recordings pass their own type. */
export async function uploadStepFile(jobId: string, visitor: string, stepId: string, f: File | Blob, name: string, type?: string) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const base = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'file';
  const sid = stepId.replace(/[^a-z0-9]/gi, '').slice(0, 20);
  const path = `${jobId}/${visitor}/${Date.now().toString(36)}-${sid}-${base}.${ext}`;
  const contentType = (type || STEP_TYPES_MIME[ext] || '').split(';')[0];
  const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, f, { contentType, upsert: false });
  if (error) throw error;
  return { path, name: name.slice(0, 200), size: f.size, type: contentType };
}

/** Images shown in critique steps live in a public bucket so candidates can see them. */
export const PUBLIC_BUCKET = 'hiring-public';
export async function uploadPublicImage(jobId: string, f: File): Promise<string> {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) throw new Error('Please choose a PNG, JPG, WebP or GIF image.');
  if (f.size > 5 * 1024 * 1024) throw new Error('That image is over 5 MB.');
  const base = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'image';
  const path = `${jobId}/${Date.now().toString(36)}-${base}.${ext}`;
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, f, { contentType: STEP_TYPES_MIME[ext], upsert: false });
  if (error) throw error;
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
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
