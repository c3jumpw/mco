import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../../lib/supabase';
import { q, useAsync } from '../../lib/hooks';
import { useMe } from '../../lib/session';
import { cx, fmtDate, fmtDateTime, fmtTime } from '../../lib/util';
import type { Channel, Message } from '../../lib/types';
import { Avatar, Chip, EmptyState, ErrorBox, Icon, Notice, Skeleton, Spinner, useConfirm, useToast } from '../../ui';

type Msg = Message & { pending?: boolean };

const COLS = 'id, channel_id, member_id, body, created_at';
const LIMIT = 100;
const MAX_LEN = 4000;
const GROUP_GAP = 5 * 60 * 1000;

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Plain text with web links made clickable. */
function linkify(text: string, mine: boolean): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return parts.map((p, i) => (i % 2 === 1
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={cx('underline break-all', mine ? 'text-white' : 'text-brand-ink')}>{p}</a>
    : <Fragment key={i}>{p}</Fragment>));
}

type Item =
  | { type: 'day'; key: string; label: string }
  | { type: 'group'; key: string; member: string | null; msgs: Msg[] };

/**
 * One conversation: the last 100 messages, live updates, grouping by author and day, and the composer.
 * Key it by channel id.
 */
export function Conversation({ channel, title, subtitle, isDm, canPost, back, nameOf, onActivity }: {
  channel: Channel;
  title: string;
  subtitle: string;
  isDm: boolean;
  canPost: boolean;
  back: boolean;
  nameOf: (memberId: string | null) => string;
  onActivity: (channelId: string, at: number, mine: boolean) => void;
}) {
  const { me, isAdmin } = useMe();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const firstScroll = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activity = useRef(onActivity);
  activity.current = onActivity;

  const { data, error, reload, setData } = useAsync<Msg[]>(async () => {
    const rows = await q<Message[]>(supabase.from('ramp_messages').select(COLS).eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(LIMIT));
    return rows.reverse();
  }, [channel.id]);

  // Live updates for this channel only. Our own sends arrive here too, so they replace the optimistic copy.
  useEffect(() => {
    const sub = supabase
      .channel(`ramp-messages-${channel.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ramp_messages', filter: `channel_id=eq.${channel.id}` }, (payload) => {
        const m = payload.new as Message;
        if (!m || m.channel_id !== channel.id) return;
        setData((prev) => {
          if (!prev) return prev as unknown as Msg[];
          if (prev.some((x) => x.id === m.id)) return prev;
          if (m.member_id === me.id) {
            const i = prev.findIndex((x) => x.pending && x.body === m.body);
            if (i >= 0) { const next = prev.slice(); next[i] = m; return next; }
          }
          return [...prev, m];
        });
        activity.current(channel.id, Date.parse(m.created_at), m.member_id === me.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel.id, me.id, setData]);

  // Stay at the bottom when new messages arrive, unless the person has scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !data) return;
    const last = data[data.length - 1];
    if (firstScroll.current || atBottom.current || (last && last.member_id === me.id && last.pending)) {
      el.scrollTo({ top: el.scrollHeight, behavior: firstScroll.current ? 'auto' : 'smooth' });
      firstScroll.current = false;
    }
  }, [data, me.id]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const items = useMemo(() => {
    const out: Item[] = [];
    let lastDay = '';
    let group: Extract<Item, { type: 'group' }> | null = null;
    for (const m of data || []) {
      const d = new Date(m.created_at);
      const day = d.toDateString();
      if (day !== lastDay) {
        out.push({ type: 'day', key: `d-${day}`, label: dayLabel(d) });
        lastDay = day;
        group = null;
      }
      const prev = group?.msgs[group.msgs.length - 1];
      if (group && prev && group.member === m.member_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < GROUP_GAP) {
        group.msgs.push(m);
      } else {
        group = { type: 'group', key: `g-${m.id}`, member: m.member_id, msgs: [m] };
        out.push(group);
      }
    }
    return out;
  }, [data]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (body.length > MAX_LEN) { toast(`Messages can be up to ${MAX_LEN} characters.`, 'bad'); return; }
    setDraft('');
    const temp: Msg = { id: -Date.now() - Math.random(), channel_id: channel.id, member_id: me.id, body, created_at: new Date().toISOString(), pending: true };
    atBottom.current = true;
    setData((prev) => [...(prev || []), temp]);
    const { data: row, error } = await supabase.from('ramp_messages').insert({ channel_id: channel.id, member_id: me.id, body }).select(COLS).single();
    if (error || !row) {
      setData((prev) => (prev || []).filter((m) => m.id !== temp.id));
      setDraft((d) => d || body);
      toast(errText(error), 'bad');
      return;
    }
    const real = row as Message;
    setData((prev) => {
      const list = prev || [];
      if (list.some((m) => m.id === real.id)) return list.filter((m) => m.id !== temp.id);
      return list.map((m) => (m.id === temp.id ? real : m));
    });
    onActivity(channel.id, Date.parse(real.created_at), true);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  async function remove(m: Msg) {
    const ok = await confirm({ title: 'Delete this message?', body: 'It will be removed for everyone in the conversation.', action: 'Delete message', danger: true });
    if (!ok) return;
    setSelected(null);
    setData((prev) => (prev || []).filter((x) => x.id !== m.id));
    const { data: gone, error } = await supabase.from('ramp_messages').delete().eq('id', m.id).select('id');
    if (error || !gone || gone.length === 0) {
      setData((prev) => [...(prev || []), m].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id));
      toast(error ? errText(error) : 'That message couldn’t be deleted.', 'bad');
    } else toast('Message deleted.');
  }

  const placeholder = isDm ? `Message ${title}` : `Message #${channel.name}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-3 px-3 md:px-6 h-16 border-b border-line bg-card shrink-0">
        {back && (
          <Link to="/chat" aria-label="All conversations" className="w-11 h-11 -ml-1 rounded-xl flex items-center justify-center text-brand-ink hover:bg-chip">
            <Icon name="chevronLeft" size={22} strokeWidth={2} />
          </Link>
        )}
        {isDm
          ? <Avatar name={title} size={36} tone="amber" />
          : <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center font-display font-bold text-lg shrink-0" aria-hidden="true">#</span>}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold leading-tight truncate">{isDm ? title : channel.name}</h1>
          {subtitle && <p className="text-[13px] text-muted truncate">{subtitle}</p>}
        </div>
        {channel.read_only && <Chip icon="lock">Read-only</Chip>}
      </header>

      <div ref={scroller} onScroll={() => { const el = scroller.current; if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
        className="flex-1 min-h-0 overflow-y-auto px-3 md:px-6 py-4" role="log" aria-label={`Messages in ${isDm ? title : `#${channel.name}`}`} aria-live="polite">
        {error && !data ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Skeleton rows={4} /> : data.length === 0 ? (
          <EmptyState icon="chat" title="No messages yet"
            body={isDm ? `Send ${title.split(' ')[0]} a message to start the conversation.` : canPost ? 'Say hello to get the conversation going.' : 'New posts will show up here.'} />
        ) : (
          <div className="flex flex-col gap-3">
            {data.length >= LIMIT && <p className="text-center text-xs text-muted">Showing the latest {LIMIT} messages.</p>}
            {items.map((it) => {
              if (it.type === 'day') {
                return (
                  <div key={it.key} className="flex items-center gap-3 py-1" role="separator" aria-label={it.label}>
                    <span className="h-px flex-1 bg-line" /><span className="text-xs font-semibold text-muted">{it.label}</span><span className="h-px flex-1 bg-line" />
                  </div>
                );
              }
              const mine = it.member === me.id;
              const name = mine ? 'You' : nameOf(it.member);
              const first = it.msgs[0]!;
              return (
                <div key={it.key} className={cx('flex gap-2.5 items-start', mine && 'flex-row-reverse')}>
                  {!mine && <Avatar name={name} size={32} tone="amber" className="mt-5" />}
                  <div className={cx('flex flex-col gap-1 min-w-0 max-w-[85%] md:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
                    <p className="text-xs text-muted px-1">
                      <span className="font-semibold text-ink-2">{name}</span> · <time dateTime={first.created_at} title={fmtDateTime(first.created_at)}>{fmtTime(first.created_at)}</time>
                    </p>
                    {it.msgs.map((m) => {
                      const canDelete = !m.pending && (m.member_id === me.id || isAdmin);
                      const sel = selected === m.id;
                      return (
                        <div key={m.id} className={cx('group/msg flex items-center gap-1 max-w-full', mine && 'flex-row-reverse')}>
                          <div onClick={() => canDelete && setSelected(sel ? null : m.id)} title={fmtDateTime(m.created_at)}
                            className={cx('rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words min-w-0',
                              mine ? 'bg-brand text-white rounded-tr-md' : 'bg-card border border-line text-ink rounded-tl-md',
                              m.pending && 'opacity-70', sel && 'ring-2 ring-amber')}>
                            {linkify(m.body, mine)}
                          </div>
                          {canDelete && (
                            <button type="button" onClick={() => remove(m)} aria-label="Delete message"
                              className={cx('w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:bg-chip hover:text-bad cursor-pointer shrink-0 transition-opacity',
                                sel ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100')}>
                              <Icon name="trash" size={17} />
                            </button>
                          )}
                          {m.pending && <span className="text-xs text-muted flex items-center gap-1 shrink-0"><Spinner size={12} />Sending</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-line bg-card px-3 md:px-6 py-3 shrink-0">
        {canPost ? (
          <form onSubmit={send} className="flex items-end gap-2">
            <label className="flex-1 min-w-0">
              <span className="sr-only">{placeholder}</span>
              <textarea ref={inputRef} value={draft} rows={1} maxLength={MAX_LEN + 200} placeholder={placeholder}
                onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} enterKeyHint="send"
                className="block w-full min-h-11 max-h-40 resize-none px-3.5 py-2.5 rounded-xl border border-field bg-card text-base leading-snug placeholder:text-[#6B7280]" />
            </label>
            <button type="submit" disabled={!draft.trim()} aria-label="Send message"
              className="w-11 h-11 rounded-xl bg-brand text-white flex items-center justify-center hover:bg-brand-ink disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0">
              <Icon name="send" size={20} />
            </button>
          </form>
        ) : (
          <Notice icon="lock">Only admins can post in #{channel.name}. New posts show up here.</Notice>
        )}
        {canPost && (
          <p className="hidden md:block text-xs text-muted mt-1.5">
            {draft.length > MAX_LEN - 300 ? <span className={cx(draft.length > MAX_LEN && 'text-bad font-semibold')}>{draft.length} of {MAX_LEN} characters · </span> : null}
            Enter to send, Shift+Enter for a new line
          </p>
        )}
      </div>
      {dialog}
    </div>
  );
}
