// @ts-nocheck
// Stands in for src/lib/session.tsx in the screenshot preview. Wraps the chosen data set's sample session and adds
// what workspaces brought (workspace, account, switcher list, platform admin, support), set by URL parameters:
//   ?ws=owner | super | support | trial | setup   (default: a normal member of one workspace)
//   ?state=signed_out | no_access | account_pending | trial_ended | paused   (screens shown before the app opens)
// Parameters stick for the tab (sessionStorage), like ?as=… does in the data sets.
import * as DS from '@data/mock-session';
import * as FX from '@data/fixtures';

const q = new URLSearchParams(window.location.search);
for (const k of ['ws', 'state']) if (q.has(k)) sessionStorage.setItem('guide-' + k, q.get(k) || '');
const WS = sessionStorage.getItem('guide-ws') || '';
const STATE = sessionStorage.getItem('guide-state') || '';

const NOW = Date.now();
const inDays = (n) => new Date(NOW + n * 86400000).toLocaleDateString('en-CA');
const ago = (n) => new Date(NOW - n * 86400000).toISOString();

const W_MAIN = { id: 'w0000000-0000-4000-8000-000000000001', name: 'Northwind Services', slug: 'northwind', status: 'active', setup_done: WS !== 'setup' };
const W_DENTAL = { id: 'w0000000-0000-4000-8000-000000000002', name: 'Bright Smile Dental', slug: 'bright-smile', status: 'active', setup_done: true };
const W_HARBOR = { id: 'w0000000-0000-4000-8000-000000000003', name: 'Harbor Logistics', slug: 'harbor', status: 'active', setup_done: false };
const A_MAIN = { id: 'a0000000-0000-4000-8000-000000000001', name: 'Northwind Services', plan: WS === 'trial' ? 'trial' : 'comp', status: 'active',
  trial_ends: WS === 'trial' ? inDays(9) : null, seat_limit: WS === 'trial' ? 10 : null, is_owner: ['owner', 'super', 'trial', 'setup'].includes(WS) };

const row = (w, a, extra = {}) => ({ ...w, account_id: a.id, account_name: a.name, plan: a.plan, account_status: 'active', trial_ends: a.trial_ends || null,
  level: 'owner', member_status: 'active', support: false, is_owner: true, is_current: false, ...extra });

const WORKSPACES = WS === 'super' || WS === 'support'
  ? [row(W_MAIN, A_MAIN, { is_current: WS !== 'support' }),
     row(W_DENTAL, { id: 'a2', name: 'Bright Smile Dental', plan: 'trial', trial_ends: inDays(21) }, { level: WS === 'support' ? 'admin' : null, member_status: WS === 'support' ? 'active' : null, support: WS === 'support', is_owner: false, is_current: WS === 'support' }),
     row(W_HARBOR, { id: 'a3', name: 'Harbor Logistics', plan: 'comp' }, { level: null, member_status: null, is_owner: false })]
  : WS === 'owner' || WS === 'trial'
    ? [row(W_MAIN, A_MAIN, { is_current: true }), row({ ...W_MAIN, id: 'w4', name: 'Northwind Events', slug: 'nw-events' }, A_MAIN)]
    : [row(W_MAIN, A_MAIN, { is_current: true })];

const EXTRA = {
  workspace: WS === 'support' ? W_DENTAL : W_MAIN,
  account: WS === 'support' ? { id: 'a2', name: 'Bright Smile Dental', plan: 'trial', status: 'active', trial_ends: inDays(21), seat_limit: 15, is_owner: false } : A_MAIN,
  workspaces: WORKSPACES,
  isSuper: WS === 'super' || WS === 'support',
  support: WS === 'support',
  switchWorkspace: async () => {},
};

// ───────── workspace RPCs and tables for the sample backend ─────────
const PRICES = [
  { id: 'price_team_monthly', label: 'Team', amount: 49, interval: 'month', seats: 10 },
  { id: 'price_business_monthly', label: 'Business', amount: 129, interval: 'month', seats: 40 },
];
const PLATFORM = { id: true, library_workspace_id: W_MAIN.id, agency_workspace_id: W_MAIN.id, brand_name: 'RAMP', brand_color: '#4338CA',
  default_trial_days: 30, default_seat_limit: 10, workspace_limit: 5, stripe_prices: PRICES, updated_at: ago(3) };
const REQUESTS = [
  { id: 'r1', auth_user_id: 'u1', email: 'dana.cruz@brightsmile.example', name: 'Dana Cruz', company: 'Coastal Vet Clinics', phone: '(512) 555-0142', team_size: '6–20',
    note: 'We hire 3 to 4 front-desk staff a year and want one place to train them.', status: 'pending', account_id: null, decision_note: '', decided_at: null, decided_by: null, created_at: ago(1) },
  { id: 'r2', auth_user_id: 'u2', email: 'leo.martins@summitroof.example', name: 'Leo Martins', company: 'Summit Roofing', phone: '', team_size: '21–50',
    note: '', status: 'pending', account_id: null, decision_note: '', decided_at: null, decided_by: null, created_at: ago(2) },
  { id: 'r3', auth_user_id: 'u3', email: 'kim@harbor.example', name: 'Kim Ito', company: 'Harbor Logistics', phone: '', team_size: '2–5', note: '',
    status: 'approved', account_id: 'a3', decision_note: '', decided_at: ago(6), decided_by: null, created_at: ago(7) },
];
const ACCOUNTS = [
  { id: A_MAIN.id, name: 'Northwind Services', status: 'active', pause_reason: null, plan: 'comp', trial_ends: null, seat_limit: null, notes: 'Platform owner.', created_at: ago(60),
    approved_at: ago(60), owner_auth_id: 'u0', owner_email: 'owner@northwind.example', subscription_status: null, current_period_end: null, stripe_customer_id: null,
    seats_used: 14, workspaces: 1, members: 14, placements: 3, workspace_list: [{ ...W_MAIN, created_at: ago(60), members: 14 }] },
  { id: 'a2', name: 'Bright Smile Dental', status: 'active', pause_reason: null, plan: 'trial', trial_ends: inDays(21), seat_limit: 15, notes: '', created_at: ago(9),
    approved_at: ago(9), owner_auth_id: 'u4', owner_email: 'maria@brightsmile.example', subscription_status: null, current_period_end: null, stripe_customer_id: null,
    seats_used: 6, workspaces: 1, members: 6, placements: 0, workspace_list: [{ ...W_DENTAL, created_at: ago(9), members: 6 }] },
  { id: 'a3', name: 'Harbor Logistics', status: 'active', pause_reason: null, plan: 'comp', trial_ends: null, seat_limit: 10, notes: 'Free while we test together.', created_at: ago(6),
    approved_at: ago(6), owner_auth_id: 'u3', owner_email: 'kim@harbor.example', subscription_status: null, current_period_end: null, stripe_customer_id: null,
    seats_used: 2, workspaces: 1, members: 2, placements: 0, workspace_list: [{ ...W_HARBOR, created_at: ago(6), members: 2 }] },
];

if (FX.DB) {
  FX.DB.ramp_platform = [PLATFORM];
  FX.DB.ramp_accounts = [{ ...ACCOUNTS[0], plan: A_MAIN.plan, trial_ends: A_MAIN.trial_ends, seat_limit: A_MAIN.seat_limit, stripe_price_id: null, stripe_subscription_id: null }];
}
const myClientInvoices = () => {
  const me = FX.DB?.ramp_members?.find((m) => m.id === FX.meId?.());
  return (FX.DB?.ramp_invoices || []).filter((i) => i.client_id === me?.client_id && i.status !== 'draft');
};
if (FX.RPC) Object.assign(FX.RPC, {
  ramp_seats: () => ({ used: WS === 'trial' ? 7 : 14, limit: WS === 'trial' ? 10 : null, plan: A_MAIN.plan }),
  ramp_my_workspaces: () => WORKSPACES,
  ramp_set_workspace: ({ p_ws }) => p_ws,
  ramp_ws: () => EXTRA.workspace.id,
  ramp_super_accounts: () => ({ accounts: ACCOUNTS, requests: REQUESTS, platform: PLATFORM }),
  ramp_super_approve: () => ({ account_id: 'a9', workspace_id: 'w9' }),
  ramp_super_decline: () => null,
  ramp_super_update_account: () => null,
  ramp_super_platform_save: () => PLATFORM,
  ramp_workspace_setup_done: () => null,
  ramp_account_add_workspace: () => 'w9',
  ramp_account_request: (a) => ({ ...REQUESTS[0], company: a.p_company, name: a.p_name }),
  ramp_client_invoices: () => myClientInvoices(),
  ramp_client_invoice: ({ p_id }) => {
    const inv = myClientInvoices().find((i) => i.id === p_id);
    if (!inv) throw new Error('Invoice not found.');
    const c = FX.DB.ramp_clients.find((x) => x.id === inv.client_id) || {};
    return { invoice: inv, lines: (FX.DB.ramp_invoice_lines || []).filter((l) => l.invoice_id === inv.id),
      client: { name: c.name, billing_name: c.billing_name || '', billing_email: c.billing_email || '', billing_address: c.billing_address || '', net_days: c.net_days ?? 7 },
      issuer: { name: FX.DB.ramp_org?.[0]?.name || 'Northwind Services', brand_color: '#4338CA' } };
  },
});

// ───────── screens shown before the app opens ─────────
const REQ = { id: 'r1', company: 'Coastal Vet Clinics', name: 'Dana Cruz', status: STATE === 'declined' ? 'declined' : 'pending',
  decision_note: STATE === 'declined' ? 'Could you tell us a little more about your team?' : '', created_at: ago(1) };
const GATE = {
  signed_out: { status: 'signed_out' },
  no_access: { status: 'no_access', email: 'dana.cruz@coastalvet.example', requested: false, request: null },
  declined: { status: 'no_access', email: 'dana.cruz@coastalvet.example', requested: false, request: REQ },
  account_pending: { status: 'account_pending', email: 'dana.cruz@coastalvet.example', request: REQ },
  trial_ended: { status: 'account_blocked', kind: 'trial_ended', email: 'owner@northwind.example' },
  paused: { status: 'account_blocked', kind: 'paused', email: 'owner@northwind.example' },
}[STATE];

const cache = new WeakMap();
function augment(s) {
  if (GATE) {
    return { state: GATE, me: null, org: null, role: null, dept: null, rank: 99, isAdmin: false, canReview: false, isGuest: false, isClient: false,
      roles: { work: false, coaching: 0, client: null }, agencyOn: false, ...EXTRA, workspace: GATE.status === 'account_blocked' ? W_MAIN : null,
      account: GATE.status === 'account_blocked' ? { ...A_MAIN, plan: 'trial', is_owner: true } : null, workspaces: [],
      refresh: async () => {}, setOrg: () => {}, signOut: async () => {}, finishRecovery: async () => {} };
  }
  let a = cache.get(s);
  if (!a) {
    a = { roles: { work: false, coaching: 0, client: null }, agencyOn: true, isClient: s.rank === 8, ...s, ...EXTRA,
      isAdmin: s.isAdmin || EXTRA.isSuper, account: s.me?.level === 'owner' ? { ...EXTRA.account, is_owner: true } : EXTRA.account };
    cache.set(s, a);
  }
  return a;
}

export const applyBrand = DS.applyBrand;
export function SessionProvider({ children }) {
  if (GATE) return children;
  return <DS.SessionProvider>{children}</DS.SessionProvider>;
}
export function useSession() { return augment(GATE ? {} : DS.useSession()); }
export function useMe() { return useSession(); }
