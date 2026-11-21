# RAMP change log

<!-- Generated from src/changelog/changelog.json by `npm run changelog`. Edit the JSON, not this file. -->

Every RAMP release, newest first: what changed, who it affects, and the commits and database migrations behind it.
Admins see the same log in the app under **Admin › Change log**.

## 1.7 · Interactive training, the RAMP Assistant and reminders

*November 21, 2026* · shown at sign-in to the people it affects

Lessons you practise in, a way to turn a client’s input into custom modules, reminders to finish training, and richer training numbers.

- **New:** Interactive lessons: scenarios, put-in-order, sort and match drills, flashcards, checklists and click-throughs on real screenshots, checked as you go. *(team members, guests, mentors and leads, admins)*
- **New:** Practice versions of a task manager, calendar, inbox and team chat, where you do the real routine and RAMP checks your work. *(team members, guests, mentors and leads, admins)*
- **New:** Some lessons add a real task, notebook page or message for you, so practice turns into work. *(team members, guests, mentors and leads, admins)*
- **Better:** Presentations show right inside lessons: Google Slides, Docs and Drive files, Canva, Gamma and PDF links. *(team members, guests, mentors and leads, admins)*
- **New:** Eleven new lesson types in the module builder, grouped as Explain, Practise and check, and Do and hand in, each with a live preview. *(admins)*
- **New:** RAMP Assistant: build a packet from a client’s launch plan, the job posting and your own modules, start an Assistant chat from the setup prompt, and import the modules it writes. *(admins)*
- **New:** Import modules from a package file or a pasted reply. They arrive as drafts, pictures included, and can go straight onto a job role. *(admins)*
- **New:** Remind people to finish their training, one module at a time or everything open. It shows on their Home and Tasks and closes itself when they finish. *(admins, mentors and leads)*
- **New:** Training insights on Metrics: average quiz and practice scores, time per module, the exercises people find hardest, and one click to remind everyone overdue. *(admins)*
- **New:** See each team member’s quiz and practice scores, time spent and where every module stands. *(clients; needs agency on)*

Database: `012`, `013`

## 1.6 · Change log and update notes

*November 20, 2026* · shown at sign-in to the people it affects

A full history of RAMP updates for admins, and a short note for everyone about what changed for them.

- **New:** Change log in the Admin portal: every RAMP update in order, who it affects, and a CSV or JSON download. *(admins)*
- **New:** After each update, RAMP shows you a short summary of the changes that affect you the next time you sign in. Just once. *(everyone)*
- **New:** Look back at recent updates any time with What’s new on the Guide page or in More. *(everyone)*
- **Better:** RAMP remembers which tours and updates you’ve seen on every device, so they don’t repeat on your phone and computer. *(everyone)*

Commits: `3c0e4ca` · Database: `011`

## 1.5 · Getting-started tours and a Guide for every role

*November 18, 2026*

Slide tours with real screenshots for every kind of person, What’s new slides after updates, and Guide pages for the newer features.

- **New:** A getting-started tour with a screenshot on every slide opens the first time you sign in. Replay it any time from the Guide. *(everyone)*
- **New:** What’s new slides show the main features of an update to the admins they apply to. *(admins, platform admins)*
- **New:** Clients can open the Guide, with sections written for them. *(clients)*
- **Better:** New Guide sections for My work, coaching, account and billing, setup, the agency pages, the client portal and the platform console. *(everyone)*
- **Better:** Guide and tour screenshots are retaken automatically after every update, so they always match the app. *(everyone)*
- **Fixed:** The sign-in screen no longer says RAMP twice. *(everyone)*
- **Fixed:** Pop-up windows no longer show a stray outline when they open. *(everyone)*

Commits: `8e084dd`, `36e1bc6`

## 1.4 · “Team member” instead of “assistant”

*November 18, 2026*

RAMP is for every new hire, so the wording on screen now says team member.

- **Better:** Pages and messages say “team member” instead of “assistant”, including the agency, client portal, coaching and launch plan pages. *(everyone)*
- **Better:** New placements are titled “Team member” by default instead of “Virtual assistant”. *(admins; needs agency on)*

Commits: `3ca4f00` · Database: `010`

## 1.3 · Workspaces, accounts and billing

*November 17, 2026* · shown at sign-in to the people it affects

RAMP can run for other companies: each gets its own workspace, plan and seats.

- **New:** Account and billing: your plan, seats in use, the organizations in your account and Stripe billing. *(admins)*
- **New:** Owners can add another organization, such as a second company or brand, with its own people, training and settings. *(admins)*
- **New:** New workspaces start with a short setup wizard: company details, what’s included and the first invites. *(admins)*
- **Better:** People shows how many seats you’re using. *(admins)*
- **New:** If you belong to more than one workspace, switch between them from the company name at the top. *(everyone)*
- **New:** Link a client’s own RAMP workspace so their admins see your team members from inside it. *(admins; needs agency on)*
- **New:** Clients with their own RAMP workspace see their team members, hours and invoices there. *(clients)*
- **Better:** Files uploaded to Resources are kept inside your own workspace. *(admins)*
- **New:** Companies can ask for their own workspace from the sign-in screen with Start for my business, and get in once approved. *(platform admins)*
- **New:** Client accounts console: approve or decline companies, give free access, a trial or a paid plan, set seats, and pause or close accounts. *(platform admins)*
- **New:** Open any workspace as RAMP Support. Each visit is recorded in that workspace’s audit log. *(platform admins)*
- **New:** Platform settings: trial length, default seats, the training library new workspaces copy and the Stripe plans owners can choose. *(platform admins)*

Commits: `8e036e0` · Database: `007`, `008`, `009`

## 1.2 · Agency tools: clients, placements, hours, invoices and payouts

*November 17, 2026* · shown at sign-in to the people it affects

For placing team members with client companies: everything from the placement to the payout, and a portal for clients.

- **New:** Agency dashboard with revenue, margin and everything that needs you today. *(admins; needs agency on)*
- **New:** Clients: company details, contacts, billing and an extra training track for each client. *(admins; needs agency on)*
- **New:** Placements with bill and pay rates, an onboarding checklist, check-ins and a replacement guarantee. *(admins; needs agency on)*
- **New:** Timesheets: approve or return weekly hours, or enter them for someone. *(admins; needs agency on)*
- **New:** Invoices for hours, prepayments and setup fees. Print them or send them through Stripe. *(admins; needs agency on)*
- **New:** Payouts for approved hours, with a batch file for Wise. *(admins; needs agency on)*
- **New:** Tiers and agency settings: default rates, the checklist, check-in schedule, invoicing and the Day 1 agenda. *(admins; needs agency on)*
- **New:** Launch plans: a guided prep plan, a timed Day 1 run sheet and a printable plan for every placement. *(admins, clients, team members; needs agency on)*
- **New:** My work: log your weekly hours, add payout details, and see your placement, tier and pay. *(team members; needs agency on, placed team members)*
- **New:** Coaching: check-ins, onboarding checklists and training for the team members you coach. *(mentors and leads; needs agency on, coaches)*
- **New:** Client portal: your team members, hours to approve, invoices and requests. *(clients)*
- **Fixed:** Advance invoices add the period’s prepayment before loose hours, so approved hours are never billed twice. *(admins; needs agency on)*
- **Fixed:** Team members only see a launch plan once it’s marked ready, and two people saving at once can’t overwrite each other. *(admins, clients, team members; needs agency on)*

Commits: `845a5b2` · Database: `004`, `005`, `006`, `006b`

## 1.1 · The Guide

*November 8, 2026*

An illustrated guide to every page, with real screenshots and numbered callouts.

- **New:** The Guide: every page explained with screenshots, numbered callouts, steps and tips, showing only what you can open. *(team members, guests, mentors and leads, admins)*
- **New:** An admin guide for every setting, linked from the Admin portal. *(admins)*
- **Better:** Links in Resources that point to RAMP pages open inside the app. *(team members, guests, mentors and leads, admins)*
- **Fixed:** The message box stays on screen while you scroll a chat. *(team members, guests, mentors and leads, admins; needs Chat on)*

Commits: `fc68158`, `c1c7563`

## 1.0 · RAMP launches

*November 8, 2026*

Training, onboarding and HR in one place for new hires, mentors and admins.

- **New:** Sign in with your invitation, ask for access, and reset your password. *(team members, guests, mentors and leads, admins)*
- **New:** A welcome flow and a practice sandbox for your first sign-in. *(team members, guests)*
- **New:** Training made of short slides, readings, videos and quizzes. Your place is saved. *(team members, guests, mentors and leads, admins)*
- **New:** Tasks, a notebook, a vault for work logins, chat, resources and news. *(team members, mentors and leads, admins)*
- **New:** Onboarding documents to fill in, upload and e-sign from your profile. *(team members)*
- **New:** Team progress and reviews for mentors and leads. *(mentors and leads)*
- **New:** Admin portal: organization, roles and departments, welcome flow, documents, training builder, assignments, people, metrics, announcements, resources, feature switches and the audit log. *(admins)*
- **New:** Person records with documents, training and sign-in history, including IP address and device. *(admins)*

Commits: `913a29e` · Database: `001`, `002`, `003`
