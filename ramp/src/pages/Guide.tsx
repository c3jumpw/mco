import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMe } from '../lib/session';
import { useIsMobile, useTitle } from '../lib/hooks';
import GuideView, { type GuideViewMode } from '../guide/GuideView';
import { openWhatsNew, startTour, useAvailableTours } from '../guide/Tour';
import { CURRENT_VERSION } from '../changelog/changelog';
import type { GuideData } from '../guide/types';
import { Icon } from '../ui';
import data from '../guide/guide.json';

export default function Guide() {
  useTitle('Guide');
  const { rank, isClient, agencyOn, isSuper, roles } = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mobile = useIsMobile();
  const view = params.get('view') as GuideViewMode | null;
  const tours = useAvailableTours();
  const actions = [
    ...tours.map((t) => (
      <button key={t.role} type="button" onClick={() => startTour(t.role)}
        className={t.mine
          ? 'inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-white text-ink text-sm font-semibold cursor-pointer hover:bg-white/90'
          : 'inline-flex items-center gap-2 min-h-11 px-3.5 rounded-xl bg-white/10 text-white text-sm font-semibold cursor-pointer hover:bg-white/15'}>
        <Icon name={t.mine ? 'play' : 'replay'} size={16} />{t.mine ? 'Take the getting-started tour' : TOUR_LABEL[t.role]}
      </button>
    )),
    <button key="whats-new" type="button" onClick={() => openWhatsNew()}
      className="inline-flex items-center gap-2 min-h-11 px-3.5 rounded-xl bg-white/10 text-white text-sm font-semibold cursor-pointer hover:bg-white/15">
      <Icon name="sparkle" size={16} />What’s new in RAMP {CURRENT_VERSION}
    </button>,
  ];
  return (
    <GuideView data={data as GuideData} rank={rank} initialView={view || undefined} isClient={isClient || !!roles.client?.linked}
      agencyOn={agencyOn} isSuper={isSuper} actions={actions}
      openRoute={(r) => navigate(r)} stickyTop={mobile ? 56 : 0} />
  );
}

const TOUR_LABEL: Record<string, string> = {
  member: 'Team member tour', guest: 'Guest tour', coach: 'Mentor and lead tour', admin: 'Admin tour', client: 'Client tour', platform: 'Platform tour',
};
