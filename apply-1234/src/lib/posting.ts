import type { Fragment, Job, Question } from './types';
import { stepSpec } from './steps';

export const TOKEN_RE = /\{\{\s*part\s*(\d+)\s*\}\}/gi;

export function fullUrl(domain: string, slug: string | null | undefined): string {
  return `${(domain || '').trim().replace(/\/+$/, '')}/${slug || ''}`;
}

/** Splits a path like "qkqg-vrsd" into `count` pieces, keeping dashes on the left piece. */
function splitPath(path: string, count: number): string[] {
  let pieces = path.split(/(?<=-)/).filter(Boolean);
  while (pieces.length > count) {
    let best = 0;
    for (let i = 1; i < pieces.length - 1; i++) {
      if (pieces[i].length + pieces[i + 1].length < pieces[best].length + pieces[best + 1].length) best = i;
    }
    pieces.splice(best, 2, pieces[best] + pieces[best + 1]);
  }
  while (pieces.length < count) {
    let idx = 0;
    pieces.forEach((p, i) => { if (p.length > pieces[idx].length) idx = i; });
    const p = pieces[idx];
    if (p.length < 2) break;
    const mid = Math.ceil(p.length / 2);
    pieces.splice(idx, 1, p.slice(0, mid), p.slice(mid));
  }
  return pieces;
}

/** Splits "apply1234.com/qkqg-vrsd" into n pieces: name, ".com/", then the path. */
export function splitUrl(full: string, n: number): string[] {
  const slash = full.indexOf('/');
  const dot = slash > 0 ? full.lastIndexOf('.', slash) : -1;
  if (slash > 0 && slash < full.length - 1 && dot > 0) {
    const domain = full.slice(0, slash);
    const path = full.slice(slash + 1);
    if (n <= 2) return [domain + '/', path];
    const domParts = [domain.slice(0, dot), domain.slice(dot) + '/'];
    return [...domParts, ...splitPath(path, n - domParts.length)];
  }
  return splitGeneric(full, n);
}

/** Fallback: splits any string into n pieces, preferring natural breaks (., /, -, letter↔digit). */
function splitGeneric(full: string, n: number): string[] {
  const len = full.length;
  n = Math.max(2, Math.min(n, 8, len));
  const isBreak = (a: string, b: string) =>
    './-'.includes(b) || './-'.includes(a) || (/[a-z]/i.test(a) && /\d/.test(b)) || (/\d/.test(a) && /[a-z]/i.test(b));
  const cands: number[] = [];
  for (let i = 1; i < len; i++) if (isBreak(full[i - 1], full[i])) cands.push(i);
  const cuts: number[] = [];
  for (let k = 1; k < n; k++) {
    const ideal = Math.round((len * k) / n);
    const prev = cuts.length ? cuts[cuts.length - 1] : 0;
    let best = -1;
    let bestD = Infinity;
    for (const c of cands) {
      if (c > prev && c < len) {
        const d = Math.abs(c - ideal);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    if (best < 0 || bestD > len / n) best = Math.min(len - 1, Math.max(prev + 1, ideal));
    if (best <= prev) best = prev + 1;
    if (best >= len) break;
    cuts.push(best);
  }
  const out: string[] = [];
  let s = 0;
  for (const c of cuts) { out.push(full.slice(s, c)); s = c; }
  out.push(full.slice(s));
  return out.filter(Boolean);
}

export function hintText(format: string, i: number, total: number, text: string): string {
  return (format || '{text}')
    .replace(/\{n\}/g, String(i + 1))
    .replace(/\{total\}/g, String(total))
    .replace(/\{text\}/g, text);
}

export function placedParts(posting: string, total: number): { placed: number[]; missing: number[] } {
  const found = new Set<number>();
  for (const m of posting.matchAll(TOKEN_RE)) found.add(Number(m[1]));
  const placed: number[] = [];
  const missing: number[] = [];
  for (let i = 1; i <= total; i++) (found.has(i) ? placed : missing).push(i);
  return { placed, missing };
}

/** Replace {{partN}} tokens with their hint text. `wrap` lets HTML output style them. */
function fillTokens(md: string, fragments: Fragment[], format: string, wrap?: (s: string) => string): string {
  return md.replace(TOKEN_RE, (_, num) => {
    const i = Number(num) - 1;
    const f = fragments[i];
    if (!f) return '';
    const t = hintText(format, i, fragments.length, f.text);
    return wrap ? wrap(t) : t;
  });
}

export function postingMarkdown(md: string, fragments: Fragment[], format: string): string {
  return fillTokens(md, fragments, format);
}

export function postingPlain(md: string, fragments: Fragment[], format: string): string {
  return fillTokens(md, fragments, format)
    .split('\n')
    .map((l) => l
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*[-*]\s+/, '• ')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|[\s(])[*_]([^*_]+)[*_]/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  // s is already HTML-escaped
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_]+)_/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function tableHtml(rows: string[]): string {
  const cells = (r: string) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(esc(c.trim())));
  const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
  if (!body.length) return '';
  const [head, ...rest] = body;
  return `<div class="md-table"><table><thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join('')}</tr></thead>`
    + `<tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Minimal, safe Markdown → HTML (headings, lists, paragraphs, bold/italic, links, code blocks, tables). */
export function mdToHtml(md: string, hintClass?: string, fragments?: Fragment[], format?: string): string {
  const marks: string[] = [];
  let src = md;
  if (fragments) {
    src = fillTokens(md, fragments, format || '{text}', (t) => {
      marks.push(t);
      return `\u0000${marks.length - 1}\u0000`;
    });
  }
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map((l) => inline(esc(l))).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(esc(i))}</li>`).join('')}</${list.type}>`); list = null; } };
  let code: string[] | null = null;
  let table: string[] = [];
  const flushTable = () => { if (table.length) { out.push(tableHtml(table)); table = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      if (code) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; }
      else { flushPara(); flushList(); flushTable(); code = []; }
      continue;
    }
    if (code) { code.push(raw); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) { flushPara(); flushList(); table.push(line); continue; }
    flushTable();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (h) { flushPara(); flushList(); out.push(`<h${h[1].length}>${inline(esc(h[2]))}</h${h[1].length}>`); continue; }
    if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push((ul || ol)![1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  if (code) out.push(`<pre><code>${esc((code as string[]).join('\n'))}</code></pre>`);
  flushPara();
  flushList();
  flushTable();
  let html = out.join('\n');
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) =>
    hintClass ? `<span class="${hintClass}">${esc(marks[Number(i)])}</span>` : esc(marks[Number(i)]));
  return html;
}

export const DEFAULT_POSTING = `## About the role
Describe the role in two or three sentences: what this person owns and why it matters.

{{part1}}

## What you'll do
- Responsibility one
- Responsibility two
- Responsibility three

{{part2}}

## What we're looking for
- Must-have one
- Must-have two
- Nice-to-have

{{part3}}

## How to apply
Read this whole posting carefully. Pieces of the application link are hidden in it. Put them together, in order, and open the link in your browser.`;

export function aiQuestionsPrompt(title: string, notes: string, posting: string, count: number): string {
  return `I'm hiring for: ${title}

My notes:
"""
${notes || '(none)'}
"""

The posting:
"""
${posting || '(none)'}
"""

Write ${count} open-ended questions that a person who would truly thrive in this role could answer well in a 1–3 minute video. Each question should reveal real experience, judgment, and how they think — not just yes/no or rehearsed answers. Mix: one about a specific past situation, one about how they'd approach a realistic task in this role, one about how they learn or adapt, and others that fit the notes.

Return only the questions, one per line, with no numbering or extra text.`;
}

/** A prompt that writes (or rewrites) a job's activity steps, answered in "## Step N" blocks. */
export function aiStepsPrompt(title: string, notes: string, posting: string, steps: Question[]): string {
  return `I'm hiring for: ${title || '(untitled role)'}.

My notes:
"""
${notes.trim() || '(none)'}
"""

The job posting:
"""
${posting.trim().slice(0, 6000) || '(none)'}
"""

${stepsSection(steps).replace('# ACTIVITY STEPS\n', '')}

Reply with only the steps, starting at "## Step 1". Don't wrap your reply in a code block.`;
}

export function aiInterviewPrompt(title: string, notes: string, questions: string[]): string {
  return `I'm interviewing candidates for: ${title}

My notes on the role:
"""
${notes || '(none)'}
"""

They have already answered these screening questions on video:
${questions.map((q) => `- ${q}`).join('\n') || '- (none)'}

Write 8 live-interview questions that go deeper than the screening questions: follow-ups that test real experience, problem solving under realistic constraints, and how they work with others. Return only the questions, one per line, with no numbering.`;
}

export const GENERAL_INTERVIEW_QUESTIONS = [
  'Walk me through your background and what brought you to apply for this role.',
  'What did you think of the application activity, and how did you approach finding the link?',
  'Tell me about a time you had to learn a new tool or process quickly. How did you go about it?',
  'Describe a mistake you made at work, how you handled it, and what changed afterward.',
  'What kind of feedback helps you do your best work?',
  'What would you want to have accomplished 90 days into this role?',
  'What questions do you have for us?',
];

/* ───────────── link variants (per job-board source) ───────────── */

export function variantSlug(slug: string | null | undefined, sourceCode?: string | null): string {
  return sourceCode ? `${slug}-${sourceCode}` : `${slug || ''}`;
}

/** Link pieces for the base link, or for one source's variant of it. */
export function fragmentsFor(job: Pick<Job, 'domain' | 'slug' | 'fragments'>, sourceCode?: string | null): Fragment[] {
  if (!sourceCode) return job.fragments;
  const base = fullUrl(job.domain, job.slug);
  if (job.fragments.length && job.fragments.map((f) => f.text).join('') === base) {
    return job.fragments.map((f, i) => (i === job.fragments.length - 1 ? { text: `${f.text}-${sourceCode}` } : f));
  }
  const n = Math.max(2, job.fragments.length || 3);
  return splitUrl(fullUrl(job.domain, variantSlug(job.slug, sourceCode)), n).map((text) => ({ text }));
}

/* ───────────── structured AI prompt + parser ───────────── */

/** The code-word line for the posting. Jobs with video steps ask for it in video titles; others in a written answer. */
export const CODE_WORD_SENTENCE = (word: string, video = true) => video
  ? `One more detail for careful readers: include the word **${word}** in the title of every video you record.`
  : `One more detail for careful readers: use the word **${word}** somewhere in one of your written answers.`;

/** Whether a job's steps include a recorded video, which decides where the code word goes. */
export const stepsHaveVideo = (steps?: Question[]) => !steps || !steps.length || steps.some((q) => !q.type || q.type === 'video' || q.type === 'choice');

export interface JobPromptOptions {
  title?: string;
  notes: string;
  parts: number;
  questionCount: number;
  answerRange: string; // e.g. "1–3 minutes"
  codeWord?: string;
  steps?: Question[];   // when given, the AI writes these activity steps instead of video questions
}

function stepsSection(steps: Question[]): string {
  return `# ACTIVITY STEPS
The candidate completes these ${steps.length} steps, in this order. Write each one for this role, using specifics from my notes, so that someone who would thrive here does well and generic answers stand out. Keep each step's type. Keep any [square-bracket placeholder] you can't fill from my notes. Format every step exactly like this, with only the lines that apply:
## Step 1
Question: the question or task, written to the candidate
Guidance: one short tip for the candidate
Options:
- an option
- another option
Correct: the number of the right option (quick scenarios only)
Expected: yes or no (must-haves only)
Material: context, numbers or data the candidate needs, in Markdown (only where it helps)

Across the video and written questions, mix a specific past situation, a realistic task or scenario from this role, and something that shows how they think or learn. Quick scenarios need one clearly best option and plausible alternatives.

The steps:
${steps.map((q, i) => `- ${stepSpec(q, i)}`).join('\n')}`;
}

export function aiJobPrompt(o: JobPromptOptions): string {
  const tokens = Array.from({ length: o.parts }, (_, i) => `{{part${i + 1}}}`).join(', ');
  return `You are helping me hire. Turn my notes into a job posting and interview material.

Reply in Markdown using EXACTLY the structure below: these five # section headings, spelled exactly as shown, each on its own line, in this order. Put nothing before the first heading. Do not wrap your reply in a code block.

# TITLE
One line: a clear, specific job title.${o.title ? ` Use "${o.title}" unless it is unclear.` : ''}

# POSTING
The full job posting in Markdown. Inside it, use only ## and ### headings, never a single #. Keep paragraphs short and use bullet lists. Sections, in order: About the role, What you'll do, What we're looking for, Your first 90 days (only if my notes mention onboarding or probation), Details, How to apply.
- Put each of these placeholder tokens on its own line, in this order, spread across different sections: ${tokens}. Put the last token just before "How to apply". Don't explain them; they're replaced with pieces of the application link.
- In "Details", list schedule, location and pay. If my notes don't say, write [add schedule], [add location] and [add pay range]. Don't invent them.
- "How to apply" must say: we don't take résumés; the link to the application is hidden in this posting in pieces; put the pieces together in order and open the link in a browser.${o.codeWord ? `\n- End "How to apply" with exactly this sentence: ${CODE_WORD_SENTENCE(o.codeWord, stepsHaveVideo(o.steps))}` : ''}

${o.steps?.length ? stepsSection(o.steps) : `# SCREENING QUESTIONS
${o.questionCount} questions the candidate answers on video, ${o.answerRange} each. Someone who would thrive in this role should answer them well. Include a specific past situation, a realistic scenario from this role, a "teach us something" question, and one about how they approached this application. Format each exactly like this:
1. The question
   Guidance: one short tip for the candidate`}

# INTERVIEW QUESTIONS
8 live-interview questions that go deeper than the ${o.steps?.length ? 'activity' : 'screening questions'}, one per line, formatted as "- [general] question" for questions that suit any role or "- [custom] question" for questions specific to this role. At least 5 should be custom.

# RUBRIC
4 to 6 short criteria (2 to 4 words each) for scoring candidates, one per line as "- Criterion".

Write honestly and concretely in a warm, direct voice. Avoid buzzwords and don't invent facts that aren't in my notes.

My notes:
"""
${o.notes.trim() || '(no notes)'}
"""`;
}

export interface ParsedJob {
  title: string;
  posting: string;
  questions: { text: string; guidance: string }[];
  steps: Partial<Question>[]; // from "# ACTIVITY STEPS"
  interview: { text: string; kind: 'general' | 'custom' }[];
  rubric: string[];
  sections: string[]; // which headings were found
}

const SECTION_RE = /^\s*#{1,2}\s*\**\s*(title|posting|job posting|screening questions|questions|activity steps|steps|interview questions|rubric)\s*\**\s*:?\s*$/i;
const STEP_RE = /^\s*#{2,4}\s*\**\s*step\s*(\d+)\b.*$/i;
const FIELD_RE = /^\s*[-*]?\s*\**\s*(question|task|guidance|tip|options|correct|correct option|expected|material)\s*\**\s*:\s*\**\s*(.*)$/i;

/** Reads "## Step N" blocks with Question/Guidance/Options/Correct/Expected/Material lines. */
export function parseSteps(lines: string[]): Partial<Question>[] {
  const out: Partial<Question>[] = [];
  let cur: Record<string, string[]> | null = null;
  let field = '';
  let fence = false;
  const finish = () => {
    if (!cur) return;
    const get = (k: string) => (cur![k] || []).join('\n').trim();
    const step: Partial<Question> = {};
    const text = get('question');
    if (text) step.text = text.replace(/^\*\*|\*\*$/g, '').trim();
    if (get('guidance')) step.guidance = clean(get('guidance'));
    if (get('material')) step.material = get('material');
    const opts = (cur['options'] || []).map((l) => l.match(/^\s*(?:[-*•]|\d+[.)]|[A-Ha-h][.)])\s+(.*)$/)?.[1] ?? '').map(clean).filter(Boolean);
    if (opts.length) step.options = opts;
    const c = get('correct').match(/\d+|^[A-Ha-h]\b/);
    if (c) step.correct = /\d/.test(c[0]) ? Number(c[0]) - 1 : c[0].toUpperCase().charCodeAt(0) - 65;
    const e = get('expected').toLowerCase().match(/\b(yes|no)\b/);
    if (e) step.expected = e[1] as 'yes' | 'no';
    out.push(step);
    cur = null;
  };
  for (const line of lines) {
    if (!fence && STEP_RE.test(line)) { finish(); cur = {}; field = ''; continue; }
    if (!cur) continue;
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && line.match(FIELD_RE);
    if (m) {
      const k = m[1].toLowerCase();
      field = k === 'task' ? 'question' : k === 'tip' ? 'guidance' : k.startsWith('correct') ? 'correct' : k;
      cur[field] = m[2].trim() ? [m[2]] : [];
      continue;
    }
    if (field) (cur[field] ||= []).push(line);
  }
  finish();
  return out;
}

const clean = (s: string) => s.replace(/\*\*/g, '').replace(/^["“”']+|["“”']+$/g, '').trim();

export function parseAiJob(raw: string): ParsedJob {
  let text = (raw || '').replace(/\r\n/g, '\n').trim();
  // strip a wrapping code fence if the AI added one
  text = text.replace(/^```[a-z]*\s*\n/i, '').replace(/\n```\s*$/i, '');
  const lines = text.split('\n');
  const buckets: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of lines) {
    const m = line.match(SECTION_RE);
    // "## Questions" style headings only count when the AI wrote them in capitals
    if (m && (/^\s*#\s/.test(line) || m[1] === m[1].toUpperCase())) {
      const k = m[1].toLowerCase();
      current = k === 'job posting' ? 'posting' : k === 'questions' ? 'screening questions' : k === 'steps' ? 'activity steps' : k;
      buckets[current] = [];
      continue;
    }
    if (current) buckets[current].push(line);
  }
  const sections = Object.keys(buckets);
  if (!sections.length) {
    return { title: '', posting: text, questions: [], steps: [], interview: [], rubric: [], sections: [] };
  }

  const title = clean((buckets['title'] || []).find((l) => l.trim())?.replace(/^#+\s*/, '') || '');

  const posting = (buckets['posting'] || []).join('\n').trim().replace(/^#\s+/gm, '## ');

  const questions: ParsedJob['questions'] = [];
  for (const l of buckets['screening questions'] || []) {
    const q = l.match(/^\s*(?:\d+[.)]|[-*•])\s+(.*)$/);
    const g = l.match(/^\s*[-*]?\s*(?:guidance|tip)\s*:\s*(.*)$/i);
    if (g && questions.length) questions[questions.length - 1].guidance = clean(g[1]);
    else if (q) questions.push({ text: clean(q[1]), guidance: '' });
    else if (l.trim() && questions.length && !questions[questions.length - 1].guidance) {
      questions[questions.length - 1].text += ' ' + clean(l);
    }
  }

  const interview: ParsedJob['interview'] = [];
  for (const l of buckets['interview questions'] || []) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(?:\[(general|custom)\]\s*)?(.*)$/i);
    if (m && m[2].trim()) interview.push({ text: clean(m[2]), kind: (m[1]?.toLowerCase() as 'general' | 'custom') || 'custom' });
  }

  const rubric: string[] = [];
  for (const l of buckets['rubric'] || []) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      const c = clean(m[1]).split(/\s+[—–-]\s+|:\s/)[0].trim();
      if (c && !rubric.includes(c)) rubric.push(c.slice(0, 40));
    }
  }
  const steps = parseSteps(buckets['activity steps'] || []);
  return { title, posting, questions, steps, interview, rubric: rubric.slice(0, 8), sections };
}

/** Adds any {{partN}} tokens the AI left out, just before "How to apply" (or at the end). */
export function insertMissingTokens(posting: string, total: number): string {
  const { missing } = placedParts(posting, total);
  if (!missing.length) return posting;
  const block = missing.map((n) => `{{part${n}}}`).join('\n\n');
  const idx = posting.search(/^#{2,3}\s+how to apply/im);
  if (idx >= 0) return posting.slice(0, idx) + block + '\n\n' + posting.slice(idx);
  return posting.trimEnd() + '\n\n' + block + '\n';
}

export function ensureCodeWord(posting: string, word?: string, video = true): string {
  if (!word || posting.toLowerCase().includes(word.toLowerCase())) return posting;
  return posting.trimEnd() + '\n\n' + CODE_WORD_SENTENCE(word, video) + '\n';
}
