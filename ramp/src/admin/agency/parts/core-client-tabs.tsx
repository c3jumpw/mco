// Client page tabs: Overview (edit the client), Contacts (invite client contacts), Training track,
// Invoices and Requests.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../../../lib/supabase';
import { useMe } from '../../../lib/session';
import { q, useAsync } from '../../../lib/hooks';
import { CLIENT_STATUS, INVOICE_STATUS, ago, cx, displayName, fmtDate, fmtDateTime, money, plural, todayISO } from '../../../lib/util';
import type { Client, ClientModule, ClientRequest, Invoice, Module, Placement, SuperData } from '../../../lib/types';
import { Avatar, Button, Card, CardHeader, Checkbox, Chip, EmptyState, Field, Icon, IconButton, Input, LinkButton, Notice, Pills, Select, Sheet, Textarea, useConfirm, useToast } from '../../../ui';
import { FormError, copyText, focusInvalid } from '../../parts/ops-common';
import { joinLink } from '../../parts/ops-invite';
import { SaveBar, same, useLeaveGuard } from '../../parts/setup-kit';
import { TimezonePicker } from '../../parts/setup-timezone';
import { personName, type MemberLite } from './core-common';
import { BillingFields, clientFormOf, clientPatch, siteHref, validateClient, type ClientForm } from './core-client-form';
import { RequestCard } from './core-requests';

// ───────── Overview ─────────

export function OverviewTab({ client, openPlacements, onSaved }: { client: Client; openPlacements: number; onSaved: (c: Client) => void }) {
  const toast = useToast();
  const saved = useMemo(() => clientFormOf(client), [client]);
  const [f, setF] = useState<ClientForm>(saved);
  useEffect(() => { setF(saved); }, [saved]);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = !same(f, saved);
  const { dialog } = useLeaveGuard(dirty);
  const errs = show ? validateClient(f) : {};
  const set = <K extends keyof ClientForm>(k: K, v: ClientForm[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setError('');
    const e = validateClient(f);
    if (Object.keys(e).length) { setShow(true); focusInvalid('core-client-edit'); toast('Check the highlighted fields.', 'bad'); return; }
    setBusy(true);
    try {
      const { data, error: err } = await supabase.from('ramp_clients').update(clientPatch(f)).eq('id', client.id).select('*').single();
      if (err) throw err;
      onSaved(data as Client);
      setShow(false);
      toast('Client saved.');
    } catch (x) {
      setError(errText(x));
      toast(errText(x), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="core-client-edit" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Card className="flex flex-col gap-4">
          <CardHeader title="Company" />
          <Field label="Company name" required error={errs.name}>
            <Input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errs.name} />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-ink-2">Status</span>
            <Pills label="Client status" size="sm" value={f.status} onChange={(v) => set('status', v)}
              options={(['prospect', 'active', 'paused', 'ended'] as const).map((s) => ({ value: s, label: CLIENT_STATUS[s].label }))} />
            {f.status === 'ended' && openPlacements > 0 && f.status !== client.status && (
              <p className="text-[13px] text-warn font-semibold">{plural(openPlacements, 'placement is', 'placements are')} still open here. End them on their own pages.</p>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Website" hint={f.website.trim() ? <a href={siteHref(f.website.trim())} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink">Open website</a> : undefined}>
              <Input type="url" inputMode="url" autoCapitalize="none" value={f.website} maxLength={200} onChange={(e) => set('website', e.target.value)} placeholder="company.com" />
            </Field>
            <Field label="Industry"><Input value={f.industry} maxLength={80} onChange={(e) => set('industry', e.target.value)} /></Field>
          </div>
          <Field label="Time zone" hint="Where the client works. Team members’ schedules follow it.">
            <TimezonePicker value={f.timezone} onChange={(tz) => set('timezone', tz)} />
          </Field>
          <Field label="Notes" hint="Only admins see these.">
            <Textarea rows={4} value={f.notes} maxLength={4000} onChange={(e) => set('notes', e.target.value)} placeholder="How you met, what they care about, who decides." />
          </Field>
        </Card>
        <Card className="flex flex-col gap-4">
          <CardHeader title="Billing" />
          <BillingFields f={f} set={set} errs={errs} />
          <Field label="Billing address" hint="Printed on invoices.">
            <Textarea rows={3} value={f.billing_address} maxLength={500} onChange={(e) => set('billing_address', e.target.value)} />
          </Field>
          <Field label="Currency" error={errs.currency} hint="New invoices and placements use it. Existing ones don’t change." className="max-w-48">
            <Input value={f.currency} maxLength={3} onChange={(e) => set('currency', e.target.value.toUpperCase())} className="uppercase font-mono" aria-invalid={!!errs.currency} />
          </Field>
          <p className="text-xs text-muted">
            {client.stripe_customer_id ? <>Stripe customer <span className="font-mono">{client.stripe_customer_id}</span>, created when the first invoice was sent.</> : 'A Stripe customer is created the first time you send this client an invoice through Stripe.'}
          </p>
        </Card>
      </div>
      <LinkedWorkspaceCard client={client} onSaved={onSaved} />
      {error && <Notice tone="bad" icon="alert">{error}</Notice>}
      <SaveBar dirty={dirty} saving={busy}>
        {dirty && <Button variant="ghost" onClick={() => { setF(saved); setShow(false); }} disabled={busy}>Discard</Button>}
        <Button variant="primary" type="submit" icon="check" loading={busy} disabled={!dirty}>Save client</Button>
      </SaveBar>
      {dialog}
    </form>
  );
}

// ───────── The client's own RAMP workspace ─────────

function LinkedWorkspaceCard({ client, onSaved }: { client: Client; onSaved: (c: Client) => void }) {
  const { isSuper, workspace } = useMe();
  const toast = useToast();
  const [sel, setSel] = useState(client.linked_workspace_id || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { data } = useAsync(async () => (isSuper ? q<SuperData>(supabase.rpc('ramp_super_accounts')) : null), [isSuper]);
  if (client.linked_workspace_id === undefined) return null; // older database without workspaces
  const options = (data?.accounts || []).flatMap((a) => a.workspace_list.filter((w) => w.id !== workspace?.id).map((w) => ({ id: w.id, label: w.name === a.name ? w.name : `${w.name} (${a.name})` })));
  const linkedName = options.find((o) => o.id === client.linked_workspace_id)?.label;
  async function save() {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('ramp_client_link', { p_client: client.id, p_workspace: sel || null });
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    onSaved({ ...client, linked_workspace_id: sel || null });
    toast(sel ? `${client.name} is linked. Their team members now show in their workspace.` : `${client.name} is unlinked.`);
  }
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader title="Their own RAMP workspace"
        subtitle={`If ${client.name} uses RAMP for their own team, link their workspace. Their admins then approve hours, see invoices and follow launch plans from inside it, and your team members appear on their team list.`} />
      {isSuper ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Linked workspace" className="flex-1 min-w-56">
            <Select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">Not linked</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </Field>
          <Button loading={busy} disabled={sel === (client.linked_workspace_id || '')} onClick={save}>{sel ? 'Save link' : 'Unlink'}</Button>
        </div>
      ) : (
        <p className="text-sm text-ink-2">{client.linked_workspace_id ? `Linked${linkedName ? ` to ${linkedName}` : ''}.` : 'Not linked. The platform admin can link it from here once the client has a RAMP account.'}</p>
      )}
      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
    </Card>
  );
}

// ───────── Contacts ─────────

function clientInviteText(o: { name: string; email: string; orgName: string; clientName: string; fromName: string }) {
  const first = o.name.trim().split(/\s+/)[0] || '';
  return [
    `Hi${first ? ` ${first}` : ''},`,
    '',
    `${o.orgName} uses RAMP to keep ${o.clientName} up to date on your team member: their onboarding and training, the hours to approve each week, and invoices.`,
    '',
    `1. Open ${joinLink()}`,
    `2. Create a login with this email address: ${o.email}`,
    '3. You’ll land on your overview, with your team member and anything waiting for you.',
    '',
    'Use exactly that email address. RAMP matches your login to your invite by email, so a different one won’t work.',
    '',
    'Thanks,',
    o.fromName,
  ].join('\n');
}

function ClientInvitePanel({ email, name, clientName, title = 'Send them this', collapsible }: { email: string; name: string; clientName: string; title?: string; collapsible?: boolean }) {
  const { me, org } = useMe();
  const toast = useToast();
  const text = clientInviteText({ name, email, orgName: org.name, clientName, fromName: displayName(me) });
  const subject = `Your ${org.name} client portal`;
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  async function copy() {
    const ok = await copyText(text);
    toast(ok ? 'Message copied.' : 'Couldn’t copy. Select the text and copy it yourself.', ok ? 'ok' : 'bad');
  }
  const message = <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-ink bg-bg border border-line rounded-xl px-4 py-3 select-all">{text}</pre>;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted mt-1 leading-relaxed">RAMP doesn’t send email. Send this yourself to <span className="font-semibold text-ink-2 break-all">{email}</span>.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon="copy" onClick={copy}>Copy message</Button>
        <Button icon="mail" onClick={() => { window.location.href = mailto; }}>Open in email</Button>
      </div>
      {collapsible ? (
        <details className="group">
          <summary className="cursor-pointer min-h-11 flex items-center gap-1.5 text-sm font-semibold text-brand-ink list-none [&::-webkit-details-marker]:hidden">
            <Icon name="chevronRight" size={16} className="group-open:rotate-90 transition-transform" />Show the message
          </summary>
          <div className="mt-1">{message}</div>
        </details>
      ) : message}
    </div>
  );
}

export function ContactsTab({ client, contacts, placements, assistantName, onChanged }: {
  client: Client; contacts: MemberLite[]; placements: Placement[]; assistantName: (id: string) => string; onChanged: () => void;
}) {
  const { org } = useMe();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [inviting, setInviting] = useState(false);
  const [showFor, setShowFor] = useState<string | null>(null);

  async function setPaused(m: MemberLite, paused: boolean) {
    const ok = await confirm(paused
      ? { title: `Turn off ${personName(m)}’s access?`, body: `They can’t sign in to ${client.name}’s portal any more. You can turn it back on later.`, action: 'Turn off access', danger: true }
      : { title: `Turn ${personName(m)}’s access back on?`, body: 'They can sign in to the client portal again.', action: 'Turn on access' });
    if (!ok) return;
    const { error } = await supabase.from('ramp_members').update({ status: paused ? 'inactive' : m.auth_user_id ? 'active' : 'invited' }).eq('id', m.id);
    if (error) { toast(errText(error), 'bad'); return; }
    toast(paused ? 'Access turned off.' : 'Access turned back on.');
    onChanged();
  }

  const sorted = [...contacts].sort((a, b) => (a.status === 'inactive' ? 1 : 0) - (b.status === 'inactive' ? 1 : 0) || personName(a).localeCompare(personName(b)));

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-display text-lg font-semibold">Client contacts</p>
          <p className="text-sm text-muted">They sign in to a portal that shows only {client.name}: their team members’ onboarding and training, hours to approve and invoices. They never see pay rates.</p>
        </div>
        <Button variant="primary" icon="userPlus" onClick={() => setInviting(true)}>Invite a contact</Button>
      </Card>
      <Card padded={false} className="overflow-hidden">
        {sorted.length === 0 ? (
          <EmptyState icon="users" title="No contacts yet" body={`Invite the person at ${client.name} who approves hours and works with your team members.`}
            action={<Button variant="primary" icon="userPlus" onClick={() => setInviting(true)}>Invite a contact</Button>} />
        ) : (
          <ul>
            {sorted.map((m) => {
              const main = placements.filter((p) => p.client_contact_id === m.id && p.status !== 'ended');
              return (
                <li key={m.id} className="px-4 py-3.5 border-t border-line-2 first:border-t-0 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar name={personName(m)} size={40} tone={m.status === 'inactive' ? 'ink' : 'amber'} />
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[15px] break-words">{personName(m)}</span>
                        {m.status === 'inactive' ? <Chip tone="bad" icon="lock">Access off</Chip> : !m.auth_user_id ? <Chip icon="mail">Not joined yet</Chip> : <Chip tone="good" icon="check">Active</Chip>}
                      </span>
                      {(m.full_name || m.preferred_name) && <span className="text-sm text-muted break-all">{m.email}</span>}
                      <span className="text-xs text-muted" title={m.last_seen_at ? fmtDateTime(m.last_seen_at, org.timezone) : undefined}>
                        {m.auth_user_id ? (m.last_seen_at ? `Seen ${ago(m.last_seen_at)}` : 'Not seen yet') : `Invited ${fmtDate(m.invited_at)}`}
                        {main.length > 0 && ` · main contact for ${main.map((p) => assistantName(p.member_id)).join(', ')}`}
                      </span>
                    </div>
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0 pl-[44px] sm:pl-0">
                      {!m.auth_user_id && m.status !== 'inactive' && (
                        <Button size="sm" variant="ghost" onClick={() => setShowFor(showFor === m.id ? null : m.id)} aria-expanded={showFor === m.id}>{showFor === m.id ? 'Hide invite' : 'Invite message'}</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setPaused(m, m.status !== 'inactive')}>{m.status === 'inactive' ? 'Turn on' : 'Turn off'}</Button>
                    </div>
                  </div>
                  {showFor === m.id && <ClientInvitePanel email={m.email} name={m.full_name || m.preferred_name} clientName={client.name} title="Send the invite again" />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {inviting && <InviteContactSheet client={client} onClose={() => setInviting(false)} onDone={onChanged} />}
      {dialog}
    </div>
  );
}

function InviteContactSheet({ client, onClose, onDone }: { client: Client; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string; name: string } | null>(null);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setEmailErr('Enter a valid email address.'); focusInvalid('core-invite-contact'); return; }
    setEmailErr('');
    setBusy(true);
    const { error: err } = await supabase.rpc('ramp_invite_client', { p_email: em, p_name: name.trim(), p_client: client.id });
    setBusy(false);
    if (err) { setError(errText(err)); return; }
    setDone({ email: em, name: name.trim() });
    toast(`${name.trim() || em} added. Now send them the invite.`);
    onDone();
  }

  if (done) {
    return (
      <Sheet open onClose={onClose} title="Contact added" subtitle={`${done.name || done.email} can sign in to ${client.name}’s portal as soon as they create a login.`}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <ClientInvitePanel email={done.email} name={done.name} clientName={client.name} />
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title="Invite a contact" subtitle={`Someone at ${client.name}. You’ll get a message to send them next.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form="core-invite-contact" loading={busy} icon="userPlus">Add contact</Button></>}>
      <form id="core-invite-contact" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Email" required error={emailErr} hint="They must create their login with this exact address.">
          <Input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-invalid={!!emailErr} />
        </Field>
        <Field label="Full name"><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="off" /></Field>
        <FormError error={error} />
      </form>
    </Sheet>
  );
}

// ───────── Training track ─────────

type Mod = Pick<Module, 'id' | 'title' | 'status' | 'track' | 'minutes' | 'summary'>;

export function TrainingTrackTab({ client, track, modules, onChanged }: { client: Client; track: ClientModule[]; modules: Mod[]; onChanged: (t: ClientModule[]) => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const ordered = [...track].sort((a, b) => a.sort - b.sort);
  const modOf = (id: string) => modules.find((m) => m.id === id);
  const minutes = ordered.reduce((s, t) => s + (modOf(t.module_id)?.minutes || 0), 0);

  async function persist(next: ClientModule[], ok?: string) {
    const before = track;
    const renum = next.map((t, i) => ({ client_id: client.id, module_id: t.module_id, sort: i }));
    onChanged(renum);
    const { error } = renum.length ? await supabase.from('ramp_client_modules').upsert(renum, { onConflict: 'client_id,module_id' }) : { error: null };
    if (error) { onChanged(before); toast(errText(error), 'bad'); return false; }
    if (ok) toast(ok);
    return true;
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const next = ordered.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    persist(next);
  }

  async function remove(t: ClientModule) {
    const m = modOf(t.module_id);
    const ok = await confirm({ title: `Remove ${m?.title || 'this module'} from the track?`, body: `Team members placed with ${client.name} won’t be assigned it any more. Progress they’ve made is kept.`, action: 'Remove module', danger: true });
    if (!ok) return;
    const before = track;
    onChanged(track.filter((x) => x.module_id !== t.module_id));
    const { error } = await supabase.from('ramp_client_modules').delete().eq('client_id', client.id).eq('module_id', t.module_id);
    if (error) { onChanged(before); toast(errText(error), 'bad'); return; }
    toast('Removed from the track.');
  }

  async function add(ids: string[]) {
    const start = ordered.length;
    const rows = ids.map((id, i) => ({ client_id: client.id, module_id: id, sort: start + i }));
    const { error } = await supabase.from('ramp_client_modules').insert(rows);
    if (error) { toast(errText(error), 'bad'); return false; }
    onChanged([...track, ...rows]);
    toast(`${plural(ids.length, 'module')} added.`);
    return true;
  }

  const available = modules.filter((m) => m.track === 'role' && m.status === 'published' && !track.some((t) => t.module_id === m.id));

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-display text-lg font-semibold">{client.name} training track</p>
          <p className="text-sm text-muted">Every team member placed here is assigned these, in this order, after the company-wide modules and their role track.{ordered.length ? ` About ${minutes} min in total.` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/admin/training" variant="ghost" icon="plus">Build a new module</LinkButton>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add modules</Button>
        </div>
      </Card>
      <Card padded={false} className="overflow-hidden">
        {ordered.length === 0 ? (
          <EmptyState icon="book" title="No client training yet" body={`Add role-track modules about ${client.name}’s tools and processes, like their CRM or how they want email handled.`}
            action={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add modules</Button>} />
        ) : (
          <ol>
            {ordered.map((t, i) => {
              const m = modOf(t.module_id);
              return (
                <li key={t.module_id} className="flex items-center gap-1 pl-4 pr-1 py-2 border-t border-line-2 first:border-t-0">
                  <span className="w-7 h-7 rounded-full bg-chip text-ink-2 text-xs font-bold flex items-center justify-center shrink-0 mr-2">{i + 1}</span>
                  <div className="min-w-0 flex-1 py-1">
                    {m ? <Link to={`/admin/training/${m.id}`} className="font-semibold text-[15px] text-ink no-underline hover:underline break-words">{m.title}</Link> : <span className="text-muted">Removed module</span>}
                    <p className="text-[13px] text-muted">{m ? `${m.minutes} min` : ''}{m && m.status !== 'published' ? ' · draft, hidden until published' : ''}</p>
                  </div>
                  <IconButton icon="chevronUp" label={`Move ${m?.title || 'module'} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon="chevronDown" label={`Move ${m?.title || 'module'} down`} disabled={i === ordered.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon="trash" label={`Remove ${m?.title || 'module'}`} onClick={() => remove(t)} className="text-bad" />
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      <p className="text-[13px] text-muted px-1">Only published role-track modules can be added. To make one, use Build a new module, pick the Role track and publish it.</p>
      {adding && <AddModulesSheet available={available} onClose={() => setAdding(false)} onAdd={add} />}
      {dialog}
    </div>
  );
}

function AddModulesSheet({ available, onClose, onAdd }: { available: Mod[]; onClose: () => void; onAdd: (ids: string[]) => Promise<boolean> }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    if (await onAdd(picked)) onClose();
    else setBusy(false);
  }
  return (
    <Sheet open onClose={() => (busy ? undefined : onClose())} title="Add modules" subtitle="Published role-track modules. They’re added to the end of the track."
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} disabled={!picked.length} onClick={save} icon="plus">{picked.length ? `Add ${plural(picked.length, 'module')}` : 'Add modules'}</Button></>}>
      {available.length === 0 ? (
        <EmptyState icon="book" title="Nothing to add" body="Every published role-track module is already on this track. Build a new one in Training modules."
          action={<LinkButton to="/admin/training" variant="primary">Go to training modules</LinkButton>} />
      ) : (
        <ul className="flex flex-col">
          {available.map((m) => (
            <li key={m.id} className="border-t border-line-2 first:border-t-0">
              <Checkbox checked={picked.includes(m.id)} onChange={(on) => setPicked((p) => (on ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                label={m.title} hint={`${m.minutes} min${m.summary ? ` · ${m.summary}` : ''}`} />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

// ───────── Invoices ─────────

export function InvoicesTab({ client, invoices }: { client: Client; invoices: Invoice[] }) {
  const today = todayISO();
  const rows = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const open = rows.filter((i) => i.status === 'open');
  const balance = open.reduce((s, i) => s + Number(i.total || 0), 0);
  const overdue = open.filter((i) => i.due_date && i.due_date < today);
  const paid = rows.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="grid grid-cols-3 gap-3 sm:gap-8 flex-1 min-w-0">
          <div><p className="text-[13px] font-semibold text-muted">Open</p><p className="text-xl font-semibold tabular-nums">{money(balance, client.currency)}</p></div>
          <div><p className="text-[13px] font-semibold text-muted">Overdue</p><p className={cx('text-xl font-semibold tabular-nums', overdue.length > 0 && 'text-bad')}>{overdue.length}</p></div>
          <div><p className="text-[13px] font-semibold text-muted">Paid to date</p><p className="text-xl font-semibold tabular-nums">{money(paid, client.currency)}</p></div>
        </div>
        <LinkButton to={`/admin/invoices?client=${client.id}`} variant="primary" icon="plus">New invoice</LinkButton>
      </Card>
      <Card padded={false} className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="fileText" title="No invoices yet" body={`Create ${client.name}’s first invoice once there are approved hours, a prepaid period or a setup fee to bill.`}
            action={<LinkButton to={`/admin/invoices?client=${client.id}`} variant="primary" icon="plus">New invoice</LinkButton>} />
        ) : (
          <ul>
            {rows.map((i) => {
              const late = i.status === 'open' && !!i.due_date && i.due_date < today;
              const st = INVOICE_STATUS[i.status];
              return (
                <li key={i.id} className="border-t border-line-2 first:border-t-0">
                  <Link to={`/admin/invoices/${i.id}`} className={cx('flex items-center gap-3 px-4 py-3.5 min-h-16 no-underline text-ink hover:bg-[#FAFBFC]', i.status === 'void' && 'opacity-60')}>
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[15px] font-mono">{i.number}</span>
                        <Chip tone={late ? 'bad' : st.tone}>{late ? 'Overdue' : st.label}</Chip>
                        {i.sent_at && <Chip tone="brand" icon="send">Sent through Stripe</Chip>}
                      </span>
                      <span className="text-sm text-muted">
                        {fmtDate(i.period_start)} – {fmtDate(i.period_end)}
                        {i.status === 'open' && i.due_date ? ` · due ${fmtDate(i.due_date)}` : ''}
                        {i.status === 'paid' && i.paid_at ? ` · paid ${fmtDate(i.paid_at)}` : ''}
                      </span>
                    </div>
                    <span className="text-[15px] font-semibold tabular-nums shrink-0">{money(i.total, i.currency)}</span>
                    <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ───────── Requests ─────────

const REQ_ORDER: ClientRequest['status'][] = ['open', 'in_progress', 'done'];

export function RequestsTab({ client, requests, nameOf, assistantOf, onSaved }: {
  client: Client; requests: ClientRequest[]; nameOf: (id: string | null) => string | null; assistantOf: (placementId: string | null) => string | null; onSaved: (r: ClientRequest) => void;
}) {
  const rows = [...requests].sort((a, b) => REQ_ORDER.indexOf(a.status) - REQ_ORDER.indexOf(b.status) || b.created_at.localeCompare(a.created_at));
  if (!rows.length) {
    return <Card><EmptyState icon="chat" title="No requests" body={`When someone at ${client.name} asks for help, a replacement, different hours or another team member in their portal, it shows up here.`} /></Card>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id}>
          <Card className={cx(r.status === 'done' && 'opacity-90')}>
            <RequestCard r={r} assistant={assistantOf(r.placement_id)} from={nameOf(r.member_id)} onSaved={onSaved} />
          </Card>
        </li>
      ))}
    </ul>
  );
}
