import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HMessage, Job } from '../lib/types';
import { fmtDate, relTime } from '../lib/util';
import { listJobs, listMessages, updateMessage } from './data';
import { Button, Card, Empty, Loading, Pill, Segmented, Textarea, cx, useToast } from '../ui';

export const KIND_LABEL: Record<HMessage['kind'], string> = {
  bug: "Something isn't working",
  question: 'Question about the role',
  other: 'Something else',
};
const KIND_TONE: Record<HMessage['kind'], 'bad' | 'accent' | 'neutral'> = { bug: 'bad', question: 'accent', other: 'neutral' };

type Filter = 'open' | 'done' | 'all';

export { INBOX_EVENT } from './chrome';
import { INBOX_EVENT } from './chrome';

export default function Inbox() {
  const toast = useToast();
  const [msgs, setMsgs] = useState<HMessage[] | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [filter, setFilter] = useState<Filter>('open');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => listMessages().then(setMsgs).catch(() => setMsgs([]));
  useEffect(() => {
    load();
    listJobs().then((js) => setJobs(Object.fromEntries(js.map((j) => [j.id, j])))).catch(() => {});
  }, []);

  const patch = async (m: HMessage, p: Partial<HMessage>) => {
    setMsgs((all) => (all || []).map((x) => (x.id === m.id ? { ...x, ...p } : x)));
    try {
      await updateMessage(m.id, p);
      window.dispatchEvent(new Event(INBOX_EVENT));
    } catch (e: any) {
      toast(e?.message || 'Could not save', 'bad');
      load();
    }
  };

  const toggle = (m: HMessage) => {
    const next = openId === m.id ? null : m.id;
    setOpenId(next);
    if (next && m.status === 'new') patch(m, { status: 'open' });
  };

  const shown = useMemo(() => (msgs || []).filter((m) => (filter === 'all' ? true : filter === 'done' ? m.status === 'done' : m.status !== 'done')), [msgs, filter]);
  const counts = useMemo(() => ({
    open: (msgs || []).filter((m) => m.status !== 'done').length,
    unread: (msgs || []).filter((m) => m.status === 'new').length,
    done: (msgs || []).filter((m) => m.status === 'done').length,
  }), [msgs]);

  if (!msgs) return <Loading />;

  return (
    <div className="rise max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Inbox</h1>
          <p className="text-sm text-muted mt-2">
            Messages from the “Need help?” button on activity pages.{counts.unread ? ` ${counts.unread} unread.` : ''}
          </p>
        </div>
        <Segmented value={filter} onChange={setFilter} options={[
          { id: 'open', label: `To do${counts.open ? ` · ${counts.open}` : ''}` },
          { id: 'done', label: `Done${counts.done ? ` · ${counts.done}` : ''}` },
          { id: 'all', label: 'All' },
        ]} />
      </div>

      {shown.length === 0 ? (
        <Empty title={filter === 'done' ? 'Nothing marked done yet.' : 'All clear.'}>
          {filter === 'done' ? 'Messages you finish show up here.' : 'When a candidate uses the “Need help?” button on an activity page, their message lands here and you get an email.'}
        </Empty>
      ) : (
        <div className="space-y-2.5">
          {shown.map((m) => {
            const job = m.job_id ? jobs[m.job_id] : null;
            const isOpen = openId === m.id;
            const ctx = m.context || {};
            const test = ctx.preview === true;
            return (
              <Card key={m.id} pad={false} className={cx('overflow-hidden', m.status === 'new' && 'border-ink/30')}>
                <button className="w-full text-left px-4 sm:px-5 py-3.5 flex items-start gap-3" onClick={() => toggle(m)}>
                  <span className={cx('mt-1.5 h-2 w-2 rounded-full shrink-0', m.status === 'new' ? 'bg-accent' : 'bg-transparent')} aria-label={m.status === 'new' ? 'Unread' : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx('text-sm', m.status === 'new' ? 'font-semibold' : 'font-medium')}>{m.name || m.email || 'Anonymous'}</span>
                      <Pill tone={KIND_TONE[m.kind]}>{KIND_LABEL[m.kind]}</Pill>
                      {test && <Pill>Test</Pill>}
                      {m.status === 'done' && <Pill tone="good">Done</Pill>}
                    </div>
                    <p className={cx('text-sm text-ink-2 mt-1', !isOpen && 'line-clamp-1')}>{m.body}</p>
                    <p className="text-[12px] text-muted mt-1">{job ? `${job.title} · ` : ''}{relTime(m.created_at)}</p>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 sm:px-5 pb-4 pl-9 sm:pl-10 space-y-4">
                    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
                      <dt className="text-muted">Sent</dt><dd>{fmtDate(m.created_at)}</dd>
                      <dt className="text-muted">Email</dt><dd>{m.email ? <a className="underline underline-offset-2" href={`mailto:${m.email}`}>{m.email}</a> : 'Not given'}</dd>
                      {typeof ctx.step === 'string' && <><dt className="text-muted">Was on</dt><dd>{ctx.step}</dd></>}
                      {typeof ctx.browser === 'string' && <><dt className="text-muted">Browser</dt><dd>{ctx.browser}{typeof ctx.screen === 'string' ? ` · ${ctx.screen}` : ''}</dd></>}
                      {typeof ctx.last_error === 'string' && ctx.last_error && <><dt className="text-muted">Error shown</dt><dd className="text-bad">{ctx.last_error}</dd></>}
                      {typeof ctx.tz === 'string' && <><dt className="text-muted">Time zone</dt><dd>{ctx.tz}</dd></>}
                      <dt className="text-muted">Applied</dt>
                      <dd>{m.application_id ? <Link className="underline underline-offset-2" to={`/admin/candidates/${m.application_id}`}>Yes, open their application</Link> : 'Not yet'}</dd>
                    </dl>
                    <Textarea rows={2} placeholder="Private note for the team" defaultValue={m.admin_note}
                      onBlur={(e) => e.target.value !== m.admin_note && patch(m, { admin_note: e.target.value })} />
                    <div className="flex flex-wrap gap-2">
                      {m.email && (
                        <a href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: your message${job ? ` about ${job.title}` : ''}`)}&body=${encodeURIComponent(`Hi ${(m.name || '').split(/\s+/)[0] || 'there'},\n\n\n\n---\nYou wrote:\n${m.body}`)}`}>
                          <Button variant="primary" size="sm">Reply by email</Button>
                        </a>
                      )}
                      {m.status !== 'done'
                        ? <Button size="sm" onClick={() => { patch(m, { status: 'done' }); setOpenId(null); }}>Mark done</Button>
                        : <Button size="sm" onClick={() => patch(m, { status: 'open' })}>Reopen</Button>}
                      {m.status !== 'new' && m.status !== 'done' && (
                        <Button size="sm" variant="ghost" onClick={() => { patch(m, { status: 'new' }); setOpenId(null); }}>Mark unread</Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
