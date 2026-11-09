import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon, Segmented, Sheet, cxChip } from './kit';
import { cx } from '../lib/util';
import { AUDIENCE_RANK, GROUPS, type GuideAudience, type GuideData, type GuideSection, type GuideShot } from './types';

export type GuideViewMode = 'member' | 'reviewer' | 'admin';
const VIEW_MAX: Record<GuideViewMode, number> = { member: 5, reviewer: 3, admin: 1 };
const VIEW_LABEL: Record<GuideViewMode, string> = { member: 'Members', reviewer: 'Mentors', admin: 'Admins' };
const AUD_LABEL: Record<GuideAudience, string> = { everyone: 'Everyone', staff: 'Team members', reviewers: 'Mentors, leads, admins', admins: 'Admins and owners' };

export interface GuideViewProps {
  data: GuideData;
  /** Viewer's rank (1 owner … 7 guest). Sections above it are never shown. */
  rank: number;
  initialView?: GuideViewMode;
  /** Resolve an image path from guide.json. */
  media?: (src: string) => string;
  /** In the app: go to a page. */
  openRoute?: (route: string) => void;
  /** Outside the app: base URL for "Open in RAMP" links. */
  appUrl?: string;
  /** Pixels hidden under a sticky header (mobile shell = 56). */
  stickyTop?: number;
  standalone?: boolean;
}

/** Bold the UI labels wrapped in **…**. */
export function rich(text: string): ReactNode {
  const parts = text.split('**');
  return parts.map((p, i) => (i % 2 ? <strong key={i} className="font-semibold text-ink">{p}</strong> : <Fragment key={i}>{p}</Fragment>));
}

function defaultView(rank: number): GuideViewMode {
  return rank <= 2 ? 'admin' : rank <= 4 ? 'reviewer' : 'member';
}

function sectionText(s: GuideSection) {
  return [s.title, s.summary, ...(s.steps || []).flatMap((x) => [x.title, x.text]), ...(s.tips || []),
    ...s.shots.flatMap((sh) => [sh.caption, ...sh.hotspots.flatMap((h) => [h.label, h.text])]),
    ...(s.settings || []).flatMap((x) => [x.name, x.where, x.effect])].join(' ').toLowerCase().replace(/\*\*/g, '');
}

export default function GuideView({ data, rank, initialView, media = (s) => s, openRoute, appUrl, stickyTop = 0, standalone }: GuideViewProps) {
  const views = (['member', 'reviewer', 'admin'] as GuideViewMode[]).filter((v) => rank <= VIEW_MAX[v] || (v === 'member'));
  const [view, setView] = useState<GuideViewMode>(() => (initialView && views.includes(initialView) ? initialView : defaultView(rank)));
  const [query, setQuery] = useState('');
  const limit = Math.max(rank, VIEW_MAX[view]);
  const q = query.trim().toLowerCase();

  const visible = useMemo(() => data.sections.filter((s) => limit <= AUDIENCE_RANK[s.audience]), [data, limit]);
  const shown = useMemo(() => (q ? visible.filter((s) => sectionText(s).includes(q)) : visible), [visible, q]);
  const faqs = FAQ.filter((f) => limit <= AUDIENCE_RANK[f.audience] && (!q || (f.q + ' ' + f.a).toLowerCase().includes(q)));

  const go = (id: string) => {
    const el = document.getElementById(`s-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Links like /guide#s-tasks open at that section.
  useEffect(() => {
    const id = window.location.hash.replace(/^#s-/, '');
    if (!id || id === window.location.hash) return;
    const t = setTimeout(() => document.getElementById(`s-${id}`)?.scrollIntoView({ block: 'start' }), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-8 guide-root min-w-0">
      <style>{PRINT_CSS}</style>
      <Hero view={view} views={views} setView={setView} query={query} setQuery={setQuery} count={shown.length} searching={!!q} standalone={standalone} />

      {!q && <QuickStart view={view} visible={visible} go={go} />}

      <div className="min-w-0 lg:grid lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <Toc groups={GROUPS.map((g) => ({ ...g, items: shown.filter((s) => s.group === g.id) })).filter((g) => g.items.length)} go={go} stickyTop={stickyTop} showRef={!q} view={view} />
        <div className="flex flex-col gap-10 min-w-0">
          {shown.length === 0 && faqs.length === 0 && (
            <div className="bg-card border border-line rounded-3xl p-8 text-center">
              <p className="font-display text-lg font-semibold">Nothing matches “{query}”</p>
              <p className="text-sm text-muted mt-1">Try a page name like “Tasks” or a word like “sign”.</p>
            </div>
          )}
          {GROUPS.map((g) => {
            const items = shown.filter((s) => s.group === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id} className="flex flex-col gap-5">
                <div id={`g-${g.id}`} className="scroll-mt-28">
                  <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-ink">{g.title}</p>
                  <p className="text-[15px] text-muted mt-1">{g.blurb}</p>
                </div>
                {items.map((s) => <SectionBlock key={s.id} s={s} media={media} openRoute={openRoute} appUrl={appUrl} />)}
              </div>
            );
          })}
          {!q && <Reference view={view} sections={visible} limit={limit} />}
          {faqs.length > 0 && <Faq items={faqs} />}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── hero ─────────────────────────

function Hero({ view, views, setView, query, setQuery, count, searching, standalone }: {
  view: GuideViewMode; views: GuideViewMode[]; setView: (v: GuideViewMode) => void; query: string; setQuery: (v: string) => void; count: number; searching: boolean; standalone?: boolean;
}) {
  return (
    <header className="rise relative overflow-hidden rounded-3xl bg-ink text-white px-5 py-7 md:px-9 md:py-10">
      <svg aria-hidden="true" className="hidden md:block absolute -right-10 -bottom-12 w-72 h-72 opacity-[0.14]" viewBox="0 0 32 32"><path d="M7 25H25V7H21V12H17V17H13V21H7Z" fill="white" /></svg>
      <div className="relative flex flex-col gap-5 max-w-2xl">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center"><Icon name="lifebuoy" size={20} /></span>
          <span className="text-xs font-bold tracking-[0.12em] uppercase text-white/80">RAMP guide</span>
        </div>
        <div>
          <h1 className="font-display text-[30px] md:text-[40px] leading-[1.08] font-bold tracking-tight">How to use RAMP</h1>
          <p className="text-[15px] md:text-base text-white/80 mt-2.5 leading-relaxed">
            Every page, menu and setting, with real screens and numbered callouts. Pick who you are to see what matters to you:
            <span className="text-white/60"> Mentors includes department leads; Admins shows everything.</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {views.length > 1 && (
            <div className="guide-noprint [&_[role=group]]:bg-white/10 [&_button]:text-white/85 [&_button[aria-pressed=true]]:bg-white [&_button[aria-pressed=true]]:text-ink">
              <Segmented label="Show the guide for" value={view} onChange={setView} options={views.map((v) => ({ value: v, label: VIEW_LABEL[v] }))} />
            </div>
          )}
          {!standalone && <button type="button" onClick={() => window.print()} className="guide-noprint inline-flex items-center gap-2 min-h-11 px-3.5 rounded-xl text-sm font-semibold text-white/90 hover:bg-white/10 cursor-pointer self-start sm:self-auto">
            <Icon name="download" size={18} />Print
          </button>}
        </div>
        <label className="relative block guide-noprint">
          <span className="sr-only">Search the guide</span>
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={18} strokeWidth={2} /></span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: sign a document, invite someone, reset password…"
            className="w-full min-h-12 pl-10 pr-3 rounded-xl bg-white text-ink text-base placeholder:text-[#6B7280] border-0" />
        </label>
        {searching && <p className="text-sm text-white/80" aria-live="polite">{count === 0 ? 'No pages match.' : `${count} ${count === 1 ? 'page matches' : 'pages match'}.`}</p>}
      </div>
    </header>
  );
}

// ───────────────────────── quick start + diagrams ─────────────────────────

const LIFECYCLE = [
  { icon: 'userPlus', title: 'Invite', who: 'Admin', text: 'HR adds the person in People, picks their access level, role and mentor, and sends them the link.', id: 'people' },
  { icon: 'key', title: 'Create a login', who: 'New hire', text: 'They choose New here and sign up with the invited email. RAMP links the login to the invite.', id: 'sign-in' },
  { icon: 'list', title: 'Welcome flow', who: 'New hire', text: 'Welcome message, profile, practice tour, onboarding documents and meeting their mentor.', id: 'welcome-flow' },
  { icon: 'book', title: 'Training', who: 'New hire', text: 'Required modules and their role track: slides, readings, videos, quizzes and assignments.', id: 'training' },
  { icon: 'check', title: 'Review', who: 'Mentor or lead', text: 'Work sent for review is approved or returned with feedback until it’s right.', id: 'reviews' },
  { icon: 'star', title: 'Graduate', who: 'Admin', text: 'When training is done, an admin graduates the trainee to the access level of their job role.', id: 'person' },
  { icon: 'refresh', title: 'Keep learning', who: 'Everyone', text: 'Continued training, resources, news, tasks, notebooks and chat for everyday work.', id: 'resources' },
];

const PATHS: Record<GuideViewMode, { title: string; blurb: string; steps: { label: string; id: string }[] }> = {
  member: {
    title: 'Your first week',
    blurb: 'Follow these in order. Each one links to its page in this guide.',
    steps: [
      { label: 'Create your login', id: 'sign-in' }, { label: 'Finish the welcome flow', id: 'welcome-flow' }, { label: 'Take the practice tour', id: 'practice' },
      { label: 'Fill out your documents', id: 'documents' }, { label: 'Start your training', id: 'training' }, { label: 'Clear your first-week tasks', id: 'tasks' },
      { label: 'Say hi to your mentor', id: 'chat' },
    ],
  },
  reviewer: {
    title: 'Your weekly routine',
    blurb: 'A few minutes a day keeps your people moving.',
    steps: [
      { label: 'Check work waiting for review', id: 'team' }, { label: 'Approve or return with feedback', id: 'reviews' }, { label: 'Look at each person’s progress', id: 'team-member' },
      { label: 'Assign a task', id: 'team-member' }, { label: 'Read their shared notes', id: 'team-member' }, { label: 'Post department news', id: 'news' },
    ],
  },
  admin: {
    title: 'Set up RAMP in this order',
    blurb: 'The setup checklist in the Admin portal tracks these for you.',
    steps: [
      { label: 'Organization and brand', id: 'org' }, { label: 'Roles and departments', id: 'roles' }, { label: 'Documents', id: 'documents-admin' },
      { label: 'Training modules', id: 'training-admin' }, { label: 'Assign training', id: 'assign' }, { label: 'Welcome flow', id: 'flow' },
      { label: 'Invite people', id: 'people' }, { label: 'Watch metrics', id: 'metrics' },
    ],
  },
};

function QuickStart({ view, visible, go }: { view: GuideViewMode; visible: GuideSection[]; go: (id: string) => void }) {
  const has = (id: string) => visible.some((s) => s.id === id);
  const path = PATHS[view];
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="bg-card border border-line rounded-3xl p-5 md:p-6" aria-labelledby="g-lifecycle">
        <h2 id="g-lifecycle" className="font-display text-xl font-bold">How RAMP works</h2>
        <p className="text-sm text-muted mt-1">From invitation to graduating, and the people involved at each stage.</p>
        <ol className="mt-5 relative">
          {LIFECYCLE.map((st, i) => (
            <li key={st.title} className="relative flex gap-3.5 pb-5 last:pb-0">
              {i < LIFECYCLE.length - 1 && <span aria-hidden="true" className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-brand-2" />}
              <span className="relative z-[1] w-10 h-10 shrink-0 rounded-full bg-brand text-white flex items-center justify-center"><Icon name={st.icon} size={19} /></span>
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  {has(st.id)
                    ? <button type="button" onClick={() => go(st.id)} className="font-semibold text-[15px] text-ink hover:text-brand-ink underline-offset-4 hover:underline cursor-pointer text-left">{i + 1}. {st.title}</button>
                    : <span className="font-semibold text-[15px]">{i + 1}. {st.title}</span>}
                  <span className={cxChip('neutral')}>{st.who}</span>
                </div>
                <p className="text-sm text-muted mt-1 leading-relaxed">{st.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-col gap-5">
        <section className="bg-brand-soft rounded-3xl p-5 md:p-6" aria-labelledby="g-path">
          <h2 id="g-path" className="font-display text-xl font-bold text-ink">{path.title}</h2>
          <p className="text-sm text-ink-2 mt-1">{path.blurb}</p>
          <ol className="mt-4 flex flex-col gap-2">
            {path.steps.map((st, i) => (
              <li key={st.label}>
                <button type="button" onClick={() => go(st.id)} disabled={!has(st.id)}
                  className="w-full flex items-center gap-3 min-h-12 rounded-2xl bg-white px-3.5 py-2 text-left text-[15px] font-semibold text-ink hover:ring-2 hover:ring-brand/30 cursor-pointer disabled:cursor-default disabled:hover:ring-0">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-brand text-white text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1">{st.label}</span>
                  {has(st.id) && <Icon name="chevronRight" size={18} className="text-muted" />}
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className="bg-card border border-line rounded-3xl p-5" aria-label="Signs and colors">
          <h2 className="font-display text-base font-bold">Reading the screens</h2>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-sm text-ink-2">
            <li className="flex items-center gap-2"><span className={cxChip('brand')}>In progress</span> started, not finished</li>
            <li className="flex items-center gap-2"><span className={cxChip('warn')}>Waiting for review</span> with a mentor</li>
            <li className="flex items-center gap-2"><span className={cxChip('bad')}>Needs changes</span> returned to you</li>
            <li className="flex items-center gap-2"><span className={cxChip('good')}>Completed</span> done and approved</li>
            <li className="flex items-center gap-2"><span className="min-w-6 h-6 px-1.5 rounded-full bg-amber text-ink text-xs font-bold inline-flex items-center justify-center">2</span> new for you</li>
            <li className="flex items-center gap-2"><Icon name="lock" size={16} className="text-muted" /> encrypted, private</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

// ───────────────────────── table of contents ─────────────────────────

function Toc({ groups, go, stickyTop, showRef, view }: {
  groups: { id: string; title: string; items: GuideSection[] }[]; go: (id: string) => void; stickyTop: number; showRef: boolean; view: GuideViewMode;
}) {
  const [active, setActive] = useState('');
  useEffect(() => {
    const ids = groups.flatMap((g) => g.items.map((s) => `s-${s.id}`));
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id.slice(2));
    }, { rootMargin: '-20% 0px -70% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [groups]);
  const refs = [{ id: 'access', label: 'Who can do what' }, { id: 'records', label: 'How records are kept' }, { id: 'modules', label: 'How a module works' },
    ...(view === 'admin' ? [{ id: 'settings', label: 'Settings reference' }] : []), { id: 'faq', label: 'Questions and fixes' }];
  const link = (on: boolean) => cx('block w-full text-left rounded-lg px-2.5 py-1.5 text-[13px] font-medium cursor-pointer', on ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-chip');
  return (
    <>
      {/* phones and tablets: a sticky row of chips */}
      <nav aria-label="Guide contents" className="guide-noprint lg:hidden sticky z-20 -mx-4 px-4 py-2.5 mb-2 bg-bg/95 backdrop-blur border-b border-line" style={{ top: stickyTop }}>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {groups.flatMap((g) => g.items).map((s) => (
            <button key={s.id} type="button" onClick={() => go(s.id)}
              className={cx('shrink-0 min-h-10 px-3.5 rounded-full border text-[13px] font-semibold cursor-pointer whitespace-nowrap',
                active === s.id ? 'bg-brand border-brand text-white' : 'bg-white border-line text-ink-2')}>{s.title}</button>
          ))}
          {showRef && refs.map((r) => (
            <button key={r.id} type="button" onClick={() => go(r.id)} className="shrink-0 min-h-10 px-3.5 rounded-full border border-dashed border-line text-[13px] font-semibold text-muted cursor-pointer whitespace-nowrap bg-white">{r.label}</button>
          ))}
        </div>
      </nav>
      {/* desktop: sticky side list */}
      <nav aria-label="Guide contents" className="guide-noprint hidden lg:flex flex-col gap-4 sticky max-h-[calc(100dvh-48px)] overflow-y-auto pb-6" style={{ top: stickyTop + 24 }}>
        {groups.map((g) => (
          <div key={g.id}>
            <p className="px-2.5 pb-1 text-[11px] font-bold tracking-[0.1em] uppercase text-muted">{g.title}</p>
            {g.items.map((s) => <button key={s.id} type="button" onClick={() => go(s.id)} className={link(active === s.id)}>{s.title}</button>)}
          </div>
        ))}
        {showRef && (
          <div>
            <p className="px-2.5 pb-1 text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Reference</p>
            {refs.map((r) => <button key={r.id} type="button" onClick={() => go(r.id)} className={link(active === r.id)}>{r.label}</button>)}
          </div>
        )}
      </nav>
    </>
  );
}

// ───────────────────────── one section ─────────────────────────

function SectionBlock({ s, media, openRoute, appUrl }: { s: GuideSection; media: (src: string) => string; openRoute?: (r: string) => void; appUrl?: string }) {
  const route = s.route && !s.route.includes(':') ? s.route : null;
  return (
    <section id={`s-${s.id}`} aria-labelledby={`h-${s.id}`} className="guide-section scroll-mt-32 lg:scroll-mt-8 bg-card border border-line rounded-3xl p-5 md:p-7 flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <span className="hidden sm:flex w-12 h-12 rounded-2xl bg-brand-soft text-brand-ink items-center justify-center shrink-0"><Icon name={s.icon} size={24} /></span>
        <div className="flex-1 min-w-0 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`h-${s.id}`} className="font-display text-[22px] leading-tight font-bold">{s.title}</h3>
            <span className={cxChip(s.audience === 'admins' ? 'dark' : s.audience === 'reviewers' ? 'warn' : 'neutral')}>{AUD_LABEL[s.audience]}</span>
          </div>
          <p className="text-[15px] text-ink-2 mt-1.5 leading-relaxed">{rich(s.summary)}</p>
        </div>
        {route && openRoute && (
          <button type="button" onClick={() => openRoute(route)} className="guide-noprint inline-flex items-center gap-2 min-h-11 px-4 rounded-xl text-[15px] font-semibold bg-brand text-white hover:bg-brand-ink cursor-pointer">
            Open this page<Icon name="chevronRight" size={18} />
          </button>
        )}
        {route && !openRoute && appUrl && (
          <a href={appUrl + route} target="_blank" rel="noopener noreferrer" className="guide-noprint inline-flex items-center gap-2 min-h-11 px-4 rounded-xl text-[15px] font-semibold bg-white text-ink border border-[#C9CED6] hover:bg-chip no-underline">
            Open in RAMP<Icon name="link" size={18} />
          </a>
        )}
      </div>

      {s.shots.map((sh, i) => <Figure key={sh.src} shot={sh} media={media} route={route} index={i} />)}

      {(s.steps?.length || s.tips?.length) ? (
        <div className={cx('grid gap-6', s.steps?.length && s.tips?.length ? 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : '')}>
          {!!s.steps?.length && (
            <div>
              <h4 className="text-xs font-bold tracking-[0.1em] uppercase text-muted mb-3">How to</h4>
              <ol className="flex flex-col gap-3">
                {s.steps.map((st, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-7 h-7 shrink-0 rounded-full border-2 border-brand text-brand-ink text-[13px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[15px]">{rich(st.title)}</p>
                      <p className="text-sm text-ink-2 mt-0.5 leading-relaxed">{rich(st.text)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {!!s.tips?.length && (
            <div className="flex flex-col gap-2.5">
              <h4 className="text-xs font-bold tracking-[0.1em] uppercase text-muted mb-0.5">Good to know</h4>
              {s.tips.map((t, i) => (
                <div key={i} className="flex gap-2.5 items-start rounded-2xl bg-warn-soft/70 px-3.5 py-3 text-sm text-ink-2 leading-relaxed">
                  <Icon name="sparkle" size={16} className="text-warn mt-0.5" /><span>{rich(t)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!!s.settings?.length && (
        <div>
          <h4 className="text-xs font-bold tracking-[0.1em] uppercase text-muted mb-3">Settings on this page</h4>
          <SettingsTable rows={s.settings} />
        </div>
      )}
    </section>
  );
}

function SettingsTable({ rows, showWhere }: { rows: { name: string; where: string; effect: string }[]; showWhere?: boolean }) {
  return (
    <div className="rounded-2xl border border-line overflow-hidden">
      <dl className="divide-y divide-line-2">
        {rows.map((r, i) => (
          <div key={i} className="grid sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] gap-x-4 gap-y-0.5 px-4 py-3">
            <dt className="text-sm font-semibold text-ink">{rich(r.name)}{showWhere && <span className="block text-xs font-normal text-muted mt-0.5">{r.where}</span>}</dt>
            <dd className="text-sm text-ink-2 leading-relaxed">{rich(r.effect)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ───────────────────────── annotated screenshot ─────────────────────────

function Figure({ shot, media, route, index }: { shot: GuideShot; media: (s: string) => string; route: string | null; index: number }) {
  const [active, setActive] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const phone = shot.device === 'phone';
  const legend = (
    <ol className={cx('flex flex-col gap-1', !phone && 'md:grid md:grid-cols-2 md:gap-x-5')}>
      {shot.hotspots.map((h) => (
        <li key={h.n}>
          <button type="button" onMouseEnter={() => setActive(h.n)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(h.n)} onBlur={() => setActive(null)}
            onClick={() => setActive((a) => (a === h.n ? null : h.n))} aria-pressed={active === h.n}
            className={cx('w-full flex gap-3 text-left rounded-xl px-2.5 py-2 cursor-pointer transition-colors', active === h.n ? 'bg-amber/15' : 'hover:bg-chip')}>
            <Marker n={h.n} on={active === h.n} />
            <span className="min-w-0">
              <span className="block font-semibold text-[15px] text-ink">{h.label}</span>
              <span className="block text-sm text-ink-2 leading-relaxed mt-0.5">{rich(h.text)}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
  const image = (big?: boolean) => (
    <Screen shot={shot} media={media} active={active} setActive={setActive} onZoom={big ? undefined : () => setZoom(true)} route={route} />
  );
  return (
    <figure className={cx('flex flex-col gap-4', phone ? 'md:flex-row md:items-start md:gap-7' : '')}>
      <div className={cx(phone ? 'mx-auto md:mx-0 w-full max-w-[290px] shrink-0' : 'w-full')}>{image()}</div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <figcaption className="text-sm font-semibold text-muted px-2.5">{index > 0 ? 'Also: ' : ''}{shot.caption}</figcaption>
        {legend}
      </div>
      <Sheet open={zoom} onClose={() => setZoom(false)} title={shot.caption} wide>
        <div className={cx(phone ? 'mx-auto w-full max-w-[380px]' : 'w-full')}>{image(true)}</div>
        {legend}
      </Sheet>
    </figure>
  );
}

function Marker({ n, on }: { n: number; on?: boolean }) {
  return (
    <span className={cx('w-7 h-7 shrink-0 rounded-full text-[13px] font-bold flex items-center justify-center shadow-[0_2px_6px_rgba(17,24,39,.25)] transition-transform',
      on ? 'bg-amber text-ink scale-110' : 'bg-brand text-white')}>{n}</span>
  );
}

function Screen({ shot, media, active, setActive, onZoom, route }: {
  shot: GuideShot; media: (s: string) => string; active: number | null; setActive: (n: number | null) => void; onZoom?: () => void; route: string | null;
}) {
  const phone = shot.device === 'phone';
  const inner = (
    <div className="relative" style={{ aspectRatio: `${shot.w} / ${shot.h}` }}>
      <img src={media(shot.src)} alt={shot.alt} width={shot.w} height={shot.h} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      {shot.hotspots.map((h) => (
        <Fragment key={h.n}>
          <span aria-hidden="true" className={cx('absolute rounded-lg pointer-events-none transition-opacity', active === h.n ? 'opacity-100' : 'opacity-0')}
            style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%`, boxShadow: '0 0 0 3px #F59E0B, 0 0 0 9999px rgba(17,24,39,.28)' }} />
          <button type="button" aria-label={`${h.n}: ${h.label}`} onMouseEnter={() => setActive(h.n)} onMouseLeave={() => setActive(null)}
            onClick={(e) => { e.stopPropagation(); setActive(active === h.n ? null : h.n); }}
            className="absolute z-[2] cursor-pointer" style={{ left: `clamp(0px, calc(${h.x + h.w}% - 16px), calc(100% - 28px))`, top: `clamp(0px, calc(${h.y}% - 12px), calc(100% - 28px))` }}>
            <Marker n={h.n} on={active === h.n} />
          </button>
        </Fragment>
      ))}
      {onZoom && (
        <button type="button" onClick={onZoom} aria-label="Enlarge screenshot"
          className="guide-noprint absolute z-[3] right-2 bottom-2 w-10 h-10 rounded-full bg-ink/75 text-white flex items-center justify-center cursor-pointer hover:bg-ink">
          <Icon name="search" size={18} />
        </button>
      )}
    </div>
  );
  if (phone) {
    return (
      <div className="rounded-[38px] bg-ink p-[9px] shadow-[0_18px_40px_-18px_rgba(17,24,39,.55)]">
        <div className="rounded-[30px] overflow-hidden bg-bg">{inner}</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line overflow-hidden bg-white shadow-[0_18px_40px_-24px_rgba(17,24,39,.45)]">
      <div className="h-9 px-3.5 flex items-center gap-1.5 bg-[#EEF0F3] border-b border-line" aria-hidden="true">
        <span className="w-2.5 h-2.5 rounded-full bg-[#F87171]" /><span className="w-2.5 h-2.5 rounded-full bg-[#FBBF24]" /><span className="w-2.5 h-2.5 rounded-full bg-[#34D399]" />
        <span className="ml-3 flex-1 max-w-sm h-6 rounded-md bg-white text-[11px] text-muted flex items-center px-2.5 truncate">mco-ramp.vercel.app{route || ''}</span>
      </div>
      {inner}
    </div>
  );
}

// ───────────────────────── reference ─────────────────────────

type Cell = 'yes' | 'part' | 'no';
const LEVEL_COLS = ['Owner', 'Admin', 'Lead', 'Mentor', 'Employee', 'Trainee', 'Guest'];
const MATRIX: { what: string; cells: Cell[]; note?: string }[] = [
  { what: 'Welcome flow and assigned training', cells: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'part'], note: 'Guests only see modules shared with guests.' },
  { what: 'Fill out and sign documents', cells: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'part'], note: 'Guests see candidate and before-start forms.' },
  { what: 'Tasks, notebook, vault, chat and news', cells: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'no'] },
  { what: 'Resources', cells: ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'part'], note: 'Guests only see resources marked for guests.' },
  { what: 'See other people’s progress', cells: ['yes', 'yes', 'part', 'part', 'no', 'no', 'no'], note: 'Leads: their department. Mentors: their trainees.' },
  { what: 'Review work and assign tasks', cells: ['yes', 'yes', 'part', 'part', 'no', 'no', 'no'], note: 'Only for the people they look after.' },
  { what: 'Read notebook pages shared with them', cells: ['yes', 'yes', 'part', 'part', 'no', 'no', 'no'] },
  { what: 'Post announcements', cells: ['yes', 'yes', 'part', 'no', 'no', 'no', 'no'], note: 'Leads post to their own department.' },
  { what: 'Invite people, change access, graduate', cells: ['yes', 'yes', 'no', 'no', 'no', 'no', 'no'] },
  { what: 'Build training, documents and resources', cells: ['yes', 'yes', 'no', 'no', 'no', 'no', 'no'] },
  { what: 'Open records: files, encrypted answers, IP and device history', cells: ['yes', 'yes', 'no', 'no', 'no', 'no', 'no'], note: 'Every reveal is written to the audit log.' },
  { what: 'Feature switches', cells: ['yes', 'no', 'no', 'no', 'no', 'no', 'no'] },
  { what: 'Make or change owners', cells: ['yes', 'no', 'no', 'no', 'no', 'no', 'no'] },
];

function CellMark({ c }: { c: Cell }) {
  if (c === 'yes') return <span className="inline-flex w-7 h-7 rounded-full bg-good-soft text-good items-center justify-center" title="Yes"><Icon name="check" size={16} strokeWidth={2.6} /><span className="sr-only">Yes</span></span>;
  if (c === 'part') return <span className="inline-flex w-7 h-7 rounded-full bg-warn-soft text-warn items-center justify-center text-[13px] font-bold" title="Partly">½<span className="sr-only">Partly</span></span>;
  return <span className="inline-flex w-7 h-7 items-center justify-center text-[#B3B9C2]" title="No">–<span className="sr-only">No</span></span>;
}

function FlowDiagram({ steps }: { steps: { icon: string; title: string; text: string; tone?: 'good' | 'warn' | 'dark' }[] }) {
  return (
    <ol className="flex flex-col md:flex-row md:items-stretch gap-2">
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-col md:flex-row items-center gap-2 md:flex-1 min-w-0">
          <div className={cx('w-full md:h-full rounded-2xl px-4 py-3.5 flex md:flex-col gap-3 md:gap-2 items-start',
            s.tone === 'good' ? 'bg-good-soft' : s.tone === 'warn' ? 'bg-warn-soft' : s.tone === 'dark' ? 'bg-ink text-white' : 'bg-bg')}>
            <span className={cx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', s.tone === 'dark' ? 'bg-white/15' : 'bg-white text-brand-ink')}><Icon name={s.icon} size={18} /></span>
            <div className="min-w-0">
              <p className="font-semibold text-[15px] leading-snug">{s.title}</p>
              <p className={cx('text-[13px] leading-relaxed mt-0.5', s.tone === 'dark' ? 'text-white/80' : 'text-ink-2')}>{s.text}</p>
            </div>
          </div>
          {i < steps.length - 1 && <Icon name="chevronRight" size={20} strokeWidth={2.4} className="text-brand rotate-90 md:rotate-0 shrink-0" />}
        </li>
      ))}
    </ol>
  );
}

function RefCard({ id, title, blurb, children }: { id: string; title: string; blurb?: string; children: ReactNode }) {
  return (
    <section id={`s-${id}`} className="guide-section min-w-0 scroll-mt-32 lg:scroll-mt-8 bg-card border border-line rounded-3xl p-5 md:p-7 flex flex-col gap-4">
      <div>
        <h3 className="font-display text-[22px] leading-tight font-bold">{title}</h3>
        {blurb && <p className="text-[15px] text-ink-2 mt-1.5 leading-relaxed">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

function Reference({ view, sections, limit }: { view: GuideViewMode; sections: GuideSection[]; limit: number }) {
  const settings = sections.filter((s) => s.audience === 'admins' && s.settings?.length).flatMap((s) => s.settings!);
  return (
    <div className="flex flex-col gap-5 min-w-0">
      <div id="g-ref" className="scroll-mt-28">
        <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-ink">Reference</p>
        <p className="text-[15px] text-muted mt-1">Permissions, how records and training work, and every setting in one place.</p>
      </div>

      <RefCard id="access" title="Who can do what" blurb="Seven access levels. Each person has one, set by an admin in People. The database enforces these rules, not just the screens.">
        <div className="relative -mx-5 w-[calc(100%+2.5rem)] md:mx-0 md:w-full overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-[1] bg-card text-left font-semibold text-muted text-xs uppercase tracking-[0.08em] px-5 md:px-3 py-2.5 border-b border-line">Can…</th>
                {LEVEL_COLS.map((l) => <th key={l} scope="col" className="text-center font-semibold text-ink px-1.5 py-2.5 border-b border-line text-[13px]">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((r) => (
                <tr key={r.what} className="align-middle">
                  <th scope="row" className="sticky left-0 z-[1] bg-card text-left font-medium text-ink px-5 md:px-3 py-2.5 border-b border-line-2 max-w-[260px]">
                    {r.what}{r.note && <span className="block text-xs font-normal text-muted mt-0.5">{r.note}</span>}
                  </th>
                  {r.cells.map((c, i) => <td key={i} className="text-center px-1.5 py-2 border-b border-line-2"><CellMark c={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted flex flex-wrap gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1.5"><CellMark c="yes" /> Yes</span><span className="inline-flex items-center gap-1.5"><CellMark c="part" /> Partly (see note)</span><span className="inline-flex items-center gap-1.5"><CellMark c="no" /> No</span></p>
      </RefCard>

      <RefCard id="records" title="How records are kept" blurb="What happens when someone fills out, uploads or signs a document.">
        <FlowDiagram steps={[
          { icon: 'pen', title: 'Fill in or sign', text: 'The person completes the form and types their name to sign.' },
          { icon: 'lock', title: 'Sensitive answers encrypted', text: 'Bank details, ID numbers and other sensitive fields are encrypted before they’re stored.' },
          { icon: 'shield', title: 'Stamped as a record', text: 'Saved with the date and time, document version, IP address and device.' },
          { icon: 'eye', title: 'Viewed by admins', text: 'Admins open records in People. Each reveal of an encrypted answer is logged.', tone: 'dark' },
        ]} />
        {limit <= 2 && <p className="text-sm text-muted">IP and device recording can be switched off in <strong className="text-ink">Admin › System</strong>. Files are private and open through links that expire after two minutes.</p>}
      </RefCard>

      <RefCard id="modules" title="How a module works" blurb="Every training module follows the same path. Admins choose which pieces each one uses.">
        <FlowDiagram steps={[
          { icon: 'play', title: 'Learn', text: 'Slides, readings and videos. Progress saves as you go.' },
          { icon: 'target', title: 'Quiz', text: 'Some modules need a passing score.' },
          { icon: 'pen', title: 'Assignment', text: 'A short written answer.' },
          { icon: 'users', title: 'Mentor review', text: 'Approved, or returned with feedback.', tone: 'warn' },
          { icon: 'check', title: 'Completed', text: 'Counts toward your progress.', tone: 'good' },
        ]} />
      </RefCard>

      {view === 'admin' && settings.length > 0 && (
        <RefCard id="settings" title="Settings reference" blurb="Every admin setting, where to find it and what it changes.">
          <SettingsTable rows={settings} showWhere />
        </RefCard>
      )}
    </div>
  );
}

// ───────────────────────── FAQ ─────────────────────────

const FAQ: { q: string; a: string; audience: GuideAudience }[] = [
  { audience: 'everyone', q: 'I didn’t get the confirmation email.', a: 'It can take a minute. Check spam or promotions. Still nothing? Sign in with **Sign in**; if it says to confirm first, ask HR to check that your invite uses the right email.' },
  { audience: 'everyone', q: 'RAMP says I’m not on the team list.', a: 'Your login email doesn’t match an invitation. Sign out and use the email HR invited, or send a request with **Request access** and HR will see it in People.' },
  { audience: 'everyone', q: 'I forgot my password.', a: 'On the sign-in screen tap **Forgot your password?**, enter your email and follow the link to choose a new one. Signed in already? Change it in your **Profile**.' },
  { audience: 'everyone', q: 'A document won’t submit.', a: 'Look for fields marked in red; the footer counts what’s left. Files can be up to 25 MB. If it says the form isn’t available, it may have been unpublished—ask HR.' },
  { audience: 'staff', q: 'I can’t see Chat or Tasks.', a: 'An owner can switch these off for everyone in **Admin › System**. If they’re off, they disappear from the menu.' },
  { audience: 'staff', q: 'My module says “Needs changes”.', a: 'Your mentor returned it with feedback. Open the module, read the note at the top, update your answer and send it again.' },
  { audience: 'staff', q: 'Who can read my notebook and vault?', a: 'Only you, unless you turn on sharing for a notebook page; then your mentor, lead and admins can read that page. Vault entries are encrypted and only you can open them—admins can’t.' },
  { audience: 'reviewers', q: 'Someone isn’t in my team list.', a: 'Mentors see the trainees assigned to them; leads see their department. An admin sets the mentor and department on the person’s record.' },
  { audience: 'admins', q: 'How do I invite a batch of new hires?', a: 'In **People › Potential staff**, tick the people you want, tap **Invite** in the bar that appears, pick their role, mentor and level, then send each person the message RAMP prepares.' },
  { audience: 'admins', q: 'How do I see who signed a document and from where?', a: 'Open the person in **People**, go to **Documents** and open the record. It shows the typed signature, date and time, IP address, device and document version.' },
  { audience: 'admins', q: 'Someone left the company.', a: 'Open their record in People and choose **Pause access**. Their records stay for your files. Remove them only if you no longer need the history.' },
  { audience: 'admins', q: 'Confirmation or reset links open the wrong site.', a: 'In Supabase, add https://mco-ramp.vercel.app/** to Authentication › URL Configuration › Redirect URLs.' },
];

function Faq({ items }: { items: typeof FAQ }) {
  return (
    <RefCard id="faq" title="Questions and fixes">
      <div className="flex flex-col divide-y divide-line-2 -my-2">
        {items.map((f) => (
          <details key={f.q} className="group py-1">
            <summary className="flex items-center gap-3 min-h-12 cursor-pointer list-none font-semibold text-[15px] text-ink [&::-webkit-details-marker]:hidden">
              <span className="flex-1">{f.q}</span>
              <Icon name="chevronDown" size={18} className="text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="text-sm text-ink-2 leading-relaxed pb-3 pr-8">{rich(f.a)}</p>
          </details>
        ))}
      </div>
    </RefCard>
  );
}

const PRINT_CSS = `
@media print {
  aside, nav, header.md\\:hidden, .guide-noprint { display: none !important; }
  main { padding: 0 !important; max-width: none !important; }
  body { background: #fff !important; }
  .guide-section { break-inside: avoid-page; border-color: #ddd !important; }
  details > p { display: block !important; }
}`;
