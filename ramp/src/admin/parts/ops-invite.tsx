// Invite flow: the invite sheet, bulk invite for potential staff, and the "Send them this" message panel.
// RAMP does not send email, so after adding someone the admin copies a ready-made message.

import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { supabase, errText } from '../../lib/supabase';
import { invalidateDirectory, useDirectory } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { LEVELS, LEVEL_ORDER, cx, displayName, plural } from '../../lib/util';
import type { Department, DirEntry, JobRole, Level, Member, PotentialStaff } from '../../lib/types';
import { Button, Chip, Field, Icon, Input, LinkButton, Notice, Pills, Progress, Select, Sheet, useToast } from '../../ui';
import { FormError, copyText, focusInvalid, roleLabel } from './ops-common';

export type InviteSource = Member['source'];
export interface InvitePrefill { email?: string; name?: string; source?: InviteSource; ref?: string | null }

const INVITE_LEVELS = LEVEL_ORDER.filter((l) => l !== 'owner').map((l) => ({ value: l, label: LEVELS[l].label }));
const MENTOR_LEVELS = new Set<Level>(['mentor', 'lead', 'admin', 'owner']);

export function mentorOptions(list: DirEntry[], exclude?: string | null) {
  return list.filter((d) => MENTOR_LEVELS.has(d.level) && d.id !== exclude)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

export const joinLink = () => `${window.location.origin}/?join=1`;

/** The message an admin sends to someone they added. One person (email known) or many (sent by BCC). */
export function inviteText(o: { name?: string; email?: string; orgName: string; fromName: string }) {
  const first = (o.name || '').trim().split(/\s+/)[0] || '';
  return [
    `Hi${first ? ` ${first}` : ''},`,
    '',
    `You’re invited to RAMP, where ${o.orgName} does training and onboarding.`,
    '',
    `1. Open ${joinLink()}`,
    o.email ? `2. Create a login with this email address: ${o.email}` : '2. Create a login with the email address this message was sent to.',
    '3. Follow the welcome steps to get set up.',
    '',
    'Use exactly that email address. RAMP matches your login to your invite by email, so a different one won’t work.',
    '',
    'See you there,',
    o.fromName,
  ].join('\n');
}

const SUBJECT = 'Your invite to RAMP';

/** "Send them this": a copyable invite message with copy and email buttons. */
export function InviteMessagePanel({ emails, name, title = 'Send them this', collapsible }: { emails: string[]; name?: string; title?: string; collapsible?: boolean }) {
  const { me, org } = useMe();
  const toast = useToast();
  const single = emails.length === 1 ? emails[0]! : '';
  const text = inviteText({ name: single ? name : '', email: single, orgName: org.name, fromName: displayName(me) });
  const mailto = single
    ? `mailto:${encodeURIComponent(single)}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(text)}`
    : `mailto:?bcc=${emails.map(encodeURIComponent).join(',')}&subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(text)}`;

  async function copy(value: string, what: string) {
    const ok = await copyText(value);
    toast(ok ? `${what} copied.` : 'Couldn’t copy. Select the text and copy it yourself.', ok ? 'ok' : 'bad');
  }

  const message = (
    <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-ink bg-bg border border-line rounded-xl px-4 py-3 select-all">{text}</pre>
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          RAMP doesn’t send email. Send this yourself by email or text{single ? <> to <span className="font-semibold text-ink-2 break-all">{single}</span></> : null}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon="copy" onClick={() => copy(text, 'Message')}>Copy message</Button>
        <Button icon="mail" onClick={() => { window.location.href = mailto; }}>Open in email</Button>
        {emails.length > 1 && <Button variant="ghost" icon="copy" onClick={() => copy(emails.join(', '), 'Email addresses')}>Copy {plural(emails.length, 'address', 'addresses')}</Button>}
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

// ───────── shared field set ─────────

function LevelPicker({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-ink-2">Access level</span>
      <Pills options={INVITE_LEVELS} value={value} onChange={onChange} label="Access level" size="sm" />
      <p className="text-[13px] text-muted leading-relaxed"><span className="font-semibold text-ink-2">{LEVELS[value].label}:</span> {LEVELS[value].scope}</p>
    </div>
  );
}

function RoleMentorStart({ roles, depts, mentors, role, setRole, mentor, setMentor, start, setStart }: {
  roles: JobRole[]; depts: Department[]; mentors: DirEntry[];
  role: string; setRole: (v: string) => void; mentor: string; setMentor: (v: string) => void; start: string; setStart: (v: string) => void;
}) {
  return (
    <>
      <Field label="Job role" hint={roles.length ? 'Sets their role training and department.' : 'Add job roles in Admin › Roles and departments.'}>
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">No job role yet</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{roleLabel(r, depts)}</option>)}
        </Select>
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Mentor" hint="Who they go to with questions.">
          <Select value={mentor} onChange={(e) => setMentor(e.target.value)}>
            <option value="">No mentor</option>
            {mentors.map((d) => <option key={d.id} value={d.id}>{displayName(d)}{d.job_title ? ` · ${d.job_title}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Start date" hint="Training due dates count from here.">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
      </div>
    </>
  );
}

// ───────── one person ─────────

export function InviteSheet(props: { open: boolean; onClose: () => void; prefill?: InvitePrefill | null; roles: JobRole[]; depts: Department[]; onInvited?: (id: string) => void }) {
  if (!props.open) return null;
  return <InviteBody {...props} />;
}

function InviteBody({ onClose, prefill, roles, depts, onInvited }: { onClose: () => void; prefill?: InvitePrefill | null; roles: JobRole[]; depts: Department[]; onInvited?: (id: string) => void }) {
  const toast = useToast();
  const dir = useDirectory();
  const mentors = useMemo(() => mentorOptions(dir.list), [dir.list]);
  const [email, setEmail] = useState(prefill?.email || '');
  const [name, setName] = useState(prefill?.name || '');
  const [level, setLevel] = useState<Level>('trainee');
  const [role, setRole] = useState('');
  const [mentor, setMentor] = useState('');
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [done, setDone] = useState<{ id: string; email: string; name: string } | null>(null);

  const source = prefill?.source || 'manual';
  const sourceText = source === 'hiring' ? 'From the hiring app' : source === 'staff' ? 'From staff records' : source === 'request' ? 'Asked for access' : '';

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const em = email.trim().toLowerCase();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setEmailErr('Enter a valid email address.'); focusInvalid('ops-invite-form'); return; }
    setEmailErr('');
    setBusy(true);
    try {
      const { data, error: err } = await supabase.rpc('ramp_invite', {
        p_email: em, p_name: name.trim(), p_job_role: role || null, p_mentor: mentor || null, p_level: level,
        p_source: source, p_ref: prefill?.ref || null, p_start: start || null,
      });
      if (err) throw err;
      invalidateDirectory();
      const id = data as string;
      setDone({ id, email: em, name: name.trim() });
      toast(`${name.trim() || em} added. Now send them the invite.`);
      onInvited?.(id);
    } catch (x) {
      setError(errText(x));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Sheet open onClose={onClose} title="Added to RAMP" subtitle={<>{done.name || done.email} can join as soon as they create a login.</>}
        footer={<><LinkButton to={`/admin/people/${done.id}`}>View profile</LinkButton><Button variant="primary" onClick={onClose}>Done</Button></>}>
        <InviteMessagePanel emails={[done.email]} name={done.name} />
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Invite someone" subtitle="Add them to RAMP. You’ll get a message to send them next."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="ops-invite-form" loading={busy} icon="userPlus">Add to RAMP</Button></>}>
      <form id="ops-invite-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {sourceText && <Notice tone="brand" icon="info">{sourceText}. Their RAMP profile will link back to it.</Notice>}
        <Field label="Email" required error={emailErr} hint="They must create their login with this exact address.">
          <Input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-invalid={!!emailErr} />
        </Field>
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="off" />
        </Field>
        <LevelPicker value={level} onChange={setLevel} />
        {level === 'guest' && <p className="text-[13px] text-muted -mt-2">You can set an end date for guest access on their profile.</p>}
        <RoleMentorStart roles={roles} depts={depts} mentors={mentors} role={role} setRole={setRole} mentor={mentor} setMentor={setMentor} start={start} setStart={setStart} />
        <FormError error={error} />
      </form>
    </Sheet>
  );
}

// ───────── many people at once (potential staff) ─────────

export function BulkInviteSheet(props: { open: boolean; onClose: () => void; people: PotentialStaff[]; roles: JobRole[]; depts: Department[]; onDone: () => void }) {
  if (!props.open) return null;
  return <BulkBody {...props} />;
}

interface BulkResult { p: PotentialStaff; ok: boolean; error?: string }

function BulkBody({ onClose, people, roles, depts, onDone }: { onClose: () => void; people: PotentialStaff[]; roles: JobRole[]; depts: Department[]; onDone: () => void }) {
  const toast = useToast();
  const dir = useDirectory();
  const mentors = useMemo(() => mentorOptions(dir.list), [dir.list]);
  const [level, setLevel] = useState<Level>('trainee');
  const [role, setRole] = useState('');
  const [mentor, setMentor] = useState('');
  const [start, setStart] = useState('');
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const runningRef = useRef(false);
  // Stable, so the sheet keeps focus; ignores close requests while invites are being added.
  const closeSafe = useCallback(() => { if (!runningRef.current) onClose(); }, [onClose]);

  // One invite per email address, and only rows that have one.
  const ready = useMemo(() => {
    const seen = new Set<string>();
    return people.filter((p) => {
      const em = (p.email || '').trim().toLowerCase();
      if (!em || seen.has(em)) return false;
      seen.add(em);
      return true;
    });
  }, [people]);
  const skipped = people.length - ready.length;

  async function run() {
    runningRef.current = true;
    setRunning(true);
    setDoneCount(0);
    const out: BulkResult[] = [];
    for (const p of ready) {
      try {
        const { error } = await supabase.rpc('ramp_invite', {
          p_email: p.email.trim().toLowerCase(), p_name: (p.name || '').trim(), p_job_role: role || null, p_mentor: mentor || null,
          p_level: level, p_source: p.source, p_ref: p.ref, p_start: start || null,
        });
        if (error) throw error;
        out.push({ p, ok: true });
      } catch (e) {
        out.push({ p, ok: false, error: errText(e) });
      }
      setDoneCount(out.length);
    }
    invalidateDirectory();
    setResults(out);
    runningRef.current = false;
    setRunning(false);
    const ok = out.filter((r) => r.ok).length;
    toast(ok === out.length ? `${plural(ok, 'person', 'people')} added.` : `${ok} of ${out.length} added. Check the ones that didn’t work.`, ok === out.length ? 'ok' : 'bad');
    onDone();
  }

  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    return (
      <Sheet open onClose={onClose} title={ok.length ? `${plural(ok.length, 'person', 'people')} added` : 'Nobody was added'}
        subtitle={ok.length ? 'They can join as soon as they create a login.' : undefined}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        {failed.length > 0 && (
          <Notice tone="bad" icon="alert">
            <p className="font-semibold">{plural(failed.length, 'invite')} didn’t work</p>
            <ul className="mt-1 flex flex-col gap-1">
              {failed.map((r) => <li key={r.p.source + r.p.ref}><span className="font-semibold">{r.p.name || r.p.email}</span>: {r.error}</li>)}
            </ul>
          </Notice>
        )}
        {ok.length > 0 && <InviteMessagePanel emails={ok.map((r) => r.p.email.trim().toLowerCase())} title="Send them this" />}
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={closeSafe} title={`Invite ${plural(ready.length, 'person', 'people')}`}
      subtitle="Everyone you picked gets the same access level, job role and mentor. You can change each person later."
      footer={<><Button onClick={onClose} disabled={running}>Cancel</Button>
        <Button variant="primary" icon="userPlus" loading={running} disabled={!ready.length} onClick={run}>Add {plural(ready.length, 'person', 'people')}</Button></>}>
      <ul className="shrink-0 rounded-2xl border border-line divide-y divide-line-2 max-h-48 overflow-y-auto">
        {people.map((p) => {
          const missing = !(p.email || '').trim();
          return (
            <li key={p.source + p.ref} className={cx('px-4 py-2.5 flex items-center gap-2 text-sm', missing && 'text-muted')}>
              <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-ink">{p.name || 'No name'}</span> · {p.email || 'no email'}</span>
              {missing && <Chip tone="warn">Skipped</Chip>}
            </li>
          );
        })}
      </ul>
      {skipped > 0 && <p className="text-[13px] text-muted -mt-2">{plural(skipped, 'row')} without an email address or with a repeated one will be skipped.</p>}
      <LevelPicker value={level} onChange={setLevel} />
      <RoleMentorStart roles={roles} depts={depts} mentors={mentors} role={role} setRole={setRole} mentor={mentor} setMentor={setMentor} start={start} setStart={setStart} />
      {running && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm font-semibold">Adding {Math.min(doneCount + 1, ready.length)} of {ready.length}…</p>
          <Progress value={(doneCount / Math.max(1, ready.length)) * 100} label="Invites added" />
        </div>
      )}
    </Sheet>
  );
}

