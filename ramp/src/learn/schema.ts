// Checks interactive blocks (builder, imports) and describes the module format for the RAMP Assistant.
// When a block type is added or changed, update validate() and FORMAT below: the Assistant's setup prompt is built
// from FORMAT, so it always matches what this version of RAMP can import.
import type { InteractiveBlock } from './types';

const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const arr = (v: unknown, min = 1) => Array.isArray(v) && v.length >= min;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Problems with one interactive block, in plain words. Empty when it's fine. */
export function validateInteractive(b: InteractiveBlock): string[] {
  const e: string[] = [];
  const need = (ok: boolean, msg: string) => { if (!ok) e.push(msg); };
  switch (b.type) {
    case 'visual':
      need(str(b.title), 'Add a title.');
      need(['steps', 'cycle', 'cards', 'pillars', 'compare', 'timeline'].includes(b.layout), 'Pick a layout: steps, cycle, cards, pillars, compare or timeline.');
      need(arr(b.items, b.layout === 'compare' ? 2 : 2) && b.items.every((i) => str(i.title)), 'Add at least two items, each with a title.');
      need(!(b.items?.length > 8), 'Keep it to eight items or fewer.');
      break;
    case 'image':
      need(str(b.src), 'Upload or link a picture.');
      need(str(b.alt), 'Describe the picture for people using screen readers.');
      break;
    case 'scenario':
      need(str(b.title) && str(b.question), 'Add a title and a question.');
      need(arr(b.choices, 2) && b.choices.every((c) => str(c.text) && str(c.feedback) && ['best', 'ok', 'poor'].includes(c.result)), 'Add at least two choices, each with feedback and a result of best, ok or poor.');
      need((b.choices || []).filter((c) => c.result === 'best').length === 1, 'Mark exactly one choice as best.');
      break;
    case 'order':
      need(str(b.title) && str(b.prompt), 'Add a title and a prompt.');
      need(arr(b.items, 3) && b.items.every(str), 'List at least three steps, in the right order.');
      need(new Set(b.items || []).size === (b.items || []).length, 'Each step must be different.');
      break;
    case 'sort':
      need(str(b.title) && str(b.prompt), 'Add a title and a prompt.');
      need(arr(b.groups, 2) && b.groups.length <= 4 && b.groups.every(str), 'Add two to four groups.');
      need(arr(b.items, 3) && b.items.every((i) => str(i.text) && num(i.group) && i.group >= 0 && i.group < (b.groups || []).length), 'Add at least three cards, each pointing at a group (0 is the first group).');
      break;
    case 'match':
      need(str(b.title) && str(b.prompt), 'Add a title and a prompt.');
      need(arr(b.pairs, 3) && b.pairs.length <= 8 && b.pairs.every((p) => str(p.left) && str(p.right)), 'Add three to eight pairs.');
      break;
    case 'flashcards':
      need(str(b.title), 'Add a title.');
      need(arr(b.cards, 2) && b.cards.every((c) => str(c.front) && str(c.back)), 'Add at least two cards with a front and a back.');
      break;
    case 'checklist':
      need(str(b.title), 'Add a title.');
      need(arr(b.items, 2) && b.items.every(str), 'Add at least two items.');
      break;
    case 'hotspot':
      need(str(b.title) && str(b.image), 'Add a title and a screenshot.');
      need(arr(b.steps) && b.steps.every((s) => str(s.prompt) && [s.x, s.y, s.w, s.h].every((v) => num(v) && v >= 0 && v <= 100)), 'Add steps with a prompt and a box (x, y, w, h as percentages).');
      break;
    case 'realwork':
      need(str(b.title) && str(b.body), 'Add a title and instructions.');
      need(b.action === 'task' ? !!b.task && str(b.task.title) : b.action === 'note' ? !!b.note && str(b.note.title) : b.action === 'message' ? !!b.message && str(b.message.text) : false,
        'Fill in what gets created: a task title, a note title, or the message text.');
      break;
    case 'sim':
      need(str(b.title) && str(b.brief), 'Add a title and a brief.');
      if (b.tool === 'tasks') {
        need(arr(b.lists), 'Add at least one list.');
        need(arr(b.requests) && b.requests.every((r) => str(r.id) && str(r.from) && str(r.text) && !!r.expect), 'Add requests, each with an id, who it’s from, the text and what’s expected.');
        need(new Set((b.requests || []).map((r) => r.id)).size === (b.requests || []).length, 'Request ids must be unique.');
        for (const r of b.requests || []) {
          if (r.expect?.list) need(b.lists.includes(r.expect.list), `Request ${r.id} expects a list that doesn’t exist: ${r.expect.list}.`);
          if (r.action === 'comment') need(!!(b.tasks || []).find((t) => t.title === r.task), `Request ${r.id} comments on a task that isn’t in tasks.`);
        }
      } else if (b.tool === 'calendar') {
        need(num(b.start) && num(b.end) && b.end > b.start, 'Set start and end hours, end after start.');
        need((b.events || []).every((x) => str(x.title) && HHMM.test(x.start) && HHMM.test(x.end)), 'Events need a title and HH:MM start and end.');
        need(arr(b.blocks) && b.blocks.every((x) => str(x.id) && str(x.title) && num(x.minutes) && x.minutes % 15 === 0), 'Blocks need an id, a title and minutes in steps of 15.');
        need((b.blocks || []).every((x) => (!x.after || HHMM.test(x.after)) && (!x.before || HHMM.test(x.before))), 'after and before must be HH:MM.');
      } else if (b.tool === 'inbox' || b.tool === 'chat') {
        need(str(b.place), b.tool === 'inbox' ? 'Name the inbox address.' : 'Name the channel.');
        need(arr(b.messages) && b.messages.every((m) => str(m.id) && str(m.from) && str(m.body) && str(m.why) && arr(m.expect)), 'Add messages, each with an id, sender, body, why, and the right actions.');
      } else {
        e.push('tool must be tasks, calendar, inbox or chat.');
      }
      break;
    default:
      e.push('Unknown block type.');
  }
  return e;
}

/**
 * The module format, written for the RAMP Assistant. It's part of the setup prompt in Admin › Training › RAMP Assistant.
 * Keep it in step with src/learn/types.ts and src/lib/types.ts.
 */
export const FORMAT_VERSION = 1;
export const FORMAT = `RAMP module package, format ${FORMAT_VERSION}

Return ONE JSON object, in a single \`\`\`json code block:
{
  "format": ${FORMAT_VERSION},
  "modules": [ Module, ... ]
}

Module:
{
  "title": string (≤ 120 chars),
  "track": "company" | "role" | "continued",
  "summary": string (one sentence),
  "minutes": number,
  "objectives": string[] (3–5, each starting with a verb),
  "pass_score": number 0–100 (0 = no quiz gate),
  "mentor_review": boolean (true when a mentor should approve the work),
  "blocks": Block[] (8–16 steps; mix types — never three text steps in a row)
}

Block types (each is one step for the learner, except "slides" where each slide is a step):
- {"type":"slides","slides":[{"title":string,"body":string}]}  body: short lines, one idea per line
- {"type":"reading","title":string,"body":string}  for an SOP or longer explanation; paragraphs separated by blank lines
- {"type":"video","url":string,"caption":string}
- {"type":"quiz","questions":[{"q":string,"options":string[],"answer":number (0-based),"explain":string}]}
- {"type":"assignment","prompt":string}  written answer; pair with mentor_review for teach-backs
- {"type":"visual","title":string,"intro"?:string,"layout":"steps"|"cycle"|"cards"|"pillars"|"compare"|"timeline","items":[{"title":string,"body"?:string,"icon"?:string}],"note"?:string}
    steps = a process; cycle = a repeating loop; cards = a set of ideas; pillars = 2–3 categories; compare = exactly 2 items side by side; timeline = phases.
    body may hold several short lines separated by \\n (shown as bullets). icon is one of: home book tasks notes chat folder users shield lock search send fileText calendar clock mail star target key sparkle chart megaphone lifebuoy link eye bell refresh check
- {"type":"image","src":string,"alt":string,"caption"?:string}  src: leave "" and say in caption what picture the admin should upload
- {"type":"scenario","title":string,"setup"?:string,"message"?:{"from":string,"channel"?:string,"time"?:string,"text":string},"question":string,"choices":[{"text":string,"result":"best"|"ok"|"poor","feedback":string}]}
    exactly one "best"; 3–4 choices; feedback explains WHY.
- {"type":"order","title":string,"prompt":string,"items":string[]}  items in the CORRECT order (RAMP shuffles them)
- {"type":"sort","title":string,"prompt":string,"groups":string[] (2–4),"items":[{"text":string,"group":number (0-based),"why"?:string}]}
- {"type":"match","title":string,"prompt":string,"pairs":[{"left":string,"right":string}] (3–8)}
- {"type":"flashcards","title":string,"intro"?:string,"cards":[{"front":string,"back":string}]}
- {"type":"checklist","title":string,"intro"?:string,"items":string[]}  learner ticks every item
- {"type":"hotspot","title":string,"intro"?:string,"image":string,"steps":[{"prompt":string,"x":number,"y":number,"w":number,"h":number,"tip"?:string}]}
    only when the admin supplied a screenshot; boxes are percentages of the image.
- {"type":"realwork","title":string,"body":string,"action":"task"|"note"|"message","task"?:{"title":string,"notes"?:string,"due_days"?:number},"note"?:{"title":string,"body":string},"message"?:{"text":string}}
    creates a real task, notebook page or message in RAMP for the learner.
- Practice tools ("sim"), the learner does the real routine in a practice version of the tool and RAMP checks it:
  • {"type":"sim","tool":"tasks","title":string,"brief":string,"space"?:string,"lists":string[],
     "tasks"?:[{"title":string,"list":string,"status"?:"To do"|"In progress"|"Done","description"?:string,"comments"?:string[]}],
     "requests":[{"id":string,"from":string,"text":string,"action"?:"create"|"comment","task"?:string (title of an existing task, for comment),
       "expect":{"list"?:string,"type"?:"Operational"|"Administrative","duration"?:"Quick task"|"Small project"|"Big project","priority"?:"Low"|"Normal"|"High"|"Urgent","keywords"?:string[]},"why"?:string}]}
     RAMP also checks every task title starts with a verb and has 5+ words, and the description has a sentence or two.
     keywords: details that must appear; use "a|b" for alternatives.
  • {"type":"sim","tool":"calendar","title":string,"brief":string,"day":string,"start":number (hour),"end":number (hour),
     "events":[{"title":string,"start":"HH:MM","end":"HH:MM","kind"?:"meeting"|"personal"|"focus"}],
     "blocks":[{"id":string,"title":string,"minutes":number (multiple of 15),"after"?:"HH:MM","before"?:"HH:MM","why"?:string}]}
  • {"type":"sim","tool":"inbox"|"chat","title":string,"brief":string,"place":string (inbox address or channel name),
     "messages":[{"id":string,"from":string,"subject"?:string,"time":string,"body":string,
       "expect":("reply"|"task"|"calendar"|"sync"|"archive"|"forward"|"note")[],"why":string,"reply"?:{"mustInclude"?:string[],"hint"?:string}}]}
     inbox actions: reply, task, calendar, sync (raise at the next sync), forward (to the owner), archive.
     chat actions: reply (in thread), task, calendar, sync, note (save to resources), archive (acknowledge only).
`;
