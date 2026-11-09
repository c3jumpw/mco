import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { supabase, errText } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { cx, fmtDateTime, plural, rankOf } from '../lib/util';
import type { Ack, Announcement, Department, Member } from '../lib/types';
import { useBadges } from '../shell/AppShell';
import { Avatar, Button, Card, Checkbox, Chip, EmptyState, ErrorBox, Field, Icon, IconButton, Input, Notice, PageHeader, Pills, Progress, Select, Sheet, Skeleton, Textarea, useConfirm, useToast } from '../ui';
import { ADMIN_BACK, FormError, focusInvalid, groupOf, personName } from './parts/ops-common';

type Audience = Announcement['audience'];
type Person = Pick<Member, 'id' | 'full_name' | 'preferred_name' | 'email' | 'level' | 'department_id' | 'status' | 'auth_user_id'>;

interface Data { items: Announcement[]; acks: Ack[]; people: Person[]; depts: Department[] }

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'trainees', label: 'Trainees' },
  { value: 'employees', label: 'Employees' },
  { value: 'department', label: 'A department' },
];

/** Who can see an announcement: active team members (not guests) who match the audience. The author isn't counted. */
function audienceOf(a: Pick<Announcement, 'audience' | 'department_id' | 'created_by'>, people: Person[]) {
  return people.filter((p) => {
    if (p.status !== 'active' || !p.auth_user_id || rankOf(p.level) > 6 || p.id === a.created_by) return false;
    if (a.audience === 'trainees') return p.level === 'trainee';
    if (a.audience === 'employees') return rankOf(p.level) <= 5;
    if (a.audience === 'department') return !!a.department_id && p.department_id === a.department_id;
    return true;
  });
}

export default function NewsAdmin() {
  useTitle('Announcements');
  const { org } = useMe();
  const toast = useToast();
  const badges = useBadges();
  const { confirm, dialog } = useConfirm();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const closeCreate = useCallback(() => setCreating(false), []);

  const res = useAsync<Data>(async () => {
    const [items, acks, people, depts] = await Promise.all([
      q<Announcement[]>(supabase.from('ramp_announcements').select('*').order('created_at', { ascending: false })),
      q<Ack[]>(supabase.from('ramp_acks').select('*')),
      q<Person[]>(supabase.from('ramp_members').select('id, full_name, preferred_name, email, level, department_id, status, auth_user_id')),
      q<Department[]>(supabase.from('ramp_departments').select('*').order('name')),
    ]);
    return { items, acks, people, depts };
  }, []);
  const { setData, reload } = res;

  const onPosted = useCallback((a: Announcement) => {
    setData((prev) => (prev ? { ...prev, items: [a, ...prev.items] } : { items: [a], acks: [], people: [], depts: [] }));
    badges.refresh();
  }, [setData, badges]);

  async function remove(a: Announcement) {
    const ok = await confirm({
      title: `Delete “${a.title}”?`,
      body: 'It disappears from everyone’s News, along with who has read it. This can’t be undone.',
      action: 'Delete announcement', danger: true,
    });
    if (!ok || !res.data) return;
    const before = res.data;
    setData({ ...before, items: before.items.filter((x) => x.id !== a.id) });
    const { error } = await supabase.from('ramp_announcements').delete().eq('id', a.id);
    if (error) {
      setData(before);
      toast(errText(error), 'bad');
      return;
    }
    toast('Announcement deleted.');
    badges.refresh();
  }

  const d = res.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={ADMIN_BACK} eyebrow={groupOf('/admin/news')} title="Announcements"
        subtitle="Post news to everyone or to one group, and see who has read it."
        actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)} disabled={!d}>Post an announcement</Button>} />

      {res.error && !d ? <ErrorBox error={res.error} onRetry={reload} />
        : !d ? <Skeleton rows={4} />
          : d.items.length === 0 ? (
            <Card>
              <EmptyState icon="megaphone" title="No announcements yet"
                body="Share company news, policy changes or reminders. Ask people to confirm they’ve read the important ones."
                action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Post an announcement</Button>} />
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {d.items.map((a) => (
                <AnnouncementRow key={a.id} a={a} d={d} tz={org.timezone} expanded={open === a.id}
                  onToggle={() => setOpen((v) => (v === a.id ? null : a.id))} onDelete={() => remove(a)} />
              ))}
            </ul>
          )}

      <CreateSheet open={creating} onClose={closeCreate} people={d?.people || []} depts={d?.depts || []} onPosted={onPosted} />
      {dialog}
    </div>
  );
}

function AnnouncementRow({ a, d, tz, expanded, onToggle, onDelete }: { a: Announcement; d: Data; tz: string; expanded: boolean; onToggle: () => void; onDelete: () => void }) {
  const audience = useMemo(() => audienceOf(a, d.people), [a, d.people]);
  const readers = useMemo(() => new Set(d.acks.filter((k) => k.announcement_id === a.id).map((k) => k.member_id)), [d.acks, a.id]);
  const read = audience.filter((p) => readers.has(p.id));
  const unread = audience.filter((p) => !readers.has(p.id)).sort((x, y) => personName(x).localeCompare(personName(y)));
  const author = d.people.find((p) => p.id === a.created_by);
  const deptName = d.depts.find((x) => x.id === a.department_id)?.name;
  const audienceText = a.audience === 'department' ? (deptName || 'A department') : AUDIENCES.find((x) => x.value === a.audience)?.label;
  const pct = audience.length ? Math.round((read.length / audience.length) * 100) : 0;
  const panelId = `ann-${a.id}`;

  return (
    <li>
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-start gap-2 p-4 sm:p-5">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0">
                <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={panelId}
                  className="font-display text-lg font-semibold leading-snug break-words text-left cursor-pointer hover:text-brand-ink min-h-11 sm:min-h-0">
                  {a.title}
                </button>
              </h2>
              <Chip tone="neutral" icon="users">{audienceText}</Chip>
              {a.require_ack && <Chip tone="brand" icon="check">Read confirmation</Chip>}
            </div>
            <p className="text-[13px] text-muted">{author ? personName(author) : 'Someone'} · {fmtDateTime(a.created_at, tz)}</p>
            {a.require_ack ? (
              <div className="flex items-center gap-3 mt-1 max-w-md">
                <Progress value={pct} tone={pct === 100 ? 'good' : 'brand'} label={`${a.title}: read`} className="flex-1" />
                <span className="text-sm text-ink-2 whitespace-nowrap tabular-nums"><span className="font-bold text-ink">{read.length}</span> / {audience.length} read</span>
              </div>
            ) : (
              <p className="text-sm text-ink-2">Sent to {plural(audience.length, 'person', 'people')}</p>
            )}
          </div>
          <IconButton icon={expanded ? 'chevronUp' : 'chevronDown'} label={expanded ? 'Hide details' : 'Show details'} onClick={onToggle} aria-expanded={expanded} aria-controls={panelId} />
        </div>
        {expanded && (
          <div id={panelId} className="border-t border-line px-4 sm:px-5 py-4 flex flex-col gap-4 bg-[#FAFBFC]">
            {a.body ? <p className="text-[15px] text-ink-2 leading-relaxed whitespace-pre-wrap break-words">{a.body}</p> : <p className="text-sm text-muted">No message, just the title.</p>}
            {a.require_ack ? (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
                  {unread.length ? `Hasn’t read it yet (${unread.length})` : 'Everyone has read it'}
                </p>
                {unread.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {unread.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 rounded-full bg-white border border-line pl-1 pr-3 py-1 text-sm">
                        <Avatar name={personName(p)} size={26} />{personName(p)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted flex gap-1.5 items-start"><Icon name="info" size={16} className="mt-0.5" />Read receipts are only collected when you ask people to confirm they’ve read it.</p>
            )}
            <Button variant="danger" size="sm" icon="trash" onClick={onDelete} className="self-start">Delete announcement</Button>
          </div>
        )}
      </Card>
    </li>
  );
}

function CreateSheet(props: { open: boolean; onClose: () => void; people: Person[]; depts: Department[]; onPosted: (a: Announcement) => void }) {
  if (!props.open) return null;
  return <CreateBody {...props} />;
}

function CreateBody({ onClose, people, depts, onPosted }: { onClose: () => void; people: Person[]; depts: Department[]; onPosted: (a: Announcement) => void }) {
  const { me } = useMe();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('everyone');
  const [dept, setDept] = useState(depts[0]?.id || '');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [titleErr, setTitleErr] = useState('');

  const reach = audienceOf({ audience, department_id: audience === 'department' ? dept : null, created_by: me.id }, people).length;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    if (!title.trim()) { setTitleErr('Give it a title.'); focusInvalid('ops-news-form'); return; }
    if (audience === 'department' && !dept) { setError('Pick a department.'); return; }
    setTitleErr('');
    setBusy(true);
    try {
      const { data, error: err } = await supabase.from('ramp_announcements').insert({
        title: title.trim(), body: body.trim(), audience, department_id: audience === 'department' ? dept : null,
        require_ack: ack, created_by: me.id,
      }).select('*').single();
      if (err) throw err;
      onPosted(data as Announcement);
      toast('Announcement posted.');
      onClose();
    } catch (x) {
      setError(errText(x));
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Post an announcement" subtitle="It shows up in News for the people you choose."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="ops-news-form" icon="send" loading={busy}>Post to {plural(reach, 'person', 'people')}</Button></>}>
      <form id="ops-news-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Title" required error={titleErr}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="What’s the news?" aria-invalid={!!titleErr} />
        </Field>
        <Field label="Message" hint="Plain text. Line breaks are kept.">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">Who should see it</span>
          <Pills options={AUDIENCES} value={audience} onChange={setAudience} label="Audience" size="sm" />
        </div>
        {audience === 'department' && (
          depts.length ? (
            <Field label="Department">
              <Select value={dept} onChange={(e) => setDept(e.target.value)}>
                {depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
          ) : <Notice tone="warn" icon="alert">There are no departments yet. Add them in Admin › Roles and departments.</Notice>
        )}
        <p className={cx('text-[13px]', reach ? 'text-muted' : 'text-warn font-semibold')}>
          {reach ? `${plural(reach, 'person', 'people')} will see this.` : 'No one in RAMP matches this audience yet.'}
        </p>
        <Checkbox checked={ack} onChange={setAck} label="Ask people to confirm they’ve read it"
          hint="It stays highlighted in their News until they confirm, and you can see who hasn’t." />
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
