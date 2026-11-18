import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useMe } from '../lib/session';
import { LEVELS, cx, displayName } from '../lib/util';
import { Avatar, Icon, IconButton, Logo } from '../ui';
import { SupportBanner, TrialBanner, WorkspaceSheet, useCanSwitch } from './Workspace';
import { TourHost } from '../guide/Tour';

// ───────── navigation model (shared with More and the admin hub) ─────────

export interface NavItem { to: string; label: string; icon: string; badge?: 'news' | 'review' | 'hours' | 'agency' }

export function useNav(): { main: NavItem[]; mobile: NavItem[] } {
  const { org, rank, isGuest, isClient, roles, agencyOn } = useMe();
  const flags = org.flags || { chat: true, tasks: true, certificates: false, record_ip: true };
  if (isClient) {
    const items: NavItem[] = [
      { to: '/client', label: 'Overview', icon: 'home' },
      { to: '/client/hours', label: 'Hours', icon: 'clock', badge: 'hours' },
      { to: '/client/invoices', label: 'Invoices', icon: 'fileText' },
      { to: '/guide', label: 'Guide', icon: 'lifebuoy' },
      { to: '/me', label: 'Profile', icon: 'users' },
    ];
    return { main: items, mobile: items };
  }
  if (isGuest) {
    const items: NavItem[] = [
      { to: '/', label: 'Home', icon: 'home' },
      { to: '/training', label: 'Training', icon: 'book' },
      { to: '/resources', label: 'Resources', icon: 'folder' },
      { to: '/guide', label: 'Guide', icon: 'lifebuoy' },
      { to: '/me', label: 'Profile', icon: 'users' },
    ];
    return { main: items, mobile: items };
  }
  const main: NavItem[] = [
    { to: '/', label: 'Home', icon: 'home' },
    // An owner or admin of a client company's own workspace: the assistants the agency placed with them.
    ...(roles.client?.linked ? [
      { to: '/client', label: 'Our team members', icon: 'userPlus', badge: 'hours' as const },
      { to: '/client/invoices', label: 'Agency invoices', icon: 'fileText' },
    ] : []),
    ...(agencyOn && roles.work ? [{ to: '/work', label: 'My work', icon: 'clock' }] : []),
    { to: '/training', label: 'Training', icon: 'book' },
    ...(flags.tasks ? [{ to: '/tasks', label: 'Tasks', icon: 'tasks' }] : []),
    { to: '/notes', label: 'Notebook', icon: 'notes' },
    ...(flags.chat ? [{ to: '/chat', label: 'Chat', icon: 'chat' }] : []),
    { to: '/resources', label: 'Resources', icon: 'folder' },
    { to: '/news', label: 'News', icon: 'megaphone', badge: 'news' as const },
    ...(rank <= 4 ? [{ to: '/team', label: rank <= 2 ? 'Team progress' : 'My team', icon: 'users', badge: 'review' as const }] : []),
    ...(agencyOn && roles.coaching > 0 ? [{ to: '/coaching', label: 'Coaching', icon: 'target' }] : []),
    { to: '/guide', label: 'Guide', icon: 'lifebuoy' },
  ];
  const pick = (to: string) => main.find((m) => m.to === to);
  const mobile = [pick('/'), pick('/training'), pick('/work') || pick('/tasks') || pick('/notes'), pick('/chat') || pick('/resources'),
    { to: '/more', label: 'More', icon: 'more' }].filter(Boolean) as NavItem[];
  return { main, mobile };
}

export interface AdminSection { to: string; label: string; icon: string; desc: string; group: 'Agency' | 'Set up' | 'People' | 'Communicate' | 'System'; ownerOnly?: boolean; agency?: boolean }
export const ADMIN_SECTIONS: AdminSection[] = [
  { to: '/admin/agency', label: 'Agency dashboard', icon: 'chart', desc: 'Revenue, margin and everything that needs you today', group: 'Agency', agency: true },
  { to: '/admin/clients', label: 'Clients', icon: 'building', desc: 'Client companies, contacts, billing and their training tracks', group: 'Agency', agency: true },
  { to: '/admin/placements', label: 'Placements', icon: 'link', desc: 'Team members placed with clients: rates, checklists, check-ins and launch plans', group: 'Agency', agency: true },
  { to: '/admin/timesheets', label: 'Timesheets', icon: 'clock', desc: 'Approve hours and enter them for anyone', group: 'Agency', agency: true },
  { to: '/admin/invoices', label: 'Invoices', icon: 'fileText', desc: 'Bill clients for hours, prepayments and setup fees; send through Stripe', group: 'Agency', agency: true },
  { to: '/admin/payouts', label: 'Payouts', icon: 'send', desc: 'Pay team members for approved hours and export Wise batch files', group: 'Agency', agency: true },
  { to: '/admin/tiers', label: 'Tiers', icon: 'star', desc: 'Skill tiers with default rates and what it takes to move up', group: 'Agency', agency: true },
  { to: '/admin/agency/settings', label: 'Agency settings', icon: 'sliders', desc: 'Checklist, check-in schedule, guarantee, invoicing, Stripe and the Day 1 agenda', group: 'Agency', agency: true },
  { to: '/admin/org', label: 'Organization', icon: 'building', desc: 'Name, brand color, time zone and welcome message', group: 'Set up' },
  { to: '/admin/roles', label: 'Roles and departments', icon: 'sliders', desc: 'Job roles, departments and the access each role graduates to', group: 'Set up' },
  { to: '/admin/flow', label: 'Welcome flow', icon: 'list', desc: 'The onboarding steps a new person goes through', group: 'Set up' },
  { to: '/admin/documents', label: 'Documents', icon: 'fileText', desc: 'Fillable forms, uploads, e-sign and checklists', group: 'Set up' },
  { to: '/admin/training', label: 'Training modules', icon: 'book', desc: 'Build modules with slides, quizzes and assignments', group: 'Set up' },
  { to: '/admin/assign', label: 'Assign training', icon: 'target', desc: 'Required modules for everyone, tracks for each role', group: 'Set up' },
  { to: '/admin/people', label: 'People', icon: 'userPlus', desc: 'Invite, import potential staff, manage access', group: 'People' },
  { to: '/admin/metrics', label: 'Metrics', icon: 'chart', desc: 'Onboarding and training progress across the team', group: 'People' },
  { to: '/admin/news', label: 'Announcements', icon: 'megaphone', desc: 'Post news and track who has read it', group: 'Communicate' },
  { to: '/admin/resources', label: 'Resources', icon: 'folder', desc: 'Policies, SOPs, guides and tools', group: 'Communicate' },
  { to: '/admin/account', label: 'Account and billing', icon: 'key', desc: 'Your plan, seats and the other organizations in your account', group: 'System' },
  { to: '/admin/system', label: 'System and audit', icon: 'shield', desc: 'Feature switches, IP recording and the audit log', group: 'System' },
  { to: '/guide?view=admin', label: 'Admin guide', icon: 'lifebuoy', desc: 'How every admin page and setting works, with screenshots', group: 'System' },
];

/** Admin sections this person can open, with Agency hidden when it's switched off. */
export function useAdminSections() {
  const { rank, agencyOn } = useMe();
  return ADMIN_SECTIONS.filter((s) => (!s.ownerOnly || rank === 1) && (!s.agency || agencyOn));
}

// ───────── badges (unread news, work waiting for review) ─────────

interface Badges { news: number; review: number; hours: number; agency: number; refresh: () => void }
const BadgeCtx = createContext<Badges>({ news: 0, review: 0, hours: 0, agency: 0, refresh: () => {} });
export const useBadges = () => useContext(BadgeCtx);

function useBadgeState(): Badges {
  const { me, rank, canReview, isAdmin, isClient, agencyOn, roles } = useMe();
  const [news, setNews] = useState(0);
  const [review, setReview] = useState(0);
  const [hrs, setHrs] = useState(0);
  const [agency, setAgency] = useState(0);
  const refresh = useCallback(async () => {
    if (isClient || roles.client?.linked) {
      // Hours waiting for this client's approval.
      const { data } = await supabase.rpc('ramp_client_portal');
      const ts = ((data as { timesheets?: { status: string }[] } | null)?.timesheets || []);
      setHrs(ts.filter((t) => t.status === 'submitted').length);
      if (isClient) return;
    }
    if (rank > 6) return;
    const [a, k, r, ag] = await Promise.all([
      supabase.from('ramp_announcements').select('id, audience, department_id').eq('require_ack', true),
      supabase.from('ramp_acks').select('announcement_id').eq('member_id', me.id),
      canReview ? supabase.from('ramp_progress').select('member_id', { count: 'exact', head: true }).eq('status', 'submitted').neq('member_id', me.id) : Promise.resolve({ count: 0 }),
      isAdmin && agencyOn
        ? Promise.all([
            supabase.from('ramp_timesheets').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
            supabase.from('ramp_client_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
          ]).then(([x, y]) => (x.count || 0) + (y.count || 0))
        : Promise.resolve(0),
    ]);
    const acked = new Set(((k.data || []) as { announcement_id: string }[]).map((x) => x.announcement_id));
    const forMe = (x: { audience: string; department_id: string | null }) => isAdmin || x.audience === 'everyone'
      || (x.audience === 'trainees' && me.level === 'trainee') || (x.audience === 'employees' && rank <= 5)
      || (x.audience === 'department' && !!me.department_id && x.department_id === me.department_id);
    setNews(((a.data || []) as { id: string; audience: string; department_id: string | null }[]).filter((x) => forMe(x) && !acked.has(x.id)).length);
    setReview((r as { count: number | null }).count || 0);
    setAgency(ag);
  }, [me.id, me.level, me.department_id, rank, canReview, isAdmin, isClient, agencyOn, roles.client?.linked]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 90_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  return { news, review, hours: hrs, agency, refresh };
}

// ───────── shell ─────────

const FULL_BLEED = ['/chat'];

export default function AppShell() {
  const { me, rank, isAdmin, workspace, support } = useMe();
  const loc = useLocation();
  const badges = useBadgeState();
  const { main, mobile } = useNav();

  // A brand-new workspace: its admins set it up first (they can skip).
  if (workspace && !workspace.setup_done && isAdmin && !support) return <Navigate to="/setup" replace />;
  // Team members go through the welcome flow before anything else. Owners and admins can preview it from Home.
  if (!me.onboarded_at && rank >= 3 && rank <= 6) return <Navigate to="/welcome" replace />;

  const full = FULL_BLEED.some((p) => loc.pathname === p || loc.pathname.startsWith(p + '/'));

  return (
    <BadgeCtx.Provider value={badges}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg">Skip to content</a>
      <SupportBanner />
      <div className="min-h-dvh md:flex">
        <Sidebar items={main} />
        <div className="flex-1 min-w-0 flex flex-col">
          <MobileTop />
          <main id="main" className={cx(full
            ? 'shrink-0 overflow-hidden h-[calc(100dvh-56px-64px-env(safe-area-inset-bottom))] md:h-dvh'
            : 'flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 pt-5 md:pt-8 pb-28 md:pb-12')}>
            {!full && <TrialBanner />}
            <Outlet />
          </main>
        </div>
        <BottomNav items={mobile} />
      </div>
      <TourHost />
    </BadgeCtx.Provider>
  );
}

function Badge({ kind }: { kind?: NavItem['badge'] }) {
  const b = useBadges();
  const n = kind ? b[kind] : 0;
  if (!n) return null;
  return <span className="ml-auto min-w-6 h-6 px-1.5 rounded-full bg-amber text-ink text-xs font-bold flex items-center justify-center" aria-label={`${n} new`}>{n > 99 ? '99+' : n}</span>;
}

function Sidebar({ items }: { items: NavItem[] }) {
  const { me, org, isAdmin, isSuper, signOut } = useMe();
  const adminSections = useAdminSections();
  const canSwitch = useCanSwitch();
  const [switching, setSwitching] = useState(false);
  const loc = useLocation();
  const inAdmin = loc.pathname.startsWith('/admin');
  const link = (active: boolean) => cx('flex items-center gap-3 min-h-11 px-3 rounded-xl text-[15px] font-semibold no-underline transition-colors',
    active ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-chip');
  return (
    <aside className="hidden md:flex w-64 shrink-0 h-dvh sticky top-0 flex-col border-r border-line bg-white">
      <div className="flex items-center gap-1 pl-5 pr-2 h-16 shrink-0">
        <Link to="/" className="flex-1 min-w-0 flex items-center gap-3 no-underline text-ink">
          <Logo size={30} />
          <span className="leading-tight min-w-0">
            <span className="block font-display font-bold tracking-[0.08em]">RAMP</span>
            <span className="block text-xs text-muted truncate">{org.name}</span>
          </span>
        </Link>
        {canSwitch && <IconButton icon="chevrons" label="Switch workspace" onClick={() => setSwitching(true)} />}
      </div>
      <WorkspaceSheet open={switching} onClose={() => setSwitching(false)} />
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/' || i.to === '/client'} className={({ isActive }) => link(isActive)}>
            <Icon name={i.icon} size={20} />{i.label}<Badge kind={i.badge} />
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <p className="px-3 pt-5 pb-1.5 text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Admin</p>
            <NavLink to="/admin" end className={({ isActive }) => link(isActive)}><Icon name="shield" size={20} />Admin portal<Badge kind="agency" /></NavLink>
            {isSuper && <NavLink to="/platform" className={({ isActive }) => link(isActive)}><Icon name="building" size={20} />Client accounts</NavLink>}
            {inAdmin && adminSections.map((s) => (
              <NavLink key={s.to} to={s.to} className={({ isActive }) => cx(link(isActive), 'min-h-10 text-sm pl-10')}>{s.label}</NavLink>
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-line p-3 flex items-center gap-2">
        <Link to="/me" className="flex-1 min-w-0 flex items-center gap-3 rounded-xl px-2 py-2 no-underline text-ink hover:bg-chip">
          <Avatar name={displayName(me)} size={36} />
          <span className="min-w-0 leading-tight">
            <span className="block text-sm font-semibold truncate">{displayName(me)}</span>
            <span className="block text-xs text-muted">{LEVELS[me.level].label}</span>
          </span>
        </Link>
        <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:bg-chip cursor-pointer">
          <Icon name="logout" size={20} />
        </button>
      </div>
    </aside>
  );
}

function MobileTop() {
  const { me, org } = useMe();
  const canSwitch = useCanSwitch();
  const [switching, setSwitching] = useState(false);
  return (
    <header className="md:hidden sticky top-0 z-30 h-14 flex items-center gap-1 px-4 bg-bg/95 backdrop-blur border-b border-line">
      <Link to="/" className="flex items-center gap-2.5 no-underline text-ink min-w-0 flex-1">
        <Logo size={28} />
        <span className="font-display font-bold tracking-[0.08em]">RAMP</span>
        <span className="text-xs text-muted truncate">{org.name}</span>
      </Link>
      {canSwitch && <IconButton icon="chevrons" label="Switch workspace" onClick={() => setSwitching(true)} />}
      <WorkspaceSheet open={switching} onClose={() => setSwitching(false)} />
      <Link to="/me" aria-label="Your profile" className="w-11 h-11 flex items-center justify-center -mr-1.5"><Avatar name={displayName(me)} size={32} /></Link>
    </header>
  );
}

function BottomNav({ items }: { items: NavItem[] }) {
  const b = useBadges();
  const moreBadge = b.news + b.review + b.agency;
  return (
    <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line pb-safe">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/' || i.to === '/client'}
            className={({ isActive }) => cx('relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold no-underline', isActive ? 'text-brand-ink' : 'text-muted')}>
            {({ isActive }) => (
              <>
                <span className={cx('w-14 h-8 rounded-full flex items-center justify-center transition-colors', isActive && 'bg-brand-soft')}><Icon name={i.icon} size={22} /></span>
                {i.label}
                {((i.to === '/more' && moreBadge > 0) || (i.badge && b[i.badge] > 0)) && <span className="absolute top-1.5 right-[calc(50%-22px)] w-2.5 h-2.5 rounded-full bg-amber ring-2 ring-white" aria-label="New items" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Wrapper for full-screen focus pages (welcome flow, module player, practice) outside the shell. */
export function FocusFrame({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
