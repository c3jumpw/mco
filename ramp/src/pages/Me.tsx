import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useDirectory, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { docsFor, latestFor, SUBMISSION_COLS } from '../lib/plan';
import { KINDS, LEVELS, STAGES, ago, deviceText, displayName, fmtDate, fmtDateTime } from '../lib/util';
import type { SignIn, Submission, Template } from '../lib/types';
import { FormSheet } from '../components/FormSheet';
import { RecordView } from '../components/RecordView';
import { Avatar, Button, Card, CardHeader, Checkbox, Chip, ErrorBox, Field, Icon, Input, Notice, PageHeader, Select, Skeleton, useToast } from '../ui';

function timeZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn('timeZone');
  } catch { /* older browsers */ }
  return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'UTC'];
}

export default function Me() {
  useTitle('Profile');
  const { me, org, role, dept, signOut } = useMe();
  const dir = useDirectory();
  const mentor = me.mentor_id ? dir.byId(me.mentor_id) : null;
  const level = LEVELS[me.level];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile" subtitle="Your details, documents and account security." />

      <div className="flex items-center gap-4 rise">
        <Avatar name={displayName(me)} size={60} />
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold truncate">{displayName(me)}</p>
          <p className="text-sm text-muted">{level.label}{role ? ` · ${role.title}` : ''}</p>
        </div>
      </div>

      <ProfileCard />

      <Card padded={false}>
        <CardHeader title="Your account" subtitle="Set by your admins. Ask them if anything here is wrong." className="px-5 pt-5 pb-2" />
        <dl className="px-5 pb-4">
          <Row label="Email">{me.email}</Row>
          <Row label="Access level">
            <span className="font-semibold">{level.label}</span>
            <span className="block text-sm text-muted leading-relaxed mt-0.5">{level.scope}</span>
          </Row>
          <Row label="Job role">{role?.title || 'Not set yet'}</Row>
          <Row label="Department">{dept?.name || 'Not set yet'}</Row>
          {me.level !== 'guest' && <Row label="Mentor">{mentor ? displayName(mentor) : me.mentor_id ? 'Assigned' : 'No mentor yet'}</Row>}
          <Row label="Start date">{me.start_date ? fmtDate(me.start_date, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not set yet'}</Row>
          {me.access_until && <Row label="Access until">{fmtDate(me.access_until, { month: 'long', day: 'numeric', year: 'numeric' })}</Row>}
        </dl>
      </Card>

      <DocumentsCard />
      <SignInsCard />
      <PasswordCard />

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">Sign out</p>
          <p className="text-sm text-muted">Sign out of RAMP on this device.</p>
        </div>
        <Button variant="danger" icon="logout" onClick={signOut}>Sign out</Button>
      </Card>
      <p className="text-xs text-muted text-center pb-2">{org.name} · RAMP</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 py-3 border-t border-line-2 first:border-t-0">
      <dt className="text-[13px] font-semibold text-muted sm:w-36 shrink-0">{label}</dt>
      <dd className="text-[15px] text-ink min-w-0 break-words">{children}</dd>
    </div>
  );
}

// ───────── profile ─────────

function ProfileCard() {
  const { me, org, refresh } = useMe();
  const toast = useToast();
  const zones = useMemo(timeZones, []);
  const [full, setFull] = useState(me.full_name);
  const [preferred, setPreferred] = useState(me.preferred_name);
  const [phone, setPhone] = useState(me.phone);
  const [tz, setTz] = useState(me.timezone);
  const [nameErr, setNameErr] = useState('');
  const [busy, setBusy] = useState(false);
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dirty = full !== me.full_name || preferred !== me.preferred_name || phone !== me.phone || tz !== me.timezone;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!full.trim()) { setNameErr('Enter your full name.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('ramp_update_profile', { p_full_name: full.trim(), p_preferred: preferred.trim(), p_phone: phone.trim(), p_timezone: tz });
      if (error) throw error;
      setFull(full.trim()); setPreferred(preferred.trim()); setPhone(phone.trim());
      await refresh();
      toast('Profile saved.');
    } catch (err) {
      toast(errText(err), 'bad');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFull(me.full_name); setPreferred(me.preferred_name); setPhone(me.phone); setTz(me.timezone); setNameErr('');
  }

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <CardHeader title="Your details" subtitle="How you show up to the rest of the team." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={nameErr}>
            <Input value={full} maxLength={120} autoComplete="name" onChange={(e) => { setFull(e.target.value); setNameErr(''); }} />
          </Field>
          <Field label="Preferred name" hint="What people call you. Shown instead of your full name.">
            <Input value={preferred} maxLength={60} autoComplete="nickname" onChange={(e) => setPreferred(e.target.value)} />
          </Field>
          <Field label="Mobile phone" hint="Only you, your mentor, your lead and admins can see this.">
            <Input value={phone} maxLength={40} type="tel" autoComplete="tel" inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Time zone" hint={(tz || org.timezone) !== deviceTz ? <>This device is set to {deviceTz}. <button type="button" className="font-semibold text-brand-ink underline cursor-pointer" onClick={() => setTz(deviceTz)}>Use it</button></> : undefined}>
            <Select value={tz} onChange={(e) => setTz(e.target.value)}>
              <option value="">Company time zone ({org.timezone})</option>
              {tz && !zones.includes(tz) && <option value={tz}>{tz}</option>}
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap justify-end gap-2.5">
          {dirty && <Button onClick={reset} disabled={busy}>Undo changes</Button>}
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>Save details</Button>
        </div>
      </form>
    </Card>
  );
}

// ───────── documents ─────────

function DocumentsCard() {
  const { me, org } = useMe();
  const [filling, setFilling] = useState<Template | null>(null);
  const [viewing, setViewing] = useState<{ s: Submission; t: Template | null } | null>(null);

  const { data, error, reload } = useAsync(async () => {
    const [templates, subs] = await Promise.all([
      q<Template[]>(supabase.from('ramp_templates').select('*').eq('status', 'published').order('sort')),
      q<Submission[]>(supabase.from('ramp_submissions').select(SUBMISSION_COLS).eq('member_id', me.id).order('created_at', { ascending: false })),
    ]);
    return { templates, subs };
  }, [me.id]);

  const tz = me.timezone || org.timezone;
  const docs = data ? docsFor(me, data.templates) : [];
  const docIds = new Set(docs.map((t) => t.id));
  // Past submissions whose template no longer applies (or was removed): latest per template.
  const past = data ? data.subs.filter((s, i, all) => !(s.template_id && docIds.has(s.template_id))
    && (!s.template_id || all.findIndex((x) => x.template_id === s.template_id) === i)) : [];
  const left = data ? docs.filter((t) => !latestFor(t.id, data.subs)).length : 0;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 pb-3">
        <CardHeader title="My documents"
          subtitle={data ? (docs.length ? (left ? `${left} of ${docs.length} still to do. Sensitive answers are encrypted.` : 'All done. Sensitive answers are encrypted.') : 'Nothing to fill out right now.') : 'Forms, uploads and agreements you’ve completed.'} />
      </div>
      {error && !data ? <div className="px-5 pb-5"><ErrorBox error={error} onRetry={reload} /></div> : !data ? <div className="px-5 pb-5"><Skeleton rows={2} /></div> : (
        <>
          {docs.length > 0 && (
            <ul>
              {docs.map((t) => {
                const s = latestFor(t.id, data.subs);
                const outdated = s && s.template_version < t.version;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 border-t border-line-2">
                    <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={t.kind === 'esign' ? 'pen' : t.kind === 'upload' ? 'upload' : 'fileText'} size={19} /></span>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="text-[15px] font-semibold leading-snug">{t.title}</p>
                      <p className="text-[13px] text-muted">
                        {s ? <span title={fmtDateTime(s.created_at, tz)}>{s.signed_name ? 'Signed' : 'Submitted'} {fmtDate(s.created_at)}</span> : `${KINDS[t.kind].label} · ${STAGES[t.stage].label}`}
                        {outdated && ' · updated since'}
                      </p>
                    </div>
                    <Chip tone={s ? (outdated ? 'warn' : 'good') : 'warn'}>{s ? (outdated ? 'New version' : 'Done') : 'To do'}</Chip>
                    <div className="flex gap-2">
                      {s && <Button size="sm" icon="eye" onClick={() => setViewing({ s, t })}>View</Button>}
                      <Button size="sm" variant={s ? 'secondary' : 'primary'} onClick={() => setFilling(t)}>{s ? 'Submit again' : KINDS[t.kind].action}</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {past.length > 0 && (
            <div className="border-t border-line">
              <p className="px-5 pt-4 pb-1 text-[13px] font-semibold text-muted">Past documents</p>
              <ul>
                {past.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Icon name="file" size={18} className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold truncate">{s.template_title}</p>
                      <p className="text-[13px] text-muted">{s.signed_name ? 'Signed' : 'Submitted'} {fmtDate(s.created_at)} · version {s.template_version}</p>
                    </div>
                    <Button size="sm" icon="eye" onClick={() => setViewing({ s, t: data.templates.find((x) => x.id === s.template_id) || null })}>View</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {docs.length === 0 && past.length === 0 && <p className="px-5 pb-5 text-[15px] text-muted">When your admins add forms or agreements for you, they’ll show up here.</p>}
        </>
      )}
      <FormSheet template={filling} open={!!filling} onClose={() => setFilling(null)} onDone={() => reload()} />
      <RecordView submission={viewing?.s || null} template={viewing?.t} open={!!viewing} onClose={() => setViewing(null)} tz={tz} />
    </Card>
  );
}

// ───────── sign-ins ─────────

function SignInsCard() {
  const { me, org } = useMe();
  const { data, error, reload } = useAsync(
    () => q<SignIn[]>(supabase.from('ramp_signins').select('*').eq('member_id', me.id).order('at', { ascending: false }).limit(10)),
    [me.id],
  );
  const tz = me.timezone || org.timezone;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5 pb-3">
        <CardHeader title="Sign-in history"
          subtitle="Your last 10 sign-ins, so you can spot anything unusual. If you don’t recognize one, change your password below and tell an admin." />
      </div>
      {error && !data ? <div className="px-5 pb-5"><ErrorBox error={error} onRetry={reload} /></div> : !data ? <div className="px-5 pb-5"><Skeleton rows={2} /></div> : data.length === 0 ? (
        <p className="px-5 pb-5 text-[15px] text-muted">No sign-ins recorded yet.</p>
      ) : (
        <ul>
          {data.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 border-t border-line-2">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-[15px] font-semibold">{fmtDateTime(s.at, tz)}</p>
                <p className="text-[13px] text-muted">{deviceText(s.user_agent)}{i === 0 ? ' · most recent' : ` · ${ago(s.at)}`}</p>
              </div>
              <span className="text-[13px] text-ink-2">IP <span className="font-mono">{s.ip || 'not recorded'}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────── password ─────────

function PasswordCard() {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [errs, setErrs] = useState<{ pw?: string; pw2?: string }>({});
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errs = {};
    if (pw.length < 8) next.pw = 'Use at least 8 characters.';
    if (pw2 !== pw) next.pw2 = 'The two passwords don’t match.';
    setErrs(next);
    setFail('');
    if (next.pw || next.pw2) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw(''); setPw2(''); setShow(false);
      toast('Password changed. Use it next time you sign in.');
    } catch (err) {
      setFail(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <CardHeader title="Change password" subtitle="Pick something long that you don’t use anywhere else." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" error={errs.pw} hint="At least 8 characters.">
            <Input type={show ? 'text' : 'password'} value={pw} autoComplete="new-password" onChange={(e) => { setPw(e.target.value); setErrs((x) => ({ ...x, pw: undefined })); }} />
          </Field>
          <Field label="Confirm new password" error={errs.pw2}>
            <Input type={show ? 'text' : 'password'} value={pw2} autoComplete="new-password" onChange={(e) => { setPw2(e.target.value); setErrs((x) => ({ ...x, pw2: undefined })); }} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox checked={show} onChange={setShow} label="Show passwords" />
          <Button type="submit" variant="primary" loading={busy} disabled={!pw || !pw2} icon="lock">Change password</Button>
        </div>
        {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
      </form>
    </Card>
  );
}
