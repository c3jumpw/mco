// A client request with its status and the admin's reply. Clients see the reply in their portal.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errText } from '../../../lib/supabase';
import { useMe } from '../../../lib/session';
import { REQUEST_KIND, ago, cx, fmtDateTime } from '../../../lib/util';
import type { ClientRequest } from '../../../lib/types';
import { Button, Chip, Field, Textarea, useToast } from '../../../ui';
import { useBadges } from '../../../shell/AppShell';

export const REQUEST_STATUS: Record<ClientRequest['status'], { label: string; tone: 'warn' | 'brand' | 'good' }> = {
  open: { label: 'New', tone: 'warn' },
  in_progress: { label: 'In progress', tone: 'brand' },
  done: { label: 'Done', tone: 'good' },
};

export function RequestCard({ r, client, assistant, from, onSaved, compact }: {
  r: ClientRequest; client?: { id: string; name: string } | null; assistant?: string | null; from?: string | null;
  onSaved: (r: ClientRequest) => void; compact?: boolean;
}) {
  const { org } = useMe();
  const toast = useToast();
  const badges = useBadges();
  const [reply, setReply] = useState(r.response || '');
  const [busy, setBusy] = useState('');
  const changed = reply.trim() !== (r.response || '').trim();

  async function save(status: ClientRequest['status'], what: string) {
    setBusy(status + what);
    try {
      const { data, error } = await supabase.from('ramp_client_requests').update({ status, response: reply.trim() }).eq('id', r.id).select('*').single();
      if (error) throw error;
      onSaved(data as ClientRequest);
      badges.refresh();
      toast(what);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy('');
    }
  }

  const s = REQUEST_STATUS[r.status];
  return (
    <article className={cx('flex flex-col gap-3', compact ? 'px-4 py-4' : '')}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={s.tone}>{s.label}</Chip>
        <span className="font-semibold text-[15px]">{REQUEST_KIND[r.kind]}</span>
        {client && <Link to={`/admin/clients/${client.id}?tab=requests`} className="text-sm font-semibold text-brand-ink">{client.name}</Link>}
      </div>
      <p className="text-[15px] text-ink leading-relaxed whitespace-pre-wrap break-words border-l-2 border-line pl-3">{r.body}</p>
      <p className="text-xs text-muted" title={fmtDateTime(r.created_at, org.timezone)}>
        {from ? `From ${from}` : 'From the client'}{assistant ? ` · about ${assistant}` : ''} · {ago(r.created_at)}
        {r.updated_at !== r.created_at && r.status !== 'open' ? ` · updated ${ago(r.updated_at)}` : ''}
      </p>
      <Field label="Your reply" hint="The client sees this in their portal.">
        <Textarea rows={2} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} placeholder="What you’re doing about it, and when." />
      </Field>
      <div className="flex flex-wrap gap-2">
        {r.status === 'open' && <Button size="sm" variant="primary" loading={busy === 'in_progressMarked in progress.'} onClick={() => save('in_progress', 'Marked in progress.')}>Mark in progress</Button>}
        {r.status !== 'done' && <Button size="sm" variant={r.status === 'open' ? 'secondary' : 'primary'} icon="check" loading={busy === 'doneMarked done.'} onClick={() => save('done', 'Marked done.')}>Mark done</Button>}
        {r.status === 'done' && <Button size="sm" loading={busy === 'openReopened.'} onClick={() => save('open', 'Reopened.')}>Reopen</Button>}
        {changed && <Button size="sm" variant="ghost" loading={busy === r.status + 'Reply saved.'} onClick={() => save(r.status, 'Reply saved.')}>Save reply</Button>}
      </div>
    </article>
  );
}
