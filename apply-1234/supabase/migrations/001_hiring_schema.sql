-- apply1234 hiring app — schema
-- All objects are prefixed hiring_ so they never collide with other apps in this project.

create extension if not exists fuzzystrmatch with schema extensions;

-- ───────────────────────── tables ─────────────────────────

create table if not exists public.hiring_admins (
  email       text primary key check (email = lower(email) and position('@' in email) > 1),
  user_id     uuid unique references auth.users(id) on delete set null,
  added_at    timestamptz not null default now(),
  claimed_at  timestamptz
);

create table if not exists public.hiring_jobs (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null default 'Untitled role',
  status              text not null default 'draft' check (status in ('draft','published','closed')),
  notes               text not null default '',
  posting             text not null default '',
  domain              text not null default 'apply1234.com',
  slug                text unique check (
                        slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'
                        and slug not in ('admin','api','assets','p','login','index','favicon','robots')
                      ),
  fragments           jsonb not null default '[]'::jsonb,
  hint_format         text not null default 'Part {n} of {total}: {text}',
  public_id           text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,10),
  share_enabled       boolean not null default false,
  activity            jsonb not null default '{}'::jsonb,
  questions           jsonb not null default '[]'::jsonb,
  interview_questions jsonb not null default '[]'::jsonb,
  rubric              jsonb not null default '["Clarity","Language level","Initiative","Role fit"]'::jsonb,
  booking_url         text not null default '',
  settings            jsonb not null default '{}'::jsonb,   -- admin-only (email templates etc.), never sent to candidates
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  published_at        timestamptz,
  closed_at           timestamptz
);

create table if not exists public.hiring_posting_versions (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.hiring_jobs(id) on delete cascade,
  label       text not null default '',
  posting     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists hiring_posting_versions_job on public.hiring_posting_versions(job_id, created_at desc);

create table if not exists public.hiring_templates (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('activity','posting','questions','interview')),
  name        text not null,
  content     jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.hiring_applications (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.hiring_jobs(id) on delete cascade,
  name               text not null,
  email              text not null,
  answers            jsonb not null default '[]'::jsonb,
  visitor_id         text not null default '',
  stage              text not null default 'new'
                     check (stage in ('new','reviewed','shortlisted','interview','offer','hired','rejected')),
  tags               text[] not null default '{}',
  consent            boolean not null default false,
  flags              jsonb not null default '{}'::jsonb,
  metrics            jsonb not null default '{}'::jsonb,
  interview_at       timestamptz,
  interview_answers  jsonb not null default '{}'::jsonb,
  interview_summary  text not null default '',
  submitted_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists hiring_applications_job on public.hiring_applications(job_id, submitted_at desc);
create index if not exists hiring_applications_visitor on public.hiring_applications(visitor_id);

create table if not exists public.hiring_reviews (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.hiring_applications(id) on delete cascade,
  reviewer_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reviewer_email  text not null default lower(coalesce(auth.jwt()->>'email','')),
  scores          jsonb not null default '{}'::jsonb,   -- { question_id: 1..5 }
  criteria        jsonb not null default '{}'::jsonb,   -- { criterion: 1..5 }
  overall         int check (overall between 1 and 5),
  recommendation  text check (recommendation in ('strong_yes','yes','maybe','no')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, reviewer_id)
);

create table if not exists public.hiring_notes (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.hiring_applications(id) on delete cascade,
  author_email    text not null default lower(coalesce(auth.jwt()->>'email','')),
  kind            text not null default 'note' check (kind in ('note','interview')),
  body            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists hiring_notes_app on public.hiring_notes(application_id, created_at);

create table if not exists public.hiring_events (
  id              bigint generated always as identity primary key,
  job_id          uuid references public.hiring_jobs(id) on delete cascade,
  application_id  uuid references public.hiring_applications(id) on delete set null,
  visitor_id      text not null default '',
  type            text not null,
  path            text not null default '',
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists hiring_events_job on public.hiring_events(job_id, type, created_at);
create index if not exists hiring_events_visitor on public.hiring_events(visitor_id, created_at);
create index if not exists hiring_events_app on public.hiring_events(application_id, created_at);

-- ───────────────────────── updated_at ─────────────────────────

create or replace function public.hiring_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists hiring_jobs_touch on public.hiring_jobs;
create trigger hiring_jobs_touch before update on public.hiring_jobs
  for each row execute function public.hiring_touch();
drop trigger if exists hiring_applications_touch on public.hiring_applications;
create trigger hiring_applications_touch before update on public.hiring_applications
  for each row execute function public.hiring_touch();
drop trigger if exists hiring_reviews_touch on public.hiring_reviews;
create trigger hiring_reviews_touch before update on public.hiring_reviews
  for each row execute function public.hiring_touch();

-- ───────────────────────── admin access ─────────────────────────

create or replace function public.hiring_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.hiring_admins where user_id = auth.uid());
$$;

-- Links the signed-in user to an allowlisted email, once the email is confirmed.
create or replace function public.hiring_claim_admin() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then return false; end if;
  select lower(email) into v_email from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return false; end if;
  update public.hiring_admins set user_id = auth.uid(), claimed_at = now()
   where email = v_email and user_id is null;
  return public.hiring_is_admin();
end $$;
revoke execute on function public.hiring_claim_admin() from anon, public;
grant execute on function public.hiring_claim_admin() to authenticated;

alter table public.hiring_admins           enable row level security;
alter table public.hiring_jobs             enable row level security;
alter table public.hiring_posting_versions enable row level security;
alter table public.hiring_templates        enable row level security;
alter table public.hiring_applications     enable row level security;
alter table public.hiring_reviews          enable row level security;
alter table public.hiring_notes            enable row level security;
alter table public.hiring_events           enable row level security;

grant execute on function public.hiring_is_admin() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['hiring_admins','hiring_jobs','hiring_posting_versions','hiring_templates',
                           'hiring_applications','hiring_reviews','hiring_notes','hiring_events'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "%1$s admin all" on public.%1$I', t);
    execute format('create policy "%1$s admin all" on public.%1$I for all to authenticated
                    using ((select public.hiring_is_admin())) with check ((select public.hiring_is_admin()))', t);
  end loop;
end $$;

-- ───────────────────────── public (candidate) functions ─────────────────────────
-- Candidates never read tables directly. These functions return only what a
-- candidate who typed the exact URL should see, so slugs can't be listed.

create or replace function public.hiring_rate_ok(p_visitor text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_visitor = '' or (
    select count(*) from public.hiring_events
     where visitor_id = p_visitor and created_at > now() - interval '1 minute') < 90;
$$;
revoke execute on function public.hiring_rate_ok(text) from anon, authenticated, public;

create or replace function public.hiring_resolve(p_path text, p_visitor text default '', p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_path     text := left(lower(trim(both '/' from coalesce(p_path,''))), 200);
  v_visitor  text := left(coalesce(p_visitor,''), 64);
  v_meta     jsonb := case when p_meta is not null and pg_column_size(p_meta) < 4000 then p_meta else '{}'::jsonb end;
  v_job      public.hiring_jobs;
  v_deadline timestamptz;
  v_near     uuid;
  v_dist     int;
begin
  if not public.hiring_rate_ok(v_visitor) then
    return jsonb_build_object('found', false);
  end if;

  if v_path <> '' then
    select * into v_job from public.hiring_jobs
     where slug = v_path
       and (status in ('published','closed') or (status = 'draft' and public.hiring_is_admin()));
  end if;

  if v_job.id is not null then
    begin
      v_deadline := nullif(v_job.activity->>'deadline','')::timestamptz;
    exception when others then v_deadline := null;
    end;
    if v_job.status = 'closed' or (v_deadline is not null and v_deadline < now()) then
      insert into public.hiring_events(job_id, visitor_id, type, path, meta)
      values (v_job.id, v_visitor, 'arrival_closed', v_path, v_meta);
      return jsonb_build_object('found', true, 'closed', true, 'title', v_job.title);
    end if;
    insert into public.hiring_events(job_id, visitor_id, type, path, meta)
    values (v_job.id, v_visitor, 'arrival', v_path, v_meta);
    return jsonb_build_object(
      'found', true, 'closed', false,
      'job_id', v_job.id, 'title', v_job.title,
      'activity', v_job.activity - 'hidden_code',
      'questions', v_job.questions);
  end if;

  -- Wrong or partial URL: log it, and attach it to the closest live job.
  if v_path <> '' then
    select j.id, levenshtein(left(j.slug,255), left(v_path,255))
      into v_near, v_dist
      from public.hiring_jobs j
     where j.status = 'published' and j.slug is not null
     order by (position(j.slug in v_path) > 0 or position(v_path in j.slug) > 0) desc,
              levenshtein(left(j.slug,255), left(v_path,255)) asc
     limit 1;
    if v_near is not null then
      if not exists (select 1 from public.hiring_jobs j where j.id = v_near
                       and (position(j.slug in v_path) > 0 or position(v_path in j.slug) > 0))
         and v_dist > greatest(3, length(v_path) / 2) then
        v_near := null;
      end if;
    end if;
  end if;

  insert into public.hiring_events(job_id, visitor_id, type, path, meta)
  values (v_near, v_visitor,
          case when v_path = '' then 'root_visit' else 'wrong_url' end,
          v_path, v_meta || jsonb_build_object('distance', v_dist));
  return jsonb_build_object('found', false);
end $$;

create or replace function public.hiring_track(p_job uuid, p_visitor text, p_type text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_visitor text := left(coalesce(p_visitor,''), 64);
begin
  if p_type not in ('instructions_view','instructions_done','loom_link_click','form_start','question_focus',
                    'link_added','link_invalid','transcript_added','draft_restored','tab_hidden','tab_return',
                    'submit_attempt','submit_error','posting_copy') then
    return;
  end if;
  if not exists (select 1 from public.hiring_jobs where id = p_job and status = 'published') then return; end if;
  if not public.hiring_rate_ok(v_visitor) then return; end if;
  insert into public.hiring_events(job_id, visitor_id, type, meta)
  values (p_job, v_visitor, p_type,
          case when p_meta is not null and pg_column_size(p_meta) < 4000 then p_meta else '{}'::jsonb end);
end $$;

create or replace function public.hiring_submit(
  p_job uuid, p_visitor text, p_name text, p_email text,
  p_answers jsonb, p_consent boolean, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_job       public.hiring_jobs;
  v_visitor   text := left(coalesce(p_visitor,''), 64);
  v_name      text := left(trim(coalesce(p_name,'')), 200);
  v_email     text := left(lower(trim(coalesce(p_email,''))), 254);
  v_deadline  timestamptz;
  v_q         jsonb;
  v_a         jsonb;
  v_clean     jsonb := '[]'::jsonb;
  v_url       text;
  v_dur       numeric;
  v_min       int;
  v_max       int;
  v_all_loom  boolean := true;
  v_len_ok    boolean := true;
  v_len_known boolean := true;
  v_tx_ok     boolean := true;
  v_code      text;
  v_code_ok   boolean;
  v_dup       boolean;
  v_id        uuid;
begin
  select * into v_job from public.hiring_jobs
   where id = p_job and (status = 'published' or (status = 'draft' and public.hiring_is_admin()));
  if v_job.id is null then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  begin
    v_deadline := nullif(v_job.activity->>'deadline','')::timestamptz;
  exception when others then v_deadline := null;
  end;
  if v_deadline is not null and v_deadline < now() then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'email'); end if;
  if coalesce(nullif(v_job.activity->>'consent_text',''), '') <> '' and not coalesce(p_consent, false) then
    return jsonb_build_object('ok', false, 'error', 'consent');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'answers');
  end if;

  begin
    v_min := round(nullif(v_job.activity->>'answer_min','')::numeric)::int;
    v_max := round(nullif(v_job.activity->>'answer_max','')::numeric)::int;
  exception when others then v_min := null; v_max := null;
  end;

  for v_q in select value from jsonb_array_elements(v_job.questions) loop
    v_a := null;
    select value into v_a from jsonb_array_elements(p_answers) where value->>'question_id' = v_q->>'id' limit 1;
    v_url := left(trim(coalesce(v_a->>'url','')), 500);
    if v_url !~* '^https?://[^\s]+\.[^\s]+' then
      return jsonb_build_object('ok', false, 'error', 'answer_missing', 'question_id', v_q->>'id');
    end if;
    if v_url !~* '^https?://(www\.)?loom\.com/(share|embed)/' then v_all_loom := false; end if;
    begin v_dur := nullif(v_a->>'duration_sec','')::numeric; exception when others then v_dur := null; end;
    if v_dur is null then v_len_known := false;
    elsif (v_min is not null and v_dur < v_min) or (v_max is not null and v_dur > v_max) then v_len_ok := false;
    end if;
    if coalesce((v_job.activity->>'require_transcript')::boolean, false)
       and length(trim(coalesce(v_a->>'transcript',''))) < 20 then v_tx_ok := false; end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'question_id', v_q->>'id',
      'question',    v_q->>'text',
      'url',         v_url,
      'loom_id',     left(coalesce(v_a->>'loom_id',''), 64),
      'title',       left(coalesce(v_a->>'title',''), 300),
      'duration_sec', v_dur,
      'transcript',  left(coalesce(v_a->>'transcript',''), 20000)));
  end loop;

  v_code := nullif(trim(coalesce(v_job.activity->>'hidden_code','')), '');
  if v_code is not null then
    v_code_ok := exists (select 1 from jsonb_array_elements(v_clean) a
                          where position(lower(v_code) in lower(a.value->>'title')) > 0);
  end if;
  v_dup := exists (select 1 from public.hiring_applications where job_id = p_job and email = v_email);

  insert into public.hiring_applications(job_id, name, email, answers, visitor_id, consent, flags, metrics)
  values (p_job, v_name, v_email, v_clean, v_visitor, coalesce(p_consent,false),
          jsonb_build_object(
            'all_loom_links', v_all_loom,
            'lengths_in_range', case when v_len_known then v_len_ok else null end,
            'transcripts_ok', v_tx_ok,
            'hidden_code_ok', v_code_ok,
            'duplicate_email', v_dup),
          case when p_meta is not null and pg_column_size(p_meta) < 8000 then p_meta else '{}'::jsonb end)
  returning id into v_id;

  if v_visitor <> '' then
    update public.hiring_events
       set application_id = v_id, job_id = coalesce(job_id, p_job)
     where visitor_id = v_visitor and application_id is null
       and (job_id = p_job or job_id is null);
  end if;
  insert into public.hiring_events(job_id, application_id, visitor_id, type)
  values (p_job, v_id, v_visitor, 'submitted');

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.hiring_public_posting(p_public_id text, p_visitor text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_job public.hiring_jobs; v_visitor text := left(coalesce(p_visitor,''), 64);
begin
  select * into v_job from public.hiring_jobs
   where public_id = left(coalesce(p_public_id,''), 40) and share_enabled and status = 'published';
  if v_job.id is null then return null; end if;
  if public.hiring_rate_ok(v_visitor) then
    insert into public.hiring_events(job_id, visitor_id, type) values (v_job.id, v_visitor, 'posting_view');
  end if;
  return jsonb_build_object('title', v_job.title, 'posting', v_job.posting,
                            'fragments', v_job.fragments, 'hint_format', v_job.hint_format);
end $$;

grant execute on function public.hiring_resolve(text, text, jsonb) to anon, authenticated;
grant execute on function public.hiring_track(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.hiring_submit(uuid, text, text, text, jsonb, boolean, jsonb) to anon, authenticated;
grant execute on function public.hiring_public_posting(text, text) to anon, authenticated;

-- ───────────────────────── admin stats ─────────────────────────

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
  where (select public.hiring_is_admin());
$$;
revoke execute on function public.hiring_job_stats() from anon, public;
grant execute on function public.hiring_job_stats() to authenticated;

-- ───────────────────────── seed ─────────────────────────

insert into public.hiring_admins(email) values ('mk1292.unyty@gmail.com') on conflict do nothing;

insert into public.hiring_templates(kind, name, content)
select 'activity', 'Standard Loom activity', jsonb_build_object(
  'headline', 'You found it.',
  'intro', 'Getting here meant reading the whole posting and piecing the link together. That is exactly the kind of attention this role needs. The rest of this activity takes about 20–30 minutes.',
  'loom_steps', E'Create a free account at loom.com and install the desktop app or Chrome extension.\nFor each question below, record a short video answer with your camera on.\nWhen you finish a recording, click “Copy link” in Loom and paste the share link into the matching box.',
  'answer_min', 60,
  'answer_max', 180,
  'extra', '',
  'require_transcript', false,
  'hidden_code', '',
  'consent_text', 'I agree that my answers and videos may be stored and reviewed by the hiring team for this role, including with the help of AI tools, and that I can ask for them to be deleted at any time.',
  'accommodations_email', '')
where not exists (select 1 from public.hiring_templates where kind = 'activity');
