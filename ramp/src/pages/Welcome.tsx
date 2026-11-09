import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { invalidateDirectory, q, useAsync, useDirectory, useTitle } from '../lib/hooks';
import { SUBMISSION_COLS, appliesTo, latestFor, loadTrainingFor, onboardingDocs } from '../lib/plan';
import { cx, displayName, firstName, plural } from '../lib/util';
import type { Submission, Template } from '../lib/types';
import { FocusFrame } from '../shell/AppShell';
import { FormSheet } from '../components/FormSheet';
import { RecordView } from '../components/RecordView';
import { Button, Icon, Logo, Notice, useToast } from '../ui';
import { store, useOnReturn } from './parts/journey-common';
import {
  DocumentsStep, DoneStep, MentorStep, PracticeIntro, ProfileStep, STEP_LABEL, WelcomeStep, browserTz, flowSteps, type ProfileValues,
} from './parts/journey-welcome';

export default function Welcome() {
  useTitle('Welcome');
  const { isGuest } = useMe();
  if (isGuest) return <Navigate to="/" replace />;
  return <Flow />;
}

function Flow() {
  const { me, org, role, dept, rank, refresh, signOut } = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const dir = useDirectory();
  const preview = rank <= 2;
  const revisit = !preview && !!me.onboarded_at;
  const mode: 'live' | 'preview' | 'revisit' = preview ? 'preview' : revisit ? 'revisit' : 'live';
  const chatOn = !!(org.flags || { chat: true }).chat;

  const steps = useMemo(() => flowSteps(org.flow), [org.flow]);
  const key = `ramp-welcome-step:${me.id}`;
  const [idx, setIdx] = useState(() => {
    const saved = store.get<string | null>(key, null);
    const i = saved ? steps.indexOf(saved as (typeof steps)[number]) : -1;
    return i >= 0 ? i : 0;
  });
  const at = Math.min(idx, steps.length - 1);
  const id = steps[at]!;
  const isLast = at === steps.length - 1;
  useEffect(() => { store.set(key, id); }, [key, id]);

  // Coming back from the practice sandbox (or another tab) can change practice_done_at.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => { refreshRef.current().catch(() => {}); }, []);
  const onPractice = useRef(false);
  onPractice.current = id === 'practice';
  useOnReturn(() => { if (onPractice.current) refreshRef.current().catch(() => {}); });

  const docs = useAsync(async () => {
    const [templates, subs] = await Promise.all([
      q<Template[]>(supabase.from('ramp_templates').select('*').eq('status', 'published').order('sort')),
      q<Submission[]>(supabase.from('ramp_submissions').select(SUBMISSION_COLS).eq('member_id', me.id).order('created_at', { ascending: false })),
    ]);
    return { templates, subs };
  }, [me.id]);
  const training = useAsync(() => loadTrainingFor(me), [me.id]);

  const onboarding = docs.data ? onboardingDocs(me, docs.data.templates).sort((a, b) => a.sort - b.sort) : [];
  const subs = docs.data?.subs || [];
  const left = onboarding.filter((t) => !latestFor(t.id, subs)).length;
  const firstWeek = docs.data ? docs.data.templates.filter((t) => t.stage === 'first_week' && appliesTo(t, me)).length : 0;
  const upcoming = (training.data?.plan || []).filter((i) => i.kind !== 'optional' && i.status !== 'completed').slice(0, 3);

  const mentor = dir.byId(me.mentor_id);
  const mentorName = mentor ? (mentor.full_name.trim() || displayName(mentor)) : null;
  const first = firstName(me);

  const [profile, setProfile] = useState<ProfileValues>(() => ({
    full: me.full_name, preferred: me.preferred_name, phone: me.phone, tz: me.timezone || browserTz(),
  }));
  const [profileErr, setProfileErr] = useState('');
  const [busy, setBusy] = useState<'' | 'next' | 'finish' | 'dm'>('');
  const [form, setForm] = useState<Template | null>(null);
  const [record, setRecord] = useState<{ t: Template; s: Submission } | null>(null);

  function go(i: number) {
    setIdx(Math.max(0, Math.min(steps.length - 1, i)));
    window.scrollTo({ top: 0 });
  }

  async function saveProfile() {
    const full = profile.full.trim();
    if (!full) { setProfileErr('Enter your full name.'); return false; }
    setProfileErr('');
    const v = { full, preferred: profile.preferred.trim(), phone: profile.phone.trim(), tz: profile.tz };
    if (v.full === me.full_name && v.preferred === me.preferred_name && v.phone === me.phone && v.tz === me.timezone) return true;
    setBusy('next');
    try {
      await q(supabase.rpc('ramp_update_profile', { p_full_name: v.full, p_preferred: v.preferred, p_phone: v.phone, p_timezone: v.tz }));
      invalidateDirectory();
      await refresh();
      toast('Profile saved');
      return true;
    } catch (e) {
      toast(errText(e), 'bad');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function finish(dm: boolean) {
    if (mode !== 'live') {
      if (mode === 'preview') toast('Preview finished. Nothing changed for your account.');
      if (dm && me.mentor_id && chatOn) {
        try { const ch = await q<string>(supabase.rpc('ramp_dm', { p_other: me.mentor_id })); navigate(`/chat/${ch}`); return; }
        catch (e) { toast(errText(e), 'bad'); }
      }
      navigate('/');
      return;
    }
    // A saved resume point can be past the documents step; documents still have to be done first.
    if (steps.includes('documents') && docs.data && left > 0) {
      toast(`Finish your onboarding documents first. ${plural(left, 'document')} left.`, 'bad');
      go(steps.indexOf('documents'));
      return;
    }
    setBusy(dm ? 'dm' : 'finish');
    try {
      const n = await q<number>(supabase.rpc('ramp_finish_onboarding'));
      store.del(key);
      toast(n > 0 ? `Welcome aboard. ${plural(n, 'first-week task')} ${n === 1 ? 'was' : 'were'} added to your list.` : 'Welcome aboard. You’re all set.');
      await refresh();
      if (dm && me.mentor_id) {
        try {
          const ch = await q<string>(supabase.rpc('ramp_dm', { p_other: me.mentor_id }));
          navigate(`/chat/${ch}`);
          return;
        } catch (e) {
          toast(`Couldn’t open the chat: ${errText(e)}`, 'bad');
        }
      }
      navigate('/');
    } catch (e) {
      toast(errText(e), 'bad');
      setBusy('');
    }
  }

  async function next() {
    if (id === 'profile' && !(await saveProfile())) return;
    if (isLast) { await finish(false); return; }
    go(at + 1);
  }

  const docsBlocked = id === 'documents' && mode === 'live' && (!docs.data || left > 0);
  const nextLabel = isLast
    ? (mode === 'preview' ? 'Finish preview' : mode === 'revisit' ? 'Back to home' : 'Go to my dashboard')
    : id === 'welcome' ? 'Let’s get started'
    : id === 'profile' ? 'Save and continue'
    : id === 'practice' ? (me.practice_done_at ? 'Continue' : 'Do it later')
    : 'Continue';
  const hint = docsBlocked && docs.data ? `${left} left` : '';
  const rough = 3 + (steps.includes('practice') ? 5 : 0) + (steps.includes('documents') ? Math.max(2, onboarding.length * 2) : 0);
  const minutes = Math.max(5, Math.round(rough / 5) * 5);

  return (
    <FocusFrame>
      <div className="min-h-dvh flex flex-col">
        <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-line">
          <div className="max-w-2xl mx-auto h-14 px-4 flex items-center gap-2.5">
            <Logo size={28} />
            <span className="font-display font-bold tracking-[0.08em]">RAMP</span>
            <span className="text-xs text-muted truncate hidden sm:inline">{org.name}</span>
            {preview && <span className="rounded-full bg-amber text-ink text-[10px] font-extrabold tracking-[0.08em] px-2 py-0.5">PREVIEW</span>}
            <span className="flex-1" />
            {mode === 'live' ? (
              <Button size="sm" variant="ghost" icon="logout" onClick={signOut}>Sign out</Button>
            ) : (
              <Link to="/" className="inline-flex items-center gap-1.5 min-h-11 px-2 text-sm font-semibold text-brand-ink no-underline">
                {mode === 'preview' ? <><Icon name="x" size={18} />Exit preview</> : <><Icon name="home" size={18} />Back to home</>}
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 w-full max-w-2xl mx-auto px-4 pt-5 md:pt-8 flex flex-col">
          {preview && (
            <Notice tone="dark" icon="eye" className="mb-5">
              This is what new team members see the first time they sign in. Nothing you do here finishes setup for anyone.
            </Notice>
          )}
          {mode === 'revisit' && (
            <Notice tone="good" icon="check" className="mb-5">
              You’ve already finished setup. Look back through it any time, or <Link to="/" className="font-semibold underline">go back to home</Link>.
            </Notice>
          )}

          {/* Stepper */}
          <nav aria-label="Setup progress" className="mb-6">
            <ol className="flex gap-1.5">
              {steps.map((s, i) => {
                const past = i < at;
                return (
                  <li key={s} className="flex-1 min-w-0">
                    <button type="button" disabled={!past} onClick={() => go(i)} aria-current={i === at ? 'step' : undefined}
                      aria-label={`${STEP_LABEL[s]}${past ? ', done. Go back to this step' : i === at ? ', current step' : ''}`}
                      className={cx('w-full flex flex-col gap-1.5 pt-2 pb-1 text-left', past ? 'cursor-pointer' : 'cursor-default')}>
                      <span className={cx('block h-1.5 rounded-full transition-colors', past ? 'bg-brand' : i === at ? 'bg-amber' : 'bg-line')} />
                      <span className={cx('hidden md:block text-xs truncate', i === at ? 'font-bold text-ink' : 'font-medium text-muted')}>{STEP_LABEL[s]}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="text-sm text-muted mt-1.5 md:hidden" aria-hidden="true">Step {at + 1} of {steps.length} · {STEP_LABEL[id]}</p>
            <p className="sr-only" aria-live="polite">Step {at + 1} of {steps.length}: {STEP_LABEL[id]}</p>
          </nav>

          <section key={id} className="rise bg-card border border-line rounded-3xl p-5 md:p-8 mb-5 md:mb-0">
            {id === 'welcome' && (
              <WelcomeStep first={first} orgName={org.name} headline={org.welcome_headline} message={org.welcome_message} from={org.welcome_from}
                videoUrl={org.welcome_video_url} roleTitle={role?.title || null} deptName={dept?.name || null}
                mentorName={mentorName || (me.mentor_id && !dir.list.length ? '…' : null)} minutes={minutes} />
            )}
            {id === 'profile' && <ProfileStep value={profile} onChange={(v) => { setProfile(v); if (profileErr && v.full.trim()) setProfileErr(''); }} error={profileErr} email={me.email} />}
            {id === 'practice' && <PracticeIntro doneAt={me.practice_done_at} preview={preview} />}
            {id === 'documents' && (
              <DocumentsStep docs={onboarding} subs={subs} loading={docs.loading && !docs.data} error={docs.data ? null : docs.error}
                onRetry={docs.reload} onOpen={setForm} onView={(t, s) => setRecord({ t, s })} preview={preview} />
            )}
            {id === 'mentor' && <MentorStep mentor={mentor} hasMentor={!!me.mentor_id} loadingDir={!dir.list.length} chatOn={chatOn} />}
            {id === 'done' && (
              <DoneStep first={first} upcoming={upcoming} loading={training.loading && !training.data} firstWeek={firstWeek} mode={mode}
                mentorName={mentorName} canDm={chatOn && !!me.mentor_id && mode !== 'preview'} onDm={() => finish(true)} busy={busy === 'dm'} />
            )}
          </section>

          {/* Back / Next: sticky on phones so it stays under the thumb */}
          <div className="sticky bottom-0 z-20 mt-auto -mx-4 md:static md:mx-0 md:mt-6 md:mb-12">
            <div className="flex items-center gap-3 bg-white border-t border-line px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:bg-transparent md:border-0 md:p-0">
              {at > 0 && <Button onClick={() => go(at - 1)} icon="chevronLeft" disabled={!!busy}>Back</Button>}
              <span className="flex-1 min-w-0 text-[13px] text-muted truncate" aria-live="polite">{hint}</span>
              <Button variant={isLast && mode === 'live' ? 'success' : id === 'practice' && !me.practice_done_at ? 'secondary' : 'primary'}
                size="lg" onClick={next} disabled={docsBlocked || (!!busy && busy !== 'next' && busy !== 'finish')} loading={busy === 'next' || busy === 'finish'}
                iconRight={isLast ? undefined : 'chevronRight'}>
                {nextLabel}
              </Button>
            </div>
          </div>
        </main>
      </div>

      <FormSheet template={form} open={!!form} onClose={() => setForm(null)} onDone={() => docs.reload()} />
      <RecordView submission={record?.s || null} template={record?.t} open={!!record} onClose={() => setRecord(null)} tz={me.timezone || undefined} />
    </FocusFrame>
  );
}
