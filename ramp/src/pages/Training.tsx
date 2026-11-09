import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../lib/session';
import { useAsync, useTitle } from '../lib/hooks';
import { loadTrainingFor, planSummary, type PlanItem } from '../lib/plan';
import { TRACKS, cx, displayName, plural } from '../lib/util';
import { Button, Card, EmptyState, ErrorBox, Icon, LinkButton, PageHeader, Pills, Progress, Skeleton } from '../ui';
import { CertificateSheet, DueText, KIND_LABEL, ProgressSummary, StatusChip, ctaFor } from './parts/journey-common';

type Filter = 'all' | 'todo' | 'doing' | 'done';

function matches(item: PlanItem, f: Filter) {
  if (f === 'all') return true;
  if (f === 'todo') return item.status === 'not_started';
  if (f === 'doing') return item.status === 'in_progress' || item.status === 'returned' || item.status === 'submitted';
  return item.status === 'completed';
}

export default function Training() {
  useTitle('Training');
  const { me, org, isAdmin, isGuest } = useMe();
  const { data, error, loading, reload } = useAsync(() => loadTrainingFor(me), [me.id]);
  const [filter, setFilter] = useState<Filter>('all');
  const [cert, setCert] = useState<PlanItem | null>(null);
  const certificates = !!org.flags?.certificates && !isGuest;

  const plan = data?.plan || [];
  const summary = useMemo(() => planSummary(plan), [plan]);
  const sections = useMemo(() => {
    if (isGuest) return [{ key: 'shared', title: 'Shared with you', sub: 'Modules your admin has opened to guests.', items: plan }];
    return [
      { key: 'assigned', title: 'Assigned to you', sub: 'Required for everyone, plus the track for your role.', items: plan.filter((i) => i.kind === 'required' || i.kind === 'role') },
      { key: 'continued', title: TRACKS.continued.label, sub: 'Ongoing learning that keeps your skills current.', items: plan.filter((i) => i.kind === 'continued') },
      { key: 'library', title: 'Library', sub: 'Optional modules you can take any time.', items: plan.filter((i) => i.kind === 'optional') },
    ];
  }, [plan, isGuest]);

  const count = (f: Filter) => plan.filter((i) => matches(i, f)).length;
  const visible = sections.map((s) => ({ ...s, items: s.items.filter((i) => matches(i, filter)) })).filter((s) => s.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Training"
        subtitle={isGuest ? 'Modules shared with you. Open one to start.' : 'Work through your assigned modules first. The library is there whenever you want more.'}
        actions={isAdmin ? <LinkButton to="/admin/training" icon="pen" size="sm">Manage modules</LinkButton> : undefined} />

      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && (
        <>
          <div className="skeleton h-28" aria-hidden="true" />
          <Skeleton rows={4} />
        </>
      )}

      {data && plan.length === 0 && (
        <Card>
          <EmptyState icon="book" title="No training yet"
            body={isAdmin ? 'Publish a module and assign it to everyone or to a role, and it shows up here.' : 'Your admin hasn’t assigned any training yet. You’ll see it here as soon as they do.'}
            action={isAdmin ? <LinkButton to="/admin/training" variant="primary" icon="plus">Build a module</LinkButton> : undefined} />
        </Card>
      )}

      {data && plan.length > 0 && (
        <>
          {!isGuest && summary.total > 0 && (
            <ProgressSummary summary={summary} title="Assigned training"
              action={summary.next ? <LinkButton to={`/training/${summary.next.module.id}`} variant="primary" size="sm" iconRight="chevronRight">{ctaFor(summary.next)} next</LinkButton> : undefined} />
          )}

          {plan.length > 3 && <div className="-mx-4 px-4 overflow-x-auto scrollbar-none">
            <div className="w-max">
              <Pills label="Show" value={filter} onChange={setFilter} size="sm" options={[
                { value: 'all', label: `All (${plan.length})` },
                { value: 'todo', label: `To do (${count('todo')})` },
                { value: 'doing', label: `In progress (${count('doing')})` },
                { value: 'done', label: `Completed (${count('done')})` },
              ]} />
            </div>
          </div>}

          {visible.length === 0 && (
            <Card>
              <EmptyState icon="check" title={filter === 'done' ? 'Nothing completed yet' : filter === 'doing' ? 'Nothing in progress' : 'Nothing left to start'}
                body={filter === 'done' ? 'Finished modules show up here.' : 'Try another filter to see the rest of your training.'}
                action={<Button size="sm" onClick={() => setFilter('all')}>Show all</Button>} />
            </Card>
          )}

          {visible.map((s) => (
            <section key={s.key} className="flex flex-col gap-3" aria-labelledby={`sec-${s.key}`}>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={`sec-${s.key}`} className="font-display text-lg font-semibold leading-snug">{s.title}</h2>
                  <p className="text-sm text-muted mt-0.5">{s.sub}</p>
                </div>
                <span className="text-[13px] font-semibold text-muted shrink-0">{plural(s.items.length, 'module')}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {s.items.map((item) => (
                  <ModuleCard key={item.module.id} item={item} guest={isGuest} onCertificate={certificates && item.status === 'completed' ? () => setCert(item) : undefined} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <CertificateSheet open={!!cert} onClose={() => setCert(null)} person={me.full_name.trim() || displayName(me)}
        module={cert?.module.title || ''} date={cert?.progress?.completed_at || null} org={org.name} />
    </div>
  );
}

function ModuleCard({ item, guest, onCertificate }: { item: PlanItem; guest: boolean; onCertificate?: () => void }) {
  const m = item.module;
  const goals = (m.objectives || []).filter(Boolean).length;
  const done = item.status === 'completed';
  return (
    <article className={cx('relative bg-card border rounded-2xl p-4 flex flex-col gap-3 transition-colors hover:border-brand-2',
      item.status === 'returned' ? 'border-bad-soft' : 'border-line')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold tracking-[0.06em] uppercase text-muted pt-1">{guest ? 'Shared with you' : KIND_LABEL[item.kind]}{m.builtin === 'practice' && ' · Interactive'}</span>
        <StatusChip status={item.status} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-[17px] font-semibold leading-snug">
          {/* The whole card is clickable through this link; the certificate button sits above it. */}
          <Link to={`/training/${m.id}`} className="text-ink no-underline after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {m.title}
          </Link>
        </h3>
        {m.summary && <p className="text-sm text-muted leading-relaxed line-clamp-2">{m.summary}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1"><Icon name="clock" size={14} />{m.minutes} min</span>
        {goals > 0 && <span className="inline-flex items-center gap-1"><Icon name="target" size={14} />{plural(goals, 'objective')}</span>}
        <DueText item={item} />
      </div>
      <div className="flex items-center gap-3 mt-auto">
        <Progress value={item.pct} tone={done ? 'good' : 'brand'} className="flex-1" label={`${m.title} progress`} />
        <span className="text-xs font-semibold text-muted w-9 text-right">{item.pct}%</span>
      </div>
      {onCertificate && (
        <div className="relative z-10 -mb-1">
          <Button size="sm" variant="ghost" icon="star" onClick={onCertificate} className="-ml-2">Certificate</Button>
        </div>
      )}
    </article>
  );
}
