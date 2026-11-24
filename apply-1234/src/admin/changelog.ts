// Every update to apply1234, newest first. This is the record: add an entry for every release,
// in plain words for the hiring team, with the technical details underneath for whoever works on it next.
// Entries with a `version` also appear once in What's new (see tour/whatsnew.ts).

export type Area =
  | 'Jobs' | 'Activity' | 'Candidates' | 'Offers' | 'Sharing' | 'Emails' | 'Dashboard' | 'Help' | 'App';

export interface Release {
  date: string;             // YYYY-MM-DD, when it went live
  title: string;
  kind: 'New' | 'Improved' | 'Fixed';
  areas: Area[];
  items: string[];          // what changed, for the hiring team
  technical?: string[];     // database changes, functions, settings
  commits?: string[];       // short commit ids in c3jumpw/mco
  // What's new (shown once to admins after the update)
  version?: number;
  whatsNew?: string[];      // shorter list for What's new; `items` if left out
  image?: string;           // picture in scripts/guide/img
  phone?: boolean;
  to?: string;
  toLabel?: string;
}

export const CHANGELOG: Release[] = [
  {
    date: '2026-11-24', title: 'Messages with candidates', kind: 'New', areas: ['Offers', 'Candidates', 'Emails'],
    items: [
      'Candidates can ask questions from their offer page, in a “Questions?” box, instead of replying to an email. It works before and after they sign, and after an offer expires or is withdrawn.',
      'Offer emails and reminders now say “Questions? Message your company” with a link straight to the box.',
      'When a candidate writes, the hiring manager, whoever sent the offer, anyone CC’d and admins with message alerts on get an email with a “Reply in apply1234” button. Replying to that email still reaches the candidate, but isn’t saved in apply1234.',
      'A Messages card on the candidate’s page, under the offer, holds the whole conversation. Your replies are emailed to them from your company name through apply1234, with a button back to the conversation.',
      'The Inbox has a “Conversations with candidates” list, and unread messages count toward the Inbox number. Opening a conversation marks it read.',
    ],
    whatsNew: [
      'Candidates can message you from their offer page, and you reply from their page in apply1234.',
      'The hiring manager, the sender, anyone CC’d and admins with message alerts get an email for each new message.',
      'The Inbox lists conversations with candidates, and unread ones count toward its number.',
    ],
    technical: [
      'Migration 009_candidate_messages: hiring_chat (the team reads and marks read; messages are written only by the function), with a guard trigger that allows changing read_at only.',
      'hiring-offer v4: candidate “message” (up to 30 a day per candidate) and team “reply” actions; “view” returns the conversation; alert emails set Reply-To to the candidate, replies set it to the hiring manager.',
    ],
    commits: ['17c54a2'],
    version: 7, image: 'offer-messages',
  },
  {
    date: '2026-11-22', title: 'Offer details set up once', kind: 'Improved', areas: ['Offers', 'Jobs'],
    items: [
      'Settings › Offer defaults: your company, hiring manager, engagement, how often pay is paid, days to sign, letter, terms and standard attachments such as an NDA, used by every offer.',
      'A new Offer tab on each job for what that job does differently, including an internal starting pay (never on the posting) and a provisional period such as “90 days”.',
      'The new-job wizard has optional offer details on its last step.',
      'Offers open on what’s specific to the person: start date, pay and the date to sign by. Company, role and manager arrive filled in and folded away.',
      'After sending, “Save as this job’s offer details” keeps only what differs from your company’s defaults.',
      'Shared attachments are copied into each sent offer, so a signed offer keeps its own copy. The signed PDF numbers terms in order even when a line is left out.',
    ],
    whatsNew: [
      'Settings › Offer defaults: set your company, hiring manager, letter, terms and NDA once.',
      'Each job has an Offer tab for its own details, including a private starting pay and a provisional period.',
      'Preparing an offer now only asks for the person’s start date, pay and the date to sign by.',
    ],
    technical: [
      'Migration 008_company_offer_defaults: hiring_company (one row; admins edit, full-access editors read), hiring_any_editor(), and read access to hiring-team/company/ for editors.',
      'hiring-offer v3: copies attachments outside the offer folder into it on send; {provisional_period}; sequential list numbers in the PDF.',
    ],
    commits: ['edcb08f'],
    version: 6, image: 'job-offer',
  },
  {
    date: '2026-11-20', title: 'A change log', kind: 'New', areas: ['Help'],
    items: [
      'Help › Change log lists every update to apply1234 since it launched, with dates, newest or oldest first.',
      'Filter by area or search, and download the whole history as Markdown or JSON to keep.',
    ],
    technical: ['src/admin/changelog.ts is the single record; What’s new is built from its entries that have a version.', 'CHANGELOG.md in the app folder is written from it by scripts/changelog.mjs.'],
    version: 5, image: 'admin-changelog', to: '/admin/changelog', toLabel: 'Open the change log',
  },
  {
    date: '2026-11-19', title: 'Offer letters with e-signature', kind: 'New', areas: ['Offers', 'Candidates', 'Emails'],
    items: [
      'Prepare an offer from a candidate’s page: company, role, start date, pay, hiring manager, letter, terms and attachments, with a live preview of exactly what they’ll sign.',
      'Starter terms with [notes] that must be replaced before sending. Contractor offers are titled “Offer of engagement”.',
      'Offers are sent from “Your company via apply1234” with replies to the hiring manager. The hiring manager is CC’d by default and others can be added; their copy has no signing link.',
      'Candidates open a private link on any device, read the offer and attachments, then draw or type their signature, or decline.',
      'Everyone gets the signed PDF, which ends with a signature certificate: time, IP address, device, consent and a fingerprint of the exact text.',
      'The candidate’s page keeps the signed PDF, the signature image, the attachments and an audit trail. Sending moves them to Offer; signing moves them to Hired.',
      'Interview recordings, transcripts and files can be kept on the candidate’s page, and transcripts are included in exports.',
      'Help: four tour slides, a What’s new entry and a “Make an offer” section in the guide.',
    ],
    whatsNew: [
      'Prepare an offer from a candidate’s page: pay, start date, terms and attachments, with a live preview.',
      'Send it from your company name. The hiring manager is CC’d by default, and you can add others. Copies have no signing link.',
      'Candidates sign on any device. Everyone gets the signed PDF, with a certificate showing the time, IP address and device.',
      'Interview recordings, transcripts and files now live on the candidate’s page.',
    ],
    technical: [
      'Migration 007_offers: hiring_offers table (sent offers can only be changed by the function), hiring_applications.interview_records, private hiring-team storage bucket.',
      'New edge function hiring-offer (send, remind, withdraw, view, sign, decline, signed PDF with pdf-lib, emails through Resend).',
    ],
    commits: ['7f27d79', 'ea979d9', '41ad724', 'aa6ca13', '8ef88f5'],
    version: 4, image: 'offer-editor',
  },
  {
    date: '2026-11-18', title: 'A getting-started tour and What’s new', kind: 'New', areas: ['Help'],
    items: [
      'A slide-by-slide tour of every screen, with pictures, under Help. New teammates see it on their first sign-in.',
      'After each update, What’s new shows what changed, once.',
      'A Help menu in the header, with buttons on the dashboard, Settings and the guide.',
      'Every screenshot in the guide and the tour is refreshed by one command.',
    ],
    whatsNew: ['A slide-by-slide tour of every screen, under Help at the top of the page.', 'After each update, this What’s new shows what changed.'],
    technical: ['scripts/guide/update.sh builds the app, takes the screenshots with sample data, runs the tour checks and rebuilds the guide.'],
    commits: ['f3c9751', 'b5b2408'],
    version: 3, image: 'admin-overview',
  },
  {
    date: '2026-11-13', title: 'Activity steps for every kind of role', kind: 'New', areas: ['Activity', 'Jobs', 'Candidates'],
    items: [
      'Ten kinds of step: written answers, quick timed scenarios, ranking, must-haves, work samples, mini briefs, critiques, voice notes, their choice and video.',
      'The new-job wizard suggests steps for the role, and the AI writes them.',
      'Candidates are told AI is welcome if they say how they used it, and answer that before submitting.',
      'Written answers show whether they were typed or pasted. New flags: must-haves, scenario score, pasted, used AI.',
      'Interview follow-up questions drawn from a candidate’s own answers.',
    ],
    technical: ['Migration 006_activity_steps: answers checked and scored on the server, wider uploads, public critique images. Search path pinned on the step helper functions.', 'hiring-notify shows each step type in emails.'],
    commits: ['dfda0fd', '83e7186', 'b1d7b78'],
    version: 2, image: 'job-steps',
  },
  {
    date: '2026-11-13', title: 'Choose what people you share a job with can see', kind: 'Improved', areas: ['Sharing'],
    items: [
      'When you give someone access to a job, choose whether they see candidates’ contact details, and whether they can open résumés and cover letters.',
      'The same switches appear when inviting and when changing someone’s access later.',
    ],
    whatsNew: ['When you give someone access to a job, choose whether they see candidates’ contact details and résumés.'],
    technical: ['Migration 005_reviewer_files_permission: see_files permission, enforced by the database.'],
    commits: ['b8bbdc3'],
    version: 1, image: 'access-card',
  },
  {
    date: '2026-11-11', title: 'Share a job with someone', kind: 'New', areas: ['Sharing', 'Emails'],
    items: [
      'Invite people to one job as a Reviewer (scores candidates in their own limited view) or with Full access to that job.',
      'Per-person options: hide candidate emails, shortlisted only, move stages, new-candidate emails.',
      'Branded invite emails, new-candidate alerts for people with access, and a branded sign-up confirmation email.',
    ],
    technical: ['Migration 004_client_reviewers: per-job access enforced by database rules.', 'hiring-notify: invite email and a refreshed branded layout for every email.'],
    commits: ['bf7e342', '06eabe5'],
  },
  {
    date: '2026-11-09', title: 'Refresh button and pull-to-refresh', kind: 'Improved', areas: ['App'],
    items: ['A refresh button in the header saves pending edits and reloads the page’s data.', 'On phones, drag down from the top of the page to refresh.'],
    commits: ['9a95fa2'],
  },
  {
    date: '2026-11-08', title: 'The illustrated hiring guide', kind: 'New', areas: ['Help'],
    items: [
      'A guide with screenshots, diagrams and numbered callouts covering setup, review, signals, the dashboard, inbox, emails, settings and the candidate journey.',
      'Pop-up windows such as Export always open on screen.',
    ],
    commits: ['a394e39'],
  },
  {
    date: '2026-11-08', title: 'Home-screen and app icons', kind: 'Improved', areas: ['App'],
    items: ['apply1234 has its own icon when added to a phone’s home screen, and a matching browser-tab icon.'],
    commits: ['5d4f858'],
  },
  {
    date: '2026-11-08', title: 'Loom videos without a length', kind: 'Fixed', areas: ['Activity'],
    items: ['Some finished Loom videos don’t report their length. A working link now simply counts as good, and the length shows only when Loom provides it.'],
    commits: ['4d74aee'],
  },
  {
    date: '2026-11-07', title: 'Help inbox, dashboard, résumés and emails', kind: 'New', areas: ['Dashboard', 'Emails', 'Candidates', 'Jobs'],
    items: [
      'A Need help? button on every activity page; messages arrive in a new Inbox with an unread count.',
      'The Overview dashboard: period switch, key numbers, a daily chart, the funnel and lists that need attention.',
      'Candidates can add a résumé and cover letter on the last step, stored privately.',
      'Emails: a confirmation to each candidate, and alerts to the team.',
      'Job links are checked so they never overlap another job’s link.',
    ],
    technical: ['Migration 003_links_inbox_files_dashboard.', 'New edge function hiring-notify, sending through Resend from hiring@apply1234.com.'],
    commits: ['e80d916'],
  },
  {
    date: '2026-11-07', title: 'New-job wizard and job-board links', kind: 'New', areas: ['Jobs'],
    items: [
      'A step-by-step wizard: paste notes, choose the link, copy the AI prompt, paste the reply, launch.',
      'One AI reply fills in the title, posting, questions, interview questions and rubric.',
      'Random-code links by default, and a version of the link for each job board, so you can see where candidates came from.',
    ],
    technical: ['Migration 002_job_board_sources.'],
    commits: ['468f0bd'],
  },
  {
    date: '2026-11-07', title: 'apply1234 launched', kind: 'New', areas: ['Jobs', 'Activity', 'Candidates'],
    items: [
      'Job postings with the application link hidden in pieces, so only careful readers find it.',
      'The Loom video activity, with every visit and wrong link try tracked.',
      'The admin: jobs, the posting editor, candidates, reviews, interviews and exports.',
    ],
    technical: ['Vite + React app on Vercel; Supabase database (migration 001_hiring_schema).'],
    commits: ['7914bde', 'a941b5a'],
  },
];

/** The whole history as Markdown, oldest or newest first. */
export function changelogMarkdown(list: Release[] = CHANGELOG, technical = true): string {
  const out = ['# apply1234 change log', '', `${list.length} updates, ${list[list.length - 1]?.date} to ${list[0]?.date}.`, ''];
  for (const r of list) {
    out.push(`## ${r.date} · ${r.title}`, '', `${r.kind} · ${r.areas.join(', ')}${r.version ? ` · What’s new ${r.version}` : ''}`, '');
    for (const i of r.items) out.push(`- ${i}`);
    if (technical && r.technical?.length) { out.push('', 'Technical:'); for (const t of r.technical) out.push(`- ${t}`); }
    if (technical && r.commits?.length) out.push('', `Commits: ${r.commits.join(', ')}`);
    out.push('');
  }
  return out.join('\n');
}
