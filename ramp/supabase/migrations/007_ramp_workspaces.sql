-- RAMP 007: multi-tenant workspaces (phases 1 and 2).
--
-- Every ramp_ table except the platform tables gets workspace_id. Isolation is enforced three ways:
--   1. A RESTRICTIVE policy on every workspace table: workspace_id = ramp_ws() (the caller's current workspace).
--   2. Almost every RAMP function now belongs to ramp_owner, a role WITHOUT bypassrls, so those functions are
--      confined by the same policy even when handed an id from another workspace.
--   3. Composite foreign keys (workspace_id, x) → (workspace_id, id), so no row can point at another workspace's row.
-- Functions that must stay owned by postgres (they bypass RLS) carry the comment 'RAMP: postgres-owned …' and
-- filter by workspace themselves. The ownership loop at the end relies on that comment.
--
-- Apply after 001–006b, then 008 and 009, in order. Written to be re-runnable; if you re-run it, re-run 008 and 009 after it.
-- Destructive statements (each needs the owner's OK) are marked "DESTRUCTIVE" below:
--   • drops 6 global unique constraints and replaces them with per-workspace ones (members email/auth user, department name,
--     channel slug, invoice number, access-request auth user), and moves ramp_org's primary key from id to workspace_id;
--   • replaces ramp_members_source_check with a superset;
--   • drops and re-creates the storage policies ramp_files_read, ramp_files_insert, ramp_files_delete.

-- ───────────────────────── platform tables ─────────────────────────

create table if not exists public.ramp_accounts (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (length(btrim(name)) between 1 and 120),
  owner_auth_id          uuid references auth.users(id) on delete set null,
  status                 text not null default 'pending' check (status in ('pending','active','paused','closed')),
  pause_reason           text check (pause_reason in ('admin','billing')),
  plan                   text not null default 'trial' check (plan in ('comp','trial','paid')),
  trial_ends             date,
  seat_limit             int check (seat_limit is null or seat_limit >= 0),
  notes                  text not null default '',
  approved_at            timestamptz,
  approved_by            uuid references auth.users(id) on delete set null,
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  subscription_status    text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.ramp_workspaces (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ramp_accounts(id) on delete restrict,
  name       text not null check (length(btrim(name)) between 1 and 120),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  status     text not null default 'active' check (status in ('active','paused','closed')),
  setup_done boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ramp_workspaces_account_idx on public.ramp_workspaces(account_id);

create table if not exists public.ramp_platform (
  id                   boolean primary key default true check (id),
  library_workspace_id uuid references public.ramp_workspaces(id) on delete set null,
  agency_workspace_id  uuid references public.ramp_workspaces(id) on delete set null,
  brand_name           text not null default 'RAMP' check (length(btrim(brand_name)) between 1 and 80),
  brand_color          text not null default '#4338CA' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  default_trial_days   int not null default 30 check (default_trial_days between 1 and 365),
  default_seat_limit   int default 10 check (default_seat_limit is null or default_seat_limit >= 0),
  workspace_limit      int default 5 check (workspace_limit is null or workspace_limit >= 1),
  stripe_prices        jsonb not null default '[]'::jsonb check (jsonb_typeof(stripe_prices) = 'array'),
  updated_at           timestamptz not null default now()
);

create table if not exists public.ramp_super_admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table if not exists public.ramp_account_requests (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  email         text not null,
  name          text not null default '',
  company       text not null check (length(btrim(company)) between 1 and 120),
  phone         text not null default '',
  team_size     text not null default '',
  note          text not null default '',
  status        text not null default 'pending' check (status in ('pending','approved','declined')),
  account_id    uuid references public.ramp_accounts(id) on delete set null,
  decision_note text not null default '',
  decided_at    timestamptz,
  decided_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.ramp_user_prefs (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid references public.ramp_workspaces(id) on delete set null,
  updated_at   timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ramp_accounts','ramp_workspaces','ramp_platform','ramp_super_admins','ramp_account_requests','ramp_user_prefs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create or replace trigger ramp_accounts_touch before update on public.ramp_accounts for each row execute function public.ramp_touch();
create or replace trigger ramp_platform_touch before update on public.ramp_platform for each row execute function public.ramp_touch();

-- ───────────────────────── MKC: account, workspace #1, platform row, super admin ─────────────────────────
-- The owner is the existing active owner member (there is exactly one live).

do $$
declare v_owner uuid; v_acc uuid; v_ws uuid;
begin
  select id into v_ws from public.ramp_workspaces where slug = 'mkc';
  if v_ws is null then
    select auth_user_id into v_owner from public.ramp_members
    where level = 'owner' and status = 'active' and auth_user_id is not null order by created_at limit 1;
    insert into public.ramp_accounts (name, owner_auth_id, status, plan, seat_limit, approved_at, notes)
    values ('MKC', v_owner, 'active', 'comp', null, now(), 'Platform owner. Migrated from single-company RAMP.')
    returning id into v_acc;
    insert into public.ramp_workspaces (account_id, name, slug, status, setup_done, created_by)
    values (v_acc, 'MKC', 'mkc', 'active', true, v_owner) returning id into v_ws;
    if v_owner is not null then
      insert into public.ramp_super_admins (auth_user_id) values (v_owner) on conflict do nothing;
    end if;
  end if;
  insert into public.ramp_platform (id, library_workspace_id, agency_workspace_id) values (true, v_ws, v_ws)
  on conflict (id) do nothing;
end $$;

-- ───────────────────────── current workspace ─────────────────────────

create or replace function public.ramp_is_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.ramp_super_admins where auth_user_id = auth.uid())
$$;

-- The caller's current workspace: the GUC ramp.ws (set only by trusted definer code), else their saved preference
-- (if they're an active member there, or a super admin), else their first active membership. For anyone but a super
-- admin it is null while the workspace or its account is paused or closed, or a trial has ended, so nothing is readable.
create or replace function public.ramp_ws() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_g text := nullif(current_setting('ramp.ws', true), ''); v_uid uuid; v_ws uuid; v_super boolean;
begin
  if v_g is not null then return v_g::uuid; end if;
  v_uid := auth.uid();
  if v_uid is null then return null; end if;
  v_super := exists (select 1 from public.ramp_super_admins where auth_user_id = v_uid);
  select p.workspace_id into v_ws from public.ramp_user_prefs p
  where p.auth_user_id = v_uid and p.workspace_id is not null
    and (v_super or exists (select 1 from public.ramp_members m
                            where m.workspace_id = p.workspace_id and m.auth_user_id = v_uid and m.status = 'active'));
  if v_ws is null then
    select m.workspace_id into v_ws from public.ramp_members m
    where m.auth_user_id = v_uid and m.status = 'active' order by m.created_at, m.id limit 1;
  end if;
  if v_ws is null or v_super then return v_ws; end if;
  if exists (select 1 from public.ramp_workspaces w join public.ramp_accounts a on a.id = w.account_id
             where w.id = v_ws and w.status = 'active' and a.status = 'active'
               and (a.plan <> 'trial' or a.trial_ends is null or a.trial_ends >= current_date)) then
    return v_ws;
  end if;
  return null;
end $$;

-- ───────────────────────── workspace_id on every workspace table ─────────────────────────
-- Existing rows get MKC's workspace: the default is evaluated with ramp.ws pinned to MKC inside this one statement.

do $$
declare
  t text;
  v_ws uuid := (select id from public.ramp_workspaces where slug = 'mkc');
begin
  perform set_config('ramp.ws', v_ws::text, true);
  foreach t in array array['ramp_org','ramp_departments','ramp_job_roles','ramp_members','ramp_access_requests','ramp_modules',
    'ramp_role_modules','ramp_progress','ramp_templates','ramp_submissions','ramp_signins','ramp_audit','ramp_tasks','ramp_pages',
    'ramp_vault','ramp_channels','ramp_channel_members','ramp_messages','ramp_announcements','ramp_acks','ramp_resources',
    'ramp_clients','ramp_tiers','ramp_client_modules','ramp_placements','ramp_placement_steps','ramp_rate_changes','ramp_checkins',
    'ramp_timesheets','ramp_invoices','ramp_invoice_lines','ramp_payouts','ramp_payout_lines','ramp_payees','ramp_client_requests',
    'ramp_launch_plans'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'workspace_id') then
      execute format('alter table public.%I add column workspace_id uuid not null default public.ramp_ws() '
                     'references public.ramp_workspaces(id) on delete cascade', t);
    end if;
    execute format('create index if not exists %I on public.%I (workspace_id)', t || '_ws_idx', t);
  end loop;
  perform set_config('ramp.ws', '', true);
end $$;

-- ───────────────────────── unique keys become per workspace ─────────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ramp_members_ws_email_key') then
    alter table public.ramp_members add constraint ramp_members_ws_email_key unique (workspace_id, email);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ramp_members_ws_auth_key') then
    alter table public.ramp_members add constraint ramp_members_ws_auth_key unique (workspace_id, auth_user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ramp_departments_ws_name_key') then
    alter table public.ramp_departments add constraint ramp_departments_ws_name_key unique (workspace_id, name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ramp_channels_ws_slug_key') then
    alter table public.ramp_channels add constraint ramp_channels_ws_slug_key unique (workspace_id, slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ramp_invoices_ws_number_key') then
    alter table public.ramp_invoices add constraint ramp_invoices_ws_number_key unique (workspace_id, number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ramp_access_requests_ws_auth_key') then
    alter table public.ramp_access_requests add constraint ramp_access_requests_ws_auth_key unique (workspace_id, auth_user_id);
  end if;
end $$;

-- DESTRUCTIVE (owner OK needed): the global unique keys are replaced by the per-workspace ones just added.
alter table public.ramp_members drop constraint if exists ramp_members_email_key;
alter table public.ramp_members drop constraint if exists ramp_members_auth_user_id_key;
alter table public.ramp_departments drop constraint if exists ramp_departments_name_key;
alter table public.ramp_channels drop constraint if exists ramp_channels_slug_key;
alter table public.ramp_invoices drop constraint if exists ramp_invoices_number_key;
alter table public.ramp_access_requests drop constraint if exists ramp_access_requests_auth_user_id_key;
-- Kept on purpose: ramp_invoices.stripe_invoice_id (Stripe ids are global) and ramp_timesheets (placement_id, week_start)
-- (a placement belongs to exactly one workspace).

-- DESTRUCTIVE (owner OK needed): ramp_org's primary key moves from the boolean id to workspace_id (one row per workspace).
-- The id column stays (default true, check (id)) so the app's `update … where id = true` keeps working under RLS.
do $$
begin
  if exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
             where c.conrelid = 'public.ramp_org'::regclass and c.contype = 'p' and a.attname = 'id') then
    alter table public.ramp_org drop constraint ramp_org_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.ramp_org'::regclass and contype = 'p') then
    alter table public.ramp_org add constraint ramp_org_pkey primary key (workspace_id);
  end if;
end $$;

-- ───────────────────────── same-workspace foreign keys ─────────────────────────
-- For every single-column FK between two workspace tables, add a composite (workspace_id, col) → (workspace_id, id) key
-- next to it, with the same delete behaviour. A row can then never reference a row of another workspace, whoever writes it.

do $$
declare
  r record; v_name text; v_key text; v_act text;
  v_tables text[] := array['ramp_org','ramp_departments','ramp_job_roles','ramp_members','ramp_access_requests','ramp_modules',
    'ramp_role_modules','ramp_progress','ramp_templates','ramp_submissions','ramp_signins','ramp_audit','ramp_tasks','ramp_pages',
    'ramp_vault','ramp_channels','ramp_channel_members','ramp_messages','ramp_announcements','ramp_acks','ramp_resources',
    'ramp_clients','ramp_tiers','ramp_client_modules','ramp_placements','ramp_placement_steps','ramp_rate_changes','ramp_checkins',
    'ramp_timesheets','ramp_invoices','ramp_invoice_lines','ramp_payouts','ramp_payout_lines','ramp_payees','ramp_client_requests',
    'ramp_launch_plans'];
begin
  for r in
    select c.conname, ct.relname as tbl, cr.relname as ref, a.attname as col, c.confdeltype
    from pg_constraint c
    join pg_class ct on ct.oid = c.conrelid
    join pg_class cr on cr.oid = c.confrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f' and cardinality(c.conkey) = 1 and fa.attname = 'id'
      and ct.relnamespace = 'public'::regnamespace and cr.relnamespace = 'public'::regnamespace
      and ct.relname = any(v_tables) and cr.relname = any(v_tables)
      and a.attname <> 'agency_placement_id'          -- 008: deliberately points at the agency workspace
    order by 1
  loop
    v_key := r.ref || '_ws_id_key';
    if not exists (select 1 from pg_constraint where conname = v_key and conrelid = ('public.' || r.ref)::regclass) then
      execute format('alter table public.%I add constraint %I unique (workspace_id, id)', r.ref, v_key);
    end if;
    v_name := left(r.conname, 60) || '_ws';
    if not exists (select 1 from pg_constraint where conname = v_name and conrelid = ('public.' || r.tbl)::regclass) then
      v_act := case r.confdeltype when 'c' then 'cascade' when 'n' then format('set null (%I)', r.col) else 'no action' end;
      execute format('alter table public.%I add constraint %I foreign key (workspace_id, %I) references public.%I (workspace_id, id) on delete %s',
                     r.tbl, v_name, r.col, r.ref, v_act);
    end if;
  end loop;
end $$;

-- ───────────────────────── members: support rows, sources ─────────────────────────

alter table public.ramp_members add column if not exists support boolean not null default false;
-- DESTRUCTIVE (owner OK needed): source check replaced by a superset ('signup' account owners, 'support' rows, 'agency' VAs).
alter table public.ramp_members drop constraint if exists ramp_members_source_check;
alter table public.ramp_members add constraint ramp_members_source_check
  check (source in ('manual','hiring','staff','request','seed','signup','support','agency'));

-- ───────────────────────── ramp_owner: the role RAMP functions run as ─────────────────────────

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ramp_owner') then
    create role ramp_owner nologin nobypassrls inherit;
  end if;
end $$;
grant authenticated to ramp_owner;                  -- auth.uid(), extensions, storage functions
grant ramp_owner to postgres;                       -- PG16+: lets postgres hand functions to ramp_owner and replace them later
grant usage, create on schema public to ramp_owner; -- CREATE is required to own functions in public; ramp_owner can't log in

do $$
declare t text; s text;
begin
  foreach t in array array['ramp_org','ramp_departments','ramp_job_roles','ramp_members','ramp_access_requests','ramp_modules',
    'ramp_role_modules','ramp_progress','ramp_templates','ramp_submissions','ramp_signins','ramp_audit','ramp_tasks','ramp_pages',
    'ramp_vault','ramp_channels','ramp_channel_members','ramp_messages','ramp_announcements','ramp_acks','ramp_resources',
    'ramp_clients','ramp_tiers','ramp_client_modules','ramp_placements','ramp_placement_steps','ramp_rate_changes','ramp_checkins',
    'ramp_timesheets','ramp_invoices','ramp_invoice_lines','ramp_payouts','ramp_payout_lines','ramp_payees','ramp_client_requests',
    'ramp_launch_plans'] loop
    execute format('grant all on public.%I to ramp_owner', t);
    -- isolation: applies to every role, ramp_owner included (service_role and postgres bypass RLS)
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'ramp_ws_' || t) then
      execute format('create policy %I on public.%I as restrictive for all to public '
                     'using (workspace_id = (select public.ramp_ws())) with check (workspace_id = (select public.ramp_ws()))', 'ramp_ws_' || t, t);
    end if;
    -- RAMP functions see and write everything inside the current workspace
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'ramp_owner_' || t) then
      execute format('create policy %I on public.%I for all to ramp_owner using (true) with check (true)', 'ramp_owner_' || t, t);
    end if;
  end loop;
  for s in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' and c.relname like 'ramp\_%' loop
    execute format('grant usage, select on sequence public.%I to ramp_owner', s);
  end loop;
end $$;

-- ───────────────────────── helpers used by policies (postgres-owned) ─────────────────────────

-- Workspaces the caller may list: active memberships, plus every workspace of an account they own.
create or replace function public.ramp_my_workspace_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.workspace_id from public.ramp_members m where m.auth_user_id = auth.uid() and m.status = 'active'
  union
  select w.id from public.ramp_workspaces w join public.ramp_accounts a on a.id = w.account_id where a.owner_auth_id = auth.uid()
$$;

create or replace function public.ramp_my_account_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select w.account_id from public.ramp_workspaces w where w.id in (select public.ramp_my_workspace_ids())
  union
  select a.id from public.ramp_accounts a where a.owner_auth_id = auth.uid()
$$;

-- Seats in use on an account: distinct emails of active or invited members across its workspaces,
-- leaving out client contacts, support rows and agency-placed assistants.
create or replace function public.ramp_seats_used(p_account uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct m.email)::int from public.ramp_members m join public.ramp_workspaces w on w.id = m.workspace_id
  where w.account_id = p_account and m.status in ('active','invited') and m.level <> 'client' and not m.support and m.source <> 'agency'
$$;

-- Storage: is this folder name a member id in the current workspace?
create or replace function public.ramp_ws_member(p_folder text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_folder is null or p_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists (select 1 from public.ramp_members where id = p_folder::uuid and workspace_id = public.ramp_ws());
end $$;

-- ───────────────────────── RLS for platform tables ─────────────────────────

create or replace function pg_temp.ramp_policy(p_table text, p_name text, p_def text) returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_name) then
    execute format('create policy %I on public.%I %s', p_name, p_table, p_def);
  end if;
end $$;

do $$
begin
  perform pg_temp.ramp_policy('ramp_accounts', 'ramp_accounts_super', 'for all to authenticated using ((select public.ramp_is_super())) with check ((select public.ramp_is_super()))');
  perform pg_temp.ramp_policy('ramp_accounts', 'ramp_accounts_read', 'for select to authenticated using (id in (select public.ramp_my_account_ids()))');
  perform pg_temp.ramp_policy('ramp_accounts', 'ramp_accounts_owner', 'for update to authenticated using (owner_auth_id = (select auth.uid())) with check (owner_auth_id = (select auth.uid()))');
  perform pg_temp.ramp_policy('ramp_workspaces', 'ramp_workspaces_super', 'for all to authenticated using ((select public.ramp_is_super())) with check ((select public.ramp_is_super()))');
  perform pg_temp.ramp_policy('ramp_workspaces', 'ramp_workspaces_read', 'for select to authenticated using (id in (select public.ramp_my_workspace_ids()))');
  perform pg_temp.ramp_policy('ramp_platform', 'ramp_platform_super', 'for all to authenticated using ((select public.ramp_is_super())) with check ((select public.ramp_is_super()))');
  perform pg_temp.ramp_policy('ramp_platform', 'ramp_platform_read', 'for select to authenticated using (true)');
  perform pg_temp.ramp_policy('ramp_super_admins', 'ramp_super_admins_super', 'for all to authenticated using ((select public.ramp_is_super())) with check ((select public.ramp_is_super()))');
  perform pg_temp.ramp_policy('ramp_super_admins', 'ramp_super_admins_self', 'for select to authenticated using (auth_user_id = (select auth.uid()))');
  perform pg_temp.ramp_policy('ramp_account_requests', 'ramp_account_requests_super', 'for all to authenticated using ((select public.ramp_is_super())) with check ((select public.ramp_is_super()))');
  perform pg_temp.ramp_policy('ramp_account_requests', 'ramp_account_requests_own', 'for select to authenticated using (auth_user_id = (select auth.uid()))');
  perform pg_temp.ramp_policy('ramp_user_prefs', 'ramp_user_prefs_super', 'for all to authenticated using ((select public.ramp_is_super())) with check ((select public.ramp_is_super()))');
  perform pg_temp.ramp_policy('ramp_user_prefs', 'ramp_user_prefs_own', 'for select to authenticated using (auth_user_id = (select auth.uid()))');
end $$;

-- Account owners may rename their account; every other column is the platform's.
create or replace function public.ramp_accounts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or current_setting('ramp.bypass', true) = 'on' or public.ramp_is_super() then return new; end if;
  if (to_jsonb(new) - 'name' - 'updated_at') is distinct from (to_jsonb(old) - 'name' - 'updated_at') then
    raise exception 'Only the account name can be changed here.';
  end if;
  return new;
end $$;
create or replace trigger ramp_accounts_guard before update on public.ramp_accounts for each row execute function public.ramp_accounts_guard();

-- ───────────────────────── access helpers (postgres-owned, workspace-explicit) ─────────────────────────

create or replace function public.ramp_me() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.ramp_members
  where auth_user_id = auth.uid() and status = 'active' and workspace_id = public.ramp_ws() limit 1
$$;

-- A super admin without an active row in the current workspace counts as an admin there.
create or replace function public.ramp_my_rank() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select public.ramp_rank(level) from public.ramp_members
      where auth_user_id = auth.uid() and status = 'active' and workspace_id = public.ramp_ws() limit 1),
    case when public.ramp_ws() is not null and public.ramp_is_super() then 2 end,
    99)
$$;

create or replace function public.ramp_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select public.ramp_my_rank() <= 2 $$;

create or replace function public.ramp_can_see(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ramp_members me
    join public.ramp_members m on m.id = p_member and m.workspace_id = me.workspace_id
    where me.auth_user_id = auth.uid() and me.status = 'active' and me.workspace_id = public.ramp_ws()
      and (me.id = m.id
        or (not m.support            -- support rows are hidden from the tenant (their access is in the audit log)
            and (public.ramp_rank(me.level) <= 2
              or (me.level = 'lead' and me.department_id is not null and me.department_id = m.department_id)
              or (me.level in ('lead','mentor') and m.mentor_id = me.id)))))
  or (public.ramp_is_super() and exists (select 1 from public.ramp_members m where m.id = p_member and m.workspace_id = public.ramp_ws()))
$$;

create or replace function public.ramp_can_read_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.ramp_my_rank() <= 6 and exists (
    select 1 from public.ramp_channels c where c.id = p_channel and c.workspace_id = public.ramp_ws()
      and (c.kind <> 'dm' or exists (select 1 from public.ramp_channel_members cm
                                     where cm.channel_id = c.id and cm.member_id = public.ramp_me())))
$$;

create or replace function public.ramp_can_post(p_channel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.ramp_can_read_channel(p_channel)
     and coalesce((select (flags->>'chat')::boolean from public.ramp_org where workspace_id = public.ramp_ws()), true)
     and exists (select 1 from public.ramp_channels c where c.id = p_channel and c.workspace_id = public.ramp_ws()
                   and (not c.read_only or public.ramp_is_admin()))
$$;

-- ───────────────────────── triggers (postgres-owned) ─────────────────────────

-- Owners, support rows, agency-synced rows and seat limits, all judged in the ROW's workspace.
create or replace function public.ramp_members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_super boolean := auth.uid() is not null and public.ramp_is_super();
  v_ws uuid := coalesce(new.workspace_id, old.workspace_id);
  v_acc public.ramp_accounts;
  r int;
begin
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'People can’t be moved between workspaces.';
  end if;
  -- A direct write into another workspace fails RLS anyway; fail first, so the checks below can't reveal anything about it.
  if tg_op <> 'DELETE' and v_uid is not null and not v_super and current_setting('ramp.bypass', true) is distinct from 'on'
     and new.workspace_id is distinct from public.ramp_ws() then
    raise exception 'new row violates row-level security policy for table "ramp_members"' using errcode = '42501';
  end if;

  -- Seat limit: the row starts taking a seat (active or invited, not a client contact, support row or agency assistant).
  if tg_op <> 'DELETE' and not v_super
     and new.status in ('active','invited') and new.level <> 'client' and not new.support and new.source <> 'agency'
     and (tg_op = 'INSERT' or not (old.status in ('active','invited') and old.level <> 'client' and not old.support and old.source <> 'agency')) then
    select a.* into v_acc from public.ramp_accounts a join public.ramp_workspaces w on w.account_id = a.id
    where w.id = new.workspace_id for update of a;
    if v_acc.seat_limit is not null
       and not exists (select 1 from public.ramp_members m join public.ramp_workspaces w on w.id = m.workspace_id
                       where w.account_id = v_acc.id and m.email = new.email and m.id <> new.id
                         and m.status in ('active','invited') and m.level <> 'client' and not m.support and m.source <> 'agency')
       and public.ramp_seats_used(v_acc.id) >= v_acc.seat_limit then
      raise exception 'All % seats on this plan are in use. Ask the account owner for more seats.', v_acc.seat_limit;
    end if;
  end if;

  if v_uid is null or current_setting('ramp.bypass', true) = 'on' then return coalesce(new, old); end if;

  if not v_super and ((tg_op <> 'INSERT' and old.support) or (tg_op <> 'DELETE' and new.support)) then
    raise exception 'Support access is managed by the RAMP platform.';
  end if;
  if not v_super and tg_op <> 'DELETE'
     and (to_jsonb(new)->>'agency_placement_id') is distinct from (case when tg_op = 'UPDATE' then to_jsonb(old)->>'agency_placement_id' end) then
    raise exception 'Agency assistants are managed by the agency.';
  end if;

  r := case when v_super then 1 else coalesce((select public.ramp_rank(level) from public.ramp_members
                                                where auth_user_id = v_uid and status = 'active' and workspace_id = v_ws limit 1), 99) end;
  if tg_op = 'DELETE' then
    if old.level = 'owner' and r <> 1 then raise exception 'Only an owner can remove an owner.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.level = 'owner' and r <> 1 then raise exception 'Only an owner can change an owner.'; end if;
  if new.level = 'owner' and r <> 1 then raise exception 'Only an owner can make someone an owner.'; end if;
  if tg_op = 'UPDATE' and old.level = 'owner' and new.level <> 'owner'
     and (select count(*) from public.ramp_members where workspace_id = v_ws and level = 'owner' and status = 'active') <= 1 then
    raise exception 'RAMP needs at least one owner.';
  end if;
  return new;
end $$;

-- Audit rows land in the changed row's workspace, attributed to the caller's member row there.
create or replace function public.ramp_audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_detail text; v_row jsonb; v_ws uuid;
begin
  if current_setting('ramp.bypass', true) = 'on' then return coalesce(new, old); end if;
  v_row := to_jsonb(coalesce(new, old));
  v_ws := (v_row->>'workspace_id')::uuid;
  select id into v_me from public.ramp_members
  where auth_user_id = auth.uid() and status = 'active' and workspace_id = v_ws limit 1;
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
      insert into public.ramp_audit(workspace_id, actor_id, action, member_id, detail, ip, user_agent)
      values (v_ws, v_me, 'updated person', new.id, v_detail, public.ramp_req_ip(), public.ramp_req_ua());
    elsif tg_op = 'DELETE' then
      insert into public.ramp_audit(workspace_id, actor_id, action, detail, ip, user_agent)
      values (v_ws, v_me, 'removed person', old.email, public.ramp_req_ip(), public.ramp_req_ua());
    end if;
    return coalesce(new, old);
  end if;
  insert into public.ramp_audit(workspace_id, actor_id, action, detail, ip, user_agent)
  values (v_ws, v_me,
          case tg_op when 'INSERT' then 'created ' when 'UPDATE' then 'updated ' else 'deleted ' end
            || replace(replace(tg_table_name, 'ramp_', ''), '_', ' '),
          coalesce(v_row->>'title', v_row->>'name', ''),
          public.ramp_req_ip(), public.ramp_req_ua());
  return coalesce(new, old);
end $$;

-- ───────────────────────── sign-in, access requests, brand (postgres-owned) ─────────────────────────

create or replace function public.ramp_public_brand() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('name', brand_name, 'color', brand_color) from public.ramp_platform where id),
                  jsonb_build_object('name', 'RAMP', 'color', '#4338CA'))
$$;

-- "Ask for access" goes to the caller's current workspace, or to the agency workspace for someone with none.
create or replace function public.ramp_request_access(p_name text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_ws uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  v_ws := coalesce(public.ramp_ws(), (select agency_workspace_id from public.ramp_platform where id));
  if v_ws is null then raise exception 'RAMP isn’t set up yet.'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  insert into public.ramp_access_requests(workspace_id, auth_user_id, email, name, note)
  values (v_ws, auth.uid(), v_email, left(coalesce(p_name, ''), 120), left(coalesce(p_note, ''), 1000))
  on conflict (workspace_id, auth_user_id) do update set name = excluded.name, note = excluded.note, status = 'open', created_at = now();
end $$;

-- Hiring applicants and staff records come from MKC's other apps, so they're offered only in the agency workspace.
-- Access requests are offered in every workspace.
create or replace function public.ramp_potential_staff()
returns table(source text, ref text, name text, email text, detail text, at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_ws uuid := public.ramp_ws(); v_agency boolean;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can see this.'; end if;
  v_agency := v_ws is not distinct from (select agency_workspace_id from public.ramp_platform where id);
  return query
    select 'hiring'::text, a.id::text, a.name, lower(a.email), j.title || ' · ' || a.stage, a.submitted_at
    from public.hiring_applications a join public.hiring_jobs j on j.id = a.job_id
    where v_agency and not exists (select 1 from public.ramp_members m where m.workspace_id = v_ws and m.email = lower(a.email))
    union all
    select 'staff'::text, p.id::text, p.full_name, lower(p.email),
           'Staff record' || coalesce(' · ' || (select string_agg(distinct ta.tool || ' ' || ta.role, ', ') from core.tool_access ta where ta.person_id = p.id), ''),
           p.created_at
    from core.people p
    where v_agency and p.active and not exists (select 1 from public.ramp_members m where m.workspace_id = v_ws and m.email = lower(p.email))
    union all
    select 'request'::text, r.id::text, r.name, r.email, 'Asked for access' || case when r.note <> '' then ': ' || r.note else '' end, r.created_at
    from public.ramp_access_requests r
    where r.workspace_id = v_ws and r.status = 'open'
      and not exists (select 1 from public.ramp_members m where m.workspace_id = v_ws and m.email = r.email)
    order by 6 desc;
end $$;

-- A super admin entering a workspace gets a hidden support member row (level admin) there. Internal only.
create or replace function public.ramp_support_ensure(p_ws uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; m public.ramp_members; v_id uuid;
begin
  if v_uid is null or not public.ramp_is_super() or p_ws is null then return null; end if;
  select * into m from public.ramp_members where workspace_id = p_ws and auth_user_id = v_uid;
  perform set_config('ramp.bypass', 'on', true);
  if m.id is not null then
    if m.support and m.status <> 'active' then update public.ramp_members set status = 'active' where id = m.id; end if;
    return m.id;
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then return null; end if;
  update public.ramp_members set auth_user_id = v_uid, joined_at = coalesce(joined_at, now()),
         status = case when status = 'invited' then 'active' else status end
  where workspace_id = p_ws and email = v_email and auth_user_id is null returning id into v_id;
  if v_id is not null then return v_id; end if;
  insert into public.ramp_members(workspace_id, email, full_name, level, status, source, support, auth_user_id, joined_at)
  values (p_ws, v_email, 'RAMP Support', 'admin', 'active', 'support', true, v_uid, now())
  returning id into v_id;
  insert into public.ramp_audit(workspace_id, actor_id, action, member_id, detail, ip, user_agent)
  values (p_ws, v_id, 'support access', v_id, 'RAMP support was given access to this workspace', public.ramp_req_ip(), public.ramp_req_ua());
  return v_id;
end $$;

-- Workspaces for the switcher. Super admins see every workspace.
create or replace function public.ramp_my_workspaces()
returns table(id uuid, name text, slug text, status text, setup_done boolean, account_id uuid, account_name text,
              plan text, account_status text, trial_ends date, level text, member_status text, support boolean,
              is_owner boolean, is_current boolean)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.slug, w.status, w.setup_done, a.id, a.name, a.plan, a.status, a.trial_ends,
         m.level, m.status, coalesce(m.support, false), coalesce(a.owner_auth_id = auth.uid(), false),
         w.id is not distinct from public.ramp_ws()
  from public.ramp_workspaces w
  join public.ramp_accounts a on a.id = w.account_id
  left join public.ramp_members m on m.workspace_id = w.id and m.auth_user_id = auth.uid()
  where auth.uid() is not null and (m.status = 'active' or public.ramp_is_super())
  order by a.name, w.name
$$;

-- Called once when the app opens. Claims invitations in every workspace, picks the workspace, checks the account and
-- the member, records the sign-in. States: signed_out | no_access | account_pending | account_paused | account_closed |
-- trial_ended | inactive | expired | ok.
create or replace function public.ramp_session_start() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_super boolean;
  v_pref uuid;
  v_ws uuid;
  v_req jsonb;
  v_list jsonb;
  v_state text := 'ok';
  v_rec boolean;
  m public.ramp_members;
  w public.ramp_workspaces;
  a public.ramp_accounts;
  r record;
  v_ip text := public.ramp_req_ip();
  v_ua text := public.ramp_req_ua();
begin
  if v_uid is null then return jsonb_build_object('state', 'signed_out'); end if;
  perform set_config('ramp.bypass', 'on', true);
  select lower(email) into v_email from auth.users where id = v_uid;
  v_super := public.ramp_is_super();

  -- 1. claim every invitation for this email, in every workspace
  for r in select mm.id, mm.workspace_id from public.ramp_members mm
           where mm.email = v_email and mm.auth_user_id is null
             and not exists (select 1 from public.ramp_members x where x.workspace_id = mm.workspace_id and x.auth_user_id = v_uid)
  loop
    update public.ramp_members set auth_user_id = v_uid, joined_at = coalesce(joined_at, now()),
           status = case when status = 'invited' then 'active' else status end
    where id = r.id;
    insert into public.ramp_audit(workspace_id, actor_id, action, member_id, detail, ip, user_agent)
    values (r.workspace_id, r.id, 'joined', r.id, 'Created a login and joined RAMP', v_ip, v_ua);
  end loop;

  select to_jsonb(q) into v_req from (
    select id, company, name, status, decision_note, created_at from public.ramp_account_requests where auth_user_id = v_uid) q;

  -- 2. nowhere to go
  if not v_super and not exists (select 1 from public.ramp_members where auth_user_id = v_uid) then
    if v_req->>'status' = 'pending' then
      return jsonb_build_object('state', 'account_pending', 'email', v_email, 'request', v_req, 'super', false, 'workspaces', '[]'::jsonb);
    end if;
    return jsonb_build_object('state', 'no_access', 'email', v_email, 'request', v_req, 'super', false, 'workspaces', '[]'::jsonb,
      'requested', exists (select 1 from public.ramp_access_requests where auth_user_id = v_uid));
  end if;

  -- 3. pick the workspace: preference, then first active membership, then any membership
  select p.workspace_id into v_pref from public.ramp_user_prefs p where p.auth_user_id = v_uid;
  if v_pref is not null and (v_super or exists (select 1 from public.ramp_members
                                                where workspace_id = v_pref and auth_user_id = v_uid and status = 'active')) then
    v_ws := v_pref;
  else
    select workspace_id into v_ws from public.ramp_members where auth_user_id = v_uid and status = 'active' order by created_at, id limit 1;
    if v_ws is null then
      select workspace_id into v_ws from public.ramp_members where auth_user_id = v_uid order by created_at, id limit 1;
    end if;
  end if;
  if v_super and v_ws is not null then perform public.ramp_support_ensure(v_ws); end if;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_list from public.ramp_my_workspaces() x;
  if v_ws is null then   -- a super admin with no workspace yet: the console
    return jsonb_build_object('state', 'ok', 'email', v_email, 'super', v_super, 'workspace_id', null, 'member_id', null,
                              'workspaces', v_list, 'request', v_req);
  end if;
  select * into w from public.ramp_workspaces where id = v_ws;
  select * into a from public.ramp_accounts where id = w.account_id;
  select * into m from public.ramp_members where workspace_id = v_ws and auth_user_id = v_uid;

  -- 4. account (super admins always get in)
  if not v_super then
    v_state := case
      when a.status = 'closed' or w.status = 'closed' then 'account_closed'
      when a.status = 'pending' then 'account_pending'
      when a.status = 'paused' or w.status = 'paused' then 'account_paused'
      when a.plan = 'trial' and a.trial_ends is not null and a.trial_ends < current_date then 'trial_ended'
      else 'ok' end;
  end if;
  -- 5. member
  if v_state = 'ok' and not v_super then
    if m.status = 'inactive' then v_state := 'inactive';
    elsif m.level = 'guest' and m.access_until is not null and m.access_until < current_date then v_state := 'expired';
    end if;
  end if;
  -- 6. record the sign-in in that workspace
  if v_state = 'ok' and m.id is not null and m.status = 'active' then
    v_rec := coalesce((select (flags->>'record_ip')::boolean from public.ramp_org where workspace_id = v_ws), true);
    if not exists (select 1 from public.ramp_signins where member_id = m.id and at > now() - interval '30 minutes'
                    and coalesce(ip, '') = coalesce(case when v_rec then v_ip end, '')) then
      insert into public.ramp_signins(workspace_id, member_id, ip, user_agent)
      values (v_ws, m.id, case when v_rec then v_ip end, case when v_rec then v_ua end);
    end if;
    update public.ramp_members set last_seen_at = now() where id = m.id;
  end if;

  return jsonb_build_object(
    'state', v_state, 'email', v_email, 'super', v_super, 'request', v_req, 'workspaces', v_list,
    'workspace_id', v_ws,
    'member_id', case when v_state = 'ok' and m.status = 'active' then m.id end,
    'support', coalesce(m.support, false),
    'workspace', jsonb_build_object('id', w.id, 'name', w.name, 'slug', w.slug, 'status', w.status, 'setup_done', w.setup_done),
    'account', jsonb_build_object('id', a.id, 'name', a.name, 'plan', a.plan, 'status', a.status, 'trial_ends', a.trial_ends,
                                  'seat_limit', a.seat_limit, 'is_owner', coalesce(a.owner_auth_id = v_uid, false)));
end $$;

-- Workspace switcher: active members only; super admins anywhere (they get a support row).
create or replace function public.ramp_set_workspace(p_ws uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_super boolean := public.ramp_is_super();
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.ramp_workspaces where id = p_ws)
     or (not v_super and not exists (select 1 from public.ramp_members where workspace_id = p_ws and auth_user_id = v_uid and status = 'active')) then
    raise exception 'You don’t have access to that workspace.';
  end if;
  if v_super then perform public.ramp_support_ensure(p_ws); end if;
  insert into public.ramp_user_prefs(auth_user_id, workspace_id, updated_at) values (v_uid, p_ws, now())
  on conflict (auth_user_id) do update set workspace_id = excluded.workspace_id, updated_at = now();
  return p_ws;
end $$;

-- Seats on the current workspace's account.
create or replace function public.ramp_seats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('used', public.ramp_seats_used(a.id), 'limit', a.seat_limit, 'plan', a.plan)
  from public.ramp_workspaces w join public.ramp_accounts a on a.id = w.account_id
  where w.id = public.ramp_ws() and public.ramp_my_rank() <= 7
$$;

-- ───────────────────────── sign-up and accounts (postgres-owned) ─────────────────────────

create or replace function public.ramp_account_request(p_company text, p_name text, p_phone text, p_team_size text, p_note text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; v jsonb;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if btrim(coalesce(p_company, '')) = '' then raise exception 'Enter your company name.'; end if;
  if exists (select 1 from public.ramp_account_requests where auth_user_id = v_uid and status = 'approved') then
    raise exception 'Your account has already been approved. Sign in again to open it.';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  insert into public.ramp_account_requests(auth_user_id, email, company, name, phone, team_size, note)
  values (v_uid, coalesce(v_email, ''), left(btrim(p_company), 120), left(btrim(coalesce(p_name, '')), 120), left(btrim(coalesce(p_phone, '')), 40),
          left(btrim(coalesce(p_team_size, '')), 40), left(coalesce(p_note, ''), 2000))
  on conflict (auth_user_id) do update set company = excluded.company, name = excluded.name, phone = excluded.phone,
    team_size = excluded.team_size, note = excluded.note, status = 'pending', decision_note = '', decided_at = null,
    decided_by = null, created_at = now();
  select to_jsonb(r) - 'decided_by' into v from public.ramp_account_requests r where r.auth_user_id = v_uid;
  return v;
end $$;

-- Starter content for a new workspace, copied from the library workspace: modules (as they are), document templates
-- (drafts stay drafts), welcome texts and flow, the agency checklist and Day 1 agenda, the three default channels and one
-- job role, "Team Member". Never people, records, tiers, clients or anything agency-related. Internal only.
create or replace function public.ramp_copy_library(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_lib uuid := (select library_workspace_id from public.ramp_platform where id);
  v_name text := (select name from public.ramp_workspaces where id = p_target);
  o public.ramp_org;
  v_role uuid; v_lib_role uuid; v_map jsonb;
begin
  if v_name is null then raise exception 'Workspace not found.'; end if;
  perform set_config('ramp.bypass', 'on', true);
  insert into public.ramp_org(workspace_id, id, name) values (p_target, true, left(v_name, 80)) on conflict (workspace_id) do nothing;
  if v_lib is not null and v_lib <> p_target then
    select * into o from public.ramp_org where workspace_id = v_lib;
    if o.workspace_id is not null then
      update public.ramp_org t set brand_color = o.brand_color, timezone = o.timezone, welcome_headline = o.welcome_headline,
        welcome_message = o.welcome_message, flow = o.flow, flags = o.flags || '{"agency": false}'::jsonb,
        agency = t.agency
          || case when o.agency ? 'checklist' then jsonb_build_object('checklist', o.agency->'checklist') else '{}'::jsonb end
          || case when o.agency ? 'launch_agenda' then jsonb_build_object('launch_agenda', o.agency->'launch_agenda') else '{}'::jsonb end
      where t.workspace_id = p_target;
    end if;
    select id into v_lib_role from public.ramp_job_roles where workspace_id = v_lib and title = 'Team Member' order by created_at limit 1;
  end if;

  select id into v_role from public.ramp_job_roles where workspace_id = p_target and title = 'Team Member' limit 1;
  if v_role is null then
    insert into public.ramp_job_roles(workspace_id, title, level, description)
    select p_target, 'Team Member', coalesce(r.level, 'employee'), coalesce(r.description, 'General role for new staff')
    from (select 1) one left join public.ramp_job_roles r on r.id = v_lib_role
    returning id into v_role;
  end if;

  if v_lib is not null and v_lib <> p_target and not exists (select 1 from public.ramp_modules where workspace_id = p_target) then
    select coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb) into v_map
    from public.ramp_modules where workspace_id = v_lib;
    insert into public.ramp_modules(id, workspace_id, title, track, summary, minutes, objectives, blocks, pass_score, mentor_review,
                                    due_days, required, guest_visible, builtin, status, sort)
    select (v_map->>m.id::text)::uuid, p_target, m.title, m.track, m.summary, m.minutes, m.objectives, m.blocks, m.pass_score,
           m.mentor_review, m.due_days, m.required, m.guest_visible, m.builtin, m.status, m.sort
    from public.ramp_modules m where m.workspace_id = v_lib;
    if v_lib_role is not null then
      insert into public.ramp_role_modules(workspace_id, job_role_id, module_id, sort)
      select p_target, v_role, (v_map->>rm.module_id::text)::uuid, rm.sort
      from public.ramp_role_modules rm where rm.workspace_id = v_lib and rm.job_role_id = v_lib_role
      on conflict do nothing;
    end if;
  end if;

  if v_lib is not null and v_lib <> p_target and not exists (select 1 from public.ramp_templates where workspace_id = p_target) then
    insert into public.ramp_templates(workspace_id, title, kind, stage, audience, job_role_id, description, fields, legal_review, status, version, sort)
    select p_target, t.title, t.kind, t.stage, t.audience, case when t.job_role_id = v_lib_role then v_role end,
           t.description, t.fields, t.legal_review, t.status, 1, t.sort
    from public.ramp_templates t where t.workspace_id = v_lib;
  end if;

  insert into public.ramp_channels(workspace_id, slug, name, description, kind, read_only) values
    (p_target, 'announcements', 'announcements', 'Company news from admins', 'company', true),
    (p_target, 'general', 'general', 'Anything for everyone', 'company', false),
    (p_target, 'new-hires', 'new-hires', 'New hires and their mentors', 'cohort', false)
  on conflict (workspace_id, slug) do nothing;
end $$;

-- New workspace in an account: library copy, the given person as owner, optionally their current workspace. Internal only.
create or replace function public.ramp_workspace_create(p_account uuid, p_name text, p_owner uuid, p_owner_name text,
                                                        p_owner_phone text, p_set_pref boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_base text; v_slug text; v_ws uuid; v_email text; v_mem uuid; v_full text;
begin
  if v_name = '' then raise exception 'Enter a name for the organization.'; end if;
  v_base := trim(both '-' from left(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), 40));
  if length(v_base) < 2 then v_base := 'workspace'; end if;
  v_slug := v_base;
  while exists (select 1 from public.ramp_workspaces where slug = v_slug) loop
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 5);
  end loop;
  insert into public.ramp_workspaces(account_id, name, slug, created_by) values (p_account, v_name, v_slug, auth.uid()) returning id into v_ws;
  perform public.ramp_copy_library(v_ws);
  if p_owner is not null then
    select lower(email) into v_email from auth.users where id = p_owner;
    if v_email is null then raise exception 'The account owner has no email address.'; end if;
    v_full := coalesce(nullif(btrim(p_owner_name), ''),
                       (select m.full_name from public.ramp_members m where m.auth_user_id = p_owner and m.full_name <> '' and not m.support
                        order by m.created_at desc limit 1), '');
    perform set_config('ramp.bypass', 'on', true);
    insert into public.ramp_members(workspace_id, email, full_name, phone, level, status, source, auth_user_id, joined_at)
    values (v_ws, v_email, left(v_full, 120), left(coalesce(p_owner_phone, ''), 40), 'owner', 'active', 'signup', p_owner, now())
    returning id into v_mem;
    insert into public.ramp_audit(workspace_id, actor_id, action, member_id, detail)
    values (v_ws, v_mem, 'created workspace', v_mem, v_name);
    if p_set_pref then
      insert into public.ramp_user_prefs(auth_user_id, workspace_id, updated_at) values (p_owner, v_ws, now())
      on conflict (auth_user_id) do update set workspace_id = excluded.workspace_id, updated_at = now();
    end if;
  end if;
  return v_ws;
end $$;

-- ───────────────────────── super admin console (postgres-owned) ─────────────────────────

create or replace function public.ramp_super_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ramp_is_super() then raise exception 'Only the platform admin can see this.'; end if;
  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'status', a.status, 'pause_reason', a.pause_reason, 'plan', a.plan, 'trial_ends', a.trial_ends,
        'seat_limit', a.seat_limit, 'notes', a.notes, 'created_at', a.created_at, 'approved_at', a.approved_at,
        'owner_auth_id', a.owner_auth_id, 'owner_email', (select u.email from auth.users u where u.id = a.owner_auth_id),
        'subscription_status', a.subscription_status, 'current_period_end', a.current_period_end, 'stripe_customer_id', a.stripe_customer_id,
        'seats_used', public.ramp_seats_used(a.id),
        'workspaces', (select count(*) from public.ramp_workspaces w where w.account_id = a.id),
        'members', (select count(*) from public.ramp_members m join public.ramp_workspaces w on w.id = m.workspace_id
                    where w.account_id = a.id and m.status = 'active' and not m.support and m.level <> 'client'),
        'placements', (select count(*) from public.ramp_placements p join public.ramp_workspaces w on w.id = p.workspace_id
                       where w.account_id = a.id and p.status <> 'ended'),
        'workspace_list', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'slug', w.slug, 'status', w.status,
              'setup_done', w.setup_done, 'created_at', w.created_at,
              'members', (select count(*) from public.ramp_members m where m.workspace_id = w.id and m.status = 'active'
                          and not m.support and m.level <> 'client')) order by w.created_at)
            from public.ramp_workspaces w where w.account_id = a.id), '[]'::jsonb))
        order by a.created_at) from public.ramp_accounts a), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by (r.status = 'pending') desc, r.created_at desc)
                          from public.ramp_account_requests r), '[]'::jsonb),
    'platform', (select to_jsonb(p) from public.ramp_platform p where p.id));
end $$;

-- p_seat_limit: null = the platform default, 0 = unlimited.
create or replace function public.ramp_super_approve(p_request uuid, p_plan text, p_trial_days int, p_seat_limit int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.ramp_account_requests; pf public.ramp_platform; v_acc uuid; v_ws uuid; v_plan text := coalesce(p_plan, 'trial');
begin
  if not public.ramp_is_super() then raise exception 'Only the platform admin can approve accounts.'; end if;
  if v_plan not in ('comp','trial','paid') then raise exception 'Pick a plan: comp, trial or paid.'; end if;
  select * into r from public.ramp_account_requests where id = p_request for update;
  if r.id is null then raise exception 'Request not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been handled.'; end if;
  select * into pf from public.ramp_platform where id;
  perform set_config('ramp.bypass', 'on', true);
  insert into public.ramp_accounts(name, owner_auth_id, status, plan, trial_ends, seat_limit, approved_at, approved_by)
  values (r.company, r.auth_user_id, 'active', v_plan,
          case when v_plan = 'trial' then current_date + coalesce(p_trial_days, pf.default_trial_days, 30) end,
          case when p_seat_limit is null then pf.default_seat_limit when p_seat_limit <= 0 then null else p_seat_limit end,
          now(), auth.uid())
  returning id into v_acc;
  v_ws := public.ramp_workspace_create(v_acc, r.company, r.auth_user_id, r.name, r.phone, true);
  update public.ramp_account_requests set status = 'approved', account_id = v_acc, decided_at = now(), decided_by = auth.uid()
  where id = r.id;
  return jsonb_build_object('account_id', v_acc, 'workspace_id', v_ws);
end $$;

create or replace function public.ramp_super_decline(p_request uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ramp_is_super() then raise exception 'Only the platform admin can decline requests.'; end if;
  update public.ramp_account_requests set status = 'declined', decision_note = left(coalesce(p_note, ''), 2000),
         decided_at = now(), decided_by = auth.uid()
  where id = p_request and status = 'pending';
  if not found then raise exception 'Request not found or already handled.'; end if;
end $$;

-- null leaves a field as it is; p_seat_limit 0 = unlimited.
create or replace function public.ramp_super_update_account(p_account uuid, p_plan text, p_status text, p_trial_ends date,
                                                            p_seat_limit int, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.ramp_accounts;
begin
  if not public.ramp_is_super() then raise exception 'Only the platform admin can change accounts.'; end if;
  select * into a from public.ramp_accounts where id = p_account for update;
  if a.id is null then raise exception 'Account not found.'; end if;
  if p_plan is not null and p_plan not in ('comp','trial','paid') then raise exception 'Unknown plan.'; end if;
  if p_status is not null and p_status not in ('pending','active','paused','closed') then raise exception 'Unknown status.'; end if;
  update public.ramp_accounts set
    plan = coalesce(p_plan, plan),
    status = coalesce(p_status, status),
    pause_reason = case when p_status is null then pause_reason when p_status = 'paused' then 'admin' else null end,
    trial_ends = case when p_trial_ends is not null then p_trial_ends
                      when coalesce(p_plan, plan) = 'trial' and trial_ends is null
                        then current_date + coalesce((select default_trial_days from public.ramp_platform where id), 30)
                      else trial_ends end,
    seat_limit = case when p_seat_limit is null then seat_limit when p_seat_limit <= 0 then null else p_seat_limit end,
    notes = coalesce(left(p_notes, 4000), notes),
    approved_at = case when coalesce(p_status, status) = 'active' then coalesce(approved_at, now()) else approved_at end,
    approved_by = case when coalesce(p_status, status) = 'active' and approved_at is null then auth.uid() else approved_by end
  where id = a.id;
end $$;

-- null leaves a field as it is; p_default_seat_limit / p_workspace_limit 0 = unlimited.
create or replace function public.ramp_super_platform_save(p_brand_name text, p_brand_color text, p_default_trial_days int,
  p_default_seat_limit int, p_workspace_limit int, p_stripe_prices jsonb, p_library_workspace uuid, p_agency_workspace uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb; e jsonb;
begin
  if not public.ramp_is_super() then raise exception 'Only the platform admin can change platform settings.'; end if;
  if p_stripe_prices is not null then
    if jsonb_typeof(p_stripe_prices) <> 'array' then raise exception 'Prices must be a list.'; end if;
    for e in select value from jsonb_array_elements(p_stripe_prices) loop
      if jsonb_typeof(e) <> 'object' or coalesce(e->>'id', '') = '' or coalesce(e->>'label', '') = ''
         or coalesce(jsonb_typeof(e->'amount'), '') <> 'number' or coalesce(e->>'interval', '') not in ('month','year')
         or (e ? 'seats' and jsonb_typeof(e->'seats') not in ('number','null')) then
        raise exception 'Each price needs id, label, amount (number), interval (month or year) and optional seats.';
      end if;
    end loop;
  end if;
  if p_library_workspace is not null and not exists (select 1 from public.ramp_workspaces where id = p_library_workspace) then
    raise exception 'Library workspace not found.';
  end if;
  if p_agency_workspace is not null and not exists (select 1 from public.ramp_workspaces where id = p_agency_workspace) then
    raise exception 'Agency workspace not found.';
  end if;
  update public.ramp_platform set
    brand_name = coalesce(nullif(btrim(p_brand_name), ''), brand_name),
    brand_color = coalesce(p_brand_color, brand_color),
    default_trial_days = coalesce(p_default_trial_days, default_trial_days),
    default_seat_limit = case when p_default_seat_limit is null then default_seat_limit when p_default_seat_limit <= 0 then null else p_default_seat_limit end,
    workspace_limit = case when p_workspace_limit is null then workspace_limit when p_workspace_limit <= 0 then null else p_workspace_limit end,
    stripe_prices = coalesce(p_stripe_prices, stripe_prices),
    library_workspace_id = coalesce(p_library_workspace, library_workspace_id),
    agency_workspace_id = coalesce(p_agency_workspace, agency_workspace_id)
  where id;
  select to_jsonb(p) into v from public.ramp_platform p where p.id;
  return v;
end $$;

-- An account owner (or a super admin, for the current workspace's account) adds an organization.
create or replace function public.ramp_account_add_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_super boolean := public.ramp_is_super(); a public.ramp_accounts; v_lim int;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select x.* into a from public.ramp_accounts x join public.ramp_workspaces w on w.account_id = x.id where w.id = public.ramp_ws();
  if not v_super and (a.id is null or a.owner_auth_id is distinct from v_uid) then
    select * into a from public.ramp_accounts where owner_auth_id = v_uid order by created_at limit 1;
  end if;
  if a.id is null or (not v_super and a.owner_auth_id is distinct from v_uid) then
    raise exception 'Only the account owner can add an organization.';
  end if;
  if not v_super then
    if a.status <> 'active' or (a.plan = 'trial' and a.trial_ends < current_date) then
      raise exception 'This account isn’t active, so it can’t add organizations.';
    end if;
    v_lim := (select workspace_limit from public.ramp_platform where id);
    if v_lim is not null and (select count(*) from public.ramp_workspaces where account_id = a.id and status <> 'closed') >= v_lim then
      raise exception 'This account already has % organizations, the most a plan allows.', v_lim;
    end if;
  end if;
  return public.ramp_workspace_create(a.id, p_name, a.owner_auth_id, null, null, a.owner_auth_id = v_uid);
end $$;

create or replace function public.ramp_workspace_setup_done() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can finish setup.'; end if;
  update public.ramp_workspaces set setup_done = true where id = public.ramp_ws();
end $$;

-- ───────────────────────── RAMP functions that become ramp_owner's (re-defined here) ─────────────────────────
-- Written with explicit workspace filters as well, so they're safe whoever owns them.

create or replace function public.ramp_directory()
returns table(id uuid, full_name text, preferred_name text, level text, job_title text, department text, mentor_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.id, m.full_name, m.preferred_name, m.level, coalesce(j.title, ''), coalesce(d.name, ''), m.mentor_id
  from public.ramp_members m
  left join public.ramp_job_roles j on j.id = m.job_role_id
  left join public.ramp_departments d on d.id = m.department_id
  where m.workspace_id = public.ramp_ws() and m.status = 'active' and m.level <> 'client' and not m.support
    and (public.ramp_my_rank() <= 6 or m.id = public.ramp_me())
  order by m.full_name
$$;

create or replace function public.ramp_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_id uuid; v_slug text;
begin
  if v_me is null or public.ramp_my_rank() > 6 then raise exception 'Chat isn’t available for your access level.'; end if;
  if p_other = v_me or not exists (select 1 from public.ramp_members where id = p_other and workspace_id = public.ramp_ws()
                                     and status = 'active' and level not in ('guest','client') and not support) then
    raise exception 'You can’t message that person.';
  end if;
  v_slug := 'dm-' || least(v_me::text, p_other::text) || '-' || greatest(v_me::text, p_other::text);
  select id into v_id from public.ramp_channels where slug = v_slug and workspace_id = public.ramp_ws();
  if v_id is null then
    insert into public.ramp_channels(slug, name, kind) values (v_slug, 'Direct message', 'dm') returning id into v_id;
    insert into public.ramp_channel_members(channel_id, member_id) values (v_id, v_me), (v_id, p_other);
  end if;
  return v_id;
end $$;

-- Coach or admin of a placement in the current workspace (an admin of another workspace no longer qualifies).
create or replace function public.ramp_is_coach(p_placement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ramp_placements p
    where p.id = p_placement and p.workspace_id = public.ramp_ws()
      and (public.ramp_is_admin()
           or (public.ramp_my_rank() <= 4
               and (p.coach_id = public.ramp_me()
                    or exists (select 1 from public.ramp_members m where m.id = p.member_id and m.mentor_id = public.ramp_me())))))
$$;

-- Payout details: the person must be in the current workspace (checked first, so a foreign id can't probe anything).
create or replace function public.ramp_payee_save(p_member uuid, p_method text, p_account_name text, p_email text,
  p_wise_recipient_id text, p_target_currency text, p_bank jsonb, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m uuid := coalesce(p_member, public.ramp_me()); v_key text;
begin
  if v_m is null then raise exception 'Not signed in to RAMP.'; end if;
  if v_m <> coalesce(public.ramp_me(), '00000000-0000-0000-0000-000000000000'::uuid) and not public.ramp_is_admin() then
    raise exception 'You can’t change these payout details.';
  end if;
  if not exists (select 1 from public.ramp_members where id = v_m and workspace_id = public.ramp_ws()) then
    raise exception 'Person not found.';
  end if;
  if p_method not in ('wise_recipient','wise_email','bank','other') then raise exception 'Pick how you want to be paid.'; end if;
  if p_method = 'wise_email' and position('@' in coalesce(p_email, '')) < 2 then raise exception 'Enter the email for your Wise account.'; end if;
  if p_method = 'wise_recipient' and btrim(coalesce(p_wise_recipient_id, '')) = '' then raise exception 'Enter the Wise recipient ID.'; end if;
  if p_bank is not null and p_bank <> '{}'::jsonb then
    v_key := public.ramp_key();
    if v_key is null then raise exception 'Encryption key missing. Ask an owner to check RAMP setup.'; end if;
  end if;
  insert into public.ramp_payees(member_id, method, account_name, email, wise_recipient_id, target_currency, bank_details, notes, updated_at)
  values (v_m, p_method, left(btrim(coalesce(p_account_name, '')), 120), lower(btrim(coalesce(p_email, ''))),
          left(btrim(coalesce(p_wise_recipient_id, '')), 60), upper(left(btrim(coalesce(nullif(p_target_currency, ''), 'PHP')), 3)),
          case when p_bank is not null and p_bank <> '{}'::jsonb then extensions.pgp_sym_encrypt(p_bank::text, v_key) end,
          left(coalesce(p_notes, ''), 1000), now())
  on conflict (member_id) do update set method = excluded.method, account_name = excluded.account_name, email = excluded.email,
    wise_recipient_id = excluded.wise_recipient_id, target_currency = excluded.target_currency, notes = excluded.notes,
    bank_details = case when p_bank is null then public.ramp_payees.bank_details
                        when p_bank = '{}'::jsonb then null else excluded.bank_details end,
    updated_at = now();
  perform public.ramp_audit_add('updated payout details', v_m, p_method);
end $$;

-- Role on a placement in the current workspace (008 adds the cross-workspace client branch).
create or replace function public.ramp_launch_role(p_placement uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.ramp_placements p where p.id = p_placement and p.workspace_id = public.ramp_ws()) then null
    when public.ramp_is_admin() then 'admin'
    when public.ramp_is_coach(p_placement) then 'coach'
    when exists (select 1 from public.ramp_placements p where p.id = p_placement and p.client_id = public.ramp_my_client()) then 'client'
    when exists (select 1 from public.ramp_placements p where p.id = p_placement and p.member_id = public.ramp_me()) then 'va'
  end
$$;

-- ───────────────────────── Stripe (agency invoices): service role only, postgres-owned ─────────────────────────
-- Keyed by invoice or Stripe id, so they pin ramp.ws to the invoice's workspace for the functions they call,
-- write audit rows into that workspace explicitly, and restore ramp.ws before returning.

create or replace function public.ramp_invoice_stripe_sent(p_invoice uuid, p_stripe_id text, p_url text, p_pdf text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_i public.ramp_invoices; v_net int; v_prev text := current_setting('ramp.ws', true);
begin
  select * into v_i from public.ramp_invoices where id = p_invoice;
  if v_i.id is null then return; end if;
  perform set_config('ramp.ws', v_i.workspace_id::text, true);
  perform set_config('ramp.bypass', 'on', true);
  select c.net_days into v_net from public.ramp_clients c where c.id = v_i.client_id and c.workspace_id = v_i.workspace_id;
  update public.ramp_invoices set stripe_invoice_id = p_stripe_id, stripe_url = p_url, stripe_pdf = p_pdf, sent_at = now(),
    status = case when status = 'draft' then 'open' else status end,
    issue_date = coalesce(issue_date, current_date), due_date = coalesce(due_date, current_date + coalesce(v_net, 7))
  where id = v_i.id;
  perform set_config('ramp.ws', coalesce(v_prev, ''), true);
end $$;

create or replace function public.ramp_invoice_stripe_event(p_stripe_id text, p_event text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_i public.ramp_invoices; v_prev text := current_setting('ramp.ws', true);
begin
  select * into v_i from public.ramp_invoices where stripe_invoice_id = p_stripe_id;
  if v_i.id is null then return 'unknown invoice'; end if;
  perform set_config('ramp.ws', v_i.workspace_id::text, true);
  perform set_config('ramp.bypass', 'on', true);
  if p_event = 'invoice.paid' and v_i.status <> 'paid' then
    update public.ramp_invoices set status = 'paid', paid_at = now(), paid_note = 'Paid through Stripe' where id = v_i.id;
    update public.ramp_placements set setup_fee_status = 'paid'
    where workspace_id = v_i.workspace_id
      and id in (select placement_id from public.ramp_invoice_lines where invoice_id = v_i.id and kind = 'setup_fee');
    insert into public.ramp_audit(workspace_id, action, detail) values (v_i.workspace_id, 'paid invoice', v_i.number || ' through Stripe');
  elsif p_event = 'invoice.voided' and v_i.status = 'open' then
    perform public.ramp_invoice_release(v_i.id);
    update public.ramp_invoices set status = 'void' where id = v_i.id;
    insert into public.ramp_audit(workspace_id, action, detail) values (v_i.workspace_id, 'void invoice', v_i.number || ' in Stripe');
  end if;
  perform set_config('ramp.ws', coalesce(v_prev, ''), true);
  return 'ok';
end $$;

create or replace function public.ramp_stripe_invoice_payload(p_invoice uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'invoice', jsonb_build_object('id', i.id, 'workspace_id', i.workspace_id, 'number', i.number, 'status', i.status, 'total', i.total,
      'currency', i.currency, 'period_start', i.period_start, 'period_end', i.period_end, 'stripe_invoice_id', i.stripe_invoice_id),
    'client', jsonb_build_object('id', c.id, 'name', c.name, 'billing_name', c.billing_name, 'billing_email', c.billing_email,
      'net_days', c.net_days, 'stripe_customer_id', c.stripe_customer_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity, 'unit_price', l.unit_price,
      'amount', l.amount) order by l.sort) from public.ramp_invoice_lines l where l.invoice_id = i.id and l.workspace_id = i.workspace_id), '[]'::jsonb))
  from public.ramp_invoices i join public.ramp_clients c on c.id = i.client_id and c.workspace_id = i.workspace_id
  where i.id = p_invoice
$$;

create or replace function public.ramp_client_set_stripe(p_client uuid, p_customer text) returns void
language sql security definer set search_path = '' as $$
  update public.ramp_clients set stripe_customer_id = p_customer where id = p_client
$$;

-- ───────────────────────── storage ─────────────────────────
-- Member folders (<member id>/…) are per workspace already. Resource files move to resources/<workspace id>/….
-- launch/<placement>/… keeps its policies; ramp_launch_file_ok → ramp_launch_role is workspace-aware.

-- DESTRUCTIVE (owner OK needed): replaces the three RAMP storage policies with workspace-scoped versions.
drop policy if exists ramp_files_read on storage.objects;
create policy ramp_files_read on storage.objects for select to authenticated using (
  bucket_id = 'ramp-files' and (
    (storage.foldername(name))[1] = (select public.ramp_me())::text
    or ((select public.ramp_is_admin()) and public.ramp_ws_member((storage.foldername(name))[1]))
    or ((storage.foldername(name))[1] = 'resources' and (storage.foldername(name))[2] = (select public.ramp_ws())::text
        and (select public.ramp_my_rank()) <= 7)));
drop policy if exists ramp_files_insert on storage.objects;
create policy ramp_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'ramp-files' and (
    (storage.foldername(name))[1] = (select public.ramp_me())::text
    or ((storage.foldername(name))[1] = 'resources' and (storage.foldername(name))[2] = (select public.ramp_ws())::text
        and (select public.ramp_is_admin()))));
drop policy if exists ramp_files_delete on storage.objects;
create policy ramp_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'ramp-files' and (
    (storage.foldername(name))[1] = (select public.ramp_me())::text
    or ((storage.foldername(name))[1] = 'resources' and (storage.foldername(name))[2] = (select public.ramp_ws())::text
        and (select public.ramp_is_admin()))));

-- ───────────────────────── ownership and privileges ─────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'ramp_ws()', 'ramp_is_super()', 'ramp_me()', 'ramp_my_rank()', 'ramp_is_admin()', 'ramp_can_see(uuid)',
    'ramp_can_read_channel(uuid)', 'ramp_can_post(uuid)', 'ramp_key()', 'ramp_rank(text)', 'ramp_members_guard()',
    'ramp_audit_change()', 'ramp_accounts_guard()', 'ramp_session_start()', 'ramp_request_access(text,text)', 'ramp_public_brand()',
    'ramp_potential_staff()', 'ramp_my_workspace_ids()', 'ramp_my_account_ids()', 'ramp_seats_used(uuid)', 'ramp_ws_member(text)',
    'ramp_support_ensure(uuid)', 'ramp_my_workspaces()', 'ramp_set_workspace(uuid)', 'ramp_seats()',
    'ramp_account_request(text,text,text,text,text)', 'ramp_copy_library(uuid)', 'ramp_workspace_create(uuid,text,uuid,text,text,boolean)',
    'ramp_super_accounts()', 'ramp_super_approve(uuid,text,integer,integer)', 'ramp_super_decline(uuid,text)',
    'ramp_super_update_account(uuid,text,text,date,integer,text)',
    'ramp_super_platform_save(text,text,integer,integer,integer,jsonb,uuid,uuid)', 'ramp_account_add_workspace(text)',
    'ramp_workspace_setup_done()', 'ramp_invoice_stripe_sent(uuid,text,text,text)', 'ramp_invoice_stripe_event(text,text)',
    'ramp_stripe_invoice_payload(uuid)', 'ramp_client_set_stripe(uuid,text)'] loop
    execute format('comment on function public.%s is %L', f, 'RAMP: postgres-owned (bypasses RLS); filters by workspace itself.');
  end loop;
end $$;

-- Every other RAMP function runs as ramp_owner and is confined to the caller's workspace by RLS.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, pg_get_userbyid(p.proowner) as owner, coalesce(obj_description(p.oid, 'pg_proc'), '') as note
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'ramp\_%' loop
    if r.note like 'RAMP: postgres-owned%' then
      if r.owner <> 'postgres' then execute format('alter function %s owner to postgres', r.sig); end if;
    elsif r.owner <> 'ramp_owner' then
      execute format('alter function %s owner to ramp_owner', r.sig);
    end if;
    execute format('grant execute on function %s to ramp_owner', r.sig);
  end loop;
end $$;

do $$
declare f text;
begin
  -- callable from the app
  foreach f in array array['ramp_ws()', 'ramp_is_super()', 'ramp_my_workspaces()', 'ramp_set_workspace(uuid)', 'ramp_seats()',
    'ramp_account_request(text,text,text,text,text)', 'ramp_super_accounts()', 'ramp_super_approve(uuid,text,integer,integer)',
    'ramp_super_decline(uuid,text)', 'ramp_super_update_account(uuid,text,text,date,integer,text)',
    'ramp_super_platform_save(text,text,integer,integer,integer,jsonb,uuid,uuid)', 'ramp_account_add_workspace(text)',
    'ramp_workspace_setup_done()', 'ramp_my_workspace_ids()', 'ramp_my_account_ids()', 'ramp_ws_member(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- ramp_ws() is also the column default, so the service role may evaluate it
  execute 'grant execute on function public.ramp_ws() to service_role';
  -- internal only
  foreach f in array array['ramp_seats_used(uuid)', 'ramp_support_ensure(uuid)', 'ramp_copy_library(uuid)',
    'ramp_workspace_create(uuid,text,uuid,text,text,boolean)', 'ramp_accounts_guard()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ───────────────────────── existing members start in MKC ─────────────────────────

insert into public.ramp_user_prefs (auth_user_id, workspace_id)
select distinct m.auth_user_id, m.workspace_id from public.ramp_members m
where m.auth_user_id is not null and m.workspace_id = (select id from public.ramp_workspaces where slug = 'mkc')
on conflict (auth_user_id) do nothing;
