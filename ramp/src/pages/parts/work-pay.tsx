// Pay for an assistant: payout lines, an estimate for approved hours not paid yet, and payout details.
// Shows pay rates only.
import { useState, type FormEvent } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { PAYEE_METHOD, cx, fmtDate, money } from '../../lib/util';
import type { MyWork, PayeeInfo, PayeeMethod, Timesheet } from '../../lib/types';
import { Button, Card, CardHeader, Checkbox, Chip, EmptyState, Field, Icon, Input, Notice, Sheet, Textarea, useToast } from '../../ui';
import { fmtNum } from './work-hours';

type WorkPlacement = MyWork['placements'][number];
type PayoutLineView = MyWork['payouts'][number];

const PAYOUT_WORDS: Record<PayoutLineView['status'], { label: string; tone: 'neutral' | 'warn' | 'good' }> = {
  draft: { label: 'Being prepared', tone: 'neutral' },
  exported: { label: 'On its way', tone: 'warn' },
  sent: { label: 'Paid', tone: 'good' },
};

// ───────── pay ─────────

export function PayCard({ placements, payouts, sheets, payWhenPaid }: {
  placements: WorkPlacement[]; payouts: PayoutLineView[]; sheets: Timesheet[]; payWhenPaid: boolean;
}) {
  // Approved hours not on a payout yet, at the rate locked in when they were approved.
  const unpaid = sheets.filter((t) => t.status === 'approved' && !t.payout_line_id);
  const est = placements.map((p) => {
    const list = unpaid.filter((t) => t.placement_id === p.id);
    const hrs = list.reduce((a, t) => a + Number(t.total || 0), 0);
    const amt = list.reduce((a, t) => a + Number(t.total || 0) * Number(t.pay_rate ?? p.pay_rate ?? 0), 0);
    return { p, hrs, amt, weeks: list.length };
  }).filter((x) => x.hrs > 0);
  const waiting = sheets.filter((t) => t.status === 'submitted').reduce((a, t) => a + Number(t.total || 0), 0);
  const currency = placements[0]?.currency || 'USD';
  const estTotal = est.reduce((a, x) => a + x.amt, 0);

  // Group payout lines by payout.
  const groups: { id: string; label: string; status: PayoutLineView['status']; sent_at: string | null; currency: string; lines: PayoutLineView[] }[] = [];
  for (const l of payouts) {
    let g = groups.find((x) => x.id === l.payout_id);
    if (!g) { g = { id: l.payout_id, label: l.label, status: l.status, sent_at: l.sent_at, currency: l.currency, lines: [] }; groups.push(g); }
    g.lines.push(l);
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 flex flex-col gap-4">
        <CardHeader title="Pay" subtitle="Approved hours and your payouts." />
        <div className="rounded-2xl bg-brand-soft px-4 py-3.5 flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-brand-ink">Approved, not paid yet</p>
          <p className="font-display text-[28px] leading-tight font-bold tabular-nums">{money(estTotal, currency)}</p>
          {est.length === 0 ? (
            <p className="text-[13px] text-ink-2">Nothing waiting to be paid right now.</p>
          ) : (
            <ul className="text-[13px] text-ink-2 tabular-nums">
              {est.map((x) => (
                <li key={x.p.id}>{fmtNum(x.hrs)} h{placements.length > 1 ? ` at ${x.p.client.name}` : ''} · {money(x.amt, x.p.currency || currency)}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted mt-1 leading-relaxed">
            An estimate from your approved hours and pay rate. The final amount is set when your payout is made.
            {payWhenPaid ? ' Hours are paid once the client’s invoice for them is paid.' : ''}
          </p>
        </div>
        {waiting > 0 && <p className="text-[13px] text-muted -mt-1"><Icon name="clock" size={14} className="inline -mt-0.5 mr-1" />{fmtNum(waiting)} h more are waiting for approval.</p>}
      </div>
      {groups.length === 0 ? (
        <div className="border-t border-line-2"><EmptyState icon="send" title="No payouts yet" body="Once approved hours are paid out, each payout shows up here with its status." /></div>
      ) : (
        <ul className="border-t border-line-2">
          {groups.map((g) => {
            const total = g.lines.reduce((a, l) => a + Number(l.amount || 0), 0);
            const w = PAYOUT_WORDS[g.status];
            return (
              <li key={g.id} className="px-5 py-4 border-t border-line-2 first:border-t-0 flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-snug">{g.label || 'Payout'}</p>
                    {g.status === 'sent' && g.sent_at && <p className="text-[13px] text-muted">Sent {fmtDate(g.sent_at)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={w.tone} icon={g.status === 'sent' ? 'check' : undefined}>{w.label}</Chip>
                    <span className="text-[15px] font-semibold tabular-nums">{money(total, g.currency)}</span>
                  </div>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {g.lines.map((l) => (
                    <li key={l.id} className="flex items-start justify-between gap-3 text-[13px]">
                      <span className="min-w-0 text-ink-2">
                        {l.description}
                        <span className="block text-muted tabular-nums">{fmtNum(l.quantity)} h × {money(l.rate, g.currency)}</span>
                      </span>
                      <span className="tabular-nums text-ink-2 shrink-0">{money(l.amount, g.currency)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ───────── payout details ─────────

const BANK_LABELS: Record<string, string> = { bank_name: 'Bank', account_number: 'Account number', routing_code: 'Routing, branch or SWIFT code' };
const METHODS = Object.keys(PAYEE_METHOD) as PayeeMethod[];

export function PayeeCard({ payee, onSaved }: { payee: PayeeInfo | null; onSaved: () => Promise<void> | void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [bank, setBank] = useState<Record<string, string> | null>(null);
  const [revealing, setRevealing] = useState(false);

  async function reveal() {
    setRevealing(true);
    try {
      const { data, error } = await supabase.rpc('ramp_payee_reveal', { p_member: null });
      if (error) throw error;
      setBank((data as Record<string, string> | null) || {});
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setRevealing(false);
    }
  }

  const m = payee ? PAYEE_METHOD[payee.method] : null;

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title="Payout details" subtitle="Where we send your pay. Only you and our admins can see these."
        action={payee && <Button size="sm" icon="pen" onClick={() => setEditing(true)}>Edit</Button>} />
      {!payee ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="warn" icon="alert">Add your payout details so we can pay you for approved hours.</Notice>
          <Button variant="primary" icon="plus" onClick={() => setEditing(true)}>Add payout details</Button>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div><dt className="text-[13px] font-semibold text-muted">Method</dt><dd className="text-[15px] mt-0.5">{m?.label}</dd></div>
            <div><dt className="text-[13px] font-semibold text-muted">Paid in</dt><dd className="text-[15px] mt-0.5">{payee.target_currency || 'PHP'}</dd></div>
            {payee.account_name && <div><dt className="text-[13px] font-semibold text-muted">Name on the account</dt><dd className="text-[15px] mt-0.5 break-words">{payee.account_name}</dd></div>}
            {payee.email && <div><dt className="text-[13px] font-semibold text-muted">Wise email</dt><dd className="text-[15px] mt-0.5 break-all">{payee.email}</dd></div>}
            {payee.wise_recipient_id && <div><dt className="text-[13px] font-semibold text-muted">Wise recipient ID</dt><dd className="text-[15px] mt-0.5 font-mono">{payee.wise_recipient_id}</dd></div>}
            {payee.notes && <div className="sm:col-span-2"><dt className="text-[13px] font-semibold text-muted">Notes</dt><dd className="text-[15px] mt-0.5 whitespace-pre-line">{payee.notes}</dd></div>}
          </dl>
          {payee.has_bank && (
            <div className="rounded-xl border border-line px-4 py-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px] font-semibold inline-flex items-center gap-2"><Icon name="lock" size={16} className="text-good" />Bank details saved, encrypted</p>
                {bank ? <Button size="sm" variant="ghost" icon="eyeOff" onClick={() => setBank(null)}>Hide</Button>
                  : <Button size="sm" icon="eye" loading={revealing} onClick={reveal}>Show bank details</Button>}
              </div>
              {bank && (
                Object.keys(bank).length === 0 ? <p className="text-sm text-muted">No bank details are saved.</p> : (
                  <dl className="grid gap-2">
                    {Object.entries(bank).map(([k, v]) => (
                      <div key={k} className="flex flex-col sm:flex-row sm:gap-3">
                        <dt className="text-[13px] font-semibold text-muted sm:w-52 shrink-0">{BANK_LABELS[k] || k.replace(/_/g, ' ')}</dt>
                        <dd className="text-[15px] font-mono break-all">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )
              )}
            </div>
          )}
          <p className="text-xs text-muted">Last updated {fmtDate(payee.updated_at, { month: 'long', day: 'numeric', year: 'numeric' })}.</p>
        </>
      )}
      <PayeeSheet open={editing} payee={payee} onClose={() => setEditing(false)}
        onSaved={async () => { setEditing(false); setBank(null); await onSaved(); }} />
    </Card>
  );
}

function PayeeSheet({ open, payee, onClose, onSaved }: { open: boolean; payee: PayeeInfo | null; onClose: () => void; onSaved: () => Promise<void> }) {
  // Re-mount the form each time it opens so it starts from the saved details.
  return (
    <Sheet open={open} onClose={onClose} title={payee ? 'Edit payout details' : 'Add payout details'}
      subtitle="We pay through Wise. Bank details are stored encrypted.">
      {open && <PayeeForm payee={payee} onCancel={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function PayeeForm({ payee, onCancel, onSaved }: { payee: PayeeInfo | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [method, setMethod] = useState<PayeeMethod>(payee?.method || 'wise_email');
  const [accountName, setAccountName] = useState(payee?.account_name || '');
  const [email, setEmail] = useState(payee?.email || '');
  const [recipient, setRecipient] = useState(payee?.wise_recipient_id || '');
  const [currency, setCurrency] = useState(payee?.target_currency || 'PHP');
  const [bankName, setBankName] = useState('');
  const [acct, setAcct] = useState('');
  const [routing, setRouting] = useState('');
  const [removeBank, setRemoveBank] = useState(false);
  const [notes, setNotes] = useState(payee?.notes || '');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  const hasBank = !!payee?.has_bank;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const bankTyped = !!(bankName.trim() || acct.trim() || routing.trim());
    if (method === 'wise_email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter the email address on your Wise account.';
    if (method === 'wise_recipient' && !recipient.trim()) next.recipient = 'Enter the Wise recipient ID.';
    if (method === 'bank' && (bankTyped || !hasBank)) {
      if (!bankName.trim()) next.bankName = 'Enter your bank’s name.';
      if (!acct.trim()) next.acct = 'Enter your account number.';
    }
    if (method === 'bank' && !accountName.trim()) next.accountName = 'Enter the name on the bank account.';
    const cur = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) next.currency = 'Use a three-letter code, like PHP or USD.';
    setErrs(next);
    setFail('');
    if (Object.keys(next).length) return;

    let p_bank: Record<string, string> | null = null;
    if (method === 'bank' && bankTyped) p_bank = { bank_name: bankName.trim(), account_number: acct.trim(), routing_code: routing.trim() };
    if (method !== 'bank' && hasBank && removeBank) p_bank = {};

    setBusy(true);
    try {
      const { error } = await supabase.rpc('ramp_payee_save', {
        p_member: null, p_method: method, p_account_name: accountName.trim(), p_email: email.trim(), p_wise_recipient_id: recipient.trim(),
        p_target_currency: cur, p_bank, p_notes: notes.trim(),
      });
      if (error) throw error;
      toast('Payout details saved.');
      await onSaved();
    } catch (err) {
      setFail(errText(err));
    } finally {
      setBusy(false);
    }
  }

  const clear = (k: string) => setErrs((x) => { const n = { ...x }; delete n[k]; return n; });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-ink-2 mb-1.5">How do you want to be paid?</legend>
        <div role="radiogroup" aria-label="Payout method" className="grid gap-2 sm:grid-cols-2">
          {METHODS.map((k) => {
            const on = method === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setMethod(k)}
                className={cx('flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-3 text-left cursor-pointer min-h-11',
                  on ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-[#C9CED6] bg-white hover:bg-chip')}>
                <span className="text-[15px] font-semibold text-ink">{PAYEE_METHOD[k].label}</span>
                <span className="text-[13px] text-muted leading-snug">{PAYEE_METHOD[k].hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name on the account" required={method === 'bank'} error={errs.accountName} hint={method !== 'bank' ? 'As it appears on your Wise or bank account.' : undefined}>
          <Input value={accountName} maxLength={120} autoComplete="name" onChange={(e) => { setAccountName(e.target.value); clear('accountName'); }} />
        </Field>
        <Field label="Currency you’re paid in" error={errs.currency} hint="Three-letter code. Most of our team uses PHP.">
          <Input value={currency} maxLength={3} autoCapitalize="characters" className="uppercase" onChange={(e) => { setCurrency(e.target.value.toUpperCase()); clear('currency'); }} />
        </Field>
        {method === 'wise_email' && (
          <Field label="Wise email" required error={errs.email} className="sm:col-span-2">
            <Input type="email" inputMode="email" autoComplete="email" value={email} maxLength={200} onChange={(e) => { setEmail(e.target.value); clear('email'); }} />
          </Field>
        )}
        {method === 'wise_recipient' && (
          <Field label="Wise recipient ID" required error={errs.recipient} hint="Ask us if you don’t know it." className="sm:col-span-2">
            <Input value={recipient} maxLength={60} inputMode="numeric" onChange={(e) => { setRecipient(e.target.value); clear('recipient'); }} />
          </Field>
        )}
      </div>

      {method === 'bank' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
          <p className="text-[15px] font-semibold inline-flex items-center gap-2"><Icon name="lock" size={16} className="text-good" />Bank details</p>
          {hasBank && <Notice icon="info">Your bank details are saved. Leave these blank to keep them, or fill them in to replace them.</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank name" required={!hasBank} error={errs.bankName}>
              <Input value={bankName} maxLength={120} autoComplete="off" onChange={(e) => { setBankName(e.target.value); clear('bankName'); }} />
            </Field>
            <Field label="Account number" required={!hasBank} error={errs.acct}>
              <Input value={acct} maxLength={60} inputMode="numeric" autoComplete="off" onChange={(e) => { setAcct(e.target.value); clear('acct'); }} />
            </Field>
            <Field label="Routing, branch or SWIFT code" hint="If your bank uses one." className="sm:col-span-2">
              <Input value={routing} maxLength={60} autoComplete="off" onChange={(e) => setRouting(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
      {method !== 'bank' && hasBank && (
        <Checkbox checked={removeBank} onChange={setRemoveBank} label="Remove my saved bank details" hint="You won’t need them for Wise." />
      )}

      <Field label="Notes" hint="Optional. Anything we should know about paying you.">
        <Textarea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
      <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-white border-t border-line flex gap-2.5 justify-end pb-[max(12px,env(safe-area-inset-bottom))]">
        <Button className="flex-1 sm:flex-none" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-1 sm:flex-none" type="submit" variant="primary" loading={busy}>Save payout details</Button>
      </div>
    </form>
  );
}
