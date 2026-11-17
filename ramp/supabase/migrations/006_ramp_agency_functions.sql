-- RAMP agency layer, part 2: functions the app calls.
-- Nothing here deletes data: draft invoices are voided and draft payouts are marked discarded.
-- Admins run placements, billing and payouts. Coaches (a placement's coach, or the assistant's mentor) run
-- check-ins and checklists. Assistants log hours and keep payout details. Clients approve hours and give feedback.

alter table public.ramp_payouts add column if not exists discarded_at timestamptz;

create or replace function public.ramp_week_start(p_date date) returns date
language sql immutable set search_path = '' as $$ select p_date - (extract(isodow from p_date)::int - 1) $$;

create or replace function public.ramp_name(p_member uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(preferred_name), ''), nullif(btrim(full_name), ''), split_part(email, '@', 1))
  from public.ramp_members where id = p_member
$$;

create or replace function public.ramp_is_coach(p_placement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.ramp_is_admin() or exists (
    select 1 from public.ramp_placements p
    where p.id = p_placement and public.ramp_my_rank() <= 4
      and (p.coach_id = public.ramp_me()
           or exists (select 1 from public.ramp_members m where m.id = p.member_id and m.mentor_id = public.ramp_me())))
$$;

create or replace function public.ramp_audit_add(p_action text, p_member uuid, p_detail text) returns void
language sql security definer set search_path = '' as $$
  insert into public.ramp_audit(actor_id, action, member_id, detail, ip, user_agent)
  values (public.ramp_me(), p_action, p_member, left(coalesce(p_detail, ''), 500), public.ramp_req_ip(), public.ramp_req_ua())
$$;

-- Training progress for one person (company-required, role track and client tracks).
create or replace function public.ramp_training_summary(p_member uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with m as (select * from public.ramp_members where id = p_member),
  assigned as (
    select mo.id, mo.title, mo.sort from public.ramp_modules mo, m
    where mo.status = 'published' and (
      (mo.track = 'company' and mo.required)
      or (mo.track = 'role' and exists (select 1 from public.ramp_role_modules rm where rm.module_id = mo.id and rm.job_role_id = m.job_role_id))
      or exists (select 1 from public.ramp_client_modules cm join public.ramp_placements p on p.client_id = cm.client_id
                 where cm.module_id = mo.id and p.member_id = m.id and p.status <> 'ended'))
  ),
  done as (select a.id from assigned a join public.ramp_progress pr on pr.module_id = a.id and pr.member_id = p_member and pr.status = 'completed')
  select jsonb_build_object(
    'total', (select count(*) from assigned),
    'done', (select count(*) from done),
    'pct', case when (select count(*) from assigned) = 0 then 0 else round(100.0 * (select count(*) from done) / (select count(*) from assigned)) end,
    'next', (select a.title from assigned a where a.id not in (select id from done) order by a.sort limit 1))
$$;

-- ───────────────────────── placements (admin) ─────────────────────────

-- Fill in a new placement's checklist and check-in schedule from the agency settings.
create or replace function public.ramp_placement_seed(p_placement uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_p public.ramp_placements; v_a jsonb; v_s jsonb; v_d int; v_i int := 0;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can set up placements.'; end if;
  select * into v_p from public.ramp_placements where id = p_placement;
  if v_p.id is null then raise exception 'Placement not found.'; end if;
  select agency into v_a from public.ramp_org;
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
  return v_i;
end $$;

-- Change tier and rates from a date. Old rates stay in the history so past weeks bill and pay correctly.
create or replace function public.ramp_rate_change(p_placement uuid, p_tier uuid, p_bill numeric, p_pay numeric, p_effective date, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.ramp_placements; v_old text; v_new text;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can change rates.'; end if;
  select * into v_p from public.ramp_placements where id = p_placement;
  if v_p.id is null then raise exception 'Placement not found.'; end if;
  if coalesce(p_bill, -1) < 0 or coalesce(p_pay, -1) < 0 then raise exception 'Enter both rates.'; end if;
  if p_bill < p_pay then raise exception 'The bill rate is lower than the pay rate. Check the numbers.'; end if;
  insert into public.ramp_rate_changes(placement_id, effective_date, old_tier_id, new_tier_id, old_bill, new_bill, old_pay, new_pay, reason, created_by)
  values (v_p.id, coalesce(p_effective, current_date), v_p.tier_id, p_tier, v_p.bill_rate, p_bill, v_p.pay_rate, p_pay,
          left(coalesce(p_reason, ''), 500), public.ramp_me());
  select name into v_old from public.ramp_tiers where id = v_p.tier_id;
  select name into v_new from public.ramp_tiers where id = p_tier;
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_placements set tier_id = p_tier, bill_rate = p_bill, pay_rate = p_pay where id = v_p.id;
  perform public.ramp_audit_add(case when v_old is distinct from v_new then 'changed tier' else 'changed rate' end, v_p.member_id,
    coalesce(v_old, 'no tier') || ' → ' || coalesce(v_new, 'no tier') || ', bill ' || v_p.bill_rate || ' → ' || p_bill
    || ', pay ' || v_p.pay_rate || ' → ' || p_pay || ' from ' || coalesce(p_effective, current_date));
end $$;

create or replace function public.ramp_invite_client(p_email text, p_name text, p_client uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can invite clients.'; end if;
  if position('@' in v_email) < 2 then raise exception 'Enter a valid email address.'; end if;
  if not exists (select 1 from public.ramp_clients where id = p_client) then raise exception 'Client not found.'; end if;
  if exists (select 1 from public.ramp_members where email = v_email) then raise exception '% is already in RAMP.', v_email; end if;
  insert into public.ramp_members(email, full_name, level, client_id, status, source, invited_by)
  values (v_email, left(btrim(coalesce(p_name, '')), 120), 'client', p_client, 'invited', 'manual', public.ramp_me())
  returning id into v_id;
  perform public.ramp_audit_add('invited', v_id, v_email || ' as client contact');
  return v_id;
end $$;

-- ───────────────────────── checklists and check-ins (coach) ─────────────────────────

create or replace function public.ramp_step_toggle(p_step uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.ramp_placement_steps; v_p public.ramp_placements; v_me uuid := public.ramp_me();
begin
  select * into v_s from public.ramp_placement_steps where id = p_step;
  if v_s.id is null then raise exception 'Step not found.'; end if;
  select * into v_p from public.ramp_placements where id = v_s.placement_id;
  if not (public.ramp_is_coach(v_p.id)
          or (v_s.owner = 'va' and v_p.member_id = v_me)
          or (v_s.owner = 'client' and public.ramp_my_client() = v_p.client_id)) then
    raise exception 'You can’t change this step.';
  end if;
  update public.ramp_placement_steps
     set done_at = case when p_done then coalesce(done_at, now()) end, done_by = case when p_done then v_me end
   where id = v_s.id;
end $$;

create or replace function public.ramp_checkin_save(p_id uuid, p_placement uuid, p_kind text, p_due date, p_status text,
  p_score int, p_went_well text, p_improve text, p_actions text, p_share boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_every int; v_member uuid;
begin
  if not public.ramp_is_coach(p_placement) then raise exception 'Only the coach or an admin can record check-ins.'; end if;
  if p_kind not in ('client','va') then raise exception 'Pick who the check-in is with.'; end if;
  if p_status not in ('scheduled','done','skipped') then raise exception 'Unknown status.'; end if;
  if p_status = 'done' and p_score is null then raise exception 'Give the check-in a score from 1 to 5.'; end if;
  if v_id is null then
    insert into public.ramp_checkins(placement_id, kind, due_date, status, done_at, by_member, score, went_well, improve, actions, share_with_client)
    values (p_placement, p_kind, coalesce(p_due, current_date), p_status, case when p_status = 'done' then now() end,
            case when p_status = 'done' then public.ramp_me() end, p_score, left(coalesce(p_went_well, ''), 4000),
            left(coalesce(p_improve, ''), 4000), left(coalesce(p_actions, ''), 4000), coalesce(p_share, false))
    returning id into v_id;
  else
    update public.ramp_checkins set kind = p_kind, due_date = coalesce(p_due, due_date), status = p_status,
      done_at = case when p_status = 'done' then coalesce(done_at, now()) end,
      by_member = case when p_status = 'done' then coalesce(by_member, public.ramp_me()) end,
      score = p_score, went_well = left(coalesce(p_went_well, ''), 4000), improve = left(coalesce(p_improve, ''), 4000),
      actions = left(coalesce(p_actions, ''), 4000), share_with_client = coalesce(p_share, false)
    where id = v_id and placement_id = p_placement;
    if not found then raise exception 'Check-in not found.'; end if;
  end if;
  if p_status = 'done' and not exists (select 1 from public.ramp_checkins
       where placement_id = p_placement and kind = p_kind and status = 'scheduled') then
    select coalesce((agency->>'checkin_every_days')::int, 30) into v_every from public.ramp_org;
    insert into public.ramp_checkins(placement_id, kind, due_date) values (p_placement, p_kind, current_date + v_every);
  end if;
  if p_status = 'done' then
    select member_id into v_member from public.ramp_placements where id = p_placement;
    perform public.ramp_audit_add('checked in', v_member, p_kind || ' check-in, score ' || p_score);
  end if;
  return v_id;
end $$;

create or replace function public.ramp_coach_placements() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'status', x->'va'->>'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date, 'hours_per_week', p.hours_per_week,
      'schedule', p.schedule, 'guarantee_until', p.guarantee_until,
      'client', jsonb_build_object('id', c.id, 'name', c.name, 'timezone', c.timezone),
      'va', jsonb_build_object('id', m.id, 'name', public.ramp_name(m.id), 'email', m.email),
      'tier', (select jsonb_build_object('id', t.id, 'name', t.name, 'level', t.level) from public.ramp_tiers t where t.id = p.tier_id),
      'steps_total', (select count(*) from public.ramp_placement_steps s where s.placement_id = p.id),
      'steps_done', (select count(*) from public.ramp_placement_steps s where s.placement_id = p.id and s.done_at is not null),
      'next_checkin', (select jsonb_build_object('id', k.id, 'kind', k.kind, 'due_date', k.due_date) from public.ramp_checkins k
                       where k.placement_id = p.id and k.status = 'scheduled' order by k.due_date limit 1),
      'last_score', (select k.score from public.ramp_checkins k where k.placement_id = p.id and k.status = 'done' order by k.done_at desc limit 1),
      'training', public.ramp_training_summary(m.id)) as x
    from public.ramp_placements p
    join public.ramp_clients c on c.id = p.client_id
    join public.ramp_members m on m.id = p.member_id
    where p.status <> 'ended' and public.ramp_is_coach(p.id)
  ) q
$$;

create or replace function public.ramp_coach_placement(p_placement uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.ramp_is_coach(p_placement) then raise exception 'You don’t coach this placement.'; end if;
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date, 'end_date', p.end_date,
    'hours_per_week', p.hours_per_week, 'schedule', p.schedule, 'notes', p.notes, 'guarantee_until', p.guarantee_until,
    'client', jsonb_build_object('id', c.id, 'name', c.name, 'timezone', c.timezone, 'website', c.website),
    'va', jsonb_build_object('id', m.id, 'name', public.ramp_name(m.id), 'email', m.email, 'timezone', m.timezone),
    'coach', jsonb_build_object('id', p.coach_id, 'name', public.ramp_name(p.coach_id)),
    'tier', (select jsonb_build_object('id', t.id, 'name', t.name, 'level', t.level) from public.ramp_tiers t where t.id = p.tier_id),
    'training', public.ramp_training_summary(m.id),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'owner', s.owner, 'done_at', s.done_at,
                 'done_by', public.ramp_name(s.done_by), 'note', s.note) order by s.sort) from public.ramp_placement_steps s where s.placement_id = p.id), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(k) || jsonb_build_object('by_name', public.ramp_name(k.by_member))
                 order by coalesce(k.done_at::date, k.due_date) desc) from public.ramp_checkins k where k.placement_id = p.id), '[]'::jsonb),
    'timesheets', coalesce((select jsonb_agg(jsonb_build_object('id', ts.id, 'week_start', ts.week_start, 'total', ts.total, 'status', ts.status,
                 'days', ts.days, 'notes', ts.notes, 'review_note', ts.review_note) order by ts.week_start desc)
                 from (select * from public.ramp_timesheets where placement_id = p.id order by week_start desc limit 12) ts), '[]'::jsonb))
  into v
  from public.ramp_placements p join public.ramp_clients c on c.id = p.client_id join public.ramp_members m on m.id = p.member_id
  where p.id = p_placement;
  return v;
end $$;

-- ───────────────────────── assistant ─────────────────────────

create or replace function public.ramp_my_roles() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'work', exists (select 1 from public.ramp_placements where member_id = public.ramp_me() and status <> 'ended'),
    'coaching', (select count(*) from public.ramp_placements p where p.status <> 'ended' and public.ramp_my_rank() <= 4
                   and (p.coach_id = public.ramp_me() or exists (select 1 from public.ramp_members m where m.id = p.member_id and m.mentor_id = public.ramp_me()))),
    'client', (select jsonb_build_object('id', c.id, 'name', c.name) from public.ramp_clients c where c.id = public.ramp_my_client()))
$$;

create or replace function public.ramp_my_work() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me();
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  return jsonb_build_object(
    'placements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date, 'end_date', p.end_date,
        'hours_per_week', p.hours_per_week, 'schedule', p.schedule, 'pay_rate', p.pay_rate, 'currency', p.currency,
        'client', jsonb_build_object('name', c.name, 'timezone', c.timezone, 'website', c.website),
        'coach', jsonb_build_object('id', p.coach_id, 'name', public.ramp_name(p.coach_id)),
        'tier', (select jsonb_build_object('id', t.id, 'name', t.name, 'level', t.level) from public.ramp_tiers t where t.id = p.tier_id),
        'steps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'owner', s.owner, 'done_at', s.done_at) order by s.sort)
                           from public.ramp_placement_steps s where s.placement_id = p.id), '[]'::jsonb),
        'next_checkin', (select k.due_date from public.ramp_checkins k where k.placement_id = p.id and k.kind = 'va' and k.status = 'scheduled' order by k.due_date limit 1),
        'checkin_avg', (select round(avg(score), 2) from (select k.score from public.ramp_checkins k where k.placement_id = p.id and k.status = 'done'
                         and k.score is not null order by k.done_at desc limit 3) z),
        'days_active', case when p.start_date is not null then greatest(current_date - p.start_date, 0) end)
        order by (p.status = 'ended'), p.start_date desc nulls last)
      from public.ramp_placements p join public.ramp_clients c on c.id = p.client_id
      where p.member_id = v_me and (p.status <> 'ended' or coalesce(p.end_date, current_date) > current_date - 90)), '[]'::jsonb),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'level', t.level, 'description', t.description,
        'pay_rate', t.pay_rate, 'required_modules', t.required_modules, 'min_days', t.min_days, 'min_checkin_score', t.min_checkin_score,
        'module_titles', (select coalesce(jsonb_agg(mo.title order by mo.sort), '[]'::jsonb) from public.ramp_modules mo where mo.id = any(t.required_modules)))
        order by t.level) from public.ramp_tiers t), '[]'::jsonb),
    'completed_modules', coalesce((select jsonb_agg(module_id) from public.ramp_progress where member_id = v_me and status = 'completed'), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'payout_id', po.id, 'label', po.label, 'status', po.status,
        'sent_at', po.sent_at, 'description', l.description, 'quantity', l.quantity, 'rate', l.rate, 'amount', l.amount, 'currency', po.currency)
        order by po.period_end desc) from public.ramp_payout_lines l join public.ramp_payouts po on po.id = l.payout_id
        where l.member_id = v_me and po.discarded_at is null), '[]'::jsonb),
    'payee', public.ramp_payee_get(null));
end $$;

create or replace function public.ramp_timesheet_save(p_placement uuid, p_week date, p_days numeric[], p_notes text, p_submit boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_p public.ramp_placements; v_t public.ramp_timesheets;
  v_week date := public.ramp_week_start(p_week); v_id uuid; v_sum numeric := 0; v_x numeric;
begin
  if v_me is null then raise exception 'Not signed in to RAMP.'; end if;
  select * into v_p from public.ramp_placements where id = p_placement and member_id = v_me;
  if v_p.id is null then raise exception 'That placement isn’t yours.'; end if;
  if v_p.status = 'proposed' then raise exception 'You can log hours once this placement starts.'; end if;
  if v_week > public.ramp_week_start(current_date) then raise exception 'You can’t log hours for a future week.'; end if;
  if coalesce(array_length(p_days, 1), 0) <> 7 then raise exception 'Send hours for all seven days.'; end if;
  foreach v_x in array p_days loop
    if v_x is null or v_x < 0 or v_x > 24 then raise exception 'Each day must be between 0 and 24 hours.'; end if;
    v_sum := v_sum + v_x;
  end loop;
  if p_submit and v_sum = 0 then raise exception 'Add your hours before sending them.'; end if;
  select * into v_t from public.ramp_timesheets where placement_id = v_p.id and week_start = v_week;
  if v_t.id is not null and v_t.status in ('submitted','approved') then
    raise exception 'This week has already been sent. Ask your coach if something needs to change.';
  end if;
  insert into public.ramp_timesheets(placement_id, member_id, week_start, days, notes, status, submitted_at)
  values (v_p.id, v_me, v_week, p_days, left(coalesce(p_notes, ''), 2000),
          case when p_submit then 'submitted' else 'draft' end, case when p_submit then now() end)
  on conflict (placement_id, week_start) do update set days = excluded.days, notes = excluded.notes, status = excluded.status,
    submitted_at = excluded.submitted_at, review_note = case when excluded.status = 'submitted' then '' else public.ramp_timesheets.review_note end
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.ramp_payee_get(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_m uuid := coalesce(p_member, public.ramp_me()); v jsonb;
begin
  if v_m is null then return null; end if;
  if v_m <> coalesce(public.ramp_me(), '00000000-0000-0000-0000-000000000000'::uuid) and not public.ramp_is_admin() then
    raise exception 'You can’t see these payout details.';
  end if;
  select jsonb_build_object('method', method, 'account_name', account_name, 'email', email, 'wise_recipient_id', wise_recipient_id,
    'target_currency', target_currency, 'has_bank', bank_details is not null, 'notes', notes, 'updated_at', updated_at)
  into v from public.ramp_payees where member_id = v_m;
  return v;
end $$;

create or replace function public.ramp_payee_save(p_member uuid, p_method text, p_account_name text, p_email text,
  p_wise_recipient_id text, p_target_currency text, p_bank jsonb, p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m uuid := coalesce(p_member, public.ramp_me()); v_key text;
begin
  if v_m is null then raise exception 'Not signed in to RAMP.'; end if;
  if v_m <> coalesce(public.ramp_me(), '00000000-0000-0000-0000-000000000000'::uuid) and not public.ramp_is_admin() then
    raise exception 'You can’t change these payout details.';
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

create or replace function public.ramp_payee_reveal(p_member uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_m uuid := coalesce(p_member, public.ramp_me()); v_b bytea;
begin
  if v_m is null then raise exception 'Not signed in to RAMP.'; end if;
  if v_m <> coalesce(public.ramp_me(), '00000000-0000-0000-0000-000000000000'::uuid) and not public.ramp_is_admin() then
    raise exception 'You can’t see these payout details.';
  end if;
  select bank_details into v_b from public.ramp_payees where member_id = v_m;
  if v_b is null then return null; end if;
  if v_m <> public.ramp_me() then perform public.ramp_audit_add('revealed payout details', v_m, 'bank details'); end if;
  return extensions.pgp_sym_decrypt(v_b, public.ramp_key())::jsonb;
end $$;

-- ───────────────────────── hours (admin and client) ─────────────────────────

create or replace function public.ramp_timesheet_review(p_timesheet uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.ramp_timesheets; v_p public.ramp_placements; v_pay numeric;
begin
  select * into v_t from public.ramp_timesheets where id = p_timesheet;
  if v_t.id is null then raise exception 'Timesheet not found.'; end if;
  select * into v_p from public.ramp_placements where id = v_t.placement_id;
  if not (public.ramp_is_admin() or (public.ramp_my_client() is not null and public.ramp_my_client() = v_p.client_id)) then
    raise exception 'You can’t review these hours.';
  end if;
  if v_t.status <> 'submitted' then raise exception 'These hours aren’t waiting for review.'; end if;
  if not p_approve and btrim(coalesce(p_note, '')) = '' then raise exception 'Add a note so the assistant knows what to fix.'; end if;
  select r.pay into v_pay from public.ramp_rates_at(v_p.id, v_t.week_start) r;
  update public.ramp_timesheets set status = case when p_approve then 'approved' else 'rejected' end, reviewed_at = now(),
    reviewed_by = public.ramp_me(), review_note = left(coalesce(p_note, ''), 1000),
    pay_rate = case when p_approve then v_pay end
  where id = v_t.id;
  perform public.ramp_audit_add(case when p_approve then 'approved hours' else 'returned hours' end, v_t.member_id,
    'Week of ' || v_t.week_start || ': ' || v_t.total || ' h');
end $$;

-- Admins can enter or correct hours for any week that hasn't been billed or paid.
create or replace function public.ramp_timesheet_admin_save(p_placement uuid, p_week date, p_days numeric[], p_notes text, p_approve boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_p public.ramp_placements; v_t public.ramp_timesheets; v_week date := public.ramp_week_start(p_week); v_id uuid; v_pay numeric; v_x numeric;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can enter hours for someone else.'; end if;
  select * into v_p from public.ramp_placements where id = p_placement;
  if v_p.id is null then raise exception 'Placement not found.'; end if;
  if coalesce(array_length(p_days, 1), 0) <> 7 then raise exception 'Send hours for all seven days.'; end if;
  foreach v_x in array p_days loop
    if v_x is null or v_x < 0 or v_x > 24 then raise exception 'Each day must be between 0 and 24 hours.'; end if;
  end loop;
  select * into v_t from public.ramp_timesheets where placement_id = v_p.id and week_start = v_week;
  if v_t.invoice_line_id is not null or v_t.payout_line_id is not null then
    raise exception 'This week is already on an invoice or payout. Void that first.';
  end if;
  select r.pay into v_pay from public.ramp_rates_at(v_p.id, v_week) r;
  insert into public.ramp_timesheets(placement_id, member_id, week_start, days, notes, status, submitted_at, reviewed_at, reviewed_by, pay_rate)
  values (v_p.id, v_p.member_id, v_week, p_days, left(coalesce(p_notes, ''), 2000),
          case when p_approve then 'approved' else 'submitted' end, now(),
          case when p_approve then now() end, case when p_approve then public.ramp_me() end, case when p_approve then v_pay end)
  on conflict (placement_id, week_start) do update set days = excluded.days, notes = excluded.notes, status = excluded.status,
    submitted_at = coalesce(public.ramp_timesheets.submitted_at, excluded.submitted_at), reviewed_at = excluded.reviewed_at,
    reviewed_by = excluded.reviewed_by, pay_rate = excluded.pay_rate, review_note = ''
  returning id into v_id;
  perform public.ramp_audit_add('entered hours', v_p.member_id, 'Week of ' || v_week);
  return v_id;
end $$;

-- ───────────────────────── invoices (admin) ─────────────────────────

create or replace function public.ramp_prepay_covers(p_placement uuid, p_week date, p_paid_only boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ramp_invoice_lines l join public.ramp_invoices i on i.id = l.invoice_id
                 where l.placement_id = p_placement and l.kind = 'prepay' and i.status <> 'void'
                   and (not p_paid_only or i.status = 'paid')
                   and p_week between l.period_start and l.period_end)
$$;

create or replace function public.ramp_invoice_generate(p_client uuid, p_start date, p_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.ramp_clients; v_a jsonb; v_inv uuid; v_num text; v_sort int := 0; v_line uuid;
  v_r record; v_pl record; v_pp record; v_weeks numeric; v_actual numeric; v_pending int; v_from date;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can create invoices.'; end if;
  select * into v_c from public.ramp_clients where id = p_client;
  if v_c.id is null then raise exception 'Client not found.'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Pick a period that ends after it starts.'; end if;
  select agency into v_a from public.ramp_org for update;
  v_num := coalesce(nullif(v_a->>'invoice_prefix', ''), 'INV') || '-' || coalesce((v_a->>'next_invoice_number')::int, 1001);
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_org set agency = jsonb_set(agency, '{next_invoice_number}', to_jsonb(coalesce((v_a->>'next_invoice_number')::int, 1001) + 1));
  insert into public.ramp_invoices(client_id, number, period_start, period_end, currency, created_by)
  values (v_c.id, v_num, p_start, p_end, v_c.currency, public.ramp_me()) returning id into v_inv;

  -- Approved hours not billed yet (in advance mode, only weeks no prepayment covered).
  for v_r in
    with ts as (
      select t.id, t.placement_id, t.week_start, t.total, (select r.bill from public.ramp_rates_at(t.placement_id, t.week_start) r) as rate
      from public.ramp_timesheets t join public.ramp_placements p on p.id = t.placement_id
      where p.client_id = v_c.id and t.status = 'approved' and t.invoice_line_id is null and t.week_start <= p_end
        and (v_c.billing_mode = 'arrears' or not public.ramp_prepay_covers(t.placement_id, t.week_start, false)))
    select ts.placement_id, ts.rate, array_agg(ts.id) as ids, sum(ts.total) as hrs, min(ts.week_start) as w1, max(ts.week_start) as w2
    from ts group by ts.placement_id, ts.rate having sum(ts.total) > 0
  loop
    insert into public.ramp_invoice_lines(invoice_id, placement_id, kind, description, quantity, unit_price, period_start, period_end, sort)
    select v_inv, p.id, 'hours',
           public.ramp_name(p.member_id) || ' · ' || p.title || ' · hours, weeks of ' || to_char(v_r.w1, 'Mon DD')
             || case when v_r.w2 <> v_r.w1 then ' to ' || to_char(v_r.w2, 'Mon DD') else '' end,
           v_r.hrs, v_r.rate, v_r.w1, v_r.w2 + 6, v_sort
    from public.ramp_placements p where p.id = v_r.placement_id
    returning id into v_line;
    v_sort := v_sort + 1;
    update public.ramp_timesheets set invoice_line_id = v_line where id = any(v_r.ids);
  end loop;

  if v_c.billing_mode = 'advance' then
    -- Settle prepaid periods that have ended and whose hours are all approved.
    for v_pl in
      select l.* from public.ramp_invoice_lines l join public.ramp_invoices i on i.id = l.invoice_id
      join public.ramp_placements p on p.id = l.placement_id
      where p.client_id = v_c.id and l.kind = 'prepay' and i.status <> 'void' and l.reconciled_at is null and l.period_end < p_start
      order by l.period_start
    loop
      select count(*) into v_pending from public.ramp_timesheets t
      where t.placement_id = v_pl.placement_id and t.week_start between v_pl.period_start and v_pl.period_end and t.status <> 'approved';
      continue when v_pending > 0;
      select coalesce(sum(t.total), 0) into v_actual from public.ramp_timesheets t
      where t.placement_id = v_pl.placement_id and t.week_start between v_pl.period_start and v_pl.period_end
        and t.status = 'approved' and t.invoice_line_id is null;
      v_line := null;
      if v_actual <> v_pl.quantity then
        insert into public.ramp_invoice_lines(invoice_id, placement_id, kind, description, quantity, unit_price, period_start, period_end, sort)
        select v_inv, p.id, 'adjustment',
               public.ramp_name(p.member_id) || ' · adjustment for ' || to_char(v_pl.period_start, 'Mon DD') || ' to '
                 || to_char(v_pl.period_end, 'Mon DD') || ': ' || v_actual || ' h worked, ' || v_pl.quantity || ' h prepaid',
               v_actual - v_pl.quantity, v_pl.unit_price, v_pl.period_start, v_pl.period_end, v_sort
        from public.ramp_placements p where p.id = v_pl.placement_id
        returning id into v_line;
        v_sort := v_sort + 1;
      end if;
      update public.ramp_timesheets set invoice_line_id = coalesce(v_line, v_pl.id)
      where placement_id = v_pl.placement_id and week_start between v_pl.period_start and v_pl.period_end
        and status = 'approved' and invoice_line_id is null;
      update public.ramp_invoice_lines set reconciled_at = now() where id = v_pl.id;
    end loop;

    -- Prepay the scheduled hours for this period.
    for v_pp in
      select p.* from public.ramp_placements p
      where p.client_id = v_c.id and p.status in ('onboarding','active') and p.hours_per_week > 0
        and coalesce(p.start_date, p_start) <= p_end
        and not exists (select 1 from public.ramp_invoice_lines l join public.ramp_invoices i on i.id = l.invoice_id
                        where l.placement_id = p.id and l.kind = 'prepay' and i.status <> 'void'
                          and l.period_start <= p_end and l.period_end >= p_start)
    loop
      v_from := greatest(p_start, coalesce(v_pp.start_date, p_start));
      v_weeks := round(((p_end - v_from) + 1) / 7.0, 2);
      continue when v_weeks <= 0;
      insert into public.ramp_invoice_lines(invoice_id, placement_id, kind, description, quantity, unit_price, period_start, period_end, sort)
      values (v_inv, v_pp.id, 'prepay',
              public.ramp_name(v_pp.member_id) || ' · ' || v_pp.title || ' · prepaid ' || v_pp.hours_per_week || ' h/week, '
                || to_char(v_from, 'Mon DD') || ' to ' || to_char(p_end, 'Mon DD'),
              round(v_pp.hours_per_week * v_weeks, 2), v_pp.bill_rate, v_from, p_end, v_sort);
      v_sort := v_sort + 1;
    end loop;
  end if;

  -- One-time setup fees.
  for v_pp in select p.* from public.ramp_placements p where p.client_id = v_c.id and p.setup_fee > 0 and p.setup_fee_status = 'unbilled' loop
    insert into public.ramp_invoice_lines(invoice_id, placement_id, kind, description, quantity, unit_price, sort)
    values (v_inv, v_pp.id, 'setup_fee', 'Setup: recruiting, training and onboarding · ' || public.ramp_name(v_pp.member_id), 1, v_pp.setup_fee, v_sort);
    v_sort := v_sort + 1;
    update public.ramp_placements set setup_fee_status = 'invoiced' where id = v_pp.id;
  end loop;

  if v_sort = 0 then raise exception 'Nothing to bill for % in this period yet.', v_c.name; end if;
  perform public.ramp_audit_add('created invoice', null, v_num || ' for ' || v_c.name);
  return v_inv;
end $$;

-- Undo what an invoice claimed: its hours can be billed again, setup fees return to unbilled,
-- and prepaid periods it settled are open again.
create or replace function public.ramp_invoice_release(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_timesheets set invoice_line_id = null
  where invoice_line_id in (select id from public.ramp_invoice_lines where invoice_id = p_invoice);
  update public.ramp_invoice_lines l set reconciled_at = null
  where l.kind = 'prepay' and exists (select 1 from public.ramp_invoice_lines a where a.invoice_id = p_invoice and a.kind = 'adjustment'
        and a.placement_id = l.placement_id and a.period_start = l.period_start and a.period_end = l.period_end);
  update public.ramp_placements set setup_fee_status = 'unbilled'
  where setup_fee_status = 'invoiced' and id in (select placement_id from public.ramp_invoice_lines where invoice_id = p_invoice and kind = 'setup_fee');
end $$;

create or replace function public.ramp_invoice_set_status(p_invoice uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_i public.ramp_invoices; v_net int;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can change invoices.'; end if;
  select * into v_i from public.ramp_invoices where id = p_invoice for update;
  if v_i.id is null then raise exception 'Invoice not found.'; end if;
  perform set_config('ramp.bypass', 'on', true);
  if p_status = 'open' then
    if v_i.status <> 'draft' then raise exception 'Only a draft can be issued.'; end if;
    if v_i.total <= 0 then raise exception 'This invoice has nothing to charge.'; end if;
    select net_days into v_net from public.ramp_clients where id = v_i.client_id;
    update public.ramp_invoices set status = 'open', issue_date = current_date, due_date = current_date + coalesce(v_net, 7) where id = v_i.id;
  elsif p_status = 'paid' then
    if v_i.status <> 'open' then raise exception 'Issue the invoice before marking it paid.'; end if;
    update public.ramp_invoices set status = 'paid', paid_at = now(), paid_note = left(coalesce(p_note, ''), 500) where id = v_i.id;
    update public.ramp_placements set setup_fee_status = 'paid'
    where id in (select placement_id from public.ramp_invoice_lines where invoice_id = v_i.id and kind = 'setup_fee');
  elsif p_status = 'void' then
    if v_i.status = 'paid' then raise exception 'A paid invoice can’t be voided. Add a credit to the next invoice instead.'; end if;
    if v_i.status = 'void' then return; end if;
    perform public.ramp_invoice_release(v_i.id);
    update public.ramp_invoices set status = 'void', notes = trim(both from notes || ' ' || coalesce(p_note, '')) where id = v_i.id;
  else
    raise exception 'Unknown status.';
  end if;
  perform public.ramp_audit_add(p_status || ' invoice', null, v_i.number);
end $$;


-- Called by the Stripe functions (service role only).
create or replace function public.ramp_invoice_stripe_sent(p_invoice uuid, p_stripe_id text, p_url text, p_pdf text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_net int;
begin
  perform set_config('ramp.bypass', 'on', true);
  select c.net_days into v_net from public.ramp_invoices i join public.ramp_clients c on c.id = i.client_id where i.id = p_invoice;
  update public.ramp_invoices set stripe_invoice_id = p_stripe_id, stripe_url = p_url, stripe_pdf = p_pdf, sent_at = now(),
    status = case when status = 'draft' then 'open' else status end,
    issue_date = coalesce(issue_date, current_date), due_date = coalesce(due_date, current_date + coalesce(v_net, 7))
  where id = p_invoice;
end $$;

create or replace function public.ramp_invoice_stripe_event(p_stripe_id text, p_event text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_i public.ramp_invoices;
begin
  perform set_config('ramp.bypass', 'on', true);
  select * into v_i from public.ramp_invoices where stripe_invoice_id = p_stripe_id;
  if v_i.id is null then return 'unknown invoice'; end if;
  if p_event = 'invoice.paid' and v_i.status <> 'paid' then
    update public.ramp_invoices set status = 'paid', paid_at = now(), paid_note = 'Paid through Stripe' where id = v_i.id;
    update public.ramp_placements set setup_fee_status = 'paid'
    where id in (select placement_id from public.ramp_invoice_lines where invoice_id = v_i.id and kind = 'setup_fee');
    insert into public.ramp_audit(action, detail) values ('paid invoice', v_i.number || ' through Stripe');
  elsif p_event = 'invoice.voided' and v_i.status = 'open' then
    perform public.ramp_invoice_release(v_i.id);
    update public.ramp_invoices set status = 'void' where id = v_i.id;
    insert into public.ramp_audit(action, detail) values ('void invoice', v_i.number || ' in Stripe');
  end if;
  return 'ok';
end $$;

create or replace function public.ramp_stripe_invoice_payload(p_invoice uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'invoice', jsonb_build_object('id', i.id, 'number', i.number, 'status', i.status, 'total', i.total, 'currency', i.currency,
      'period_start', i.period_start, 'period_end', i.period_end, 'stripe_invoice_id', i.stripe_invoice_id),
    'client', jsonb_build_object('id', c.id, 'name', c.name, 'billing_name', c.billing_name, 'billing_email', c.billing_email,
      'net_days', c.net_days, 'stripe_customer_id', c.stripe_customer_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity, 'unit_price', l.unit_price,
      'amount', l.amount) order by l.sort) from public.ramp_invoice_lines l where l.invoice_id = i.id), '[]'::jsonb))
  from public.ramp_invoices i join public.ramp_clients c on c.id = i.client_id where i.id = p_invoice
$$;

create or replace function public.ramp_client_set_stripe(p_client uuid, p_customer text) returns void
language sql security definer set search_path = '' as $$
  update public.ramp_clients set stripe_customer_id = p_customer where id = p_client
$$;

-- ───────────────────────── payouts (admin) ─────────────────────────

create or replace function public.ramp_timesheet_paid(p_timesheet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ramp_timesheets t join public.ramp_invoice_lines l on l.id = t.invoice_line_id
                 join public.ramp_invoices i on i.id = l.invoice_id where t.id = p_timesheet and i.status = 'paid')
      or exists (select 1 from public.ramp_timesheets t where t.id = p_timesheet
                 and public.ramp_prepay_covers(t.placement_id, t.week_start, true))
$$;

create or replace function public.ramp_payout_generate(p_start date, p_end date, p_only_paid boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_r record; v_line uuid; v_sort int := 0; v_cur text;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can create payouts.'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Pick a period that ends after it starts.'; end if;
  select coalesce(agency->>'payout_currency', 'USD') into v_cur from public.ramp_org;
  insert into public.ramp_payouts(label, period_start, period_end, currency, created_by)
  values ('Payout ' || to_char(p_start, 'Mon DD') || ' to ' || to_char(p_end, 'Mon DD, YYYY'), p_start, p_end, v_cur, public.ramp_me())
  returning id into v_id;
  for v_r in
    select t.member_id, t.placement_id,
           coalesce(t.pay_rate, (select r.pay from public.ramp_rates_at(t.placement_id, t.week_start) r)) as rate,
           array_agg(t.id) as ids, sum(t.total) as hrs, min(t.week_start) as w1, max(t.week_start) as w2
    from public.ramp_timesheets t
    where t.status = 'approved' and t.payout_line_id is null and t.week_start between p_start and p_end
      and (not coalesce(p_only_paid, true) or public.ramp_timesheet_paid(t.id))
    group by t.member_id, t.placement_id, 3
    having sum(t.total) > 0
  loop
    insert into public.ramp_payout_lines(payout_id, member_id, placement_id, kind, description, quantity, rate, sort)
    select v_id, v_r.member_id, v_r.placement_id, 'hours',
           c.name || ' · ' || p.title || ' · weeks of ' || to_char(v_r.w1, 'Mon DD')
             || case when v_r.w2 <> v_r.w1 then ' to ' || to_char(v_r.w2, 'Mon DD') else '' end,
           v_r.hrs, v_r.rate, v_sort
    from public.ramp_placements p join public.ramp_clients c on c.id = p.client_id where p.id = v_r.placement_id
    returning id into v_line;
    v_sort := v_sort + 1;
    update public.ramp_timesheets set payout_line_id = v_line where id = any(v_r.ids);
  end loop;
  if v_sort = 0 then
    raise exception 'No approved hours to pay in this period%.', case when coalesce(p_only_paid, true) then ' from paid invoices' else '' end;
  end if;
  perform public.ramp_audit_add('created payout', null, to_char(p_start, 'YYYY-MM-DD') || ' to ' || to_char(p_end, 'YYYY-MM-DD'));
  return v_id;
end $$;

create or replace function public.ramp_payout_set_status(p_payout uuid, p_status text, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.ramp_payouts;
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can change payouts.'; end if;
  select * into v_p from public.ramp_payouts where id = p_payout and discarded_at is null for update;
  if v_p.id is null then raise exception 'Payout not found.'; end if;
  perform set_config('ramp.bypass', 'on', true);
  if p_status = 'exported' then
    if v_p.status = 'sent' then raise exception 'This payout was already sent.'; end if;
    update public.ramp_payouts set status = 'exported', exported_at = now() where id = v_p.id;
  elsif p_status = 'draft' then
    if v_p.status = 'sent' then raise exception 'This payout was already sent.'; end if;
    update public.ramp_payouts set status = 'draft' where id = v_p.id;
  elsif p_status = 'sent' then
    if v_p.status = 'sent' then return; end if;
    update public.ramp_payouts set status = 'sent', sent_at = now(), reference = left(coalesce(p_reference, ''), 200) where id = v_p.id;
  elsif p_status = 'void' then
    if v_p.status = 'sent' then raise exception 'A sent payout can’t be discarded.'; end if;
    update public.ramp_timesheets set payout_line_id = null
    where payout_line_id in (select id from public.ramp_payout_lines where payout_id = v_p.id);
    update public.ramp_payouts set discarded_at = now(), status = 'draft' where id = v_p.id;
  else
    raise exception 'Unknown status.';
  end if;
  perform public.ramp_audit_add(p_status || ' payout', null, v_p.label);
end $$;

create or replace function public.ramp_payout_export(p_payout uuid)
returns table(member_id uuid, name text, email text, method text, wise_recipient_id text, account_name text,
              target_currency text, amount numeric, currency text, reference text, bank jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.ramp_is_admin() then raise exception 'Only admins can export payouts.'; end if;
  perform public.ramp_audit_add('exported payout', null, (select label from public.ramp_payouts where id = p_payout));
  return query
    select l.member_id, public.ramp_name(l.member_id), coalesce(nullif(py.email, ''), m.email), coalesce(py.method, 'wise_email'),
           coalesce(py.wise_recipient_id, ''), coalesce(nullif(py.account_name, ''), nullif(m.full_name, ''), public.ramp_name(l.member_id)),
           coalesce(py.target_currency, 'PHP'), sum(l.amount), po.currency, po.label,
           case when py.bank_details is not null then extensions.pgp_sym_decrypt(py.bank_details, public.ramp_key())::jsonb end
    from public.ramp_payout_lines l
    join public.ramp_payouts po on po.id = l.payout_id
    join public.ramp_members m on m.id = l.member_id
    left join public.ramp_payees py on py.member_id = l.member_id
    where l.payout_id = p_payout
    group by l.member_id, m.email, m.full_name, py.email, py.method, py.wise_recipient_id, py.account_name, py.target_currency,
             py.bank_details, po.currency, po.label
    order by 2;
end $$;

-- ───────────────────────── client portal ─────────────────────────

create or replace function public.ramp_client_portal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_c uuid := public.ramp_my_client(); v_week date := public.ramp_week_start(current_date);
begin
  if v_c is null then raise exception 'This page is for client contacts.'; end if;
  return jsonb_build_object(
    'client', (select jsonb_build_object('id', c.id, 'name', c.name, 'timezone', c.timezone, 'billing_cycle', c.billing_cycle,
                'billing_mode', c.billing_mode, 'net_days', c.net_days, 'billing_email', c.billing_email) from public.ramp_clients c where c.id = v_c),
    'placements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date, 'end_date', p.end_date,
        'hours_per_week', p.hours_per_week, 'schedule', p.schedule, 'bill_rate', p.bill_rate, 'currency', p.currency,
        'guarantee_until', p.guarantee_until,
        'tier', (select jsonb_build_object('name', t.name, 'level', t.level, 'description', t.description) from public.ramp_tiers t where t.id = p.tier_id),
        'va', jsonb_build_object('id', m.id, 'name', public.ramp_name(m.id), 'email', m.email, 'timezone', m.timezone),
        'coach', jsonb_build_object('name', public.ramp_name(p.coach_id)),
        'steps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'owner', s.owner, 'done_at', s.done_at) order by s.sort)
                 from public.ramp_placement_steps s where s.placement_id = p.id), '[]'::jsonb),
        'training', public.ramp_training_summary(m.id),
        'checkins', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'kind', k.kind, 'done_at', k.done_at, 'score', k.score,
                 'went_well', k.went_well, 'improve', k.improve, 'actions', k.actions, 'by_name', public.ramp_name(k.by_member)) order by k.done_at desc)
                 from (select * from public.ramp_checkins k2 where k2.placement_id = p.id and k2.status = 'done'
                       and (k2.kind = 'client' or k2.share_with_client) order by k2.done_at desc limit 5) k), '[]'::jsonb),
        'next_checkin', (select k.due_date from public.ramp_checkins k where k.placement_id = p.id and k.kind = 'client' and k.status = 'scheduled' order by k.due_date limit 1),
        'hours_this_week', coalesce((select t.total from public.ramp_timesheets t where t.placement_id = p.id and t.week_start = v_week), 0),
        'hours_last_week', coalesce((select t.total from public.ramp_timesheets t where t.placement_id = p.id and t.week_start = v_week - 7), 0))
        order by (p.status = 'ended'), p.start_date desc nulls last)
      from public.ramp_placements p join public.ramp_members m on m.id = p.member_id
      where p.client_id = v_c and p.status <> 'proposed'), '[]'::jsonb),
    'timesheets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'placement_id', t.placement_id, 'va_name', public.ramp_name(t.member_id),
        'title', p.title, 'week_start', t.week_start, 'days', t.days, 'total', t.total, 'notes', t.notes, 'status', t.status,
        'submitted_at', t.submitted_at, 'reviewed_at', t.reviewed_at, 'review_note', t.review_note)
        order by (t.status = 'submitted') desc, t.week_start desc)
      from public.ramp_timesheets t join public.ramp_placements p on p.id = t.placement_id
      where p.client_id = v_c and t.status in ('submitted','approved','rejected') and t.week_start > current_date - 120), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.ramp_client_requests r where r.client_id = v_c), '[]'::jsonb));
end $$;

create or replace function public.ramp_client_feedback(p_placement uuid, p_score int, p_went_well text, p_improve text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_p public.ramp_placements; v_id uuid; v_every int;
begin
  select * into v_p from public.ramp_placements where id = p_placement;
  if v_p.id is null or public.ramp_my_client() is distinct from v_p.client_id then raise exception 'You can’t give feedback on this placement.'; end if;
  if p_score is null or p_score not between 1 and 5 then raise exception 'Pick a score from 1 to 5.'; end if;
  select id into v_id from public.ramp_checkins where placement_id = v_p.id and kind = 'client' and status = 'scheduled'
    and due_date <= current_date + 7 order by due_date limit 1;
  if v_id is null then
    insert into public.ramp_checkins(placement_id, kind, due_date, status, done_at, by_member, score, went_well, improve, share_with_client)
    values (v_p.id, 'client', current_date, 'done', now(), public.ramp_me(), p_score, left(coalesce(p_went_well, ''), 4000), left(coalesce(p_improve, ''), 4000), true)
    returning id into v_id;
  else
    update public.ramp_checkins set status = 'done', done_at = now(), by_member = public.ramp_me(), score = p_score,
      went_well = left(coalesce(p_went_well, ''), 4000), improve = left(coalesce(p_improve, ''), 4000), share_with_client = true
    where id = v_id;
  end if;
  if not exists (select 1 from public.ramp_checkins where placement_id = v_p.id and kind = 'client' and status = 'scheduled') then
    select coalesce((agency->>'checkin_every_days')::int, 30) into v_every from public.ramp_org;
    insert into public.ramp_checkins(placement_id, kind, due_date) values (v_p.id, 'client', current_date + v_every);
  end if;
  perform public.ramp_audit_add('client feedback', v_p.member_id, 'score ' || p_score);
  return v_id;
end $$;

create or replace function public.ramp_client_request(p_placement uuid, p_kind text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_c uuid := public.ramp_my_client(); v_id uuid;
begin
  if v_c is null then raise exception 'Only client contacts can send requests here.'; end if;
  if p_placement is not null and not exists (select 1 from public.ramp_placements where id = p_placement and client_id = v_c) then
    raise exception 'That assistant isn’t on your account.';
  end if;
  if p_kind not in ('support','replacement','hours','new_va','other') then raise exception 'Pick what the request is about.'; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Write a short note so we know what you need.'; end if;
  insert into public.ramp_client_requests(client_id, placement_id, member_id, kind, body)
  values (v_c, p_placement, public.ramp_me(), p_kind, left(btrim(p_body), 4000)) returning id into v_id;
  perform public.ramp_audit_add('client request', null, p_kind);
  return v_id;
end $$;

-- Staff directory and direct messages leave client contacts out.
create or replace function public.ramp_directory()
returns table(id uuid, full_name text, preferred_name text, level text, job_title text, department text, mentor_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.id, m.full_name, m.preferred_name, m.level, coalesce(j.title, ''), coalesce(d.name, ''), m.mentor_id
  from public.ramp_members m
  left join public.ramp_job_roles j on j.id = m.job_role_id
  left join public.ramp_departments d on d.id = m.department_id
  where m.status = 'active' and m.level <> 'client' and (public.ramp_my_rank() <= 6 or m.id = public.ramp_me())
  order by m.full_name
$$;

create or replace function public.ramp_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public.ramp_me(); v_id uuid; v_slug text;
begin
  if v_me is null or public.ramp_my_rank() > 6 then raise exception 'Chat isn’t available for your access level.'; end if;
  if p_other = v_me or not exists (select 1 from public.ramp_members where id = p_other and status = 'active' and level not in ('guest','client')) then
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

-- ───────────────────────── privileges ─────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'ramp_week_start(date)', 'ramp_name(uuid)', 'ramp_is_coach(uuid)', 'ramp_training_summary(uuid)',
    'ramp_placement_seed(uuid)', 'ramp_rate_change(uuid,uuid,numeric,numeric,date,text)', 'ramp_invite_client(text,text,uuid)',
    'ramp_step_toggle(uuid,boolean)', 'ramp_checkin_save(uuid,uuid,text,date,text,integer,text,text,text,boolean)',
    'ramp_coach_placements()', 'ramp_coach_placement(uuid)', 'ramp_my_roles()', 'ramp_my_work()',
    'ramp_timesheet_save(uuid,date,numeric[],text,boolean)', 'ramp_payee_get(uuid)',
    'ramp_payee_save(uuid,text,text,text,text,text,jsonb,text)', 'ramp_payee_reveal(uuid)',
    'ramp_timesheet_review(uuid,boolean,text)', 'ramp_timesheet_admin_save(uuid,date,numeric[],text,boolean)',
    'ramp_prepay_covers(uuid,date,boolean)', 'ramp_invoice_generate(uuid,date,date)', 'ramp_invoice_set_status(uuid,text,text)',
    'ramp_timesheet_paid(uuid)', 'ramp_payout_generate(date,date,boolean)',
    'ramp_payout_set_status(uuid,text,text)', 'ramp_payout_export(uuid)', 'ramp_client_portal()',
    'ramp_client_feedback(uuid,integer,text,text)', 'ramp_client_request(uuid,text,text)',
    'ramp_my_client()', 'ramp_my_client_ids()', 'ramp_rates_at(uuid,date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['ramp_invoice_stripe_sent(uuid,text,text,text)', 'ramp_invoice_stripe_event(text,text)',
                           'ramp_stripe_invoice_payload(uuid)', 'ramp_client_set_stripe(uuid,text)', 'ramp_audit_add(text,uuid,text)',
                           'ramp_invoice_total()', 'ramp_payout_total()', 'ramp_invoice_release(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['ramp_invoice_stripe_sent(uuid,text,text,text)', 'ramp_invoice_stripe_event(text,text)',
                           'ramp_stripe_invoice_payload(uuid)', 'ramp_client_set_stripe(uuid,text)'] loop
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ───────────────────────── launch plans ─────────────────────────
-- A guided plan for a new assistant's first days at a client: the client prepares the material
-- (company intro, values, projects, checklists, tools and access, milestones, time-blocks), then
-- runs a timed Day 1 agenda from it. The assistant can read it; the coach and admins can edit it.

update public.ramp_org set agency = agency || jsonb_build_object('launch_agenda', '[
  {"key": "intro", "title": "Introduce the company", "minutes": 5, "section": "company"},
  {"key": "values", "title": "Core values and foundational principles", "minutes": 10, "section": "values"},
  {"key": "projects", "title": "Overview of major projects", "minutes": 10, "section": "projects"},
  {"key": "checklist", "title": "Day-to-day checklist for the role", "minutes": 15, "section": "checklists"},
  {"key": "tools", "title": "Main tools and systems", "minutes": 15, "section": "tools"},
  {"key": "milestones", "title": "Milestones and the success path, from probation to promotion", "minutes": 10, "section": "milestones"},
  {"key": "break", "title": "Break", "minutes": 15, "section": null},
  {"key": "access", "title": "Access: workspace, accounts and tools", "minutes": 20, "section": "tools"},
  {"key": "test_access", "title": "Test access: sign-in, messaging, notifications, bookmarks, mobile and documentation", "minutes": 15, "section": "tools"},
  {"key": "walk_daily", "title": "Walkthrough: day-to-day activity (show, guide, then supervise)", "minutes": 45, "section": "checklists"},
  {"key": "walk_a", "title": "Walkthrough: big project A", "minutes": 30, "section": "projects"},
  {"key": "walk_b", "title": "Walkthrough: big project B", "minutes": 30, "section": "projects"},
  {"key": "checklist_review", "title": "Checklist review", "minutes": 10, "section": "checklists"},
  {"key": "timeblock_review", "title": "Time-block review", "minutes": 10, "section": "schedules"}
]'::jsonb)
where not (agency ? 'launch_agenda');

create table if not exists public.ramp_launch_plans (
  placement_id uuid primary key references public.ramp_placements(id) on delete cascade,
  status       text not null default 'preparing' check (status in ('preparing','ready','in_progress','done')),
  day1_date    date,
  data         jsonb not null default '{}'::jsonb,
  agenda       jsonb not null default '[]'::jsonb,
  updated_by   uuid references public.ramp_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.ramp_launch_plans enable row level security;
do $$ begin execute 'revoke all on public.ramp_launch_plans from anon'; end $$;
create policy ramp_launch_plans_admin on public.ramp_launch_plans for all to authenticated
  using ((select public.ramp_is_admin())) with check ((select public.ramp_is_admin()));
create trigger ramp_launch_plans_touch before update on public.ramp_launch_plans
  for each row execute function public.ramp_touch();

-- Who the caller is to this placement: admin, coach, client, va, or null.
create or replace function public.ramp_launch_role(p_placement uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when public.ramp_is_admin() then 'admin'
    when public.ramp_is_coach(p_placement) then 'coach'
    when exists (select 1 from public.ramp_placements p where p.id = p_placement and p.client_id = public.ramp_my_client()) then 'client'
    when exists (select 1 from public.ramp_placements p where p.id = p_placement and p.member_id = public.ramp_me()) then 'va'
  end
$$;

-- Storage paths launch/<placement id>/… : readable by everyone on the placement, writable by admin, coach and client.
create or replace function public.ramp_launch_file_ok(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid; v_role text;
begin
  if (storage.foldername(p_name))[1] <> 'launch' then return false; end if;
  begin
    v_id := ((storage.foldername(p_name))[2])::uuid;
  exception when others then return false;
  end;
  v_role := public.ramp_launch_role(v_id);
  return v_role is not null and (not p_write or v_role in ('admin','coach','client'));
end $$;

create policy ramp_files_launch_read on storage.objects for select to authenticated
  using (bucket_id = 'ramp-files' and public.ramp_launch_file_ok(name, false));
create policy ramp_files_launch_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ramp-files' and public.ramp_launch_file_ok(name, true));

create or replace function public.ramp_launch_get(p_placement uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_role text := public.ramp_launch_role(p_placement); v_plan public.ramp_launch_plans; v_agenda jsonb;
begin
  if v_role is null then raise exception 'You can’t open this launch plan.'; end if;
  select * into v_plan from public.ramp_launch_plans where placement_id = p_placement;
  if v_plan.placement_id is null and v_role <> 'va' then
    select coalesce(jsonb_agg(x || jsonb_build_object('done', false, 'notes', '')), '[]'::jsonb) into v_agenda
    from jsonb_array_elements(coalesce((select agency->'launch_agenda' from public.ramp_org), '[]'::jsonb)) x;
    insert into public.ramp_launch_plans(placement_id, agenda, day1_date, updated_by)
    values (p_placement, v_agenda, (select start_date from public.ramp_placements where id = p_placement), public.ramp_me())
    returning * into v_plan;
  end if;
  return jsonb_build_object(
    'role', v_role,
    'plan', case when v_plan.placement_id is null then null else to_jsonb(v_plan) end,
    'placement', (select jsonb_build_object('id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date,
        'hours_per_week', p.hours_per_week, 'schedule', p.schedule,
        'client', jsonb_build_object('id', c.id, 'name', c.name, 'timezone', c.timezone),
        'va', jsonb_build_object('id', p.member_id, 'name', public.ramp_name(p.member_id)),
        'coach', jsonb_build_object('id', p.coach_id, 'name', public.ramp_name(p.coach_id)),
        'tier', (select jsonb_build_object('name', t.name, 'level', t.level) from public.ramp_tiers t where t.id = p.tier_id))
      from public.ramp_placements p join public.ramp_clients c on c.id = p.client_id where p.id = p_placement));
end $$;

create or replace function public.ramp_launch_save(p_placement uuid, p_data jsonb, p_agenda jsonb, p_day1 date, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role text := public.ramp_launch_role(p_placement);
begin
  if v_role is null or v_role = 'va' then raise exception 'You can’t edit this launch plan.'; end if;
  if p_status not in ('preparing','ready','in_progress','done') then raise exception 'Unknown status.'; end if;
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_agenda, '[]'::jsonb)) <> 'array' then
    raise exception 'The plan couldn’t be read. Reload and try again.';
  end if;
  if length(coalesce(p_data, '{}'::jsonb)::text) > 300000 then raise exception 'The plan is too large. Link long documents instead of pasting them.'; end if;
  insert into public.ramp_launch_plans(placement_id, status, day1_date, data, agenda, updated_by)
  values (p_placement, p_status, p_day1, coalesce(p_data, '{}'::jsonb), coalesce(p_agenda, '[]'::jsonb), public.ramp_me())
  on conflict (placement_id) do update set status = excluded.status, day1_date = excluded.day1_date, data = excluded.data,
    agenda = excluded.agenda, updated_by = excluded.updated_by;
end $$;

create or replace function public.ramp_launch_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('placement_id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date,
      'client', c.name, 'va', public.ramp_name(p.member_id), 'role', public.ramp_launch_role(p.id),
      'plan_status', lp.status, 'day1_date', lp.day1_date, 'updated_at', lp.updated_at) order by p.start_date desc nulls last), '[]'::jsonb)
  from public.ramp_placements p join public.ramp_clients c on c.id = p.client_id
  left join public.ramp_launch_plans lp on lp.placement_id = p.id
  where p.status <> 'ended' and public.ramp_launch_role(p.id) is not null
$$;

do $$
declare f text;
begin
  foreach f in array array['ramp_launch_role(uuid)', 'ramp_launch_file_ok(text,boolean)', 'ramp_launch_get(uuid)',
                           'ramp_launch_save(uuid,jsonb,jsonb,date,text)', 'ramp_launch_list()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
