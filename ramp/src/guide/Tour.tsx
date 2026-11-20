// Getting-started tour and What's new: slide shows with a screenshot on every slide, and a summary of changes.
// TourHost lives in the app shell. It opens the right tour once for each person, then after every update shows
// them, once, the changes from the change log that apply to them (src/changelog). What each person has seen is
// kept in this browser and in their RAMP account (ramp_tour_state), so it doesn't repeat on another device.
// Tours and What's new can be opened on request too (startTour, openWhatsNew), from the Guide, More and Change log.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useMe } from '../lib/session';
import { cx } from '../lib/util';
import { Button, Icon } from '../ui';
import { ENTRIES, LATEST, appliesTo, audienceOf, dateText, entryIndex, inAdminLog, newerThan, toTourSlide, type Change, type Entry } from '../changelog/changelog';
import { TypeTag } from '../changelog/ui';
import { TOURS, TOUR_VERSION, slidesFor, tourRoleFor, type TourCtx, type TourRole, type TourSlide } from './tours';

const EVENT = 'ramp:tour';
const NEWS_EVENT = 'ramp:whatsnew';

/**
 * Open What's new: recent updates that apply to this person, the given change log entries (Change log page), or
 * { since } to show what someone sees at sign-in after that update (used for the Guide's screenshot).
 */
export function openWhatsNew(what?: string[] | { since: string }) {
  window.dispatchEvent(new CustomEvent(NEWS_EVENT, { detail: what || null }));
}

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
function parseSeen(x: unknown): Seen | null {
  const o = x as Partial<Seen> | null;
  if (!o || typeof o !== 'object' || typeof o.v !== 'number') return null;
  return { v: o.v, roles: Array.isArray(o.roles) ? o.roles : [], release: typeof o.release === 'string' ? o.release : null };
}
function readSeen(memberId: string): Seen | null {
  try { const raw = localStorage.getItem(keyFor(memberId)); return raw ? parseSeen(JSON.parse(raw)) : null; } catch { return null; }
}
/** The newer of what this browser and the account remember. */
function mergeSeen(a: Seen | null, b: Seen | null): Seen | null {
  if (!a || !b) return a || b;
  const ia = entryIndex(a.release), ib = entryIndex(b.release);
  const release = ia === -1 ? b.release : ib === -1 ? a.release : ia <= ib ? a.release : b.release;
  return { v: Math.max(a.v, b.v), roles: [...new Set([...a.roles, ...b.roles])], release };
}
function saveSeen(memberId: string, s: Seen, remote: Seen | null) {
  try { localStorage.setItem(keyFor(memberId), JSON.stringify(s)); } catch { /* private mode: the account copy still works */ }
  if (JSON.stringify(s) !== JSON.stringify(remote)) {
    supabase.rpc('ramp_save_tour_state', { p_tour: s }).then(() => {}, () => {});
  }
}
function tourOff() {
  try { return localStorage.getItem('ramp-tour-off') === '1'; } catch { return false; }
}

// ───────── What's new: a summary slide of changes, then screenshot slides ─────────

export interface SummaryGroup { id: string; version: string; date: string; title: string; items: Change[] }
export interface SummarySlide { id: string; kind: 'summary'; title: string; text: string; groups: SummaryGroup[] }
export type ViewSlide = TourSlide | SummarySlide;
const isSummary = (s: ViewSlide): s is SummarySlide => 'kind' in s && s.kind === 'summary';

type NoteMode = 'update' | 'recent' | 'entry';

/** What's new for a set of entries: the changes that apply, then the screenshots that go with them. */
function buildNote(entries: Entry[], c: TourCtx, mode: NoteMode): Open {
  const aud = audienceOf(c);
  const pick = (x: Change | { who?: Change['who']; requires?: Change['requires'] }) => (mode === 'entry' ? inAdminLog(x, c) : appliesTo(x, c, aud));
  const groups = entries.map((e) => ({ id: e.id, version: e.version, date: e.date, title: e.title, items: e.changes.filter(pick) }))
    .filter((g) => g.items.length);
  const shots = entries.flatMap((e) => (e.slides || []).filter(pick).map(toTourSlide));
  const one = entries.length === 1 ? entries[0]! : null;
  const summary: SummarySlide = {
    id: 'summary', kind: 'summary', groups,
    title: mode === 'entry' && one ? one.title : groups.length ? (mode === 'update' ? 'What’s new for you' : 'Recent updates') : 'You’re up to date',
    text: mode === 'entry' && one ? one.summary
      : !groups.length ? 'Nothing has changed for you lately. Updates that affect you show up here.'
      : mode === 'update' ? (groups.length === 1 ? `RAMP was updated on ${dateText(groups[0]!.date, { month: 'long', day: 'numeric' })}. Here’s what changed for you.` : `${groups.length} updates since you last signed in. Here’s what changed for you.`)
      : 'The latest changes that affect you, newest first.',
  };
  const top = groups[0] || (one ? { version: one.version } : { version: LATEST.version });
  return { title: `RAMP ${top.version}`, kicker: 'What’s new', slides: [summary, ...shots] };
}

type Open = { title: string; kicker: string; slides: ViewSlide[]; after?: () => void } | null;

export function TourHost() {
  const { me } = useMe();
  const c = useTourCtx();
  const loc = useLocation();
  const [open, setOpen] = useState<Open>(null);
  // What the account remembers: undefined while loading, null if nothing (or the lookup failed).
  const [remote, setRemote] = useState<Seen | null | undefined>(undefined);
  const role = tourRoleFor(c);

  const tourFor = useCallback((r: TourRole): Open => {
    const t = TOURS.find((x) => x.role === r);
    const slides = slidesFor(r, c);
    return t && slides.length ? { title: t.title, kicker: t.blurb, slides } : null;
  }, [c]);

  useEffect(() => {
    if (!me?.id) return;
    let live = true;
    setRemote(undefined);
    const give = (v: Seen | null) => { if (live) setRemote((r) => (r === undefined ? v : r)); };
    const timer = setTimeout(() => give(null), 3000);
    supabase.rpc('ramp_tour_state').then(({ data, error }) => give(error ? null : parseSeen(data)), () => give(null));
    return () => { live = false; clearTimeout(timer); };
  }, [me?.id]);

  // Once per person: their own tour (then the platform tour for platform admins), or What's new after an update.
  useEffect(() => {
    if (!me?.id || remote === undefined || open || loc.pathname.startsWith('/guide') || tourOff()) return;
    const seen = mergeSeen(readSeen(me.id), remote);
    const latest = LATEST.id;
    const save = (patch: Partial<Seen>) => saveSeen(me.id, { v: TOUR_VERSION, roles: seen?.roles || [], release: seen?.release ?? null, ...patch }, remote);
    if (!seen || seen.v < TOUR_VERSION || !seen.roles.includes(role)) {
      const first = tourFor(role);
      if (!first) return;
      const roles = [...new Set([...(seen?.roles || []), role])];
      save({ roles, release: latest });       // a first tour already covers what's new
      const platform = c.isSuper && !roles.includes('platform') ? tourFor('platform') : null;
      setOpen({ ...first, after: platform ? () => { save({ roles: [...roles, 'platform'], release: latest }); setOpen(platform); } : undefined });
      return;
    }
    if (seen.release === latest) { if (JSON.stringify(seen) !== JSON.stringify(remote)) save({}); return; }
    // Updates since they last looked, announced and applying to them. Unknown history means nothing to show.
    const fresh = newerThan(seen.release).filter((e) => e.announce);
    save({ release: latest });
    const note = fresh.length ? buildNote(fresh, c, 'update') : null;
    if (note && (note.slides[0] as SummarySlide).groups.length) setOpen(note);
  }, [me?.id, remote, role, c, open, tourFor, loc.pathname]);

  // Replay on request.
  useEffect(() => {
    const onTour = (e: Event) => {
      const r = ((e as CustomEvent).detail as TourRole | null) || role;
      const t = tourFor(r);
      if (t) setOpen(t);
    };
    const onNews = (e: Event) => {
      const what = (e as CustomEvent).detail as string[] | { since: string } | null;
      if (Array.isArray(what) && what.length) { setOpen(buildNote(ENTRIES.filter((x) => what.includes(x.id)), c, 'entry')); return; }
      if (what && !Array.isArray(what)) { setOpen(buildNote(newerThan(what.since).filter((x) => x.announce), c, 'update')); return; }
      // Recent updates: the three newest entries with anything for this person.
      const aud = audienceOf(c);
      const recent = ENTRIES.filter((x) => x.changes.some((ch) => appliesTo(ch, c, aud))).slice(0, 3);
      setOpen(buildNote(recent, c, 'recent'));
    };
    window.addEventListener(EVENT, onTour);
    window.addEventListener(NEWS_EVENT, onNews);
    return () => { window.removeEventListener(EVENT, onTour); window.removeEventListener(NEWS_EVENT, onNews); };
  }, [role, tourFor, c]);

  if (!open) return null;
  return <TourViewer key={open.title + open.kicker + open.slides[0]?.id} title={open.title} kicker={open.kicker} slides={open.slides}
    onClose={() => { const next = open.after; setOpen(null); next?.(); }} />;
}

export function TourViewer({ title, kicker, slides, onClose }: { title: string; kicker: string; slides: ViewSlide[]; onClose: () => void }) {
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
          {isSummary(s) ? <SummaryCard s={s} onOpen={(to) => { onClose(); navigate(to); }} /> : (<>
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
          </>)}
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

/** The What's new summary: a bright header, then each update's changes tagged New, Better or Fixed. */
function SummaryCard({ s, onOpen }: { s: SummarySlide; onOpen: (to: string) => void }) {
  const top = s.groups[0];
  return (
    <div className="mx-5 mb-3 rounded-2xl border border-line overflow-hidden bg-white" aria-live="polite">
      <div className="relative px-5 pt-5 pb-5 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-brand-2) 0%, var(--color-brand-soft) 48%, #ffffff 100%)' }}>
        <span aria-hidden="true" className="absolute -right-10 -top-14 w-48 h-48 rounded-full bg-white/45" />
        <span aria-hidden="true" className="absolute right-16 -bottom-16 w-32 h-32 rounded-full bg-white/35" />
        <div className="relative flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-brand text-white flex items-center justify-center shadow-[0_6px_16px_-6px_var(--color-brand)]">
            <Icon name="sparkle" size={26} strokeWidth={2} />
          </span>
          {top && (
            <span className="text-[12px] font-bold tracking-[0.12em] uppercase text-brand-ink">
              RAMP {top.version} · {dateText(top.date, { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
        <h2 className="relative font-display text-[22px] md:text-[26px] font-bold leading-tight mt-4">{s.title}</h2>
        <p className="relative text-[15px] text-ink-2 leading-relaxed mt-1 max-w-[56ch]">{s.text}</p>
      </div>
      {s.groups.map((g) => (
        <section key={g.id} className="px-5 py-4 border-t border-line">
          {g.title !== s.title && (
            <h3 className="flex flex-wrap items-baseline gap-x-2 mb-3 text-[12px] font-bold tracking-[0.08em] uppercase text-muted">
              <span className="text-brand-ink">{g.version}</span><span>{g.title}</span>
            </h3>
          )}
          <ul className="flex flex-col gap-3">
            {g.items.map((ch, k) => (
              <li key={k} className="flex items-start gap-3">
                <TypeTag type={ch.type} className="mt-[1px]" />
                <span className="flex-1 min-w-0 text-[15px] leading-snug text-ink">
                  {ch.text}
                  {ch.link && (
                    <button type="button" onClick={() => onOpen(ch.link!)}
                      className="ml-1.5 inline-flex items-center gap-0.5 align-baseline text-[14px] font-semibold text-brand-ink cursor-pointer hover:underline">
                      Open<Icon name="chevronRight" size={14} strokeWidth={2.2} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
