// The practice sandbox: a small, fake copy of RAMP that lives only in memory. Nothing here reads or writes real data.
import type { ReactNode } from 'react';
import { TASK_ORDER, TASK_STATUS, cx, fmtDate, todayISO } from '../../lib/util';
import type { TaskStatus } from '../../lib/types';
import { Avatar, Chip, Icon, Logo, Progress, Switch } from '../../ui';

// ───────── state ─────────

export type SimView = 'home' | 'training' | 'module' | 'tasks' | 'notes' | 'chat' | 'resources' | 'news' | 'more' | 'profile';
type Channel = 'general' | 'new-hires' | 'dm';
interface SimTask { id: string; title: string; status: TaskStatus; due: string; mine?: boolean }

export interface SimState {
  view: SimView;
  visited: Partial<Record<SimView, boolean>>;
  moduleStarted: boolean;
  slide: number;
  tasks: SimTask[];
  taskCreated: boolean;
  pages: { id: string; title: string; isNew?: boolean }[];
  openPage: string | null;
  pageCreated: boolean;
  shared: boolean;
  channel: Channel | null;
  sent: boolean;
  reply: boolean;
  resource: string | null;
  resourceOpened: boolean;
  query: string;
  annRead: boolean;
}

export function initSim(): SimState {
  return {
    view: 'home',
    visited: { home: true },
    moduleStarted: false,
    slide: 0,
    tasks: [
      { id: 't1', title: 'Read the employee handbook', status: 'todo', due: todayISO(2) },
      { id: 't2', title: 'Set up your notebook', status: 'doing', due: todayISO(3) },
      { id: 't3', title: 'Install your tools', status: 'done', due: todayISO(-1) },
    ],
    taskCreated: false,
    pages: [{ id: 'start', title: 'Start here' }, { id: 'notes', title: 'Module notes' }],
    openPage: null,
    pageCreated: false,
    shared: false,
    channel: null,
    sent: false,
    reply: false,
    resource: null,
    resourceOpened: false,
    query: '',
    annRead: false,
  };
}

export type SimAction =
  | { t: 'nav'; view: SimView }
  | { t: 'startModule' }
  | { t: 'slide'; n: number }
  | { t: 'newTask' }
  | { t: 'moveTask'; id: string }
  | { t: 'newPage' }
  | { t: 'openPage'; id: string | null }
  | { t: 'share'; on: boolean }
  | { t: 'channel'; c: Channel | null }
  | { t: 'send' }
  | { t: 'reply' }
  | { t: 'resource'; id: string | null }
  | { t: 'query'; v: string }
  | { t: 'ack' };

export function simReducer(s: SimState, a: SimAction): SimState {
  switch (a.t) {
    case 'nav': return { ...s, view: a.view, visited: { ...s.visited, [a.view]: true }, resource: a.view === 'resources' ? s.resource : null };
    case 'startModule': return { ...s, moduleStarted: true, slide: 0 };
    case 'slide': return { ...s, slide: Math.max(0, Math.min(SLIDES.length - 1, a.n)) };
    case 'newTask': {
      if (s.taskCreated) return s;
      return { ...s, taskCreated: true, tasks: [{ id: 'mine', title: 'My first task', status: 'todo', due: todayISO(5), mine: true }, ...s.tasks] };
    }
    case 'moveTask': return {
      ...s,
      tasks: s.tasks.map((t) => (t.id === a.id ? { ...t, status: TASK_ORDER[Math.min(TASK_ORDER.length - 1, TASK_ORDER.indexOf(t.status) + 1)]! } : t)),
    };
    case 'newPage': {
      const id = `p${s.pages.length + 1}`;
      return { ...s, pageCreated: true, openPage: id, pages: [...s.pages, { id, title: 'Untitled page', isNew: true }] };
    }
    case 'openPage': return { ...s, openPage: a.id };
    case 'share': return { ...s, shared: a.on };
    case 'channel': return { ...s, channel: a.c };
    case 'send': return s.sent ? s : { ...s, sent: true };
    case 'reply': return { ...s, reply: true };
    case 'resource': return { ...s, resource: a.id, resourceOpened: s.resourceOpened || !!a.id };
    case 'query': return { ...s, query: a.v };
    case 'ack': return { ...s, annRead: true };
  }
}

// ───────── missions ─────────

export interface SimCtx { first: string; mentor: string; mentorFirst: string; org: string }

export interface Mission {
  id: string;
  title: string;
  ok: string;
  done: (s: SimState) => boolean;
  target: (s: SimState, mobile: boolean) => string;
  hint: (s: SimState, mobile: boolean, c: SimCtx) => string;
}

const mine = (s: SimState) => s.tasks.find((t) => t.mine);
const menu = (mobile: boolean, what: string) => (mobile ? `Tap ${what} in the bar at the bottom.` : `Click ${what} in the menu on the left.`);

export const MISSIONS: Mission[] = [
  {
    id: 'training', title: 'Find your training', ok: 'That’s Training. All your modules live here.',
    done: (s) => !!(s.visited.training || s.visited.module),
    target: () => 'nav-training',
    hint: (_s, m) => menu(m, 'Training'),
  },
  {
    id: 'module', title: 'Start a module', ok: 'Modules open one step at a time: slides, videos, quizzes and assignments.',
    done: (s) => s.moduleStarted,
    target: (s) => (s.view === 'module' ? 'mod-start' : s.view === 'training' ? 'mod-row' : 'nav-training'),
    hint: (s, m) => (s.view === 'module' ? 'Tap Start to open the first slide.' : s.view === 'training' ? 'Tap “How we use tasks”.' : `Go back to Training. ${menu(m, 'Training')}`),
  },
  {
    id: 'task', title: 'Create a task', ok: 'Task created. Every task has one owner and a due date.',
    done: (s) => s.taskCreated,
    target: (s) => (s.view === 'tasks' ? 'new-task' : 'nav-tasks'),
    hint: (s, m) => (s.view === 'tasks' ? 'Tap “New task”.' : menu(m, 'Tasks')),
  },
  {
    id: 'review', title: 'Send it for review', ok: 'In review tells your mentor it’s ready to check.',
    done: (s) => { const t = mine(s); return !!t && (t.status === 'review' || t.status === 'done'); },
    target: (s) => (s.view === 'tasks' ? 'task-move' : 'nav-tasks'),
    hint: (s, m) => (s.view !== 'tasks' ? `Go back to Tasks. ${menu(m, 'Tasks')}`
      : mine(s)?.status === 'doing' ? 'One more: move it from In progress to In review.' : 'On “My first task”, tap “Move to In progress”.'),
  },
  {
    id: 'page', title: 'Start a notebook page', ok: 'Your notebook is private unless you choose to share a page.',
    done: (s) => s.pageCreated,
    target: (s, m) => (s.view === 'notes' ? 'new-page' : m ? (s.view === 'more' ? 'more-notes' : 'nav-more') : 'nav-notes'),
    hint: (s, m) => (s.view === 'notes' ? 'Tap “New page”.' : m ? (s.view === 'more' ? 'Tap Notebook.' : 'On phones, Notebook is under More. Tap More.') : menu(m, 'Notebook')),
  },
  {
    id: 'chat', title: 'Message your mentor', ok: 'Message sent. Your mentor sees it in Chat.',
    done: (s) => s.sent,
    target: (s, m) => (s.view !== 'chat' ? 'nav-chat' : s.channel === 'dm' ? 'send' : s.channel && m ? 'chat-back' : 'dm-mentor'),
    hint: (s, m, c) => (s.view !== 'chat' ? menu(m, 'Chat') : s.channel === 'dm' ? 'Tap Send to say hi.'
      : s.channel && m ? 'Go back to your conversations.' : `Open your conversation with ${c.mentor}.`),
  },
  {
    id: 'resource', title: 'Find a resource', ok: 'Policies, how-to guides and tools all live in Resources.',
    done: (s) => s.resourceOpened,
    target: (s, m) => (s.view === 'resources' ? 'res-handbook' : m ? (s.view === 'more' ? 'more-resources' : 'nav-more') : 'nav-resources'),
    hint: (s, m) => (s.view === 'resources' ? 'Open the Employee handbook.' : m ? (s.view === 'more' ? 'Tap Resources.' : 'Resources is under More. Tap More.') : menu(m, 'Resources')),
  },
  {
    id: 'news', title: 'Read an announcement', ok: 'Some announcements ask you to confirm you’ve read them.',
    done: (s) => s.annRead,
    target: (s) => (s.view === 'home' ? 'ann-ack' : s.view === 'news' ? 'news-ack' : 'nav-home'),
    hint: (s, m) => (s.view === 'home' || s.view === 'news' ? 'Tap “Mark as read” on the announcement.' : `Announcements show on Home. ${menu(m, 'Home')}`),
  },
  {
    id: 'profile', title: 'Open your profile', ok: 'Your profile holds your details and the documents you’ve signed.',
    done: (s) => !!s.visited.profile,
    target: () => 'profile',
    hint: (_s, m) => (m ? 'Tap your initials in the top corner.' : 'Click your name at the bottom of the menu.'),
  },
];

// ───────── fake content ─────────

const SLIDES = [
  { title: 'One place for every task', body: 'Work that comes up in chat, email or a meeting becomes a task. That way nothing slips through the cracks.' },
  { title: 'Anatomy of a good task', body: 'A title that starts with a verb, one owner, a due date, and updates kept on the task.' },
  { title: 'Statuses move left to right', body: 'To do, In progress, In review, Done. In review means it’s ready for your mentor to check.' },
];

const MODULES = [
  { id: 'platform', title: 'Platform basics', meta: 'Interactive · 5 min', chip: { label: 'You’re here', tone: 'brand' as const } },
  { id: 'tasks', title: 'How we use tasks', meta: 'Slides and quiz · 15 min', chip: { label: 'Not started', tone: 'neutral' as const } },
  { id: 'comms', title: 'Communication and chat basics', meta: 'Slides · 8 min', chip: { label: 'Not started', tone: 'neutral' as const } },
  { id: 'security', title: 'Security and data handling', meta: 'Reading and quiz · 10 min', chip: { label: 'Not started', tone: 'neutral' as const } },
];

const RESOURCES = [
  { id: 'handbook', title: 'Employee handbook', cat: 'Policy', body: 'Working hours, time off, expenses and how we treat each other. Read it in your first week.' },
  { id: 'timeoff', title: 'Requesting time off', cat: 'How-to', body: 'Ask at least two weeks ahead, add it to the shared calendar and tell your lead.' },
  { id: 'brand', title: 'Brand guide', cat: 'Guide', body: 'Logos, colors and the tone we use with clients.' },
  { id: 'passwords', title: 'Password manager setup', cat: 'Tool', body: 'Keep every work login in your Vault or the approved password manager.' },
];

const TITLES: Record<SimView, string> = {
  home: 'Home', training: 'Training', module: 'How we use tasks', tasks: 'Tasks', notes: 'Notebook', chat: 'Chat',
  resources: 'Resources', news: 'News', more: 'More', profile: 'Profile',
};

const NAV_DESKTOP: { view: SimView; label: string; icon: string }[] = [
  { view: 'home', label: 'Home', icon: 'home' },
  { view: 'training', label: 'Training', icon: 'book' },
  { view: 'tasks', label: 'Tasks', icon: 'tasks' },
  { view: 'notes', label: 'Notebook', icon: 'notes' },
  { view: 'chat', label: 'Chat', icon: 'chat' },
  { view: 'resources', label: 'Resources', icon: 'folder' },
  { view: 'news', label: 'News', icon: 'megaphone' },
];
const NAV_MOBILE: { view: SimView; label: string; icon: string }[] = [
  { view: 'home', label: 'Home', icon: 'home' },
  { view: 'training', label: 'Training', icon: 'book' },
  { view: 'tasks', label: 'Tasks', icon: 'tasks' },
  { view: 'chat', label: 'Chat', icon: 'chat' },
  { view: 'more', label: 'More', icon: 'more' },
];
const navActive = (view: SimView, item: SimView) =>
  item === view || (item === 'training' && view === 'module') || (item === 'more' && ['notes', 'resources', 'news', 'more'].includes(view));

// ───────── the fake app ─────────

interface ViewProps { s: SimState; act: (a: SimAction) => void; ring: (id: string) => string; mobile: boolean; ctx: SimCtx }

export function SimApp({ s, act, target, mobile, ctx }: {
  s: SimState; act: (a: SimAction) => void; target: string; mobile: boolean; ctx: SimCtx;
}) {
  const ring = (id: string) => (id === target ? 'pulse-ring' : '');
  const p: ViewProps = { s, act, ring, mobile, ctx };
  const nav = (view: SimView) => act({ t: 'nav', view });
  return (
    <div className="h-full flex bg-bg overflow-hidden" aria-label="Practice copy of RAMP" role="region">
      {!mobile && (
        <aside className="w-56 shrink-0 flex flex-col border-r border-line bg-white">
          <div className="flex items-center gap-2.5 px-4 h-14 shrink-0">
            <Logo size={26} />
            <span className="leading-tight min-w-0">
              <span className="block font-display font-bold tracking-[0.08em] text-sm">RAMP</span>
              <span className="block text-[11px] text-muted truncate">{ctx.org}</span>
            </span>
          </div>
          <nav aria-label="Practice menu" className="flex-1 overflow-y-auto px-2.5 py-1.5 flex flex-col gap-0.5">
            {NAV_DESKTOP.map((i) => (
              <button key={i.view} type="button" data-sim={`nav-${i.view}`} onClick={() => nav(i.view)}
                aria-current={navActive(s.view, i.view) ? 'page' : undefined}
                className={cx('flex items-center gap-2.5 min-h-11 px-3 rounded-xl text-sm font-semibold text-left cursor-pointer',
                  navActive(s.view, i.view) ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-chip', ring(`nav-${i.view}`))}>
                <Icon name={i.icon} size={19} />{i.label}
                {i.view === 'news' && !s.annRead && <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-amber text-ink text-[11px] font-bold flex items-center justify-center" aria-label="1 new">1</span>}
              </button>
            ))}
          </nav>
          <div className="border-t border-line p-2.5">
            <button type="button" data-sim="profile" onClick={() => nav('profile')}
              className={cx('w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left cursor-pointer hover:bg-chip', s.view === 'profile' && 'bg-brand-soft', ring('profile'))}>
              <Avatar name={ctx.first} size={32} />
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold truncate">{ctx.first}</span>
                <span className="block text-[11px] text-muted">Trainee</span>
              </span>
            </button>
          </div>
        </aside>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 h-12 md:h-14 flex items-center gap-2.5 px-3 md:px-5 bg-white border-b border-line">
          {mobile && <Logo size={24} />}
          <span className="font-display font-semibold text-[15px] truncate">{TITLES[s.view]}</span>
          <span className="ml-auto rounded-full bg-warn-soft text-warn text-[10px] font-extrabold tracking-[0.08em] px-2 py-0.5">PRACTICE</span>
          {mobile && (
            <button type="button" data-sim="profile" onClick={() => nav('profile')} aria-label="Your profile"
              className={cx('w-10 h-10 flex items-center justify-center rounded-full cursor-pointer', ring('profile'))}>
              <Avatar name={ctx.first} size={30} />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-4 md:px-6 md:py-5">
          <div key={s.view} className="rise">
            {s.view === 'home' && <HomeView {...p} />}
            {s.view === 'training' && <TrainingView {...p} />}
            {s.view === 'module' && <ModuleView {...p} />}
            {s.view === 'tasks' && <TasksView {...p} />}
            {s.view === 'notes' && <NotesView {...p} />}
            {s.view === 'chat' && <ChatView {...p} />}
            {s.view === 'resources' && <ResourcesView {...p} />}
            {s.view === 'news' && <NewsView {...p} />}
            {s.view === 'more' && <MoreView {...p} />}
            {s.view === 'profile' && <ProfileView {...p} />}
          </div>
        </div>
        {mobile && (
          <nav aria-label="Practice menu" className="shrink-0 grid grid-cols-5 h-16 bg-white border-t border-line px-1">
            {NAV_MOBILE.map((i) => {
              const on = navActive(s.view, i.view);
              return (
                <button key={i.view} type="button" data-sim={`nav-${i.view}`} onClick={() => nav(i.view)} aria-current={on ? 'page' : undefined}
                  className={cx('relative flex flex-col items-center justify-center gap-0.5 my-1 rounded-xl text-[11px] font-semibold cursor-pointer outline-offset-[-3px]!',
                    on ? 'text-brand-ink' : 'text-muted', ring(`nav-${i.view}`))}>
                  <span className={cx('w-12 h-7 rounded-full flex items-center justify-center', on && 'bg-brand-soft')}><Icon name={i.icon} size={21} /></span>
                  {i.label}
                  {i.view === 'more' && !s.annRead && <span aria-hidden="true" className="absolute top-1 right-[calc(50%-20px)] w-2 h-2 rounded-full bg-amber" />}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

function Box({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('bg-white border border-line rounded-2xl p-4', className)}>{children}</div>;
}
function H({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="font-display text-[16px] font-semibold">{children}</h3>
      {action}
    </div>
  );
}
function SimButton({ id, ring, onClick, children, icon, variant = 'primary' }: {
  id: string; ring: (id: string) => string; onClick: () => void; children: ReactNode; icon?: string; variant?: 'primary' | 'secondary';
}) {
  return (
    <button type="button" data-sim={id} onClick={onClick}
      className={cx('inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-xl text-sm font-semibold cursor-pointer shrink-0',
        variant === 'primary' ? 'bg-brand text-white hover:bg-brand-ink' : 'bg-white border border-line text-ink hover:bg-chip', ring(id))}>
      {icon && <Icon name={icon} size={17} />}{children}
    </button>
  );
}

function Announcement({ s, act, ring, id, ctx }: ViewProps & { id: string }) {
  return (
    <Box>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-[15px]">Welcome to the team</p>
        {s.annRead ? <Chip tone="good" icon="check">Read</Chip> : <Chip tone="warn">Please read</Chip>}
      </div>
      <p className="text-sm text-muted mt-1 leading-relaxed">Company-wide modules are live in Training. Start with Platform basics, then How we use tasks.</p>
      <p className="text-xs text-muted mt-2">{ctx.org} HR · today</p>
      {!s.annRead && <div className="mt-3"><SimButton id={id} ring={ring} onClick={() => act({ t: 'ack' })} icon="check" variant="secondary">Mark as read</SimButton></div>}
    </Box>
  );
}

function HomeView(p: ViewProps) {
  const { s, act, ctx } = p;
  const open = s.tasks.filter((t) => t.status !== 'done').slice(0, 3);
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <p className="text-xs text-muted">{fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h2 className="font-display text-xl font-bold">Hi {ctx.first}</h2>
      </div>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Box className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-brand-ink">Next up</span>
          <span className="font-display text-[16px] font-semibold">How we use tasks</span>
          <span className="text-[13px] text-muted">Slides and quiz · 15 min · Due in 3 days</span>
          <Progress value={s.moduleStarted ? 30 : 0} />
          <div className="pt-1"><SimButton id="home-continue" ring={p.ring} onClick={() => act({ t: 'nav', view: 'module' })}>{s.moduleStarted ? 'Continue' : 'Start'}</SimButton></div>
        </Box>
        <Announcement {...p} id="ann-ack" />
      </div>
      <Box>
        <H>Due soon</H>
        <ul className="flex flex-col">
          {open.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2 border-t border-line-2 first:border-t-0">
              <span className="text-sm font-medium min-w-0 truncate">{t.title}</span>
              <span className="text-xs text-muted shrink-0">{fmtDate(t.due)}</span>
            </li>
          ))}
        </ul>
      </Box>
    </div>
  );
}

function TrainingView({ act, ring }: ViewProps) {
  return (
    <div className="flex flex-col gap-3">
      <H>Assigned to you</H>
      {MODULES.map((m) => {
        const tappable = m.id === 'tasks';
        const body = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug">{m.title}</span>
              <span className="block text-xs text-muted mt-0.5">{m.meta}</span>
            </span>
            <Chip tone={m.chip.tone}>{m.chip.label}</Chip>
          </>
        );
        return tappable ? (
          <button key={m.id} type="button" data-sim="mod-row" onClick={() => act({ t: 'nav', view: 'module' })}
            className={cx('flex items-center gap-3 w-full min-h-16 px-4 py-3 rounded-2xl bg-white border border-line text-left cursor-pointer hover:border-brand-2', ring('mod-row'))}>
            {body}
          </button>
        ) : (
          <div key={m.id} className="flex items-center gap-3 min-h-16 px-4 py-3 rounded-2xl bg-white border border-line">{body}</div>
        );
      })}
      <p className="text-[13px] text-muted mt-1">Finished modules turn green. Your role track starts once these are done.</p>
    </div>
  );
}

function ModuleView({ s, act, ring }: ViewProps) {
  if (!s.moduleStarted) {
    return (
      <div className="flex flex-col gap-3.5">
        <button type="button" data-sim="mod-back" onClick={() => act({ t: 'nav', view: 'training' })} className="inline-flex items-center gap-1 min-h-10 text-sm font-semibold text-brand-ink cursor-pointer self-start">
          <Icon name="chevronLeft" size={17} />Training
        </button>
        <Box className="flex flex-col gap-3">
          <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-brand-ink">Company-wide</span>
          <h2 className="font-display text-xl font-bold leading-tight">How we use tasks</h2>
          <p className="text-sm text-ink-2 leading-relaxed">Why every request becomes a task, and how to move one along.</p>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
            <li className="flex gap-2"><Icon name="check" size={16} className="text-brand-ink mt-0.5" />Write a clear task with one owner</li>
            <li className="flex gap-2"><Icon name="check" size={16} className="text-brand-ink mt-0.5" />Use statuses correctly, especially In review</li>
          </ul>
          <div><SimButton id="mod-start" ring={ring} onClick={() => act({ t: 'startModule' })} icon="play">Start</SimButton></div>
        </Box>
      </div>
    );
  }
  const sl = SLIDES[s.slide]!;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => act({ t: 'nav', view: 'training' })} className="inline-flex items-center gap-1 min-h-10 text-sm font-semibold text-brand-ink cursor-pointer">
          <Icon name="x" size={17} />Close
        </button>
        <span className="text-xs text-muted">Step {s.slide + 1} of {SLIDES.length}</span>
      </div>
      <Progress value={((s.slide + 1) / SLIDES.length) * 100} />
      <Box className="flex flex-col gap-3 min-h-40">
        <h2 className="font-display text-xl font-bold leading-tight">{sl.title}</h2>
        <p className="text-[15px] text-ink-2 leading-relaxed">{sl.body}</p>
      </Box>
      <div className="flex justify-between gap-2">
        <button type="button" disabled={s.slide === 0} onClick={() => act({ t: 'slide', n: s.slide - 1 })}
          className="min-h-11 px-4 rounded-xl border border-line bg-white text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Back</button>
        <button type="button" disabled={s.slide === SLIDES.length - 1} onClick={() => act({ t: 'slide', n: s.slide + 1 })}
          className="min-h-11 px-4 rounded-xl bg-brand text-white text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );
}

function TasksView({ s, act, ring, mobile }: ViewProps) {
  const cols = TASK_ORDER.map((st) => ({ st, items: s.tasks.filter((t) => t.status === st) }));
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold">Practice board</h2>
          <p className="text-xs text-muted">Tasks move left to right as work gets done.</p>
        </div>
        <SimButton id="new-task" ring={ring} onClick={() => act({ t: 'newTask' })} icon="plus">New task</SimButton>
      </div>
      <div className={cx(mobile ? 'flex flex-col gap-3' : 'grid grid-cols-4 gap-3')}>
        {cols.map((c) => (
          <section key={c.st} className="bg-chip/70 rounded-2xl p-2.5 flex flex-col gap-2 min-w-0" aria-label={TASK_STATUS[c.st].label}>
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-ink-2">{TASK_STATUS[c.st].label}</span>
              <span className="text-xs text-muted">{c.items.length}</span>
            </div>
            {c.items.length === 0 && <p className="text-xs text-muted px-1 pb-1">Nothing here</p>}
            {c.items.map((t) => {
              const nextSt = TASK_ORDER[TASK_ORDER.indexOf(t.status) + 1];
              const id = t.mine ? 'task-move' : `task-move-${t.id}`;
              return (
                <div key={t.id} className={cx('bg-white rounded-xl p-3 flex flex-col gap-2 border', t.mine ? 'border-brand' : 'border-line')}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{t.title}</p>
                    <p className="text-xs text-muted mt-0.5">You · Due {fmtDate(t.due)}</p>
                  </div>
                  {nextSt ? (
                    <button type="button" data-sim={id} onClick={() => act({ t: 'moveTask', id: t.id })}
                      className={cx('inline-flex items-center gap-1 self-start min-h-9 px-2.5 rounded-lg bg-chip text-xs font-semibold text-ink-2 cursor-pointer hover:bg-brand-soft', ring(id))}>
                      Move to {TASK_STATUS[nextSt].label}<Icon name="chevronRight" size={14} />
                    </button>
                  ) : <Chip tone="good" icon="check" className="self-start">Done</Chip>}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

function NotesView({ s, act, ring, mobile, ctx }: ViewProps) {
  const page = s.pages.find((x) => x.id === s.openPage) || null;
  const list = (
    <div className="bg-white border border-line rounded-2xl p-1.5 flex flex-col">
      {s.pages.map((pg) => (
        <button key={pg.id} type="button" onClick={() => act({ t: 'openPage', id: pg.id })}
          className={cx('flex items-center justify-between gap-2 min-h-11 px-3 rounded-xl text-left text-sm cursor-pointer',
            s.openPage === pg.id ? 'bg-brand-soft text-brand-ink font-semibold' : 'text-ink-2 hover:bg-chip')}>
          <span className="flex items-center gap-2 min-w-0"><Icon name="fileText" size={16} /><span className="truncate">{pg.title}</span></span>
          {pg.isNew && <span className="text-[10px] font-extrabold tracking-[0.08em]">NEW</span>}
        </button>
      ))}
      <div className="flex items-center gap-2 min-h-11 px-3 text-sm text-muted"><Icon name="key" size={16} />Vault (only you)</div>
    </div>
  );
  const editor = page && (
    <Box className="flex flex-col gap-3 min-h-52">
      {mobile && (
        <button type="button" onClick={() => act({ t: 'openPage', id: null })} className="inline-flex items-center gap-1 min-h-9 text-sm font-semibold text-brand-ink cursor-pointer self-start">
          <Icon name="chevronLeft" size={16} />All pages
        </button>
      )}
      <p className="font-display text-xl font-bold">{page.title}</p>
      <p className="text-sm text-muted leading-relaxed">{page.isNew ? 'Start typing… Add notes from a module, checklists or files.' : 'Your notes from training live here.'}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t border-line-2">
        <span className="text-[13px] text-ink-2">{s.shared ? 'Shared with your mentor' : 'Only you can see this page'}</span>
        <Switch checked={s.shared} onChange={(on) => act({ t: 'share', on })} label="Share this page with your mentor" />
      </div>
    </Box>
  );
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[17px] font-semibold min-w-0 truncate"><span className="block truncate">{ctx.first}’s notebook</span></h2>
        <SimButton id="new-page" ring={ring} onClick={() => act({ t: 'newPage' })} icon="plus">New page</SimButton>
      </div>
      {mobile ? (page ? editor : list) : (
        <div className="grid grid-cols-[220px_1fr] gap-3.5 items-start">{list}{editor || <Box><p className="text-sm text-muted">Pick a page, or start a new one.</p></Box>}</div>
      )}
    </div>
  );
}

function ChatView({ s, act, ring, mobile, ctx }: ViewProps) {
  const rooms: { id: Channel; name: string; sub: string }[] = [
    { id: 'general', name: '# general', sub: 'Anything for everyone' },
    { id: 'new-hires', name: '# new-hires', sub: 'Questions while you train' },
    { id: 'dm', name: ctx.mentor, sub: 'Your mentor' },
  ];
  const draft = `Hi ${ctx.mentorFirst}! Ready to start.`;
  const list = (
    <div className="bg-white border border-line rounded-2xl p-1.5 flex flex-col">
      {rooms.map((r) => (
        <button key={r.id} type="button" data-sim={r.id === 'dm' ? 'dm-mentor' : `room-${r.id}`} onClick={() => act({ t: 'channel', c: r.id })}
          className={cx('flex items-center gap-3 min-h-14 px-3 rounded-xl text-left cursor-pointer',
            s.channel === r.id ? 'bg-brand-soft' : 'hover:bg-chip', r.id === 'dm' && ring('dm-mentor'))}>
          {r.id === 'dm' ? <Avatar name={ctx.mentor} size={32} tone="amber" /> : <span className="w-8 h-8 rounded-full bg-chip flex items-center justify-center text-muted"><Icon name="chat" size={16} /></span>}
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate">{r.name}</span>
            <span className="block text-xs text-muted truncate">{r.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
  const room = rooms.find((r) => r.id === s.channel);
  const convo = room && (
    <div className="bg-white border border-line rounded-2xl flex flex-col min-h-72">
      <div className="flex items-center gap-2 px-3 h-12 border-b border-line-2">
        {mobile && (
          <button type="button" data-sim="chat-back" onClick={() => act({ t: 'channel', c: null })} aria-label="Back to conversations"
            className={cx('w-9 h-9 -ml-1 rounded-lg flex items-center justify-center cursor-pointer hover:bg-chip', ring('chat-back'))}>
            <Icon name="chevronLeft" size={18} />
          </button>
        )}
        <span className="text-sm font-semibold truncate">{room.name}</span>
      </div>
      <div className="flex-1 flex flex-col gap-2.5 p-3">
        {room.id === 'dm' ? (
          <>
            <Bubble who={ctx.mentor}>Welcome, {ctx.first}! Say hi when you’re ready.</Bubble>
            {s.sent && <Bubble mine>{draft}</Bubble>}
            {s.reply && <Bubble who={ctx.mentor}>Great to have you here. Ask me anything, any time.</Bubble>}
          </>
        ) : (
          <>
            <Bubble who="Jordan Lee">Morning, everyone. Coffee’s on in the kitchen.</Bubble>
            <Bubble who="Priya Shah">Thanks! Who’s joining the 10 o’clock?</Bubble>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 p-2.5 border-t border-line-2">
        <div className="flex-1 min-w-0 min-h-11 px-3 flex items-center rounded-xl border border-line bg-white text-sm truncate">
          {room.id === 'dm' && !s.sent ? <span className="text-ink">{draft}</span> : <span className="text-muted">Message {room.id === 'dm' ? ctx.mentorFirst : room.name}…</span>}
        </div>
        <button type="button" data-sim={room.id === 'dm' ? 'send' : 'send-other'} aria-label="Send" disabled={room.id !== 'dm' || s.sent}
          onClick={() => act({ t: 'send' })}
          className={cx('w-11 h-11 rounded-xl bg-brand text-white flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0', room.id === 'dm' && ring('send'))}>
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-3.5">
      {mobile ? (convo || list) : (
        <div className="grid grid-cols-[230px_1fr] gap-3.5 items-start">{list}{convo || <Box><p className="text-sm text-muted">Pick a conversation.</p></Box>}</div>
      )}
    </div>
  );
}

function Bubble({ who, mine, children }: { who?: string; mine?: boolean; children: ReactNode }) {
  if (mine) return <div className="flex justify-end"><p className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-md bg-brand text-white text-sm leading-snug">{children}</p></div>;
  return (
    <div className="flex items-end gap-2">
      <Avatar name={who || '?'} size={26} tone="amber" />
      <div className="max-w-[80%]">
        <p className="text-[11px] text-muted mb-0.5">{who}</p>
        <p className="px-3.5 py-2 rounded-2xl rounded-bl-md bg-bg border border-line text-sm leading-snug">{children}</p>
      </div>
    </div>
  );
}

function ResourcesView({ s, act, ring }: ViewProps) {
  const open = RESOURCES.find((r) => r.id === s.resource);
  if (open) {
    return (
      <div className="flex flex-col gap-3.5">
        <button type="button" onClick={() => act({ t: 'resource', id: null })} className="inline-flex items-center gap-1 min-h-10 text-sm font-semibold text-brand-ink cursor-pointer self-start">
          <Icon name="chevronLeft" size={17} />All resources
        </button>
        <Box className="flex flex-col gap-2.5">
          <Chip className="self-start">{open.cat}</Chip>
          <h2 className="font-display text-xl font-bold">{open.title}</h2>
          <p className="text-[15px] text-ink-2 leading-relaxed">{open.body}</p>
          <p className="text-xs text-muted">In the real app, this opens the full document.</p>
        </Box>
      </div>
    );
  }
  const qq = s.query.trim().toLowerCase();
  const rows = RESOURCES.filter((r) => !qq || r.title.toLowerCase().includes(qq) || r.cat.toLowerCase().includes(qq));
  return (
    <div className="flex flex-col gap-3.5">
      <label className="relative block">
        <span className="sr-only">Search resources</span>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={17} /></span>
        <input type="search" value={s.query} onChange={(e) => act({ t: 'query', v: e.target.value })} placeholder="Search resources"
          className="w-full min-h-11 pl-9 pr-3 rounded-xl border border-line bg-white text-base" />
      </label>
      <div className="bg-white border border-line rounded-2xl overflow-hidden">
        {rows.length === 0 && <p className="text-sm text-muted p-4">No matches. Try “handbook”.</p>}
        {rows.map((r) => {
          const id = r.id === 'handbook' ? 'res-handbook' : `res-${r.id}`;
          return (
            <button key={r.id} type="button" data-sim={id} onClick={() => act({ t: 'resource', id: r.id })}
              className={cx('flex items-center gap-3 w-full min-h-14 px-4 py-2.5 border-t border-line-2 first:border-t-0 text-left cursor-pointer hover:bg-bg outline-offset-[-3px]!', ring(id))}>
              <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={r.cat === 'Tool' ? 'key' : 'fileText'} size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{r.title}</span>
                <span className="block text-xs text-muted">{r.cat}</span>
              </span>
              <Icon name="chevronRight" size={16} className="text-muted" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewsView(p: ViewProps) {
  return (
    <div className="flex flex-col gap-3.5">
      <Announcement {...p} id="news-ack" />
      <Box>
        <p className="font-semibold text-[15px]">New: board view for tasks</p>
        <p className="text-sm text-muted mt-1">Switch between a list and a board at the top of Tasks.</p>
      </Box>
    </div>
  );
}

function MoreView({ act, ring, s }: ViewProps) {
  const rows: { id: string; view: SimView | null; label: string; icon: string }[] = [
    { id: 'more-notes', view: 'notes', label: 'Notebook', icon: 'notes' },
    { id: 'more-resources', view: 'resources', label: 'Resources', icon: 'folder' },
    { id: 'more-news', view: 'news', label: 'News', icon: 'megaphone' },
    { id: 'more-profile', view: 'profile', label: 'Profile', icon: 'users' },
  ];
  return (
    <div className="bg-white border border-line rounded-2xl overflow-hidden">
      {rows.map((r) => (
        <button key={r.id} type="button" data-sim={r.id} onClick={() => r.view && act({ t: 'nav', view: r.view })}
          className={cx('flex items-center gap-3 w-full min-h-14 px-4 border-t border-line-2 first:border-t-0 text-left text-[15px] font-semibold cursor-pointer hover:bg-bg outline-offset-[-3px]!', ring(r.id))}>
          <Icon name={r.icon} size={20} className="text-brand-ink" />{r.label}
          {r.id === 'more-news' && !s.annRead && <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-amber text-[11px] font-bold flex items-center justify-center">1</span>}
          {!(r.id === 'more-news' && !s.annRead) && <Icon name="chevronRight" size={16} className="ml-auto text-muted" />}
        </button>
      ))}
    </div>
  );
}

function ProfileView({ ctx }: ViewProps) {
  return (
    <div className="flex flex-col gap-3.5">
      <Box className="flex items-center gap-3.5">
        <Avatar name={ctx.first} size={52} />
        <div className="min-w-0">
          <span className="block font-display text-lg font-bold truncate">{ctx.first}</span>
          <p className="text-sm text-muted">Trainee · {ctx.org}</p>
        </div>
      </Box>
      <Box>
        <H>Your details</H>
        <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Mentor</dt><dd className="font-medium">{ctx.mentor}</dd>
          <dt className="text-muted">Time zone</dt><dd className="font-medium">Your local time</dd>
          <dt className="text-muted">Documents</dt><dd className="font-medium">Signed copies are kept here</dd>
        </dl>
      </Box>
    </div>
  );
}
