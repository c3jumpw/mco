// First-run setup for a new workspace: company basics, what came from the RAMP library, the first invites.
// Finishing (or skipping) marks the workspace set up so admins aren't sent here again.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errText, supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { BRAND_COLORS, cx, plural } from '../lib/util';
import type { Department, JobRole, Org, Seats } from '../lib/types';
import { Button, Card, Field, Icon, Input, Logo, Notice, Spinner, useToast } from '../ui';
import { FocusFrame } from '../shell/AppShell';
import { TimezonePicker, isZone } from './parts/setup-timezone';
import { InviteSheet } from './parts/ops-invite';

type Step = 0 | 1 | 2 | 3;
const STEPS = ['Your company', 'What’s included', 'Your team', 'Ready'];

async function markDone(to: string) {
  const { error } = await supabase.rpc('ramp_workspace_setup_done');
  if (error) throw error;
  // A full load picks up the finished setup in the session.
  window.location.assign(to);
}

export default function Setup() {
  useTitle('Set up your workspace');
  const { org, workspace, me } = useMe();
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function finish(to: string) {
    setBusy(true); setErr('');
    try { await markDone(to); } catch (e) { setBusy(false); setErr(errText(e)); }
  }

  return (
    <FocusFrame>
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Logo size={34} />
          <span className="leading-tight">
            <span className="block font-display font-bold tracking-[0.08em]">RAMP</span>
            <span className="block text-xs text-muted">{workspace?.name || org.name}</span>
          </span>
          <button type="button" disabled={busy} onClick={() => finish('/')} className="ml-auto min-h-11 px-2 text-sm font-semibold text-muted hover:text-ink cursor-pointer">
            Set up later
          </button>
        </div>
        <div>
          <p className="text-sm font-semibold text-brand-ink">Step {step + 1} of {STEPS.length}</p>
          <h1 className="font-display text-[28px] md:text-[32px] font-bold leading-tight mt-1">
            {step === 0 ? `Welcome to RAMP, ${(me.preferred_name || me.full_name || '').split(' ')[0] || 'there'}` : STEPS[step]}
          </h1>
          <ol className="flex gap-1.5 mt-4" aria-label="Setup steps">
            {STEPS.map((s, i) => <li key={s} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand' : 'bg-line')} aria-current={i === step ? 'step' : undefined}><span className="sr-only">{s}</span></li>)}
          </ol>
        </div>
        {step === 0 && <CompanyStep onNext={() => setStep(1)} />}
        {step === 1 && <LibraryStep onBack={() => setStep(0)} onNext={() => setStep(2)} />}
        {step === 2 && <TeamStep onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && (
          <Card className="flex flex-col gap-4">
            <p className="text-[15px] text-ink-2 leading-relaxed">Your workspace is ready. Here’s where to go next:</p>
            <ul className="flex flex-col gap-2 text-[15px]">
              <li className="flex gap-2.5"><Icon name="book" size={20} className="text-brand-ink shrink-0 mt-0.5" />Admin › Training modules: adjust the modules to your business.</li>
              <li className="flex gap-2.5"><Icon name="list" size={20} className="text-brand-ink shrink-0 mt-0.5" />Admin › Welcome flow: the steps each new person goes through.</li>
              <li className="flex gap-2.5"><Icon name="userPlus" size={20} className="text-brand-ink shrink-0 mt-0.5" />Admin › People: invite more of your team any time.</li>
            </ul>
            {err && <Notice tone="bad" icon="alert">{err}</Notice>}
            <div className="flex flex-wrap gap-2.5 justify-between">
              <Button onClick={() => setStep(2)} icon="chevronLeft">Back</Button>
              <Button variant="primary" size="lg" loading={busy} onClick={() => finish('/admin')}>Go to the admin portal</Button>
            </div>
          </Card>
        )}
        {step < 3 && err && <Notice tone="bad" icon="alert">{err}</Notice>}
      </div>
    </FocusFrame>
  );
}

function CompanyStep({ onNext }: { onNext: () => void }) {
  const { org, setOrg } = useMe();
  const toast = useToast();
  const [name, setName] = useState(org.name || '');
  const [color, setColor] = useState((org.brand_color || '#4338CA').toUpperCase());
  const [tz, setTz] = useState(org.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setErr('');
    if (!name.trim()) { setErr('Add your company’s name.'); return; }
    if (!isZone(tz)) { setErr('Pick a time zone from the list.'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('ramp_org').update({ name: name.trim(), brand_color: color, timezone: tz }).eq('id', true).select().single();
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    setOrg(data as Org);
    toast('Saved.');
    onNext();
  }
  return (
    <Card className="flex flex-col gap-5">
      <p className="text-[15px] text-ink-2 leading-relaxed">Three quick things so RAMP looks and works like your company. You can change all of it later in Admin › Organization.</p>
      <Field label="Company name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" maxLength={120} /></Field>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-2">Brand color</span>
        <div role="radiogroup" aria-label="Brand color" className="flex flex-wrap gap-1">
          {BRAND_COLORS.map((b) => {
            const on = b.c.toUpperCase() === color;
            return (
              <button key={b.c} type="button" role="radio" aria-checked={on} aria-label={b.name} title={b.name} onClick={() => setColor(b.c.toUpperCase())}
                className={cx('w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-2', on ? 'border-ink' : 'border-transparent')}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: b.c }}>{on && <Icon name="check" size={16} strokeWidth={2.6} />}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Time zone" hint="Used for due dates, check-ins and the Day 1 schedule."><TimezonePicker value={tz} onChange={setTz} /></Field>
      {err && <Notice tone="bad" icon="alert">{err}</Notice>}
      <div className="flex justify-end"><Button variant="primary" size="lg" loading={busy} onClick={save} iconRight="chevronRight">Save and continue</Button></div>
    </Card>
  );
}

function LibraryStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { data } = useAsync(async () => {
    const [modules, roles, depts, templates] = await Promise.all([
      supabase.from('ramp_modules').select('id', { count: 'exact', head: true }),
      q<JobRole[]>(supabase.from('ramp_job_roles').select('*').order('title')),
      q<Department[]>(supabase.from('ramp_departments').select('*').order('name')),
      supabase.from('ramp_templates').select('id', { count: 'exact', head: true }),
    ]);
    return { modules: modules.count || 0, roles, depts, templates: templates.count || 0 };
  }, []);
  return (
    <Card className="flex flex-col gap-5">
      <p className="text-[15px] text-ink-2 leading-relaxed">Your workspace starts with a copy of the RAMP training library, so your team has something to learn from on day one. It’s yours to edit; changes never affect anyone else.</p>
      {!data ? <div className="flex items-center gap-2 text-muted"><Spinner size={18} />Counting…</div> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { n: data.modules, l: 'training modules', icon: 'book' },
            { n: data.templates, l: 'documents and forms', icon: 'fileText' },
            { n: data.roles.length, l: 'job roles', icon: 'sliders' },
            { n: data.depts.length, l: 'departments', icon: 'building' },
          ].map((x) => (
            <div key={x.l} className="rounded-2xl border border-line p-3.5 flex flex-col gap-1">
              <Icon name={x.icon} size={20} className="text-brand-ink" />
              <span className="font-display text-2xl font-bold">{x.n}</span>
              <span className="text-[13px] text-muted">{x.l}</span>
            </div>
          ))}
        </div>
      )}
      {data && data.roles.length > 0 && (
        <p className="text-sm text-ink-2">Roles: {data.roles.slice(0, 8).map((r) => r.title).join(', ')}{data.roles.length > 8 ? ` and ${data.roles.length - 8} more` : ''}.</p>
      )}
      <Notice icon="info">Rename, remove or add roles in <Link to="/admin/roles" className="font-semibold underline">Roles and departments</Link> after setup.</Notice>
      <div className="flex justify-between gap-2.5"><Button onClick={onBack} icon="chevronLeft">Back</Button><Button variant="primary" size="lg" onClick={onNext} iconRight="chevronRight">Continue</Button></div>
    </Card>
  );
}

function TeamStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [open, setOpen] = useState(false);
  const { data, reload } = useAsync(async () => {
    const [seats, roles, depts, people] = await Promise.all([
      supabase.rpc('ramp_seats').then(({ data: d }) => (d as Seats | null)),
      q<JobRole[]>(supabase.from('ramp_job_roles').select('*').order('title')),
      q<Department[]>(supabase.from('ramp_departments').select('*').order('name')),
      q<{ id: string; email: string; full_name: string; status: string }[]>(supabase.from('ramp_members').select('id, email, full_name, status').neq('level', 'client').order('created_at')),
    ]);
    return { seats, roles, depts, people };
  }, []);
  return (
    <Card className="flex flex-col gap-5">
      <p className="text-[15px] text-ink-2 leading-relaxed">Add the first people you’d like to train or onboard. RAMP gives you a short message to send them; they sign in with the same email.</p>
      {data?.seats && (
        <p className="text-sm text-ink-2"><strong className="text-ink">{data.seats.limit == null ? `${data.seats.used} seats used` : `${data.seats.used} of ${data.seats.limit} seats used`}</strong>
          {data.seats.limit != null ? ` · ${plural(Math.max(data.seats.limit - data.seats.used, 0), 'seat')} left` : ''}</p>
      )}
      {data && (
        <ul className="flex flex-col gap-1.5">
          {data.people.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 text-[15px]"><Icon name="users" size={18} className="text-muted" />
              <span className="min-w-0 truncate">{p.full_name || p.email}</span>
              <span className="text-[13px] text-muted">{p.status === 'invited' ? 'invited' : 'joined'}</span>
            </li>
          ))}
        </ul>
      )}
      <Button className="self-start" icon="userPlus" onClick={() => setOpen(true)} disabled={!data}>Invite someone</Button>
      {data && <InviteSheet open={open} onClose={() => { setOpen(false); reload(); }} roles={data.roles} depts={data.depts} onInvited={() => reload()} />}
      <div className="flex justify-between gap-2.5"><Button onClick={onBack} icon="chevronLeft">Back</Button><Button variant="primary" size="lg" onClick={onNext} iconRight="chevronRight">Continue</Button></div>
    </Card>
  );
}
