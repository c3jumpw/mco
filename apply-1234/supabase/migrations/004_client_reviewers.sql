-- Per-job access for people outside the hiring team, at one of two levels:
--   reviewer: watches answers, fills in their own scorecard and leaves notes (secondary scorer)
--   editor:   full access to that one job: edits it and manages its candidates
-- Other jobs, settings, the inbox and the hiring team stay admin-only.
-- All limits are enforced here in the database, not only in the app.

create table if not exists public.hiring_reviewers (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.hiring_jobs(id) on delete cascade,
  email            text not null check (email = lower(email) and position('@' in email) > 1),
  name             text not null default '',
  user_id          uuid references auth.users(id) on delete set null,
  role             text not null default 'reviewer' check (role in ('reviewer', 'editor')),
  hide_contact     boolean not null default true,   -- candidates' email addresses are hidden
  shortlisted_only boolean not null default false,  -- sees only shortlisted (and later) candidates
  notify           boolean not null default true,   -- email when a new candidate arrives
  can_move_stages  boolean not null default false,
  invited_by       text not null default lower(coalesce(auth.jwt()->>'email','')),
  invited_at       timestamptz not null default now(),
  last_invite_at   timestamptz,
  claimed_at       timestamptz,
  unique (job_id, email),
  check (role = 'reviewer' or (not hide_contact and not shortlisted_only))
);
create index if not exists hiring_reviewers_user_idx on public.hiring_reviewers (user_id);

alter table public.hiring_reviewers enable row level security;
revoke all on public.hiring_reviewers from anon;
grant select, insert, update, delete on public.hiring_reviewers to authenticated;
drop policy if exists "hiring_reviewers admin all" on public.hiring_reviewers;
create policy "hiring_reviewers admin all" on public.hiring_reviewers for all to authenticated
  using ((select public.hiring_is_admin())) with check ((select public.hiring_is_admin()));

-- Can the signed-in reviewer see this application? Test submissions and, where set, not-yet-shortlisted
-- candidates are excluded.
create or replace function public.hiring_reviewer_sees(p_app uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1
      from public.hiring_applications a
      join public.hiring_reviewers r on r.job_id = a.job_id
     where a.id = p_app
       and r.user_id = auth.uid()
       and coalesce(a.metrics->>'preview', '') <> 'true'
       and (not r.shortlisted_only or a.stage in ('shortlisted', 'interview', 'offer', 'hired')));
$$;

-- Has the signed-in user got full access to this job?
create or replace function public.hiring_job_editor(p_job uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hiring_reviewers r where r.user_id = auth.uid() and r.job_id = p_job and r.role = 'editor');
$$;

-- Links invitations to the signed-in user by their confirmed email.
-- Returns {jobs: how many jobs they can open, editor: whether any of them is full access}.
create or replace function public.hiring_claim_reviewer()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if auth.uid() is null then return jsonb_build_object('jobs', 0, 'editor', false); end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('jobs', 0, 'editor', false); end if;
  update public.hiring_reviewers
     set user_id = auth.uid(), claimed_at = coalesce(claimed_at, now())
   where email = v_email and (user_id is null or user_id = auth.uid());
  return (select jsonb_build_object('jobs', count(*), 'editor', coalesce(bool_or(role = 'editor'), false))
            from public.hiring_reviewers where user_id = auth.uid());
end $$;

-- An application as a reviewer may see it: no browser id, and the email blanked when hidden.
create or replace function public.hiring_review_row(a public.hiring_applications, p_hide boolean)
returns jsonb
language sql immutable set search_path = public as $$
  select (to_jsonb(a) - 'visitor_id' - 'notified_at')
         || jsonb_build_object('email', case when p_hide then '' else a.email end);
$$;

create or replace function public.hiring_review_jobs()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', j.id, 'title', j.title, 'status', j.status,
           'questions', j.questions, 'rubric', j.rubric,
           'activity', jsonb_build_object(
             'answer_min', j.activity->'answer_min', 'answer_max', j.activity->'answer_max',
             'hidden_code', j.activity->'hidden_code', 'require_transcript', j.activity->'require_transcript'),
           'access', jsonb_build_object(
             'role', r.role, 'hide_contact', r.hide_contact, 'shortlisted_only', r.shortlisted_only,
             'notify', r.notify, 'can_move_stages', r.can_move_stages),
           'candidates', (select count(*) from public.hiring_applications a
                           where a.job_id = j.id and coalesce(a.metrics->>'preview', '') <> 'true'
                             and (not r.shortlisted_only or a.stage in ('shortlisted', 'interview', 'offer', 'hired'))),
           'scored_by_me', (select count(*) from public.hiring_reviews v
                              join public.hiring_applications a on a.id = v.application_id
                             where a.job_id = j.id and v.reviewer_id = auth.uid()
                               and coalesce(a.metrics->>'preview', '') <> 'true')
         ) order by j.created_at desc), '[]'::jsonb)
    from public.hiring_reviewers r
    join public.hiring_jobs j on j.id = r.job_id
   where auth.uid() is not null and r.user_id = auth.uid();
$$;

create or replace function public.hiring_review_apps(p_job uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
           (public.hiring_review_row(a, r.hide_contact) - 'answers' - 'interview_answers' - 'cover_letter')
           || jsonb_build_object(
                'answer_count', jsonb_array_length(a.answers),
                'wrong_tries', (select count(*) from public.hiring_events e where e.application_id = a.id and e.type = 'wrong_url'))
           order by a.submitted_at desc), '[]'::jsonb)
    from public.hiring_reviewers r
    join public.hiring_applications a on a.job_id = r.job_id
   where auth.uid() is not null and r.user_id = auth.uid() and r.job_id = p_job
     and coalesce(a.metrics->>'preview', '') <> 'true'
     and (not r.shortlisted_only or a.stage in ('shortlisted', 'interview', 'offer', 'hired'));
$$;

create or replace function public.hiring_review_app(p_app uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_a public.hiring_applications;
  v_r public.hiring_reviewers;
begin
  if not public.hiring_reviewer_sees(p_app) then return null; end if;
  select * into v_a from public.hiring_applications where id = p_app;
  select * into v_r from public.hiring_reviewers where user_id = auth.uid() and job_id = v_a.job_id limit 1;
  return jsonb_build_object(
    'app', public.hiring_review_row(v_a, v_r.hide_contact),
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'visitor_id' order by e.created_at)
                          from (select * from public.hiring_events where application_id = p_app
                                 order by created_at limit 2000) e), '[]'::jsonb),
    'can_move_stages', v_r.can_move_stages);
end $$;

create or replace function public.hiring_review_set_stage(p_app uuid, p_stage text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_stage not in ('new', 'reviewed', 'shortlisted', 'interview', 'offer', 'hired', 'rejected') then return false; end if;
  if not public.hiring_reviewer_sees(p_app) then return false; end if;
  if not exists (select 1 from public.hiring_applications a
                   join public.hiring_reviewers r on r.job_id = a.job_id
                  where a.id = p_app and r.user_id = auth.uid() and r.can_move_stages) then
    return false;
  end if;
  update public.hiring_applications set stage = p_stage where id = p_app;
  return true;
end $$;

revoke execute on function public.hiring_review_row(public.hiring_applications, boolean) from public, anon, authenticated;
revoke execute on function public.hiring_reviewer_sees(uuid) from public, anon;
grant execute on function public.hiring_reviewer_sees(uuid) to authenticated;
revoke execute on function public.hiring_claim_reviewer() from public, anon;
revoke execute on function public.hiring_job_editor(uuid) from public, anon;
grant execute on function public.hiring_job_editor(uuid) to authenticated;
revoke execute on function public.hiring_review_jobs() from public, anon;
revoke execute on function public.hiring_review_apps(uuid) from public, anon;
revoke execute on function public.hiring_review_app(uuid) from public, anon;
revoke execute on function public.hiring_review_set_stage(uuid, text) from public, anon;
grant execute on function public.hiring_claim_reviewer() to authenticated;
grant execute on function public.hiring_review_jobs() to authenticated;
grant execute on function public.hiring_review_apps(uuid) to authenticated;
grant execute on function public.hiring_review_app(uuid) to authenticated;
grant execute on function public.hiring_review_set_stage(uuid, text) to authenticated;

-- Scorecards: a reviewer reads every scorecard on candidates they can see, and writes only their own.
drop policy if exists "hiring_reviews reviewer read" on public.hiring_reviews;
create policy "hiring_reviews reviewer read" on public.hiring_reviews for select to authenticated
  using (public.hiring_reviewer_sees(application_id));
drop policy if exists "hiring_reviews reviewer add" on public.hiring_reviews;
create policy "hiring_reviews reviewer add" on public.hiring_reviews for insert to authenticated
  with check (reviewer_id = auth.uid() and reviewer_email = lower(coalesce(auth.jwt()->>'email', ''))
              and public.hiring_reviewer_sees(application_id));
drop policy if exists "hiring_reviews reviewer edit" on public.hiring_reviews;
create policy "hiring_reviews reviewer edit" on public.hiring_reviews for update to authenticated
  using (reviewer_id = auth.uid() and public.hiring_reviewer_sees(application_id))
  with check (reviewer_id = auth.uid() and reviewer_email = lower(coalesce(auth.jwt()->>'email', ''))
              and public.hiring_reviewer_sees(application_id));

-- Notes: a reviewer reads the notes on candidates they can see, adds their own, and deletes only their own.
drop policy if exists "hiring_notes reviewer read" on public.hiring_notes;
create policy "hiring_notes reviewer read" on public.hiring_notes for select to authenticated
  using (public.hiring_reviewer_sees(application_id));
drop policy if exists "hiring_notes reviewer add" on public.hiring_notes;
create policy "hiring_notes reviewer add" on public.hiring_notes for insert to authenticated
  with check (kind = 'note' and author_email = lower(coalesce(auth.jwt()->>'email', ''))
              and public.hiring_reviewer_sees(application_id));
drop policy if exists "hiring_notes reviewer delete own" on public.hiring_notes;
create policy "hiring_notes reviewer delete own" on public.hiring_notes for delete to authenticated
  using (author_email = lower(coalesce(auth.jwt()->>'email', '')) and public.hiring_reviewer_sees(application_id));

-- Résumé and cover letter files of candidates the reviewer can see.
create or replace function public.hiring_reviewer_file(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.hiring_applications a
     where a.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))
       and public.hiring_reviewer_sees(a.id));
$$;
revoke execute on function public.hiring_reviewer_file(text) from public, anon;
grant execute on function public.hiring_reviewer_file(text) to authenticated;
drop policy if exists "hiring uploads reviewer read" on storage.objects;
create policy "hiring uploads reviewer read" on storage.objects for select to authenticated
  using (bucket_id = 'hiring-uploads' and public.hiring_reviewer_file(name));

-- Full access to one job: the job itself, its posting versions, its candidates and their activity.
drop policy if exists "hiring_jobs editor read" on public.hiring_jobs;
create policy "hiring_jobs editor read" on public.hiring_jobs for select to authenticated
  using (public.hiring_job_editor(id));
drop policy if exists "hiring_jobs editor edit" on public.hiring_jobs;
create policy "hiring_jobs editor edit" on public.hiring_jobs for update to authenticated
  using (public.hiring_job_editor(id)) with check (public.hiring_job_editor(id));
drop policy if exists "hiring_posting_versions editor all" on public.hiring_posting_versions;
create policy "hiring_posting_versions editor all" on public.hiring_posting_versions for all to authenticated
  using (public.hiring_job_editor(job_id)) with check (public.hiring_job_editor(job_id));
drop policy if exists "hiring_applications editor read" on public.hiring_applications;
create policy "hiring_applications editor read" on public.hiring_applications for select to authenticated
  using (public.hiring_job_editor(job_id));
drop policy if exists "hiring_applications editor edit" on public.hiring_applications;
create policy "hiring_applications editor edit" on public.hiring_applications for update to authenticated
  using (public.hiring_job_editor(job_id)) with check (public.hiring_job_editor(job_id));
drop policy if exists "hiring_events editor read" on public.hiring_events;
create policy "hiring_events editor read" on public.hiring_events for select to authenticated
  using (job_id is not null and public.hiring_job_editor(job_id));

-- Job cards show counts for every job the signed-in person can open.
create or replace function public.hiring_job_stats()
returns table (
  job_id uuid, submissions bigint, new_count bigint, shortlisted bigint, interviews bigint, hired bigint,
  arrivals bigint, wrong_attempts bigint, wrong_visitors bigint, form_starts bigint, posting_views bigint)
language sql stable security invoker set search_path = public as $$
  select j.id,
    (select count(*) from hiring_applications a where a.job_id = j.id and coalesce(a.metrics->>'preview','') <> 'true'),
    (select count(*) from hiring_applications a where a.job_id = j.id and coalesce(a.metrics->>'preview','') <> 'true' and a.stage = 'new'),
    (select count(*) from hiring_applications a where a.job_id = j.id and coalesce(a.metrics->>'preview','') <> 'true' and a.stage in ('shortlisted','interview','offer','hired')),
    (select count(*) from hiring_applications a where a.job_id = j.id and coalesce(a.metrics->>'preview','') <> 'true' and a.stage in ('interview','offer','hired')),
    (select count(*) from hiring_applications a where a.job_id = j.id and coalesce(a.metrics->>'preview','') <> 'true' and a.stage = 'hired'),
    (select count(distinct e.visitor_id) from hiring_events e where e.job_id = j.id and e.type = 'arrival' and coalesce(e.meta->>'preview','') <> 'true'),
    (select count(*) from hiring_events e where e.job_id = j.id and e.type = 'wrong_url' and coalesce(e.meta->>'preview','') <> 'true'),
    (select count(distinct e.visitor_id) from hiring_events e where e.job_id = j.id and e.type = 'wrong_url' and coalesce(e.meta->>'preview','') <> 'true'),
    (select count(distinct e.visitor_id) from hiring_events e where e.job_id = j.id and e.type = 'form_start' and coalesce(e.meta->>'preview','') <> 'true'),
    (select count(*) from hiring_events e where e.job_id = j.id and e.type = 'posting_view')
  from hiring_jobs j
  where (select public.hiring_is_admin()) or public.hiring_job_editor(j.id);
$$;
