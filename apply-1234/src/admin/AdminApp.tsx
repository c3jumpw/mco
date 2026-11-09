import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { supabase, whenIdle } from '../lib/supabase';
import { store } from '../lib/util';
import { Button, Field, Input, Loading, Wordmark, cx } from '../ui';
import Jobs from './Jobs';
import JobEditor from './JobEditor';
import Candidates from './Candidates';
import CandidateDetail from './CandidateDetail';
import ActivityLog from './ActivityLog';
import Settings from './Settings';
import NewJobWizard from './NewJobWizard';
import Inbox, { INBOX_EVENT } from './Inbox';
import Guide from './Guide';
import { unreadMessages } from './data';
import { BEFORE_REFRESH } from './refresh';

type Gate = 'loading' | 'signed_out' | 'not_admin' | 'admin';

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [gate, setGate] = useState<Gate>('loading');

  useEffect(() => {
    document.title = 'apply1234 · admin';
    if (!document.querySelector('link[rel="manifest"]')) {
      const l = document.createElement('link');
      l.rel = 'manifest';
      l.href = '/manifest.webmanifest';
      document.head.appendChild(l);
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) {
      supabase.auth.getSession().then(({ data }) => { if (!data.session) setGate('signed_out'); });
      return;
    }
    supabase.rpc('hiring_claim_admin').then(({ data }) => {
      if (data) { store('a1234_admin', '1'); setGate('admin'); } else setGate('not_admin');
    });
  }, [session]);

  if (gate === 'loading') return <Loading />;
  if (gate === 'signed_out') return <Login />;
  if (gate === 'not_admin') return <NotAdmin email={session?.user.email} />;
  return <Shell email={session?.user.email || ''} />;
}

const NAV = [
  { to: '/admin', label: 'Jobs', icon: 'M4 7h16M4 12h16M4 17h10', end: true },
  { to: '/admin/candidates', label: 'Candidates', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.75' },
  { to: '/admin/inbox', label: 'Inbox', icon: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6z' },
  { to: '/admin/activity', label: 'Activity', icon: 'M3 12h4l3 8 4-16 3 8h4' },
  { to: '/admin/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z' },
];

function Icon({ d, className }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx('h-5 w-5', className)} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

function useUnread() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => unreadMessages().then(setN).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener(INBOX_EVENT, load);
    window.addEventListener('focus', load);
    return () => { clearInterval(t); window.removeEventListener(INBOX_EVENT, load); window.removeEventListener('focus', load); };
  }, []);
  return n;
}

function Badge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return <span className={cx('inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-semibold leading-none', className)}>{n > 99 ? '99+' : n}</span>;
}

const REFRESH_ICON = 'M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reloads the current page's data: pending edits are saved first, then the page is rebuilt and refetches. */
function useRefresh() {
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    const started = Date.now();
    window.dispatchEvent(new Event(BEFORE_REFRESH));
    await wait(30);
    await whenIdle(4000);
    setNonce((n) => n + 1);
    window.dispatchEvent(new Event(INBOX_EVENT));
    await wait(150);
    await whenIdle(10000);
    const left = 650 - (Date.now() - started);
    if (left > 0) await wait(left);
    setRefreshing(false);
    busy.current = false;
  }, []);
  return { nonce, refreshing, refresh };
}

const PULL_TRIGGER = 64;

/** Phone gesture: drag down from the top of the page to refresh. */
function PullToRefresh({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  const [pull, setPull] = useState(0);
  const [fromPull, setFromPull] = useState(false);
  const pullRef = useRef(0);
  const start = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;

  useEffect(() => { if (!refreshing) setFromPull(false); }, [refreshing]);

  useEffect(() => {
    if (!('ontouchstart' in window)) return;
    // Our own gesture replaces the browser's pull-to-reload, which would reload the whole app.
    const html = document.documentElement;
    const before = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'none';
    const set = (v: number) => { pullRef.current = v; setPull(v); };
    const onStart = (e: TouchEvent) => {
      start.current = null;
      if (refreshingRef.current || e.touches.length !== 1 || window.scrollY > 0) return;
      const t = e.target as Element | null;
      if (t?.closest?.('input, textarea, select, [contenteditable], [data-no-pull]')) return;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: false };
    };
    const onMove = (e: TouchEvent) => {
      const s = start.current;
      if (!s) return;
      const dx = e.touches[0].clientX - s.x;
      const dy = e.touches[0].clientY - s.y;
      if (!s.active) {
        if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.5 && window.scrollY <= 0) s.active = true;
        else if (dy < -4 || Math.abs(dx) > 12) { start.current = null; return; }
        else return;
      }
      set(Math.max(0, Math.min(110, (dy - 8) * 0.5)));
    };
    const onEnd = () => {
      const s = start.current;
      start.current = null;
      if (s?.active && pullRef.current >= PULL_TRIGGER) { setFromPull(true); onRefresh(); }
      set(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      html.style.overscrollBehaviorY = before;
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh]);

  const spinning = refreshing && fromPull;
  if (!pull && !spinning) return null;
  const ready = pull >= PULL_TRIGGER;
  const y = spinning ? 18 : pull - 22;
  return (
    <div className="fixed left-1/2 top-14 z-30 pointer-events-none" style={{ transform: `translate(-50%, ${y}px)`, transition: pull ? 'none' : 'transform .2s' }}
      role="status" aria-live="polite">
      <div className={cx('flex items-center gap-2 h-9 pl-2 pr-3 rounded-full bg-card border border-line shadow-lg shadow-ink/10 text-[13px]', ready || spinning ? 'text-ink' : 'text-muted')}
        style={{ opacity: spinning ? 1 : Math.min(1, pull / PULL_TRIGGER) }}>
        <span className="inline-grid" style={spinning ? undefined : { transform: `rotate(${pull * 3}deg)` }}>
          <Icon d={REFRESH_ICON} className={cx('h-[18px] w-[18px]', spinning && 'animate-spin', (ready || spinning) && 'text-accent')} />
        </span>
        <span>{spinning ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}</span>
      </div>
    </div>
  );
}

function Shell({ email }: { email: string }) {
  const loc = useLocation();
  const unread = useUnread();
  const { nonce, refreshing, refresh } = useRefresh();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="min-h-dvh pb-24 sm:pb-10">
      <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
          <NavLink to="/admin" className="flex items-baseline gap-2">
            <Wordmark className="text-[15px]" />
            <span className="text-[12px] text-muted">admin</span>
          </NavLink>
          <nav className="hidden sm:flex items-center gap-1 ml-2">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => cx('px-3 py-1.5 rounded-lg text-sm transition inline-flex items-center gap-1.5', isActive ? 'bg-card border border-line font-medium' : 'text-muted hover:text-ink')}>
                {n.label}
                {n.to === '/admin/inbox' && <Badge n={unread} />}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh data" title="Refresh data"
            className="ml-auto -mr-3 grid place-items-center h-9 w-9 rounded-lg text-muted hover:text-ink hover:bg-card border border-transparent hover:border-line transition disabled:opacity-100">
            <Icon d={REFRESH_ICON} className={cx('h-[18px] w-[18px]', refreshing && 'animate-spin text-accent')} />
          </button>
          <NavLink to="/admin/guide"
            className={({ isActive }) => cx('inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition', isActive ? 'bg-card border border-line font-medium' : 'text-muted hover:text-ink')}>
            <span className="grid place-items-center h-5 w-5 rounded-full bg-ink text-white text-[11px] font-semibold">?</span>Guide
          </NavLink>
          <span className="text-[12px] text-muted truncate max-w-[30vw] hidden md:block">{email}</span>
        </div>
      </header>
      <PullToRefresh onRefresh={refresh} refreshing={refreshing} />
      <main key={nonce} className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        <Routes>
          <Route index element={<Jobs />} />
          <Route path="new" element={<NewJobWizard />} />
          <Route path="jobs/:id" element={<JobEditor />} />
          <Route path="candidates" element={<Candidates />} />
          <Route path="candidates/:id" element={<CandidateDetail />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="guide" element={<Guide />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="settings" element={<Settings email={email} />} />
          <Route path="*" element={<Jobs />} />
        </Routes>
      </main>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-card/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2.5 text-[11px]', isActive ? 'text-ink font-medium' : 'text-muted')}>
              <Icon d={n.icon} />
              {n.to === '/admin/inbox' && <Badge n={unread} className="absolute top-1 left-1/2 ml-1.5" />}
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMsg({ tone: 'bad', text: /confirm/i.test(error.message) ? 'Confirm your email first: open the link we sent you, then sign in here.' : error.message });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { emailRedirectTo: `${window.location.origin}/admin` },
      });
      if (error) setMsg({ tone: 'bad', text: error.message });
      else if (!data.session) {
        setMsg({ tone: 'good', text: 'Check your inbox and click the confirmation link. If the page it opens looks unrelated, that’s fine: your email is still confirmed. Then come back here and sign in.' });
        setMode('in');
      }
    }
    setBusy(false);
  };

  return (
    <main className="min-h-dvh flex items-center justify-center px-5">
      <form onSubmit={submit} className="w-full max-w-sm rise">
        <Wordmark className="text-lg" />
        <h1 className="font-display text-5xl leading-none mt-6">{mode === 'in' ? 'Sign in.' : 'Create your login.'}</h1>
        <p className="text-sm text-muted mt-3 leading-relaxed">
          {mode === 'in' ? 'Hiring dashboard for apply1234.' : 'Only emails on the admin list get access. Use the email you were invited with.'}
        </p>
        <div className="mt-8 space-y-4">
          <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password" hint={mode === 'up' ? 'At least 8 characters.' : undefined}>
            <Input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={mode === 'up' ? 8 : undefined}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        {msg && <p className={cx('mt-5 rounded-xl text-sm px-4 py-3 leading-relaxed', msg.tone === 'good' ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>{msg.text}</p>}
        <Button variant="primary" size="lg" className="w-full mt-6" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create login'}</Button>
        <button type="button" className="mt-4 text-sm text-muted underline underline-offset-4 w-full"
          onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
          {mode === 'in' ? 'First time? Create your login' : 'Already have a login? Sign in'}
        </button>
      </form>
    </main>
  );
}

function NotAdmin({ email }: { email?: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-5 text-center">
      <div className="max-w-sm">
        <h1 className="font-display text-4xl">No access yet.</h1>
        <p className="text-sm text-muted mt-3 leading-relaxed">
          {email} isn't on the admin list. Ask an existing admin to add it in Settings, then sign in again.
        </p>
        <Button className="mt-6" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    </main>
  );
}
