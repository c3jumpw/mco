import { createClient } from '@supabase/supabase-js';

// Public values: the publishable key only allows what the database's row-level security permits.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://symbmscaajjmgywbifhv.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_IUie6Hv_qAJs2pBkYEqbzw_gUAxoSgz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'apply1234-admin' },
});

export const DEFAULT_DOMAIN = 'apply1234.com';
