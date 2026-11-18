// Payout export: Wise batch files (one per Wise template), a plain summary, and manual bank transfers.
import { useState } from 'react';
import { PAYEE_METHOD, money, plural } from '../../../lib/util';
import type { PayeeInfo, Payout, PayoutExportRow } from '../../../lib/types';
import { Button, Chip, Icon, IconButton, Notice, Sheet, useToast } from '../../../ui';
import { copyText, downloadText, safeText, toCsv } from './money-common';
import { bankLabel } from './money-payee';

/**
 * Wise batch file columns, one list per Wise batch template. Keep every Wise header here so it's easy to adjust.
 *
 * Wise matches columns by header name: the names must match its template exactly, but the order can change.
 * Checked against Wise Help ("How do I fill in my batch template?", "How do I send exact amounts with batch payments?",
 * "Why do I get an error when I upload my batch file?") in Nov 2026:
 *   - name, recipientId, recipientEmail, sourceCurrency, targetCurrency, amount and amountCurrency are Wise's names.
 *   - amountCurrency is "source" (the amount is in the source currency; Wise's fee comes out of it) or "target".
 *   - amount is digits only: no currency symbols and no thousands separators.
 *   - One source currency per batch file, up to 1,000 transfers, UTF-8 CSV.
 * Not confirmed by those pages (they point to the downloadable templates instead): paymentReference, and receiverType
 * (PRIVATE for a person) on the email template, plus the exact column order of each template.
 * If Wise rejects a header, download a fresh template from Wise's batch payments page and copy its names here.
 */
export const WISE_COLUMNS = {
  /** "Send to saved recipients" template: people already saved as recipients in our Wise account. */
  savedRecipients: ['recipientId', 'name', 'recipientEmail', 'sourceCurrency', 'targetCurrency', 'amountCurrency', 'amount', 'paymentReference'],
  /** "Send by email" template: Wise emails each person a secure link to add their bank details. */
  email: ['name', 'recipientEmail', 'paymentReference', 'receiverType', 'amountCurrency', 'amount', 'sourceCurrency', 'targetCurrency'],
} as const;
export const WISE_MAX_ROWS = 1000;
type WiseColumn = (typeof WISE_COLUMNS)['savedRecipients'][number] | (typeof WISE_COLUMNS)['email'][number];

/** A short, plain payment reference ("Payout Nov 16"). Wise limits length and characters, which vary by currency. */
export function wiseReference(payout: Pick<Payout, 'period_end'>) {
  const d = new Date(payout.period_end + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Payout ${d}`.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 18);
}

function cell(col: WiseColumn, r: PayoutExportRow, ref: string): string {
  switch (col) {
    case 'recipientId': return r.wise_recipient_id.trim();
    case 'name': return (r.account_name || r.name).trim();
    case 'recipientEmail': return r.email.trim();
    case 'sourceCurrency': return (r.currency || 'USD').toUpperCase();
    case 'targetCurrency': return (r.target_currency || 'PHP').toUpperCase();
    case 'amountCurrency': return 'source';
    case 'amount': return Number(r.amount).toFixed(2);
    case 'paymentReference': return ref;
    case 'receiverType': return 'PRIVATE';
  }
}

export function wiseCsv(kind: keyof typeof WISE_COLUMNS, rows: PayoutExportRow[], ref: string) {
  const cols = WISE_COLUMNS[kind];
  return toCsv(cols, rows.map((r) => cols.map((c) => cell(c, r, ref))));
}

export interface ExportPlan {
  saved: PayoutExportRow[];
  email: PayoutExportRow[];
  bank: PayoutExportRow[];
  other: PayoutExportRow[];
  skipped: { row: PayoutExportRow; why: string }[];
}

export function planExport(rows: PayoutExportRow[]): ExportPlan {
  const plan: ExportPlan = { saved: [], email: [], bank: [], other: [], skipped: [] };
  for (const r of rows) {
    if (!(Number(r.amount) > 0)) { plan.skipped.push({ row: r, why: 'Nothing to pay: the total is zero or less.' }); continue; }
    if (r.method === 'wise_recipient') {
      if (r.wise_recipient_id.trim()) plan.saved.push(r);
      else plan.skipped.push({ row: r, why: 'Paid to a Wise saved recipient, but the recipient ID is missing.' });
    } else if (r.method === 'wise_email') {
      if (r.email.includes('@')) plan.email.push(r);
      else plan.skipped.push({ row: r, why: 'Paid by Wise email, but there’s no email address.' });
    } else if (r.method === 'bank') plan.bank.push(r);
    else plan.other.push(r);
  }
  return plan;
}

function summaryCsv(rows: PayoutExportRow[], plan: ExportPlan, ref: string) {
  const where = (r: PayoutExportRow) => plan.saved.includes(r) ? 'Wise saved recipients file' : plan.email.includes(r) ? 'Wise email file'
    : plan.bank.includes(r) ? 'Manual bank transfer' : plan.other.includes(r) ? 'Paid another way' : 'Not included';
  const header = ['Name', 'Account name', 'Email', 'Method', 'Wise recipient ID', 'Amount', 'Currency', 'Target currency', 'Reference', 'Paid by'];
  const body = rows.map((r) => [safeText(r.name), safeText(r.account_name), safeText(r.email), PAYEE_METHOD[r.method]?.label || r.method,
    safeText(r.wise_recipient_id), Number(r.amount).toFixed(2), r.currency, r.target_currency, ref, where(r)]);
  // A byte-order mark so spreadsheet apps read names with accents correctly. (Not used for the Wise files.)
  return '﻿' + toCsv(header, body);
}


export function ExportSheet({ open, rows, payout, payees, onClose, onMarkSent }:
  { open: boolean; rows: PayoutExportRow[]; payout: Payout; payees: Map<string, PayeeInfo | null>; onClose: () => void; onMarkSent?: () => void }) {
  const toast = useToast();
  const plan = planExport(rows);
  const ref = wiseReference(payout);
  const stamp = payout.period_end;
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const cur = payout.currency;

  const fileCard = (title: string, desc: string, list: PayoutExportRow[], kind: keyof typeof WISE_COLUMNS, filename: string) => (
    <div className="rounded-2xl border border-line p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted leading-relaxed">{desc}</p>
        </div>
        <Chip tone="brand">{plural(list.length, 'person', 'people')} · {money(list.reduce((a, r) => a + Number(r.amount), 0), cur)}</Chip>
      </div>
      <ul className="text-sm text-ink-2 flex flex-wrap gap-x-3 gap-y-1">
        {list.map((r) => <li key={r.member_id}>{r.account_name || r.name} <span className="text-muted tabular-nums">{money(r.amount, cur)} → {r.target_currency}</span></li>)}
      </ul>
      {list.length > WISE_MAX_ROWS && <Notice tone="warn">Wise takes up to {WISE_MAX_ROWS} transfers per file. Split this file before uploading.</Notice>}
      <Button variant="primary" icon="download" className="self-start" aria-label={`Download Wise batch file (CSV) for ${title.toLowerCase()}`}
        onClick={() => { downloadText(filename, wiseCsv(kind, list, ref)); toast(`Downloaded ${filename}.`); }}>
        Wise batch file (CSV)
      </Button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} wide title="Payout files"
      subtitle={`${payout.label} · ${plural(rows.length, 'team member')} · ${money(total, cur)}`}
      footer={<>
        <Button onClick={onClose}>Done</Button>
        {onMarkSent && <Button variant="success" icon="check" onClick={onMarkSent}>I’ve sent the money</Button>}
      </>}>
      <Notice>
        In Wise, start a batch payment and upload each file with the matching template (saved recipients or email). Wise shows every transfer for you to check before you pay.
        Amounts are in {cur} and Wise’s fee comes out of each amount. The reference on each transfer is “{ref}”.
      </Notice>

      {(plan.saved.length > 0 || plan.email.length > 0) ? (
        <div className="flex flex-col gap-3">
          {plan.saved.length > 0 && fileCard('Wise saved recipients', 'People already saved as recipients in your Wise account.', plan.saved, 'savedRecipients', `wise-saved-recipients-${stamp}.csv`)}
          {plan.email.length > 0 && fileCard('Wise by email', 'Wise emails each person a secure link to add their bank details. Links expire after a week.', plan.email, 'email', `wise-email-${stamp}.csv`)}
          {plan.email.some((r) => !payees.get(r.member_id)) && (
            <p className="text-sm text-warn leading-relaxed">
              Some people in the email file haven’t added payout details, so their RAMP email is used:{' '}
              {plan.email.filter((r) => !payees.get(r.member_id)).map((r) => r.name).join(', ')}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[15px] text-muted">No one in this payout is paid through a Wise batch.</p>
      )}

      {plan.bank.length > 0 && <BankPanel rows={plan.bank} cur={cur} />}

      {plan.other.length > 0 && (
        <div className="rounded-2xl border border-line p-4">
          <p className="font-semibold">Paid another way</p>
          <p className="text-sm text-muted">These people agreed a different way to be paid. Pay them yourself.</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[15px]">
            {plan.other.map((r) => (
              <li key={r.member_id} className="flex flex-wrap justify-between gap-2">
                <span>{r.name}{payees.get(r.member_id)?.notes ? <span className="text-muted">: {payees.get(r.member_id)!.notes}</span> : ''}</span>
                <span className="font-semibold tabular-nums">{money(r.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.skipped.length > 0 && (
        <Notice tone="warn" icon="alert">
          <p className="font-semibold">Left out of the Wise files</p>
          <ul className="mt-1 list-disc pl-5">
            {plan.skipped.map((s) => <li key={s.row.member_id}>{s.row.name} ({money(s.row.amount, cur)}): {s.why}</li>)}
          </ul>
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bg px-4 py-3">
        <p className="text-sm text-muted min-w-0 flex-1 basis-56">Everyone in this payout, with amounts and how each is paid. Bank numbers aren’t included.</p>
        <Button icon="download" onClick={() => { const f = `payout-summary-${stamp}.csv`; downloadText(f, summaryCsv(rows, plan, ref)); toast(`Downloaded ${f}.`); }}>
          Payout summary (CSV)
        </Button>
      </div>
    </Sheet>
  );
}

/** Decrypted bank details for manual transfers, hidden until asked for. */
function BankPanel({ rows, cur }: { rows: PayoutExportRow[]; cur: string }) {
  const toast = useToast();
  const [shown, setShown] = useState(false);
  const copy = async (label: string, v: string) => { if (await copyText(v)) toast(`${label} copied.`); else toast('Couldn’t copy. Select the text instead.', 'bad'); };
  return (
    <section className="rounded-2xl border-2 border-dashed border-amber bg-warn-soft/50 p-4 flex flex-col gap-3" aria-label="Bank transfers">
      <div>
        <p className="flex items-center gap-2 font-semibold"><Icon name="lock" size={18} />Bank transfers to make yourself</p>
        <p className="text-sm text-ink-2 leading-relaxed mt-1">
          These people are paid by bank transfer, which isn’t part of a Wise batch file. Send each one from your bank or Wise.
          The details below were decrypted for this export, and the export was logged. Don’t copy them anywhere else.
        </p>
      </div>
      {!shown ? (
        <Button icon="eye" className="self-start" onClick={() => setShown(true)}>Show bank details for {plural(rows.length, 'person', 'people')}</Button>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.member_id} className="rounded-xl bg-white border border-line p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{r.account_name || r.name}</p>
                  <p className="font-display text-lg font-bold tabular-nums">{money(r.amount, cur)} <span className="text-sm font-semibold text-muted">to {r.target_currency}</span></p>
                </div>
                {r.bank && Object.keys(r.bank).length ? (
                  <dl className="mt-2 flex flex-col divide-y divide-line-2">
                    {Object.entries(r.bank).filter(([, v]) => String(v ?? '').trim()).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 py-1.5">
                        <dt className="col-start-1 text-xs font-semibold text-muted">{bankLabel(k)}</dt>
                        <dd className="col-start-1 row-start-2 font-mono text-sm break-all">{String(v)}</dd>
                        <dd className="col-start-2 row-start-1 row-span-2">
                          <IconButton icon="copy" label={`Copy ${bankLabel(k)} for ${r.name}`} size={16} onClick={() => copy(bankLabel(k), String(v))} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-1 text-sm text-bad font-semibold">No bank details saved. Ask {r.name} to add them in My work, or edit their payout details.</p>
                )}
              </li>
            ))}
          </ul>
          <Button icon="eyeOff" className="self-start" onClick={() => setShown(false)}>Hide bank details</Button>
        </>
      )}
    </section>
  );
}
