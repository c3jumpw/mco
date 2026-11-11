import { useCallback, useEffect, useRef, useState } from 'react';
import { whenIdle } from '../lib/supabase';
import { cx } from '../ui';
import { BEFORE_REFRESH } from './refresh';

/** Lets the inbox badge reload; also sent on every manual refresh. */
export const INBOX_EVENT = 'a1234-inbox-changed';

export function Icon({ d, className }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={cx('h-5 w-5', className)} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export const REFRESH_ICON = 'M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reloads the current page's data: pending edits are saved first, then the page is rebuilt and refetches. */
export function useRefresh() {
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
export function PullToRefresh({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
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
