// "Placements" card on an admin person profile: where this person is (or was) placed, linking to each placement.
// Renders nothing when agency features are off or the person has no placements.

import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { q, useAsync } from '../../../lib/hooks';
import { useMe } from '../../../lib/session';
import type { Client, Placement, Tier } from '../../../lib/types';
import { Card, Icon } from '../../../ui';
import { PlacementStatusChip, TierChip, longDate } from './core-common';

type Row = { p: Pick<Placement, 'id' | 'client_id' | 'title' | 'status' | 'start_date' | 'end_date' | 'tier_id'>; client: string; tier: Tier | null };

export function PersonPlacementsCard({ memberId }: { memberId: string }) {
  const { agencyOn } = useMe();
  const res = useAsync<Row[]>(async () => {
    if (!agencyOn) return [];
    const ps = await q<Row['p'][]>(supabase.from('ramp_placements').select('id, client_id, title, status, start_date, end_date, tier_id')
      .eq('member_id', memberId).order('start_date', { ascending: false }));
    if (!ps.length) return [];
    const [clients, tiers] = await Promise.all([
      q<Pick<Client, 'id' | 'name'>[]>(supabase.from('ramp_clients').select('id, name').in('id', [...new Set(ps.map((p) => p.client_id))])),
      q<Tier[]>(supabase.from('ramp_tiers').select('*')),
    ]);
    return ps
      .map((p) => ({ p, client: clients.find((c) => c.id === p.client_id)?.name || 'Client', tier: tiers.find((t) => t.id === p.tier_id) || null }))
      .sort((a, b) => (a.p.status === 'ended' ? 1 : 0) - (b.p.status === 'ended' ? 1 : 0));
  }, [memberId, agencyOn]);

  if (!res.data?.length) return null;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5 pb-2">
        <h3 className="font-display text-lg font-semibold leading-snug">Placements</h3>
        <p className="text-sm text-muted mt-1">Where they work through the agency.</p>
      </div>
      <ul>
        {res.data.map(({ p, client, tier }) => (
          <li key={p.id} className="border-t border-line-2">
            <Link to={`/admin/placements/${p.id}`} className="flex items-center gap-3 px-5 py-3 min-h-14 no-underline text-ink hover:bg-[#FAFBFC]">
              <span className="min-w-0 flex-1 flex flex-col gap-1">
                <span className="font-semibold text-[15px] break-words">{client}</span>
                <span className="text-[13px] text-muted break-words">
                  {p.title}{p.start_date ? ` · ${p.status === 'ended' && p.end_date ? `${longDate(p.start_date)} to ${longDate(p.end_date)}` : `since ${longDate(p.start_date)}`}` : ''}
                </span>
                <span className="flex flex-wrap gap-1.5"><PlacementStatusChip status={p.status} /><TierChip tier={tier} /></span>
              </span>
              <Icon name="chevronRight" size={18} strokeWidth={2} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
