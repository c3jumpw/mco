// Recordings, transcripts and files from a candidate's interview, kept on their profile.
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Application, InterviewRecord } from '../lib/types';
import { TEAM_BUCKET } from '../lib/offers';
import { fmtSize } from '../lib/files';
import { fmtDate, uid } from '../lib/util';
import { Button, CopyButton, Field, Input, Segmented, Spinner, Textarea, cx, useToast } from '../ui';
import { slugName, teamFileLink } from './OfferEditor';

const RECORD_FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain', vtt: 'text/vtt', srt: 'application/x-subrip', rtf: 'application/rtf', odt: 'application/vnd.oasis.opendocument.text',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};
const TEXT_TYPES = ['txt', 'vtt', 'srt'];
const KIND_LABEL = { recording: 'Recording', transcript: 'Transcript', file: 'File' } as const;

/** Turns a .vtt or .srt caption file into readable text: one line per caption, without the timing lines. */
export function captionsToText(raw: string) {
  return raw.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split('\n')
    .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^(NOTE|STYLE)\b/.test(l))
    .join('\n').trim();
}

export function InterviewRecords({ app, save, me }: { app: Application; save: (p: Partial<Application>, now?: boolean) => void; me: string }) {
  const toast = useToast();
  const records = app.interview_records || [];
  const [kind, setKind] = useState<InterviewRecord['kind']>('recording');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const put = (r: InterviewRecord) => save({ interview_records: [...records, r] }, true);
  const reset = () => { setLabel(''); setUrl(''); setText(''); setAdding(false); };
  const base = { id: uid('r'), added_at: new Date().toISOString(), added_by: me };
  const validUrl = (u: string) => /^https?:\/\/\S+\.\S+/i.test(u.trim());

  const addLink = () => {
    if (!validUrl(url)) { toast('Paste a full link that starts with https://', 'bad'); return; }
    put({ ...base, kind, label: label.trim() || (kind === 'recording' ? 'Interview recording' : 'Interview transcript'), url: url.trim(), ...(kind === 'transcript' && text.trim() ? { text: text.trim() } : {}) });
    reset();
  };
  const addTranscript = () => {
    if (!text.trim() && !validUrl(url)) { toast('Paste the transcript or a link to it.', 'bad'); return; }
    put({ ...base, kind: 'transcript', label: label.trim() || 'Interview transcript', ...(text.trim() ? { text: text.trim() } : {}), ...(validUrl(url) ? { url: url.trim() } : {}) });
    reset();
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!RECORD_FILE_TYPES[ext]) { toast('Choose a PDF, Word, text, caption (.vtt, .srt) or image file. For video or audio, add a link instead.', 'bad'); return; }
    if (file.size > 25 * 1024 * 1024) { toast('That file is over 25 MB. Add a link to it instead.', 'bad'); return; }
    setBusy(true);
    const path = `${app.job_id}/${app.id}/interview/${Date.now().toString(36)}-${slugName(file.name)}.${ext}`;
    const { error } = await supabase.storage.from(TEAM_BUCKET).upload(path, file, { contentType: RECORD_FILE_TYPES[ext], upsert: false });
    setBusy(false);
    if (error) { toast(error.message, 'bad'); return; }
    // Caption and text files also become a readable transcript.
    if (kind === 'transcript' && TEXT_TYPES.includes(ext)) {
      const raw = file.size < 2 * 1024 * 1024 ? await file.text() : '';
      put({ ...base, kind: 'transcript', label: label.trim() || file.name.replace(/\.[^.]+$/, ''), path, name: file.name, size: file.size, ...(raw ? { text: ext === 'txt' ? raw.trim() : captionsToText(raw) } : {}) });
    } else {
      put({ ...base, kind: kind === 'recording' ? 'file' : kind, label: label.trim() || file.name, path, name: file.name, size: file.size });
    }
    reset();
  };
  const remove = async (r: InterviewRecord) => {
    if (!confirm(`Remove “${r.label}”?`)) return;
    save({ interview_records: records.filter((x) => x.id !== r.id) }, true);
    if (r.path) await supabase.storage.from(TEAM_BUCKET).remove([r.path]);
  };
  const open = async (r: InterviewRecord, download = false) => {
    try { window.open(await teamFileLink(r.path!, download ? r.name : undefined), '_blank', 'noopener'); }
    catch (e: any) { toast(e?.message || 'Couldn’t open the file', 'bad'); }
  };

  return (
    <div>
      <p className="text-sm font-medium">Recordings and transcripts</p>
      <p className="text-[12px] text-muted">Links to the call recording, the transcript and any interview files, kept with this candidate.</p>
      {records.length > 0 && (
        <ul className="mt-3 space-y-2">
          {records.map((r) => (
            <li key={r.id} className="rounded-xl border border-line px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className={cx('grid place-items-center h-8 w-8 rounded-lg text-[13px] shrink-0',
                  r.kind === 'recording' ? 'bg-accent-soft text-accent' : r.kind === 'transcript' ? 'bg-good-soft text-good' : 'bg-paper-2 text-ink-2')}>
                  {r.kind === 'recording' ? '▶' : r.kind === 'transcript' ? '¶' : '⎙'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{r.label}</span>
                  <span className="block text-[12px] text-muted truncate">
                    {KIND_LABEL[r.kind]}{r.url ? ` · ${r.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}` : ''}{r.size ? ` · ${fmtSize(r.size)}` : ''} · {fmtDate(r.added_at)}
                  </span>
                </span>
                <span className="flex gap-1 shrink-0">
                  {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost">Open</Button></a>}
                  {r.path && !r.url && <Button size="sm" variant="ghost" onClick={() => open(r)}>Open</Button>}
                  {r.path && <Button size="sm" variant="ghost" onClick={() => open(r, true)}>Download</Button>}
                  <Button size="sm" variant="ghost" onClick={() => remove(r)} aria-label={`Remove ${r.label}`}>×</Button>
                </span>
              </div>
              {r.text && (
                <details className="mt-2">
                  <summary className="text-[13px] text-muted cursor-pointer hover:text-ink">Read the transcript ({r.text.split(/\s+/).length.toLocaleString()} words)</summary>
                  <div className="mt-2 max-h-80 overflow-y-auto rounded-lg bg-paper-2/70 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">{r.text}</div>
                  <div className="mt-2 flex gap-2"><CopyButton text={r.text} label="Copy transcript" /></div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {!adding ? (
        <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>+ Add a recording, transcript or file</Button>
      ) : (
        <div className="mt-3 rounded-xl bg-paper-2/60 p-3 space-y-3">
          <Segmented size="sm" value={kind} onChange={setKind} options={[{ id: 'recording', label: 'Recording link' }, { id: 'transcript', label: 'Transcript' }, { id: 'file', label: 'File' }]} />
          <Field label="Name" hint="Optional.">
            <Input className="h-9 text-sm" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === 'recording' ? 'e.g. Interview, Nov 18 (Zoom)' : kind === 'transcript' ? 'e.g. Interview transcript' : 'e.g. Interview notes'} />
          </Field>
          {kind !== 'file' && (
            <Field label={kind === 'recording' ? 'Link to the recording' : 'Link to the transcript'} hint={kind === 'recording' ? 'From Zoom, Google Meet, Loom, Drive or wherever it’s saved. Check that your team can open it.' : 'Optional if you paste the text below.'}>
              <Input className="h-9 text-sm" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </Field>
          )}
          {kind === 'transcript' && (
            <Field label="Transcript text" hint="Paste it here, or upload a .txt, .vtt or .srt file below and it will be filled in.">
              <Textarea rows={4} className="text-sm" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {kind === 'recording' && <Button size="sm" variant="primary" disabled={!url.trim()} onClick={addLink}>Add recording</Button>}
            {kind === 'transcript' && <Button size="sm" variant="primary" disabled={!text.trim() && !url.trim()} onClick={addTranscript}>Add transcript</Button>}
            {kind !== 'recording' && (
              <label className={cx('inline-flex items-center gap-2 h-8 px-2.5 rounded-lg border border-dashed border-line bg-card text-[13px] cursor-pointer hover:border-ink/30', busy && 'opacity-50 pointer-events-none')}>
                {busy ? <><Spinner /> Uploading</> : kind === 'transcript' ? 'Upload a transcript file' : 'Choose a file'}
                <input type="file" className="sr-only" accept={Object.keys(RECORD_FILE_TYPES).map((x) => `.${x}`).join(',')}
                  onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            )}
            <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
