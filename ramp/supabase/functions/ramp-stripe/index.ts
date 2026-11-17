// RAMP → Stripe: sends an issued RAMP invoice to the client through Stripe Invoicing.
// Needs the STRIPE_SECRET_KEY secret (Supabase › Edge Functions › Secrets). Admins only.
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
  invoice: { id: string; number: string; status: string; total: number; currency: string; period_start: string; period_end: string; stripe_invoice_id: string | null };
  client: { id: string; name: string; billing_name: string; billing_email: string; net_days: number; stripe_customer_id: string | null };
  lines: { description: string; quantity: number; unit_price: number; amount: number }[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
  const { data: isAdmin } = await asUser.rpc('ramp_is_admin');
  if (isAdmin !== true) return json({ error: 'Only RAMP admins can use Stripe.' }, 403);

  const body = await req.json().catch(() => ({}));

  if (body.action === 'status') {
    return json({
      configured: !!STRIPE_KEY,
      mode: STRIPE_KEY.startsWith('sk_live') || STRIPE_KEY.startsWith('rk_live') ? 'live' : STRIPE_KEY ? 'test' : null,
      webhook: !!Deno.env.get('STRIPE_WEBHOOK_SECRET'),
      webhook_url: `${SUPABASE_URL}/functions/v1/ramp-stripe-webhook`,
    });
  }

  if (!STRIPE_KEY) return json({ error: 'Stripe isn’t connected yet. Add the STRIPE_SECRET_KEY secret in Supabase.' }, 400);

  if (body.action === 'send') {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await admin.rpc('ramp_stripe_invoice_payload', { p_invoice: body.invoice_id });
    const p = data as Payload | null;
    if (error || !p) return json({ error: 'Invoice not found.' }, 404);
    if (p.invoice.status === 'paid' || p.invoice.status === 'void') return json({ error: 'This invoice is already closed.' }, 400);
    if (p.invoice.stripe_invoice_id) return json({ error: 'This invoice was already sent through Stripe.' }, 400);
    if (!p.client.billing_email) return json({ error: 'Add a billing email for this client first.' }, 400);
    if (!p.lines.length || Number(p.invoice.total) <= 0) return json({ error: 'This invoice has nothing to charge.' }, 400);

    try {
      const currency = (p.invoice.currency || 'USD').toLowerCase();
      let customer = p.client.stripe_customer_id;
      if (!customer) {
        const c = await stripe('customers', {
          name: p.client.billing_name || p.client.name,
          email: p.client.billing_email,
          'metadata[ramp_client_id]': p.client.id,
        });
        customer = c.id as string;
        await admin.rpc('ramp_client_set_stripe', { p_client: p.client.id, p_customer: customer });
      }
      const inv = await stripe('invoices', {
        customer,
        currency,
        collection_method: 'send_invoice',
        days_until_due: String(Math.max(Number(p.client.net_days) || 0, 1)),
        auto_advance: 'false',
        pending_invoice_items_behavior: 'exclude',
        description: `${p.invoice.number} · ${p.invoice.period_start} to ${p.invoice.period_end}`,
        'metadata[ramp_invoice_id]': p.invoice.id,
        'metadata[ramp_number]': p.invoice.number,
      });
      for (const l of p.lines) {
        await stripe('invoiceitems', {
          customer,
          invoice: inv.id,
          currency,
          amount: String(Math.round(Number(l.amount) * 100)),
          description: `${l.description} (${l.quantity} × ${Number(l.unit_price).toFixed(2)})`.slice(0, 500),
        });
      }
      await stripe(`invoices/${inv.id}/finalize`, {});
      const sent = await stripe(`invoices/${inv.id}/send`, {});
      await admin.rpc('ramp_invoice_stripe_sent', {
        p_invoice: p.invoice.id, p_stripe_id: inv.id, p_url: sent.hosted_invoice_url ?? null, p_pdf: sent.invoice_pdf ?? null,
      });
      return json({ ok: true, url: sent.hosted_invoice_url ?? null });
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  }

  return json({ error: 'Unknown action.' }, 400);
});
