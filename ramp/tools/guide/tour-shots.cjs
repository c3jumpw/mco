// Screenshots used by the getting-started tours (src/guide/tours.ts) and the newer Guide sections.
// Each shot: id (file name in public/guide-media), data set, persona (?as=), URL, device and optional prep.
// Taken by run.cjs (npm run guide:shots). Tour slides that show older features reuse the Guide's own screenshots.
const u = (b, n) => `${b}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CORE = { client: u('20000000', 2), placement: u('50000000', 1) };
const MONEY = { invoice: u('40', 5) };
const WORK = { placement: 'p1000000-0000-4000-8000-000000000001' };
const LAUNCH = 'p-1111-2222';
const LEARN = 'd0000000-0000-4000-8000-000000000001';
/** Open a module and go to step n. */
const step = async (p, n) => {
  // Admin preview moves freely between steps; hide its preview labels so the shot looks like a learner's view.
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('header span, main + div, div')) {
      if (el.textContent === 'PREVIEW' || (el.textContent?.startsWith('Preview. Nothing is saved') && el.children.length <= 1)) (el.closest('div.bg-ink') || el).remove();
    }
  });
  await p.locator('footer button').last().click();
  for (let i = 1; i < n; i++) { await p.waitForTimeout(120); await p.locator('footer button').last().click(); }
  await p.waitForTimeout(500);
  await p.evaluate(() => window.scrollTo(0, 0));
};

const click = (name) => async (p) => { await p.getByRole('button', { name, exact: false }).first().click(); await p.waitForTimeout(500); };
const scrollTo = (text) => async (p) => {
  await p.getByText(text, { exact: false }).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70));
  await p.waitForTimeout(300);
};

const TOUR_SHOTS = [
  // team members
  { id: 'tour-work-1', data: 'work', as: 'va', url: '/work', device: 'phone' },
  // mentors and leads
  { id: 'tour-coaching-1', data: 'work', as: 'coach', url: '/coaching', device: 'desktop' },
  { id: 'tour-coaching-2', data: 'work', as: 'coach', url: `/coaching/${WORK.placement}`, device: 'desktop' },
  // admins
  { id: 'tour-account-1', data: 'work', as: 'owner', url: '/admin/account?ws=owner', device: 'desktop' },
  { id: 'tour-agency-1', data: 'core', as: 'avery', url: '/admin/agency', device: 'desktop' },
  { id: 'tour-client-1', data: 'core', as: 'avery', url: `/admin/clients/${CORE.client}`, device: 'desktop' },
  { id: 'tour-placement-1', data: 'core', as: 'avery', url: `/admin/placements/${CORE.placement}`, device: 'desktop' },
  { id: 'tour-tiers-1', data: 'core', as: 'avery', url: '/admin/tiers', device: 'desktop' },
  { id: 'tour-agency-settings-1', data: 'core', as: 'avery', url: '/admin/agency/settings', device: 'desktop' },
  { id: 'tour-timesheets-1', data: 'money', url: '/admin/timesheets', device: 'desktop' },
  { id: 'tour-invoices-1', data: 'money', url: `/admin/invoices/${MONEY.invoice}`, device: 'desktop' },
  { id: 'tour-payouts-1', data: 'money', url: '/admin/payouts', device: 'desktop' },
  { id: 'tour-launch-1', data: 'launch', as: 'client', url: `/launch/${LAUNCH}?plan=full&tab=prepare`, device: 'desktop' },
  { id: 'tour-launch-2', data: 'launch', as: 'client', url: `/launch/${LAUNCH}?plan=full&tab=day1`, device: 'desktop' },
  { id: 'tour-launch-3', data: 'launch', as: 'client', url: `/launch/${LAUNCH}?plan=full&tab=plan`, device: 'desktop' },
  // clients
  { id: 'tour-client-home-1', data: 'work', as: 'client', url: '/client', device: 'phone' },
  { id: 'tour-client-home-2', data: 'work', as: 'client', url: '/client', device: 'phone', prep: scrollTo('Requests') },
  { id: 'tour-client-hours-1', data: 'work', as: 'client', url: '/client/hours', device: 'phone' },
  { id: 'tour-client-invoices-1', data: 'work', as: 'client', url: '/client/invoices', device: 'phone' },
  // interactive lessons (sample module in tools/guide/datasets/work/learn-demo.ts) and the RAMP Assistant
  { id: 'learn-scenario-1', data: 'work', as: 'trainee', url: `/training/${LEARN}`, device: 'phone',
    prep: async (p) => { await step(p, 2); await p.locator('main [role=listitem] button').nth(1).click(); await p.waitForTimeout(400); } },
  { id: 'learn-sort-1', data: 'work', as: 'admin', url: `/training/${LEARN}?preview=1`, device: 'desktop', height: 1000, prep: (p) => step(p, 3) },
  { id: 'learn-tasks-1', data: 'work', as: 'admin', url: `/training/${LEARN}?preview=1`, device: 'desktop', height: 1150, prep: (p) => step(p, 4) },
  { id: 'learn-calendar-1', data: 'work', as: 'admin', url: `/training/${LEARN}?preview=1`, device: 'desktop', height: 1150,
    prep: async (p) => {
      await step(p, 5);
      for (const [b, t] of [['Review the vendor contract', '9:30 AM'], ['Return customer calls', '1:30 PM']]) {
        await p.locator('main').getByRole('button', { name: new RegExp(b) }).first().click();
        await p.locator('main').getByRole('button', { name: `Start at ${t}` }).click();
      }
      await p.evaluate(() => window.scrollTo(0, 0));
    } },
  { id: 'learn-inbox-1', data: 'work', as: 'admin', url: `/training/${LEARN}?preview=1`, device: 'desktop', height: 1050, prep: (p) => step(p, 6) },
  { id: 'assistant-1', data: 'work', as: 'admin', url: '/admin/training/assistant', device: 'desktop', height: 1300 },
  // change log and What's new
  { id: 'changelog-1', data: 'work', as: 'admin', url: '/admin/changelog', device: 'desktop' },
  { id: 'whats-new-1', data: 'work', as: 'trainee', url: '/', device: 'phone',
    prep: async (p) => { await p.evaluate(() => window.dispatchEvent(new CustomEvent('ramp:whatsnew', { detail: { since: '2026-11-17-agency' } }))); await p.waitForTimeout(600); } },
  // platform
  { id: 'tour-console-1', data: 'work', as: 'owner', url: '/platform?ws=super', device: 'desktop' },
  { id: 'tour-console-2', data: 'work', as: 'owner', url: '/platform?ws=super', device: 'desktop', prep: click('Approve') },
  { id: 'tour-console-3', data: 'work', as: 'owner', url: '/platform?ws=super', device: 'desktop',
    prep: async (p) => { await click('Accounts')(p); await p.getByRole('button', { name: /Bright Smile Dental/ }).first().click(); await p.waitForTimeout(500); } },
  { id: 'tour-console-4', data: 'work', as: 'owner', url: '/platform?ws=super', device: 'desktop', prep: click('Settings') },
  { id: 'tour-switcher-1', data: 'work', as: 'owner', url: '/?ws=support', device: 'desktop', prep: click('Switch workspace') },
  { id: 'tour-setup-1', data: 'work', as: 'owner', url: '/setup?ws=setup', device: 'desktop' },
  { id: 'tour-signup-1', data: 'work', url: '/?state=no_access', device: 'phone', prep: click('Start for my business') },
  { id: 'tour-pending-1', data: 'work', url: '/?state=account_pending', device: 'phone' },
];

module.exports = { TOUR_SHOTS };
