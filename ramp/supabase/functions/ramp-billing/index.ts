// RAMP account billing: Stripe Checkout for a plan, and the Stripe billing portal. Account owners only.
// Needs the STRIPE_SECRET_KEY secret (Supabase › Edge Functions › Secrets). Subscription changes come back
// through ramp-stripe-webhook (customer.subscription.created / updated / deleted).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out?.error?.message || `Stripe returned ${res.status}`);
  return out;
}

type Payload = {
  id: string; name: string; plan: string; status: string; owner_email: string | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null; subscription_status: string | null;
  prices: { id: string; label: string }[];
};

/** Only send people back to the page they came from, on the same site. */
function safeReturn(raw: unknown, origin: string | null) {
  try {
    const u = new URL(String(raw || ''));
    if (origin && u.origin === origin && (u.protocol === 'https:' || u.hostname === 'localhost')) return u.origin + u.pathname;
  } catch { /* fall through */ }
  return origin && /^https:\/\//.test(origin) ? origin + '/admin/account' : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!STRIPE_KEY) return json({ error: 'Online payment isn’t set up yet. Contact the RAMP team.' }, 400);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
  const { data: who } = await asUser.auth.getUser();
  const uid = who?.user?.id;
  if (!uid) return json({ error: 'Sign in first.' }, 401);

  const body = await req.json().catch(() => ({}));
  if (typeof body.account_id !== 'string') return json({ error: 'Account not found.' }, 404);
  // The caller must be able to see the account and own it.
  const { data: acc } = await asUser.from('ramp_accounts').select('id, owner_auth_id').eq('id', body.account_id).maybeSingle();
  if (!acc) return json({ error: 'Account not found.' }, 404);
  if (acc.owner_auth_id !== uid) return json({ error: 'Only the account owner can change billing.' }, 403);

  const back = safeReturn(body.return_url, req.headers.get('origin'));
  if (!back) return json({ error: 'Open RAMP from its normal address and try again.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin.rpc('ramp_account_billing_payload', { p_account: acc.id });
  const p = data as Payload | null;
  if (error || !p) return json({ error: 'Account not found.' }, 404);
  if (p.status === 'closed') return json({ error: 'This account is closed. Contact the RAMP team.' }, 400);

  try {
    if (body.action === 'checkout') {
      const price = (p.prices || []).find((x) => x.id === body.price_id);
      if (!price) return json({ error: 'That plan isn’t available.' }, 400);
      if (p.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(p.subscription_status || '')) {
        // Already subscribed: plan changes happen in the billing portal.
        const portal = await stripe('billing_portal/sessions', { customer: p.stripe_customer_id!, return_url: back });
        return json({ url: portal.url });
      }
      let customer = p.stripe_customer_id;
      if (!customer) {
        const c = await stripe('customers', {
          name: p.name, ...(p.owner_email ? { email: p.owner_email } : {}), 'metadata[ramp_account_id]': p.id,
        });
        customer = c.id as string;
        const { error: e } = await admin.rpc('ramp_account_set_stripe', { p_account: p.id, p_customer: customer });
        if (e) return json({ error: 'Could not save the Stripe customer. Try again.' }, 500);
      }
      const session = await stripe('checkout/sessions', {
        mode: 'subscription',
        customer,
        'line_items[0][price]': price.id,
        'line_items[0][quantity]': '1',
        allow_promotion_codes: 'true',
        client_reference_id: p.id,
        'subscription_data[metadata][ramp_account_id]': p.id,
        success_url: `${back}?billing=done`,
        cancel_url: back,
      });
      return json({ url: session.url });
    }
    if (body.action === 'portal') {
      if (!p.stripe_customer_id) return json({ error: 'Choose a plan first.' }, 400);
      const portal = await stripe('billing_portal/sessions', { customer: p.stripe_customer_id, return_url: back });
      return json({ url: portal.url });
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
  return json({ error: 'Unknown action.' }, 400);
});
