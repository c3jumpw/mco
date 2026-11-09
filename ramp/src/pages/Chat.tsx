import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useDirectory, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { cx, displayName } from '../lib/util';
import type { Channel, ChannelMember, DirEntry } from '../lib/types';
import { Avatar, Button, EmptyState, ErrorBox, Icon, SearchInput, Sheet, Skeleton, Spinner, useToast } from '../ui';
import { Conversation } from './parts/tools-chat-conversation';
import { useWide } from './parts/tools-media';

interface LatestRow { channel_id: string; member_id: string | null; created_at: string }
type ReadMap = Record<string, number>;

const KIND_ORDER: Record<Channel['kind'], number> = { company: 0, department: 1, cohort: 2, dm: 3 };

function loadRead(key: string): ReadMap | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ReadMap) : null;
  } catch {
    return null;
  }
}
function storeRead(key: string, v: ReadMap) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: unread dots just won't persist */ }
}

export default function Chat() {
  const { id } = useParams();
  const { me, isAdmin } = useMe();
  // Channel list and conversation side by side only when there's room next to the sidebar.
  const mobile = !useWide();
  const nav = useNavigate();
  const dir = useDirectory();
  const [picker, setPicker] = useState(false);

  const chans = useAsync(async () => {
    const channels = await q<Channel[]>(supabase.from('ramp_channels').select('*').order('name'));
    const dmIds = channels.filter((c) => c.kind === 'dm').map((c) => c.id);
    const members = dmIds.length
      ? await q<ChannelMember[]>(supabase.from('ramp_channel_members').select('channel_id, member_id').in('channel_id', dmIds))
      : [];
    return { channels, members };
  }, [me.id]);

  // Latest message time per channel, for unread dots and ordering direct messages.
  const latestQ = useAsync(
    () => q<LatestRow[]>(supabase.from('ramp_messages').select('channel_id, member_id, created_at').order('created_at', { ascending: false }).limit(300)),
    [me.id],
  );
  const reloadLatest = latestQ.reload;
  useEffect(() => {
    const t = setInterval(reloadLatest, 60_000);
    const onFocus = () => reloadLatest();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [reloadLatest]);

  const [bumps, setBumps] = useState<Record<string, { at: number; mine: boolean }>>({});
  const latest = useMemo(() => {
    const m: Record<string, { any: number; other: number }> = {};
    const add = (cid: string, at: number, mine: boolean) => {
      const e = (m[cid] ||= { any: 0, other: 0 });
      if (at > e.any) e.any = at;
      if (!mine && at > e.other) e.other = at;
    };
    for (const r of latestQ.data || []) add(r.channel_id, Date.parse(r.created_at), r.member_id === me.id);
    for (const [cid, b] of Object.entries(bumps)) add(cid, b.at, b.mine);
    return m;
  }, [latestQ.data, bumps, me.id]);

  const readKey = `ramp-chat-read:${me.id}`;
  const [read, setRead] = useState<ReadMap | null>(() => loadRead(readKey));
  // First visit on this device: treat everything that's already there as read.
  useEffect(() => {
    if (read !== null || !latestQ.data) return;
    const seed: ReadMap = {};
    for (const [cid, e] of Object.entries(latest)) seed[cid] = e.any;
    storeRead(readKey, seed);
    setRead(seed);
  }, [read, latestQ.data, latest, readKey]);

  const markRead = useCallback((cid: string, at: number) => {
    setRead((prev) => {
      const p = prev || {};
      if ((p[cid] || 0) >= at) return prev;
      const next = { ...p, [cid]: at };
      storeRead(readKey, next);
      return next;
    });
  }, [readKey]);

  const onActivity = useCallback((cid: string, at: number, mine: boolean) => {
    setBumps((b) => (b[cid] && b[cid]!.at >= at ? b : { ...b, [cid]: { at, mine } }));
  }, []);

  const channels = chans.data?.channels;
  const active = id && channels ? channels.find((c) => c.id === id) || null : null;

  useEffect(() => {
    if (active && latest[active.id]) markRead(active.id, latest[active.id]!.any);
  }, [active, latest, markRead]);

  // Someone started a new conversation with me (or a link points to one we haven't loaded): fetch the list again.
  const reloadChans = chans.reload;
  const missingTried = useRef('');
  useEffect(() => {
    if (!channels || !latestQ.data) return;
    if (latestQ.data.some((r) => !channels.some((c) => c.id === r.channel_id))) reloadChans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestQ.data]);
  useEffect(() => {
    if (!id || !channels || active || missingTried.current === id) return;
    missingTried.current = id;
    reloadChans();
  }, [id, channels, active, reloadChans]);

  // On a wide screen, open #general when nothing is picked.
  useEffect(() => {
    if (mobile || id || !channels?.length) return;
    const g = channels.find((c) => c.slug === 'general') || channels.find((c) => c.kind !== 'dm') || channels[0]!;
    nav(`/chat/${g.id}`, { replace: true });
  }, [mobile, id, channels, nav]);

  const otherOf = useCallback((c: Channel) => chans.data?.members.find((m) => m.channel_id === c.id && m.member_id !== me.id)?.member_id || null, [chans.data, me.id]);
  const dmName = useCallback((c: Channel) => {
    const o = otherOf(c);
    const d = o ? dir.byId(o) : null;
    return d ? displayName(d) : 'Direct message';
  }, [otherOf, dir]);
  const nameOf = useCallback((mid: string | null) => {
    if (!mid) return 'Former team member';
    const d = dir.byId(mid);
    return d ? displayName(d) : 'Team member';
  }, [dir]);

  const company = useMemo(() => (channels || []).filter((c) => c.kind !== 'dm')
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name)), [channels]);
  const dms = useMemo(() => (channels || []).filter((c) => c.kind === 'dm')
    .sort((a, b) => (latest[b.id]?.any || 0) - (latest[a.id]?.any || 0) || a.created_at.localeCompare(b.created_at)), [channels, latest]);

  const unread = (c: Channel) => read !== null && c.id !== active?.id && (latest[c.id]?.other || 0) > (read[c.id] || 0);

  const activeTitle = active ? (active.kind === 'dm' ? dmName(active) : `#${active.name}`) : '';
  useTitle(active ? activeTitle : 'Chat');

  let activeSub = '';
  if (active) {
    if (active.kind === 'dm') {
      const o = otherOf(active);
      const d = o ? dir.byId(o) : null;
      activeSub = d ? [d.job_title, d.department].filter(Boolean).join(' · ') || 'Direct message' : 'Direct message';
    } else activeSub = active.description;
  }

  const list = (
    <aside aria-label="Conversations" className={cx('flex flex-col min-h-0 bg-card', mobile ? 'w-full h-full' : 'w-80 shrink-0 border-r border-line')}>
      <div className="flex items-center justify-between gap-2 px-4 h-16 shrink-0 border-b border-line">
        {mobile ? <h1 className="font-display text-[22px] font-bold">Chat</h1> : <h2 className="font-display text-[22px] font-bold">Chat</h2>}
        <Button size="sm" variant="primary" icon="pen" onClick={() => setPicker(true)}>New message</Button>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-3 flex flex-col gap-4">
        {chans.error && !chans.data ? <div className="px-1.5"><ErrorBox error={chans.error} onRetry={chans.reload} /></div>
          : !chans.data ? <div className="px-1.5"><Skeleton rows={4} /></div> : (
            <>
              <section className="flex flex-col gap-0.5">
                <h2 className="px-3 pb-1 text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Channels</h2>
                {company.length === 0 && <p className="px-3 text-sm text-muted">No channels yet.</p>}
                {company.map((c) => (
                  <ChannelLink key={c.id} to={`/chat/${c.id}`} active={c.id === active?.id} unread={unread(c)}
                    icon={<span className="w-8 h-8 rounded-lg bg-brand-soft text-brand-ink flex items-center justify-center font-display font-bold shrink-0" aria-hidden="true">#</span>}
                    name={c.name} sub={c.description} lock={c.read_only} />
                ))}
              </section>
              <section className="flex flex-col gap-0.5">
                <h2 className="px-3 pb-1 text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Direct messages</h2>
                {dms.length === 0 && (
                  <p className="px-3 text-sm text-muted leading-relaxed">
                    No direct messages yet. <button type="button" onClick={() => setPicker(true)} className="font-semibold text-brand-ink underline cursor-pointer">Message someone</button>, like your mentor.
                  </p>
                )}
                {dms.map((c) => {
                  const n = dmName(c);
                  const o = otherOf(c);
                  const d = o ? dir.byId(o) : null;
                  return <ChannelLink key={c.id} to={`/chat/${c.id}`} active={c.id === active?.id} unread={unread(c)}
                    icon={<Avatar name={n} size={32} tone="amber" />} name={n} sub={d?.job_title || ''} />;
                })}
              </section>
            </>
          )}
      </nav>
    </aside>
  );

  let main: ReactNode = null;
  if (!mobile || id) {
    if (!chans.data) {
      main = chans.error ? null : <div className="p-6"><Skeleton rows={5} /></div>;
    } else if (!active) {
      main = id ? (
        <div className="flex-1 flex flex-col">
          {mobile && <div className="px-3 h-16 flex items-center border-b border-line bg-card"><Link to="/chat" className="inline-flex items-center gap-1.5 min-h-11 font-semibold text-brand-ink no-underline"><Icon name="chevronLeft" size={18} strokeWidth={2} />All conversations</Link></div>}
          <EmptyState icon="chat" title="This conversation isn’t available" body="It may have been removed, or you’re not part of it." />
        </div>
      ) : (
        <EmptyState icon="chat" title="Pick a conversation" body="Choose a channel or start a direct message." />
      );
    } else {
      main = (
        <Conversation key={active.id} channel={active} title={activeTitle.replace(/^#/, '')} subtitle={activeSub}
          isDm={active.kind === 'dm'} canPost={!active.read_only || isAdmin} back={mobile} nameOf={nameOf} onActivity={onActivity} />
      );
    }
  }

  return (
    <div className="h-full min-h-0 flex bg-bg">
      {(!mobile || !id) && list}
      {(!mobile || id) && <section className="flex-1 min-w-0 min-h-0 flex flex-col">{main}</section>}
      <PeoplePicker open={picker} onClose={() => setPicker(false)} me={me.id} people={dir.list}
        onPicked={async (cid) => { setPicker(false); await chans.reload(); nav(`/chat/${cid}`); }} />
    </div>
  );
}

function ChannelLink({ to, active, unread, icon, name, sub, lock }: { to: string; active: boolean; unread: boolean; icon: ReactNode; name: string; sub?: string; lock?: boolean }) {
  return (
    <Link to={to} aria-current={active ? 'page' : undefined}
      className={cx('flex items-center gap-2.5 min-h-12 px-2.5 py-1.5 rounded-xl no-underline', active ? 'bg-brand-soft text-brand-ink' : 'text-ink hover:bg-chip')}>
      {icon}
      <span className="min-w-0 flex-1">
        <span className={cx('flex items-center gap-1.5 text-[15px] truncate', unread || active ? 'font-bold' : 'font-medium')}>
          <span className="truncate">{name}</span>{lock && <Icon name="lock" size={13} className="text-muted" />}
        </span>
        {sub && <span className="block text-xs text-muted truncate">{sub}</span>}
      </span>
      {unread && <span className="w-2.5 h-2.5 rounded-full bg-amber shrink-0"><span className="sr-only">New messages</span></span>}
    </Link>
  );
}

function PeoplePicker({ open, onClose, me, people, onPicked }: { open: boolean; onClose: () => void; me: string; people: DirEntry[]; onPicked: (channelId: string) => void }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const term = search.trim().toLowerCase();
  const list = people
    .filter((p) => p.id !== me && p.level !== 'guest')
    .filter((p) => !term || [p.full_name, p.preferred_name, p.job_title, p.department].some((v) => (v || '').toLowerCase().includes(term)))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));

  async function pick(p: DirEntry) {
    setBusy(p.id);
    try {
      const cid = await q<string>(supabase.rpc('ramp_dm', { p_other: p.id }));
      setSearch('');
      onPicked(cid);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="New message" subtitle="Pick someone to message directly.">
      <SearchInput value={search} onChange={setSearch} placeholder="Search by name, role or department" label="Search people" />
      {people.length === 0 ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : list.length === 0 ? (
        <p className="text-[15px] text-muted text-center py-6">{term ? `No one matches “${search.trim()}”.` : 'There’s no one else to message yet.'}</p>
      ) : (
        <ul className="flex flex-col -mx-1">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => pick(p)} disabled={!!busy}
                className="w-full flex items-center gap-3 min-h-14 px-2 py-2 rounded-xl text-left hover:bg-chip cursor-pointer disabled:opacity-60">
                <Avatar name={displayName(p)} size={38} tone="amber" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold truncate">{displayName(p)}</span>
                  <span className="block text-[13px] text-muted truncate">{[p.job_title, p.department].filter(Boolean).join(' · ') || 'Team member'}</span>
                </span>
                {busy === p.id ? <Spinner size={18} /> : <Icon name="chevronRight" size={18} className="text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
