// @ts-nocheck
import { DB, as } from './fixtures';
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const roleOf = () => (as === 'va' ? 'va' : as === 'coach' ? 'coach' : as === 'admin' ? 'admin' : 'client');
window.__DB = DB;
async function rpc(name, args) {
  await wait();
  if (name === 'ramp_launch_get') {
    if (window.__failGet) return { data: null, error: { message: 'You can’t open this launch plan.' } };
    return { data: JSON.parse(JSON.stringify({ role: roleOf(), plan: DB.plan, placement: DB.placement })), error: null };
  }
  if (name === 'ramp_launch_save') {
    if (roleOf() === 'va') return { data: null, error: { message: 'You can’t edit this launch plan.' } };
    if (window.__failSave) return { data: null, error: { message: 'Failed to fetch' } };
    DB.saves.push(args);
    DB.plan = { ...(DB.plan || {}), placement_id: args.p_placement, status: args.p_status, day1_date: args.p_day1, data: args.p_data, agenda: args.p_agenda };
    return { data: null, error: null };
  }
  if (name === 'ramp_client_portal') return { data: { timesheets: [] }, error: null };
  return { data: null, error: null };
}
class Q {
  then(res, rej) { return wait().then(() => ({ data: [], error: null, count: 0 })).then(res, rej); }
}
for (const m of ['select','eq','neq','in','order','limit','single','maybeSingle','is','gte','lte','or']) Q.prototype[m] = function () { return this; };
const PNG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c7d2fe"/><rect x="30" y="30" width="340" height="40" rx="8" fill="#4338ca"/><rect x="30" y="90" width="200" height="16" rx="4" fill="#818cf8"/><rect x="30" y="120" width="300" height="16" rx="4" fill="#a5b4fc"/></svg>');
export const supabase = {
  rpc: (n, a) => ({ then: (res, rej) => rpc(n, a).then(res, rej) }),
  from: () => new Q(),
  storage: { from: () => ({
    upload: async (path) => { await wait(400); window.__uploads = [...(window.__uploads || []), path]; return { data: { path }, error: null }; },
    createSignedUrl: async () => ({ data: { signedUrl: PNG }, error: null }),
  }) },
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
};
export const FILES_BUCKET = 'ramp-files';
export function errText(e) {
  if (!e) return 'Something went wrong. Try again.';
  const msg = typeof e === 'string' ? e : e.message || '';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'You seem to be offline. Check your connection and try again.';
  return msg || 'Something went wrong. Try again.';
}
export async function uploadFile() { return 'x'; }
export async function fileUrl() { return PNG; }
export async function openFile(path) { window.__opened = path; }
