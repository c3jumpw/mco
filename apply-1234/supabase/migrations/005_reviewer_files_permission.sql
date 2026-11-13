-- Reviewers: a separate permission for résumés and cover letters, which usually carry phone numbers
-- and addresses. Together with hide_contact (email addresses) it keeps contact details private.

alter table public.hiring_reviewers add column if not exists see_files boolean not null default true;
alter table public.hiring_reviewers drop constraint if exists hiring_reviewers_editor_sees_files;
alter table public.hiring_reviewers add constraint hiring_reviewers_editor_sees_files check (role = 'reviewer' or see_files);

drop function if exists public.hiring_review_row(public.hiring_applications, boolean);
create or replace function public.hiring_review_row(a public.hiring_applications, p_hide boolean, p_files boolean)
returns jsonb
language sql immutable set search_path = public as $$
  select (to_jsonb(a) - 'visitor_id' - 'notified_at')
         || jsonb_build_object('email', case when p_hide then '' else a.email end)
         || case when p_files then '{}'::jsonb else jsonb_build_object('attachments', '[]'::jsonb, 'cover_letter', '') end;
$$;
revoke execute on function public.hiring_review_row(public.hiring_applications, boolean, boolean) from public, anon, authenticated;

create or replace function public.hiring_review_apps(p_job uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
           (public.hiring_review_row(a, r.hide_contact, r.see_files) - 'answers' - 'interview_answers' - 'cover_letter')
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
    'app', public.hiring_review_row(v_a, v_r.hide_contact, v_r.see_files),
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'visitor_id' order by e.created_at)
                          from (select * from public.hiring_events where application_id = p_app
                                 order by created_at limit 2000) e), '[]'::jsonb),
    'can_move_stages', v_r.can_move_stages);
end $$;

-- File downloads follow the same permission.
create or replace function public.hiring_reviewer_file(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.hiring_applications a
      join public.hiring_reviewers r on r.job_id = a.job_id and r.user_id = auth.uid() and r.see_files
     where a.attachments @> jsonb_build_array(jsonb_build_object('path', p_name))
       and public.hiring_reviewer_sees(a.id));
$$;

-- The reviewer's own job list reports the new permission too.
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
             'role', r.role, 'hide_contact', r.hide_contact, 'see_files', r.see_files, 'shortlisted_only', r.shortlisted_only,
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
