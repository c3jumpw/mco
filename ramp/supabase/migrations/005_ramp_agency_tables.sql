-- RAMP agency layer, part 1: tables and row-level security.
-- Clients you staff, placements (one assistant at one client, with bill and pay rates), skill tiers,
-- onboarding checklists, check-ins, timesheets, invoices, payouts and payout details.
-- Money columns are visible to admins only; assistants, coaches and clients read through functions
-- that leave out what they shouldn't see (assistants never see bill rates, clients never see pay rates).

-- ───────────────────────── settings ─────────────────────────

alter table public.ramp_org add column if not exists agency jsonb not null default '{
  "checklist": [
    {"title": "Contractor agreement signed", "owner": "agency"},
    {"title": "W-8BEN form collected", "owner": "agency"},
    {"title": "Payout details added in RAMP", "owner": "va"},
    {"title": "Kickoff call with the client", "owner": "agency"},
    {"title": "Tool access granted (email, project tool, drives)", "owner": "client"},
    {"title": "Accounts and configurations set up", "owner": "va"},
    {"title": "Client SOPs and checklists shared", "owner": "client"},
    {"title": "Working hours and communication channels agreed", "owner": "agency"},
    {"title": "First-week priorities set", "owner": "client"},
    {"title": "Timesheet and payout schedule explained", "owner": "agency"}
  ],
  "checkin_days": [7, 30, 60, 90],
  "checkin_every_days": 30,
  "replacement_days": 60,
  "invoice_prefix": "INV",
  "next_invoice_number": 1001,
  "pay_when_paid": true,
  "default_setup_fee": 750,
  "payout_currency": "USD"
}'::jsonb;

update public.ramp_org set flags = flags || '{"agency": true}'::jsonb where not (flags ? 'agency');

-- ───────────────────────── tables ─────────────────────────

create table if not exists public.ramp_clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 120),
  website         text not null default '',
  industry        text not null default '',
  timezone        text not null default '',
  status          text not null default 'active' check (status in ('prospect','active','paused','ended')),
  billing_name    text not null default '',
  billing_email   text not null default '',
  billing_address text not null default '',
  billing_cycle   text not null default 'weekly' check (billing_cycle in ('weekly','biweekly','monthly')),
  billing_mode    text not null default 'arrears' check (billing_mode in ('arrears','advance')),
  net_days        int  not null default 7 check (net_days between 0 and 60),
  currency        text not null default 'USD',
  stripe_customer_id text,
  notes           text not null default '',
  created_by      uuid references public.ramp_members(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.ramp_members add column if not exists client_id uuid references public.ramp_clients(id) on delete set null;
create index if not exists ramp_members_client_idx on public.ramp_members(client_id);

create table if not exists public.ramp_tiers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) between 1 and 60),
  level             int  not null default 1 check (level between 1 and 20),
  description       text not null default '',
  bill_rate         numeric(10,2) not null default 0 check (bill_rate >= 0),
  pay_rate          numeric(10,2) not null default 0 check (pay_rate >= 0),
  required_modules  uuid[] not null default '{}',
  min_days          int  not null default 0 check (min_days between 0 and 3650),
  min_checkin_score numeric(3,2) not null default 0 check (min_checkin_score between 0 and 5),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.ramp_client_modules (
  client_id uuid not null references public.ramp_clients(id) on delete cascade,
  module_id uuid not null references public.ramp_modules(id) on delete cascade,
  sort      int  not null default 0,
  primary key (client_id, module_id)
);

create table if not exists public.ramp_placements (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.ramp_clients(id) on delete restrict,
  member_id         uuid not null references public.ramp_members(id) on delete restrict,
  title             text not null default 'Virtual assistant' check (length(btrim(title)) between 1 and 120),
  tier_id           uuid references public.ramp_tiers(id) on delete set null,
  status            text not null default 'proposed' check (status in ('proposed','onboarding','active','paused','ended')),
  start_date        date,
  end_date          date,
  hours_per_week    numeric(5,2) not null default 40 check (hours_per_week between 0 and 80),
  schedule          text not null default '',
  bill_rate         numeric(10,2) not null default 0 check (bill_rate >= 0),
  pay_rate          numeric(10,2) not null default 0 check (pay_rate >= 0),
  currency          text not null default 'USD',
  setup_fee         numeric(10,2) not null default 0 check (setup_fee >= 0),
  setup_fee_status  text not null default 'none' check (setup_fee_status in ('none','unbilled','invoiced','paid','waived')),
  coach_id          uuid references public.ramp_members(id) on delete set null,
  client_contact_id uuid references public.ramp_members(id) on delete set null,
  replaces_id       uuid references public.ramp_placements(id) on delete set null,
  guarantee_until   date,
  ended_reason      text not null default '',
  notes             text not null default '',
  created_by        uuid references public.ramp_members(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists ramp_placements_client_idx on public.ramp_placements(client_id);
create index if not exists ramp_placements_member_idx on public.ramp_placements(member_id);
create index if not exists ramp_placements_coach_idx on public.ramp_placements(coach_id);

create table if not exists public.ramp_placement_steps (
  id           uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.ramp_placements(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  owner        text not null default 'agency' check (owner in ('agency','client','va')),
  sort         int  not null default 0,
  done_at      timestamptz,
  done_by      uuid references public.ramp_members(id) on delete set null,
  note         text not null default ''
);
create index if not exists ramp_placement_steps_idx on public.ramp_placement_steps(placement_id);

create table if not exists public.ramp_rate_changes (
  id             uuid primary key default gen_random_uuid(),
  placement_id   uuid not null references public.ramp_placements(id) on delete cascade,
  effective_date date not null,
  old_tier_id    uuid references public.ramp_tiers(id) on delete set null,
  new_tier_id    uuid references public.ramp_tiers(id) on delete set null,
  old_bill       numeric(10,2) not null,
  new_bill       numeric(10,2) not null,
  old_pay        numeric(10,2) not null,
  new_pay        numeric(10,2) not null,
  reason         text not null default '',
  created_by     uuid references public.ramp_members(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists ramp_rate_changes_idx on public.ramp_rate_changes(placement_id, effective_date);

create table if not exists public.ramp_checkins (
  id                uuid primary key default gen_random_uuid(),
  placement_id      uuid not null references public.ramp_placements(id) on delete cascade,
  kind              text not null check (kind in ('client','va')),
  due_date          date,
  status            text not null default 'scheduled' check (status in ('scheduled','done','skipped')),
  done_at           timestamptz,
  by_member         uuid references public.ramp_members(id) on delete set null,
  score             smallint check (score between 1 and 5),
  went_well         text not null default '',
  improve           text not null default '',
  actions           text not null default '',
  share_with_client boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists ramp_checkins_idx on public.ramp_checkins(placement_id, status, due_date);

create table if not exists public.ramp_timesheets (
  id             uuid primary key default gen_random_uuid(),
  placement_id   uuid not null references public.ramp_placements(id) on delete cascade,
  member_id      uuid not null references public.ramp_members(id) on delete cascade,
  week_start     date not null check (extract(isodow from week_start) = 1),
  days           numeric(5,2)[] not null default '{0,0,0,0,0,0,0}'
                   check (array_length(days, 1) = 7 and 0 <= all(days) and 24 >= all(days)),
  total          numeric(6,2) generated always as (coalesce(days[1],0) + coalesce(days[2],0) + coalesce(days[3],0)
                   + coalesce(days[4],0) + coalesce(days[5],0) + coalesce(days[6],0) + coalesce(days[7],0)) stored,
  notes          text not null default '',
  status         text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.ramp_members(id) on delete set null,
  review_note    text not null default '',
  pay_rate       numeric(10,2),
  invoice_line_id uuid,
  payout_line_id  uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (placement_id, week_start)
);
create index if not exists ramp_timesheets_member_idx on public.ramp_timesheets(member_id, week_start);
create index if not exists ramp_timesheets_status_idx on public.ramp_timesheets(status);

create table if not exists public.ramp_invoices (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.ramp_clients(id) on delete restrict,
  number           text not null unique,
  status           text not null default 'draft' check (status in ('draft','open','paid','void')),
  period_start     date not null,
  period_end       date not null check (period_end >= period_start),
  issue_date       date,
  due_date         date,
  currency         text not null default 'USD',
  total            numeric(12,2) not null default 0,
  paid_at          timestamptz,
  paid_note        text not null default '',
  stripe_invoice_id text unique,
  stripe_url       text,
  stripe_pdf       text,
  sent_at          timestamptz,
  notes            text not null default '',
  created_by       uuid references public.ramp_members(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ramp_invoices_client_idx on public.ramp_invoices(client_id, status);

create table if not exists public.ramp_invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.ramp_invoices(id) on delete cascade,
  placement_id  uuid references public.ramp_placements(id) on delete set null,
  kind          text not null default 'other' check (kind in ('hours','prepay','adjustment','setup_fee','other')),
  description   text not null default '',
  quantity      numeric(10,2) not null default 1,
  unit_price    numeric(10,2) not null default 0,
  amount        numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  period_start  date,
  period_end    date,
  reconciled_at timestamptz,
  sort          int not null default 0
);
create index if not exists ramp_invoice_lines_idx on public.ramp_invoice_lines(invoice_id);
create index if not exists ramp_invoice_lines_prepay_idx on public.ramp_invoice_lines(placement_id, kind);

alter table public.ramp_timesheets add constraint ramp_timesheets_invoice_line_fk
  foreign key (invoice_line_id) references public.ramp_invoice_lines(id) on delete set null;

create table if not exists public.ramp_payouts (
  id           uuid primary key default gen_random_uuid(),
  label        text not null default '',
  period_start date not null,
  period_end   date not null check (period_end >= period_start),
  status       text not null default 'draft' check (status in ('draft','exported','sent')),
  currency     text not null default 'USD',
  total        numeric(12,2) not null default 0,
  exported_at  timestamptz,
  sent_at      timestamptz,
  reference    text not null default '',
  notes        text not null default '',
  created_by   uuid references public.ramp_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.ramp_payout_lines (
  id           uuid primary key default gen_random_uuid(),
  payout_id    uuid not null references public.ramp_payouts(id) on delete cascade,
  member_id    uuid not null references public.ramp_members(id) on delete restrict,
  placement_id uuid references public.ramp_placements(id) on delete set null,
  kind         text not null default 'hours' check (kind in ('hours','bonus','adjustment')),
  description  text not null default '',
  quantity     numeric(10,2) not null default 1,
  rate         numeric(10,2) not null default 0,
  amount       numeric(12,2) generated always as (round(quantity * rate, 2)) stored,
  sort         int not null default 0
);
create index if not exists ramp_payout_lines_idx on public.ramp_payout_lines(payout_id);
create index if not exists ramp_payout_lines_member_idx on public.ramp_payout_lines(member_id);

alter table public.ramp_timesheets add constraint ramp_timesheets_payout_line_fk
  foreign key (payout_line_id) references public.ramp_payout_lines(id) on delete set null;

create table if not exists public.ramp_payees (
  member_id         uuid primary key references public.ramp_members(id) on delete cascade,
  method            text not null default 'wise_email' check (method in ('wise_recipient','wise_email','bank','other')),
  account_name      text not null default '',
  email             text not null default '',
  wise_recipient_id text not null default '',
  target_currency   text not null default 'PHP',
  bank_details      bytea,
  notes             text not null default '',
  updated_at        timestamptz not null default now()
);

create table if not exists public.ramp_client_requests (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.ramp_clients(id) on delete cascade,
  placement_id uuid references public.ramp_placements(id) on delete set null,
  member_id    uuid references public.ramp_members(id) on delete set null,
  kind         text not null default 'support' check (kind in ('support','replacement','hours','new_va','other')),
  body         text not null check (length(btrim(body)) between 1 and 4000),
  status       text not null default 'open' check (status in ('open','in_progress','done')),
  response     text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ramp_client_requests_idx on public.ramp_client_requests(client_id, status);

-- ───────────────────────── triggers ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['ramp_clients','ramp_tiers','ramp_placements','ramp_checkins','ramp_timesheets',
                           'ramp_invoices','ramp_payouts','ramp_client_requests'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.ramp_touch()', t, t);
  end loop;
  foreach t in array array['ramp_clients','ramp_tiers','ramp_placements','ramp_invoices','ramp_payouts'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.ramp_audit_change()', t, t);
  end loop;
end $$;

-- Totals follow their lines.
create or replace function public.ramp_invoice_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_invoices
     set total = coalesce((select sum(amount) from public.ramp_invoice_lines where invoice_id = v), 0)
   where id = v;
  return null;
end $$;
create trigger ramp_invoice_lines_total after insert or update or delete on public.ramp_invoice_lines
  for each row execute function public.ramp_invoice_total();

create or replace function public.ramp_payout_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v uuid := coalesce(new.payout_id, old.payout_id);
begin
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_payouts
     set total = coalesce((select sum(amount) from public.ramp_payout_lines where payout_id = v), 0)
   where id = v;
  return null;
end $$;
create trigger ramp_payout_lines_total after insert or update or delete on public.ramp_payout_lines
  for each row execute function public.ramp_payout_total();

-- Lines of a sent or paid invoice, or a sent payout, can't change.
create or replace function public.ramp_lines_locked() returns trigger
language plpgsql set search_path = '' as $$
declare v_status text;
begin
  if current_setting('ramp.bypass', true) = 'on' then return coalesce(new, old); end if;
  if tg_table_name = 'ramp_invoice_lines' then
    select status into v_status from public.ramp_invoices where id = coalesce(new.invoice_id, old.invoice_id);
    if v_status is not null and v_status <> 'draft' then raise exception 'This invoice has been issued. Void it to make changes.'; end if;
  else
    select status into v_status from public.ramp_payouts where id = coalesce(new.payout_id, old.payout_id);
    if v_status = 'sent' then raise exception 'This payout has been sent and can’t change.'; end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger ramp_invoice_lines_lock before insert or update or delete on public.ramp_invoice_lines
  for each row execute function public.ramp_lines_locked();
create trigger ramp_payout_lines_lock before insert or update or delete on public.ramp_payout_lines
  for each row execute function public.ramp_lines_locked();

-- ───────────────────────── helpers ─────────────────────────

create or replace function public.ramp_my_client() returns uuid
language sql stable security definer set search_path = '' as $$
  select client_id from public.ramp_members
  where auth_user_id = auth.uid() and status = 'active' and level = 'client' limit 1
$$;

-- Clients an assistant is (or is about to be) placed with.
create or replace function public.ramp_my_client_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct p.client_id from public.ramp_placements p
  where p.member_id = public.ramp_me() and p.status <> 'ended'
$$;

-- Bill and pay rate in effect on a date, using the rate history.
create or replace function public.ramp_rates_at(p_placement uuid, p_date date)
returns table(bill numeric, pay numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce((select rc.old_bill from public.ramp_rate_changes rc
                    where rc.placement_id = p.id and rc.effective_date > p_date
                    order by rc.effective_date, rc.created_at limit 1), p.bill_rate),
         coalesce((select rc.old_pay from public.ramp_rate_changes rc
                    where rc.placement_id = p.id and rc.effective_date > p_date
                    order by rc.effective_date, rc.created_at limit 1), p.pay_rate)
  from public.ramp_placements p where p.id = p_placement
$$;

-- ───────────────────────── row-level security ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['ramp_clients','ramp_tiers','ramp_client_modules','ramp_placements','ramp_placement_steps',
    'ramp_rate_changes','ramp_checkins','ramp_timesheets','ramp_invoices','ramp_invoice_lines','ramp_payouts',
    'ramp_payout_lines','ramp_payees','ramp_client_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()))', t || '_admin', t);
  end loop;
end $$;

-- clients see their own company, their invoices once issued, and their requests
create policy ramp_clients_own on public.ramp_clients for select to authenticated
  using (id = (select public.ramp_my_client()));
create policy ramp_invoices_client on public.ramp_invoices for select to authenticated
  using (client_id = (select public.ramp_my_client()) and status <> 'draft');
create policy ramp_invoice_lines_client on public.ramp_invoice_lines for select to authenticated
  using (exists (select 1 from public.ramp_invoices i where i.id = invoice_id
                 and i.client_id = (select public.ramp_my_client()) and i.status <> 'draft'));
create policy ramp_client_requests_own on public.ramp_client_requests for select to authenticated
  using (client_id = (select public.ramp_my_client()));

-- assistants see their own timesheets and payout lines, and the training tracks of their clients
create policy ramp_timesheets_own on public.ramp_timesheets for select to authenticated
  using (member_id = (select public.ramp_me()));
create policy ramp_payout_lines_own on public.ramp_payout_lines for select to authenticated
  using (member_id = (select public.ramp_me()));
create policy ramp_client_modules_staff on public.ramp_client_modules for select to authenticated
  using ((select public.ramp_my_rank()) <= 6 and client_id in (select public.ramp_my_client_ids()));

-- clients can read the org row (name, brand) for the app frame
create policy ramp_org_read_clients on public.ramp_org for select to authenticated
  using ((select public.ramp_my_rank()) = 8);

-- ───────────────────────── starter tiers ─────────────────────────

insert into public.ramp_tiers (name, level, description, bill_rate, pay_rate, required_modules, min_days, min_checkin_score)
select * from (values
  ('Core VA', 1, 'Finished our core systems training. Handles admin, inbox, calendar, data entry and follow-ups.', 10.00, 5.00,
     coalesce((select array_agg(id order by sort) from public.ramp_modules where track = 'company' and required and status = 'published'), '{}'::uuid[]), 0, 0.00),
  ('Skilled VA', 2, 'Knows the client’s systems and runs recurring processes with little direction.', 13.00, 6.50, '{}'::uuid[], 90, 4.00),
  ('Specialist', 3, 'Owns a specialty such as bookkeeping, operations or marketing tools.', 17.00, 8.50, '{}'::uuid[], 180, 4.30)
) as v(name, level, description, bill_rate, pay_rate, required_modules, min_days, min_checkin_score)
where not exists (select 1 from public.ramp_tiers);
