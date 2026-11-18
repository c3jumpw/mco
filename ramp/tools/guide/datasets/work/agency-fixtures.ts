// @ts-nocheck
// Agency data and RPCs for the work/coaching/client-portal harness. Mirrors 005/006 shapes.
import { DB, RPC, IDS, meId, newId } from './fixtures';

const { M, MOD } = IDS;
const D = 86400000;
const NOW = Date.now();
const day = (o: number) => new Date(NOW + o * D).toLocaleDateString('en-CA');
const ago = (days: number) => new Date(NOW - days * D).toISOString();
const monday = (() => { const d = new Date(NOW); d.setHours(12); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA'); })();
const wk = (k: number) => { const d = new Date(monday + 'T12:00:00'); d.setDate(d.getDate() + k * 7); return d.toLocaleDateString('en-CA'); };

const C1 = 'c1000000-0000-4000-8000-000000000001', C2 = 'c1000000-0000-4000-8000-000000000002';
const T1 = 't1000000-0000-4000-8000-000000000001', T2 = 't1000000-0000-4000-8000-000000000002', T3 = 't1000000-0000-4000-8000-000000000003';
const P1 = 'p1000000-0000-4000-8000-000000000001', P2 = 'p1000000-0000-4000-8000-000000000002', P3 = 'p1000000-0000-4000-8000-000000000003';
const DANA = '10000000-0000-4000-8000-000000000099';

DB.ramp_members.push({ id: DANA, auth_user_id: 'u-dana', email: 'dana.whitfield@example.com', full_name: 'Dana Whitfield', preferred_name: '', phone: '', timezone: 'America/Chicago',
  level: 'client', job_role_id: null, department_id: null, mentor_id: null, status: 'active', source: 'manual', source_ref: null, start_date: null, onboarded_at: ago(30),
  practice_done_at: null, graduated_at: null, last_seen_at: ago(1), access_until: null, client_id: C1, invited_by: M.avery, invited_at: ago(40), joined_at: ago(39), created_at: ago(40), updated_at: ago(1) });
DB.ramp_org[0].flags.agency = true;
DB.ramp_org[0].agency = { pay_when_paid: true, payout_currency: 'USD' };

DB.ramp_clients.push(
  { id: C1, name: 'Brightline Dental', website: 'brightline.example.com', industry: 'Dental', timezone: 'America/Chicago', status: 'active', billing_name: 'Brightline Dental LLC',
    billing_email: 'ap@brightline.example.com', billing_address: '400 Main St\nAustin, TX 78701', billing_cycle: 'weekly', billing_mode: 'arrears', net_days: 7, currency: 'USD' },
  { id: C2, name: 'Northwind Realty Group', website: 'northwind.example.com', industry: 'Real estate', timezone: 'America/Denver', status: 'active', billing_name: '', billing_email: '', billing_address: '', billing_cycle: 'monthly', billing_mode: 'advance', net_days: 14, currency: 'USD' },
);

const tiers = [
  { id: T1, name: 'Core', level: 1, description: 'Finished our core systems training. Handles admin, inbox, calendar, data entry and follow-ups.', bill_rate: 10, pay_rate: 5, required_modules: [MOD.welcome, MOD.tasks], min_days: 0, min_checkin_score: 0 },
  { id: T2, name: 'Skilled', level: 2, description: 'Knows the client’s systems and runs recurring processes with little direction.', bill_rate: 13, pay_rate: 6.5, required_modules: [MOD.security, MOD.comms], min_days: 90, min_checkin_score: 4 },
  { id: T3, name: 'Specialist', level: 3, description: 'Owns a specialty such as bookkeeping, operations or marketing tools.', bill_rate: 17, pay_rate: 8.5, required_modules: [], min_days: 180, min_checkin_score: 4.3 },
];
const placements = [
  { id: P1, client_id: C1, member_id: M.taylor, title: 'Front desk coordinator', tier_id: T1, status: 'active', start_date: day(-40), end_date: null, hours_per_week: 40,
    schedule: 'Mon–Fri, 9 AM – 5 PM Central', bill_rate: 10, pay_rate: 5, currency: 'USD', coach_id: M.sam, guarantee_until: day(20), notes: 'Client prefers Slack over email for quick questions.' },
  { id: P2, client_id: C1, member_id: M.priya, title: 'Billing specialist', tier_id: T1, status: 'onboarding', start_date: day(-5), end_date: null, hours_per_week: 20,
    schedule: 'Mon–Fri mornings', bill_rate: 10, pay_rate: 5, currency: 'USD', coach_id: M.sam, guarantee_until: day(55), notes: '' },
  { id: P3, client_id: C2, member_id: M.elena, title: 'Listings coordinator', tier_id: T2, status: 'active', start_date: day(-120), end_date: null, hours_per_week: 30,
    schedule: 'Mon–Thu', bill_rate: 13, pay_rate: 6.5, currency: 'USD', coach_id: M.sam, guarantee_until: day(-60), notes: '' },
];
const CHECK = [
  ['Contractor agreement signed', 'agency'], ['W-8BEN form collected', 'agency'], ['Payout details added in RAMP', 'va'], ['Kickoff call with the client', 'agency'],
  ['Tool access granted (email, project tool, drives)', 'client'], ['Accounts and configurations set up', 'va'], ['Client SOPs and checklists shared', 'client'],
  ['Working hours and communication channels agreed', 'agency'], ['First-week priorities set', 'client'], ['Timesheet and payout schedule explained', 'agency'],
];
const steps: any[] = [];
for (const [pid, doneN] of [[P1, 10], [P2, 4], [P3, 10]] as const) {
  CHECK.forEach(([title, owner], i) => steps.push({ id: newId(), placement_id: pid, title, owner, sort: i, done_at: i < doneN || (pid === P1 && i !== 6) ? ago(30 - i) : null, done_by: i < doneN ? M.avery : null, note: '' }));
}
steps.filter((s) => s.placement_id === P1 && s.sort === 6).forEach((s) => { s.done_at = null; s.done_by = null; });
steps.filter((s) => s.placement_id === P2 && s.sort === 5).forEach((s) => { s.done_at = ago(1); });

const checkins: any[] = [
  { id: newId(), placement_id: P1, kind: 'va', due_date: day(-33), status: 'done', done_at: ago(33), by_member: M.sam, score: 4, went_well: 'Picked up the scheduling system fast.', improve: 'Confirm appointments a day earlier.', actions: 'Sam to share the reminder template.', share_with_client: true },
  { id: newId(), placement_id: P1, kind: 'client', due_date: day(-10), status: 'done', done_at: ago(10), by_member: M.sam, score: 5, went_well: 'Dana says patients love Taylor on the phone.', improve: '', actions: 'Add insurance verification to Taylor’s list.', share_with_client: true },
  { id: newId(), placement_id: P1, kind: 'va', due_date: day(-3), status: 'scheduled', done_at: null, by_member: null, score: null, went_well: '', improve: '', actions: '', share_with_client: false },
  { id: newId(), placement_id: P1, kind: 'client', due_date: day(20), status: 'scheduled', done_at: null, by_member: null, score: null, went_well: '', improve: '', actions: '', share_with_client: false },
  { id: newId(), placement_id: P2, kind: 'va', due_date: day(2), status: 'scheduled', done_at: null, by_member: null, score: null, went_well: '', improve: '', actions: '', share_with_client: false },
  { id: newId(), placement_id: P2, kind: 'client', due_date: day(25), status: 'scheduled', done_at: null, by_member: null, score: null, went_well: '', improve: '', actions: '', share_with_client: false },
  { id: newId(), placement_id: P3, kind: 'va', due_date: day(-20), status: 'done', done_at: ago(20), by_member: M.sam, score: 4, went_well: 'Listings are always on time.', improve: 'Photo captions.', actions: '', share_with_client: false },
  { id: newId(), placement_id: P3, kind: 'client', due_date: day(-50), status: 'skipped', done_at: null, by_member: null, score: null, went_well: '', improve: '', actions: '', share_with_client: false },
  { id: newId(), placement_id: P3, kind: 'client', due_date: day(10), status: 'scheduled', done_at: null, by_member: null, score: null, went_well: '', improve: '', actions: '', share_with_client: false },
];
const ts = (o: any) => ({ id: newId(), notes: '', submitted_at: null, reviewed_at: null, reviewed_by: null, review_note: '', pay_rate: null, invoice_line_id: null, payout_line_id: null,
  created_at: ago(3), updated_at: ago(2), ...o, total: o.days.reduce((a, b) => a + b, 0) });
const PL1 = newId(), PL2 = newId(), PO1 = newId();
DB.ramp_timesheets.push(
  ts({ placement_id: P1, member_id: M.taylor, week_start: wk(-5), days: [8, 8, 8, 8, 8, 0, 0], status: 'approved', submitted_at: ago(29), reviewed_at: ago(28), pay_rate: 5, payout_line_id: PL1 }),
  ts({ placement_id: P1, member_id: M.taylor, week_start: wk(-4), days: [8, 8, 8, 8, 8, 0, 0], status: 'approved', submitted_at: ago(22), reviewed_at: ago(21), pay_rate: 5, payout_line_id: PL1 }),
  ts({ placement_id: P1, member_id: M.taylor, week_start: wk(-3), days: [8, 8, 8, 8, 6, 0, 0], status: 'rejected', submitted_at: ago(15), reviewed_at: ago(14), review_note: 'Wednesday should be 6 hours. Taylor left early for the dentist.', notes: 'Covered phones Friday afternoon.' }),
  ts({ placement_id: P1, member_id: M.taylor, week_start: wk(-2), days: [8, 8, 7.5, 8, 8, 0, 0], status: 'approved', submitted_at: ago(8), reviewed_at: ago(7), pay_rate: 5 }),
  ts({ placement_id: P1, member_id: M.taylor, week_start: wk(-1), days: [8, 8, 8, 8.25, 7, 1.5, 0], status: 'submitted', submitted_at: ago(1), notes: 'Saturday: caught up on insurance verifications.' }),
  ts({ placement_id: P1, member_id: M.taylor, week_start: wk(0), days: [8, 0, 0, 0, 0, 0, 0], status: 'draft' }),
  ts({ placement_id: P2, member_id: M.priya, week_start: wk(-1), days: [4, 4, 4, 4, 3.5, 0, 0], status: 'submitted', submitted_at: ago(1) }),
  ts({ placement_id: P3, member_id: M.elena, week_start: wk(-1), days: [7.5, 7.5, 7.5, 7.5, 0, 0, 0], status: 'approved', submitted_at: ago(2), reviewed_at: ago(1), pay_rate: 6.5 }),
);
const payoutLines = [
  { id: PL1, payout_id: PO1, member_id: M.taylor, placement_id: P1, kind: 'hours', description: 'Brightline Dental · Front desk coordinator · weeks of Oct 13 to Oct 20', quantity: 80, rate: 5, amount: 400, sort: 0 },
];
const payouts = [{ id: PO1, label: 'Payout Oct 13 to Oct 26, 2026', status: 'sent', currency: 'USD', sent_at: ago(12), period_end: day(-22), discarded_at: null }];
const payees: Record<string, any> = {
  [M.taylor]: { method: 'bank', account_name: 'Taylor Morgan', email: '', wise_recipient_id: '', target_currency: 'PHP', has_bank: true, notes: '', updated_at: ago(35),
    bank: { bank_name: 'BDO Unibank', account_number: '0012 3456 7890', routing_code: 'BNORPHMM' } },
};
const I1 = newId(), I2 = newId(), I3 = newId(), I0 = newId();
DB.ramp_invoices.push(
  { id: I0, client_id: C1, number: 'INV-1000', status: 'void', period_start: day(-40), period_end: day(-34), issue_date: day(-33), due_date: day(-26), currency: 'USD', total: 750, paid_at: null, paid_note: '', stripe_invoice_id: null, stripe_url: null, stripe_pdf: null, sent_at: null, notes: '', created_at: ago(33), updated_at: ago(30) },
  { id: I1, client_id: C1, number: 'INV-1001', status: 'paid', period_start: day(-33), period_end: day(-20), issue_date: day(-19), due_date: day(-12), currency: 'USD', total: 1550, paid_at: ago(14), paid_note: 'Paid through Stripe', stripe_invoice_id: 'in_1', stripe_url: 'https://invoice.stripe.com/i/test_1', stripe_pdf: 'https://pay.stripe.com/invoice/test_1/pdf', sent_at: ago(19), notes: '', created_at: ago(19), updated_at: ago(14) },
  { id: I2, client_id: C1, number: 'INV-1002', status: 'open', period_start: day(-19), period_end: day(-13), issue_date: day(-12), due_date: day(-5), currency: 'USD', total: 400, paid_at: null, paid_note: '', stripe_invoice_id: null, stripe_url: null, stripe_pdf: null, sent_at: null, notes: '', created_at: ago(12), updated_at: ago(12) },
  { id: I3, client_id: C1, number: 'INV-1003', status: 'open', period_start: day(-12), period_end: day(-6), issue_date: day(-4), due_date: day(3), currency: 'USD', total: 395, paid_at: null, paid_note: '', stripe_invoice_id: 'in_3', stripe_url: 'https://invoice.stripe.com/i/test_3', stripe_pdf: 'https://pay.stripe.com/invoice/test_3/pdf', sent_at: ago(4), notes: '', created_at: ago(4), updated_at: ago(4) },
);
DB.ramp_invoice_lines.push(
  { id: newId(), invoice_id: I1, placement_id: P1, kind: 'setup_fee', description: 'Setup: recruiting, training and onboarding · Taylor Morgan', quantity: 1, unit_price: 750, amount: 750, period_start: null, period_end: null, reconciled_at: null, sort: 0 },
  { id: newId(), invoice_id: I1, placement_id: P1, kind: 'hours', description: 'Taylor Morgan · Front desk coordinator · hours, weeks of Oct 13 to Oct 20', quantity: 80, unit_price: 10, amount: 800, period_start: day(-33), period_end: day(-20), reconciled_at: null, sort: 1 },
  { id: newId(), invoice_id: I2, placement_id: P1, kind: 'hours', description: 'Taylor Morgan · Front desk coordinator · hours, week of Oct 27', quantity: 40, unit_price: 10, amount: 400, period_start: day(-19), period_end: day(-13), reconciled_at: null, sort: 0 },
  { id: newId(), invoice_id: I3, placement_id: P1, kind: 'hours', description: 'Taylor Morgan · Front desk coordinator · hours, week of Nov 3', quantity: 39.5, unit_price: 10, amount: 395, period_start: day(-12), period_end: day(-6), reconciled_at: null, sort: 0 },
);
const requests: any[] = [
  { id: newId(), client_id: C1, placement_id: P1, member_id: DANA, kind: 'hours', body: 'Could Taylor go to 45 hours a week from December? We’re adding Saturday clinics.', status: 'in_progress', response: 'Yes, Taylor is happy to. We’ll update the schedule and confirm the start date with you this week.', created_at: ago(6), updated_at: ago(5) },
  { id: newId(), client_id: C1, placement_id: null, member_id: DANA, kind: 'new_va', body: 'We may need someone for billing follow-ups too.', status: 'done', response: 'Priya starts on the 12th. Her launch plan is ready for you.', created_at: ago(25), updated_at: ago(20) },
];
const plans: Record<string, any> = { [P1]: { status: 'ready', day1_date: day(-40), updated_at: ago(41) } };

// ───────── helpers ─────────
const mem = (id) => DB.ramp_members.find((m) => m.id === id);
const name = (id) => { const m = mem(id); return m ? (m.preferred_name || m.full_name || m.email.split('@')[0]) : null; };
const me = () => mem(meId());
const client = (id) => DB.ramp_clients.find((c) => c.id === id);
const tierOf = (id, extra = false) => { const t = tiers.find((x) => x.id === id); return t ? (extra ? { name: t.name, level: t.level, description: t.description } : { id: t.id, name: t.name, level: t.level }) : null; };
const stepsOf = (pid) => steps.filter((s) => s.placement_id === pid).sort((a, b) => a.sort - b.sort);
const isCoach = (p) => me()?.level === 'owner' || me()?.level === 'admin' || p.coach_id === meId() || mem(p.member_id)?.mentor_id === meId();
const training = (mid) => ({ [M.taylor]: { total: 9, done: 7, pct: 78, next: 'Security and data handling' }, [M.priya]: { total: 9, done: 3, pct: 33, next: 'How we use tasks' }, [M.elena]: { total: 6, done: 6, pct: 100, next: null } }[mid] || { total: 0, done: 0, pct: 0, next: null });
const avg = (pid) => { const s = checkins.filter((k) => k.placement_id === pid && k.status === 'done' && k.score != null).sort((a, b) => b.done_at.localeCompare(a.done_at)).slice(0, 3); return s.length ? Math.round(s.reduce((a, k) => a + k.score, 0) / s.length * 100) / 100 : null; };
const nextCk = (pid, kind?) => checkins.filter((k) => k.placement_id === pid && k.status === 'scheduled' && (!kind || k.kind === kind)).sort((a, b) => a.due_date.localeCompare(b.due_date))[0] || null;
const fail = (m) => { throw new Error(m); };

Object.assign(RPC, {
  ramp_my_roles: () => ({ work: placements.some((p) => p.member_id === meId() && p.status !== 'ended'), coaching: placements.filter((p) => p.status !== 'ended' && isCoach(p) && (mem(meId())?.level !== 'client')).length,
    client: me()?.client_id ? { id: me().client_id, name: client(me().client_id).name } : null }),
  ramp_my_client_ids: () => placements.filter((p) => p.member_id === meId()).map((p) => p.client_id),
  ramp_my_work: () => ({
    placements: placements.filter((p) => p.member_id === meId()).map((p) => ({
      id: p.id, title: p.title, status: p.status, start_date: p.start_date, end_date: p.end_date, hours_per_week: p.hours_per_week, schedule: p.schedule, pay_rate: p.pay_rate, currency: p.currency,
      client: { name: client(p.client_id).name, timezone: client(p.client_id).timezone, website: client(p.client_id).website },
      coach: { id: p.coach_id, name: name(p.coach_id) }, tier: tierOf(p.tier_id), steps: stepsOf(p.id).map(({ id, title, owner, done_at }) => ({ id, title, owner, done_at })),
      next_checkin: nextCk(p.id, 'va')?.due_date || null, checkin_avg: avg(p.id), days_active: p.start_date ? Math.max(0, Math.round((NOW - new Date(p.start_date + 'T12:00:00').getTime()) / D)) : null,
    })),
    tiers: tiers.map((t) => ({ id: t.id, name: t.name, level: t.level, description: t.description, pay_rate: t.pay_rate, required_modules: t.required_modules, min_days: t.min_days,
      min_checkin_score: t.min_checkin_score, module_titles: DB.ramp_modules.filter((m) => t.required_modules.includes(m.id)).sort((a, b) => a.sort - b.sort).map((m) => m.title) })),
    completed_modules: DB.ramp_progress.filter((x) => x.member_id === meId() && x.status === 'completed').map((x) => x.module_id),
    payouts: payoutLines.filter((l) => l.member_id === meId()).map((l) => { const po = payouts.find((x) => x.id === l.payout_id); return { id: l.id, payout_id: po.id, label: po.label, status: po.status, sent_at: po.sent_at, description: l.description, quantity: l.quantity, rate: l.rate, amount: l.amount, currency: po.currency }; }),
    payee: RPC.ramp_payee_get({ p_member: null }),
  }),
  ramp_payee_get: (a) => { const p = payees[a.p_member || meId()]; if (!p) return null; const { bank, ...rest } = p; return { ...rest, has_bank: !!bank }; },
  ramp_payee_reveal: (a) => payees[a.p_member || meId()]?.bank || null,
  ramp_payee_save: (a) => {
    if (a.p_method === 'wise_email' && !(a.p_email || '').includes('@')) fail('Enter the email for your Wise account.');
    const id = a.p_member || meId(); const old = payees[id] || {};
    payees[id] = { method: a.p_method, account_name: a.p_account_name, email: a.p_email, wise_recipient_id: a.p_wise_recipient_id, target_currency: a.p_target_currency || 'PHP', notes: a.p_notes,
      updated_at: new Date().toISOString(), bank: a.p_bank === null ? old.bank : Object.keys(a.p_bank).length ? a.p_bank : undefined };
    return null;
  },
  ramp_timesheet_save: (a) => {
    const p = placements.find((x) => x.id === a.p_placement && x.member_id === meId()) || fail('That placement isn’t yours.');
    if (a.p_week > monday) fail('You can’t log hours for a future week.');
    const total = a.p_days.reduce((x, y) => x + y, 0);
    if (a.p_submit && total === 0) fail('Add your hours before sending them.');
    let t = DB.ramp_timesheets.find((x) => x.placement_id === p.id && x.week_start === a.p_week);
    if (t && (t.status === 'submitted' || t.status === 'approved')) fail('This week has already been sent. Ask your coach if something needs to change.');
    if (!t) { t = ts({ placement_id: p.id, member_id: meId(), week_start: a.p_week, days: a.p_days, status: 'draft' }); DB.ramp_timesheets.push(t); }
    Object.assign(t, { days: a.p_days, total, notes: a.p_notes, status: a.p_submit ? 'submitted' : 'draft', submitted_at: a.p_submit ? new Date().toISOString() : null, updated_at: new Date().toISOString(), review_note: a.p_submit ? '' : t.review_note });
    return t.id;
  },
  ramp_step_toggle: (a) => { const s = steps.find((x) => x.id === a.p_step) || fail('Step not found.'); s.done_at = a.p_done ? new Date().toISOString() : null; s.done_by = a.p_done ? meId() : null; return null; },
  ramp_launch_list: () => placements.filter((p) => p.status !== 'ended' && (p.member_id === meId() || isCoach(p) || p.client_id === me()?.client_id)).map((p) => ({
    placement_id: p.id, title: p.title, status: p.status, start_date: p.start_date, client: client(p.client_id).name, va: name(p.member_id),
    role: p.member_id === meId() ? 'va' : p.client_id === me()?.client_id ? 'client' : 'coach', plan_status: plans[p.id]?.status || null, day1_date: plans[p.id]?.day1_date || null, updated_at: plans[p.id]?.updated_at || null })),
  ramp_coach_placements: () => placements.filter((p) => p.status !== 'ended' && isCoach(p)).map((p) => ({
    id: p.id, title: p.title, status: p.status, start_date: p.start_date, hours_per_week: p.hours_per_week, schedule: p.schedule, guarantee_until: p.guarantee_until,
    client: { id: p.client_id, name: client(p.client_id).name, timezone: client(p.client_id).timezone }, va: { id: p.member_id, name: name(p.member_id), email: mem(p.member_id).email },
    tier: tierOf(p.tier_id), steps_total: stepsOf(p.id).length, steps_done: stepsOf(p.id).filter((s) => s.done_at).length,
    next_checkin: (() => { const k = nextCk(p.id); return k ? { id: k.id, kind: k.kind, due_date: k.due_date } : null; })(),
    last_score: checkins.filter((k) => k.placement_id === p.id && k.status === 'done').sort((a, b) => b.done_at.localeCompare(a.done_at))[0]?.score ?? null, training: training(p.member_id) })),
  ramp_coach_placement: (a) => {
    const p = placements.find((x) => x.id === a.p_placement); if (!p || !isCoach(p)) fail('You don’t coach this placement.');
    const c = client(p.client_id); const m = mem(p.member_id);
    return { id: p.id, title: p.title, status: p.status, start_date: p.start_date, end_date: p.end_date, hours_per_week: p.hours_per_week, schedule: p.schedule, notes: p.notes, guarantee_until: p.guarantee_until,
      client: { id: c.id, name: c.name, timezone: c.timezone, website: c.website }, va: { id: m.id, name: name(m.id), email: m.email, timezone: m.timezone },
      coach: { id: p.coach_id, name: name(p.coach_id) }, tier: tierOf(p.tier_id), training: training(m.id),
      steps: stepsOf(p.id).map((s) => ({ id: s.id, title: s.title, owner: s.owner, done_at: s.done_at, done_by: name(s.done_by), note: s.note })),
      checkins: checkins.filter((k) => k.placement_id === p.id).map((k) => ({ ...k, created_at: ago(40), updated_at: ago(1), by_name: name(k.by_member) }))
        .sort((x, y) => (y.done_at?.slice(0, 10) || y.due_date).localeCompare(x.done_at?.slice(0, 10) || x.due_date)),
      timesheets: DB.ramp_timesheets.filter((t) => t.placement_id === p.id).sort((x, y) => y.week_start.localeCompare(x.week_start)).slice(0, 12)
        .map((t) => ({ id: t.id, week_start: t.week_start, total: t.total, status: t.status, days: t.days, notes: t.notes, review_note: t.review_note })) };
  },
  ramp_checkin_save: (a) => {
    if (a.p_status === 'done' && !a.p_score) fail('Give the check-in a score from 1 to 5.');
    let k = a.p_id ? checkins.find((x) => x.id === a.p_id) : null;
    if (!k) { k = { id: newId(), placement_id: a.p_placement, done_at: null, by_member: null }; checkins.push(k); }
    Object.assign(k, { kind: a.p_kind, due_date: a.p_due || day(0), status: a.p_status, score: a.p_score, went_well: a.p_went_well, improve: a.p_improve, actions: a.p_actions, share_with_client: a.p_share,
      done_at: a.p_status === 'done' ? k.done_at || new Date().toISOString() : null, by_member: a.p_status === 'done' ? k.by_member || meId() : null });
    if (a.p_status === 'done' && !nextCk(a.p_placement, a.p_kind)) checkins.push({ id: newId(), placement_id: a.p_placement, kind: a.p_kind, due_date: day(30), status: 'scheduled', done_at: null, by_member: null, score: null, went_well: '', improve: '', actions: '', share_with_client: false });
    return k.id;
  },
  ramp_client_portal: () => {
    const cid = me()?.client_id || fail('This page is for client contacts.');
    const c = client(cid);
    return {
      client: { id: c.id, name: c.name, timezone: c.timezone, billing_cycle: c.billing_cycle, billing_mode: c.billing_mode, net_days: c.net_days, billing_email: c.billing_email },
      placements: placements.filter((p) => p.client_id === cid && p.status !== 'proposed').map((p) => ({
        id: p.id, title: p.title, status: p.status, start_date: p.start_date, end_date: p.end_date, hours_per_week: p.hours_per_week, schedule: p.schedule, bill_rate: p.bill_rate, currency: p.currency,
        guarantee_until: p.guarantee_until, tier: tierOf(p.tier_id, true), va: { id: p.member_id, name: name(p.member_id), email: mem(p.member_id).email, timezone: mem(p.member_id).timezone },
        coach: { name: name(p.coach_id) }, steps: stepsOf(p.id).map(({ id, title, owner, done_at }) => ({ id, title, owner, done_at })), training: training(p.member_id),
        checkins: checkins.filter((k) => k.placement_id === p.id && k.status === 'done' && (k.kind === 'client' || k.share_with_client)).sort((x, y) => y.done_at.localeCompare(x.done_at)).slice(0, 5)
          .map((k) => ({ id: k.id, kind: k.kind, done_at: k.done_at, score: k.score, went_well: k.went_well, improve: k.improve, actions: k.actions, by_name: name(k.by_member) })),
        next_checkin: nextCk(p.id, 'client')?.due_date || null,
        hours_this_week: DB.ramp_timesheets.find((t) => t.placement_id === p.id && t.week_start === monday)?.total || 0,
        hours_last_week: DB.ramp_timesheets.find((t) => t.placement_id === p.id && t.week_start === wk(-1))?.total || 0,
      })),
      timesheets: DB.ramp_timesheets.filter((t) => placements.find((p) => p.id === t.placement_id)?.client_id === cid && t.status !== 'draft').map((t) => ({
        id: t.id, placement_id: t.placement_id, va_name: name(t.member_id), title: placements.find((p) => p.id === t.placement_id).title, week_start: t.week_start, days: t.days, total: t.total,
        notes: t.notes, status: t.status, submitted_at: t.submitted_at, reviewed_at: t.reviewed_at, review_note: t.review_note }))
        .sort((x, y) => Number(y.status === 'submitted') - Number(x.status === 'submitted') || y.week_start.localeCompare(x.week_start)),
      requests: requests.filter((r) => r.client_id === cid).sort((x, y) => y.created_at.localeCompare(x.created_at)),
    };
  },
  ramp_timesheet_review: (a) => {
    const t = DB.ramp_timesheets.find((x) => x.id === a.p_timesheet) || fail('Timesheet not found.');
    if (t.status !== 'submitted') fail('These hours aren’t waiting for review.');
    if (!a.p_approve && !(a.p_note || '').trim()) fail('Add a note so the team member knows what to fix.');
    Object.assign(t, { status: a.p_approve ? 'approved' : 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: meId(), review_note: a.p_note || '', updated_at: new Date().toISOString() });
    return null;
  },
  ramp_client_feedback: (a) => { checkins.push({ id: newId(), placement_id: a.p_placement, kind: 'client', due_date: day(0), status: 'done', done_at: new Date().toISOString(), by_member: meId(), score: a.p_score, went_well: a.p_went_well, improve: a.p_improve, actions: '', share_with_client: true }); return newId(); },
  ramp_client_request: (a) => { requests.unshift({ id: newId(), client_id: me().client_id, placement_id: a.p_placement, member_id: meId(), kind: a.p_kind, body: a.p_body, status: 'open', response: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); return null; },
});
