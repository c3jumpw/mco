-- RAMP 014
--  1. Chat stays inside the organization: a channel member must belong to the channel's workspace, and clients can't join.
--     (ramp_dm and the directory already only offer active staff of the current workspace; this makes it a hard rule.)
--  2. Demo accounts: ramp_demo_seed builds (or rebuilds) the "RAMP Demo" account with a Demo Company workspace and one
--     person for every kind of user, plus a client, a placement and sample tasks. Called only by the ramp-demo edge
--     function, which creates the demo sign-ins (no passwords) and lets platform admins open them.

create or replace function public.ramp_channel_member_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select c.workspace_id into v_ws from public.ramp_channels c where c.id = new.channel_id;
  if new.workspace_id is null then new.workspace_id := v_ws; end if;
  if v_ws is null or new.workspace_id <> v_ws or not exists (
    select 1 from public.ramp_members m where m.id = new.member_id and m.workspace_id = v_ws and m.level <> 'client'
  ) then
    raise exception 'Only people in this organization can be in its chats.' using errcode = '42501';
  end if;
  return new;
end $$;
comment on function public.ramp_channel_member_guard() is 'RAMP: postgres-owned (bypasses RLS); filters by workspace itself.';
drop trigger if exists ramp_channel_member_guard on public.ramp_channel_members;
create trigger ramp_channel_member_guard before insert or update on public.ramp_channel_members
  for each row execute function public.ramp_channel_member_guard();

create or replace function public.ramp_demo_seed(p_users jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old uuid; v_acc uuid; v_ws uuid; v_role uuid; v_va_role uuid; v_dept uuid; v_client uuid; v_pl uuid;
  v_owner uuid := (p_users->>'owner')::uuid;
  m jsonb; v_id uuid; v_ids jsonb := '{}'::jsonb; v_email text;
  people jsonb := '[
    {"k":"admin","name":"Adam Admin","level":"admin","onboarded":true},
    {"k":"lead","name":"Lena Lead","level":"lead","onboarded":true},
    {"k":"mentor","name":"Marco Mentor","level":"mentor","onboarded":true},
    {"k":"employee","name":"Erin Employee","level":"employee","onboarded":true},
    {"k":"trainee","name":"Tara Trainee","level":"trainee","onboarded":false},
    {"k":"guest","name":"Gary Guest","level":"guest","onboarded":true},
    {"k":"va","name":"Val Assistant","level":"trainee","onboarded":true},
    {"k":"client","name":"Cleo Client","level":"client","onboarded":true}
  ]'::jsonb;
begin
  if v_owner is null then raise exception 'Missing the demo owner.'; end if;
  -- Start fresh: remove any earlier demo (its workspace and everything in it).
  perform set_config('ramp.bypass', 'on', true);
  for v_old in select id from public.ramp_accounts where name = 'RAMP Demo' and notes like 'demo:%' loop
    -- These point at people and clients without cascading, so they go first.
    delete from public.ramp_payout_lines where workspace_id in (select id from public.ramp_workspaces where account_id = v_old);
    delete from public.ramp_invoices where workspace_id in (select id from public.ramp_workspaces where account_id = v_old);
    delete from public.ramp_placements where workspace_id in (select id from public.ramp_workspaces where account_id = v_old);
    delete from public.ramp_workspaces where account_id = v_old;
    delete from public.ramp_accounts where id = v_old;
  end loop;

  insert into public.ramp_accounts(name, owner_auth_id, status, plan, notes, approved_at)
  values ('RAMP Demo', v_owner, 'active', 'comp', 'demo: test sign-ins for every kind of user. Rebuilt from Client accounts › Demo accounts.', now())
  returning id into v_acc;
  v_ws := public.ramp_workspace_create(v_acc, 'Demo Company', v_owner, 'Olivia Owner', '', true);
  perform set_config('ramp.ws', v_ws::text, true);
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_workspaces set setup_done = true where id = v_ws;
  update public.ramp_org set name = 'Demo Company', flags = coalesce(flags, '{}'::jsonb) || '{"agency": true, "chat": true, "tasks": true}'::jsonb
   where workspace_id = v_ws;
  -- Everything copied from the training library is published here, so demo learners can try it.
  update public.ramp_modules set status = 'published' where workspace_id = v_ws;
  -- Give assigned modules due dates (every two days from the start date), so the calendar and reminders have something to show.
  with s as (select id, row_number() over (order by sort, created_at) n from public.ramp_modules
             where workspace_id = v_ws and due_days is null and track in ('company', 'role'))
  update public.ramp_modules x set due_days = least(28, 1 + s.n * 2) from s where x.id = s.id;

  select id into v_role from public.ramp_job_roles where workspace_id = v_ws order by (title = 'Team Member') desc, created_at limit 1;
  -- The placed team member gets an assistant role from the library when there is one (with its interactive training).
  select id into v_va_role from public.ramp_job_roles where workspace_id = v_ws and title ilike '%assistant%' order by created_at limit 1;
  select id into v_dept from public.ramp_departments where workspace_id = v_ws order by created_at limit 1;

  insert into public.ramp_clients(workspace_id, name, industry, timezone, billing_name, billing_email)
  values (v_ws, 'Brightside Bakery', 'Food and hospitality', 'America/New_York', 'Brightside Bakery LLC', 'billing@brightside.example')
  returning id into v_client;

  for m in select * from jsonb_array_elements(people) loop
    select lower(email) into v_email from auth.users where id = (p_users->>(m->>'k'))::uuid;
    if v_email is null then raise exception 'Missing the demo sign-in for %.', m->>'k'; end if;
    insert into public.ramp_members(workspace_id, email, full_name, level, status, source, auth_user_id, joined_at, start_date,
                                    onboarded_at, practice_done_at, job_role_id, department_id, client_id, access_until)
    values (v_ws, v_email, m->>'name', m->>'level', 'active', 'seed', (p_users->>(m->>'k'))::uuid, now() - interval '20 days',
            case when m->>'k' = 'trainee' then current_date - 2 else current_date - 20 end,
            case when (m->>'onboarded')::boolean then now() - interval '15 days' end,
            case when (m->>'onboarded')::boolean then now() - interval '15 days' end,
            case when m->>'k' = 'va' then coalesce(v_va_role, v_role) when m->>'level' not in ('client', 'guest') then v_role end,
            case when m->>'level' not in ('client', 'guest') then v_dept end,
            case when m->>'k' = 'client' then v_client end,
            case when m->>'k' = 'guest' then current_date + 30 end)
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(m->>'k', v_id);
    insert into public.ramp_user_prefs(auth_user_id, workspace_id, updated_at) values ((p_users->>(m->>'k'))::uuid, v_ws, now())
    on conflict (auth_user_id) do update set workspace_id = excluded.workspace_id, updated_at = now();
  end loop;

  -- Marco supervises Tara and Val; Lena leads the department.
  update public.ramp_members set mentor_id = (v_ids->>'mentor')::uuid where id in ((v_ids->>'trainee')::uuid, (v_ids->>'va')::uuid);
  update public.ramp_departments set lead_id = (v_ids->>'lead')::uuid where id = v_dept;

  insert into public.ramp_placements(workspace_id, client_id, member_id, title, status, start_date, hours_per_week, schedule,
                                     bill_rate, pay_rate, coach_id, client_contact_id)
  values (v_ws, v_client, (v_ids->>'va')::uuid, 'Operations Assistant', 'active', current_date - 14, 30, 'Mon–Fri, 9am–3pm',
          22, 9, (v_ids->>'mentor')::uuid, (v_ids->>'client')::uuid)
  returning id into v_pl;

  insert into public.ramp_tasks(workspace_id, member_id, title, notes, due_date, status, created_by) values
    (v_ws, (v_ids->>'trainee')::uuid, 'Set up your notebook and first page', 'Create your training notebook from the template in your first module.', current_date + 1, 'todo', (v_ids->>'mentor')::uuid),
    (v_ws, (v_ids->>'trainee')::uuid, 'Book your first workshop with Marco', 'Pick a time this week and add it to your calendar.', current_date + 3, 'todo', (v_ids->>'mentor')::uuid),
    (v_ws, (v_ids->>'va')::uuid, 'Send the weekly calendar forecast to the owner', 'Sunday evening, in the owner’s chat channel.', current_date + 2, 'todo', (v_ids->>'mentor')::uuid);

  return v_ws;
end $$;
comment on function public.ramp_demo_seed(jsonb) is 'RAMP: postgres-owned (bypasses RLS); filters by workspace itself.';
revoke all on function public.ramp_demo_seed(jsonb) from public, anon, authenticated;
grant execute on function public.ramp_demo_seed(jsonb) to service_role;
