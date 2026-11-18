// The Guide's screenshots (src/guide/guide.json), each with hotspots measured from real element boxes.
// Taken by run.cjs (npm run guide:shots).
const { settle } = require('./lib.cjs');
const IDS = {
  jordan: '10000000-0000-4000-8000-000000000006', marcus: '10000000-0000-4000-8000-000000000009',
  security: '40000000-0000-4000-8000-000000000005', tasksMod: '40000000-0000-4000-8000-000000000003',
  payroll: '50000000-0000-4000-8000-000000000003', notePage: '80000000-0000-4000-8000-000000000001',
  dmSam: '60000000-0000-4000-8000-000000000011', general: '60000000-0000-4000-8000-000000000002', ops: '60000000-0000-4000-8000-000000000004',
  announcements: '60000000-0000-4000-8000-000000000001', newhires: '60000000-0000-4000-8000-000000000003', dmRiley: '60000000-0000-4000-8000-000000000012',
};

const side = (p, href) => p.locator(`aside nav a[href="${href}"]`).first();
const bottom = (p, href) => p.locator('nav[aria-label="Main"]').last().locator(`a[href="${href}"]`);
const btn = (p, name, exact = true) => p.getByRole('button', { name, exact }).first();
const link = (p, name, exact = true) => p.getByRole('link', { name, exact }).first();
const card = (p, text) => p.locator('section.bg-card, section.rounded-2xl, div.bg-card').filter({ hasText: text }).last();
async function scrollTop(p, loc, offset = 16) {
  await loc.evaluate((el, off) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off), offset);
  await p.waitForTimeout(200);
}

// Each hotspot: { label, text, at: (page) => Locator | Locator[] , pad }
const SHOTS = [
  // ───────── start ─────────
  {
    id: 'sign-in-1', device: 'phone', url: '/?state=signed_out',
    caption: 'Signing in', alt: 'RAMP sign-in screen on a phone with Sign in selected, email and password fields, the Sign in button and the Forgot your password link.',
    prep: async (p) => { await p.getByLabel('Work or personal email').fill('jordan.lee@example.com'); await p.locator('input[type=password]').fill('correct-horse-42'); },
    hotspots: [
      { label: 'Sign in or New here', text: 'Pick **New here** the first time you use RAMP. After that, stay on **Sign in**.', at: (p) => p.getByRole('group', { name: 'Sign in or create a login' }) },
      { label: 'Email', text: 'Use the address your invitation went to. RAMP matches your login to your invite by email.', at: (p) => p.getByLabel('Work or personal email') },
      { label: 'Password', text: 'Tap the eye to check what you typed.', at: (p) => p.locator('input[type=password]').locator('..') },
      { label: 'Sign in', text: 'Opens your Home screen, or the welcome flow if you haven’t finished setup.', at: (p) => p.locator('form button[type=submit]') },
      { label: 'Forgot your password?', text: 'Sends a link to choose a new password.', at: (p) => btn(p, 'Forgot your password?') },
    ],
  },
  {
    id: 'sign-in-2', device: 'phone', url: '/?join=1&state=signed_out',
    caption: 'Creating your login with New here', alt: 'The New here tab on a phone: Create your login, with the invited email filled in, a password and the Create login button.',
    prep: async (p) => { await p.getByLabel('Work or personal email').fill('marcus.diaz@example.com'); await p.locator('input[type=password]').fill('lighthouse-orbit-7'); },
    hotspots: [
      { label: 'New here', text: 'The tab for creating your login. Your invite link may open it for you.', at: (p) => p.getByRole('button', { name: 'New here' }) },
      { label: 'Invited email', text: 'Type the exact email HR invited. A different address won’t match your invite.', at: (p) => p.getByLabel('Work or personal email') },
      { label: 'New password', text: 'At least 8 characters. Use one you don’t use anywhere else.', at: (p) => p.locator('input[type=password]').locator('xpath=ancestor::label[1]') },
      { label: 'Create login', text: 'We email you a confirmation link. Open it on the same device to finish.', at: (p) => p.locator('form button[type=submit]') },
    ],
  },
  {
    id: 'navigation-1', device: 'desktop', as: 'admin', url: '/',
    caption: 'On a computer: the sidebar', alt: 'RAMP Home on a computer, signed in as an admin. The left sidebar lists Home, Training, Tasks, Notebook, Chat, Resources, News, Team progress, Guide and the Admin portal, with the profile and sign-out button at the bottom.',
    hotspots: [
      { label: 'Main menu', text: 'Every page you use day to day. The highlighted item is where you are.', at: (p) => [side(p, '/'), side(p, '/resources')] },
      { label: 'Badges', text: 'Amber numbers count news you still need to confirm and work waiting for your review.', at: (p) => [side(p, '/news'), side(p, '/team')] },
      { label: 'Guide', text: 'Opens this guide, filtered to what you can do.', at: (p) => side(p, '/guide') },
      { label: 'Admin portal', text: 'Owners and admins only. Opens setup, people, metrics and system pages.', at: (p) => side(p, '/admin') },
      { label: 'Your profile', text: 'Your details, documents, sign-in history and password.', at: (p) => p.locator('aside a[href="/me"]') },
      { label: 'Sign out', text: 'Signs you out on this device.', at: (p) => p.locator('aside button[aria-label="Sign out"]') },
    ],
  },
  {
    id: 'navigation-2', device: 'phone', as: 'trainee', url: '/more',
    caption: 'On a phone: the bottom bar and More', alt: 'The More page on a phone, with the bottom bar showing Home, Training, Tasks, Chat and More. More lists the profile, Notebook, Resources, News, Guide, Vault, the getting-started tour, the practice sandbox and Sign out.',
    hotspots: [
      { label: 'Bottom bar', text: 'Home, Training, Tasks and Chat are always one tap away.', at: (p) => [bottom(p, '/'), bottom(p, '/chat')] },
      { label: 'More', text: 'Everything else. An amber dot means unread news or work to review.', at: (p) => bottom(p, '/more') },
      { label: 'Profile and documents', text: 'Your details, documents and sign-in history.', at: (p) => p.locator('main a[href="/me"]').first() },
      { label: 'Other pages', text: 'Notebook, Resources, News, this Guide and your Vault.', at: (p) => p.locator('main section').filter({ hasText: 'Vault' }).first() },
      { label: 'Tour and sandbox', text: 'Replay the getting-started slides, or try things in the practice sandbox without touching real work.', at: (p) => [p.locator('main button', { hasText: 'Getting-started tour' }), link(p, 'Practice in the sandbox', false)] },
      { label: 'Sign out', text: 'Signs you out on this phone.', at: (p) => p.locator('main button', { hasText: 'Sign out' }) },
    ],
  },
  {
    id: 'welcome-flow-1', device: 'phone', as: 'new', url: '/welcome', height: 1180,
    storage: { [`ramp-welcome-step:${IDS.marcus}`]: '"documents"' },
    caption: 'The documents step of the welcome flow', alt: 'The welcome flow on a phone at step 4 of 6, Documents. Two documents are done and two are still to do, with Fill out and Review and sign buttons, and a disabled Continue button showing 2 left.',
    hotspots: [
      { label: 'Steps', text: 'One bar per step. Amber is where you are. Tap a finished step to go back to it.', at: (p) => p.getByRole('navigation', { name: 'Setup progress' }) },
      { label: 'Done', text: 'Tap **View** to see what you sent, or **Submit again** to update it.', at: (p) => p.locator('main li').filter({ hasText: 'New employee information' }) },
      { label: 'Still to do', text: 'Tap **Fill out**, **Upload** or **Review and sign** to complete it.', at: (p) => p.locator('main li').filter({ hasText: 'Payroll and direct deposit' }) },
      { label: 'Continue', text: 'Unlocks once every document is in. The counter says how many are left.', at: (p) => [p.getByText('2 left'), btn(p, 'Continue')] },
      { label: 'Sign out', text: 'Stop for now. Next time you sign in, you pick up at this step.', at: (p) => btn(p, 'Sign out') },
    ],
  },
  {
    id: 'practice-1', device: 'phone', as: 'new', url: '/practice?return=%2Fwelcome',
    caption: 'A practice mission', alt: 'The practice sandbox on a phone. A dark mission card reads Mission 3 of 9, Create a task, and a glowing amber outline marks the New task button in the sample task board.',
    prep: async (p) => {
      for (let i = 0; i < 4; i++) { await p.locator('.pulse-ring').first().click(); await p.waitForTimeout(350); }
      await settle(p, 300);
    },
    hotspots: [
      { label: 'Mission', text: 'What to do next, with a hint. The bars show how many missions you’ve done.', at: (p) => p.locator('section[aria-live="polite"]') },
      { label: 'Glowing outline', text: 'Tap the outlined spot to complete the mission. A green note confirms it.', at: (p) => p.locator('.pulse-ring').first(), pad: 8 },
      { label: 'Practice copy', text: 'Sample content only. Tap around freely: nothing here touches your real work.', at: (p) => p.locator('div.bg-amber.h-1').locator('..') },
      { label: 'Exit', text: 'Leave whenever you like. Platform basics stays in Training until you finish.', at: (p) => btn(p, 'Exit practice') },
    ],
  },

  // ───────── daily ─────────
  {
    id: 'home-1', device: 'phone', as: 'trainee', url: '/', height: 1350,
    caption: 'A trainee’s Home screen', alt: 'Home on a phone for a trainee: a purple Next up card for Communication and chat basics with a Continue button, a Training progress card at 33 percent with what’s coming up, and the Getting started checklist.',
    hotspots: [
      { label: 'Next up', text: 'Your next module, its due date and how far you got. Tap **Continue** or **Start**.', at: (p) => p.locator('section[aria-labelledby="next-up-title"]') },
      { label: 'Training progress', text: 'How much assigned training is done, what’s waiting for review and what’s coming up.', at: (p) => p.locator('main div.bg-card').filter({ hasText: 'Training progress' }).first() },
      { label: 'Getting started', text: 'Your first-week checklist. Tap an open item to do it right away.', at: (p) => p.locator('main section').filter({ hasText: 'Getting started' }).first() },
      { label: 'Profile', text: 'Your details, documents and sign-in history.', at: (p) => p.locator('header a[href="/me"]') },
      { label: 'Menu', text: 'Switch pages here. **More** holds everything else.', at: (p) => p.locator('nav[aria-label="Main"]').last() },
    ],
  },
  {
    id: 'training-1', device: 'phone', as: 'trainee', url: '/training', height: 1350,
    caption: 'Your training list', alt: 'The Training page on a phone: an Assigned training summary at 33 percent with a Continue next button, filter pills, and module cards with status, minutes, due date and progress.',
    hotspots: [
      { label: 'Assigned training', text: 'Everything required for you, as one percentage.', at: (p) => p.locator('main div.bg-card').filter({ hasText: 'Assigned training' }).first() },
      { label: 'Continue next', text: 'Jumps straight into the module you should do next.', at: (p) => link(p, 'Continue next') },
      { label: 'Filters', text: 'Show all modules, or only to do, in progress or completed.', at: (p) => p.getByRole('radiogroup', { name: 'Show' }) },
      { label: 'Module card', text: 'Tap a card to open it. The chip shows its status, the bar how far you got.', at: (p) => p.locator('main article').filter({ hasText: 'How we use tasks' }) },
      { label: 'Certificate', text: 'On completed modules when certificates are on. Print it or save it as a PDF.', at: (p) => btn(p, 'Certificate') },
    ],
  },
  {
    id: 'training-2', device: 'phone', as: 'trainee', url: `/training/${IDS.security}`, height: 1350,
    caption: 'A quiz step in the module player', alt: 'The module player on a phone at step 2 of 2 of Security and data handling: two quiz questions answered correctly with explanations, a green You scored 100 percent result, and the Finish module button.',
    prep: async (p) => {
      await p.locator('footer button').last().click(); await p.waitForTimeout(250);
      await p.locator('footer button').last().click(); await p.waitForTimeout(250);
      await p.getByRole('radio', { name: 'Stop and check with your lead first' }).click();
      await p.getByRole('radio', { name: 'In your RAMP Vault or an approved password manager' }).click();
      await btn(p, 'Check answers').click(); await settle(p, 200);
    },
    hotspots: [
      { label: 'Where you are', text: 'Module name, step number and a progress bar.', at: (p) => p.locator('header').first() },
      { label: 'Questions', text: 'Pick one answer per question, then tap **Check answers**.', at: (p) => p.locator('fieldset').first().locator('legend') },
      { label: 'Feedback', text: 'Each answer shows whether it’s right, and why.', at: (p) => p.locator('fieldset').first().locator('p').last() },
      { label: 'Your score', text: 'You need the passing score to continue. **Try again** clears your answers.', at: (p) => p.getByRole('status').filter({ hasText: 'You scored' }) },
      { label: 'Finish module', text: 'Completes the module, or sends it to your mentor when it needs review.', at: (p) => p.locator('footer button').last() },
      { label: 'Close', text: 'Leave and come back later. Your place is saved.', at: (p) => p.getByRole('button', { name: 'Close module' }) },
    ],
  },
  {
    id: 'documents-1', device: 'phone', as: 'new', url: '/welcome', height: 1300,
    storage: { [`ramp-welcome-step:${IDS.marcus}`]: '"documents"' },
    caption: 'Filling out and signing a document', alt: 'The Payroll and direct deposit form open on a phone: bank name, account type, encrypted routing and account number fields shown as dots, an attached W-4 file, and a typed signature preview, with Sign and submit at the bottom.',
    prep: async (p) => {
      await p.locator('main li').filter({ hasText: 'Payroll and direct deposit' }).getByRole('button', { name: 'Fill out' }).click();
      await p.waitForTimeout(300);
      const d = p.getByRole('dialog');
      await d.getByLabel('Bank name').fill('Harborview Credit Union');
      await d.getByRole('radio', { name: 'Checking' }).click();
      await d.locator('input[type=password]').nth(0).fill('123456780');
      await d.locator('input[type=password]').nth(1).fill('00048213307');
      await d.locator('input[type=file]').setInputFiles({ name: 'W-4 2026.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(318 * 1024, 1) });
      await d.getByPlaceholder('Your full name').fill('Marcus Diaz');
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await d.locator('.overflow-y-auto').evaluate((el) => el.scrollTo(0, 0));
      await p.waitForTimeout(250);
    },
    hotspots: [
      { label: 'The document', text: 'Its name, type and what it’s for.', at: (p) => p.getByRole('dialog').locator('h2').locator('..') },
      { label: 'Sensitive answers', text: 'The lock means it’s encrypted. Tap the eye to check what you typed.', at: (p) => p.getByRole('dialog').locator('label').filter({ hasText: 'Routing number' }) },
      { label: 'Files', text: 'Attach a PDF or a photo, up to 25 MB. Sensitive files only HR can open.', at: (p) => p.getByRole('dialog').locator('div').filter({ hasText: /^W-4 2026\.pdf/ }).last() },
      { label: 'Signature', text: 'Type your full legal name. It counts as your electronic signature.', at: (p) => [p.getByRole('dialog').getByPlaceholder('Your full name'), p.getByRole('dialog').getByText(/^Signed /)] },
      { label: 'Sign and submit', text: 'The counter says what’s still required. RAMP records the time, IP address and device.', at: (p) => p.getByRole('dialog').locator('div.border-t').last() },
    ],
  },
  {
    id: 'tasks-1', device: 'desktop', as: 'trainee', url: '/tasks', height: 880,
    caption: 'Your task board', alt: 'The Tasks board on a computer with four columns: To do, In progress, In review and Done. Cards show due dates, who assigned them, Form chips with a Fill out button, and buttons to move them along.',
    hotspots: [
      { label: 'Status columns', text: 'Tasks move left to right. Drag a card to another column, or use its buttons.', at: (p) => p.locator('section[aria-label="To do"] h2').locator('..') },
      { label: 'Move a task', text: '**Start**, **Send for review** and **Mark done** move it one column right; the arrow moves it back.', at: (p) => p.locator('section[aria-label="To do"] article').first().locator('div').last() },
      { label: 'Assigned to you', text: 'Tasks from your mentor or lead say who they’re from.', at: (p) => p.getByText('From Riley Chen').first() },
      { label: 'Form tasks', text: 'First-week documents. **Fill out** opens the form; sending it marks the task done.', at: (p) => p.locator('section[aria-label="To do"] article').filter({ hasText: 'Using your notebook' }).getByRole('button', { name: 'Fill out' }) },
      { label: 'In review', text: 'Finished on your side and waiting for a check.', at: (p) => p.locator('section[aria-label="In review"]') },
      { label: 'New task', text: 'Add your own task with notes and a due date.', at: (p) => btn(p, 'New task') },
    ],
  },
  {
    id: 'notebook-1', device: 'desktop', as: 'trainee', url: `/notes/${IDS.notePage}`, height: 1180,
    caption: 'A notebook page', alt: 'The Notebook on a computer: a list of pages on the left with Shared chips and a Vault link, and the open page Module notes: How we use tasks, with its text, an attached file, the Share with my mentor and lead switch and the Training module link.',
    hotspots: [
      { label: 'Your pages', text: 'Search, open a page or a sub-page. **Shared** marks pages your mentor can read.', at: (p) => p.getByRole('navigation', { name: 'Notebook pages' }) },
      { label: 'New page', text: 'Start blank or from a template: meeting notes, daily log or questions for your mentor.', at: (p) => btn(p, 'New page') },
      { label: 'Write', text: 'Type a title and notes. Everything saves as you go; look for **Saved**.', at: (p) => p.locator('main section.bg-card').filter({ has: p.locator('textarea') }).first() },
      { label: 'Attachments', text: 'Add screenshots, PDFs or other files, up to 25 MB each.', at: (p) => p.locator('main section.bg-card').filter({ hasText: 'Attachments' }).first() },
      { label: 'Share and link', text: 'Let your mentor and lead read this page, and link it to a training module.', at: (p) => p.locator('main section.bg-card').filter({ hasText: 'Share with my mentor and lead' }).first() },
      { label: 'Vault', text: 'Your encrypted saved logins.', at: (p) => p.getByRole('navigation', { name: 'Notebook pages' }).locator('a[href="/vault"]') },
    ],
  },
  {
    id: 'vault-1', device: 'phone', as: 'trainee', url: '/vault', height: 1000,
    caption: 'Your Vault', alt: 'The Vault on a phone with four saved logins. The Dispatch board login shows its password with a Hides in 30s countdown, and Copy password and Hide buttons.',
    prep: async (p) => { await p.locator('main li').filter({ hasText: 'Dispatch board' }).getByRole('button', { name: 'Show password' }).click(); await settle(p, 200); },
    hotspots: [
      { label: 'Only you', text: 'Entries are encrypted. Your mentor, lead and admins can’t open them.', at: (p) => p.locator('main').getByText('Everything here is encrypted').locator('..') },
      { label: 'Add a login', text: 'Save a name, username, link and password. RAMP can generate a strong one.', at: (p) => btn(p, 'Add a login') },
      { label: 'Password shown', text: 'Shown for 30 seconds, then hidden again.', at: (p) => p.locator('main code').locator('..') },
      { label: 'Copy', text: 'Copy the password or username without showing it to anyone nearby.', at: (p) => [btn(p, 'Copy password'), p.locator('main li').filter({ hasText: 'Dispatch board' }).getByRole('button', { name: 'Copy username' })] },
      { label: 'Edit', text: 'Change the details or password, or delete the login.', at: (p) => p.getByRole('button', { name: 'Edit Fleet tracker' }) },
    ],
  },
  {
    id: 'chat-1', device: 'desktop', as: 'trainee', url: `/chat/${IDS.dmSam}`, height: 880,
    storage: { 'ramp-chat-read:10000000-0000-4000-8000-000000000006': JSON.stringify({ [IDS.announcements]: 9e15, [IDS.newhires]: 9e15, [IDS.dmRiley]: 9e15, [IDS.dmSam]: 9e15 }) },
    caption: 'Chat with your mentor', alt: 'Chat on a computer: channels and direct messages on the left with unread dots, and a direct message conversation with Sam Patel on the right, with the message box at the bottom.',
    hotspots: [
      { label: 'Channels', text: 'Company, department and cohort channels. The lock means only admins post.', at: (p) => p.locator('aside[aria-label="Conversations"] section').first() },
      { label: 'Unread', text: 'An amber dot means new messages since you last looked.', at: (p) => p.locator('aside[aria-label="Conversations"] a').filter({ hasText: 'general' }).locator('span.bg-amber') , pad: 8 },
      { label: 'Direct messages', text: 'One-to-one conversations, newest first.', at: (p) => p.locator('aside[aria-label="Conversations"] section').nth(1) },
      { label: 'New message', text: 'Pick anyone on the team to message directly.', at: (p) => btn(p, 'New message') },
      { label: 'Conversation', text: 'Messages are grouped by day. Your own are on the right.', at: (p) => p.getByRole('log') },
      { label: 'Write a message', text: 'Enter sends; Shift+Enter starts a new line.', at: (p) => p.locator('form').filter({ has: p.locator('textarea') }) },
    ],
  },
  {
    id: 'resources-1', device: 'phone', as: 'trainee', url: '/resources', height: 1200,
    caption: 'Resources', alt: 'Resources on a phone: a search box, category filters, and lists of policies, SOPs and guides with Required and Your role chips.',
    hotspots: [
      { label: 'Search', text: 'Find a policy, SOP or guide by title or text.', at: (p) => p.getByRole('searchbox') },
      { label: 'Categories', text: 'Show one kind of resource at a time.', at: (p) => p.getByRole('radiogroup', { name: 'Category' }) },
      { label: 'Required', text: 'Required reading for you. Open it before your due dates.', at: (p) => p.locator('main li').filter({ hasText: 'Employee handbook' }) },
      { label: 'Your role', text: 'Resources for your job role.', at: (p) => p.locator('main li').filter({ hasText: 'Opening and closing checklist' }) },
      { label: 'Opens in RAMP', text: 'Some resources open a RAMP page, like this guide.', at: (p) => p.locator('main li').filter({ hasText: 'RAMP user guide' }) },
    ],
  },
  {
    id: 'news-1', device: 'phone', as: 'trainee', url: '/news', height: 1200,
    caption: 'News', alt: 'News on a phone: a reminder that one post needs confirming, an Office closed for Thanksgiving post highlighted with Please confirm and a Mark as read button, and older posts including a department post for Operations.',
    hotspots: [
      { label: 'Needs confirming', text: 'How many posts are waiting for you to confirm you’ve read them.', at: (p) => p.locator('main').getByText(/needs you to confirm|need you to confirm/).locator('..') },
      { label: 'Please confirm', text: 'Highlighted until you confirm.', at: (p) => p.locator('main article').first().locator('div').first() },
      { label: 'Mark as read', text: 'Confirms you’ve read it. Admins can see who hasn’t yet.', at: (p) => btn(p, 'Mark as read') },
      { label: 'Department news', text: 'Posts from your department lead show your department’s name.', at: (p) => p.locator('main article').filter({ hasText: 'New dispatch SOP is live' }) },
    ],
  },
  {
    id: 'profile-1', device: 'phone', as: 'trainee', url: '/me', height: 1350,
    caption: 'Your documents and sign-in history', alt: 'The Profile page on a phone scrolled to My documents, listing completed onboarding documents with View and Submit again buttons and two first-week checklists, followed by Sign-in history with dates, devices and IP addresses.',
    prep: async (p) => { await scrollTop(p, p.locator('main section').filter({ hasText: 'My documents' }).first(), 64); },
    hotspots: [
      { label: 'My documents', text: 'Every form, upload and agreement that applies to you, with what’s still to do.', at: (p) => p.locator('main section').filter({ hasText: 'My documents' }).first().locator('h3') },
      { label: 'View', text: 'Opens what you sent, with the date, IP address and device recorded.', at: (p) => p.locator('main section').filter({ hasText: 'My documents' }).first().getByRole('button', { name: 'View' }).first() },
      { label: 'Submit again', text: 'Send an updated version, for example after you change banks.', at: (p) => p.locator('main section').filter({ hasText: 'My documents' }).first().getByRole('button', { name: 'Submit again' }).first() },
      { label: 'To do', text: 'Documents you still need to complete.', at: (p) => p.locator('main section').filter({ hasText: 'My documents' }).first().locator('li').filter({ hasText: 'To do' }).first() },
      { label: 'Sign-in history', text: 'Your last 10 sign-ins. Don’t recognize one? Change your password and tell an admin.', at: (p) => p.locator('main section').filter({ hasText: 'Sign-in history' }).first() },
    ],
  },

  // ───────── team ─────────
  {
    id: 'team-1', device: 'desktop', as: 'mentor', url: '/team', height: 900,
    caption: 'My team, for a mentor', alt: 'My team on a computer for a mentor: two items waiting for review with Review buttons, then the list of trainees with their stage, items to review and training progress bars.',
    hotspots: [
      { label: 'Waiting for your review', text: 'Work your trainees sent. Oldest first.', at: (p) => p.locator('section[aria-labelledby="review-h"]') },
      { label: 'Review', text: 'Opens the answer and score so you can approve or return it.', at: (p) => p.locator('section[aria-labelledby="review-h"] li').filter({ hasText: 'How we use tasks' }).getByRole('button', { name: 'Review' }) },
      { label: 'Search', text: 'Find someone by name, email or role.', at: (p) => p.getByRole('searchbox') },
      { label: 'Stage and progress', text: 'Onboarding, Training x% or Graduated, plus anything to review or overdue.', at: (p) => p.locator('section[aria-labelledby="people-h"] li').first().locator('a > span.flex-1') },
      { label: 'Open a person', text: 'Their plan, shared notebook pages and tasks.', at: (p) => p.locator('section[aria-labelledby="people-h"] li').nth(3) },
    ],
  },
  {
    id: 'reviews-1', device: 'desktop', as: 'mentor', url: '/team', height: 900,
    caption: 'Reviewing submitted work', alt: 'The review sheet open over My team: How we use tasks sent by Jordan Lee, with a quiz score of 100 percent, the assignment, Jordan’s answer, a feedback box, and Return with feedback and Approve buttons.',
    prep: async (p) => { await p.locator('section[aria-labelledby="review-h"] li').filter({ hasText: 'How we use tasks' }).getByRole('button', { name: 'Review' }).click(); await settle(p, 250); await p.evaluate(() => document.activeElement && document.activeElement.blur()); },
    hotspots: [
      { label: 'Score', text: 'Their quiz score against the pass mark.', at: (p) => p.getByRole('dialog').getByText('Quiz score').locator('..') },
      { label: 'The assignment', text: 'What they were asked to do.', at: (p) => p.getByRole('dialog').getByText('The assignment').locator('..') },
      { label: 'Their answer', text: 'What they wrote.', at: (p) => p.getByRole('dialog').getByText(/’s answer$/).locator('..') },
      { label: 'Feedback', text: 'Required when you return it. They see it with the result.', at: (p) => p.getByRole('dialog').locator('label').filter({ hasText: 'Feedback' }) },
      { label: 'Approve or return', text: '**Approve** completes the module. **Return with feedback** sends it back to fix.', at: (p) => p.getByRole('dialog').locator('div.border-t').last() },
    ],
  },
  {
    id: 'team-member-1', device: 'desktop', as: 'mentor', url: `/team/${IDS.jordan}`, height: 1280,
    caption: 'One trainee’s page', alt: 'A trainee’s page for their mentor on a computer: the training plan with statuses and a Review button, shared notebook pages, and the Tasks card with an Assign a task button.',
    prep: async (p) => { await scrollTop(p, p.locator('main section').filter({ hasText: 'Training plan' }).first(), 24); },
    hotspots: [
      { label: 'Training plan', text: 'Every assigned module with its due date, score and status.', at: (p) => p.locator('main section').filter({ hasText: 'Training plan' }).first().locator('h3') },
      { label: 'Review', text: 'Shows on work waiting for you.', at: (p) => p.locator('main section').filter({ hasText: 'Training plan' }).first().getByRole('button', { name: 'Review' }) },
      { label: 'Shared notebook pages', text: 'Pages they chose to share with you. Read-only.', at: (p) => p.locator('main section').filter({ hasText: 'Shared notebook pages' }).first() },
      { label: 'Assign a task', text: 'Add a task to their board, marked as from you.', at: (p) => btn(p, 'Assign a task') },
      { label: 'Their tasks', text: 'Open tasks and who assigned them. Click one of yours to edit it.', at: (p) => p.locator('main section').filter({ hasText: 'Assign a task' }).first().locator('ul') },
    ],
  },

  // ───────── admin ─────────
  {
    id: 'admin-home-1', device: 'desktop', as: 'admin', url: '/admin', height: 1280,
    caption: 'The Admin portal', alt: 'The Admin portal on a computer: the setup checklist at 78 percent with Fix buttons on two items, quick stats, and the first admin page cards. The sidebar shows the admin pages.',
    hotspots: [
      { label: 'Setup checklist', text: 'What’s left to set up. Done items have a green check.', at: (p) => p.locator('main section').filter({ hasText: 'Set up RAMP for' }).first().locator('div').first() },
      { label: 'Fix', text: 'Opens the page that finishes that step.', at: (p) => p.getByRole('link', { name: /^Fix/ }).first() },
      { label: 'Quick stats', text: 'Active members, onboarding, invites, requests and reviews. Click one to open it.', at: (p) => p.getByRole('region', { name: 'Quick stats' }).or(p.locator('section[aria-label="Quick stats"]')) },
      { label: 'Admin pages', text: 'Every admin page as a card, grouped by Agency (when it’s on), Set up, People, Communicate and System.', at: (p) => p.locator('main section').filter({ has: p.locator('h2', { hasText: /^(Agency|Set up)$/ }) }).first().locator('h2') },
      { label: 'Admin menu', text: 'Inside the portal, the sidebar lists every admin page.', at: (p) => [side(p, '/admin/agency'), side(p, '/admin/documents')] },
    ],
  },
  {
    id: 'org-1', device: 'desktop', as: 'admin', url: '/admin/org', height: 1180,
    caption: 'Organization settings', alt: 'The Organization page: company name, brand color swatches with a custom color field, time zone, the welcome message fields, and a live preview of the welcome screen.',
    hotspots: [
      { label: 'Company profile', text: 'Name, brand color and time zone.', at: (p) => p.locator('main section').filter({ hasText: 'Company profile' }).first().locator('h2') },
      { label: 'Brand color', text: 'Pick a swatch or type any six-digit color. RAMP warns if white text would be hard to read.', at: (p) => p.getByRole('radiogroup', { name: 'Brand color' }).locator('..') },
      { label: 'Time zone', text: 'Used for due dates, record times and the audit log.', at: (p) => p.locator('main label').filter({ hasText: 'Time zone' }).first() },
      { label: 'Welcome message', text: 'Who it’s from, a headline with {first}, the message and an optional video.', at: (p) => p.locator('main section').filter({ hasText: 'Welcome message' }).first() },
      { label: 'Live preview', text: 'What new people see first, as you type.', at: (p) => p.getByLabel('Live preview') },
      { label: 'Save organization', text: 'Nothing changes until you save. Leaving with unsaved changes asks first.', at: (p) => btn(p, 'Save organization').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]') },
    ],
  },
  {
    id: 'roles-1', device: 'desktop', as: 'admin', url: '/admin/roles', height: 1180,
    caption: 'Roles and departments', alt: 'Roles and departments: a list of job roles with Graduates to chips, department and counts, edit and delete buttons, and the Departments list with each lead.',
    hotspots: [
      { label: 'Add job role', text: 'Title, department and the access it graduates to.', at: (p) => btn(p, 'Add job role') },
      { label: 'Graduates to', text: 'The access level people in this role move to when they graduate.', at: (p) => p.locator('main li').filter({ hasText: 'HR Manager' }).getByText(/^Graduates to/) },
      { label: 'Role details', text: 'Department, how many people have it and its training modules.', at: (p) => p.locator('main li').filter({ hasText: 'Operations Coordinator' }).first().locator('button').first() },
      { label: 'Edit or delete', text: 'Deleting warns you who and what it affects first.', at: (p) => [p.getByRole('button', { name: 'Edit Operations Coordinator' }), p.getByRole('button', { name: 'Delete Operations Coordinator' })] },
      { label: 'Departments', text: 'Group people and roles. A lead sees progress, reviews and news for their department.', at: (p) => p.locator('main section').filter({ hasText: 'Add department' }).first().locator('h2') },
    ],
  },
  {
    id: 'flow-1', device: 'desktop', as: 'admin', url: '/admin/flow', height: 1180,
    caption: 'The welcome flow steps', alt: 'The Welcome flow page: six numbered steps from Welcome to All set, each with a description, on and off switches and up and down arrows, and a Preview as a new hire button.',
    hotspots: [
      { label: 'Preview as a new hire', text: 'Walk through the flow yourself. Nothing is saved.', at: (p) => link(p, 'Preview as a new hire') },
      { label: 'Always on', text: 'Welcome and All set are always first and last.', at: (p) => p.locator('main li').first() },
      { label: 'On or off', text: 'Skip a step for everyone. Skipped steps are greyed out.', at: (p) => p.getByRole('switch').first() },
      { label: 'Order', text: 'Move a step up or down.', at: (p) => [p.getByRole('button', { name: 'Move Your profile up' }), p.getByRole('button', { name: 'Move Your profile down' })] },
      { label: 'Documents', text: 'How many onboarding documents are published. Click to manage them.', at: (p) => p.locator('main li').filter({ hasText: 'Documents and forms' }).getByRole('link') },
      { label: 'Save flow', text: 'Saves the steps and marks the flow as reviewed.', at: (p) => p.locator('main [role=status]').last().locator('..').locator('..') },
    ],
  },
  {
    id: 'documents-admin-1', device: 'desktop', as: 'admin', url: '/admin/documents', height: 1180,
    caption: 'All documents', alt: 'The Documents admin page: a notice that sensitive answers are encrypted, type filters, and documents grouped into Before start and During onboarding, with chips for type, status, Encrypted, Needs legal review and placeholders.',
    hotspots: [
      { label: 'New document', text: 'Start from a template, like payroll or a confidentiality agreement.', at: (p) => btn(p, 'New document') },
      { label: 'Filter by type', text: 'Form, Upload, E-sign or Checklist.', at: (p) => p.getByRole('radiogroup', { name: 'Filter by type' }) },
      { label: 'Stages', text: 'Grouped by when people complete them.', at: (p) => p.locator('#stage-onboarding').locator('..') },
      { label: 'A document', text: 'Who it’s for, its version and how many people submitted it.', at: (p) => p.locator('main a').filter({ hasText: 'Payroll and direct deposit' }) },
      { label: 'Warnings', text: 'Drafts, [placeholders] and legal review are flagged before anyone sees them.', at: (p) => p.locator('main a').filter({ hasText: 'Confidentiality agreement' }).getByText('Has [placeholders]') },
    ],
  },
  {
    id: 'documents-admin-2', device: 'desktop', as: 'admin', url: `/admin/documents/${IDS.payroll}`, height: 1280,
    caption: 'Building a document’s fields', alt: 'The document editor for Payroll and direct deposit scrolled to its fields: the encrypted account number field, the W-4 file upload with Required and Sensitive file ticked, the signature field, and the Add a field buttons for all ten field types.',
    prep: async (p) => { await scrollTop(p, p.locator('#field-account'), 16); },
    hotspots: [
      { label: 'Field type', text: 'Each field shows its number and type. **Encrypted** marks answers only admins can reveal.', at: (p) => p.locator('#field-account > div').first().locator('span').first() },
      { label: 'Question', text: 'What people see. Help text shows under it.', at: (p) => p.locator('#field-account label').filter({ hasText: 'Question' }) },
      { label: 'Required', text: 'People can’t submit until every required field is done.', at: (p) => p.locator('#field-w4 label').filter({ hasText: /^Required/ }) },
      { label: 'Sensitive file', text: 'Only owners and admins can open the file, and every view is logged.', at: (p) => p.locator('#field-w4 label').filter({ hasText: 'Sensitive file' }) },
      { label: 'Order and remove', text: 'Move a field up or down, or remove it.', at: (p) => p.locator('#field-sign > div').first().locator('span.flex.ml-auto') },
      { label: 'Add a field', text: 'Pick one of the ten field types to add it at the end.', at: (p) => p.getByText('Add a field', { exact: true }).locator('..') },
    ],
  },
  {
    id: 'training-admin-1', device: 'desktop', as: 'admin', url: '/admin/training', height: 1180,
    caption: 'All training modules', alt: 'The Training modules admin page: modules grouped into Company-wide, Role track and Continued training, with chips for Published, Draft, Required, Mentor review, Guests can see and Built in, and duplicate and delete buttons.',
    hotspots: [
      { label: 'New module', text: 'Start from a template and fill in what’s specific to you.', at: (p) => btn(p, 'New module') },
      { label: 'Tracks', text: 'Company-wide, Role track and Continued training.', at: (p) => p.locator('#track-company').locator('..') },
      { label: 'A module', text: 'Length, steps, completions and its settings at a glance.', at: (p) => p.locator('main a').filter({ hasText: 'How we use tasks' }) },
      { label: 'Duplicate or delete', text: 'Copy a module as a draft, or delete it.', at: (p) => [p.getByRole('button', { name: 'Duplicate How we use tasks' }), p.getByRole('button', { name: 'Delete How we use tasks' })] },
      { label: 'Built in', text: 'The interactive practice can’t be deleted.', at: (p) => p.locator('main a').filter({ hasText: 'Platform basics' }).getByText('Built in') },
    ],
  },
  {
    id: 'training-admin-2', device: 'desktop', as: 'admin', url: `/admin/training/${IDS.tasksMod}`, height: 1280,
    caption: 'The module builder with a quiz block', alt: 'The module builder for How we use tasks scrolled to Lessons, in order: a collapsed slides block, an open quiz block with a question, its answers and the right answer marked, and the assignment block.',
    prep: async (p) => {
      await p.locator('main li[id^="block-"]').first().locator('button[aria-expanded]').click();
      await p.waitForTimeout(200);
      await scrollTop(p, p.locator('#blocks-title'), 16);
    },
    hotspots: [
      { label: 'Lessons, in order', text: 'People go through blocks one step at a time. Each slide is a step.', at: (p) => p.locator('#blocks-title').locator('..') },
      { label: 'Collapsed block', text: 'Click a block’s header to fold it away while you work on another.', at: (p) => p.locator('main li[id^="block-"]').first() },
      { label: 'Quiz question', text: 'Write the question and answers, and tick the right one.', at: (p) => p.locator('main li[id^="block-"]').nth(1).locator('div.rounded-xl').first() },
      { label: 'Right answer', text: 'The ticked answer is outlined green.', at: (p) => p.locator('main li[id^="block-"]').nth(1).locator('label.bg-good-soft').first().locator('..') },
      { label: 'Block tools', text: 'Move a block up or down, or remove it.', at: (p) => p.locator('main li[id^="block-"]').nth(1).locator(':scope > div > span.flex.shrink-0') },
    ],
  },
  {
    id: 'assign-1', device: 'desktop', as: 'admin', url: '/admin/assign', height: 1180,
    caption: 'Assigning training', alt: 'The Assign training page: Required for everyone with a switch for each company-wide module, and Role tracks for each job role listing its modules in order with an Add to track picker.',
    hotspots: [
      { label: 'Required for everyone', text: 'Switch a company-wide module on to assign it to every team member.', at: (p) => p.locator('main section').filter({ hasText: 'Required for everyone' }).first().locator('h2').locator('..') },
      { label: 'Required switch', text: 'On means required. Off keeps it in the optional library.', at: (p) => p.getByRole('switch').first() },
      { label: 'Role tracks', text: 'What each job role learns on top, in this order.', at: (p) => p.locator('#tracks-title').locator('..') },
      { label: 'A role’s track', text: 'Reorder with the arrows or remove a module with the X.', at: (p) => p.locator('main article').filter({ hasText: 'Dispatcher' }).first() },
      { label: 'Add to track', text: 'Pick a role module, then click **Add to track**.', at: (p) => p.locator('main article').filter({ hasText: 'Account Manager' }).first().locator('select').locator('..') },
    ],
  },
  {
    id: 'people-1', device: 'desktop', as: 'admin', url: '/admin/people', height: 1180,
    caption: 'People: the Team tab', alt: 'The People page on the Team tab: search and filters for access level, status and department, and everyone in RAMP with their level, role, stage and when they were last seen.',
    hotspots: [
      { label: 'Invite someone', text: 'Add one person by email, with their access level, role, mentor and start date.', at: (p) => btn(p, 'Invite someone') },
      { label: 'Tabs', text: 'Team, Potential staff and Access requests.', at: (p) => p.getByRole('group', { name: 'People lists' }) },
      { label: 'Search and filter', text: 'By name, email, role, access level, status or department.', at: (p) => [p.getByRole('searchbox'), p.getByLabel('Department')] },
      { label: 'A person', text: 'Name, access level, role and department. Click to open their record.', at: (p) => p.locator('main li').filter({ hasText: 'Jordan Lee' }).locator('a > div').first() },
      { label: 'Stage', text: 'Invited, Onboarding, Training x%, Graduated or Paused, and when they were last seen.', at: (p) => p.locator('main li').filter({ hasText: 'Jordan Lee' }).locator('a > div').last() },
    ],
  },
  {
    id: 'people-2', device: 'desktop', as: 'admin', url: '/admin/people?tab=potential', height: 1180,
    caption: 'People: Potential staff', alt: 'The Potential staff tab: people from the hiring app, staff records and access requests with source chips and Invite buttons. Two people are ticked and a dark bar at the bottom says 2 people selected with an Invite button.',
    prep: async (p) => {
      await p.getByRole('checkbox', { name: 'Select Isabel Torres' }).check();
      await p.getByRole('checkbox', { name: 'Select Daniel Okoro' }).check();
      await p.waitForTimeout(200);
    },
    hotspots: [
      { label: 'Sources', text: 'Hiring applicants, staff records and access requests not in RAMP yet.', at: (p) => p.getByRole('radiogroup', { name: 'Where they come from' }) },
      { label: 'One at a time', text: '**Invite** opens the invite form filled in from their record.', at: (p) => p.getByRole('button', { name: 'Invite Sofia Romero' }) },
      { label: 'Tick several', text: 'Tick people, or **Select all**, to invite them together.', at: (p) => p.locator('main li').filter({ hasText: 'Isabel Torres' }) },
      { label: 'Select all', text: 'Ticks everyone shown who has an email address.', at: (p) => p.locator('main label').filter({ hasText: /^Select all/ }) },
      { label: 'Invite selected', text: 'Same access level, role and mentor for everyone you picked.', at: (p) => p.locator('div.bg-ink').filter({ hasText: 'selected' }) },
    ],
  },
  {
    id: 'person-1', device: 'desktop', as: 'admin', url: `/admin/people/${IDS.jordan}?tab=documents`, height: 1180,
    caption: 'A signed record with IP address and device', alt: 'A person’s record open on the Documents tab with the Payroll and direct deposit record shown: bank name and account type, encrypted routing and account numbers with Reveal buttons, the W-4 file marked Sensitive, and the record box with the typed signature, date and time, IP address 203.0.113.24, device iPhone Safari and template version.',
    prep: async (p) => { await p.locator('main li').filter({ hasText: 'Payroll and direct deposit' }).getByRole('button', { name: 'View record' }).click(); await settle(p, 250); await p.evaluate(() => document.activeElement && document.activeElement.blur()); },
    hotspots: [
      { label: 'Answers', text: 'What they entered, in the document’s order.', at: (p) => p.getByRole('dialog').locator('dl > div').first() },
      { label: 'Reveal', text: 'Shows an encrypted answer. Every reveal is logged with your name, IP address and device.', at: (p) => p.getByRole('dialog').getByRole('button', { name: 'Reveal' }).first() },
      { label: 'Sensitive file', text: '**Open** gives a two-minute link. Opening is logged too.', at: (p) => p.getByRole('dialog').locator('dl > div').filter({ hasText: 'W-4' }) },
      { label: 'Signed as', text: 'The name they typed to sign.', at: (p) => p.getByRole('dialog').getByText('Signed as').locator('..') },
      { label: 'IP address and device', text: 'Recorded by the database when they submitted, with the date, time and version.', at: (p) => [p.getByRole('dialog').getByText('Date and time').locator('..'), p.getByRole('dialog').getByText('Template', { exact: true }).locator('..')] },
    ],
  },
  {
    id: 'person-2', device: 'desktop', as: 'admin', url: `/admin/people/${IDS.jordan}?tab=signins`, height: 1000,
    caption: 'Sign-ins', alt: 'The Sign-ins tab of a person’s record: a summary of nine sign-ins from three IP addresses and two devices, and a list with date and time, IP address, device and New IP or New device flags.',
    hotspots: [
      { label: 'Tabs', text: 'Overview, Training, Documents, Files, Sign-ins and Activity.', at: (p) => p.getByRole('group', { name: 'Profile sections' }) },
      { label: 'Summary', text: 'How many sign-ins, from how many IP addresses and devices.', at: (p) => p.locator('main p').filter({ hasText: /sign-ins? from/ }) },
      { label: 'A sign-in', text: 'Date and time in the company time zone, IP address and device.', at: (p) => p.locator('main li').first() },
      { label: 'New IP or device', text: 'Flagged the first time each one appears. Check anything unexpected.', at: (p) => p.locator('main li').filter({ hasText: 'New IP' }).first().locator('span.flex').last() },
      { label: 'Graduate', text: 'Moves a trainee to their role’s access level.', at: (p) => btn(p, 'Graduate') },
    ],
  },
  {
    id: 'metrics-1', device: 'desktop', as: 'admin', url: '/admin/metrics', height: 1200,
    caption: 'Metrics', alt: 'The Metrics page: a department filter, six key numbers, and the onboarding funnel from invited to graduated.',
    hotspots: [
      { label: 'Department', text: 'See everyone, or one department.', at: (p) => p.locator('main label').filter({ hasText: 'Department' }).first() },
      { label: 'Key numbers', text: 'Members, onboarding, days to onboard, required training, overdue items and reviews.', at: (p) => p.locator('section[aria-label="Key numbers"]') },
      { label: 'Onboarding funnel', text: 'How far everyone who started as a trainee has got.', at: (p) => p.locator('main section').filter({ hasText: 'Onboarding funnel' }).first().locator('h3') },
      { label: 'Export people progress', text: 'Downloads a spreadsheet of everyone’s progress.', at: (p) => btn(p, 'Export people progress') },
    ],
  },
  {
    id: 'news-admin-1', device: 'desktop', as: 'admin', url: '/admin/news', height: 1100,
    caption: 'Announcements', alt: 'The Announcements admin page with the first post expanded: its audience and Read confirmation chips, a 4 of 9 read progress bar, the message, the people who haven’t read it yet and a Delete announcement button.',
    prep: async (p) => { await p.getByRole('button', { name: 'Show details' }).first().click(); await p.waitForTimeout(250); },
    hotspots: [
      { label: 'Post an announcement', text: 'Title, message, audience and whether to ask for read confirmation.', at: (p) => btn(p, 'Post an announcement') },
      { label: 'Audience', text: 'Everyone, trainees, employees or one department.', at: (p) => p.locator('main li').first().locator('h2').locator('..') },
      { label: 'Read so far', text: 'How many of the audience confirmed they’ve read it.', at: (p) => p.locator('main li').first().getByRole('progressbar').locator('..') },
      { label: 'Hasn’t read it yet', text: 'Who still needs to confirm, so you can follow up.', at: (p) => p.locator('main li').first().getByText(/^Hasn’t read it yet/).locator('..') },
      { label: 'Delete', text: 'Removes it for everyone.', at: (p) => btn(p, 'Delete announcement') },
    ],
  },
  {
    id: 'resources-admin-1', device: 'desktop', as: 'admin', url: '/admin/resources', height: 1100,
    caption: 'Managing resources', alt: 'The Resources admin page: category filters and the list of resources with up and down arrows, category, Required, audience and Guests chips.',
    hotspots: [
      { label: 'Add a resource', text: 'A link, a file or a page of text.', at: (p) => btn(p, 'Add a resource') },
      { label: 'Category', text: 'Filter the list by category.', at: (p) => p.getByRole('radiogroup', { name: 'Category' }) },
      { label: 'Order', text: 'The arrows set the order people see.', at: (p) => [p.getByRole('button', { name: 'Move Employee handbook up' }), p.getByRole('button', { name: 'Move Employee handbook down' })] },
      { label: 'Who it’s for', text: 'Everyone or one role, Required, and whether guests can see it.', at: (p) => p.locator('main li').filter({ hasText: 'Employee handbook' }).locator('span.flex.flex-wrap').first() },
    ],
  },
  {
    id: 'system-1', device: 'desktop', as: 'owner', url: '/admin/system', height: 1000,
    caption: 'Feature switches', alt: 'System and audit, signed in as an owner: the Feature switches card with Chat, Tasks, Certificates and Record IP address and device, each with an on or off switch, and the Save switches button.',
    hotspots: [
      { label: 'Chat and Tasks', text: 'Turn whole tools on or off for everyone. Nothing is deleted.', at: (p) => [p.getByRole('switch', { name: 'Chat' }), p.getByRole('switch', { name: 'Tasks' })] },
      { label: 'Certificates', text: 'Certificates for completed modules.', at: (p) => p.getByRole('switch', { name: 'Certificates' }) },
      { label: 'Record IP address and device', text: 'Saved with every sign-in, signature and submission.', at: (p) => p.locator('main li').filter({ hasText: 'Record IP address and device' }) },
      { label: 'Save switches', text: 'Owners only. Admins see the switches but can’t change them.', at: (p) => btn(p, 'Save switches') },
      { label: 'How RAMP protects records', text: 'Encryption, logging, private files and row-level security.', at: (p) => p.locator('main section').filter({ hasText: 'How RAMP protects your records' }).first().locator('h3') },
    ],
  },
  {
    id: 'system-2', device: 'desktop', as: 'owner', url: '/admin/system', height: 1100,
    caption: 'The audit log', alt: 'The audit log: search and person filters, an Export button, and a table of entries with time, who, action, person, detail, IP address and device. Revealed and Opened file entries are highlighted.',
    prep: async (p) => { await scrollTop(p, p.locator('main section').filter({ hasText: 'Audit log' }).last(), 16); },
    hotspots: [
      { label: 'Search', text: 'Find actions and details by word.', at: (p) => p.getByRole('searchbox') },
      { label: 'Person', text: 'Everything done by or about one person.', at: (p) => p.getByLabel('Person') },
      { label: 'Export', text: 'Downloads the entries shown as a spreadsheet.', at: (p) => p.getByRole('button', { name: /^Export/ }) },
      { label: 'Sensitive actions', text: 'Reveals and file opens are highlighted.', at: (p) => p.locator('main tbody tr').filter({ hasText: 'Revealed' }).first() },
      { label: 'IP and device', text: 'Where each action came from. On narrower screens, scroll the table sideways to see the device.', at: (p) => p.locator('main thead th').filter({ hasText: 'IP' }).first() },
    ],
  },
];

module.exports = { SHOTS, scrollTop, btn, link, side, bottom, card };
