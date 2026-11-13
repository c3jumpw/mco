import { useEffect, useState } from 'react';
import type { AccessRole, Job, JobAccess } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { copyText, fmtDate, relTime } from '../../lib/util';
import { Button, Card, Field, Input, Pill, SectionTitle, Segmented, Toggle, cx, useToast } from '../../ui';

const ROLES: { id: AccessRole; label: string; hint: string }[] = [
  { id: 'reviewer', label: 'Reviewer', hint: 'Watches answers, fills in their own scorecard and adds notes. Nothing else.' },
  { id: 'editor', label: 'Full access to this job', hint: 'Can edit this job and manage its candidates: stages, invite and reject emails, export. No other jobs or settings.' },
];

const SIGN_IN = 'https://www.apply1234.com/admin';

type Perms = Pick<JobAccess, 'hide_contact' | 'see_files' | 'shortlisted_only' | 'can_move_stages' | 'notify'>;
const DEFAULT_PERMS: Perms = { hide_contact: true, see_files: true, shortlisted_only: false, can_move_stages: false, notify: true };
const FULL_ACCESS: Omit<Perms, 'notify'> = { hide_contact: false, see_files: true, shortlisted_only: false, can_move_stages: true };

/** The switches for one person. Full access always includes contact details, files and stages. */
function PermissionSwitches({ role, value, onChange }: { role: AccessRole; value: Perms; onChange: (p: Partial<Perms>) => void }) {
  return (
    <div className="space-y-4">
      {role === 'reviewer' && (
        <>
          <Toggle checked={!value.hide_contact} onChange={(v) => onChange({ hide_contact: !v })}
            label="Can see candidates' contact details"
            hint="Their email addresses, on screen and in new-candidate emails. Off by default." />
          <Toggle checked={value.see_files} onChange={(v) => onChange({ see_files: v })}
            label="Can open résumés and cover letters"
            hint={value.hide_contact && value.see_files
              ? 'Résumés usually include a phone number and address. Turn this off too to keep contact details fully private.'
              : 'Files and cover letters candidates added at the end of the activity.'} />
          <Toggle checked={value.shortlisted_only} onChange={(v) => onChange({ shortlisted_only: v })}
            label="Only show shortlisted candidates" hint="Candidates appear for them once you move them to Shortlisted or later." />
          <Toggle checked={value.can_move_stages} onChange={(v) => onChange({ can_move_stages: v })}
            label="Can move candidates between stages" />
        </>
      )}
      <Toggle checked={value.notify} onChange={(v) => onChange({ notify: v })}
        label="Email them when a new candidate applies"
        hint={role === 'reviewer' && value.shortlisted_only ? 'Not sent while they only see shortlisted candidates.' : undefined} />
      {role === 'editor' && <p className="text-xs text-muted">Full access always includes contact details, résumés and moving candidates.</p>}
    </div>
  );
}

/** Sends the invite email through the email function. Returns false when emails aren't set up. */
async function sendInvite(id: string) {
  try {
    const { data, error } = await supabase.functions.invoke('hiring-notify', { body: { invite_reviewer: id } });
    return !error && !!(data as { ok?: boolean })?.ok;
  } catch {
    return false;
  }
}

function inviteText(job: Job, a: Pick<JobAccess, 'email' | 'name' | 'role'>) {
  const first = a.name.trim().split(/\s+/)[0];
  const what = a.role === 'editor'
    ? `manage the ${job.title} job on apply1234: edit it, and review and move its candidates`
    : `review candidates for the ${job.title} role on apply1234: watch their video answers, score them and leave notes`;
  return `Hi${first ? ` ${first}` : ''},\n\nYou're invited to ${what}.\n\n1. Open ${SIGN_IN}\n2. Choose "First time? Create your login" and sign up with ${a.email}\n3. Confirm your email from the message you receive, then sign in.\n\nAlready have a login? Just sign in.`;
}

export default function AccessCard({ job }: { job: Job }) {
  const toast = useToast();
  const [rows, setRows] = useState<JobAccess[] | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AccessRole>('reviewer');
  const [perms, setPerms] = useState<Perms>(DEFAULT_PERMS);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = () => supabase.from('hiring_reviewers').select('*').eq('job_id', job.id).order('invited_at')
    .then(({ data }) => setRows((data || []) as JobAccess[]));
  useEffect(() => { load(); }, [job.id]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast('Enter a valid email address', 'bad'); return; }
    setBusy(true);
    const row: Partial<JobAccess> = role === 'editor'
      ? { job_id: job.id, email: v, name: name.trim(), role, ...FULL_ACCESS, notify: perms.notify }
      : { job_id: job.id, email: v, name: name.trim(), role, ...perms };
    const { data, error } = await supabase.from('hiring_reviewers').insert(row).select('*').single();
    if (error) {
      setBusy(false);
      toast(error.code === '23505' ? `${v} already has access to this job.` : error.message, 'bad');
      return;
    }
    const sent = await sendInvite((data as JobAccess).id);
    setBusy(false);
    setEmail(''); setName(''); setRole('reviewer'); setPerms(DEFAULT_PERMS);
    load();
    if (sent) toast(`Invite sent to ${v}`);
    else {
      await copyText(inviteText(job, data as JobAccess));
      toast('Access saved. The invite email couldn’t be sent, so the invite text is copied: paste it into an email to them.', 'bad');
    }
  };

  const update = async (a: JobAccess, p: Partial<JobAccess>) => {
    setRows((rs) => (rs || []).map((x) => (x.id === a.id ? { ...x, ...p } : x)));
    const { error } = await supabase.from('hiring_reviewers').update(p).eq('id', a.id);
    if (error) { toast(error.message, 'bad'); load(); }
  };

  const setRoleFor = (a: JobAccess, r: AccessRole) => update(a, r === 'editor' ? { role: r, ...FULL_ACCESS } : { role: r });

  const remove = async (a: JobAccess) => {
    if (!confirm(`Remove ${a.name || a.email}'s access to this job? They lose it straight away. Their scores and notes stay.`)) return;
    const { error } = await supabase.from('hiring_reviewers').delete().eq('id', a.id);
    if (error) toast(error.message, 'bad'); else { toast('Access removed'); load(); }
  };

  const resend = async (a: JobAccess) => {
    if (await sendInvite(a.id)) { toast(`Invite sent again to ${a.email}`); load(); }
    else { await copyText(inviteText(job, a)); toast('Couldn’t send the email, so the invite text is copied instead.', 'bad'); }
  };

  return (
    <Card>
      <SectionTitle sub="Invite someone you're hiring for, like a client or a manager, to this job only. They sign in with their own login.">
        People with access to this job
      </SectionTitle>

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line -mt-1 mb-4">
          {rows.map((a) => {
            const isOpen = open === a.id;
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.name || a.email}</p>
                    <p className="text-[12px] text-muted truncate">
                      {a.name ? `${a.email} · ` : ''}
                      {a.claimed_at ? `signed in ${relTime(a.claimed_at)}` : `invited ${fmtDate(a.last_invite_at || a.invited_at, false)}`}
                    </p>
                  </div>
                  <Pill tone={a.role === 'editor' ? 'accent' : 'neutral'}>{a.role === 'editor' ? 'Full access' : 'Reviewer'}</Pill>
                  {a.user_id ? <Pill tone="good">Active</Pill> : <Pill tone="warn">Invited</Pill>}
                  <Button size="sm" variant="ghost" onClick={() => setOpen(isOpen ? null : a.id)}>{isOpen ? 'Done' : 'Options'}</Button>
                </div>
                {isOpen && (
                  <div className="mt-3 rounded-xl bg-paper px-4 py-4 space-y-4">
                    <Segmented size="sm" value={a.role} onChange={(r) => setRoleFor(a, r)}
                      options={ROLES.map((r) => ({ id: r.id, label: r.label }))} />
                    <p className="text-xs text-muted -mt-2">{ROLES.find((r) => r.id === a.role)?.hint}</p>
                    <PermissionSwitches role={a.role} value={a} onChange={(p) => update(a, p)} />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!a.user_id && <Button size="sm" onClick={() => resend(a)}>Send the invite again</Button>}
                      <Button size="sm" variant="ghost" onClick={async () => { await copyText(inviteText(job, a)); toast('Invite text copied'); }}>Copy invite text</Button>
                      <Button size="sm" variant="ghost" className="text-bad" onClick={() => remove(a)}>Remove access</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={invite} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email"><Input type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Name (optional)"><Input placeholder="e.g. Dana Lee" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
        <Field label="Access">
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <button key={r.id} type="button" onClick={() => setRole(r.id)}
                className={cx('text-left rounded-xl border px-3.5 py-3 transition', role === r.id ? 'border-ink bg-paper-2' : 'border-line hover:border-ink/30')}>
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted mt-0.5 leading-relaxed">{r.hint}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Permissions">
          <div className="rounded-xl bg-paper px-4 py-4">
            <PermissionSwitches role={role} value={perms} onChange={(p) => setPerms((x) => ({ ...x, ...p }))} />
          </div>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send invite'}</Button>
          <span className="text-xs text-muted">You can change any of this later under Options.</span>
        </div>
      </form>
      <p className="text-xs text-muted mt-4 leading-relaxed">
        Need someone on every job, with settings? Add them under Settings › Hiring team instead.
      </p>
    </Card>
  );
}
