// Admin › Account and billing: the account's plan and seats, its organizations (workspaces), adding another
// organization, and the Stripe plan (account owner only).
import { useState } from 'react';
import { errText, supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { fmtDate, plural } from '../lib/util';
import type { Account as AccountRow, Seats } from '../lib/types';
import { Button, Card, CardHeader, Chip, ErrorBox, Field, Icon, Input, Notice, PageHeader, Progress, Sheet, Skeleton, useToast } from '../ui';
import { ManageBillingButton, PlanPicker } from '../components/PlanPicker';
import { ADMIN_BACK } from './parts/setup-kit';

const PLAN_LABEL = { comp: 'Free access', trial: 'Free trial', paid: 'Paid plan' } as const;

export default function Account() {
  useTitle('Account and billing');
  const { account, workspace, workspaces, switchWorkspace } = useMe();
  const { data, error, reload } = useAsync(async () => {
    if (!account) return null;
    const [row, seats] = await Promise.all([
      q<AccountRow | null>(supabase.from('ramp_accounts').select('*').eq('id', account.id).maybeSingle()),
      supabase.rpc('ramp_seats').then(({ data: d }) => d as Seats | null),
    ]);
    return { row, seats };
  }, [account?.id]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const header = <PageHeader back={ADMIN_BACK} title="Account and billing" subtitle="Your RAMP plan, seats and the organizations in your account." />;

  if (!account) {
    return <div className="flex flex-col gap-6">{header}<Card><p className="text-ink-2">Account details appear here once workspaces are switched on.</p></Card></div>;
  }
  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={3} /></div>;

  const a = data.row;
  const seats = data.seats;
  const owner = account.is_owner;
  const orgs = workspaces.filter((w) => w.account_id === account.id && !w.support);
  const pct = seats && seats.limit ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6">
      {header}
      {new URLSearchParams(window.location.search).get('billing') === 'done' && (
        <Notice tone="good" icon="check">Thanks. Stripe is confirming your payment; your plan updates here within a minute.</Notice>
      )}

      <Card className="flex flex-col gap-4">
        <CardHeader title={a?.name || account.name} subtitle={owner ? 'You own this account.' : 'Only the account owner can change the plan.'}
          action={<Chip tone={account.plan === 'comp' ? 'good' : account.plan === 'trial' ? 'warn' : 'brand'}>{PLAN_LABEL[account.plan]}</Chip>} />
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted">Seats</span>
            {seats ? (
              <>
                <span className="text-[15px]"><strong>{seats.used}</strong>{seats.limit == null ? ' in use · unlimited' : ` of ${seats.limit} in use`}</span>
                {seats.limit != null && <Progress value={pct} tone={pct >= 90 ? 'amber' : 'brand'} label="Seats used" />}
              </>
            ) : <span className="text-muted">—</span>}
            <span className="text-[13px] text-muted">Everyone with access across your organizations, counted once. Client contacts and placed team members are free.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted">Plan</span>
            <span className="text-[15px]">
              {account.plan === 'comp' ? 'Free access from the RAMP team.'
                : account.plan === 'trial' ? (account.trial_ends ? `Free trial until ${fmtDate(account.trial_ends, { month: 'long', day: 'numeric', year: 'numeric' })}.` : 'Free trial.')
                : a?.subscription_status ? `Subscription ${a.subscription_status}${a.current_period_end ? `, renews ${fmtDate(a.current_period_end, { month: 'long', day: 'numeric' })}` : ''}.` : 'Paid plan.'}
            </span>
          </div>
        </div>
        {owner && account.plan !== 'comp' && (
          <div className="flex flex-col gap-3 pt-2 border-t border-line">
            <h3 className="font-semibold">{account.plan === 'paid' ? 'Change plan' : 'Choose a plan'}</h3>
            <PlanPicker accountId={account.id} current={a?.stripe_price_id || null} />
            {a?.stripe_customer_id && <ManageBillingButton accountId={account.id} />}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardHeader title="Organizations" subtitle="Each organization is a separate workspace with its own people, training and settings. Seats are shared."
          action={owner ? <Button icon="plus" onClick={() => setAdding(true)}>Add organization</Button> : undefined} />
        {orgs.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5">
            <span className="min-w-0 flex items-center gap-3">
              <Icon name="building" size={20} className="text-brand-ink shrink-0" />
              <span className="min-w-0">
                <span className="block font-semibold truncate">{w.name}</span>
                <span className="block text-[13px] text-muted">{w.id === workspace?.id ? 'You’re here' : w.member_status === 'active' ? 'You have access' : 'No access'}{w.status !== 'active' ? ` · ${w.status}` : ''}</span>
              </span>
            </span>
            {w.id !== workspace?.id && w.member_status === 'active' && (
              <Button size="sm" loading={busy === w.id} disabled={!!busy} onClick={async () => {
                setBusy(w.id); setErr('');
                try { await switchWorkspace(w.id); } catch (e) { setBusy(''); setErr(errText(e)); }
              }}>Switch</Button>
            )}
          </div>
        ))}
        {!orgs.length && <p className="text-sm text-muted">Only this organization so far.</p>}
        {err && <Notice tone="bad" icon="alert">{err}</Notice>}
      </Card>

      {adding && <AddOrgSheet onClose={() => setAdding(false)} count={orgs.length} />}
    </div>
  );
}

function AddOrgSheet({ onClose, count }: { onClose: () => void; count: number }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setErr('');
    if (!name.trim()) { setErr('Add the organization’s name.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('ramp_account_add_workspace', { p_name: name.trim() });
    if (error) { setBusy(false); setErr(errText(error)); return; }
    toast(`${name.trim()} is ready. Opening it now.`);
    // The new organization is now current: reload into it (setup starts there).
    window.location.assign('/');
  }
  return (
    <Sheet open onClose={onClose} title="Add an organization"
      subtitle={`For another company or brand you run. It gets its own people, training and settings, starting from the RAMP library. You have ${plural(count, 'organization')} now.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create and open</Button></>}>
      <Field label="Organization name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus /></Field>
      {err && <Notice tone="bad" icon="alert" className="mt-4">{err}</Notice>}
    </Sheet>
  );
}
