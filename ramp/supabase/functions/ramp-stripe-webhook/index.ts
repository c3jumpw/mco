// Stripe → RAMP: marks RAMP invoices paid or void when Stripe says so, and keeps account subscriptions in step.
// Needs the STRIPE_WEBHOOK_SECRET secret. Point a Stripe webhook here for invoice.paid, invoice.voided and
// customer.subscription.created / updated / deleted.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOLERANCE_SECONDS = 300;

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(payload: string, header: string) {
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(SECRET, `${t}.${payload}`);
  return sigs.some((s) => safeEqual(s, expected));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 });
  if (!SECRET) return new Response('Webhook secret not set', { status: 500 });
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get('stripe-signature') || ''))) return new Response('Bad signature', { status: 400 });

  const event = JSON.parse(payload);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (event.type === 'invoice.paid' || event.type === 'invoice.voided') {
    // Invoices RAMP sent to agency clients; subscription invoices aren't RAMP invoices and are ignored by the RPC.
    const { error } = await admin.rpc('ramp_invoice_stripe_event', { p_stripe_id: event.data?.object?.id, p_event: event.type });
    if (error) return new Response('Could not update RAMP', { status: 500 });
  } else if (event.type?.startsWith('customer.subscription.')) {
    const sub = event.data?.object || {};
    const item = sub.items?.data?.[0];
    // current_period_end moved from the subscription to its items in newer Stripe API versions.
    const end = sub.current_period_end ?? item?.current_period_end;
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
    const { error } = await admin.rpc('ramp_account_subscription_event', {
      p_customer: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      p_subscription: sub.id ?? null,
      p_status: status ?? null,
      p_period_end: end ? new Date(end * 1000).toISOString() : null,
      p_price: item?.price?.id ?? null,
    });
    if (error) return new Response('Could not update RAMP', { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
