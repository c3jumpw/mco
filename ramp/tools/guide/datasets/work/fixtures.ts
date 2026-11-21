// @ts-nocheck
// One consistent, fictional dataset for the RAMP guide screenshots. Everything is relative to the browser's "now".
// People, emails and numbers are made up. Emails use example.com; IPs use documentation ranges.

export const LOG: any[] = [];
(window as any).__LOG = LOG;

const NOW = Date.now();
const H = 3600000, D = 86400000;
/** ISO time `days` days and `hours` hours ago. */
const ago = (days: number, hours = 0, min = 0) => new Date(NOW - days * D - hours * H - min * 60000).toISOString();
/** ISO time on the day `days` ago at a local clock time. */
const at = (days: number, hm: string) => { const d = new Date(NOW - days * D); const [h, m] = hm.split(':').map(Number); d.setHours(h!, m!, 0, 0); return d.toISOString(); };
/** yyyy-mm-dd, `offset` days from today (negative = past). */
const day = (offset: number) => { const d = new Date(NOW + offset * D); return d.toLocaleDateString('en-CA'); };

const uuid = (block: string, n: number) => `${block}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let seq = 900;
export const newId = () => uuid('0f000000', ++seq);

// ───────── ids ─────────
const M = {
  harper: uuid('10000000', 1), avery: uuid('10000000', 2), riley: uuid('10000000', 3), sam: uuid('10000000', 4),
  taylor: uuid('10000000', 5), jordan: uuid('10000000', 6), priya: uuid('10000000', 7), elena: uuid('10000000', 8),
  marcus: uuid('10000000', 9), casey: uuid('10000000', 10), nina: uuid('10000000', 11), owen: uuid('10000000', 12),
};
const DEP = { ops: uuid('20000000', 1), sales: uuid('20000000', 2), support: uuid('20000000', 3), hr: uuid('20000000', 4) };
const ROLE = {
  coord: uuid('30000000', 1), dispatch: uuid('30000000', 2), account: uuid('30000000', 3), support: uuid('30000000', 4),
  hr: uuid('30000000', 5), opsmgr: uuid('30000000', 6), member: uuid('30000000', 7),
};
const MOD = {
  practice: uuid('40000000', 1), welcome: uuid('40000000', 2), tasks: uuid('40000000', 3), comms: uuid('40000000', 4),
  security: uuid('40000000', 5), refresher: uuid('40000000', 6), role: uuid('40000000', 7), ops: uuid('40000000', 8),
};
const TPL = {
  info: uuid('50000000', 1), photo: uuid('50000000', 2), payroll: uuid('50000000', 3), policies: uuid('50000000', 4),
  confid: uuid('50000000', 5), noncompete: uuid('50000000', 6), tools: uuid('50000000', 7), email: uuid('50000000', 8),
  notebook: uuid('50000000', 9), application: uuid('50000000', 10),
};
const CH = {
  announcements: uuid('60000000', 1), general: uuid('60000000', 2), newhires: uuid('60000000', 3), ops: uuid('60000000', 4),
  dmSam: uuid('60000000', 11), dmRiley: uuid('60000000', 12), dmPriya: uuid('60000000', 13), dmElena: uuid('60000000', 14),
};
export const IDS = { M, DEP, ROLE, MOD, TPL, CH };

// ───────── devices ─────────
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
};
const IP = { jordanHome: '203.0.113.24', jordanCell: '198.51.100.77', office: '203.0.113.10', avery: '198.51.100.12', marcus: '192.0.2.45', priya: '203.0.113.88', elena: '192.0.2.130', sam: '203.0.113.10', riley: '203.0.113.10', harper: '198.51.100.40' };

// ───────── people ─────────
const member = (o: any) => ({
  auth_user_id: 'u-' + o.id, full_name: '', preferred_name: '', phone: '', timezone: '', level: 'trainee', job_role_id: null, department_id: null,
  mentor_id: null, status: 'active', source: 'manual', source_ref: null, start_date: null, onboarded_at: null, practice_done_at: null,
  graduated_at: null, last_seen_at: null, access_until: null, invited_by: M.avery, invited_at: ago(60), joined_at: ago(59), created_at: ago(60), updated_at: ago(1), ...o,
});

const members = [
  member({ id: M.harper, email: 'harper.quinn@example.com', full_name: 'Harper Quinn', level: 'owner', source: 'seed', invited_by: null,
    invited_at: ago(120), joined_at: ago(120), created_at: ago(120), onboarded_at: ago(119), last_seen_at: ago(0, 2), phone: '(555) 010-4410', timezone: 'America/New_York' }),
  member({ id: M.avery, email: 'avery.brooks@example.com', full_name: 'Avery Brooks', level: 'admin', job_role_id: ROLE.hr, department_id: DEP.hr,
    invited_by: M.harper, invited_at: ago(110), joined_at: ago(110), onboarded_at: ago(109), practice_done_at: ago(109), graduated_at: ago(100), last_seen_at: ago(0, 0, 4), phone: '(555) 010-2231', timezone: 'America/New_York' }),
  member({ id: M.riley, email: 'riley.chen@example.com', full_name: 'Riley Chen', level: 'lead', job_role_id: ROLE.opsmgr, department_id: DEP.ops,
    invited_at: ago(100), joined_at: ago(99), onboarded_at: ago(99), practice_done_at: ago(99), graduated_at: ago(80), last_seen_at: ago(0, 1), phone: '(555) 010-3318', timezone: 'America/New_York', start_date: day(-99) }),
  member({ id: M.sam, email: 'sam.patel@example.com', full_name: 'Sam Patel', level: 'mentor', job_role_id: ROLE.coord, department_id: DEP.ops,
    invited_at: ago(95), joined_at: ago(94), onboarded_at: ago(94), practice_done_at: ago(94), graduated_at: ago(70), last_seen_at: ago(0, 0, 25), phone: '(555) 010-6672', timezone: 'America/New_York', start_date: day(-94) }),
  member({ id: M.taylor, email: 'taylor.morgan@example.com', full_name: 'Taylor Morgan', level: 'employee', job_role_id: ROLE.dispatch, department_id: DEP.ops, mentor_id: M.sam,
    invited_at: ago(30), joined_at: ago(28), onboarded_at: ago(28), practice_done_at: ago(28), graduated_at: ago(4), last_seen_at: ago(0, 3), phone: '(555) 010-5520', timezone: 'America/New_York', start_date: day(-26), source: 'hiring', source_ref: '7a1e4c2b-90d3-4f1a-b6c2-3d5e8f901234' }),
  member({ id: M.jordan, email: 'jordan.lee@example.com', full_name: 'Jordan Lee', level: 'trainee', job_role_id: ROLE.coord, department_id: DEP.ops, mentor_id: M.sam,
    source: 'hiring', source_ref: '8c1f2e44-5a6b-4c7d-9e0f-123456789abc', start_date: day(-3), invited_at: at(8, '11:20'), joined_at: at(6, '14:02'),
    onboarded_at: at(6, '15:20'), practice_done_at: at(6, '15:05'), last_seen_at: ago(0, 0, 12), phone: '(555) 014-2290', timezone: 'America/New_York' }),
  member({ id: M.priya, email: 'priya.shah@example.com', full_name: 'Priya Shah', level: 'trainee', job_role_id: ROLE.dispatch, department_id: DEP.ops, mentor_id: M.sam,
    source: 'hiring', start_date: day(-12), invited_at: ago(16), joined_at: ago(14), onboarded_at: ago(14), practice_done_at: ago(14), last_seen_at: ago(0, 1, 20), phone: '(555) 014-8812' }),
  member({ id: M.elena, email: 'elena.petrova@example.com', full_name: 'Elena Petrova', level: 'trainee', job_role_id: ROLE.support, department_id: DEP.support, mentor_id: M.riley,
    source: 'staff', start_date: day(-8), invited_at: ago(11), joined_at: ago(9), onboarded_at: ago(9), practice_done_at: ago(9), last_seen_at: ago(1, 4) }),
  member({ id: M.marcus, email: 'marcus.diaz@example.com', full_name: 'Marcus Diaz', preferred_name: '', level: 'trainee', job_role_id: ROLE.coord, department_id: DEP.ops, mentor_id: M.sam,
    source: 'hiring', start_date: day(4), invited_at: ago(3), joined_at: at(1, '19:12'), onboarded_at: null, practice_done_at: null, last_seen_at: ago(0, 13), phone: '(555) 014-3307' }),
  member({ id: M.casey, email: 'casey.nguyen@example.com', full_name: 'Casey Nguyen', level: 'guest', access_until: day(26),
    invited_at: ago(5), joined_at: ago(4), last_seen_at: ago(1, 2) }),
  member({ id: M.nina, email: 'nina.alvarez@example.com', full_name: 'Nina Alvarez', level: 'trainee', job_role_id: ROLE.dispatch, department_id: DEP.ops, mentor_id: M.sam,
    auth_user_id: null, status: 'invited', source: 'hiring', start_date: day(6), invited_at: ago(1, 2), joined_at: null, last_seen_at: null }),
  member({ id: M.owen, email: 'owen.park@example.com', full_name: 'Owen Park', level: 'trainee', job_role_id: ROLE.account, department_id: DEP.sales,
    auth_user_id: null, status: 'invited', source: 'manual', start_date: day(11), invited_at: ago(3, 5), joined_at: null, last_seen_at: null }),
];

// ───────── personas (?as=…) ─────────
const PERSONA: Record<string, string> = {
  owner: M.harper, admin: M.avery, lead: M.riley, mentor: M.sam, employee: M.taylor, trainee: M.jordan, new: M.marcus, guest: M.casey,
  priya: M.priya, elena: M.elena, va: M.taylor, coach: M.sam, client: '10000000-0000-4000-8000-000000000099', nobody: M.jordan,
};
(() => {
  const p = new URLSearchParams(window.location.search).get('as');
  if (p) sessionStorage.setItem('work-as', p);
})();
export const currentPersona = () => sessionStorage.getItem('work-as') || 'trainee';
export const meId = () => (currentPersona() === 'signed_out' ? null : PERSONA[currentPersona()] || M.jordan);

// ───────── modules (titles from 002_ramp_seed.sql) ─────────
const module = (o: any) => ({ summary: '', minutes: 10, objectives: [], blocks: [], pass_score: 0, mentor_review: false, due_days: null, required: false,
  guest_visible: false, builtin: null, status: 'published', sort: 1, created_by: M.avery, created_at: ago(40), updated_at: ago(12), ...o });

const modules = [
  module({ id: MOD.practice, title: 'Platform basics (interactive)', track: 'company', summary: 'Practise RAMP in a safe sandbox: nine quick missions.', minutes: 5,
    objectives: ['Find Training, Tasks, Notes and Chat', 'Create a task and send it for review', 'Start a notebook page', 'Message your mentor'],
    blocks: [{ type: 'practice' }], due_days: 1, required: true, builtin: 'practice', sort: 1, created_by: null }),
  module({ id: MOD.welcome, title: 'Welcome and culture', track: 'company', summary: 'Who we are, what we value and how we work together.', minutes: 10,
    objectives: ['Explain what the company does and who it serves', 'Name the core principles and give an example of each'],
    blocks: [{ type: 'slides', slides: [
      { title: 'Welcome', body: 'Northwind Services runs scheduling, dispatch and customer care for service businesses. We keep crews moving and customers informed, from the first call to the finished job.' },
      { title: 'Our core principles', body: 'Own it: every task has one owner, start to finish.\nSay it early: raise problems while they’re still small.\nMake it easy: for customers and for each other.\nKeep learning: ask questions and share what you find.' },
      { title: 'How we work together', body: 'Hours: 8:00 AM to 5:00 PM Eastern, Monday to Friday.\nDaily huddle: 9:15 AM in #operations.\nQuestions: your mentor first, then your lead.\nTime off and pay: Avery Brooks in HR.' },
    ] }], due_days: 2, required: true, sort: 2 }),
  module({ id: MOD.tasks, title: 'How we use tasks', track: 'company', summary: 'Why every request becomes a task, and how to move one along.', minutes: 15,
    objectives: ['Explain why every request becomes a task', 'Write a clear task with one owner and a due date', 'Use statuses correctly, especially In review'],
    blocks: [
      { type: 'slides', slides: [
        { title: 'One place for every task', body: 'Work that comes up in chat, email or a meeting becomes a task. That way nothing slips through the cracks, and everyone can see who owns what.' },
        { title: 'Anatomy of a good task', body: 'Title: starts with a verb and says what done looks like.\nOwner: one person, even when others help.\nDue date: when it needs to be finished.\nStatus and comments: where it stands, with updates kept on the task.' },
        { title: 'Statuses move left to right', body: 'To do: assigned, not started yet.\nIn progress: you’re working on it.\nIn review: finished on your side, waiting for a check.\nDone: approved and complete.' },
      ] },
      { type: 'quiz', questions: [
        { q: 'You’ve finished a task, but your mentor hasn’t checked it yet. Which status should it have?', options: ['In progress', 'In review', 'Done'], answer: 1, explain: 'In review tells your mentor it’s ready to check.' },
        { q: 'Three people are helping with a task. Who should own it?', options: ['All three of them', 'One person', 'Nobody until it’s done'], answer: 1, explain: 'One owner keeps it clear who moves it forward.' },
      ] },
      { type: 'assignment', prompt: 'On your task board, add a task called “Set up my notebook”, give it a due date, and move it to In review. Then write one or two sentences about how you’ll use tasks in your role.' },
    ], pass_score: 100, mentor_review: true, due_days: 3, required: true, sort: 3 }),
  module({ id: MOD.comms, title: 'Communication and chat basics', track: 'company', summary: 'Which channel to use, and how to keep work updates findable.', minutes: 8,
    objectives: ['Choose the right channel for a message', 'Keep work updates on tasks, not in direct messages', 'Write messages that get a fast, useful reply'],
    blocks: [{ type: 'slides', slides: [
      { title: 'Where messages go', body: '#announcements: company news from admins. Read-only.\n#general: anything for everyone.\n#new-hires: questions while you train.\nDirect messages: quick questions for one person, like your mentor.' },
      { title: 'Keep work on the task', body: 'If a message is about a piece of work, put it on the task. Chat is for conversation; tasks are the record.' },
      { title: 'Good habits', body: 'Write the whole question in one message.\nUse a name when you need someone specific.\nIf it’s urgent, say so and say why.\nIf you need more time to reply, say that too.' },
    ] }], due_days: 4, required: true, sort: 4 }),
  module({ id: MOD.security, title: 'Security and data handling', track: 'company', summary: 'Protect accounts, devices and client information.', minutes: 10,
    objectives: ['Protect logins and devices', 'Handle client and company information safely', 'Report anything suspicious quickly'],
    blocks: [
      { type: 'reading', title: 'The basics', body: 'Use a different password for every work account, and keep them in your RAMP Vault or an approved password manager.\nTurn on two-step sign-in wherever it’s offered.\nLock your screen when you step away.\nNever share client or company information outside the tools we use.\nIf a message asks you to sign in, pay or send files when you didn’t expect it, stop and check with your lead first.\nIf something looks wrong, report it right away. Reporting early is always the right call.' },
      { type: 'quiz', questions: [
        { q: 'An email you weren’t expecting asks you to sign in through a link. What should you do?', options: ['Sign in quickly so you don’t miss anything', 'Stop and check with your lead first', 'Forward it to the team'], answer: 1, explain: 'Unexpected sign-in requests are the most common way accounts get stolen.' },
        { q: 'Where should you keep work passwords?', options: ['In a note on your phone', 'In your RAMP Vault or an approved password manager', 'In a chat message to yourself'], answer: 1, explain: 'The Vault is encrypted and only you can open it.' },
      ] },
    ], pass_score: 100, due_days: 6, required: true, guest_visible: true, sort: 5 }),
  module({ id: MOD.refresher, title: 'Quarterly security refresher', track: 'continued', summary: 'Five-minute check-in on the security basics.', minutes: 5,
    objectives: ['Spot an unexpected sign-in request', 'Keep passwords somewhere safe'],
    blocks: [{ type: 'quiz', questions: [
      { q: 'An email you weren’t expecting asks you to sign in through a link. What should you do?', options: ['Sign in quickly', 'Stop and check with your lead first', 'Ignore every email'], answer: 1 },
      { q: 'Where should you keep work passwords?', options: ['In a note on your phone', 'In your RAMP Vault or an approved password manager', 'In a chat message to yourself'], answer: 1 },
    ] }], pass_score: 100, due_days: 30, sort: 20 }),
  module({ id: MOD.role, title: 'Role essentials', track: 'role', summary: 'Draft: the core skills for this role.', minutes: 30,
    objectives: ['[What someone in this role can do after this module]'],
    blocks: [
      { type: 'slides', slides: [
        { title: 'What this role does', body: '[The outcomes this role is responsible for.]' },
        { title: 'A typical day', body: '[The routines, tools and people this role works with.]' },
        { title: 'What good looks like', body: '[Examples of great work in this role.]' },
      ] },
      { type: 'assignment', prompt: '[A small real task to try, which your mentor reviews.]' },
    ], mentor_review: true, due_days: 14, status: 'draft', sort: 30, created_by: null }),
  module({ id: MOD.ops, title: 'Operations essentials', track: 'role', summary: 'The daily routines, tools and handoffs for Operations roles.', minutes: 25,
    objectives: ['Run the daily dispatch routine', 'Keep every job’s status current', 'Write a clear end-of-day handoff'],
    blocks: [
      { type: 'slides', slides: [
        { title: 'What Operations does', body: 'We schedule crews, dispatch jobs and keep customers updated from booking to sign-off.' },
        { title: 'A typical day', body: '8:00: check overnight requests and today’s schedule.\n9:15: daily huddle in #operations.\nAll day: dispatch jobs, update tasks, answer customer calls.\n4:30: hand off open jobs to the evening shift.' },
        { title: 'What good looks like', body: 'Every job has an owner and an up-to-date status.\nCustomers hear from us before they have to ask.\nHandoffs are written down, not just said.' },
      ] },
      { type: 'reading', title: 'The dispatch SOP', body: 'Read the dispatch SOP in Resources before your first solo shift.\nThe key rule: confirm every crew ETA with the customer by text, and note it on the job.' },
      { type: 'assignment', prompt: 'Shadow two dispatch calls with your mentor. Then write the three steps you’d take if a crew is running 30 minutes late.' },
    ], mentor_review: true, due_days: 14, sort: 31 }),
];

const roleModules = [
  ...[ROLE.coord, ROLE.dispatch].map((r) => ({ job_role_id: r, module_id: MOD.ops, sort: 1 })),
  ...Object.values(ROLE).map((r) => ({ job_role_id: r, module_id: MOD.role, sort: 2 })),
];

// ───────── progress ─────────
const prog = (member_id: string, module_id: string, o: any) => ({ member_id, module_id, status: 'completed', step: 999, score: null, answer: '', feedback: '', reviewer_id: null,
  started_at: o.completed_at || o.submitted_at || ago(5), submitted_at: null, completed_at: null, updated_at: o.completed_at || o.submitted_at || ago(1), ...o });

const JORDAN_ANSWER = 'I added “Set up my notebook” with a due date of Friday and moved it to In review.\n\nIn my role I’ll turn every customer request and schedule change into a task with one owner, so the evening shift can see exactly what’s still open.';
const PRIYA_ANSWER = '1. Text the customer right away with the new ETA and a short reason.\n2. Update the job status and note the delay on the task so the next shift can see it.\n3. Tell the next customer on that crew’s route if their window is affected too.\n\nI shadowed the 10:00 and 2:00 calls with Sam on Monday.';

const progress = [
  // Jordan: two done, one waiting for review, one in progress
  prog(M.jordan, MOD.practice, { completed_at: at(6, '15:05'), score: 100 }),
  prog(M.jordan, MOD.welcome, { completed_at: at(3, '10:20') }),
  prog(M.jordan, MOD.tasks, { status: 'submitted', score: 100, answer: JORDAN_ANSWER, submitted_at: ago(0, 18) }),
  prog(M.jordan, MOD.comms, { status: 'in_progress', step: 2, completed_at: null, updated_at: ago(0, 1) }),
  // Priya: nearly done
  prog(M.priya, MOD.practice, { completed_at: ago(14), score: 100 }),
  prog(M.priya, MOD.welcome, { completed_at: ago(12) }),
  prog(M.priya, MOD.tasks, { completed_at: ago(10), score: 100, answer: 'Every call that needs a follow-up becomes a task.', reviewer_id: M.sam }),
  prog(M.priya, MOD.comms, { completed_at: ago(9) }),
  prog(M.priya, MOD.security, { completed_at: ago(7), score: 100 }),
  prog(M.priya, MOD.ops, { status: 'submitted', answer: PRIYA_ANSWER, submitted_at: ago(2, 3) }),
  // Elena: returned work and something overdue
  prog(M.elena, MOD.practice, { completed_at: ago(9), score: 100 }),
  prog(M.elena, MOD.welcome, { completed_at: ago(7) }),
  prog(M.elena, MOD.tasks, { status: 'returned', score: 100, answer: 'I made a task.', feedback: 'Good start. Add a due date to your “Set up my notebook” task and say how you’ll use In review with your mentor, then send it again.', reviewer_id: M.riley, submitted_at: ago(3), updated_at: ago(1, 5) }),
  // Graduated and senior staff
  ...[MOD.practice, MOD.welcome, MOD.tasks, MOD.comms, MOD.security, MOD.ops].map((mod, i) => prog(M.taylor, mod, { completed_at: ago(27 - i * 4), score: mod === MOD.tasks || mod === MOD.security ? 100 : null })),
  prog(M.taylor, MOD.refresher, { status: 'in_progress', step: 1, completed_at: null, updated_at: ago(2) }),
  ...[MOD.practice, MOD.welcome, MOD.tasks, MOD.comms, MOD.security, MOD.ops, MOD.refresher].map((mod, i) => prog(M.sam, mod, { completed_at: ago(90 - i * 5) })),
  ...[MOD.practice, MOD.welcome, MOD.tasks, MOD.comms, MOD.security, MOD.refresher].map((mod, i) => prog(M.riley, mod, { completed_at: ago(95 - i * 6) })),
  ...[MOD.practice, MOD.welcome, MOD.tasks, MOD.comms, MOD.security, MOD.refresher].map((mod, i) => prog(M.avery, mod, { completed_at: ago(105 - i * 3) })),
  ...[MOD.practice, MOD.welcome, MOD.tasks, MOD.comms, MOD.security, MOD.refresher].map((mod, i) => prog(M.harper, mod, { completed_at: ago(115 - i * 3) })),
  prog(M.casey, MOD.security, { status: 'in_progress', step: 1, completed_at: null, updated_at: ago(1, 2) }),
];

// ───────── document templates (titles from 002_ramp_seed.sql) ─────────
const tpl = (o: any) => ({ audience: 'everyone', job_role_id: null, description: '', legal_review: false, status: 'published', version: 1, created_at: ago(45), updated_at: ago(20), ...o });
const templates = [
  tpl({ id: TPL.info, title: 'New employee information', kind: 'form', stage: 'onboarding', description: 'Contact details and an emergency contact.', sort: 1,
    fields: [
      { k: 'legal_name', type: 'text', label: 'Full legal name', required: true }, { k: 'preferred_name', type: 'text', label: 'Preferred name' },
      { k: 'dob', type: 'date', label: 'Date of birth', required: true, secure: true }, { k: 'address', type: 'text', label: 'Home address', required: true },
      { k: 'phone', type: 'phone', label: 'Mobile phone', required: true }, { k: 'emergency_name', type: 'text', label: 'Emergency contact name', required: true },
      { k: 'emergency_phone', type: 'phone', label: 'Emergency contact phone', required: true },
    ] }),
  tpl({ id: TPL.photo, title: 'Photo ID upload', kind: 'upload', stage: 'onboarding', sort: 2,
    description: 'A clear photo of a government-issued ID. Only owners and admins can open it. This doesn’t replace the official Form I-9 process.',
    fields: [
      { k: 'note', type: 'info', label: 'Use good lighting and make sure all four corners are visible.' },
      { k: 'id_front', type: 'file', label: 'Front of ID', required: true, secure: true }, { k: 'id_back', type: 'file', label: 'Back of ID', secure: true },
    ] }),
  tpl({ id: TPL.payroll, title: 'Payroll and direct deposit', kind: 'form', stage: 'onboarding', description: 'Where your pay goes. Bank details are encrypted.', sort: 3, version: 2,
    fields: [
      { k: 'bank_name', type: 'text', label: 'Bank name', required: true },
      { k: 'account_type', type: 'choice', label: 'Account type', required: true, options: ['Checking', 'Savings'] },
      { k: 'routing', type: 'secure', label: 'Routing number', required: true, secure: true }, { k: 'account', type: 'secure', label: 'Account number', required: true, secure: true },
      { k: 'w4', type: 'file', label: 'Federal tax withholding form (W-4)', required: true, secure: true },
      { k: 'sign', type: 'sign', label: 'I authorize direct deposit to this account', required: true },
    ] }),
  tpl({ id: TPL.policies, title: 'Policies and core principles', kind: 'esign', stage: 'onboarding', sort: 4,
    description: 'Confirm you’ve read the employee handbook and the code of conduct, then sign.',
    fields: [
      { k: 'text', type: 'info', label: 'Read before you sign', help: 'The employee handbook covers hours, time off, pay, conduct and safety. It’s in Resources › Employee handbook.\nOur core principles: own it, say it early, make it easy, keep learning.' },
      { k: 'handbook', type: 'check', label: 'I’ve read the employee handbook', required: true },
      { k: 'conduct', type: 'check', label: 'I understand the code of conduct', required: true },
      { k: 'sign', type: 'sign', label: 'Signature', required: true },
    ] }),
  tpl({ id: TPL.confid, title: 'Confidentiality agreement', kind: 'esign', stage: 'onboarding', description: 'Draft: add your agreement text, then publish.', status: 'draft', sort: 5,
    fields: [
      { k: 'text', type: 'info', label: '[Your confidentiality agreement text goes here.]' },
      { k: 'agree', type: 'check', label: 'I agree to the terms above', required: true }, { k: 'sign', type: 'sign', label: 'Signature', required: true },
    ] }),
  tpl({ id: TPL.noncompete, title: 'Non-compete and non-solicitation', kind: 'esign', stage: 'onboarding', audience: 'role', job_role_id: ROLE.account, legal_review: true, status: 'draft', sort: 6,
    description: 'Only for roles that need it. Rules differ by state, and some states don’t allow non-competes.',
    fields: [
      { k: 'text', type: 'info', label: 'Non-compete and non-solicitation', help: 'Agreement text, reviewed by your employment lawyer.' },
      { k: 'agree', type: 'check', label: 'I agree to the terms above', required: true }, { k: 'sign', type: 'sign', label: 'Signature', required: true },
    ] }),
  tpl({ id: TPL.tools, title: 'Install your tools', kind: 'checklist', stage: 'first_week', description: 'Get every app you need on your phone and computer.', sort: 7,
    fields: [
      { k: 'home_screen', type: 'check', label: 'Add RAMP to your phone’s home screen', required: true },
      { k: 'apps', type: 'check', label: 'Install the apps your role uses (your mentor will share the list)', required: true },
      { k: 'two_step', type: 'check', label: 'Turn on two-step sign-in for your work accounts', required: true },
      { k: 'screenshot', type: 'file', label: 'Screenshot of your setup (optional)' },
    ] }),
  tpl({ id: TPL.email, title: 'Set up your company email', kind: 'checklist', stage: 'first_week', description: 'Sign in, add your signature and connect your phone.', sort: 8,
    fields: [
      { k: 'signin', type: 'check', label: 'Sign in to your company email', required: true }, { k: 'signature', type: 'check', label: 'Add the company email signature', required: true },
      { k: 'phone', type: 'check', label: 'Add your email account to your phone', required: true },
    ] }),
  tpl({ id: TPL.notebook, title: 'Using your notebook', kind: 'checklist', stage: 'first_week', description: 'A short guided practice in your own notebook.', sort: 9,
    fields: [
      { k: 'page', type: 'check', label: 'Create a page from the Module notes template', required: true }, { k: 'file', type: 'check', label: 'Attach a file to a page', required: true },
      { k: 'vault', type: 'check', label: 'Save one login in your Vault', required: true },
    ] }),
  tpl({ id: TPL.application, title: 'Employment application', kind: 'form', stage: 'before', audience: 'candidates', status: 'draft', sort: 10,
    description: 'Your hiring app already collects applications. Use this only if you also need a written application.',
    fields: [
      { k: 'name', type: 'text', label: 'Full legal name', required: true }, { k: 'email', type: 'email', label: 'Email', required: true },
      { k: 'phone', type: 'phone', label: 'Phone', required: true }, { k: 'start', type: 'date', label: 'Earliest start date' },
      { k: 'resume', type: 'file', label: 'Résumé', required: true }, { k: 'sign', type: 'sign', label: 'I confirm this information is accurate', required: true },
    ] }),
];

// ───────── submissions (IP and device as the database records them) ─────────
let subN = 0;
const SECRETS: Record<string, string> = {};
const sub = (member_id: string, t: string, created_at: string, ip: string, ua: string, o: any = {}) => {
  const tp = templates.find((x) => x.id === t)!;
  const id = uuid('c0000000', ++subN);
  if (o.secrets) for (const [k, v] of Object.entries(o.secrets)) SECRETS[`${id}:${k}`] = v as string;
  return { id, member_id, template_id: t, template_title: tp.title, template_version: o.version || tp.version, answers: o.answers || {}, secure_fields: o.secrets ? Object.keys(o.secrets) : [],
    files: (o.files || []).map((f: any) => ({ ...f, path: `${member_id}/documents/${uuid('d0000000', subN)}-${f.name.replace(/\s+/g, '-')}` })), signed_name: o.signed || null, ip, user_agent: ua, created_at };
};
const onboardSet = (who: string, name: string, phone: string, when: (i: number) => string, ip: string, ua: string, extra = true) => [
  sub(who, TPL.info, when(0), ip, ua, { answers: { legal_name: name, preferred_name: name.split(' ')[0], address: '18 Maple Court, Springfield', phone, emergency_name: 'Morgan ' + name.split(' ')[1], emergency_phone: '(555) 014-7781' }, secrets: { dob: '1998-04-12' } }),
  sub(who, TPL.photo, when(1), ip, ua, { files: [{ k: 'id_front', label: 'Front of ID', name: 'drivers-license-front.jpg', secure: true }, { k: 'id_back', label: 'Back of ID', name: 'drivers-license-back.jpg', secure: true }] }),
  ...(extra ? [
    sub(who, TPL.payroll, when(2), ip, ua, { answers: { bank_name: 'Harborview Credit Union', account_type: 'Checking' }, secrets: { routing: '123456780', account: '00048213307' }, files: [{ k: 'w4', label: 'Federal tax withholding form (W-4)', name: 'W-4 2026 signed.pdf', secure: true }], signed: name }),
    sub(who, TPL.policies, when(3), ip, ua, { answers: { handbook: 'yes', conduct: 'yes', sign: name }, signed: name }),
  ] : []),
];
const submissions = [
  ...onboardSet(M.jordan, 'Jordan Lee', '(555) 014-2290', (i) => at(6, ['14:21', '14:30', '14:44', '14:52'][i]!), IP.jordanHome, UA.iphone),
  sub(M.jordan, TPL.tools, at(2, '17:40'), IP.jordanHome, UA.macChrome, { answers: { home_screen: 'yes', apps: 'yes', two_step: 'yes' } }),
  ...onboardSet(M.marcus, 'Marcus Diaz', '(555) 014-3307', (i) => at(1, ['19:31', '19:44'][i]!), IP.marcus, UA.android, false),
  ...onboardSet(M.priya, 'Priya Shah', '(555) 014-8812', (i) => ago(14, 5 - i), IP.priya, UA.iphone),
  sub(M.priya, TPL.tools, ago(11), IP.priya, UA.iphone, { answers: { home_screen: 'yes', apps: 'yes', two_step: 'yes' } }),
  sub(M.priya, TPL.email, ago(11), IP.priya, UA.macSafari, { answers: { signin: 'yes', signature: 'yes', phone: 'yes' } }),
  ...onboardSet(M.elena, 'Elena Petrova', '(555) 014-6604', (i) => ago(9, 4 - i), IP.elena, UA.winEdge).slice(0, 3),
  ...onboardSet(M.taylor, 'Taylor Morgan', '(555) 010-5520', (i) => ago(28, 4 - i), IP.office, UA.macChrome),
  sub(M.taylor, TPL.tools, ago(25), IP.office, UA.macChrome, { answers: { home_screen: 'yes', apps: 'yes', two_step: 'yes' } }),
  sub(M.taylor, TPL.email, ago(25), IP.office, UA.macChrome, { answers: { signin: 'yes', signature: 'yes', phone: 'yes' } }),
  sub(M.taylor, TPL.notebook, ago(24), IP.office, UA.macChrome, { answers: { page: 'yes', file: 'yes', vault: 'yes' } }),
];
// The payroll record was signed on version 1 for older staff.
submissions.filter((s) => s.member_id === M.taylor && s.template_id === TPL.payroll).forEach((s) => { s.template_version = 1; });

// ───────── sign-ins ─────────
let siN = 0;
const si = (member_id: string, when: string, ip: string, ua: string) => ({ id: ++siN, member_id, at: when, ip, user_agent: ua });
const signins = [
  si(M.jordan, at(6, '14:02'), IP.jordanHome, UA.iphone),
  si(M.jordan, at(5, '08:47'), IP.jordanHome, UA.iphone),
  si(M.jordan, at(3, '08:31'), IP.office, UA.macChrome),
  si(M.jordan, at(3, '12:15'), IP.jordanCell, UA.iphone),
  si(M.jordan, at(2, '08:29'), IP.office, UA.macChrome),
  si(M.jordan, at(1, '08:34'), IP.office, UA.macChrome),
  si(M.jordan, at(1, '19:58'), IP.jordanHome, UA.iphone),
  si(M.jordan, ago(0, 1, 5), IP.office, UA.macChrome),
  si(M.jordan, ago(0, 0, 14), IP.jordanHome, UA.iphone),
  si(M.marcus, at(1, '19:12'), IP.marcus, UA.android),
  si(M.marcus, ago(0, 13), IP.marcus, UA.android),
  si(M.priya, ago(1, 2), IP.priya, UA.iphone),
  si(M.avery, ago(0, 0, 40), IP.avery, UA.macSafari),
  si(M.sam, ago(0, 1), IP.office, UA.winEdge),
  si(M.riley, ago(0, 2), IP.office, UA.macChrome),
  si(M.harper, ago(0, 3), IP.harper, UA.macChrome),
];

// ───────── tasks ─────────
const task = (o: any) => ({ notes: '', due_date: null, status: 'todo', template_id: null, created_by: o.member_id, created_at: ago(3), updated_at: ago(1), ...o });
const tasks = [
  task({ id: uuid('70000000', 1), member_id: M.jordan, title: 'Using your notebook', template_id: TPL.notebook, notes: 'A short guided practice in your own notebook.', due_date: day(2), created_at: at(6, '15:20') }),
  task({ id: uuid('70000000', 2), member_id: M.jordan, title: 'Set up your company email', template_id: TPL.email, notes: 'Sign in, add your signature and connect your phone.', status: 'doing', due_date: day(0), created_at: at(6, '15:20') }),
  task({ id: uuid('70000000', 3), member_id: M.jordan, title: 'Install your tools', template_id: TPL.tools, notes: 'Get every app you need on your phone and computer.', status: 'done', due_date: day(-1), created_at: at(6, '15:20'), updated_at: at(2, '17:40') }),
  task({ id: uuid('70000000', 4), member_id: M.jordan, title: 'Shadow two dispatch calls', notes: 'Sit in on the 10:00 and 2:00 calls. Note how we confirm the crew’s ETA with the customer.', due_date: day(1), created_by: M.sam, created_at: ago(0, 1) }),
  task({ id: uuid('70000000', 5), member_id: M.jordan, title: 'Read the dispatch SOP', notes: 'It’s in Resources › SOPs. Bring two questions to Friday’s check-in.', due_date: day(3), created_by: M.sam, created_at: ago(1, 3) }),
  task({ id: uuid('70000000', 6), member_id: M.jordan, title: 'Draft my first weekly report', notes: 'Three bullets is plenty: what you did, what’s next, anything blocking you.', status: 'doing', due_date: day(4), created_by: M.riley, created_at: ago(2) }),
  task({ id: uuid('70000000', 7), member_id: M.jordan, title: 'Set up my notebook', notes: 'From the “How we use tasks” assignment.', status: 'review', due_date: day(1), created_at: ago(0, 19) }),
  task({ id: uuid('70000000', 8), member_id: M.jordan, title: 'Book a first check-in with Sam', status: 'done', due_date: day(-2), created_at: ago(5), updated_at: ago(3) }),
  task({ id: uuid('70000000', 21), member_id: M.priya, title: 'Shadow the evening handoff', status: 'doing', due_date: day(1), created_by: M.sam }),
  task({ id: uuid('70000000', 22), member_id: M.priya, title: 'Set up your company email', template_id: TPL.email, status: 'done', due_date: day(-7) }),
  task({ id: uuid('70000000', 31), member_id: M.elena, title: 'Install your tools', template_id: TPL.tools, due_date: day(-3) }),
  task({ id: uuid('70000000', 32), member_id: M.elena, title: 'Set up my notebook', status: 'doing', due_date: day(0) }),
  task({ id: uuid('70000000', 41), member_id: M.taylor, title: 'Update the crew roster for December', status: 'doing', due_date: day(5), created_by: M.riley }),
];

// ───────── notebook ─────────
const page = (o: any) => ({ parent_id: null, shared: false, module_id: null, files: [], sort: 0, created_at: ago(5), updated_at: ago(1), ...o });
const P = { tasks: uuid('80000000', 1), mentor: uuid('80000000', 2), meetings: uuid('80000000', 3), huddle: uuid('80000000', 4), daily: uuid('80000000', 5), shortcuts: uuid('80000000', 6) };
const pages = [
  page({ id: P.tasks, member_id: M.jordan, title: 'Module notes: How we use tasks', shared: true, module_id: MOD.tasks, sort: 1, created_at: ago(1, 4), updated_at: ago(0, 19),
    files: [{ name: 'task-statuses.png', path: `${M.jordan}/notes/${uuid('d1000000', 1)}-task-statuses.png`, size: 184320 }],
    body: 'Statuses move left to right\n- To do: assigned, not started\n- In progress: I’m working on it\n- In review: done on my side, waiting for Sam to check\n- Done: approved\n\nGood task titles start with a verb and say what done looks like.\nOne owner per task, even when others help.\nUpdates go on the task, not in a DM.\n\nTo try: move “Set up my notebook” to In review once the page is ready.' }),
  page({ id: P.mentor, member_id: M.jordan, title: 'Questions for my mentor', shared: true, sort: 2, created_at: ago(3), updated_at: ago(0, 2),
    body: 'Questions\n- Who covers dispatch when the evening shift is short?\n- Should customer callbacks be their own task, or a note on the job?\n- When do I graduate from trainee?\n\nAnswers and notes\n- Callbacks: their own task, due the same day (Sam)\n' }),
  page({ id: P.meetings, member_id: M.jordan, title: 'Team meetings', sort: 3, body: 'Notes from huddles and check-ins.', created_at: ago(3) }),
  page({ id: P.huddle, member_id: M.jordan, parent_id: P.meetings, title: 'Daily huddle, Tue Nov 3', sort: 1, created_at: ago(2), updated_at: ago(2),
    body: 'Who was there: Riley, Sam, Taylor, Priya, me\n\nWhat we talked about\n- Two crews short on Thursday\n- New dispatch SOP goes live this week\n\nAction items (who, what, by when)\n- Me: read the dispatch SOP by Friday\n' }),
  page({ id: P.daily, member_id: M.jordan, title: 'Daily log, Wed Nov 4', sort: 4, created_at: ago(1), updated_at: ago(0, 16),
    body: 'What I worked on\n- Finished the Welcome and culture module\n- Sent How we use tasks for review\n\nWins\n- First solo schedule change\n' }),
  page({ id: P.shortcuts, member_id: M.jordan, title: 'Dispatch board shortcuts', sort: 5, created_at: ago(2), updated_at: ago(1), body: 'N: new job\nA: assign crew\nShift + S: send ETA text' }),
  page({ id: uuid('80000000', 21), member_id: M.priya, title: 'Late crew playbook', shared: true, body: 'Text first, then call.', updated_at: ago(2) }),
];

// ───────── vault ─────────
const VAULT_SECRETS: Record<string, string> = {};
const vault = [
  ['Company email', 'jordan.lee@example.com', 'mail.example.com', 'Lantern-Orbit-42!pine'],
  ['Dispatch board', 'jlee', 'dispatch.example.com', 'Rk9w-mZ4q!Tp7vXa'],
  ['Fleet tracker', 'jordan.lee', 'fleet.example.com', 'Qp3!vN8s-Lm2wRt'],
  ['Payroll portal', 'jlee-4471', 'payroll.example.com', 'Harbor#7Tide-2026'],
].map(([label, username, url, secret], i) => {
  const id = uuid('90000000', i + 1);
  VAULT_SECRETS[id] = secret!;
  return { id, member_id: M.jordan, label, username, url, created_at: ago(5 - i), updated_at: ago(4 - i) };
});

// ───────── chat ─────────
const chan = (o: any) => ({ description: '', kind: 'company', department_id: null, read_only: false, created_at: ago(100), ...o });
const channels = [
  chan({ id: CH.announcements, slug: 'announcements', name: 'announcements', description: 'Company news from admins', read_only: true }),
  chan({ id: CH.general, slug: 'general', name: 'general', description: 'Anything for everyone' }),
  chan({ id: CH.newhires, slug: 'new-hires', name: 'new-hires', description: 'New hires and their mentors', kind: 'cohort' }),
  chan({ id: CH.ops, slug: 'operations', name: 'operations', description: 'Schedules, handoffs and the daily huddle', kind: 'department', department_id: DEP.ops }),
  chan({ id: CH.dmSam, slug: `dm-${M.jordan}-${M.sam}`, name: 'Direct message', kind: 'dm', created_at: ago(6) }),
  chan({ id: CH.dmRiley, slug: `dm-${M.jordan}-${M.riley}`, name: 'Direct message', kind: 'dm', created_at: ago(4) }),
  chan({ id: CH.dmPriya, slug: `dm-${M.priya}-${M.sam}`, name: 'Direct message', kind: 'dm', created_at: ago(12) }),
  chan({ id: CH.dmElena, slug: `dm-${M.elena}-${M.riley}`, name: 'Direct message', kind: 'dm', created_at: ago(8) }),
];
const channelMembers = [
  [CH.dmSam, M.jordan], [CH.dmSam, M.sam], [CH.dmRiley, M.jordan], [CH.dmRiley, M.riley],
  [CH.dmPriya, M.priya], [CH.dmPriya, M.sam], [CH.dmElena, M.elena], [CH.dmElena, M.riley],
].map(([channel_id, member_id]) => ({ channel_id, member_id }));
let msgN = 0;
const msg = (channel_id: string, member_id: string, created_at: string, body: string) => ({ id: ++msgN, channel_id, member_id, body, created_at });
const messages = [
  msg(CH.announcements, M.avery, at(3, '08:05'), 'Welcome to everyone starting this week! Your first stop is the Home screen in RAMP.'),
  msg(CH.announcements, M.avery, ago(0, 3), 'Heads up: the office is closed November 26 and 27. Details are in News.'),
  msg(CH.general, M.harper, at(1, '16:02'), 'Huge thanks to the Operations team for covering the Thursday rush. 🙌'),
  msg(CH.general, M.taylor, at(1, '16:10'), 'Team effort! Priya and Jordan jumped right in.'),
  msg(CH.general, M.avery, ago(0, 0, 50), 'Reminder: open enrollment closes November 20. Ping me with any benefits questions.'),
  msg(CH.newhires, M.priya, at(2, '10:12'), 'Does anyone know where the dispatch SOP lives?'),
  msg(CH.newhires, M.sam, at(2, '10:15'), 'Resources › SOPs. It’s the first one in the list.'),
  msg(CH.newhires, M.jordan, at(1, '11:40'), 'Tip: the practice tour in More is worth replaying once you’ve used the real board.'),
  msg(CH.ops, M.riley, at(0, '08:10'), 'Huddle at 9:15. Two crews are short today, so we’ll rebalance the afternoon routes.'),
  msg(CH.ops, M.taylor, ago(0, 0, 35), 'Crew 4 is running 20 minutes late. Customer has been texted.'),
  msg(CH.dmSam, M.jordan, at(1, '15:42'), 'Hi Sam! I just sent “How we use tasks” for review.'),
  msg(CH.dmSam, M.jordan, at(1, '15:43'), 'I also added “Set up my notebook” to my board and moved it to In review, like the assignment said.'),
  msg(CH.dmSam, M.sam, at(1, '16:20'), 'Nice. I’ll look at it this morning.'),
  msg(CH.dmSam, M.sam, at(0, '08:58'), 'Want to shadow the 10:00 dispatch call with me? I added it to your tasks.'),
  msg(CH.dmSam, M.jordan, at(0, '09:01'), 'Yes please! Should I bring anything?'),
  msg(CH.dmSam, M.sam, at(0, '09:03'), 'Just your notebook. Write down how we confirm the crew’s ETA with the customer.'),
  msg(CH.dmSam, M.sam, at(0, '09:04'), 'The dispatch SOP is in Resources if you want a head start.'),
  msg(CH.dmSam, M.jordan, at(0, '09:06'), 'Will do. See you at 10!'),
  msg(CH.dmRiley, M.riley, at(2, '13:30'), 'Welcome aboard, Jordan. Your weekly report is due Monday. Three bullets is plenty.'),
  msg(CH.dmRiley, M.jordan, at(2, '13:41'), 'Thanks Riley, I’ll have it in.'),
  msg(CH.dmPriya, M.priya, ago(2, 3), 'I sent Operations essentials for review.'),
  msg(CH.dmElena, M.riley, ago(1, 5), 'I left feedback on How we use tasks. Small fix, then send it again.'),
];

// ───────── news ─────────
const ann = (o: any) => ({ body: '', audience: 'everyone', department_id: null, require_ack: false, created_by: M.avery, ...o });
const A = { thanks: uuid('a0000000', 1), sop: uuid('a0000000', 2), enroll: uuid('a0000000', 3), welcome: uuid('a0000000', 4), phishing: uuid('a0000000', 5), checkins: uuid('a0000000', 6) };
const announcements = [
  ann({ id: A.thanks, title: 'Office closed for Thanksgiving', require_ack: true, created_at: ago(0, 3),
    body: 'The office is closed Thursday, November 26 and Friday, November 27. Dispatch runs a small on-call crew; Riley will share the schedule next week.\n\nPlease confirm you’ve seen this so we know everyone has the dates.' }),
  ann({ id: A.sop, title: 'New dispatch SOP is live', audience: 'department', department_id: DEP.ops, created_by: M.riley, created_at: ago(1, 2),
    body: 'The updated dispatch SOP is in Resources › SOPs. The big change: confirm every crew ETA with the customer by text, not just by phone. Questions go in #operations.' }),
  ann({ id: A.enroll, title: 'Open enrollment ends November 20', audience: 'employees', require_ack: true, created_at: ago(2, 1),
    body: 'Benefits choices for next year are due by November 20. Avery has office hours Tuesday and Thursday afternoons.' }),
  ann({ id: A.welcome, title: 'Welcome our November new hires', created_by: M.harper, created_at: ago(3, 1),
    body: 'Please welcome Jordan Lee and Priya Shah to Operations, and Elena Petrova to Customer Support. Say hi in #new-hires!' }),
  ann({ id: A.checkins, title: 'Trainee check-ins move to Fridays', audience: 'trainees', created_at: ago(4, 2),
    body: 'Starting this week, mentor check-ins are on Friday mornings. Bring your questions from your notebook.' }),
  ann({ id: A.phishing, title: 'Reminder: watch for phishing emails', require_ack: true, created_at: ago(6, 3),
    body: 'We’ve seen fake “password expired” emails this month. Never sign in from a link you weren’t expecting. Report anything odd to Avery.' }),
];
const ack = (announcement_id: string, member_id: string, when: string) => ({ announcement_id, member_id, at: when });
const acks = [
  ...[M.jordan, M.sam, M.riley, M.taylor, M.priya, M.elena, M.harper].map((m, i) => ack(A.phishing, m, ago(5, i))),
  ...[M.sam, M.riley, M.taylor, M.harper].map((m, i) => ack(A.thanks, m, ago(0, 2, 40 - i * 9))),
  ...[M.sam, M.taylor, M.riley].map((m, i) => ack(A.enroll, m, ago(1, i * 3))),
];

// ───────── resources ─────────
const res = (o: any) => ({ url: '', body: '', file_path: null, required: false, job_role_id: null, guest_visible: false, created_at: ago(40), updated_at: ago(10), ...o });
const resources = [
  res({ id: uuid('b0000000', 1), title: 'Employee handbook', category: 'policy', url: 'https://handbook.example.com', required: true, sort: 1, guest_visible: true }),
  res({ id: uuid('b0000000', 2), title: 'Paid time off and holidays', category: 'policy', sort: 2,
    body: 'Full-time staff get 15 days of paid time off a year, plus company holidays.\n\nAsk for time off at least two weeks ahead by messaging your lead, then add it to the team calendar.\n\nSick days don’t need notice. Message your lead as soon as you can.' }),
  res({ id: uuid('b0000000', 3), title: 'Code of conduct', category: 'policy', required: true, file_path: 'org/resources/code-of-conduct.pdf', sort: 3 }),
  res({ id: uuid('b0000000', 4), title: 'Dispatch SOP', category: 'sop', required: true, sort: 4,
    body: '1. Check overnight requests and today’s schedule by 8:00.\n2. Confirm every crew ETA with the customer by text, and note it on the job.\n3. If a crew is late, text the customer first, then update the job.\n4. Hand off open jobs to the evening shift in #operations by 4:30.' }),
  res({ id: uuid('b0000000', 5), title: 'Opening and closing checklist', category: 'sop', job_role_id: ROLE.coord, sort: 5,
    body: 'Opening: unlock the dispatch board, check voicemail, review today’s jobs.\nClosing: hand off open jobs, log out of the fleet tracker, lock your screen.' }),
  res({ id: uuid('b0000000', 6), title: 'RAMP user guide', category: 'guide', url: '/guide', sort: 6, guest_visible: true }),
  res({ id: uuid('b0000000', 7), title: 'Submitting expenses', category: 'guide', url: 'https://expenses.example.com/how-to', sort: 7 }),
  res({ id: uuid('b0000000', 8), title: 'Fleet tracker', category: 'tool', url: 'https://fleet.example.com', sort: 8 }),
  res({ id: uuid('b0000000', 9), title: 'Company email', category: 'tool', url: 'https://mail.example.com', sort: 9 }),
  res({ id: uuid('b0000000', 10), title: 'Payroll portal', category: 'tool', url: 'https://payroll.example.com', sort: 10 }),
  res({ id: uuid('b0000000', 11), title: 'Account handoff template', category: 'other', job_role_id: ROLE.account, file_path: 'org/resources/account-handoff.docx', sort: 11 }),
];

// ───────── access requests and potential staff ─────────
const accessRequests = [
  { id: uuid('e0000000', 1), auth_user_id: 'u-sofia', email: 'sofia.romero@example.com', name: 'Sofia Romero', note: 'I start next Monday in Customer Support. Avery said to sign up here.', status: 'open', created_at: ago(0, 5) },
];
const POTENTIAL = [
  { source: 'request', ref: accessRequests[0]!.id, name: 'Sofia Romero', email: 'sofia.romero@example.com', detail: 'Asked for access: I start next Monday in Customer Support. Avery said to sign up here.', at: ago(0, 5) },
  { source: 'hiring', ref: uuid('f1000000', 1), name: 'Isabel Torres', email: 'isabel.torres@example.com', detail: 'Dispatcher · Offer accepted', at: ago(2, 4) },
  { source: 'hiring', ref: uuid('f1000000', 2), name: 'Daniel Okoro', email: 'daniel.okoro@example.com', detail: 'Account Manager · Offer accepted', at: ago(4, 1) },
  { source: 'hiring', ref: uuid('f1000000', 3), name: 'Mei Tanaka', email: 'mei.tanaka@example.com', detail: 'Support Specialist · Background check', at: ago(5, 6) },
  { source: 'staff', ref: uuid('f2000000', 1), name: 'Grace Liu', email: 'grace.liu@example.com', detail: 'Staff record · Google Workspace user, Slack member', at: ago(20) },
  { source: 'staff', ref: uuid('f2000000', 2), name: 'Ben Carter', email: '', detail: 'Staff record · Slack member', at: ago(34) },
];

// ───────── audit log ─────────
let auN = 0;
const au = (when: string, actor: string | null, action: string, memberId: string | null, detail: string, ip: string | null, ua: string | null) =>
  ({ id: ++auN, at: when, actor_id: actor, action, member_id: memberId, detail, ip, user_agent: ua });
const audit = [
  au(ago(30), M.avery, 'updated org', null, 'Northwind Services', IP.avery, UA.macSafari),
  au(ago(4), M.avery, 'graduated', M.taylor, 'trainee → employee', IP.avery, UA.macSafari),
  au(ago(16), M.avery, 'invited', M.priya, 'priya.shah@example.com as trainee', IP.avery, UA.macSafari),
  au(ago(11), M.avery, 'invited', M.elena, 'elena.petrova@example.com as trainee', IP.avery, UA.macSafari),
  au(at(8, '11:20'), M.avery, 'invited', M.jordan, 'jordan.lee@example.com as trainee', IP.avery, UA.macSafari),
  au(at(6, '14:02'), M.jordan, 'joined', M.jordan, 'Created a login and joined RAMP', IP.jordanHome, UA.iphone),
  au(at(6, '14:21'), M.jordan, 'submitted', M.jordan, 'New employee information (v1)', IP.jordanHome, UA.iphone),
  au(at(6, '14:30'), M.jordan, 'submitted', M.jordan, 'Photo ID upload (v1)', IP.jordanHome, UA.iphone),
  au(at(6, '14:44'), M.jordan, 'signed', M.jordan, 'Payroll and direct deposit (v2)', IP.jordanHome, UA.iphone),
  au(at(6, '14:52'), M.jordan, 'signed', M.jordan, 'Policies and core principles (v1)', IP.jordanHome, UA.iphone),
  au(at(6, '15:20'), M.jordan, 'finished onboarding', M.jordan, '3 first-week tasks added', IP.jordanHome, UA.iphone),
  au(ago(5, 2), M.avery, 'updated person', M.elena, 'mentor changed', IP.avery, UA.macSafari),
  au(ago(3, 1), M.harper, 'created announcements', null, 'Welcome our November new hires', IP.harper, UA.macChrome),
  au(ago(3), M.avery, 'invited', M.marcus, 'marcus.diaz@example.com as trainee', IP.avery, UA.macSafari),
  au(ago(3, 5), M.avery, 'invited', M.owen, 'owen.park@example.com as trainee', IP.avery, UA.macSafari),
  au(at(2, '17:40'), M.jordan, 'submitted', M.jordan, 'Install your tools (v1)', IP.jordanHome, UA.macChrome),
  au(ago(2, 3), M.priya, 'submitted module', M.priya, 'Operations essentials', IP.priya, UA.iphone),
  au(ago(1, 5), M.riley, 'returned', M.elena, 'How we use tasks', IP.office, UA.macChrome),
  au(ago(1, 2), M.avery, 'invited', M.nina, 'nina.alvarez@example.com as trainee', IP.avery, UA.macSafari),
  au(at(1, '19:12'), M.marcus, 'joined', M.marcus, 'Created a login and joined RAMP', IP.marcus, UA.android),
  au(at(1, '19:31'), M.marcus, 'submitted', M.marcus, 'New employee information (v1)', IP.marcus, UA.android),
  au(at(1, '19:44'), M.marcus, 'submitted', M.marcus, 'Photo ID upload (v1)', IP.marcus, UA.android),
  au(ago(0, 18), M.jordan, 'submitted module', M.jordan, 'How we use tasks', IP.jordanHome, UA.iphone),
  au(ago(0, 3), M.avery, 'created announcements', null, 'Office closed for Thanksgiving', IP.avery, UA.macSafari),
  au(ago(0, 1, 10), M.avery, 'viewed profile', M.jordan, '', IP.avery, UA.macSafari),
  au(ago(0, 1, 8), M.avery, 'revealed', M.jordan, 'Account number on Payroll and direct deposit', IP.avery, UA.macSafari),
  au(ago(0, 1, 6), M.avery, 'opened file', M.jordan, 'W-4 2026 signed.pdf on Payroll and direct deposit', IP.avery, UA.macSafari),
  au(ago(0, 0, 30), M.avery, 'updated templates', null, 'Install your tools', IP.avery, UA.macSafari),
];

// ───────── storage listing (Person › Files) ─────────
export const STORAGE: any[] = [];
for (const s of submissions) for (const f of s.files) {
  const [mid, folder, name] = f.path.split('/');
  STORAGE.push({ prefix: `${mid}/${folder}`, id: name, name, created_at: s.created_at, metadata: { size: 240000 + name.length * 913 } });
}
for (const p of pages) for (const f of p.files) {
  const [mid, folder, name] = f.path.split('/');
  STORAGE.push({ prefix: `${mid}/${folder}`, id: name, name, created_at: p.updated_at, metadata: { size: f.size } });
}

// ───────── org ─────────
const org = {
  id: true, name: 'Northwind Services', brand_color: '#4338CA', timezone: 'America/New_York',
  welcome_from: 'Harper Quinn, Founder',
  welcome_headline: 'Hi {first}, welcome to Northwind Services.',
  welcome_message: 'We’re glad you’re here. RAMP is where you’ll do your training, sign your paperwork and find everything you need.\nYour first week is about learning how we work. Your mentor is with you the whole way, so ask anything.',
  welcome_video_url: '',
  flow: [{ id: 'welcome', on: true }, { id: 'profile', on: true }, { id: 'practice', on: true }, { id: 'documents', on: true }, { id: 'mentor', on: true }, { id: 'done', on: true }],
  flow_reviewed: true,
  flags: { chat: true, tasks: true, certificates: true, record_ip: true },
  updated_at: ago(2),
};

const departments = [
  { id: DEP.support, name: 'Customer Support', lead_id: null, created_at: ago(120) },
  { id: DEP.ops, name: 'Operations', lead_id: M.riley, created_at: ago(120) },
  { id: DEP.hr, name: 'People and HR', lead_id: M.avery, created_at: ago(120) },
  { id: DEP.sales, name: 'Sales', lead_id: null, created_at: ago(120) },
];
const jobRoles = [
  { id: ROLE.account, title: 'Account Manager', department_id: DEP.sales, level: 'employee', description: 'Looks after client accounts and renewals. From the hiring app.', created_at: ago(90) },
  { id: ROLE.dispatch, title: 'Dispatcher', department_id: DEP.ops, level: 'employee', description: 'Assigns crews to jobs and keeps customers updated. From the hiring app.', created_at: ago(90) },
  { id: ROLE.hr, title: 'HR Manager', department_id: DEP.hr, level: 'admin', description: 'Hiring, onboarding, payroll and people records.', created_at: ago(110) },
  { id: ROLE.coord, title: 'Operations Coordinator', department_id: DEP.ops, level: 'employee', description: 'Schedules jobs, tracks progress and handles handoffs.', created_at: ago(90) },
  { id: ROLE.opsmgr, title: 'Operations Manager', department_id: DEP.ops, level: 'lead', description: 'Leads the Operations team.', created_at: ago(100) },
  { id: ROLE.support, title: 'Support Specialist', department_id: DEP.support, level: 'employee', description: 'Answers customer calls and messages. From the hiring app.', created_at: ago(90) },
  { id: ROLE.member, title: 'Team Member', department_id: DEP.ops, level: 'employee', description: 'General role for new staff', created_at: ago(120) },
];

export const DB: Record<string, any[]> = {
  ramp_timesheets: [], ramp_invoices: [], ramp_invoice_lines: [], ramp_clients: [], ramp_client_modules: [],
  ramp_org: [org], ramp_departments: departments, ramp_job_roles: jobRoles, ramp_members: members,
  ramp_modules: modules, ramp_role_modules: roleModules, ramp_progress: progress, ramp_templates: templates,
  ramp_submissions: submissions, ramp_signins: signins, ramp_audit: audit, ramp_tasks: tasks, ramp_pages: pages,
  ramp_vault: vault, ramp_channels: channels, ramp_channel_members: channelMembers, ramp_messages: messages,
  ramp_announcements: announcements, ramp_acks: acks, ramp_resources: resources, ramp_access_requests: accessRequests,
};
(window as any).__DB = DB;

// ───────── row-level security (mirrors 001_ramp_schema.sql) ─────────
const RANKS: Record<string, number> = { owner: 1, admin: 2, lead: 3, mentor: 4, employee: 5, trainee: 6, guest: 7, client: 8 };
const me = () => DB.ramp_members.find((m) => m.id === meId()) || null;
const myRank = () => { const m = me(); return m && m.status === 'active' ? RANKS[m.level]! : 99; };
const isAdmin = () => myRank() <= 2;
function canSee(memberId: string) {
  const a = me();
  const b = DB.ramp_members.find((m) => m.id === memberId);
  if (!a || !b || a.status !== 'active') return false;
  return a.id === b.id || RANKS[a.level]! <= 2
    || (a.level === 'lead' && !!a.department_id && a.department_id === b.department_id)
    || ((a.level === 'lead' || a.level === 'mentor') && b.mentor_id === a.id);
}
function canReadChannel(id: string) {
  if (myRank() > 6) return false;
  const c = DB.ramp_channels.find((x) => x.id === id);
  if (!c) return false;
  return c.kind !== 'dm' || DB.ramp_channel_members.some((cm) => cm.channel_id === c.id && cm.member_id === meId());
}
export function canRead(table: string, r: any) {
  const rank = myRank();
  switch (table) {
    case 'ramp_members': return canSee(r.id);
    case 'ramp_progress': case 'ramp_tasks': return canSee(r.member_id);
    case 'ramp_pages': return r.member_id === meId() || (r.shared && rank <= 4 && canSee(r.member_id));
    case 'ramp_vault': return r.member_id === meId();
    case 'ramp_submissions': case 'ramp_signins': case 'ramp_acks': return r.member_id === meId() || isAdmin();
    case 'ramp_audit': case 'ramp_access_requests': return isAdmin();
    case 'ramp_modules': return isAdmin() || (r.status === 'published' && (rank <= 6 || (r.guest_visible && rank === 7)));
    case 'ramp_templates': return isAdmin() || (r.status === 'published' && rank <= 7);
    case 'ramp_channels': return canReadChannel(r.id);
    case 'ramp_channel_members': case 'ramp_messages': return canReadChannel(r.channel_id);
    case 'ramp_announcements': return rank <= 6;
    case 'ramp_org': return true;
    case 'ramp_timesheets': return isAdmin() || r.member_id === meId();
    case 'ramp_invoices': return isAdmin() || (rank === 8 && r.client_id === me()?.client_id && r.status !== 'draft');
    case 'ramp_invoice_lines': { const i = DB.ramp_invoices.find((x) => x.id === r.invoice_id); return isAdmin() || (!!i && rank === 8 && i.client_id === me()?.client_id && i.status !== 'draft'); }
    case 'ramp_clients': return isAdmin() || r.id === me()?.client_id;
    case 'ramp_client_modules': return rank <= 6;
    case 'ramp_resources': return rank <= 6 || (r.guest_visible && rank === 7);
    default: return rank <= 7;
  }
}

/** Column defaults for inserts. */
export function defaultsFor(table: string) {
  const n = null;
  switch (table) {
    case 'ramp_tasks': return { id: n, notes: '', due_date: n, status: 'todo', template_id: n, created_by: n, created_at: n, updated_at: n };
    case 'ramp_pages': return { id: n, parent_id: n, title: 'Untitled page', body: '', shared: false, module_id: n, files: [], sort: 0, created_at: n, updated_at: n };
    case 'ramp_messages': return { id: n, created_at: n };
    case 'ramp_announcements': return { id: n, body: '', audience: 'everyone', department_id: n, require_ack: false, created_by: n, created_at: n };
    case 'ramp_acks': return { at: n };
    case 'ramp_modules': return { id: n, summary: '', minutes: 10, objectives: [], blocks: [], pass_score: 0, mentor_review: false, due_days: n, required: false, guest_visible: false, builtin: n, status: 'draft', sort: 0, created_by: n, created_at: n, updated_at: n };
    case 'ramp_templates': return { id: n, audience: 'everyone', job_role_id: n, description: '', fields: [], legal_review: false, status: 'draft', version: 1, sort: 0, created_at: n, updated_at: n };
    case 'ramp_resources': return { id: n, url: '', body: '', file_path: n, required: false, job_role_id: n, guest_visible: false, sort: 0, created_at: n, updated_at: n };
    case 'ramp_job_roles': return { id: n, description: '', department_id: n, level: 'employee', created_at: n };
    case 'ramp_departments': return { id: n, lead_id: n, created_at: n };
    case 'ramp_role_modules': return { sort: 0 };
    case 'ramp_audit': return { id: n, at: new Date().toISOString(), ip: '198.51.100.12', user_agent: navigator.userAgent };
    default: return { id: n, created_at: n };
  }
}

// ───────── RPCs ─────────
const REQ_IP = '203.0.113.24';
const log = (action: string, memberId: string | null, detail: string) =>
  DB.ramp_audit.push({ id: Math.max(...DB.ramp_audit.map((a) => a.id)) + 1, at: new Date().toISOString(), actor_id: meId(), action, member_id: memberId, detail, ip: REQ_IP, user_agent: navigator.userAgent });
const upsertProgress = (member_id: string, module_id: string, patch: any) => {
  let p = DB.ramp_progress.find((x) => x.member_id === member_id && x.module_id === module_id);
  if (!p) { p = prog(member_id, module_id, { status: 'in_progress', step: 0, completed_at: null, started_at: new Date().toISOString() }); DB.ramp_progress.push(p); }
  Object.assign(p, patch, { updated_at: new Date().toISOString() });
  return p;
};

export const RPC: Record<string, (a: any) => any> = {
  ramp_public_brand: () => ({ name: 'RAMP', color: '#4338CA' }),
  ramp_session_start: () => ({ state: 'ok', member_id: meId() }),
  ramp_request_access: () => null,
  ramp_directory: () => DB.ramp_members
    .filter((m) => m.status === 'active' && (myRank() <= 6 || m.id === meId()))
    .map((m) => ({ id: m.id, full_name: m.full_name, preferred_name: m.preferred_name, level: m.level,
      job_title: jobRoles.find((r) => r.id === m.job_role_id)?.title || '', department: departments.find((d) => d.id === m.department_id)?.name || '', mentor_id: m.mentor_id }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  ramp_update_profile: (a) => { const m = me(); Object.assign(m, { full_name: a.p_full_name, preferred_name: a.p_preferred, phone: a.p_phone, timezone: a.p_timezone }); return null; },
  ramp_log: (a) => { log(a.p_action, a.p_member, a.p_detail || ''); return null; },
  ramp_mark_practice_done: () => { const m = me(); m.practice_done_at = m.practice_done_at || new Date().toISOString(); upsertProgress(m.id, MOD.practice, { status: 'completed', step: 99, score: 100, completed_at: new Date().toISOString() }); return null; },
  ramp_finish_onboarding: () => {
    const m = me();
    const first = DB.ramp_templates.filter((t) => t.status === 'published' && t.stage === 'first_week' && (t.audience === 'everyone' || (t.audience === 'role' && t.job_role_id === m.job_role_id))
      && !DB.ramp_tasks.some((k) => k.member_id === m.id && k.template_id === t.id));
    first.forEach((t) => DB.ramp_tasks.push(task({ id: newId(), member_id: m.id, title: t.title, notes: t.description, due_date: day(5), template_id: t.id, created_at: new Date().toISOString() })));
    m.onboarded_at = m.onboarded_at || new Date().toISOString();
    return first.length;
  },
  ramp_submit: (a) => {
    const t = DB.ramp_templates.find((x) => x.id === a.p_template);
    const id = newId();
    for (const [k, v] of Object.entries(a.p_secure || {})) SECRETS[`${id}:${k}`] = v as string;
    DB.ramp_submissions.push({ id, member_id: meId(), template_id: t.id, template_title: t.title, template_version: t.version, answers: a.p_answers || {}, secure_fields: Object.keys(a.p_secure || {}),
      files: a.p_files || [], signed_name: a.p_signed_name, ip: REQ_IP, user_agent: navigator.userAgent, created_at: new Date().toISOString() });
    DB.ramp_tasks.filter((k) => k.member_id === meId() && k.template_id === t.id).forEach((k) => { k.status = 'done'; });
    return id;
  },
  ramp_reveal: (a) => {
    const s = DB.ramp_submissions.find((x) => x.id === a.p_submission);
    if (!s || !isAdmin() && s.member_id !== meId()) throw new Error('You can’t open this record.');
    log('revealed', s.member_id, `${a.p_label || a.p_field} on ${s.template_title}`);
    return SECRETS[`${a.p_submission}:${a.p_field}`] ?? '';
  },
  ramp_module_save: (a) => { upsertProgress(meId()!, a.p_module, { step: Math.max(0, a.p_step || 0) }); return null; },
  ramp_module_finish: (a) => {
    const mod = DB.ramp_modules.find((x) => x.id === a.p_module);
    const status = mod.mentor_review ? 'submitted' : 'completed';
    const now = new Date().toISOString();
    upsertProgress(meId()!, a.p_module, { status, step: 999, score: a.p_score, answer: a.p_answer || '', feedback: '', submitted_at: status === 'submitted' ? now : null, completed_at: status === 'completed' ? now : null });
    log(status === 'submitted' ? 'submitted module' : 'completed module', meId(), mod.title);
    return status;
  },
  ramp_review: (a) => {
    const p = DB.ramp_progress.find((x) => x.member_id === a.p_member && x.module_id === a.p_module && x.status === 'submitted');
    if (!p) throw new Error('Nothing waiting for review.');
    Object.assign(p, { status: a.p_approve ? 'completed' : 'returned', feedback: a.p_feedback || '', reviewer_id: meId(), completed_at: a.p_approve ? new Date().toISOString() : null });
    return null;
  },
  ramp_invite: (a) => {
    const email = String(a.p_email || '').trim().toLowerCase();
    if (DB.ramp_members.some((m) => m.email === email)) throw new Error('That email is already in RAMP.');
    const role = jobRoles.find((r) => r.id === a.p_job_role);
    const id = newId();
    DB.ramp_members.push(member({ id, email, full_name: a.p_name || '', level: a.p_level || 'trainee', job_role_id: a.p_job_role || null, department_id: role?.department_id || null,
      mentor_id: a.p_mentor || null, status: 'invited', auth_user_id: null, source: a.p_source || 'manual', source_ref: a.p_ref || null, start_date: a.p_start || null,
      invited_by: meId(), invited_at: new Date().toISOString(), joined_at: null }));
    return id;
  },
  ramp_graduate: (a) => {
    const m = DB.ramp_members.find((x) => x.id === a.p_member);
    const lvl = jobRoles.find((r) => r.id === m.job_role_id)?.level || 'employee';
    Object.assign(m, { level: lvl, graduated_at: new Date().toISOString() });
    return lvl;
  },
  ramp_potential_staff: () => {
    if (!isAdmin()) throw new Error('Only admins can see this.');
    return POTENTIAL.filter((p) => !DB.ramp_members.some((m) => m.email === p.email) && (p.source !== 'request' || DB.ramp_access_requests.some((r) => r.id === p.ref && r.status === 'open')));
  },
  ramp_dm: (a) => {
    const mine = DB.ramp_channel_members.filter((x) => x.member_id === meId()).map((x) => x.channel_id);
    const hit = DB.ramp_channels.find((c) => c.kind === 'dm' && mine.includes(c.id) && DB.ramp_channel_members.some((x) => x.channel_id === c.id && x.member_id === a.p_other));
    if (hit) return hit.id;
    const id = newId();
    DB.ramp_channels.push(chan({ id, slug: `dm-${meId()}-${a.p_other}`, name: 'Direct message', kind: 'dm', created_at: new Date().toISOString() }));
    DB.ramp_channel_members.push({ channel_id: id, member_id: meId() }, { channel_id: id, member_id: a.p_other });
    return id;
  },
  ramp_vault_save: (a) => {
    let e = a.p_id ? DB.ramp_vault.find((x) => x.id === a.p_id) : null;
    if (!e) { e = { id: newId(), member_id: meId(), created_at: new Date().toISOString() }; DB.ramp_vault.push(e); }
    Object.assign(e, { label: a.p_label, username: a.p_username || '', url: a.p_url || '', updated_at: new Date().toISOString() });
    if (a.p_secret !== null && a.p_secret !== undefined) VAULT_SECRETS[e.id] = a.p_secret;
    return e.id;
  },
  ramp_vault_reveal: (a) => {
    const e = DB.ramp_vault.find((x) => x.id === a.p_id && x.member_id === meId());
    if (!e) throw new Error('Not found.');
    return VAULT_SECRETS[e.id] || null;
  },
};

// Platform console › Demo accounts (the ramp-demo edge function).
(window as any).__FN = {
  ...((window as any).__FN || {}),
  'ramp-demo': (body: any) => {
    if (body.action === 'signin') throw new Error('Demo sign-in isn’t available in the preview.');
    const people = [
      ['owner', 'Olivia Owner', 'owner'], ['admin', 'Adam Admin', 'admin'], ['lead', 'Lena Lead', 'lead'], ['mentor', 'Marco Mentor', 'mentor'],
      ['employee', 'Erin Employee', 'employee'], ['trainee', 'Tara Trainee', 'trainee'], ['guest', 'Gary Guest', 'guest'],
      ['va', 'Val Assistant', 'trainee'], ['client', 'Cleo Client', 'client'],
    ];
    return {
      built_at: new Date(Date.now() - 2 * 86400000).toISOString(), workspace: { id: 'demo-ws', name: 'Demo Company' },
      personas: people.map(([k, name, level]) => ({ k, name, level, email: `ramp.demo+${k}@example.com`, ready: true })),
    };
  },
};
