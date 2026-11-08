-- Stop two jobs from ever answering the same address.
-- A job answers its main link (slug) and one link per job board (slug-code).
-- The unique index on slug already blocks exact duplicates; this also blocks overlaps
-- between one job's main link and another job's board links.

create or replace function public.hiring_links_of(p_slug text, p_sources jsonb)
returns setof text
language sql immutable
set search_path = public
as $$
  select p_slug where p_slug is not null
  union all
  select p_slug || '-' || lower(s.value->>'code')
  from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) s
  where p_slug is not null and coalesce(s.value->>'code', '') <> '';
$$;

create or replace function public.hiring_check_link_overlap()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_clash text;
  v_title text;
begin
  select l.link, j.title into v_clash, v_title
  from public.hiring_links_of(new.slug, new.sources) l(link)
  join public.hiring_jobs j on j.id <> new.id
  where l.link in (select * from public.hiring_links_of(j.slug, j.sources))
  limit 1;

  if v_clash is not null then
    raise exception 'The link "%" is already used by "%". Pick another.', v_clash, v_title
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists hiring_jobs_link_overlap on public.hiring_jobs;
create trigger hiring_jobs_link_overlap
  before insert or update of slug, sources on public.hiring_jobs
  for each row execute function public.hiring_check_link_overlap();

revoke execute on function public.hiring_check_link_overlap() from public, anon, authenticated;

-- ───────────────────────── email preferences ─────────────────────────

alter table public.hiring_admins
  add column if not exists notify_applications boolean not null default true,
  add column if not exists notify_messages boolean not null default true;

-- ───────────────────────── help messages from candidates ─────────────────────────

create table if not exists public.hiring_messages (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references public.hiring_jobs(id) on delete set null,
  application_id  uuid references public.hiring_applications(id) on delete set null,
  visitor_id      text not null default '',
  kind            text not null default 'question' check (kind in ('bug','question','other')),
  name            text not null default '',
  email           text not null default '',
  body            text not null,
  context         jsonb not null default '{}'::jsonb,
  status          text not null default 'new' check (status in ('new','open','done')),
  admin_note      text not null default '',
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists hiring_messages_status_idx on public.hiring_messages (status, created_at desc);
create index if not exists hiring_messages_visitor_idx on public.hiring_messages (visitor_id, created_at desc);

alter table public.hiring_messages enable row level security;
revoke all on public.hiring_messages from anon;
grant select, insert, update, delete on public.hiring_messages to authenticated;
drop policy if exists "hiring_messages admin all" on public.hiring_messages;
create policy "hiring_messages admin all" on public.hiring_messages for all to authenticated
  using ((select public.hiring_is_admin())) with check ((select public.hiring_is_admin()));
drop trigger if exists hiring_messages_touch on public.hiring_messages;
create trigger hiring_messages_touch before update on public.hiring_messages
  for each row execute function public.hiring_touch();

create or replace function public.hiring_contact(
  p_job uuid, p_visitor text, p_kind text, p_name text, p_email text, p_body text,
  p_context jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_visitor text := left(coalesce(p_visitor,''), 64);
  v_body    text := left(trim(coalesce(p_body,'')), 5000);
  v_email   text := left(lower(trim(coalesce(p_email,''))), 254);
  v_kind    text := case when p_kind in ('bug','question','other') then p_kind else 'other' end;
  v_job     uuid;
  v_app     uuid;
  v_id      uuid;
begin
  if v_visitor = '' then return jsonb_build_object('ok', false, 'error', 'visitor'); end if;
  if length(v_body) < 5 then return jsonb_build_object('ok', false, 'error', 'body'); end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'email');
  end if;
  if (select count(*) from public.hiring_messages where visitor_id = v_visitor and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.hiring_messages where created_at > now() - interval '1 hour') >= 200 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;
  select id into v_job from public.hiring_jobs where id = p_job;
  if v_job is not null then
    select id into v_app from public.hiring_applications
     where job_id = v_job and visitor_id = v_visitor order by submitted_at desc limit 1;
  end if;
  insert into public.hiring_messages (job_id, application_id, visitor_id, kind, name, email, body, context)
  values (v_job, v_app, v_visitor, v_kind, left(trim(coalesce(p_name,'')), 200), v_email, v_body,
          case when p_context is not null and pg_column_size(p_context) < 6000 then p_context else '{}'::jsonb end)
  returning id into v_id;
  insert into public.hiring_events (job_id, application_id, visitor_id, type, meta)
  values (v_job, v_app, v_visitor, 'help_message', jsonb_build_object('kind', v_kind, 'message_id', v_id));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ───────────────────────── résumé and cover letter ─────────────────────────

alter table public.hiring_applications
  add column if not exists cover_letter text not null default '',
  add column if not exists attachments  jsonb not null default '[]'::jsonb,
  add column if not exists notified_at  timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hiring-uploads', 'hiring-uploads', false, 5242880, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/plain'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Candidates may upload into <job id>/<visitor id>/<file> for a live job, at most 6 files per visitor.
create or replace function public.hiring_upload_ok(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_parts text[] := string_to_array(coalesce(p_name,''), '/');
  v_job   uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) <> 3 then return false; end if;
  if v_parts[2] !~ '^[a-z0-9_-]{5,64}$' or length(v_parts[3]) not between 1 and 160 then return false; end if;
  begin v_job := v_parts[1]::uuid; exception when others then return false; end;
  if not exists (select 1 from public.hiring_jobs
                  where id = v_job and (status = 'published' or (status = 'draft' and public.hiring_is_admin()))) then
    return false;
  end if;
  return (select count(*) from storage.objects
           where bucket_id = 'hiring-uploads' and name like v_parts[1] || '/' || v_parts[2] || '/%') < 6;
end $$;
grant execute on function public.hiring_upload_ok(text) to anon, authenticated;

drop policy if exists "hiring uploads candidate insert" on storage.objects;
create policy "hiring uploads candidate insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'hiring-uploads' and public.hiring_upload_ok(name));
drop policy if exists "hiring uploads admin read" on storage.objects;
create policy "hiring uploads admin read" on storage.objects for select to authenticated
  using (bucket_id = 'hiring-uploads' and (select public.hiring_is_admin()));
drop policy if exists "hiring uploads admin delete" on storage.objects;
create policy "hiring uploads admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'hiring-uploads' and (select public.hiring_is_admin()));

-- Called right after hiring_submit, by the same browser, to attach the optional extras.
create or replace function public.hiring_attach(p_app uuid, p_visitor text, p_cover text, p_files jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app   public.hiring_applications;
  v_vis   text := left(coalesce(p_visitor,''), 64);
  v_clean jsonb := '[]'::jsonb;
  v_f     jsonb;
  v_path  text;
  v_meta  jsonb;
begin
  select * into v_app from public.hiring_applications where id = p_app;
  if v_app.id is null or v_vis = '' or v_app.visitor_id <> v_vis or v_app.submitted_at < now() - interval '2 hours' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  for v_f in select value from jsonb_array_elements(case when jsonb_typeof(p_files) = 'array' then p_files else '[]'::jsonb end) limit 4 loop
    v_path := v_f->>'path';
    if v_path is null or position(v_app.job_id::text || '/' || v_vis || '/' in v_path) <> 1 then continue; end if;
    select o.metadata into v_meta from storage.objects o where o.bucket_id = 'hiring-uploads' and o.name = v_path;
    if not found then continue; end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'kind', case when v_f->>'kind' in ('resume','cover_letter') then v_f->>'kind' else 'other' end,
      'path', v_path,
      'name', left(coalesce(nullif(v_f->>'name',''), 'file'), 200),
      'size', (v_meta->>'size')::bigint,
      'type', v_meta->>'mimetype'));
  end loop;
  update public.hiring_applications
     set cover_letter = left(trim(coalesce(p_cover,'')), 20000), attachments = v_clean
   where id = p_app;
  insert into public.hiring_events (job_id, application_id, visitor_id, type, meta)
  values (v_app.job_id, p_app, v_vis, 'extras_added',
          jsonb_build_object('files', jsonb_array_length(v_clean), 'cover_letter', length(trim(coalesce(p_cover,''))) > 0));
  return jsonb_build_object('ok', true, 'files', jsonb_array_length(v_clean));
end $$;

grant execute on function public.hiring_contact(uuid, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.hiring_attach(uuid, text, text, jsonb) to anon, authenticated;

-- ───────────────────────── dashboard ─────────────────────────

create or replace function public.hiring_dashboard(p_days int default 7, p_tz text default 'UTC')
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz      text := 'UTC';
  v_days    int := greatest(1, least(coalesce(p_days, 7), 90));
  v_today   timestamp;
  v_start   timestamptz;
  v_prev    timestamptz;
  v_sdays   int;
  v_sstart  timestamptz;
  v_out     jsonb;
begin
  if not public.hiring_is_admin() then return null; end if;
  if exists (select 1 from pg_timezone_names where name = p_tz) then v_tz := p_tz; end if;
  v_today  := date_trunc('day', now() at time zone v_tz);
  v_start  := (v_today - make_interval(days => v_days - 1)) at time zone v_tz;
  v_prev   := v_start - make_interval(days => v_days);
  v_sdays  := greatest(v_days, 14);
  v_sstart := (v_today - make_interval(days => v_sdays - 1)) at time zone v_tz;

  with apps as (
    select * from public.hiring_applications where coalesce(metrics->>'preview','') <> 'true'
  ), ev as (
    select type, visitor_id, created_at from public.hiring_events
     where created_at >= least(v_prev, v_sstart) and coalesce(meta->>'preview','') <> 'true'
  )
  select jsonb_build_object(
    'tz', v_tz, 'days', v_days, 'start', v_start,
    'applicants',       (select count(*) from apps where submitted_at >= v_start),
    'applicants_prev',  (select count(*) from apps where submitted_at >= v_prev and submitted_at < v_start),
    'posting_views',    (select count(*) from ev where type = 'posting_view' and created_at >= v_start),
    'arrivals',         (select count(distinct visitor_id) from ev where type = 'arrival' and created_at >= v_start),
    'arrivals_prev',    (select count(distinct visitor_id) from ev where type = 'arrival' and created_at >= v_prev and created_at < v_start),
    'starts',           (select count(distinct visitor_id) from ev where type = 'form_start' and created_at >= v_start),
    'wrong_tries',      (select count(*) from ev where type = 'wrong_url' and created_at >= v_start),
    'wrong_visitors',   (select count(distinct visitor_id) from ev where type = 'wrong_url' and created_at >= v_start),
    'to_review',        (select count(*) from apps where stage = 'new'),
    'shortlisted',      (select count(*) from apps where stage = 'shortlisted'),
    'interviews_next7', (select count(*) from apps where interview_at >= now() and interview_at < now() + interval '7 days'),
    'messages_new',     (select count(*) from public.hiring_messages where status = 'new'),
    'messages_period',  (select count(*) from public.hiring_messages where created_at >= v_start),
    'live_jobs',        (select count(*) from public.hiring_jobs where status = 'published'),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d::date,
        'arrivals',   (select count(distinct visitor_id) from ev where type = 'arrival' and (created_at at time zone v_tz)::date = d::date),
        'starts',     (select count(distinct visitor_id) from ev where type = 'form_start' and (created_at at time zone v_tz)::date = d::date),
        'applicants', (select count(*) from apps where (submitted_at at time zone v_tz)::date = d::date)
      ) order by d), '[]'::jsonb)
      from generate_series(v_today - make_interval(days => v_sdays - 1), v_today, interval '1 day') d
    )
  ) into v_out;
  return v_out;
end $$;
grant execute on function public.hiring_dashboard(int, text) to authenticated;
