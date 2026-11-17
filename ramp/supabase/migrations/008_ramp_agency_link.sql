-- RAMP 008: agency ↔ client workspaces (phase 5).
--
-- A client of the agency workspace can be linked to the client company's own RAMP workspace. Then:
--   • each onboarding/active placement for that client puts the assistant into the client workspace as an employee
--     (source 'agency', agency_placement_id set); the row goes inactive when the placement ends or the link changes;
--   • the client workspace's owners and admins act as that client: portal, hours approval, feedback, requests, checklist
--     steps, launch plans and issued invoices, from their own workspace.
-- The cross-workspace functions are postgres-owned and check the client relationship explicitly. Where they need
-- ramp_owner helpers (names, training, rates) they pin ramp.ws to the agency workspace AFTER the check, and restore it.
-- Apply after 007. Nothing here is destructive.

-- ───────────────────────── columns ─────────────────────────

alter table public.ramp_clients add column if not exists linked_workspace_id uuid references public.ramp_workspaces(id) on delete set null;
create unique index if not exists ramp_clients_linked_ws_key on public.ramp_clients(linked_workspace_id) where linked_workspace_id is not null;

-- Deliberately cross-workspace: the member row lives in the client workspace, the placement in the agency workspace.
alter table public.ramp_members add column if not exists agency_placement_id uuid references public.ramp_placements(id) on delete set null;
create index if not exists ramp_members_agency_placement_idx on public.ramp_members(agency_placement_id) where agency_placement_id is not null;

-- ───────────────────────── who is a client ─────────────────────────

-- The client the caller represents in the current workspace: a level-'client' contact there, or an owner/admin of a
-- workspace that an agency client is linked to.
create or replace function public.ramp_my_client() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.client_id from public.ramp_members m
      where m.auth_user_id = auth.uid() and m.status = 'active' and m.level = 'client' and m.workspace_id = public.ramp_ws() limit 1),
    (select c.id from public.ramp_clients c
      where c.linked_workspace_id = public.ramp_ws()
        and c.workspace_id = (select agency_workspace_id from public.ramp_platform where id)
        and public.ramp_my_rank() <= 2
      limit 1))
$$;

create or replace function public.ramp_my_client_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'linked', c.workspace_id is distinct from public.ramp_ws())
  from public.ramp_clients c where c.id = public.ramp_my_client()
$$;

-- ramp_owner-owned; 'client' now also covers linked client workspaces.
create or replace function public.ramp_my_roles() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'work', exists (select 1 from public.ramp_placements where member_id = public.ramp_me() and status <> 'ended'),
    'coaching', (select count(*) from public.ramp_placements p where p.status <> 'ended' and public.ramp_my_rank() <= 4
                   and (p.coach_id = public.ramp_me() or exists (select 1 from public.ramp_members m where m.id = p.member_id and m.mentor_id = public.ramp_me()))),
    'client', public.ramp_my_client_info())
$$;

-- ───────────────────────── linking a client to a workspace ─────────────────────────

-- Only agency-workspace clients can be linked, never to the agency workspace itself, and only by a super admin or an
-- admin of the agency workspace.
create or replace function public.ramp_clients_link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_agency uuid := (select agency_workspace_id from public.ramp_platform where id);
begin
  if new.linked_workspace_id is not distinct from (case when tg_op = 'UPDATE' then old.linked_workspace_id end) then return new; end if;
  if new.linked_workspace_id is not null then
    if new.workspace_id is distinct from v_agency then
      raise exception 'Only clients of the agency workspace can be linked to a workspace.';
    end if;
    if new.linked_workspace_id = new.workspace_id then raise exception 'A client can’t be linked to the agency workspace itself.'; end if;
  end if;
  if auth.uid() is null or current_setting('ramp.bypass', true) = 'on' or public.ramp_is_super() then return new; end if;
  if not exists (select 1 from public.ramp_members where workspace_id = new.workspace_id and auth_user_id = auth.uid()
                   and status = 'active' and public.ramp_rank(level) <= 2) then
    raise exception 'Only the platform admin or an agency admin can link a client to a workspace.';
  end if;
  return new;
end $$;
create or replace trigger ramp_clients_link_guard before insert or update of linked_workspace_id on public.ramp_clients
  for each row execute function public.ramp_clients_link_guard();

-- Puts the placement's assistant into the linked client workspace, or takes them out. Internal (no permission check).
create or replace function public.ramp_placement_sync_internal(p_placement uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.ramp_placements; v_c public.ramp_clients; v_va public.ramp_members;
  v_agency uuid := (select agency_workspace_id from public.ramp_platform where id);
  v_target uuid; v_id uuid; v_alt uuid; v_n int := 0; r record;
  v_bypass text := current_setting('ramp.bypass', true);
begin
  select * into v_p from public.ramp_placements where id = p_placement;
  if v_p.id is null then return 0; end if;
  select * into v_c from public.ramp_clients where id = v_p.client_id and workspace_id = v_p.workspace_id;
  select * into v_va from public.ramp_members where id = v_p.member_id and workspace_id = v_p.workspace_id;
  if v_p.workspace_id = v_agency and v_p.status in ('onboarding','active') and v_c.linked_workspace_id is not null and v_va.id is not null then
    v_target := v_c.linked_workspace_id;
  end if;
  perform set_config('ramp.bypass', 'on', true);

  -- rows this placement put elsewhere: hand them to another live placement of the same assistant there, or deactivate
  for r in select m.id, m.workspace_id from public.ramp_members m
           where m.agency_placement_id = v_p.id and (v_target is null or m.workspace_id <> v_target) loop
    select p2.id into v_alt from public.ramp_placements p2 join public.ramp_clients c2 on c2.id = p2.client_id
    where p2.workspace_id = v_agency and p2.member_id = v_p.member_id and p2.id <> v_p.id
      and p2.status in ('onboarding','active') and c2.linked_workspace_id = r.workspace_id
    limit 1;
    if v_alt is not null then
      update public.ramp_members set agency_placement_id = v_alt where id = r.id;
    else
      update public.ramp_members set status = 'inactive' where id = r.id and status <> 'inactive';
      if found then
        v_n := v_n + 1;
        insert into public.ramp_audit(workspace_id, action, member_id, detail)
        values (r.workspace_id, 'agency assistant removed', r.id, 'Placement ended or moved');
      end if;
    end if;
  end loop;

  if v_target is not null then
    select id into v_id from public.ramp_members where workspace_id = v_target and agency_placement_id = v_p.id;
    if v_id is null then
      select id into v_id from public.ramp_members
      where workspace_id = v_target
        and (email = v_va.email or (v_va.auth_user_id is not null and auth_user_id = v_va.auth_user_id))
      order by (v_va.auth_user_id is not null and auth_user_id = v_va.auth_user_id) desc limit 1;
    end if;
    if v_id is not null then
      update public.ramp_members set agency_placement_id = v_p.id, status = 'active',
             auth_user_id = coalesce(auth_user_id, v_va.auth_user_id)
      where id = v_id and (agency_placement_id is distinct from v_p.id or status <> 'active');
      if found then v_n := v_n + 1; end if;
    else
      insert into public.ramp_members(workspace_id, email, full_name, preferred_name, phone, timezone, level, status, source, source_ref,
                                      agency_placement_id, auth_user_id, joined_at, start_date)
      values (v_target, v_va.email, v_va.full_name, v_va.preferred_name, v_va.phone, v_va.timezone, 'employee', 'active', 'agency',
              v_p.id::text, v_p.id, v_va.auth_user_id, case when v_va.auth_user_id is not null then now() end, v_p.start_date)
      returning id into v_id;
      v_n := v_n + 1;
      insert into public.ramp_audit(workspace_id, action, member_id, detail)
      values (v_target, 'agency assistant added', v_id, coalesce(v_p.title, '') || ' · placed by the agency');
    end if;
  end if;
  perform set_config('ramp.bypass', coalesce(v_bypass, ''), true);
  return v_n;
end $$;

-- For the admin UI: re-sync one placement. Admins of the placement's workspace, or a super admin.
create or replace function public.ramp_placement_sync(p_placement uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid := (select workspace_id from public.ramp_placements where id = p_placement);
begin
  if v_ws is null or not (public.ramp_is_super() or (v_ws = public.ramp_ws() and public.ramp_is_admin())) then
    raise exception 'Placement not found.';
  end if;
  return public.ramp_placement_sync_internal(p_placement);
end $$;

create or replace function public.ramp_placements_sync_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ramp_placement_sync_internal(new.id);
  return null;
end $$;
create or replace trigger ramp_placements_sync after insert or update of status, client_id, member_id on public.ramp_placements
  for each row execute function public.ramp_placements_sync_trg();

create or replace function public.ramp_clients_link_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.ramp_placements where client_id = new.id and workspace_id = new.workspace_id loop
    perform public.ramp_placement_sync_internal(r.id);
  end loop;
  return null;
end $$;
create or replace trigger ramp_clients_link_sync after update of linked_workspace_id on public.ramp_clients
  for each row when (new.linked_workspace_id is distinct from old.linked_workspace_id)
  execute function public.ramp_clients_link_sync();

-- Link (or with null, unlink) an agency client and its client workspace. Super admin, or an agency-workspace admin.
create or replace function public.ramp_client_link(p_client uuid, p_workspace uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.ramp_clients;
begin
  select * into c from public.ramp_clients where id = p_client;
  if c.id is null or not (public.ramp_is_super() or (c.workspace_id = public.ramp_ws() and public.ramp_is_admin())) then
    raise exception 'Client not found.';
  end if;
  if p_workspace is not null and not exists (select 1 from public.ramp_workspaces where id = p_workspace) then
    raise exception 'Workspace not found.';
  end if;
  if p_workspace is not null and exists (select 1 from public.ramp_clients where linked_workspace_id = p_workspace and id <> c.id) then
    raise exception 'That workspace is already linked to another client.';
  end if;
  update public.ramp_clients set linked_workspace_id = p_workspace where id = c.id;   -- guard checks, trigger syncs
  insert into public.ramp_audit(workspace_id, actor_id, action, detail)
  values (c.workspace_id,
          (select id from public.ramp_members where workspace_id = c.workspace_id and auth_user_id = auth.uid() and status = 'active'),
          case when p_workspace is null then 'unlinked client workspace' else 'linked client workspace' end,
          c.name || coalesce(' → ' || (select name from public.ramp_workspaces where id = p_workspace), ''));
end $$;

-- ramp_owner-owned: a new placement's checklist and check-ins, then the client-workspace sync.
create or replace function public.ramp_placement_seed(p_placement uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_p public.ramp_placements; v_a jsonb; v_s jsonb; v_d int; v_i int := 0;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can set up placements.'; end if;
  select * into v_p from public.ramp_placements where id = p_placement and workspace_id = public.ramp_ws();
  if v_p.id is null then raise exception 'Placement not found.'; end if;
  select agency into v_a from public.ramp_org where workspace_id = v_p.workspace_id;
  if not exists (select 1 from public.ramp_placement_steps where placement_id = v_p.id) then
    for v_s in select value from jsonb_array_elements(coalesce(v_a->'checklist', '[]'::jsonb)) loop
      insert into public.ramp_placement_steps(placement_id, title, owner, sort)
      values (v_p.id, left(coalesce(v_s->>'title', 'Step'), 200),
              case when v_s->>'owner' in ('agency','client','va') then v_s->>'owner' else 'agency' end, v_i);
      v_i := v_i + 1;
    end loop;
  end if;
  if v_p.start_date is not null and not exists (select 1 from public.ramp_checkins where placement_id = v_p.id) then
    for v_d in select value::int from jsonb_array_elements_text(coalesce(v_a->'checkin_days', '[30,60,90]'::jsonb)) loop
      insert into public.ramp_checkins(placement_id, kind, due_date)
      values (v_p.id, 'va', v_p.start_date + v_d), (v_p.id, 'client', v_p.start_date + v_d);
    end loop;
  end if;
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_placements set
    guarantee_until = coalesce(guarantee_until, case when start_date is not null
                        then start_date + coalesce((v_a->>'replacement_days')::int, 60) end),
    setup_fee_status = case when setup_fee > 0 and setup_fee_status = 'none' then 'unbilled' else setup_fee_status end,
    coach_id = coalesce(coach_id, (select mentor_id from public.ramp_members where id = v_p.member_id))
  where id = v_p.id;
  perform public.ramp_placement_sync_internal(v_p.id);
  return v_i;
end $$;

-- ───────────────────────── client functions, usable from a linked client workspace ─────────────────────────

create or replace function public.ramp_client_portal() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c uuid := public.ramp_my_client(); v_cws uuid; v_week date := public.ramp_week_start(current_date);
  v_prev text := current_setting('ramp.ws', true); v_out jsonb;
begin
  if v_c is null then raise exception 'This page is for client contacts.'; end if;
  select workspace_id into v_cws from public.ramp_clients where id = v_c;
  perform set_config('ramp.ws', v_cws::text, true);   -- names and training summaries are read in the agency workspace
  v_out := jsonb_build_object(
    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'timezone', c.timezone, 'billing_cycle', c.billing_cycle,
                'billing_mode', c.billing_mode, 'net_days', c.net_days, 'billing_email', c.billing_email) from public.ramp_clients c where c.id = v_c),
    'placements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date, 'end_date', p.end_date,
        'hours_per_week', p.hours_per_week, 'schedule', p.schedule, 'bill_rate', p.bill_rate, 'currency', p.currency,
        'guarantee_until', p.guarantee_until,
        'tier', (select jsonb_build_object('name', t.name, 'level', t.level, 'description', t.description) from public.ramp_tiers t
                 where t.id = p.tier_id and t.workspace_id = v_cws),
        'va', jsonb_build_object('id', m.id, 'name', public.ramp_name(m.id), 'email', m.email, 'timezone', m.timezone),
        'coach', jsonb_build_object('name', public.ramp_name(p.coach_id)),
        'steps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'owner', s.owner, 'done_at', s.done_at) order by s.sort)
                 from public.ramp_placement_steps s where s.placement_id = p.id and s.workspace_id = v_cws), '[]'::jsonb),
        'training', public.ramp_training_summary(m.id),
        'checkins', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'kind', k.kind, 'done_at', k.done_at, 'score', k.score,
                 'went_well', k.went_well, 'improve', k.improve, 'actions', k.actions, 'by_name', public.ramp_name(k.by_member)) order by k.done_at desc)
                 from (select * from public.ramp_checkins k2 where k2.placement_id = p.id and k2.workspace_id = v_cws and k2.status = 'done'
                       and (k2.kind = 'client' or k2.share_with_client) order by k2.done_at desc limit 5) k), '[]'::jsonb),
        'next_checkin', (select k.due_date from public.ramp_checkins k where k.placement_id = p.id and k.workspace_id = v_cws
                         and k.kind = 'client' and k.status = 'scheduled' order by k.due_date limit 1),
        'hours_this_week', coalesce((select t.total from public.ramp_timesheets t where t.placement_id = p.id and t.week_start = v_week), 0),
        'hours_last_week', coalesce((select t.total from public.ramp_timesheets t where t.placement_id = p.id and t.week_start = v_week - 7), 0))
        order by (p.status = 'ended'), p.start_date desc nulls last)
      from public.ramp_placements p join public.ramp_members m on m.id = p.member_id and m.workspace_id = p.workspace_id
      where p.client_id = v_c and p.workspace_id = v_cws and p.status <> 'proposed'), '[]'::jsonb),
    'timesheets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'placement_id', t.placement_id, 'va_name', public.ramp_name(t.member_id),
        'title', p.title, 'week_start', t.week_start, 'days', t.days, 'total', t.total, 'notes', t.notes, 'status', t.status,
        'submitted_at', t.submitted_at, 'reviewed_at', t.reviewed_at, 'review_note', t.review_note)
        order by (t.status = 'submitted') desc, t.week_start desc)
      from public.ramp_timesheets t join public.ramp_placements p on p.id = t.placement_id and p.workspace_id = t.workspace_id
      where p.client_id = v_c and t.workspace_id = v_cws and t.status in ('submitted','approved','rejected')
        and t.week_start > current_date - 120), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.ramp_client_requests r where r.client_id = v_c and r.workspace_id = v_cws), '[]'::jsonb));
  perform set_config('ramp.ws', coalesce(v_prev, ''), true);
  return v_out;
end $$;

-- Issued invoices (never drafts) for the caller's client. Replaces direct selects on ramp_invoices in the client pages.
create or replace function public.ramp_client_invoices() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_c uuid := public.ramp_my_client();
begin
  if v_c is null then raise exception 'This page is for client contacts.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'client_id', i.client_id, 'number', i.number, 'status', i.status,
      'period_start', i.period_start, 'period_end', i.period_end, 'issue_date', i.issue_date, 'due_date', i.due_date,
      'currency', i.currency, 'total', i.total, 'paid_at', i.paid_at, 'stripe_url', i.stripe_url, 'stripe_pdf', i.stripe_pdf,
      'sent_at', i.sent_at, 'created_at', i.created_at)
      order by i.issue_date desc nulls last, i.created_at desc)
    from public.ramp_invoices i where i.client_id = v_c and i.status <> 'draft'), '[]'::jsonb);
end $$;

create or replace function public.ramp_client_invoice(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_c uuid := public.ramp_my_client(); v_i public.ramp_invoices;
begin
  if v_c is null then raise exception 'This page is for client contacts.'; end if;
  select * into v_i from public.ramp_invoices where id = p_id and client_id = v_c and status <> 'draft';
  if v_i.id is null then raise exception 'Invoice not found.'; end if;
  return jsonb_build_object(
    'invoice', to_jsonb(v_i) - 'created_by',
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'description', l.description, 'quantity', l.quantity,
        'unit_price', l.unit_price, 'amount', l.amount, 'period_start', l.period_start, 'period_end', l.period_end, 'sort', l.sort) order by l.sort)
      from public.ramp_invoice_lines l where l.invoice_id = v_i.id and l.workspace_id = v_i.workspace_id), '[]'::jsonb),
    'client', (select jsonb_build_object('name', c.name, 'billing_name', c.billing_name, 'billing_email', c.billing_email,
        'billing_address', c.billing_address, 'net_days', c.net_days) from public.ramp_clients c where c.id = v_c),
    'issuer', (select jsonb_build_object('name', o.name, 'brand_color', o.brand_color) from public.ramp_org o where o.workspace_id = v_i.workspace_id));
end $$;

-- Admins of the timesheet's workspace, or the client (contact or linked client workspace admin).
create or replace function public.ramp_timesheet_review(p_timesheet uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.ramp_timesheets; v_p public.ramp_placements; v_pay numeric;
  v_here boolean; v_client boolean; v_actor uuid; v_by text; v_prev text := current_setting('ramp.ws', true);
begin
  select * into v_t from public.ramp_timesheets where id = p_timesheet;
  if v_t.id is null then raise exception 'Timesheet not found.'; end if;
  select * into v_p from public.ramp_placements where id = v_t.placement_id and workspace_id = v_t.workspace_id;
  v_here := v_t.workspace_id = public.ramp_ws();
  v_client := public.ramp_my_client() is not null and public.ramp_my_client() = v_p.client_id;
  if not v_here and not v_client then raise exception 'Timesheet not found.'; end if;
  if not ((v_here and public.ramp_is_admin()) or v_client) then raise exception 'You can’t review these hours.'; end if;
  if v_t.status <> 'submitted' then raise exception 'These hours aren’t waiting for review.'; end if;
  if not p_approve and btrim(coalesce(p_note, '')) = '' then raise exception 'Add a note so the assistant knows what to fix.'; end if;
  if v_here then v_actor := public.ramp_me();
  else select coalesce(nullif(btrim(full_name), ''), email) into v_by from public.ramp_members where id = public.ramp_me();
  end if;
  perform set_config('ramp.ws', v_t.workspace_id::text, true);    -- rate history is read in the timesheet's workspace
  select r.pay into v_pay from public.ramp_rates_at(v_p.id, v_t.week_start) r;
  perform set_config('ramp.ws', coalesce(v_prev, ''), true);
  update public.ramp_timesheets set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now(),
    reviewed_by = v_actor, review_note = left(coalesce(p_note, ''), 1000),
    pay_rate = case when p_approve then v_pay end
  where id = v_t.id;
  insert into public.ramp_audit(workspace_id, actor_id, action, member_id, detail, ip, user_agent)
  values (v_t.workspace_id, v_actor, case when p_approve then 'approved hours' else 'returned hours' end, v_t.member_id,
          'Week of ' || v_t.week_start || ': ' || v_t.total || ' h' || coalesce(' (by ' || v_by || ', client)', ''),
          public.ramp_req_ip(), public.ramp_req_ua());
end $$;

create or replace function public.ramp_client_feedback(p_placement uuid, p_score int, p_went_well text, p_improve text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_p public.ramp_placements; v_id uuid; v_every int; v_actor uuid; v_by text;
begin
  select * into v_p from public.ramp_placements where id = p_placement;
  if v_p.id is null or public.ramp_my_client() is distinct from v_p.client_id then raise exception 'You can’t give feedback on this placement.'; end if;
  if p_score is null or p_score not between 1 and 5 then raise exception 'Pick a score from 1 to 5.'; end if;
  if v_p.workspace_id = public.ramp_ws() then v_actor := public.ramp_me();
  else select coalesce(nullif(btrim(full_name), ''), email) into v_by from public.ramp_members where id = public.ramp_me();
  end if;
  select id into v_id from public.ramp_checkins where placement_id = v_p.id and workspace_id = v_p.workspace_id and kind = 'client'
    and status = 'scheduled' and due_date <= current_date + 7 order by due_date limit 1;
  if v_id is null then
    insert into public.ramp_checkins(workspace_id, placement_id, kind, due_date, status, done_at, by_member, score, went_well, improve, share_with_client)
    values (v_p.workspace_id, v_p.id, 'client', current_date, 'done', now(), v_actor, p_score, left(coalesce(p_went_well, ''), 4000),
            left(coalesce(p_improve, ''), 4000), true)
    returning id into v_id;
  else
    update public.ramp_checkins set status = 'done', done_at = now(), by_member = v_actor, score = p_score,
      went_well = left(coalesce(p_went_well, ''), 4000), improve = left(coalesce(p_improve, ''), 4000), share_with_client = true
    where id = v_id;
  end if;
  if not exists (select 1 from public.ramp_checkins where placement_id = v_p.id and kind = 'client' and status = 'scheduled') then
    select coalesce((agency->>'checkin_every_days')::int, 30) into v_every from public.ramp_org where workspace_id = v_p.workspace_id;
    insert into public.ramp_checkins(workspace_id, placement_id, kind, due_date) values (v_p.workspace_id, v_p.id, 'client', current_date + coalesce(v_every, 30));
  end if;
  insert into public.ramp_audit(workspace_id, actor_id, action, member_id, detail, ip, user_agent)
  values (v_p.workspace_id, v_actor, 'client feedback', v_p.member_id, 'score ' || p_score || coalesce(' (by ' || v_by || ')', ''),
          public.ramp_req_ip(), public.ramp_req_ua());
  return v_id;
end $$;

create or replace function public.ramp_client_request(p_placement uuid, p_kind text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_c uuid := public.ramp_my_client(); v_cws uuid; v_id uuid; v_actor uuid; v_by text; v_email text;
begin
  if v_c is null then raise exception 'Only client contacts can send requests here.'; end if;
  select workspace_id into v_cws from public.ramp_clients where id = v_c;
  if p_placement is not null and not exists (select 1 from public.ramp_placements where id = p_placement and client_id = v_c and workspace_id = v_cws) then
    raise exception 'That assistant isn’t on your account.';
  end if;
  if p_kind not in ('support','replacement','hours','new_va','other') then raise exception 'Pick what the request is about.'; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Write a short note so we know what you need.'; end if;
  if v_cws = public.ramp_ws() then v_actor := public.ramp_me();
  else select coalesce(nullif(btrim(full_name), ''), email), email into v_by, v_email from public.ramp_members where id = public.ramp_me();
  end if;
  insert into public.ramp_client_requests(workspace_id, client_id, placement_id, member_id, kind, body)
  values (v_cws, v_c, p_placement, v_actor, p_kind,
          left(btrim(p_body) || coalesce(E'\n\n— ' || v_by || ' <' || v_email || '>', ''), 4000))
  returning id into v_id;
  insert into public.ramp_audit(workspace_id, actor_id, action, detail, ip, user_agent)
  values (v_cws, v_actor, 'client request', p_kind || coalesce(' (by ' || v_by || ')', ''), public.ramp_req_ip(), public.ramp_req_ua());
  return v_id;
end $$;

create or replace function public.ramp_step_toggle(p_step uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.ramp_placement_steps; v_p public.ramp_placements; v_here boolean; v_ok boolean; v_actor uuid;
begin
  select * into v_s from public.ramp_placement_steps where id = p_step;
  if v_s.id is null then raise exception 'Step not found.'; end if;
  select * into v_p from public.ramp_placements where id = v_s.placement_id and workspace_id = v_s.workspace_id;
  v_here := v_s.workspace_id = public.ramp_ws();
  if v_here then
    v_actor := public.ramp_me();
    v_ok := public.ramp_is_coach(v_p.id)
         or (v_s.owner = 'va' and v_p.member_id = v_actor)
         or (v_s.owner = 'client' and public.ramp_my_client() = v_p.client_id);
  else
    v_ok := v_s.owner = 'client' and public.ramp_my_client() is not null and public.ramp_my_client() = v_p.client_id;
    if not v_ok and public.ramp_my_client() is distinct from v_p.client_id then raise exception 'Step not found.'; end if;
  end if;
  if not v_ok then raise exception 'You can’t change this step.'; end if;
  update public.ramp_placement_steps
     set done_at = case when p_done then coalesce(done_at, now()) end, done_by = case when p_done then v_actor end
   where id = v_s.id;
end $$;

-- ───────────────────────── launch plans ─────────────────────────

-- admin | coach | client | va | null. Admins and coaches only in the placement's own workspace; the client from its
-- linked workspace too; the assistant from any workspace they're signed in to.
create or replace function public.ramp_launch_role(p_placement uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_p public.ramp_placements; v_ws uuid := public.ramp_ws();
begin
  select * into v_p from public.ramp_placements where id = p_placement;
  if v_p.id is null or v_ws is null then return null; end if;
  if v_p.workspace_id = v_ws then
    if public.ramp_is_admin() then return 'admin'; end if;
    if public.ramp_is_coach(v_p.id) then return 'coach'; end if;
    if v_p.client_id = public.ramp_my_client() then return 'client'; end if;
    if v_p.member_id = public.ramp_me() then return 'va'; end if;
    return null;
  end if;
  if v_p.client_id = public.ramp_my_client() then return 'client'; end if;
  if exists (select 1 from public.ramp_members m where m.id = v_p.member_id and m.workspace_id = v_p.workspace_id
               and m.auth_user_id = auth.uid() and m.status = 'active') then
    return 'va';
  end if;
  return null;
end $$;

-- Storage paths launch/<placement id>/… : readable by everyone on the placement, writable by admin, coach and client.
create or replace function public.ramp_launch_file_ok(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid; v_role text;
begin
  if (storage.foldername(p_name))[1] is distinct from 'launch' then return false; end if;
  begin
    v_id := ((storage.foldername(p_name))[2])::uuid;
  exception when others then return false;
  end;
  v_role := public.ramp_launch_role(v_id);
  return v_role is not null and (not p_write or v_role in ('admin','coach','client'));
end $$;

-- Based on 006b: on-conflict-safe first open; assistants see no content while the plan is 'preparing'.
create or replace function public.ramp_launch_get(p_placement uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.ramp_launch_role(p_placement); v_plan public.ramp_launch_plans; v_agenda jsonb; v_out jsonb; v_res jsonb;
  v_p public.ramp_placements; v_actor uuid; v_prev text := current_setting('ramp.ws', true);
begin
  if v_role is null then raise exception 'You can’t open this launch plan.'; end if;
  select * into v_p from public.ramp_placements where id = p_placement;
  if v_p.workspace_id = public.ramp_ws() then v_actor := public.ramp_me(); end if;
  perform set_config('ramp.ws', v_p.workspace_id::text, true);   -- names are read in the placement's workspace
  select * into v_plan from public.ramp_launch_plans where placement_id = p_placement and workspace_id = v_p.workspace_id;
  if v_plan.placement_id is null and v_role <> 'va' then
    select coalesce(jsonb_agg(x || jsonb_build_object('done', false, 'notes', '')), '[]'::jsonb) into v_agenda
    from jsonb_array_elements(coalesce((select agency->'launch_agenda' from public.ramp_org where workspace_id = v_p.workspace_id), '[]'::jsonb)) x;
    insert into public.ramp_launch_plans(workspace_id, placement_id, agenda, day1_date, updated_by)
    values (v_p.workspace_id, p_placement, v_agenda, v_p.start_date, v_actor)
    on conflict (placement_id) do nothing;
    select * into v_plan from public.ramp_launch_plans where placement_id = p_placement and workspace_id = v_p.workspace_id;
  end if;
  v_out := case when v_plan.placement_id is null then null else to_jsonb(v_plan) end;
  -- Assistants only see the content once the plan is shared with them.
  if v_role = 'va' and v_out is not null and v_plan.status = 'preparing' then
    v_out := v_out || jsonb_build_object('data', '{}'::jsonb, 'agenda', '[]'::jsonb);
  end if;
  v_res := jsonb_build_object(
    'role', v_role,
    'plan', v_out,
    'placement', (select jsonb_build_object('id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date,
        'hours_per_week', p.hours_per_week, 'schedule', p.schedule,
        'client', jsonb_build_object('id', c.id, 'name', c.name, 'timezone', c.timezone),
        'va', jsonb_build_object('id', p.member_id, 'name', public.ramp_name(p.member_id)),
        'coach', jsonb_build_object('id', p.coach_id, 'name', public.ramp_name(p.coach_id)),
        'tier', (select jsonb_build_object('name', t.name, 'level', t.level) from public.ramp_tiers t where t.id = p.tier_id and t.workspace_id = p.workspace_id))
      from public.ramp_placements p join public.ramp_clients c on c.id = p.client_id and c.workspace_id = p.workspace_id
      where p.id = p_placement));
  perform set_config('ramp.ws', coalesce(v_prev, ''), true);
  return v_res;
end $$;

create or replace function public.ramp_launch_save(p_placement uuid, p_data jsonb, p_agenda jsonb, p_day1 date, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role text := public.ramp_launch_role(p_placement); v_ws uuid; v_actor uuid;
begin
  if v_role is null or v_role = 'va' then raise exception 'You can’t edit this launch plan.'; end if;
  if p_status not in ('preparing','ready','in_progress','done') then raise exception 'Unknown status.'; end if;
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_agenda, '[]'::jsonb)) <> 'array' then
    raise exception 'The plan couldn’t be read. Reload and try again.';
  end if;
  if length(coalesce(p_data, '{}'::jsonb)::text) > 300000 then raise exception 'The plan is too large. Link long documents instead of pasting them.'; end if;
  select workspace_id into v_ws from public.ramp_placements where id = p_placement;
  if v_ws = public.ramp_ws() then v_actor := public.ramp_me(); end if;
  insert into public.ramp_launch_plans(workspace_id, placement_id, status, day1_date, data, agenda, updated_by)
  values (v_ws, p_placement, p_status, p_day1, coalesce(p_data, '{}'::jsonb), coalesce(p_agenda, '[]'::jsonb), v_actor)
  on conflict (placement_id) do update set status = excluded.status, day1_date = excluded.day1_date, data = excluded.data,
    agenda = excluded.agenda, updated_by = excluded.updated_by;
end $$;

-- Based on 006b: save only if nobody else saved since p_expected. Returns the new updated_at.
create or replace function public.ramp_launch_save_if(p_placement uuid, p_data jsonb, p_agenda jsonb, p_day1 date, p_status text,
  p_expected timestamptz) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_role text := public.ramp_launch_role(p_placement); v_cur timestamptz; v_new timestamptz; v_ws uuid; v_actor uuid;
begin
  if v_role is null or v_role = 'va' then raise exception 'You can’t edit this launch plan.'; end if;
  if p_status not in ('preparing','ready','in_progress','done') then raise exception 'Unknown status.'; end if;
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_agenda, '[]'::jsonb)) <> 'array' then
    raise exception 'The plan couldn’t be read. Reload and try again.';
  end if;
  if length(coalesce(p_data, '{}'::jsonb)::text) > 300000 then raise exception 'The plan is too large. Link long documents instead of pasting them.'; end if;
  select workspace_id into v_ws from public.ramp_placements where id = p_placement;
  if v_ws = public.ramp_ws() then v_actor := public.ramp_me(); end if;
  select updated_at into v_cur from public.ramp_launch_plans where placement_id = p_placement for update;
  if found and p_expected is not null and v_cur is distinct from p_expected then
    raise exception 'Someone else saved changes to this plan while you were editing. Reload to see them.' using errcode = 'P0409';
  end if;
  insert into public.ramp_launch_plans(workspace_id, placement_id, status, day1_date, data, agenda, updated_by)
  values (v_ws, p_placement, p_status, p_day1, coalesce(p_data, '{}'::jsonb), coalesce(p_agenda, '[]'::jsonb), v_actor)
  on conflict (placement_id) do update set status = excluded.status, day1_date = excluded.day1_date, data = excluded.data,
    agenda = excluded.agenda, updated_by = excluded.updated_by
  returning updated_at into v_new;
  return v_new;
end $$;

-- ───────────────────────── ownership and privileges ─────────────────────────

do $$
declare f text;
begin
  foreach f in array array['ramp_my_client()', 'ramp_my_client_info()', 'ramp_clients_link_guard()', 'ramp_placement_sync_internal(uuid)',
    'ramp_placement_sync(uuid)', 'ramp_placements_sync_trg()', 'ramp_clients_link_sync()', 'ramp_client_link(uuid,uuid)',
    'ramp_client_portal()', 'ramp_client_invoices()', 'ramp_client_invoice(uuid)', 'ramp_timesheet_review(uuid,boolean,text)',
    'ramp_client_feedback(uuid,integer,text,text)', 'ramp_client_request(uuid,text,text)', 'ramp_step_toggle(uuid,boolean)',
    'ramp_launch_role(uuid)', 'ramp_launch_file_ok(text,boolean)', 'ramp_launch_get(uuid)', 'ramp_launch_save(uuid,jsonb,jsonb,date,text)',
    'ramp_launch_save_if(uuid,jsonb,jsonb,date,text,timestamptz)'] loop
    execute format('comment on function public.%s is %L', f, 'RAMP: postgres-owned (bypasses RLS); filters by workspace itself.');
    execute format('alter function public.%s owner to postgres', f);
  end loop;
end $$;

do $$
declare r record; f text;
begin
  for r in select p.oid::regprocedure as sig, pg_get_userbyid(p.proowner) as owner, coalesce(obj_description(p.oid, 'pg_proc'), '') as note
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'ramp\_%' loop
    if r.note not like 'RAMP: postgres-owned%' and r.owner <> 'ramp_owner' then
      execute format('alter function %s owner to ramp_owner', r.sig);
    end if;
    execute format('grant execute on function %s to ramp_owner', r.sig);
  end loop;
  foreach f in array array['ramp_my_client_info()', 'ramp_placement_sync(uuid)', 'ramp_client_link(uuid,uuid)',
                           'ramp_client_invoices()', 'ramp_client_invoice(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['ramp_placement_sync_internal(uuid)', 'ramp_placements_sync_trg()', 'ramp_clients_link_sync()',
                           'ramp_clients_link_guard()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
