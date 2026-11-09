import { useId, useState, type FormEvent } from 'react';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useDirectory, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { ago, cx, displayName, fmtDate, fmtDateTime } from '../lib/util';
import type { Ack, Announcement } from '../lib/types';
import { useBadges } from '../shell/AppShell';
import { Button, Card, Checkbox, Chip, EmptyState, ErrorBox, Field, Input, LinkButton, Notice, PageHeader, Sheet, Skeleton, Textarea, useConfirm, useToast } from '../ui';

interface Data { news: Announcement[]; acks: Ack[]; depts: { id: string; name: string }[] }

export default function News() {
  useTitle('News');
  const { me, rank, isAdmin, dept } = useMe();
  const toast = useToast();
  const badges = useBadges();
  const dir = useDirectory();
  const { confirm, dialog } = useConfirm();
  const [posting, setPosting] = useState(false);
  const [acking, setAcking] = useState('');
  const isLead = rank === 3;

  const { data, error, reload, setData } = useAsync<Data>(async () => {
    const [news, acks, depts] = await Promise.all([
      q<Announcement[]>(supabase.from('ramp_announcements').select('*').order('created_at', { ascending: false }).limit(200)),
      q<Ack[]>(supabase.from('ramp_acks').select('*').eq('member_id', me.id)),
      q<{ id: string; name: string }[]>(supabase.from('ramp_departments').select('id, name')).catch(() => []),
    ]);
    return { news, acks, depts };
  }, [me.id]);

  // Who sees what: admins see everything; everyone else sees what's addressed to them.
  const forMe = (a: Announcement) => {
    if (isAdmin) return true;
    if (a.audience === 'everyone') return true;
    if (a.audience === 'trainees') return me.level === 'trainee';
    if (a.audience === 'employees') return rank <= 5;
    if (a.audience === 'department') return !!me.department_id && a.department_id === me.department_id;
    return false;
  };

  const audienceLabel = (a: Announcement) => {
    if (a.audience === 'everyone') return 'Everyone';
    if (a.audience === 'trainees') return 'Trainees';
    if (a.audience === 'employees') return 'Employees';
    return data?.depts.find((d) => d.id === a.department_id)?.name || 'One department';
  };

  async function ack(a: Announcement) {
    setAcking(a.id);
    const row: Ack = { announcement_id: a.id, member_id: me.id, at: new Date().toISOString() };
    setData((d) => ({ ...d!, acks: [...d!.acks, row] }));
    const { error } = await supabase.from('ramp_acks').insert({ announcement_id: a.id, member_id: me.id });
    setAcking('');
    if (error && !/duplicate key/i.test((error as { message?: string }).message || '')) {
      setData((d) => ({ ...d!, acks: d!.acks.filter((x) => x.announcement_id !== a.id) }));
      toast(errText(error), 'bad');
      return;
    }
    toast('Marked as read.');
    badges.refresh();
  }

  async function remove(a: Announcement) {
    const ok = await confirm({ title: 'Delete this post?', body: `“${a.title}” will be removed for everyone.`, action: 'Delete post', danger: true });
    if (!ok) return;
    setData((d) => ({ ...d!, news: d!.news.filter((x) => x.id !== a.id) }));
    const { error } = await supabase.from('ramp_announcements').delete().eq('id', a.id);
    if (error) {
      setData((d) => ({ ...d!, news: [...d!.news, a].sort((x, y) => y.created_at.localeCompare(x.created_at)) }));
      toast(errText(error), 'bad');
      return;
    }
    toast('Post deleted.');
    badges.refresh();
  }

  const header = (
    <PageHeader title="News" subtitle="Announcements from the company and your department."
      actions={
        <>
          {isLead && <Button variant="primary" icon="megaphone" onClick={() => setPosting(true)} disabled={!me.department_id}>Post to my department</Button>}
          {isAdmin && <LinkButton to="/admin/news" icon="pen">Manage announcements</LinkButton>}
        </>
      } />
  );

  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={3} /></div>;

  const acked = new Map(data.acks.map((k) => [k.announcement_id, k.at]));
  const list = data.news.filter(forMe);
  const toConfirm = list.filter((a) => a.require_ack && !acked.has(a.id)).length;

  return (
    <div className="flex flex-col gap-6">
      {header}
      {isLead && !me.department_id && <Notice tone="warn" icon="alert">You’re not in a department yet, so you can’t post department news. Ask an admin to add you to one.</Notice>}
      {toConfirm > 0 && (
        <Notice tone="warn" icon="bell">
          {toConfirm === 1 ? 'One post needs you to confirm you’ve read it.' : `${toConfirm} posts need you to confirm you’ve read them.`}
        </Notice>
      )}

      {list.length === 0 ? (
        <Card>
          <EmptyState icon="megaphone" title="No news yet"
            body={isLead ? 'Share an update with your department. It shows up here for everyone in it.' : 'Company and department announcements will show up here.'}
            action={isLead && me.department_id ? <Button variant="primary" icon="megaphone" onClick={() => setPosting(true)}>Post to my department</Button> : undefined} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {list.map((a) => {
            const author = a.created_by ? dir.byId(a.created_by) : null;
            const readAt = acked.get(a.id);
            const needs = a.require_ack && !readAt;
            const canDelete = isAdmin || a.created_by === me.id;
            return (
              <li key={a.id}>
                <Card as="article" className={cx('flex flex-col gap-3', needs && 'ring-2 ring-amber')}>
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && <Chip tone={a.audience === 'everyone' ? 'neutral' : 'brand'} icon="users">{audienceLabel(a)}</Chip>}
                    {!isAdmin && a.audience === 'department' && <Chip tone="brand">{dept?.name || 'Your department'}</Chip>}
                    {needs && <Chip tone="warn" icon="bell">Please confirm</Chip>}
                    {a.require_ack && readAt && <Chip tone="good" icon="check">Read {fmtDate(readAt)}</Chip>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <h2 className="font-display text-xl font-semibold leading-snug break-words">{a.title}</h2>
                    <p className="text-[13px] text-muted">
                      {author ? `From ${displayName(author)} · ` : ''}<time dateTime={a.created_at} title={fmtDateTime(a.created_at)}>{ago(a.created_at)}</time>
                    </p>
                  </div>
                  {a.body && <div className="text-[15px] leading-relaxed text-ink-2 whitespace-pre-wrap break-words">{a.body}</div>}
                  {(needs || canDelete) && (
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                      {needs ? <Button variant="primary" icon="check" onClick={() => ack(a)} loading={acking === a.id}>Mark as read</Button> : <span />}
                      {canDelete && <Button variant="ghost" size="sm" icon="trash" onClick={() => remove(a)}>Delete</Button>}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <PostSheet open={posting} deptName={dept?.name || 'your department'} onClose={() => setPosting(false)}
        onPosted={(row) => { setPosting(false); setData((d) => ({ ...d!, news: [row, ...d!.news] })); badges.refresh(); }} />
      {dialog}
    </div>
  );
}

function PostSheet({ open, deptName, onClose, onPosted }: { open: boolean; deptName: string; onClose: () => void; onPosted: (a: Announcement) => void }) {
  if (!open) return null;
  return <PostForm deptName={deptName} onClose={onClose} onPosted={onPosted} />;
}

function PostForm({ deptName, onClose, onPosted }: { deptName: string; onClose: () => void; onPosted: (a: Announcement) => void }) {
  const { me } = useMe();
  const toast = useToast();
  const formId = useId();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [requireAck, setRequireAck] = useState(false);
  const [titleErr, setTitleErr] = useState('');
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = title.trim();
    if (!t) { setTitleErr('Add a headline.'); return; }
    setBusy(true);
    setFail('');
    try {
      const row = await q<Announcement>(supabase.from('ramp_announcements').insert({
        title: t, body: body.trim(), audience: 'department', department_id: me.department_id, require_ack: requireAck, created_by: me.id,
      }).select('*').single());
      toast(`Posted to ${deptName}.`);
      onPosted(row);
    } catch (err) {
      setFail(errText(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={busy ? () => {} : onClose} title="Post to my department" subtitle={`Everyone in ${deptName} will see this in News.`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" form={formId} loading={busy} icon="megaphone">Post to {deptName}</Button></>}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Headline" required error={titleErr}>
          <Input value={title} maxLength={160} onChange={(e) => { setTitle(e.target.value); setTitleErr(''); }} />
        </Field>
        <Field label="Message">
          <Textarea value={body} rows={6} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Checkbox checked={requireAck} onChange={setRequireAck} label="Ask everyone to confirm they’ve read it"
          hint="They’ll see a “Mark as read” button and a reminder until they do." />
        {fail && <Notice tone="bad" icon="alert">{fail}</Notice>}
      </form>
    </Sheet>
  );
}
