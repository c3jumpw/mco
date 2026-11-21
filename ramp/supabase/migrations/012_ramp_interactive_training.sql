-- RAMP 012: interactive training.
--  1. ramp_media: pictures used in lessons (screenshots, illustrations), stored privately per workspace as base64 WebP.
--     Members of the workspace can view them; admins add and remove them.
--  2. ramp_progress.results: what happened on each interactive step (first and best score, tries, seconds), for metrics.
--  3. ramp_module_finish takes those results.

create table if not exists public.ramp_media (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.ramp_ws() references public.ramp_workspaces(id) on delete cascade,
  name         text not null default '',
  mime         text not null default 'image/webp' check (mime in ('image/webp','image/png','image/jpeg','image/gif','image/svg+xml')),
  data         text not null check (length(data) between 1 and 2000000),
  width        int,
  height       int,
  created_by   uuid references public.ramp_members(id) on delete set null default public.ramp_me(),
  created_at   timestamptz not null default now()
);
create index if not exists ramp_media_ws_idx on public.ramp_media (workspace_id);

alter table public.ramp_media enable row level security;
grant select, insert, delete on public.ramp_media to authenticated;
grant all on public.ramp_media to ramp_owner;

-- The platform's training library workspace (policies can't read ramp_platform directly).
create or replace function public.ramp_library_ws() returns uuid
language sql stable security definer set search_path = '' as $$
  select library_workspace_id from public.ramp_platform where id
$$;
comment on function public.ramp_library_ws() is 'RAMP: postgres-owned (bypasses RLS); filters by workspace itself.';
revoke all on function public.ramp_library_ws() from public, anon;
grant execute on function public.ramp_library_ws() to authenticated, ramp_owner;

-- Workspace isolation, with one exception: pictures in the platform's training library can be read from any workspace,
-- because new workspaces start with a copy of the library's modules and those modules point at the library's pictures.
drop policy if exists ramp_ws_ramp_media on public.ramp_media;
create policy ramp_ws_ramp_media on public.ramp_media as restrictive for all to public
  using (workspace_id = (select public.ramp_ws())
         or workspace_id = (select public.ramp_library_ws()))
  with check (workspace_id = (select public.ramp_ws()));
drop policy if exists ramp_owner_ramp_media on public.ramp_media;
create policy ramp_owner_ramp_media on public.ramp_media for all to ramp_owner using (true) with check (true);
drop policy if exists ramp_media_read on public.ramp_media;
create policy ramp_media_read on public.ramp_media for select to authenticated using ((select public.ramp_me()) is not null);
drop policy if exists ramp_media_write on public.ramp_media;
create policy ramp_media_write on public.ramp_media for insert to authenticated with check ((select public.ramp_is_admin()));
drop policy if exists ramp_media_delete on public.ramp_media;
create policy ramp_media_delete on public.ramp_media for delete to authenticated
  using ((select public.ramp_is_admin()) and workspace_id = (select public.ramp_ws()));

alter table public.ramp_progress add column if not exists results jsonb not null default '{}'::jsonb;

drop function if exists public.ramp_module_finish(uuid, int, text);
create or replace function public.ramp_module_finish(p_module uuid, p_score int, p_answer text, p_results jsonb default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); m public.ramp_modules; v_status text; v_res jsonb := '{}'::jsonb;
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  select * into m from public.ramp_modules where id = p_module and status = 'published';
  if m.id is null then raise exception 'Module not found.'; end if;
  if m.pass_score > 0 and coalesce(p_score, 0) < m.pass_score then
    raise exception 'You need % to pass. Review the questions and try again.', m.pass_score || '%';
  end if;
  if p_results is not null and jsonb_typeof(p_results) = 'object' and pg_column_size(p_results) < 200000 then
    v_res := p_results || jsonb_build_object('at', now());
  end if;
  v_status := case when m.mentor_review then 'submitted' else 'completed' end;
  insert into public.ramp_progress(member_id, module_id, status, step, score, answer, results, submitted_at, completed_at)
  values (v_me, p_module, v_status, 999, p_score, left(coalesce(p_answer, ''), 20000), v_res,
          case when v_status = 'submitted' then now() end, case when v_status = 'completed' then now() end)
  on conflict (member_id, module_id) do update set status = v_status, step = 999, score = excluded.score, answer = excluded.answer,
    results = excluded.results, feedback = '', submitted_at = excluded.submitted_at, completed_at = excluded.completed_at, updated_at = now();
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me, case when v_status = 'submitted' then 'submitted module' else 'completed module' end, v_me, m.title, public.ramp_req_ip(), public.ramp_req_ua());
  return v_status;
end $$;

alter function public.ramp_module_finish(uuid, int, text, jsonb) owner to ramp_owner;
revoke all on function public.ramp_module_finish(uuid, int, text, jsonb) from public, anon;
grant execute on function public.ramp_module_finish(uuid, int, text, jsonb) to authenticated, ramp_owner;
