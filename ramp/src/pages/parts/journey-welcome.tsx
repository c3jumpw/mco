// Steps of the welcome flow (/welcome).
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { embedUrl, latestFor, type PlanItem } from '../../lib/plan';
import { KINDS, cx, dueLabel, fmtDate, plural } from '../../lib/util';
import type { DirEntry, FlowStep, FlowStepId, Submission, Template } from '../../lib/types';
import { Avatar, Button, Chip, EmptyState, ErrorBox, Field, Icon, Input, LinkButton, Notice, Select, Skeleton } from '../../ui';

export const STEP_LABEL: Record<FlowStepId, string> = {
  welcome: 'Welcome', profile: 'Profile', practice: 'Practice', documents: 'Documents', mentor: 'Mentor', done: 'All set',
};
const KNOWN = Object.keys(STEP_LABEL) as FlowStepId[];

/** The steps this org has switched on, in its order. Never empty. */
export function flowSteps(flow: FlowStep[] | null | undefined): FlowStepId[] {
  const out: FlowStepId[] = [];
  for (const s of Array.isArray(flow) ? flow : []) {
    if (s && s.on && KNOWN.includes(s.id) && !out.includes(s.id)) out.push(s.id);
  }
  return out.length ? out : ['welcome', 'done'];
}

export function StepTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="font-display text-[26px] md:text-[30px] leading-tight font-bold tracking-tight">{title}</h1>
      {sub && <p className="text-[16px] text-muted leading-relaxed">{sub}</p>}
    </div>
  );
}

function DetailRow({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 min-h-12 px-4 py-2.5 border-t border-line-2 first:border-t-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={cx('text-[15px] font-semibold text-right min-w-0 truncate', muted && 'text-muted font-medium')}>{value}</span>
    </div>
  );
}

// ───────── welcome ─────────

export function WelcomeStep({ first, orgName, headline, message, from, videoUrl, roleTitle, deptName, mentorName, minutes }: {
  first: string; orgName: string; headline: string; message: string; from: string; videoUrl: string;
  roleTitle: string | null; deptName: string | null; mentorName: string | null; minutes: number;
}) {
  const title = (headline || 'Hi {first}, let’s get you up to speed.').split('{first}').join(first);
  const video = videoUrl ? embedUrl(videoUrl) : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-bold tracking-[0.08em] uppercase text-brand-ink">Welcome to {orgName}</p>
        <h1 className="font-display text-[28px] md:text-[34px] leading-tight font-bold tracking-tight">{title}</h1>
        <div className="flex flex-col gap-2.5">
          {(message || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => (
            <p key={i} className="text-[16px] leading-relaxed text-ink-2">{l}</p>
          ))}
        </div>
        {from && <p className="font-sign text-[28px] leading-none text-ink mt-1">{from}</p>}
      </div>

      {video ? (
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-ink">
          <iframe src={video} title={`Welcome video${from ? ` from ${from}` : ''}`} className="absolute inset-0 w-full h-full" loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" />
        </div>
      ) : videoUrl ? (
        <a href={videoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-ink text-white px-4 py-3.5 no-underline">
          <span className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center"><Icon name="play" size={20} /></span>
          <span className="font-semibold">Watch the welcome video{from ? ` from ${from}` : ''}</span>
        </a>
      ) : null}

      <section className="bg-bg rounded-2xl overflow-hidden border border-line">
        <p className="px-4 pt-3 pb-1 text-xs font-bold tracking-[0.08em] uppercase text-muted">Set up for you</p>
        <DetailRow label="Your role" value={roleTitle || 'Not set yet'} muted={!roleTitle} />
        <DetailRow label="Department" value={deptName || 'Not set yet'} muted={!deptName} />
        <DetailRow label="Mentor" value={mentorName || 'Being matched'} muted={!mentorName} />
      </section>
      <p className="text-sm text-muted flex items-center gap-2"><Icon name="clock" size={16} />Setup takes about {minutes} minutes. You can stop and pick up where you left off.</p>
    </div>
  );
}

// ───────── profile ─────────

export interface ProfileValues { full: string; preferred: string; phone: string; tz: string }

export function timeZones(current: string) {
  let list: string[] = [];
  try { list = Intl.supportedValuesOf('timeZone'); } catch { list = []; }
  if (!list.length) list = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];
  if (current && !list.includes(current)) list = [current, ...list];
  return list;
}
export const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

export function ProfileStep({ value, onChange, error, email }: { value: ProfileValues; onChange: (v: ProfileValues) => void; error: string; email: string }) {
  const set = (k: keyof ProfileValues) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-6">
      <StepTitle title="Set up your profile" sub="This is how teammates see you in chat, on tasks and in training." />
      <div className="flex items-center gap-3.5">
        <Avatar name={value.preferred || value.full || email} size={56} />
        <div className="min-w-0">
          <span className="block font-semibold text-[16px] truncate">{value.preferred.trim() || value.full.trim() || 'Your name'}</span>
          <span className="block text-sm text-muted truncate">{email}</span>
        </div>
      </div>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
        <Field label="Full name" required error={error} className="md:col-span-2" hint="Your legal name, as it appears on your documents.">
          <Input value={value.full} onChange={set('full')} autoComplete="name" required aria-invalid={!!error} />
        </Field>
        <Field label="Preferred name" hint="What you’d like to be called. Leave blank to use your first name.">
          <Input value={value.preferred} onChange={set('preferred')} autoComplete="nickname" />
        </Field>
        <Field label="Mobile phone" hint="Optional. Only HR and your mentor can see it.">
          <Input value={value.phone} onChange={set('phone')} type="tel" inputMode="tel" autoComplete="tel" />
        </Field>
        <Field label="Time zone" className="md:col-span-2" hint="Due dates and times show in this time zone.">
          <Select value={value.tz} onChange={set('tz')}>
            {timeZones(value.tz).map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </Select>
        </Field>
      </form>
    </div>
  );
}

// ───────── practice ─────────

export function PracticeIntro({ doneAt, preview }: { doneAt: string | null; preview: boolean }) {
  const href = `/practice?return=${encodeURIComponent('/welcome')}${preview ? '&preview=1' : ''}`;
  return (
    <div className="flex flex-col gap-6">
      <StepTitle title="Practice the platform" sub="Try RAMP in a five-minute sandbox before you start for real. Nothing you do there is saved." />
      <div className="rounded-2xl bg-ink text-white p-5 flex flex-col gap-4">
        <p className="text-xs font-bold tracking-[0.08em] uppercase text-amber">Nine quick missions</p>
        <ul className="grid gap-2 sm:grid-cols-2 text-[15px] text-white/85">
          {['Open your training', 'Start a module', 'Create a task', 'Send it for review', 'Start a notebook page', 'Message your mentor', 'Find a resource', 'Read an announcement'].map((t) => (
            <li key={t} className="flex gap-2 items-start"><Icon name="check" size={16} className="mt-1 text-amber" />{t}</li>
          ))}
        </ul>
        <p className="text-sm text-white/70">Each mission shows you where to tap with a glowing outline. Exit any time.</p>
        <div>
          <LinkButton to={href} variant={doneAt ? 'secondary' : 'primary'} size="lg" icon={doneAt ? 'replay' : 'play'}>{doneAt ? 'Practice again' : 'Start practice'}</LinkButton>
        </div>
      </div>
      {doneAt ? (
        <Notice tone="good" icon="check">Done. You finished the practice on {fmtDate(doneAt)}.</Notice>
      ) : (
        <p className="text-sm text-muted">Short on time? Choose “Do it later”. Platform basics stays in your training, so you can do it whenever you’re ready.</p>
      )}
    </div>
  );
}

// ───────── documents ─────────

export function DocumentsStep({ docs, subs, loading, error, onRetry, onOpen, onView, preview }: {
  docs: Template[]; subs: Submission[]; loading: boolean; error: string | null; onRetry: () => void;
  onOpen: (t: Template) => void; onView: (t: Template, s: Submission) => void; preview: boolean;
}) {
  const done = docs.filter((t) => latestFor(t.id, subs)).length;
  return (
    <div className="flex flex-col gap-6">
      <StepTitle title="Your onboarding documents" sub="Fill out, upload or sign each one. Sensitive answers like bank details are encrypted, and only HR can see them." />
      {loading && !error && <Skeleton rows={3} />}
      {error && <ErrorBox error={error} onRetry={onRetry} />}
      {!loading && !error && docs.length === 0 && (
        <div className="rounded-2xl border border-line bg-bg">
          <EmptyState icon="fileText" title="Nothing to sign right now" body="Your admin hasn’t added any onboarding documents yet. If they add one later, it shows up on your Home screen." />
        </div>
      )}
      {!loading && !error && docs.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{done} of {docs.length} done</span>
            {done === docs.length && <Chip tone="good" icon="check">All done</Chip>}
          </div>
          <ul className="flex flex-col gap-3">
            {docs.map((t) => {
              const s = latestFor(t.id, subs);
              const items = (t.fields || []).filter((f) => f.type !== 'info').length;
              const secure = (t.fields || []).some((f) => f.type === 'secure' || f.secure);
              return (
                <li key={t.id} className={cx('rounded-2xl border bg-white p-4 flex flex-col gap-3', s ? 'border-line' : 'border-brand-2')}>
                  <div className="flex items-start gap-3">
                    <span className={cx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', s ? 'bg-good-soft text-good' : 'bg-brand-soft text-brand-ink')}>
                      <Icon name={s ? 'check' : t.kind === 'esign' ? 'pen' : t.kind === 'upload' ? 'upload' : 'fileText'} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[15px] leading-snug">{t.title}</p>
                      <p className="text-[13px] text-muted mt-0.5">
                        {KINDS[t.kind].label}{items ? ` · ${plural(items, 'item')}` : ''}{secure ? ' · Encrypted' : ''}
                        {s ? ` · Done ${fmtDate(s.created_at)}` : ''}
                      </p>
                    </div>
                    {s ? <Chip tone="good">Done</Chip> : <Chip>To do</Chip>}
                  </div>
                  {t.description && !s && <p className="text-sm text-ink-2 leading-relaxed">{t.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    {s ? (
                      <>
                        <Button size="sm" icon="eye" onClick={() => onView(t, s)}>View</Button>
                        <Button size="sm" variant="ghost" onClick={() => onOpen(t)}>Submit again</Button>
                      </>
                    ) : (
                      <Button variant="primary" icon={t.kind === 'esign' ? 'pen' : t.kind === 'upload' ? 'upload' : 'fileText'} onClick={() => onOpen(t)}>{KINDS[t.kind].action}</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {preview && done < docs.length && <p className="text-sm text-muted">In preview you can continue without submitting. New team members need to finish every document first.</p>}
        </>
      )}
    </div>
  );
}

// ───────── mentor ─────────

export function MentorStep({ mentor, hasMentor, loadingDir, chatOn }: { mentor: DirEntry | null; hasMentor: boolean; loadingDir: boolean; chatOn: boolean }) {
  const name = mentor ? (mentor.full_name.trim() || mentor.preferred_name.trim() || 'Your mentor') : '';
  return (
    <div className="flex flex-col gap-6">
      <StepTitle title="Meet your mentor" sub="You’re never training alone. Your mentor is your first stop for questions." />
      {hasMentor && loadingDir && !mentor && <Skeleton rows={1} />}
      {hasMentor && (mentor || !loadingDir) && (
        <div className="flex items-center gap-4 rounded-2xl bg-white border border-line p-4">
          <Avatar name={name || 'Mentor'} size={60} tone="amber" />
          <div className="min-w-0">
            <span className="block font-display text-xl font-bold leading-tight truncate">{name || 'Your mentor'}</span>
            <p className="text-sm text-muted mt-0.5">{[mentor?.job_title, mentor?.department].filter(Boolean).join(' · ') || 'Mentor'}</p>
          </div>
        </div>
      )}
      {!hasMentor && (
        <Notice tone="warn" icon="users">
          HR will match you with a mentor soon. You’ll see their name on your Home screen.
          {chatOn ? ' Until then, ask your questions in the #new-hires channel in Chat.' : ''}
        </Notice>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">What a mentor does</h2>
        <ul className="flex flex-col gap-2.5">
          {['Answers your questions while you learn', 'Reviews your assignments and leaves feedback', 'Can see the notebook pages you choose to share, and nothing else', 'Helps you get ready to graduate from training'].map((t) => (
            <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
              <span className="w-6 h-6 rounded-full bg-brand-soft text-brand-ink flex items-center justify-center shrink-0 mt-px"><Icon name="check" size={14} strokeWidth={2.4} /></span>{t}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ───────── done ─────────

export function DoneStep({ first, upcoming, loading, firstWeek, mode, mentorName, canDm, onDm, busy }: {
  first: string; upcoming: PlanItem[]; loading: boolean; firstWeek: number; mode: 'live' | 'preview' | 'revisit';
  mentorName: string | null; canDm: boolean; onDm: () => void; busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <span className="w-16 h-16 rounded-3xl bg-good-soft text-good flex items-center justify-center"><Icon name="check" size={32} strokeWidth={2.2} /></span>
      <StepTitle title={`You’re all set, ${first}`} sub={mode === 'revisit' ? 'You finished setup already. Here’s what’s next in your training.' : 'Here’s what’s coming up first. It’s all waiting on your Home screen.'} />
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold tracking-[0.08em] uppercase text-muted">First up in training</h2>
        {loading && <Skeleton rows={2} />}
        {!loading && upcoming.length === 0 && <p className="text-[15px] text-muted">No training assigned yet. Your admin will add it soon.</p>}
        {!loading && upcoming.length > 0 && (
          <ul className="rounded-2xl border border-line bg-white overflow-hidden">
            {upcoming.map((i) => (
              <li key={i.module.id} className="flex items-center gap-3 min-h-14 px-4 py-2.5 border-t border-line-2 first:border-t-0">
                <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name="book" size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug truncate">{i.module.title}</span>
                  <span className="block text-[13px] text-muted">{i.module.minutes} min{i.due ? ` · ${dueLabel(i.due)}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {firstWeek > 0 && mode !== 'revisit' && (
        <p className="flex gap-2.5 items-start text-[15px] text-ink-2"><Icon name="tasks" size={18} className="mt-0.5 text-brand-ink" />
          {plural(firstWeek, 'first-week item')} (like tool setup and company email) will be added to your tasks when you finish.</p>
      )}
      {mode === 'preview' && <Notice tone="dark" icon="eye">Finishing the preview takes you back home. It doesn’t change your account or add any tasks.</Notice>}
      {canDm && mentorName && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-bg border border-line p-4">
          <span className="text-[15px] text-ink-2 flex-1 min-w-48">Say hello to {mentorName} so they know you’re ready.</span>
          <Button icon="chat" onClick={onDm} loading={busy}>Message my mentor</Button>
        </div>
      )}
      {mode === 'revisit' && <p className="text-sm text-muted">Want to change your details? Go to <Link to="/me" className="font-semibold text-brand-ink">your profile</Link>.</p>}
    </div>
  );
}
