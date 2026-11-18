// @ts-nocheck
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DB, RPC, currentPersona, meId } from './fixtures';
import './agency-fixtures';

const RANK = { owner: 1, admin: 2, lead: 3, mentor: 4, employee: 5, trainee: 6, guest: 7, client: 8 };
const Ctx = createContext(null);
export function useSession() { const s = useContext(Ctx); if (!s) throw new Error('useSession outside SessionProvider'); return s; }
export function useMe() { return useSession(); }
export function applyBrand(color) { document.documentElement.style.setProperty('--brand', color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#4338CA'); }
function load() {
  const id = meId();
  return { me: id ? { ...DB.ramp_members.find((m) => m.id === id) } : null, org: { ...DB.ramp_org[0] }, roles: id ? RPC.ramp_my_roles({}) : { work: false, coaching: 0, client: null } };
}
export function SessionProvider({ children }) {
  const [st, setSt] = useState(load);
  const refresh = useCallback(async () => { setSt(load()); }, []);
  const setOrg = useCallback((o) => setSt((s) => ({ ...s, org: { ...o } })), []);
  const value = useMemo(() => {
    const rank = RANK[st.me.level];
    applyBrand(st.org.brand_color);
    return { state: { status: 'ok' }, me: st.me, org: st.org, role: DB.ramp_job_roles.find((r) => r.id === st.me.job_role_id) || null,
      dept: DB.ramp_departments.find((d) => d.id === st.me.department_id) || null, rank, isAdmin: rank <= 2, canReview: rank <= 4, isGuest: rank === 7,
      isClient: rank === 8, roles: st.roles, agencyOn: true, refresh, setOrg, signOut: async () => {}, finishRecovery: async () => {} };
  }, [st, refresh, setOrg]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
