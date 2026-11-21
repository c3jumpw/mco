// Demo accounts: sign in as a sample person of each kind (built by the ramp-demo edge function) to test features.
// Opening one keeps your own sign-in on this device, so "Back to my account" returns you without signing in again.
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { errText, supabase } from './supabase';
import { cx } from './util';
import { Button, Icon, Sheet, Spinner } from '../ui';

export type PersonaKey = 'owner' | 'admin' | 'lead' | 'mentor' | 'employee' | 'trainee' | 'guest' | 'va' | 'client';
export interface DemoPersona { k: PersonaKey; name: string; level: string; email: string; ready: boolean }
export interface DemoStatus { built_at: string | null; workspace: { id: string; name: string } | null; personas: DemoPersona[] }

/** What each demo person is for. */
export const PERSONA_INFO: Record<PersonaKey, { role: string; tests: string; icon: string }> = {
  owner: { role: 'Owner', tests: 'Everything, including account, billing and system settings.', icon: 'key' },
  admin: { role: 'Admin', tests: 'People, training builder, RAMP Assistant, metrics and the agency.', icon: 'shield' },
  lead: { role: 'Department lead', tests: 'Their department on My team, reviews and the team calendar.', icon: 'building' },
  mentor: { role: 'Training supervisor', tests: 'Supervises Tara and Val: reviews, reminders, coaching and the calendar.', icon: 'target' },
  employee: { role: 'Employee', tests: 'A graduated team member: continued training, tasks, notebook and chat.', icon: 'users' },
  trainee: { role: 'Trainee (day 3)', tests: 'A new hire: the welcome flow, onboarding training and first tasks.', icon: 'book' },
  guest: { role: 'Guest', tests: 'A contractor with time-limited access to guest modules and resources.', icon: 'eye' },
  va: { role: 'Placed team member', tests: 'Placed with Brightside Bakery: My work, hours and client training.', icon: 'clock' },
  client: { role: 'Client contact', tests: 'Brightside Bakery’s view: their team member, hours and invoices.', icon: 'building' },
};

const RETURN_KEY = 'ramp-demo-return';
interface Stash { access_token: string; refresh_token: string; email: string; path: string }

export const isDemoUser = (u: User | null | undefined) => u?.app_metadata?.ramp_demo === true;

export async function demoCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ramp-demo', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const j = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) as { error?: string } | null : null;
    throw new Error(j?.error || errText(error));
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Sign in as a demo person. Your own sign-in is kept on this device for "Back to my account". */
export async function openDemo(persona: PersonaKey) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await demoCall<{ token_hash: string }>({ action: 'signin', persona });
  if (session && !isDemoUser(session.user)) {
    const stash: Stash = { access_token: session.access_token, refresh_token: session.refresh_token, email: session.user.email || '', path: window.location.pathname };
    try { localStorage.setItem(RETURN_KEY, JSON.stringify(stash)); } catch { /* private mode: they sign in again */ }
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: 'magiclink' });
  if (error) throw error;
  sessionStorage.removeItem('ramp-reloaded');
  window.location.assign('/');
}

function readStash(): Stash | null {
  try { return JSON.parse(localStorage.getItem(RETURN_KEY) || 'null') as Stash | null; } catch { return null; }
}

/** Leave the demo: back to the sign-in you opened it from, or signed out if that's gone. */
export async function leaveDemo() {
  const stash = readStash();
  try { localStorage.removeItem(RETURN_KEY); } catch { /* ignore */ }
  if (stash) {
    const { error } = await supabase.auth.setSession({ access_token: stash.access_token, refresh_token: stash.refresh_token });
    if (!error) { window.location.assign(stash.path || '/'); return; }
  }
  await supabase.auth.signOut();
  window.location.assign('/');
}

/** A bar shown while signed in as a demo person: who you are, switch person, and back to your account. */
export function DemoBar() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (!isDemoUser(user)) return null;
  const k = user!.app_metadata?.ramp_demo_persona as PersonaKey | undefined;
  const name = (user!.user_metadata?.full_name as string) || 'a demo person';
  const info = k ? PERSONA_INFO[k] : null;
  return (
    <>
      <div role="status" className="fixed z-40 left-1/2 -translate-x-1/2 bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-5 max-w-[calc(100vw-24px)]
        flex items-center gap-1 pl-3.5 pr-1.5 py-1.5 rounded-full bg-ink text-white shadow-xl text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-bold text-amber shrink-0"><Icon name="eye" size={15} strokeWidth={2.2} />Demo</span>
        <span className="truncate mx-1.5 min-w-0"><span className="font-semibold">{name}</span>{info && <span className="hidden sm:inline text-white/70"> · {info.role}</span>}</span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 min-h-9 px-3 rounded-full font-semibold hover:bg-white/10 cursor-pointer">Switch</button>
        <button type="button" onClick={() => { void leaveDemo(); }} className="shrink-0 min-h-9 px-3 rounded-full font-semibold bg-white text-ink hover:bg-white/90 cursor-pointer">Exit</button>
      </div>
      <PersonaSheet open={open} onClose={() => setOpen(false)} current={k} />
    </>
  );
}

function PersonaSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current?: PersonaKey }) {
  const [list, setList] = useState<DemoPersona[] | null>(null);
  const [busy, setBusy] = useState<PersonaKey | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || list) return;
    demoCall<DemoStatus>({ action: 'status' }).then((s) => setList(s.personas)).catch((e) => setError(errText(e)));
  }, [open, list]);
  async function go(p: PersonaKey) {
    setBusy(p); setError('');
    try { await openDemo(p); } catch (e) { setError(errText(e)); setBusy(null); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Switch demo person" subtitle="Each one sees RAMP as that kind of user would. Changes you make stay in the demo company.">
      {!list && !error && <div className="flex justify-center py-6"><Spinner /></div>}
      {error && <p className="text-sm text-bad">{error}</p>}
      {list && <PersonaList personas={list} current={current} busy={busy} onPick={go} />}
      <Button onClick={() => { void leaveDemo(); }} icon="logout">Back to my account</Button>
    </Sheet>
  );
}

export function PersonaList({ personas, current, busy, onPick }: {
  personas: DemoPersona[]; current?: PersonaKey; busy: PersonaKey | null; onPick: (k: PersonaKey) => void;
}) {
  return (
    <ul className="grid sm:grid-cols-2 gap-2">
      {personas.map((p) => {
        const info = PERSONA_INFO[p.k];
        const here = p.k === current;
        return (
          <li key={p.k}>
            <button type="button" disabled={!p.ready || here || !!busy} onClick={() => onPick(p.k)}
              className={cx('w-full h-full text-left flex items-start gap-3 p-3 rounded-2xl border cursor-pointer disabled:cursor-default',
                here ? 'border-brand bg-brand-soft' : 'border-line hover:border-[#C9CED6] hover:bg-bg', !p.ready && 'opacity-60')}>
              <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0">
                {busy === p.k ? <Spinner size={16} /> : <Icon name={info.icon} size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-[15px]">{p.name}{here && <span className="text-brand-ink"> · you</span>}</span>
                <span className="block text-[12px] font-bold uppercase tracking-[0.05em] text-muted">{info.role}</span>
                <span className="block text-[13px] text-muted leading-snug mt-0.5">{p.ready ? info.tests : 'Not built yet'}</span>
              </span>
              {p.ready && !here && <Icon name="chevronRight" size={18} className="ml-auto self-center shrink-0 text-muted" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
