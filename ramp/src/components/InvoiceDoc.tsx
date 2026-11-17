// A clean, printable invoice used by admins (preview, print) and client contacts (their invoices).
// Phones get stacked line rows; print and wider screens get a table. Paid and void invoices carry a watermark.
import { createPortal } from 'react-dom';
import type { Client, Invoice, InvoiceLine } from '../lib/types';
import { cx, money } from '../lib/util';

export interface InvoiceDocProps {
  invoice: Invoice;
  lines: InvoiceLine[];
  client: Pick<Client, 'name' | 'billing_name' | 'billing_email' | 'billing_address'>;
  /** Seller name shown at the top (org.name). */
  from: string;
  /** Optional: more seller lines under the name (email, address). */
  fromDetails?: string;
  /** Optional: payment terms shown under the totals, e.g. "Payment due within 7 days." */
  terms?: string;
  /** Optional: hide the "Pay online" link even when the invoice has one. */
  hidePayLink?: boolean;
  className?: string;
}

const qtyFmt = (n: number | string) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const longDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
function period(start: string, end: string) {
  if (!start || !end) return '';
  if (start === end) return longDate(start);
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', o);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const a = f(start, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${a} – ${sameMonth ? f(end, { day: 'numeric' }) : f(end, { month: 'short', day: 'numeric' })}, ${end.slice(0, 4)}`;
}

export function InvoiceDoc({ invoice, lines, client, from, fromDetails, terms, hidePayLink, className }: InvoiceDocProps) {
  const cur = invoice.currency || 'USD';
  const sorted = [...lines].sort((a, b) => a.sort - b.sort);
  const charges = sorted.filter((l) => Number(l.amount) >= 0).reduce((a, l) => a + Number(l.amount), 0);
  const credits = sorted.filter((l) => Number(l.amount) < 0).reduce((a, l) => a + Number(l.amount), 0);
  const billName = client.billing_name?.trim() || client.name;
  const payUrl = !hidePayLink && invoice.status === 'open' ? invoice.stripe_url : null;
  const mark = invoice.status === 'paid' ? 'Paid' : invoice.status === 'void' ? 'Void' : null;

  return (
    <article aria-label={`Invoice ${invoice.number}`}
      className={cx('relative overflow-hidden bg-white text-ink border border-line rounded-2xl p-5 sm:p-8 print:border-0 print:rounded-none print:p-0 print:overflow-visible', className)}>
      {mark && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center z-0">
          <span style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
            className={cx('-rotate-[22deg] border-[6px] rounded-3xl px-6 sm:px-10 py-1 font-display font-bold uppercase tracking-[0.2em] text-6xl sm:text-8xl opacity-[0.13]',
              mark === 'Paid' ? 'text-good border-good' : 'text-bad border-bad')}>
            {mark}
          </span>
        </div>
      )}

      <div className="relative z-[1]">
        <header className="flex flex-col-reverse gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-xl font-bold leading-tight break-words">{from}</p>
            {fromDetails && <p className="mt-1 text-sm text-muted whitespace-pre-line leading-relaxed">{fromDetails}</p>}
          </div>
          <div className="sm:text-right">
            <p className="font-display text-[32px] leading-none font-bold tracking-tight">Invoice</p>
            <p className="mt-1.5 text-[15px] font-semibold text-ink-2 tabular-nums">{invoice.number}</p>
            {invoice.status === 'draft' && (
              <p className="mt-2 inline-block rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-ink-2">Draft, not issued yet</p>
            )}
            {mark && <p className="sr-only">Status: {mark}</p>}
          </div>
        </header>

        <div className="mt-7 grid gap-6 sm:grid-cols-2">
          <section aria-label="Bill to" className="min-w-0">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Bill to</h2>
            <p className="mt-1.5 font-semibold break-words">{billName}</p>
            {billName !== client.name && <p className="text-[15px] text-ink-2 break-words">{client.name}</p>}
            {client.billing_email && <p className="text-[15px] text-ink-2 break-all">{client.billing_email}</p>}
            {client.billing_address && <p className="text-[15px] text-ink-2 whitespace-pre-line break-words">{client.billing_address}</p>}
          </section>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[15px] sm:justify-self-end sm:min-w-64 content-start">
            <dt className="text-muted">Invoice number</dt><dd className="text-right font-semibold tabular-nums">{invoice.number}</dd>
            <dt className="text-muted">Issue date</dt><dd className="text-right font-semibold">{invoice.issue_date ? longDate(invoice.issue_date) : 'Not issued'}</dd>
            <dt className="text-muted">Due date</dt><dd className="text-right font-semibold">{invoice.due_date ? longDate(invoice.due_date) : '–'}</dd>
            <dt className="text-muted">Period</dt><dd className="text-right font-semibold whitespace-nowrap">{period(invoice.period_start, invoice.period_end)}</dd>
          </dl>
        </div>

        {/* Table for wider screens and print */}
        <table className="hidden sm:table print:table w-full mt-8 text-[15px] border-collapse">
          <caption className="sr-only">Invoice lines</caption>
          <thead>
            <tr className="border-b-2 border-ink text-left">
              <th scope="col" className="py-2 pr-4 font-semibold">Description</th>
              <th scope="col" className="py-2 px-3 font-semibold text-right w-20">Qty</th>
              <th scope="col" className="py-2 px-3 font-semibold text-right w-28">Rate</th>
              <th scope="col" className="py-2 pl-3 font-semibold text-right w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => (
              <tr key={l.id} className="border-b border-line align-top" style={{ breakInside: 'avoid' }}>
                <td className="py-3 pr-4 leading-snug">{l.description || 'Item'}</td>
                <td className="py-3 px-3 text-right tabular-nums">{qtyFmt(l.quantity)}</td>
                <td className="py-3 px-3 text-right tabular-nums">{money(l.unit_price, cur)}</td>
                <td className="py-3 pl-3 text-right tabular-nums font-semibold">{money(l.amount, cur)}</td>
              </tr>
            ))}
            {!sorted.length && (
              <tr><td colSpan={4} className="py-6 text-center text-muted">No lines yet.</td></tr>
            )}
          </tbody>
        </table>

        {/* Stacked rows for phones */}
        <ul className="sm:hidden print:hidden mt-7 border-y border-ink/80 divide-y divide-line" aria-label="Invoice lines">
          {sorted.map((l) => (
            <li key={l.id} className="py-3">
              <p className="text-[15px] leading-snug">{l.description || 'Item'}</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted tabular-nums">{qtyFmt(l.quantity)} × {money(l.unit_price, cur)}</span>
                <span className="text-[15px] font-semibold tabular-nums">{money(l.amount, cur)}</span>
              </div>
            </li>
          ))}
          {!sorted.length && <li className="py-6 text-center text-muted">No lines yet.</li>}
        </ul>

        <div className="mt-5 flex sm:justify-end" style={{ breakInside: 'avoid' }}>
          <dl className="w-full sm:w-80 text-[15px]">
            <div className="flex justify-between gap-4 py-1"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums font-semibold">{money(charges, cur)}</dd></div>
            {credits < 0 && (
              <div className="flex justify-between gap-4 py-1"><dt className="text-muted">Credits</dt><dd className="tabular-nums font-semibold">{money(credits, cur)}</dd></div>
            )}
            <div className="flex justify-between gap-4 mt-1.5 pt-2.5 border-t-2 border-ink">
              <dt className="font-display text-lg font-bold">{invoice.status === 'paid' ? 'Total paid' : 'Total due'}</dt>
              <dd className="font-display text-lg font-bold tabular-nums">{money(invoice.total, cur)}</dd>
            </div>
            <p className="mt-1 text-xs text-muted text-right">Amounts in {cur}</p>
          </dl>
        </div>

        {payUrl && (
          <p className="mt-6 rounded-xl bg-brand-soft px-4 py-3 text-[15px] text-brand-ink" style={{ breakInside: 'avoid' }}>
            <span className="font-semibold">Pay online: </span>
            <a href={payUrl} target="_blank" rel="noreferrer" className="underline break-all">{payUrl}</a>
          </p>
        )}

        {(invoice.notes?.trim() || terms) && (
          <section className="mt-7" style={{ breakInside: 'avoid' }}>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Notes</h2>
            {terms && <p className="mt-1.5 text-[15px] text-ink-2 leading-relaxed">{terms}</p>}
            {invoice.notes?.trim() && <p className="mt-1.5 text-[15px] text-ink-2 leading-relaxed whitespace-pre-line">{invoice.notes.trim()}</p>}
          </section>
        )}

        <p className="mt-8 text-sm text-muted">Thank you for your business.</p>
      </div>
    </article>
  );
}

// ───────── print ─────────

const PRINT_CSS = `
.ramp-invoice-print { display: none; }
@media print {
  body > *:not(.ramp-invoice-print) { display: none !important; }
  .ramp-invoice-print { display: block !important; }
  html, body { background: #fff !important; }
  @page { margin: 14mm; }
}`;

/**
 * Mount this on a page that offers "Print / save as PDF". It stays hidden on screen; when the page prints
 * (window.print()), everything else is hidden and only the invoice is printed.
 */
export function InvoicePrint(props: InvoiceDocProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ramp-invoice-print" aria-hidden="true">
      <style>{PRINT_CSS}</style>
      <InvoiceDoc {...props} />
    </div>,
    document.body,
  );
}

/** Print the invoice mounted with <InvoicePrint/>. The browser's dialog also offers "Save as PDF". */
export function printInvoice(number?: string) {
  const prev = document.title;
  if (number) document.title = `Invoice ${number}`;
  const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
  setTimeout(restore, 1500);
}
