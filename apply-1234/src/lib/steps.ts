// Activity steps. A job's activity is a list of steps; each step has a type with its own settings.
// Jobs made before step types existed have no `type` on their questions and are all video steps.
import type { Activity, Question, StepType, PasteRule } from './types';
export type { StepType, PasteRule };

export interface StepTypeInfo {
  id: StepType;
  label: string;
  desc: string;   // what the candidate does
  shows: string;  // what it tells you
}

export const STEP_TYPES: StepTypeInfo[] = [
  { id: 'video', label: 'Video answer', desc: 'Records a short Loom answering the question.', shows: 'Communication and presence' },
  { id: 'written', label: 'Written answer', desc: 'Types an answer. How it was written is recorded: typed or pasted, time taken.', shows: 'Clear thinking and writing' },
  { id: 'choice', label: 'Their choice', desc: 'Answers on video or in writing, whichever they prefer.', shows: 'Thinking, and how they like to communicate' },
  { id: 'voice', label: 'Voice answer', desc: 'Records a short voice note in the browser. Lighter than video, good on a phone.', shows: 'Tone and confidence' },
  { id: 'work', label: 'Show your work', desc: 'Shares links or files of past work, with their role and the result for each.', shows: 'Real track record' },
  { id: 'brief', label: 'Mini brief', desc: 'Gets a realistic task and sends back a doc, deck, file or link, with an optional walkthrough video.', shows: 'Actual skill on your actual problems' },
  { id: 'critique', label: 'Critique', desc: 'Reviews a page, ad, post or design of yours: what works, what they’d change.', shows: 'Taste and judgment' },
  { id: 'rank', label: 'Rank it', desc: 'Puts options in order and explains the top pick.', shows: 'Priorities, fast' },
  { id: 'quiz', label: 'Quick scenario', desc: 'A timed what-would-you-do with multiple choice and a one-line reason. Scored automatically. Also works as spot the error or the bug.', shows: 'Judgment under time pressure' },
  { id: 'musthave', label: 'Must-have', desc: 'A yes/no question such as a licence, availability or the right to work. A mismatch is flagged.', shows: 'Basic fit, instantly' },
];

export const stepType = (q: Pick<Question, 'type'>): StepType => (q.type || 'video') as StepType;
export const stepInfo = (t: StepType) => STEP_TYPES.find((x) => x.id === t)!;

let counter = 0;
export const newStepId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

/** A fresh step of a type, with sensible settings. */
export function newStep(type: StepType, text = '', extra: Partial<Question> = {}): Question {
  const base: Question = { id: newStepId(), type, text, guidance: '' };
  const byType: Record<StepType, Partial<Question>> = {
    video: {},
    written: { words: 250, paste: 'flag' },
    choice: { words: 250, paste: 'flag' },
    voice: { time_limit: 120 },
    work: { items: 3 },
    brief: { deliverable: 'either', walkthrough: 'optional', minutes: 30, material: '', material_url: '' },
    critique: { respond: 'written', material_url: '', image_url: '', paste: 'flag', words: 250 },
    rank: { options: ['', '', '', ''], reason: true },
    quiz: { options: ['', '', ''], correct: 0, reason: true, time_limit: 90, paste: 'block' },
    musthave: { expected: 'yes' },
  };
  return { ...base, ...byType[type], ...extra };
}

/** Steps that need the candidate to record on Loom (so the Loom setup screen is shown). */
export function usesLoom(q: Question): boolean {
  const t = stepType(q);
  if (t === 'video' || t === 'choice') return true;
  if (t === 'brief') return (q.walkthrough || 'optional') !== 'off';
  if (t === 'critique') return (q.respond || 'written') !== 'written';
  return false;
}
export const needsLoomSetup = (qs: Question[]) => qs.some((q) => {
  const t = stepType(q);
  return t === 'video' || (t === 'brief' && q.walkthrough === 'required') || (t === 'critique' && q.respond === 'video');
});

/** Steps typed into a text box, where paste and typing are tracked. */
export const isWritten = (q: Question) => ['written', 'choice', 'critique'].includes(stepType(q));
export const isTimed = (q: Question) => stepType(q) === 'quiz' || (isWritten(q) && !!q.time_limit);

/** Rough minutes a candidate spends on a step. */
export function stepMinutes(q: Question, a?: Pick<Activity, 'answer_max'>): number {
  switch (stepType(q)) {
    case 'video': return Math.round(((a?.answer_max || 180) / 60) + 2);
    case 'written': return q.time_limit ? Math.ceil(q.time_limit / 60) : 5;
    case 'choice': return 5;
    case 'voice': return Math.max(2, Math.ceil((q.time_limit || 120) / 60) + 1);
    case 'work': return 4;
    case 'brief': return (q.minutes || 30) + (q.walkthrough === 'required' ? 3 : 0);
    case 'critique': return q.time_limit ? Math.ceil(q.time_limit / 60) : 6;
    case 'rank': return 2;
    case 'quiz': return Math.max(1, Math.ceil((q.time_limit || 90) / 60));
    case 'musthave': return 1;
  }
}
export const activityMinutes = (qs: Question[], a?: Pick<Activity, 'answer_max'>) => qs.reduce((n, q) => n + (q.optional ? 0 : stepMinutes(q, a)), 0);

/** Plain-language warnings about a step list, drawn from what made candidates drop off before. */
export function activityWarnings(qs: Question[], a?: Pick<Activity, 'answer_max'>): string[] {
  const out: string[] = [];
  const videos = qs.filter((q) => stepType(q) === 'video' && !q.optional).length;
  const mins = activityMinutes(qs, a);
  if (videos > 2) out.push(`${videos} video answers. Most people who started your past activities stopped before recording their first video, so keep it to 2 at most.`);
  if (mins > 60) out.push(`About ${mins} minutes. Past an hour, many strong candidates drop off. Shorten the task, mark some steps optional or remove one.`);
  if (!qs.length) out.push('No steps yet.');
  for (const [i, q] of qs.entries()) {
    const t = stepType(q);
    if (!q.text.trim()) out.push(`Step ${i + 1} has no question yet.`);
    if ((t === 'rank' || t === 'quiz') && (q.options || []).filter((o) => o.trim()).length < 2) out.push(`Step ${i + 1} needs at least 2 options.`);
    else if ((t === 'rank' || t === 'quiz') && (q.options || []).some((o) => !o.trim())) out.push(`Step ${i + 1} has an empty option. Fill it in or remove it.`);
    if (t === 'critique' && !q.material_url?.trim() && !q.image_url?.trim() && !q.material?.trim()) out.push(`Step ${i + 1} needs a link or image to critique.`);
    if (/\[[^\]]{3,}\](?!\()/.test(`${q.text} ${q.material || ''} ${(q.options || []).join(' ')}`.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, ''))) out.push(`Step ${i + 1} still has a [placeholder] to fill in.`);
  }
  return out;
}

// ── Role families and their suggested activities ──

export interface RoleFamily {
  id: string;
  label: string;
  examples: string;
  shows: string;
  match: RegExp;
  steps: () => Question[];
}

const q = newStep;
export const FAMILIES: RoleFamily[] = [
  {
    id: 'tech', label: 'Technical & software', examples: 'Web developer, IT technician, data analyst', shows: 'Skill, debugging, explaining clearly',
    match: /\b(developer|engineer|programmer|software|front.?end|back.?end|full.?stack|devops|it (support|technician|specialist)|sysadmin|data (analyst|scientist|engineer)|qa tester|web dev)/i,
    steps: () => [
      q('brief', 'Build a small version of [a feature you need]. Share a GitHub repo or CodeSandbox link with a short README on how to run it and what you’d do next.', { deliverable: 'link', minutes: 45, walkthrough: 'optional', guidance: 'Keep it small. We care about clear, working code more than polish.' }),
      q('quiz', 'What is wrong with this code?\n\n```js\nconst total = items.reduce((sum, item) => sum + item.price);\n```', { options: ['Nothing, it works', 'The reduce has no starting value, so the first item object is used as the sum', 'reduce cannot be used on arrays of objects', 'price must be converted to a string first'], correct: 1, time_limit: 120 }),
      q('video', 'Explain to a non-technical client what happens between typing a website address and the page appearing. Two minutes at most.'),
      q('work', 'Share up to 3 things you’ve built: a repo, a live site or an app. For each, tell us your part and what you’d improve.', { items: 3, optional: true }),
    ],
  },
  {
    id: 'trades', label: 'Skilled trades & field technicians', examples: 'HVAC technician, electrician, installer, mechanic', shows: 'Practical know-how and proof of work',
    match: /\b(hvac|electrician|plumber|mechanic|technician|installer|carpenter|welder|field service|maintenance|roofer|landscap|handyman|appliance repair)/i,
    steps: () => [
      q('musthave', 'Do you hold a current [licence or certification] for this work?', { expected: 'yes' }),
      q('musthave', 'Do you have a valid driver’s licence and reliable transport?', { expected: 'yes' }),
      q('quiz', 'A customer says [describe a common service call]. What do you check first?', { options: ['[First thing to check]', '[Second option]', '[Third option]', '[Fourth option]'], correct: 0, time_limit: 90 }),
      q('work', 'Share up to 3 photos of jobs you’re proud of, and tell us what you did on each.', { items: 3 }),
      q('voice', 'Tell us about a tricky job you fixed and how you worked out what was wrong.', { time_limit: 90 }),
    ],
  },
  {
    id: 'finance', label: 'Finance & back office', examples: 'Bookkeeper, accountant, payroll', shows: 'Accuracy and attention to detail',
    match: /\b(bookkeep|accountant|accounting|payroll|finance|controller|accounts (payable|receivable)|billing|auditor)/i,
    steps: () => [
      q('quiz', 'One of these lines has an error. Which one?', {
        material: '| # | Item | Qty | Unit price | Line total |\n|---|---|---|---|---|\n| 1 | Paper | 4 | $12.50 | $50.00 |\n| 2 | Toner | 2 | $64.00 | $128.00 |\n| 3 | Labels | 3 | $8.25 | $26.75 |\n| 4 | Folders | 10 | $1.20 | $12.00 |',
        options: ['Line 1', 'Line 2', 'Line 3', 'Line 4'], correct: 2, time_limit: 90,
      }),
      q('brief', 'Here are this month’s transactions and the bank statement. Reconcile them and tell us what doesn’t add up, and what you’d do about it.', { material: '[Paste a short table of transactions and statement lines]', deliverable: 'either', minutes: 30, walkthrough: 'off' }),
      q('written', 'How do you make sure nothing slips at month-end? Walk us through your checklist.', { words: 200 }),
    ],
  },
  {
    id: 'sales', label: 'Sales', examples: 'Sales rep, account executive, business development', shows: 'Presence, persuasion, thinking on their feet',
    match: /\b(sales|account executive|business development|\bsdr\b|\bbdr\b|closer|account manager|inside sales)/i,
    steps: () => [
      q('video', 'Pick something you love, a product, a place or a tool, and sell it to us in 60 to 90 seconds.'),
      q('quiz', 'A prospect says: “We’re happy with our current provider.” What’s your best next move?', { options: ['Offer a discount straight away', 'Ask what they’d improve about their current setup if they could', 'Thank them and move on to the next lead', 'Send them a brochure'], correct: 1, time_limit: 60 }),
      q('quiz', 'Halfway through a demo, the decision-maker says they have to leave in 5 minutes. What do you do?', { options: ['Speed through the rest of the demo', 'Ask what matters most to them and book the next step before they go', 'Ask to reschedule the whole demo', 'Send the recording afterwards'], correct: 1, time_limit: 60 }),
      q('written', 'Write the follow-up email you’d send after a first call where the prospect said “send me some info”.', { words: 180 }),
    ],
  },
  {
    id: 'support', label: 'Customer service & support', examples: 'Support rep, customer success, receptionist', shows: 'Empathy, clarity, speed',
    match: /\b(customer (service|support|success|care)|support (rep|specialist|agent)|help ?desk|call cent(er|re)|receptionist|client services)/i,
    steps: () => [
      q('written', 'A customer writes: “I was charged twice and nobody is answering. This is ridiculous.” Write your reply.', { time_limit: 300, words: 180 }),
      q('written', 'A customer asks for something your company doesn’t offer. Write a reply that keeps them happy.', { time_limit: 300, words: 150 }),
      q('quiz', 'You have 3 chats open and a phone call comes in. What do you do first?', { options: ['Answer the call and leave the chats waiting', 'Tell the chats you’ll be back in a minute, then take the call', 'Ignore the call; chats came first', 'Close the oldest chat'], correct: 1, time_limit: 60 }),
      q('video', 'Tell us about a time you turned an upset customer around.'),
    ],
  },
  {
    id: 'media', label: 'Media & content production', examples: 'Video or photo editor, content creator, producer', shows: 'Craft and turnaround',
    match: /\b(editor|video|photograph|videograph|content creator|producer|motion|animator|podcast|media)/i,
    steps: () => [
      q('brief', 'Here are raw files: [link to footage or photos]. Make a [30 to 60 second edit for Instagram]. Share a link to the result.', { deliverable: 'link', minutes: 45, walkthrough: 'optional' }),
      q('work', 'Share up to 3 pieces you’ve made, and for each tell us what you did and the result.', { items: 3 }),
      q('written', 'Walk us through how you take a project from raw footage to the final cut.', { words: 200 }),
    ],
  },
  {
    id: 'creative', label: 'Creative & marketing', examples: 'Marketing lead, designer, copywriter, social media', shows: 'Taste, strategy, track record',
    match: /\b(marketing|brand|design(er)?|copywriter|social media|content strateg|creative|growth|seo|campaign|digital)/i,
    steps: () => [
      q('critique', 'Look at [our page, ad or post]. What works, what would you change first, and why?', { material_url: '', respond: 'either', words: 250 }),
      q('brief', '[Describe a real challenge]. You have [a $5,000 budget] and 30 days. Send us a one-page plan or a few slides.', { deliverable: 'either', minutes: 30, walkthrough: 'optional' }),
      q('work', 'Share up to 3 pieces of work you’re proud of. For each, tell us your role and the result.', { items: 3 }),
    ],
  },
  {
    id: 'ops', label: 'Operations & admin', examples: 'Executive assistant, office manager, coordinator', shows: 'Organisation, judgment, communication',
    match: /\b(assistant|admin|coordinator|office manager|operations|scheduler|clerk|secretary|\bva\b|virtual assistant)/i,
    steps: () => [
      q('rank', 'It’s Monday at 8am. Put these in the order you’d deal with them.', { options: ['Your manager’s flight tomorrow was cancelled', 'An invoice due today is missing a signature', 'A client asks to move this afternoon’s meeting', 'There are 40 unread emails', 'The office is out of printer toner'], reason: true }),
      q('written', 'Your manager emails: “Find me 3 options for a team dinner for 8 next Thursday, under $80 a head.” Write the reply you’d send back.', { words: 200 }),
      q('video', 'Tell us about a time you kept several moving parts on track for someone busy. What was your system?'),
    ],
  },
  {
    id: 'management', label: 'Management & leadership', examples: 'Team lead, manager, director', shows: 'Strategy and judgment about people',
    match: /\b(manager|director|head of|lead\b|leader|supervisor|\bvp\b|chief|principal)/i,
    steps: () => [
      q('brief', 'Write a short 30/60/90-day plan for this role: what you’d learn, change and deliver.', { deliverable: 'either', minutes: 30, walkthrough: 'optional' }),
      q('quiz', 'Your best performer has missed three deadlines this month. What do you do first?', { options: ['Take the work back yourself', 'Have a private conversation to understand what’s changed', 'Remind the whole team about deadlines', 'Wait to see if it continues'], correct: 1, time_limit: 60 }),
      q('quiz', 'Two team members disagree on approach and the work has stalled. What do you do?', { options: ['Pick one approach yourself and move on', 'Bring them together, agree what success looks like, then decide', 'Let them sort it out', 'Escalate to your manager'], correct: 1, time_limit: 60 }),
      q('video', 'Tell us about a hard call you made as a leader and what happened.'),
    ],
  },
  {
    id: 'frontline', label: 'Frontline & hourly', examples: 'Retail, hospitality, caregiving, warehouse', shows: 'Reliability and attitude, in under 10 minutes on a phone',
    match: /\b(retail|cashier|server|barista|host(ess)?|caregiver|warehouse|driver|cleaner|housekeep|cook|front desk|hospitality|associate|crew|picker|packer)/i,
    steps: () => [
      q('musthave', 'Can you work [weekends]?', { expected: 'yes' }),
      q('musthave', 'Can you start within the next two weeks?', { expected: 'yes' }),
      q('quiz', 'A customer is upset their order is wrong, and the line is long. What do you do?', { options: ['Tell them to wait until the line is done', 'Apologise, fix it quickly, and let the next person know you’ll be right with them', 'Call a manager straight away', 'Offer a refund without looking'], correct: 1, time_limit: 60 }),
      q('voice', 'In 30 seconds, tell us why you’d be great at this job.', { time_limit: 45, optional: true }),
    ],
  },
];

export const familyById = (id?: string) => FAMILIES.find((f) => f.id === id);

/** Guesses the role family from the job title first, then the notes. */
export function suggestFamily(title: string, notes = ''): RoleFamily {
  for (const text of [title, notes]) {
    if (!text.trim()) continue;
    const hit = FAMILIES.find((f) => f.match.test(text));
    if (hit) return hit;
  }
  return familyById('ops')!;
}

/** One line per step for the AI prompt: its number, type and what it's for. */
export function stepSpec(q: Question, i: number): string {
  const t = stepType(q);
  const info = stepInfo(t);
  const t0 = q.text.trim();
  const draft = !t0 ? '' : t0.includes('```') ? ` Starting point:\n${t0}\n` : ` Starting point: "${t0.replace(/\n+/g, ' ')}"`;
  const extra: Record<StepType, string> = {
    video: 'One question answered on video.',
    written: `One question answered in writing${q.words ? `, up to ${q.words} words` : ''}${q.time_limit ? `, within ${Math.round(q.time_limit / 60)} minutes` : ''}.`,
    choice: 'One question; the candidate answers on video or in writing.',
    voice: 'One question answered in a short voice note.',
    work: `Ask for up to ${q.items || 3} examples of past work, with their role and the result.`,
    brief: `A realistic task from this role that takes about ${q.minutes || 30} minutes. Include a Material section with any context, numbers or data they need (a markdown table is fine).`,
    critique: 'Ask them to critique something of ours (we will add the link). Say what to look at.',
    rank: `Give ${Math.max(4, (q.options || []).length)} items to put in order, as Options.`,
    quiz: 'A realistic what-would-you-do scenario (or spot the error/bug) with 3–4 Options and the Correct option number. Make every option plausible.',
    musthave: 'A yes/no must-have question (licence, availability, right to work). Answer "Expected: yes" or "Expected: no".',
  };
  return `Step ${i + 1} (${info.label}): ${extra[t]}${draft}`;
}

/** Fills step content from the AI's "## Step N" blocks, keeping each step's type and settings. */
export function applyAiSteps(skeleton: Question[], parsed: Partial<Question>[]): Question[] {
  return skeleton.map((s, i) => {
    const p = parsed[i];
    if (!p) return s;
    const t = stepType(s);
    const next: Question = { ...s };
    if (p.text) next.text = p.text;
    if (p.guidance) next.guidance = p.guidance;
    if (p.material && (t === 'brief' || t === 'quiz' || t === 'critique')) next.material = p.material;
    if (p.options && p.options.length >= 2 && (t === 'rank' || t === 'quiz')) next.options = p.options.slice(0, 8);
    if (t === 'quiz' && typeof p.correct === 'number' && p.correct >= 0 && p.correct < (next.options || []).length) next.correct = p.correct;
    if (t === 'musthave' && (p.expected === 'yes' || p.expected === 'no')) next.expected = p.expected;
    return next;
  });
}

// ── AI policy ──
export const AI_WELCOME = 'AI is welcome. Tell us how you used it.';
export const AI_NONE = 'Please answer in your own words, without AI tools. We want to hear how you think.';
/** What candidates read about AI, or '' when the job doesn't mention it. */
export function aiMessage(a: Pick<Activity, 'ai_policy' | 'ai_message'>): string {
  const policy = a.ai_policy || 'welcome';
  if (policy === 'off') return '';
  return a.ai_message?.trim() || (policy === 'none' ? AI_NONE : AI_WELCOME);
}

/** "two written answers, a quick scenario and a voice note" for the welcome screen. */
export function stepMix(qs: Question[]): string {
  const counts = new Map<StepType, number>();
  for (const q of qs) counts.set(stepType(q), (counts.get(stepType(q)) || 0) + 1);
  const name: Record<StepType, [string, string]> = {
    video: ['a video answer', 'video answers'], written: ['a written answer', 'written answers'], choice: ['an answer on video or in writing', 'answers on video or in writing'],
    voice: ['a voice note', 'voice notes'], work: ['examples of your work', 'sets of work examples'], brief: ['a short task', 'short tasks'],
    critique: ['a critique', 'critiques'], rank: ['a ranking', 'rankings'], quiz: ['a quick scenario', 'quick scenarios'], musthave: ['a yes/no question', 'yes/no questions'],
  };
  const words = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  const parts = [...counts].map(([t, n]) => (n === 1 ? name[t][0] : `${words[n] || n} ${name[t][1]}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
}
