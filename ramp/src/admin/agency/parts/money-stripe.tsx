// Talking to the ramp-stripe edge function, and the panel that explains how to connect Stripe.
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { Button, Chip, Icon, Notice } from '../../../ui';

export interface StripeStatus { configured: boolean; mode: 'live' | 'test' | null; webhook: boolean; webhook_url: string }

/** Call ramp-stripe and return its JSON, or throw with the function's own error sentence. */
export async function invokeStripe<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ramp-stripe', { body });
  if (error) {
    let msg = (error as { message?: string }).message || 'Stripe didn’t answer.';
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const j = await (ctx as Response).clone().json();
        if (j && typeof j.error === 'string') msg = j.error;
      } catch { /* not JSON */ }
    }
    if (/Failed to send a request|Failed to fetch|FunctionsFetchError/i.test(msg)) msg = 'Couldn’t reach the Stripe function. Check that ramp-stripe is deployed in Supabase.';
    throw new Error(msg);
  }
  const d = data as { error?: string } | null;
  if (d && typeof d === 'object' && typeof d.error === 'string') throw new Error(d.error);
  return data as T;
}

export const loadStripeStatus = () => invokeStripe<StripeStatus>({ action: 'status' });

/** One line about the connection, for the invoice's side panel. */
export function StripeState({ status, error, onRetry }: { status?: StripeStatus; error?: string | null; onRetry?: () => void }) {
  if (error) {
    return (
      <Notice tone="warn" icon="alert">
        <p>Couldn’t check Stripe: {error}</p>
        {onRetry && <Button size="sm" icon="refresh" className="mt-2" onClick={onRetry}>Check again</Button>}
      </Notice>
    );
  }
  if (!status) return <p className="text-sm text-muted">Checking Stripe…</p>;
  if (!status.configured) return <StripeSetup />;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Icon name="check" size={16} className="text-good" />
        <span className="font-semibold">Stripe is connected</span>
        <Chip tone={status.mode === 'live' ? 'good' : 'warn'}>{status.mode === 'live' ? 'Live' : 'Test mode'}</Chip>
      </p>
      {status.mode !== 'live' && <p className="text-sm text-muted leading-relaxed">Test mode: Stripe won’t charge real cards. Switch to a live key when you’re ready to bill clients.</p>}
      {!status.webhook && (
        <p className="text-sm text-warn leading-relaxed">
          Payments made in Stripe won’t mark invoices paid in RAMP until the webhook is set up.{' '}
          <Link to="/admin/agency/settings" className="font-semibold underline">Set it up in Agency settings</Link>
        </p>
      )}
    </div>
  );
}

/** Shown in place of the send button until the owner adds the Stripe secret. */
export function StripeSetup() {
  return (
    <div className="rounded-2xl border border-line bg-bg px-4 py-3.5 text-sm leading-relaxed">
      <p className="font-semibold text-ink">Connect Stripe to email invoices with a “Pay now” link</p>
      <ol className="mt-2 list-decimal pl-5 space-y-1 text-ink-2">
        <li>In Stripe, open Developers › API keys and copy the secret key.</li>
        <li>In Supabase, open Edge Functions › Secrets and add it as <code className="font-mono text-[13px] bg-chip px-1 rounded">STRIPE_SECRET_KEY</code>.</li>
        <li>To mark invoices paid automatically, add the webhook from Agency settings and save its signing secret as <code className="font-mono text-[13px] bg-chip px-1 rounded">STRIPE_WEBHOOK_SECRET</code>.</li>
      </ol>
      <p className="mt-2 text-muted">Until then, issue invoices here and send the PDF yourself.</p>
      <Link to="/admin/agency/settings" className="mt-2 inline-flex items-center gap-1 min-h-11 font-semibold text-brand-ink no-underline">
        Open Agency settings <Icon name="chevronRight" size={16} />
      </Link>
    </div>
  );
}
