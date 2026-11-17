import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { errText, supabase } from '../lib/supabase';
import { q, useAsync, useAutosave, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { cx, fmtDate, plural, todayISO } from '../lib/util';
import type { LaunchGet } from '../lib/types';
import { Button, Card, Chip, EmptyState, ErrorBox, Icon, LinkButton, Notice, PageHeader, Skeleton, Spinner, useConfirm, useToast } from '../ui';
import { Prepare } from './parts/prepare';
import { Day1 } from './parts/day1';
import { PlanDocument } from './parts/document';
import {
  PLAN_STATUS, SECTION_IDS, STEP_IDS, localTz, readiness, templateAgenda, toDraft, validTz,
  type Data, type Draft, type LaunchSection, type Role, type StepId,
} from './parts/model';

type Tab = 'prepare' | 'day1' | 'plan';
const TABS: Record<Tab, { label: string; icon: string }> = {
  prepare: { label: 'Prepare', icon: 'pen' },
  day1: { label: 'Day 1', icon: 'clock' },
  plan: { label: 'The plan', icon: 'fileText' },
};

async function loadLaunch(id: string) {
  const get = () => q<LaunchGet>(supabase.rpc('ramp_launch_get', { p_placement: id }));
  try {
    return await get();
  } catch (e) {
    // Two first opens at once can both try to create the plan; the loser only needs to read it.
    if (/duplicate key|already exists/i.test((e as { message?: string })?.message || '')) return get();
    throw e;
  }
}

function backFor(role: Role, id: string) {
  switch (role) {
    case 'client': return { to: '/client', label: 'Overview' };
    case 'va': return { to: '/work', label: 'My work' };
    case 'coach': return { to: `/coaching/${id}`, label: 'Coaching' };
    default: return { to: `/admin/placements/${id}`, label: 'Placement' };
  }
}

export default function Launch() {
  const { id = '' } = useParams();
  const { isClient, roles } = useMe();
  const { data, error, reload } = useAsync(() => loadLaunch(id), [id]);
  useTitle(data ? (data.role === 'va' ? 'Your launch plan' : `Launch plan for ${data.placement.va.name || 'assistant'}`) : 'Launch plan');

  if (error) {
    const back = isClient ? { to: '/client', label: 'Overview' } : roles.work ? { to: '/work', label: 'My work' } : { to: '/', label: 'Home' };
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Launch plan" title="Launch plan" back={back} />
        <ErrorBox error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="flex flex-col gap-2"><div className="skeleton h-4 w-24" /><div className="skeleton h-9 w-64 max-w-full" /><div className="skeleton h-4 w-80 max-w-full" /></div>
        <div className="skeleton h-12" />
        <Skeleton rows={4} />
      </div>
    );
  }
  return <LaunchBody key={id} got={data} />;
}

function LaunchBody({ got }: { got: LaunchGet }) {
  const { org } = useMe();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [params, setParams] = useSearchParams();
  const { role, placement } = got;
  const canEdit = role !== 'va';
  const template = useMemo(() => templateAgenda(org.agency), [org.agency]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(got, org.agency));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const tz = validTz(placement.client.timezone) ? placement.client.timezone : validTz(org.timezone) ? org.timezone : localTz();
  const vaFirst = (placement.va.name || '').trim().split(' ')[0] || 'your assistant';

  // ───────── saving: debounced autosave, one save at a time, skip when nothing changed ─────────
  const lastSaved = useRef(JSON.stringify(draft));
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [saveErr, setSaveErr] = useState('');
  const [busy, setBusy] = useState(false);
  // The plan's updated_at as this page last saw it: the server refuses a save if someone else saved since.
  const version = useRef<string | null>(got.plan?.updated_at ?? null);
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  const persist = useCallback((d: Draft) => {
    const run = async () => {
      const body = JSON.stringify(d);
      if (body === lastSaved.current) return;
      if (conflictRef.current) throw new Error('Someone else saved changes to this plan. Reload to see them.');
      const args = { p_placement: placement.id, p_data: d.data, p_agenda: d.agenda, p_day1: d.day1 || null, p_status: d.status };
      let { data: saved, error } = await supabase.rpc('ramp_launch_save_if', { ...args, p_expected: version.current });
      // Older database without the checked save: fall back to the plain save.
      if (error?.code === 'PGRST202') ({ data: saved, error } = await supabase.rpc('ramp_launch_save', args));
      if (error) {
        if (error.code === 'P0409') { conflictRef.current = true; setConflict(true); }
        setSaveErr(errText(error));
        throw error;
      }
      if (typeof saved === 'string') version.current = saved;
      lastSaved.current = body;
      setSaveErr('');
    };
    const p = chain.current.then(run, run);
    chain.current = p.catch(() => {});
    return p;
  }, [placement.id]);
  const auto = useAutosave(draft, persist, 800, canEdit);
  const saveState = saveErr ? 'error' : busy ? 'saving' : auto === 'error' ? 'saved' : auto;

  // Save right away when the page is hidden or left, so nothing typed in the last moment is lost.
  useEffect(() => {
    if (!canEdit) return;
    const dirty = () => JSON.stringify(draftRef.current) !== lastSaved.current;
    const flush = () => { if (dirty()) persist(draftRef.current).catch(() => {}); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty()) { flush(); e.preventDefault(); } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onLeave);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', onLeave); flush(); };
  }, [canEdit, persist]);

  const retry = () => persist(draftRef.current).then(() => toast('Saved.'))
    .catch(() => toast(conflictRef.current ? 'Reload the plan to see the other changes first.' : 'Still couldn’t save. Check your connection.', 'bad'));

  const update = useCallback((fn: (d: Draft) => Draft) => { if (canEdit) setDraft(fn); }, [canEdit]);
  const setData = useCallback((fn: (d: Data) => Data) => update((d) => ({ ...d, data: fn(d.data) })), [update]);

  /** Change the status (and run details) and save now; put them back if the save fails. */
  async function commit(fn: (d: Draft) => Draft, ok: string) {
    const prev = draftRef.current;
    const next = fn(prev);
    draftRef.current = next;
    setDraft(next);
    setBusy(true);
    try {
      await persist(next);
      toast(ok);
      return true;
    } catch (e) {
      setDraft((d) => ({ ...d, status: prev.status, data: { ...d.data, run: prev.data.run } }));
      toast(errText(e), 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ───────── tabs and wizard step live in the URL ─────────
  const tabs: Tab[] = canEdit ? ['prepare', 'day1', 'plan'] : ['day1', 'plan'];
  const [firstTab] = useState<Tab>(() => (canEdit ? (draft.status === 'preparing' ? 'prepare' : draft.status === 'done' ? 'plan' : 'day1') : 'plan'));
  const [firstStep] = useState<StepId>(() => {
    const r = readiness(draft.data);
    return SECTION_IDS.find((s) => r.states[s] !== 'complete') || 'review';
  });
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && tabs.includes(tabParam) ? tabParam : firstTab;
  const stepParam = params.get('step') as StepId | null;
  const step: StepId = stepParam && STEP_IDS.includes(stepParam) ? stepParam : firstStep;
  const setTab = (t: Tab) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
    window.scrollTo({ top: 0 });
  };
  const setStep = (s: StepId) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', 'prepare'); n.set('step', s); return n; }, { replace: true });
  const goPrep = (s: LaunchSection) => { setStep(s); window.scrollTo({ top: 0 }); };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.indexOf(tab);
    const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    setTab(tabs[j]!);
    document.getElementById(`launch-tab-${tabs[j]}`)?.focus();
  };

  // ───────── status changes ─────────
  async function markReady() {
    const missing = readiness(draftRef.current.data).gaps.length;
    const ok = await confirm({
      title: `Share the plan with ${vaFirst}?`,
      body: missing
        ? `${plural(missing, 'thing')} ${missing === 1 ? 'is' : 'are'} still missing. ${vaFirst} will see the plan as it is now, and you can keep editing after.`
        : `${vaFirst} will be able to read the whole plan before Day 1. You can keep editing after.`,
      action: 'Mark ready',
    });
    if (ok) await commit((d) => ({ ...d, status: 'ready' }), `Ready. ${vaFirst} can read the plan now.`);
  }
  const unready = () => commit((d) => ({ ...d, status: 'preparing' }), `Hidden from ${vaFirst} until you mark it ready again.`);
  async function startDay1() {
    if (draftRef.current.status === 'preparing') {
      const ok = await confirm({ title: 'Start Day 1 now?', body: `The plan isn’t marked ready yet. Starting Day 1 also shares it with ${vaFirst}.`, action: 'Start Day 1' });
      if (!ok) return;
    }
    const now = new Date().toISOString();
    await commit((d) => ({ ...d, status: 'in_progress', day1: d.day1 || todayISO(), data: { ...d.data, run: { ...d.data.run, started_at: now, finished_at: null } } }),
      'Day 1 has started. Have a great first day.');
  }
  async function finishDay1() {
    const left = draftRef.current.agenda.filter((i) => !i.done).length;
    const ok = await confirm({
      title: 'Finish Day 1?',
      body: left ? `${plural(left, 'item')} ${left === 1 ? 'isn’t' : 'aren’t'} ticked off yet. You can reopen Day 1 if you need to.` : 'Everything is ticked off. Nice work.',
      action: 'Finish Day 1',
    });
    if (!ok) return;
    if (await commit((d) => ({ ...d, status: 'done', data: { ...d.data, run: { ...d.data.run, finished_at: new Date().toISOString() } } }), 'Day 1 is done. Nice work.')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  const reopen = () => commit((d) => ({ ...d, status: 'in_progress', data: { ...d.data, run: { ...d.data.run, finished_at: null } } }), 'Day 1 is open again.');

  // ───────── render ─────────
  const back = backFor(role, placement.id);
  const st = PLAN_STATUS[draft.status];
  const hidden = role === 'va' && (!got.plan || draft.status === 'preparing');
  const header = (
    <PageHeader eyebrow="Launch plan" back={back}
      title={role === 'va' ? 'Your launch plan' : placement.va.name || 'Assistant'}
      subtitle={<>
        {placement.title} at {placement.client.name}
        <span aria-hidden="true"> · </span>
        {placement.start_date ? `Starts ${fmtDate(placement.start_date, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'No start date yet'}
        {placement.coach.name && role !== 'coach' && <><span aria-hidden="true"> · </span>Coach: {placement.coach.name}</>}
      </>}
      actions={hidden ? undefined : <Chip tone={st.tone} icon={st.icon} className="self-end">{st.label}</Chip>} />
  );

  if (hidden) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <EmptyState icon="sparkle" title="Your client is preparing your launch plan"
            body={<>
              {placement.client.name} is putting together everything for your first days: the company, your projects, daily checklists, tools and goals.
              It shows up here as soon as it’s ready.
              {draft.day1 && <><br /><br />Day 1 is planned for <strong className="text-ink">{fmtDate(draft.day1, { weekday: 'long', month: 'long', day: 'numeric' })}</strong>.</>}
            </>}
            action={<LinkButton to="/work" icon="chevronLeft">Back to my work</LinkButton>} />
        </Card>
      </div>
    );
  }

  const saveNote = canEdit ? <SaveState state={saveState} onRetry={retry} /> : null;

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="launch-noprint sticky top-14 md:top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-2 bg-bg/95 backdrop-blur border-b border-line flex items-center gap-3">
        <div role="tablist" aria-label="Launch plan views" className="flex flex-1 sm:flex-none gap-1 p-1 rounded-xl bg-[#E9EBEF]">
          {tabs.map((t) => (
            <button key={t} id={`launch-tab-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls="launch-panel" tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)} onKeyDown={onTabKey}
              className={cx('flex-1 sm:flex-none min-h-11 px-3 sm:px-4 rounded-[9px] text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap',
                tab === t ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
              <Icon name={TABS[t].icon} size={17} className="hidden sm:block" />{TABS[t].label}
            </button>
          ))}
        </div>
        {saveNote && <div className="ml-auto shrink-0">{saveNote}</div>}
      </div>

      {conflict ? (
        <Notice tone="bad" icon="alert" className="launch-noprint">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Someone else saved changes to this plan while you were editing. Reload to get their version, then redo your latest change.</span>
            <Button size="sm" icon="refresh" onClick={() => { lastSaved.current = JSON.stringify(draftRef.current); window.location.reload(); }}>Reload the plan</Button>
          </div>
        </Notice>
      ) : saveErr && (
        <Notice tone="bad" icon="alert" className="launch-noprint">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Your latest changes aren’t saved yet. {saveErr}</span>
            <Button size="sm" icon="refresh" onClick={retry}>Try again</Button>
          </div>
        </Notice>
      )}

      <div id="launch-panel" role="tabpanel" aria-labelledby={`launch-tab-${tab}`}>
        {tab === 'prepare' && canEdit && (
          <Prepare draft={draft} setData={setData} placement={placement} tz={tz} step={step} setStep={setStep}
            setDay1={(v) => update((d) => ({ ...d, day1: v }))}
            setStart={(v) => setData((d) => ({ ...d, run: { ...d.run, start: v } }))}
            onReady={markReady} onUnready={unready} goDay1={() => setTab('day1')} saveNote={saveNote} vaFirst={vaFirst} />
        )}
        {tab === 'day1' && (
          <Day1 draft={draft} update={update} canEdit={canEdit} role={role} placement={placement} tz={tz} template={template}
            onStart={startDay1} onFinish={finishDay1} onReopen={reopen} goPrep={goPrep} />
        )}
        {tab === 'plan' && <PlanDocument draft={draft} placement={placement} tz={tz} isVa={role === 'va'} />}
      </div>
      {dialog}
    </div>
  );
}

function SaveState({ state, onRetry }: { state: 'idle' | 'saving' | 'saved' | 'error'; onRetry: () => void }) {
  if (state === 'error') {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 min-h-11 px-2 -mr-2 rounded-lg text-[13px] font-semibold text-bad hover:bg-bad-soft cursor-pointer">
        <Icon name="alert" size={16} /><span className="hidden sm:inline">Not saved.</span> Try again
      </button>
    );
  }
  return (
    <span role="status" className={cx('inline-flex items-center gap-1.5 text-[13px] font-semibold', state === 'saved' ? 'text-good' : 'text-muted')}>
      {state === 'saving' ? <Spinner size={14} /> : state === 'saved' ? <Icon name="check" size={16} strokeWidth={2.4} /> : <Icon name="refresh" size={15} />}
      <span className={state === 'idle' ? 'hidden sm:inline' : 'sr-only sm:not-sr-only'}>
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'All changes saved' : 'Saves as you type'}
      </span>
    </span>
  );
}
