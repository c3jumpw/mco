// Getting-started tours: a short slide show for each kind of person, with a screenshot of the real page on every slide.
// Shown once on first sign-in (see TourHost) and any time from the Guide, More and Profile pages.
// Images live in public/guide-media and are retaken by tools/guide (npm run guide:shots); npm run guide:check fails the
// build if a slide's image is missing or a page in src/App.tsx has no guide section or slide.

export type TourRole = 'member' | 'guest' | 'coach' | 'admin' | 'client' | 'platform';

export interface TourCtx {
  rank: number; isAdmin: boolean; isClient: boolean; isSuper: boolean; agencyOn: boolean; linkedClient: boolean;
  work: boolean; coaching: boolean; chat: boolean; tasks: boolean;
}

export interface TourSlide {
  id: string;
  title: string;
  text: string;
  /** File in public/guide-media. */
  image: string;
  device: 'phone' | 'desktop';
  /** Where the slide's feature lives. */
  link?: { to: string; label: string };
  when?: (c: TourCtx) => boolean;
}

export interface Tour { role: TourRole; title: string; blurb: string; slides: TourSlide[] }

const agency = (c: TourCtx) => c.agencyOn;

export const TOURS: Tour[] = [
  {
    role: 'member',
    title: 'Getting started',
    blurb: 'A two-minute look at everything RAMP does for you.',
    slides: [
      { id: 'm-home', title: 'Welcome to RAMP', text: 'RAMP is where you train, onboard and find everything about your job. Home always shows what to do next.', image: 'home-1.webp', device: 'phone', link: { to: '/', label: 'Open Home' } },
      { id: 'm-training', title: 'Your training', text: 'Required modules come first, then the track for your role. Due dates and progress are on every module.', image: 'training-1.webp', device: 'phone', link: { to: '/training', label: 'Open Training' } },
      { id: 'm-module', title: 'Learning, one step at a time', text: 'Each module is a set of short slides, readings, videos and quick checks. Your place is saved, so you can stop and pick up later.', image: 'training-2.webp', device: 'phone' },
      { id: 'm-documents', title: 'Documents to fill in and sign', text: 'Onboarding forms, uploads and e-signatures are in your profile. Anything you still need to do is flagged.', image: 'documents-1.webp', device: 'phone', link: { to: '/me', label: 'Open your profile' } },
      { id: 'm-work', title: 'My work', text: 'Log your weekly hours, send them for approval, add your payout details and see your placement checklist and pay.', image: 'tour-work-1.webp', device: 'phone', link: { to: '/work', label: 'Open My work' }, when: (c) => c.agencyOn && c.work },
      { id: 'm-tasks', title: 'Tasks', text: 'Work your mentor or admin assigns, plus anything you add yourself. Tick things off as you go.', image: 'tasks-1.webp', device: 'desktop', link: { to: '/tasks', label: 'Open Tasks' }, when: (c) => c.tasks },
      { id: 'm-notebook', title: 'Your notebook', text: 'Private notes for what you learn. Share a page with your mentor when you want feedback.', image: 'notebook-1.webp', device: 'desktop', link: { to: '/notes', label: 'Open Notebook' } },
      { id: 'm-chat', title: 'Chat', text: 'Company channels and direct messages with your team, right inside RAMP.', image: 'chat-1.webp', device: 'desktop', link: { to: '/chat', label: 'Open Chat' }, when: (c) => c.chat },
      { id: 'm-resources', title: 'Resources and news', text: 'Policies, guides and tools in one place, and company news you may need to confirm you’ve read.', image: 'resources-1.webp', device: 'phone', link: { to: '/resources', label: 'Open Resources' } },
      { id: 'm-guide', title: 'Help is always here', text: 'The Guide explains every page with screenshots. You can replay this tour from the Guide or More at any time.', image: 'navigation-2.webp', device: 'phone', link: { to: '/guide', label: 'Open the Guide' } },
    ],
  },
  {
    role: 'guest',
    title: 'Getting started',
    blurb: 'What you can do with your guest access.',
    slides: [
      { id: 'g-home', title: 'Welcome to RAMP', text: 'Your guest access opens the training and resources shared with you. Home shows what to do next.', image: 'home-1.webp', device: 'phone', link: { to: '/', label: 'Open Home' } },
      { id: 'g-training', title: 'Your training', text: 'Work through the modules shared with you at your own pace. Your progress is saved.', image: 'training-1.webp', device: 'phone', link: { to: '/training', label: 'Open Training' } },
      { id: 'g-resources', title: 'Resources', text: 'Guides and documents the team has shared with guests.', image: 'resources-1.webp', device: 'phone', link: { to: '/resources', label: 'Open Resources' } },
      { id: 'g-profile', title: 'Your profile', text: 'Your details and any documents you’ve been asked to fill in.', image: 'profile-1.webp', device: 'phone', link: { to: '/me', label: 'Open your profile' } },
    ],
  },
  {
    role: 'coach',
    title: 'Getting started for mentors and leads',
    blurb: 'Your own tools, plus everything for looking after your people.',
    slides: [
      { id: 'c-home', title: 'Welcome to RAMP', text: 'Home shows your own training and tasks, and the work waiting for you to review.', image: 'home-1.webp', device: 'phone', link: { to: '/', label: 'Open Home' } },
      { id: 'c-team', title: 'Your team’s progress', text: 'Everyone you mentor or lead, with their onboarding, training and what’s overdue.', image: 'team-1.webp', device: 'desktop', link: { to: '/team', label: 'Open My team' } },
      { id: 'c-reviews', title: 'Reviewing work', text: 'Assignments that need your review show up here. Approve them or send them back with feedback.', image: 'reviews-1.webp', device: 'desktop', link: { to: '/team', label: 'Open reviews' } },
      { id: 'c-member', title: 'One person at a glance', text: 'Open anyone on your team for their training, documents, tasks and shared notes, and assign them work.', image: 'team-member-1.webp', device: 'desktop' },
      { id: 'c-coaching', title: 'Coaching placed team members', text: 'Check-ins, onboarding checklists and training for the team members you coach at clients.', image: 'tour-coaching-1.webp', device: 'desktop', link: { to: '/coaching', label: 'Open Coaching' }, when: (c) => c.agencyOn && c.coaching },
      { id: 'c-training', title: 'Your own training', text: 'Mentors and leads have training too. It’s on the Training page, just like everyone else’s.', image: 'training-1.webp', device: 'phone', link: { to: '/training', label: 'Open Training' } },
      { id: 'c-guide', title: 'Help is always here', text: 'The Guide covers every page you can open, with screenshots. Replay this tour from the Guide or More.', image: 'navigation-1.webp', device: 'desktop', link: { to: '/guide', label: 'Open the Guide' } },
    ],
  },
  {
    role: 'admin',
    title: 'Getting started for admins',
    blurb: 'Set up your company, build training, bring people in and run it day to day.',
    slides: [
      { id: 'a-portal', title: 'The Admin portal', text: 'Everything you set up and manage is here, grouped by what you’re doing.', image: 'admin-home-1.webp', device: 'desktop', link: { to: '/admin', label: 'Open the Admin portal' } },
      { id: 'a-org', title: 'Your organization', text: 'Company name, brand colour, time zone and the welcome message new people see first.', image: 'org-1.webp', device: 'desktop', link: { to: '/admin/org', label: 'Open Organization' } },
      { id: 'a-roles', title: 'Roles and departments', text: 'Set up job roles and departments. Each role gets its own training track.', image: 'roles-1.webp', device: 'desktop', link: { to: '/admin/roles', label: 'Open Roles' } },
      { id: 'a-flow', title: 'The welcome flow', text: 'The steps every new person goes through on their first sign-in. Turn steps on or off and preview it.', image: 'flow-1.webp', device: 'desktop', link: { to: '/admin/flow', label: 'Open Welcome flow' } },
      { id: 'a-documents', title: 'Documents', text: 'Build fillable forms, uploads, e-sign documents and checklists for onboarding.', image: 'documents-admin-1.webp', device: 'desktop', link: { to: '/admin/documents', label: 'Open Documents' } },
      { id: 'a-training', title: 'Training modules', text: 'Build modules with slides, readings, videos, quizzes and assignments. Your workspace starts with a library to adapt.', image: 'training-admin-1.webp', device: 'desktop', link: { to: '/admin/training', label: 'Open Training modules' } },
      { id: 'a-assign', title: 'Assigning training', text: 'Pick the modules everyone takes and the track for each role. New people get them automatically.', image: 'assign-1.webp', device: 'desktop', link: { to: '/admin/assign', label: 'Open Assign training' } },
      { id: 'a-people', title: 'Bringing people in', text: 'Invite new hires one at a time or in a batch. RAMP gives you the message to send them.', image: 'people-1.webp', device: 'desktop', link: { to: '/admin/people', label: 'Open People' } },
      { id: 'a-person', title: 'A person’s record', text: 'Onboarding, training, documents, access and history for anyone on the team.', image: 'person-1.webp', device: 'desktop' },
      { id: 'a-metrics', title: 'Metrics', text: 'Onboarding and training progress across the team, with an export.', image: 'metrics-1.webp', device: 'desktop', link: { to: '/admin/metrics', label: 'Open Metrics' } },
      { id: 'a-comms', title: 'Announcements and resources', text: 'Post news, require people to confirm they’ve read it, and keep policies and guides in one place.', image: 'news-admin-1.webp', device: 'desktop', link: { to: '/admin/news', label: 'Open Announcements' } },
      { id: 'a-system', title: 'System and audit', text: 'Switch tools on or off and see the audit log of sensitive actions.', image: 'system-1.webp', device: 'desktop', link: { to: '/admin/system', label: 'Open System' } },
      { id: 'a-account', title: 'Account and billing', text: 'Your plan, seats and the organizations in your account. Owners can add an organization and choose a plan here.', image: 'tour-account-1.webp', device: 'desktop', link: { to: '/admin/account', label: 'Open Account and billing' } },
      { id: 'a-agency', title: 'Agency dashboard', text: 'Revenue, margin and what needs you today across clients and placements.', image: 'tour-agency-1.webp', device: 'desktop', link: { to: '/admin/agency', label: 'Open the Agency dashboard' }, when: agency },
      { id: 'a-clients', title: 'Clients', text: 'The companies you place team members with: contacts, billing, training track and requests.', image: 'tour-client-1.webp', device: 'desktop', link: { to: '/admin/clients', label: 'Open Clients' }, when: agency },
      { id: 'a-placements', title: 'Placements', text: 'Each team member placed with a client: rates, onboarding checklist, check-ins, hours and launch plan.', image: 'tour-placement-1.webp', device: 'desktop', link: { to: '/admin/placements', label: 'Open Placements' }, when: agency },
      { id: 'a-launch', title: 'Launch plans', text: 'A guided prep plan and a Day 1 run sheet for every new placement, filled in with the client.', image: 'tour-launch-1.webp', device: 'desktop', when: agency },
      { id: 'a-timesheets', title: 'Hours', text: 'Approve the hours team members send, or enter them for someone.', image: 'tour-timesheets-1.webp', device: 'desktop', link: { to: '/admin/timesheets', label: 'Open Timesheets' }, when: agency },
      { id: 'a-invoices', title: 'Invoices', text: 'Bill clients for hours, prepayments and setup fees. Print them or send them through Stripe.', image: 'tour-invoices-1.webp', device: 'desktop', link: { to: '/admin/invoices', label: 'Open Invoices' }, when: agency },
      { id: 'a-payouts', title: 'Payouts', text: 'Pay team members for approved hours and export the Wise batch file.', image: 'tour-payouts-1.webp', device: 'desktop', link: { to: '/admin/payouts', label: 'Open Payouts' }, when: agency },
      { id: 'a-tiers', title: 'Tiers and agency settings', text: 'Skill tiers with default rates, plus the checklist, check-in schedule, invoicing and Day 1 agenda.', image: 'tour-tiers-1.webp', device: 'desktop', link: { to: '/admin/tiers', label: 'Open Tiers' }, when: agency },
      { id: 'a-guide', title: 'Help is always here', text: 'The Admin guide explains every setting with screenshots. Replay this tour from the Guide or More.', image: 'navigation-1.webp', device: 'desktop', link: { to: '/guide?view=admin', label: 'Open the Admin guide' } },
    ],
  },
  {
    role: 'client',
    title: 'Getting started',
    blurb: 'Everything about your team members, in one place.',
    slides: [
      { id: 'cl-home', title: 'Your overview', text: 'Each team member placed with you, their onboarding and training, this week’s hours and anything waiting for you.', image: 'tour-client-home-1.webp', device: 'phone', link: { to: '/client', label: 'Open your overview' } },
      { id: 'cl-launch', title: 'Prepare for Day 1', text: 'Your launch plan walks you through the prep, step by step, with examples. RAMP shows anything still missing.', image: 'tour-launch-1.webp', device: 'desktop' },
      { id: 'cl-day1', title: 'Run Day 1', text: 'A timed run sheet with live clock times. Tick items off as you go, or print it.', image: 'tour-launch-2.webp', device: 'desktop' },
      { id: 'cl-plan', title: 'The finished plan', text: 'Everything in one document your team member reads before Day 1. Print it or save it as a PDF.', image: 'tour-launch-3.webp', device: 'desktop' },
      { id: 'cl-hours', title: 'Approve hours', text: 'Team members send their hours each week. Approve them, or send them back with a note.', image: 'tour-client-hours-1.webp', device: 'phone', link: { to: '/client/hours', label: 'Open Hours' } },
      { id: 'cl-invoices', title: 'Invoices', text: 'Every invoice, what’s due and when. Pay online when there’s a Pay button.', image: 'tour-client-invoices-1.webp', device: 'phone', link: { to: '/client/invoices', label: 'Open Invoices' } },
      { id: 'cl-help', title: 'Feedback and requests', text: 'Share feedback after check-ins, or ask for help, more hours or another team member from your overview.', image: 'tour-client-home-2.webp', device: 'phone', link: { to: '/client', label: 'Open your overview' } },
    ],
  },
  {
    role: 'platform',
    title: 'Running RAMP for other companies',
    blurb: 'Your platform console: client accounts, free access, plans and support.',
    slides: [
      { id: 'p-requests', title: 'New company requests', text: 'Companies create a login and ask for a workspace. They show up here for you to approve or decline.', image: 'tour-console-1.webp', device: 'desktop', link: { to: '/platform', label: 'Open Client accounts' } },
      { id: 'p-approve', title: 'Approve with free access', text: 'Pick Free access while you test, a Trial, or Paid, and how many seats they get. Their workspace starts with a copy of your library.', image: 'tour-console-2.webp', device: 'desktop' },
      { id: 'p-accounts', title: 'Manage accounts', text: 'Change a plan or seats, pause or close an account, and open any workspace as RAMP Support.', image: 'tour-console-3.webp', device: 'desktop' },
      { id: 'p-settings', title: 'Defaults and plans', text: 'Trial length, seats, the library new workspaces copy, and the Stripe plans owners can choose.', image: 'tour-console-4.webp', device: 'desktop' },
      { id: 'p-switch', title: 'Switch workspaces', text: 'Move between your workspace and any client’s. A banner shows when you’re there as RAMP Support.', image: 'tour-switcher-1.webp', device: 'desktop' },
      { id: 'p-signup', title: 'How new companies join', text: 'After creating a login, a company tells you about itself with Start for my business and waits for your approval.', image: 'tour-signup-1.webp', device: 'phone' },
      { id: 'p-setup', title: 'Their first steps', text: 'Once approved, their admins see a short setup wizard: company details, what came from your library and their first invites.', image: 'tour-setup-1.webp', device: 'desktop' },
    ],
  },
];

/** The tour for the signed-in person (the platform tour is offered separately, to platform admins). */
export function tourRoleFor(c: TourCtx): TourRole {
  if (c.isClient) return 'client';
  if (c.isAdmin) return 'admin';
  if (c.rank <= 4) return 'coach';
  if (c.rank === 7) return 'guest';
  return 'member';
}

export function slidesFor(role: TourRole, c: TourCtx): TourSlide[] {
  const t = TOURS.find((x) => x.role === role);
  return (t?.slides || []).filter((s) => !s.when || s.when(c));
}

/** Bump a tour's version when its slides change enough that everyone should see it again. */
export const TOUR_VERSION = 1;

// ───────── What's new: shown once after an update to the people it applies to ─────────

export interface Release { id: string; date: string; title: string; roles: TourRole[]; slides: TourSlide[] }

/** Newest first. Add an entry for every update people should know about; the coverage check runs over these too. */
export const RELEASES: Release[] = [
  {
    id: '2026-11-agency-workspaces',
    date: '2026-11-18',
    title: 'New in RAMP',
    roles: ['admin', 'platform'],
    slides: [
      { id: 'n-agency', title: 'Agency tools', text: 'Clients, placements, hours, invoices and payouts for team members you place with other companies.', image: 'tour-agency-1.webp', device: 'desktop', link: { to: '/admin/agency', label: 'Open the Agency dashboard' }, when: agency },
      { id: 'n-launch', title: 'Launch plans', text: 'A guided Day 1 prep plan and run sheet for every placement, shared with the client.', image: 'tour-launch-1.webp', device: 'desktop', when: agency },
      { id: 'n-account', title: 'Account and billing', text: 'See your plan and seats, and add another organization to your account.', image: 'tour-account-1.webp', device: 'desktop', link: { to: '/admin/account', label: 'Open Account and billing' } },
      { id: 'n-console', title: 'Client accounts', text: 'Approve companies that sign up for RAMP and give them free access while you test.', image: 'tour-console-1.webp', device: 'desktop', link: { to: '/platform', label: 'Open Client accounts' }, when: (c) => c.isSuper },
    ],
  },
];
