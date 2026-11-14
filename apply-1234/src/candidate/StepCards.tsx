// The candidate's view of each activity step type, plus how each one is checked and sent.
import { useEffect, useRef, useState } from 'react';
import type { Activity, Question, StepFile, WriteSig } from '../lib/types';
import { knownDuration, loomId, looksLikeUrl, type LoomInfo } from '../lib/loom';
import { stepInfo, stepType } from '../lib/steps';
import { mdToHtml } from '../lib/posting';
import { AUDIO_ACCEPT, STEP_ACCEPT, fmtSize, stepFileProblem, uploadStepFile } from '../lib/files';
import { fmtDuration } from '../lib/util';
import { Button, Input, Segmented, Spinner, Textarea, cx } from '../ui';

export interface WorkItem { kind: 'link' | 'file'; url: string; file?: StepFile; note: string }

/** Everything a candidate has entered for one step, saved on their device as they go. */
export interface StepDraft {
  url: string;              // the step's Loom link (video, choice, critique, brief walkthrough)
  transcript: string;
  info?: LoomInfo | null;
  checking?: boolean;
  text?: string;
  sig?: WriteSig;
  mode?: 'video' | 'written';
  items?: WorkItem[];
  voice?: StepFile & { seconds?: number };
  deliverable?: string;
  files?: StepFile[];
  opened_at?: string;
  done_at?: string;
  order?: number[];
  touched?: boolean;
  reason?: string;
  choice?: number | null;
  started_at?: string;
  answered_at?: string;
  timed_out?: boolean;
  yesno?: 'yes' | 'no';
}
export const emptyDraft = (): StepDraft => ({ url: '', transcript: '' });

export interface StepCtx {
  jobId: string;
  vid: string;
  activity: Activity;
  range: string;
  track: (type: string, meta?: Record<string, unknown>, onceKey?: string) => void;
  checkLink: (qid: string, url: string) => void;
}

type Update = (patch: Partial<StepDraft> | ((a: StepDraft) => Partial<StepDraft>)) => void;

/** 90 → "90 seconds", 120 → "2 minutes". */
export const humanTime = (sec: number) => sec % 60 === 0 ? `${sec / 60} minute${sec === 60 ? '' : 's'}` : sec < 180 ? `${sec} seconds` : `${Math.round(sec / 60)} minutes`;
const words = (s = '') => s.trim().split(/\s+/).filter(Boolean).length;
const nowIso = () => new Date().toISOString();
const secsSince = (iso?: string) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)) : 0);

/** How the candidate answered a step that can go either way. */
const modeOf = (q: Question, a: StepDraft): 'video' | 'written' => {
  const t = stepType(q);
  if (t === 'video') return 'video';
  if (t === 'critique') return q.respond === 'video' ? 'video' : q.respond === 'either' ? a.mode || 'written' : 'written';
  if (t === 'choice') return a.mode || 'video';
  return 'written';
};

// ── What's still missing, and what gets sent ──

export function stepMissing(q: Question, a: StepDraft, n: number, activity: Activity): string | null {
  if (q.optional) return null;
  const t = stepType(q);
  const video = () => {
    if (!a.url.trim()) return `a video link for step ${n}`;
    if (!looksLikeUrl(a.url)) return `a full link (starting with https://) for step ${n}`;
    if (t === 'video' && activity.require_transcript && (a.transcript || '').trim().length < 20) return `the transcript for step ${n}`;
    return null;
  };
  switch (t) {
    case 'video': return video();
    case 'choice':
    case 'critique':
      if (t === 'choice' && !a.mode) return `your answer for step ${n}`;
      return modeOf(q, a) === 'video' ? video() : (a.text || '').trim() ? null : `your written answer for step ${n}`;
    case 'written': return (a.text || '').trim() ? null : `your written answer for step ${n}`;
    case 'voice': return a.voice?.path ? null : `a voice note for step ${n}`;
    case 'work': return (a.items || []).some((it) => (it.kind === 'link' ? looksLikeUrl(it.url) : !!it.file)) ? null : `at least one example of your work for step ${n}`;
    case 'brief': {
      if (!a.opened_at) return `step ${n}: open the brief`;
      const has = looksLikeUrl(a.deliverable || '') || (a.files || []).length > 0;
      if (!has) return `your finished work for step ${n}`;
      if (q.walkthrough === 'required') return video();
      return null;
    }
    case 'rank':
      if (!a.touched) return `your order for step ${n}`;
      if (q.reason && (a.reason || '').trim().length < 5) return `a line on your top pick for step ${n}`;
      return null;
    case 'quiz': return a.answered_at || a.timed_out ? null : a.started_at ? `lock in your answer for step ${n}` : `step ${n}: the timed question`;
    case 'musthave': return a.yesno ? null : `a yes or no for step ${n}`;
  }
}

export function stepPayload(q: Question, a: StepDraft): Record<string, unknown> {
  const t = stepType(q);
  const base = { question_id: q.id, type: t };
  const loom = {
    url: a.url.trim(), loom_id: loomId(a.url) || '', title: a.info?.ok ? a.info.title || '' : '',
    duration_sec: knownDuration(a.info), transcript: a.transcript || '',
  };
  const written = { mode: 'written', text: a.text || '', sig: a.sig || {} };
  switch (t) {
    case 'video': return { ...base, ...loom };
    case 'choice':
    case 'critique': return { ...base, ...(modeOf(q, a) === 'video' ? { mode: 'video', ...loom } : written) };
    case 'written': return { ...base, ...written };
    case 'voice': return { ...base, voice: a.voice || null };
    case 'work': {
      const items = a.items || [];
      return {
        ...base,
        links: items.filter((it) => it.kind === 'link' && looksLikeUrl(it.url)).map((it) => ({ url: it.url.trim(), note: it.note })),
        files: items.filter((it) => it.kind === 'file' && it.file).map((it) => ({ ...it.file, note: it.note })),
      };
    }
    case 'brief': return {
      ...base, deliverable: (a.deliverable || '').trim(), files: a.files || [], text: a.text || '',
      walk_url: a.url.trim(), walk_loom_id: loomId(a.url) || '', walk_title: a.info?.ok ? a.info.title || '' : '',
      opened_at: a.opened_at || '',
      seconds: a.opened_at && a.done_at ? Math.max(0, Math.round((Date.parse(a.done_at) - Date.parse(a.opened_at)) / 1000)) : null,
    };
    case 'rank': return { ...base, order: a.order || (q.options || []).map((_, i) => i), reason: a.reason || '', sig: a.sig || {} };
    case 'quiz': return {
      ...base, choice: a.choice ?? null, reason: a.reason || '', started_at: a.started_at || '', answered_at: a.answered_at || '',
      seconds: a.started_at ? Math.round(((a.answered_at ? Date.parse(a.answered_at) : Date.now()) - Date.parse(a.started_at)) / 1000) : null,
      timed_out: !!a.timed_out, sig: a.sig || {},
    };
    case 'musthave': return { ...base, yesno: a.yesno || '' };
  }
}

/** One line for the Submit summary. */
export function stepSummary(q: Question, a: StepDraft): string {
  const t = stepType(q);
  const mode = modeOf(q, a);
  if (q.optional && stepMissing({ ...q, optional: false }, a, 0, {}) ) return 'Skipped (optional)';
  switch (t) {
    case 'video': return a.url;
    case 'choice': case 'critique': return mode === 'video' ? a.url : `${words(a.text)} words`;
    case 'written': return `${words(a.text)} words`;
    case 'voice': return `Voice note${a.voice?.seconds ? ` · ${fmtDuration(a.voice.seconds)}` : ''}`;
    case 'work': { const n = (a.items || []).filter((it) => it.url || it.file).length; return `${n} example${n === 1 ? '' : 's'}`; }
    case 'brief': return a.deliverable?.trim() || (a.files || []).map((f) => f.name).join(', ');
    case 'rank': return (a.order || []).slice(0, 3).map((i) => (q.options || [])[i]).join(' → ');
    case 'quiz': return a.timed_out && a.choice == null ? 'Time ran out' : 'Answer locked in';
    case 'musthave': return a.yesno === 'yes' ? 'Yes' : a.yesno === 'no' ? 'No' : '';
  }
}

// ── The card ──

export function StepCard({ q, i, total, a, update, ctx }:
  { q: Question; i: number; total: number; a: StepDraft; update: Update; ctx: StepCtx }) {
  const t = stepType(q);
  const done = !stepMissing({ ...q, optional: false }, a, i + 1, ctx.activity);
  return (
    <div className="rounded-2xl bg-card border border-line p-5 sm:p-6"
      onFocusCapture={() => ctx.track('question_focus', { question_id: q.id, type: t }, `qf_${q.id}`)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-mono text-muted">STEP {i + 1} OF {total} · {stepInfo(t).label.toUpperCase()}</p>
        <span className="flex items-center gap-2 shrink-0">
          {q.optional && <span className="text-[11px] font-medium text-muted bg-paper-2 rounded-full px-2 py-0.5">Optional</span>}
          {done && <span className="text-good text-sm" aria-label="Done">✓</span>}
        </span>
      </div>
      {t !== 'brief' && t !== 'quiz' && <Prompt q={q} />}
      <div className="mt-4">
        {t === 'video' && <VideoField q={q} a={a} update={update} ctx={ctx} />}
        {t === 'written' && <TimedWritten q={q} a={a} update={update} ctx={ctx} />}
        {t === 'choice' && <ChoiceStep q={q} a={a} update={update} ctx={ctx} />}
        {t === 'critique' && <CritiqueStep q={q} a={a} update={update} ctx={ctx} />}
        {t === 'voice' && <VoiceStep q={q} a={a} update={update} ctx={ctx} />}
        {t === 'work' && <WorkStep q={q} a={a} update={update} ctx={ctx} />}
        {t === 'brief' && <BriefStep q={q} a={a} update={update} ctx={ctx} />}
        {t === 'rank' && <RankStep q={q} a={a} update={update} ctx={ctx} />}
        {t === 'quiz' && <QuizStep q={q} a={a} update={update} ctx={ctx} />}
        {t === 'musthave' && <MustHave a={a} update={update} ctx={ctx} q={q} />}
      </div>
    </div>
  );
}

function Prompt({ q }: { q: Question }) {
  return (
    <>
      <div className="md-step text-[19px] leading-snug font-medium mt-2 [&_p]:my-1.5" dangerouslySetInnerHTML={{ __html: mdToHtml(q.text) }} />
      {q.guidance && <p className="text-sm text-muted mt-2 leading-relaxed">{q.guidance}</p>}
    </>
  );
}

function Material({ q }: { q: Question }) {
  if (!q.material?.trim() && !q.material_url?.trim() && !q.image_url?.trim()) return null;
  return (
    <div className="mt-4 space-y-3">
      {q.image_url?.trim() && (
        <a href={q.image_url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-line bg-paper-2">
          <img src={q.image_url} alt="What to look at for this step" className="w-full max-h-[480px] object-contain" />
        </a>
      )}
      {q.material_url?.trim() && (
        <a href={q.material_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg bg-paper-2 font-medium text-sm hover:bg-line/60 max-w-full">
          <span className="truncate">Open {hostLabel(q.material_url)}</span> <span aria-hidden>↗</span>
        </a>
      )}
      {q.material?.trim() && (
        <div className="md-step rounded-xl bg-paper-2/70 border border-line px-4 py-3 text-[15px] text-ink-2" dangerouslySetInnerHTML={{ __html: mdToHtml(q.material) }} />
      )}
    </div>
  );
}

const hostLabel = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'the link'; } };

// ── Video (Loom) ──

function VideoField({ q, a, update, ctx, label }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx; label?: string }) {
  const tx = stepType(q) === 'video' && !!ctx.activity.require_transcript;
  return (
    <div>
      {label && <p className="text-sm font-medium mb-1.5">{label}</p>}
      <Input inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://www.loom.com/share/…" mono
        value={a.url}
        onChange={(e) => update({ url: e.target.value, info: null })}
        onBlur={(e) => ctx.checkLink(q.id, e.target.value)}
        onPaste={(e) => { const v = e.clipboardData.getData('text'); setTimeout(() => ctx.checkLink(q.id, v), 0); }} />
      <LinkStatus a={a} min={ctx.activity.answer_min} max={ctx.activity.answer_max} range={stepType(q) === 'video' ? ctx.range : ''} />
      {tx && (
        <label className="block mt-4">
          <span className="block text-[13px] font-medium mb-1.5">Transcript</span>
          <Textarea rows={3} value={a.transcript}
            onChange={(e) => update({ transcript: e.target.value })}
            onBlur={(e) => e.target.value.trim().length >= 20 && ctx.track('transcript_added', { question_id: q.id }, `tx_${q.id}`)} />
          <span className="block text-xs text-muted mt-1.5">In Loom, open the video, click Transcript, copy all of the text and paste it here.</span>
        </label>
      )}
    </div>
  );
}

export function LinkStatus({ a, min, max, range }: { a: StepDraft; min?: number | null; max?: number | null; range: string }) {
  if (!a.url.trim()) return null;
  if (a.checking) return <p className="mt-2 text-sm text-muted flex items-center gap-2"><Spinner className="h-3 w-3" /> Checking link…</p>;
  const info = a.info;
  if (!info) return null;
  if (info.ok) {
    const d = knownDuration(info);
    const out = !!range && d != null && ((min && d < min) || (max && d > max));
    return (
      <div className="mt-2 text-sm">
        <p className="text-good">✓ {info.title ? `“${info.title}”` : 'Loom video found'}{d != null ? ` · ${fmtDuration(d)}` : ''}</p>
        {out && <p className="text-muted mt-1">Loom says this video is {fmtDuration(d)}. The suggested length is {range}, but that's only a guide.</p>}
      </div>
    );
  }
  if (info.reason === 'not_loom')
    return <p className="mt-2 text-sm text-warn">{looksLikeUrl(a.url) ? 'This doesn’t look like a Loom share link (loom.com/share/…). Check that you copied the right link.' : 'Paste the full link, starting with https://'}</p>;
  if (info.reason === 'private_or_unavailable' || info.reason === 'not_found')
    return <p className="mt-2 text-sm text-warn">We couldn’t open this video. In Loom, set sharing to “Anyone with the link”, then paste it again.</p>;
  return <p className="mt-2 text-sm text-muted">Link saved. We couldn’t verify it right now.</p>;
}

const LoomHint = () => (
  <p className="text-xs text-muted mt-1.5">
    Record with <a href="https://www.loom.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Loom</a> (free), then paste the share link here.
  </p>
);

// ── Writing, with typing signals ──

function WrittenBox({ q, a, update, ctx, locked, placeholder, rows = 6, field = 'text' }: {
  q: Question; a: StepDraft; update: Update; ctx: StepCtx; locked?: boolean; placeholder?: string; rows?: number; field?: 'text' | 'reason';
}) {
  const rule = q.paste || 'flag';
  const value = (field === 'text' ? a.text : a.reason) || '';
  const pending = useRef(0);
  const focusAt = useRef(0);
  const [blockedNote, setBlockedNote] = useState(false);
  const sig = (patch: (s: WriteSig) => WriteSig) => update((p) => ({ sig: patch(p.sig || {}) }));

  // Leaving the window while writing (another tab or app).
  useEffect(() => {
    let last = 0;
    const away = () => {
      if (!focusAt.current || Date.now() - last < 2000) return;
      last = Date.now();
      sig((s) => ({ ...s, blurs: (s.blurs || 0) + 1 }));
    };
    window.addEventListener('blur', away);
    return () => window.removeEventListener('blur', away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPaste = (len: number, e: { preventDefault: () => void }) => {
    if (rule === 'block') {
      e.preventDefault();
      setBlockedNote(true);
      sig((s) => ({ ...s, blocked: (s.blocked || 0) + 1 }));
      ctx.track('paste_blocked', { question_id: q.id });
      return;
    }
    pending.current = len;
    sig((s) => ({ ...s, pasted: (s.pasted || 0) + len, pastes: (s.pastes || 0) + 1 }));
    ctx.track('paste', { question_id: q.id, chars: len });
  };

  const n = words(value);
  const over = !!q.words && field === 'text' && n > q.words;
  return (
    <div>
      <Textarea rows={rows} value={value} readOnly={locked} placeholder={placeholder || 'Type your answer here.'}
        className={cx(locked && 'bg-paper-2 text-ink-2')}
        onFocus={() => { focusAt.current = Date.now(); }}
        onBlur={() => {
          if (focusAt.current) { const ms = Date.now() - focusAt.current; focusAt.current = 0; sig((s) => ({ ...s, ms: (s.ms || 0) + ms })); }
          if (value.trim()) ctx.track('step_answer', { question_id: q.id, words: n }, `sa_${q.id}_${Math.floor(n / 50)}`);
        }}
        onPaste={(e) => onPaste(e.clipboardData.getData('text').length, e)}
        onDrop={(e) => onPaste(e.dataTransfer.getData('text').length, e)}
        onChange={(e) => {
          if (locked) return;
          const next = e.target.value;
          const delta = next.length - value.length;
          if (pending.current > 0) pending.current = 0;
          else if (delta > 0) sig((s) => ({ ...s, typed: (s.typed || 0) + delta }));
          update(field === 'text' ? { text: next } : { reason: next });
        }} />
      <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
        <span className={cx(blockedNote ? 'text-warn' : 'text-muted')}>
          {blockedNote ? 'Pasting is off for this step. Please type your answer.'
            : rule === 'flag' && field === 'text' ? 'Type your answer here. We note whether answers are typed or pasted.' : ''}
        </span>
        {field === 'text' && <span className={cx('tabular-nums shrink-0', over ? 'text-warn' : 'text-muted')}>{n}{q.words ? ` / ${q.words}` : ''} words</span>}
      </div>
    </div>
  );
}

/** A countdown that starts when the candidate presses Start and survives a page reload. */
function useCountdown(startedAt: string | undefined, limit: number | null | undefined, onEnd: () => void) {
  const [left, setLeft] = useState(() => (startedAt && limit ? Math.max(0, limit - secsSince(startedAt)) : limit || 0));
  const ended = useRef(false);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    if (!startedAt || !limit) return;
    const tick = () => {
      const l = Math.max(0, limit - secsSince(startedAt));
      setLeft(l);
      if (l <= 0 && !ended.current) { ended.current = true; end.current(); }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [startedAt, limit]);
  return left;
}

function Clock({ left, total }: { left: number; total: number }) {
  const low = left <= Math.min(15, total * 0.2);
  return (
    <span className={cx('font-mono text-sm tabular-nums rounded-full px-2.5 py-1', low ? 'bg-bad-soft text-bad' : 'bg-paper-2 text-ink')} role="timer" aria-live="off">
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}

function StartGate({ title, detail, onStart }: { title: string; detail: string; onStart: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper px-5 py-5">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted mt-1 leading-relaxed">{detail}</p>
      <Button variant="primary" className="mt-4" onClick={onStart}>Start</Button>
    </div>
  );
}

function TimedWritten({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  const limit = q.time_limit || null;
  const left = useCountdown(a.started_at, limit, () => { update({ answered_at: nowIso() }); ctx.track('timed_out', { question_id: q.id }, `to_${q.id}`); });
  if (!limit) return <WrittenBox q={q} a={a} update={update} ctx={ctx} />;
  if (!a.started_at) {
    return <StartGate title={`You’ll have ${humanTime(limit)} once you start.`}
      detail="The question is above. When you press Start the clock runs, and your answer is saved as it is when time is up."
      onStart={() => { update({ started_at: nowIso() }); ctx.track('step_start', { question_id: q.id }); }} />;
  }
  const locked = left <= 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted">{locked ? 'Time’s up. Your answer is saved.' : 'Time left'}</span>
        {!locked && <Clock left={left} total={limit} />}
      </div>
      <WrittenBox q={q} a={a} update={update} ctx={ctx} locked={locked} />
    </div>
  );
}

// ── Video or writing ──

function ChoiceStep({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  return (
    <div>
      <Segmented value={a.mode || ('' as 'video')} onChange={(mode) => update({ mode })}
        options={[{ id: 'video', label: 'Record a video' }, { id: 'written', label: 'Write it' }]} />
      {!a.mode && <p className="text-sm text-muted mt-2">Choose whichever suits you. Both count the same.</p>}
      {a.mode === 'video' && <div className="mt-3"><VideoField q={q} a={a} update={update} ctx={ctx} /><LoomHint /></div>}
      {a.mode === 'written' && <div className="mt-3"><WrittenBox q={q} a={a} update={update} ctx={ctx} /></div>}
    </div>
  );
}

function CritiqueStep({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  const respond = q.respond || 'written';
  const mode = modeOf(q, a);
  return (
    <div>
      <Material q={q} />
      <div className="mt-4">
        {respond === 'either' && (
          <Segmented value={mode} onChange={(m) => update({ mode: m })}
            options={[{ id: 'written', label: 'Write it' }, { id: 'video', label: 'Record a video' }]} />
        )}
        <div className={cx(respond === 'either' && 'mt-3')}>
          {mode === 'video'
            ? <><VideoField q={q} a={a} update={update} ctx={ctx} /><LoomHint /></>
            : <WrittenBox q={q} a={a} update={update} ctx={ctx} placeholder="What works, what you'd change first, and why." />}
        </div>
      </div>
    </div>
  );
}

// ── Voice note ──

const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
const extFor = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');

function VoiceStep({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  const limit = q.time_limit || 120;
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'recorded' | 'uploading'>('idle');
  const [err, setErr] = useState('');
  const [secs, setSecs] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string; type: string; seconds: number } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => () => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  const start = async () => {
    setErr('');
    setState('asking');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const type = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      const began = Date.now();
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        clearInterval(timer.current);
        s.getTracks().forEach((t) => t.stop());
        const mime = (r.mimeType || type || 'audio/webm');
        const blob = new Blob(chunks, { type: mime });
        setClip({ blob, url: URL.createObjectURL(blob), type: mime, seconds: Math.round((Date.now() - began) / 1000) });
        setState('recorded');
      };
      rec.current = r;
      r.start(1000);
      setSecs(0);
      setState('recording');
      timer.current = setInterval(() => {
        const n = Math.round((Date.now() - began) / 1000);
        setSecs(n);
        if (n >= limit && r.state === 'recording') r.stop();
      }, 250);
      ctx.track('step_start', { question_id: q.id, type: 'voice' }, `vs_${q.id}`);
    } catch {
      setState('idle');
      setErr('We couldn’t use your microphone. Allow microphone access for this site and try again, or upload a voice memo instead.');
    }
  };

  const save = async (blob: Blob, name: string, type?: string, seconds?: number) => {
    setErr('');
    setState('uploading');
    try {
      const up = await uploadStepFile(ctx.jobId, ctx.vid, q.id, blob, name, type);
      update({ voice: { ...up, seconds } });
      ctx.track('voice_recorded', { question_id: q.id, seconds, size: blob.size });
      setClip(null);
      setState('idle');
    } catch {
      setState(clip ? 'recorded' : 'idle');
      setErr('That upload didn’t go through. Check your connection and try again.');
    }
  };

  const fileInput = (
    <label className="text-sm text-muted underline underline-offset-2 cursor-pointer hover:text-ink">
      <input type="file" accept={AUDIO_ACCEPT} className="sr-only" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        const p = stepFileProblem(f, true);
        if (p) { setErr(p); return; }
        save(f, f.name, f.type || undefined);
      }} />
      Upload a voice memo instead
    </label>
  );

  if (a.voice?.path && state === 'idle') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
        <span className="text-good">✓</span>
        <span className="text-sm flex-1 min-w-0">Voice note saved{a.voice.seconds ? ` · ${fmtDuration(a.voice.seconds)}` : ''}</span>
        <button className="text-sm text-muted underline underline-offset-2 hover:text-ink" onClick={() => update({ voice: undefined })}>Record again</button>
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm text-muted">Up to {humanTime(limit)}. Find a quiet spot; it works on your phone too.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {state === 'idle' && supported && <Button variant="primary" onClick={start}><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" /> Start recording</Button>}
        {state === 'asking' && <span className="text-sm text-muted flex items-center gap-2"><Spinner className="h-3 w-3" /> Waiting for the microphone…</span>}
        {state === 'recording' && (
          <>
            <Button variant="danger" onClick={() => rec.current?.stop()}>■ Stop</Button>
            <span className="font-mono text-sm tabular-nums flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-bad animate-pulse" /> {fmtDuration(secs)} / {fmtDuration(limit)}
            </span>
          </>
        )}
        {state === 'recorded' && clip && (
          <div className="w-full space-y-3">
            <audio controls src={clip.url} className="w-full" />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => save(clip.blob, `voice.${extFor(clip.type)}`, clip.type, clip.seconds)}>Use this recording</Button>
              <Button variant="ghost" onClick={() => { setClip(null); start(); }}>Record again</Button>
            </div>
          </div>
        )}
        {state === 'uploading' && <span className="text-sm text-muted flex items-center gap-2"><Spinner className="h-3 w-3" /> Saving your voice note…</span>}
        {(state === 'idle' || !supported) && fileInput}
      </div>
      {err && <p className="mt-3 rounded-xl bg-bad-soft text-bad text-sm px-4 py-2.5">{err}</p>}
    </div>
  );
}

// ── Uploads shared by work samples and briefs ──

function UploadSlot({ q, ctx, onDone, label = 'Choose a file' }: { q: Question; ctx: StepCtx; onDone: (f: StepFile) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div>
      <label className={cx('flex items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-3.5 text-sm cursor-pointer hover:border-ink/40 transition', busy && 'opacity-60 pointer-events-none')}>
        <input type="file" accept={STEP_ACCEPT} className="sr-only" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const p = stepFileProblem(f);
          if (p) { setErr(p); return; }
          setErr('');
          setBusy(true);
          try {
            onDone(await uploadStepFile(ctx.jobId, ctx.vid, q.id, f, f.name));
            ctx.track('file_added', { question_id: q.id, size: f.size });
          } catch {
            setErr('That upload didn’t go through. Check your connection and try again, or share a link instead.');
          }
          setBusy(false);
        }} />
        {busy ? <><Spinner className="h-4 w-4" /> Uploading…</> : <><span aria-hidden className="text-lg leading-none">+</span> {label}</>}
      </label>
      <p className="text-xs text-muted mt-1.5">PDF, Word, PowerPoint, Excel, CSV or an image, up to 10 MB.</p>
      {err && <p className="mt-2 rounded-lg bg-bad-soft text-bad text-sm px-3 py-2">{err}</p>}
    </div>
  );
}

function FileChip({ f, onRemove }: { f: StepFile; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5">
      <span className="grid place-items-center h-9 w-8 rounded-md bg-accent-soft text-accent text-[10px] font-bold uppercase">{f.name.split('.').pop()}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{f.name}</p>
        {f.size ? <p className="text-xs text-muted">{fmtSize(f.size)} · attached</p> : null}
      </div>
      <button className="text-xs text-muted underline underline-offset-2 hover:text-ink" onClick={onRemove}>Remove</button>
    </div>
  );
}

// ── Show your work ──

function WorkStep({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  const max = Math.min(5, Math.max(1, q.items || 3));
  const items = a.items?.length ? a.items : [{ kind: 'link' as const, url: '', note: '' }];
  const set = (i: number, patch: Partial<WorkItem>) => update({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <div className="space-y-4">
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Example {i + 1}{i > 0 && <span className="text-muted font-normal"> (optional)</span>}</p>
            <div className="flex items-center gap-3">
              <Segmented size="sm" value={it.kind} onChange={(kind) => set(i, { kind })}
                options={[{ id: 'link', label: 'Link' }, { id: 'file', label: 'File' }]} />
              {items.length > 1 && <button className="text-xs text-muted hover:text-ink" aria-label={`Remove example ${i + 1}`} onClick={() => update({ items: items.filter((_, j) => j !== i) })}>✕</button>}
            </div>
          </div>
          <div className="mt-3">
            {it.kind === 'link'
              ? <Input inputMode="url" autoComplete="off" spellCheck={false} mono placeholder="https://…" value={it.url} onChange={(e) => set(i, { url: e.target.value })} />
              : it.file ? <FileChip f={it.file} onRemove={() => set(i, { file: undefined })} />
                : <UploadSlot q={q} ctx={ctx} onDone={(file) => set(i, { file })} />}
            {it.kind === 'link' && it.url.trim() && !looksLikeUrl(it.url) && <p className="text-sm text-warn mt-1.5">Paste the full link, starting with https://</p>}
          </div>
          <Textarea className="mt-3" rows={2} value={it.note} placeholder="What was your part, and what was the result?"
            onChange={(e) => set(i, { note: e.target.value })} />
        </div>
      ))}
      {items.length < max && (
        <button className="text-sm font-medium text-ink-2 hover:text-ink" onClick={() => update({ items: [...items, { kind: 'link', url: '', note: '' }] })}>
          + Add another example
        </button>
      )}
    </div>
  );
}

// ── Mini brief ──

function BriefStep({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  const del = q.deliverable || 'either';
  const walk = q.walkthrough || 'optional';
  const markDone = () => { if (!a.done_at) update({ done_at: nowIso() }); };
  if (!a.opened_at) {
    return (
      <StartGate title={`A short task from this role · about ${q.minutes || 30} minutes`}
        detail="Open the brief when you’re ready. There’s no countdown, but we note how long you took. Your progress is saved on this device."
        onStart={() => { update({ opened_at: nowIso() }); ctx.track('brief_opened', { question_id: q.id }); }} />
    );
  }
  return (
    <div>
      <Prompt q={q} />
      <Material q={q} />
      <p className="text-xs text-muted mt-3">Suggested time: about {q.minutes || 30} minutes.</p>
      <div className="mt-5 space-y-4">
        {(del === 'link' || del === 'either') && (
          <div>
            <p className="text-sm font-medium mb-1.5">Link to your work</p>
            <Input inputMode="url" autoComplete="off" spellCheck={false} mono placeholder="https://docs.google.com/…" value={a.deliverable || ''}
              onChange={(e) => update({ deliverable: e.target.value })} onBlur={() => looksLikeUrl(a.deliverable || '') && markDone()} />
            <p className="text-xs text-muted mt-1.5">A Google Doc or Slides, Canva, Drive, Figma or GitHub link. Make sure anyone with the link can view it.</p>
          </div>
        )}
        {(del === 'file' || del === 'either') && (
          <div>
            <p className="text-sm font-medium mb-1.5">{del === 'either' ? 'Or upload a file' : 'Upload your work'}</p>
            <div className="space-y-2">
              {(a.files || []).map((f) => <FileChip key={f.path} f={f} onRemove={() => update({ files: (a.files || []).filter((x) => x.path !== f.path) })} />)}
              {(a.files || []).length < 3 && <UploadSlot q={q} ctx={ctx} onDone={(f) => { update((p) => ({ files: [...(p.files || []), f] })); markDone(); }} />}
            </div>
          </div>
        )}
        {walk !== 'off' && (
          <div>
            <VideoField q={q} a={a} update={update} ctx={ctx}
              label={walk === 'required' ? 'Walk us through it on Loom (2–3 minutes)' : 'Walk us through it on Loom (optional, 2–3 minutes)'} />
            <LoomHint />
          </div>
        )}
        <div>
          <p className="text-sm font-medium mb-1.5">Anything we should know? <span className="text-muted font-normal">(optional)</span></p>
          <Textarea rows={2} value={a.text || ''} placeholder="Assumptions you made, what you’d do with more time…" onChange={(e) => update({ text: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

// ── Rank it ──

function RankStep({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  const opts = q.options || [];
  const order = a.order && a.order.length === opts.length ? a.order : opts.map((_, i) => i);
  const move = (pos: number, dir: -1 | 1) => {
    const next = [...order];
    const to = pos + dir;
    if (to < 0 || to >= next.length) return;
    [next[pos], next[to]] = [next[to], next[pos]];
    update({ order: next, touched: true });
    ctx.track('step_answer', { question_id: q.id }, `rank_${q.id}`);
  };
  return (
    <div>
      <p className="text-sm text-muted">Use the arrows to put the most important first.</p>
      <ol className="mt-3 space-y-2">
        {order.map((oi, pos) => (
          <li key={oi} className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5">
            <span className="font-mono text-sm text-muted w-5 text-right">{pos + 1}</span>
            <span className="flex-1 text-[15px] leading-snug">{opts[oi]}</span>
            <span className="flex gap-1">
              <button className="h-8 w-8 rounded-md bg-card border border-line disabled:opacity-30" disabled={pos === 0} aria-label={`Move “${opts[oi]}” up`} onClick={() => move(pos, -1)}>↑</button>
              <button className="h-8 w-8 rounded-md bg-card border border-line disabled:opacity-30" disabled={pos === order.length - 1} aria-label={`Move “${opts[oi]}” down`} onClick={() => move(pos, 1)}>↓</button>
            </span>
          </li>
        ))}
      </ol>
      {!a.touched && (
        <button className="mt-3 text-sm text-muted underline underline-offset-2 hover:text-ink" onClick={() => update({ order, touched: true })}>
          This order is right as it is
        </button>
      )}
      {q.reason !== false && (
        <div className="mt-4">
          <p className="text-sm font-medium mb-1.5">Why is your first choice first?</p>
          <WrittenBox q={q} a={a} update={update} ctx={ctx} field="reason" rows={2} placeholder="One or two lines." />
        </div>
      )}
    </div>
  );
}

// ── Quick scenario (timed multiple choice) ──

function QuizStep({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  const limit = q.time_limit || 90;
  const locked = !!a.answered_at || !!a.timed_out;
  const left = useCountdown(locked ? undefined : a.started_at, limit, () => {
    update({ timed_out: true, answered_at: nowIso() });
    ctx.track('timed_out', { question_id: q.id }, `to_${q.id}`);
  });
  const opts = q.options || [];
  if (!a.started_at) {
    return (
      <div>
        <p className="text-[19px] leading-snug font-medium mt-2">A quick scenario</p>
        <div className="mt-4">
          <StartGate title={`You’ll have ${humanTime(limit)} once you start.`}
            detail="The question appears when you press Start. Go with your best judgment; there’s no time to look things up, and that’s the point."
            onStart={() => { update({ started_at: nowIso() }); ctx.track('step_start', { question_id: q.id, type: 'quiz' }); }} />
        </div>
      </div>
    );
  }
  if (locked) {
    return (
      <div>
        <Prompt q={q} />
        <div className="mt-4 rounded-xl bg-paper-2 px-4 py-3 text-sm">
          {a.choice != null ? <>Your answer: <strong>{opts[a.choice]}</strong></> : 'Time ran out before an answer was chosen.'}
          <p className="text-xs text-muted mt-1">Locked in. You can’t change this one.</p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><Prompt q={q} /></div>
        <div className="mt-2 shrink-0"><Clock left={left} total={limit} /></div>
      </div>
      <Material q={q} />
      <div className="mt-4 space-y-2" role="radiogroup">
        {opts.map((o, oi) => (
          <button key={oi} role="radio" aria-checked={a.choice === oi} onClick={() => update({ choice: oi })}
            className={cx('w-full text-left flex items-start gap-3 rounded-xl border px-4 py-3 transition',
              a.choice === oi ? 'border-ink bg-ink/[.03]' : 'border-line hover:border-ink/30')}>
            <span className={cx('mt-0.5 h-4 w-4 rounded-full border-2 shrink-0', a.choice === oi ? 'border-ink bg-ink shadow-[inset_0_0_0_2px_white]' : 'border-line')} />
            <span className="text-[15px] leading-snug">{o}</span>
          </button>
        ))}
      </div>
      {q.reason !== false && (
        <div className="mt-4">
          <p className="text-sm font-medium mb-1.5">In a line, why? <span className="text-muted font-normal">(optional)</span></p>
          <WrittenBox q={{ ...q, paste: q.paste || 'block' }} a={a} update={update} ctx={ctx} field="reason" rows={2} placeholder="Your reasoning." />
        </div>
      )}
      <Button variant="primary" className="mt-4" disabled={a.choice == null} onClick={() => { update({ answered_at: nowIso() }); ctx.track('step_answer', { question_id: q.id }); }}>
        Lock in answer
      </Button>
    </div>
  );
}

// ── Must-have ──

function MustHave({ q, a, update, ctx }: { q: Question; a: StepDraft; update: Update; ctx: StepCtx }) {
  return (
    <div className="flex gap-2">
      {(['yes', 'no'] as const).map((v) => (
        <button key={v} onClick={() => { update({ yesno: v }); ctx.track('step_answer', { question_id: q.id }, `mh_${q.id}`); }}
          aria-pressed={a.yesno === v}
          className={cx('h-11 min-w-24 px-5 rounded-lg border font-medium transition',
            a.yesno === v ? 'bg-ink text-white border-ink' : 'bg-card border-line hover:border-ink/30')}>
          {v === 'yes' ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}
