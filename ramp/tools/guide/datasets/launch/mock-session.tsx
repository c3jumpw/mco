// @ts-nocheck
import { as } from './fixtures';
import { AGENDA } from './fixtures';
const LEVEL = { client: ['client', 8], admin: ['admin', 2], coach: ['mentor', 4], va: ['employee', 5] }[as] || ['client', 8];
const me = { id: 'me-1', full_name: as === 'va' ? 'Maria Santos' : as === 'client' ? 'Dr. Ana Lee' : 'Jordan Lee', preferred_name: '', email: 'x@example.com', level: LEVEL[0], onboarded_at: '2026-01-01', department_id: null, job_role_id: null };
const org = { id: true, name: 'Northwind Services', brand_color: '#4338CA', timezone: 'America/New_York', flags: { chat: true, tasks: true, certificates: false, record_ip: true, agency: true }, agency: { launch_agenda: AGENDA } };
const rank = LEVEL[1];
const value = { state: { status: 'ok' }, me, org, role: null, dept: null, rank, isAdmin: rank <= 2, canReview: rank <= 4, isGuest: rank === 7, isClient: rank === 8,
  roles: { work: as === 'va', coaching: as === 'coach' ? 1 : 0, client: as === 'client' ? 'c-1' : null }, agencyOn: true,
  refresh: async () => {}, setOrg: () => {}, signOut: async () => {}, finishRecovery: async () => {} };
export function useSession() { return value; }
export function useMe() { return value; }
export function SessionProvider({ children }) { return children; }
export function applyBrand() { document.documentElement.style.setProperty('--brand', '#4338CA'); }
