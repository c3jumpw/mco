-- RAMP — training and people platform. Schema for the MKC-Admin project.
-- Every object is prefixed ramp_ so it never collides with other apps in this project.
-- Access levels (rank): owner 1, admin 2, lead 3, mentor 4, employee 5, trainee 6, guest 7.
-- Records that must be trustworthy (submissions, signatures, sign-ins, audit) are written only
-- through security-definer functions, which read the caller's IP and device from the request
-- headers inside the database, so they can't be supplied by the browser.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── pure helpers ─────────────────────────

create or replace function public.ramp_rank(p_level text) returns int
language sql immutable set search_path = '' as $$
  select case p_level when 'owner' then 1 when 'admin' then 2 when 'lead' then 3 when 'mentor' then 4
    when 'employee' then 5 when 'trainee' then 6 when 'guest' then 7 else 99 end
$$;

create or replace function public.ramp_req_ip() returns text
language sql stable set search_path = '' as $$
  select nullif(btrim(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip',
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1)
  )), '')
$$;

create or replace function public.ramp_req_ua() returns text
language sql stable set search_path = '' as $$
  select left(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', 400)
$$;

create or replace function public.ramp_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ───────────────────────── tables ─────────────────────────

create table if not exists public.ramp_org (
  id                boolean primary key default true check (id),
  name              text not null default 'MKC' check (length(btrim(name)) between 1 and 80),
  brand_color       text not null default '#4338CA' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  timezone          text not null default 'America/New_York',
  welcome_from      text not null default '',
  welcome_headline  text not null default 'Hi {first}, let’s get you up to speed.',
  welcome_message   text not null default 'RAMP is where you’ll train, find everything you need for your role, and stay connected with the team, from your first day onward.',
  welcome_video_url text not null default '',
  flow              jsonb not null default '[{"id":"welcome","on":true},{"id":"profile","on":true},{"id":"practice","on":true},{"id":"documents","on":true},{"id":"mentor","on":true},{"id":"done","on":true}]'::jsonb,
  flow_reviewed     boolean not null default false,
  flags             jsonb not null default '{"chat":true,"tasks":true,"certificates":false,"record_ip":true}'::jsonb,
  updated_at        timestamptz not null default now()
);

create table if not exists public.ramp_departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) between 1 and 80),
  lead_id    uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ramp_job_roles (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 100),
  department_id uuid references public.ramp_departments(id) on delete set null,
  level         text not null default 'employee' check (level in ('admin','lead','mentor','employee')),
  description   text not null default '',
  created_at    timestamptz not null default now()
);

create table if not exists public.ramp_members (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  email            text not null unique check (email = lower(btrim(email)) and position('@' in email) > 1),
  full_name        text not null default '',
  preferred_name   text not null default '',
  phone            text not null default '',
  timezone         text not null default '',
  level            text not null default 'trainee' check (level in ('owner','admin','lead','mentor','employee','trainee','guest')),
  job_role_id      uuid references public.ramp_job_roles(id) on delete set null,
  department_id    uuid references public.ramp_departments(id) on delete set null,
  mentor_id        uuid references public.ramp_members(id) on delete set null,
  status           text not null default 'invited' check (status in ('invited','active','inactive')),
  source           text not null default 'manual' check (source in ('manual','hiring','staff','request','seed')),
  source_ref       text,
  start_date       date,
  onboarded_at     timestamptz,
  practice_done_at timestamptz,
  graduated_at     timestamptz,
  last_seen_at     timestamptz,
  access_until     date,
  invited_by       uuid references public.ramp_members(id) on delete set null,
  invited_at       timestamptz not null default now(),
  joined_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ramp_members_mentor_idx on public.ramp_members(mentor_id);
create index if not exists ramp_members_dept_idx on public.ramp_members(department_id);

alter table public.ramp_departments drop constraint if exists ramp_departments_lead_fk;
alter table public.ramp_departments add constraint ramp_departments_lead_fk
  foreign key (lead_id) references public.ramp_members(id) on delete set null;

create table if not exists public.ramp_access_requests (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email        text not null,
  name         text not null default '',
  note         text not null default '',
  status       text not null default 'open' check (status in ('open','invited','dismissed')),
  created_at   timestamptz not null default now()
);

create table if not exists public.ramp_modules (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 120),
  track         text not null default 'role' check (track in ('company','role','continued')),
  summary       text not null default '',
  minutes       int not null default 10 check (minutes between 1 and 10000),
  objectives    jsonb not null default '[]'::jsonb,
  blocks        jsonb not null default '[]'::jsonb,
  pass_score    int not null default 0 check (pass_score between 0 and 100),
  mentor_review boolean not null default false,
  due_days      int check (due_days between 0 and 365),
  required      boolean not null default false,
  guest_visible boolean not null default false,
  builtin       text check (builtin in ('practice')),
  status        text not null default 'draft' check (status in ('draft','published')),
  sort          int not null default 100,
  created_by    uuid references public.ramp_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.ramp_role_modules (
  job_role_id uuid not null references public.ramp_job_roles(id) on delete cascade,
  module_id   uuid not null references public.ramp_modules(id) on delete cascade,
  sort        int not null default 100,
  primary key (job_role_id, module_id)
);

create table if not exists public.ramp_progress (
  member_id    uuid not null references public.ramp_members(id) on delete cascade,
  module_id    uuid not null references public.ramp_modules(id) on delete cascade,
  status       text not null default 'in_progress' check (status in ('in_progress','submitted','returned','completed')),
  step         int not null default 0,
  score        int,
  answer       text not null default '',
  feedback     text not null default '',
  reviewer_id  uuid references public.ramp_members(id) on delete set null,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (member_id, module_id)
);

create table if not exists public.ramp_templates (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) between 1 and 120),
  kind         text not null default 'form' check (kind in ('form','upload','esign','checklist')),
  stage        text not null default 'onboarding' check (stage in ('before','onboarding','first_week')),
  audience     text not null default 'everyone' check (audience in ('everyone','role','candidates')),
  job_role_id  uuid references public.ramp_job_roles(id) on delete set null,
  description  text not null default '',
  fields       jsonb not null default '[]'::jsonb,
  legal_review boolean not null default false,
  status       text not null default 'draft' check (status in ('draft','published')),
  version      int not null default 1,
  sort         int not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.ramp_submissions (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references public.ramp_members(id) on delete cascade,
  template_id      uuid references public.ramp_templates(id) on delete set null,
  template_title   text not null,
  template_version int not null default 1,
  answers          jsonb not null default '{}'::jsonb,
  secure_fields    text[] not null default '{}',
  secure_data      bytea,
  files            jsonb not null default '[]'::jsonb,
  signed_name      text,
  ip               text,
  user_agent       text,
  created_at       timestamptz not null default now()
);
create index if not exists ramp_submissions_member_idx on public.ramp_submissions(member_id);

create table if not exists public.ramp_signins (
  id         bigint generated always as identity primary key,
  member_id  uuid not null references public.ramp_members(id) on delete cascade,
  at         timestamptz not null default now(),
  ip         text,
  user_agent text
);
create index if not exists ramp_signins_member_idx on public.ramp_signins(member_id, at desc);

create table if not exists public.ramp_audit (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid references public.ramp_members(id) on delete set null,
  action     text not null,
  member_id  uuid references public.ramp_members(id) on delete set null,
  detail     text not null default '',
  ip         text,
  user_agent text
);
create index if not exists ramp_audit_at_idx on public.ramp_audit(at desc);
create index if not exists ramp_audit_member_idx on public.ramp_audit(member_id);

create table if not exists public.ramp_tasks (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.ramp_members(id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 200),
  notes       text not null default '',
  due_date    date,
  status      text not null default 'todo' check (status in ('todo','doing','review','done')),
  template_id uuid references public.ramp_templates(id) on delete set null,
  created_by  uuid references public.ramp_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ramp_tasks_member_idx on public.ramp_tasks(member_id);

create table if not exists public.ramp_pages (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.ramp_members(id) on delete cascade,
  parent_id  uuid references public.ramp_pages(id) on delete cascade,
  title      text not null default 'Untitled page',
  body       text not null default '',
  shared     boolean not null default false,
  module_id  uuid references public.ramp_modules(id) on delete set null,
  files      jsonb not null default '[]'::jsonb,
  sort       int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ramp_pages_member_idx on public.ramp_pages(member_id);

create table if not exists public.ramp_vault (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.ramp_members(id) on delete cascade,
  label      text not null check (length(btrim(label)) between 1 and 120),
  username   text not null default '',
  url        text not null default '',
  secret     bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ramp_channels (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text not null default '',
  kind          text not null default 'company' check (kind in ('company','department','cohort','dm')),
  department_id uuid references public.ramp_departments(id) on delete cascade,
  read_only     boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.ramp_channel_members (
  channel_id uuid not null references public.ramp_channels(id) on delete cascade,
  member_id  uuid not null references public.ramp_members(id) on delete cascade,
  primary key (channel_id, member_id)
);

create table if not exists public.ramp_messages (
  id         bigint generated always as identity primary key,
  channel_id uuid not null references public.ramp_channels(id) on delete cascade,
  member_id  uuid references public.ramp_members(id) on delete set null,
  body       text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists ramp_messages_channel_idx on public.ramp_messages(channel_id, created_at);

create table if not exists public.ramp_announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 160),
  body          text not null default '',
  audience      text not null default 'everyone' check (audience in ('everyone','trainees','employees','department')),
  department_id uuid references public.ramp_departments(id) on delete cascade,
  require_ack   boolean not null default false,
  created_by    uuid references public.ramp_members(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.ramp_acks (
  announcement_id uuid not null references public.ramp_announcements(id) on delete cascade,
  member_id       uuid not null references public.ramp_members(id) on delete cascade,
  at              timestamptz not null default now(),
  primary key (announcement_id, member_id)
);

create table if not exists public.ramp_resources (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 160),
  category      text not null default 'guide' check (category in ('policy','sop','guide','tool','other')),
  url           text not null default '',
  body          text not null default '',
  file_path     text,
  required      boolean not null default false,
  job_role_id   uuid references public.ramp_job_roles(id) on delete set null,
  guest_visible boolean not null default false,
  sort          int not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ramp_org','ramp_members','ramp_modules','ramp_progress','ramp_templates','ramp_tasks','ramp_pages','ramp_vault','ramp_resources'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.ramp_touch()', t, t);
  end loop;
end $$;

-- ───────────────────────── access helpers ─────────────────────────

create or replace function public.ramp_me() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.ramp_members where auth_user_id = auth.uid() and status = 'active' limit 1
$$;

create or replace function public.ramp_my_rank() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.ramp_rank(level) from public.ramp_members
                   where auth_user_id = auth.uid() and status = 'active' limit 1), 99)
$$;

create or replace function public.ramp_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select public.ramp_my_rank() <= 2 $$;

create or replace function public.ramp_can_see(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ramp_members me join public.ramp_members m on m.id = p_member
    where me.auth_user_id = auth.uid() and me.status = 'active'
      and (me.id = m.id
        or public.ramp_rank(me.level) <= 2
        or (me.level = 'lead' and me.department_id is not null and me.department_id = m.department_id)
        or (me.level in ('lead','mentor') and m.mentor_id = me.id))
  )
$$;

create or replace function public.ramp_can_read_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.ramp_my_rank() <= 6 and exists (
    select 1 from public.ramp_channels c where c.id = p_channel
      and (c.kind <> 'dm' or exists (select 1 from public.ramp_channel_members cm
                                     where cm.channel_id = c.id and cm.member_id = public.ramp_me())))
$$;

create or replace function public.ramp_can_post(p_channel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.ramp_can_read_channel(p_channel)
     and coalesce((select (flags->>'chat')::boolean from public.ramp_org), true)
     and exists (select 1 from public.ramp_channels c where c.id = p_channel and (not c.read_only or public.ramp_is_admin()))
$$;

create or replace function public.ramp_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ramp_field_key' limit 1
$$;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ramp_field_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ramp_field_key',
      'RAMP: encrypts sensitive form fields and personal vault entries');
  end if;
end $$;

-- ───────────────────────── guards and audit triggers ─────────────────────────

-- Only an owner can create, change or remove an owner, or make someone an owner.
create or replace function public.ramp_members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r int;
begin
  if auth.uid() is null or current_setting('ramp.bypass', true) = 'on' then return coalesce(new, old); end if;
  r := public.ramp_my_rank();
  if tg_op = 'DELETE' then
    if old.level = 'owner' and r <> 1 then raise exception 'Only an owner can remove an owner.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.level = 'owner' and r <> 1 then raise exception 'Only an owner can change an owner.'; end if;
  if new.level = 'owner' and r <> 1 then raise exception 'Only an owner can make someone an owner.'; end if;
  if tg_op = 'UPDATE' and old.level = 'owner' and new.level <> 'owner'
     and (select count(*) from public.ramp_members where level = 'owner' and status = 'active') <= 1 then
    raise exception 'RAMP needs at least one owner.';
  end if;
  return new;
end $$;
drop trigger if exists ramp_members_guard on public.ramp_members;
create trigger ramp_members_guard before insert or update or delete on public.ramp_members
  for each row execute function public.ramp_members_guard();

-- Published templates get a new version whenever their fields change.
create or replace function public.ramp_templates_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.fields is distinct from old.fields and old.status = 'published' then new.version := old.version + 1; end if;
  return new;
end $$;
drop trigger if exists ramp_templates_version on public.ramp_templates;
create trigger ramp_templates_version before update on public.ramp_templates
  for each row execute function public.ramp_templates_version();

create or replace function public.ramp_audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_detail text; v_row jsonb;
begin
  if current_setting('ramp.bypass', true) = 'on' then return coalesce(new, old); end if;
  v_me := public.ramp_me();
  if v_me is null then return coalesce(new, old); end if;
  if tg_table_name = 'ramp_members' then
    if tg_op = 'UPDATE' then
      v_detail := concat_ws(', ',
        case when new.level is distinct from old.level then 'access ' || old.level || ' → ' || new.level end,
        case when new.status is distinct from old.status then 'status ' || old.status || ' → ' || new.status end,
        case when new.job_role_id is distinct from old.job_role_id then 'job role changed' end,
        case when new.department_id is distinct from old.department_id then 'department changed' end,
        case when new.mentor_id is distinct from old.mentor_id then 'mentor changed' end,
        case when new.full_name is distinct from old.full_name then 'name changed' end);
      if coalesce(v_detail, '') = '' then return new; end if;
      insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
      values (v_me, 'updated person', new.id, v_detail, public.ramp_req_ip(), public.ramp_req_ua());
    elsif tg_op = 'DELETE' then
      insert into public.ramp_audit(actor_id, action, detail, ip, user_agent)
      values (v_me, 'removed person', old.email, public.ramp_req_ip(), public.ramp_req_ua());
    end if;
    return coalesce(new, old);
  end if;
  v_row := to_jsonb(coalesce(new, old));
  insert into public.ramp_audit(actor_id, action, detail, ip, user_agent)
  values (v_me,
          case tg_op when 'INSERT' then 'created ' when 'UPDATE' then 'updated ' else 'deleted ' end
            || replace(replace(tg_table_name, 'ramp_', ''), '_', ' '),
          coalesce(v_row->>'title', v_row->>'name', ''),
          public.ramp_req_ip(), public.ramp_req_ua());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  execute 'drop trigger if exists ramp_members_audit on public.ramp_members';
  execute 'create trigger ramp_members_audit after update or delete on public.ramp_members for each row execute function public.ramp_audit_change()';
  foreach t in array array['ramp_org','ramp_departments','ramp_job_roles','ramp_modules','ramp_templates','ramp_resources','ramp_announcements'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.ramp_audit_change()', t, t);
  end loop;
end $$;

-- ───────────────────────── row-level security ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['ramp_org','ramp_departments','ramp_job_roles','ramp_members','ramp_access_requests','ramp_modules',
    'ramp_role_modules','ramp_progress','ramp_templates','ramp_submissions','ramp_signins','ramp_audit','ramp_tasks','ramp_pages',
    'ramp_vault','ramp_channels','ramp_channel_members','ramp_messages','ramp_announcements','ramp_acks','ramp_resources'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- settings and structure: every member reads, admins write
create policy ramp_org_read on public.ramp_org for select to authenticated using ((select public.ramp_my_rank()) <= 7);
create policy ramp_org_write on public.ramp_org for update to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));
create policy ramp_departments_read on public.ramp_departments for select to authenticated using ((select public.ramp_my_rank()) <= 7);
create policy ramp_departments_write on public.ramp_departments for all to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));
create policy ramp_job_roles_read on public.ramp_job_roles for select to authenticated using ((select public.ramp_my_rank()) <= 7);
create policy ramp_job_roles_write on public.ramp_job_roles for all to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));
create policy ramp_role_modules_read on public.ramp_role_modules for select to authenticated using ((select public.ramp_my_rank()) <= 7);
create policy ramp_role_modules_write on public.ramp_role_modules for all to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));

-- people: you, your department (leads), your trainees (mentors), everyone (admins)
create policy ramp_members_read on public.ramp_members for select to authenticated using (public.ramp_can_see(id));
create policy ramp_members_insert on public.ramp_members for insert to authenticated with check ((select public.ramp_is_admin()));
create policy ramp_members_update on public.ramp_members for update to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));
create policy ramp_members_delete on public.ramp_members for delete to authenticated using ((select public.ramp_is_admin()));
create policy ramp_access_requests_admin on public.ramp_access_requests for all to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));

-- training content
create policy ramp_modules_read on public.ramp_modules for select to authenticated
  using ((select public.ramp_is_admin()) or (status = 'published' and ((select public.ramp_my_rank()) <= 6 or (guest_visible and (select public.ramp_my_rank()) = 7))));
create policy ramp_modules_write on public.ramp_modules for all to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));
create policy ramp_progress_read on public.ramp_progress for select to authenticated using (public.ramp_can_see(member_id));

-- documents and records (written only through functions)
create policy ramp_templates_read on public.ramp_templates for select to authenticated
  using ((select public.ramp_is_admin()) or (status = 'published' and (select public.ramp_my_rank()) <= 7));
create policy ramp_templates_write on public.ramp_templates for all to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));
create policy ramp_submissions_read on public.ramp_submissions for select to authenticated
  using (member_id = (select public.ramp_me()) or (select public.ramp_is_admin()));
create policy ramp_signins_read on public.ramp_signins for select to authenticated
  using (member_id = (select public.ramp_me()) or (select public.ramp_is_admin()));
create policy ramp_audit_read on public.ramp_audit for select to authenticated using ((select public.ramp_is_admin()));

-- tasks: your own; mentors, leads and admins can assign to people they look after
create policy ramp_tasks_read on public.ramp_tasks for select to authenticated using (public.ramp_can_see(member_id));
create policy ramp_tasks_insert on public.ramp_tasks for insert to authenticated with check (
  (select public.ramp_my_rank()) <= 6 and (member_id = (select public.ramp_me()) or ((select public.ramp_my_rank()) <= 4 and public.ramp_can_see(member_id))));
create policy ramp_tasks_update on public.ramp_tasks for update to authenticated
  using (member_id = (select public.ramp_me()) or ((select public.ramp_my_rank()) <= 4 and public.ramp_can_see(member_id)))
  with check (member_id = (select public.ramp_me()) or ((select public.ramp_my_rank()) <= 4 and public.ramp_can_see(member_id)));
create policy ramp_tasks_delete on public.ramp_tasks for delete to authenticated
  using (member_id = (select public.ramp_me()) or ((select public.ramp_my_rank()) <= 4 and public.ramp_can_see(member_id)));

-- notebooks: private unless shared; shared pages are visible to the people who look after you
create policy ramp_pages_read on public.ramp_pages for select to authenticated
  using (member_id = (select public.ramp_me()) or (shared and (select public.ramp_my_rank()) <= 4 and public.ramp_can_see(member_id)));
create policy ramp_pages_insert on public.ramp_pages for insert to authenticated
  with check (member_id = (select public.ramp_me()) and (select public.ramp_my_rank()) <= 6);
create policy ramp_pages_update on public.ramp_pages for update to authenticated
  using (member_id = (select public.ramp_me())) with check (member_id = (select public.ramp_me()));
create policy ramp_pages_delete on public.ramp_pages for delete to authenticated using (member_id = (select public.ramp_me()));

-- personal vault: owner only, secrets encrypted and only decrypted for their owner
create policy ramp_vault_read on public.ramp_vault for select to authenticated using (member_id = (select public.ramp_me()));
create policy ramp_vault_delete on public.ramp_vault for delete to authenticated using (member_id = (select public.ramp_me()));

-- chat
create policy ramp_channels_read on public.ramp_channels for select to authenticated using (public.ramp_can_read_channel(id));
create policy ramp_channels_write on public.ramp_channels for all to authenticated
  using ((select public.ramp_is_admin()) and kind <> 'dm') with check ((select public.ramp_is_admin()) and kind <> 'dm');
create policy ramp_channel_members_read on public.ramp_channel_members for select to authenticated using (public.ramp_can_read_channel(channel_id));
create policy ramp_messages_read on public.ramp_messages for select to authenticated using (public.ramp_can_read_channel(channel_id));
create policy ramp_messages_insert on public.ramp_messages for insert to authenticated
  with check (member_id = (select public.ramp_me()) and public.ramp_can_post(channel_id));
create policy ramp_messages_delete on public.ramp_messages for delete to authenticated
  using (member_id = (select public.ramp_me()) or (select public.ramp_is_admin()));

-- announcements
create policy ramp_announcements_read on public.ramp_announcements for select to authenticated using ((select public.ramp_my_rank()) <= 6);
create policy ramp_announcements_insert on public.ramp_announcements for insert to authenticated with check (
  created_by = (select public.ramp_me()) and ((select public.ramp_is_admin()) or ((select public.ramp_my_rank()) = 3 and audience = 'department'
    and department_id = (select department_id from public.ramp_members where id = (select public.ramp_me())))));
create policy ramp_announcements_delete on public.ramp_announcements for delete to authenticated
  using ((select public.ramp_is_admin()) or created_by = (select public.ramp_me()));
create policy ramp_acks_read on public.ramp_acks for select to authenticated using (member_id = (select public.ramp_me()) or (select public.ramp_is_admin()));
create policy ramp_acks_insert on public.ramp_acks for insert to authenticated with check (member_id = (select public.ramp_me()));

-- resources
create policy ramp_resources_read on public.ramp_resources for select to authenticated
  using ((select public.ramp_my_rank()) <= 6 or (guest_visible and (select public.ramp_my_rank()) = 7));
create policy ramp_resources_write on public.ramp_resources for all to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));

-- ───────────────────────── functions the app calls ─────────────────────────

-- Name and color for the sign-in screen (no login needed).
create or replace function public.ramp_public_brand() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('name', name, 'color', brand_color) from public.ramp_org),
                  jsonb_build_object('name', 'RAMP', 'color', '#4338CA'))
$$;

-- Called once when the app opens: links an invited email to its login, records the sign-in
-- (IP and device come from the request, not the browser) and says what the person may see.
create or replace function public.ramp_session_start() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  m public.ramp_members;
  v_rec boolean;
  v_ip text := public.ramp_req_ip();
  v_ua text := public.ramp_req_ua();
begin
  if v_uid is null then return jsonb_build_object('state', 'signed_out'); end if;
  perform set_config('ramp.bypass', 'on', true);
  select lower(email) into v_email from auth.users where id = v_uid;
  select * into m from public.ramp_members where auth_user_id = v_uid;
  if m.id is null then
    select * into m from public.ramp_members where email = v_email and auth_user_id is null;
    if m.id is not null then
      update public.ramp_members
         set auth_user_id = v_uid, joined_at = coalesce(joined_at, now()),
             status = case when status = 'invited' then 'active' else status end
       where id = m.id returning * into m;
      insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
      values (m.id, 'joined', m.id, 'Created a login and joined RAMP', v_ip, v_ua);
    end if;
  end if;
  if m.id is null then
    return jsonb_build_object('state', 'no_access', 'email', v_email,
      'requested', exists (select 1 from public.ramp_access_requests where auth_user_id = v_uid));
  end if;
  if m.status = 'inactive' then return jsonb_build_object('state', 'inactive', 'email', v_email); end if;
  if m.level = 'guest' and m.access_until is not null and m.access_until < current_date then
    return jsonb_build_object('state', 'expired', 'email', v_email);
  end if;
  v_rec := coalesce((select (flags->>'record_ip')::boolean from public.ramp_org), true);
  if not exists (select 1 from public.ramp_signins where member_id = m.id and at > now() - interval '30 minutes'
                  and coalesce(ip, '') = coalesce(case when v_rec then v_ip end, '')) then
    insert into public.ramp_signins(member_id, ip, user_agent)
    values (m.id, case when v_rec then v_ip end, case when v_rec then v_ua end);
  end if;
  update public.ramp_members set last_seen_at = now() where id = m.id;
  return jsonb_build_object('state', 'ok', 'member_id', m.id);
end $$;

create or replace function public.ramp_request_access(p_name text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  insert into public.ramp_access_requests(auth_user_id, email, name, note)
  values (auth.uid(), v_email, left(coalesce(p_name, ''), 120), left(coalesce(p_note, ''), 1000))
  on conflict (auth_user_id) do update set name = excluded.name, note = excluded.note, status = 'open', created_at = now();
end $$;

-- Everyone a staff member can mention or message (names only, never contact details).
create or replace function public.ramp_directory()
returns table(id uuid, full_name text, preferred_name text, level text, job_title text, department text, mentor_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.id, m.full_name, m.preferred_name, m.level, coalesce(j.title, ''), coalesce(d.name, ''), m.mentor_id
  from public.ramp_members m
  left join public.ramp_job_roles j on j.id = m.job_role_id
  left join public.ramp_departments d on d.id = m.department_id
  where m.status = 'active' and (public.ramp_my_rank() <= 6 or m.id = public.ramp_me())
  order by m.full_name
$$;

create or replace function public.ramp_update_profile(p_full_name text, p_preferred text, p_phone text, p_timezone text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me();
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_members set full_name = left(btrim(coalesce(p_full_name, full_name)), 120),
    preferred_name = left(btrim(coalesce(p_preferred, '')), 60), phone = left(btrim(coalesce(p_phone, '')), 40),
    timezone = left(btrim(coalesce(p_timezone, '')), 60)
  where id = v_me;
end $$;

-- Free-form audit entry for actions the browser performs (opened a file, viewed as someone…).
create or replace function public.ramp_log(p_action text, p_member uuid, p_detail text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me();
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me, left(coalesce(p_action, 'note'), 60), p_member, left(coalesce(p_detail, ''), 500), public.ramp_req_ip(), public.ramp_req_ua());
end $$;

create or replace function public.ramp_mark_practice_done() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_mod uuid;
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_members set practice_done_at = coalesce(practice_done_at, now()) where id = v_me;
  select id into v_mod from public.ramp_modules where builtin = 'practice' and status = 'published' order by sort limit 1;
  if v_mod is not null then
    insert into public.ramp_progress(member_id, module_id, status, step, score, completed_at)
    values (v_me, v_mod, 'completed', 99, 100, now())
    on conflict (member_id, module_id) do update set status = 'completed', completed_at = coalesce(public.ramp_progress.completed_at, now()), updated_at = now();
  end if;
end $$;

-- End of the welcome flow: first-week templates become tasks.
create or replace function public.ramp_finish_onboarding() returns int
language plpgsql security definer set search_path = '' as $$
declare v_me public.ramp_members; v_n int;
begin
  select * into v_me from public.ramp_members where id = public.ramp_me();
  if v_me.id is null then raise exception 'Not signed in to RAMP.'; end if;
  perform set_config('ramp.bypass', 'on', true);
  insert into public.ramp_tasks(member_id, title, notes, due_date, template_id, created_by)
  select v_me.id, t.title, t.description, current_date + 5, t.id, v_me.id
  from public.ramp_templates t
  where t.status = 'published' and t.stage = 'first_week'
    and (t.audience = 'everyone' or (t.audience = 'role' and t.job_role_id = v_me.job_role_id))
    and not exists (select 1 from public.ramp_tasks k where k.member_id = v_me.id and k.template_id = t.id);
  get diagnostics v_n = row_count;
  update public.ramp_members set onboarded_at = coalesce(onboarded_at, now()) where id = v_me.id;
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me.id, 'finished onboarding', v_me.id, v_n || ' first-week tasks added', public.ramp_req_ip(), public.ramp_req_ua());
  return v_n;
end $$;

-- Fill in, upload or sign a document. Sensitive answers are encrypted with the key in Supabase
-- Vault; IP address and device are read from the request.
create or replace function public.ramp_submit(p_template uuid, p_answers jsonb, p_secure jsonb, p_files jsonb, p_signed_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.ramp_members;
  t public.ramp_templates;
  v_id uuid;
  v_rec boolean;
  v_ip text;
  v_ua text;
  v_key text;
  v_signed text := nullif(btrim(coalesce(p_signed_name, '')), '');
  v_has_secure boolean := p_secure is not null and p_secure <> '{}'::jsonb;
begin
  select * into v_me from public.ramp_members where auth_user_id = auth.uid() and status = 'active';
  if v_me.id is null then raise exception 'Not signed in to RAMP.'; end if;
  select * into t from public.ramp_templates where id = p_template and status = 'published';
  if t.id is null then raise exception 'That form isn’t available.'; end if;
  if t.audience = 'role' and t.job_role_id is distinct from v_me.job_role_id then raise exception 'That form isn’t assigned to you.'; end if;
  if v_has_secure then
    v_key := public.ramp_key();
    if v_key is null then raise exception 'Encryption key missing. Ask an owner to check RAMP setup.'; end if;
  end if;
  v_rec := coalesce((select (flags->>'record_ip')::boolean from public.ramp_org), true);
  v_ip := case when v_rec then public.ramp_req_ip() end;
  v_ua := case when v_rec then public.ramp_req_ua() end;
  insert into public.ramp_submissions(member_id, template_id, template_title, template_version, answers, secure_fields,
                                      secure_data, files, signed_name, ip, user_agent)
  values (v_me.id, t.id, t.title, t.version, coalesce(p_answers, '{}'::jsonb),
          coalesce((select array_agg(k) from jsonb_object_keys(coalesce(p_secure, '{}'::jsonb)) as k), '{}'),
          case when v_has_secure then extensions.pgp_sym_encrypt(p_secure::text, v_key) end,
          coalesce(p_files, '[]'::jsonb), v_signed, v_ip, v_ua)
  returning id into v_id;
  update public.ramp_tasks set status = 'done' where member_id = v_me.id and template_id = t.id and status <> 'done';
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me.id, case when v_signed is not null then 'signed' else 'submitted' end, v_me.id, t.title || ' (v' || t.version || ')', v_ip, v_ua);
  return v_id;
end $$;

-- Show one sensitive answer to its owner or an admin. Every reveal is logged.
create or replace function public.ramp_reveal(p_submission uuid, p_field text, p_label text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.ramp_submissions; v_me uuid := public.ramp_me(); v_val text;
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  select * into s from public.ramp_submissions where id = p_submission;
  if s.id is null then raise exception 'Record not found.'; end if;
  if not (s.member_id = v_me or public.ramp_is_admin()) then raise exception 'You can’t open this record.'; end if;
  if s.secure_data is null then return null; end if;
  v_val := (extensions.pgp_sym_decrypt(s.secure_data, public.ramp_key())::jsonb) ->> p_field;
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me, 'revealed', s.member_id, coalesce(nullif(p_label, ''), p_field) || ' on ' || s.template_title, public.ramp_req_ip(), public.ramp_req_ua());
  return v_val;
end $$;

create or replace function public.ramp_module_save(p_module uuid, p_step int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me();
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  if not exists (select 1 from public.ramp_modules where id = p_module and status = 'published') then raise exception 'Module not found.'; end if;
  insert into public.ramp_progress(member_id, module_id, step) values (v_me, p_module, greatest(coalesce(p_step, 0), 0))
  on conflict (member_id, module_id) do update set step = greatest(public.ramp_progress.step, excluded.step), updated_at = now()
  where public.ramp_progress.status in ('in_progress', 'returned');
end $$;

create or replace function public.ramp_module_finish(p_module uuid, p_score int, p_answer text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); m public.ramp_modules; v_status text;
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  select * into m from public.ramp_modules where id = p_module and status = 'published';
  if m.id is null then raise exception 'Module not found.'; end if;
  if m.pass_score > 0 and coalesce(p_score, 0) < m.pass_score then
    raise exception 'You need % to pass. Review the questions and try again.', m.pass_score || '%';
  end if;
  v_status := case when m.mentor_review then 'submitted' else 'completed' end;
  insert into public.ramp_progress(member_id, module_id, status, step, score, answer, submitted_at, completed_at)
  values (v_me, p_module, v_status, 999, p_score, left(coalesce(p_answer, ''), 20000),
          case when v_status = 'submitted' then now() end, case when v_status = 'completed' then now() end)
  on conflict (member_id, module_id) do update set status = v_status, step = 999, score = excluded.score, answer = excluded.answer,
    feedback = '', submitted_at = excluded.submitted_at, completed_at = excluded.completed_at, updated_at = now();
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me, case when v_status = 'submitted' then 'submitted module' else 'completed module' end, v_me, m.title, public.ramp_req_ip(), public.ramp_req_ua());
  return v_status;
end $$;

-- Mentors (their trainees), leads (their department) and admins approve or return submitted work.
create or replace function public.ramp_review(p_member uuid, p_module uuid, p_approve boolean, p_feedback text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_title text;
begin
  if v_me is null or public.ramp_my_rank() > 4 or not public.ramp_can_see(p_member) or p_member = v_me then
    raise exception 'You can’t review this person’s work.';
  end if;
  update public.ramp_progress
     set status = case when p_approve then 'completed' else 'returned' end,
         feedback = left(coalesce(p_feedback, ''), 4000), reviewer_id = v_me,
         completed_at = case when p_approve then now() else null end, updated_at = now()
   where member_id = p_member and module_id = p_module and status = 'submitted';
  if not found then raise exception 'Nothing waiting for review.'; end if;
  select title into v_title from public.ramp_modules where id = p_module;
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me, case when p_approve then 'approved' else 'returned' end, p_member, v_title, public.ramp_req_ip(), public.ramp_req_ua());
end $$;

create or replace function public.ramp_invite(p_email text, p_name text, p_job_role uuid, p_mentor uuid, p_level text,
                                              p_source text, p_ref text, p_start date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_id uuid; v_email text := lower(btrim(coalesce(p_email, ''))); v_dept uuid; v_level text := coalesce(p_level, 'trainee');
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can invite people.'; end if;
  if position('@' in v_email) < 2 then raise exception 'Enter a valid email address.'; end if;
  if v_level not in ('admin','lead','mentor','employee','trainee','guest') then raise exception 'Pick an access level.'; end if;
  if exists (select 1 from public.ramp_members where email = v_email) then raise exception '% is already in RAMP.', v_email; end if;
  select department_id into v_dept from public.ramp_job_roles where id = p_job_role;
  insert into public.ramp_members(email, full_name, level, job_role_id, department_id, mentor_id, status, source, source_ref, start_date, invited_by)
  values (v_email, left(btrim(coalesce(p_name, '')), 120), v_level, p_job_role, v_dept, p_mentor, 'invited',
          coalesce(nullif(p_source, ''), 'manual'), p_ref, p_start, v_me)
  returning id into v_id;
  update public.ramp_access_requests set status = 'invited' where email = v_email;
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me, 'invited', v_id, v_email || ' as ' || v_level, public.ramp_req_ip(), public.ramp_req_ua());
  return v_id;
end $$;

create or replace function public.ramp_graduate(p_member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); m public.ramp_members; v_level text;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can graduate people.'; end if;
  select * into m from public.ramp_members where id = p_member;
  if m.id is null then raise exception 'Person not found.'; end if;
  if m.level <> 'trainee' then raise exception 'Only trainees can graduate.'; end if;
  v_level := coalesce((select level from public.ramp_job_roles where id = m.job_role_id), 'employee');
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_members set level = v_level, graduated_at = now() where id = p_member;
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (v_me, 'graduated', p_member, 'trainee → ' || v_level, public.ramp_req_ip(), public.ramp_req_ua());
  return v_level;
end $$;

-- People from your other tools who could join: hiring applicants and staff records.
create or replace function public.ramp_potential_staff()
returns table(source text, ref text, name text, email text, detail text, at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can see this.'; end if;
  return query
    select 'hiring'::text, a.id::text, a.name, lower(a.email), j.title || ' · ' || a.stage, a.submitted_at
    from public.hiring_applications a join public.hiring_jobs j on j.id = a.job_id
    where not exists (select 1 from public.ramp_members m where m.email = lower(a.email))
    union all
    select 'staff'::text, p.id::text, p.full_name, lower(p.email),
           'Staff record' || coalesce(' · ' || (select string_agg(distinct ta.tool || ' ' || ta.role, ', ') from core.tool_access ta where ta.person_id = p.id), ''),
           p.created_at
    from core.people p
    where p.active and not exists (select 1 from public.ramp_members m where m.email = lower(p.email))
    union all
    select 'request'::text, r.id::text, r.name, r.email, 'Asked for access' || case when r.note <> '' then ': ' || r.note else '' end, r.created_at
    from public.ramp_access_requests r
    where r.status = 'open' and not exists (select 1 from public.ramp_members m where m.email = r.email)
    order by 6 desc;
end $$;

create or replace function public.ramp_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_id uuid; v_slug text;
begin
  if v_me is null or public.ramp_my_rank() > 6 then raise exception 'Chat isn’t available for your access level.'; end if;
  if p_other = v_me or not exists (select 1 from public.ramp_members where id = p_other and status = 'active' and level <> 'guest') then
    raise exception 'You can’t message that person.';
  end if;
  v_slug := 'dm-' || least(v_me::text, p_other::text) || '-' || greatest(v_me::text, p_other::text);
  select id into v_id from public.ramp_channels where slug = v_slug;
  if v_id is null then
    insert into public.ramp_channels(slug, name, kind) values (v_slug, 'Direct message', 'dm') returning id into v_id;
    insert into public.ramp_channel_members(channel_id, member_id) values (v_id, v_me), (v_id, p_other);
  end if;
  return v_id;
end $$;

create or replace function public.ramp_vault_save(p_id uuid, p_label text, p_username text, p_url text, p_secret text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_id uuid := p_id; v_key text := public.ramp_key();
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  if v_key is null then raise exception 'Encryption key missing. Ask an owner to check RAMP setup.'; end if;
  if v_id is null then
    insert into public.ramp_vault(member_id, label, username, url, secret)
    values (v_me, left(btrim(p_label), 120), left(coalesce(p_username, ''), 200), left(coalesce(p_url, ''), 500),
            case when coalesce(p_secret, '') <> '' then extensions.pgp_sym_encrypt(p_secret, v_key) end)
    returning id into v_id;
  else
    update public.ramp_vault set label = left(btrim(p_label), 120), username = left(coalesce(p_username, ''), 200),
      url = left(coalesce(p_url, ''), 500),
      secret = case when p_secret is null then secret when p_secret = '' then null else extensions.pgp_sym_encrypt(p_secret, v_key) end
    where id = v_id and member_id = v_me;
    if not found then raise exception 'Entry not found.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.ramp_vault_reveal(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_secret bytea;
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  select secret into v_secret from public.ramp_vault where id = p_id and member_id = v_me;
  if v_secret is null then return ''; end if;
  return extensions.pgp_sym_decrypt(v_secret, public.ramp_key());
end $$;

-- ───────────────────────── function privileges ─────────────────────────

revoke all on function public.ramp_key() from public, anon, authenticated;
revoke all on function public.ramp_members_guard() from public, anon, authenticated;
revoke all on function public.ramp_audit_change() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'ramp_session_start()', 'ramp_request_access(text,text)', 'ramp_directory()', 'ramp_update_profile(text,text,text,text)',
    'ramp_log(text,uuid,text)', 'ramp_mark_practice_done()', 'ramp_finish_onboarding()', 'ramp_submit(uuid,jsonb,jsonb,jsonb,text)',
    'ramp_reveal(uuid,text,text)', 'ramp_module_save(uuid,int)', 'ramp_module_finish(uuid,int,text)', 'ramp_review(uuid,uuid,boolean,text)',
    'ramp_invite(text,text,uuid,uuid,text,text,text,date)', 'ramp_graduate(uuid)', 'ramp_potential_staff()', 'ramp_dm(uuid)',
    'ramp_vault_save(uuid,text,text,text,text)', 'ramp_vault_reveal(uuid)', 'ramp_me()', 'ramp_my_rank()', 'ramp_is_admin()',
    'ramp_can_see(uuid)', 'ramp_can_read_channel(uuid)', 'ramp_can_post(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.ramp_public_brand() to anon, authenticated;

-- ───────────────────────── file storage ─────────────────────────
-- Files live in a private bucket under the owner's member id; admins can read everything.
-- resources/… holds files admins attach to resources, readable by every member.

insert into storage.buckets (id, name, public, file_size_limit)
values ('ramp-files', 'ramp-files', false, 26214400)
on conflict (id) do nothing;

drop policy if exists ramp_files_read on storage.objects;
create policy ramp_files_read on storage.objects for select to authenticated using (
  bucket_id = 'ramp-files' and (
    (storage.foldername(name))[1] = (select public.ramp_me())::text
    or (select public.ramp_is_admin())
    or ((storage.foldername(name))[1] = 'resources' and (select public.ramp_my_rank()) <= 7)));
drop policy if exists ramp_files_insert on storage.objects;
create policy ramp_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'ramp-files' and (
    (storage.foldername(name))[1] = (select public.ramp_me())::text
    or ((storage.foldername(name))[1] = 'resources' and (select public.ramp_is_admin()))));
drop policy if exists ramp_files_delete on storage.objects;
create policy ramp_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'ramp-files' and (
    (storage.foldername(name))[1] = (select public.ramp_me())::text
    or ((storage.foldername(name))[1] = 'resources' and (select public.ramp_is_admin()))));

-- ───────────────────────── realtime chat ─────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ramp_messages') then
    alter publication supabase_realtime add table public.ramp_messages;
  end if;
end $$;
