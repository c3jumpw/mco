-- RAMP 006b: fixes found while building the agency screens.
--  1. Advance billing: this period's prepayment is created before loose hours are billed, so approved
--     hours inside the period are never billed twice. A prepaid period starts on the Monday of the
--     placement's first week, so a mid-week start is covered by the prepayment.
--  2. Launch plans: assistants get no plan content until it's marked ready; two first opens at once
--     no longer collide; ramp_launch_save_if refuses to overwrite changes saved by someone else.

create or replace function public.ramp_invoice_generate(p_client uuid, p_start date, p_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.ramp_clients; v_a jsonb; v_inv uuid; v_num text; v_sort int := 0; v_line uuid;
  v_r record; v_pl record; v_pp record; v_weeks numeric; v_actual numeric; v_pending int; v_from date; v_pstart date;
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

    -- Prepay the scheduled hours for this period (before loose hours, so those weeks count as covered).
    for v_pp in
      select p.* from public.ramp_placements p
      where p.client_id = v_c.id and p.status in ('onboarding','active') and p.hours_per_week > 0
        and coalesce(p.start_date, p_start) <= p_end
        and not exists (select 1 from public.ramp_invoice_lines l join public.ramp_invoices i on i.id = l.invoice_id
                        where l.placement_id = p.id and l.kind = 'prepay' and i.status <> 'void'
                          and l.period_start <= p_end and l.period_end >= p_start)
    loop
      v_from := greatest(p_start, coalesce(v_pp.start_date, p_start));
      v_pstart := greatest(p_start, public.ramp_week_start(coalesce(v_pp.start_date, p_start)));
      v_weeks := round(((p_end - v_from) + 1) / 7.0, 2);
      continue when v_weeks <= 0;
      insert into public.ramp_invoice_lines(invoice_id, placement_id, kind, description, quantity, unit_price, period_start, period_end, sort)
      values (v_inv, v_pp.id, 'prepay',
              public.ramp_name(v_pp.member_id) || ' · ' || v_pp.title || ' · prepaid ' || v_pp.hours_per_week || ' h/week, '
                || to_char(v_from, 'Mon DD') || ' to ' || to_char(p_end, 'Mon DD'),
              round(v_pp.hours_per_week * v_weeks, 2), v_pp.bill_rate, v_pstart, p_end, v_sort);
      v_sort := v_sort + 1;
    end loop;
  end if;

  -- Approved hours not billed yet (in advance mode, only weeks no prepayment covers).
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

create or replace function public.ramp_launch_get(p_placement uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_role text := public.ramp_launch_role(p_placement); v_plan public.ramp_launch_plans; v_agenda jsonb; v_out jsonb;
begin
  if v_role is null then raise exception 'You can’t open this launch plan.'; end if;
  select * into v_plan from public.ramp_launch_plans where placement_id = p_placement;
  if v_plan.placement_id is null and v_role <> 'va' then
    select coalesce(jsonb_agg(x || jsonb_build_object('done', false, 'notes', '')), '[]'::jsonb) into v_agenda
    from jsonb_array_elements(coalesce((select agency->'launch_agenda' from public.ramp_org), '[]'::jsonb)) x;
    insert into public.ramp_launch_plans(placement_id, agenda, day1_date, updated_by)
    values (p_placement, v_agenda, (select start_date from public.ramp_placements where id = p_placement), public.ramp_me())
    on conflict (placement_id) do nothing;
    select * into v_plan from public.ramp_launch_plans where placement_id = p_placement;
  end if;
  v_out := case when v_plan.placement_id is null then null else to_jsonb(v_plan) end;
  -- Assistants only see the content once the plan is shared with them.
  if v_role = 'va' and v_out is not null and v_plan.status = 'preparing' then
    v_out := v_out || jsonb_build_object('data', '{}'::jsonb, 'agenda', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'role', v_role,
    'plan', v_out,
    'placement', (select jsonb_build_object('id', p.id, 'title', p.title, 'status', p.status, 'start_date', p.start_date,
        'hours_per_week', p.hours_per_week, 'schedule', p.schedule,
        'client', jsonb_build_object('id', c.id, 'name', c.name, 'timezone', c.timezone),
        'va', jsonb_build_object('id', p.member_id, 'name', public.ramp_name(p.member_id)),
        'coach', jsonb_build_object('id', p.coach_id, 'name', public.ramp_name(p.coach_id)),
        'tier', (select jsonb_build_object('name', t.name, 'level', t.level) from public.ramp_tiers t where t.id = p.tier_id))
      from public.ramp_placements p join public.ramp_clients c on c.id = p.client_id where p.id = p_placement));
end $$;

-- Save only if nobody else saved since p_expected (the updated_at the page last saw). Returns the new updated_at.
create or replace function public.ramp_launch_save_if(p_placement uuid, p_data jsonb, p_agenda jsonb, p_day1 date, p_status text,
  p_expected timestamptz) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_role text := public.ramp_launch_role(p_placement); v_cur timestamptz; v_new timestamptz;
begin
  if v_role is null or v_role = 'va' then raise exception 'You can’t edit this launch plan.'; end if;
  if p_status not in ('preparing','ready','in_progress','done') then raise exception 'Unknown status.'; end if;
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_agenda, '[]'::jsonb)) <> 'array' then
    raise exception 'The plan couldn’t be read. Reload and try again.';
  end if;
  if length(coalesce(p_data, '{}'::jsonb)::text) > 300000 then raise exception 'The plan is too large. Link long documents instead of pasting them.'; end if;
  select updated_at into v_cur from public.ramp_launch_plans where placement_id = p_placement for update;
  if found and p_expected is not null and v_cur is distinct from p_expected then
    raise exception 'Someone else saved changes to this plan while you were editing. Reload to see them.' using errcode = 'P0409';
  end if;
  insert into public.ramp_launch_plans(placement_id, status, day1_date, data, agenda, updated_by)
  values (p_placement, p_status, p_day1, coalesce(p_data, '{}'::jsonb), coalesce(p_agenda, '[]'::jsonb), public.ramp_me())
  on conflict (placement_id) do update set status = excluded.status, day1_date = excluded.day1_date, data = excluded.data,
    agenda = excluded.agenda, updated_by = excluded.updated_by
  returning updated_at into v_new;
  return v_new;
end $$;

do $$
begin
  execute 'revoke all on function public.ramp_launch_save_if(uuid,jsonb,jsonb,date,text,timestamptz) from public, anon';
  execute 'grant execute on function public.ramp_launch_save_if(uuid,jsonb,jsonb,date,text,timestamptz) to authenticated';
end $$;
