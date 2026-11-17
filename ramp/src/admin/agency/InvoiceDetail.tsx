import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { addDays, fmtDate, fmtDateTime, money, plural } from '../../lib/util';
import type { Client, Invoice, InvoiceLine } from '../../lib/types';
import { Button, Card, EmptyState, ErrorBox, Icon, LinkButton, Notice, PageHeader, Sheet, Skeleton, useConfirm, useToast } from '../../ui';
import { InvoiceDoc, InvoicePrint, printInvoice } from '../../components/InvoiceDoc';
import { AGENCY_BACK, AGENCY_EYEBROW, InvoiceChip, Line, copyText, diffDays, isOverdue, rangeLabel, useOrgToday } from './parts/money-common';
import { LineSheet, LinesEditor, MarkPaidSheet, VoidSheet, type LineTarget } from './parts/money-invoice-edit';
import { StripeSetup, StripeState, invokeStripe, loadStripeStatus } from './parts/money-stripe';

interface Data { invoice: Invoice; lines: InvoiceLine[]; client: Client | null }

export default function InvoiceDetail() {
  const { id = '' } = useParams();
  const { org } = useMe();
  const today = useOrgToday();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const data = useAsync<Data | null>(async () => {
    const invoice = await q<Invoice | null>(supabase.from('ramp_invoices').select('*').eq('id', id).maybeSingle());
    if (!invoice) return null;
    const [lines, client] = await Promise.all([
      q<InvoiceLine[]>(supabase.from('ramp_invoice_lines').select('*').eq('invoice_id', id).order('sort')),
      q<Client | null>(supabase.from('ramp_clients').select('*').eq('id', invoice.client_id).maybeSingle()),
    ]);
    return { invoice, lines, client };
  }, [id]);
  const stripe = useAsync(loadStripeStatus, []);
  useTitle(data.data?.invoice ? `Invoice ${data.data.invoice.number}` : 'Invoice');

  const [lineTarget, setLineTarget] = useState<LineTarget | null>(null);
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [busy, setBusy] = useState<'' | 'issue' | 'send' | 'discard'>('');
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [stripeHelp, setStripeHelp] = useState(false);

  if (data.error && !data.data) {
    return <Shell><ErrorBox error={data.error} onRetry={data.reload} /></Shell>;
  }
  if (data.data === undefined) return <Shell><Skeleton rows={6} /></Shell>;
  if (data.data === null) {
    return (
      <Shell>
        <Card><EmptyState icon="fileText" title="Invoice not found" body="It may have been removed, or the link is wrong." action={<LinkButton to="/admin/invoices">All invoices</LinkButton>} /></Card>
      </Shell>
    );
  }

  const { invoice: inv, lines, client } = data.data;
  const cur = inv.currency;
  const clientName = client?.name || 'the client';
  const billingEmail = client?.billing_email || '';
  const st = stripe.data;
  const stripeable = !inv.stripe_invoice_id && (inv.status === 'draft' || inv.status === 'open');
  const canStripe = stripeable && !!st?.configured && !!billingEmail;
  const needsStripeSetup = stripeable && !!st && !st.configured;
  const nextSort = lines.reduce((m, l) => Math.max(m, l.sort), -1) + 1;
  const empty = !lines.length || Number(inv.total) <= 0;
  const docClient = { name: client?.name || 'Client', billing_name: client?.billing_name || '', billing_email: billingEmail, billing_address: client?.billing_address || '' };
  const terms = client && inv.status !== 'paid' && inv.status !== 'void' ? `Payment due within ${plural(client.net_days, 'day')} of the issue date.` : undefined;

  const reload = data.reload;

  async function issue() {
    const due = addDays(today, client?.net_days ?? 7);
    const ok = await confirm({
      title: `Issue ${inv.number}?`,
      body: `Bills ${clientName} ${money(inv.total, cur)}, due ${fmtDate(due)} (${plural(client?.net_days ?? 7, 'day')}). The lines lock, and ${clientName}’s contacts can see it in RAMP. It isn’t emailed: print it or send the PDF yourself${st?.configured ? ', or use Send through Stripe instead' : ''}.`,
      action: 'Issue invoice',
    });
    if (!ok) return;
    setBusy('issue');
    try {
      await q(supabase.rpc('ramp_invoice_set_status', { p_invoice: inv.id, p_status: 'open', p_note: '' }));
      toast(`${inv.number} issued.`);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
      reload();
    }
  }

  async function sendStripe() {
    const ok = await confirm({
      title: `Send ${inv.number} through Stripe?`,
      body: `Bills ${clientName} ${money(inv.total, cur)} and emails it to ${billingEmail} from Stripe, with a link to pay online.${inv.status === 'draft' ? ' The invoice is issued now and its lines lock.' : ''}${st?.mode === 'test' ? ' Stripe is in test mode, so no real payment can be made.' : ''}`,
      action: 'Send through Stripe',
    });
    if (!ok) return;
    setBusy('send');
    try {
      const r = await invokeStripe<{ ok: boolean; url: string | null }>({ action: 'send', invoice_id: inv.id });
      setSentUrl(r.url || '');
      toast(`Sent to ${billingEmail} through Stripe.`);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
      reload();
    }
  }

  async function discard() {
    const ok = await confirm({
      title: 'Discard this draft?',
      body: `${inv.number} is voided, and its hours, prepayments and setup fees go back to unbilled so you can bill them again. The number isn’t reused.`,
      action: 'Discard draft', danger: true,
    });
    if (!ok) return;
    setBusy('discard');
    try {
      await q(supabase.rpc('ramp_invoice_set_status', { p_invoice: inv.id, p_status: 'void', p_note: 'Draft discarded.' }));
      toast('Draft discarded.');
      navigate('/admin/invoices');
    } catch (e) {
      toast(errText(e), 'bad');
      setBusy('');
      reload();
    }
  }

  async function copyLink(url: string) {
    if (await copyText(url)) toast('Payment link copied.');
    else toast('Couldn’t copy. Open the link and copy it from the address bar.', 'bad');
  }

  const overdue = isOverdue(inv, today);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={AGENCY_EYEBROW} title={`Invoice ${inv.number}`}
        subtitle={<>{client ? <Link to={`/admin/clients/${client.id}`} className="font-semibold text-brand-ink no-underline hover:underline">{client.name}</Link> : 'Client'} · {rangeLabel(inv.period_start, inv.period_end, true)}</>}
        actions={<>
          <Button icon="download" onClick={() => printInvoice(inv.number)}>Print / save as PDF</Button>
          <LinkButton to="/admin/invoices" variant="ghost" icon="list">All invoices</LinkButton>
        </>} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        {/* Status and actions (first on phones, right column on desktop) */}
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <InvoiceChip invoice={inv} today={today} />
              {inv.stripe_invoice_id && <span className="text-xs font-semibold text-muted">Sent through Stripe</span>}
            </div>
            <p className="mt-3 font-display text-[32px] leading-none font-bold tabular-nums">{money(inv.total, cur)}</p>
            <p className="mt-1 text-sm text-muted">{plural(lines.length, 'line')}</p>
            <dl className="mt-3 border-t border-line-2 pt-2">
              {inv.issue_date && <Line label="Issued">{fmtDate(inv.issue_date)}</Line>}
              {inv.due_date && inv.status !== 'void' && (
                <Line label="Due"><span className={overdue ? 'text-bad' : undefined}>{fmtDate(inv.due_date)}{overdue ? ` · ${plural(diffDays(inv.due_date, today), 'day')} late` : ''}</span></Line>
              )}
              {inv.sent_at && <Line label="Emailed">{fmtDateTime(inv.sent_at, org.timezone)}</Line>}
              {inv.status === 'draft' && <Line label="Due if issued today">{fmtDate(addDays(today, client?.net_days ?? 7))}</Line>}
            </dl>

            {inv.status === 'paid' && (
              <Notice tone="good" icon="check" className="mt-3">
                Paid {fmtDateTime(inv.paid_at, org.timezone)}{inv.paid_note ? ` · ${inv.paid_note}` : ''}.
              </Notice>
            )}
            {inv.status === 'void' && (
              <Notice tone="dark" icon="x" className="mt-3">Void. Its hours, prepayments and setup fees went back to unbilled.</Notice>
            )}

            {sentUrl !== null && (
              <Notice tone="good" icon="send" className="mt-3">
                <p className="font-semibold">Sent. Stripe emailed {billingEmail}.</p>
                {sentUrl && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={sentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 min-h-10 px-3 rounded-[10px] bg-white text-ink font-semibold text-sm no-underline border border-line">
                      <Icon name="link" size={16} />Open the hosted invoice
                    </a>
                    <Button size="sm" icon="copy" onClick={() => copyLink(sentUrl)}>Copy link</Button>
                  </div>
                )}
              </Notice>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {inv.status === 'draft' && (
                <>
                  {empty && <Notice tone="warn">Add at least one line with an amount before issuing.</Notice>}
                  {canStripe ? (
                    <>
                      <Button variant="primary" icon="send" loading={busy === 'send'} disabled={!!busy || empty} onClick={sendStripe}>Send through Stripe</Button>
                      <Button icon="check" loading={busy === 'issue'} disabled={!!busy || empty} onClick={issue}>Issue without emailing</Button>
                    </>
                  ) : (
                    <Button variant="primary" icon="check" loading={busy === 'issue'} disabled={!!busy || empty} onClick={issue}>Issue invoice</Button>
                  )}
                  {needsStripeSetup && <Button icon="send" onClick={() => setStripeHelp(true)}>Send through Stripe</Button>}
                  <Button variant="danger" icon="trash" loading={busy === 'discard'} disabled={!!busy} onClick={discard}>Discard draft</Button>
                </>
              )}
              {inv.status === 'open' && (
                <>
                  <Button variant="success" icon="check" disabled={!!busy} onClick={() => setPaying(true)}>Mark paid</Button>
                  {canStripe && <Button icon="send" loading={busy === 'send'} disabled={!!busy} onClick={sendStripe}>Send through Stripe</Button>}
                  {needsStripeSetup && <Button icon="send" onClick={() => setStripeHelp(true)}>Send through Stripe</Button>}
                  {inv.stripe_url && sentUrl === null && <Button icon="copy" onClick={() => copyLink(inv.stripe_url!)}>Copy Stripe link</Button>}
                  <Button variant="danger" icon="x" disabled={!!busy} onClick={() => setVoiding(true)}>Void invoice</Button>
                </>
              )}
              {(inv.stripe_url || inv.stripe_pdf) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {inv.stripe_url && <a href={inv.stripe_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-11 font-semibold text-brand-ink no-underline"><Icon name="link" size={16} />Stripe invoice page</a>}
                  {inv.stripe_pdf && <a href={inv.stripe_pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 min-h-11 font-semibold text-brand-ink no-underline"><Icon name="download" size={16} />Stripe PDF</a>}
                </div>
              )}
            </div>
          </Card>

          {stripeable && (stripe.error || st?.configured) && (
            <Card>
              <h2 className="font-display text-lg font-semibold mb-2">Stripe</h2>
              {stripe.error ? <StripeState error={stripe.error} onRetry={stripe.reload} /> : (
                <div className="flex flex-col gap-3">
                  <StripeState status={st} />
                  {!billingEmail && (
                    <Notice tone="warn" icon="mail">
                      Add a billing email for {clientName} to send through Stripe.{' '}
                      {client && <Link to={`/admin/clients/${client.id}`} className="font-semibold underline">Edit client</Link>}
                    </Notice>
                  )}
                </div>
              )}
            </Card>
          )}
          {inv.stripe_invoice_id && st && !st.webhook && inv.status === 'open' && (
            <Notice tone="warn">When {clientName} pays in Stripe, mark it paid here too. The Stripe webhook isn’t set up, so RAMP won’t hear about it.</Notice>
          )}
        </div>

        {/* The invoice itself */}
        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1 min-w-0">
          <InvoiceDoc invoice={inv} lines={lines} client={docClient} from={org.name} terms={terms} className="shadow-sm" />
          {inv.status === 'draft' && <LinesEditor invoice={inv} lines={lines} onEdit={setLineTarget} onChanged={reload} />}
        </div>
      </div>

      <InvoicePrint invoice={inv} lines={lines} client={docClient} from={org.name} terms={terms} />
      <LineSheet target={lineTarget} invoice={inv} nextSort={nextSort} onClose={() => setLineTarget(null)} onSaved={reload} />
      <MarkPaidSheet open={paying} invoice={inv} clientName={clientName} onClose={() => setPaying(false)} onDone={reload} />
      <Sheet open={stripeHelp} onClose={() => setStripeHelp(false)} title="Stripe isn’t connected yet"
        subtitle="Once it is, RAMP emails invoices from Stripe with a link to pay by card or bank."
        footer={<Button onClick={() => setStripeHelp(false)}>Close</Button>}>
        <StripeSetup />
      </Sheet>
      <VoidSheet open={voiding} invoice={inv} clientName={clientName} onClose={() => setVoiding(false)} onDone={reload} />
      {dialog}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={AGENCY_EYEBROW} title="Invoice" />
      {children}
    </div>
  );
}
