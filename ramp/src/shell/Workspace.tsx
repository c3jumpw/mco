// Workspace switcher, the RAMP Support banner and the trial reminder.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errText } from '../lib/supabase';
import { useMe } from '../lib/session';
import { cx, daysUntil, plural } from '../lib/util';
import type { WorkspaceRow } from '../lib/types';
import { Button, Icon, Notice, Sheet } from '../ui';

/** True when there's anything to switch to (or the person is a platform admin). */
export function useCanSwitch() {
  const { workspaces, isSuper } = useMe();
  return isSuper || workspaces.filter((w) => !w.support && w.member_status === 'active').length > 1;
}

export function WorkspaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspaces, workspace, switchWorkspace, isSuper } = useMe();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const mine = workspaces.filter((w) => !w.support && w.member_status === 'active' && w.level);
  const others = isSuper ? workspaces.filter((w) => !mine.some((m) => m.id === w.id)) : [];
  async function go(w: WorkspaceRow) {
    if (w.id === workspace?.id) { onClose(); return; }
    setBusy(w.id); setErr('');
    try { await switchWorkspace(w.id); } catch (e) { setBusy(''); setErr(errText(e)); }
  }
  const row = (w: WorkspaceRow) => (
    <button key={w.id} type="button" onClick={() => go(w)} disabled={!!busy}
      className={cx('w-full text-left flex items-center gap-3 min-h-14 px-3.5 rounded-xl border cursor-pointer disabled:opacity-60',
        w.id === workspace?.id ? 'border-brand bg-brand-soft/50' : 'border-line hover:bg-chip')}>
      <span className="w-9 h-9 rounded-lg bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name="building" size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold truncate">{w.name}</span>
        <span className="block text-[13px] text-muted truncate">
          {w.account_name !== w.name ? `${w.account_name} · ` : ''}{w.status !== 'active' ? w.status : w.account_status !== 'active' ? w.account_status : w.plan === 'comp' ? 'free access' : w.plan}
        </span>
      </span>
      {busy === w.id ? <Icon name="refresh" size={18} className="animate-spin text-muted" />
        : w.id === workspace?.id ? <Icon name="check" size={18} className="text-brand-ink" /> : <Icon name="chevronRight" size={18} className="text-muted" />}
    </button>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Switch workspace" subtitle="Each workspace is a separate company with its own people, training and settings.">
      <div className="flex flex-col gap-2">
        {mine.map(row)}
        {others.length > 0 && <p className="pt-3 text-[13px] font-semibold text-muted">Other companies (opens as RAMP Support)</p>}
        {others.map(row)}
        {err && <Notice tone="bad" icon="alert">{err}</Notice>}
        {isSuper && <Link to="/platform" onClick={onClose} className="mt-2 text-sm font-semibold text-brand-ink inline-flex items-center gap-1.5 min-h-11">Manage client accounts<Icon name="chevronRight" size={16} /></Link>}
      </div>
    </Sheet>
  );
}

export function SupportBanner() {
  const { support, workspace, workspaces, switchWorkspace } = useMe();
  const [busy, setBusy] = useState(false);
  if (!support) return null;
  const home = workspaces.find((w) => !w.support && w.member_status === 'active' && w.level);
  return (
    <div role="status" className="sticky top-0 z-[45] bg-ink text-white text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-2"><Icon name="lifebuoy" size={16} />You’re viewing <strong>{workspace?.name}</strong> as RAMP Support. Changes you make are real.</span>
      {home && (
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await switchWorkspace(home.id); } catch { setBusy(false); } }}
          className="underline font-semibold cursor-pointer min-h-8">Back to {home.name}</button>
      )}
    </div>
  );
}

export function TrialBanner() {
  const { account, isAdmin, support } = useMe();
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('ramp-trial-hidden') === '1');
  if (!account || support || hidden || account.plan !== 'trial' || !account.trial_ends) return null;
  const left = daysUntil(account.trial_ends) ?? 99;
  if (left > 14) return null;
  return (
    <Notice tone="warn" icon="clock" className="mb-4">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Your free trial ends {left <= 0 ? 'today' : `in ${plural(left, 'day')}`}.{' '}
          {account.is_owner ? 'Choose a plan to keep everything running.' : isAdmin ? 'Ask the account owner to choose a plan.' : ''}</span>
        {account.is_owner && <Link to="/admin/account" className="font-semibold underline">Choose a plan</Link>}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { sessionStorage.setItem('ramp-trial-hidden', '1'); setHidden(true); }}>Hide</Button>
      </span>
    </Notice>
  );
}
