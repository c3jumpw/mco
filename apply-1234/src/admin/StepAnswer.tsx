// How each kind of step answer looks to the hiring team.
import { useEffect, useState } from 'react';
import type { Answer, Job, Question, StepFile, WriteSig } from '../lib/types';
import { embedUrl, fetchLoomInfo, knownDuration, loomId, type LoomInfo } from '../lib/loom';
import { mdToHtml } from '../lib/posting';
import { stepInfo, stepType } from '../lib/steps';
import { fileLink, fmtSize } from '../lib/files';
import { fmtDuration, fmtSpan, rangeLabel } from '../lib/util';
import { Button, Card, Pill, Stars, cx, useToast } from '../ui';
import { StepIcon } from './job/StepsEditor';

const words = (s = '') => s.trim().split(/\s+/).filter(Boolean).length;

/** "Typed 92% · pasted once (40 characters) · 6 min writing · left the page 2×" */
export function sigSummary(sig?: WriteSig, text = ''): { line: string; warn: boolean } | null {
  if (!sig || !Object.keys(sig).length) return null;
  const typed = sig.typed || 0;
  const pasted = sig.pasted || 0;
  const parts: string[] = [];
  const total = typed + pasted;
  const pastedShare = total ? pasted / total : 0;
  if (total) parts.push(pasted ? `Typed ${Math.round((1 - pastedShare) * 100)}%` : 'Typed, not pasted');
  if (sig.pastes) parts.push(`pasted ${sig.pastes === 1 ? 'once' : `${sig.pastes}×`} (${pasted} characters)`);
  if (sig.blocked) parts.push(`tried to paste ${sig.blocked}× (blocked)`);
  if (sig.ms) parts.push(`${fmtSpan(sig.ms)} writing`);
  if (sig.blurs) parts.push(`left the page ${sig.blurs}×`);
  const warn = pasted > Math.max(40, text.length * 0.5);
  return parts.length ? { line: parts.join(' · '), warn } : null;
}

function Signals({ sig, text }: { sig?: WriteSig; text?: string }) {
  const s = sigSummary(sig, text);
  if (!s) return null;
  return <p className={cx('text-[12px] mt-2', s.warn ? 'text-warn' : 'text-muted')} title="Measured in the candidate’s browser while they wrote">{s.warn ? 'Mostly pasted · ' : ''}{s.line}</p>;
}

function FileRow({ f }: { f: StepFile }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const open = async (download = false) => {
    setBusy(true);
    try { window.open(await fileLink(f.path, download ? f.name : undefined), '_blank', 'noopener'); } catch (e) { toast((e as Error)?.message || 'Could not open the file', 'bad'); }
    setBusy(false);
  };
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-9 w-8 rounded-md bg-accent-soft text-accent text-[10px] font-bold uppercase shrink-0">{f.name.split('.').pop()}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate">{f.name}</p>
          {f.size ? <p className="text-[12px] text-muted">{fmtSize(f.size)}</p> : null}
        </div>
        <Button size="sm" disabled={busy} onClick={() => open()}>Open</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => open(true)}>Download</Button>
      </div>
      {f.note?.trim() && <p className="text-sm text-ink-2 mt-2 whitespace-pre-wrap">{f.note}</p>}
    </div>
  );
}

function LinkRow({ url, note }: { url: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-[13px] text-ink underline decoration-line underline-offset-2 hover:decoration-ink break-all">{url}</a>
      {note?.trim() && <p className="text-sm text-ink-2 mt-1.5 whitespace-pre-wrap">{note}</p>}
    </div>
  );
}

function Voice({ v }: { v: NonNullable<Answer['voice']> }) {
  const [src, setSrc] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { fileLink(v.path).then(setSrc, () => setErr('Couldn’t load the voice note.')); }, [v.path]);
  return (
    <div>
      {src ? <audio controls src={src} className="w-full" preload="metadata" /> : <p className="text-sm text-muted">{err || 'Loading the voice note…'}</p>}
      {v.seconds ? <p className="text-[12px] text-muted mt-1">{fmtDuration(v.seconds)}</p> : null}
    </div>
  );
}

/** A Loom answer: the embed, its length and title checks, and the transcript. */
function LoomAnswer({ url, loomIdHint, title, duration, transcript, job, checkLength, n }: {
  url: string; loomIdHint?: string; title?: string; duration?: number | null; transcript?: string; job: Job | null; checkLength: boolean; n: number;
}) {
  const [live, setLive] = useState<LoomInfo | null>(null);
  const [showTx, setShowTx] = useState(false);
  const id = loomIdHint || loomId(url);
  useEffect(() => { if (id) fetchLoomInfo(url).then(setLive); }, [url, id]);
  const a = job?.activity || {};
  const dur = knownDuration(live) ?? (duration && duration >= 1 ? duration : null);
  const out = checkLength && dur != null && ((a.answer_min && dur < a.answer_min) || (a.answer_max && dur > a.answer_max));
  const t = live?.title || title || '';
  return (
    <div className="space-y-3">
      {id ? (
        <div className="aspect-video bg-ink rounded-xl overflow-hidden">
          <iframe src={embedUrl(id)} className="w-full h-full" allow="fullscreen; picture-in-picture" allowFullScreen loading="lazy" title={`Answer ${n}`} />
        </div>
      ) : (
        <div className="rounded-xl bg-warn-soft text-warn text-sm px-4 py-3">Not a Loom link, so it can’t be embedded. Open it below.</div>
      )}
      <a href={url} target="_blank" rel="noopener noreferrer" className="block font-mono text-[12px] text-muted hover:text-ink truncate max-w-full">{url}</a>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={dur == null ? 'neutral' : out ? 'warn' : 'good'}>{fmtDuration(dur)}{checkLength && rangeLabel(a.answer_min, a.answer_max) ? ` · asked ${rangeLabel(a.answer_min, a.answer_max)}` : ''}</Pill>
        {t && <Pill tone="neutral">“{t}”</Pill>}
        {live && !live.ok && live.reason !== 'not_loom' && <Pill tone="bad">Video is private or removed</Pill>}
        {live?.ok && dur == null && <Pill tone="neutral">Loom didn't share the length</Pill>}
        {a.hidden_code && t && (t.toLowerCase().includes(a.hidden_code.toLowerCase()) ? <Pill tone="good">Code word ✓</Pill> : <Pill tone="bad">No code word</Pill>)}
      </div>
      {transcript && (
        <div>
          <button className="text-sm text-muted hover:text-ink" onClick={() => setShowTx(!showTx)}>{showTx ? 'Hide' : 'Show'} transcript</button>
          {showTx && <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap bg-paper rounded-xl p-3 max-h-80 overflow-auto">{transcript}</p>}
        </div>
      )}
    </div>
  );
}

function Written({ text, sig }: { text?: string; sig?: WriteSig }) {
  return (
    <div>
      <div className="rounded-xl bg-paper-2/70 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">{text}</div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Signals sig={sig} text={text} />
        <span className="text-[12px] text-muted mt-2 tabular-nums">{words(text)} words</span>
      </div>
    </div>
  );
}

export function AnswerCard({ n, ans, job, score, onScore }:
  { n: number; ans: Answer; job: Job | null; score?: number; onScore: (v: number) => void }) {
  const q: Question | undefined = job?.questions.find((x) => x.id === ans.question_id);
  const t = ans.type || (q ? stepType(q) : 'video');
  const mode = ans.mode || (t === 'video' ? 'video' : undefined);
  const opts = q?.options || [];

  let body: React.ReactNode = null;
  if (ans.skipped) body = <p className="text-sm text-muted">Skipped. This step was optional.</p>;
  else if (mode === 'video') body = <LoomAnswer n={n} url={ans.url} loomIdHint={ans.loom_id} title={ans.title} duration={ans.duration_sec} transcript={ans.transcript} job={job} checkLength={t === 'video'} />;
  else if (mode === 'written') body = <Written text={ans.text} sig={ans.sig} />;
  else if (t === 'voice' && ans.voice) body = <Voice v={ans.voice} />;
  else if (t === 'work') {
    body = (
      <div className="space-y-2">
        {(ans.links || []).map((l, i) => <LinkRow key={i} url={l.url} note={l.note} />)}
        {(ans.files || []).map((f) => <FileRow key={f.path} f={f} />)}
        {ans.text?.trim() && <p className="text-sm text-ink-2 whitespace-pre-wrap">{ans.text}</p>}
      </div>
    );
  } else if (t === 'brief') {
    body = (
      <div className="space-y-3">
        {ans.deliverable && <LinkRow url={ans.deliverable} />}
        {(ans.files || []).map((f) => <FileRow key={f.path} f={f} />)}
        {ans.text?.trim() && <div><p className="text-[12px] text-muted mb-1">Their note</p><p className="text-sm text-ink-2 whitespace-pre-wrap">{ans.text}</p></div>}
        {ans.seconds != null && <p className="text-[12px] text-muted">Finished {fmtSpan(ans.seconds * 1000)} after opening the brief{q?.minutes ? ` (suggested: about ${q.minutes} min)` : ''}.</p>}
        {ans.walk_url && (
          <div>
            <p className="text-[12px] text-muted mb-1.5">Their walkthrough</p>
            <LoomAnswer n={n} url={ans.walk_url} loomIdHint={ans.walk_loom_id} title={ans.walk_title} job={job} checkLength={false} />
          </div>
        )}
      </div>
    );
  } else if (t === 'rank') {
    body = (
      <div>
        <ol className="space-y-1.5">
          {(ans.order || []).map((oi, pos) => (
            <li key={oi} className="flex gap-3 rounded-lg bg-paper-2/70 px-3 py-2 text-sm">
              <span className="font-mono text-muted w-4 text-right">{pos + 1}</span><span>{opts[oi] ?? `Item ${oi + 1}`}</span>
            </li>
          ))}
        </ol>
        {ans.reason?.trim() && <div className="mt-3"><p className="text-[12px] text-muted mb-1">Why their first pick is first</p><Written text={ans.reason} sig={ans.sig} /></div>}
      </div>
    );
  } else if (t === 'quiz') {
    body = (
      <div>
        {q?.material?.trim() && <div className="md-step rounded-xl bg-paper-2/70 px-4 py-3 text-sm mb-3" dangerouslySetInnerHTML={{ __html: mdToHtml(q.material) }} />}
        <ul className="space-y-1.5">
          {opts.map((o, oi) => {
            const chosen = ans.choice === oi;
            const best = q?.correct === oi;
            return (
              <li key={oi} className={cx('flex items-start gap-3 rounded-lg px-3 py-2 text-sm border',
                chosen && best ? 'border-good bg-good-soft' : chosen ? 'border-bad bg-bad-soft' : best ? 'border-good/40' : 'border-transparent bg-paper-2/50')}>
                <span className="w-16 shrink-0 text-[11px] font-medium pt-0.5">{chosen ? 'Their pick' : ''}</span>
                <span className="flex-1">{o}</span>
                {best && <span className="text-[11px] font-medium text-good shrink-0 pt-0.5">Best answer</span>}
              </li>
            );
          })}
        </ul>
        <p className="text-[12px] text-muted mt-2">
          {ans.timed_out && ans.choice == null ? 'Time ran out before they picked an answer.' : ans.seconds != null ? `Answered in ${fmtSpan(ans.seconds * 1000)}${q?.time_limit ? ` of ${fmtSpan(q.time_limit * 1000)}` : ''}.` : ''}
          {ans.timed_out && ans.choice != null ? ' Locked in when time ran out.' : ''}
        </p>
        {ans.reason?.trim() && <div className="mt-3"><p className="text-[12px] text-muted mb-1">Their reasoning</p><Written text={ans.reason} sig={ans.sig} /></div>}
      </div>
    );
  } else if (t === 'musthave') {
    body = (
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold">{ans.yesno === 'yes' ? 'Yes' : ans.yesno === 'no' ? 'No' : '—'}</span>
        {ans.ok === true && <Pill tone="good">What you need</Pill>}
        {ans.ok === false && <Pill tone="bad">You need “{q?.expected}”</Pill>}
      </div>
    );
  } else {
    body = <p className="text-sm text-muted">No answer recorded.</p>;
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid place-items-center h-8 w-8 rounded-lg bg-paper-2 shrink-0 text-ink-2"><StepIcon type={t} className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12px] text-muted">STEP {n} · {stepInfo(t).label.toUpperCase()}{mode && t !== 'video' && (t === 'choice' || t === 'critique') ? ` · ANSWERED ${mode === 'video' ? 'ON VIDEO' : 'IN WRITING'}` : ''}</p>
          <div className="md-step font-medium leading-snug mt-1 [&_p]:my-1" dangerouslySetInnerHTML={{ __html: mdToHtml(ans.question || q?.text || '') }} />
        </div>
      </div>
      <div className="mt-4">{body}</div>
      {t !== 'musthave' && !ans.skipped && (
        <div className="flex items-center justify-between gap-3 pt-3 mt-4 border-t border-line">
          <span className="text-sm text-muted">Your score</span>
          <Stars size="sm" value={score} onChange={onScore} />
        </div>
      )}
    </Card>
  );
}

/** The candidate's own words on whether and how they used AI. */
export function AiUseCard({ metrics }: { metrics: Record<string, unknown> }) {
  const ai = metrics?.ai_use as { used?: boolean; how?: string } | undefined;
  const pledge = metrics?.pledge;
  if (!ai && pledge == null) return null;
  return (
    <Card>
      <p className="text-[12px] text-muted">AI use, in their words</p>
      {ai && <p className="font-medium mt-1">{ai.used ? 'Used AI' : 'Didn’t use AI'}</p>}
      {ai?.used && ai.how?.trim() && <p className="text-sm text-ink-2 mt-1 whitespace-pre-wrap">“{ai.how}”</p>}
      {pledge === true && <p className="text-[12px] text-muted mt-2">Confirmed the work is their own.</p>}
    </Card>
  );
}
