// Client portal overview: one card per assistant, hours waiting for approval, and requests to our team.
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { q, useAsync, useTitle } from '../lib/hooks';
import { useMe } from '../lib/session';
import { REQUEST_KIND, fmtDate, firstName, plural } from '../lib/util';
import type { ClientPortal } from '../lib/types';
import { Button, Card, CardHeader, Chip, EmptyState, ErrorBox, Icon, LinkButton, PageHeader, Skeleton } from '../ui';
import { useStepToggle } from '../pages/parts/work-common';
import { AssistantCard } from './parts/portal-assistant';
import { FeedbackSheet, REQUEST_STATUS, RequestSheet, greeting, type PortalPlacement } from './parts/portal-common';

export default function ClientHome() {
  useTitle('Overview');
  const { me, roles } = useMe();
  const { data, error, reload, setData } = useAsync(() => q<ClientPortal>(supabase.rpc('ramp_client_portal')), [me.id]);
  const [feedback, setFeedback] = useState<PortalPlacement | null>(null);
  const [help, setHelp] = useState<{ placementId: string | null } | null>(null);
  const { toggle, busy } = useStepToggle((id, doneAt) => setData((d) => ({
    ...d!, placements: d!.placements.map((p) => ({ ...p, steps: p.steps.map((s) => (s.id === id ? { ...s, done_at: doneAt } : s)) })),
  })));

  const company = data?.client?.name || roles.client?.name || '';
  const header = (
    <PageHeader eyebrow={company || undefined} title={`${greeting()}, ${firstName(me)}`}
      subtitle={data && data.placements.some((p) => p.status !== 'ended')
        ? `Here’s how your ${data.placements.filter((p) => p.status !== 'ended').length === 1 ? 'team member is' : 'team members are'} doing this week.`
        : 'Everything about your team members, in one place.'}
      actions={data && <Button icon="lifebuoy" onClick={() => setHelp({ placementId: null })}>Ask for help</Button>} />
  );

  if (error && !data) return <div className="flex flex-col gap-6">{header}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="flex flex-col gap-6">{header}<Skeleton rows={1} /><Skeleton rows={4} /></div>;

  const current = data.placements.filter((p) => p.status !== 'ended');
  const past = data.placements.filter((p) => p.status === 'ended');
  const waiting = data.timesheets.filter((t) => t.status === 'submitted');
  const waitingHours = waiting.reduce((a, t) => a + Number(t.total || 0), 0);
  const byPlacement = new Map(data.placements.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-6">
      {header}

      {waiting.length > 0 && (
        <section aria-label="Hours waiting for approval" className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-warn-soft px-4 py-4 rise">
          <span className="w-11 h-11 rounded-xl bg-white text-warn flex items-center justify-center shrink-0"><Icon name="clock" size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-ink">{plural(waiting.length, 'week')} of hours {waiting.length === 1 ? 'is' : 'are'} waiting for your approval</p>
            <p className="text-sm text-warn tabular-nums">{waitingHours.toLocaleString('en-US', { maximumFractionDigits: 2 })} h in total. Approve them so they can be billed and your team member can be paid.</p>
          </div>
          <LinkButton to="/client/hours" variant="primary" iconRight="chevronRight" className="w-full sm:w-auto">Review hours</LinkButton>
        </section>
      )}

      {current.length === 0 ? (
        <Card>
          <EmptyState icon="users" title="Your team member is on the way"
            body="We’re matching and training your team member now. As soon as they’re placed with you, their onboarding, training and hours show up here."
            action={<Button variant="primary" icon="send" onClick={() => setHelp({ placementId: null })}>Send us a message</Button>} />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {current.map((p) => (
            <AssistantCard key={p.id} p={p} busy={busy} onToggle={toggle}
              onFeedback={() => setFeedback(p)} onHelp={() => setHelp({ placementId: p.id })} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <p className="text-[13px] text-muted">
          Past team members: {past.map((p) => `${p.va.name}${p.end_date ? ` (until ${fmtDate(p.end_date)})` : ''}`).join(', ')}.
        </p>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="p-5 pb-3">
          <CardHeader title="Your requests" subtitle="Questions, changes and help you’ve asked us for, with our replies."
            action={<Button size="sm" icon="plus" onClick={() => setHelp({ placementId: null })}>New request</Button>} />
        </div>
        {data.requests.length === 0 ? (
          <p className="px-5 pb-5 text-[15px] text-muted">No requests yet. Ask us for coaching help, a change in hours or another team member any time.</p>
        ) : (
          <ul className="border-t border-line-2">
            {data.requests.map((r) => {
              const s = REQUEST_STATUS[r.status];
              const pl = r.placement_id ? byPlacement.get(r.placement_id) : null;
              return (
                <li key={r.id} className="px-5 py-4 border-t border-line-2 first:border-t-0 flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">{REQUEST_KIND[r.kind]}{pl ? ` · ${pl.va.name}` : ''}</p>
                      <p className="text-[13px] text-muted">Sent {fmtDate(r.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <Chip tone={s.tone} icon={r.status === 'done' ? 'check' : undefined}>{s.label}</Chip>
                  </div>
                  <p className="text-[15px] text-ink-2 leading-relaxed whitespace-pre-line break-words">{r.body}</p>
                  {r.response ? (
                    <div className="rounded-xl bg-brand-soft px-3.5 py-3">
                      <p className="text-[13px] font-semibold text-brand-ink">Our reply</p>
                      <p className="text-[15px] text-ink leading-relaxed whitespace-pre-line break-words mt-0.5">{r.response}</p>
                    </div>
                  ) : r.status !== 'done' && <p className="text-[13px] text-muted">We’ve got it and will reply here.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <FeedbackSheet placement={feedback} onClose={() => setFeedback(null)} onDone={reload} />
      <RequestSheet open={!!help} placements={current} placementId={help?.placementId || null} onClose={() => setHelp(null)} onDone={reload} />
    </div>
  );
}
