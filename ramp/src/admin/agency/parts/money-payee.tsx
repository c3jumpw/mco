// Payout details for one assistant: what's saved (ramp_payee_get) and the admin edit sheet (ramp_payee_save).
import { useEffect, useState } from 'react';
import { supabase, errText } from '../../../lib/supabase';
import { q } from '../../../lib/hooks';
import { PAYEE_METHOD } from '../../../lib/util';
import type { PayeeInfo, PayeeMethod } from '../../../lib/types';
import { Button, Field, Input, Notice, Pills, Select, Sheet, Textarea, useToast } from '../../../ui';

/** A one-line description of how someone is paid, and what's missing (if anything). */
export function payeeSummary(p: PayeeInfo | null | undefined, rampEmail: string): { text: string; issue: string | null; soft?: boolean } {
  if (!p) return { text: 'No payout details yet', issue: `Wise will email ${rampEmail || 'them'} a link to add bank details. Ask them to add details in My work, or add them here.`, soft: true };
  switch (p.method) {
    case 'wise_email': return { text: `Wise, by email · ${p.email || 'no email'}`, issue: p.email ? null : 'The Wise email is missing.' };
    case 'wise_recipient': return { text: `Wise saved recipient${p.wise_recipient_id ? ` · ID ${p.wise_recipient_id}` : ''}`, issue: p.wise_recipient_id ? null : 'The Wise recipient ID is missing.' };
    case 'bank': return { text: `Bank transfer${p.account_name ? ` · ${p.account_name}` : ''}`, issue: p.has_bank ? null : 'Bank details are missing.' };
    default: return { text: `Other${p.notes ? ` · ${p.notes}` : ''}`, issue: null };
  }
}

const CURRENCIES = ['PHP', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR', 'IDR', 'VND', 'MYR', 'THB', 'PKR', 'LKR', 'MXN', 'COP', 'BRL', 'ZAR', 'KES', 'NGN', 'EGP'];
// Same keys as the assistant's own form (My work › Payout details): bank_name, account_number, routing_code.
const BANK_FIELDS: { k: string; label: string; required?: boolean; hint?: string }[] = [
  { k: 'bank_name', label: 'Bank name', required: true },
  { k: 'account_number', label: 'Account number or IBAN', required: true },
  { k: 'routing_code', label: 'Routing, branch or SWIFT code', hint: 'If their bank uses one. Most international transfers need the SWIFT code.' },
  { k: 'bank_address', label: 'Bank address', hint: 'Optional.' },
];

/** Labels for saved bank detail keys from either form; unknown keys fall back to a readable version of the key. */
const BANK_LABELS: Record<string, string> = {
  bank_name: 'Bank name', account_number: 'Account number', routing_code: 'Routing, branch or SWIFT code',
  swift: 'SWIFT/BIC', branch: 'Branch', bank_address: 'Bank address', iban: 'IBAN', account_name: 'Account name',
};
export function bankLabel(k: string) {
  return BANK_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/[_-]+/g, ' ');
}

export interface PayeeTarget { memberId: string; name: string; email: string; payee: PayeeInfo | null }

export function PayeeSheet({ target, onClose, onSaved }: { target: PayeeTarget | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState<PayeeMethod>('wise_email');
  const [accountName, setAccountName] = useState('');
  const [email, setEmail] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [currency, setCurrency] = useState('PHP');
  const [notes, setNotes] = useState('');
  const [bank, setBank] = useState<Record<string, string>>({});
  const [bankMode, setBankMode] = useState<'keep' | 'replace' | 'remove'>('keep');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    const p = target.payee;
    setMethod(p?.method || 'wise_email');
    setAccountName(p?.account_name || target.name);
    setEmail(p?.email || target.email);
    setRecipientId(p?.wise_recipient_id || '');
    setCurrency(p?.target_currency || 'PHP');
    setNotes(p?.notes || '');
    setBank({});
    setBankMode(p?.has_bank ? 'keep' : 'replace');
    setErr('');
  }, [target]);
  if (!target) return null;
  const hasBank = !!target.payee?.has_bank;

  async function save() {
    setErr('');
    if (method === 'wise_email' && !/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter the email address of their Wise account.');
    if (method === 'wise_recipient' && !recipientId.trim()) return setErr('Enter the Wise recipient ID. You’ll find it in Wise under Recipients.');
    let pBank: Record<string, string> | null = null;
    if (bankMode === 'remove') pBank = {};
    else if (bankMode === 'replace' && (method === 'bank' || Object.values(bank).some((v) => v.trim()))) {
      const filled = Object.fromEntries(Object.entries(bank).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      if (method === 'bank' && (!filled.bank_name || !filled.account_number)) return setErr('Enter at least the bank name and account number.');
      pBank = Object.keys(filled).length ? filled : null;
    }
    if (method === 'bank' && !hasBank && !pBank) return setErr('Enter the bank details.');
    setBusy(true);
    try {
      await q(supabase.rpc('ramp_payee_save', {
        p_member: target!.memberId, p_method: method, p_account_name: accountName.trim(), p_email: email.trim(),
        p_wise_recipient_id: recipientId.trim(), p_target_currency: currency, p_bank: pBank, p_notes: notes.trim(),
      }));
      toast(`Payout details saved for ${target!.name}.`);
      onSaved();
      onClose();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];

  return (
    <Sheet open onClose={onClose} title={`Payout details for ${target.name}`}
      subtitle="How we send their pay. Changes are logged, and they can see these details on their My work page."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" loading={busy} onClick={save}>Save details</Button></>}>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-ink-2 mb-1.5">How they’re paid</legend>
        <Pills label="How they’re paid" size="sm" value={method} onChange={setMethod}
          options={(Object.keys(PAYEE_METHOD) as PayeeMethod[]).map((m) => ({ value: m, label: PAYEE_METHOD[m].label }))} />
        <p className="text-sm text-muted leading-relaxed">{PAYEE_METHOD[method].hint}</p>
      </fieldset>

      <Field label="Name on the account" hint="As it appears on their bank or Wise account. Wise uses it to match the transfer.">
        <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} maxLength={120} autoComplete="off" />
      </Field>
      {(method === 'wise_email' || method === 'wise_recipient') && (
        <Field label={method === 'wise_email' ? 'Email for Wise' : 'Email'} required={method === 'wise_email'}
          hint={method === 'wise_email' ? 'Wise sends the payment link here.' : 'Optional. Wise can send a payment notice here.'}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
      )}
      {method === 'wise_recipient' && (
        <Field label="Wise recipient ID" required hint="The number Wise shows for this saved recipient.">
          <Input value={recipientId} onChange={(e) => setRecipientId(e.target.value)} inputMode="numeric" maxLength={60} autoComplete="off" />
        </Field>
      )}
      <Field label="Currency they receive">
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>

      {method === 'bank' && (
        <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-4">
          <legend className="px-1 text-[13px] font-semibold text-ink-2">Bank details (encrypted)</legend>
          {hasBank && bankMode !== 'replace' ? (
            <>
              <p className="text-[15px]">{bankMode === 'remove' ? 'The saved bank details will be removed when you save.' : 'Bank details are saved and encrypted. They’re only shown when you export a payout, and every view is logged.'}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon="pen" onClick={() => setBankMode('replace')}>Replace them</Button>
                {bankMode === 'keep'
                  ? <Button size="sm" variant="danger" icon="trash" onClick={() => setBankMode('remove')}>Remove them</Button>
                  : <Button size="sm" onClick={() => setBankMode('keep')}>Keep them</Button>}
              </div>
            </>
          ) : (
            <>
              {BANK_FIELDS.map((f) => (
                <Field key={f.k} label={f.label} required={f.required} hint={f.hint}>
                  <Input value={bank[f.k] || ''} onChange={(e) => setBank((b) => ({ ...b, [f.k]: e.target.value }))} autoComplete="off" />
                </Field>
              ))}
              {hasBank && <Button size="sm" className="self-start" onClick={() => { setBank({}); setBankMode('keep'); }}>Keep the saved details instead</Button>}
            </>
          )}
        </fieldset>
      )}

      <Field label="Notes" hint={method === 'other' ? 'How to pay them, for example "GCash 0917 …".' : 'Optional.'}>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </Field>
      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
    </Sheet>
  );
}
