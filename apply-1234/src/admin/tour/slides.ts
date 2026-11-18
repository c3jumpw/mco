// The getting-started tour: one slide per screen or feature, in the order people work.
// Pictures come from scripts/guide/img (refreshed by scripts/guide/update.sh). When a screen or
// feature changes, update its slide here and add an entry to whatsnew.ts.

export const TOUR_UPDATED = '2026-11-18';

export interface Slide {
  id: string;
  section: string;
  title: string;
  lead: string;
  points?: string[];
  image?: string;          // name of a picture in scripts/guide/img, without .webp
  graphic?: 'flow';        // a drawn picture instead of a screenshot
  phone?: boolean;         // a phone screen, shown narrower
  to?: string;             // the page this slide is about
  toLabel?: string;
  adminOnly?: boolean;     // people with access to one job don't have this part
}

const images = import.meta.glob('/scripts/guide/img/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const imageUrl = (name?: string) => (name ? images[`/scripts/guide/img/${name}.webp`] : undefined);

export const SLIDES: Slide[] = [
  {
    id: 'welcome', section: 'Welcome', graphic: 'flow',
    title: 'Welcome to apply1234',
    lead: 'You post a job with its application link hidden in pieces. People who find it complete a short activity built for the role, and you review, score and interview them here.',
    points: ['This tour takes about 3 minutes.', 'Use the arrow keys or swipe to move. Every slide links to the page it shows.', 'Open it again any time from Help at the top of the page.'],
  },
  {
    id: 'dashboard', section: 'Your home', image: 'admin-overview', to: '/admin', toLabel: 'Open the dashboard', adminOnly: true,
    title: 'The Overview dashboard',
    lead: 'The top of the Jobs page shows how hiring is going across every job.',
    points: ['New applicants, page visits and how many started, for today, 7 or 30 days.', 'Applicants per day, and the funnel from finding the link to applying.', 'Waiting for review, shortlisted, interviews coming up and unread messages.', 'Your own test visits are always left out.'],
  },
  {
    id: 'jobs', section: 'Your home', image: 'admin-jobs', to: '/admin', toLabel: 'Open Jobs',
    title: 'Your jobs',
    lead: 'Every job is a card with its status, applicants and how many are waiting for review.',
    points: ['Click a card to open the job.', '+ New job starts the step-by-step wizard.', 'The refresh button at the top (or pulling down on a phone) reloads everything.'],
  },
  {
    id: 'wiz-notes', section: 'Post a job', image: 'wiz-1-notes', to: '/admin/new', toLabel: 'Start a new job', adminOnly: true,
    title: '1. Paste your notes',
    lead: 'Rough notes are enough: duties, must-haves, schedule, pay and what success looks like.',
    points: ['Leave the title blank and the AI suggests one.', 'Hiring for a similar role again? Duplicate a past job instead.', 'Progress saves as you go, so you can switch to your AI tool and come back.'],
  },
  {
    id: 'wiz-link', section: 'Post a job', image: 'wiz-2-link', adminOnly: true,
    title: '2. Hide the link',
    lead: 'A random code keeps the job private. The link is split into pieces that go into the posting.',
    points: ['A green tick means no other job uses the link or anything close to it.', 'Choose how many pieces and how each one is labelled.'],
  },
  {
    id: 'wiz-activity', section: 'Post a job', image: 'wiz-3a-activity', adminOnly: true,
    title: '3. Choose the activity',
    lead: 'The wizard suggests steps for the kind of role: a critique and a short brief for marketing, must-haves and photos of past jobs for a technician, and so on.',
    points: ['Pick another kind of role, or Video questions only.', 'Open a step to change it, or add steps from the library.', 'The total time shows at the bottom. Keep it under an hour.'],
  },
  {
    id: 'wiz-ai', section: 'Post a job', image: 'wiz-4-reply', adminOnly: true,
    title: '4. Let AI write it',
    lead: 'Copy the prompt into Claude, ChatGPT or Gemini, then paste the whole reply back.',
    points: ['The app sorts the reply into the title, posting, activity steps, interview questions and a rubric.', 'Missing link pieces and the code-word sentence are added for you.'],
  },
  {
    id: 'wiz-launch', section: 'Post a job', image: 'wiz-5-launch', adminOnly: true,
    title: '5. Review and launch',
    lead: 'Check the summary, the steps and the posting, then create it as a draft or go live.',
    points: ['Placeholders like [add pay range] must be filled in first.', 'Then copy the posting to your job boards.'],
  },
  {
    id: 'job-overview', section: 'Inside a job', image: 'job-overview',
    title: 'A job’s Overview',
    lead: 'Status, links and results for one job.',
    points: ['Draft, Live or Closed.', 'Open the activity page as a candidate would see it. Your visits count as tests.', 'Copy the posting for each job board, with that board’s own link.', 'A funnel and a table show which board sends the best people.'],
  },
  {
    id: 'job-link', section: 'Inside a job', image: 'job-puzzle',
    title: 'The hidden link',
    lead: 'Change the link, re-split it, and give each job board its own version.',
    points: ['Board links end in a short code, so you see where each person came from.', 'If one leaks, switch off just that one.'],
  },
  {
    id: 'job-activity', section: 'Inside a job', image: 'job-activity',
    title: 'The activity page',
    lead: 'What candidates see once they find the link.',
    points: ['Headline, introduction and deadline.', 'Loom setup, shown only when a step needs a video.', 'What candidates read about AI, and whether they confirm the work is their own.', 'The hidden code word, consent line and accommodations email.'],
  },
  {
    id: 'job-steps', section: 'Inside a job', image: 'job-steps',
    title: 'Activity steps',
    lead: 'Ten kinds of step: video, written, their choice, voice, show your work, mini brief, critique, rank it, quick scenario and must-have.',
    points: ['+ Add a step opens the library. Presets by role loads a set for the kind of job.', 'Each step has its own settings, like time limits or the right answer.', 'Right answers are never sent to candidates; answers are scored when they submit.', 'Write with AI fills in every step from your notes.'],
  },
  {
    id: 'job-interview', section: 'Inside a job', image: 'job-interview',
    title: 'Interview and emails',
    lead: 'Everything for the interview stage.',
    points: ['Interview questions, general and written for this job.', 'The confirmation email candidates get when they submit.', 'Invite and rejection email templates, and your scheduling link.', 'The rubric your team scores against.'],
  },
  {
    id: 'share', section: 'Inside a job', image: 'access-card', adminOnly: true,
    title: 'Share a job',
    lead: 'Give someone access to just this job, from its Overview tab.',
    points: ['Reviewer: scores and notes candidates. Full access: can also edit the job.', 'Choose whether they see contact details and résumés, only the shortlist, or can move stages.', 'They get a branded invite email and sign in with their own login.'],
  },
  {
    id: 'candidates', section: 'Review candidates', image: 'admin-candidates', to: '/admin/candidates', toLabel: 'Open Candidates',
    title: 'Candidates',
    lead: 'Everyone who applied, across all jobs, with their stage, flags and scores.',
    points: ['Filter by job and stage, search names, emails and tags, and sort by top score.', 'Switch between a list and a board you can move people across.', 'Flags show the auto-checks: code word, must-haves, scenario score, pasted answers, AI use and more.'],
  },
  {
    id: 'candidate', section: 'Review candidates', image: 'candidate-page',
    title: 'A candidate’s page',
    lead: 'Their answers, your scorecard and every next step in one place.',
    points: ['Change the stage, or open a ready-to-send interview invite or rejection.', 'Score each answer and the rubric, and see other reviewers’ scores.', 'Notes, tags, the interview card and how they got here.'],
  },
  {
    id: 'answers', section: 'Review candidates', image: 'candidate-steps',
    title: 'Reading their answers',
    lead: 'Each answer shows in its own form.',
    points: ['Quick scenarios show their pick next to the best answer, and how long they took.', 'Written answers show whether they were typed or pasted. Orange means mostly pasted: something to ask about, not proof.', 'Their own words on whether they used AI.', 'The Interview card can copy a prompt for follow-up questions drawn from their answers.'],
  },
  {
    id: 'export', section: 'Review candidates', image: 'export',
    title: 'Export for AI review',
    lead: 'Build one document with the role, steps, rubric and candidates’ answers, ready to paste into an AI for a second opinion.',
    points: ['Hide names and emails for a blind review.', 'Export one person from their page, or everyone from the job’s Overview tab.'],
  },
  {
    id: 'inbox', section: 'Messages and settings', image: 'admin-inbox', to: '/admin/inbox', toLabel: 'Open the Inbox', adminOnly: true,
    title: 'Inbox',
    lead: 'Candidates can send a message from the Help button on every step of the activity.',
    points: ['The orange number counts new messages.', 'Reply by email in one click, then mark it done.'],
  },
  {
    id: 'activity', section: 'Messages and settings', image: 'admin-activity', to: '/admin/activity', toLabel: 'Open Activity', adminOnly: true,
    title: 'Activity log',
    lead: 'A live list of visits, wrong link tries and submissions, plus the wrong links people try most.',
  },
  {
    id: 'settings', section: 'Messages and settings', image: 'admin-settings', to: '/admin/settings', toLabel: 'Open Settings', adminOnly: true,
    title: 'Settings',
    lead: 'Your email alerts, the hiring team and saved templates.',
    points: ['Choose which emails you get: new applicants, new messages.', 'Add teammates by email. They sign up with that address.', 'Reuse activity pages and postings as templates.'],
  },
  {
    id: 'candidate-side', section: 'The candidate’s side', image: 'cand-8-welcome', phone: true,
    title: 'What candidates see',
    lead: 'Most apply on a phone. They see how many steps there are, about how long it takes, and your note about AI.',
    points: ['Progress saves on their device, so they can leave and come back.', 'They never see the scoring, the signals or the right answers.', 'Preview any job from its Overview tab to see it yourself.'],
  },
  {
    id: 'candidate-steps', section: 'The candidate’s side', image: 'cand-9-quiz', phone: true,
    title: 'Steps on a phone',
    lead: 'Timed scenarios show the question only after Start, with a countdown that keeps running if they reload.',
    points: ['Voice notes record in the browser. Files and links upload from the phone.', 'Before submitting, they say whether they used AI and how.'],
  },
  {
    id: 'done', section: 'Done', image: 'admin-jobs',
    title: 'You’re set',
    lead: 'Post your first job, preview it as a candidate, then share the posting.',
    points: ['The full guide, with every setting, is under Help.', 'After each update, a short What’s new shows what changed.'],
  },
];
