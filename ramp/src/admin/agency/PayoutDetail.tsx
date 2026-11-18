import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { q, useAsync, useTitle } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { fmtDateTime, hours, money, plural } from '../../lib/util';
import type { PayeeInfo, Payout, PayoutExportRow, PayoutLine } from '../../lib/types';
import { Avatar, Button, Card, Chip, EmptyState, ErrorBox, IconButton, LinkButton, Notice, PageHeader, Skeleton, useConfirm, useToast } from '../../ui';
import { AGENCY_BACK, AGENCY_EYEBROW, Line, PayoutChip, loadMembers, nameOf, num, rangeLabel, type MemberLite } from './parts/money-common';
import { PayeeSheet, payeeSummary, type PayeeTarget } from './parts/money-payee';
import { MarkSentSheet, PayoutLineSheet, type PayoutLineTarget } from './parts/money-payout-edit';
import { ExportSheet } from './parts/money-wise';

interface Data {
  payout: Payout;
  lines: PayoutLine[];
  members: Map<string, MemberLite>;
  payees: Map<string, PayeeInfo | null>;
  assistants: { id: string; name: string }[];
}

async function load(id: string): Promise<Data | null> {
  const payout = await q<Payout | null>(supabase.from('ramp_payouts').select('*').eq('id', id).maybeSingle());
  if (!payout || payout.discarded_at) return null;
  const [lines, placed] = await Promise.all([
    q<PayoutLine[]>(supabase.from('ramp_payout_lines').select('*').eq('payout_id', id).order('sort')),
    q<{ member_id: string }[]>(supabase.from('ramp_placements').select('member_id').neq('status', 'proposed')),
  ]);
  const inPayout = [...new Set(lines.map((l) => l.member_id))];
  const [members, payeeList] = await Promise.all([
    loadMembers([...inPayout, ...placed.map((p) => p.member_id)]),
    Promise.all(inPayout.map(async (m) => [m, await q<PayeeInfo | null>(supabase.rpc('ramp_payee_get', { p_member: m }))] as const)),
  ]);
  const assistants = [...new Set([...inPayout, ...placed.map((p) => p.member_id)])]
    .map((m) => ({ id: m, name: nameOf(members.get(m)) })).sort((a, b) => a.name.localeCompare(b.name));
  return { payout, lines, members, payees: new Map(payeeList), assistants };
}

export default function PayoutDetail() {
  const { id = '' } = useParams();
  const { org } = useMe();
  const tz = org.timezone;
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const data = useAsync(() => load(id), [id]);
  useTitle(data.data?.payout.label || 'Payout');

  const [lineTarget, setLineTarget] = useState<PayoutLineTarget | null>(null);
  const [payeeTarget, setPayeeTarget] = useState<PayeeTarget | null>(null);
  const [exportRows, setExportRows] = useState<PayoutExportRow[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<'' | 'export' | 'draft' | 'discard' | string>('');
  const [stale, setStale] = useState(false);

  const groups = useMemo(() => {
    const d = data.data;
    if (!d) return [];
    const g = new Map<string, PayoutLine[]>();
    for (const l of d.lines) g.set(l.member_id, [...(g.get(l.member_id) || []), l]);
    return [...g.entries()].map(([memberId, lines]) => {
      const m = d.members.get(memberId);
      return {
        memberId, name: nameOf(m), email: m?.email || '', lines,
        total: lines.reduce((a, l) => a + Number(l.amount), 0),
        hrs: lines.filter((l) => l.kind === 'hours').reduce((a, l) => a + Number(l.quantity), 0),
        payee: d.payees.get(memberId) ?? null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.data]);

  if (data.error && !data.data) return <Shell><ErrorBox error={data.error} onRetry={data.reload} /></Shell>;
  if (data.data === undefined) return <Shell><Skeleton rows={6} /></Shell>;
  if (data.data === null) {
    return (
      <Shell>
        <Card><EmptyState icon="send" title="Payout not found" body="It may have been discarded, or the link is wrong." action={<LinkButton to="/admin/payouts">All payouts</LinkButton>} /></Card>
      </Shell>
    );
  }

  const { payout: po, payees } = data.data;
  const cur = po.currency;
  const editable = po.status !== 'sent';
  const people = groups.length;
  const missing = groups.filter((g) => payeeSummary(g.payee, g.email).issue && !payeeSummary(g.payee, g.email).soft);
  const noDetails = groups.filter((g) => !g.payee);
  const nextSort = data.data.lines.reduce((m, l) => Math.max(m, l.sort), -1) + 1;
  const reload = data.reload;
  const changed = () => { if (po.status === 'exported') setStale(true); reload(); };

  async function doExport() {
    const ok = await confirm({
      title: po.status === 'exported' ? 'Export again?' : 'Export this payout?',
      body: `Creates the Wise batch files and a summary for ${plural(people, 'team member')}, ${money(po.total, cur)} in total. Bank details are decrypted for the export, and the export is logged. The payout is marked exported; you can still go back to draft.`,
      action: 'Export',
    });
    if (!ok) return;
    setBusy('export');
    try {
      const rows = await q<PayoutExportRow[]>(supabase.rpc('ramp_payout_export', { p_payout: po.id }));
      await q(supabase.rpc('ramp_payout_set_status', { p_payout: po.id, p_status: 'exported', p_reference: '' }));
      setExportRows(rows || []);
      setExportOpen(true);
      setStale(false);
      toast('Payout exported. Download the files below.');
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
      reload();
    }
  }

  async function backToDraft() {
    const ok = await confirm({ title: 'Move back to draft?', body: 'Use this to change the payout before paying. Files you already downloaded will be out of date, so export again afterwards.', action: 'Back to draft' });
    if (!ok) return;
    setBusy('draft');
    try {
      await q(supabase.rpc('ramp_payout_set_status', { p_payout: po.id, p_status: 'draft', p_reference: '' }));
      setExportRows(null);
      toast('Payout is a draft again.');
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
      reload();
    }
  }

  async function discard() {
    const ok = await confirm({
      title: 'Discard this payout?',
      body: 'Its hours go back to unpaid so they can go on another payout. Bonus and adjustment lines are dropped, and it disappears from team members’ My work pages.',
      action: 'Discard payout', danger: true,
    });
    if (!ok) return;
    setBusy('discard');
    try {
      await q(supabase.rpc('ramp_payout_set_status', { p_payout: po.id, p_status: 'void', p_reference: '' }));
      toast('Payout discarded.');
      navigate('/admin/payouts');
    } catch (e) {
      toast(errText(e), 'bad');
      setBusy('');
      reload();
    }
  }

  async function removeLine(l: PayoutLine, name: string) {
    const ok = await confirm({
      title: 'Remove this line?',
      body: `${name}: ${l.description || 'line'} · ${money(l.amount, cur)}.${l.kind === 'hours' ? ' These hours go back to unpaid, so they can go on another payout.' : ''}`,
      action: 'Remove line', danger: true,
    });
    if (!ok) return;
    setBusy(l.id);
    try {
      await q(supabase.from('ramp_payout_lines').delete().eq('id', l.id));
      toast('Line removed.');
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
      changed();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={AGENCY_EYEBROW} title={po.label || 'Payout'}
        subtitle={`Approved weeks starting ${rangeLabel(po.period_start, po.period_end, true)}`}
        actions={<LinkButton to="/admin/payouts" variant="ghost" icon="list">All payouts</LinkButton>} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        {/* Status and actions */}
        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6">
          <Card>
            <PayoutChip payout={po} />
            <p className="mt-3 font-display text-[32px] leading-none font-bold tabular-nums">{money(po.total, cur)}</p>
            <p className="mt-1 text-sm text-muted">{plural(people, 'team member')}</p>
            <dl className="mt-3 border-t border-line-2 pt-2">
              <Line label="Created">{fmtDateTime(po.created_at, tz)}</Line>
              {po.exported_at && <Line label="Exported">{fmtDateTime(po.exported_at, tz)}</Line>}
              {po.sent_at && <Line label="Sent">{fmtDateTime(po.sent_at, tz)}</Line>}
              {po.reference && <Line label="Reference">{po.reference}</Line>}
            </dl>

            {po.status === 'sent' ? (
              <Notice tone="good" icon="check" className="mt-3">Team members can see this payout in My work.</Notice>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                {missing.length > 0 && (
                  <Notice tone="warn" icon="alert">{plural(missing.length, 'team member is', 'team members are')} missing payout details. Fix them below before you pay.</Notice>
                )}
                {stale && <Notice tone="warn" icon="refresh">You changed this payout after exporting. Export again so the files match.</Notice>}
                {po.status === 'draft' && (
                  <Button variant="primary" icon="download" loading={busy === 'export'} disabled={!!busy || !people} onClick={doExport}>Export for Wise</Button>
                )}
                {po.status === 'exported' && (
                  <>
                    <Button variant="success" icon="check" disabled={!!busy} onClick={() => setSending(true)}>Mark as sent</Button>
                    {exportRows && !stale
                      ? <Button icon="download" onClick={() => setExportOpen(true)}>Download files</Button>
                      : <Button icon="download" loading={busy === 'export'} disabled={!!busy} onClick={doExport}>Export again</Button>}
                    <Button variant="ghost" icon="replay" loading={busy === 'draft'} disabled={!!busy} onClick={backToDraft}>Back to draft</Button>
                  </>
                )}
                <Button variant="danger" icon="trash" loading={busy === 'discard'} disabled={!!busy} onClick={discard}>Discard payout</Button>
              </div>
            )}
          </Card>
          {editable && (
            <p className="text-sm text-muted leading-relaxed px-1">
              {po.status === 'draft'
                ? 'Next: check each person’s lines and payout details, then export. You’ll get a Wise batch file to upload, and a list of anyone you need to pay by bank.'
                : 'Next: upload the Wise files and pay. Then mark the payout as sent so team members can see it.'}
            </p>
          )}
        </div>

        {/* Lines by assistant */}
        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1 min-w-0">
          {editable && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">{noDetails.length > 0 ? `${plural(noDetails.length, 'person has', 'people have')} no payout details yet.` : 'Everyone has payout details.'}</p>
              <Button size="sm" icon="plus" onClick={() => setLineTarget({})}>Add a bonus or adjustment</Button>
            </div>
          )}
          {groups.length === 0 && (
            <Card><EmptyState icon="users" title="No one on this payout" body="Add a bonus or adjustment, or discard this payout." /></Card>
          )}
          {groups.map((g) => {
            const ps = payeeSummary(g.payee, g.email);
            return (
              <Card key={g.memberId} padded={false} className="overflow-hidden">
                <div className="flex items-start gap-3 px-4 sm:px-5 pt-4">
                  <Avatar name={g.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-semibold leading-snug">{g.name}</h2>
                    <p className="text-sm text-muted leading-snug break-words">{ps.text}{g.payee?.target_currency ? ` · receives ${g.payee.target_currency}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold tabular-nums leading-tight">{money(g.total, cur)}</p>
                    {g.hrs > 0 && <p className="text-xs text-muted tabular-nums">{hours(g.hrs)}</p>}
                  </div>
                </div>
                {ps.issue && (
                  <div className="px-4 sm:px-5 pt-3">
                    <Notice tone="warn" icon={ps.soft ? 'info' : 'alert'}>
                      <p>{ps.issue}</p>
                    </Notice>
                  </div>
                )}
                {editable && (
                  <div className="px-4 sm:px-5 pt-2 flex flex-wrap gap-x-2">
                    <Button size="sm" variant="ghost" icon="pen" onClick={() => setPayeeTarget({ memberId: g.memberId, name: g.name, email: g.email, payee: g.payee })}>
                      {g.payee ? 'Edit payout details' : 'Add payout details'}
                    </Button>
                    <Button size="sm" variant="ghost" icon="plus" onClick={() => setLineTarget({ memberId: g.memberId })}>Add bonus</Button>
                  </div>
                )}
                <ul className="mt-2 border-t border-line-2">
                  {g.lines.map((l) => (
                    <li key={l.id} className="px-4 sm:px-5 py-2 border-b border-line-2 last:border-b-0">
                      <p className="text-[15px] leading-snug pt-1">
                        {l.kind !== 'hours' && <Chip tone={l.kind === 'bonus' ? 'good' : 'neutral'} className="mr-1.5 align-middle">{l.kind === 'bonus' ? 'Bonus' : 'Adjustment'}</Chip>}
                        {l.description || 'Line'}
                      </p>
                      <div className="flex items-center gap-1 min-h-11">
                        <span className="flex-1 text-sm text-muted tabular-nums">{l.kind === 'hours' ? `${num(l.quantity)} h × ${money(l.rate, cur)}` : `${num(l.quantity)} × ${money(l.rate, cur)}`}</span>
                        <span className="text-[15px] font-semibold tabular-nums whitespace-nowrap mr-1">{money(l.amount, cur)}</span>
                        {editable && l.kind !== 'hours' && (
                          <IconButton icon="pen" label={`Edit ${l.description || 'line'}`} disabled={busy === l.id} onClick={() => setLineTarget({ line: l })} />
                        )}
                        {editable && (
                          <IconButton icon="trash" label={`Remove ${l.description || 'line'}`} disabled={busy === l.id} onClick={() => removeLine(l, g.name)} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {groups.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink text-white px-5 py-4">
              <span className="font-semibold">Total for {plural(people, 'team member')}</span>
              <span className="font-display text-xl font-bold tabular-nums">{money(po.total, cur)}</span>
            </div>
          )}
        </div>
      </div>

      <PayoutLineSheet target={lineTarget} payout={po} assistants={data.data.assistants} nextSort={nextSort} onClose={() => setLineTarget(null)} onSaved={changed} />
      <PayeeSheet target={payeeTarget} onClose={() => setPayeeTarget(null)} onSaved={changed} />
      <MarkSentSheet open={sending} payout={po} people={people} onClose={() => setSending(false)} onDone={() => { setExportOpen(false); reload(); }} />
      {exportRows && (
        <ExportSheet open={exportOpen} rows={exportRows} payout={po} payees={payees} onClose={() => setExportOpen(false)}
          onMarkSent={po.status !== 'sent' ? () => { setExportOpen(false); setSending(true); } : undefined} />
      )}
      {dialog}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={AGENCY_BACK} eyebrow={AGENCY_EYEBROW} title="Payout" />
      {children}
    </div>
  );
}
