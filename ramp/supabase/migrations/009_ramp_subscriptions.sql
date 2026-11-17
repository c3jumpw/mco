-- RAMP 009: account subscriptions through Stripe (phase 6). Database side only; the edge functions that talk to
-- Stripe are written in the frontend phase and call these with the service role key.
--
-- Status mapping in ramp_account_subscription_event:
--   active, trialing            → plan 'paid', trial_ends cleared; an account paused for billing becomes active again.
--   past_due, unpaid, canceled,
--   incomplete_expired, paused  → an active account is paused with pause_reason 'billing' (users see account_paused).
--   anything else (incomplete…) → recorded only.
--   Accounts paused by a super admin (pause_reason 'admin') or closed are never reactivated by Stripe.
--   If the price is in ramp_platform.stripe_prices and has "seats", the account's seat_limit follows it (null = unlimited).
-- Apply after 008. Nothing here is destructive.

alter table public.ramp_accounts add column if not exists stripe_price_id text;

create or replace function public.ramp_account_set_stripe(p_account uuid, p_customer text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('ramp.bypass', 'on', true);
  update public.ramp_accounts set stripe_customer_id = nullif(btrim(p_customer), '') where id = p_account;
  if not found then raise exception 'Account not found.'; end if;
end $$;

create or replace function public.ramp_account_subscription_event(p_customer text, p_subscription text, p_status text,
                                                                  p_period_end timestamptz, p_price text) returns text
language plpgsql security definer set search_path = '' as $$
declare a public.ramp_accounts; v_price jsonb; v_status text; v_reason text; w record;
begin
  select * into a from public.ramp_accounts where stripe_customer_id = p_customer for update;
  if a.id is null then return 'unknown customer'; end if;
  perform set_config('ramp.bypass', 'on', true);
  select e into v_price from public.ramp_platform pf, jsonb_array_elements(pf.stripe_prices) e
  where pf.id and e->>'id' = p_price limit 1;
  v_status := a.status; v_reason := a.pause_reason;
  if a.status <> 'closed' then
    if p_status in ('active','trialing') then
      if a.status = 'paused' and a.pause_reason = 'billing' then v_status := 'active'; v_reason := null; end if;
    elsif p_status in ('past_due','unpaid','canceled','incomplete_expired','paused') then
      if a.status = 'active' then v_status := 'paused'; v_reason := 'billing'; end if;
    end if;
  end if;
  update public.ramp_accounts set
    stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id),
    subscription_status = p_status,
    current_period_end = coalesce(p_period_end, current_period_end),
    stripe_price_id = coalesce(p_price, stripe_price_id),
    plan = case when p_status in ('active','trialing') then 'paid' else plan end,
    trial_ends = case when p_status in ('active','trialing') then null else trial_ends end,
    seat_limit = case when p_status in ('active','trialing') and v_price ? 'seats'
                      then case when jsonb_typeof(v_price->'seats') = 'number' then (v_price->>'seats')::int end
                      else seat_limit end,
    status = v_status,
    pause_reason = v_reason
  where id = a.id;
  for w in select id from public.ramp_workspaces where account_id = a.id loop
    insert into public.ramp_audit(workspace_id, action, detail)
    values (w.id, 'subscription ' || coalesce(p_status, 'updated'),
            coalesce(v_price->>'label', p_price, '') || case when v_status is distinct from a.status then ' · account ' || v_status else '' end);
  end loop;
  return 'ok';
end $$;

-- What an edge function needs to create a Stripe customer or checkout for an account.
create or replace function public.ramp_account_billing_payload(p_account uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'plan', a.plan, 'status', a.status, 'seat_limit', a.seat_limit,
    'seats_used', public.ramp_seats_used(a.id), 'owner_email', (select u.email from auth.users u where u.id = a.owner_auth_id),
    'stripe_customer_id', a.stripe_customer_id, 'stripe_subscription_id', a.stripe_subscription_id,
    'subscription_status', a.subscription_status, 'current_period_end', a.current_period_end, 'stripe_price_id', a.stripe_price_id,
    'prices', (select stripe_prices from public.ramp_platform where id))
  from public.ramp_accounts a where a.id = p_account
$$;

do $$
declare f text;
begin
  foreach f in array array['ramp_account_set_stripe(uuid,text)', 'ramp_account_subscription_event(text,text,text,timestamptz,text)',
                           'ramp_account_billing_payload(uuid)'] loop
    execute format('comment on function public.%s is %L', f, 'RAMP: postgres-owned (bypasses RLS); filters by workspace itself.');
    execute format('alter function public.%s owner to postgres', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
