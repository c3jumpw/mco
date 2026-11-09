import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { rankOf } from './util';
import type { Department, JobRole, Member, Org } from './types';

export type GateState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'recovery' }
  | { status: 'no_access'; email: string; requested: boolean }
  | { status: 'inactive'; email: string }
  | { status: 'expired'; email: string }
  | { status: 'error'; message: string }
  | { status: 'ok' };

export interface Session {
  state: GateState;
  /** Set when state is 'ok'. */
  me: Member | null;
  org: Org | null;
  role: JobRole | null;
  dept: Department | null;
  /** 1 owner … 7 guest; 99 when signed out. */
  rank: number;
  isAdmin: boolean;
  /** Mentor, lead, admin or owner: can review and assign work to the people they look after. */
  canReview: boolean;
  isGuest: boolean;
  /** Reload the signed-in member, org, role and department (after profile or settings changes). */
  refresh: () => Promise<void>;
  /** Replace the org locally after saving it (avoids a reload flash). */
  setOrg: (org: Org) => void;
  signOut: () => Promise<void>;
  /** Call after the new password is saved on the recovery screen. */
  finishRecovery: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

// A password-reset link signs the person in with a one-time session; show the new-password screen first.
let recovering = /type=recovery/.test(window.location.hash) || window.location.pathname === '/reset-password';

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

/** For screens inside the signed-in app, where me and org always exist. */
export function useMe() {
  const s = useSession();
  return s as Session & { me: Member; org: Org };
}

export function applyBrand(color: string | null | undefined) {
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#4338CA';
  document.documentElement.style.setProperty('--brand', c);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'loading' });
  const [me, setMe] = useState<Member | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [role, setRole] = useState<JobRole | null>(null);
  const [dept, setDept] = useState<Department | null>(null);

  const loadMember = useCallback(async (memberId: string) => {
    const [m, o] = await Promise.all([
      supabase.from('ramp_members').select('*').eq('id', memberId).single(),
      supabase.from('ramp_org').select('*').single(),
    ]);
    if (m.error) throw m.error;
    if (o.error) throw o.error;
    const member = m.data as Member;
    const [r, d] = await Promise.all([
      member.job_role_id ? supabase.from('ramp_job_roles').select('*').eq('id', member.job_role_id).maybeSingle() : Promise.resolve({ data: null }),
      member.department_id ? supabase.from('ramp_departments').select('*').eq('id', member.department_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setMe(member);
    setOrg(o.data as Org);
    setRole((r.data as JobRole) || null);
    setDept((d.data as Department) || null);
    applyBrand((o.data as Org).brand_color);
  }, []);

  const start = useCallback(async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        setMe(null);
        setState({ status: 'signed_out' });
        return;
      }
      if (recovering) { setState({ status: 'recovery' }); return; }
      const { data, error } = await supabase.rpc('ramp_session_start');
      if (error) throw error;
      const r = data as { state: string; email?: string; requested?: boolean; member_id?: string };
      if (r.state === 'ok' && r.member_id) {
        await loadMember(r.member_id);
        setState({ status: 'ok' });
      } else if (r.state === 'no_access') {
        setState({ status: 'no_access', email: r.email || '', requested: !!r.requested });
      } else if (r.state === 'inactive') {
        setState({ status: 'inactive', email: r.email || '' });
      } else if (r.state === 'expired') {
        setState({ status: 'expired', email: r.email || '' });
      } else {
        setState({ status: 'signed_out' });
      }
    } catch (e) {
      const msg = (e as { message?: string }).message || '';
      if (/JWT|session|refresh token/i.test(msg)) {
        await supabase.auth.signOut();
        setState({ status: 'signed_out' });
      } else {
        setState({ status: 'error', message: msg || 'RAMP could not load.' });
      }
    }
  }, [loadMember]);

  useEffect(() => {
    supabase.rpc('ramp_public_brand').then(({ data }) => {
      if (data && (data as { color?: string }).color) applyBrand((data as { color: string }).color);
    });
    start();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') { recovering = true; setState({ status: 'recovery' }); }
      else if (event === 'SIGNED_IN') setTimeout(start, 0);
      else if (event === 'SIGNED_OUT') { setMe(null); setState({ status: 'signed_out' }); }
    });
    return () => sub.subscription.unsubscribe();
  }, [start]);

  const refresh = useCallback(async () => {
    if (me) await loadMember(me.id);
    else await start();
  }, [me, loadMember, start]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMe(null);
    setState({ status: 'signed_out' });
  }, []);

  const finishRecovery = useCallback(async () => {
    recovering = false;
    window.history.replaceState(null, '', '/');
    await start();
  }, [start]);

  const value = useMemo<Session>(() => {
    const rank = state.status === 'ok' ? rankOf(me?.level) : 99;
    return {
      state, me, org, role, dept, rank,
      isAdmin: rank <= 2,
      canReview: rank <= 4,
      isGuest: rank === 7,
      refresh,
      setOrg: (o: Org) => { setOrg(o); applyBrand(o.brand_color); },
      signOut,
      finishRecovery,
    };
  }, [state, me, org, role, dept, refresh, signOut, finishRecovery]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
