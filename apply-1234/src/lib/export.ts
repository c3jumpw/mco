import type { Application, HEvent, Job, Note, Review } from './types';
import { STAGES } from './types';
import { behavior } from './metrics';
import { fmtDuration, fmtSpan, rangeLabel } from './util';
import { mdToHtml, postingMarkdown } from './posting';
import { stepInfo, stepType } from './steps';
import type { Answer, Question, WriteSig } from './types';

/** Typing signals in words, for exports. */
function sigText(sig?: WriteSig): string {
  if (!sig) return '';
  const typed = sig.typed || 0, pasted = sig.pasted || 0;
  const parts: string[] = [];
  if (typed + pasted) parts.push(`${Math.round((typed / (typed + pasted)) * 100)}% typed`);
  if (sig.pastes) parts.push(`pasted ${sig.pastes}× (${pasted} characters)`);
  if (sig.blocked) parts.push(`tried to paste ${sig.blocked}× where pasting was off`);
  if (sig.ms) parts.push(`${fmtSpan(sig.ms)} writing`);
  if (sig.blurs) parts.push(`left the page ${sig.blurs}× while writing`);
  return parts.join(', ');
}

/** One step answer as Markdown lines. */
function answerLines(ans: Answer, q: Question | undefined, opts: ExportOpts): string[] {
  const t = ans.type || (q ? stepType(q) : 'video');
  const out: string[] = [];
  const video = (url: string, dur?: number | null, title?: string, transcript?: string) => {
    const meta = [dur != null ? `length ${fmtDuration(dur)}` : '', title ? `titled "${title}"` : ''].filter(Boolean).join(', ');
    out.push(`- Video: ${url}${meta ? ` (${meta})` : ''}`);
    if (opts.transcripts) {
      if (transcript?.trim()) out.push('- Transcript:', '', quote(transcript));
      else out.push('- Transcript: not provided');
    }
  };
  const written = (label: string, text?: string, sig?: WriteSig) => {
    out.push(`- ${label}:`, '', quote(text || ''));
    if (opts.signals && sigText(sig)) out.push('', `- How it was written: ${sigText(sig)}`);
  };
  if (ans.skipped) { out.push('- Skipped (optional step)'); return out; }
  if (t === 'video' || ans.mode === 'video') { video(ans.url, ans.duration_sec, ans.title, ans.transcript); return out; }
  if (ans.mode === 'written') { written('Written answer', ans.text, ans.sig); return out; }
  switch (t) {
    case 'voice': out.push(`- Voice note${ans.voice?.seconds ? ` (${fmtDuration(ans.voice.seconds)})` : ''}: listen on the candidate's page; no transcript is included.`); break;
    case 'work':
      for (const l of ans.links || []) out.push(`- Work sample: ${l.url}${l.note ? ` — ${l.note.replace(/\n+/g, ' ')}` : ''}`);
      for (const f of ans.files || []) out.push(`- Work sample file: ${f.name}${f.note ? ` — ${f.note.replace(/\n+/g, ' ')}` : ''} (open it from the candidate's page)`);
      break;
    case 'brief':
      if (ans.deliverable) out.push(`- Their work: ${ans.deliverable}`);
      for (const f of ans.files || []) out.push(`- Their work (file): ${f.name} (open it from the candidate's page)`);
      if (ans.seconds != null) out.push(`- Time from opening the brief to finishing: ${fmtSpan(ans.seconds * 1000)}${q?.minutes ? ` (suggested ${q.minutes} min)` : ''}`);
      if (ans.text?.trim()) out.push('- Their note:', '', quote(ans.text));
      if (ans.walk_url) out.push(`- Walkthrough video: ${ans.walk_url}${ans.walk_title ? ` (titled "${ans.walk_title}")` : ''}`);
      break;
    case 'rank':
      out.push(`- Their order: ${(ans.order || []).map((i, pos) => `${pos + 1}. ${q?.options?.[i] ?? `item ${i + 1}`}`).join('; ')}`);
      if (ans.reason?.trim()) written('Why', ans.reason, ans.sig);
      break;
    case 'quiz': {
      const opts2 = q?.options || [];
      out.push(`- Options: ${opts2.map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`).join(' ')}`);
      out.push(`- Their answer: ${ans.choice != null ? `(${String.fromCharCode(65 + ans.choice)}) ${opts2[ans.choice] ?? ''}` : 'none (time ran out)'}${ans.correct === true ? ' — the best answer' : ans.correct === false && q?.correct != null ? ` — best answer was (${String.fromCharCode(65 + q.correct)})` : ''}`);
      if (ans.seconds != null) out.push(`- Time taken: ${fmtSpan(ans.seconds * 1000)}${q?.time_limit ? ` of ${fmtSpan(q.time_limit * 1000)}` : ''}`);
      if (ans.reason?.trim()) written('Their reasoning', ans.reason, ans.sig);
      break;
    }
    case 'musthave': out.push(`- Answer: ${ans.yesno || '—'}${ans.ok === false ? ` (you need "${q?.expected}")` : ''}`); break;
  }
  return out;
}

export interface ExportOpts {
  anonymize: boolean;
  transcripts: boolean;
  signals: boolean;
  notes: boolean;
}

export interface ExportItem {
  app: Application;
  reviews: Review[];
  notes: Note[];
  events: HEvent[];
}

const stageLabel = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s;
const yn = (v: boolean | null | undefined) => (v == null ? 'not checked' : v ? 'yes' : 'no');
const iso = (s?: string | null) => (s ? new Date(s).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');

function avg(nums: number[]): number | null {
  const v = nums.filter((n) => typeof n === 'number' && n > 0);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

export function reviewAverage(reviews: Review[]): number | null {
  return avg(reviews.map((r) => r.overall ?? 0));
}

function quote(text: string): string {
  return text.trim().split('\n').map((l) => `> ${l}`).join('\n');
}

export function aiPreface(job: Job, count: number): string {
  return `# Hiring review pack: ${job.title}

_Exported ${iso(new Date().toISOString())} from apply1234 · ${count} candidate${count === 1 ? '' : 's'}_

## Instructions for the AI reviewer
You are helping a hiring manager review candidates for the role below.

- Use only the evidence in this document: answers, transcripts, process signals, reviewer scores and notes.
- Written answers note how they were written (typed or pasted, time taken). Treat heavy pasting as something to ask about in the interview, not as proof of anything. Where the job asked, each candidate's own account of their AI use is included.
- Score each candidate against the rubric, citing specific moments from their answers.
- Do not infer or weigh age, gender, race, ethnicity, nationality, accent, disability, or any other protected characteristic.
- If a transcript is missing, say so instead of guessing what the video contains.
- Finish with a ranked shortlist, the strongest evidence for each person, and two follow-up interview questions per person.
`;
}

export function jobContext(job: Job): string {
  const a = job.activity || {};
  const qs = (job.questions || []).map((q, i) => `${i + 1}. ${q.text}${q.guidance ? ` _(${q.guidance})_` : ''}`).join('\n');
  return `## The role

### Posting
${postingMarkdown(job.posting || '(no posting text)', [], '')
    .replace(/^#{1,2}\s/gm, '#### ')}

### Screening questions (answered on video)
${qs || '(none)'}

Requested answer length: ${rangeLabel(a.answer_min, a.answer_max) || 'not set'}.

### Rubric
${(job.rubric || []).map((r) => `- ${r}`).join('\n') || '- (none)'}

### What the process measures
- Finding the application page meant reading the full posting and assembling a link from fragments hidden in it (attention to detail, following instructions, resourcefulness).
- Answering required installing Loom and recording on camera (initiative, adapting to a new tool, spoken communication).
`;
}

export function candidateMarkdown(job: Job, item: ExportItem, index: number, opts: ExportOpts): string {
  const { app, reviews, notes, events } = item;
  const name = opts.anonymize ? `Candidate ${index + 1}` : app.name;
  const b = behavior(app, events);
  const qIndex = new Map((job.questions || []).map((q, i) => [q.id, i + 1]));
  const lines: string[] = [];
  lines.push(`## ${name}`);
  if (!opts.anonymize) lines.push(`- Email: ${app.email}`);
  lines.push(`- Stage: ${stageLabel(app.stage)}`);
  lines.push(`- Submitted: ${iso(app.submitted_at)}`);
  if (app.tags?.length) lines.push(`- Tags: ${app.tags.join(', ')}`);
  lines.push(`- Applied through: ${(app.metrics as any)?.source_label || 'main link'}`);
  const av = reviewAverage(reviews);
  if (av != null) lines.push(`- Average reviewer score: ${av} / 5 (${reviews.length} review${reviews.length === 1 ? '' : 's'})`);
  if (app.metrics?.preview) lines.push(`- Note: this was a test submission by the hiring team.`);

  if (opts.signals) {
    lines.push('', '### Process signals');
    lines.push(`- Wrong link attempts before finding the page: ${b.wrongAttempts}${b.wrongPaths.length ? ` (tried: ${b.wrongPaths.slice(0, 8).map((w) => `"${w.path || '/'}"`).join(', ')})` : ''}`);
    if (b.firstSeenToArrivalMs != null) lines.push(`- Time from first wrong attempt to finding the page: ${fmtSpan(b.firstSeenToArrivalMs)}`);
    lines.push(`- Time from first opening the activity to submitting: ${fmtSpan(b.arrivalToSubmitMs)}`);
    if (b.instructionsMs != null) lines.push(`- Time on the setup instructions: ${fmtSpan(b.instructionsMs)}`);
    if (b.activeSeconds != null) lines.push(`- Active time on the page: ${fmtSpan(b.activeSeconds * 1000)}`);
    lines.push(`- Visits to the activity page: ${b.arrivals}`);
    lines.push(`- Switched away from the page: ${b.tabSwitches} time${b.tabSwitches === 1 ? '' : 's'}`);
    lines.push(`- Links that failed the format check while answering: ${b.invalidLinks}`);
    const f = app.flags || {};
    lines.push(`- Auto-checks: all Loom links ${yn(f.all_loom_links)} · answer lengths in range ${yn(f.lengths_in_range)} · transcripts complete ${yn(f.transcripts_ok)} · hidden code found ${yn(f.hidden_code_ok)} · duplicate email ${yn(f.duplicate_email)}`);
    if (f.musthave_ok != null) lines.push(`- Must-haves all as needed: ${yn(f.musthave_ok)}`);
    if (f.quiz_total) lines.push(`- Quick scenarios with the best answer: ${f.quiz_right || 0} of ${f.quiz_total}`);
    if (f.pasted) lines.push('- At least one written answer was mostly pasted in rather than typed');
  }
  const ai = (app.metrics as any)?.ai_use as { used?: boolean; how?: string } | undefined;
  if (ai) lines.push(`- AI use, in their words: ${ai.used ? `used AI${ai.how ? ` — "${ai.how.replace(/\n+/g, ' ')}"` : ''}` : 'didn’t use AI'}`);

  lines.push('', '### Answers');
  const qById = new Map((job.questions || []).map((q) => [q.id, q]));
  for (const ans of app.answers || []) {
    const n = qIndex.get(ans.question_id);
    const q = qById.get(ans.question_id);
    const t = ans.type || (q ? stepType(q) : 'video');
    lines.push('', `**Q${n ?? '?'}${t !== 'video' ? ` (${stepInfo(t).label})` : ''}. ${ans.question.replace(/\n+/g, ' ')}**`);
    lines.push(...answerLines(ans, q, opts));
  }

  const files = app.attachments || [];
  if (files.length || (app.cover_letter || '').trim()) {
    lines.push('', '### Résumé and cover letter');
    for (const f of files) lines.push(`- ${f.kind === 'resume' ? 'Résumé' : f.kind === 'cover_letter' ? 'Cover letter' : 'File'} attached: ${f.name} (open it from the candidate's page; its text is not included here)`);
    if ((app.cover_letter || '').trim()) lines.push('- Cover letter (written in the form):', '', quote(app.cover_letter || ''));
  }

  if (reviews.length) {
    lines.push('', '### Reviewer scores');
    reviews.forEach((r, i) => {
      const who = opts.anonymize ? `Reviewer ${i + 1}` : r.reviewer_email;
      const crit = Object.entries(r.criteria || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ');
      const per = Object.entries(r.scores || {}).filter(([, v]) => v).map(([k, v]) => `Q${qIndex.get(k) ?? '?'} ${v}`).join(', ');
      lines.push(`- ${who}: overall ${r.overall ?? '—'}/5${r.recommendation ? `, recommends ${r.recommendation.replace('_', ' ')}` : ''}${crit ? `; ${crit}` : ''}${per ? `; per question ${per}` : ''}`);
    });
  }

  if (opts.notes && notes.length) {
    lines.push('', '### Notes');
    notes.forEach((nt) => lines.push(`- ${iso(nt.created_at)}${opts.anonymize ? '' : ` · ${nt.author_email}`}${nt.kind === 'interview' ? ' · interview' : ''}: ${nt.body.replace(/\n+/g, ' ')}`));
  }

  const ia = app.interview_answers || {};
  const iq = (job.interview_questions || []).filter((q) => ia[q.id]?.notes || ia[q.id]?.score);
  const fu = (ia._followups?.notes || '').trim();
  if (app.interview_at || iq.length || app.interview_summary || fu) {
    lines.push('', '### Interview');
    if (app.interview_at) lines.push(`- Scheduled: ${iso(app.interview_at)}`);
    iq.forEach((q) => lines.push(`- ${q.text} — ${ia[q.id]?.notes || '(no notes)'}${ia[q.id]?.score ? ` (score ${ia[q.id]!.score}/5)` : ''}`));
    if (fu) lines.push('- Follow-ups from their answers:', '', quote(fu));
    if (app.interview_summary) lines.push(`- Summary: ${app.interview_summary}`);
  }
  return lines.join('\n');
}

export function exportMarkdown(job: Job, items: ExportItem[], opts: ExportOpts): string {
  return [
    aiPreface(job, items.length),
    jobContext(job),
    '---',
    '# Candidates',
    ...items.map((it, i) => candidateMarkdown(job, it, i, opts) + '\n\n---'),
  ].join('\n\n');
}

export function htmlDocument(title: string, md: string): string {
  const body = mdToHtml(md);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:#16151a;max-width:820px;margin:40px auto;padding:0 20px;background:#fff}
h1{font-size:28px;margin:0 0 8px}h2{font-size:21px;margin:32px 0 8px;border-top:1px solid #e2ded4;padding-top:20px}
h3{font-size:16px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#6e6c73}h4{margin:16px 0 4px}
p{margin:8px 0}ul{padding-left:20px}li{margin:3px 0}code{background:#f5f3ee;padding:1px 4px;border-radius:4px}
.q{border-left:3px solid #e2ded4;padding-left:12px;color:#3a3940}a{color:#c2410c}
</style></head><body>
${body.replace(/<p>&gt; /g, '<p class="q">').replace(/<br>&gt; /g, '<br>')}
</body></html>`;
}

/** A prompt for interview follow-ups drawn from one candidate's own answers. */
export function followUpPrompt(job: Job, app: Application): string {
  const opts: ExportOpts = { anonymize: true, transcripts: true, signals: true, notes: false };
  const qById = new Map((job.questions || []).map((q) => [q.id, q]));
  const body = (app.answers || []).map((ans, i) => {
    const q = qById.get(ans.question_id);
    const t = ans.type || (q ? stepType(q) : 'video');
    return [`**Step ${i + 1} (${stepInfo(t).label}). ${ans.question.replace(/\n+/g, ' ')}**`, ...answerLines(ans, q, opts)].join('\n');
  }).join('\n\n');
  const ai = (app.metrics as any)?.ai_use as { used?: boolean; how?: string } | undefined;
  return `You are helping me prepare a 30-minute interview for the ${job.title} role. Below are one candidate's answers to our application activity.

Write 6 follow-up questions for this person that:
- dig into specifics they mentioned (names, numbers, decisions) and ask for the detail behind them;
- check they can explain and extend their own work: what they'd change, what they'd do with half the time or budget, why they chose one option over another. Someone who did the work answers easily; someone who leaned on AI or copied it will struggle;
- kindly probe any answer that was mostly pasted${ai?.used ? ', and how they used AI' : ''};
- for quick scenarios where they missed the best answer, ask them to talk through how they'd handle it.

Return only the questions, one per line, as "- the question (what it checks, in a few words)".

${ai ? `They said: ${ai.used ? `I used AI${ai.how ? ` — "${ai.how}"` : ''}` : 'I didn’t use AI'}.\n\n` : ''}Their answers:

${body || '(no answers)'}
`;
}
