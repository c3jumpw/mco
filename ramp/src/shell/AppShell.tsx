import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useMe } from '../lib/session';
import { LEVELS, cx, displayName } from '../lib/util';
import { Avatar, Icon, Logo } from '../ui';

// ───────── navigation model (shared with More and the admin hub) ─────────

export interface NavItem { to: string; label: string; icon: string; badge?: 'news' | 'review' }

export function useNav(): { main: NavItem[]; mobile: NavItem[] } {
  const { org, rank, isGuest } = useMe();
  const flags = org.flags || { chat: true, tasks: true, certificates: false, record_ip: true };
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
    { to: '/training', label: 'Training', icon: 'book' },
    ...(flags.tasks ? [{ to: '/tasks', label: 'Tasks', icon: 'tasks' }] : []),
    { to: '/notes', label: 'Notebook', icon: 'notes' },
    ...(flags.chat ? [{ to: '/chat', label: 'Chat', icon: 'chat' }] : []),
    { to: '/resources', label: 'Resources', icon: 'folder' },
    { to: '/news', label: 'News', icon: 'megaphone', badge: 'news' as const },
    ...(rank <= 4 ? [{ to: '/team', label: rank <= 2 ? 'Team progress' : 'My team', icon: 'users', badge: 'review' as const }] : []),
    { to: '/guide', label: 'Guide', icon: 'lifebuoy' },
  ];
  const pick = (to: string) => main.find((m) => m.to === to);
  const mobile = [pick('/'), pick('/training'), pick('/tasks') || pick('/notes'), pick('/chat') || pick('/resources'),
    { to: '/more', label: 'More', icon: 'more' }].filter(Boolean) as NavItem[];
  return { main, mobile };
}

export interface AdminSection { to: string; label: string; icon: string; desc: string; group: 'Set up' | 'People' | 'Communicate' | 'System'; ownerOnly?: boolean }
export const ADMIN_SECTIONS: AdminSection[] = [
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
  { to: '/admin/system', label: 'System and audit', icon: 'shield', desc: 'Feature switches, IP recording and the audit log', group: 'System' },
  { to: '/guide?view=admin', label: 'Admin guide', icon: 'lifebuoy', desc: 'How every admin page and setting works, with screenshots', group: 'System' },
];

// ───────── badges (unread news, work waiting for review) ─────────

interface Badges { news: number; review: number; refresh: () => void }
const BadgeCtx = createContext<Badges>({ news: 0, review: 0, refresh: () => {} });
export const useBadges = () => useContext(BadgeCtx);

function useBadgeState(): Badges {
  const { me, rank, canReview, isAdmin } = useMe();
  const [news, setNews] = useState(0);
  const [review, setReview] = useState(0);
  const refresh = useCallback(async () => {
    if (rank > 6) return;
    const [a, k, r] = await Promise.all([
      supabase.from('ramp_announcements').select('id, audience, department_id').eq('require_ack', true),
      supabase.from('ramp_acks').select('announcement_id').eq('member_id', me.id),
      canReview ? supabase.from('ramp_progress').select('member_id', { count: 'exact', head: true }).eq('status', 'submitted').neq('member_id', me.id) : Promise.resolve({ count: 0 }),
    ]);
    const acked = new Set(((k.data || []) as { announcement_id: string }[]).map((x) => x.announcement_id));
    const forMe = (x: { audience: string; department_id: string | null }) => isAdmin || x.audience === 'everyone'
      || (x.audience === 'trainees' && me.level === 'trainee') || (x.audience === 'employees' && rank <= 5)
      || (x.audience === 'department' && !!me.department_id && x.department_id === me.department_id);
    setNews(((a.data || []) as { id: string; audience: string; department_id: string | null }[]).filter((x) => forMe(x) && !acked.has(x.id)).length);
    setReview((r as { count: number | null }).count || 0);
  }, [me.id, me.level, me.department_id, rank, canReview, isAdmin]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 90_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  return { news, review, refresh };
}

// ───────── shell ─────────

const FULL_BLEED = ['/chat'];

export default function AppShell() {
  const { me, rank } = useMe();
  const loc = useLocation();
  const badges = useBadgeState();
  const { main, mobile } = useNav();

  // Team members go through the welcome flow before anything else. Owners and admins can preview it from Home.
  if (!me.onboarded_at && rank >= 3 && rank <= 6) return <Navigate to="/welcome" replace />;

  const full = FULL_BLEED.some((p) => loc.pathname === p || loc.pathname.startsWith(p + '/'));

  return (
    <BadgeCtx.Provider value={badges}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg">Skip to content</a>
      <div className="min-h-dvh md:flex">
        <Sidebar items={main} />
        <div className="flex-1 min-w-0 flex flex-col">
          <MobileTop />
          <main id="main" className={cx(full
            ? 'shrink-0 overflow-hidden h-[calc(100dvh-56px-64px-env(safe-area-inset-bottom))] md:h-dvh'
            : 'flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 pt-5 md:pt-8 pb-28 md:pb-12')}>
            <Outlet />
          </main>
        </div>
        <BottomNav items={mobile} />
      </div>
    </BadgeCtx.Provider>
  );
}

function Badge({ kind }: { kind?: 'news' | 'review' }) {
  const b = useBadges();
  const n = kind ? b[kind] : 0;
  if (!n) return null;
  return <span className="ml-auto min-w-6 h-6 px-1.5 rounded-full bg-amber text-ink text-xs font-bold flex items-center justify-center" aria-label={`${n} new`}>{n > 99 ? '99+' : n}</span>;
}

function Sidebar({ items }: { items: NavItem[] }) {
  const { me, org, rank, isAdmin, signOut } = useMe();
  const loc = useLocation();
  const inAdmin = loc.pathname.startsWith('/admin');
  const link = (active: boolean) => cx('flex items-center gap-3 min-h-11 px-3 rounded-xl text-[15px] font-semibold no-underline transition-colors',
    active ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-chip');
  return (
    <aside className="hidden md:flex w-64 shrink-0 h-dvh sticky top-0 flex-col border-r border-line bg-white">
      <Link to="/" className="flex items-center gap-3 px-5 h-16 no-underline text-ink shrink-0">
        <Logo size={30} />
        <span className="leading-tight min-w-0">
          <span className="block font-display font-bold tracking-[0.08em]">RAMP</span>
          <span className="block text-xs text-muted truncate">{org.name}</span>
        </span>
      </Link>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => link(isActive)}>
            <Icon name={i.icon} size={20} />{i.label}<Badge kind={i.badge} />
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <p className="px-3 pt-5 pb-1.5 text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Admin</p>
            <NavLink to="/admin" end className={({ isActive }) => link(isActive)}><Icon name="shield" size={20} />Admin portal</NavLink>
            {inAdmin && ADMIN_SECTIONS.filter((s) => !s.ownerOnly || rank === 1).map((s) => (
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
  return (
    <header className="md:hidden sticky top-0 z-30 h-14 flex items-center gap-3 px-4 bg-bg/95 backdrop-blur border-b border-line">
      <Link to="/" className="flex items-center gap-2.5 no-underline text-ink min-w-0 flex-1">
        <Logo size={28} />
        <span className="font-display font-bold tracking-[0.08em]">RAMP</span>
        <span className="text-xs text-muted truncate">{org.name}</span>
      </Link>
      <Link to="/me" aria-label="Your profile" className="w-11 h-11 flex items-center justify-center -mr-1.5"><Avatar name={displayName(me)} size={32} /></Link>
    </header>
  );
}

function BottomNav({ items }: { items: NavItem[] }) {
  const b = useBadges();
  const moreBadge = b.news + b.review;
  return (
    <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line pb-safe">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'}
            className={({ isActive }) => cx('relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold no-underline', isActive ? 'text-brand-ink' : 'text-muted')}>
            {({ isActive }) => (
              <>
                <span className={cx('w-14 h-8 rounded-full flex items-center justify-center transition-colors', isActive && 'bg-brand-soft')}><Icon name={i.icon} size={22} /></span>
                {i.label}
                {i.to === '/more' && moreBadge > 0 && <span className="absolute top-1.5 right-[calc(50%-22px)] w-2.5 h-2.5 rounded-full bg-amber ring-2 ring-white" aria-label="New items" />}
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
