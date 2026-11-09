import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase, errText } from '../lib/supabase';
import { useSession } from '../lib/session';
import { useTitle } from '../lib/hooks';
import { Button, Field, Icon, Input, Logo, Notice, Segmented, Textarea } from '../ui';

function useBrandName() {
  const [name, setName] = useState('');
  useEffect(() => {
    supabase.rpc('ramp_public_brand').then(({ data }) => setName((data as { name?: string } | null)?.name || ''));
  }, []);
  return name;
}

export function AuthFrame({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: ReactNode }) {
  const org = useBrandName();
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-10 bg-bg">
      <div className="w-full max-w-[420px] flex flex-col gap-6 rise">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div className="leading-tight">
            <p className="font-display font-bold tracking-[0.08em] text-lg">RAMP</p>
            <p className="text-[13px] text-muted">{org ? `${org} · training and onboarding` : 'Training and onboarding'}</p>
          </div>
        </div>
        <section className="bg-card border border-line rounded-3xl p-6 flex flex-col gap-5 shadow-[0_1px_2px_rgba(17,24,39,.04)]">
          <div>
            <h1 className="font-display text-[26px] font-bold leading-tight">{title}</h1>
            {subtitle && <p className="text-[15px] text-muted mt-1.5 leading-relaxed">{subtitle}</p>}
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

type Mode = 'signin' | 'signup' | 'forgot';

export default function Login() {
  useTitle('Sign in');
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(window.location.search).get('join') ? 'signup' : 'signin'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<'' | 'confirm' | 'reset'>('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) { setError('Enter your email address.'); return; }
    if (mode !== 'forgot' && password.length < (mode === 'signup' ? 8 : 1)) {
      setError(mode === 'signup' ? 'Use at least 8 characters for your password.' : 'Enter your password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: em, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setSent('confirm');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setSent('reset');
      }
    } catch (err) {
      const m = (err as { message?: string }).message || '';
      if (/invalid login credentials/i.test(m)) setError('That email and password don’t match. Check them, or reset your password.');
      else if (/email not confirmed/i.test(m)) setError('Confirm your email first. Check your inbox for the link we sent.');
      else if (/already registered|already exists/i.test(m)) { setError('You already have a login. Sign in instead.'); setMode('signin'); }
      else if (/rate limit|too many/i.test(m)) setError('Too many attempts. Wait a minute and try again.');
      else setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthFrame title="Check your email" subtitle={sent === 'confirm'
        ? <>We sent a confirmation link to <strong className="text-ink">{email}</strong>. Open it on this device to finish creating your login.</>
        : <>If <strong className="text-ink">{email}</strong> has a RAMP login, a link to choose a new password is on its way.</>}>
        <Notice icon="mail">The email can take a minute. Check spam or promotions if you don’t see it.</Notice>
        <Button onClick={() => { setSent(''); setMode('signin'); }} size="lg">Back to sign in</Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title={mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your login' : 'Reset your password'}
      subtitle={mode === 'signin' ? 'Sign in to pick up where you left off.'
        : mode === 'signup' ? 'Invited to the team? Use the email address your invitation went to.'
        : 'We’ll email you a link to choose a new password.'}>
      {mode !== 'forgot' && (
        <Segmented label="Sign in or create a login" value={mode} onChange={(v) => { setMode(v); setError(''); }}
          options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'New here' }]} />
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Work or personal email">
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
        </Field>
        {mode !== 'forgot' && (
          <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters. Use one you don’t use anywhere else.' : undefined}>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password}
                onChange={(e) => setPassword(e.target.value)} className="pr-12" />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-muted cursor-pointer">
                <Icon name={showPw ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </Field>
        )}
        {error && <Notice tone="bad" icon="alert">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create login' : 'Send reset link'}
        </Button>
      </form>
      <div className="flex justify-center">
        {mode === 'signin' && <button type="button" className="min-h-11 px-2 text-sm font-semibold text-brand-ink cursor-pointer" onClick={() => { setMode('forgot'); setError(''); }}>Forgot your password?</button>}
        {mode === 'forgot' && <button type="button" className="min-h-11 px-2 text-sm font-semibold text-brand-ink cursor-pointer" onClick={() => { setMode('signin'); setError(''); }}>Back to sign in</button>}
      </div>
    </AuthFrame>
  );
}

export function ResetPassword() {
  useTitle('New password');
  const { finishRecovery, signOut } = useSession();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setError('Use at least 8 characters.'); return; }
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(errText(error));
    else await finishRecovery();
  }
  return (
    <AuthFrame title="Choose a new password" subtitle="You’ll use it the next time you sign in.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="New password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        {error && <Notice tone="bad" icon="alert">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" loading={busy}>Save and continue</Button>
        <Button variant="ghost" onClick={signOut}>Cancel</Button>
      </form>
    </AuthFrame>
  );
}

export function NoAccess({ email, requested }: { email: string; requested: boolean }) {
  useTitle('Request access');
  const { signOut } = useSession();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState(requested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Add your name so HR knows who you are.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('ramp_request_access', { p_name: name.trim(), p_note: note.trim() });
    setBusy(false);
    if (error) setError(errText(error));
    else setDone(true);
  }
  if (done) {
    return (
      <AuthFrame title="Request sent" subtitle={<>HR will see your request for <strong className="text-ink">{email}</strong>. Once you’re invited, sign in again and RAMP will open.</>}>
        <Notice tone="good" icon="check">You don’t need to do anything else right now.</Notice>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="primary" onClick={() => window.location.reload()} icon="refresh">Check again</Button>
          <Button onClick={signOut} icon="logout">Sign out</Button>
        </div>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="You’re not on the team list yet" subtitle={<>No invitation matches <strong className="text-ink">{email}</strong>. If HR invited you at another address, sign out and use that one. Otherwise, ask for access below.</>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Your full name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="Note for HR" hint="Optional. For example, the role you applied for or your start date."><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <Notice tone="bad" icon="alert">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" loading={busy}>Request access</Button>
        <Button variant="ghost" onClick={signOut} icon="logout">Use a different email</Button>
      </form>
    </AuthFrame>
  );
}

export function Blocked({ kind, email }: { kind: 'inactive' | 'expired'; email: string }) {
  const { signOut } = useSession();
  return (
    <AuthFrame title={kind === 'inactive' ? 'Your access is paused' : 'Your guest access has ended'}
      subtitle={kind === 'inactive'
        ? <>The account for <strong className="text-ink">{email}</strong> is turned off. If you think that’s a mistake, contact HR.</>
        : <>Guest access for <strong className="text-ink">{email}</strong> was time-limited and has now ended. Ask your contact at the company to extend it.</>}>
      <Button onClick={signOut} size="lg" icon="logout">Sign out</Button>
    </AuthFrame>
  );
}

export function LoadError({ message }: { message: string }) {
  const { signOut } = useSession();
  return (
    <AuthFrame title="RAMP couldn’t load" subtitle="Check your connection and try again.">
      <Notice tone="bad" icon="alert">{message}</Notice>
      <div className="flex flex-wrap gap-2.5">
        <Button variant="primary" onClick={() => window.location.reload()} icon="refresh">Try again</Button>
        <Button onClick={signOut} icon="logout">Sign out</Button>
      </div>
    </AuthFrame>
  );
}
