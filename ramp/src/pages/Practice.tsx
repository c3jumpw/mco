import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { q, useDirectory, useIsMobile, useTitle } from '../lib/hooks';
import { cx, displayName, firstName } from '../lib/util';
import { FocusFrame } from '../shell/AppShell';
import { Button, ErrorBox, Icon, Logo, Spinner } from '../ui';
import { safeReturn } from './parts/journey-common';
import { MISSIONS, SimApp, initSim, simReducer, type SimAction, type SimCtx, type SimState } from './parts/journey-sim';

type Act = SimAction | { t: 'reset' };
const reducer = (s: SimState, a: Act) => (a.t === 'reset' ? initSim() : simReducer(s, a));

function returnLabel(path: string) {
  if (path.startsWith('/welcome')) return 'Back to setup';
  if (path.startsWith('/training')) return 'Back to training';
  if (path === '/') return 'Go to home';
  return 'Continue';
}

export default function Practice() {
  useTitle('Practice');
  const { me, org, refresh } = useMe();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const dir = useDirectory();
  const ret = safeReturn(sp.get('return'));
  const preview = sp.get('preview') === '1';

  const mentor = dir.byId(me.mentor_id);
  const ctx: SimCtx = {
    first: firstName(me),
    mentor: mentor ? displayName(mentor) : 'Sam Okafor',
    mentorFirst: mentor ? firstName(mentor) : 'Sam',
    org: org.name,
  };

  const [s, dispatch] = useReducer(reducer, undefined, initSim);
  const [mi, setMi] = useState(0);
  const [fb, setFb] = useState<string | null>(null);
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);
  const finishing = useRef(false);

  const done = mi >= MISSIONS.length;
  const mission = done ? null : MISSIONS[mi]!;
  const target = mission ? mission.target(s, mobile) : '';

  // Missions are checked against the sandbox state, so exploring ahead still counts.
  useEffect(() => {
    let i = mi;
    while (i < MISSIONS.length && MISSIONS[i]!.done(s)) i++;
    if (i !== mi) { setFb(MISSIONS[i - 1]!.ok); setMi(i); }
  }, [s, mi]);

  useEffect(() => {
    if (!fb) return;
    const t = setTimeout(() => setFb(null), 5000);
    return () => clearTimeout(t);
  }, [fb]);

  // The mentor "replies" a moment after the hello.
  useEffect(() => {
    if (!s.sent || s.reply) return;
    const t = setTimeout(() => dispatch({ t: 'reply' }), 1200);
    return () => clearTimeout(t);
  }, [s.sent, s.reply]);

  // Keep the glowing spot on screen.
  useEffect(() => {
    if (!target) return;
    const el = frameRef.current?.querySelector<HTMLElement>(`[data-sim="${target}"]`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [target, s.view]);

  const complete = useCallback(async () => {
    if (preview) { setSave('saved'); return; }
    setSave('saving');
    setErr('');
    try {
      await q(supabase.rpc('ramp_mark_practice_done'));
      await refresh();
      setSave('saved');
    } catch (e) {
      setErr(errText(e));
      setSave('error');
    }
  }, [preview, refresh]);

  useEffect(() => {
    if (!done || finishing.current) return;
    finishing.current = true;
    complete();
  }, [done, complete]);

  function replay() {
    dispatch({ t: 'reset' });
    setMi(0);
    setFb(null);
    finishing.current = false;
    setSave('idle');
  }

  const doneCount = Math.min(mi, MISSIONS.length);

  return (
    <FocusFrame>
      <div className="h-dvh flex flex-col">
        <header className="shrink-0 h-14 flex items-center gap-3 pl-4 pr-2 md:px-5 bg-white border-b border-line">
          <Logo size={28} />
          <div className="min-w-0 flex-1 leading-tight">
            <span className="block font-display font-semibold text-[15px] truncate">Platform practice</span>
            <span className="block text-xs text-muted truncate">{preview ? 'Preview. Nothing is saved.' : 'A safe sandbox. Nothing you do here is saved.'}</span>
          </div>
          <Button variant="ghost" icon="x" onClick={() => navigate(ret)} aria-label="Exit practice">Exit</Button>
        </header>

        {done ? (
          <main className="flex-1 overflow-y-auto flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-md flex flex-col items-center text-center gap-4 rise" role="status">
              <span className="w-20 h-20 rounded-3xl bg-good-soft text-good flex items-center justify-center"><Icon name="check" size={38} strokeWidth={2.2} /></span>
              <div>
                <h1 className="font-display text-[28px] leading-tight font-bold">Platform basics complete</h1>
                <p className="text-[16px] text-muted mt-2 leading-relaxed">
                  Nice work, {ctx.first}. You found Training, Tasks, your notebook, Chat and Resources.
                  {save === 'saved' && !preview && ' It’s marked complete in your training.'}
                </p>
              </div>
              {save === 'saving' && <p className="flex items-center gap-2 text-sm text-muted"><Spinner size={16} />Saving your progress…</p>}
              {save === 'error' && <div className="w-full text-left"><ErrorBox error={`Your progress wasn’t saved. ${err}`} onRetry={complete} /></div>}
              <div className="flex flex-col gap-2.5 w-full mt-2">
                <Button variant="primary" size="lg" iconRight="chevronRight" disabled={save === 'saving'} onClick={() => navigate(ret)}>{returnLabel(ret)}</Button>
                <Button size="lg" icon="replay" onClick={replay}>Practice again</Button>
              </div>
              <p className="text-[13px] text-muted">You can replay this any time from More.</p>
            </div>
          </main>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-[320px_minmax(0,1fr)] md:gap-5 md:p-5">
            <aside className="shrink-0 p-3 md:p-0 flex flex-col gap-4 md:overflow-y-auto">
              <section aria-live="polite" className="rounded-2xl bg-ink text-white p-3.5 md:p-5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-[0.08em] uppercase text-amber">Mission {mi + 1} of {MISSIONS.length}</span>
                  <span className="text-xs text-white/70">{doneCount} done</span>
                </div>
                <div role="img" aria-label={`${doneCount} of ${MISSIONS.length} missions done`} className="flex gap-1.5">
                  {MISSIONS.map((m, i) => (
                    <span key={m.id} className={cx('h-1.5 flex-1 rounded-full transition-colors', i < mi ? 'bg-amber' : i === mi ? 'bg-white' : 'bg-white/20')} />
                  ))}
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="font-display text-[18px] font-bold leading-snug">{mission!.title}</p>
                  <p className="text-sm leading-relaxed text-white/80">{mission!.hint(s, mobile, ctx)} <span className="text-amber">Look for the glowing outline.</span></p>
                </div>
                {fb && (
                  <p className="flex items-start gap-2 rounded-xl bg-good-soft text-good px-3 py-2 text-sm font-semibold leading-snug">
                    <Icon name="check" size={16} strokeWidth={2.4} className="mt-0.5" />{fb}
                  </p>
                )}
              </section>
              {!mobile && (
                <ol className="bg-card border border-line rounded-2xl p-2 flex flex-col" aria-label="Missions">
                  {MISSIONS.map((m, i) => (
                    <li key={m.id} className={cx('flex items-center gap-3 min-h-10 px-2.5 rounded-xl text-sm', i === mi && 'bg-brand-soft font-semibold text-brand-ink', i < mi && 'text-muted')}>
                      <span className={cx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        i < mi ? 'bg-good-soft text-good' : i === mi ? 'bg-brand text-white' : 'bg-chip text-ink-2')}>
                        {i < mi ? <Icon name="check" size={13} strokeWidth={2.6} /> : i + 1}
                      </span>
                      <span className={cx(i < mi && 'line-through decoration-line')}>{m.title}</span>
                      {i < mi && <span className="sr-only">(done)</span>}
                    </li>
                  ))}
                </ol>
              )}
              {!mobile && <p className="text-[13px] text-muted px-1 leading-relaxed">This is a practice copy of RAMP with sample content. Tap around as much as you like: nothing here changes your real tasks, notes or messages.</p>}
            </aside>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-bg md:border md:border-line md:rounded-2xl md:shadow-sm">
              <div aria-hidden="true" className="h-1 shrink-0 bg-amber" />
              <div ref={frameRef} className="flex-1 min-h-0">
                <SimApp s={s} act={dispatch} target={target} mobile={mobile} ctx={ctx} />
              </div>
            </div>
          </div>
        )}
      </div>
    </FocusFrame>
  );
}
