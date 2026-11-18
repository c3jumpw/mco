// Getting-started tour and What's new: a slide show with a screenshot on every slide.
// TourHost lives in the app shell. It opens the right tour once for each person, offers What's new after updates,
// and opens any tour on request (startTour), for example from the Guide or More pages.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMe } from '../lib/session';
import { cx } from '../lib/util';
import { Button, Icon } from '../ui';
import { RELEASES, TOURS, TOUR_VERSION, slidesFor, tourRoleFor, type TourCtx, type TourRole, type TourSlide } from './tours';

const EVENT = 'ramp:tour';

/** Open a tour from anywhere: the person's own tour by default, or a given one. */
export function startTour(role?: TourRole) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: role || null }));
}

export function useTourCtx(): TourCtx {
  const { rank, isAdmin, isClient, isSuper, agencyOn, roles, org } = useMe();
  return useMemo(() => ({
    rank, isAdmin, isClient, isSuper, agencyOn, linkedClient: !!roles.client?.linked,
    work: !!roles.work, coaching: roles.coaching > 0, chat: org?.flags?.chat !== false, tasks: org?.flags?.tasks !== false,
  }), [rank, isAdmin, isClient, isSuper, agencyOn, roles, org]);
}

/** Tours this person can replay, their own first. */
export function useAvailableTours() {
  const c = useTourCtx();
  const mine = tourRoleFor(c);
  const order: TourRole[] = [mine];
  if (c.isAdmin) order.push('coach', 'member');
  else if (c.rank <= 4) order.push('member');
  if (c.isSuper) order.push('platform');
  if (c.isAdmin && c.agencyOn) order.push('client');
  return order.filter((r, i) => order.indexOf(r) === i).map((r) => ({ ...TOURS.find((t) => t.role === r)!, mine: r === mine }))
    .filter((t) => slidesFor(t.role, c).length);
}

interface Seen { v: number; roles: TourRole[]; release: string | null }
const keyFor = (memberId: string) => `ramp-tour:${memberId}`;
function readSeen(memberId: string): Seen | null {
  try { const raw = localStorage.getItem(keyFor(memberId)); return raw ? JSON.parse(raw) as Seen : null; } catch { return null; }
}
function writeSeen(memberId: string, s: Seen) {
  try { localStorage.setItem(keyFor(memberId), JSON.stringify(s)); } catch { /* private mode: they'll see it again next time */ }
}

type Open = { title: string; kicker: string; slides: TourSlide[]; after?: () => void } | null;

export function TourHost() {
  const { me } = useMe();
  const c = useTourCtx();
  const loc = useLocation();
  const [open, setOpen] = useState<Open>(null);
  const role = tourRoleFor(c);

  const tourFor = useCallback((r: TourRole): Open => {
    const t = TOURS.find((x) => x.role === r);
    const slides = slidesFor(r, c);
    return t && slides.length ? { title: t.title, kicker: t.blurb, slides } : null;
  }, [c]);

  // Once per person: their own tour (then the platform tour for platform admins), or What's new after an update.
  useEffect(() => {
    if (!me?.id || open || loc.pathname.startsWith('/guide')) return;
    try { if (localStorage.getItem('ramp-tour-off') === '1') return; } catch { /* ignore */ }
    const seen = readSeen(me.id);
    const latest = RELEASES[0]?.id || null;
    const mark = (patch: Partial<Seen>) => writeSeen(me.id, { v: TOUR_VERSION, roles: seen?.roles || [], release: seen?.release ?? null, ...patch });
    if (!seen || seen.v < TOUR_VERSION || !seen.roles.includes(role)) {
      const first = tourFor(role);
      if (!first) return;
      const roles = [...new Set([...(seen?.roles || []), role])];
      mark({ roles, release: latest });       // a first tour already covers what's new
      const platform = c.isSuper && !roles.includes('platform') ? tourFor('platform') : null;
      setOpen({ ...first, after: platform ? () => { mark({ roles: [...roles, 'platform'], release: latest }); setOpen(platform); } : undefined });
      return;
    }
    const rel = RELEASES[0];
    if (rel && seen.release !== rel.id) {
      mark({ release: rel.id });
      const applies = rel.roles.includes(role) || (c.isSuper && rel.roles.includes('platform'));
      const slides = rel.slides.filter((s) => !s.when || s.when(c));
      if (applies && slides.length) setOpen({ title: rel.title, kicker: 'What’s new', slides });
    }
  }, [me?.id, role, c, open, tourFor, loc.pathname]);

  // Replay on request.
  useEffect(() => {
    const on = (e: Event) => {
      const r = ((e as CustomEvent).detail as TourRole | null) || role;
      const t = tourFor(r);
      if (t) setOpen(t);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [role, tourFor]);

  if (!open) return null;
  return <TourViewer key={open.title + open.slides[0]?.id} title={open.title} kicker={open.kicker} slides={open.slides}
    onClose={() => { const next = open.after; setOpen(null); next?.(); }} />;
}

export function TourViewer({ title, kicker, slides, onClose }: { title: string; kicker: string; slides: TourSlide[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const s = slides[i]!;
  const last = i === slides.length - 1;
  const go = useCallback((d: number) => setI((x) => Math.min(slides.length - 1, Math.max(0, x + d))), [slides.length]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [go]);

  // Swipe between slides on touch screens.
  const start = useRef<number | null>(null);
  const down = (e: RPointerEvent) => { if (e.pointerType !== 'mouse') start.current = e.clientX; };
  const up = (e: RPointerEvent) => {
    if (start.current == null) return;
    const dx = e.clientX - start.current;
    start.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-ink/55 md:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${title}: ${s.title}`}
        className="relative w-full md:max-w-[760px] max-h-[100dvh] md:max-h-[92dvh] bg-white md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden outline-none rise">
        <div className="flex items-center gap-3 px-5 pt-4 pb-2">
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-brand-ink truncate">{kicker}</span>
            <span className="block text-sm font-semibold text-muted truncate">{title} · {i + 1} of {slides.length}</span>
          </span>
          <button type="button" onClick={onClose} className="min-h-11 px-3 -mr-2 rounded-xl text-sm font-semibold text-muted hover:bg-chip cursor-pointer">
            {last ? 'Close' : 'Skip'}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto" onPointerDown={down} onPointerUp={up}>
          <div className={cx('mx-5 rounded-2xl border border-line bg-bg overflow-hidden flex items-start justify-center',
            s.device === 'phone' ? 'py-4' : '')}>
            <img key={s.image} src={`/guide-media/${s.image}`} alt="" loading="eager" draggable={false}
              className={cx('block select-none', s.device === 'phone'
                ? 'w-[min(240px,62vw)] rounded-[22px] border border-line shadow-sm max-h-[44dvh] md:max-h-[420px] object-cover object-top'
                : 'w-full max-h-[40dvh] md:max-h-[430px] object-cover object-top')} />
          </div>
          <div className="px-5 pt-4 pb-2" aria-live="polite">
            <h2 className="font-display text-[22px] md:text-2xl font-bold leading-tight">{s.title}</h2>
            <p className="text-[15px] text-ink-2 leading-relaxed mt-1.5">{s.text}</p>
            {s.link && (
              <button type="button" onClick={() => { onClose(); navigate(s.link!.to); }}
                className="mt-2 inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-ink cursor-pointer">
                {s.link.label}<Icon name="chevronRight" size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] flex items-center gap-3 border-t border-line">
          <div className="flex-1 flex flex-wrap gap-1.5 py-3" role="tablist" aria-label="Slides">
            {slides.map((x, j) => (
              <button key={x.id} type="button" role="tab" aria-selected={j === i} aria-label={`Slide ${j + 1}: ${x.title}`} onClick={() => setI(j)}
                className="w-6 h-6 -m-1.5 flex items-center justify-center cursor-pointer">
                <span className={cx('block rounded-full transition-all', j === i ? 'w-4 h-2 bg-brand' : 'w-2 h-2 bg-line')} />
              </button>
            ))}
          </div>
          {i > 0 && <Button onClick={() => go(-1)} icon="chevronLeft" aria-label="Previous slide"><span className="hidden sm:inline">Back</span></Button>}
          {last
            ? <Button variant="primary" onClick={onClose}>Done</Button>
            : <Button variant="primary" onClick={() => go(1)} iconRight="chevronRight">Next</Button>}
        </div>
      </div>
    </div>
  );
}
