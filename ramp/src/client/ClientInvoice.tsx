// One issued invoice for a client contact, with Pay (Stripe), PDF and Print. Rows come through row-level security.
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { INVOICE_STATUS, daysUntil, fmtDate, money } from '../lib/util';
import type { Client, ClientInvoiceFull, Invoice, InvoiceLine } from '../lib/types';
import { BackLink, Button, Card, Chip, EmptyState, ErrorBox, Notice, PageHeader, Skeleton } from '../ui';
import { InvoiceDoc, InvoicePrint, printInvoice } from '../components/InvoiceDoc';
import { ExternalButton, invoicePeriod } from './parts/portal-common';

type BillTo = Pick<Client, 'name' | 'billing_name' | 'billing_email' | 'billing_address'> & { net_days?: number };

export default function ClientInvoice() {
  const { id = '' } = useParams();
  const { org, roles } = useMe();
  const { data, error, reload } = useAsync(async () => {
    const { data: full, error: e } = await supabase.rpc('ramp_client_invoice', { p_id: id });
    if (!e) {
      const f = full as ClientInvoiceFull;
      const lines = f.lines.map((l) => ({ ...l, invoice_id: f.invoice.id, placement_id: null, reconciled_at: null })) as InvoiceLine[];
      return { invoice: { ...f.invoice, created_by: null } as Invoice, lines, client: f.client as BillTo | null, issuer: f.issuer?.name || '' };
    }
    if (/not found/i.test(e.message || '')) return null;
    if (e.code !== 'PGRST202') throw e;
    // Older database: read the tables directly (row-level security limits them to this client).
    const invoice = await q<Invoice | null>(supabase.from('ramp_invoices').select('*').eq('id', id).neq('status', 'draft').maybeSingle());
    if (!invoice) return null;
    const [lines, client] = await Promise.all([
      q<InvoiceLine[]>(supabase.from('ramp_invoice_lines').select('*').eq('invoice_id', id).order('sort')),
      q<BillTo | null>(supabase.from('ramp_clients').select('name, billing_name, billing_email, billing_address, net_days').eq('id', invoice.client_id).maybeSingle()),
    ]);
    return { invoice, lines, client, issuer: '' };
  }, [id]);
  useTitle(data?.invoice ? `Invoice ${data.invoice.number}` : 'Invoice');

  const back = <BackLink to="/client/invoices">Invoices</BackLink>;
  if (error && !data) return <div className="flex flex-col gap-6">{back}<ErrorBox error={error} onRetry={reload} /></div>;
  if (data === undefined) return <div className="flex flex-col gap-6">{back}<Skeleton rows={1} /><div className="skeleton h-96 rounded-2xl" aria-hidden="true" /></div>;
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <Card><EmptyState icon="fileText" title="We couldn’t find this invoice" body="It may have been replaced. Your current invoices are on the Invoices page." /></Card>
      </div>
    );
  }

  const inv = data.invoice;
  const st = INVOICE_STATUS[inv.status];
  const client: BillTo = data.client || { name: roles.client?.name || '', billing_name: '', billing_email: '', billing_address: '' };
  const payable = inv.status === 'open' && !!inv.stripe_url;
  const late = inv.status === 'open' && !!inv.due_date && (daysUntil(inv.due_date) ?? 0) < 0;
  const terms = inv.status === 'open' && client.net_days ? `Payment due within ${client.net_days} days of the issue date.` : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader back={{ to: '/client/invoices', label: 'Invoices' }} title={`Invoice ${inv.number}`}
          subtitle={<>{invoicePeriod(inv.period_start, inv.period_end)} · <span className="tabular-nums">{money(inv.total, inv.currency)}</span></>}
          actions={<>
            {payable && <span className="hidden md:contents"><ExternalButton href={inv.stripe_url!} icon="lock">Pay {money(inv.total, inv.currency)}</ExternalButton></span>}
            {inv.stripe_pdf && <ExternalButton href={inv.stripe_pdf} variant="secondary" icon="download">PDF</ExternalButton>}
            <Button icon="fileText" onClick={() => printInvoice(inv.number)}>Print</Button>
          </>} />
      </div>

      <div className="print:hidden flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={st.tone} icon={inv.status === 'paid' ? 'check' : undefined}>{st.label}</Chip>
          {inv.issue_date && <span className="text-[13px] text-muted">Issued {fmtDate(inv.issue_date, { month: 'long', day: 'numeric', year: 'numeric' })}</span>}
        </div>
        {inv.status === 'paid' && <Notice tone="good" icon="check">Paid {fmtDate(inv.paid_at, { month: 'long', day: 'numeric', year: 'numeric' })}. Thank you.</Notice>}
        {inv.status === 'void' && <Notice tone="dark" icon="info">This invoice was voided. You don’t need to pay it.</Notice>}
        {inv.status === 'open' && (
          <Notice tone={late ? 'bad' : 'warn'} icon={late ? 'alert' : 'calendar'}>
            {inv.due_date ? (late ? `This invoice was due ${fmtDate(inv.due_date, { month: 'long', day: 'numeric' })}. Please pay it as soon as you can.` : `Due ${fmtDate(inv.due_date, { month: 'long', day: 'numeric', year: 'numeric' })}.`) : 'Open.'}
            {!payable && ' Pay by the method shown on the invoice, or ask us for help.'}
          </Notice>
        )}
      </div>

      <InvoiceDoc invoice={inv} lines={data.lines} client={client} from={data.issuer || org.name} terms={terms} hidePayLink className="print:hidden" />
      {/* The printed copy keeps the online payment link. */}
      <InvoicePrint invoice={inv} lines={data.lines} client={client} from={data.issuer || org.name} terms={terms} />

      {payable && (
        <div className="md:hidden print:hidden sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 rounded-2xl bg-white border border-line shadow-lg p-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">{late ? 'Past due' : inv.due_date ? `Due ${fmtDate(inv.due_date)}` : 'Amount due'}</p>
            <p className="text-[17px] font-semibold tabular-nums">{money(inv.total, inv.currency)}</p>
          </div>
          <ExternalButton href={inv.stripe_url!} icon="lock">Pay now</ExternalButton>
        </div>
      )}
    </div>
  );
}
