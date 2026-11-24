# apply1234 change log

Written from `src/admin/changelog.ts` by `node scripts/changelog.mjs`. Edit that file, not this one.

15 updates, 2026-11-07 to 2026-11-24.

## 2026-11-24 · Messages with candidates

New · Offers, Candidates, Emails · What’s new 7

- Candidates can ask questions from their offer page, in a “Questions?” box, instead of replying to an email. It works before and after they sign, and after an offer expires or is withdrawn.
- Offer emails and reminders now say “Questions? Message your company” with a link straight to the box.
- When a candidate writes, the hiring manager, whoever sent the offer, anyone CC’d and admins with message alerts on get an email with a “Reply in apply1234” button. Replying to that email still reaches the candidate, but isn’t saved in apply1234.
- A Messages card on the candidate’s page, under the offer, holds the whole conversation. Your replies are emailed to them from your company name through apply1234, with a button back to the conversation.
- The Inbox has a “Conversations with candidates” list, and unread messages count toward the Inbox number. Opening a conversation marks it read.

Technical:
- Migration 009_candidate_messages: hiring_chat (the team reads and marks read; messages are written only by the function), with a guard trigger that allows changing read_at only.
- hiring-offer v4: candidate “message” (up to 30 a day per candidate) and team “reply” actions; “view” returns the conversation; alert emails set Reply-To to the candidate, replies set it to the hiring manager.

Commits: 17c54a2

## 2026-11-22 · Offer details set up once

Improved · Offers, Jobs · What’s new 6

- Settings › Offer defaults: your company, hiring manager, engagement, how often pay is paid, days to sign, letter, terms and standard attachments such as an NDA, used by every offer.
- A new Offer tab on each job for what that job does differently, including an internal starting pay (never on the posting) and a provisional period such as “90 days”.
- The new-job wizard has optional offer details on its last step.
- Offers open on what’s specific to the person: start date, pay and the date to sign by. Company, role and manager arrive filled in and folded away.
- After sending, “Save as this job’s offer details” keeps only what differs from your company’s defaults.
- Shared attachments are copied into each sent offer, so a signed offer keeps its own copy. The signed PDF numbers terms in order even when a line is left out.

Technical:
- Migration 008_company_offer_defaults: hiring_company (one row; admins edit, full-access editors read), hiring_any_editor(), and read access to hiring-team/company/ for editors.
- hiring-offer v3: copies attachments outside the offer folder into it on send; {provisional_period}; sequential list numbers in the PDF.

Commits: edcb08f

## 2026-11-20 · A change log

New · Help · What’s new 5

- Help › Change log lists every update to apply1234 since it launched, with dates, newest or oldest first.
- Filter by area or search, and download the whole history as Markdown or JSON to keep.

Technical:
- src/admin/changelog.ts is the single record; What’s new is built from its entries that have a version.
- CHANGELOG.md in the app folder is written from it by scripts/changelog.mjs.

## 2026-11-19 · Offer letters with e-signature

New · Offers, Candidates, Emails · What’s new 4

- Prepare an offer from a candidate’s page: company, role, start date, pay, hiring manager, letter, terms and attachments, with a live preview of exactly what they’ll sign.
- Starter terms with [notes] that must be replaced before sending. Contractor offers are titled “Offer of engagement”.
- Offers are sent from “Your company via apply1234” with replies to the hiring manager. The hiring manager is CC’d by default and others can be added; their copy has no signing link.
- Candidates open a private link on any device, read the offer and attachments, then draw or type their signature, or decline.
- Everyone gets the signed PDF, which ends with a signature certificate: time, IP address, device, consent and a fingerprint of the exact text.
- The candidate’s page keeps the signed PDF, the signature image, the attachments and an audit trail. Sending moves them to Offer; signing moves them to Hired.
- Interview recordings, transcripts and files can be kept on the candidate’s page, and transcripts are included in exports.
- Help: four tour slides, a What’s new entry and a “Make an offer” section in the guide.

Technical:
- Migration 007_offers: hiring_offers table (sent offers can only be changed by the function), hiring_applications.interview_records, private hiring-team storage bucket.
- New edge function hiring-offer (send, remind, withdraw, view, sign, decline, signed PDF with pdf-lib, emails through Resend).

Commits: 7f27d79, ea979d9, 41ad724, aa6ca13, 8ef88f5

## 2026-11-18 · A getting-started tour and What’s new

New · Help · What’s new 3

- A slide-by-slide tour of every screen, with pictures, under Help. New teammates see it on their first sign-in.
- After each update, What’s new shows what changed, once.
- A Help menu in the header, with buttons on the dashboard, Settings and the guide.
- Every screenshot in the guide and the tour is refreshed by one command.

Technical:
- scripts/guide/update.sh builds the app, takes the screenshots with sample data, runs the tour checks and rebuilds the guide.

Commits: f3c9751, b5b2408

## 2026-11-13 · Activity steps for every kind of role

New · Activity, Jobs, Candidates · What’s new 2

- Ten kinds of step: written answers, quick timed scenarios, ranking, must-haves, work samples, mini briefs, critiques, voice notes, their choice and video.
- The new-job wizard suggests steps for the role, and the AI writes them.
- Candidates are told AI is welcome if they say how they used it, and answer that before submitting.
- Written answers show whether they were typed or pasted. New flags: must-haves, scenario score, pasted, used AI.
- Interview follow-up questions drawn from a candidate’s own answers.

Technical:
- Migration 006_activity_steps: answers checked and scored on the server, wider uploads, public critique images. Search path pinned on the step helper functions.
- hiring-notify shows each step type in emails.

Commits: dfda0fd, 83e7186, b1d7b78

## 2026-11-13 · Choose what people you share a job with can see

Improved · Sharing · What’s new 1

- When you give someone access to a job, choose whether they see candidates’ contact details, and whether they can open résumés and cover letters.
- The same switches appear when inviting and when changing someone’s access later.

Technical:
- Migration 005_reviewer_files_permission: see_files permission, enforced by the database.

Commits: b8bbdc3

## 2026-11-11 · Share a job with someone

New · Sharing, Emails

- Invite people to one job as a Reviewer (scores candidates in their own limited view) or with Full access to that job.
- Per-person options: hide candidate emails, shortlisted only, move stages, new-candidate emails.
- Branded invite emails, new-candidate alerts for people with access, and a branded sign-up confirmation email.

Technical:
- Migration 004_client_reviewers: per-job access enforced by database rules.
- hiring-notify: invite email and a refreshed branded layout for every email.

Commits: bf7e342, 06eabe5

## 2026-11-09 · Refresh button and pull-to-refresh

Improved · App

- A refresh button in the header saves pending edits and reloads the page’s data.
- On phones, drag down from the top of the page to refresh.

Commits: 9a95fa2

## 2026-11-08 · The illustrated hiring guide

New · Help

- A guide with screenshots, diagrams and numbered callouts covering setup, review, signals, the dashboard, inbox, emails, settings and the candidate journey.
- Pop-up windows such as Export always open on screen.

Commits: a394e39

## 2026-11-08 · Home-screen and app icons

Improved · App

- apply1234 has its own icon when added to a phone’s home screen, and a matching browser-tab icon.

Commits: 5d4f858

## 2026-11-08 · Loom videos without a length

Fixed · Activity

- Some finished Loom videos don’t report their length. A working link now simply counts as good, and the length shows only when Loom provides it.

Commits: 4d74aee

## 2026-11-07 · Help inbox, dashboard, résumés and emails

New · Dashboard, Emails, Candidates, Jobs

- A Need help? button on every activity page; messages arrive in a new Inbox with an unread count.
- The Overview dashboard: period switch, key numbers, a daily chart, the funnel and lists that need attention.
- Candidates can add a résumé and cover letter on the last step, stored privately.
- Emails: a confirmation to each candidate, and alerts to the team.
- Job links are checked so they never overlap another job’s link.

Technical:
- Migration 003_links_inbox_files_dashboard.
- New edge function hiring-notify, sending through Resend from hiring@apply1234.com.

Commits: e80d916

## 2026-11-07 · New-job wizard and job-board links

New · Jobs

- A step-by-step wizard: paste notes, choose the link, copy the AI prompt, paste the reply, launch.
- One AI reply fills in the title, posting, questions, interview questions and rubric.
- Random-code links by default, and a version of the link for each job board, so you can see where candidates came from.

Technical:
- Migration 002_job_board_sources.

Commits: 468f0bd

## 2026-11-07 · apply1234 launched

New · Jobs, Activity, Candidates

- Job postings with the application link hidden in pieces, so only careful readers find it.
- The Loom video activity, with every visit and wrong link try tracked.
- The admin: jobs, the posting editor, candidates, reviews, interviews and exports.

Technical:
- Vite + React app on Vercel; Supabase database (migration 001_hiring_schema).

Commits: 7914bde, a941b5a

