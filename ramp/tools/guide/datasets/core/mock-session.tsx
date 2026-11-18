// @ts-nocheck
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DB, meId } from './fixtures';

const RANK = { owner: 1, admin: 2, lead: 3, mentor: 4, employee: 5, trainee: 6, guest: 7, client: 8 };
const Ctx = createContext(null);
export function useSession() { const s = useContext(Ctx); if (!s) throw new Error('no session'); return s; }
export function useMe() { return useSession(); }
export function applyBrand(color) { document.documentElement.style.setProperty('--brand', color || '#4338CA'); }
function load() { return { me: { ...DB.ramp_members.find((m) => m.id === meId()) }, org: { ...DB.ramp_org[0] } }; }
export function SessionProvider({ children }) {
  const [st, setSt] = useState(load);
  const refresh = useCallback(async () => setSt(load()), []);
  const setOrg = useCallback((o) => { DB.ramp_org[0] = { ...DB.ramp_org[0], ...o }; setSt((s) => ({ ...s, org: { ...DB.ramp_org[0] } })); }, []);
  const value = useMemo(() => {
    const rank = RANK[st.me.level];
    applyBrand(st.org.brand_color);
    return { state: { status: 'ok' }, me: st.me, org: st.org, role: null, dept: null, rank, isAdmin: rank <= 2, canReview: rank <= 4, isGuest: rank === 7,
      isClient: rank === 8, roles: { work: false, coaching: 0, client: null }, agencyOn: st.org.flags?.agency !== false,
      refresh, setOrg, signOut: async () => {}, finishRecovery: async () => {} };
  }, [st, refresh, setOrg]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
