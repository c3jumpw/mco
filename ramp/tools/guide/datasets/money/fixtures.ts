// @ts-nocheck
// Fictional agency data for the money pages. "Today" is Tue Nov 17, 2026 (the harness fixes the clock).
export const LOG: any[] = [];
(window as any).__LOG = LOG;
let seq = 900;
const id = (b: string, n: number) => `${b}-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const newId = () => id('0f000000', ++seq);
export const meId = () => M.dana;
export const STORAGE: any[] = [];
const TODAY = '2026-11-17';
const ts = (d: string, hm = '10:00') => new Date(`${d}T${hm}:00-05:00`).toISOString();
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const params = new URLSearchParams(location.search);

const M = { dana: id('10', 1), maria: id('10', 2), jose: id('10', 3), ana: id('10', 4), paolo: id('10', 5), liza: id('10', 6), carl: id('10', 7) };
const C = { acme: id('20', 1), bright: id('20', 2), north: id('20', 3) };
const P = { p1: id('30', 1), p2: id('30', 2), p3: id('30', 3), p4: id('30', 4), p5: id('30', 5) };
const I = { i2: id('40', 2), i3: id('40', 3), i4: id('40', 4), i5: id('40', 5), i6: id('40', 6), i7: id('40', 7) };
const L = { l1: id('41', 1), l2: id('41', 2), l3: id('41', 3), l4: id('41', 4), l5: id('41', 5), l6: id('41', 6), l7: id('41', 7), l8: id('41', 8) };
const PO = { sent: id('50', 1), draft: id('50', 2), gone: id('50', 3) };
const PL = { a: id('51', 1), b: id('51', 2), c: id('51', 3), d: id('51', 4), e: id('51', 5) };
export const IDS = { M, C, P, I, L, PO, PL };

const member = (mid, full, email, level = 'employee', extra = {}) => ({ id: mid, auth_user_id: null, email, full_name: full, preferred_name: '', phone: '', timezone: 'Asia/Manila',
  level, job_role_id: null, department_id: null, mentor_id: null, status: 'active', source: 'manual', source_ref: null, start_date: null, onboarded_at: ts('2026-05-01'),
  practice_done_at: null, graduated_at: null, last_seen_at: null, access_until: null, client_id: null, invited_by: null, invited_at: ts('2026-05-01'), joined_at: null,
  created_at: ts('2026-05-01'), updated_at: ts('2026-05-01'), ...extra });

const client = (cid, name, extra) => ({ id: cid, name, website: '', industry: '', timezone: 'America/New_York', status: 'active', billing_name: '', billing_email: '',
  billing_address: '', billing_cycle: 'weekly', billing_mode: 'arrears', net_days: 7, currency: 'USD', stripe_customer_id: null, notes: '', created_by: M.dana,
  created_at: ts('2026-05-01'), updated_at: ts('2026-05-01'), ...extra });

const placement = (pid, cid, mid, extra) => ({ id: pid, client_id: cid, member_id: mid, title: 'Operations coordinator', tier_id: null, status: 'active', start_date: '2026-08-03', end_date: null,
  hours_per_week: 40, schedule: '', bill_rate: 12, pay_rate: 6, currency: 'USD', setup_fee: 0, setup_fee_status: 'none', coach_id: null, client_contact_id: null,
  replaces_id: null, guarantee_until: null, ended_reason: '', notes: '', created_by: M.dana, created_at: ts('2026-08-01'), updated_at: ts('2026-08-01'), ...extra });

const sheet = (tid, pid, mid, week, days, extra = {}) => ({ id: tid, placement_id: pid, member_id: mid, week_start: week, days, total: days.reduce((a, b) => a + b, 0), notes: '',
  status: 'approved', submitted_at: ts(addDays(week, 7), '09:00'), reviewed_at: ts(addDays(week, 8), '11:00'), reviewed_by: M.carl, review_note: '', pay_rate: null,
  invoice_line_id: null, payout_line_id: null, created_at: ts(addDays(week, 6)), updated_at: ts(addDays(week, 8)), ...extra });
const full = [8, 8, 8, 8, 8, 0, 0];
const half = [4, 4, 4, 4, 4, 0, 0];

const invoice = (iid, cid, number, extra) => ({ id: iid, client_id: cid, number, status: 'draft', period_start: '2026-11-02', period_end: '2026-11-08', issue_date: null, due_date: null,
  currency: 'USD', total: 0, paid_at: null, paid_note: '', stripe_invoice_id: null, stripe_url: null, stripe_pdf: null, sent_at: null, notes: '', created_by: M.dana,
  created_at: ts('2026-11-09'), updated_at: ts('2026-11-09'), ...extra });
const iline = (lid, iid, pid, kind, description, quantity, unit_price, extra = {}) => ({ id: lid, invoice_id: iid, placement_id: pid, kind, description, quantity, unit_price, amount: 0,
  period_start: null, period_end: null, reconciled_at: null, sort: 0, ...extra });

export const DB: Record<string, any[]> = {
  ramp_org: [{ id: true, name: 'Northwind Services', brand_color: '#4338CA', timezone: 'America/New_York', welcome_from: '', welcome_headline: '', welcome_message: '', welcome_video_url: '',
    flow: [], flow_reviewed: true, flags: { chat: true, tasks: true, certificates: false, record_ip: true, agency: true },
    agency: { checklist: [], checkin_days: [7, 30], checkin_every_days: 30, replacement_days: 60, invoice_prefix: 'INV', next_invoice_number: 1008, pay_when_paid: true,
      default_setup_fee: 750, payout_currency: 'USD', launch_agenda: [] }, updated_at: ts('2026-11-01') }],
  ramp_members: [
    member(M.dana, 'Dana Whitfield', 'dana@mkc.example.com', 'owner', { timezone: 'America/New_York' }),
    member(M.maria, 'Maria Santos', 'maria.santos@example.com'),
    member(M.jose, 'Jose Reyes', 'jose.reyes@example.com'),
    member(M.ana, 'Ana Cruz', 'ana.cruz@example.com'),
    member(M.paolo, 'Paolo Garcia', 'paolo.garcia@example.com'),
    member(M.liza, 'Liza Mendoza', 'liza.mendoza@example.com', 'trainee'),
    member(M.carl, 'Carl Jensen', 'carl@acme.example.com', 'client', { client_id: C.acme }),
  ],
  ramp_clients: [
    client(C.acme, 'Acme Co', { billing_name: 'Acme Co Accounts Payable', billing_email: 'billing@acme.example.com', billing_address: '400 Market St, Suite 12\nPhiladelphia, PA 19106' }),
    client(C.bright, 'Brightside Dental', { billing_cycle: 'biweekly', billing_mode: 'advance', net_days: 14, billing_email: 'office@brightside.example.com' }),
    client(C.north, 'Northwind Logistics', { billing_cycle: 'monthly', net_days: 30 }),
  ],
  ramp_placements: [
    placement(P.p1, C.acme, M.maria, { title: 'Executive coordinator', bill_rate: 12, pay_rate: 6 }),
    placement(P.p2, C.acme, M.jose, { title: 'Customer support', hours_per_week: 20, bill_rate: 10, pay_rate: 5, start_date: '2026-09-07', setup_fee: 750, setup_fee_status: 'invoiced' }),
    placement(P.p3, C.bright, M.ana, { title: 'Front desk coordinator', bill_rate: 13, pay_rate: 6.5, start_date: '2026-10-05' }),
    placement(P.p4, C.north, M.paolo, { title: 'Dispatch coordinator', hours_per_week: 30, bill_rate: 10, pay_rate: 5, start_date: '2026-06-01' }),
    placement(P.p5, C.north, M.liza, { title: 'Data entry', status: 'onboarding', start_date: '2026-11-16', setup_fee: 500, setup_fee_status: 'unbilled' }),
  ],
  ramp_timesheets: [
    // Maria @ Acme
    sheet(id('60', 1), P.p1, M.maria, '2026-10-12', full, { invoice_line_id: L.l1, pay_rate: 6 }),
    sheet(id('60', 2), P.p1, M.maria, '2026-10-19', full, { invoice_line_id: L.l1, payout_line_id: PL.a, pay_rate: 6 }),
    sheet(id('60', 3), P.p1, M.maria, '2026-10-26', full, { invoice_line_id: L.l1, payout_line_id: PL.a, pay_rate: 6 }),
    sheet(id('60', 4), P.p1, M.maria, '2026-11-02', full, { invoice_line_id: L.l3, pay_rate: 6 }),
    sheet(id('60', 5), P.p1, M.maria, '2026-11-09', [8, 8.5, 8, 7.5, 8, 0, 0], { status: 'submitted', reviewed_at: null, reviewed_by: null, notes: 'Stayed late Tuesday for the board pack.' }),
    sheet(id('60', 6), P.p1, M.maria, '2026-11-16', [8, 8, 0, 0, 0, 0, 0], { status: 'draft', submitted_at: null, reviewed_at: null, reviewed_by: null }),
    // Jose @ Acme
    sheet(id('60', 7), P.p2, M.jose, '2026-10-26', half, { invoice_line_id: L.l2, pay_rate: 5 }),
    sheet(id('60', 8), P.p2, M.jose, '2026-11-02', [4, 4, 4, 4, 4, 2, 0], { pay_rate: 5 }),
    sheet(id('60', 9), P.p2, M.jose, '2026-11-09', [5, 5, 4, 4.5, 4, 3, 0], { status: 'submitted', reviewed_at: null, reviewed_by: null, notes: 'Saturday: covered the weekend queue.' }),
    // Ana @ Brightside (advance)
    sheet(id('60', 10), P.p3, M.ana, '2026-10-26', full, { status: 'rejected', review_note: 'Wednesday should be 6 h, the office closed early.' }),
    sheet(id('60', 11), P.p3, M.ana, '2026-11-02', full, { payout_line_id: PL.c, pay_rate: 6.5 }),
    // Paolo @ Northwind
    sheet(id('60', 12), P.p4, M.paolo, '2026-10-19', [6, 6, 6, 6, 6, 0, 0], { invoice_line_id: L.l6, pay_rate: 5 }),
    sheet(id('60', 13), P.p4, M.paolo, '2026-10-26', [6, 6, 6, 6, 6, 0, 0], { invoice_line_id: L.l6, payout_line_id: PL.b, pay_rate: 5 }),
    sheet(id('60', 14), P.p4, M.paolo, '2026-11-02', [6, 6, 6, 6, 6, 0, 0], { status: 'submitted', reviewed_at: null, reviewed_by: null }),
    sheet(id('60', 15), P.p4, M.paolo, '2026-11-09', [6, 6, 0, 0, 0, 0, 0], { status: 'draft', submitted_at: null, reviewed_at: null, reviewed_by: null }),
  ],
  ramp_invoices: [
    invoice(I.i2, C.north, 'INV-1002', { status: 'void', period_start: '2026-09-01', period_end: '2026-09-30', issue_date: '2026-10-01', due_date: '2026-10-31', notes: 'Voided: wrong month' }),
    invoice(I.i3, C.north, 'INV-1003', { status: 'paid', period_start: '2026-10-01', period_end: '2026-10-31', issue_date: '2026-11-02', due_date: '2026-12-02', paid_at: ts('2026-11-06', '14:20'), paid_note: 'Wise transfer #44120' }),
    invoice(I.i4, C.acme, 'INV-1004', { status: 'paid', period_start: '2026-10-12', period_end: '2026-11-01', issue_date: '2026-11-02', due_date: '2026-11-09', paid_at: ts('2026-11-05', '09:12'), paid_note: 'Paid through Stripe',
      stripe_invoice_id: 'in_1', stripe_url: 'https://invoice.stripe.com/i/acct_x/test_1', sent_at: ts('2026-11-02') }),
    invoice(I.i5, C.acme, 'INV-1005', { status: 'open', period_start: '2026-10-26', period_end: '2026-11-01', issue_date: '2026-11-05', due_date: '2026-11-12',
      stripe_invoice_id: 'in_2', stripe_url: 'https://invoice.stripe.com/i/acct_x/test_2', stripe_pdf: 'https://pay.stripe.com/invoice/acct_x/test_2/pdf', sent_at: ts('2026-11-05', '08:30') }),
    invoice(I.i6, C.bright, 'INV-1006', { status: 'paid', period_start: '2026-11-02', period_end: '2026-11-15', issue_date: '2026-11-02', due_date: '2026-11-16', paid_at: ts('2026-11-04') }),
    invoice(I.i7, C.acme, 'INV-1007', { status: 'draft', period_start: '2026-11-02', period_end: '2026-11-08', created_at: ts('2026-11-16') }),
  ],
  ramp_invoice_lines: [
    iline(L.l1, I.i4, P.p1, 'hours', 'Maria Santos · Executive coordinator · hours, weeks of Oct 12 to Oct 26', 120, 12, { period_start: '2026-10-12', period_end: '2026-11-01' }),
    iline(L.l2, I.i5, P.p2, 'hours', 'Jose Reyes · Customer support · hours, weeks of Oct 26', 20, 10, { period_start: '2026-10-26', period_end: '2026-11-01' }),
    iline(L.l3, I.i7, P.p1, 'hours', 'Maria Santos · Executive coordinator · hours, weeks of Nov 02', 40, 12, { period_start: '2026-11-02', period_end: '2026-11-08' }),
    iline(L.l4, I.i7, P.p2, 'setup_fee', 'Setup: recruiting, training and onboarding · Jose Reyes', 1, 750, { sort: 1 }),
    iline(L.l5, I.i7, null, 'adjustment', 'Credit: office closed Nov 3 (Election Day)', -1, 48, { sort: 2 }),
    iline(L.l6, I.i3, P.p4, 'hours', 'Paolo Garcia · Dispatch coordinator · hours, weeks of Oct 19 to Oct 26', 60, 10),
    iline(L.l7, I.i6, P.p3, 'prepay', 'Ana Cruz · Front desk coordinator · prepaid 40 h/week, Nov 02 to Nov 15', 80, 13, { period_start: '2026-11-02', period_end: '2026-11-15' }),
    iline(L.l8, I.i2, P.p4, 'hours', 'Paolo Garcia · hours, September', 120, 10),
  ],
  ramp_payouts: [
    { id: PO.sent, label: 'Payout Oct 19 to Nov 01, 2026', period_start: '2026-10-19', period_end: '2026-11-01', status: 'sent', currency: 'USD', total: 0, exported_at: ts('2026-11-06'),
      sent_at: ts('2026-11-07', '16:05'), reference: 'Wise batch 88123', notes: '', discarded_at: null, created_by: M.dana, created_at: ts('2026-11-06'), updated_at: ts('2026-11-07') },
    { id: PO.draft, label: 'Payout Oct 26 to Nov 08, 2026', period_start: '2026-10-26', period_end: '2026-11-08', status: 'draft', currency: 'USD', total: 0, exported_at: null,
      sent_at: null, reference: '', notes: '', discarded_at: null, created_by: M.dana, created_at: ts('2026-11-16'), updated_at: ts('2026-11-16') },
    { id: PO.gone, label: 'Payout Oct 05 to Oct 18, 2026', period_start: '2026-10-05', period_end: '2026-10-18', status: 'draft', currency: 'USD', total: 0, exported_at: null,
      sent_at: null, reference: '', notes: '', discarded_at: ts('2026-10-20'), created_by: M.dana, created_at: ts('2026-10-19'), updated_at: ts('2026-10-20') },
  ],
  ramp_payout_lines: [
    { id: PL.a, payout_id: PO.sent, member_id: M.maria, placement_id: P.p1, kind: 'hours', description: 'Acme Co · Executive coordinator · weeks of Oct 19 to Oct 26', quantity: 80, rate: 6, amount: 0, sort: 0 },
    { id: PL.b, payout_id: PO.draft, member_id: M.paolo, placement_id: P.p4, kind: 'hours', description: 'Northwind Logistics · Dispatch coordinator · weeks of Oct 26', quantity: 30, rate: 5, amount: 0, sort: 0 },
    { id: PL.c, payout_id: PO.draft, member_id: M.ana, placement_id: P.p3, kind: 'hours', description: 'Brightside Dental · Front desk coordinator · weeks of Nov 02', quantity: 40, rate: 6.5, amount: 0, sort: 1 },
    { id: PL.d, payout_id: PO.draft, member_id: M.ana, placement_id: null, kind: 'bonus', description: 'Five-star patient review bonus', quantity: 1, rate: 25, amount: 0, sort: 2 },
    { id: PL.e, payout_id: PO.draft, member_id: M.jose, placement_id: null, kind: 'adjustment', description: 'Missed hours from Oct 19', quantity: 1, rate: 15, amount: 0, sort: 3 },
  ],
  ramp_payees: [
    { member_id: M.maria, method: 'wise_email', account_name: 'Maria L. Santos', email: 'maria.santos@example.com', wise_recipient_id: '', target_currency: 'PHP', has_bank: false, notes: '', updated_at: ts('2026-09-01') },
    { member_id: M.paolo, method: 'wise_recipient', account_name: 'Paolo Garcia', email: '', wise_recipient_id: '148822913', target_currency: 'PHP', has_bank: false, notes: '', updated_at: ts('2026-09-01') },
    { member_id: M.ana, method: 'bank', account_name: 'Ana Marie Cruz', email: '', wise_recipient_id: '', target_currency: 'PHP', has_bank: true, notes: '', updated_at: ts('2026-10-01'),
      _bank: { bank_name: 'BDO Unibank', account_number: '0012 3456 7890', routing_code: 'BNORPHMM', branch_note: 'Makati Ayala' } },
  ],
  ramp_announcements: [], ramp_acks: [], ramp_progress: [], ramp_client_requests: [],
};

export function afterWrite(t?: string) {
  for (const l of DB.ramp_invoice_lines) l.amount = Math.round(Number(l.quantity) * Number(l.unit_price) * 100) / 100;
  for (const l of DB.ramp_payout_lines) l.amount = Math.round(Number(l.quantity) * Number(l.rate) * 100) / 100;
  for (const i of DB.ramp_invoices) i.total = DB.ramp_invoice_lines.filter((l) => l.invoice_id === i.id).reduce((a, l) => a + l.amount, 0);
  for (const p of DB.ramp_payouts) p.total = DB.ramp_payout_lines.filter((l) => l.payout_id === p.id).reduce((a, l) => a + l.amount, 0);
  const il = new Set(DB.ramp_invoice_lines.map((l) => l.id)), pl = new Set(DB.ramp_payout_lines.map((l) => l.id));
  for (const s of DB.ramp_timesheets) {
    s.total = s.days.reduce((a, b) => a + Number(b), 0);
    if (s.invoice_line_id && !il.has(s.invoice_line_id)) s.invoice_line_id = null;
    if (s.payout_line_id && !pl.has(s.payout_line_id)) s.payout_line_id = null;
  }
}
afterWrite();

export function canRead() { return true; }
export function defaultsFor(t: string) {
  if (t === 'ramp_invoice_lines') return { kind: 'other', description: '', quantity: 1, unit_price: 0, amount: 0, placement_id: null, period_start: null, period_end: null, reconciled_at: null, sort: 0 };
  if (t === 'ramp_payout_lines') return { kind: 'hours', description: '', quantity: 1, rate: 0, amount: 0, placement_id: null, sort: 0 };
  return {};
}

const name = (m) => { const x = DB.ramp_members.find((y) => y.id === m); return x?.preferred_name || x?.full_name || ''; };
const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
const invPaid = (iid) => DB.ramp_invoices.find((i) => i.id === iid)?.status === 'paid';
const isPaidSheet = (s) => {
  const l = DB.ramp_invoice_lines.find((x) => x.id === s.invoice_line_id);
  if (l && invPaid(l.invoice_id)) return true;
  return DB.ramp_invoice_lines.some((x) => x.kind === 'prepay' && x.placement_id === s.placement_id && invPaid(x.invoice_id) && x.period_start <= s.week_start && s.week_start <= x.period_end);
};

export const RPC: Record<string, (a: any) => any> = {
  ramp_my_roles: () => ({ work: false, coaching: 0, client: null }),
  ramp_directory: () => [],
  ramp_timesheet_review: ({ p_timesheet, p_approve, p_note }) => {
    const s = DB.ramp_timesheets.find((x) => x.id === p_timesheet);
    if (!s) throw new Error('Timesheet not found.');
    if (s.status !== 'submitted') throw new Error('These hours aren’t waiting for review.');
    if (!p_approve && !String(p_note || '').trim()) throw new Error('Add a note so the team member knows what to fix.');
    Object.assign(s, { status: p_approve ? 'approved' : 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: M.dana, review_note: p_note || '' });
  },
  ramp_timesheet_admin_save: ({ p_placement, p_week, p_days, p_notes, p_approve }) => {
    const p = DB.ramp_placements.find((x) => x.id === p_placement);
    let s = DB.ramp_timesheets.find((x) => x.placement_id === p_placement && x.week_start === p_week);
    if (s && (s.invoice_line_id || s.payout_line_id)) throw new Error('This week is already on an invoice or payout. Void that first.');
    if (!s) { s = sheet(newId(), p_placement, p.member_id, p_week, p_days); DB.ramp_timesheets.push(s); }
    Object.assign(s, { days: p_days, notes: p_notes, status: p_approve ? 'approved' : 'submitted', review_note: '' });
    afterWrite();
    return s.id;
  },
  ramp_invoice_generate: ({ p_client, p_start, p_end }) => {
    const c = DB.ramp_clients.find((x) => x.id === p_client);
    const pls = DB.ramp_placements.filter((x) => x.client_id === p_client);
    const sheets = DB.ramp_timesheets.filter((s) => pls.some((p) => p.id === s.placement_id) && s.status === 'approved' && !s.invoice_line_id && s.week_start <= p_end && s.total > 0);
    const fees = pls.filter((p) => p.setup_fee > 0 && p.setup_fee_status === 'unbilled');
    if (!sheets.length && !fees.length) throw new Error(`Nothing to bill for ${c.name} in this period yet.`);
    const org = DB.ramp_org[0];
    const iid = newId();
    DB.ramp_invoices.push(invoice(iid, p_client, `INV-${org.agency.next_invoice_number++}`, { period_start: p_start, period_end: p_end, created_at: new Date().toISOString() }));
    let sort = 0;
    for (const p of pls) {
      const mine = sheets.filter((s) => s.placement_id === p.id);
      if (!mine.length) continue;
      const lid = newId();
      DB.ramp_invoice_lines.push(iline(lid, iid, p.id, 'hours', `${name(p.member_id)} · ${p.title} · hours, weeks of ${fmt(mine[0].week_start)}`, mine.reduce((a, s) => a + s.total, 0), p.bill_rate, { sort: sort++ }));
      mine.forEach((s) => { s.invoice_line_id = lid; });
    }
    for (const p of fees) { DB.ramp_invoice_lines.push(iline(newId(), iid, p.id, 'setup_fee', `Setup: recruiting, training and onboarding · ${name(p.member_id)}`, 1, p.setup_fee, { sort: sort++ })); p.setup_fee_status = 'invoiced'; }
    afterWrite();
    return iid;
  },
  ramp_invoice_set_status: ({ p_invoice, p_status, p_note }) => {
    const i = DB.ramp_invoices.find((x) => x.id === p_invoice);
    const c = DB.ramp_clients.find((x) => x.id === i.client_id);
    if (p_status === 'open') { if (i.total <= 0) throw new Error('This invoice has nothing to charge.'); Object.assign(i, { status: 'open', issue_date: TODAY, due_date: addDays(TODAY, c.net_days) }); }
    else if (p_status === 'paid') Object.assign(i, { status: 'paid', paid_at: new Date().toISOString(), paid_note: p_note || '' });
    else if (p_status === 'void') {
      if (i.status === 'paid') throw new Error('A paid invoice can’t be voided. Add a credit to the next invoice instead.');
      const ids = DB.ramp_invoice_lines.filter((l) => l.invoice_id === i.id).map((l) => l.id);
      DB.ramp_timesheets.forEach((s) => { if (ids.includes(s.invoice_line_id)) s.invoice_line_id = null; });
      Object.assign(i, { status: 'void', notes: `${i.notes} ${p_note || ''}`.trim() });
    }
  },
  ramp_payout_generate: ({ p_start, p_end, p_only_paid }) => {
    const pick = DB.ramp_timesheets.filter((s) => s.status === 'approved' && !s.payout_line_id && s.week_start >= p_start && s.week_start <= p_end && (!p_only_paid || isPaidSheet(s)) && s.total > 0);
    if (!pick.length) throw new Error(`No approved hours to pay in this period${p_only_paid ? ' from paid invoices' : ''}.`);
    const pid = newId();
    DB.ramp_payouts.push({ id: pid, label: `Payout ${fmt(p_start)} to ${fmt(p_end)}, 2026`, period_start: p_start, period_end: p_end, status: 'draft', currency: 'USD', total: 0,
      exported_at: null, sent_at: null, reference: '', notes: '', discarded_at: null, created_by: M.dana, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    let sort = 0;
    for (const p of DB.ramp_placements) {
      const mine = pick.filter((s) => s.placement_id === p.id);
      if (!mine.length) continue;
      const lid = newId();
      const cn = DB.ramp_clients.find((c) => c.id === p.client_id).name;
      DB.ramp_payout_lines.push({ id: lid, payout_id: pid, member_id: p.member_id, placement_id: p.id, kind: 'hours', description: `${cn} · ${p.title} · weeks of ${fmt(mine[0].week_start)}`,
        quantity: mine.reduce((a, s) => a + s.total, 0), rate: mine[0].pay_rate ?? p.pay_rate, amount: 0, sort: sort++ });
      mine.forEach((s) => { s.payout_line_id = lid; });
    }
    afterWrite();
    return pid;
  },
  ramp_payout_set_status: ({ p_payout, p_status, p_reference }) => {
    const p = DB.ramp_payouts.find((x) => x.id === p_payout);
    if (p_status === 'exported') Object.assign(p, { status: 'exported', exported_at: new Date().toISOString() });
    else if (p_status === 'draft') p.status = 'draft';
    else if (p_status === 'sent') Object.assign(p, { status: 'sent', sent_at: new Date().toISOString(), reference: p_reference || '' });
    else if (p_status === 'void') {
      const ids = DB.ramp_payout_lines.filter((l) => l.payout_id === p.id).map((l) => l.id);
      DB.ramp_timesheets.forEach((s) => { if (ids.includes(s.payout_line_id)) s.payout_line_id = null; });
      Object.assign(p, { status: 'draft', discarded_at: new Date().toISOString() });
    }
  },
  ramp_payout_export: ({ p_payout }) => {
    const po = DB.ramp_payouts.find((x) => x.id === p_payout);
    const by = new Map();
    for (const l of DB.ramp_payout_lines.filter((x) => x.payout_id === p_payout)) by.set(l.member_id, (by.get(l.member_id) || 0) + l.amount);
    return [...by.entries()].map(([mid, amount]) => {
      const m = DB.ramp_members.find((x) => x.id === mid);
      const py = DB.ramp_payees.find((x) => x.member_id === mid);
      return { member_id: mid, name: name(mid), email: py?.email || m.email, method: py?.method || 'wise_email', wise_recipient_id: py?.wise_recipient_id || '',
        account_name: py?.account_name || m.full_name, target_currency: py?.target_currency || 'PHP', amount, currency: po.currency, reference: po.label, bank: py?._bank || null };
    }).sort((a, b) => a.name.localeCompare(b.name));
  },
  ramp_payee_get: ({ p_member }) => {
    const py = DB.ramp_payees.find((x) => x.member_id === p_member);
    if (!py) return null;
    const { _bank, member_id, ...rest } = py;
    return { ...rest, has_bank: !!_bank };
  },
  ramp_payee_save: ({ p_member, p_method, p_account_name, p_email, p_wise_recipient_id, p_target_currency, p_bank, p_notes }) => {
    let py = DB.ramp_payees.find((x) => x.member_id === p_member);
    if (!py) { py = { member_id: p_member }; DB.ramp_payees.push(py); }
    Object.assign(py, { method: p_method, account_name: p_account_name, email: p_email, wise_recipient_id: p_wise_recipient_id, target_currency: p_target_currency, notes: p_notes, updated_at: new Date().toISOString() });
    if (p_bank && Object.keys(p_bank).length) py._bank = p_bank; else if (p_bank) py._bank = null;
  },
};

export const FUNCTIONS = {
  'ramp-stripe': (body) => {
    const on = params.get('stripe') !== 'off';
    if (body.action === 'status') return { configured: on, mode: on ? 'test' : null, webhook: false, webhook_url: 'https://x.supabase.co/functions/v1/ramp-stripe-webhook' };
    if (!on) return { error: 'Stripe isn’t connected yet.' };
    const i = DB.ramp_invoices.find((x) => x.id === body.invoice_id);
    const c = DB.ramp_clients.find((x) => x.id === i.client_id);
    Object.assign(i, { stripe_invoice_id: 'in_new', stripe_url: 'https://invoice.stripe.com/i/acct_x/test_new', sent_at: new Date().toISOString(),
      status: i.status === 'draft' ? 'open' : i.status, issue_date: i.issue_date || TODAY, due_date: i.due_date || addDays(TODAY, c.net_days) });
    return { ok: true, url: i.stripe_url };
  },
};
