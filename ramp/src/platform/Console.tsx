// Platform console (super admins): approve company sign-ups, manage client accounts (free access, trials, seats,
// pausing), open any workspace as RAMP Support, and set platform-wide defaults and Stripe plans.
import { useMemo, useState } from 'react';
import { errText, supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useSession } from '../lib/session';
import { cx, fmtDate, money, plural } from '../lib/util';
import type { AccountPlan, AccountRequest, AccountStatus, PlatformPrice, SuperAccount, SuperData } from '../lib/types';
import {
  Button, Card, CardHeader, Chip, EmptyState, ErrorBox, Field, Icon, Input, Logo, Notice, PageHeader, Pills, Segmented, Select, Sheet,
  Skeleton, Stat, Textarea, useToast,
} from '../ui';

export const PLAN_LABEL: Record<AccountPlan, string> = { comp: 'Free access', trial: 'Trial', paid: 'Paid' };
const PLAN_TONE: Record<AccountPlan, 'good' | 'warn' | 'brand'> = { comp: 'good', trial: 'warn', paid: 'brand' };
const STATUS_LABEL: Record<AccountStatus, string> = { pending: 'Pending', active: 'Active', paused: 'Paused', closed: 'Closed' };
const STATUS_TONE: Record<AccountStatus, 'neutral' | 'good' | 'warn' | 'bad'> = { pending: 'neutral', active: 'good', paused: 'warn', closed: 'bad' };
const seatText = (used: number, limit: number | null) => (limit == null ? `${used} seats · unlimited` : `${used} of ${limit} seats`);

type Tab = 'requests' | 'accounts' | 'settings';

export default function PlatformConsole({ standalone }: { standalone?: boolean }) {
  useTitle('Platform');
  const { signOut } = useSession();
  const { data, error, reload } = useAsync(() => q<SuperData>(supabase.rpc('ramp_super_accounts')), []);
  const pending = data?.requests.filter((r) => r.status === 'pending') || [];
  const [tab, setTab] = useState<Tab>('requests');

  const body = (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Platform" title="Client accounts"
        subtitle="Approve new companies, give free access while you test, and manage every RAMP workspace." />
      {error && !data ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Skeleton rows={4} /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Waiting for approval" value={pending.length} tone={pending.length ? 'warn' : undefined} />
            <Stat label="Accounts" value={data.accounts.length} />
            <Stat label="Workspaces" value={data.accounts.reduce((a, x) => a + Number(x.workspaces || 0), 0)} />
            <Stat label="Active people" value={data.accounts.reduce((a, x) => a + Number(x.members || 0), 0)} />
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <Segmented label="Platform sections" value={tab} onChange={setTab} options={[
              { value: 'requests', label: pending.length ? `Requests (${pending.length})` : 'Requests' },
              { value: 'accounts', label: 'Accounts' },
              { value: 'settings', label: 'Settings' },
            ]} />
          </div>
          {tab === 'requests' && <Requests data={data} reload={reload} />}
          {tab === 'accounts' && <Accounts data={data} reload={reload} />}
          {tab === 'settings' && <Settings data={data} reload={reload} />}
        </>
      )}
    </div>
  );

  if (!standalone) return body;
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 md:px-8 bg-white/95 backdrop-blur border-b border-line">
        <Logo size={28} /><span className="font-display font-bold tracking-[0.08em]">RAMP</span><span className="text-xs text-muted">Platform</span>
        <Button size="sm" variant="ghost" icon="logout" className="ml-auto" onClick={signOut}>Sign out</Button>
      </header>
      <main className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">{body}</main>
    </div>
  );
}

// ───────── requests ─────────

function Requests({ data, reload }: { data: SuperData; reload: () => void }) {
  const [approve, setApprove] = useState<AccountRequest | null>(null);
  const [decline, setDecline] = useState<AccountRequest | null>(null);
  const [showPast, setShowPast] = useState(false);
  const pending = data.requests.filter((r) => r.status === 'pending');
  const past = data.requests.filter((r) => r.status !== 'pending');
  return (
    <div className="flex flex-col gap-4">
      {!pending.length && (
        <Card><EmptyState icon="check" title="No requests waiting"
          body="When a company creates a login and asks for a workspace, it shows up here for you to approve." /></Card>
      )}
      {pending.map((r) => (
        <Card key={r.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-lg font-semibold">{r.company}</h3>
              <p className="text-sm text-muted break-words">{r.name || 'No name given'} · {r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
            </div>
            <Chip tone="warn" icon="clock">Asked {fmtDate(r.created_at)}</Chip>
          </div>
          {(r.team_size || r.note) && (
            <dl className="text-sm flex flex-col gap-1">
              {r.team_size && <div><dt className="inline font-semibold">Team size: </dt><dd className="inline text-ink-2">{r.team_size}</dd></div>}
              {r.note && <div><dt className="inline font-semibold">Note: </dt><dd className="inline text-ink-2 whitespace-pre-wrap">{r.note}</dd></div>}
            </dl>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Button variant="primary" icon="check" onClick={() => setApprove(r)}>Approve</Button>
            <Button icon="x" onClick={() => setDecline(r)}>Decline</Button>
          </div>
        </Card>
      ))}
      {past.length > 0 && (
        <div className="flex flex-col gap-2">
          <button type="button" className="self-start min-h-11 text-sm font-semibold text-brand-ink cursor-pointer inline-flex items-center gap-1.5"
            onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
            <Icon name={showPast ? 'chevronUp' : 'chevronDown'} size={16} />{showPast ? 'Hide' : 'Show'} past requests ({past.length})
          </button>
          {showPast && (
            <Card padded={false} className="divide-y divide-line-2">
              {past.map((r) => (
                <div key={r.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0"><span className="font-semibold">{r.company}</span><span className="text-sm text-muted"> · {r.email}</span></span>
                  <Chip tone={r.status === 'approved' ? 'good' : 'neutral'}>{r.status === 'approved' ? 'Approved' : 'Declined'} {fmtDate(r.decided_at)}</Chip>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
      {approve && <ApproveSheet req={approve} data={data} onClose={() => setApprove(null)} onDone={reload} />}
      {decline && <DeclineSheet req={decline} onClose={() => setDecline(null)} onDone={reload} />}
    </div>
  );
}

type SeatMode = 'default' | 'number' | 'unlimited';

function SeatInput({ mode, setMode, n, setN, defaultLimit }: { mode: SeatMode; setMode: (m: SeatMode) => void; n: string; setN: (v: string) => void; defaultLimit?: number | null }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-ink-2">Seats</span>
      <Pills label="Seats" size="sm" value={mode} onChange={setMode} options={[
        ...(defaultLimit !== undefined ? [{ value: 'default' as const, label: `Default (${defaultLimit == null ? 'unlimited' : defaultLimit})` }] : []),
        { value: 'number', label: 'Set a number' },
        { value: 'unlimited', label: 'Unlimited' },
      ]} />
      {mode === 'number' && (
        <span className="inline-flex w-36"><Input type="number" min={1} max={10000} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} aria-label="Number of seats" /></span>
      )}
      <span className="text-[13px] text-muted">Seats count team members across all of the account’s workspaces. Client contacts and placed assistants don’t use seats.</span>
    </div>
  );
}

function ApproveSheet({ req, data, onClose, onDone }: { req: AccountRequest; data: SuperData; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const pf = data.platform;
  const [plan, setPlan] = useState<AccountPlan>('comp');
  const [days, setDays] = useState(String(pf?.default_trial_days || 30));
  const [seatMode, setSeatMode] = useState<SeatMode>('default');
  const [seats, setSeats] = useState('10');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setErr('');
    const d = Number(days);
    if (plan === 'trial' && (!Number.isInteger(d) || d < 1 || d > 365)) { setErr('Trial length must be 1 to 365 days.'); return; }
    const n = Number(seats);
    if (seatMode === 'number' && (!Number.isInteger(n) || n < 1)) { setErr('Enter a number of seats, 1 or more.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('ramp_super_approve', {
      p_request: req.id, p_plan: plan, p_trial_days: plan === 'trial' ? d : null,
      p_seat_limit: seatMode === 'default' ? null : seatMode === 'unlimited' ? 0 : n,
    });
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    toast(`${req.company} is approved. Their workspace is ready.`);
    onClose(); onDone();
  }
  return (
    <Sheet open onClose={onClose} title={`Approve ${req.company}`} subtitle={`${req.name || req.email} becomes the owner of a new workspace with a copy of your training library.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Approve</Button></>}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Plan</span>
          <Pills label="Plan" value={plan} onChange={setPlan} options={[
            { value: 'comp', label: 'Free access' }, { value: 'trial', label: 'Trial' }, { value: 'paid', label: 'Paid' },
          ]} />
          <span className="text-[13px] text-muted">
            {plan === 'comp' ? 'No charge and no end date. Good for testing with friendly clients.'
              : plan === 'trial' ? 'Free until the trial ends; then they’re asked to choose a plan.'
              : 'They pay through Stripe. Use this once your plans are set up in Settings.'}
          </span>
        </div>
        {plan === 'trial' && (
          <Field label="Trial length (days)"><span className="inline-flex w-36"><Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></span></Field>
        )}
        <SeatInput mode={seatMode} setMode={setSeatMode} n={seats} setN={setSeats} defaultLimit={pf?.default_seat_limit ?? null} />
        {err && <Notice tone="bad" icon="alert">{err}</Notice>}
      </div>
    </Sheet>
  );
}

function DeclineSheet({ req, onClose, onDone }: { req: AccountRequest; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('ramp_super_decline', { p_request: req.id, p_note: note.trim() });
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    toast(`${req.company}’s request was declined.`);
    onClose(); onDone();
  }
  return (
    <Sheet open onClose={onClose} title={`Decline ${req.company}?`} subtitle="They’ll see your note when they sign in, and can update their request and send it again."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} onClick={submit}>Decline</Button></>}>
      <Field label="Note for them" hint="Optional, but kind. For example, what you’d need to approve it.">
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {err && <Notice tone="bad" icon="alert" className="mt-4">{err}</Notice>}
    </Sheet>
  );
}

// ───────── accounts ─────────

function Accounts({ data, reload }: { data: SuperData; reload: () => void }) {
  const [open, setOpen] = useState<SuperAccount | null>(null);
  const [filter, setFilter] = useState<'all' | AccountStatus>('all');
  const list = data.accounts.filter((a) => filter === 'all' || a.status === filter);
  return (
    <div className="flex flex-col gap-4">
      <Pills label="Filter accounts" size="sm" value={filter} onChange={setFilter} options={[
        { value: 'all', label: `All (${data.accounts.length})` },
        { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'closed', label: 'Closed' },
      ]} />
      {!list.length && <Card><EmptyState icon="building" title="No accounts here" /></Card>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((a) => (
          <button key={a.id} type="button" onClick={() => setOpen(a)}
            className="text-left bg-card border border-line rounded-2xl p-4 flex flex-col gap-2.5 hover:border-brand/40 cursor-pointer">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-display text-lg font-semibold truncate">{a.name}</span>
                <span className="block text-sm text-muted truncate">{a.owner_email || 'No owner yet'}</span>
              </span>
              <Icon name="chevronRight" size={18} className="text-muted mt-1.5" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}{a.status === 'paused' && a.pause_reason === 'billing' ? ' · billing' : ''}</Chip>
              <Chip tone={PLAN_TONE[a.plan]}>{PLAN_LABEL[a.plan]}{a.plan === 'trial' && a.trial_ends ? ` · ends ${fmtDate(a.trial_ends)}` : ''}</Chip>
            </div>
            <p className="text-sm text-ink-2">
              {seatText(Number(a.seats_used || 0), a.seat_limit)} · {plural(Number(a.workspaces || 0), 'workspace')}{Number(a.placements) ? ` · ${plural(Number(a.placements), 'placement')}` : ''}
            </p>
          </button>
        ))}
      </div>
      {open && <AccountSheet account={open} onClose={() => setOpen(null)} onDone={reload} />}
    </div>
  );
}

function AccountSheet({ account: a, onClose, onDone }: { account: SuperAccount; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { switchWorkspace } = useSession();
  const [plan, setPlan] = useState<AccountPlan>(a.plan);
  const [status, setStatus] = useState<AccountStatus>(a.status);
  const [trialEnds, setTrialEnds] = useState(a.trial_ends || '');
  const [seatMode, setSeatMode] = useState<SeatMode>(a.seat_limit == null ? 'unlimited' : 'number');
  const [seats, setSeats] = useState(String(a.seat_limit ?? 10));
  const [notes, setNotes] = useState(a.notes || '');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    const n = Number(seats);
    if (seatMode === 'number' && (!Number.isInteger(n) || n < 1)) { setErr('Enter a number of seats, 1 or more.'); return; }
    if (plan === 'trial' && !trialEnds) { setErr('Pick the date the trial ends.'); return; }
    setBusy('save');
    const { error } = await supabase.rpc('ramp_super_update_account', {
      p_account: a.id, p_plan: plan, p_status: status === 'pending' ? null : status,
      p_trial_ends: plan === 'trial' ? trialEnds : null,
      p_seat_limit: seatMode === 'unlimited' ? 0 : n, p_notes: notes,
    });
    setBusy('');
    if (error) { setErr(errText(error)); return; }
    toast(`${a.name} saved.`);
    onClose(); onDone();
  }

  async function enter(id: string) {
    setBusy(id);
    try { await switchWorkspace(id); } catch (e) { setBusy(''); setErr(errText(e)); }
  }

  return (
    <Sheet open wide onClose={onClose} title={a.name} subtitle={<>{a.owner_email || 'No owner yet'} · approved {fmtDate(a.approved_at || a.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</>}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" loading={busy === 'save'} disabled={!!busy && busy !== 'save'} onClick={save}>Save changes</Button></>}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Workspaces</h3>
          {a.workspace_list.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5">
              <span className="min-w-0">
                <span className="block font-semibold truncate">{w.name}</span>
                <span className="block text-[13px] text-muted">{plural(Number(w.members || 0), 'person', 'people')} · {w.setup_done ? 'set up' : 'setup not finished'}{w.status !== 'active' ? ` · ${w.status}` : ''}</span>
              </span>
              <Button size="sm" icon="eye" loading={busy === w.id} disabled={!!busy} onClick={() => enter(w.id)}>Open as support</Button>
            </div>
          ))}
          <p className="text-[13px] text-muted">Opening a workspace is recorded in its audit log as RAMP Support access. You won’t appear in their team list.</p>
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Plan</span>
          <Pills label="Plan" value={plan} onChange={setPlan} options={[
            { value: 'comp', label: 'Free access' }, { value: 'trial', label: 'Trial' }, { value: 'paid', label: 'Paid' },
          ]} />
          {plan === 'trial' && (
            <Field label="Trial ends"><span className="inline-flex w-48"><Input type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} /></span></Field>
          )}
          {a.subscription_status && (
            <p className="text-[13px] text-muted">Stripe subscription: {a.subscription_status}{a.current_period_end ? `, renews ${fmtDate(a.current_period_end)}` : ''}.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Access</span>
          <Pills label="Status" value={status} onChange={setStatus} options={[
            ...(a.status === 'pending' ? [{ value: 'pending' as const, label: 'Pending' }] : []),
            { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'closed', label: 'Closed' },
          ]} />
          <span className="text-[13px] text-muted">
            {status === 'paused' ? 'Nobody in this account can open RAMP until you set it back to active. Nothing is deleted.'
              : status === 'closed' ? 'Closes every workspace in the account. Data stays, so you can reopen it later.'
              : 'Everyone with access can use RAMP.'}
          </span>
        </section>

        <SeatInput mode={seatMode} setMode={setSeatMode} n={seats} setN={setSeats} />
        <p className="text-sm text-ink-2 -mt-3">In use now: {Number(a.seats_used || 0)}.</p>

        <Field label="Private notes" hint="Visible to the account’s members too, so keep it factual.">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && <Notice tone="bad" icon="alert">{err}</Notice>}
      </div>
    </Sheet>
  );
}

// ───────── settings ─────────

interface PriceDraft { id: string; label: string; amount: string; interval: 'month' | 'year'; seats: string }
const toDraft = (p: PlatformPrice): PriceDraft => ({ id: p.id, label: p.label, amount: String(p.amount ?? ''), interval: p.interval || 'month', seats: p.seats ? String(p.seats) : '' });

function Settings({ data, reload }: { data: SuperData; reload: () => void }) {
  const toast = useToast();
  const pf = data.platform;
  const [brandName, setBrandName] = useState(pf?.brand_name || 'RAMP');
  const [color, setColor] = useState(pf?.brand_color || '#4338CA');
  const [trialDays, setTrialDays] = useState(String(pf?.default_trial_days ?? 30));
  const [defSeats, setDefSeats] = useState(pf?.default_seat_limit == null ? '' : String(pf.default_seat_limit));
  const [wsLimit, setWsLimit] = useState(pf?.workspace_limit == null ? '' : String(pf.workspace_limit));
  const [library, setLibrary] = useState(pf?.library_workspace_id || '');
  const [agency, setAgency] = useState(pf?.agency_workspace_id || '');
  const [prices, setPrices] = useState<PriceDraft[]>(() => (pf?.stripe_prices || []).map(toDraft));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const allWs = useMemo(() => data.accounts.flatMap((a) => a.workspace_list.map((w) => ({ id: w.id, label: `${w.name} (${a.name})` }))), [data.accounts]);

  async function save() {
    setErr('');
    if (!/^#[0-9a-f]{6}$/i.test(color)) { setErr('Use a 6-digit hex color, like #4338CA.'); return; }
    const td = Number(trialDays);
    if (!Number.isInteger(td) || td < 1 || td > 365) { setErr('Default trial length must be 1 to 365 days.'); return; }
    const out: PlatformPrice[] = [];
    for (const p of prices) {
      if (!p.id.trim() && !p.label.trim()) continue;
      if (!/^price_[A-Za-z0-9]+$/.test(p.id.trim())) { setErr(`“${p.label || p.id}”: paste the Stripe price ID, which starts with price_.`); return; }
      if (!p.label.trim()) { setErr(`Give ${p.id} a name, like “Team”.`); return; }
      const amt = Number(p.amount);
      if (!(amt >= 0)) { setErr(`Enter the price for ${p.label}.`); return; }
      const seats = p.seats.trim() ? Number(p.seats) : null;
      if (seats !== null && (!Number.isInteger(seats) || seats < 1)) { setErr(`Seats for ${p.label} must be a whole number, or blank for unlimited.`); return; }
      out.push({ id: p.id.trim(), label: p.label.trim(), amount: amt, interval: p.interval, ...(seats ? { seats } : {}) });
    }
    setBusy(true);
    const { error } = await supabase.rpc('ramp_super_platform_save', {
      p_brand_name: brandName.trim() || 'RAMP', p_brand_color: color, p_default_trial_days: td,
      p_default_seat_limit: defSeats.trim() ? Number(defSeats) : 0, p_workspace_limit: wsLimit.trim() ? Number(wsLimit) : 0,
      p_stripe_prices: out, p_library_workspace: library || null, p_agency_workspace: agency || null,
    });
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    toast('Platform settings saved.');
    reload();
  }

  const setPrice = (i: number, patch: Partial<PriceDraft>) => setPrices((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const webhook = `${import.meta.env.VITE_SUPABASE_URL || 'https://symbmscaajjmgywbifhv.supabase.co'}/functions/v1/ramp-stripe-webhook`;

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <CardHeader title="New accounts" subtitle="What a newly approved company gets unless you choose otherwise." />
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Trial length (days)"><Input type="number" min={1} max={365} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} /></Field>
          <Field label="Seats per account" hint="Blank means unlimited."><Input type="number" min={1} value={defSeats} onChange={(e) => setDefSeats(e.target.value)} /></Field>
          <Field label="Organizations per account" hint="Blank means unlimited."><Input type="number" min={1} value={wsLimit} onChange={(e) => setWsLimit(e.target.value)} /></Field>
        </div>
        <Field label="Training library to copy" hint="New workspaces start with a copy of this workspace’s modules, roles and documents.">
          <Select value={library} onChange={(e) => setLibrary(e.target.value)}>
            <option value="">Don’t copy anything</option>
            {allWs.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </Select>
        </Field>
        <Field label="Agency workspace" hint="Where your placed assistants, clients and access requests from people with no team live.">
          <Select value={agency} onChange={(e) => setAgency(e.target.value)}>
            <option value="">None</option>
            {allWs.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </Select>
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader title="Brand on the sign-in screen" subtitle="Shown before anyone signs in. Each workspace keeps its own brand after that." />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name"><Input value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={80} /></Field>
          <Field label="Color">
            <span className="flex items-center gap-2">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#4338CA'} onChange={(e) => setColor(e.target.value.toUpperCase())}
                className="w-11 h-11 rounded-lg border border-field cursor-pointer" aria-label="Pick a color" />
              <Input value={color} onChange={(e) => setColor(e.target.value.trim())} maxLength={7} />
            </span>
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader title="Plans (Stripe)" subtitle="The plans account owners can choose. Create each one as a recurring price in Stripe, then paste its price ID here." />
        {prices.map((p, i) => (
          <div key={i} className="rounded-xl border border-line p-3.5 grid sm:grid-cols-2 gap-3">
            <Field label="Name"><Input value={p.label} onChange={(e) => setPrice(i, { label: e.target.value })} placeholder="Team" /></Field>
            <Field label="Stripe price ID"><Input value={p.id} onChange={(e) => setPrice(i, { id: e.target.value })} placeholder="price_…" spellCheck={false} /></Field>
            <Field label="Price shown (USD)"><Input type="number" min={0} step="0.01" value={p.amount} onChange={(e) => setPrice(i, { amount: e.target.value })} /></Field>
            <Field label="Billed every">
              <Select value={p.interval} onChange={(e) => setPrice(i, { interval: e.target.value as 'month' | 'year' })}>
                <option value="month">Month</option><option value="year">Year</option>
              </Select>
            </Field>
            <Field label="Seats included" hint="Blank means unlimited."><Input type="number" min={1} value={p.seats} onChange={(e) => setPrice(i, { seats: e.target.value })} /></Field>
            <div className="flex items-end"><Button variant="ghost" icon="trash" onClick={() => setPrices((ps) => ps.filter((_, j) => j !== i))}>Remove</Button></div>
            {p.amount && p.label && <p className="sm:col-span-2 text-[13px] text-muted">Owners see: {p.label}, {money(Number(p.amount) || 0)} a {p.interval}.</p>}
          </div>
        ))}
        <Button className="self-start" icon="plus" onClick={() => setPrices((ps) => [...ps, { id: '', label: '', amount: '', interval: 'month', seats: '' }])}>Add a plan</Button>
        <Notice icon="info">
          <span className="block">For payments to update accounts automatically, add these events to your Stripe webhook: <strong>customer.subscription.created</strong>, <strong>customer.subscription.updated</strong> and <strong>customer.subscription.deleted</strong>.</span>
          <span className={cx('block mt-1 break-all', !webhook.startsWith('http') && 'hidden')}>Webhook address: {webhook}</span>
        </Notice>
      </Card>

      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
      <div className="flex justify-end"><Button variant="primary" size="lg" loading={busy} onClick={save}>Save settings</Button></div>
    </div>
  );
}
