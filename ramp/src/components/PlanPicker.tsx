// Choose a RAMP plan (Stripe Checkout) or open the Stripe billing portal. Account owners only; the
// ramp-billing edge function checks ownership again before it touches Stripe.
import { useEffect, useState } from 'react';
import { errText, supabase } from '../lib/supabase';
import { cx, money } from '../lib/util';
import type { PlatformPrice } from '../lib/types';
import { Button, Notice, Spinner } from '../ui';

export async function billingCall(body: Record<string, unknown>): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ramp-billing', { body: { ...body, return_url: window.location.origin + window.location.pathname } });
  if (error) {
    // Functions return { error } with a non-2xx status; supabase-js wraps it, so read the body when it can.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null) as { error?: string } | null;
      if (j?.error) return { error: j.error };
    }
    return { error: errText(error) };
  }
  return data as { url?: string; error?: string };
}

export function usePrices() {
  const [prices, setPrices] = useState<PlatformPrice[] | null>(null);
  useEffect(() => {
    supabase.from('ramp_platform').select('stripe_prices').maybeSingle()
      .then(({ data }) => setPrices(((data as { stripe_prices?: PlatformPrice[] } | null)?.stripe_prices || []).filter((p) => p.id && p.label)));
  }, []);
  return prices;
}

export function PlanPicker({ accountId, current, compact }: { accountId: string; current?: string | null; compact?: boolean }) {
  const prices = usePrices();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function choose(p: PlatformPrice) {
    setErr('');
    setBusy(p.id);
    const r = await billingCall({ action: 'checkout', account_id: accountId, price_id: p.id });
    if (r.url) { window.location.assign(r.url); return; }
    setBusy('');
    setErr(r.error || 'Stripe didn’t open. Try again in a minute.');
  }

  if (prices === null) return <div className="flex items-center gap-2 text-sm text-muted"><Spinner size={16} />Loading plans…</div>;
  if (!prices.length) {
    return <Notice icon="info">Plans aren’t set up for online payment yet. Contact the RAMP team and we’ll get you set up.</Notice>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className={cx('grid gap-3', !compact && 'sm:grid-cols-2')}>
        {prices.map((p) => (
          <div key={p.id} className={cx('rounded-2xl border p-4 flex flex-col gap-3', current === p.id ? 'border-brand bg-brand-soft/40' : 'border-line bg-white')}>
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-lg font-semibold">{p.label}</span>
              <span className="text-[15px]"><strong className="text-ink">{money(Number(p.amount) || 0)}</strong><span className="text-muted"> / {p.interval === 'year' ? 'year' : 'month'}</span></span>
              <span className="text-sm text-muted">{p.seats ? `Up to ${p.seats} team members` : 'Unlimited team members'}</span>
            </div>
            {current === p.id
              ? <span className="text-sm font-semibold text-good">Your current plan</span>
              : <Button variant="primary" loading={busy === p.id} disabled={!!busy} onClick={() => choose(p)}>Choose {p.label}</Button>}
          </div>
        ))}
      </div>
      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
      <p className="text-[13px] text-muted">Payment is handled by Stripe. You can change or cancel your plan any time.</p>
    </div>
  );
}

export function ManageBillingButton({ accountId }: { accountId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="flex flex-col gap-2 items-start">
      <Button icon="link" loading={busy} onClick={async () => {
        setErr(''); setBusy(true);
        const r = await billingCall({ action: 'portal', account_id: accountId });
        if (r.url) { window.location.assign(r.url); return; }
        setBusy(false); setErr(r.error || 'Stripe didn’t open. Try again in a minute.');
      }}>Manage billing in Stripe</Button>
      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
    </div>
  );
}
