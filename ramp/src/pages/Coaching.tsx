// Coaching: the placements this person coaches (as the placement's coach or the assistant's mentor). No rates.
import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { daysUntil, plural } from '../lib/util';
import type { CoachPlacementSummary } from '../lib/types';
import { Card, EmptyState, ErrorBox, PageHeader, SearchInput, Segmented, Skeleton, Stat } from '../ui';
import { CoachCard } from './parts/work-coach';

const due = (p: CoachPlacementSummary) => (p.next_checkin ? daysUntil(p.next_checkin.due_date) : null);

export default function Coaching() {
  useTitle('Coaching');
  const { data, error, reload } = useAsync(async () => (await q<CoachPlacementSummary[] | null>(supabase.rpc('ramp_coach_placements'))) || [], []);
  const [filter, setFilter] = useState<'due' | 'all' | null>(null);
  const [search, setSearch] = useState('');

  const list = useMemo(() => data || [], [data]);
  const dueSoon = useMemo(() => list.filter((p) => { const d = due(p); return d !== null && d <= 7; })
    .sort((a, b) => (a.next_checkin!.due_date).localeCompare(b.next_checkin!.due_date)), [list]);
  const overdue = dueSoon.filter((p) => (due(p) ?? 0) < 0).length;
  const onboarding = list.filter((p) => p.status === 'onboarding').length;
  const f = filter ?? (dueSoon.length ? 'due' : 'all');
  const needle = search.trim().toLowerCase();
  const shown = (f === 'due' ? dueSoon : list)
    .filter((p) => !needle || `${p.va.name} ${p.client.name} ${p.title}`.toLowerCase().includes(needle));

  const header = <PageHeader title="Coaching" subtitle="The assistants you coach: check-ins, onboarding checklists and training." />;
  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={1} /><Skeleton rows={4} /></div>;

  if (!list.length) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <EmptyState icon="target" title="No one to coach yet"
            body="When an admin makes you the coach of a placement, or someone you mentor is placed with a client, they show up here." />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Overdue" value={overdue} tone={overdue ? 'warn' : undefined} hint="check-ins" />
        <Stat label="Due this week" value={dueSoon.length - overdue} hint="check-ins" />
        <Stat label="Onboarding" value={onboarding} hint={`of ${plural(list.length, 'placement')}`} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Segmented label="Show" value={f} onChange={setFilter}
          options={[{ value: 'due', label: `Due soon (${dueSoon.length})` }, { value: 'all', label: `All (${list.length})` }]} />
        {list.length > 6 && <div className="sm:ml-auto sm:w-72"><SearchInput value={search} onChange={setSearch} placeholder="Search assistants or clients" /></div>}
      </div>
      {shown.length === 0 ? (
        <Card>
          <EmptyState icon="check" title={needle ? 'No matches' : 'Nothing due this week'}
            body={needle ? 'Try another name.' : 'No check-ins are due in the next seven days. See everyone under All.'} />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((p) => <li key={p.id}><CoachCard p={p} /></li>)}
        </ul>
      )}
    </div>
  );
}
