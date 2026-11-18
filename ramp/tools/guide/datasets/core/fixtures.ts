// @ts-nocheck
// Throwaway fixtures for the agency admin pages. Fictional people and companies; dates relative to now.
export const LOG: any[] = [];
(window as any).__LOG = LOG;
export const STORAGE: any[] = [];

const NOW = Date.now();
const D = 86400000;
const ago = (days: number, h = 0) => new Date(NOW - days * D - h * 3600000).toISOString();
const day = (offset: number) => new Date(NOW + offset * D).toLocaleDateString('en-CA');
const monday = (offsetWeeks: number) => {
  const d = new Date(NOW); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow + offsetWeeks * 7);
  return d.toLocaleDateString('en-CA');
};
const uuid = (b: string, n: number) => `${b}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let seq = 500;
export const newId = () => uuid('0f000000', ++seq);

const params = new URLSearchParams(location.search);
if (params.get('as')) sessionStorage.setItem('core-as', params.get('as')!);
if (params.get('scenario')) sessionStorage.setItem('core-scenario', params.get('scenario')!);
if (params.get('stripe')) sessionStorage.setItem('core-stripe', params.get('stripe')!);
const scenario = sessionStorage.getItem('core-scenario') || 'full';
const stripeMode = sessionStorage.getItem('core-stripe') || 'off';

const M = {
  harper: uuid('10000000', 1), avery: uuid('10000000', 2), sam: uuid('10000000', 3), riley: uuid('10000000', 4),
  maria: uuid('10000000', 5), jose: uuid('10000000', 6), ana: uuid('10000000', 7), liza: uuid('10000000', 8), carlo: uuid('10000000', 9),
  dana: uuid('10000000', 10), lee: uuid('10000000', 11),
};
const C = { acme: uuid('20000000', 1), bright: uuid('20000000', 2), north: uuid('20000000', 3) };
const T = { core: uuid('30000000', 1), skilled: uuid('30000000', 2), spec: uuid('30000000', 3) };
const MOD = { welcome: uuid('40000000', 1), tasks: uuid('40000000', 2), comms: uuid('40000000', 3), crm: uuid('40000000', 4), acme: uuid('40000000', 5), dental: uuid('40000000', 6), draft: uuid('40000000', 7) };
const P = { maria: uuid('50000000', 1), jose: uuid('50000000', 2), ana: uuid('50000000', 3), liza: uuid('50000000', 4), carlo: uuid('50000000', 5), joseOld: uuid('50000000', 6) };
const INV = { a1: uuid('60000000', 1), b1: uuid('60000000', 2), a2: uuid('60000000', 3) };
const L = { a1: uuid('61000000', 1), b1: uuid('61000000', 2), a2: uuid('61000000', 3) };

const member = (o) => ({
  auth_user_id: 'u-' + o.id, full_name: '', preferred_name: '', phone: '', timezone: '', level: 'employee', job_role_id: null, department_id: null,
  mentor_id: null, status: 'active', source: 'manual', source_ref: null, start_date: null, onboarded_at: ago(100), practice_done_at: ago(100),
  graduated_at: null, last_seen_at: ago(0, 2), access_until: null, client_id: null, invited_by: M.harper, invited_at: ago(150), joined_at: ago(149),
  created_at: ago(150), updated_at: ago(1), ...o,
});

const members = [
  member({ id: M.harper, email: 'harper@example.com', full_name: 'Harper Quinn', level: 'owner' }),
  member({ id: M.avery, email: 'avery@example.com', full_name: 'Avery Brooks', level: 'admin' }),
  member({ id: M.sam, email: 'sam@example.com', full_name: 'Sam Patel', level: 'mentor' }),
  member({ id: M.riley, email: 'riley@example.com', full_name: 'Riley Chen', level: 'lead' }),
  member({ id: M.maria, email: 'maria.santos@example.com', full_name: 'Maria Santos', level: 'employee', mentor_id: M.sam, timezone: 'Asia/Manila' }),
  member({ id: M.jose, email: 'jose.reyes@example.com', full_name: 'Jose Reyes', level: 'employee', mentor_id: M.sam }),
  member({ id: M.ana, email: 'ana.cruz@example.com', full_name: 'Ana Cruz', level: 'trainee', mentor_id: M.riley }),
  member({ id: M.liza, email: 'liza.bautista@example.com', full_name: 'Liza Bautista', level: 'employee', mentor_id: M.sam }),
  member({ id: M.carlo, email: 'carlo.dizon@example.com', full_name: 'Carlo Dizon', level: 'trainee', mentor_id: M.sam }),
  member({ id: M.dana, email: 'dana@acmerealty.example.com', full_name: 'Dana Whitfield', level: 'client', client_id: C.acme, onboarded_at: null }),
  member({ id: M.lee, email: 'lee@brightpath.example.com', full_name: 'Lee Park', level: 'client', client_id: C.bright, status: 'invited', auth_user_id: null, joined_at: null, last_seen_at: null }),
];

const client = (o) => ({ website: '', industry: '', timezone: 'America/New_York', status: 'active', billing_name: '', billing_email: '', billing_address: '',
  billing_cycle: 'weekly', billing_mode: 'arrears', net_days: 7, currency: 'USD', stripe_customer_id: null, notes: '', created_by: M.avery, created_at: ago(140), updated_at: ago(3), ...o });
const clients = [
  client({ id: C.acme, name: 'Acme Realty', website: 'acmerealty.example.com', industry: 'Real estate', billing_name: 'Dana Whitfield', billing_email: 'billing@acmerealty.example.com', stripe_customer_id: 'cus_TEST123' }),
  client({ id: C.bright, name: 'Brightpath Dental', industry: 'Healthcare', timezone: 'America/Chicago', billing_cycle: 'biweekly', billing_mode: 'advance', net_days: 14, billing_email: 'ap@brightpath.example.com' }),
  client({ id: C.north, name: 'Northwind Legal', industry: 'Law firm', status: 'prospect', timezone: 'America/Los_Angeles' }),
];

const tiers = [
  { id: T.core, name: 'Core', level: 1, description: 'Finished our core systems training. Handles admin, inbox, calendar, data entry and follow-ups.', bill_rate: 10, pay_rate: 5, required_modules: [MOD.welcome, MOD.tasks], min_days: 0, min_checkin_score: 0, created_at: ago(150), updated_at: ago(150) },
  { id: T.skilled, name: 'Skilled', level: 2, description: 'Knows the client’s systems and runs recurring processes with little direction.', bill_rate: 13, pay_rate: 6.5, required_modules: [MOD.comms], min_days: 90, min_checkin_score: 4, created_at: ago(150), updated_at: ago(150) },
  { id: T.spec, name: 'Specialist', level: 3, description: 'Owns a specialty such as bookkeeping, operations or marketing tools.', bill_rate: 17, pay_rate: 8.5, required_modules: [], min_days: 180, min_checkin_score: 4.3, created_at: ago(150), updated_at: ago(150) },
];

const mod = (o) => ({ summary: '', minutes: 20, objectives: [], blocks: [{ type: 'reading', title: 'x', body: 'y' }], pass_score: 0, mentor_review: false, due_days: null, required: false,
  guest_visible: false, builtin: null, status: 'published', sort: 1, created_by: M.avery, created_at: ago(140), updated_at: ago(10), ...o });
const modules = [
  mod({ id: MOD.welcome, title: 'Welcome to Northwind Services', track: 'company', required: true, sort: 1, minutes: 15 }),
  mod({ id: MOD.tasks, title: 'Tasks and follow-ups', track: 'company', required: true, sort: 2, minutes: 25 }),
  mod({ id: MOD.comms, title: 'Client communication', track: 'role', sort: 3, minutes: 30, summary: 'Tone, response times and escalation.' }),
  mod({ id: MOD.crm, title: 'CRM basics', track: 'role', sort: 4, minutes: 20, summary: 'Contacts, deals and notes.' }),
  mod({ id: MOD.acme, title: 'Acme listings workflow', track: 'role', sort: 5, minutes: 35, summary: 'How Acme posts and updates listings.' }),
  mod({ id: MOD.dental, title: 'Dental scheduling', track: 'role', sort: 6, minutes: 25, summary: 'Booking, reminders and insurance checks.' }),
  mod({ id: MOD.draft, title: 'Bookkeeping basics', track: 'role', sort: 7, status: 'draft' }),
];
const prog = (member_id, module_id) => ({ member_id, module_id, status: 'completed', step: 9, score: 100, answer: '', feedback: '', reviewer_id: null, started_at: ago(90), submitted_at: null, completed_at: ago(80), updated_at: ago(80) });
const progress = [
  prog(M.maria, MOD.welcome), prog(M.maria, MOD.tasks), prog(M.maria, MOD.comms), prog(M.maria, MOD.acme),
  prog(M.jose, MOD.welcome), prog(M.ana, MOD.welcome), prog(M.ana, MOD.tasks), prog(M.liza, MOD.welcome), prog(M.liza, MOD.tasks), prog(M.liza, MOD.comms),
  prog(M.carlo, MOD.welcome),
];

const pl = (o) => ({ title: 'Operations coordinator', tier_id: T.core, status: 'active', start_date: null, end_date: null, hours_per_week: 40, schedule: 'Mon–Fri, 9 am – 5 pm Eastern',
  bill_rate: 10, pay_rate: 5, currency: 'USD', setup_fee: 750, setup_fee_status: 'paid', coach_id: M.sam, client_contact_id: null, replaces_id: null, guarantee_until: null,
  ended_reason: '', notes: '', created_by: M.avery, created_at: ago(130), updated_at: ago(2), ...o });
const placements = [
  pl({ id: P.maria, client_id: C.acme, member_id: M.maria, title: 'Executive coordinator', start_date: day(-120), guarantee_until: day(-60), client_contact_id: M.dana, notes: 'Dana prefers Slack over email.' }),
  pl({ id: P.jose, client_id: C.acme, member_id: M.jose, title: 'Listings coordinator', status: 'onboarding', start_date: day(5), hours_per_week: 20, guarantee_until: day(65), setup_fee_status: 'invoiced', client_contact_id: M.dana }),
  pl({ id: P.ana, client_id: C.bright, member_id: M.ana, title: 'Front desk coordinator', start_date: day(-50), hours_per_week: 30, bill_rate: 11, pay_rate: 5.5, guarantee_until: day(10), coach_id: M.riley, setup_fee: 0, setup_fee_status: 'none' }),
  pl({ id: P.liza, client_id: C.bright, member_id: M.liza, title: 'Billing specialist', tier_id: T.skilled, start_date: day(-200), bill_rate: 13, pay_rate: 6.5, guarantee_until: day(-140) }),
  pl({ id: P.carlo, client_id: C.north, member_id: M.carlo, title: 'Legal intake specialist', status: 'proposed', start_date: null, setup_fee_status: 'unbilled', coach_id: null }),
  pl({ id: P.joseOld, client_id: C.bright, member_id: M.jose, title: 'Admin coordinator', status: 'ended', start_date: day(-260), end_date: day(-210), ended_reason: 'Client needed someone in an earlier time zone.', guarantee_until: day(-200) }),
];

const DEFAULT_CHECK = [
  ['Contractor agreement signed', 'agency'], ['W-8BEN form collected', 'agency'], ['Payout details added in RAMP', 'va'], ['Kickoff call with the client', 'agency'],
  ['Tool access granted (email, project tool, drives)', 'client'], ['Accounts and configurations set up', 'va'], ['Client SOPs and checklists shared', 'client'],
  ['Working hours and communication channels agreed', 'agency'], ['First-week priorities set', 'client'], ['Timesheet and payout schedule explained', 'agency'],
];
const steps = [];
for (const [pid, doneN] of [[P.maria, 10], [P.jose, 3], [P.ana, 10], [P.liza, 10]] as [string, number][]) {
  DEFAULT_CHECK.forEach(([title, owner], i) => steps.push({ id: newId(), placement_id: pid, title, owner, sort: i, done_at: i < doneN ? ago(20 - i) : null, done_by: i < doneN ? M.sam : null, note: '' }));
}

const ci = (o) => ({ id: newId(), kind: 'va', due_date: null, status: 'scheduled', done_at: null, by_member: null, score: null, went_well: '', improve: '', actions: '', share_with_client: false, created_at: ago(100), updated_at: ago(5), ...o });
const checkins = [
  ci({ placement_id: P.maria, kind: 'va', due_date: day(-90), status: 'done', done_at: ago(90), by_member: M.sam, score: 4, went_well: 'Inbox zero every day.', improve: 'Ask sooner when blocked.', actions: 'Daily 10-minute standup.' }),
  ci({ placement_id: P.maria, kind: 'client', due_date: day(-60), status: 'done', done_at: ago(60), by_member: M.sam, score: 5, went_well: 'Dana loves the weekly summaries.', share_with_client: true }),
  ci({ placement_id: P.maria, kind: 'va', due_date: day(-30), status: 'done', done_at: ago(30), by_member: M.sam, score: 4, went_well: 'Took over listing updates.', improve: 'Double-check MLS numbers.', actions: 'Use the listing checklist.', share_with_client: true }),
  ci({ placement_id: P.maria, kind: 'va', due_date: day(-2) }),
  ci({ placement_id: P.maria, kind: 'client', due_date: day(3) }),
  ci({ placement_id: P.ana, kind: 'client', due_date: day(1) }),
  ci({ placement_id: P.ana, kind: 'va', due_date: day(-20), status: 'done', done_at: ago(20), by_member: M.riley, score: 3, improve: 'Learning the scheduling tool.' }),
  ci({ placement_id: P.liza, kind: 'va', due_date: day(-40), status: 'done', done_at: ago(40), by_member: M.sam, score: 5 }),
  ci({ placement_id: P.liza, kind: 'va', due_date: day(20) }),
  ci({ placement_id: P.jose, kind: 'va', due_date: day(12) }),
  ci({ placement_id: P.jose, kind: 'client', due_date: day(12) }),
];

const rate_changes = [
  { id: newId(), placement_id: P.liza, effective_date: day(-110), old_tier_id: T.core, new_tier_id: T.skilled, old_bill: 10, new_bill: 13, old_pay: 5, new_pay: 6.5, reason: 'Promoted after the 90-day review.', created_by: M.avery, created_at: ago(112) },
];

const ts = (o) => ({ id: newId(), member_id: null, days: [8, 8, 8, 8, 8, 0, 0], total: 40, notes: '', status: 'approved', submitted_at: ago(5), reviewed_at: ago(4), reviewed_by: M.dana, review_note: '', pay_rate: 5, invoice_line_id: null, payout_line_id: null, created_at: ago(8), updated_at: ago(4), ...o });
const timesheets = [
  ts({ placement_id: P.maria, member_id: M.maria, week_start: monday(-1), status: 'submitted', reviewed_at: null, reviewed_by: null, pay_rate: null, notes: 'Friday ran long for the open house.' , days: [8, 8, 8, 8, 9, 0, 0], total: 41 }),
  ts({ placement_id: P.maria, member_id: M.maria, week_start: monday(-2), invoice_line_id: L.a1 }),
  ts({ placement_id: P.maria, member_id: M.maria, week_start: monday(-3), invoice_line_id: L.a1, payout_line_id: uuid('70000000', 1) }),
  ts({ placement_id: P.ana, member_id: M.ana, week_start: monday(-1), status: 'submitted', days: [6, 6, 6, 6, 6, 0, 0], total: 30, reviewed_at: null, reviewed_by: null, pay_rate: null }),
  ts({ placement_id: P.ana, member_id: M.ana, week_start: monday(-2), status: 'rejected', days: [6, 6, 6, 6, 8, 0, 0], total: 32, review_note: 'Friday should be 6 hours.', pay_rate: null }),
  ts({ placement_id: P.liza, member_id: M.liza, week_start: monday(-1), pay_rate: 6.5 }),
  ts({ placement_id: P.liza, member_id: M.liza, week_start: monday(-2), pay_rate: 6.5, invoice_line_id: L.b1 }),
];

const invoices = [
  { id: INV.a1, client_id: C.acme, number: 'INV-1001', status: 'paid', period_start: monday(-3), period_end: day(-8), issue_date: day(-7), due_date: day(0), currency: 'USD', total: 800, paid_at: ago(2), paid_note: 'Paid through Stripe', stripe_invoice_id: 'in_1', stripe_url: null, stripe_pdf: null, sent_at: ago(7), notes: '', created_by: M.avery, created_at: ago(7), updated_at: ago(2) },
  { id: INV.b1, client_id: C.bright, number: 'INV-1002', status: 'open', period_start: monday(-2), period_end: day(-8), issue_date: day(-17), due_date: day(-3), currency: 'USD', total: 520, paid_at: null, paid_note: '', stripe_invoice_id: null, stripe_url: null, stripe_pdf: null, sent_at: null, notes: '', created_by: M.avery, created_at: ago(17), updated_at: ago(17) },
  { id: INV.a2, client_id: C.acme, number: 'INV-1003', status: 'draft', period_start: monday(-1), period_end: day(-1), issue_date: null, due_date: null, currency: 'USD', total: 750, paid_at: null, paid_note: '', stripe_invoice_id: null, stripe_url: null, stripe_pdf: null, sent_at: null, notes: '', created_by: M.avery, created_at: ago(1), updated_at: ago(1) },
];
const invoice_lines = [
  { id: L.a1, invoice_id: INV.a1, placement_id: P.maria, kind: 'hours', description: 'Maria Santos · hours', quantity: 80, unit_price: 10, amount: 800, period_start: monday(-3), period_end: day(-8), reconciled_at: null, sort: 0 },
  { id: L.b1, invoice_id: INV.b1, placement_id: P.liza, kind: 'hours', description: 'Liza Bautista · hours', quantity: 40, unit_price: 13, amount: 520, period_start: monday(-2), period_end: day(-8), reconciled_at: null, sort: 0 },
  { id: L.a2, invoice_id: INV.a2, placement_id: P.jose, kind: 'setup_fee', description: 'Setup', quantity: 1, unit_price: 750, amount: 750, period_start: null, period_end: null, reconciled_at: null, sort: 0 },
];

const requests = [
  { id: newId(), client_id: C.acme, placement_id: P.maria, member_id: M.dana, kind: 'hours', body: 'Could Maria cover Saturday mornings during open house season? About 4 extra hours a week through December.', status: 'open', response: '', created_at: ago(1, 3), updated_at: ago(1, 3) },
  { id: newId(), client_id: C.bright, placement_id: P.ana, member_id: M.lee, kind: 'support', body: 'Ana is still slow with insurance checks. Can her coach spend a session on it?', status: 'in_progress', response: 'Riley is booking a session for Thursday.', created_at: ago(4), updated_at: ago(3) },
  { id: newId(), client_id: C.acme, placement_id: null, member_id: M.dana, kind: 'new_va', body: 'We may need a second team member for transactions in January.', status: 'done', response: 'Jose starts next week.', created_at: ago(30), updated_at: ago(20) },
];

const client_modules = [
  { client_id: C.acme, module_id: MOD.acme, sort: 0 }, { client_id: C.acme, module_id: MOD.crm, sort: 1 },
  { client_id: C.bright, module_id: MOD.dental, sort: 0 },
];

const launch_plans = [
  { placement_id: P.jose, status: 'preparing', day1_date: day(5), data: { company: { summary: 'Acme sells homes in three counties.' }, values: [{ id: 'v1', title: 'Respond fast', practice: '' }], tools: [{ id: 't1', name: 'MLS', purpose: '', access_how: '', url: '', granted: false, tested: false }] },
    agenda: [{ key: 'intro', title: 'Introduce the company', minutes: 5, section: 'company', done: false, notes: '' }, { key: 'values', title: 'Core values', minutes: 10, section: 'values', done: false, notes: '' }],
    updated_by: M.dana, created_at: ago(6), updated_at: ago(1) },
];

const agency = {
  checklist: DEFAULT_CHECK.map(([title, owner]) => ({ title, owner })),
  checkin_days: [7, 30, 60, 90], checkin_every_days: 30, replacement_days: 60, invoice_prefix: 'INV', next_invoice_number: 1004,
  pay_when_paid: true, default_setup_fee: 750, payout_currency: 'USD',
  launch_agenda: [
    { key: 'intro', title: 'Introduce the company', minutes: 5, section: 'company' },
    { key: 'values', title: 'Core values and foundational principles', minutes: 10, section: 'values' },
    { key: 'projects', title: 'Overview of major projects', minutes: 10, section: 'projects' },
    { key: 'break', title: 'Break', minutes: 15, section: null },
    { key: 'tools', title: 'Main tools and systems', minutes: 15, section: 'tools' },
  ],
};

export const DB: Record<string, any[]> = {
  ramp_org: [{ id: true, name: 'Northwind Services', brand_color: '#4338CA', timezone: 'America/New_York', welcome_from: '', welcome_headline: '', welcome_message: '', welcome_video_url: '', flow: [], flow_reviewed: true,
    flags: { chat: true, tasks: true, certificates: false, record_ip: true, agency: true }, agency, updated_at: ago(3) }],
  ramp_members: members, ramp_clients: clients, ramp_tiers: tiers, ramp_modules: modules, ramp_progress: progress, ramp_role_modules: [],
  ramp_placements: placements, ramp_placement_steps: steps, ramp_checkins: checkins, ramp_rate_changes: rate_changes, ramp_timesheets: timesheets,
  ramp_invoices: invoices, ramp_invoice_lines: invoice_lines, ramp_client_requests: requests, ramp_client_modules: client_modules, ramp_launch_plans: launch_plans,
  ramp_job_roles: [], ramp_departments: [], ramp_templates: [], ramp_submissions: [], ramp_announcements: [], ramp_acks: [], ramp_access_requests: [], ramp_audit: [],
  ramp_payouts: [], ramp_payout_lines: [],
};

if (scenario === 'empty') {
  for (const t of ['ramp_placements', 'ramp_placement_steps', 'ramp_checkins', 'ramp_rate_changes', 'ramp_timesheets', 'ramp_invoices', 'ramp_invoice_lines', 'ramp_client_requests', 'ramp_client_modules', 'ramp_launch_plans', 'ramp_clients']) DB[t] = [];
  DB.ramp_members = DB.ramp_members.filter((m) => m.level !== 'client');
}

export function meId() { return M[sessionStorage.getItem('core-as') || 'avery'] || M.avery; }
export function currentPersona() { return sessionStorage.getItem('core-as') || 'avery'; }
export function canRead() { return true; }
export function defaultsFor(table: string) {
  const n = null;
  switch (table) {
    case 'ramp_placements': return { id: n, title: 'Operations coordinator', tier_id: n, status: 'proposed', start_date: n, end_date: n, hours_per_week: 40, schedule: '', bill_rate: 0, pay_rate: 0, currency: 'USD', setup_fee: 0, setup_fee_status: 'none', coach_id: n, client_contact_id: n, replaces_id: n, guarantee_until: n, ended_reason: '', notes: '', created_by: n, created_at: n, updated_at: n };
    case 'ramp_clients': return client({ id: n, created_at: n, updated_at: n });
    case 'ramp_tiers': return { id: n, description: '', required_modules: [], min_days: 0, min_checkin_score: 0, created_at: n, updated_at: n };
    case 'ramp_placement_steps': return { id: n, sort: 0, done_at: n, done_by: n, note: '' };
    case 'ramp_client_modules': return { sort: 0 };
    default: return { id: n, created_at: n };
  }
}

const find = (t, id) => DB[t].find((x) => x.id === id);
export const RPC: Record<string, (a: any) => any> = {
  ramp_public_brand: () => ({ name: 'RAMP', color: '#4338CA' }),
  ramp_session_start: () => ({ state: 'ok', member_id: meId() }),
  ramp_log: () => null,
  ramp_potential_staff: () => [],
  ramp_my_roles: () => ({ work: false, coaching: 0, client: null }),
  ramp_my_client_ids: () => [],
  ramp_directory: () => DB.ramp_members.filter((m) => m.status === 'active' && m.level !== 'client').map((m) => ({ id: m.id, full_name: m.full_name, preferred_name: m.preferred_name, level: m.level, job_title: '', department: '', mentor_id: m.mentor_id })),
  ramp_placement_seed: (a) => {
    const p = find('ramp_placements', a.p_placement);
    const ag = DB.ramp_org[0].agency;
    if (!DB.ramp_placement_steps.some((s) => s.placement_id === p.id)) ag.checklist.forEach((s, i) => DB.ramp_placement_steps.push({ id: newId(), placement_id: p.id, title: s.title, owner: s.owner, sort: i, done_at: null, done_by: null, note: '' }));
    if (p.start_date && !DB.ramp_checkins.some((c) => c.placement_id === p.id)) for (const d of ag.checkin_days) { DB.ramp_checkins.push(ci({ placement_id: p.id, kind: 'va', due_date: addD(p.start_date, d) })); DB.ramp_checkins.push(ci({ placement_id: p.id, kind: 'client', due_date: addD(p.start_date, d) })); }
    if (!p.guarantee_until && p.start_date) p.guarantee_until = addD(p.start_date, ag.replacement_days);
    if (p.setup_fee > 0 && p.setup_fee_status === 'none') p.setup_fee_status = 'unbilled';
    if (!p.coach_id) p.coach_id = find('ramp_members', p.member_id)?.mentor_id || null;
    return ag.checklist.length;
  },
  ramp_rate_change: (a) => {
    const p = find('ramp_placements', a.p_placement);
    if (a.p_bill < a.p_pay) throw new Error('The bill rate is lower than the pay rate. Check the numbers.');
    DB.ramp_rate_changes.push({ id: newId(), placement_id: p.id, effective_date: a.p_effective, old_tier_id: p.tier_id, new_tier_id: a.p_tier, old_bill: p.bill_rate, new_bill: a.p_bill, old_pay: p.pay_rate, new_pay: a.p_pay, reason: a.p_reason, created_by: meId(), created_at: new Date().toISOString() });
    Object.assign(p, { tier_id: a.p_tier, bill_rate: a.p_bill, pay_rate: a.p_pay });
    return null;
  },
  ramp_invite_client: (a) => {
    const email = a.p_email.trim().toLowerCase();
    if (DB.ramp_members.some((m) => m.email === email)) throw new Error(`${email} is already in RAMP.`);
    const id = newId();
    DB.ramp_members.push(member({ id, email, full_name: a.p_name, level: 'client', client_id: a.p_client, status: 'invited', auth_user_id: null, joined_at: null, last_seen_at: null, invited_at: new Date().toISOString() }));
    return id;
  },
  ramp_step_toggle: (a) => { const s = find('ramp_placement_steps', a.p_step); s.done_at = a.p_done ? new Date().toISOString() : null; s.done_by = a.p_done ? meId() : null; return null; },
  ramp_checkin_save: (a) => {
    if (a.p_status === 'done' && !a.p_score) throw new Error('Give the check-in a score from 1 to 5.');
    let c = a.p_id ? find('ramp_checkins', a.p_id) : null;
    if (!c) { c = ci({ placement_id: a.p_placement }); DB.ramp_checkins.push(c); }
    Object.assign(c, { kind: a.p_kind, due_date: a.p_due || c.due_date, status: a.p_status, done_at: a.p_status === 'done' ? (c.done_at || new Date().toISOString()) : null,
      by_member: a.p_status === 'done' ? meId() : null, score: a.p_score, went_well: a.p_went_well, improve: a.p_improve, actions: a.p_actions, share_with_client: a.p_share });
    if (a.p_status === 'done' && !DB.ramp_checkins.some((x) => x.placement_id === a.p_placement && x.kind === a.p_kind && x.status === 'scheduled')) DB.ramp_checkins.push(ci({ placement_id: a.p_placement, kind: a.p_kind, due_date: day(30) }));
    return c.id;
  },
  ramp_timesheet_admin_save: (a) => {
    const p = find('ramp_placements', a.p_placement);
    let t = DB.ramp_timesheets.find((x) => x.placement_id === p.id && x.week_start === a.p_week);
    if (!t) { t = ts({ placement_id: p.id, member_id: p.member_id, week_start: a.p_week }); DB.ramp_timesheets.push(t); }
    Object.assign(t, { days: a.p_days, total: a.p_days.reduce((s, x) => s + x, 0), notes: a.p_notes, status: a.p_approve ? 'approved' : 'submitted', pay_rate: a.p_approve ? p.pay_rate : null, review_note: '' });
    return t.id;
  },
  ramp_timesheet_review: (a) => {
    const t = find('ramp_timesheets', a.p_timesheet);
    if (t.status !== 'submitted') throw new Error('These hours aren’t waiting for review.');
    Object.assign(t, { status: a.p_approve ? 'approved' : 'rejected', review_note: a.p_note || '', pay_rate: a.p_approve ? find('ramp_placements', t.placement_id).pay_rate : null, reviewed_at: new Date().toISOString() });
    return null;
  },
  ramp_launch_list: () => DB.ramp_placements.filter((p) => p.status !== 'ended').map((p) => {
    const lp = DB.ramp_launch_plans.find((x) => x.placement_id === p.id);
    return { placement_id: p.id, title: p.title, status: p.status, start_date: p.start_date, client: '', va: '', role: 'admin', plan_status: lp?.status || null, day1_date: lp?.day1_date || null, updated_at: lp?.updated_at || null };
  }),
};
function addD(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); }

(window as any).__FN = {
  'ramp-stripe': (body) => {
    if (stripeMode === 'err') throw new Error('Edge Function returned a non-2xx status code');
    if (body.action === 'status') return stripeMode === 'on'
      ? { configured: true, mode: 'test', webhook: false, webhook_url: 'https://example.supabase.co/functions/v1/ramp-stripe-webhook' }
      : { configured: false, mode: null, webhook: false, webhook_url: 'https://example.supabase.co/functions/v1/ramp-stripe-webhook' };
    return { ok: true };
  },
};
export const IDS = { M, C, T, P, MOD };
