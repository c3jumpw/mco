-- RAMP 011: remember which getting-started tours and change log updates each person has seen, on any device.
-- One row per sign-in (auth user), shared across their workspaces. The app reads and writes it through two
-- functions; the table itself is only readable by its owner. The browser keeps a copy too, so RAMP keeps working
-- (just without cross-device memory) if this isn't applied.

create table if not exists public.ramp_user_state (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  tour         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.ramp_user_state enable row level security;
revoke all on public.ramp_user_state from anon, authenticated;
grant select on public.ramp_user_state to authenticated;

drop policy if exists ramp_user_state_own on public.ramp_user_state;
create policy ramp_user_state_own on public.ramp_user_state
  for select to authenticated using (auth_user_id = (select auth.uid()));

-- { v, roles, release }: tour version, tours taken, the newest change log entry they've been shown.
create or replace function public.ramp_tour_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select tour from public.ramp_user_state where auth_user_id = auth.uid()), '{}'::jsonb)
$$;

create or replace function public.ramp_save_tour_state(p_tour jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_tour is null or jsonb_typeof(p_tour) <> 'object' or pg_column_size(p_tour) > 4096 then
    raise exception 'That isn''t a tour state.' using errcode = '22023';
  end if;
  insert into public.ramp_user_state(auth_user_id, tour, updated_at) values (auth.uid(), p_tour, now())
  on conflict (auth_user_id) do update set tour = excluded.tour, updated_at = now();
end $$;

revoke execute on function public.ramp_tour_state() from public, anon;
revoke execute on function public.ramp_save_tour_state(jsonb) from public, anon;
grant execute on function public.ramp_tour_state() to authenticated;
grant execute on function public.ramp_save_tour_state(jsonb) to authenticated;
