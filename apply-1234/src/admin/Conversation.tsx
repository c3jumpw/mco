// Messages with a candidate, on their profile. They write from their offer page; replies are emailed to them.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Application } from '../lib/types';
import { offerCall, offerError, type ChatRow, type Offer } from '../lib/offers';
import { Button, Card, SectionTitle, Spinner, Textarea, cx, useToast } from '../ui';
import { INBOX_EVENT } from './chrome';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Conversation({ app, offer }: { app: Pick<Application, 'id' | 'name' | 'email'>; offer: Offer }) {
  const toast = useToast();
  const [list, setList] = useState<ChatRow[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const first = app.name.split(' ')[0];

  const load = useCallback(async () => {
    const { data } = await supabase.from('hiring_chat').select('*').eq('application_id', app.id).order('created_at');
    const rows = (data || []) as ChatRow[];
    setList(rows);
    if (rows.some((m) => m.sender === 'candidate' && !m.read_at)) {
      await supabase.from('hiring_chat').update({ read_at: new Date().toISOString() })
        .eq('application_id', app.id).eq('sender', 'candidate').is('read_at', null);
      window.dispatchEvent(new Event(INBOX_EVENT));
    }
  }, [app.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (list && location.hash === '#messages') setTimeout(() => document.getElementById('messages')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [list === null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [list?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    const r = await offerCall<{ emailed: boolean }>({ action: 'reply', offer_id: offer.id, body });
    setBusy(false);
    if (!r.ok) { toast(offerError(r.error), 'bad'); return; }
    setText('');
    toast(r.emailed ? `Sent. ${first} gets it by email.` : `Saved, but the email to ${first} didn’t go out. They’ll see it on their offer page.`, r.emailed ? 'good' : 'bad');
    load();
  };

  return (
    <Card>
      <div id="messages" className="scroll-mt-4" />
      <SectionTitle sub={`With ${first}, through their offer page. Your replies are emailed to them, and their messages are emailed to the team.`}>Messages</SectionTitle>
      {list === null ? <Spinner /> : list.length === 0 ? (
        <p className="text-sm text-muted">No messages yet. {first} can write from their offer page, or you can write first.</p>
      ) : (
        <div ref={box} className="max-h-[420px] overflow-y-auto space-y-2.5 pr-1">
          {list.map((m) => {
            const mine = m.sender === 'team';
            return (
              <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[88%] rounded-2xl px-3.5 py-2', mine ? 'bg-ink text-white rounded-br-md' : 'bg-paper-2 text-ink rounded-bl-md')}>
                  <p className={cx('text-[11px] mb-0.5', mine ? 'text-white/70' : 'text-muted')}>
                    {mine ? (m.author_name || m.author_email || 'Hiring team') : m.author_name || first} · {when(m.created_at)}
                    {!mine && !m.read_at && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-label="New" />}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                  {mine && <p className="text-[10px] text-white/60 mt-1">{m.emailed?.length ? `Emailed to ${app.email}` : 'Not emailed'}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Textarea rows={2} maxLength={5000} className="mt-3 text-sm" value={text} placeholder={`Write to ${first}…`} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">From {offer.fields.company || 'your company'} via apply1234</span>
        <Button size="sm" variant="primary" disabled={busy || !text.trim()} onClick={send}>{busy ? <Spinner /> : 'Send'}</Button>
      </div>
    </Card>
  );
}
