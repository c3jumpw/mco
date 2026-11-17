-- Client access level (rank 8): client contacts who see their own assistants, hours and invoices.
alter table public.ramp_members drop constraint ramp_members_level_check;
alter table public.ramp_members add constraint ramp_members_level_check
  check (level in ('owner','admin','lead','mentor','employee','trainee','guest','client'));

create or replace function public.ramp_rank(p_level text) returns int
language sql immutable set search_path = '' as $$
  select case p_level when 'owner' then 1 when 'admin' then 2 when 'lead' then 3 when 'mentor' then 4
    when 'employee' then 5 when 'trainee' then 6 when 'guest' then 7 when 'client' then 8 else 99 end
$$;
