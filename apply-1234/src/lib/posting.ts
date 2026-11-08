import type { Fragment } from './types';

export const TOKEN_RE = /\{\{\s*part\s*(\d+)\s*\}\}/gi;

export function fullUrl(domain: string, slug: string | null | undefined): string {
  return `${(domain || '').trim().replace(/\/+$/, '')}/${slug || ''}`;
}

/** Splits a URL into n pieces, preferring natural breaks (., /, -, letter↔digit). */
export function splitUrl(full: string, n: number): string[] {
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

/** Minimal, safe Markdown → HTML (headings, lists, paragraphs, bold/italic, links). */
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
  for (const raw of lines) {
    const line = raw.trimEnd();
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
  flushPara();
  flushList();
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

export function aiPostingPrompt(title: string, notes: string, parts: number, hintFormat: string): string {
  return `You are helping me write a job posting.

Role: ${title}

My notes on the role:
"""
${notes || '(no notes yet)'}
"""

Write a clear, specific job posting in Markdown with sections (## headings) and bullet lists. Keep it honest and concrete, avoid buzzwords, and write in a warm, direct voice.

Important: the application link is hidden in the posting as ${parts} fragments. Place these exact placeholder tokens on their own lines, spread across different sections so a careful reader has to read the whole posting to find them all, in order:
${Array.from({ length: parts }, (_, i) => `{{part${i + 1}}}`).join(', ')}

Each token will be replaced with a line like "${hintText(hintFormat, 0, parts, '…')}". Do not write the URL yourself. End with a short "How to apply" section telling the reader that pieces of the link are hidden in the posting and must be combined in order.`;
}

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
