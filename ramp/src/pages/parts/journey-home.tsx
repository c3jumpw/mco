// Cards for the Home screen.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PlanItem, planSummary } from '../../lib/plan';
import { TASK_STATUS, ago, cx, daysUntil, dueLabel, plural } from '../../lib/util';
import type { Announcement, Task } from '../../lib/types';
import { Button, Card, Chip, EmptyState, Icon, LinkButton, Progress } from '../../ui';
import { KIND_LABEL, SectionTitle, ctaFor, isOverdue } from './journey-common';

type Summary = ReturnType<typeof planSummary>;

// ───────── next up ─────────

export function NextUpCard({ total, summary, isAdmin }: { total: number; summary: Summary; isAdmin: boolean }) {
  const n = summary.next;
  if (!total) {
    return (
      <Card className="flex flex-col justify-center">
        <EmptyState icon="book" title="No training assigned yet"
          body={isAdmin ? 'Publish a module and assign it, and it shows up here for your team.' : 'When your admin assigns training, your next module shows up here.'}
          action={isAdmin ? <LinkButton to="/admin/training" size="sm" icon="plus">Build a module</LinkButton> : <LinkButton to="/training" size="sm">Browse training</LinkButton>} />
      </Card>
    );
  }
  if (!n) {
    return (
      <section className="rounded-3xl bg-good-soft text-good p-5 md:p-6 flex flex-col gap-3">
        <span className="w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center"><Icon name="check" size={24} strokeWidth={2.2} /></span>
        <div>
          <h2 className="font-display text-[22px] leading-tight font-bold">You’re all caught up</h2>
          <p className="text-[15px] mt-1 leading-relaxed">
            {summary.waiting > 0 ? `${plural(summary.waiting, 'module')} waiting for your mentor’s review. Everything else is done.` : 'Every assigned module is complete. Nice work.'}
          </p>
        </div>
        <div><LinkButton to="/training" size="sm">Browse the library</LinkButton></div>
      </section>
    );
  }
  const m = n.module;
  const late = isOverdue(n);
  const returned = n.status === 'returned';
  return (
    <section className="rounded-3xl bg-brand text-white p-5 md:p-6 flex flex-col gap-4" aria-labelledby="next-up-title">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-[0.08em] uppercase text-white/80">Next up · {KIND_LABEL[n.kind]}</p>
        {returned ? <Chip tone="bad" icon="alert">Returned with feedback</Chip> : late ? <Chip tone="bad" icon="alert">{dueLabel(n.due)}</Chip> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 id="next-up-title" className="font-display text-[22px] md:text-[26px] leading-tight font-bold">{m.title}</h2>
        {m.summary && <p className="text-[15px] text-white/85 leading-relaxed line-clamp-2">{m.summary}</p>}
      </div>
      {returned && n.progress?.feedback && (
        <blockquote className="rounded-2xl bg-white/12 px-4 py-3 text-[15px] leading-relaxed border-l-4 border-amber">
          <span className="block text-xs font-bold uppercase tracking-[0.08em] text-white/75 mb-1">Feedback from your mentor</span>
          <span className="line-clamp-3 whitespace-pre-line">{n.progress.feedback}</span>
        </blockquote>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/85">
        <span className="inline-flex items-center gap-1"><Icon name="clock" size={14} />{m.minutes} min</span>
        {n.due && !late && <span className="inline-flex items-center gap-1"><Icon name="calendar" size={14} />{dueLabel(n.due)}</span>}
        {n.status === 'in_progress' && <span>{n.pct}% done</span>}
      </div>
      {n.status === 'in_progress' && (
        <div className="h-2 rounded-full bg-white/25 overflow-hidden" role="progressbar" aria-valuenow={n.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Module progress">
          <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${n.pct}%` }} />
        </div>
      )}
      <div>
        <LinkButton to={`/training/${m.id}`} variant="secondary" size="lg" iconRight="chevronRight" className="border-transparent">{ctaFor(n)}</LinkButton>
      </div>
    </section>
  );
}

// ───────── getting started (trainees) ─────────

export interface CheckItem { key: string; label: string; sub?: string; done: boolean; to?: string; onClick?: () => void; late?: boolean }

export function ChecklistCard({ items }: { items: CheckItem[] }) {
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold leading-snug">Getting started</h2>
          <p className="text-sm text-muted mt-0.5">Your first-week checklist</p>
        </div>
        <span className="text-[13px] font-semibold text-muted shrink-0">{done} of {items.length} done</span>
      </div>
      <Progress value={pct} tone={pct === 100 ? 'good' : 'brand'} label="Getting started progress" />
      <ul className="-mx-5 -mb-5 border-t border-line-2">
        {items.map((i) => {
          const inner = (
            <>
              <span className={cx('w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2',
                i.done ? 'bg-good-2 border-good-2 text-white' : 'border-line text-transparent')}>
                <Icon name="check" size={14} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx('block text-[15px] font-semibold leading-snug', i.done && 'text-muted line-through decoration-line')}>{i.label}</span>
                {i.sub && <span className={cx('block text-[13px]', i.late ? 'text-bad font-semibold' : 'text-muted')}>{i.sub}</span>}
              </span>
              {i.done ? <span className="sr-only">Done</span> : <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" />}
            </>
          );
          const cls = 'flex items-center gap-3 w-full min-h-14 px-5 py-2.5 text-left text-ink no-underline';
          return (
            <li key={i.key} className="border-t border-line-2 first:border-t-0">
              {i.done ? <div className={cls}>{inner}</div>
                : i.to ? <Link to={i.to} className={cx(cls, 'hover:bg-bg')}>{inner}</Link>
                : <button type="button" onClick={i.onClick} className={cx(cls, 'cursor-pointer hover:bg-bg')}>{inner}</button>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ───────── due soon ─────────

export function DueSoonCard({ tasks }: { tasks: Task[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle title="Due soon" to="/tasks" linkLabel="All tasks" />
      {tasks.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-[15px] text-muted">Nothing due. When you or your mentor add tasks, the next few show up here.</p>
          <LinkButton to="/tasks" size="sm" icon="plus">Add a task</LinkButton>
        </div>
      ) : (
        <ul className="-mx-5 -mb-5 border-t border-line-2">
          {tasks.map((t) => {
            const d = daysUntil(t.due_date);
            const late = d !== null && d < 0;
            const st = TASK_STATUS[t.status];
            return (
              <li key={t.id} className="border-t border-line-2 first:border-t-0">
                <Link to="/tasks" className="flex items-center gap-3 min-h-14 px-5 py-2.5 no-underline text-ink hover:bg-bg">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-snug truncate">{t.title}</span>
                    <span className={cx('block text-[13px]', late ? 'text-bad font-semibold' : 'text-muted')}>{t.due_date ? dueLabel(t.due_date) : 'No due date'}</span>
                  </span>
                  <Chip tone={st.tone}>{st.label}</Chip>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ───────── announcements ─────────

export function NewsCard({ items, acked, onAck }: { items: Announcement[]; acked: Set<string>; onAck: (a: Announcement) => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle title="Announcements" to="/news" linkLabel="All news" />
      {items.length === 0 ? (
        <p className="text-[15px] text-muted py-2">No announcements yet. Company news shows up here.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((a) => {
            const need = a.require_ack && !acked.has(a.id);
            return (
              <li key={a.id} className="flex flex-col gap-1.5 border-t border-line-2 pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-[15px] leading-snug min-w-0">{a.title}</p>
                  {need ? <Chip tone="warn">Please read</Chip> : a.require_ack ? <Chip tone="good" icon="check">Read</Chip> : null}
                </div>
                {a.body && <p className="text-sm text-ink-2 leading-relaxed line-clamp-3 whitespace-pre-line">{a.body}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted">{ago(a.created_at)}</span>
                  {need && <Button size="sm" icon="check" onClick={() => onAck(a)}>Mark as read</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ───────── review + admin ─────────

export function ReviewCard({ count }: { count: number }) {
  return (
    <Link to="/team" className={cx('flex items-center gap-4 rounded-2xl border p-4 no-underline text-ink hover:border-brand-2',
      count > 0 ? 'bg-warn-soft border-warn-soft' : 'bg-card border-line')}>
      <span className={cx('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0', count > 0 ? 'bg-white text-warn' : 'bg-brand-soft text-brand-ink')}>
        <Icon name="users" size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[26px] leading-none font-bold">{count}</span>
        <span className="block text-sm font-semibold mt-1">{count > 0 ? 'Waiting for your review' : 'Nothing waiting for your review'}</span>
      </span>
      <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" />
    </Link>
  );
}

export interface AdminCounts { requests: number; invited: number; draftDocs: number; draftModules: number }

export function AdminCard({ counts, loading, previewWelcome }: { counts: AdminCounts | null; loading: boolean; previewWelcome: boolean }) {
  const tiles: { label: string; value: number | undefined; to: string; warn?: boolean }[] = [
    { label: 'Access requests', value: counts?.requests, to: '/admin/people', warn: (counts?.requests || 0) > 0 },
    { label: 'Invited, not joined', value: counts?.invited, to: '/admin/people' },
    { label: 'Draft documents', value: counts?.draftDocs, to: '/admin/documents' },
    { label: 'Draft modules', value: counts?.draftModules, to: '/admin/training' },
  ];
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold leading-snug">Admin</h2>
          <p className="text-sm text-muted mt-0.5">What needs your attention</p>
        </div>
        <LinkButton to="/admin" size="sm" icon="shield">Open admin</LinkButton>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className={cx('rounded-xl px-3.5 py-3 no-underline text-ink border hover:border-brand-2',
            t.warn ? 'bg-warn-soft border-warn-soft' : 'bg-bg border-line')}>
            {loading && t.value === undefined
              ? <span className="skeleton block h-7 w-10" aria-hidden="true" />
              : <span className={cx('block font-display text-[24px] leading-tight font-bold', t.warn && 'text-warn')}>{t.value ?? '—'}</span>}
            <span className="block text-[13px] font-semibold text-ink-2 mt-0.5">{t.label}</span>
          </Link>
        ))}
      </div>
      {previewWelcome && (
        <Link to="/welcome" className="inline-flex items-center gap-2 min-h-11 text-sm font-semibold text-brand-ink no-underline self-start">
          <Icon name="eye" size={18} />Preview the welcome flow
        </Link>
      )}
    </Card>
  );
}

export function HomeSection({ title, sub, to, linkLabel, children }: { title: string; sub?: string; to?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle title={title} sub={sub} to={to} linkLabel={linkLabel} />
      {children}
    </Card>
  );
}

export function ModuleRows({ items }: { items: PlanItem[] }) {
  return (
    <ul className="-mx-5 -mb-5 border-t border-line-2">
      {items.map((i) => (
        <li key={i.module.id} className="border-t border-line-2 first:border-t-0">
          <Link to={`/training/${i.module.id}`} className="flex items-center gap-3 min-h-16 px-5 py-3 no-underline text-ink hover:bg-bg">
            <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', i.status === 'completed' ? 'bg-good-soft text-good' : 'bg-brand-soft text-brand-ink')}>
              <Icon name={i.status === 'completed' ? 'check' : 'book'} size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug">{i.module.title}</span>
              <span className="block text-[13px] text-muted">{i.module.minutes} min{i.status !== 'not_started' ? ` · ${i.pct}%` : ''}</span>
            </span>
            <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
