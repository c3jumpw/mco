// @ts-nocheck
const P = 'p-1111-2222';
export const params = new URLSearchParams(location.search);
export const as = params.get('as') || sessionStorage.getItem('as') || 'client';
export const scenario = params.get('plan') || sessionStorage.getItem('plan') || 'empty';
sessionStorage.setItem('as', as); sessionStorage.setItem('plan', scenario);

export const AGENDA = [
  { key: 'intro', title: 'Introduce the company', minutes: 5, section: 'company' },
  { key: 'values', title: 'Core values and foundational principles', minutes: 10, section: 'values' },
  { key: 'projects', title: 'Overview of major projects', minutes: 10, section: 'projects' },
  { key: 'checklist', title: 'Day-to-day checklist for the role', minutes: 15, section: 'checklists' },
  { key: 'tools', title: 'Main tools and systems', minutes: 15, section: 'tools' },
  { key: 'milestones', title: 'Milestones and the success path, from probation to promotion', minutes: 10, section: 'milestones' },
  { key: 'break', title: 'Break', minutes: 15, section: null },
  { key: 'access', title: 'Access: workspace, accounts and tools', minutes: 20, section: 'tools' },
  { key: 'test_access', title: 'Test access: sign-in, messaging, notifications, bookmarks, mobile and documentation', minutes: 15, section: 'tools' },
  { key: 'walk_daily', title: 'Walkthrough: day-to-day activity (show, guide, then supervise)', minutes: 45, section: 'checklists' },
  { key: 'walk_a', title: 'Walkthrough: big project A', minutes: 30, section: 'projects' },
  { key: 'walk_b', title: 'Walkthrough: big project B', minutes: 30, section: 'projects' },
  { key: 'checklist_review', title: 'Checklist review', minutes: 10, section: 'checklists' },
  { key: 'timeblock_review', title: 'Time-block review', minutes: 10, section: 'schedules' },
];

const FULL = {
  company: { summary: 'We run three family dental clinics in Austin. Most new patients find us on Google and book by phone. We are known for same-week appointments.',
    public_info: 'Website: brightsmile.com\nServices: checkups, cleanings, braces\nCustomers: families within 20 minutes of a clinic',
    admin_info: 'Dr. Lee owns the clinics and approves anything over $200.\nMaria runs the front desk. Ask her about bookings.', presentation_url: 'https://docs.google.com/presentation/d/abc', files: [{ name: 'Team org chart.png', path: `launch/${P}/x-org.png` }, { name: 'Handbook.pdf', path: `launch/${P}/y-handbook.pdf` }] },
  values: [
    { id: 'v1', title: 'Own the outcome', practice: 'When something slips, say so early and bring a fix.' },
    { id: 'v2', title: 'Reply fast, even to say “on it”', practice: '' },
    { id: 'v3', title: 'Leave it better than you found it', practice: 'Fix one small thing in a document or process every day.' },
  ],
  projects: [
    { id: 'p1', name: 'Website refresh', priority: 'high', status: 'Design approved. Building the new pages.', progress: 45, challenges: 'Waiting on photos from the clinics\nOld blog posts link to pages that moved', links: ['https://trello.com/b/website'], files: [{ name: 'homepage-mock.png', path: `launch/${P}/z-home.png` }],
      objectives: [ { id: 'o1', title: 'Upload the new team photos', steps: ['Open the shared Photos folder', 'Pick the photos marked final', 'Resize each one to 800 px wide', 'Upload them to the Team page'] }, { id: 'o2', title: 'Fix broken links', steps: [] } ] },
    { id: 'p2', name: 'Patient reviews drive', priority: 'medium', status: 'Templates written', progress: 20, challenges: '', links: [], files: [], objectives: [] },
  ],
  checklists: [
    { id: 'c1', title: 'Daily routine', frequency: 'daily', items: [ { id: 'i1', title: 'Clear the support inbox', steps: ['Open the support inbox', 'Reply to anything under 24 hours old', 'Tag and assign anything you can’t answer'] }, { id: 'i2', title: 'Confirm tomorrow’s appointments', steps: [] } ] },
    { id: 'c2', title: 'Friday wrap-up', frequency: 'weekly', items: [ { id: 'i3', title: 'Send the weekly report', steps: ['Open the report template', 'Fill in this week’s numbers', 'Send it by Friday noon'] } ] },
  ],
  tools: [
    { id: 't1', name: 'Google Workspace', purpose: 'Email, calendar and shared drives', access_how: 'Dr. Lee creates the account. The sign-in link arrives by email.', url: 'https://mail.google.com', granted: true, tested: false },
    { id: 't2', name: 'Slack', purpose: 'Team chat', access_how: '', url: '', granted: false, tested: false },
    { id: 't3', name: 'Dentrix', purpose: 'Patient records and scheduling', access_how: 'Maria adds a user under Setup > Users.', url: '', granted: true, tested: true },
  ],
  milestones: [
    { id: 'm1', title: 'Follows the daily checklist with help', due_day: 7, scope: 'individual', why: 'Shows they know the routine.', reward: 'First check-in' },
    { id: 'm2', title: 'Runs the daily checklist on their own', due_day: 30, scope: 'individual', why: 'Frees up two hours of your day.', reward: '' },
    { id: 'm3', title: 'Owns the reviews drive', due_day: 60, scope: 'team', why: 'More 5-star reviews bring more patients.', reward: 'End of probation review' },
    { id: 'm4', title: 'Ready for promotion review', due_day: 90, scope: 'company', why: 'Consistent, trusted work.', reward: 'Promotion and a higher tier' },
    { id: 'm5', title: 'Learns the billing system', due_day: null, scope: 'individual', why: '', reward: '' },
  ],
  schedules: [
    { period: 'training', blocks: [
      { id: 'b1', days: 'Mon–Fri', start: '09:00', end: '10:00', focus: 'Inbox and messages' },
      { id: 'b2', days: 'Mon–Fri', start: '10:00', end: '12:00', focus: 'Training and walkthroughs' },
      { id: 'b3', days: 'Mon–Fri', start: '13:00', end: '15:00', focus: 'Practice with supervision' },
      { id: 'b4', days: 'Mon, Wed', start: '15:00', end: '16:00', focus: 'Checklist review' },
      { id: 'b5', days: 'Fri', start: '14:00', end: '16:00', focus: 'Weekly review' } ] },
    { period: 'post_training', blocks: [] },
    { period: 'staff', blocks: [ { id: 'b6', days: 'Mon–Fri', start: '09:00', end: '12:00', focus: 'Deep work on projects' } ] },
  ],
  run: { start: '09:00', started_at: null, finished_at: null },
};

function agendaFor(s) {
  const a = AGENDA.map((x) => ({ ...x, done: false, notes: '' }));
  if (s === 'running') {
    const now = Date.now();
    a.slice(0, 4).forEach((x, i) => { x.done = true; x.done_at = new Date(now - (60 - i * 10) * 60000 - 6 * 60000).toISOString(); });
    a[3].done_at = new Date(now - 7 * 60000 - 12000).toISOString();
    a[9].stage = 1;
    a[2].notes = 'Spend more time on the reviews drive tomorrow.';
  }
  return a;
}

export function makePlan(s) {
  if (s === 'none') return null;
  const data = s === 'empty' ? {} : JSON.parse(JSON.stringify(FULL));
  if (s === 'running') data.run = { start: '09:00', started_at: new Date(Date.now() - 70 * 60000).toISOString(), finished_at: null };
  const status = s === 'empty' || s === 'full' ? 'preparing' : s === 'ready' ? 'ready' : s === 'running' ? 'in_progress' : s === 'done' ? 'done' : 'preparing';
  return { placement_id: P, status, day1_date: s === 'empty' ? null : '2026-11-23', data, agenda: agendaFor(s), updated_by: null, created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-16T10:00:00Z' };
}

export const DB = {
  plan: makePlan(scenario),
  placement: { id: P, title: 'Front desk coordinator', status: 'onboarding', start_date: '2026-11-23', hours_per_week: 40, schedule: 'Mon–Fri 9–5',
    client: { id: 'c-1', name: 'Bright Smile Dental', timezone: 'America/Chicago' }, va: { id: 'm-va', name: 'Maria Santos' }, coach: { id: 'm-coach', name: 'Jordan Lee' }, tier: { name: 'Core', level: 1 } },
  saves: [],
};
export const PLACEMENT_ID = P;
