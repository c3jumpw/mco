import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, errText, openFile } from '../lib/supabase';
import { useMe } from '../lib/session';
import { q, useAsync, useTitle } from '../lib/hooks';
import { SUBMISSION_COLS, docsFor, latestFor, loadTrainingFor, onboardingDocs, planSummary } from '../lib/plan';
import { KINDS, cx, daysUntil, dueLabel, fmtDate, firstName } from '../lib/util';
import type { Announcement, Member, Resource, Submission, Task, Template } from '../lib/types';
import { useBadges } from '../shell/AppShell';
import { FormSheet } from '../components/FormSheet';
import { RecordView } from '../components/RecordView';
import { Button, Chip, ErrorBox, Icon, Notice, PageHeader, useToast } from '../ui';
import { ProgressSummary, greeting, isOverdue } from './parts/journey-common';
import {
  AdminCard, ChecklistCard, DueSoonCard, HomeSection, ModuleRows, NewsCard, NextUpCard, ReviewCard, type AdminCounts, type CheckItem,
} from './parts/journey-home';

async function countOf(p: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await p;
  if (error) throw error;
  return count || 0;
}

/** Announcements are stored for everyone; show each person the ones meant for them. Admins see all. */
function forMe(a: Announcement, me: Member, rank: number) {
  if (rank <= 2 || a.audience === 'everyone') return true;
  if (a.audience === 'trainees') return me.level === 'trainee';
  if (a.audience === 'employees') return rank <= 5;
  if (a.audience === 'department') return !!me.department_id && a.department_id === me.department_id;
  return true;
}

export default function Home() {
  useTitle('Home');
  const { me, org, role, rank, isAdmin, canReview, isGuest } = useMe();
  const badges = useBadges();
  const toast = useToast();
  const navigate = useNavigate();
  const flags = org.flags || { chat: true, tasks: true, certificates: false, record_ip: true };
  const trainee = me.level === 'trainee';
  const needsDocs = trainee || isGuest;

  const training = useAsync(() => loadTrainingFor(me), [me.id]);
  const tasks = useAsync(async () => (isGuest ? [] : q<Task[]>(supabase.from('ramp_tasks').select('*').eq('member_id', me.id))), [me.id, isGuest]);
  const news = useAsync(async () => {
    if (isGuest) return { list: [] as Announcement[], acked: [] as string[] };
    const [list, acks] = await Promise.all([
      q<Announcement[]>(supabase.from('ramp_announcements').select('*').order('created_at', { ascending: false }).limit(40)),
      q<{ announcement_id: string }[]>(supabase.from('ramp_acks').select('announcement_id').eq('member_id', me.id)),
    ]);
    return { list, acked: acks.map((a) => a.announcement_id) };
  }, [me.id, isGuest]);
  const docs = useAsync(async () => {
    if (!needsDocs) return { templates: [] as Template[], subs: [] as Submission[] };
    const [templates, subs] = await Promise.all([
      q<Template[]>(supabase.from('ramp_templates').select('*').eq('status', 'published').order('sort')),
      q<Submission[]>(supabase.from('ramp_submissions').select(SUBMISSION_COLS).eq('member_id', me.id).order('created_at', { ascending: false })),
    ]);
    return { templates, subs };
  }, [me.id, needsDocs]);
  const admin = useAsync<AdminCounts | null>(async () => {
    if (!isAdmin) return null;
    const [requests, invited, draftDocs, draftModules] = await Promise.all([
      countOf(supabase.from('ramp_access_requests').select('id', { count: 'exact', head: true }).eq('status', 'open')),
      countOf(supabase.from('ramp_members').select('id', { count: 'exact', head: true }).eq('status', 'invited')),
      countOf(supabase.from('ramp_templates').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
      countOf(supabase.from('ramp_modules').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
    ]);
    return { requests, invited, draftDocs, draftModules };
  }, [isAdmin]);
  const resources = useAsync(async () => (isGuest
    ? q<Resource[]>(supabase.from('ramp_resources').select('id, title, category, url, body, file_path, required, job_role_id, guest_visible, sort, created_at, updated_at').order('sort'))
    : [] as Resource[]), [isGuest]);

  const [form, setForm] = useState<Template | null>(null);
  const [record, setRecord] = useState<{ t: Template; s: Submission } | null>(null);

  const plan = training.data?.plan || [];
  const summary = useMemo(() => planSummary(plan), [plan]);

  const comingUp = useMemo(() => plan.filter((i) => i.kind !== 'optional' && i !== summary.next && (i.status === 'not_started' || i.status === 'in_progress' || i.status === 'returned')).slice(0, 3), [plan, summary]);

  const dueSoon = useMemo(() => (tasks.data || []).filter((t) => t.status !== 'done')
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.created_at.localeCompare(b.created_at))
    .slice(0, 4), [tasks.data]);

  const acked = useMemo(() => new Set(news.data?.acked || []), [news.data]);
  const latest = useMemo(() => (news.data?.list || []).filter((a) => forMe(a, me, rank)).slice(0, 3), [news.data, me, rank]);

  async function ack(a: Announcement) {
    news.setData((d) => ({ list: d?.list || [], acked: [...(d?.acked || []), a.id] }));
    const { error } = await supabase.from('ramp_acks').insert({ announcement_id: a.id, member_id: me.id });
    if (error && !/duplicate key/i.test(error.message)) {
      news.setData((d) => ({ list: d?.list || [], acked: (d?.acked || []).filter((x) => x !== a.id) }));
      toast(errText(error), 'bad');
      return;
    }
    toast('Marked as read');
    badges.refresh();
  }

  // Trainee checklist: documents still to do, the practice sandbox, and first-week tasks.
  const checklist = useMemo<CheckItem[]>(() => {
    if (!trainee || !docs.data || !tasks.data) return [];
    const { templates, subs } = docs.data;
    const onboarding = onboardingDocs(me, templates).sort((a, b) => a.sort - b.sort);
    const items: CheckItem[] = [];
    const left = onboarding.filter((t) => !latestFor(t.id, subs));
    if (onboarding.length && !left.length) items.push({ key: 'docs', label: 'Onboarding documents', sub: 'All signed and submitted', done: true });
    for (const t of left) items.push({ key: `doc-${t.id}`, label: t.title, sub: `Onboarding document · ${KINDS[t.kind].action}`, done: false, onClick: () => setForm(t) });
    items.push({ key: 'practice', label: 'Practice the platform', sub: me.practice_done_at ? `Done ${fmtDate(me.practice_done_at)}` : 'Five-minute sandbox', done: !!me.practice_done_at, to: '/practice?return=%2F' });
    for (const k of tasks.data.filter((x) => x.template_id).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))) {
      const t = templates.find((x) => x.id === k.template_id) || null;
      const d = daysUntil(k.due_date);
      items.push({
        key: `task-${k.id}`, label: k.title, done: k.status === 'done',
        sub: k.status === 'done' ? 'Done' : k.due_date ? `First week · ${dueLabel(k.due_date)}` : 'First week',
        late: k.status !== 'done' && d !== null && d < 0,
        onClick: t ? () => setForm(t) : () => navigate(flags.tasks ? '/tasks' : '/training'),
      });
    }
    return items;
  }, [trainee, docs.data, tasks.data, me, flags.tasks, navigate]);
  const showChecklist = checklist.some((i) => !i.done);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const header = (
    <PageHeader eyebrow={today} title={`${greeting()}, ${firstName(me)}`}
      subtitle={<>{org.name}{role?.title ? ` · ${role.title}` : ''}</>} />
  );

  if (isGuest) {
    const myDocs = docs.data ? docsFor(me, docs.data.templates) : [];
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Notice icon="lock">
          Guest access shows only what’s been shared with you.
          {me.access_until ? ` It ends on ${fmtDate(me.access_until, { month: 'long', day: 'numeric', year: 'numeric' })}.` : ''}
        </Notice>
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          <HomeSection title="Training" sub="Modules shared with you" to="/training">
            {training.error && !training.data ? <ErrorBox error={training.error} onRetry={training.reload} />
              : !training.data ? <div className="skeleton h-16" aria-hidden="true" />
              : plan.length === 0 ? <p className="text-[15px] text-muted py-2">Nothing shared yet. When your contact shares a module, it shows up here.</p>
              : <ModuleRows items={plan.slice(0, 5)} />}
          </HomeSection>
          <HomeSection title="Documents" sub="Forms to fill in or sign">
            {docs.error && !docs.data ? <ErrorBox error={docs.error} onRetry={docs.reload} />
              : !docs.data ? <div className="skeleton h-16" aria-hidden="true" />
              : myDocs.length === 0 ? <p className="text-[15px] text-muted py-2">Nothing to fill in right now.</p>
              : (
                <ul className="-mx-5 -mb-5 border-t border-line-2">
                  {myDocs.map((t) => {
                    const s = latestFor(t.id, docs.data!.subs);
                    return (
                      <li key={t.id} className="flex items-center gap-3 min-h-16 px-5 py-3 border-t border-line-2 first:border-t-0">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold leading-snug">{t.title}</span>
                          <span className="block text-[13px] text-muted">{KINDS[t.kind].label}{s ? ` · Done ${fmtDate(s.created_at)}` : ''}</span>
                        </span>
                        {s ? <Button size="sm" icon="eye" onClick={() => setRecord({ t, s })}>View</Button>
                          : <Button size="sm" variant="primary" onClick={() => setForm(t)}>{KINDS[t.kind].action}</Button>}
                      </li>
                    );
                  })}
                </ul>
              )}
          </HomeSection>
          <HomeSection title="Resources" sub="Guides and documents for you" to="/resources">
            {resources.error && !resources.data ? <ErrorBox error={resources.error} onRetry={resources.reload} />
              : !resources.data ? <div className="skeleton h-16" aria-hidden="true" />
              : resources.data.length === 0 ? <p className="text-[15px] text-muted py-2">No resources shared yet.</p>
              : <GuestResources items={resources.data.slice(0, 6)} />}
          </HomeSection>
        </div>
        <FormSheet template={form} open={!!form} onClose={() => setForm(null)} onDone={() => docs.reload()} />
        <RecordView submission={record?.s || null} template={record?.t} open={!!record} onClose={() => setRecord(null)} tz={me.timezone || undefined} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-stretch">
        {training.error && !training.data ? (
          <div className="md:col-span-2"><ErrorBox error={training.error} onRetry={training.reload} /></div>
        ) : !training.data ? (
          <>
            <div className="skeleton h-56 rounded-3xl" aria-hidden="true" />
            <div className="skeleton h-56 rounded-2xl" aria-hidden="true" />
          </>
        ) : (
          <>
            <NextUpCard total={summary.total} summary={summary} isAdmin={isAdmin} />
            <ProgressSummary summary={summary} title="Training progress"
              action={<Link to="/training" className="inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-brand-ink no-underline">See all<Icon name="chevronRight" size={16} strokeWidth={2} /></Link>}>
              {comingUp.length > 0 && (
                <div className="border-t border-line-2 pt-3 mt-1">
                  <p className="text-xs font-bold tracking-[0.08em] uppercase text-muted mb-1">Coming up</p>
                  <ul>
                    {comingUp.map((i) => (
                      <li key={i.module.id}>
                        <Link to={`/training/${i.module.id}`} className="flex items-center justify-between gap-3 min-h-11 text-ink no-underline hover:text-brand-ink">
                          <span className="text-sm font-semibold truncate">{i.module.title}</span>
                          <span className={cx('text-xs shrink-0', isOverdue(i) ? 'text-bad font-semibold' : 'text-muted')}>{i.due ? dueLabel(i.due) : `${i.module.minutes} min`}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </ProgressSummary>
          </>
        )}
      </div>

      {(canReview || isAdmin) && (
        <div className={cx('grid gap-4 items-start', isAdmin && 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]')}>
          {canReview && <ReviewCard count={badges.review} />}
          {isAdmin && (admin.error && !admin.data
            ? <ErrorBox error={admin.error} onRetry={admin.reload} />
            : <AdminCard counts={admin.data || null} loading={admin.loading} previewWelcome={!me.onboarded_at} />)}
        </div>
      )}

      {trainee && (docs.error || tasks.error) && !(docs.data && tasks.data) && (
        <ErrorBox error={docs.error || tasks.error || ''} onRetry={() => { docs.reload(); tasks.reload(); }} />
      )}
      {trainee && !(docs.data && tasks.data) && !(docs.error || tasks.error) && <div className="skeleton h-40 rounded-2xl" aria-hidden="true" />}
      {showChecklist && <ChecklistCard items={checklist} />}

      <div className={cx('grid gap-4 items-start', flags.tasks && 'lg:grid-cols-2')}>
        {flags.tasks && (
          tasks.error && !tasks.data ? <ErrorBox error={tasks.error} onRetry={tasks.reload} />
            : !tasks.data ? <div className="skeleton h-48 rounded-2xl" aria-hidden="true" />
            : <DueSoonCard tasks={dueSoon} />
        )}
        {news.error && !news.data ? <ErrorBox error={news.error} onRetry={news.reload} />
          : !news.data ? <div className="skeleton h-48 rounded-2xl" aria-hidden="true" />
          : <NewsCard items={latest} acked={acked} onAck={ack} />}
      </div>

      <FormSheet template={form} open={!!form} onClose={() => setForm(null)} onDone={() => { docs.reload(); tasks.reload(); }} />
    </div>
  );
}

function GuestResources({ items }: { items: Resource[] }) {
  const toast = useToast();
  return (
    <ul className="-mx-5 -mb-5 border-t border-line-2">
      {items.map((r) => {
        const body = (
          <>
            <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-ink flex items-center justify-center shrink-0"><Icon name={r.url ? 'link' : 'fileText'} size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug">{r.title}</span>
              <span className="block text-[13px] text-muted capitalize">{r.category === 'sop' ? 'SOP' : r.category}</span>
            </span>
            {r.required && <Chip tone="warn">Required</Chip>}
            <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" />
          </>
        );
        const cls = 'flex items-center gap-3 w-full min-h-16 px-5 py-3 text-left no-underline text-ink hover:bg-bg cursor-pointer';
        return (
          <li key={r.id} className="border-t border-line-2 first:border-t-0">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className={cls}>{body}</a>
            ) : r.file_path ? (
              <button type="button" className={cls} onClick={() => openFile(r.file_path!).catch((e) => toast(errText(e), 'bad'))}>{body}</button>
            ) : (
              <Link to="/resources" className={cls}>{body}</Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
