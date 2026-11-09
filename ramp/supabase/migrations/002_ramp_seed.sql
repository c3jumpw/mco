-- RAMP — starter content. Safe to run once on a fresh schema.
-- Departments come from core.teams and job roles from live hiring jobs, so RAMP starts with
-- your real structure. Anything company-specific is left as a draft with [placeholders].

insert into public.ramp_org (id, name) values (true, 'MKC') on conflict (id) do nothing;

insert into public.ramp_departments (name)
select t.name from core.teams t where t.active order by (t.kind = 'org') desc, t.name
on conflict (name) do nothing;

insert into public.ramp_job_roles (title, department_id, level, description)
select j.title, (select id from public.ramp_departments order by created_at limit 1), 'employee', 'From the hiring app'
from public.hiring_jobs j
where j.status = 'published'
  and not exists (select 1 from public.ramp_job_roles r where r.title = j.title);

insert into public.ramp_job_roles (title, department_id, level, description)
select 'Team Member', (select id from public.ramp_departments order by created_at limit 1), 'employee', 'General role for new staff'
where not exists (select 1 from public.ramp_job_roles where title = 'Team Member');

insert into public.ramp_members (email, full_name, level, status, source)
values ('mk1292.unyty@gmail.com', '', 'owner', 'invited', 'seed')
on conflict (email) do nothing;

-- ───────── training modules ─────────
insert into public.ramp_modules (title, track, summary, minutes, objectives, blocks, pass_score, mentor_review, due_days, required, builtin, status, sort) values
('Platform basics (interactive)', 'company', 'Practise RAMP in a safe sandbox: nine quick missions.', 5,
 '["Find Training, Tasks, Notes and Chat","Create a task and send it for review","Start a notebook page","Message your mentor"]',
 '[{"type":"practice"}]', 0, false, 1, true, 'practice', 'published', 1),

('Welcome and culture', 'company', 'Draft: add your company story before publishing.', 10,
 '["Explain what the company does and who it serves","Name the core principles and give an example of each"]',
 '[{"type":"slides","slides":[{"title":"Welcome","body":"[Who you are, what you do and who you serve.]"},{"title":"Our core principles","body":"[List 3 to 5 principles, with one example of each in action.]"},{"title":"How we work together","body":"[Working hours, regular meetings, and who to ask for what.]"}]}]',
 0, false, 2, true, null, 'draft', 2),

('How we use tasks', 'company', 'Why every request becomes a task, and how to move one along.', 15,
 '["Explain why every request becomes a task","Write a clear task with one owner and a due date","Use statuses correctly, especially In review"]',
 '[{"type":"slides","slides":[{"title":"One place for every task","body":"Work that comes up in chat, email or a meeting becomes a task. That way nothing slips through the cracks, and everyone can see who owns what."},{"title":"Anatomy of a good task","body":"Title: starts with a verb and says what done looks like.\nOwner: one person, even when others help.\nDue date: when it needs to be finished.\nStatus and comments: where it stands, with updates kept on the task."},{"title":"Statuses move left to right","body":"To do: assigned, not started yet.\nIn progress: you’re working on it.\nIn review: finished on your side, waiting for a check.\nDone: approved and complete."}]},{"type":"quiz","questions":[{"q":"You’ve finished a task, but your mentor hasn’t checked it yet. Which status should it have?","options":["In progress","In review","Done"],"answer":1,"explain":"In review tells your mentor it’s ready to check."},{"q":"Three people are helping with a task. Who should own it?","options":["All three of them","One person","Nobody until it’s done"],"answer":1,"explain":"One owner keeps it clear who moves it forward."}]},{"type":"assignment","prompt":"On your task board, add a task called “Set up my notebook”, give it a due date, and move it to In review. Then write one or two sentences about how you’ll use tasks in your role."}]',
 100, true, 3, true, null, 'published', 3),

('Communication and chat basics', 'company', 'Which channel to use, and how to keep work updates findable.', 8,
 '["Choose the right channel for a message","Keep work updates on tasks, not in direct messages","Write messages that get a fast, useful reply"]',
 '[{"type":"slides","slides":[{"title":"Where messages go","body":"#announcements: company news from admins. Read-only.\n#general: anything for everyone.\n#new-hires: questions while you train.\nDirect messages: quick questions for one person, like your mentor."},{"title":"Keep work on the task","body":"If a message is about a piece of work, put it on the task. Chat is for conversation; tasks are the record."},{"title":"Good habits","body":"Write the whole question in one message.\nUse a name when you need someone specific.\nIf it’s urgent, say so and say why.\nIf you need more time to reply, say that too."}]}]',
 0, false, 4, true, null, 'published', 4),

('Security and data handling', 'company', 'Protect accounts, devices and client information.', 10,
 '["Protect logins and devices","Handle client and company information safely","Report anything suspicious quickly"]',
 '[{"type":"reading","title":"The basics","body":"Use a different password for every work account, and keep them in your RAMP Vault or an approved password manager.\nTurn on two-step sign-in wherever it’s offered.\nLock your screen when you step away.\nNever share client or company information outside the tools we use.\nIf a message asks you to sign in, pay or send files when you didn’t expect it, stop and check with your lead first.\nIf something looks wrong, report it right away. Reporting early is always the right call."},{"type":"quiz","questions":[{"q":"An email you weren’t expecting asks you to sign in through a link. What should you do?","options":["Sign in quickly so you don’t miss anything","Stop and check with your lead first","Forward it to the team"],"answer":1,"explain":"Unexpected sign-in requests are the most common way accounts get stolen."},{"q":"Where should you keep work passwords?","options":["In a note on your phone","In your RAMP Vault or an approved password manager","In a chat message to yourself"],"answer":1,"explain":"The Vault is encrypted and only you can open it."}]}]',
 100, false, 6, true, null, 'published', 5),

('Quarterly security refresher', 'continued', 'Five-minute check-in on the security basics.', 5,
 '["Spot an unexpected sign-in request","Keep passwords somewhere safe"]',
 '[{"type":"quiz","questions":[{"q":"An email you weren’t expecting asks you to sign in through a link. What should you do?","options":["Sign in quickly","Stop and check with your lead first","Ignore every email"],"answer":1},{"q":"Where should you keep work passwords?","options":["In a note on your phone","In your RAMP Vault or an approved password manager","In a chat message to yourself"],"answer":1}]}]',
 100, false, 30, false, null, 'published', 20),

('Role essentials', 'role', 'Draft: the core skills for this role.', 30,
 '["[What someone in this role can do after this module]"]',
 '[{"type":"slides","slides":[{"title":"What this role does","body":"[The outcomes this role is responsible for.]"},{"title":"A typical day","body":"[The routines, tools and people this role works with.]"},{"title":"What good looks like","body":"[Examples of great work in this role.]"}]},{"type":"assignment","prompt":"[A small real task to try, which your mentor reviews.]"}]',
 0, true, 14, false, null, 'draft', 30);

insert into public.ramp_role_modules (job_role_id, module_id)
select r.id, m.id from public.ramp_job_roles r cross join public.ramp_modules m
where m.title = 'Role essentials'
on conflict do nothing;

-- ───────── document templates ─────────
insert into public.ramp_templates (title, kind, stage, audience, description, fields, legal_review, status, sort) values
('New employee information', 'form', 'onboarding', 'everyone', 'Contact details and an emergency contact.',
 '[{"k":"legal_name","type":"text","label":"Full legal name","required":true},{"k":"preferred_name","type":"text","label":"Preferred name"},{"k":"dob","type":"date","label":"Date of birth","required":true,"secure":true},{"k":"address","type":"text","label":"Home address","required":true},{"k":"phone","type":"phone","label":"Mobile phone","required":true},{"k":"emergency_name","type":"text","label":"Emergency contact name","required":true},{"k":"emergency_phone","type":"phone","label":"Emergency contact phone","required":true}]',
 false, 'published', 1),

('Photo ID upload', 'upload', 'onboarding', 'everyone', 'A clear photo of a government-issued ID. Only owners and admins can open it. This doesn’t replace the official Form I-9 process.',
 '[{"k":"note","type":"info","label":"Use good lighting and make sure all four corners are visible."},{"k":"id_front","type":"file","label":"Front of ID","required":true,"secure":true},{"k":"id_back","type":"file","label":"Back of ID","secure":true}]',
 false, 'published', 2),

('Payroll and direct deposit', 'form', 'onboarding', 'everyone', 'Where your pay goes. Bank details are encrypted.',
 '[{"k":"bank_name","type":"text","label":"Bank name","required":true},{"k":"account_type","type":"choice","label":"Account type","required":true,"options":["Checking","Savings"]},{"k":"routing","type":"secure","label":"Routing number","required":true},{"k":"account","type":"secure","label":"Account number","required":true},{"k":"w4","type":"file","label":"Federal tax withholding form (W-4)","required":true,"secure":true},{"k":"sign","type":"sign","label":"I authorize direct deposit to this account","required":true}]',
 false, 'published', 3),

('Policies and core principles', 'esign', 'onboarding', 'everyone', 'Draft: add your handbook and principles, then publish.',
 '[{"k":"text","type":"info","label":"[Paste your policies and core principles here, or link the handbook from Resources.]"},{"k":"handbook","type":"check","label":"I’ve read the employee handbook","required":true},{"k":"conduct","type":"check","label":"I understand the code of conduct","required":true},{"k":"sign","type":"sign","label":"Signature","required":true}]',
 false, 'draft', 4),

('Confidentiality agreement', 'esign', 'onboarding', 'everyone', 'Draft: add your agreement text, then publish.',
 '[{"k":"text","type":"info","label":"[Your confidentiality agreement text goes here.]"},{"k":"agree","type":"check","label":"I agree to the terms above","required":true},{"k":"sign","type":"sign","label":"Signature","required":true}]',
 false, 'draft', 5),

('Non-compete and non-solicitation', 'esign', 'onboarding', 'role', 'Only for roles that need it. Rules differ by state, and some states don’t allow non-competes.',
 '[{"k":"text","type":"info","label":"[Agreement text, reviewed by your employment lawyer.]"},{"k":"agree","type":"check","label":"I agree to the terms above","required":true},{"k":"sign","type":"sign","label":"Signature","required":true}]',
 true, 'draft', 6),

('Install your tools', 'checklist', 'first_week', 'everyone', 'Get every app you need on your phone and computer.',
 '[{"k":"home_screen","type":"check","label":"Add RAMP to your phone’s home screen","required":true},{"k":"apps","type":"check","label":"Install the apps your role uses (your mentor will share the list)","required":true},{"k":"two_step","type":"check","label":"Turn on two-step sign-in for your work accounts","required":true},{"k":"screenshot","type":"file","label":"Screenshot of your setup (optional)"}]',
 false, 'published', 7),

('Set up your company email', 'checklist', 'first_week', 'everyone', 'Sign in, add your signature and connect your phone.',
 '[{"k":"signin","type":"check","label":"Sign in to your company email","required":true},{"k":"signature","type":"check","label":"Add the company email signature","required":true},{"k":"phone","type":"check","label":"Add your email account to your phone","required":true}]',
 false, 'published', 8),

('Using your notebook', 'checklist', 'first_week', 'everyone', 'A short guided practice in your own notebook.',
 '[{"k":"page","type":"check","label":"Create a page from the Module notes template","required":true},{"k":"file","type":"check","label":"Attach a file to a page","required":true},{"k":"vault","type":"check","label":"Save one login in your Vault","required":true}]',
 false, 'published', 9),

('Employment application', 'form', 'before', 'candidates', 'Your hiring app already collects applications. Use this only if you also need a written application.',
 '[{"k":"name","type":"text","label":"Full legal name","required":true},{"k":"email","type":"email","label":"Email","required":true},{"k":"phone","type":"phone","label":"Phone","required":true},{"k":"start","type":"date","label":"Earliest start date"},{"k":"resume","type":"file","label":"Résumé","required":true},{"k":"sign","type":"sign","label":"I confirm this information is accurate","required":true}]',
 false, 'draft', 10);

-- ───────── chat channels ─────────
insert into public.ramp_channels (slug, name, description, kind, read_only) values
('announcements', 'announcements', 'Company news from admins', 'company', true),
('general', 'general', 'Anything for everyone', 'company', false),
('new-hires', 'new-hires', 'New hires and their mentors', 'cohort', false)
on conflict (slug) do nothing;
