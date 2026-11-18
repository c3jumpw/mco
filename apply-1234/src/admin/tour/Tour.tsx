// The getting-started tour and What's new, shown as slides with screenshots.
// New people get the tour on their first visit; everyone sees What's new once after an update.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { SLIDES, TOUR_UPDATED, imageUrl, type Slide } from './slides';
import { CHANGES, LATEST } from './whatsnew';
import { Button, cx } from '../../ui';

export type TourMode = 'tour' | 'new';
const EVENT = 'a1234:tour';
export const openTour = (mode: TourMode = 'tour') => window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));

// People who signed up before the tour existed get What's new instead of the full tour.
const TOUR_LAUNCH = '2026-11-18';

// Which What's new version each person has seen, on this device: { [email]: version }.
const KEY = 'a1234_tour';
function seenMap(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
export const seenVersion = (email: string) => { const m = seenMap(); return m[email.toLowerCase()] ?? m['*'] ?? 0; };
function markSeen(email: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...seenMap(), [email.toLowerCase()]: LATEST })); } catch { /* private mode */ }
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

function changeSlides(since: number): Slide[] {
  const list = CHANGES.filter((c) => c.version > since);
  return (list.length ? list : CHANGES.slice(0, 3)).map((c) => ({
    id: `v${c.version}`, section: `What’s new · ${fmtDay(c.date)}`, title: c.title, lead: '', points: c.items,
    image: c.image, phone: c.phone, to: c.to, toLabel: c.toLabel,
  }));
}

/** Opens the tour or What's new when it's due, and whenever openTour() is called. */
export function useTour(email: string, role: 'admin' | 'editor', userCreated?: string) {
  const [open, setOpen] = useState<{ mode: TourMode; since: number } | null>(null);
  useEffect(() => {
    if (!email) return;
    const since = seenVersion(email);
    if (since >= LATEST) return;
    const fresh = since === 0 && (!userCreated || userCreated.slice(0, 10) >= TOUR_LAUNCH);
    const t = setTimeout(() => setOpen({ mode: fresh ? 'tour' : 'new', since }), 900);
    return () => clearTimeout(t);
  }, [email, userCreated]);
  useEffect(() => {
    const h = (e: Event) => setOpen({ mode: ((e as CustomEvent).detail as TourMode) || 'tour', since: seenVersion(email) });
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [email]);
  const close = useCallback(() => { markSeen(email); setOpen(null); }, [email]);
  const slides = useMemo(() => {
    if (!open) return [];
    if (open.mode === 'new') return changeSlides(open.since);
    return SLIDES.filter((s) => role === 'admin' || !s.adminOnly).map((s) =>
      role === 'admin' ? s : { ...s, image: s.image === 'admin-overview' || s.image === 'admin-jobs' ? 'editor-jobs' : s.image });
  }, [open, role]);
  const element = open ? <TourDialog key={open.mode} mode={open.mode} slides={slides} onClose={close} onSwitch={(mode) => setOpen({ mode, since: 0 })} /> : null;
  return { element, unseen: !!email && seenVersion(email) < LATEST };
}

function TourDialog({ mode, slides, onClose, onSwitch }: { mode: TourMode; slides: Slide[]; onClose: () => void; onSwitch: (m: TourMode) => void }) {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLDivElement>(null);
  const s = slides[Math.min(i, slides.length - 1)];
  const last = i >= slides.length - 1;
  const go = useCallback((n: number) => setI((cur) => Math.max(0, Math.min(slides.length - 1, cur + n))), [slides.length]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    box.current?.focus();
    return () => { document.body.style.overflow = overflow; prev?.focus?.(); };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [go, onClose]);
  // Start each slide at the top of its picture, and load the next picture early.
  useEffect(() => {
    figure.current?.scrollTo({ top: 0 });
    const next = imageUrl(slides[i + 1]?.image);
    if (next) { const im = new Image(); im.src = next; }
  }, [i, slides]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const sections = useMemo(() => Array.from(new Set(slides.map((x) => x.section))), [slides]);
  const src = imageUrl(s?.image);
  if (!s) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-6">
      <div className="absolute inset-0 bg-ink/55 hidden sm:block" onClick={onClose} aria-hidden />
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={mode === 'tour' ? 'Getting-started tour' : 'What’s new'}
        className="relative flex flex-col w-full h-full sm:h-[min(780px,94dvh)] sm:max-w-6xl bg-card sm:rounded-2xl sm:shadow-2xl overflow-hidden outline-none rise"
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const t = touch.current; touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}>
        <div className="flex items-center gap-3 px-4 sm:px-6 h-14 border-b border-line shrink-0 pt-[env(safe-area-inset-top)] box-content">
          <p className="text-[12px] font-mono text-muted tracking-wide truncate">
            {mode === 'tour' ? 'GETTING STARTED' : 'WHAT’S NEW'} <span className="mx-1">·</span> {i + 1} / {slides.length}
          </p>
          {mode === 'tour' && sections.length > 2 && (
            <select aria-label="Jump to a part of the tour" value={s.section}
              onChange={(e) => setI(slides.findIndex((x) => x.section === e.target.value))}
              className="hidden sm:block ml-2 h-8 rounded-lg border border-line bg-card px-2 text-[13px] text-ink-2">
              {sections.map((sec) => <option key={sec} value={sec}>{sec}</option>)}
            </select>
          )}
          <button onClick={onClose} className="ml-auto h-9 w-9 -mr-2 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-paper-2" aria-label="Close">✕</button>
        </div>
        <div className="flex gap-0.5 px-4 sm:px-6 pt-3 shrink-0" aria-hidden>
          {slides.map((x, n) => (
            <button key={x.id} tabIndex={-1} onClick={() => setI(n)} title={x.title}
              className={cx('h-1 flex-1 rounded-full transition', n < i ? 'bg-ink' : n === i ? 'bg-accent' : 'bg-line hover:bg-muted/40')} />
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden sm:grid sm:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div ref={figure} className={cx('bg-paper-2/70 sm:overflow-y-auto p-4 sm:p-6 flex justify-center', src ? 'max-h-[48dvh] sm:max-h-none overflow-y-auto' : s.graphic ? 'items-center' : 'hidden sm:flex items-center')}>
            {src ? (
              <a href={src} target="_blank" rel="noopener noreferrer" title="Open the full-size picture" className={cx('block h-max', s.phone ? 'w-[230px] sm:w-[280px]' : 'w-full')}>
                <img src={src} alt={s.title} className={cx('block w-full h-auto border border-line bg-card shadow-sm', s.phone ? 'rounded-[22px]' : 'rounded-xl')} />
              </a>
            ) : s.graphic === 'flow' ? <FlowGraphic /> : <span className="font-display text-6xl text-muted/40">apply1234</span>}
          </div>
          <div className="p-5 sm:p-8 sm:overflow-y-auto">
            <p className="text-[12px] font-medium text-accent uppercase tracking-[.12em]">{s.section}</p>
            <h2 className="font-display text-[34px] sm:text-[44px] leading-[1.02] mt-2">{s.title}</h2>
            {s.lead && <p className="text-[16px] text-ink-2 leading-relaxed mt-3">{s.lead}</p>}
            {s.points && s.points.length > 0 && (
              <ul className="mt-4 space-y-2.5">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-[15px] leading-snug text-ink-2">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent shrink-0" />{p}
                  </li>
                ))}
              </ul>
            )}
            {s.to && (
              <button onClick={() => { onClose(); nav(s.to!); }} className="mt-5 text-sm font-medium underline underline-offset-4 decoration-accent hover:text-accent">
                {s.toLabel || 'Go to this page'} →
              </button>
            )}
            {last && mode === 'tour' && <p className="text-xs text-muted mt-6">Tour updated {fmtDay(TOUR_UPDATED)}.</p>}
            {last && mode === 'new' && (
              <button onClick={() => { setI(0); onSwitch('tour'); }} className="block mt-5 text-sm text-muted underline underline-offset-4 hover:text-ink">
                Take the full getting-started tour
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-t border-line shrink-0 pb-[max(12px,env(safe-area-inset-bottom))]">
          {i === 0
            ? <Button variant="ghost" onClick={onClose}>{mode === 'tour' ? 'Skip the tour' : 'Close'}</Button>
            : <Button variant="ghost" onClick={() => go(-1)}>← Back</Button>}
          <span className="hidden sm:block text-xs text-muted ml-1">Use ← → to move, Esc to close</span>
          <Button variant={last ? 'accent' : 'primary'} className="ml-auto min-w-28" onClick={() => (last ? onClose() : go(1))}>
            {last ? (mode === 'tour' ? 'Start using apply1234' : 'Done') : 'Next →'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** How apply1234 works, in three steps. */
function FlowGraphic() {
  const steps = [
    { n: '1', who: 'You', title: 'Post a job', text: 'Your notes become a posting with the application link hidden in pieces.' },
    { n: '2', who: 'Candidates', title: 'Find the link, do the activity', text: 'Short steps built for the role: written answers, scenarios, work samples, video.', accent: true },
    { n: '3', who: 'You and your team', title: 'Review and hire', text: 'Answers, auto-checks and scores in one place, then interview.' },
  ];
  return (
    <ol className="w-full max-w-md space-y-3 py-2">
      {steps.map((x, i) => (
        <li key={x.n} className="relative">
          <div className={cx('flex gap-4 rounded-2xl border p-4 sm:p-5 bg-card', x.accent ? 'border-accent/40 bg-accent-soft/50' : 'border-line')}>
            <span className={cx('grid place-items-center h-9 w-9 shrink-0 rounded-full font-mono text-sm', x.accent ? 'bg-accent text-white' : 'bg-ink text-white')}>{x.n}</span>
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-wide text-muted">{x.who}</p>
              <p className="font-semibold text-[16px] mt-0.5">{x.title}</p>
              <p className="text-[13px] text-ink-2 leading-snug mt-1">{x.text}</p>
            </div>
          </div>
          {i < steps.length - 1 && <span aria-hidden className="block mx-auto h-3 w-px bg-line" />}
        </li>
      ))}
    </ol>
  );
}
