-- RAMP 013: RAMP Assistant settings and richer training numbers.
--  1. ramp_org.assistant: the workspace's additions to the RAMP Assistant setup prompt.
--  2. ramp_training_summary also returns average quiz and practice scores, minutes spent, last activity and each module,
--     so clients and admins see more than a percentage. Same signature; existing callers keep working.

alter table public.ramp_org add column if not exists assistant jsonb not null default '{}'::jsonb;

create or replace function public.ramp_training_summary(p_member uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (select * from public.ramp_members where id = p_member),
  assigned as (
    select mo.id, mo.title, mo.sort from public.ramp_modules mo, m
    where mo.status = 'published' and (
      (mo.track = 'company' and mo.required)
      or (mo.track = 'role' and exists (select 1 from public.ramp_role_modules rm where rm.module_id = mo.id and rm.job_role_id = m.job_role_id))
      or exists (select 1 from public.ramp_client_modules cm join public.ramp_placements p on p.client_id = cm.client_id
                 where cm.module_id = mo.id and p.member_id = m.id and p.status <> 'ended'))
  ),
  prog as (
    select a.id, a.title, a.sort, pr.status, pr.score, pr.completed_at, pr.updated_at,
           case when jsonb_typeof(pr.results->'practice') = 'number' then (pr.results->>'practice')::numeric end as practice,
           case when jsonb_typeof(pr.results->'secs') = 'number' then (pr.results->>'secs')::numeric else 0 end as secs
    from assigned a left join public.ramp_progress pr on pr.module_id = a.id and pr.member_id = p_member
  )
  select jsonb_build_object(
    'total', (select count(*) from prog),
    'done', (select count(*) from prog where status = 'completed'),
    'pct', case when (select count(*) from prog) = 0 then 0
                else round(100.0 * (select count(*) from prog where status = 'completed') / (select count(*) from prog)) end,
    'next', (select title from prog where coalesce(status, '') <> 'completed' order by sort limit 1),
    'score', (select round(avg(score)) from prog where score is not null),
    'practice', (select round(avg(practice)) from prog where practice is not null),
    'minutes', (select round(sum(secs) / 60.0) from prog),
    'last', (select max(updated_at) from prog),
    'modules', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'status', coalesce(status, 'not_started'), 'score', score,
                                                           'practice', round(practice), 'done_at', completed_at) order by sort) from prog), '[]'::jsonb))
$$;
