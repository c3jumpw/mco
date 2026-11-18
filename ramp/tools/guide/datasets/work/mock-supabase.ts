// @ts-nocheck
// Mocked replacement for src/lib/supabase.ts: an in-memory PostgREST-style query builder over the fixtures,
// with the app's row-level security rules, the RPCs the pages call, storage and a no-op realtime channel.
import { DB, RPC, LOG, meId, defaultsFor, newId, canRead, STORAGE } from './fixtures';

const DELAY = 45;
const wait = (ms = DELAY) => new Promise((r) => setTimeout(r, ms));

function like(v, pattern, ci) {
  const re = new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', ci ? 'i' : '');
  return re.test(String(v ?? ''));
}
function cmp(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}
const eqv = (a, b) => (a === b) || (a != null && b != null && String(a) === String(b));

/** One PostgREST condition like "member_id.eq.abc" or "detail.ilike.%x%". */
function cond(expr) {
  const [col, op, ...rest] = expr.split('.');
  const val = rest.join('.');
  return (r) => {
    const v = r[col];
    switch (op) {
      case 'eq': return eqv(v, val);
      case 'neq': return !eqv(v, val);
      case 'ilike': return like(v, val, true);
      case 'like': return like(v, val, false);
      case 'gt': return cmp(v, val) > 0;
      case 'gte': return cmp(v, val) >= 0;
      case 'lt': return cmp(v, val) < 0;
      case 'lte': return cmp(v, val) <= 0;
      case 'is': return val === 'null' ? v == null : String(v) === val;
      case 'in': return val.replace(/^\(|\)$/g, '').split(',').some((x) => eqv(v, x));
      default: return true;
    }
  };
}

class Query {
  constructor(table) {
    this.table = table; this.filters = []; this.orders = []; this.op = 'select'; this.payload = null;
    this.returning = false; this.one = null; this.head = false; this.count = null; this.rng = null; this.lim = null; this.onConflict = null;
  }
  select(_cols, o = {}) { if (this.op !== 'select') this.returning = true; if (o.head) this.head = true; if (o.count) this.count = o.count; return this; }
  eq(c, v) { this.filters.push((r) => eqv(r[c], v)); return this; }
  neq(c, v) { this.filters.push((r) => !eqv(r[c], v)); return this; }
  gt(c, v) { this.filters.push((r) => cmp(r[c], v) > 0); return this; }
  gte(c, v) { this.filters.push((r) => cmp(r[c], v) >= 0); return this; }
  lt(c, v) { this.filters.push((r) => cmp(r[c], v) < 0); return this; }
  lte(c, v) { this.filters.push((r) => cmp(r[c], v) <= 0); return this; }
  like(c, p) { this.filters.push((r) => like(r[c], p, false)); return this; }
  ilike(c, p) { this.filters.push((r) => like(r[c], p, true)); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  in(c, vs) { this.filters.push((r) => (vs || []).some((v) => eqv(r[c], v))); return this; }
  contains(c, v) {
    this.filters.push((r) => {
      const have = r[c];
      if (Array.isArray(v)) return Array.isArray(have) && v.every((x) => have.some((h) => JSON.stringify(h) === JSON.stringify(x) || h === x));
      if (v && typeof v === 'object') return have && Object.entries(v).every(([k, x]) => JSON.stringify(have[k]) === JSON.stringify(x));
      return String(have || '').includes(String(v));
    });
    return this;
  }
  match(o) { Object.entries(o || {}).forEach(([c, v]) => this.eq(c, v)); return this; }
  not(c, op, v) { const f = cond(`${c}.${op}.${v}`); this.filters.push((r) => !f(r)); return this; }
  filter(c, op, v) { this.filters.push(cond(`${c}.${op}.${v}`)); return this; }
  or(expr) {
    const parts = String(expr).split(',').map((p) => cond(p.trim()));
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  textSearch(c, q) { return this.ilike(c, `%${q}%`); }
  order(c, o = {}) { this.orders.push([c, o.ascending !== false]); return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  throwOnError() { return this; }
  csv() { return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  upsert(p, o = {}) { this.op = 'upsert'; this.payload = p; this.onConflict = o.onConflict || 'id'; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }

  then(res, rej) { return wait().then(() => this.exec()).then(res, rej); }

  exec() {
    const t = this.table;
    const rows = DB[t] || (DB[t] = []);
    const now = new Date().toISOString();
    LOG.push({ table: t, op: this.op, payload: this.payload });
    const match = (r) => this.filters.every((f) => f(r));
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out = [];
      for (const p of list) {
        const keys = String(this.onConflict || '').split(',').map((s) => s.trim()).filter(Boolean);
        const existing = this.op === 'upsert' && keys.length ? rows.find((r) => keys.every((k) => p[k] !== undefined && eqv(r[k], p[k]))) : null;
        if (existing) { Object.assign(existing, p, { updated_at: now }); out.push(existing); continue; }
        if (t === 'ramp_acks' && rows.some((r) => r.announcement_id === p.announcement_id && r.member_id === p.member_id)) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
        }
        const row = { ...defaultsFor(t), ...p };
        if (row.id === undefined || row.id === null) row.id = t === 'ramp_messages' || t === 'ramp_audit' || t === 'ramp_signins' ? Math.max(0, ...rows.map((r) => Number(r.id) || 0)) + 1 : newId();
        if ('created_at' in row && !p.created_at) row.created_at = now;
        if ('updated_at' in row && !p.updated_at) row.updated_at = now;
        if (t === 'ramp_acks' && !p.at) row.at = now;
        rows.push(row);
        out.push(row);
      }
      return this.out(out);
    }
    const visible = rows.filter((r) => canRead(t, r));
    let list = visible.filter(match);
    if (this.op === 'update') {
      list.forEach((r) => Object.assign(r, this.payload, 'updated_at' in r ? { updated_at: now } : {}));
      return this.returning ? this.out(list) : { data: null, error: null };
    }
    if (this.op === 'delete') {
      const gone = new Set(list);
      DB[t] = rows.filter((r) => !gone.has(r));
      return this.returning ? this.out(list) : { data: null, error: null };
    }
    for (const [c, asc] of [...this.orders].reverse()) list = [...list].sort((a, b) => cmp(a[c], b[c]) * (asc ? 1 : -1));
    const total = list.length;
    if (this.rng) list = list.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) list = list.slice(0, this.lim);
    if (this.head) return { data: null, error: null, count: total };
    const res = this.out(list);
    if (this.count) res.count = total;
    return res;
  }

  out(list) {
    const copy = (r) => JSON.parse(JSON.stringify(r));
    if (this.one === 'single') return list[0] ? { data: copy(list[0]), error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    if (this.one === 'maybe') return { data: list[0] ? copy(list[0]) : null, error: null };
    if (this.op !== 'select' && !this.returning) return { data: null, error: null };
    return { data: list.map(copy), error: null };
  }
}

const channelStub = (name) => {
  const ch = { name, on() { return ch; }, subscribe(cb) { setTimeout(() => cb && cb('SUBSCRIBED'), 0); return ch; }, unsubscribe: async () => 'ok', send: async () => 'ok' };
  return ch;
};

export const supabase = {
  from: (t) => new Query(t),
  rpc: (name, args = {}) => {
    const run = async () => {
      await wait(60);
      LOG.push({ rpc: name, args });
      const fn = RPC[name];
      if (!fn) return { data: null, error: null };
      try { return { data: fn(args), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; }
    };
    return { then: (a, b) => run().then(a, b) };
  },
  channel: channelStub,
  removeChannel: async () => 'ok',
  removeAllChannels: async () => [],
  storage: {
    from: () => ({
      list: async (prefix) => { await wait(); return { data: STORAGE.filter((f) => f.prefix === prefix), error: null }; },
      upload: async (path) => { await wait(); return { data: { path }, error: null }; },
      remove: async (paths) => ({ data: (paths || []).map((p) => ({ name: p })), error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'about:blank' }, error: null }),
      download: async () => ({ data: new Blob(['']), error: null }),
    }),
  },
  auth: {
    getSession: async () => ({ data: { session: meId() ? { user: { id: 'u-' + meId() } } : null } }),
    getUser: async () => ({ data: { user: meId() ? { id: 'u-' + meId() } : null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => { await wait(300); return { data: {}, error: { message: 'Invalid login credentials' } }; },
    signUp: async () => { await wait(300); return { data: { session: null, user: {} }, error: null }; },
    resetPasswordForEmail: async () => { await wait(300); return { data: {}, error: null }; },
    updateUser: async () => { await wait(300); return { data: {}, error: null }; },
  },
};

export const FILES_BUCKET = 'ramp-files';

export function errText(e) {
  if (!e) return 'Something went wrong. Try again.';
  const msg = typeof e === 'string' ? e : e.message || '';
  if (/JWT|session/i.test(msg)) return 'Your session ended. Sign in again.';
  if (/duplicate key/i.test(msg)) return 'That already exists.';
  if (/row-level security|permission denied/i.test(msg)) return 'You don’t have permission to do that.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'You seem to be offline. Check your connection and try again.';
  return msg || 'Something went wrong. Try again.';
}

export async function uploadFile(memberId, file, folder = 'files') {
  await wait(150);
  const clean = file.name.replace(/[^\w.\-]+/g, '-').slice(-80) || 'file';
  return `${memberId}/${folder}/${newId()}-${clean}`;
}
export async function fileUrl() { return 'about:blank'; }
export async function openFile(path, log) {
  if (log) supabase.rpc('ramp_log', { p_action: 'opened file', p_member: log.member, p_detail: log.detail }).then(() => {});
}
