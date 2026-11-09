import { createClient } from '@supabase/supabase-js';

// Public values: the publishable key only allows what the database's row-level security permits.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://symbmscaajjmgywbifhv.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_IUie6Hv_qAJs2pBkYEqbzw_gUAxoSgz';

// Counts database requests in flight, so the refresh button can spin until fresh data has arrived.
let inflight = 0;
const idleWatchers = new Set<() => void>();
const trackedFetch: typeof fetch = (input, init) => {
  inflight++;
  return fetch(input, init).finally(() => {
    inflight--;
    if (inflight === 0) idleWatchers.forEach((w) => w());
  });
};

/** Resolves once no database request is running, or after maxMs. */
export function whenIdle(maxMs = 8000): Promise<void> {
  if (inflight === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { idleWatchers.delete(done); clearTimeout(t); resolve(); };
    const t = setTimeout(done, maxMs);
    idleWatchers.add(done);
  });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: trackedFetch },
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'apply1234-admin' },
});

export const DEFAULT_DOMAIN = 'apply1234.com';
