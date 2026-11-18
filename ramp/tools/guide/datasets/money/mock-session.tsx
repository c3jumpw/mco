// @ts-nocheck
import { createContext, useContext, useMemo } from 'react';
import { DB } from './fixtures';
const Ctx = createContext(null);
export function useSession() { return useContext(Ctx); }
export function useMe() { return useContext(Ctx); }
export function applyBrand(c) { document.documentElement.style.setProperty('--brand', c || '#4338CA'); }
export function SessionProvider({ children }) {
  const value = useMemo(() => {
    const me = DB.ramp_members[0];
    const org = DB.ramp_org[0];
    applyBrand(org.brand_color);
    return { state: { status: 'ok' }, me, org, role: null, dept: null, rank: 1, isAdmin: true, canReview: true, isGuest: false, isClient: false,
      roles: { work: false, coaching: 0, client: null }, agencyOn: true, refresh: async () => {}, setOrg: () => {}, signOut: async () => {}, finishRecovery: async () => {} };
  }, []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
