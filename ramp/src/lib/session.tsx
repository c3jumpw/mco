import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { rankOf } from './util';
import type { AccountRequestLite, Department, JobRole, Member, MyRoles, Org, SessionAccount, SessionWorkspace, WorkspaceRow } from './types';

export type BlockKind = 'paused' | 'closed' | 'trial_ended';
export type GateState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'recovery' }
  | { status: 'no_access'; email: string; requested: boolean; request: AccountRequestLite | null }
  | { status: 'account_pending'; email: string; request: AccountRequestLite | null }
  | { status: 'account_blocked'; kind: BlockKind; email: string }
  | { status: 'inactive'; email: string }
  | { status: 'expired'; email: string }
  | { status: 'error'; message: string }
  /** A platform admin with no workspace of their own yet: only the console. */
  | { status: 'console' }
  | { status: 'ok' };

/** What ramp_session_start returns (older databases send only state, email, requested and member_id). */
interface StartResult {
  state: string; email?: string; requested?: boolean; member_id?: string | null; super?: boolean; support?: boolean;
  request?: AccountRequestLite | null; workspaces?: WorkspaceRow[]; workspace_id?: string | null;
  workspace?: SessionWorkspace | null; account?: SessionAccount | null;
}

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
  /** Client contact (rank 8): sees only the client portal. */
  isClient: boolean;
  /** Placements this person works on (work), coaches (coaching) or, for client contacts, their company (client). */
  roles: MyRoles;
  /** Agency features are on (Admin › System). */
  agencyOn: boolean;
  /** The current workspace and its account (null on older databases). */
  workspace: SessionWorkspace | null;
  account: SessionAccount | null;
  /** Every workspace this person can switch to (platform admins: all of them). */
  workspaces: WorkspaceRow[];
  /** Platform (super) admin: manages client accounts in the console. */
  isSuper: boolean;
  /** A platform admin viewing someone else's workspace as RAMP Support. */
  support: boolean;
  /** Make another workspace current, then reload the app in it. */
  switchWorkspace: (id: string) => Promise<void>;
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
  const [roles, setRoles] = useState<MyRoles>({ work: false, coaching: 0, client: null });
  const [ctx, setCtx] = useState<Pick<StartResult, 'workspace' | 'account' | 'workspaces' | 'super' | 'support'>>({});
  const wsRef = useRef<string | null>(null);

  const loadMember = useCallback(async (memberId: string) => {
    const [m, o] = await Promise.all([
      supabase.from('ramp_members').select('*').eq('id', memberId).single(),
      supabase.from('ramp_org').select('*').single(),
    ]);
    if (m.error) throw m.error;
    if (o.error) throw o.error;
    const member = m.data as Member;
    const [r, d, ro] = await Promise.all([
      member.job_role_id ? supabase.from('ramp_job_roles').select('*').eq('id', member.job_role_id).maybeSingle() : Promise.resolve({ data: null }),
      member.department_id ? supabase.from('ramp_departments').select('*').eq('id', member.department_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.rpc('ramp_my_roles'),
    ]);
    setRoles((ro.data as MyRoles) || { work: false, coaching: 0, client: null });
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
      const r = data as StartResult;
      setCtx({ workspace: r.workspace?.id ? r.workspace : null, account: r.account?.id ? r.account : null,
        workspaces: r.workspaces || [], super: !!r.super, support: !!r.support });
      wsRef.current = r.workspace_id || null;
      if (r.state === 'ok' && r.member_id) {
        await loadMember(r.member_id);
        setState({ status: 'ok' });
      } else if (r.state === 'ok' && r.super && !r.workspace_id) {
        setState({ status: 'console' });
      } else if (r.state === 'no_access') {
        setState({ status: 'no_access', email: r.email || '', requested: !!r.requested, request: r.request || null });
      } else if (r.state === 'account_pending') {
        setState({ status: 'account_pending', email: r.email || '', request: r.request || null });
      } else if (r.state === 'account_paused' || r.state === 'account_closed' || r.state === 'trial_ended') {
        const kind: BlockKind = r.state === 'account_paused' ? 'paused' : r.state === 'account_closed' ? 'closed' : 'trial_ended';
        setState({ status: 'account_blocked', kind, email: r.email || '' });
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

  // The current workspace is saved per person, so a switch in another tab or device changes this one too: reload when it moves.
  useEffect(() => {
    let last = 0;
    const check = async () => {
      if (!wsRef.current || Date.now() - last < 30000) return;
      last = Date.now();
      const { data, error } = await supabase.rpc('ramp_ws');
      if (!error && data && data !== wsRef.current) window.location.reload();
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  const switchWorkspace = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('ramp_set_workspace', { p_ws: id });
    if (error) throw error;
    wsRef.current = id;
    // A full reload drops every cached list and realtime channel from the old workspace.
    window.location.assign('/');
  }, []);

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
      isClient: rank === 8,
      roles,
      agencyOn: org?.flags?.agency !== false,
      workspace: ctx.workspace || null,
      account: ctx.account || null,
      workspaces: ctx.workspaces || [],
      isSuper: !!ctx.super,
      support: !!ctx.support,
      switchWorkspace,
      refresh,
      setOrg: (o: Org) => { setOrg(o); applyBrand(o.brand_color); },
      signOut,
      finishRecovery,
    };
  }, [state, me, org, role, dept, roles, ctx, switchWorkspace, refresh, signOut, finishRecovery]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
