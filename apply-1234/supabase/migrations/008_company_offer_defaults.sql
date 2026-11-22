-- Company-wide settings, starting with the defaults every offer starts from: company, hiring manager,
-- engagement, pay schedule, letter, terms and standard attachments such as an NDA.
-- Each job can override them (hiring_jobs.settings.offer_defaults); each offer then only needs the
-- candidate's start date, pay and deadline.

create table if not exists public.hiring_company (
  id              boolean primary key default true check (id),   -- one row
  offer_defaults  jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      text
);
insert into public.hiring_company (id) values (true) on conflict (id) do nothing;

-- Anyone with full access to a job (an editor) can prepare offers, so they read the company defaults too.
create or replace function public.hiring_any_editor()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.hiring_reviewers r where r.user_id = auth.uid() and r.role = 'editor');
$$;
revoke execute on function public.hiring_any_editor() from public, anon;
grant execute on function public.hiring_any_editor() to authenticated;

create or replace function public.hiring_company_touch()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := lower(coalesce(auth.jwt()->>'email', new.updated_by));
  return new;
end $$;
drop trigger if exists hiring_company_touch on public.hiring_company;
create trigger hiring_company_touch before update on public.hiring_company
  for each row execute function public.hiring_company_touch();

alter table public.hiring_company enable row level security;
drop policy if exists "hiring_company read" on public.hiring_company;
create policy "hiring_company read" on public.hiring_company for select to authenticated
  using ((select public.hiring_is_admin()) or (select public.hiring_any_editor()));
drop policy if exists "hiring_company admin update" on public.hiring_company;
create policy "hiring_company admin update" on public.hiring_company for update to authenticated
  using ((select public.hiring_is_admin())) with check ((select public.hiring_is_admin()));

-- Company-wide attachments live in hiring-team under company/. Admins can already add and remove them;
-- editors can open them, because they appear in offers they prepare. Sent offers keep their own copy.
drop policy if exists "hiring team company files read" on storage.objects;
create policy "hiring team company files read" on storage.objects for select to authenticated
  using (bucket_id = 'hiring-team' and name like 'company/%' and (select public.hiring_any_editor()));
