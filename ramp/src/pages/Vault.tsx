import { useEffect, useId, useState, type FormEvent } from 'react';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { ago, cx } from '../lib/util';
import type { VaultEntry } from '../lib/types';
import { Button, Card, Checkbox, EmptyState, ErrorBox, Field, Icon, IconButton, Input, Notice, PageHeader, SearchInput, Sheet, Skeleton, useConfirm, useToast } from '../ui';

const COLS = 'id, member_id, label, username, url, created_at, updated_at';
const SHOW_FOR = 30;

/** A strong random password from an unambiguous character set, with at least one of each kind. */
function generatePassword(length = 20) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const rand = (n: number) => {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / n) * n;
    do crypto.getRandomValues(buf); while (buf[0]! >= limit);
    return buf[0]! % n;
  };
  const chars = sets.map((s) => s[rand(s.length)]!);
  while (chars.length < length) chars.push(all[rand(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

const hrefOf = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
const hostOf = (url: string) => { try { return new URL(hrefOf(url)).host; } catch { return url; } };

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function Vault() {
  useTitle('Vault');
  const { me } = useMe();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<VaultEntry | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState<{ id: string; secret: string; until: number } | null>(null);
  const [revealing, setRevealing] = useState('');
  const [now, setNow] = useState(Date.now());

  const { data, error, reload, setData } = useAsync(
    () => q<VaultEntry[]>(supabase.from('ramp_vault').select(COLS).eq('member_id', me.id).order('label')),
    [me.id],
  );

  // Hide a revealed password after 30 seconds.
  useEffect(() => {
    if (!shown) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= shown.until) setShown(null);
    }, 500);
    return () => clearInterval(t);
  }, [shown]);

  async function reveal(e: VaultEntry) {
    setRevealing(e.id);
    try {
      const secret = await q<string | null>(supabase.rpc('ramp_vault_reveal', { p_id: e.id }));
      if (!secret) { toast(`No password is saved for ${e.label}.`); setShown(null); return; }
      setNow(Date.now());
      setShown({ id: e.id, secret, until: Date.now() + SHOW_FOR * 1000 });
    } catch (err) {
      toast(errText(err), 'bad');
    } finally {
      setRevealing('');
    }
  }

  async function copyText(text: string, what: string) {
    if (await copy(text)) toast(`${what} copied.`);
    else toast('Couldn’t copy. Select the text and copy it instead.', 'bad');
  }

  async function remove(e: VaultEntry) {
    setEditing(null);
    const ok = await confirm({ title: `Delete ${e.label}?`, body: 'The login and its saved password will be deleted for good.', action: 'Delete login', danger: true });
    if (!ok) { setEditing(e); return; }
    setData((list) => (list || []).filter((x) => x.id !== e.id));
    if (shown?.id === e.id) setShown(null);
    const { error } = await supabase.from('ramp_vault').delete().eq('id', e.id);
    if (error) {
      setData((list) => [...(list || []), e].sort((a, b) => a.label.localeCompare(b.label)));
      toast(errText(error), 'bad');
    } else toast(`${e.label} deleted.`);
  }

  async function saved(id: string) {
    setEditing(null);
    const row = await q<VaultEntry>(supabase.from('ramp_vault').select(COLS).eq('id', id).single()).catch(() => null);
    if (row) setData((list) => [...(list || []).filter((x) => x.id !== id), row].sort((a, b) => a.label.localeCompare(b.label)));
    else reload();
    if (shown?.id === id) setShown(null);
  }

  const list = data || [];
  const term = search.trim().toLowerCase();
  const visible = term ? list.filter((e) => [e.label, e.username, e.url].some((v) => v.toLowerCase().includes(term))) : list;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Vault" subtitle="Keep your work logins in one safe place."
        actions={data && data.length > 0 ? <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add a login</Button> : undefined} />
      <Notice icon="lock">
        Everything here is encrypted, and only you can open it. Not your mentor, not your lead, not even admins.
      </Notice>

      {error && !data ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Skeleton rows={3} /> : (
        <>
          {error && <ErrorBox error={error} onRetry={reload} />}
          {list.length === 0 ? (
            <Card>
              <EmptyState icon="key" title="No logins saved yet"
                body="Save the usernames and passwords you use for work, so you never have to keep them in notes or messages."
                action={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add your first login</Button>} />
            </Card>
          ) : (
            <>
              {list.length > 5 && <SearchInput value={search} onChange={setSearch} placeholder="Search logins" label="Search logins" />}
              {visible.length === 0 ? (
                <p className="text-[15px] text-muted text-center py-6">No logins match “{search.trim()}”.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {visible.map((e) => {
                    const open = shown?.id === e.id ? shown : null;
                    const left = open ? Math.max(0, Math.ceil((open.until - now) / 1000)) : 0;
                    return (
                      <li key={e.id}>
                        <Card padded={false} className="p-4 flex flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <span className="w-11 h-11 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name="key" size={20} /></span>
                            <div className="min-w-0 flex-1">
                              <h2 className="text-base font-semibold leading-snug break-words">{e.label}</h2>
                              {e.username && <p className="text-sm text-ink-2 break-all">{e.username}</p>}
                              {e.url && (
                                <a href={hrefOf(e.url)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-ink no-underline inline-flex items-center gap-1 min-h-8 break-all">
                                  {hostOf(e.url)}<Icon name="link" size={14} />
                                </a>
                              )}
                            </div>
                            <IconButton icon="pen" label={`Edit ${e.label}`} onClick={() => setEditing(e)} />
                          </div>
                          {open && (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg px-3 py-2">
                              <code className="font-mono text-[15px] break-all flex-1 min-w-0 select-all" aria-label="Password">{open.secret}</code>
                              <span className="text-xs text-muted tabular-nums" aria-live="off">Hides in {left}s</span>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {open ? (
                              <>
                                <Button size="sm" variant="primary" icon="copy" onClick={() => copyText(open.secret, 'Password')}>Copy password</Button>
                                <Button size="sm" icon="eyeOff" onClick={() => setShown(null)}>Hide</Button>
                              </>
                            ) : (
                              <Button size="sm" icon="eye" onClick={() => reveal(e)} loading={revealing === e.id}>Show password</Button>
                            )}
                            {e.username && <Button size="sm" icon="copy" onClick={() => copyText(e.username, 'Username')}>Copy username</Button>}
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}

      <EntrySheet entry={editing} onClose={() => setEditing(null)} onSaved={saved} onDelete={(e) => remove(e)} />
      {dialog}
    </div>
  );
}

// ───────── add / edit ─────────

function EntrySheet({ entry, onClose, onSaved, onDelete }: { entry: VaultEntry | 'new' | null; onClose: () => void; onSaved: (id: string) => void; onDelete: (e: VaultEntry) => void }) {
  if (!entry) return null;
  return <EntryForm key={entry === 'new' ? 'new' : entry.id} entry={entry === 'new' ? null : entry} onClose={onClose} onSaved={onSaved} onDelete={onDelete} />;
}

function EntryForm({ entry, onClose, onSaved, onDelete }: { entry: VaultEntry | null; onClose: () => void; onSaved: (id: string) => void; onDelete: (e: VaultEntry) => void }) {
  const toast = useToast();
  const formId = useId();
  const [label, setLabel] = useState(entry?.label || '');
  const [username, setUsername] = useState(entry?.username || '');
  const [url, setUrl] = useState(entry?.url || '');
  const [secret, setSecret] = useState('');
  const [clear, setClear] = useState(false);
  const [show, setShow] = useState(false);
  const [labelErr, setLabelErr] = useState('');
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const l = label.trim();
    if (!l) { setLabelErr('Give this login a name, like “Payroll portal”.'); return; }
    setBusy(true);
    setFail('');
    // On edit: null keeps the saved password, '' removes it.
    const p_secret = entry ? (clear ? '' : secret ? secret : null) : secret;
    try {
      const id = await q<string>(supabase.rpc('ramp_vault_save', { p_id: entry?.id || null, p_label: l, p_username: username.trim(), p_url: url.trim(), p_secret }));
      toast(entry ? `${l} saved.` : `${l} added to your Vault.`);
      onSaved(id || entry?.id || '');
    } catch (err) {
      setFail(errText(err));
      setBusy(false);
    }
  }

  async function gen() {
    const p = generatePassword();
    setSecret(p);
    setShow(true);
    setClear(false);
    if (await copy(p)) toast('Strong password created and copied.');
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title={entry ? `Edit ${entry.label}` : 'Add a login'}
      subtitle={entry ? `Last changed ${ago(entry.updated_at)}` : 'Saved encrypted. Only you can open it.'}
      footer={
        <div className="flex flex-wrap items-center gap-2.5 w-full">
          {entry && <Button variant="danger" icon="trash" onClick={() => onDelete(entry)} disabled={busy}>Delete</Button>}
          <span className="flex-1" />
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>{entry ? 'Save changes' : 'Save login'}</Button>
        </div>
      }>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate autoComplete="off">
        <Field label="Name" required error={labelErr}>
          <Input value={label} maxLength={120} placeholder="Payroll portal" onChange={(e) => { setLabel(e.target.value); setLabelErr(''); }} />
        </Field>
        <Field label="Username or email">
          <Input value={username} maxLength={200} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Website" hint="Optional. The page where you sign in.">
          <Input value={url} maxLength={500} type="url" inputMode="url" autoCapitalize="none" placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${formId}-pw`} className="text-[13px] font-semibold text-ink-2">Password</label>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Input id={`${formId}-pw`} type={show ? 'text' : 'password'} value={secret} maxLength={500} disabled={clear}
                autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                placeholder={entry ? 'Leave blank to keep the saved one' : ''}
                className={cx('pr-12', show && 'font-mono')} onChange={(e) => setSecret(e.target.value)} />
              <IconButton icon={show ? 'eyeOff' : 'eye'} label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((v) => !v)}
                className="absolute right-0 top-1/2 -translate-y-1/2" />
            </div>
            <Button icon="sparkle" onClick={gen} disabled={clear}>Generate</Button>
          </div>
          <span className="text-xs text-muted leading-relaxed">“Generate” makes a strong 20-character password and copies it, so you can paste it into the other site.</span>
        </div>
        {entry && (
          <Checkbox checked={clear} onChange={(v) => { setClear(v); if (v) setSecret(''); }}
            label="Remove the saved password" hint="Keeps the name, username and website." />
        )}
        {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
      </form>
    </Sheet>
  );
}
